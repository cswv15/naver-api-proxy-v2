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
      .map(k => k.replace(/\s+/g, '').trim()) // 모든 공백 제거
      .filter(k => k.length > 0);

    if (keywords.length === 0) {
      return res.status(400).json({ error: 'keywords array is empty' });
    }

    // ✅ 500개로 증가
    if (keywords.length > 500) {
      keywords = keywords.slice(0, 500);
    }

    const results = [];
    
    // ✅ 안정성 개선: 3개씩 묶어서 처리 (5개→3개로 감소)
    const chunkSize = 3;
    
    for (let i = 0; i < keywords.length; i += chunkSize) {
      const chunk = keywords.slice(i, i + chunkSize);
      
      // ✅ 재시도 로직 추가 (최대 3번)
      let retryCount = 0;
      let success = false;
      
      while (!success && retryCount < 3) {
        try {
          const keywordsString = chunk.join(',');
          const apiUrl = `https://naver-api-proxy-v2.vercel.app/api?keyword=${encodeURIComponent(keywordsString)}`;
          
          // ✅ 타임아웃 20초로 증가 (15초→20초)
          const response = await fetch(apiUrl, { 
            signal: AbortSignal.timeout(20000) 
          });

          if (!response.ok) {
            throw new Error(`API Error ${response.status}`);
          }

          const data = await response.json();
          const keywordList = data.keywordList || [];

          // 요청한 각 키워드에 대해 정확히 매칭
          for (const keyword of chunk) {
            const match = keywordList.find(
              item => item.relKeyword && 
                     item.relKeyword.toLowerCase() === keyword.toLowerCase()
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
          
          success = true;
          
        } catch (error) {
          retryCount++;
          console.error(`Chunk error (attempt ${retryCount}):`, error);
          
          // ✅ 재시도 전 대기 (exponential backoff)
          if (retryCount < 3) {
            await new Promise(resolve => 
              setTimeout(resolve, 1000 * retryCount) // 1초, 2초, 3초
            );
          } else {
            // 3번 실패하면 0으로 처리
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
      }

      // ✅ 청크 사이 대기 시간 증가 (100ms→200ms)
      if (i + chunkSize < keywords.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // ✅ 진행률 로그 (50개마다)
      if ((i + chunkSize) % 50 === 0 || i + chunkSize >= keywords.length) {
        console.log(`Progress: ${Math.min(i + chunkSize, keywords.length)}/${keywords.length}`);
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
