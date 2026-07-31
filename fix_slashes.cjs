const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');
code = code.split('\\\\`').join('`');
code = code.split('\\\\$').join('$');
fs.writeFileSync('src/App.jsx', code);
console.log('Fixed backslashes');
