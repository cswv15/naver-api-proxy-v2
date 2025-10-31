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
    
    // Base64 디코딩 함수
    function base64ToBytes(base64) {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    }
    
    // Signature = Base64(HMAC-SHA256(Secret-Key, timestamp + "." + access-license))
    const message = `${timestamp}.${ACCESS_LICENSE}`;
    const messageBytes = new TextEncoder().encode(message);
    const secretKeyBytes = base64ToBytes(SECRET_KEY);
    
    // HMAC-SHA256
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      secretKeyBytes,
      { name: 'HMAC', hash: { name: 'SHA-256' } },
      false,
      ['sign']
    );
    
    const signatureBytes = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      messageBytes
    );
    
    // Base64 인코딩
    const signatureArray = Array.from(new Uint8Array(signatureBytes));
    const signature = btoa(String.fromCharCode.apply(null, signatureArray));

    // 네이버 광고 API 호출
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
      return res.status(response.status).json({ 
        error: 'Naver API error',
        status: response.status,
        detail: errorText,
        debugInfo: {
          timestamp,
          signature,
          message
        }
      });
    }

    const data = await response.json();
    
    // 상위 50개 중 검색량 높은 20개 선택
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
      message: error.message,
      stack: error.stack
    });
  }
}