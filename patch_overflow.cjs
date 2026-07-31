const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');
const target = 'return<div style={{background:C.bg,minHeight:"100vh",fontFamily:"\'Inter\',system-ui,sans-serif",color:C.text,maxWidth:1240,margin:"0 auto",position:"relative",overflowX:"hidden"}}>';
const replacement = 'return<div style={{background:C.bg,minHeight:"100vh",fontFamily:"\'Inter\',system-ui,sans-serif",color:C.text,maxWidth:1240,margin:"0 auto",position:"relative"}}>';

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/App.jsx', code);
    console.log("Patched App.jsx successfully!");
} else {
    console.log("Target string not found.");
}
