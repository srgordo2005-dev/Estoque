const fs = require('fs');

let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Insert state
code = code.replace('function App(){\n  const[user,setUser]=usePersistedField("session-user",null);', 
                    'function App(){\n  const[mobileMenuHidden, setMobileMenuHidden] = useState(false);\n  const[user,setUser]=usePersistedField("session-user",null);');

// 2. Replace mobile-bottom-nav
const oldNav = `{/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="mobile-bottom-nav">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => changeTab(t.id)}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              padding: "8px 2px 10px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              color: tab === t.id ? C.accent : C.subtle,
              fontSize: 10,
              fontWeight: tab === t.id ? 800 : 400
            }}
          >
            <span style={{fontSize: 18}}>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>`;

const newNav = `{/* MOBILE BOTTOM NAVIGATION BAR */}
      {!mobileMenuHidden ? (
          <nav className="mobile-bottom-nav" style={{overflowX: 'auto', whiteSpace: 'nowrap', justifyContent: 'flex-start'}}>
            <button onClick={() => setMobileMenuHidden(true)} style={{padding: '0 20px', background: 'none', border: 'none', color: C.red, borderRight: \`1px solid \${C.border}\`, fontSize: 24}}>
              ⬇️
            </button>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => changeTab(t.id)}
                style={{
                  flex: '0 0 65px',
                  background: "none",
                  border: "none",
                  padding: "8px 2px 10px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  color: tab === t.id ? C.accent : C.subtle,
                  fontSize: 10,
                  fontWeight: tab === t.id ? 800 : 400
                }}
              >
                <span style={{fontSize: 18}}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
      ) : (
          <button 
            className="mobile-bottom-nav" 
            onClick={() => setMobileMenuHidden(false)} 
            style={{width: 50, height: 50, borderRadius: 25, bottom: 20, left: '50%', transform: 'translateX(-50%)', justifyContent:'center', border:\`1px solid \${C.border}\`, background: C.card}}
          >
            🍔
          </button>
      )}`;

if (code.includes('<nav className="mobile-bottom-nav">')) {
    code = code.replace(oldNav, newNav);
    fs.writeFileSync('src/App.jsx', code);
    console.log('Mobile menu patched successfully.');
} else {
    console.log('Could not find old nav structure.');
}
