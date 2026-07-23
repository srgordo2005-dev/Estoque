const fs = require('fs');
let lines = fs.readFileSync('src/App.jsx', 'utf8').split('\n');

lines[3489] = '                                  );';
lines[3490] = '                               })';
lines[3491] = '                            </div>';
lines[3492] = '                         )';
lines[3493] = '                      )}';
lines[3494] = '                   </div>';
lines[3495] = '                );';
lines[3496] = '            })';
lines[3497] = '         )}';
lines[3498] = '     </div>;';

fs.writeFileSync('src/App.jsx', lines.join('\n'), 'utf8');
console.log("FORMATTED ALL CLOSING BRACKETS PROPERLY!");
