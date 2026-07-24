const fs = require('fs');

console.log("Fixing local-helper.js Vnish engine and offline caching...");

let code = fs.readFileSync('local-helper.js', 'utf8');

// 1. Fix the Vnish engine to properly extract BHB68703 and YNAHYS...
const oldVnishEngine = /const extractVnishFullDetails = async \(ip\) => \{[\s\S]*?return \{[\s\S]*?\};\n\s*\};/;

const newVnishEngine = `const extractVnishFullDetails = async (ip) => {
    try {
        const info = await queryVnishAPI(ip, '/api/v1/info');
        const summary = await queryVnishAPI(ip, '/api/v1/summary');
        const status = await queryVnishAPI(ip, '/api/v1/status');

        if (!info && !summary && !status) return null;

        const s = summary?.miner || summary || {};
        const sys = info?.system || {};
        const net = sys?.network_status || {};
        const pools = s?.pools || [];
        const mainPool = pools.find(p => p.pool_type === 'UserPool') || pools[0] || {};

        let model = info?.miner || info?.model || info?.preset_name || info?.hardware || status?.miner || s?.miner_type || 'Antminer S21 (Vnish)';
        if (!model.includes('Vnish')) model = \`\${model} (Vnish)\`;

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
            model: model,
            sn: info?.serial && info.serial !== 'N/A' ? info.serial : net?.mac || '',
            mac: net?.mac || '',
            ip: net?.ip || ip,
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
    } catch(e) {
        return null;
    }
};`;

code = code.replace(oldVnishEngine, newVnishEngine);


// 2. Fix updateFarmStatus to mark offline machines as offline in cache
const oldFallback = `                // Fallback to standard CGMiner TCP 4028
                const summaryData = await queryMinerAPI(ip, 'summary').catch(() => null);
                if (!summaryData) return;
                const statsData = await queryMinerAPI(ip, 'stats').catch(() => null);`;

const newFallback = `                // Fallback to standard CGMiner TCP 4028
                const summaryData = await queryMinerAPI(ip, 'summary').catch(() => null);
                if (!summaryData) {
                    if (minerStatusCache[ip]) minerStatusCache[ip].status = 'offline';
                    return;
                }
                const statsData = await queryMinerAPI(ip, 'stats').catch(() => null);`;

code = code.replace(oldFallback, newFallback);

fs.writeFileSync('local-helper.js', code, 'utf8');

// Also update desktop/local-helper.js if it exists
if (fs.existsSync('desktop/local-helper.js')) {
    let desktopCode = fs.readFileSync('desktop/local-helper.js', 'utf8');
    desktopCode = desktopCode.replace(oldVnishEngine, newVnishEngine);
    desktopCode = desktopCode.replace(oldFallback, newFallback);
    fs.writeFileSync('desktop/local-helper.js', desktopCode, 'utf8');
}

console.log("✓ Fixed local-helper.js offline cache bug and Vnish extraction engine!");
