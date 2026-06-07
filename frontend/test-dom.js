import puppeteer from 'puppeteer';

(async () => {
  const artifactsPath = 'C:\\Users\\abhis\\.gemini\\antigravity-ide\\brain\\b3cca2fb-50e9-44aa-8ba9-7da61a771804\\scratch';

  console.log('🚀 Launching Puppeteer...');
  const browser = await puppeteer.launch({
    headless: 'new', // use new headless mode
    defaultViewport: { width: 1440, height: 900 }
  });
  const page = await browser.newPage();

  try {
    console.log('➡️ Navigating to http://localhost:5173/');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });

    // Screenshot Welcome
    await page.screenshot({ path: `${artifactsPath}\\1_Welcome.png` });
    console.log('✅ Captured 1_Welcome.png');

    console.log('➡️ Navigating directly to Get Started (/get-started)');
    await page.goto('http://localhost:5173/get-started', { waitUntil: 'networkidle0' });
    await page.screenshot({ path: `${artifactsPath}\\2_GetStarted.png` });
    console.log('✅ Captured 2_GetStarted.png');

    console.log('➡️ Clicking Explore Demo to load sample data...');
    // Find a card that says "Explore with Sample Data"
    await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('h3'));
      const demoCard = headings.find(h => h.innerText.includes('Explore with Sample Data'));
      if (demoCard) {
        demoCard.parentElement.click();
      }
    });
    // Wait for navigation to dashboard (could take a moment due to setTimeouts in GetStarted)
    await new Promise(r => setTimeout(r, 2000));
    await page.waitForSelector('text/Dashboard', { timeout: 5000 }).catch(() => { });
    await page.screenshot({ path: `${artifactsPath}\\3_Dashboard.png` });
    console.log('✅ Captured 3_Dashboard.png');

    console.log('➡️ Navigating to Purchase Orders (/purchase-orders)');
    await page.goto('http://localhost:5173/purchase-orders', { waitUntil: 'networkidle0' });
    await page.screenshot({ path: `${artifactsPath}\\4_PurchaseOrders.png` });
    console.log('✅ Captured 4_PurchaseOrders.png');

    console.log('➡️ Clicking View PO for the first PO...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const viewPo = buttons.find(b => b.innerText.includes('View PO'));
      if (viewPo) viewPo.click();
    });

    // Wait for invoice page to render
    await new Promise(r => setTimeout(r, 1500));
    const isPOPage = await page.evaluate(() => window.location.pathname.includes('/po/'));

    if (isPOPage) {
      await page.screenshot({ path: `${artifactsPath}\\5_POInvoice.png`, fullPage: true });
      console.log('✅ Captured 5_POInvoice.png');

      // Test DOM to ensure rich sample data rendered
      const invoiceText = await page.evaluate(() => document.body.innerText);
      if (invoiceText.includes('Total Amount')) {
        console.log('✅ DOM Verification: Found Invoice Total Amount');
      }
      if (invoiceText.includes('Bitumen') || invoiceText.includes('Earthwork') || invoiceText.includes('Dell')) {
        console.log('✅ DOM Verification: Found dynamic rich sample items!');
      } else {
        console.log('⚠️ DOM Verification: Did not find sample items. Text might be different.');
      }
    } else {
      console.log('❌ Error: Could not find "View PO" button or did not navigate');
    }

  } catch (error) {
    console.error('❌ Puppeteer Error:', error);
  } finally {
    await browser.close();
    console.log('🏁 DOM Test Complete.');
  }
})();
