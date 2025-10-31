// /api/datalab.js
// 연령 6그룹(0-18, 19-29, 30-39, 40-49, 50-59, 60+) + 성별 2회
// 총 1(트렌드 선택) + 2(성별) + 6(연령) = 최대 8회
// 요청 시 만료확인 캐시(24h) + 중복가드(8초) + 동시 2개 제한

const cache = new Map();
const TTL = 24 * 60 * 60 * 1000;   // 24h
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

// 연령 6그룹(데이터랩 코드 기준)
const AGE_GROUPS = [
  { label: '0-18세', codes: ['1','2'] },
  { label: '19-29세', codes: ['3','4'] },
  { label: '30-39세', codes: ['5','6'] },
  { label: '40-49세', codes: ['7','8'] },
  { label: '50-59세', codes: ['9','10'] },
  { label: '60세+', codes: ['11'] },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = req.body || {};
  const keyword = (body.keyword || req.query.keyword || '').trim();
  const timeUnit = body.timeUnit || 'month'; // month 권장(쿼터 효율)
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

  const key = JSON.stringify({ k: keyword.toLowerCase(), timeUnit, v: 'g6' });
  const dupKey = key; // 중복가드 키

  // 8초 내 동일요청 가드
  if (recent.has(dupKey) && Date.now() - recent.get(dupKey) < 8000) {
    return res.status(429).json({ error: 'duplicate_guard' });
  }
  const cached = getCache(key);
  if (cached) return res.status(200).json(cached);
  if (inflight.has(key)) {
    try { return res.status(200).json(await inflight.get(key)); }
    catch { return res.status(500).json({ error: 'retry' }); }
  }

  const CLIENT_ID = process.env.NAVER_CLIENT_ID;
  const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

  const task = (async () => {
    // 선택: 전체 트렌드가 필요하면 true (차트 안 쓰면 false로)
    const NEED_TREND = false;

    let trend = null;
    if (NEED_TREND) {
      trend = await dlFetch(baseBody, CLIENT_ID, CLIENT_SECRET);
    }

    // 성별 2회
    const fRes = await runLimited(() => dlFetch({ ...baseBody, gender: 'f' }, CLIENT_ID, CLIENT_SECRET));
    const mRes = await runLimited(() => dlFetch({ ...baseBody, gender: 'm' }, CLIENT_ID, CLIENT_SECRET));

    // 연령 6그룹 6회 (각 그룹은 codes 배열로 합산 결과를 반환)
    const ageResults = [];
    for (const grp of AGE_GROUPS) {
      const r = await runLimited(() => dlFetch({ ...baseBody, ages: grp.codes }, CLIENT_ID, CLIENT_SECRET));
      ageResults.push({ label: grp.label, data: r });
    }

    // 최근 30포인트 합 기준 비율 계산
    const genderRatio = calcGenderRatio(fRes, mRes);
    const ageRatios = calcAgeRatios(ageResults);

    const out = { genderRatio, ageRatios };
    if (NEED_TREND) out.trend = trend;

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

// ---- helpers ----
async function dlFetch(body, id, secret) {
  const r = await fetch('https://openapi.naver.com/v1/datalab/search', {
    method: 'POST',
    headers: {
      'X-Naver-Client-Id': id,
      'X-Naver-Client-Secret': secret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`DataLab ${r.status}`);
  return r.json();
}
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
