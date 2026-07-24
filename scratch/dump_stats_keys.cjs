const net = require('net');

const targetIP = '192.168.1.39';

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
            try { resolve(JSON.parse(data)); } catch (e) { resolve({ raw: data }); }
        });
        client.on('error', (err) => { client.destroy(); resolve({ error: err.message }); });
        client.on('timeout', () => { client.destroy(); resolve({ error: 'timeout' }); });
    });
}

async function dumpKeys() {
    console.log("Dumping all keys from TCP stats and version...");
    const stats = await queryTCP('stats');
    const version = await queryTCP('version');
    const estats = await queryTCP('estats');

    console.log("\n=== STATS KEYS ===");
    if (stats.STATS) {
        stats.STATS.forEach((st, idx) => {
            console.log(`\n--- STATS[${idx}] ---`);
            console.log(Object.keys(st));
            for (const k in st) {
                if (k.toLowerCase().includes('sn') || k.toLowerCase().includes('serial') || k.toLowerCase().includes('board') || k.toLowerCase().includes('pic') || k.toLowerCase().includes('chain')) {
                    console.log(`  ${k}: ${JSON.stringify(st[k])}`);
                }
            }
        });
    }

    console.log("\n=== VERSION KEYS ===");
    console.log(JSON.stringify(version, null, 2));

    console.log("\n=== ESTATS KEYS ===");
    console.log(JSON.stringify(estats, null, 2).substring(0, 1000));
}

dumpKeys();
