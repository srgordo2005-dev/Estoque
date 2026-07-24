const fs = require('fs');

console.log("Removing hashrate deduction and ensuring exact raw model from API / DB...");

// 1. HELPER FILES (local-helper.js & desktop/local-helper.js)
function removeDeductionFromHelpers(filePath) {
  if (!fs.existsSync(filePath)) return;
  let code = fs.readFileSync(filePath, 'utf8');

  const rawDetectFunc = `function detectMinerDetails(stat = {}, summary = {}, version = {}, vnishInfo = null) {
    if (vnishInfo) {
        let raw = vnishInfo.miner || vnishInfo.model || vnishInfo.preset_name || vnishInfo.hardware || vnishInfo.type || '';
        raw = String(raw).replace(/cgminer[\s\d\.]*/gi, '').replace(/bmminer[\s\d\.]*/gi, '').trim();
        if (raw && !raw.toLowerCase().includes('cgminer')) {
            return { model: raw.toLowerCase().includes('vnish') ? raw : \`\${raw} (Vnish)\`, sn: vnishInfo.serial || vnishInfo.sn || vnishInfo.mac || '' };
        }
    }

    let rawModel = stat.hardware || stat.product || stat.system_miner_type || 
                   version?.VERSION?.[0]?.Type || version?.VERSION?.[0]?.Hardware ||
                   stat.Type || stat.Miner || summary?.STATUS?.[0]?.Description || '';
    
    rawModel = String(rawModel).replace(/cgminer[\s\d\.]*/gi, '').replace(/bmminer[\s\d\.]*/gi, '').trim();

    let model = rawModel && rawModel.length > 1 ? rawModel : '';
    let sn = stat.Miner_SN || stat.miner_sn || stat.SN || stat.mac || version?.VERSION?.[0]?.SN || '';
    return { model, sn };
}`;

  const oldDetectRegex = /function detectMinerDetails\([\s\S]*?return \{ model, sn \};\s*\}/;
  code = code.replace(oldDetectRegex, rawDetectFunc);

  fs.writeFileSync(filePath, code, 'utf8');
  console.log(`✓ Removed deduction from ${filePath}`);
}

removeDeductionFromHelpers('local-helper.js');
removeDeductionFromHelpers('desktop/local-helper.js');

// 2. UPDATE APP.JSX
let appCode = fs.readFileSync('src/App.jsx', 'utf8');

// Replace cleanModelName to strictly use raw model without hashrate guessing
const rawCleanModelFunc = `
function cleanModelName(val, fallbackModel = "Antminer S19") {
    if (val && typeof val === 'string') {
        let str = val.trim();
        if (!/^cgminer/i.test(str) && !/^bmminer/i.test(str)) {
            str = str.replace(/cgminer[\s\d\.]*/gi, '').replace(/bmminer[\s\d\.]*/gi, '').trim();
            if (str && str.length > 1) return str;
        }
    }
    return fallbackModel && !/^cgminer/i.test(fallbackModel) ? fallbackModel : "Antminer S19";
}
`;

appCode = appCode.replace(/function cleanModelName[\s\S]*?\n\}/, rawCleanModelFunc);

// Update table model rendering to use stat.model || m.model
appCode = appCode.replace(
  /<td style=\{\{padding:8, fontWeight:800, color:C\.accent\}\}>\{cleanModelName\(stat\?\.model \|\| m\.model, "Antminer S19", stat\?\.hashrate \|\| 0\)\}<\/td>/g,
  `<td style={{padding:8, fontWeight:800, color:C.accent}}>{cleanModelName(stat?.model || m.model, m.model || "Antminer S19")}</td>`
);

fs.writeFileSync('src/App.jsx', appCode, 'utf8');
console.log("✓ src/App.jsx updated with Raw Exact Model display (no deduction).");

console.log("REMOVED DEDUCTION SUCCESSFULLY!");
