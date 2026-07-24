const http = require('http');

const targetIP = '192.168.1.39';

function queryHTTP(endpoint, method = 'GET', body = null) {
    return new Promise((resolve) => {
        const options = {
            hostname: targetIP,
            port: 80,
            path: endpoint,
            method: method,
            headers: { 'Content-Type': 'application/json' },
            timeout: 3000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch(e) {
                    resolve({ status: res.statusCode, raw: data.substring(0, 500) });
                }
            });
        });

        req.on('error', (err) => resolve({ error: err.message }));
        req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });

        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runDeepStudy() {
    console.log("=== 1. FULL VNISH INFO ===");
    const info = await queryHTTP('/api/v1/info');
    console.log("Info:", JSON.stringify(info.data, null, 2));

    console.log("\n=== 2. FULL VNISH SUMMARY ===");
    const summary = await queryHTTP('/api/v1/summary');
    console.log("Summary:", JSON.stringify(summary.data, null, 2));

    console.log("\n=== 3. VNISH STATUS ===");
    const status = await queryHTTP('/api/v1/status');
    console.log("Status:", JSON.stringify(status.data, null, 2));

    console.log("\n=== 4. VNISH LOGS ===");
    const log = await queryHTTP('/api/v1/log');
    console.log("Log:", JSON.stringify(log.data || log.raw, null, 2).substring(0, 800));
}

runDeepStudy();
