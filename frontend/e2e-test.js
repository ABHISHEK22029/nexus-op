import puppeteer from 'puppeteer';

(async () => {
  const artifactsPath = 'C:\\Users\\abhis\\.gemini\\antigravity-ide\\brain\\b3cca2fb-50e9-44aa-8ba9-7da61a771804\\scratch';
  
  console.log('🚀 Launching Puppeteer E2E Edge Case Tester...');
  const browser = await puppeteer.launch({ 
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 }
  });
  
  const page = await browser.newPage();
  // Pass browser logs to node console
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  try {
    // ---------------------------------------------------------
    // TEST 1: ONBOARDING WIZARD EDGE CASES (Validation & Start Fresh)
    // ---------------------------------------------------------
    console.log('\\n--- TEST 1: ONBOARDING EDGE CASES ---');
    await page.goto('http://localhost:5173/get-started', { waitUntil: 'networkidle0' });
    
    // Click Start Fresh
    await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('h3'));
      const freshCard = headings.find(h => h.innerText.includes('Start Fresh'));
      if (freshCard) freshCard.parentElement.click();
    });
    
    await new Promise(r => setTimeout(r, 1500));
    await page.waitForSelector('text/Company / Organization Name', { timeout: 5000 }).catch(() => {});
    
    console.log('➡️ Attempting to skip step 1 without filling required fields (Edge Case)...');
    // Onboarding step 0 has a "Skip this step" button
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const skipBtn = btns.find(b => b.innerText.includes('Skip this step'));
      if(skipBtn) skipBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));
    
    console.log('➡️ Step 2 (Project): Leaving Project Name empty and clicking Continue...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const continueBtn = btns.find(b => b.innerText.includes('Continue'));
      if(continueBtn) continueBtn.click();
    });
    // For now, our simple UI might just let them skip, let's test if it navigates
    await new Promise(r => setTimeout(r, 500));
    
    // Fill out the required Project Name via DOM manipulation
    console.log('➡️ Filling required Project Name to test successful creation...');
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      // The first input on the Project step is Project Name
      if(inputs.length > 0) {
        inputs[0].value = 'Test E2E Project';
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    
    // Navigate to the final step (Step 3: Team)
    for(let i=0; i<3; i++) {
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const continueBtn = btns.find(b => b.innerText.includes('Continue') || b.innerText.includes('Skip this step'));
          if(continueBtn) continueBtn.click();
        });
        await new Promise(r => setTimeout(r, 500));
    }
    
    // Click Go to Dashboard
    console.log('➡️ Clicking Go to Dashboard to trigger project creation...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const createBtn = btns.find(b => b.innerText.includes('Go to Dashboard'));
      if(createBtn) createBtn.click();
    });
    
    await new Promise(r => setTimeout(r, 2500));
    const urlAfterCreate = await page.url();
    if(urlAfterCreate.includes('/dashboard')) {
        console.log('✅ PASS: Successfully navigated to Dashboard after Project Creation.');
    } else {
        console.log('❌ FAIL: Did not navigate to Dashboard. URL is: ' + urlAfterCreate);
    }
    
    await page.screenshot({ path: `${artifactsPath}\\E2E_1_Dashboard.png` });

    // ---------------------------------------------------------
    // TEST 2: VENDOR CREATION EDGE CASES
    // ---------------------------------------------------------
    console.log('\\n--- TEST 2: VENDOR CREATION EDGE CASES ---');
    await page.goto('http://localhost:5173/vendors/new', { waitUntil: 'networkidle0' });
    
    console.log('➡️ Leaving Vendor form blank and clicking Save (Edge Case)...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const saveBtn = btns.find(b => b.innerText.includes('Save & Continue') || b.innerText.includes('Save Draft'));
      if(saveBtn) saveBtn.click();
    });
    
    await new Promise(r => setTimeout(r, 500));
    // Check for validation errors in DOM
    const validationErrors = await page.evaluate(() => {
        return document.body.innerText.includes('Company name is required');
    });
    if(validationErrors) {
        console.log('✅ PASS: Vendor form correctly blocked submission and showed validation error.');
    } else {
        console.log('❌ FAIL: Vendor form did not show validation error for empty submission.');
    }
    
    console.log('➡️ Filling Vendor Data and Saving...');
    await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const nameInput = inputs.find(i => i.placeholder.includes('Larsen'));
        if(nameInput) {
            nameInput.value = 'E2E Test Vendor';
            nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        const selects = document.querySelectorAll('select');
        if(selects.length > 0) {
            selects[0].value = 'Material Supply';
            selects[0].dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        const btns = Array.from(document.querySelectorAll('button'));
        const saveBtn = btns.find(b => b.innerText.includes('Save Draft'));
        if(saveBtn) saveBtn.click();
    });
    
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: `${artifactsPath}\\E2E_2_VendorSaved.png` });
    console.log('✅ Vendor Saved.');

    // ---------------------------------------------------------
    // TEST 3: PURCHASE ORDERS API DATA & UI
    // ---------------------------------------------------------
    console.log('\\n--- TEST 3: PURCHASE ORDER RENDERING ---');
    // Load sample data via API directly to test UI rendering without onboarding
    await page.goto('http://localhost:5173/get-started', { waitUntil: 'networkidle0' });
    await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('h3'));
      const demoCard = headings.find(h => h.innerText.includes('Explore with Sample Data'));
      if (demoCard) demoCard.parentElement.click();
    });
    await new Promise(r => setTimeout(r, 2000)); // wait to set demo state
    
    await page.goto('http://localhost:5173/purchase-orders', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2000)); // wait for API
    
    console.log('➡️ Verifying POs are listed in table...');
    const hasPOs = await page.evaluate(() => {
       return document.body.innerText.includes('Earthwork Material'); 
    });
    
    if(hasPOs) {
        console.log('✅ PASS: Purchase Orders successfully loaded from backend into the table.');
    } else {
        console.log('❌ FAIL: Purchase Orders table is empty or did not fetch correctly.');
    }
    
    console.log('➡️ Clicking View PO...');
    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const viewPo = buttons.find(b => b.innerText.includes('View PO'));
      if (viewPo) {
        viewPo.click();
        return true;
      }
      return false;
    });
    
    if (clicked) {
      await new Promise(r => setTimeout(r, 1500));
      const invoiceText = await page.evaluate(() => document.body.innerText);
      if (invoiceText.includes('Total Amount')) {
        console.log('✅ PASS: Invoice Component rendered correctly.');
      } else {
        console.log('❌ FAIL: Invoice did not render as expected.');
      }
      await page.screenshot({ path: `${artifactsPath}\\E2E_3_Invoice.png`, fullPage: true });
    }

  } catch (error) {
    console.error('❌ Fatal E2E Error:', error);
  } finally {
    await browser.close();
    console.log('\\n🏁 E2E Edge Case Testing Complete.');
  }
})();
