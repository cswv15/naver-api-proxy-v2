export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const keyword = req.query.keyword || req.body?.keyword;
  const monthlyTotal = req.query.monthlyTotal || req.body?.monthlyTotal;
  const aggregation = req.query.aggregation || 'daily';
  
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
  
  // 최근 30일 및 이전 30일 ratio 합계 계산
  if (data.results && data.results[0] && data.results[0].data) {
    const allData = data.results[0].data;
    
    // 최근 30일과 이전 30일
    const last30Days = allData.slice(-30);
    const previous30Days = allData.slice(-60, -30);
    
    const last30DaysSum = last30Days.reduce((sum, item) => sum + item.ratio, 0);
    const previous30DaysSum = previous30Days.reduce((sum, item) => sum + item.ratio, 0);
    
    data.last30DaysSum = last30DaysSum;
    data.previous30DaysSum = previous30DaysSum;
    
    // 변동율 계산
    if (previous30DaysSum > 0) {
      data.changeRate = ((last30DaysSum - previous30DaysSum) / previous30DaysSum * 100).toFixed(2);
    } else {
      data.changeRate = 0;
    }
    
    // 절대값 계산 (monthlyTotal이 제공된 경우)
    if (monthlyTotal) {
      const calibrationFactor = parseFloat(monthlyTotal) / last30DaysSum;
      
      // 각 데이터에 absoluteValue 추가
      const dataWithAbsolute = allData.map(item => {
        const [year, month, day] = item.period.split('-');
        const label = day === '01' ? `${year}년 ${parseInt(month)}월` : '';
        
        return {
          ...item,
          absoluteValue: Math.round(item.ratio * calibrationFactor),
          label: label,
          yearMonth: `${year}-${month}`
        };
      });
      
      // 월별 집계 (aggregation=monthly인 경우)
      if (aggregation === 'monthly') {
        const monthlyData = {};
        
        dataWithAbsolute.forEach(item => {
          if (!monthlyData[item.yearMonth]) {
            monthlyData[item.yearMonth] = {
              period: item.yearMonth,
              absoluteValues: [],
              year: item.yearMonth.split('-')[0],
              month: item.yearMonth.split('-')[1]
            };
          }
          monthlyData[item.yearMonth].absoluteValues.push(item.absoluteValue);
        });
        
        // 월별 합계 계산
        const monthlyResult = Object.values(monthlyData).map(month => ({
          period: month.period,
          absoluteValue: Math.round(
            month.absoluteValues.reduce((sum, val) => sum + val, 0)
          ),
          label: `${month.year}년 ${parseInt(month.month)}월`,
          daysCount: month.absoluteValues.length
        }));

        // 첫 번째 월이 불완전하면 제거 (27일 미만)
        if (monthlyResult.length > 0 && monthlyResult[0].daysCount < 27) {
          monthlyResult.shift();
        }

        data.results[0].data = monthlyResult;
      } else {
        // 일별 데이터 (기본)
        data.results[0].data = dataWithAbsolute.map(item => ({
          period: item.period,
          absoluteValue: item.absoluteValue,
          label: item.label
        }));
      }
    }
  }
  
  return res.status(200).json(data);
}