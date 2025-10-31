import crypto from 'crypto';
import { calcDeviceRatio } from "../utils/calcDeviceRatio.js";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const keyword = req.query.keyword || req.body?.keyword;
  
  if (!keyword) {
    return res.status(400).json({ error: 'keyword is required' });
  }

  // ✅ 네이버 광고 API 인증 키
  const API_KEY = '0100000000b4a432729b7e7e42b6b9f87f73bac533ae2b1f4e7ee5eccbe9de62ffbedffcb5';
  const SECRET_KEY = 'AQAAAAC0pDJym35+Qra5+H9zusUzvalNeyb5aw8coXWCCPPFpg==';
  const CUSTOMER_ID = '2865372';
  
  const timestamp = Date.now().toString();
  const method = 'GET';
  const uri = '/keywordstool';
  
  const message = `${timestamp}.${method}.${uri}`;
  const signature = crypto.createHmac('sha256', SECRET_KEY)
    .update(message)
    .digest('base64');

  // ✅ 광고 API 호출
  const response = await fetch(
    `https://api.searchad.naver.com/keywordstool?hintKeywords=${encodeURIComponent(keyword)}&showDetail=1`,
    {
      headers: {
        'X-API-KEY': API_KEY,
        'X-CUSTOMER': CUSTOMER_ID,
        'X-TIMESTAMP': timestamp,
        'X-SIGNATURE': signature
      }
    }
  );

  const data = await response.json();

  // ✅ PC/모바일 검색량 비율 계산
  const firstKeyword = data.keywordList?.[0] || {};
  const deviceRatio = calcDeviceRatio(
    firstKeyword.monthlyPcQcCnt,
    firstKeyword.monthlyMobileQcCnt
  );

  // ✅ 응답 데이터 구성
  return res.status(200).json({
    ...data,
    deviceRatio, // 👉 PC/모바일 비율 추가
  });
}
