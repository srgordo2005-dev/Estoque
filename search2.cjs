const fs = require('fs');
const code = fs.readFileSync('src/App.jsx', 'utf8');
const lines = code.split('\n');

const ln = lines.findIndex(l => l.includes('className="app-layout-wrapper"'));
if (ln >= 0) {
    console.log(lines.slice(Math.max(0, ln - 5), ln + 5).join('\n'));
} else {
    console.log("Not found.");
}
