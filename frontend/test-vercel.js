import puppeteer from 'puppeteer';

(async () => {
  const artifactsPath = 'C:\\Users\\abhis\\.gemini\\antigravity-ide\\brain\\b3cca2fb-50e9-44aa-8ba9-7da61a771804\\scratch';
  const BASE_URL = 'https://nexus-op-sn4d.vercel.app';
  
  console.log(`🚀 Launching Puppeteer E2E Tester against ${BASE_URL}...`);
  const browser = await puppeteer.launch({ 
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 }
  });
  
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  try {
    // 1. TEST ONBOARDING & PROJECT CREATION
    console.log('\n--- TEST 1: NEW PROJECT GENERATION ---');
    await page.goto(`${BASE_URL}/get-started`, { waitUntil: 'networkidle0' });
    
    console.log('➡️ Clicking Start Fresh...');
    await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('h3'));
      const freshCard = headings.find(h => h.innerText.includes('Start Fresh'));
      if (freshCard) freshCard.parentElement.click();
    });
    
    await new Promise(r => setTimeout(r, 1500));
    
    console.log('➡️ Filling Project Name...');
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      if(inputs.length > 0) {
        inputs[0].value = 'Vercel E2E Cloud Project';
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    
    for(let i=0; i<3; i++) {
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const continueBtn = btns.find(b => b.innerText.includes('Continue') || b.innerText.includes('Skip this step'));
          if(continueBtn) continueBtn.click();
        });
        await new Promise(r => setTimeout(r, 500));
    }
    
    console.log('➡️ Clicking Go to Dashboard...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const createBtn = btns.find(b => b.innerText.includes('Go to Dashboard'));
      if(createBtn) createBtn.click();
    });
    
    await new Promise(r => setTimeout(r, 3000));
    const urlAfterCreate = await page.url();
    if(urlAfterCreate.includes('/dashboard')) {
        console.log('✅ PASS: Successfully navigated to Dashboard after Project Creation.');
    } else {
        console.log('❌ FAIL: Did not navigate to Dashboard. URL is: ' + urlAfterCreate);
    }
    await page.screenshot({ path: `${artifactsPath}\\Vercel_1_Dashboard.png` });

    // 2. TEST PURCHASE ORDER & INVOICE GENERATION
    console.log('\n--- TEST 2: INVOICE GENERATION & PO DATA ---');
    await page.goto(`${BASE_URL}/purchase-orders`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('➡️ Looking for POs in the table...');
    const hasPOs = await page.evaluate(() => {
       return document.body.innerText.includes('Earthwork Material') || document.body.innerText.includes('PO-'); 
    });
    
    if(hasPOs) {
        console.log('✅ PASS: Purchase Orders successfully loaded from Supabase.');
    } else {
        console.log('❌ FAIL: Purchase Orders table is empty or failed to load.');
    }
    
    console.log('➡️ Clicking View PO to test Invoice UI...');
    const clickedPo = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const viewPo = buttons.find(b => b.innerText.includes('View PO') || b.innerText.includes('View'));
      if (viewPo) {
        viewPo.click();
        return true;
      }
      return false;
    });
    
    if (clickedPo) {
      await new Promise(r => setTimeout(r, 2000));
      const invoiceText = await page.evaluate(() => document.body.innerText);
      if (invoiceText.includes('Total Amount') || invoiceText.includes('Invoice')) {
        console.log('✅ PASS: Invoice Component rendered correctly with data.');
      } else {
        console.log('❌ FAIL: Invoice did not render as expected.');
      }
      await page.screenshot({ path: `${artifactsPath}\\Vercel_2_Invoice.png`, fullPage: true });
    } else {
      console.log('⚠️ Could not find a View PO button.');
    }

    // 3. TEST ACTIVITY LOG FIX
    console.log('\n--- TEST 3: ACTIVITY LOG FETCHING ---');
    await page.goto(`${BASE_URL}/activity`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2000));
    const isActivityLoaded = await page.evaluate(() => {
        // If it still shows loading or an error, it might not contain time stamps
        return document.body.innerText.includes('seconds ago') || document.body.innerText.includes('min ago') || document.body.innerText.includes('hr ago') || document.body.innerText.includes('days ago') || document.body.innerText.includes('Activity Timeline');
    });
    if(isActivityLoaded) {
       console.log('✅ PASS: Activity Log loaded successfully without crashing.');
    } else {
       console.log('❌ FAIL: Activity Log may not have loaded data properly.');
    }
    await page.screenshot({ path: `${artifactsPath}\\Vercel_3_ActivityLog.png` });

  } catch (error) {
    console.error('❌ Fatal Error during Vercel tests:', error);
  } finally {
    await browser.close();
    console.log('\n🏁 E2E Testing on Vercel Complete.');
  }
})();
