const fs = require('fs');
let lines = fs.readFileSync('src/App.jsx', 'utf8').split('\n');

const replacement = [
  '                                     </div>',
  '                                  );',
  '                               })}',
  '                            </div>',
  '                         )',
  '                      )}',
  '                   </div>',
  '                );',
  '             })',
  '          )}',
  '      </div>;'
];

lines.splice(3487, 12, ...replacement);
fs.writeFileSync('src/App.jsx', lines.join('\n'), 'utf8');
console.log("REPLACED BRACKETS IN CORRECT NESTING ORDER!");
