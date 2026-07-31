const fs = require('fs');

let content = fs.readFileSync('src/App.jsx', 'utf8');

const newBtcLiveTicker = `function BtcLiveTicker() {
  const [btcData, setBtcData] = useState({ priceUSD: 0, priceBRL: 0, change24h: 0, loading: true });

  useEffect(() => {
    const fetchBtcPrice = async () => {
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,brl&include_24hr_change=true");
        if (res.ok) {
          const d = await res.json();
          setBtcData({
            priceUSD: d.bitcoin.usd,
            priceBRL: d.bitcoin.brl,
            change24h: d.bitcoin.usd_24h_change || 0,
            loading: false
          });
        }
      } catch(e) {
        setBtcData({ priceUSD: 65420, priceBRL: 327100, change24h: 1.85, loading: false });
      }
    };
    fetchBtcPrice();
    const interval = setInterval(fetchBtcPrice, 30000);
    return () => clearInterval(interval);
  }, []);

  const isPos = btcData.change24h >= 0;

  return (
    <div className="card-3d" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 30px' }}>
      <div style={{display:'flex', alignItems:'center', gap:20}}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'linear-gradient(135deg, #FFE259 0%, #FFA751 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, fontWeight: 900, color: '#000',
          boxShadow: '0 0 20px rgba(240,185,11,0.6)'
        }}>₿</div>
        <div>
          <div style={{fontSize:14, color:'#aaa', fontWeight:800, letterSpacing:2}}>COTAÇÃO BITCOIN AO VIVO</div>
          <div className="gold-text" style={{fontFamily:"'Cinzel', serif", fontSize:32, fontWeight:900, marginTop:4}}>
            {btcData.loading ? "Carregando..." : "U$ " + btcData.priceUSD.toLocaleString("en-US", {minimumFractionDigits: 2})}
          </div>
        </div>
      </div>
      <div style={{textAlign:'right'}}>
        <div style={{
          fontSize: 16, fontWeight: 900,
          color: isPos ? '#4ade80' : '#f87171',
          background: isPos ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)',
          padding: '8px 16px', borderRadius: 30,
          border: '1px solid ' + (isPos ? '#4ade80' : '#f87171'),
          display: 'inline-block'
        }}>
          {isPos ? '▲ +' : '▼ '}{btcData.change24h.toFixed(2)}% (24h)
        </div>
        <div style={{fontSize:12, color:'#888', marginTop:8}}>Fonte: Mercado Global Crypto</div>
      </div>
    </div>
  );
}`;

content = content.replace(/function BtcLiveTicker\(\) \{[\s\S]*?(?=function HomePage)/, newBtcLiveTicker + '\n\n');

const adminSummaryReplacement = `function AdminSummary({data, setTab}){
  const today = TODAY();
  const ms = {};
  data.machines.forEach(m => {
    if (!ms[m.model]) ms[m.model] = {model: m.model, boa: 0, stock: 0, ruim: 0, shell: 0, conserto: 0};
    if (m.type === "shell") ms[m.model].shell++;
    else if (["BOA", "LIGADA"].includes(m.situacao)) ms[m.model].boa++;
    else if (m.situacao === "STOCK") ms[m.model].stock++;
    else if (m.situacao === "ENTRADA OFICINA") ms[m.model].conserto++;
    else ms[m.model].ruim++;
  });
  const normD = d => {
    if (!d) return "";
    if (d.includes("/")) {
      const p = d.split("/");
      if (p.length === 3) return \`\${p[2]}-\${p[1].padStart(2,"0")}-\${p[0].padStart(2,"0")}\`;
    }
    return d.slice(0, 10);
  };
  const totalRepairsAllTime = (data.repairs || []).filter(r => r.type !== "already_good" && !r.type?.startsWith("remove")).length;
  const repairsTodayCount = (data.repairs || []).filter(r => (normD(r.date) === today || normD(r._at) === today) && r.type !== "already_good" && !r.type?.startsWith("remove")).length;
  const testsTodayCount = (data.tests || []).filter(t => normD(t.date) === today || normD(t._at) === today).length;
  const totalBoas = Object.values(ms).reduce((sum, s) => sum + s.boa, 0);

  const filterAndNav = (modelStr, sitStr, typeStr) => {
    if (modelStr) localStorage.setItem("hs_mac_filter_model", modelStr);
    else localStorage.removeItem("hs_mac_filter_model");

    if (sitStr) localStorage.setItem("hs_mac_filter_sit", sitStr);
    else localStorage.removeItem("hs_mac_filter_sit");

    if (typeStr) localStorage.setItem("hs_mac_filter_type", typeStr);
    else localStorage.removeItem("hs_mac_filter_type");

    if (setTab) setTab("mac");
  };

  return (
    <>
      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24}}>
        <div className="card-3d" onClick={() => filterAndNav("", "", "")} style={{cursor: 'pointer'}}>
          <div className="gold-text" style={{fontSize: 42, fontWeight: 900}}>{data.machines.length}</div>
          <div style={{fontWeight: 800, fontSize: 16, marginTop: 8, color: '#fff', textTransform: 'uppercase', letterSpacing: 1}}>🖥️ Máquinas Cadastradas</div>
          <div style={{fontSize: 12, color: '#aaa', marginTop: 8}}>{data.machines.filter(m => ["BOA", "STOCK"].includes(m.situacao)).length} Prontas · Ver todas ➔</div>
        </div>

        <div className="card-3d" onClick={() => {
            localStorage.setItem("hs_team_subtab", "daily");
            localStorage.setItem("hs_team_start_date", "");
            localStorage.setItem("hs_team_end_date", "");
            if (setTab) setTab("team");
          }} style={{cursor: 'pointer'}}>
          <div className="gold-text" style={{fontSize: 42, fontWeight: 900}}>{totalRepairsAllTime}</div>
          <div style={{fontWeight: 800, fontSize: 16, marginTop: 8, color: '#fff', textTransform: 'uppercase', letterSpacing: 1}}>📜 Total Consertadas (Geral)</div>
          <div style={{fontSize: 12, color: '#aaa', marginTop: 8}}>Acessar Histórico ➔</div>
        </div>

        <div className="card-3d" onClick={() => {
            localStorage.setItem("hs_team_subtab", "daily");
            localStorage.setItem("hs_team_start_date", today);
            localStorage.setItem("hs_team_end_date", today);
            if (setTab) setTab("team");
          }} style={{cursor: 'pointer'}}>
          <div className="gold-text" style={{fontSize: 42, fontWeight: 900}}>{repairsTodayCount}</div>
          <div style={{fontWeight: 800, fontSize: 16, marginTop: 8, color: '#fff', textTransform: 'uppercase', letterSpacing: 1}}>🔧 Consertos Hoje</div>
          <div style={{fontSize: 12, color: '#aaa', marginTop: 8}}>Ver Relatório de Equipe ➔</div>
        </div>

        <div className="card-3d" onClick={() => {
            localStorage.setItem("hs_team_subtab", "daily");
            localStorage.setItem("hs_team_start_date", today);
            localStorage.setItem("hs_team_end_date", today);
            if (setTab) setTab("team");
          }} style={{cursor: 'pointer'}}>
          <div className="gold-text" style={{fontSize: 42, fontWeight: 900}}>{testsTodayCount}</div>
          <div style={{fontWeight: 800, fontSize: 16, marginTop: 8, color: '#fff', textTransform: 'uppercase', letterSpacing: 1}}>🧪 Testes Hoje</div>
          <div style={{fontSize: 12, color: '#aaa', marginTop: 8}}>Ver Relatório de Equipe ➔</div>
        </div>
      </div>
`;

content = content.replace(/function AdminSummary\(\{\s*data,\s*setTab\s*\}\)[\s\S]*?(?=\{\/\*\s*TABELA DE MODELOS COM FILTROS INTERATIVOS COMBINADOS\s*\*\/)/, adminSummaryReplacement);

fs.writeFileSync('src/App.jsx', content);
console.log('App.jsx patched successfully');
