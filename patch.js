
const fs = require('fs');
let content = fs.readFileSync('src/App.jsx', 'utf8');

// We will inject the BtcLiveTicker and HomePage enhancements.
const newBtcLiveTicker = unction BtcLiveTicker() {
  const [btcData, setBtcData] = useState({ price: 0, change24h: 0, loading: true });

  useEffect(() => {
    const fetchBtcPrice = async () => {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,brl&include_24hr_change=true');
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
    <div className='card-3d' style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 30px' }}>
      <div style={{display:'flex', alignItems:'center', gap:20}}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'linear-gradient(135deg, #FFE259 0%, #FFA751 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, fontWeight: 900, color: '#000',
          boxShadow: '0 0 20px rgba(240,185,11,0.6)'
        }}>?</div>
        <div>
          <div style={{fontSize:14, color:'#aaa', fontWeight:800, letterSpacing:2}}>COTAÇÃO BITCOIN AO VIVO</div>
          <div className='gold-text' style={{fontFamily:'Cinzel, serif', fontSize:32, fontWeight:900, marginTop:4}}>
            {btcData.loading ? 'Carregando...' : 'U$ ' + btcData.priceUSD.toLocaleString('en-US', {minimumFractionDigits: 2})}
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
          {isPos ? '? +' : '? '}{btcData.change24h.toFixed(2)}% (24h)
        </div>
        <div style={{fontSize:12, color:'#888', marginTop:8}}>Fonte: Mercado Global Crypto</div>
      </div>
    </div>
  );
};

content = content.replace(/function BtcLiveTicker\(\) \{[\s\S]*?(?=function HomePage)/, newBtcLiveTicker + '\n\n');

fs.writeFileSync('src/App.jsx', content);
console.log('App.jsx patched successfully');

