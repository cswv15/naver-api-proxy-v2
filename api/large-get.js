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

    const results = [];
    
    // 10개씩 묶어서 한 번에 요청
    const chunkSize = 10;
    
    for (let i = 0; i < keywords.length; i += chunkSize) {
      const chunk = keywords.slice(i, i + chunkSize);
      
      try {
        // 여러 키워드를 쉼표로 구분해서 한 번에 요청
        const keywordsString = chunk.join(',');
        const apiUrl = `https://naver-api-proxy-v2.vercel.app/api?keyword=${encodeURIComponent(keywordsString)}`;
        const response = await fetch(apiUrl);

        if (!response.ok) {
          console.error(`API Error: ${response.status}`);
          // 실패하면 개별적으로 재시도
          for (const keyword of chunk) {
            const singleUrl = `https://naver-api-proxy-v2.vercel.app/api?keyword=${encodeURIComponent(keyword)}`;
            const singleResponse = await fetch(singleUrl);
            if (singleResponse.ok) {
              const singleData = await singleResponse.json();
              const match = singleData.keywordList?.[0];
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
              }
            }
            await new Promise(resolve => setTimeout(resolve, 150));
          }
          continue;
        }

        const data = await response.json();
        const keywordList = data.keywordList || [];
        
        // 각 키워드에 매칭
        for (const keyword of chunk) {
          const match = keywordList.find(
            item => item.relKeyword && item.relKeyword.toLowerCase() === keyword.toLowerCase()
          );
          
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
              error: 'No exact match',
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

        // 청크 사이 대기
        if (i + chunkSize < keywords.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error) {
        console.error(`Chunk error:`, error);
        // 에러 시 해당 청크의 모든 키워드 0 처리
        for (const keyword of chunk) {
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
