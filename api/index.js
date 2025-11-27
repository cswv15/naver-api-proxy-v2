import crypto from 'crypto';
import { calcDeviceRatio } from "../utils/calcDeviceRatio.js";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let keyword = req.query.keyword || req.body?.keyword;
  
  if (!keyword) {
    return res.status(400).json({ error: 'keyword is required' });
  }

  // 키워드 앞뒤 공백 제거 (중간 공백은 유지)
  keyword = keyword.trim();

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

  try {
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Naver API Error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: 'Naver API Error', 
        status: response.status,
        message: errorText 
      });
    }

    const data = await response.json();

    // ✅ 정확히 일치하는 키워드 찾기 (공백 포함 키워드 처리)
    // 네이버 API는 연관 키워드 목록을 반환하므로, 입력한 키워드와 정확히 일치하는 것을 찾아야 함
    const keywordList = data.keywordList || [];
    
    // 정규화 함수: 공백 정리 및 소문자 변환
    const normalizeKeyword = (kw) => {
      if (!kw) return '';
      return kw.trim().toLowerCase().replace(/\s+/g, ' ');
    };

    const normalizedInput = normalizeKeyword(keyword);
    
    // 정확히 일치하는 키워드 찾기
    let matchedKeyword = keywordList.find(item => 
      normalizeKeyword(item.relKeyword) === normalizedInput
    );

    // 정확히 일치하는 게 없으면 첫 번째 결과 사용 (기존 동작)
    if (!matchedKeyword && keywordList.length > 0) {
      matchedKeyword = keywordList[0];
    }

    // ✅ PC/모바일 검색량 비율 계산
    const deviceRatio = calcDeviceRatio(
      matchedKeyword?.monthlyPcQcCnt,
      matchedKeyword?.monthlyMobileQcCnt
    );

    // ✅ 응답 데이터 구성
    return res.status(200).json({
      ...data,
      // 정확히 일치하는 키워드를 첫 번째로 배치
      keywordList: matchedKeyword 
        ? [matchedKeyword, ...keywordList.filter(item => item !== matchedKeyword)]
        : keywordList,
      deviceRatio,
      // 디버깅용: 입력 키워드와 매칭된 키워드
      _debug: {
        inputKeyword: keyword,
        matchedKeyword: matchedKeyword?.relKeyword || null,
        totalResults: keywordList.length
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error.message 
    });
  }
}
