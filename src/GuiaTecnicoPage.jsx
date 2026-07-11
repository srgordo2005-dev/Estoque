import React, { useState } from 'react';

export default function GuiaTecnicoPage({ ctx, C, Tag }) {
  const [activePage, setActivePage] = useState('p0');
  const [curModel, setCurModel] = useState('s9');
  const [selChip, setSelChip] = useState(null);
  const [chipStates, setChipStates] = useState({});
  const [showDom, setShowDom] = useState(false);
  const [animOn, setAnimOn] = useState(true);
  const [sigVis, setSigVis] = useState({ clk: true, tx: true, rx: true, bo: true, rst: true });

  const MODELS_DATA = {
    s9:     { name: 'S9/T9+ · BM1387', chip: 'BM1387', chips: 63, dom: 21, cpd: 3, vIn: '12V', vDom: '0.4V', ldo: '1.8V', pll: '0.8V', boost: '14V (6 dom)', fx: '12V APW3++', clk: '0.9V', tx: '1.8V', rx: '1.6–1.8V', rst: '1.8V', bo: '0V/pulso', rows: 3, cols: 21, bW: 800, bH: 175, desc: '16nm FinFET TSMC. QFN (não BGA). 21 domínios × 3 chips. Padrão de aprendizado.' },
    s9k:    { name: 'S9k/S9se · BM1387B', chip: 'BM1387B', chips: 60, dom: 6, cpd: 10, vIn: '9.6V', vDom: '1.6V', ldo: '1.8V', pll: '0.8V', boost: '—', fx: '12V', clk: '0.9V', tx: '1.8V', rx: '1.6–1.8V', rst: '1.8V', bo: '0V/pulso', rows: 3, cols: 20, bW: 800, bH: 175, desc: '16nm. 6 domínios × 10 chips. 2 cristais + 2 sensores temperatura.' },
    l3:     { name: 'L3+ · BM1485 (SCRYPT)', chip: 'BM1485', chips: 72, dom: 12, cpd: 6, vIn: '8.8V', vDom: '0.7V', ldo: '1.8V', pll: '0.8V', boost: '—', fx: '8.8V', clk: '0.9V', tx: '1.8V', rx: '1.6–1.8V', rst: '1.8V', bo: 'pulso', rows: 4, cols: 18, bW: 800, bH: 200, desc: '28nm SCRYPT (Litecoin). 4 fileiras × 18 chips. 12 domínios × 6.' },
    s17:    { name: 'S17/T17 · BM1397', chip: 'BM1397', chips: 48, dom: 12, cpd: 4, vIn: '18.5V', vDom: '1.55V', ldo: '1.8V', pll: '0.8V', boost: '18.5V→19V', fx: '18.5V APW9+', clk: '0.9V', tx: '1.6–1.8V', rx: '1.6–1.8V', rst: '1.8V', bo: '0V', rows: 4, cols: 12, bW: 800, bH: 200, desc: '7nm. 48 chips / 12 domínios × 4. Geração problemática — heatsinks individuais.' },
    s17e:   { name: 'S17e/T17e · BM1396', chip: 'BM1396', chips: 135, dom: 15, cpd: 9, vIn: '18V', vDom: '1.2V', ldo: '1.8V', pll: '0.8V', boost: '19V', fx: '18V APW9+', clk: '0.9V', tx: '1.8V', rx: '1.8V', rst: '1.8V', bo: '0V', rows: 5, cols: 27, bW: 800, bH: 230, desc: '7nm. 135 chips / 15 domínios × 9. Maior board das gerações 17.' },
    s19:    { name: 'S19/T19 · BM1398', chip: 'BM1398', chips: 76, dom: 38, cpd: 2, vIn: '14V', vDom: '0.36V', ldo: '1.8V', pll: '0.8V', boost: '19V U9', fx: '14V', clk: '0.7–1.3V', tx: '1.8V', rx: '1.8V', rst: '1.8V', bo: '0V/pulso', rows: 4, cols: 19, bW: 800, bH: 200, desc: '7nm Samsung. 76 chips / 38 dom × 2. Mais confiável da Bitmain. 4 boards por miner.' },
    s19jpro:{ name: 'S19j Pro · BM1362', chip: 'BM1362', chips: 126, dom: 42, cpd: 3, vIn: '15V', vDom: '0.32V', ldo: '1.2V', pll: '0.8V', boost: '20V U238', fx: '15V', clk: '0.5–0.6V', tx: '1.2V', rx: '1.2V', rst: '1.2V', bo: '0V', rows: 6, cols: 21, bW: 800, bH: 260, desc: '7nm. 126 chips / 42 dom × 3. IO 1.2V (diferente!). Boost 20V.' },
    s19xp:  { name: 'S19 XP · BM1366AL', chip: 'BM1366AL', chips: 77, dom: 11, cpd: 7, vIn: '14V', vDom: '1.15V', ldo: '1.2V', pll: '0.8V', boost: '19V U178/MP2019', fx: '14V', clk: '0.5–0.6V', tx: '1.2V', rx: '1.2V', rst: '1.2V', bo: '0V', rows: 7, cols: 11, bW: 800, bH: 285, desc: 'TSMC 5nm. 77 chips / 11 dom × 7. ESD MUITO sensível. IO 1.2V.' },
    s21:    { name: 'S21/T21 · BM1368', chip: 'BM1368', chips: 84, dom: 14, cpd: 6, vIn: '14.5V', vDom: '1.0V', ldo: '1.2V', pll: '0.8V', boost: '20V', fx: '~15V', clk: '0.5–0.6V', tx: '1.2V', rx: '1.2V', rst: '1.2V', bo: '0V', rows: 6, cols: 14, bW: 800, bH: 250, desc: '5nm+. 84 chips / 14 dom × 6. 200+ TH/s. Geração mais recente.' },
  };

  const m = MODELS_DATA[curModel];
  const W = m.bW, H = m.bH;
  const padX = 48, padY = 28;
  const cW = Math.min(26, Math.floor((W - padX * 2 - 16) / m.cols) - 3);
  const cH = Math.min(22, Math.floor((H - padY * 2 - 28) / m.rows) - 4);
  const gX = Math.floor((W - padX * 2 - 16) / m.cols);
  const gY = Math.floor((H - padY * 2 - 28) / m.rows);

  const pos = [];
  for (let i = 0; i < m.chips; i++) {
    const col = i % m.cols, row = Math.floor(i / m.cols);
    const x = padX + col * gX, y = padY + row * gY;
    pos.push({ x, y, cx: x + cW / 2, cy: y + cH / 2 });
  }

  const selectChip = (idx) => {
    setSelChip(idx);
  };

  const clearFaults = () => {
    setChipStates({});
  };

  // Draw traces in SVG
  const svgPaths = [];
  const defs = [
    { key: 'clk', color: '#39ff14', cls: 'tr-clk', oy: -3, rev: false },
    { key: 'tx', color: '#00d4ff', cls: 'tr-tx', oy: 0, rev: false },
    { key: 'rx', color: '#ff8c00', cls: 'tr-rx', oy: 3, rev: true },
    { key: 'bo', color: '#cc44ff', cls: 'tr-bo', oy: 6, rev: false },
    { key: 'rst', color: '#ff3b3b', cls: 'tr-rst', oy: -6, rev: false },
  ];
  defs.forEach(td => {
    if (!sigVis[td.key]) return;
    const pts = td.rev ? [...pos].reverse() : pos;
    let d = '';
    pts.forEach((p, i) => {
      const x = p.cx + td.oy, y = p.cy + td.oy;
      d += (i === 0 ? `M${x},${y}` : ` L${x},${y}`);
    });
    svgPaths.push(
      <path
        key={td.key}
        d={d}
        stroke={td.color}
        strokeWidth="1.5"
        fill="none"
        strokeOpacity="0.65"
        strokeDasharray="8,4"
        className={animOn ? td.cls : ''}
      />
    );
  });

  // Domain zones
  const domainZones = [];
  if (showDom) {
    const dcolors = ['#ffe566', '#ff8c00', '#39ff14', '#00d4ff', '#cc44ff', '#ff3b3b', '#f7931a', '#00ffaa', '#ff66aa', '#66aaff', '#aaffaa', '#ffaaaa', '#ff99cc', '#99ffcc'];
    for (let d = 0; d < m.dom; d++) {
      const si = d * m.cpd, ei = Math.min(si + m.cpd - 1, m.chips - 1);
      if (si < pos.length) {
        const p1 = pos[si], p2 = pos[ei];
        const col = dcolors[d % dcolors.length];
        const left = Math.min(p1.x, p2.x) - 3;
        const top = Math.min(p1.y, p2.y) - 3;
        const width = Math.abs(p2.x - p1.x) + cW + 6;
        const height = Math.abs(p2.y - p1.y) + cH + 6;
        domainZones.push(
          <div
            key={'dz-' + d}
            className="domain-zone"
            style={{
              left, top, width, height,
              borderColor: col,
              background: col + '15',
              position: 'absolute',
              border: '1.5px dashed',
              borderRadius: 4,
              pointerEvents: 'none',
              zIndex: 1
            }}
          />
        );
        domainZones.push(
          <div
            key={'dl-' + d}
            style={{
              position: 'absolute',
              left,
              top: top - 13,
              fontFamily: 'monospace',
              fontSize: 8,
              color: col,
              background: 'rgba(0,0,0,0.8)',
              padding: '1px 3px',
              borderRadius: 2,
              zIndex: 3,
              pointerEvents: 'none'
            }}
          >
            D{d + 1}
          </div>
        );
      }
    }
  }

  const simFault = () => {
    const fs = Math.floor(Math.random() * (m.chips - 4)) + 1;
    const fc = Math.floor(Math.random() * 2) + 1;
    const newStates = {};
    for (let i = 0; i < m.chips; i++) newStates[i] = 'ok';
    for (let i = 0; i < fc; i++) {
      if (fs + i < m.chips) newStates[fs + i] = 'bad';
    }
    for (let i = 0; i < 2; i++) {
      const r = Math.floor(Math.random() * m.chips);
      if (newStates[r] !== 'bad') newStates[r] = 'warn';
    }
    setChipStates(newStates);
    setSelChip(fs);
  };

  const selectModel = (key) => {
    setCurModel(key);
    setSelChip(null);
    setChipStates({});
  };

  const TABS_NAV = [
    { id: 'p0', label: '🏠 INÍCIO' },
    { id: 'p9', label: '📖 GUIA INICIANTES' },
    { id: 'p1', label: '🖥️ PCB INTERATIVA' },
    { id: 'p2', label: '⚡ CIRCUITOS PSU' },
    { id: 'p3', label: '📡 SINAIS COM.' },
    { id: 'p4', label: '🔬 CHIPS ASIC' },
    { id: 'p5', label: '🔧 TROUBLESHOOT' },
    { id: 'p8', label: '📋 ANÁLISE DE LOGS' },
    { id: 'p6', label: '📁 SEU DRIVE' },
    { id: 'p7', label: '🔗 FONTES' },
  ];

  return <div className="guia-tecnico-wrap" style={{ marginBottom: 80 }}>
    <style>{`
      .guia-tecnico-wrap {
        --bg: #0b0f19;
        --bg2: #121826;
        --bg3: #1a2336;
        --bg4: #07090f;
        --border: #222d42;
        --border2: #2d3b56;
        --accent: #f7931a;
        --blue: #00d4ff;
        --green: #39ff14;
        --red: #ff3b3b;
        --purple: #cc44ff;
        --yellow: #ffe566;
        --orange: #ff8c00;
        --text: #cbd5e1;
        --dim: #708090;
        --bright: #f8fafc;
        background: var(--bg);
        color: var(--text);
        padding: 18px;
        border-radius: 12px;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        font-size: 14.5px;
        line-height: 1.6;
      }
      .guia-tecnico-wrap .site-header {
        background: linear-gradient(135deg, #050710 0%, #0c1520 40%, #07090f 100%);
        border-bottom: 2px solid var(--accent);
        padding: 20px 24px;
        margin-bottom: 16px;
        border-radius: 8px;
        box-shadow: 0 4px 22px rgba(247,147,26,0.18);
      }
      .guia-tecnico-wrap .hdr-title {
        font-size: 21px;
        font-weight: 900;
        color: var(--bright);
        letter-spacing: 1px;
      }
      .guia-tecnico-wrap .hdr-title span { color: var(--accent); }
      .guia-tecnico-wrap .hdr-sub {
        font-size: 11px;
        color: var(--dim);
        margin-top: 5px;
      }
      .guia-tecnico-wrap .nav-bar {
        background: var(--bg2);
        border: 1px solid var(--border);
        border-radius: 8px;
        display: flex;
        gap: 4px;
        overflow-x: auto;
        scrollbar-width: none;
        padding: 6px;
        margin-bottom: 20px;
      }
      .guia-tecnico-wrap .nav-bar::-webkit-scrollbar { display:none; }
      .guia-tecnico-wrap .nav-tab {
        padding: 10px 16px;
        font-size: 12px;
        font-weight: 600;
        color: var(--dim);
        cursor: pointer;
        border-radius: 6px;
        white-space: nowrap;
        transition: all 0.15s;
      }
      .guia-tecnico-wrap .nav-tab:hover { color: var(--text); background: var(--bg3); }
      .guia-tecnico-wrap .nav-tab.active { color: var(--accent); background: rgba(247,147,26,0.15); font-weight: 700; }
      
      .guia-tecnico-wrap .card {
        background: var(--bg2);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 18px;
        margin-bottom: 16px;
        position: relative;
      }
      .guia-tecnico-wrap .card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 4px;
        height: 100%;
        background: var(--accent);
        border-radius: 8px 0 0 8px;
      }
      .guia-tecnico-wrap .card.blue::before { background: var(--blue); }
      .guia-tecnico-wrap .card.green::before { background: var(--green); }
      .guia-tecnico-wrap .card.red::before { background: var(--red); }
      .guia-tecnico-wrap .card.purple::before { background: var(--purple); }
      
      .guia-tecnico-wrap .card-title {
        font-size: 13.5px;
        font-weight: 700;
        color: var(--accent);
        letter-spacing: 1px;
        text-transform: uppercase;
        margin-bottom: 14px;
      }
      .guia-tecnico-wrap .card.blue .card-title { color: var(--blue); }
      .guia-tecnico-wrap .card.green .card-title { color: var(--green); }
      .guia-tecnico-wrap .card.red .card-title { color: var(--red); }
      .guia-tecnico-wrap .card.purple .card-title { color: var(--purple); }

      .guia-tecnico-wrap .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .guia-tecnico-wrap .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
      .guia-tecnico-wrap .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
      @media(max-width: 768px) {
        .guia-tecnico-wrap .grid-2, .guia-tecnico-wrap .grid-3, .guia-tecnico-wrap .grid-4 {
          grid-template-columns: 1fr;
        }
      }

      .guia-tecnico-wrap .tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
      .guia-tecnico-wrap .tbl th {
        background: rgba(247,147,26,0.08);
        color: var(--accent);
        padding: 10px 14px;
        text-align: left;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        border-bottom: 1.5px solid var(--border);
      }
      .guia-tecnico-wrap .tbl td {
        padding: 10px 14px;
        border-bottom: 1px solid rgba(30,41,64,0.3);
        color: var(--text);
        vertical-align: middle;
      }
      .guia-tecnico-wrap .tbl tr:hover td { background: rgba(247,147,26,0.03); }
      .guia-tecnico-wrap .tbl .ok { color: var(--green); font-weight: 600; }
      .guia-tecnico-wrap .tbl .warn { color: var(--accent); font-weight: 600; }
      .guia-tecnico-wrap .tbl .bad { color: var(--red); font-weight: 600; }
      .guia-tecnico-wrap .tbl .chip { color: var(--blue); font-weight: bold; }
      .guia-tecnico-wrap .tbl .hi { color: var(--yellow); }

      .guia-tecnico-wrap .pcb-board {
        background: linear-gradient(145deg,#1a2e1a,#142214,#0f1a0f,#172717);
        border: 3px solid #2a4a2a;
        border-radius: 8px;
        position: relative;
        box-shadow: 0 0 30px rgba(0,80,0,0.15), inset 0 0 30px rgba(0,0,0,0.4);
        overflow: hidden;
      }
      .guia-tecnico-wrap .chip {
        position: absolute;
        border-radius: 2px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
        font-weight: 800;
        transition: all 0.1s;
        z-index: 4;
        border: 1px solid;
      }
      .guia-tecnico-wrap .chip:hover { transform: scale(1.18); z-index: 10; }
      .guia-tecnico-wrap .chip.ok { background: rgba(26, 60, 26, 0.9); border-color: #2a6a2a; color: #7fbf7f; }
      .guia-tecnico-wrap .chip.ok:hover { background: rgba(57, 255, 20, 0.2); border-color: var(--green); color: #fff; }
      .guia-tecnico-wrap .chip.sel { background: rgba(57, 255, 20, 0.25); border-color: var(--green); box-shadow: 0 0 8px var(--green); color: #fff; }
      .guia-tecnico-wrap .chip.bad { background: rgba(80, 10, 10, 0.9); border-color: #aa2222; color: #ff8888; animation: pulse-bad 1.5s infinite; }
      .guia-tecnico-wrap .chip.bad:hover { background: rgba(255, 59, 59, 0.25); border-color: var(--red); color: #fff; }
      .guia-tecnico-wrap .chip.warn { background: rgba(60, 40, 5, 0.9); border-color: #886622; color: #ffe566; }
      .guia-tecnico-wrap .chip.warn:hover { background: rgba(247, 147, 26, 0.25); border-color: var(--accent); color: #fff; }
      
      .guia-tecnico-wrap .chip-label { font-size: 9px; color: rgba(255,255,255,0.85); pointer-events: none; }
      .guia-tecnico-wrap .pcb-conn {
        position: absolute;
        border-radius: 3px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 8px;
        font-weight: 700;
        z-index: 5;
      }
      .guia-tecnico-wrap .pcb-conn.pwr { background: #3a1a0a; border: 1.5px solid var(--accent); color: var(--accent); }
      .guia-tecnico-wrap .pcb-conn.io { background: #0a1a3a; border: 1.5px solid var(--blue); color: var(--blue); }
      .guia-tecnico-wrap .pcb-comp {
        position: absolute;
        border-radius: 2px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 7px;
        font-weight: 800;
        z-index: 3;
      }
      .guia-tecnico-wrap .pcb-comp.cryst { background: rgba(80,0,80,0.8); border: 1px solid var(--purple); color: var(--purple); }
      .guia-tecnico-wrap .pcb-comp.boost { background: rgba(120,60,0,0.8); border: 1px solid var(--accent); color: var(--accent); }
      .guia-tecnico-wrap .pcb-comp.temp { background: rgba(0,60,60,0.8); border: 1px solid #00aaaa; color: #00dddd; }
      .guia-tecnico-wrap .trace-svg { position: absolute; top:0; left:0; pointer-events: none; z-index: 2; }
      
      @keyframes pulse-bad { 0%,100%{box-shadow:0 0 3px var(--red);} 50%{box-shadow:0 0 8px var(--red);} }
      @keyframes flow-fwd { from{stroke-dashoffset:160} to{stroke-dashoffset:0} }
      @keyframes flow-rev { from{stroke-dashoffset:0} to{stroke-dashoffset:160} }
      .guia-tecnico-wrap .tr-clk { animation: flow-fwd 1.5s linear infinite; }
      .guia-tecnico-wrap .tr-tx { animation: flow-fwd 2s linear infinite; }
      .guia-tecnico-wrap .tr-rx { animation: flow-rev 2s linear infinite; }
      .guia-tecnico-wrap .tr-bo { animation: flow-fwd 3s linear infinite; }
      .guia-tecnico-wrap .tr-rst { animation: flow-fwd 4s linear infinite; }

      .guia-tecnico-wrap .code {
        background: #05080f;
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 14px 18px;
        font-family: 'Share Tech Mono', monospace;
        font-size: 13px;
        line-height: 1.6;
        overflow-x: auto;
        color: var(--green);
        white-space: pre-wrap;
      }
      .guia-tecnico-wrap .code .cc { color: #4a5e7a; }
      .guia-tecnico-wrap .code .ck { color: var(--accent); font-weight: 700; }
      .guia-tecnico-wrap .code .cv { color: var(--blue); }
      .guia-tecnico-wrap .code .cw { color: var(--red); }

      .guia-tecnico-wrap .warn-box {
        background: rgba(255,59,59,0.06);
        border: 1px solid rgba(255,59,59,0.3);
        border-radius: 6px;
        padding: 12px 16px;
        margin: 14px 0;
        font-size: 13.5px;
        color: #ff9999;
      }
      .guia-tecnico-wrap .info-box {
        background: rgba(0,212,255,0.04);
        border: 1px solid rgba(0,212,255,0.25);
        border-radius: 6px;
        padding: 12px 16px;
        margin: 14px 0;
        font-size: 13.5px;
        color: var(--blue);
      }
      .guia-tecnico-wrap .tip-box {
        background: rgba(57,255,20,0.04);
        border: 1px solid rgba(57,255,20,0.22);
        border-radius: 6px;
        padding: 12px 16px;
        margin: 14px 0;
        font-size: 13.5px;
        color: var(--green);
      }

      .guia-tecnico-wrap .link-list { display: flex; flex-direction: column; gap: 10px; }
      .guia-tecnico-wrap .link-item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px;
        background: var(--bg3);
        border: 1px solid var(--border);
        border-radius: 6px;
      }
      .guia-tecnico-wrap .lbadge {
        flex-shrink: 0;
        font-size: 9px;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 2px;
        text-transform: uppercase;
      }
      .guia-tecnico-wrap .lb-blue { background: rgba(0,212,255,0.08); border: 1px solid var(--blue); color: var(--blue); }
      .guia-tecnico-wrap .lb-orange { background: rgba(247,147,26,0.1); border: 1px solid var(--accent); color: var(--accent); }
      .guia-tecnico-wrap .lb-green { background: rgba(57,255,20,0.06); border: 1px solid var(--green); color: var(--green); }
      .guia-tecnico-wrap .lb-red { background: rgba(255,59,59,0.08); border: 1px solid var(--red); color: var(--red); }
      
      .guia-tecnico-wrap .linfo .ltitle { color: var(--bright); font-size: 13px; font-weight: 700; }
      .guia-tecnico-wrap .linfo .ldesc { color: var(--dim); font-size: 11.5px; margin-top: 2px; }
      .guia-tecnico-wrap .linfo .lurl { display: block; color: var(--blue); font-size: 10px; margin-top: 4px; text-decoration: none; }

      .guia-tecnico-wrap .tag { display: inline-block; font-size: 10px; padding: 3px 8px; border-radius: 3px; margin: 2px; }
      .guia-tecnico-wrap .tg { background: rgba(247,147,26,0.1); border: 1px solid rgba(247,147,26,0.3); color: var(--accent); }
      .guia-tecnico-wrap .tb { background: rgba(0,212,255,0.07); border: 1px solid rgba(0,212,255,0.3); color: var(--blue); }
      .guia-tecnico-wrap .tgr { background: rgba(57,255,20,0.05); border: 1px solid rgba(57,255,20,0.3); color: var(--green); }
      .guia-tecnico-wrap .tr { background: rgba(255,59,59,0.07); border: 1px solid rgba(255,59,59,0.3); color: var(--red); }

      .guia-tecnico-wrap .checklist { list-style: none; }
      .guia-tecnico-wrap .checklist li {
        padding: 6px 0;
        border-bottom: 1px solid rgba(30,41,64,0.2);
        display: flex;
        align-items: flex-start;
        gap: 10px;
        font-size: 13.5px;
      }
      .guia-tecnico-wrap .chk {
        flex-shrink: 0;
        width: 16px;
        height: 16px;
        border: 1.5px solid var(--green);
        border-radius: 3px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
        color: var(--green);
        cursor: pointer;
        user-select: none;
      }
      .guia-tecnico-wrap .chk.done { background: rgba(57,255,20,0.15); }

      .guia-tecnico-wrap .pcb-wrap { display: flex; gap: 16px; align-items: flex-start; }
      .guia-tecnico-wrap .pcb-side { flex: 1; min-width: 0; }
      .guia-tecnico-wrap .pcb-info { width: 250px; flex-shrink: 0; background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
      .guia-tecnico-wrap .pi-title { font-size: 10px; font-weight: 700; color: var(--accent); letter-spacing: 1px; padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--bg3); }
      .guia-tecnico-wrap .pi-body { padding: 14px; }
      .guia-tecnico-wrap .pi-num { font-size: 24px; font-weight: 900; color: var(--green); }
      .guia-tecnico-wrap .pi-sub { font-size: 10px; color: var(--dim); margin-bottom: 10px; }
      .guia-tecnico-wrap .pi-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid rgba(30,41,64,0.2); font-size: 11.5px; }
      .guia-tecnico-wrap .pi-key { color: var(--dim); }
      .guia-tecnico-wrap .pi-val { color: var(--bright); }
      .guia-tecnico-wrap .pi-val.ok { color: var(--green); }
      .guia-tecnico-wrap .pi-val.warn { color: var(--accent); }
      .guia-tecnico-wrap .pi-val.bad { color: var(--red); }
      .guia-tecnico-wrap .pi-hint { font-size: 10px; color: var(--dim); line-height: 1.5; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); }
      
      .guia-tecnico-wrap .ctrl-bar { display: flex; align-items: center; gap: 8px; padding: 10px 0; flex-wrap: wrap; }
      .guia-tecnico-wrap .btn-sm {
        background: var(--bg3);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 6px 12px;
        font-size: 11px;
        font-weight: 600;
        color: var(--text);
        cursor: pointer;
        transition: all 0.15s;
      }
      .guia-tecnico-wrap .btn-sm:hover { border-color: var(--accent); color: var(--accent); }
      .guia-tecnico-wrap .btn-sm.active { background: rgba(247,147,26,0.15); border-color: var(--accent); color: var(--accent); }
      
      .guia-tecnico-wrap .msel {
        background: var(--bg3);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 6px 12px;
        font-size: 11px;
        color: var(--dim);
        cursor: pointer;
      }
      .guia-tecnico-wrap .msel:hover { border-color: var(--blue); color: var(--blue); }
      .guia-tecnico-wrap .msel.active { background: rgba(247,147,26,0.15); border-color: var(--accent); color: var(--accent); }

      .guia-tecnico-wrap .sig-legend { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
      .guia-tecnico-wrap .sig-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        cursor: pointer;
        padding: 4px 10px;
        border-radius: 4px;
        border: 1px solid transparent;
      }
      .guia-tecnico-wrap .sig-btn.on { border-color: currentColor; background: rgba(255,255,255,0.03); }
      .guia-tecnico-wrap .sig-dot { width: 7px; height: 7px; border-radius: 50%; }

      .guia-tecnico-wrap .section-heading {
        font-size: 13px;
        font-weight: 800;
        color: var(--accent);
        letter-spacing: 1px;
        margin-bottom: 14px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--border);
      }

      .guia-tecnico-wrap .ftree { font-size: 12.5px; line-height: 1.8; padding: 10px; }
      .guia-tecnico-wrap .ft-folder { color: var(--blue); font-weight: 700; }
      .guia-tecnico-wrap .ft-file { color: var(--text); }
      .guia-tecnico-wrap .ft-file.star { color: var(--green); font-weight: 700; }
      .guia-tecnico-wrap .ft-file.pdf { color: #ff8888; }
      .guia-tecnico-wrap .ft-indent { padding-left: 18px; }
      .guia-tecnico-wrap .ft-desc { color: var(--dim); font-size: 10.5px; margin-left: 8px; }

      .guia-tecnico-wrap .sig-diagram { background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; padding: 14px; font-size: 11px; overflow-x: auto; }
      .guia-tecnico-wrap .srow { display: flex; align-items: center; margin: 8px 0; gap: 8px; }
      .guia-tecnico-wrap .sname { width: 48px; font-weight: bold; flex-shrink: 0; }
      .guia-tecnico-wrap .svolt { font-size: 9px; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); }

      .guia-tecnico-wrap .dom-viz { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; }
      .guia-tecnico-wrap .dom-row { display: flex; align-items: center; gap: 6px; }
      .guia-tecnico-wrap .dom-lbl { width: 68px; color: var(--dim); font-size: 9.5px; flex-shrink: 0; }
      .guia-tecnico-wrap .dom-chips { display: flex; gap: 3px; }
      .guia-tecnico-wrap .dchip {
        width: 22px;
        height: 20px;
        border: 1px solid #2a3550;
        border-radius: 2px;
        background: #1a2440;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 8px;
        color: #6b7f99;
      }
      .guia-tecnico-wrap .dchip.boost { background: rgba(255,68,68,0.12); border-color: var(--red); color: var(--red); }
      .guia-tecnico-wrap .dchip.ok { background: rgba(57,255,20,0.08); border-color: var(--green); color: var(--green); }
      .guia-tecnico-wrap .dom-volt { color: var(--blue); font-size: 9.5px; margin-left: 6px; }

      .guia-tecnico-wrap .psu-block {
        background: var(--bg3);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 10px;
        font-size: 11px;
        text-align: center;
      }
      .guia-tecnico-wrap .psu-val { font-size: 15px; font-weight: 900; color: var(--accent); }
      .guia-tecnico-wrap .psu-lbl { font-size: 9px; color: var(--dim); margin-top: 2px; }
      .guia-tecnico-wrap .psu-arrow { font-size: 18px; color: var(--accent); }
      .guia-tecnico-wrap .psu-flow { display: flex; align-items: center; gap: 6px; margin: 8px 0; flex-wrap: wrap; justify-content: center; }

      .guia-tecnico-wrap .glossary-box {
        background: rgba(247,147,26,0.03);
        border-left: 3px solid var(--accent);
        padding: 8px 12px;
        margin: 6px 0;
        font-size: 12px;
      }
      .guia-tecnico-wrap .glossary-box b { color: var(--bright); }

      .guia-tecnico-wrap .stat-box {
        background: var(--bg2);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 12px;
        text-align: center;
      }
      .guia-tecnico-wrap .stat-val {
        font-size: 22px;
        font-weight: 900;
        color: var(--accent);
      }
      .guia-tecnico-wrap .stat-key {
        font-size: 9px;
        color: var(--dim);
        margin-top: 2px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
    `}</style>

    <div className="site-header">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="hdr-title">MANUTENÇÃO HASH<span>BOARD</span></div>
          <div className="hdr-sub">Antminer · Whatsminer · Esquetes, Sinais e Diagnóstico completo</div>
        </div>
        <Tag color={C.green} small>INTERATIVO</Tag>
      </div>
    </div>

    <div className="nav-bar">
      {TABS_NAV.map(tab => (
        <div
          key={tab.id}
          className={`nav-tab ${activePage === tab.id ? 'active' : ''}`}
          onClick={() => setActivePage(tab.id)}
        >
          {tab.label}
        </div>
      ))}
    </div>

    {/* P0 - INICIO */}
    {activePage === 'p0' && <div>
      <div className="grid-4" style={{ marginBottom: 12 }}>
        <div className="stat-box"><div className="stat-val">9</div><div className="stat-key">MODELOS COBERTOS</div></div>
        <div className="stat-box"><div className="stat-val">80+</div><div className="stat-key">ARQUIVOS DRIVE</div></div>
        <div className="stat-box"><div className="stat-val">5</div><div className="stat-key">SINAIS MAPEADOS</div></div>
        <div className="stat-box"><div className="stat-val">3</div><div className="stat-key">FIRMWARES REFs</div></div>
      </div>

      <div className="section-heading">ARQUITETURA GERAL DO ANTMINER</div>
      <div className="grid-2">
        <div className="card">
          <div className="card-title">🖥️ Anatomia de Conexão</div>
          <div className="code">
{`PSU (APW3/5/7/8/9/12)
  └─ 12–15V DC ──→ HASHBOARDS
       ├─ Domínios de tensão em série
       └─ LDO 1.8V/1.2V + PLL 0.8V por domínio

CONTROL BOARD (ARM/Zynq)
  └─ IO Cable ──→ HASHBOARDS (CLK, TX, RX, RST, BO)`}
          </div>
        </div>
        <div className="card blue">
          <div className="card-title">📊 Modelos x Chips x TH/s</div>
          <table className="tbl">
            <thead>
              <tr><th>Modelo</th><th>Chip</th><th>Chips/B</th><th>TH/s</th></tr>
            </thead>
            <tbody>
              <tr><td>S9</td><td className="chip">BM1387</td><td>63</td><td>13.5</td></tr>
              <tr><td>L3+</td><td className="chip">BM1485</td><td>72</td><td>504M</td></tr>
              <tr><td>S17</td><td className="chip">BM1397</td><td>48</td><td>53-73</td></tr>
              <tr><td>S19</td><td className="chip">BM1398</td><td>76</td><td>95-110</td></tr>
              <tr><td>S19j Pro</td><td className="chip">BM1362</td><td>126</td><td>104</td></tr>
              <tr><td>S19 XP</td><td className="chip">BM1366</td><td>110</td><td>141</td></tr>
              <tr><td>S21</td><td className="chip">BM1368</td><td>~84</td><td>200+</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="warn-box">
        <b>⚠️ ALERTA DE SEGURANÇA:</b> Fontes como a APW12 operam em altíssima corrente. Desconecte sempre o cabo de força e espere 5 minutos para descarregar os capacitores antes de manusear ou soldar qualquer componente.
      </div>
    </div>}

    {/* P9 - GUIA INICIANTES S19J PRO */}
    {activePage === 'p9' && <div>
      <div className="section-heading">📖 GUIA DE REPARO PARA INICIANTES — ANTMINER S19J PRO</div>
      
      <div className="card green">
        <div className="card-title">🛡️ 1. Segurança e ESD (Regras Inegociáveis)</div>
        <p>Antes de começar, siga sempre estas três regras fundamentais:</p>
        <ul className="checklist">
          <li>
            <span className="chk done">✓</span> <b>Pulseira Antiestática (ESD):</b> Chips de 5nm/7nm (como o BM1362) morrem por choques estáticos imperceptíveis. Use sempre pulseira aterrada e manta antiestática.
          </li>
          <li>
            <span className="chk done">✓</span> <b>Ordem de Energização (Decore!):</b><br/>
            - <b>Para ligar:</b> 1) Cabo negativo ➔ 2) Cabo positivo ➔ 3) Cabo de sinal.<br/>
            - <b>Para desligar:</b> 1) Cabo de sinal ➔ 2) Cabo positivo ➔ 3) Cabo negativo.<br/>
            <span className="cw" style={{ color: 'var(--red)' }}>Inverter essa ordem queima os tradutores lógicos U1/U2 e a placa deixa de achar qualquer chip (ASIC=0).</span>
          </li>
          <li>
            <span className="chk done">✓</span> <b>Sempre teste a placa FRIA:</b> Após soldagens, espere a placa esfriar completamente antes de rodar o teste. Placas quentes geram falsos positivos de erro (PNG) e confundem o diagnóstico. O teste de aprovação deve ser feito 2x consecutivas com ela fria.
          </li>
        </ul>
      </div>

      <div className="card blue">
        <div className="card-title">🔬 2. Ficha Técnica da Família S19j Pro</div>
        <table className="tbl">
          <thead>
            <tr><th>Parâmetro / Ponto</th><th>S19 (BM1398)</th><th>S19j Pro (BM1362)</th><th>S19j Pro+ (BM1362)</th></tr>
          </thead>
          <tbody>
            <tr><td><b>Qtd. Chips / Domínios</b></td><td>76 chips / 38 domínios</td><td className="ok">126 chips / 42 domínios</td><td>120 chips / 40 domínios</td></tr>
            <tr><td><b>Tensão do Domínio</b></td><td>~0,36 V</td><td className="ok">~0,32 V</td><td>~0,30 V</td></tr>
            <tr><td><b>Tensão do Boost</b></td><td>19 V (medir em C55)</td><td className="ok">20 V (medir em C915)</td><td>19 V (medir em C29)</td></tr>
            <tr><td><b>Nível Lógico</b></td><td>1,8 V</td><td className="ok">1,2 V</td><td>1,2 V</td></tr>
            <tr><td><b>PIC / EEPROM</b></td><td>U3 / U5</td><td className="ok">U6 (~3,3 V) / U10</td><td>Sem PIC (Calibração EEPROM)</td></tr>
            <tr><td><b>Curto Dicotomia</b></td><td>RO / 1V8</td><td className="ok">RO / 1V8 ou RX / 1V2</td><td>RX / 1V2</td></tr>
          </tbody>
        </table>
        <div className="info-box" style={{ marginTop: 12 }}>
          💡 <b>Dica do Professor:</b> No S19j Pro, os sinais lógicos rodam em <b>1.2 V</b> (não 1.8 V como na geração anterior S19). Não confunda essas medições com o multímetro!
        </div>
      </div>

      <div className="card">
        <div className="card-title">📖 Glossário Rápido de Termos</div>
        <div className="glossary-box"><b>Chip ASIC (BM1362):</b> O processador que minera. São 126 chips por placa.</div>
        <div className="glossary-box"><b>Domínio (Grupo):</b> Conjunto de 3 chips em paralelo que somam a energia. São 42 domínios na placa, medindo ~0,32 V cada. Se um chip do domínio queima, o grupo todo cai.</div>
        <div className="glossary-box"><b>Cadeia (Fila):</b> A fila indiana por onde os chips conversam (do chip 1 ao 126). O sinal de resposta (RX) faz o caminho de volta.</div>
        <div className="glossary-box"><b>Boost (IC U238):</b> Circuito elevador de tensão que cria os 20 V necessários para o controle de sinal. Mede-se no capacitor C915.</div>
        <div className="glossary-box"><b>Tester:</b> O seu testador (que substitui a controladora principal) para bipar e contar chips no navegador.</div>
        <div className="glossary-box"><b>Pattern NG:</b> Quando o chip responde na contagem mas falha ao calcular nonces (gerando erros).</div>
      </div>

      <div className="card red">
        <div className="card-title">⚡ O Mapa de Reparação Dicotômica (Faltam Chips)</div>
        <p>Se o seu Tester reportar uma contagem parcial de chips (ex: achou 38 de 126):</p>
        <ol style={{ paddingLeft: 20, fontSize: 13.5 }}>
          <li>A contagem aponta onde a fila parou: os 38 primeiros estão bons. O problema está no chip 39 ou no elo seguinte.</li>
          <li><b>Passo 1:</b> Encontre o domínio correspondente ao chip 39 e meça sua tensão com o multímetro (deve ser ~0,32 V).</li>
          <li><b>Passo 2:</b> Faça uma inspeção visual em busca de solda fria ou pinos tortas.</li>
          <li><b>Passo 3 (Regra de Ouro):</b> Sempre tente fazer <b>resolda (reflow) primeiro</b> antes de efetuar a troca completa. Mais de 70% das falhas são apenas soldas trincadas.</li>
          <li>Se o reflow não resolver, aplique gel térmico e troque o chip BGA.</li>
        </ol>
      </div>
    </div>}

    {/* P1 - PCB INTERATIVA */}
    {activePage === 'p1' && <div>
      <div className="section-heading">ESQUEMA DE PCB INTERATIVA — CLIQUE NOS CHIPS</div>
      
      <div className="ctrl-bar" style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: C.muted }}>SELECIONE MODELO:</span>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {Object.keys(MODELS_DATA).map(k => (
            <button
              key={k}
              className={`msel ${curModel === k ? 'active' : ''}`}
              onClick={() => selectModel(k)}
            >
              {k.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="sig-legend">
        {Object.keys(sigVis).map(k => (
          <div
            key={k}
            className={`sig-btn ${sigVis[k] ? 'on' : ''}`}
            style={{ color: k === 'clk' ? '#39ff14' : k === 'tx' ? '#00d4ff' : k === 'rx' ? '#ff8c00' : k === 'bo' ? '#cc44ff' : '#ff3b3b' }}
            onClick={() => setSigVis(p => ({ ...p, [k]: !p[k] }))}
          >
            <div className="sig-dot" style={{ background: k === 'clk' ? '#39ff14' : k === 'tx' ? '#00d4ff' : k === 'rx' ? '#ff8c00' : k === 'bo' ? '#cc44ff' : '#ff3b3b' }} />
            {k.toUpperCase()}
          </div>
        ))}
        <div
          className={`sig-btn ${showDom ? 'on' : ''}`}
          style={{ color: '#ffe566' }}
          onClick={() => setShowDom(!showDom)}
        >
          DOMÍNIOS
        </div>
      </div>

      <div className="pcb-wrap">
        <div className="pcb-side">
          <div style={{ overflowX: 'auto', background: 'var(--bg4)', padding: 8, borderRadius: 8, border: '1px solid var(--border)' }}>
            <div
              className="pcb-board"
              style={{
                width: W,
                height: H,
                position: 'relative'
              }}
            >
              <svg width={W} height={H} className="trace-svg">
                {svgPaths}
              </svg>

              {/* Connectors */}
              <div className="pcb-conn io" style={{ left: 8, top: 8, width: 26, height: H * 0.22 }}>IO</div>
              <div className="pcb-conn pwr" style={{ left: 8, top: H * 0.35, width: 26, height: H * 0.3 }}>PWR</div>

              {/* Crystal */}
              <div className="pcb-comp cryst" style={{ left: padX + 20, top: 6, width: 28, height: 14 }}>Y1 25M</div>

              {/* Boost */}
              {m.boost !== '—' && <div className="pcb-comp boost" style={{ left: W - 50, top: 6, width: 40, height: 16 }}>BOOST</div>}

              {/* NTC Sensors */}
              <div className="pcb-comp temp" style={{ left: padX + Math.floor(W * 0.3), top: 6, width: 26, height: 14 }}>NTC</div>
              <div className="pcb-comp temp" style={{ left: padX + Math.floor(W * 0.7), top: 6, width: 26, height: 14 }}>NTC</div>

              {/* Domain zones rendering */}
              {domainZones}

              {/* Chips rendering */}
              {pos.map((p, i) => {
                const st = chipStates[i] || 'ok';
                return (
                  <div
                    key={i}
                    className={`chip ${st} ${selChip === i ? 'sel' : ''}`}
                    style={{
                      left: p.x,
                      top: p.y,
                      width: cW,
                      height: cH
                    }}
                    onClick={() => selectChip(i)}
                  >
                    <span className="chip-label">{i + 1}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="ctrl-bar" style={{ marginTop: 10 }}>
            <button className={`btn-sm ${animOn ? 'active' : ''}`} onClick={() => setAnimOn(!animOn)}>
              {animOn ? '⏸ Pausar Sinais' : '⚡ Animar Sinais'}
            </button>
            <button className="btn-sm" style={{ borderColor: C.red, color: C.red }} onClick={simFault}>⚡ Simular Falha aleatória</button>
            <button className="btn-sm" onClick={clearFaults}>✓ Limpar tudo</button>
            <span style={{ fontSize: 11, color: C.green, marginLeft: 8 }}>
              {Object.values(chipStates).filter(s => s === 'bad').length} falhas / {m.chips} chips
            </span>
          </div>
        </div>

        <div className="pcb-info">
          <div className="pi-title">CHIP SELECIONADO</div>
          <div className="pi-body" id="chipInfo">
            {selChip !== null ? (
              <div>
                <div className="pi-num" style={{ color: (chipStates[selChip] || 'ok') === 'ok' ? 'var(--green)' : (chipStates[selChip] || 'ok') === 'warn' ? 'var(--accent)' : 'var(--red)' }}>
                  #{selChip + 1}
                </div>
                <div className="pi-sub">{m.chip} · Domínio {Math.floor(selChip / m.cpd) + 1}/{m.dom}</div>
                <div className="pi-row"><span className="pi-key">Status</span><span className={`pi-val ${(chipStates[selChip] || 'ok') === 'ok' ? 'ok' : (chipStates[selChip] || 'ok') === 'warn' ? 'warn' : 'bad'}`}>{(chipStates[selChip] || 'ok') === 'ok' ? '✓ OK' : (chipStates[selChip] || 'ok') === 'warn' ? '⚠ SUSPEITO' : '✗ FALHA'}</span></div>
                <div className="pi-row"><span className="pi-key">V/domain</span><span className="pi-val ok">{m.vDom}</span></div>
                <div className="pi-row"><span className="pi-key">LDO 1.x</span><span className="pi-val ok">{m.ldo}</span></div>
                <div className="pi-row"><span className="pi-key">PLL 0.8V</span><span className="pi-val ok">{m.pll}</span></div>
                <div className="pi-row"><span className="pi-key">Sinal CLK</span><span className="pi-val ok">{m.clk}</span></div>
                <div className="pi-row"><span className="pi-key">Sinal TX</span><span className="pi-val ok">{m.tx}</span></div>
                <div className="pi-row"><span className="pi-key">Sinal RX</span><span className="pi-val ok">{m.rx}</span></div>
                <div className="pi-hint">
                  {(chipStates[selChip] || 'ok') === 'bad' ? '⚠️ Sinal CO/CLK interrompido. Verifique capacitores de acoplamento de 100nF e faça reflow no chip.' : '✓ Comunicação e circuitos lógicos operando normalmente.'}
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--dim)', fontFamily: 'monospace', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
                ← Clique em um chip na PCB para inspecionar
              </div>
            )}
          </div>
        </div>
      </div>
    </div>}

    {/* P2 - CIRCUITOS PSU */}
    {activePage === 'p2' && <div>
      <div className="section-heading">FLUXO DE ALIMENTAÇÃO DA HASHBOARD</div>
      <div className="card">
        <div className="card-title">🔌 Diagrama de Força</div>
        <div className="psu-flow">
          <div className="psu-block">
            <div className="psu-val">220V AC</div>
            <div className="psu-lbl">TOMADA</div>
          </div>
          <div className="psu-arrow">→</div>
          <div className="psu-block" style={{ borderColor: C.accent }}>
            <div className="psu-val">APW12 PSU</div>
            <div className="psu-lbl">12V-15V OUT</div>
          </div>
          <div className="psu-arrow">→</div>
          <div className="psu-block" style={{ borderColor: C.blue }}>
            <div className="psu-val">HASHBOARD</div>
            <div className="psu-lbl">DOMÍNIOS SÉRIE</div>
          </div>
          <div className="psu-arrow">→</div>
          <div className="psu-block" style={{ borderColor: C.green }}>
            <div className="psu-val">LDOs 1.2V/1.8V</div>
            <div className="psu-lbl">SINAIS LÓGICOS</div>
          </div>
        </div>
      </div>

      <div className="section-heading">TABELA MESTRE DE TENSÕES E FIXTURE</div>
      <div className="card blue" style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr><th>Modelo</th><th>Chip</th><th>V Entrada</th><th>V/Domínio</th><th>LDO 1.x</th><th>PLL 0.8V</th><th>Boost</th></tr>
          </thead>
          <tbody>
            <tr><td>S9/T9+</td><td>BM1387</td><td>12V</td><td>0.40V</td><td>1.8V</td><td>0.8V</td><td>14V</td></tr>
            <tr><td>S17/T17</td><td>BM1397</td><td>18.5V</td><td>1.55V</td><td>1.8V</td><td>0.8V</td><td>19V</td></tr>
            <tr><td>S19/T19</td><td>BM1398</td><td>14V</td><td>0.36V</td><td>1.8V</td><td>0.8V</td><td>19V</td></tr>
            <tr><td>S19j Pro</td><td>BM1362</td><td>15V</td><td>0.32V</td><td>1.2V</td><td>0.8V</td><td>20V</td></tr>
            <tr><td>S19 XP</td><td>BM1366</td><td>14V</td><td>1.35V</td><td>1.2V</td><td>0.8V</td><td>19V</td></tr>
            <tr><td>S21/T21</td><td>BM1368</td><td>14.5V</td><td>1.00V</td><td>1.2V</td><td>0.8V</td><td>20V</td></tr>
          </tbody>
        </table>
      </div>
    </div>}

    {/* P3 - SINAIS COM */}
    {activePage === 'p3' && <div>
      <div className="section-heading">DIAGRAMA DE PROTOCOLO UART DAISY-CHAIN</div>
      <div className="card">
        <div className="sig-diagram">
          <div className="srow">
            <div className="sname" style={{ color: '#39ff14' }}>CLK</div>
            <div style={{ flex: 1, background: 'rgba(57,255,20,0.1)', height: 14, borderLeft: '2px solid #39ff14', padding: '0 6px' }}>CLK (Oscilador 25MHz) ──→ chip 01 ──→ chip 02 ──→</div>
            <div className="svolt">0.7V-1.3V</div>
          </div>
          <div className="srow">
            <div className="sname" style={{ color: '#00d4ff' }}>TX/CO</div>
            <div style={{ flex: 1, background: 'rgba(0,212,255,0.1)', height: 14, borderLeft: '2px solid #00d4ff', padding: '0 6px' }}>TX/CO (Comandos) ──→ chip 01 ──→ chip 02 ──→</div>
            <div className="svolt">1.8V / 1.2V</div>
          </div>
          <div className="srow">
            <div className="sname" style={{ color: '#ff8c00' }}>RX/RI</div>
            <div style={{ flex: 1, background: 'rgba(255,140,0,0.1)', height: 14, borderRight: '2px solid #ff8c00', padding: '0 6px', textAlign: 'right' }}>←── chip 02 ←── chip 01 ←── RX/RI (Retorno/Respostas)</div>
            <div className="svolt">1.8V / 1.2V</div>
          </div>
          <div className="srow">
            <div className="sname" style={{ color: '#ff3b3b' }}>RST</div>
            <div style={{ flex: 1, background: 'rgba(255,59,59,0.1)', height: 14, borderLeft: '2px solid #ff3b3b', padding: '0 6px' }}>RST (Reset da chain) ──→ chip 01 ──→ chip 02 ──→</div>
            <div className="svolt">1.8V / 1.2V</div>
          </div>
        </div>
      </div>

      <div className="card blue">
        <div className="card-title">🔍 Level Shifters e Proteção de IO</div>
        <div className="code">
{`U1 (RST level shifter): Converte sinal de 3.3V da controladora para 1.8V/1.2V da hashboard.
U2 (RX level shifter): Converte o retorno de 1.8V/1.2V da hashboard de volta para 3.3V para a controladora.
Se U1/U2 queimarem por curto, a controladora não detecta nenhum chip (ASIC=0).`}
        </div>
      </div>
    </div>}

    {/* P4 - CHIPS ASIC */}
    {activePage === 'p4' && <div>
      <div className="section-heading">FICHA TÉCNICA DOS CHIPS ASIC DE MINERAÇÃO</div>
      <div className="grid-2">
        <div className="card">
          <div className="card-title">⚡ Bitmain BM1398 (Geração S19/T19)</div>
          <table className="tbl">
            <tbody>
              <tr><td>Litografia</td><td>Samsung 7nm LPP</td></tr>
              <tr><td>Package</td><td>BGA Reworkable</td></tr>
              <tr><td>Vcore nominal</td><td>0.36V</td></tr>
              <tr><td>Tensão de Sinais</td><td>1.8V (CLK, CO, RI, RST)</td></tr>
              <tr><td>Sensibilidade ESD</td><td className="warn">Alta (requer pulseira)</td></tr>
            </tbody>
          </table>
        </div>

        <div className="card blue">
          <div className="card-title">⚡ Bitmain BM1366 (Geração S19 XP / S19k Pro)</div>
          <table className="tbl">
            <tbody>
              <tr><td>Litografia</td><td>TSMC 5nm FinFET</td></tr>
              <tr><td>Variantes</td><td>BM1366AL (XP) / BM1366BS (kPro)</td></tr>
              <tr><td>Vcore nominal</td><td>1.15V-1.35V (Domínio)</td></tr>
              <tr><td>Tensão de Sinais</td><td className="warn">1.2V (Cuidado!)</td></tr>
              <tr><td>Sensibilidade ESD</td><td className="bad">Altíssima (5nm!)</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>}

    {/* P5 - TROUBLESHOOT */}
    {activePage === 'p5' && <div>
      <div className="section-heading">ÁRVORE DE DECISÃO E TROUBLESHOOTING</div>
      <div className="card red">
        <div className="card-title">🔴 ASIC = 0 (Nenhum chip encontrado)</div>
        <div className="code">
{`1. Medir alimentação principal nos bornes: tem 12V/14V?
   ├─ Não: Problema no PSU APW12 ou curto total nos barramentos.
   └─ Sim: Medir tensão do domínio 01 (primeiro chip).
2. Medir tensões LDO e PLL do Domínio 01:
   ├─ LDO (1.8V ou 1.2V conforme modelo): presente?
   ├─ PLL (0.8V): presente?
   └─ Se ausentes: substitua o regulador de tensão (LDO) ou verifique curto.
3. Checar sinal CLK no pino de teste do chip 01:
   ├─ Ausente: Cristal Y1 de 25MHz quebrado ou sem alimentação.
   └─ OK: Checar sinal RST e TX da controladora (nível lógico 1.8V/1.2V).`}
        </div>
      </div>

      <div className="card">
        <div className="card-title">⚙️ Checklists de Reflow e Substituição BGA</div>
        <div className="grid-2">
          <div>
            <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 8, color: C.green }}>REFLOW (Chip Falso Contato)</div>
            <ul className="checklist">
              <li><span className="chk done">✓</span> Aplicar fluxo líquido no-clean</li>
              <li><span className="chk">□</span> Pré-aquecer placa a 150°C</li>
              <li><span className="chk">□</span> Aplicar ar quente a 240°C por 30s</li>
              <li><span className="chk">□</span> Aguardar resfriamento natural</li>
            </ul>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 8, color: C.red }}>TROCA COMPLETA (Reballing)</div>
            <ul className="checklist">
              <li><span className="chk done">✓</span> Remover chip antigo na BGA Station</li>
              <li><span className="chk">□</span> Limpar pads com malha de dessolda</li>
              <li><span className="chk">□</span> Fazer reballing com stencil e esferas de chumbo</li>
              <li><span className="chk">□</span> Soldar novo chip alinhando pino 01</li>
            </ul>
          </div>
        </div>
      </div>
    </div>}

    {/* P8 - ANÁLISE DE LOGS */}
    {activePage === 'p8' && <div>
      <div className="section-heading">📋 GUIA DE ANÁLISE DE LOGS (Vnish, Braiins OS e Bitmain)</div>
      
      <div className="card purple">
        <div className="card-title">🖥️ Bitmain (Stock / Firmware Original)</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          <div style={{ marginBottom: 10 }}>
            <b style={{ color: C.red }}>• Chain [X] only find 0 asics:</b> Nenhuma comunicação na placa X. O circuito daisy-chain está cortado no primeiro chip.
            <div style={{ color: C.muted, marginLeft: 10 }}><i>Ação:</i> Verificar conector de dados, level shifters U1/U2/U4, ou LDO de 1.8V/1.2V do chip 01.</div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <b style={{ color: C.amber }}>• Chain [X] find 37 asics (de 76):</b> A comunicação está morrendo a partir do chip 38.
            <div style={{ color: C.muted, marginLeft: 10 }}><i>Ação:</i> O chip 37 consegue transmitir (CO), mas o chip 38 não recebe ou não responde (RI). Faça reflow ou troca do chip 38.</div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <b style={{ color: C.red }}>• Read temp sensor failed / Sensor error:</b> A controladora perdeu comunicação com os sensores de temperatura.
            <div style={{ color: C.muted, marginLeft: 10 }}><i>Ação:</i> Testar barramento I2C, os resistores de pull-up do circuito e a linha de 3.3V de alimentação dos sensores NTC.</div>
          </div>
        </div>
      </div>

      <div className="card blue">
        <div className="card-title">⚡ Vnish Firmware</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          <div style={{ marginBottom: 10 }}>
            <b style={{ color: C.red }}>• Chain [X] - 0 asic found:</b> Hashboard inteira offline.
            <div style={{ color: C.muted, marginLeft: 10 }}><i>Ação:</i> Checar se a fonte de alimentação do slot (APW12) está ligando ou se há curto total na entrada da hashboard.</div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <b style={{ color: C.amber }}>• ASIC: [X] failed:</b> O chip X falhou no autoteste interno ou gerou excesso de erros lógicos (erros de hardware HW).
            <div style={{ color: C.muted, marginLeft: 10 }}><i>Ação:</i> O chip X está instável ou danificado. Efetue reflow e, se persistirem os erros na tela, substitua o chip.</div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <b style={{ color: C.red }}>• Voltage error / Lost connection to PSU:</b> Falha de comunicação serial I2C da controladora com a fonte inteligente.
            <div style={{ color: C.muted, marginLeft: 10 }}><i>Ação:</i> Verificar o conector da fonte ou a fonte APW12.</div>
          </div>
        </div>
      </div>

      <div className="card green">
        <div className="card-title">🧠 Braiins OS (BOS) / Braiins Firmware</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          <div style={{ marginBottom: 10 }}>
            <b style={{ color: C.red }}>• asic: init: board [X]: 0 asics found:</b> Nenhuma resposta na placa X.
          </div>
          <div style={{ marginBottom: 10 }}>
            <b style={{ color: C.amber }}>• asic: test: board [X]: asic #[Y] failed:</b> Teste do chip Y falhou.
            <div style={{ color: C.muted, marginLeft: 10 }}><i>Ação:</i> Substituir ou ressoldar o chip Y (indica falha física de contato ou de silício).</div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <b style={{ color: C.green }}>• tuner: board [X]: chip #[Y] underperforming, lowering frequency:</b> O otimizador dinâmico do Braiins detectou que o chip Y está instável (baixo desempenho) e abaixou a frequência dele automaticamente para evitar travamentos.
            <div style={{ color: C.muted, marginLeft: 10 }}><i>Ação:</i> Se a placa estiver rendendo poucos TH/s, este chip Y sob frequência reduzida é o culpado e deve ser substituído.</div>
          </div>
        </div>
      </div>
    </div>}

    {/* P6 - DRIVE */}
    {activePage === 'p6' && <div>
      <div className="section-heading">DOCUMENTOS COMPARTILHADOS NO SEU GOOGLE DRIVE</div>
      <div className="card">
        <div className="ftree">
          <div><span className="ft-folder">📁 MIning ish/</span></div>
          <div className="ft-indent">
            <div><span className="ft-folder">📁 ANTMINER guides/</span></div>
            <div className="ft-indent">
              <div><span className="ft-file star">★ S21 XP User Guide-V1.1.0.pdf</span><span className="ft-desc">(Inglês com esquemáticos completos)</span></div>
              <div><span className="ft-file pdf">S21&T21维修指导V1.2.pdf</span><span className="ft-desc">(Manual de conserto do chip BM1368)</span></div>
              <div><span className="ft-file pdf">S19J-PRO维修指导.pdf</span><span className="ft-desc">(Manual do chip BM1362 - 126 chips)</span></div>
              <div><span className="ft-file pdf">S19维修指导V1.1.pdf</span><span className="ft-desc">(Manual do chip BM1398)</span></div>
              <div><span className="ft-file star">★ PIC programming tools.zip</span><span className="ft-desc">(Software + HEX de gravação do PIC)</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>}

    {/* P7 - FONTES */}
    {activePage === 'p7' && <div>
      <div className="section-heading">FONTES EXTERNAS E LINKS ÚTEIS</div>
      <div className="link-list">
        <div className="link-item">
          <div className="lbadge lb-orange">ZEUSBTC</div>
          <div className="linfo">
            <div className="ltitle">S19 Hash Board Repair Guide — BM1398</div>
            <div className="ldesc">Guia oficial passo a passo de diagnóstico e testes do S19 de ZeusBTC.</div>
            <a className="lurl" href="https://www.zeusbtc.com/manuals/Antminer-S19-Hash-Board-Repair-Guide.asp" target="_blank" rel="noreferrer">zeusbtc.com/manuals/Antminer-S19-Hash-Board-Repair-Guide.asp</a>
          </div>
        </div>
        <div className="link-item">
          <div className="lbadge lb-green">D-CENTRAL</div>
          <div className="linfo">
            <div className="ltitle">Antminer S19 Complete Maintenance & Repair Guide</div>
            <div className="ldesc">Manual completo com foco em integridade térmica, APW12 e troca de chips.</div>
            <a className="lurl" href="https://d-central.tech/manuals/antminer-s19-maintenance-repair-guide/" target="_blank" rel="noreferrer">d-central.tech/manuals/antminer-s19-maintenance-repair-guide/</a>
          </div>
        </div>
      </div>
    </div>}
  </div>;
}
