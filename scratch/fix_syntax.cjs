const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

const regexToFix = /\}\)\s*\}\s*<\/div>;\s*function CfgPage/g;
// actually let's just find "function CfgPage" and fix the 50 lines before it.
const lines = code.split('\\n');
const cfgIndex = lines.findIndex(l => l.includes('function CfgPage'));

// We need the end of DataCenterPage to be:
//           })
//        )}
//    </div>;
// }

let newCode = code.replace(
    /(\n\s*\}\)\n\s*\}\n\s*<\/div>;\n\s*)const\[mode,setMode\]=useState\(initialMode\);/g,
    `\n           })\n        )}\n    </div>;\n}\n\nfunction CfgPage({ctx}) {\n    const[mode,setMode]=useState(initialMode);`
);

// If the regex above fails because CfgPage is somehow mixed, let's just do a manual string replacement
const badStr = `        </div>;
    const[mode,setMode]=useState(initialMode);`;
    
const goodStr = `        )}
    </div>;
}

function CfgPage({ctx, initialMode="single"}) {
    const[mode,setMode]=useState(initialMode);`;

newCode = code.replace(badStr, goodStr);

// Also replace the other bad signature
const badStr2 = `        </div>;
const[mode,setMode]=useState(initialMode);`;
newCode = newCode.replace(badStr2, goodStr);

fs.writeFileSync('src/App.jsx', newCode, 'utf8');
console.log("FIXED SYNTAX ERROR!");
