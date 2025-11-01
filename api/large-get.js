export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }

  try {
    // URL 쿼리에서 keywords 가져오기
    const keywordsParam = req.query.keywords;
    
    if (!keywordsParam) {
      return res.status(400).json({ error: 'keywords parameter required' });
    }
    
    // 쉼표 또는 줄바꿈으로 분리
    let keywords = keywordsParam.split(/[,\n]+/).filter(k => k && k.trim()).map(k => k.trim());
    
    if (keywords.length === 0) {
      return res.status(400).json({ error: 'keywords array is empty' });
    }
    
    if (keywords.length > 100) {
      keywords = keywords.slice(0, 100);
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
          error: error.message,
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
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Server error',
      message: error.message
    });
  }
}
