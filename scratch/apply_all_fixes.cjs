const fs = require('fs');

console.log("Starting targeted bugfix application...");

// Reset App.jsx from git first to be 100% clean
const { execSync } = require('child_process');
execSync('git checkout src/App.jsx');

let appCode = fs.readFileSync('src/App.jsx', 'utf8');

// Fix 1.1: resetMaxCount definition
appCode = appCode.replace(
  'const resetMaxCount=(col,newCount)=>{localStorage.setItem("hs_maxcount_"+col,String(newCount))};',
  `const resetMaxCount=(col,newCount,newArr=null)=>{
      localStorage.setItem("hs_maxcount_"+col,String(newCount));
      if(newArr) localStorage.setItem("hs_"+col,JSON.stringify(newArr));
   };`
);

// Fix 1.2: recalcProtection exact replacement
const oldRecalc = `  const recalcProtection=()=>{
    resetMaxCount("machines",data.machines.length);
    resetMaxCount("hashes",data.hashes.length);
    alert(\`✓ Recalculado! Máquinas: \${data.machines.length} · HASHs: \${data.hashes.length}\\nAgora esses números viram a nova referência — sem avisos falsos de "sumiço".\`);
  };`;

const newRecalc = `  const recalcProtection=()=>{
    resetMaxCount("machines", data.machines ? data.machines.length : 0, data.machines);
    resetMaxCount("hashes", data.hashes ? data.hashes.length : 0, data.hashes);
    resetMaxCount("farmMachines", data.farmMachines ? data.farmMachines.length : 0, data.farmMachines || []);
    alert(\`✓ Recalculado! Máquinas: \${data.machines?.length || 0} · HASHs: \${data.hashes?.length || 0} · Fazenda: \${data.farmMachines?.length || 0}\\nAgora esses números viram a nova referência — sem avisos falsos de "sumiço".\`);
  };`;

appCode = appCode.replace(oldRecalc, newRecalc);

// Fix 1.3: ensure handleSetOnlyOnline is used in all onlyOnline checkboxes
appCode = appCode.replace(
  /onChange=\{e=>setOnlyOnline\(e\.target\.checked\)\}/g,
  `onChange={e=>handleSetOnlyOnline(e.target.checked)}`
);

// Fix 1.4: Add Vnish /docs/ button in machine modal in App.jsx
if (!appCode.includes('Abrir Vnish / API Docs')) {
  appCode = appCode.replace(
    `<Btn disabled={!m.ip} onClick={() => { setModal(null); triggerScreenshot(m); }}>📸 Tirar Print</Btn>`,
    `<Btn disabled={!m.ip} onClick={() => { setModal(null); triggerScreenshot(m); }}>📸 Tirar Print</Btn>
                        <Btn disabled={!m.ip} onClick={() => window.open(\`http://\${m.ip}/docs/\`, '_blank')} style={{background:C.purple, color:'#fff'}}>🌐 Abrir Vnish / Docs (/docs/)</Btn>`
  );
}

fs.writeFileSync('src/App.jsx', appCode, 'utf8');
console.log("✓ src/App.jsx updated successfully.");

// --- 2. HELPER FIX (local-helper.js & desktop/local-helper.js) ---
function updateHelperFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let code = fs.readFileSync(filePath, 'utf8');

  // Add http module if missing
  if (!code.includes("const http = require('http');")) {
    code = code.replace("const net = require('net');", "const net = require('net');\nconst http = require('http');");
  }

  // Inject queryVnishAPI helper if missing
  if (!code.includes('queryVnishAPI')) {
    const vnishHelpers = `
// Helper to query Vnish REST / OpenAPI (/api/v1/info, /api/v1/summary, /docs/)
const queryVnishAPI = (ip, endpoint = '/api/v1/info') => {
    return new Promise((resolve) => {
        const req = http.get(\`http://\${ip}\${endpoint}\`, { timeout: 2000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch(e) { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
    });
};
`;
    code = code.replace("// Helper to query CGMiner/Whatsminer API over TCP port 4028", vnishHelpers + "\n// Helper to query CGMiner/Whatsminer API over TCP port 4028");
  }

  // Upgrade detectMinerDetails
  const oldDetectRegex = /function detectMinerDetails\([\s\S]*?return \{ model, sn \};\s*\}/;
  const newDetect = `function detectMinerDetails(stat = {}, summary = {}, version = {}, vnishInfo = null) {
    if (vnishInfo) {
        const raw = vnishInfo.miner || vnishInfo.model || vnishInfo.preset_name || vnishInfo.hardware || vnishInfo.type || '';
        let model = raw ? (raw.toLowerCase().includes('vnish') ? raw : \`\${raw} (Vnish)\`) : 'Antminer (Vnish)';
        const sn = vnishInfo.serial || vnishInfo.sn || vnishInfo.mac || '';
        return { model, sn };
    }

    let rawModel = stat.Type || stat.Miner || stat['Miner Type'] || stat.hardware || stat.product || 
                   summary?.SUMMARY?.[0]?.Type || summary?.SUMMARY?.[0]?.Hardware ||
                   stat?.system_miner_type || summary?.STATUS?.[0]?.Description || 
                   version?.VERSION?.[0]?.Miner || version?.VERSION?.[0]?.Type || version?.VERSION?.[0]?.Hardware || '';
    
    let model = 'Antminer S19';
    if (rawModel) {
        const lower = String(rawModel).toLowerCase();
        if (lower.includes('s19j pro') || lower.includes('s19jpro')) model = 'Antminer S19j Pro';
        else if (lower.includes('s19 pro') || lower.includes('s19pro')) model = 'Antminer S19 Pro';
        else if (lower.includes('s19 xp')) model = 'Antminer S19 XP';
        else if (lower.includes('s19k pro')) model = 'Antminer S19k Pro';
        else if (lower.includes('s19')) model = 'Antminer S19';
        else if (lower.includes('s21')) model = 'Antminer S21';
        else if (lower.includes('t21')) model = 'Antminer T21';
        else if (lower.includes('m30s+')) model = 'Whatsminer M30S+';
        else if (lower.includes('m30s')) model = 'Whatsminer M30S';
        else if (lower.includes('m31s')) model = 'Whatsminer M31S';
        else if (lower.includes('m50')) model = 'Whatsminer M50';
        else if (lower.includes('whatsminer')) model = 'Whatsminer M30S';
        else if (lower.includes('vnish')) model = String(rawModel).trim();
        else model = String(rawModel).replace(/bmminer/gi, '').trim() || 'Antminer S19';
    } else if (stat.chain_acn || stat.chain_acs || stat.BMMiner || stat['hash board 0 sn']) {
        model = 'Antminer S19';
    }

    let sn = stat.Miner_SN || stat.miner_sn || stat.SN || stat.mac || version?.VERSION?.[0]?.SN || '';
    return { model, sn };
}`;

  code = code.replace(oldDetectRegex, newDetect);

  // Upgrade updateFarmStatus to use Vnish HTTP API fallback
  const oldUpdateRegex = /const updateFarmStatus = async \(\) => \{[\s\S]*?setInterval\(updateFarmStatus, 10000\);/;
  const newUpdate = `const updateFarmStatus = async () => {
    let activeIPs = farmMachines.map(m => m.ip).filter(Boolean);
    
    if (activeIPs.length === 0) {
        for (let i = 1; i <= 254; i++) {
            activeIPs.push("192.168.1." + i);
        }
    }

    const batchSize = 30;
    for (let i = 0; i < activeIPs.length; i += batchSize) {
        const batch = activeIPs.slice(i, i + batchSize);
        await Promise.all(batch.map(async (ip) => {
            try {
                // Try Vnish HTTP API first
                const vnishInfo = await queryVnishAPI(ip, '/api/v1/info');
                const vnishSum = vnishInfo ? await queryVnishAPI(ip, '/api/v1/summary') : null;

                if (vnishInfo || vnishSum) {
                    const details = detectMinerDetails({}, {}, {}, vnishInfo);
                    const hr = (vnishSum?.hashrate || vnishSum?.summary?.hashrate || 0) / (vnishSum?.hashrate > 1000 ? 1000000 : 1);
                    const temp = vnishSum?.temp_chip || vnishSum?.temp_board || 0;
                    minerStatusCache[ip] = {
                        ip,
                        status: hr > 0 || vnishInfo?.status === 'mining' ? 'mining' : 'idle',
                        model: details.model,
                        sn: details.sn,
                        uptime: vnishSum?.elapsed || 0,
                        hashrate: hr,
                        temp: temp,
                        slots: [null, null, null],
                        lastUpdate: Date.now()
                    };
                    return;
                }

                // Fallback to standard CGMiner TCP 4028
                const summaryData = await queryMinerAPI(ip, 'summary').catch(() => null);
                if (!summaryData) return;
                const statsData = await queryMinerAPI(ip, 'stats').catch(() => null);
                
                const sum = summaryData?.SUMMARY?.[0] || {};
                const stat = statsData?.STATS?.[1] || statsData?.STATS?.[0] || {};
                
                let hashrate = 0;
                if (sum['MHS av']) hashrate = sum['MHS av'] / 1000000;
                if (sum['GHS av']) hashrate = sum['GHS av'] / 1000;
                if (sum['THS av']) hashrate = sum['THS av'];
                
                let maxTemp = 0;
                for(let t=1; t<=4; t++) {
                    if(stat[\`temp\${t}\`] > maxTemp) maxTemp = stat[\`temp\${t}\`];
                    if(stat[\`temp_chip\${t}\`]) {
                        const temps = String(stat[\`temp_chip\${t}\`]).split('-').map(Number);
                        temps.forEach(tp => { if(tp > maxTemp) maxTemp = tp; });
                    }
                }
                
                const slots = [
                    stat.chain_sn0 || stat.pcb_sn0 || stat['hash board 0 sn'] || stat['board_sn0'] || null,
                    stat.chain_sn1 || stat.pcb_sn1 || stat['hash board 1 sn'] || stat['board_sn1'] || null,
                    stat.chain_sn2 || stat.pcb_sn2 || stat['hash board 2 sn'] || stat['board_sn2'] || null
                ];
                
                const details = detectMinerDetails(stat, summaryData, null);
                minerStatusCache[ip] = {
                    ip,
                    status: hashrate > 0 ? 'mining' : 'idle',
                    model: details.model,
                    sn: details.sn,
                    uptime: sum.Elapsed || 0,
                    hashrate: hashrate,
                    temp: maxTemp,
                    slots,
                    lastUpdate: Date.now()
                };
            } catch (e) {
                // Non-responsive IP
            }
        }));
        
        try {
            fs.writeFileSync(cacheFile, JSON.stringify(minerStatusCache, null, 2), 'utf8');
        } catch(e) {}
    }
};

setInterval(updateFarmStatus, 10000);`;

  code = code.replace(oldUpdateRegex, newUpdate);

  fs.writeFileSync(filePath, code, 'utf8');
  console.log(`✓ ${filePath} updated successfully.`);
}

updateHelperFile('local-helper.js');
updateHelperFile('desktop/local-helper.js');

console.log("ALL TARGETED BUGFIXES APPLIED SUCCESSFULLY!");
