const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

const badBlock = `                );
             })
          )}
        )}
      </div>;
}

function AddMachineModalWrapper({ctx, initialMode="single", onClose}) {`;

const goodBlock = `                );
             })
          )}
        </div>
      )}
    </div>
  );
}

function AddMachineModalWrapper({ctx, initialMode="single", onClose}) {`;

code = code.replace(badBlock, goodBlock);

fs.writeFileSync('src/App.jsx', code, 'utf8');
console.log("FIXED TERNARY ENDING FOR GOOD!");
