const http = require('http');

const targetIP = '192.168.1.39';

function queryHTTP(endpoint) {
    return new Promise((resolve) => {
        const req = http.get(`http://${targetIP}${endpoint}`, { timeout: 3000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch(e) { resolve(null); }
            });
        });
        req.on('error', (err) => resolve(null));
    });
}

async function checkStockInfo() {
    console.log("Checking Vnish summary for Stock Info (Board Model & Serial)...");
    const summary = await queryHTTP('/api/v1/summary');
    const s = summary?.miner || {};
    const chains = s.chains || [];

    chains.forEach((c, idx) => {
        console.log(`\n--- Chain ${c.id || (idx + 1)} ---`);
        console.log("Keys on chain:", Object.keys(c));
        if (c.stock_info) console.log("stock_info:", c.stock_info);
        if (c.eeprom) console.log("eeprom:", c.eeprom);
        if (c.board_model) console.log("board_model:", c.board_model);
        if (c.serial) console.log("serial:", c.serial);
        if (c.sn) console.log("sn:", c.sn);
    });
}

checkStockInfo();
