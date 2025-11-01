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

  let keywords = req.body?.keywords;
  
  if (!Array.isArray(keywords)) {
    return res.status(400).json({ error: 'keywords must be an array' });
  }

  keywords = keywords.filter(k => k && k.trim()).map(k => k.trim());

  if (keywords.length === 0) {
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
        // 기존 프록시 API 사용
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

        // 첫 번째 결과 사용 (가장 관련성 높음)
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

        // Rate limit 방지
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
