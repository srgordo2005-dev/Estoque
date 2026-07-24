const http = require('http');
const net = require('net');

const targetIP = '192.168.1.39';

function queryHTTP(endpoint) {
    return new Promise((resolve) => {
        const req = http.get(`http://${targetIP}${endpoint}`, { timeout: 3000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ endpoint, data: JSON.parse(data) }); } catch(e) { resolve({ endpoint, raw: data }); }
            });
        });
        req.on('error', (err) => resolve({ endpoint, error: err.message }));
        req.on('timeout', () => { req.destroy(); resolve({ endpoint, error: 'timeout' }); });
    });
}

function queryTCP(cmd) {
    return new Promise((resolve) => {
        const client = new net.Socket();
        let data = '';
        client.setTimeout(3000);
        client.connect(4028, targetIP, () => {
            client.write(JSON.stringify({ command: cmd }) + '\n');
        });
        client.on('data', (chunk) => data += chunk.toString());
        client.on('close', () => {
            data = data.replace(/\0/g, '').trim();
            try { resolve({ cmd, data: JSON.parse(data) }); } catch (e) { resolve({ cmd, raw: data }); }
        });
        client.on('error', (err) => { client.destroy(); resolve({ cmd, error: err.message }); });
        client.on('timeout', () => { client.destroy(); resolve({ cmd, error: 'timeout' }); });
    });
}

async function findRealSNs() {
    console.log(`Deep searching for REAL physical Hashboard SNs on ${targetIP}...`);

    // 1. Search HTTP endpoints
    const httpEndpoints = [
        '/api/v1/eeprom',
        '/api/v1/chains',
        '/api/v1/boards',
        '/api/v1/stats',
        '/api/v1/system',
        '/api/v1/hardware'
    ];

    for (const ep of httpEndpoints) {
        const res = await queryHTTP(ep);
        if (res.data && !res.data.error) {
            console.log(`\n--- HTTP Endpoint ${ep} ---`);
            console.log(JSON.stringify(res.data, null, 2).substring(0, 1000));
        }
    }

    // 2. Search TCP stats
    const statsRes = await queryTCP('stats');
    if (statsRes.data) {
        console.log(`\n--- TCP stats output (Looking for SN fields) ---`);
        const str = JSON.stringify(statsRes.data, null, 2);
        const snMatches = str.match(/.*(sn|serial|chain|eeprom|pic|board).*/gi) || [];
        console.log("Matching SN fields in STATS:");
        console.log(snMatches.slice(0, 30).join('\n'));
    }
}

findRealSNs();
