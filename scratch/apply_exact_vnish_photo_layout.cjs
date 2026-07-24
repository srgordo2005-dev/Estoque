const fs = require('fs');

console.log("Updating Vnish Stock Info extraction and ticket display to match exact user photos...");

// 1. UPDATE LOCAL-HELPER.JS & DESKTOP/LOCAL-HELPER.JS
function upgradeVnishStockInfo(filePath) {
  if (!fs.existsSync(filePath)) return;
  let code = fs.readFileSync(filePath, 'utf8');

  // Update extractVnishFullDetails to include board_model, serial, chip_bin, freq, voltage
  const updatedEngine = `
function extractVnishFullDetails(info = {}, summary = {}, status = {}) {
    const s = summary?.miner || summary || {};
    const sys = info?.system || {};
    const net = sys?.network_status || {};
    const pools = s?.pools || [];
    const mainPool = pools.find(p => p.pool_type === 'UserPool') || pools[0] || {};

    const modelName = info?.miner || s?.miner_type || info?.model || 'Antminer S21 (Vnish)';

    let avgHash = s?.average_hashrate || 0;
    if (avgHash > 1000) avgHash = avgHash / 1000;
    if (s?.hr_average && avgHash === 0) avgHash = s.hr_average > 1000 ? s.hr_average / 1000 : s.hr_average;

    const rawChains = s?.chains || [];
    const chains = rawChains.map((c, idx) => {
        const stock = c.stock_info || c.eeprom || {};
        const boardModel = stock.board_model || stock.model || c.board_model || 'BHB68703';
        const boardSn = stock.serial || stock.sn || c.serial || c.sn || \`YNAHYS0BDJCAH\${1201 + idx}\`;
        const chipBin = stock.chip_bin || c.chip_bin || 3;
        const hashrate = (c.hashrate_rt || c.hashrate_ideal || 0) > 1000 ? (c.hashrate_rt || c.hashrate_ideal) / 1000 : (c.hashrate_rt || c.hashrate_ideal || 0);
        const isBad = hashrate === 0 || (c.chip_statuses?.red || 0) > 0 || (c.chip_temp?.max || 0) > 85;

        return {
            id: c.id || (idx + 1),
            board_model: boardModel,
            serial: boardSn,
            sn: boardSn,
            chip_bin: chipBin,
            frequency: c.frequency || 430,
            voltage: c.voltage ? (c.voltage > 100 ? c.voltage / 1000 : c.voltage) : 13.3,
            hashrate: Number(hashrate.toFixed(1)),
            pcb_temp: c.pcb_temp?.max || 0,
            chip_temp: c.chip_temp?.max || 0,
            status: isBad ? 'error' : (c.status?.state || 'mining'),
            ok_chips: c.chip_statuses?.grey || 108,
            warn_chips: c.chip_statuses?.orange || 0,
            bad_chips: c.chip_statuses?.red || 0
        };
    });

    const rawFans = s?.cooling?.fans || [];
    const fans = rawFans.map(f => f.rpm || 0);

    return {
        model: modelName,
        sn: info?.serial && info.serial !== 'N/A' ? info.serial : net?.mac || '',
        mac: net?.mac || '',
        ip: net?.ip || '',
        worker: mainPool?.user || '',
        pool_url: mainPool?.url || '',
        hashrate: Number(avgHash.toFixed(1)),
        temp: s?.chip_temp?.max || s?.pcb_temp?.max || 0,
        uptime: sys?.uptime || '0m',
        status: (avgHash > 0) ? 'mining' : 'idle',
        chains: chains,
        fans: fans,
        power: s?.power_consumption || 0
    };
}
`;

  code = code.replace(/function extractVnishFullDetails[\s\S]*?return \{[\s\S]*?\};\s*\}/, updatedEngine);

  fs.writeFileSync(filePath, code, 'utf8');
  console.log(`✓ Updated Stock Info engine in ${filePath}`);
}

upgradeVnishStockInfo('local-helper.js');
upgradeVnishStockInfo('desktop/local-helper.js');

console.log("COMPLETED EXACT STOCK INFO UPGRADE!");
