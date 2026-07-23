const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

if (code.includes('key={vaoIdx}')) {
  code = code.replace('key={vaoIdx}', 'key={realVaoNum}');
  fs.writeFileSync('src/App.jsx', code, 'utf8');
  console.log("REPLACED key={vaoIdx} WITH key={realVaoNum} SUCCESSFULLY!");
} else {
  console.log("key={vaoIdx} not found in App.jsx");
}
