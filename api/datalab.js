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
      { label: '0-12세', ages: ['1'] },
      { label: '13-18세', ages: ['2'] },
      { label: '19-24세', ages: ['3'] },
      { label: '25-29세', ages: ['4'] },
      { label: '30-34세', ages: ['5'] },
      { label: '35-39세', ages: ['6'] },
      { label: '40-44세', ages: ['7'] },
      { label: '45-49세', ages: ['8'] },
      { label: '50-54세', ages: ['9'] },
      { label: '55-59세', ages: ['10'] },
      { label: '60세+', ages: ['11'] }
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

    // 변동율 계산 (전체 데이터 기준)
    const allData = totalData.results[0].data;
    const last30Days = allData.slice(-30);
    const last30DaysSum = last30Days.reduce((sum, item) => sum + item.ratio, 0);
    
    const previous30Days = allData.slice(-60, -30);
    const previous30DaysSum = previous30Days.reduce((sum, item) => sum + item.ratio, 0);
    
    const last3Months = allData.slice(-90);
    const last3MonthsAvg = last3Months.reduce((sum, item) => sum + item.ratio, 0) / 3;
    
    const last6Months = allData.slice(-180);
    const last6MonthsAvg = last6Months.reduce((sum, item) => sum + item.ratio, 0) / 6;
    
    const changeRate1Month = previous30DaysSum > 0 
      ? parseFloat(((last30DaysSum - previous30DaysSum) / previous30DaysSum * 100).toFixed(2)) 
      : 0;
    
    const changeRate3Months = last3MonthsAvg > 0 
      ? parseFloat(((last30DaysSum - last3MonthsAvg) / last3MonthsAvg * 100).toFixed(2)) 
      : 0;
    
    const changeRate6Months = last6MonthsAvg > 0 
      ? parseFloat(((last30DaysSum - last6MonthsAvg) / last6MonthsAvg * 100).toFixed(2)) 
      : 0;

    // 성별 비율 계산 (최근 30일 기준)
    const femaleLast30 = femaleData.results[0].data.slice(-30).reduce((sum, item) => sum + item.ratio, 0);
    const maleLast30 = maleData.results[0].data.slice(-30).reduce((sum, item) => sum + item.ratio, 0);
    const genderTotal = femaleLast30 + maleLast30;
    
    const genderRatio = {
      female: genderTotal > 0 ? parseFloat((femaleLast30 / genderTotal * 100).toFixed(2)) : 0,
      male: genderTotal > 0 ? parseFloat((maleLast30 / genderTotal * 100).toFixed(2)) : 0
    };

    // 연령별 비율 계산 (최근 30일 기준)
    const ageRatios = [];
    let ageTotal = 0;
    
    for (const group of ageData) {
      const sum = group.data.results[0].data.slice(-30).reduce((sum, item) => sum + item.ratio, 0);
      ageTotal += sum;
      ageRatios.push({ label: group.label, sum });
    }
    
    const ageRatiosFinal = ageRatios.map(item => ({
      label: item.label,
      ratio: ageTotal > 0 ? parseFloat((item.sum / ageTotal * 100).toFixed(2)) : 0
    }));

    // 절대값 계산 및 월별 집계
    if (monthlyTotal) {
      const calibrationFactor = parseFloat(monthlyTotal) / last30DaysSum;
      
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
        
        const monthlyResult = Object.values(monthlyData).map(month => ({
          period: month.period,
          absoluteValue: Math.round(
            month.absoluteValues.reduce((sum, val) => sum + val, 0)
          ),
          label: `${month.year}년 ${parseInt(month.month)}월`,
          daysCount: month.absoluteValues.length
        }));

        if (monthlyResult.length > 0 && monthlyResult[0].daysCount < 27) {
          monthlyResult.shift();
        }

        totalData.results[0].data = monthlyResult;
      } else {
        totalData.results[0].data = dataWithAbsolute.map(item => ({
          period: item.period,
          absoluteValue: item.absoluteValue,
          label: item.label
        }));
      }
    }
    
    return res.status(200).json({
      ...totalData,
      last30DaysSum,
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
    timeUnit: 'date',
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