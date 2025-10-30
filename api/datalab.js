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

  // 최근 1년 (일별 데이터)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);

  const body = {
    startDate: startDate.toISOString().slice(0, 10).replace(/-/g, '-'),
    endDate: endDate.toISOString().slice(0, 10).replace(/-/g, '-'),
    timeUnit: 'date',
    keywordGroups: [
      {
        groupName: keyword,
        keywords: [keyword]
      }
    ]
  };

  const response = await fetch('https://openapi.naver.com/v1/datalab/search', {
    method: 'POST',
    headers: {
      'X-Naver-Client-Id': CLIENT_ID,
      'X-Naver-Client-Secret': CLIENT_SECRET,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  return res.status(200).json(data);
}