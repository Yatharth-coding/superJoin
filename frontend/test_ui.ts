import puppeteer from 'puppeteer';
import path from 'path';

async function runTest() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ 
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const page = await browser.newPage();
  
  let errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`[Console Error] ${msg.text()} | args: ${msg.args().map(a => a.toString()).join(', ')}`);
    }
  });
  
  page.on('response', response => {
    if (response.status() === 404) {
      errors.push(`[404 Not Found] ${response.url()}`);
    }
  });

  page.on('pageerror', error => {
    errors.push(error.message);
  });
  
  console.log('Navigating to localhost:5173...');
  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 10000 });
    
    console.log('Taking screenshot of Dashboard...');
    await page.screenshot({ path: 'test_dashboard.png' });
    
    console.log('Clicking Upload tab...');
    await page.click('text/Upload');
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: 'test_upload.png' });

    console.log('Clicking Facts tab...');
    await page.click('text/Facts');
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: 'test_facts.png' });

    console.log('Clicking Relationships tab...');
    await page.click('text/Relationships');
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: 'test_relationships.png' });

    console.log('Clicking Required Cases tab...');
    await page.click('text/Required Cases');
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: 'test_cases.png' });

    console.log('\n--- Test Results ---');
    if (errors.length > 0) {
      console.log('Found Console Errors:');
      errors.forEach(e => console.log(' - ' + e));
    } else {
      console.log('No console errors found! App is working perfectly.');
    }
  } catch (err: any) {
    console.error('Test script failed:', err.message);
  } finally {
    await browser.close();
  }
}

runTest();
