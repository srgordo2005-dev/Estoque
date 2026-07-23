const fs = require('fs');
let lines = fs.readFileSync('src/App.jsx', 'utf8').split('\n');

// Line 3490: })
// Line 3491: </div>
lines[3489] = '                               })';
lines[3490] = '                              }';
lines[3491] = '                           </div>';

fs.writeFileSync('src/App.jsx', lines.join('\n'), 'utf8');
console.log("FIXED JSX JS EXPRESSION CLOSING IN APP.JSX!");
