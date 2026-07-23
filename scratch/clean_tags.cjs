const fs = require('fs');
let lines = fs.readFileSync('src/App.jsx', 'utf8').split('\n');

const idx = lines.findIndex(l => l.includes('})()}'));
if (idx !== -1) {
  // Remove lines idx+1, idx+2, idx+3
  lines.splice(idx + 1, 3);
  fs.writeFileSync('src/App.jsx', lines.join('\n'), 'utf8');
  console.log("REMOVED LEFTOVER CLOSING TAGS");
}
