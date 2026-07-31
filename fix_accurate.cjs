const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// A literal backslash followed by backtick in JS string is represented as "\\`"
// We split by "\\`" and join with "`"
code = code.split("\\`").join("`");
code = code.split("\\$").join("$");

fs.writeFileSync('src/App.jsx', code);
console.log('Fixed accurately!');
