export default async function handler(req, res) {
  // CORS 및 OPTIONS 처리
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  // Body에서 keywords 추출
  let keywords = req.body?.keywords;
  
  if (!Array.isArray(keywords)) {
    return res.status(400).json({ error: 'keywords must be an array' });
  }

  // 빈 문자열 제거 및 trim
  keywords = keywords.filter(k => k && k.trim()).map(k => k.trim());

  if (keywords.length === 0) {
    return res.status(400).json({ error: 'keywords array is empty' });
  }
  
  if (keywords.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 keywords allowed' });
  }

  // 환경변수 확인
  const CLIENT_ID = process.env.NAVER_AD_ID;
  const CLIENT_SECRET = process.env.NAVER_AD_PW;
  const CUSTOMER_ID = process.env.NAVER_CUSTOMER_ID;

  if (!CLIENT_ID || !CLIENT_SECRET || !CUSTOMER_ID) {
    console.error('Missing environment variables');
    return res.status(500).json({ 
      error: 'Server configuration error',
      details: {
        hasClientId: !!CLIENT_ID,
        hasClientSecret: !!CLIENT_SECRET,
        hasCustomerId: !!CUSTOMER_ID
      }
    });
  }

  const results = [];
  
  try {
    // 키워드 처리 (순차적으로)
    for (let i = 0; i < keywords.length; i++) {
      const keyword = keywords[i];
      
      try {
        // 네이버 광고 API 호출
        const apiUrl = `https://api.naver.com/keywordstool?hintKeywords=${encodeURIComponent(keyword)}&showDetail=1`;
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'X-Naver-Client-Id': CLIENT_ID,
            'X-Naver-Client-Secret': CLIENT_SECRET,
            'X-Customer': CUSTOMER_ID,
          },
        });

        if (!response.ok) {
          // API 에러
          console.error(`API error for "${keyword}": ${response.status}`);
          results.push({
            keyword,
            error: `API Error ${response.status}`,
            relKeyword: keyword,
            monthlyPcQcCnt: 0,
            monthlyMobileQcCnt: 0,
            monthlyAvePcClkCnt: 0,
            monthlyAveMobileClkCnt: 0,
            monthlyAvePcCtr: 0,
            monthlyAveMobileCtr: 0,
            plAvgDepth: 0,
            compIdx: '-',
          });
          continue;
        }

        const data = await response.json();
        
        if (!data.keywordList || data.keywordList.length === 0) {
          // 데이터 없음
          results.push({
            keyword,
            error: 'No data found',
            relKeyword: keyword,
            monthlyPcQcCnt: 0,
            monthlyMobileQcCnt: 0,
            monthlyAvePcClkCnt: 0,
            monthlyAveMobileClkCnt: 0,
            monthlyAvePcCtr: 0,
            monthlyAveMobileCtr: 0,
            plAvgDepth: 0,
            compIdx: '-',
          });
          continue;
        }

        // 정확히 일치하는 키워드 찾기
        const match = data.keywordList.find(
          item => item.relKeyword && item.relKeyword.toLowerCase() === keyword.toLowerCase()
        );

        if (match) {
          // 데이터 있음
          results.push({
            keyword,
            relKeyword: match.relKeyword || keyword,
            monthlyPcQcCnt: match.monthlyPcQcCnt || 0,
            monthlyMobileQcCnt: match.monthlyMobileQcCnt || 0,
            monthlyAvePcClkCnt: match.monthlyAvePcClkCnt || 0,
            monthlyAveMobileClkCnt: match.monthlyAveMobileClkCnt || 0,
            monthlyAvePcCtr: match.monthlyAvePcCtr || 0,
            monthlyAveMobileCtr: match.monthlyAveMobileCtr || 0,
            plAvgDepth: match.plAvgDepth || 0,
            compIdx: match.compIdx || '-',
          });
        } else {
          // 일치하는 키워드 없음
          results.push({
            keyword,
            error: 'Exact match not found',
            relKeyword: keyword,
            monthlyPcQcCnt: 0,
            monthlyMobileQcCnt: 0,
            monthlyAvePcClkCnt: 0,
            monthlyAveMobileClkCnt: 0,
            monthlyAvePcCtr: 0,
            monthlyAveMobileCtr: 0,
            plAvgDepth: 0,
            compIdx: '-',
          });
        }

        // Rate limit 방지 (200ms 대기)
        if (i < keywords.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }

      } catch (error) {
        // 개별 키워드 처리 중 에러
        console.error(`Error processing "${keyword}":`, error.message);
        results.push({
          keyword,
          error: error.message || 'Processing error',
          relKeyword: keyword,
          monthlyPcQcCnt: 0,
          monthlyMobileQcCnt: 0,
          monthlyAvePcClkCnt: 0,
          monthlyAveMobileClkCnt: 0,
          monthlyAvePcCtr: 0,
          monthlyAveMobileCtr: 0,
          plAvgDepth: 0,
          compIdx: '-',
        });
      }
    }

    // 성공 응답
    return res.status(200).json({
      results,
      total: results.length,
      success: results.filter(r => !r.error).length,
      failed: results.filter(r => r.error).length,
    });

  } catch (error) {
    // 전체 처리 중 에러
    console.error('Large search error:', error);
    return res.status(500).json({ 
      error: 'Server error',
      message: error.message,
      results: results.length > 0 ? results : undefined
    });
  }
}
