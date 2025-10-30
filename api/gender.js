import puppeteer from 'puppeteer-core';

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

  const NAVER_ID = process.env.NAVER_AD_ID;
  const NAVER_PW = process.env.NAVER_AD_PW;
  const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN;

  if (!NAVER_ID || !NAVER_PW || !BROWSERLESS_TOKEN) {
    return res.status(500).json({ error: 'Missing credentials' });
  }

  let browser = null;

  try {
    // Browserless 연결
    browser = await puppeteer.connect({
      browserWSEndpoint: `wss://production-sfo.browserless.io?token=${BROWSERLESS_TOKEN}`
    });

    const page = await browser.newPage();
    
    // 타임아웃 설정
    page.setDefaultTimeout(60000);

    // 네이버 광고 로그인
    await page.goto('https://searchad.naver.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 스크린샷으로 확인
    const screenshot1 = await page.screenshot({ encoding: 'base64' });

    // 로그인 폼 찾기
    const loginForm = await page.$('#id');
    if (!loginForm) {
      await browser.close();
      return res.status(500).json({ 
        error: 'Login form not found',
        screenshot: `data:image/png;base64,${screenshot1}`
      });
    }

    await page.type('#id', NAVER_ID, { delay: 100 });
    await page.type('#pw', NAVER_PW, { delay: 100 });

    await Promise.all([
      page.click('.btn_login'),
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 })
    ]);

    // 키워드 도구로 이동
    await page.goto('https://searchad.naver.com/keywordstool', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 키워드 검색
    await page.waitForSelector('input[placeholder*="키워드"]');
    await page.type('input[placeholder*="키워드"]', keyword);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);

    // 첫 번째 키워드 클릭 (상세 페이지)
    await page.waitForSelector('table tbody tr:first-child');
    await page.click('table tbody tr:first-child');
    await page.waitForTimeout(5000);

    // 데이터 추출
    const data = await page.evaluate(() => {
      // 성별 데이터 추출 (실제 선택자는 페이지 확인 필요)
      const genderData = {
        female: 0,
        male: 0
      };
      
      // 연령 데이터 추출
      const ageData = {};
      
      // PC/모바일 데이터 추출
      const deviceData = {
        pc: 0,
        mobile: 0
      };
      
      // 월별 데이터 추출
      const monthlyData = [];

      return {
        gender: genderData,
        age: ageData,
        device: deviceData,
        monthly: monthlyData
      };
    });

    await browser.close();

    return res.status(200).json({
      keyword,
      success: true,
      data
    });

  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {}
    }
    
    return res.status(500).json({ 
      error: 'Crawling failed',
      message: error.message,
      stack: error.stack
    });
  }
}