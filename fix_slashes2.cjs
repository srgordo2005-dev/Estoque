const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// Replace \` with `
code = code.replace(/\\\\\`/g, '`');

// Replace \$ with $
code = code.replace(/\\\\\$/g, '$');

fs.writeFileSync('src/App.jsx', code);
console.log('Fixed backslashes');
