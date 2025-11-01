// /api/datalab.js
// ✅ 기능 요약
// - 데이터랩 호출 최적화: 성별(f/m) 2회 + 연령 6그룹(0-18, 19-29, 30-39, 40-49, 50-59, 60+) 6회 = 총 8회
// - 호출 분산: 여러 Client ID/Secret 라운드로빈 + 429/401/403 시 다음 키로 페일오버
// - 캐시: 24시간 TTL, 요청 시 만료 확인 (외부 크론 불필요)
// - 중복 가드: 8초 내 동일 키워드 429
// - 동시성 제한: 최대 2개씩만 병렬

// ----------------- 캐시/가드/리미터 -----------------
const cache = new Map();
const TTL = 24 * 60 * 60 * 1000; // 24h
const inflight = new Map();
const recent = new Map();

function getCache(k) {
  const v = cache.get(k);
  if (!v) return null;
  if (Date.now() - v.ts > TTL) { cache.delete(k); return null; }
  return v.data;
}
function setCache(k, data) { cache.set(k, { ts: Date.now(), data }); }

function limiter(max = 2) {
  let running = 0, q = [];
  return async fn => {
    if (running >= max) await new Promise(r => q.push(r));
    running++;
    try { return await fn(); }
    finally { running--; if (q.length) q.shift()(); }
  };
}
const runLimited = limiter(2);

// ----------------- 키 로테이션 -----------------
// 환경변수 예시 (Vercel):
// NAVER_KEYS='[{"id":"CID_1","secret":"SEC_1"},{"id":"CID_2","secret":"SEC_2"}]'
// 또는 NAVER_KEYS 안쓰면 단일 키 사용: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET
let KEY_POOL = [];
try {
  if (process.env.NAVER_KEYS) {
    KEY_POOL = JSON.parse(process.env.NAVER_KEYS);
  } else if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) {
    KEY_POOL = [{ id: process.env.NAVER_CLIENT_ID, secret: process.env.NAVER_CLIENT_SECRET }];
  }
} catch (_) {
  // invalid JSON -> fallback to single env pair
  if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) {
    KEY_POOL = [{ id: process.env.NAVER_CLIENT_ID, secret: process.env.NAVER_CLIENT_SECRET }];
  }
}
if (!Array.isArray(KEY_POOL) || KEY_POOL.length === 0) {
  console.warn('[DataLab] No keys configured. Set NAVER_KEYS or NAVER_CLIENT_ID/SECRET.');
  KEY_POOL = [];
}

let rrIndex = Math.floor(Math.random() * Math.max(1, KEY_POOL.length)); // 랜덤 시작
const cooldown = new Map(); // keyIndex -> untilTs

function isCooling(i) {
  const until = cooldown.get(i);
  return until && until > Date.now();
}
function markCooldown(i, ms = 60_000) { // 기본 60초 쿨다운
  cooldown.set(i, Date.now() + ms);
}
function pickKey() {
  if (KEY_POOL.length === 0) throw new Error('No DataLab keys configured');
  // 라운드로빈으로 다음 사용 가능 키 선택
  for (let step = 0; step < KEY_POOL.length; step++) {
    const idx = (rrIndex + step) % KEY_POOL.length;
    if (!isCooling(idx)) {
      rrIndex = (idx + 1) % KEY_POOL.length;
      return { idx, key: KEY_POOL[idx] };
    }
  }
  // 모두 쿨다운이면 가장 먼저 끝나는 걸 사용(어차피 실패 가능성 ↑)
  const idx = (rrIndex++) % KEY_POOL.length;
  return { idx, key: KEY_POOL[idx] };
}

async function dlFetchWithRotation(body) {
  let lastErr;
  for (let attempt = 0; attempt < KEY_POOL.length; attempt++) {
    const { idx, key } = pickKey();
    try {
      const r = await fetch('https://openapi.naver.com/v1/datalab/search', {
        method: 'POST',
        headers: {
          'X-Naver-Client-Id': key.id,
          'X-Naver-Client-Secret': key.secret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (r.status === 429) { // rate limit
        markCooldown(idx); // 60초 냉각
        lastErr = new Error('429 Too Many Requests');
        continue; // 다음 키로
      }
      if (r.status === 401 || r.status === 403) { // 인증/권한
        markCooldown(idx, 5 * 60_000); // 5분 냉각
        lastErr = new Error(`${r.status} Auth/Permission`);
        continue; // 다음 키로
      }
      if (!r.ok) {
        // 기타 실패는 키 문제 아닐 수 있음 -> 바로 throw
        throw new Error(`DataLab ${r.status}`);
      }
      return r.json();
    } catch (e) {
      lastErr = e;
      // 네트워크 에러 등 -> 다음 키 시도
      markCooldown(idx, 30_000);
      continue;
    }
  }
  throw lastErr || new Error('All keys failed');
}

// ----------------- 연령 그룹 -----------------
const AGE_GROUPS = [
  { label: '0-18세', codes: ['1','2'] },
  { label: '19-29세', codes: ['3','4'] },
  { label: '30-39세', codes: ['5','6'] },
  { label: '40-49세', codes: ['7','8'] },
  { label: '50-59세', codes: ['9','10'] },
  { label: '60세+', codes: ['11'] },
];

// ----------------- 핸들러 -----------------
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = req.body || {};
  const keyword = (body.keyword || req.query.keyword || '').trim();
  const timeUnit = body.timeUnit || 'month'; // month 권장
  if (!keyword) return res.status(400).json({ error: 'keyword is required' });

  // 기간: 최근 1년
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  const baseBody = {
    startDate: start.toISOString().slice(0,10),
    endDate: end.toISOString().slice(0,10),
    timeUnit,
    keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
  };

  const key = JSON.stringify({ k: keyword.toLowerCase(), timeUnit, v: 'g6+rot' });
  const dupKey = key;

  // 중복 가드(8초)
  if (recent.has(dupKey) && Date.now() - recent.get(dupKey) < 8000) {
    return res.status(429).json({ error: 'duplicate_guard' });
  }
  const cached = getCache(key);
  if (cached) return res.status(200).json(cached);
  if (inflight.has(key)) {
    try { return res.status(200).json(await inflight.get(key)); }
    catch { return res.status(500).json({ error: 'retry' }); }
  }

  const task = (async () => {
    // 성별 2회
    const fRes = await runLimited(() => dlFetchWithRotation({ ...baseBody, gender: 'f' }));
    const mRes = await runLimited(() => dlFetchWithRotation({ ...baseBody, gender: 'm' }));

    // 연령 6그룹 6회
    const ageResults = [];
    for (const grp of AGE_GROUPS) {
      const r = await runLimited(() => dlFetchWithRotation({ ...baseBody, ages: grp.codes }));
      ageResults.push({ label: grp.label, data: r });
    }

    // 최근 30포인트 합 기준 비율 계산
    const genderRatio = calcGenderRatio(fRes, mRes);
    const ageRatios = calcAgeRatios(ageResults);

    const out = { genderRatio, ageRatios };
    setCache(key, out);
    recent.set(dupKey, Date.now());
    return out;
  })().finally(() => inflight.delete(key));

  inflight.set(key, task);
  try {
    const result = await task;
    return res.status(200).json(result);
  } catch (e) {
    console.error('DataLab error:', e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}

// ----------------- 헬퍼 -----------------
function sumLast30(res) {
  const arr = res?.results?.[0]?.data || [];
  const last = arr.slice(-30);
  return last.reduce((s, x) => s + (x.ratio || 0), 0);
}
function calcGenderRatio(fRes, mRes) {
  const f = sumLast30(fRes), m = sumLast30(mRes);
  const t = f + m || 1;
  return {
    female: Math.round((f / t) * 1000) / 10,
    male:   Math.round((m / t) * 1000) / 10,
  };
}
function calcAgeRatios(list) {
  const sums = list.map(g => ({ label: g.label, sum: sumLast30(g.data) }));
  const total = sums.reduce((s, v) => s + v.sum, 0) || 1;
  return sums.map(v => ({
    label: v.label,
    ratio: Math.round((v.sum / total) * 1000) / 10,
  }));
}
