const fs = require('fs');

console.log("Fixing duplicate formatUptime in src/App.jsx...");

let appCode = fs.readFileSync('src/App.jsx', 'utf8');

// Replace duplicate const formatUptime = (secs) => { ... } with unified function
const oldUptimeConstRegex = /const formatUptime = \(secs\) => \{[\s\S]*?return \`\${m}m\`;\s*\};/;
appCode = appCode.replace(oldUptimeConstRegex, '');

fs.writeFileSync('src/App.jsx', appCode, 'utf8');
console.log("✓ Removed duplicate formatUptime const in src/App.jsx!");
