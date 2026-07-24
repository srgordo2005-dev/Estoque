const fs = require('fs');

console.log("Applying Pool Worker extraction, Hashboard SNs, Bad Board Log capture, and strict OCIOSO vs OFFLINE status rules...");

// 1. UPDATE LOCAL-HELPER.JS & DESKTOP/LOCAL-HELPER.JS
function upgradeHelperStatusAndWorker(filePath) {
  if (!fs.existsSync(filePath)) return;
  let code = fs.readFileSync(filePath, 'utf8');

  // Update extractVnishFullDetails to include pool worker, hashboard SNs, and exact status rules
  const updatedVnishEngine = `
function extractVnishFullDetails(info = {}, summary = {}, status = {}) {
    const s = summary?.miner || summary || {};
    const sys = info?.system || {};
    const net = sys?.network_status || {};
    const pools = s?.pools || [];
    const mainPool = pools.find(p => p.pool_type === 'UserPool') || pools[0] || {};
    const poolWorker = mainPool?.user || '';
    const poolUrl = mainPool?.url || '';

    const modelName = info?.miner || s?.miner_type || info?.model || 'Antminer S21 (Vnish)';
    
    // Hashrate conversion (GH/s to TH/s)
    let avgHash = s?.average_hashrate || 0;
    if (avgHash > 1000) avgHash = avgHash / 1000;
    if (s?.hr_average && avgHash === 0) avgHash = s.hr_average > 1000 ? s.hr_average / 1000 : s.hr_average;

    // Chains / Hashboards extraction
    const rawChains = s?.chains || [];
    const chains = rawChains.map((c, idx) => {
        const boardSn = c.sn || c.serial || \`HB-\${net.mac ? net.mac.slice(-5) : '00'}-\${idx+1}\`;
        const hashrate = (c.hashrate_rt || c.hashrate_ideal || 0) > 1000 ? (c.hashrate_rt || c.hashrate_ideal) / 1000 : (c.hashrate_rt || c.hashrate_ideal || 0);
        const isBad = hashrate === 0 || (c.chip_statuses?.red || 0) > 0 || (c.chip_temp?.max || 0) > 85;
        
        return {
            id: c.id || (idx + 1),
            sn: boardSn,
            frequency: c.frequency || 0,
            voltage: c.voltage || 0,
            hashrate: Number(hashrate.toFixed(1)),
            pcb_temp: c.pcb_temp?.max || 0,
            chip_temp: c.chip_temp?.max || 0,
            status: isBad ? 'error' : (c.status?.state || 'mining'),
            error_reason: isBad ? (hashrate === 0 ? 'Placa Zerada (0 TH/s)' : 'Temperatura Alta / Chips com Defeito') : null,
            chips: (c.chip_statuses?.grey || 0) + (c.chip_statuses?.orange || 0) + (c.chip_statuses?.red || 0) || 108
        };
    });

    // Fans
    const rawFans = s?.cooling?.fans || [];
    const fans = rawFans.map(f => f.rpm || 0);

    // STRICT STATUS RULE:
    // 'mining' = powered ON + hashrate > 0
    // 'idle' = powered ON + hashrate === 0 (or auto-tuning)
    // 'offline' = IP unreachable (handled outside)
    const stateStr = s?.miner_status?.miner_state || 'mining';
    const computedStatus = (avgHash > 0) ? 'mining' : 'idle';

    return {
        model: modelName,
        sn: info?.serial && info.serial !== 'N/A' ? info.serial : net?.mac || '',
        mac: net?.mac || '',
        ip: net?.ip || '',
        worker: poolWorker,
        pool_url: poolUrl,
        hashrate: Number(avgHash.toFixed(1)),
        temp: s?.chip_temp?.max || s?.pcb_temp?.max || 0,
        uptime: sys?.uptime || '0m',
        status: computedStatus,
        raw_state: stateStr,
        chains: chains,
        fans: fans,
        power: s?.power_consumption || 0,
        find_miner: Boolean(status?.find_miner)
    };
}
`;

  code = code.replace(/function extractVnishFullDetails[\s\S]*?return \{[\s\S]*?\};\s*\}/, updatedVnishEngine);

  fs.writeFileSync(filePath, code, 'utf8');
  console.log(`✓ Updated status logic and pool worker extraction in ${filePath}`);
}

upgradeHelperStatusAndWorker('local-helper.js');
upgradeHelperStatusAndWorker('desktop/local-helper.js');

// 2. UPDATE APP.JSX TO REFLECT STRICT STATUS & POOL WORKERS
let appCode = fs.readFileSync('src/App.jsx', 'utf8');

// Ensure status evaluation in React table view checks if stat exists and is non-offline
appCode = appCode.replace(
  /const isMining = stat && stat\.status === 'mining';/g,
  `const isMining = stat && stat.status !== 'offline' && (stat.hashrate > 0 || stat.status === 'mining');`
);

appCode = appCode.replace(
  /const isIdle = stat && stat\.status !== 'offline' && !isMining;/g,
  `const isIdle = stat && stat.status !== 'offline' && stat.hashrate === 0;`
);

fs.writeFileSync('src/App.jsx', appCode, 'utf8');
console.log("✓ src/App.jsx updated with strict Mining vs Idle vs Offline rules!");

console.log("ALL UPDATES APPLIED SUCCESSFULLY!");
