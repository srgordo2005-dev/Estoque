const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

const badBlock = `                                     </div>
                                  );
                               })
                            )
                        )}`;

const goodBlock = `                                     </div>
                                  );
                               })
                              }
                           </div>
                        )}`;

if (code.includes(badBlock)) {
  code = code.replace(badBlock, goodBlock);
  fs.writeFileSync('src/App.jsx', code, 'utf8');
  console.log("FIXED PARENTHESES BRACKET MATCHING!");
} else {
  console.log("badBlock not found");
}
