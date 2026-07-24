const fs = require('fs');

console.log("Removing unnecessary UI button and ensuring automatic Vnish data extraction...");

// 1. Remove the extra button from App.jsx
let appCode = fs.readFileSync('src/App.jsx', 'utf8');
appCode = appCode.replace(
  /\s*<Btn disabled=\{!m\.ip\} onClick=\{\(\) => window\.open\(`http:\/\/\${m\.ip}\/docs\/`, '_blank'\)\} style=\{\{background:C\.purple, color:'#fff'\}\}>🌐 Abrir Vnish \/ Docs \(\/docs\/\)<\/Btn>/g,
  ""
);
fs.writeFileSync('src/App.jsx', appCode, 'utf8');
console.log("✓ Removed manual Vnish button from UI in src/App.jsx.");

// 2. Enhance automatic Vnish data extraction in helpers
function upgradeHelperAutoExtract(filePath) {
  if (!fs.existsSync(filePath)) return;
  let code = fs.readFileSync(filePath, 'utf8');

  // Ensure queryVnishAPI checks multiple endpoints (/api/v1/info, /api/v1/summary, /api/v1/status)
  const newQueryVnish = `
// Automatic Vnish REST/OpenAPI Extractor (/api/v1/info, /api/v1/summary, /api/v1/status, /docs/)
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

const extractVnishFullDetails = async (ip) => {
    try {
        const info = await queryVnishAPI(ip, '/api/v1/info');
        const summary = await queryVnishAPI(ip, '/api/v1/summary');
        const status = await queryVnishAPI(ip, '/api/v1/status');

        if (!info && !summary && !status) return null;

        // Model extraction: e.g. "Antminer S19 Pro", "Antminer S21", "Antminer S19 XP"
        let model = info?.miner || info?.model || info?.preset_name || info?.hardware || status?.miner || '';
        if (model) {
            model = model.includes('Vnish') ? model : \`\${model} (Vnish)\`;
        } else {
            model = 'Antminer (Vnish)';
        }

        // Hashrate calculation (converting to TH/s)
        let hashrate = 0;
        if (summary?.hashrate) {
            hashrate = summary.hashrate > 1000 ? summary.hashrate / 1000000 : summary.hashrate;
        } else if (summary?.summary?.hashrate) {
            hashrate = summary.summary.hashrate > 1000 ? summary.summary.hashrate / 1000000 : summary.summary.hashrate;
        } else if (summary?.rate_5s) {
            hashrate = summary.rate_5s > 1000 ? summary.rate_5s / 1000000 : summary.rate_5s;
        }

        // Max temperature extraction (chip & board)
        let maxTemp = 0;
        if (summary?.temp_chip) maxTemp = Math.max(maxTemp, summary.temp_chip);
        if (summary?.temp_board) maxTemp = Math.max(maxTemp, summary.temp_board);
        if (Array.isArray(summary?.chains)) {
            summary.chains.forEach(c => {
                if (c.temp_chip) maxTemp = Math.max(maxTemp, c.temp_chip);
                if (c.temp_board) maxTemp = Math.max(maxTemp, c.temp_board);
            });
        }

        // Serial number extraction
        const sn = info?.serial || info?.sn || info?.mac || summary?.serial || '';

        // Hashboard slots extraction
        const slots = [null, null, null];
        if (Array.isArray(summary?.chains)) {
            summary.chains.forEach((c, idx) => {
                if (idx < 3) slots[idx] = c.sn || c.serial || \`Board #\${idx+1}\`;
            });
        }

        const isMining = hashrate > 0 || status?.status === 'mining' || info?.status === 'mining';

        return {
            ip,
            status: isMining ? 'mining' : 'idle',
            model,
            sn,
            uptime: summary?.elapsed || summary?.uptime || info?.uptime || 0,
            hashrate,
            temp: maxTemp,
            slots,
            lastUpdate: Date.now()
        };
    } catch(e) {
        return null;
    }
};`;

  const oldVnishHelperRegex = /\/\/ Helper to query Vnish REST[\s\S]*?const queryVnishAPI[\s\S]*?\n\};/;
  if (oldVnishHelperRegex.test(code)) {
    code = code.replace(oldVnishHelperRegex, newQueryVnish);
  }

  // Update updateFarmStatus to call extractVnishFullDetails
  code = code.replace(
    /const vnishInfo = await queryVnishAPI\(ip, '\/api\/v1\/info'\);[\s\S]*?return;\n\s*\}/g,
    `const vnishData = await extractVnishFullDetails(ip);
                if (vnishData) {
                    minerStatusCache[ip] = vnishData;
                    return;
                }`
  );

  fs.writeFileSync(filePath, code, 'utf8');
  console.log(`✓ Upgraded automatic Vnish extraction in ${filePath}.`);
}

upgradeHelperAutoExtract('local-helper.js');
upgradeHelperAutoExtract('desktop/local-helper.js');

console.log("DONE!");
