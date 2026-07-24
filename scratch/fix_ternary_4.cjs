const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

const badBlock = `               })
            )}
        </div>;
    const[mode,setMode]=useState(initialMode);`;
    
const goodBlock = `               })
            )}
          </div>
        )}
    </div>;
}

function AddMachineModalWrapper({ctx, initialMode="single", onClose}) {
    const[mode,setMode]=useState(initialMode);`;

code = code.replace(badBlock, goodBlock);

fs.writeFileSync('src/App.jsx', code, 'utf8');
console.log("FIXED TERNARY ONCE AND FOR ALL!");
