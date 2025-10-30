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

  const CLIENT_ID = '2KmBNl2qXg7vRy_lD0DJ';
  const CLIENT_SECRET = '9cB78MrhD6';

  try {
    // 블로그 검색 (전체)
    const blogResponse = await fetch(
      `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=1`,
      {
        headers: {
          'X-Naver-Client-Id': CLIENT_ID,
          'X-Naver-Client-Secret': CLIENT_SECRET
        }
      }
    );
    const blogData = await blogResponse.json();
    const blogCount = blogData.total || 0;

    // 카페 검색 (전체)
    const cafeResponse = await fetch(
      `https://openapi.naver.com/v1/search/cafearticle.json?query=${encodeURIComponent(keyword)}&display=1`,
      {
        headers: {
          'X-Naver-Client-Id': CLIENT_ID,
          'X-Naver-Client-Secret': CLIENT_SECRET
        }
      }
    );
    const cafeData = await cafeResponse.json();
    const cafeCount = cafeData.total || 0;

    // 총 발행량
    const totalContent = blogCount + cafeCount;

    return res.status(200).json({
      keyword,
      blogCount,
      cafeCount,
      totalContent
    });

  } catch (error) {
    return res.status(500).json({ 
      error: 'Failed to fetch content count',
      message: error.message 
    });
  }
}