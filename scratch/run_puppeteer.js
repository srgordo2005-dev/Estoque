
const puppeteer = require('puppeteer');
(async () => {
    try {
        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        console.log('Navigating to http://192.168.1.39 ...');
        await page.goto('http://192.168.1.39', { waitUntil: 'networkidle2', timeout: 10000 }).catch(() => null);
        await new Promise(r => setTimeout(r, 3000));
        await page.screenshot({ path: 'C:\\Users\\Felip\\.gemini\\antigravity\\brain\\6277a6fc-653c-404f-a989-41646dfe8623\\original_dashboard_192_168_1_39.png', fullPage: false });
        console.log('REAL Screenshot saved at C:\\Users\\Felip\\.gemini\\antigravity\\brain\\6277a6fc-653c-404f-a989-41646dfe8623\\original_dashboard_192_168_1_39.png');
        await browser.close();
    } catch(e) {
        console.error('Puppeteer error:', e.message);
    }
})();
