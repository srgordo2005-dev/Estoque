const fs = require('fs');
let lines = fs.readFileSync('src/App.jsx', 'utf8').split('\n');

lines.splice(3496, 1);
fs.writeFileSync('src/App.jsx', lines.join('\n'), 'utf8');
console.log("REMOVED EXTRA CLOSING BRACKET!");
