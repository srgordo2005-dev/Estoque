const fs = require('fs');
let lines = fs.readFileSync('src/App.jsx', 'utf8').split('\n');

const startIdx = lines.findIndex((l, i) => i > 3375 && l.includes('(Clique para gerenciar IP e SN)</div>'));
console.log('Tooltip end idx:', startIdx);

if (startIdx !== -1) {
  const replacement = [
    `                                                                    <div style={{fontSize:9, color:C.subtle, marginTop:4}}>(Clique para gerenciar IP e SN)</div>`,
    `                                                                </div>`,
    `                                                            </div>`,
    `                                                        );`,
    `                                                      })}`,
    `                                                    </div>`,
    `                                                  </div>`,
    `                                                ))}`,
    `                                              </div>`,
    `                                            );`,
    `                                         })()}`,
    `                                    </div>`
  ];

  lines.splice(startIdx, 15, ...replacement);
  fs.writeFileSync('src/App.jsx', lines.join('\n'), 'utf8');
  console.log("FIXED CLOSING TAGS CLEANLY");
}
