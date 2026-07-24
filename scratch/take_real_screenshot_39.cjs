const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const targetIP = '192.168.1.39';
const artifactsDir = 'C:\\Users\\Felip\\.gemini\\antigravity\\brain\\6277a6fc-653c-404f-a989-41646dfe8623';
const outputImagePath = path.join(artifactsDir, 'original_dashboard_192_168_1_39.png');

console.log(`Taking REAL live Web Browser screenshot of http://${targetIP}/ ...`);

const puppeteerScript = `
const puppeteer = require('puppeteer');
(async () => {
    try {
        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        console.log('Navigating to http://${targetIP} ...');
        await page.goto('http://${targetIP}', { waitUntil: 'networkidle2', timeout: 10000 }).catch(() => null);
        await new Promise(r => setTimeout(r, 3000));
        await page.screenshot({ path: '${outputImagePath.replace(/\\/g, '\\\\')}', fullPage: false });
        console.log('REAL Screenshot saved at ${outputImagePath.replace(/\\/g, '\\\\')}');
        await browser.close();
    } catch(e) {
        console.error('Puppeteer error:', e.message);
    }
})();
`;

fs.writeFileSync('scratch/run_puppeteer.js', puppeteerScript, 'utf8');

try {
    execSync('npx -y puppeteer node scratch/run_puppeteer.js', { stdio: 'inherit' });
} catch(e) {
    console.error("Execution failed:", e.message);
}
