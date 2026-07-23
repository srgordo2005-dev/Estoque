const fs = require('fs');
let lines = fs.readFileSync('src/App.jsx', 'utf8').split('\n');

const replacement = [
  '                                  );',
  '                               })',
  '                               }',
  '                            </div>',
  '                         );',
  '                      })}',
  '                   </div>',
  '                )',
  '            )}',
  '     </div>;'
];

lines.splice(3488, 10, ...replacement);
fs.writeFileSync('src/App.jsx', lines.join('\n'), 'utf8');
console.log("REPLACED ALL CLOSING BRACKETS IN DATACENTER PAGE!");
