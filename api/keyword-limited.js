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
    
    // Base64 디코딩
    const base64ToArrayBuffer = (base64) => {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    };
    
    // SECRET_KEY를 Base64 디코딩
    const keyData = base64ToArrayBuffer(SECRET_KEY);
    const messageData = new TextEncoder().encode(`${timestamp}.${ACCESS_LICENSE}`);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      messageData
    );
    
    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
    const signatureBase64 = btoa(String.fromCharCode(...signatureArray));

    const response = await fetch(
      'https://api.naver.com/keywordstool',
      {
        method: 'POST',
        headers: {
          'X-API-KEY': ACCESS_LICENSE,
          'X-Customer': CUSTOMER_ID,
          'X-Timestamp': timestamp,
          'X-Signature': signatureBase64,
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