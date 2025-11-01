export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  console.log('Received body:', JSON.stringify(req.body));

  let keywords = req.body?.keywords;
  
  // 어떤 형식이든 배열로 변환
  if (!keywords) {
    return res.status(400).json({ error: 'keywords is required' });
  }
  
  if (typeof keywords === 'string') {
    keywords = keywords.split('\n').filter(k => k && k.trim()).map(k => k.trim());
  }
  
  if (!Array.isArray(keywords)) {
    keywords = [keywords];
  }
  
  keywords = keywords.filter(k => k && k.trim()).map(k => k.trim());
  
  if (keywords.length === 0) {
    return res.status(400).json({ error: 'keywords array is empty after filtering' });
  }

  const results = [];
  
  try {
    for (let i = 0; i < Math.min(keywords.length, 100); i++) {
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
    return res.status(500).json({ 
      error: 'Server error',
      message: error.message
    });
  }
}
```

**Commit → Vercel 배포 대기 (1-2분)**

---

### 2단계: Bubble Workflow Step 2 수정

**Workflow → Step 2 (LargeSearch - SearchKeywords):**

**keywords 파라미터를:**
```
input-keywords's value
