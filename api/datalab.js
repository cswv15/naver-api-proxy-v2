export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const keyword = req.query.keyword || req.body?.keyword;
  const monthlyTotal = req.query.monthlyTotal || req.body?.monthlyTotal;
  const aggregation = req.query.aggregation || 'monthly';  // 기본값 monthly로 변경
  
  if (!keyword) {
    return res.status(400).json({ error: 'keyword is required' });
  }

  const CLIENT_ID = 'QIgM5M8MCncMBw_GoYPq';
  const CLIENT_SECRET = 'ic4x5GOhKB';

  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);

  const startDateStr = startDate.toISOString().slice(0, 10);
  const endDateStr = endDate.toISOString().slice(0, 10);

  try {
    // 🚀 병렬 처리: 모든 API를 동시에 호출!
    const ageGroups = [
      { label: '0-18세', ages: ['1', '2'] },           // 0-12 + 13-18
      { label: '19-29세', ages: ['3', '4'] },          // 19-24 + 25-29
      { label: '30-39세', ages: ['5', '6'] },          // 30-34 + 35-39
      { label: '40-49세', ages: ['7', '8'] },          // 40-44 + 45-49
      { label: '50-59세', ages: ['9', '10'] },         // 50-54 + 55-59
      { label: '60세+', ages: ['11'] }                 // 60+
    ];

    // 전체, 성별, 연령별을 한 번에 호출 (Promise.all)
    const [totalData, femaleData, maleData, ...ageDataResults] = await Promise.all([
      fetchData(keyword, startDateStr, endDateStr, CLIENT_ID, CLIENT_SECRET),
      fetchData(keyword, startDateStr, endDateStr, CLIENT_ID, CLIENT_SECRET, { gender: 'f' }),
      fetchData(keyword, startDateStr, endDateStr, CLIENT_ID, CLIENT_SECRET, { gender: 'm' }),
      ...ageGroups.map(group => 
        fetchData(keyword, startDateStr, endDateStr, CLIENT_ID, CLIENT_SECRET, { ages: group.ages })
      )
    ]);

    const ageData = ageGroups.map((group, index) => ({
      label: group.label,
      data: ageDataResults[index]
    }));

    // 변동율 계산 (월별 데이터 기준)
    const allData = totalData.results[0].data;
    
    // 최근 1개월
    const lastMonth = allData.slice(-1);
    const lastMonthSum = lastMonth.reduce((sum, item) => sum + item.ratio, 0);
    
    // 이전 1개월
    const previousMonth = allData.slice(-2, -1);
    const previousMonthSum = previousMonth.reduce((sum, item) => sum + item.ratio, 0);
    
    // 최근 3개월 평균
    const last3Months = allData.slice(-3);
    const last3MonthsAvg = last3Months.reduce((sum, item) => sum + item.ratio, 0) / 3;
    
    // 최근 6개월 평균
    const last6Months = allData.slice(-6);
    const last6MonthsAvg = last6Months.reduce((sum, item) => sum + item.ratio, 0) / 6;
    
    const changeRate1Month = previousMonthSum > 0 
      ? parseFloat(((lastMonthSum - previousMonthSum) / previousMonthSum * 100).toFixed(2)) 
      : 0;
    
    const changeRate3Months = last3MonthsAvg > 0 
      ? parseFloat(((lastMonthSum - last3MonthsAvg) / last3MonthsAvg * 100).toFixed(2)) 
      : 0;
    
    const changeRate6Months = last6MonthsAvg > 0 
      ? parseFloat(((lastMonthSum - last6MonthsAvg) / last6MonthsAvg * 100).toFixed(2)) 
      : 0;

    // 성별 비율 계산 (최근 1개월 기준)
    const femaleLast = femaleData.results[0].data.slice(-1).reduce((sum, item) => sum + item.ratio, 0);
    const maleLast = maleData.results[0].data.slice(-1).reduce((sum, item) => sum + item.ratio, 0);
    const genderTotal = femaleLast + maleLast;
    
    const genderRatio = {
      female: genderTotal > 0 ? parseFloat((femaleLast / genderTotal * 100).toFixed(2)) : 0,
      male: genderTotal > 0 ? parseFloat((maleLast / genderTotal * 100).toFixed(2)) : 0
    };

    // 연령별 비율 계산 (최근 1개월 기준)
    const ageRatios = [];
    let ageTotal = 0;
    
    for (const group of ageData) {
      const sum = group.data.results[0].data.slice(-1).reduce((sum, item) => sum + item.ratio, 0);
      ageTotal += sum;
      ageRatios.push({ label: group.label, sum });
    }
    
    const ageRatiosFinal = ageRatios.map(item => ({
      label: item.label,
      ratio: ageTotal > 0 ? parseFloat((item.sum / ageTotal * 100).toFixed(2)) : 0
    }));

    // 절대값 계산
    if (monthlyTotal) {
      const calibrationFactor = parseFloat(monthlyTotal) / lastMonthSum;
      
      const dataWithAbsolute = allData.map(item => {
        const [year, month] = item.period.split('-');
        
        return {
          period: item.period,
          absoluteValue: Math.round(item.ratio * calibrationFactor),
          label: `${year}년 ${parseInt(month)}월`,
          daysCount: 30  // 월별이므로 근사값
        };
      });

      totalData.results[0].data = dataWithAbsolute;
    }
    
    return res.status(200).json({
      ...totalData,
      last30DaysSum: lastMonthSum,  // 최근 1개월 합계
      changeRate1Month,
      changeRate3Months,
      changeRate6Months,
      genderRatio,
      ageRatios: ageRatiosFinal
    });

  } catch (error) {
    return res.status(500).json({ 
      error: 'API call failed',
      message: error.message 
    });
  }
}

async function fetchData(keyword, startDate, endDate, clientId, clientSecret, filters = {}) {
  const body = {
    startDate,
    endDate,
    timeUnit: 'month',  // month로 변경!
    keywordGroups: [
      {
        groupName: keyword,
        keywords: [keyword]
      }
    ],
    ...filters
  };

  const response = await fetch('https://openapi.naver.com/v1/datalab/search', {
    method: 'POST',
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  return await response.json();
}
