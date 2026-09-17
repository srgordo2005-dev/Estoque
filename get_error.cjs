const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', error => console.log('PAGE ERROR:', error.message, error.stack));
        
        await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
        
        // Wait a bit to see if React crashes
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        await browser.close();
    } catch (e) {
        console.error("Puppeteer script failed:", e);
    }
})();
