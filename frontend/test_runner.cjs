const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const screenshotDir = path.join(__dirname, 'test_images');

if (!fs.existsSync(screenshotDir)){
    fs.mkdirSync(screenshotDir);
}

(async () => {
    console.log("Launching Puppeteer for UI testing...");
    const browser = await puppeteer.launch({
        headless: "new"
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    console.log("Navigating to Process Flow page...");
    // Adjust URL if needed
    await page.goto('http://localhost:5173/flow', { waitUntil: 'domcontentloaded' });

    console.log("Waiting for nodes to render...");
    await page.waitForSelector('.react-flow__node', { timeout: 10000 });

    // Wait a brief moment for Dagre layout animations to settle
    await new Promise(r => setTimeout(r, 2000));

    // Screenshot 1: Full Massive Graph
    let ss1Path = path.join(screenshotDir, '1_massive_graph_view.png');
    await page.screenshot({ path: ss1Path });
    console.log("Captured massive graph view ->", ss1Path);

    // Screenshot 2: Click a node to open details side panel
    console.log("Clicking a node to test side panel interactibility...");
    await page.evaluate(() => {
        const node = document.querySelector('.react-flow__node');
        if (node) {
            // Trigger click event that React flow understands
            const event = new MouseEvent('click', { view: window, bubbles: true, cancelable: true });
            node.dispatchEvent(event);
        }
    });
    
    // Wait for the panel to appear
    await new Promise(r => setTimeout(r, 1000));

    let ss2Path = path.join(screenshotDir, '2_node_details_panel.png');
    await page.screenshot({ path: ss2Path });
    console.log("Captured side panel details ->", ss2Path);

    console.log("Tests complete. Closing browser.");
    await browser.close();
})();
