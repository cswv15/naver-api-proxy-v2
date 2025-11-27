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
    
    // ✅ 공백 제거 추가: "부산 맛집" → "부산맛집"
    let keywords = keywordsParam
      .split(/[,\n]+/)
      .map(k => k.replace(/\s+/g, '').trim())  // 모든 공백 제거
      .filter(k => k.length > 0);
    
    if (keywords.length === 0) {
      return res.status(400).json({ error: 'keywords array is empty' });
    }
    
    if (keywords.length > 200) {
      keywords = keywords.slice(0, 200);
    }

    const results = [];
    
    // 5개씩 묶어서 한 번에 요청
    const chunkSize = 5;
    
    for (let i = 0; i < keywords.length; i += chunkSize) {
      const chunk = keywords.slice(i, i + chunkSize);
      
      try {
        // 5개를 쉼표로 구분해서 한 번에 요청
        const keywordsString = chunk.join(',');
        const apiUrl = `https://naver-api-proxy-v2.vercel.app/api?keyword=${encodeURIComponent(keywordsString)}`;
        
        const response = await fetch(apiUrl, {
          signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) {
          console.error(`API Error: ${response.status}`);
          // 실패하면 0으로 처리
          for (const keyword of chunk) {
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
          }
          continue;
        }

        const data = await response.json();
        const keywordList = data.keywordList || [];
        
        // 요청한 각 키워드에 대해 정확히 매칭
        for (const keyword of chunk) {
          // 대소문자 무시하고 정확히 일치하는 키워드 찾기
          const match = keywordList.find(
            item => item.relKeyword && item.relKeyword.toLowerCase() === keyword.toLowerCase()
          );
          
          if (match) {
            results.push({
              keyword,
              relKeyword: match.relKeyword || keyword,
              monthlyPcQcCnt: match.monthlyPcQcCnt === "< 10" ? 0 : (match.monthlyPcQcCnt || 0),
              monthlyMobileQcCnt: match.monthlyMobileQcCnt === "< 10" ? 0 : (match.monthlyMobileQcCnt || 0),
              monthlyAvePcClkCnt: match.monthlyAvePcClkCnt || 0,
              monthlyAveMobileClkCnt: match.monthlyAveMobileClkCnt || 0,
              monthlyAvePcCtr: match.monthlyAvePcCtr || 0,
              monthlyAveMobileCtr: match.monthlyAveMobileCtr || 0,
              plAvgDepth: match.plAvgDepth || 0,
              compIdx: match.compIdx || '-',
            });
          } else {
            // 정확히 일치하지 않으면 0 처리
            results.push({
              keyword,
              error: 'No exact match found',
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
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (error) {
        console.error(`Chunk error:`, error);
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
