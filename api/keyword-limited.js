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

  const CUSTOMER_ID = '2865372';
  const ACCESS_LICENSE = '0100000000b4a432729b7e7e42b6b9f87f73bac533ae2b1f4e7ee5eccbe9de62ffbedffcb5';
  const SECRET_KEY = 'AQAAAAC0pDJym35+Qra5+H9zusUzvalNeyb5aw8coXWCCPPFpg==';

  try {
    const timestamp = Date.now().toString();
    const crypto = require('crypto');
    
    // Signature 생성
    const hmac = crypto.createHmac('sha256', SECRET_KEY);
    hmac.update(`${timestamp}.${ACCESS_LICENSE}`);
    const signature = hmac.digest('base64');

    const response = await fetch(
      'https://api.naver.com/keywordstool',
      {
        method: 'POST',
        headers: {
          'X-API-KEY': ACCESS_LICENSE,
          'X-Customer': CUSTOMER_ID,
          'X-Timestamp': timestamp,
          'X-Signature': signature,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          hintKeywords: hintKeywords,
          showDetail: 1
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Naver API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (data.keywordList && data.keywordList.length > 0) {
      let keywords = data.keywordList.slice(0, 50);
      
      keywords.sort((a, b) => {
        const getValue = (val) => {
          if (typeof val === 'string' && val.includes('<')) return 0;
          return parseInt(val) || 0;
        };
        
        const totalA = getValue(a.monthlyPcQcCnt) + getValue(a.monthlyMobileQcCnt);
        const totalB = getValue(b.monthlyPcQcCnt) + getValue(b.monthlyMobileQcCnt);
        return totalB - totalA;
      });
      
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