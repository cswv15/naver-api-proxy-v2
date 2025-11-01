export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 간단한 테스트 응답
  return res.status(200).json({
    test: 'API is working!',
    env: {
      hasClientId: !!process.env.NAVER_AD_ID,
      hasClientSecret: !!process.env.NAVER_AD_PW,
      hasCustomerId: !!process.env.NAVER_CUSTOMER_ID,
    },
    body: req.body
  });
}
