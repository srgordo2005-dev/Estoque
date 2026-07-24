const http = require('http');

const targetIP = '192.168.1.39';

function getHTML(urlPath) {
    return new Promise((resolve) => {
        http.get(`http://${targetIP}${urlPath}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', () => resolve(''));
    });
}

async function findStockInfoEndpointInJS() {
    console.log("Downloading Vnish Web Frontend HTML and JS bundles to find Stock Info API endpoint...");
    const html = await getHTML('/');
    console.log("HTML length:", html.length);

    // Find JS script tags
    const jsMatches = html.match(/src=["']([^"']+\.js)["']/g) || [];
    console.log("JS files found:", jsMatches);

    for (const match of jsMatches) {
        const jsPath = match.replace(/src=["']/, '').replace(/["']$/, '');
        console.log(`\nFetching ${jsPath} ...`);
        const jsContent = await getHTML(jsPath);
        
        // Search for 'Stock info' or 'board_model' or 'BHB' or 'serial' in JS
        const matches = jsContent.match(/.{0,50}(Stock info|board_model|BHB|serial|YNAHYS|chip_bin).{0,50}/gi) || [];
        console.log(`Matches in ${jsPath}:`, matches.slice(0, 10));
    }
}

findStockInfoEndpointInJS();
