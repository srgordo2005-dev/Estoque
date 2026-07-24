const fs = require('fs');

console.log("Applying deep study formatUptime and Vnish Model rendering to src/App.jsx...");

let appCode = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Upgrade formatUptime function in App.jsx
const newFormatUptimeFunc = `
function formatUptime(uptime) {
    if (!uptime && uptime !== 0) return '-';
    if (typeof uptime === 'string') {
        let str = uptime.trim();
        if (str.includes(':')) {
            const parts = str.split(':');
            if (parts.length === 2) {
                const h = parseInt(parts[0]) || 0;
                const m = parseInt(parts[1]) || 0;
                if (h === 0) return \`\${m}m\`;
                return \`\${h}h \${m}m\`;
            }
            if (parts.length === 3) {
                const d = parseInt(parts[0]) || 0;
                const h = parseInt(parts[1]) || 0;
                const m = parseInt(parts[2]) || 0;
                if (d === 0 && h === 0) return \`\${m}m\`;
                if (d === 0) return \`\${h}h \${m}m\`;
                return \`\${d}d \${h}h \${m}m\`;
            }
        }
        return str;
    }
    if (typeof uptime === 'number') {
        const sec = Math.floor(uptime);
        const hrs = Math.floor(sec / 3600);
        const mins = Math.floor((sec % 3600) / 60);
        const days = Math.floor(hrs / 24);
        const remHrs = hrs % 24;
        if (days > 0) return \`\${days}d \${remHrs}h \${mins}m\`;
        if (hrs > 0) return \`\${hrs}h \${mins}m\`;
        return \`\${mins}m\`;
    }
    return String(uptime);
}
`;

if (appCode.includes('function formatUptime')) {
    appCode = appCode.replace(/function formatUptime[\s\S]*?\n\}/, newFormatUptimeFunc);
} else {
    appCode = newFormatUptimeFunc + "\n" + appCode;
}

// 2. Update Model column rendering in Table view
appCode = appCode.replace(
  /<td style=\{\{padding:8, fontWeight:800, color:C\.accent\}\}>\{isOnline && stat\?\.model \? cleanModelName\(stat\.model\) : \(m\.model && m\.model !== 'Antminer S19' \? m\.model : \(isOnline \? 'Antminer S21' : '-'\)\)\}<\/td>/g,
  `<td style={{padding:8, fontWeight:800, color:C.accent}}>{isOnline ? (stat?.model ? cleanModelName(stat.model) : 'Antminer S21') : (m.model && m.model !== 'Antminer S19' ? m.model : '-')}</td>`
);

// 3. Update Uptime column rendering in Table view
appCode = appCode.replace(
  /<td style=\{\{padding:8, color:C\.subtle\}\}>\{stat\?\.uptime \? formatUptime\(stat\.uptime\) : '-'\\}<\/td>/g,
  `<td style={{padding:8, color:C.subtle}}>{isOnline && stat?.uptime ? formatUptime(stat.uptime) : '-'}</td>`
);

fs.writeFileSync('src/App.jsx', appCode, 'utf8');
console.log("✓ Updated formatUptime and Model/Uptime table rendering in src/App.jsx!");
