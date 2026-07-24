const fs = require('fs');

console.log("Removing line 2359 const formatUptime from src/App.jsx...");

const lines = fs.readFileSync('src/App.jsx', 'utf8').split('\n');
const filtered = [];
let skip = false;

for (let i = 0; i < lines.length; i++) {
    if (i >= 2355 && i <= 2370 && lines[i].includes('const formatUptime')) {
        skip = true;
    }
    if (skip && lines[i].includes('};')) {
        skip = false;
        continue;
    }
    if (!skip) {
        filtered.push(lines[i]);
    }
}

fs.writeFileSync('src/App.jsx', filtered.join('\n'), 'utf8');
console.log("✓ Removed duplicate formatUptime const cleanly!");
