export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const keyword = req.query.keyword || req.body?.keyword;
  const monthlySearchVolume = req.query.monthlySearchVolume || req.body?.monthlySearchVolume;
  
  if (!keyword) {
    return res.status(400).json({ error: 'keyword is required' });
  }

  const CLIENT_ID = 'nB02zLVWUSfJRrvbuxXG';
  const CLIENT_SECRET = '5Cre19NtRd';

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

    // 경쟁도 계산 (monthlySearchVolume 제공 시)
    let blogCompetition = null;
    let cafeCompetition = null;
    let totalCompetition = null;
    
    if (monthlySearchVolume) {
      const searchVolume = parseFloat(monthlySearchVolume);
      
      if (blogCount > 0) {
        blogCompetition = parseFloat((searchVolume / blogCount * 100).toFixed(2));
      }
      
      if (cafeCount > 0) {
        cafeCompetition = parseFloat((searchVolume / cafeCount * 100).toFixed(2));
      }
      
      if (totalContent > 0) {
        totalCompetition = parseFloat((searchVolume / totalContent * 100).toFixed(2));
      }
    }

    return res.status(200).json({
      keyword,
      blogCount,
      cafeCount,
      totalContent,
      monthlySearchVolume: monthlySearchVolume ? parseFloat(monthlySearchVolume) : null,
      blogCompetition,
      cafeCompetition,
      totalCompetition
    });

  } catch (error) {
    return res.status(500).json({ 
      error: 'Failed to fetch content count',
      message: error.message 
    });
  }
}