const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// The syntax error is around:
//             })
//          )}
//      </div>;
//  const[mode,setMode]=useState(initialMode);
// This is because the outer activeFarm === "ALL" ? () : () is not closed properly.
// The structure in App.jsx was:
// {activeFarm === "ALL" ? (
//    Lobby
// ) : (
//    Farm
//    ...
//    {displayedFarms.map(... {
//        return ( ... )
//    })}
// )}
// </div>;

const badBlock = `                            </div>
                         )
                      )}
                   </div>
                );
             })
          )}
      </div>;
  const[mode,setMode]=useState(initialMode);`;

const goodBlock = `                            </div>
                         )
                      )}
                   </div>
                );
             })
          )}
        )}
      </div>;
}

function AddMachineModalWrapper({ctx, initialMode="single", onClose}) {
  const[mode,setMode]=useState(initialMode);`;

code = code.replace(badBlock, goodBlock);

fs.writeFileSync('src/App.jsx', code, 'utf8');
console.log("FIXED TERNARY ENDING!");
