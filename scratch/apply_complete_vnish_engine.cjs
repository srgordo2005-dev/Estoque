const fs = require('fs');

console.log("Applying complete Vnish API engine (Info, Summary, Chains, Fans, Blink, Pools, Network)...");

// 1. UPDATE LOCAL-HELPER.JS & DESKTOP/LOCAL-HELPER.JS
function upgradeVnishEngine(filePath) {
  if (!fs.existsSync(filePath)) return;
  let code = fs.readFileSync(filePath, 'utf8');

  // Replace queryVnishAPI and extractVnishFullDetails
  const vnishEngineCode = `
async function queryVnishAPI(ip, endpoint, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const http = require('http');
        const options = {
            hostname: ip,
            port: 80,
            path: endpoint,
            method: method,
            headers: { 'Content-Type': 'application/json' },
            timeout: 4000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(JSON.parse(data));
                    } else {
                        resolve(null);
                    }
                } catch (e) { resolve(null); }
            });
        });

        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });

        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function extractVnishFullDetails(info = {}, summary = {}, status = {}) {
    const s = summary?.miner || summary || {};
    const sys = info?.system || {};
    const net = sys?.network_status || {};

    const modelName = info?.miner || s?.miner_type || info?.model || 'Antminer S21 (Vnish)';
    
    // Hashrate conversion (GH/s to TH/s)
    let avgHash = s?.average_hashrate || 0;
    if (avgHash > 1000) avgHash = avgHash / 1000; // If in GH/s
    if (s?.hr_average && avgHash === 0) avgHash = s.hr_average > 1000 ? s.hr_average / 1000 : s.hr_average;

    // Chains / Hashboards extraction
    const rawChains = s?.chains || [];
    const chains = rawChains.map((c, idx) => ({
        id: c.id || (idx + 1),
        frequency: c.frequency || 0,
        voltage: c.voltage || 0,
        hashrate: (c.hashrate_rt || c.hashrate_ideal || 0) > 1000 ? (c.hashrate_rt || c.hashrate_ideal) / 1000 : (c.hashrate_rt || c.hashrate_ideal || 0),
        pcb_temp: c.pcb_temp?.max || 0,
        chip_temp: c.chip_temp?.max || 0,
        status: c.status?.state || 'ok',
        chips: (c.chip_statuses?.grey || 0) + (c.chip_statuses?.orange || 0) + (c.chip_statuses?.red || 0) || 108
    }));

    // Fans
    const rawFans = s?.cooling?.fans || [];
    const fans = rawFans.map(f => f.rpm || 0);

    return {
        model: modelName,
        sn: info?.serial && info.serial !== 'N/A' ? info.serial : net?.mac || '',
        mac: net?.mac || '',
        ip: net?.ip || '',
        hashrate: Number(avgHash.toFixed(1)),
        temp: s?.chip_temp?.max || s?.pcb_temp?.max || 0,
        uptime: sys?.uptime || '0m',
        status: s?.miner_status?.miner_state || 'mining',
        chains: chains,
        fans: fans,
        power: s?.power_consumption || 0,
        find_miner: Boolean(status?.find_miner)
    };
}
`;

  // Inject or replace Vnish Engine
  if (code.includes('async function queryVnishAPI')) {
    code = code.replace(/async function queryVnishAPI[\s\S]*?return \{[\s\S]*?\};\s*\}/, vnishEngineCode);
  }

  // Add Vnish Action Endpoints (Blink LED, Pool, Network)
  if (!code.includes("app.post('/api/miner-action'")) {
    const vnishActionEndpoints = `
// Action Endpoint: Blink LED, Change Pool, Change Network IP
app.post('/api/miner-action', async (req, res) => {
    const { ip, action, payload } = req.body;
    if (!ip || !action) return res.status(400).json({ error: 'IP and action are required' });

    try {
        if (action === 'blink') {
            const findVal = payload?.enable !== undefined ? payload.enable : true;
            const result = await queryVnishAPI(ip, '/api/v1/find-miner', 'POST', { find_miner: findVal });
            return res.json({ ok: true, result });
        }
        if (action === 'pools') {
            const result = await queryVnishAPI(ip, '/api/v1/pools', 'POST', payload);
            return res.json({ ok: true, result });
        }
        if (action === 'network') {
            const result = await queryVnishAPI(ip, '/api/v1/network', 'POST', payload);
            return res.json({ ok: true, result });
        }
        if (action === 'reboot') {
            const result = await queryVnishAPI(ip, '/api/v1/system/reboot', 'POST', {});
            return res.json({ ok: true, result });
        }
        res.status(400).json({ error: 'Unknown action' });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});
`;
    code = code.replace("app.listen(PORT,", vnishActionEndpoints + "\napp.listen(PORT,");
  }

  fs.writeFileSync(filePath, code, 'utf8');
  console.log(`✓ Upgraded Vnish API Engine in ${filePath}`);
}

upgradeVnishEngine('local-helper.js');
upgradeVnishEngine('desktop/local-helper.js');

console.log("VNISH API ENGINE APPLIED SUCCESSFULLY!");
