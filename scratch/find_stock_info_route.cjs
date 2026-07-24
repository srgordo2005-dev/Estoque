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

async function findStockInfoApiRoute() {
    console.log("Analyzing index-Z1UcnWvt.js for Stock info API routes...");
    const jsContent = await getHTML('/assets/index-Z1UcnWvt.js');

    // Search for API routes near stockInfo or board
    const idx = jsContent.indexOf('stockInfo');
    if (idx !== -1) {
        console.log("Snippet around stockInfo:");
        console.log(jsContent.substring(idx - 300, idx + 400));
    }

    // Search for all /api/v1/ occurrences in the bundle
    const apiRoutes = jsContent.match(/\/api\/v1\/[a-zA-Z0-9_\-\/]*/g) || [];
    console.log("\nAll unique /api/v1/ routes in Vnish web app:");
    console.log([...new Set(apiRoutes)]);
}

findStockInfoApiRoute();
