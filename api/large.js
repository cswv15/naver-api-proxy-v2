export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { keywords } = req.body;
  
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return res.status(400).json({ error: 'keywords array required' });
  }
  
  if (keywords.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 keywords allowed' });
  }

  // 환경변수에서 네이버 광고 API 키 가져오기
  const CLIENT_ID = process.env.NAVER_AD_ID;
  const CLIENT_SECRET = process.env.NAVER_AD_PW;
  const CUSTOMER_ID = process.env.NAVER_CUSTOMER_ID;

  if (!CLIENT_ID || !CLIENT_SECRET || !CUSTOMER_ID) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const results = [];
    
    // 키워드 하나씩 처리
    for (let i = 0; i < keywords.length; i++) {
      const keyword = keywords[i].trim();
      if (!keyword) continue;

      try {
        const response = await fetch(
          `https://api.naver.com/keywordstool?hintKeywords=${encodeURIComponent(keyword)}&showDetail=1`,
          {
            headers: {
              'X-Naver-Client-Id': CLIENT_ID,
              'X-Naver-Client-Secret': CLIENT_SECRET,
              'X-Customer': CUSTOMER_ID,
            },
          }
        );

        if (!response.ok) {
          console.error(`API Error for "${keyword}": ${response.status}`);
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
        const keywordList = data.keywordList || [];
        
        // 정확히 일치하는 키워드 찾기
        const match = keywordList.find(
          k => k.relKeyword.toLowerCase() === keyword.toLowerCase()
        );

        if (match) {
          results.push({
            keyword,
            relKeyword: match.relKeyword,
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

        // Rate limit 방지: 150ms 대기
        await new Promise(resolve => setTimeout(resolve, 150));
        
      } catch (error) {
        console.error(`Error processing "${keyword}":`, error);
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
      total: results.length 
    });
    
  } catch (error) {
    console.error('Large search error:', error);
    return res.status(500).json({ error: error.message });
  }
}
