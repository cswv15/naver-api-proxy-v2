export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const hintKeywords = req.query.hintKeywords || req.body?.hintKeywords;
  
  if (!hintKeywords) {
    return res.status(400).json({ error: 'hintKeywords is required' });
  }

  const CLIENT_ID = 'tAqrvpUoITtELJyoFdWM';
  const CLIENT_SECRET = 'H5FMEkWjBm';

  try {
    const response = await fetch(
      'https://api.naver.com/keywordstool',
      {
        method: 'GET',
        headers: {
          'X-Naver-Client-Id': CLIENT_ID,
          'X-Naver-Client-Secret': CLIENT_SECRET,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await response.json();
    
    if (data.keywordList && data.keywordList.length > 0) {
      // 1. 상위 50개만 가져오기
      let keywords = data.keywordList.slice(0, 50);
      
      // 2. 검색량 높은 순으로 정렬
      keywords.sort((a, b) => {
        const getValue = (val) => {
          if (typeof val === 'string' && val.includes('<')) return 0;
          return parseInt(val) || 0;
        };
        
        const totalA = getValue(a.monthlyPcQcCnt) + getValue(a.monthlyMobileQcCnt);
        const totalB = getValue(b.monthlyPcQcCnt) + getValue(b.monthlyMobileQcCnt);
        return totalB - totalA;
      });
      
      // 3. 상위 20개만 반환
      data.keywordList = keywords.slice(0, 20);
    }

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ 
      error: 'API call failed',
      message: error.message 
    });
  }
}