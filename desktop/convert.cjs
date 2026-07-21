const fs = require('fs');
const path = require('path');
let pngToIco = require('png-to-ico');

if (typeof pngToIco !== 'function' && pngToIco.default) {
    pngToIco = pngToIco.default;
}

const desktopDir = 'C:\\Users\\Felip\\.gemini\\antigravity\\scratch\\Estoque-main\\desktop';

pngToIco(path.join(desktopDir, 'icon.png'))
  .then(buf => {
    fs.writeFileSync(path.join(desktopDir, 'icon.ico'), buf);
    console.log("SUCCESS: Converted icon.png to icon.ico!");
  })
  .catch(err => {
    console.error("ERROR:", err);
  });
