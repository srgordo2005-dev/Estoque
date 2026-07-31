const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

code = code.replace('.app-sidebar { display: none !important; }', '.app-sidebar { display: none !important; } .premium-sidebar { display: none !important; }');

fs.writeFileSync('src/App.jsx', code);
console.log("Patched media query in App.jsx");
