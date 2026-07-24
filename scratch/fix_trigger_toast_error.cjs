const fs = require('fs');

console.log("Fixing triggerToast ReferenceError in App.jsx...");

let appCode = fs.readFileSync('src/App.jsx', 'utf8');

// Replace the line causing ReferenceError: triggerToast is not defined
appCode = appCode.replace(
  `<BenchConnectionPanel ctx={ctx} session={session} setMacInput={setMacInput} loadMachine={loadMachine} saveSession={saveSession} doSubmit={doSubmit} triggerToast={triggerToast} />`,
  `<BenchConnectionPanel ctx={ctx} session={session} setMacInput={setMacInput} loadMachine={loadMachine} saveSession={saveSession} doSubmit={doSubmit} triggerToast={(msg) => alert(msg)} />`
);

// Also check inside BenchConnectionPanel
appCode = appCode.replace(
  /const toastFn = triggerToast \|\| ctx\?\.triggerToast;/g,
  `const toastFn = triggerToast || ctx?.triggerToast || ((msg) => alert(msg));`
);

fs.writeFileSync('src/App.jsx', appCode, 'utf8');
console.log("✓ Fixed triggerToast ReferenceError in src/App.jsx!");
