export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }

  try {
    const keywordsParam = req.query.keywords;
    
    if (!keywordsParam) {
      return res.status(400).json({ error: 'keywords parameter required' });
    }
    
    let keywords = keywordsParam.split(/[,\n]+/).filter(k => k && k.trim()).map(k => k.trim());
    
    if (keywords.length === 0) {
      return res.status(400).json({ error: 'keywords array is empty' });
    }
    
    if (keywords.length > 100) {
      keywords = keywords.slice(0, 100);
    }

    // 네이버 광고 API 직접 호출
    const CLIENT_ID = process.env.NAVER_AD_ID;
    const CLIENT_SECRET = process.env.NAVER_AD_PW;
    const CUSTOMER_ID = process.env.NAVER_CUSTOMER_ID;

    if (!CLIENT_ID || !CLIENT_SECRET || !CUSTOMER_ID) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const fetchKeyword = async (keyword) => {
      try {
        // 네이버 API 직접 호출
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
          console.error(`API Error for ${keyword}: ${response.status}`);
          return {
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
          };
        }

        const data = await response.json();
        
        if (!data.keywordList || data.keywordList.length === 0) {
          return {
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
          };
        }

        // 정확히 일치하는 키워드 찾기
        const match = data.keywordList.find(
          item => item.relKeyword && item.relKeyword.toLowerCase() === keyword.toLowerCase()
        ) || data.keywordList[0]; // 없으면 첫 번째

        return {
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
        };

      } catch (error) {
        console.error(`Error processing ${keyword}:`, error);
        return {
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
        };
      }
    };

    // 20개씩 동시 처리
    const chunkSize = 20;
    const results = [];
    
    for (let i = 0; i < keywords.length; i += chunkSize) {
      const chunk = keywords.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(chunk.map(fetchKeyword));
      results.push(...chunkResults);
      
      // 청크 사이 대기
      if (i + chunkSize < keywords.length) {
        await new Promise(resolve => setTimeout(resolve, 150));
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
