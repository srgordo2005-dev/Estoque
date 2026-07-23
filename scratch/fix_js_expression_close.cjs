const fs = require('fs');
let lines = fs.readFileSync('src/App.jsx', 'utf8').split('\n');

lines[3489] = '                               })';
lines[3490] = '                               }';
lines[3491] = '                            </div>';
lines[3492] = '                         )';
lines[3493] = '                      )';

fs.writeFileSync('src/App.jsx', lines.join('\n'), 'utf8');
console.log("FIXED JS EXPRESSION CLOSE IN APP.JSX!");
