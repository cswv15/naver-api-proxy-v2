export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const keyword = req.query.keyword || req.body?.keyword;
  
  if (!keyword) {
    return res.status(400).json({ error: 'keyword is required' });
  }

  const CLIENT_ID = 'tAqrvpUoITtELJyoFdWM';
  const CLIENT_SECRET = 'H5FMEkWjBm';

  try {
    const response = await fetch(
      `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=1`,
      {
        method: 'GET',
        headers: {
          'X-Naver-Client-Id': CLIENT_ID,
          'X-Naver-Client-Secret': CLIENT_SECRET
        }
      }
    );

    // 실제로는 keywordstool API를 호출해야 하지만
    // 직접 호출이 안 되므로 Bubble에서 직접 호출하고
    // 이 API는 비율 계산만 담당

    const hintKeywords = req.body?.hintKeywords || keyword;
    
    const keywordResponse = await fetch(
      'https://api.naver.com/keywordstool',
      {
        method: 'GET',
        headers: {
          'X-Naver-Client-Id': CLIENT_ID,
          'X-Naver-Client-Secret': CLIENT_SECRET
        }
      }
    );

    const data = await keywordResponse.json();
    
    // PC/모바일 비율 추가
    if (data.keywordList) {
      data.keywordList = data.keywordList.map(item => {
        const total = (item.monthlyPcQcCnt || 0) + (item.monthlyMobileQcCnt || 0);
        return {
          ...item,
          pcRatio: total > 0 ? parseFloat(((item.monthlyPcQcCnt || 0) / total * 100).toFixed(1)) : 0,
          mobileRatio: total > 0 ? parseFloat(((item.monthlyMobileQcCnt || 0) / total * 100).toFixed(1)) : 0
        };
      });
    }

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ 
      error: 'API call failed',
      message: error.message 
    });
  }
}