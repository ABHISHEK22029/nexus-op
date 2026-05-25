const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    console.log("Launching Puppeteer...");
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    await page.setViewport({ width: 1920, height: 1080 });

    console.log("Navigating...");
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    
    // wait a sec to let react load
    await new Promise(r => setTimeout(r, 2000));
    
    let ssPath = path.join(__dirname, 'test_images', 'ui_check.png');
    await page.screenshot({ path: ssPath });
    console.log("Screenshot saved!");

    // Also snag console logs
    const html = await page.content();
    console.log("Page title is: ", await page.title());
    if (html.includes("React Error") || html.includes("Exception")) {
       console.log("Found error in HTML text!");
    } else {
       console.log("No obvious error text.");
    }
    await browser.close();
})();
