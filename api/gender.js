import chromium from '@sparticuz/chromium';
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

  if (!NAVER_ID || !NAVER_PW) {
    return res.status(500).json({ error: 'Missing credentials' });
  }

  let browser = null;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    await page.goto('https://searchad.naver.com/');
    await page.waitForSelector('#id', { timeout: 10000 });

    await page.type('#id', NAVER_ID);
    await page.type('#pw', NAVER_PW);
    await page.click('.btn_login');

    await page.waitForNavigation({ timeout: 15000 });

    const keywordToolUrl = `https://searchad.naver.com/keywordstool?keyword=${encodeURIComponent(keyword)}`;
    await page.goto(keywordToolUrl);
    await page.waitForTimeout(5000);

    const data = await page.evaluate(() => {
      return {
        gender: {
          female: 0,
          male: 0
        },
        age: {}
      };
    });

    await browser.close();

    return res.status(200).json({
      keyword,
      success: true,
      data
    });

  } catch (error) {
    if (browser) await browser.close();
    
    return res.status(500).json({ 
      error: 'Crawling failed',
      message: error.message 
    });
  }
}