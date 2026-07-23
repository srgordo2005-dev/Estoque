const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

code = code.replace(
  /O servidor local enviará alertas de Superaquecimento \(>85°C\) e quedas para este canal\./g,
  `O servidor local enviará alertas de Superaquecimento (&gt;85°C) e quedas para este canal.`
);

fs.writeFileSync('src/App.jsx', code, 'utf8');
console.log("FIXED JSX SYNTAX ERROR!");
