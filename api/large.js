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

  // keywords 추출 및 배열 변환
  let keywords = req.body?.keywords;
  
  // 문자열로 왔을 경우 배열로 변환
  if (typeof keywords === 'string') {
    keywords = keywords.split('\n').filter(k => k.trim()).map(k => k.trim());
  }
  
  // 이미 배열이면 필터링
  if (Array.isArray(keywords)) {
    keywords = keywords.filter(k => k && k.trim()).map(k => k.trim());
  }
  
  if (!keywords || keywords.length === 0) {
    return res.status(400).json({ error: 'keywords array is empty' });
  }
  
  if (keywords.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 keywords allowed' });
  }

  const results = [];
  
  try {
    for (let i = 0; i < keywords.length; i++) {
      const keyword = keywords[i];
      
      try {
        const apiUrl = `https://naver-api-proxy-v2.vercel.app/api?keyword=${encodeURIComponent(keyword)}`;
        
        const response = await fetch(apiUrl, {
          method: 'GET',
        });

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
        
        if (!data.keywordList || data.keywordList.length === 0) {
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

        const match = data.keywordList[0];

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
    return res.status(500).json({ 
      error: 'Server error',
      message: error.message,
      results: results.length > 0 ? results : undefined
    });
  }
}
