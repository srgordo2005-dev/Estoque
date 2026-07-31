const fs = require('fs');

let themeCss = fs.readFileSync('src/theme.css', 'utf8');
let appJsx = fs.readFileSync('src/App.jsx', 'utf8');

console.log("Modifying Global Theme Colors...");

appJsx = appJsx.replace(
    /const DARK_THEME=\{bg:"#080e17",card:"#0f1923",card2:"#1a2d42",border:"#1a2d42",accent:"#f97316",blue:"#0ea5e9",green:"#16a34a",red:"#dc2626",purple:"#7c3aed",amber:"#d97706",text:"#e2e8f0",muted:"#64748b",subtle:"#94a3b8"\};/,
    'const DARK_THEME={bg:"transparent",card:"rgba(10, 14, 23, 0.65)",card2:"rgba(20, 30, 45, 0.7)",border:"rgba(191, 149, 63, 0.3)",accent:"#bf953f",blue:"#38bdf8",green:"#4ade80",red:"#f87171",purple:"#c084fc",amber:"#fcf6ba",text:"#ffffff",muted:"#8e9eab",subtle:"#d1d1d6"};'
);

console.log("Modifying Buttons and Inputs...");

const btnOld = `const Btn=({v="p",children,style,...p})=>{
  const colors={
    p:{bg:C.accent,text:"#fff"},
    s:{bg:"transparent",text:C.text,border:\`1px solid \${C.border}\`},
    g:{bg:C.green,text:"#fff"},
    d:{bg:C.red,text:"#fff"}
  };
  const c=colors[v]||colors.p;
  return(
    <button style={{
      background:c.bg,color:c.text,border:c.border||"none",
      padding:"10px 16px",borderRadius:8,fontWeight:"bold",fontSize:14,
      cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,
      opacity:p.disabled?0.5:1,
      ...style
    }} {...p}>
      {children}
    </button>
  )
};`;

const btnNew = `const Btn=({v="p",children,style,...p})=>{
  const colors={
    p:{bg:"linear-gradient(135deg, #bf953f, #aa771c)", text:"#000", border:"none", shadow:"0 4px 15px rgba(191,149,63,0.4)"},
    s:{bg:"rgba(255,255,255,0.05)", text:C.text, border:\`1px solid rgba(255,255,255,0.1)\`, shadow:"none"},
    g:{bg:"linear-gradient(135deg, #22c55e, #16a34a)", text:"#fff", border:"none", shadow:"0 4px 15px rgba(34,197,94,0.4)"},
    d:{bg:"linear-gradient(135deg, #ef4444, #dc2626)", text:"#fff", border:"none", shadow:"0 4px 15px rgba(239,68,68,0.4)"}
  };
  const c=colors[v]||colors.p;
  return(
    <button className="premium-btn" style={{
      background:c.bg, color:c.text, border:c.border, boxShadow:c.shadow,
      padding:"10px 16px", borderRadius:10, fontWeight:900, fontSize:14,
      cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6,
      opacity:p.disabled?0.5:1, textTransform:"uppercase", letterSpacing:1,
      transition: "all 0.3s ease",
      ...style
    }} {...p}>
      {children}
    </button>
  )
};`;

appJsx = appJsx.replace(btnOld, btnNew);

appJsx = appJsx.replace(
    /const inp=\{width:"100%",background:C\.bg,border:`1px solid \$\{C\.border\}`[\s\S]*?outline:"none",colorScheme:"dark"\};/,
    'const inp={width:"100%",background:"rgba(0,0,0,0.4)",border:`1px solid ${C.border}`,color:C.text,borderRadius:10,padding:"12px 14px",fontSize:14,boxSizing:"border-box",outline:"none",colorScheme:"dark",backdropFilter:"blur(5px)",transition:"all 0.3s",boxShadow:"inset 0 2px 4px rgba(0,0,0,0.5)"};'
);

fs.writeFileSync('src/App.jsx', appJsx);
console.log("App.jsx patched.");

// Replace global CSS safely using string concatenation to avoid template literal issues in generation
const newCss = "body {\\n" +
"  margin: 0;\\n" +
"  font-family: 'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;\\n" +
"  background-color: #05070a;\\n" +
"  background-image: \\n" +
"    radial-gradient(ellipse at top right, rgba(191,149,63,0.15) 0%, transparent 50%),\\n" +
"    radial-gradient(ellipse at bottom left, rgba(209,209,214,0.1) 0%, transparent 50%),\\n" +
"    url(\\\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.005' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.08'/%3E%3C/svg%3E\\\");\\n" +
"  background-attachment: fixed;\\n" +
"  color: #ffffff;\\n" +
"}\\n" +
"\\n" +
".premium-btn:hover {\\n" +
"  transform: translateY(-2px);\\n" +
"  filter: brightness(1.2);\\n" +
"}\\n" +
"\\n" +
".premium-btn:active {\\n" +
"  transform: translateY(0px);\\n" +
"}\\n";

themeCss = themeCss.replace(
  /body \{\s*margin: 0;\s*font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;\s*background-color: #080e17;\s*color: #e2e8f0;\s*\}/,
  newCss
);

fs.writeFileSync('src/theme.css', themeCss);
console.log("theme.css patched.");
