export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    // Body 파싱 에러 처리
    let body;
    try {
      body = req.body;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid request body', message: e.message });
    }

    let keywords = body?.keywords;
    
    // keywords가 없으면 전체 body를 확인
    if (!keywords && typeof body === 'string') {
      // 문자열로 왔을 경우
      keywords = body;
    }
    
    if (!keywords) {
      return res.status(400).json({ 
        error: 'keywords is required',
        receivedBody: JSON.stringify(body)
      });
    }
    
    // 문자열이면 배열로 변환
    if (typeof keywords === 'string') {
      keywords = keywords.split('\n').filter(k => k && k.trim()).map(k => k.trim());
    }
    
    // 배열이 아니면 배열로 만들기
    if (!Array.isArray(keywords)) {
      keywords = [String(keywords)];
    }
    
    // 빈 값 제거
    keywords = keywords.filter(k => k && String(k).trim()).map(k => String(k).trim());
    
    if (keywords.length === 0) {
      return res.status(400).json({ error: 'keywords array is empty after processing' });
    }
    
    if (keywords.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 keywords allowed' });
    }

    const results = [];
    
    for (let i = 0; i < keywords.length; i++) {
      const keyword = keywords[i];
      
      try {
        const apiUrl = `https://naver-api-proxy-v2.vercel.app/api?keyword=${encodeURIComponent(keyword)}`;
        const response = await fetch(apiUrl);

        if (!response.ok) {
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
        const match = data.keywordList?.[0];

        if (match) {
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
        }

        if (i < keywords.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }

      } catch (error) {
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

    return res.status(200).json({
      results,
      total: results.length,
      success: results.filter(r => !r.error).length,
      failed: results.filter(r => r.error).length,
    });

  } catch (error) {
    console.error('Large search error:', error);
    return res.status(500).json({ 
      error: 'Server error',
      message: error.message,
      stack: error.stack
    });
  }
}
