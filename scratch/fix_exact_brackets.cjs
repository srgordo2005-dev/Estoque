const fs = require('fs');
let lines = fs.readFileSync('src/App.jsx', 'utf8').split('\n');

// Replace lines around 3488-3496
lines[3489] = '                               })';
lines[3490] = '                             </div>';
lines[3491] = '                           )';
lines[3492] = '                        )';
lines[3493] = '                    </div>';

fs.writeFileSync('src/App.jsx', lines.join('\n'), 'utf8');
console.log("EXACT BRACKETS REPLACED IN APP.JSX!");
