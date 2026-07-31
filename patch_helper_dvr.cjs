const fs = require('fs');
let code = fs.readFileSync('desktop/local-helper.js', 'utf8');

const target1 = `        if (!info && !summary && !status) return null;`;
const replace1 = `        if (!info && !summary && !status) return null;
        // Rigorous check to prevent DVRs/Smart Switches from being detected as Vnish
        const isVnish = (info?.miner || info?.model || info?.system || summary?.miner || status?.miner || summary?.miner_type);
        if (!isVnish) return null;`;

if (code.includes(target1)) {
    code = code.replace(target1, replace1);
    fs.writeFileSync('desktop/local-helper.js', code);
    console.log("Patched local-helper.js (DVR Filter)");
} else {
    console.log("Target 1 not found!");
}
