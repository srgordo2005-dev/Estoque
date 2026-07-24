const fs = require('fs');

console.log("Applying Smart Exact Model Inference across local-helper and App.jsx...");

// 1. UPDATE LOCAL-HELPER.JS & DESKTOP/LOCAL-HELPER.JS
function upgradeHelpersSmartModel(filePath) {
  if (!fs.existsSync(filePath)) return;
  let code = fs.readFileSync(filePath, 'utf8');

  const smartDetectFunc = `function detectMinerDetails(stat = {}, summary = {}, version = {}, vnishInfo = null) {
    let hashrate = 0;
    const sum = summary?.SUMMARY?.[0] || summary || {};
    if (sum['MHS av']) hashrate = sum['MHS av'] / 1000000;
    if (sum['GHS av']) hashrate = sum['GHS av'] / 1000;
    if (sum['THS av']) hashrate = sum['THS av'];
    if (summary?.hashrate) hashrate = summary.hashrate > 1000 ? summary.hashrate / 1000000 : summary.hashrate;

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

    let model = '';
    if (rawModel) {
        const lower = rawModel.toLowerCase();
        if (lower.includes('s19j pro') || lower.includes('s19jpro')) model = 'Antminer S19j Pro';
        else if (lower.includes('s19 pro+') || lower.includes('s19pro+')) model = 'Antminer S19 Pro+';
        else if (lower.includes('s19 pro') || lower.includes('s19pro')) model = 'Antminer S19 Pro';
        else if (lower.includes('s19 xp') || lower.includes('s19xp')) model = 'Antminer S19 XP';
        else if (lower.includes('s19k pro')) model = 'Antminer S19k Pro';
        else if (lower.includes('s19a pro')) model = 'Antminer S19a Pro';
        else if (lower.includes('s19a')) model = 'Antminer S19a';
        else if (lower.includes('s19i')) model = 'Antminer S19i';
        else if (lower.includes('s21')) model = 'Antminer S21';
        else if (lower.includes('t21')) model = 'Antminer T21';
        else if (lower.includes('t19')) model = 'Antminer T19';
        else if (lower.includes('m30s+')) model = 'Whatsminer M30S+';
        else if (lower.includes('m30s')) model = 'Whatsminer M30S';
        else if (lower.includes('m31s')) model = 'Whatsminer M31S';
        else if (lower.includes('m50')) model = 'Whatsminer M50';
        else if (lower.includes('whatsminer')) model = 'Whatsminer M30S';
    }

    if (!model) {
        if (hashrate > 190) model = 'Antminer S19 XP';
        else if (hashrate > 140) model = 'Antminer S19 Pro+';
        else if (hashrate > 105) model = 'Antminer S19 Pro';
        else if (hashrate > 88) model = 'Antminer S19j Pro';
        else if (hashrate > 70) model = 'Antminer S19';
        else model = rawModel && rawModel.length > 2 ? rawModel : 'Antminer S19';
    }

    let sn = stat.Miner_SN || stat.miner_sn || stat.SN || stat.mac || version?.VERSION?.[0]?.SN || '';
    return { model, sn };
}`;

  const oldDetectRegex = /function detectMinerDetails\([\s\S]*?return \{ model, sn \};\s*\}/;
  code = code.replace(oldDetectRegex, smartDetectFunc);

  fs.writeFileSync(filePath, code, 'utf8');
  console.log(`✓ Smart model detection injected in ${filePath}`);
}

upgradeHelpersSmartModel('local-helper.js');
upgradeHelpersSmartModel('desktop/local-helper.js');

// 2. UPDATE APP.JSX
let appCode = fs.readFileSync('src/App.jsx', 'utf8');

// Update cleanModelName in App.jsx to include smart hashrate inference
const newCleanModelFunc = `
function cleanModelName(val, fallbackModel = "Antminer S19", hashrate = 0) {
    if (val && typeof val === 'string') {
        let str = val.trim();
        if (!/^cgminer/i.test(str) && !/^bmminer/i.test(str)) {
            str = str.replace(/cgminer[\s\d\.]*/gi, '').replace(/bmminer[\s\d\.]*/gi, '').trim();
            if (str && str.length > 2 && str !== 'Antminer S19') return str;
        }
    }
    if (hashrate > 190) return 'Antminer S19 XP';
    if (hashrate > 140) return 'Antminer S19 Pro+';
    if (hashrate > 105) return 'Antminer S19 Pro';
    if (hashrate > 88) return 'Antminer S19j Pro';
    if (hashrate > 70) return 'Antminer S19';
    return fallbackModel && !/^cgminer/i.test(fallbackModel) ? fallbackModel : "Antminer S19";
}
`;

appCode = appCode.replace(/function cleanModelName[\s\S]*?\n\}/, newCleanModelFunc);

// Update model rendering call in Table view
appCode = appCode.replace(
  /<td style=\{\{padding:8, fontWeight:800, color:C\.accent\}\}>\{cleanModelName\(stat\?\.model, cleanModelName\(m\.model, "Antminer S19"\)\)\}<\/td>/g,
  `<td style={{padding:8, fontWeight:800, color:C.accent}}>{cleanModelName(stat?.model || m.model, "Antminer S19", stat?.hashrate || 0)}</td>`
);

fs.writeFileSync('src/App.jsx', appCode, 'utf8');
console.log("✓ src/App.jsx updated with Smart Model Inference!");

console.log("SMART EXACT MODEL DETECTION APPLIED SUCCESSFULLY!");
