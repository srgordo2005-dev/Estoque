import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';

// Sub-component for animated live waveform drawing
function OscilloscopeWaveform({ signal }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;
    let offset = 0;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#39ff14'; // neon green trace
      ctx.lineWidth = 1.5;
      
      // Draw grid lines
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.1)';
      ctx.lineWidth = 0.5;
      for (let i = 10; i < canvas.width; i += 15) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
      }
      for (let j = 10; j < canvas.height; j += 15) {
        ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(canvas.width, j); ctx.stroke();
      }
      
      ctx.strokeStyle = '#39ff14';
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      const isCLK = signal.includes('CLK') || signal.includes('Clock') || signal.includes('25 MHz');
      const isRST = signal.includes('RST') || signal.includes('Reset');

      for (let x = 0; x < canvas.width; x++) {
        let y;
        if (isCLK) {
          // Fast continuous clock (sine wave simulation)
          y = canvas.height / 2 + Math.sin((x + offset) * 0.18) * 15;
        } else if (isRST) {
          // Steady high level
          y = canvas.height / 2 - 12;
        } else {
          // Data packet (Command/RX) square pulse
          const cycle = Math.floor((x + offset) / 14) % 2;
          const noise = Math.sin(x * 0.6) * 1.5;
          y = canvas.height / 2 + (cycle === 0 ? -12 : 12) + noise;
        }
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      offset += 1.8;
      animationId = requestAnimationFrame(draw);
    };
    draw();

    return () => cancelAnimationFrame(animationId);
  }, [signal]);

  return <canvas ref={canvasRef} width={200} height={50} style={{ background: '#03060d', borderRadius: 4, border: '1px solid #1a2c49', display: 'block', marginTop: 6 }} />;
}

export default function GuiaTecnicoPage({ ctx, C, Tag }) {
  const [activeModule, setActiveModule] = useState('mod0');
  const [searchQuery, setSearchQuery] = useState('');
  const [curModel, setCurModel] = useState('s19jpro');
  const [selChip, setSelChip] = useState(null);
  const [chipStates, setChipStates] = useState({});
  const [simulatedFault, setSimulatedFault] = useState(null);
  const [showDom, setShowDom] = useState(true);
  const [animOn, setAnimOn] = useState(true);
  const [sigVis, setSigVis] = useState({ clk: true, tx: true, rx: true, bo: true, rst: true });
  
  // State for 3D visualizer raycast click selection
  const [selected3DComponent, setSelected3DComponent] = useState(null);

  const canvas3DRef = useRef(null);

  const S19_FAMILY = [
    { model: 'S19 (95T / 90T)', code: 'BHB2856 / BB-2856F', type: 'Fibra (PCB)', chip: 'BM1398' },
    { model: 'S19 (Placa de Alumínio)', code: 'BB-2856A / BHB2856A', type: 'Alumínio', chip: 'BM1398' },
    { model: 'S19 Pro (110T)', code: 'BHB2858 / BHB2858D', type: 'Fibra (PCB)', chip: 'BM1398' },
    { model: 'S19j', code: 'BHB2866', type: 'Fibra (PCB)', chip: 'BM1362' },
    { model: 'S19j Pro', code: 'BHB28682 / BB-2868 / BHB2868', type: 'Fibra (PCB)', chip: 'BM1362' },
    { model: 'S19j Pro+', code: 'BHB28685 / BHB28688', type: 'Fibra (PCB)', chip: 'BM1362' },
    { model: 'S19j L', code: 'BHB2866A / BHB2868A', type: 'Alumínio', chip: 'BM1362' },
    { model: 'S19k Pro', code: 'BHB56902 / BHB56903', type: 'Alumínio', chip: 'BM1368' },
    { model: 'S19 XP', code: 'BHB42801 / BHB42831', type: 'Alumínio', chip: 'BM1366' },
    { model: 'S19 XP Pro', code: 'BHB56801', type: 'Alumínio', chip: 'BM1366' },
    { model: 'S19a', code: 'BHB2876', type: 'Fibra (PCB)', chip: 'BM1398AC' },
    { model: 'S19a Pro', code: 'BHB2878', type: 'Fibra (PCB)', chip: 'BM1398AC' },
    { model: 'S19al', code: 'BHB2856A_AL / BHB2858A', type: 'Alumínio', chip: 'BM1398' },
    { model: 'T19', code: 'BHB2836', type: 'Fibra (PCB)', chip: 'BM1398' },
    { model: 'S19 Hydro', code: 'BHB2856H', type: 'Hidro (Bloco de Água)', chip: 'BM1398' },
    { model: 'S19 Pro+ Hydro', code: 'BHB38801 / BHB38811', type: 'Hidro (Bloco de Água)', chip: 'BM1366' },
    { model: 'S19 XP Hydro', code: 'BHB42821 / BHB42851', type: 'Hidro (Bloco de Água)', chip: 'BM1366' }
  ];

  const MODERN_FAMILY = [
    { model: 'S23 / S23 Hyd.', code: 'Linha S23 Series', type: 'SHA-256 (Bitcoin)', chip: 'Nova Geração BMU3' },
    { model: 'S23H', code: 'S23 Hydro High-Density', type: 'SHA-256 (Bitcoin)', chip: 'Nova Geração BM' },
    { model: 'S21 / S21 Ultra', code: 'BHB68601 / BHB68603', type: 'SHA-256 (Bitcoin)', chip: 'BM1368' },
    { model: 'S21 XP Hyd.', code: 'BHB68612 / BHB68620', type: 'SHA-256 (Bitcoin)', chip: 'BM1368 XP' },
    { model: 'L9', code: 'BLB68101', type: 'Scrypt (LTC/DOGE)', chip: 'BM1489' },
    { model: 'L7', code: 'BLB2881 / BLB2882', type: 'Scrypt (LTC/DOGE)', chip: 'BM1489' },
    { model: 'KS7', code: 'BKB68201', type: 'kHeavyHash (Kaspa)', chip: 'BM1724' },
    { model: 'KS5 / KS5 Pro', code: 'BKB68101', type: 'kHeavyHash (Kaspa)', chip: 'BM1724' },
    { model: 'KS3', code: 'BKB2881', type: 'kHeavyHash (Kaspa)', chip: 'BM1720' },
    { model: 'E11', code: 'BEB68101', type: 'Ethash/Etchash (ETC)', chip: 'BM1762' },
    { model: 'E9 / E9 Pro', code: 'BEB2881', type: 'Ethash/Etchash (ETC)', chip: 'BM1760' }
  ];

  const filterList = (list) => {
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(item => 
      item.model.toLowerCase().includes(q) ||
      item.code.toLowerCase().includes(q) ||
      item.type.toLowerCase().includes(q) ||
      item.chip.toLowerCase().includes(q)
    );
  };

  const MODELS_DATA = {
    s9:     { name: 'S9/T9+ · BM1387', chip: 'BM1387', chips: 63, dom: 21, cpd: 3, vIn: '12V', vDom: '0.4V', ldo: '1.8V', pll: '0.8V', boost: '14V (6 dom)', fx: '12V APW3++', clk: '0.9V', tx: '1.8V', rx: '1.6–1.8V', rst: '1.8V', bo: '0V/pulso', rows: 3, cols: 21, bW: 700, bH: 175, desc: '16nm FinFET TSMC. QFN (não BGA). 21 domínios × 3 chips. Padrão de aprendizado.' },
    s9k:    { name: 'S9k/S9se · BM1387B', chip: 'BM1387B', chips: 60, dom: 6, cpd: 10, vIn: '9.6V', vDom: '1.6V', ldo: '1.8V', pll: '0.8V', boost: '—', fx: '12V', clk: '0.9V', tx: '1.8V', rx: '1.6–1.8V', rst: '1.8V', bo: '0V/pulso', rows: 3, cols: 20, bW: 680, bH: 175, desc: '16nm. 6 domínios × 10 chips. 2 cristais + 2 sensores temperatura.' },
    l3:     { name: 'L3+ · BM1485 (SCRYPT)', chip: 'BM1485', chips: 72, dom: 12, cpd: 6, vIn: '8.8V', vDom: '0.7V', ldo: '1.8V', pll: '0.8V', boost: '—', fx: '8.8V', clk: '0.9V', tx: '1.8V', rx: '1.6–1.8V', rst: '1.8V', bo: 'pulso', rows: 4, cols: 18, bW: 680, bH: 200, desc: '28nm SCRYPT (Litecoin). 4 fileiras × 18 chips. 12 domínios × 6.' },
    s17:    { name: 'S17/T17 · BM1397', chip: 'BM1397', chips: 48, dom: 12, cpd: 4, vIn: '18.5V', vDom: '1.55V', ldo: '1.8V', pll: '0.8V', boost: '18.5V→19V', fx: '18.5V APW9+', clk: '0.9V', tx: '1.6–1.8V', rx: '1.6–1.8V', rst: '1.8V', bo: '0V', rows: 4, cols: 12, bW: 560, bH: 200, desc: '7nm. 48 chips / 12 domínios × 4. Geração problemática — heatsinks individuais.' },
    s17e:   { name: 'S17e/T17e · BM1396', chip: 'BM1396', chips: 135, dom: 15, cpd: 9, vIn: '18V', vDom: '1.2V', ldo: '1.8V', pll: '0.8V', boost: '19V', fx: '18V APW9+', clk: '0.9V', tx: '1.8V', rx: '1.8V', rst: '1.8V', bo: '0V', rows: 5, cols: 27, bW: 750, bH: 230, desc: '7nm. 135 chips / 15 domínios × 9. Maior board das gerações 17.' },
    s19:    { name: 'S19/T19 · BM1398', chip: 'BM1398', chips: 76, dom: 38, cpd: 2, vIn: '14V', vDom: '0.36V', ldo: '1.8V', pll: '0.8V', boost: '19V U9', fx: '14V', clk: '0.7–1.3V', tx: '1.8V', rx: '1.8V', rst: '1.8V', bo: '0V/pulso', rows: 4, cols: 19, bW: 720, bH: 200, desc: '7nm Samsung. 76 chips / 38 dom × 2. Mais confiável da Bitmain. 4 boards por miner.' },
    s19jpro:{ name: 'S19j Pro · BM1362', chip: 'BM1362', chips: 126, dom: 42, cpd: 3, vIn: '15V', vDom: '0.32V', ldo: '1.2V', pll: '0.8V', boost: '20V U238', fx: '15V', clk: '0.5–0.6V', tx: '1.2V', rx: '1.2V', rst: '1.2V', bo: '0V', rows: 6, cols: 21, bW: 750, bH: 260, desc: '7nm. 126 chips / 42 dom × 3. IO 1.2V (diferente!). Boost 20V.' },
    s19xp:  { name: 'S19 XP · BM1366AL', chip: 'BM1366AL', chips: 77, dom: 11, cpd: 7, vIn: '14V', vDom: '1.15V', ldo: '1.2V', pll: '0.8V', boost: '19V U178/MP2019', fx: '14V', clk: '0.5–0.6V', tx: '1.2V', rx: '1.2V', rst: '1.2V', bo: '0V', rows: 7, cols: 11, bW: 540, bH: 285, desc: 'TSMC 5nm. 77 chips / 11 dom × 7. ESD MUITO sensível. IO 1.2V.' },
    s21:    { name: 'S21/T21 · BM1368', chip: 'BM1368', chips: 84, dom: 14, cpd: 6, vIn: '14.5V', vDom: '1.0V', ldo: '1.2V', pll: '0.8V', boost: '20V', fx: '~15V', clk: '0.5–0.6V', tx: '1.2V', rx: '1.2V', rst: '1.2V', bo: '0V', rows: 6, cols: 14, bW: 650, bH: 250, desc: '5nm+. 84 chips / 14 dom × 6. 200+ TH/s. Geração mais recente.' },
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
    const fs = Math.floor(Math.random() * (m.chips - 12)) + 5;
    const fc = 1;
    const newStates = {};
    for (let i = 0; i < m.chips; i++) {
      if (i < fs) newStates[i] = 'ok';
      else if (i === fs) newStates[i] = 'bad';
      else newStates[i] = 'warn';
    }
    setChipStates(newStates);
    setSimulatedFault({ fs, fc });
    setSelChip(fs);
  };

  const clearFaults = () => {
    setChipStates({});
    setSimulatedFault(null);
    setSelChip(null);
  };

  const selectModel = (key) => {
    setCurModel(key);
    setSelChip(null);
    setChipStates({});
    setSimulatedFault(null);
  };

  // 3D WebGL render logic using Three.js inside useEffect
  useEffect(() => {
    if (activeModule !== 'mod9' || !canvas3DRef.current) return;

    const width = canvas3DRef.current.clientWidth || 500;
    const height = 350;

    // Create scene, camera, renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080c16);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 5, 7);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    canvas3DRef.current.appendChild(renderer.domElement);

    // Lights
    const amb = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(amb);

    const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dir1.position.set(5, 10, 5);
    scene.add(dir1);

    const dir2 = new THREE.DirectionalLight(0x00d4ff, 0.35); // futuristic blue reflection
    dir2.position.set(-5, -5, -5);
    scene.add(dir2);

    // Procedural Hashboard board group
    const boardGroup = new THREE.Group();

    // Green PCB mesh
    const boardGeom = new THREE.BoxGeometry(6, 0.1, 2.2);
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x0c2512, roughness: 0.7, metalness: 0.1 });
    const boardMesh = new THREE.Mesh(boardGeom, boardMat);
    boardGroup.add(boardMesh);

    const interactiveObjects = [];

    // Render ASICs (Chips) on the board in 3D
    const chipGeom = new THREE.BoxGeometry(0.32, 0.06, 0.32);
    const chipMat = new THREE.MeshStandardMaterial({ color: 0x181a20, roughness: 0.3, metalness: 0.2 });
    
    // Grid alignment
    const columnsCount = 14;
    const rowsCount = 3;
    const chipSpacingX = 0.38;
    const chipSpacingZ = 0.6;

    for (let r = 0; r < rowsCount; r++) {
      for (let c = 0; c < columnsCount; c++) {
        const mesh = new THREE.Mesh(chipGeom, chipMat.clone());
        const x = -2.5 + c * chipSpacingX;
        const z = -0.6 + r * chipSpacingZ;
        mesh.position.set(x, 0.08, z);
        
        const chipIndex = r * columnsCount + c + 1;
        mesh.userData = {
          name: `Chip ASIC BM1362 #${chipIndex}`,
          pos: `U${chipIndex + 10} (Domínio ${Math.floor(chipIndex/3)+1})`,
          vNom: '0.32V DC',
          signal: 'CLK (Clock) / CO (TX) / RI (RX) / RST',
          fault: 'Se este chip falhar no circuito, a contagem lógica parará imediatamente antes dele. Requer teste osciloscópio no CLK e resolda.',
          type: 'chip'
        };
        boardGroup.add(mesh);
        interactiveObjects.push(mesh);
      }
    }

    // Level Shifters
    const lsGeom = new THREE.BoxGeometry(0.18, 0.05, 0.18);
    const lsMat = new THREE.MeshStandardMaterial({ color: 0x4f128c, roughness: 0.4 });
    
    const u1 = new THREE.Mesh(lsGeom, lsMat.clone());
    u1.position.set(-2.8, 0.06, -0.9);
    u1.userData = {
      name: 'Level Shifter U1 (RST)',
      pos: 'U1 / Próximo ao Conector IO',
      vNom: '1.20V DC',
      signal: 'Entrada: RST 3.3V / Saída: RST 1.2V',
      fault: 'Se U1 queimar por curto de inserção, a linha de reset não armará e a placa reportará zero chips (ASIC=0).',
      type: 'ls'
    };
    boardGroup.add(u1);
    interactiveObjects.push(u1);

    const u2 = new THREE.Mesh(lsGeom, lsMat.clone());
    u2.position.set(-2.8, 0.06, 0.9);
    u2.userData = {
      name: 'Level Shifter U2 (RI/RX)',
      pos: 'U2 / Próximo ao Conector IO',
      vNom: '3.30V DC',
      signal: 'Entrada: RI 1.2V / Saída: RI 3.3V',
      fault: 'Se U2 falhar, o sinal de retorno (Receive Input) não retrocederá à controladora, resultando em ASIC=0.',
      type: 'ls'
    };
    boardGroup.add(u2);
    interactiveObjects.push(u2);

    // Microcontrolador PIC
    const picGeom = new THREE.BoxGeometry(0.4, 0.05, 0.25);
    const picMat = new THREE.MeshStandardMaterial({ color: 0x222630, roughness: 0.4 });
    const picMesh = new THREE.Mesh(picGeom, picMat);
    picMesh.position.set(-2.8, 0.06, 0);
    picMesh.userData = {
      name: 'Microcontrolador PIC (U6)',
      pos: 'U6 / Próximo ao Bloco Lógico',
      vNom: '3.30V DC',
      signal: 'Barramento Lógico PIC_SDA / PIC_SCL',
      fault: 'Se o PIC U6 estiver desprogramado, queimado ou sem alimentação de 3.3V, a fonte inteligente APW12 não liberará a alimentação de alta tensão.',
      type: 'pic'
    };
    boardGroup.add(picMesh);
    interactiveObjects.push(picMesh);

    // LDOs de Domínio
    const ldoGeom = new THREE.BoxGeometry(0.15, 0.04, 0.22);
    const ldoMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3 });
    for (let d = 0; d < 8; d++) {
      const ldoMesh = new THREE.Mesh(ldoGeom, ldoMat.clone());
      ldoMesh.position.set(-1.8 + d * 0.65, 0.06, -0.9);
      ldoMesh.userData = {
        name: `Regulador LDO de Tensão de IO #${d + 1}`,
        pos: `U${d + 40} / Bloco de Domínio ${d + 1}`,
        vNom: '1.20V DC',
        signal: 'Entrada: VCC_1V2 / Saída: VDD_1V2',
        fault: 'A quebra do regulador LDO cessa o tráfego de sinais lógicos em todo o bloco de chips associado a ele.',
        type: 'ldo'
      };
      boardGroup.add(ldoMesh);
      interactiveObjects.push(ldoMesh);
    }

    scene.add(boardGroup);

    // Mouse drag rotation
    let isDragging = false;
    let prevMousePos = { x: 0, y: 0 };

    const onMouseDown = () => { isDragging = true; };
    const onMouseMove = (e) => {
      const deltaMove = {
        x: e.offsetX - prevMousePos.x,
        y: e.offsetY - prevMousePos.y
      };

      if (isDragging) {
        const deltaQuat = new THREE.Quaternion()
          .setFromEuler(new THREE.Euler(
            deltaMove.y * 0.006,
            deltaMove.x * 0.006,
            0,
            'XYZ'
          ));
        boardGroup.quaternion.multiplyQuaternions(deltaQuat, boardGroup.quaternion);
      }

      prevMousePos = { x: e.offsetX, y: e.offsetY };
    };
    const onMouseUp = () => { isDragging = false; };

    const canvasEl = renderer.domElement;
    canvasEl.addEventListener('mousedown', onMouseDown);
    canvasEl.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // Raycast selector click
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onCanvasClick = (e) => {
      const rect = canvasEl.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / canvasEl.clientWidth) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / canvasEl.clientHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(interactiveObjects);

      if (intersects.length > 0) {
        const clickedObj = intersects[0].object;

        // Reset colors
        interactiveObjects.forEach(obj => {
          if (obj.userData.type === 'chip') obj.material.color.setHex(0x181a20);
          else if (obj.userData.type === 'ls') obj.material.color.setHex(0x4f128c);
          else if (obj.userData.type === 'pic') obj.material.color.setHex(0x222630);
          else if (obj.userData.type === 'ldo') obj.material.color.setHex(0x0284c7);
        });

        // Highlight selected
        clickedObj.material.color.setHex(0xf7931a);
        setSelected3DComponent(clickedObj.userData);
      }
    };

    canvasEl.addEventListener('click', onCanvasClick);

    // Animation Loop
    let animationFrameId;
    const tick = () => {
      animationFrameId = requestAnimationFrame(tick);
      if (!isDragging) {
        boardGroup.rotation.y += 0.0015;
      }
      renderer.render(scene, camera);
    };
    tick();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      if (canvas3DRef.current) {
        canvas3DRef.current.innerHTML = '';
      }
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [activeModule, curModel]);

  const COURSE_MODULES = [
    { id: 'mod0', title: '🔍 MÓD. 0: BUSCADOR DE MODELOS', icon: '🔍' },
    { id: 'mod9', title: '🔌 MÓD. 9: VISUALIZADOR 3D INTERATIVO', icon: '📐' },
    { id: 'mod1', title: '🎓 MÓD. 1: ELETRÔNICA & ANATOMIA', icon: '⚡' },
    { id: 'mod2', title: '🔌 MÓD. 2: BANCADA E QUÍMICA', icon: '🖥️' },
    { id: 'mod3', title: '🔬 MÓD. 3: TESTES COM MULTÍMETRO', icon: '📐' },
    { id: 'mod4', title: '📟 MÓD. 4: JIGS E TESTADORES', icon: '🔌' },
    { id: 'mod5', title: '🖥️ MÓD. 5: SIMULADOR PCB INTERATIVO', icon: '🛠️' },
    { id: 'mod6', title: '📋 MÓD. 6: ANÁLISE COMPLETA DE LOGS', icon: '📄' },
    { id: 'mod7', title: '🌡️ MÓD. 7: OVERCLOCK & BYPASS NTC', icon: '🔥' },
    { id: 'mod8', title: '📂 MÓD. 8: DRIVE DE DOCUMENTAÇÕES', icon: '🔗' },
  ];

  return <div className="aula-tecnica-container" style={{ marginBottom: 100 }}>
    <style>{`
      .aula-tecnica-container {
        --bg: #07090e;
        --bg-panel: #0d121f;
        --bg-card: #131a2d;
        --border: #212c49;
        --border-active: #f7931a;
        --accent: #f7931a;
        --text: #c8d6e8;
        --bright: #ffffff;
        --dim: #64748b;
        --green: #22c55e;
        --red: #ef4444;
        --blue: #0ea5e9;
        --yellow: #eab308;
        --purple: #a855f7;
        background: var(--bg);
        color: var(--text);
        padding: 20px;
        border-radius: 12px;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        line-height: 1.6;
      }
      .course-header {
        background: linear-gradient(135deg, #050711 0%, #0e1828 50%, #050711 100%);
        border-bottom: 2px solid var(--accent);
        border-radius: 8px;
        padding: 24px;
        margin-bottom: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-shadow: 0 4px 30px rgba(247,147,26,0.15);
      }
      .ch-title {
        font-size: 24px;
        font-weight: 900;
        color: var(--bright);
        letter-spacing: 1px;
      }
      .ch-title span { color: var(--accent); }
      .ch-subtitle {
        font-size: 12px;
        color: var(--dim);
        margin-top: 6px;
        font-family: monospace;
      }
      .layout-grid {
        display: grid;
        grid-template-columns: 280px 1fr;
        gap: 20px;
      }
      @media(max-width: 900px) {
        .layout-grid { grid-template-columns: 1fr; }
      }
      .course-menu {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .menu-btn {
        background: var(--bg-panel);
        border: 1px solid var(--border);
        padding: 12px 14px;
        border-radius: 6px;
        color: var(--text);
        text-align: left;
        font-size: 11.5px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: all 0.15s ease-in-out;
      }
      .menu-btn:hover {
        background: var(--bg-card);
        border-color: var(--dim);
      }
      .menu-btn.active {
        background: rgba(247,147,26,0.12);
        border-color: var(--accent);
        color: var(--accent);
        box-shadow: inset 3px 0 0 var(--accent);
      }
      .course-content {
        background: var(--bg-panel);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 24px;
        min-height: 500px;
      }
      .module-title {
        font-size: 18px;
        font-weight: 800;
        color: var(--accent);
        border-bottom: 1.5px solid var(--border);
        padding-bottom: 10px;
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .card {
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 16px;
        margin-bottom: 16px;
        position: relative;
      }
      .card::before {
        content: '';
        position: absolute;
        top: 0; left: 0; width: 3px; height: 100%;
        background: var(--accent);
        border-radius: 6px 0 0 6px;
      }
      .card.blue::before { background: var(--blue); }
      .card.green::before { background: var(--green); }
      .card.red::before { background: var(--red); }
      .card.purple::before { background: var(--purple); }
      
      .card-title {
        font-size: 13px;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--accent);
        margin-bottom: 12px;
      }
      .card.blue .card-title { color: var(--blue); }
      .card.green .card-title { color: var(--green); }
      .card.red .card-title { color: var(--red); }
      .card.purple .card-title { color: var(--purple); }

      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      @media(max-width: 768px) {
        .grid-2 { grid-template-columns: 1fr; }
      }
      
      .code-block {
        background: #04060b;
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 14px;
        font-family: 'Share Tech Mono', monospace;
        font-size: 12px;
        color: var(--green);
        white-space: pre-wrap;
        line-height: 1.6;
      }
      .code-block .keyword { color: var(--accent); font-weight: bold; }
      .code-block .comment { color: #475569; }
      .code-block .value { color: var(--blue); }
      .code-block .warn { color: var(--red); }

      .warn-box {
        background: rgba(239,68,68,0.06);
        border: 1px solid rgba(239,68,68,0.3);
        border-radius: 6px;
        padding: 12px 16px;
        margin: 14px 0;
        font-size: 13px;
        color: #fca5a5;
      }
      .info-box {
        background: rgba(14,165,233,0.06);
        border: 1px solid rgba(14,165,233,0.3);
        border-radius: 6px;
        padding: 12px 16px;
        margin: 14px 0;
        font-size: 13px;
        color: #7dd3fc;
      }
      .tip-box {
        background: rgba(34,197,94,0.06);
        border: 1px solid rgba(34,197,94,0.3);
        border-radius: 6px;
        padding: 12px 16px;
        margin: 14px 0;
        font-size: 13px;
        color: #86efac;
      }

      .tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
      .tbl th {
        background: rgba(247,147,26,0.08);
        color: var(--accent);
        padding: 8px 12px;
        text-align: left;
        border-bottom: 1.5px solid var(--border);
        font-size: 10px;
        text-transform: uppercase;
      }
      .tbl td {
        padding: 8px 12px;
        border-bottom: 1px solid rgba(30,41,64,0.3);
        color: var(--text);
      }
      .tbl tr:hover td { background: rgba(255,255,255,0.02); }

      .pcb-board {
        background: linear-gradient(145deg, #132413, #091309);
        border: 3px solid #203c20;
        border-radius: 8px;
        position: relative;
        overflow: hidden;
        box-shadow: 0 0 30px rgba(0,255,0,0.1), inset 0 0 30px rgba(0,0,0,0.6);
      }
      .chip {
        position: absolute;
        border-radius: 2px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 8px;
        font-weight: 800;
        transition: all 0.1s ease-in-out;
        z-index: 4;
        border: 1px solid;
      }
      .chip:hover { transform: scale(1.2); z-index: 10; }
      .chip.ok { background: rgba(20,80,20,0.9); border-color: #2e602e; color: #a3e635; }
      .chip.ok:hover { background: rgba(34,197,94,0.25); border-color: var(--green); color: #fff; }
      .chip.sel { background: rgba(34,197,94,0.35); border-color: var(--green); box-shadow: 0 0 10px var(--green); color: #fff; }
      .chip.bad { background: rgba(120,20,20,0.9); border-color: #b91c1c; color: #fca5a5; animation: pulse-bad 1.5s infinite; }
      .chip.bad:hover { background: rgba(239,68,68,0.25); border-color: var(--red); color: #fff; }
      .chip.warn { background: rgba(100,70,10,0.9); border-color: #a16207; color: #fde047; }
      .chip.warn:hover { background: rgba(234,179,8,0.25); border-color: var(--yellow); color: #fff; }
      
      .chip-label { font-size: 7.5px; font-weight: 900; pointer-events: none; }
      .pcb-conn {
        position: absolute;
        border-radius: 3px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 7px;
        font-weight: 700;
        z-index: 5;
        font-family: monospace;
      }
      .pcb-conn.pwr { background: #3b1e11; border: 1.5px solid var(--accent); color: var(--accent); }
      .pcb-conn.io { background: #112240; border: 1.5px solid var(--blue); color: var(--blue); }
      .pcb-comp {
        position: absolute;
        border-radius: 2px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 6px;
        font-weight: 800;
        z-index: 3;
        font-family: monospace;
      }
      .pcb-comp.cryst { background: rgba(80,0,80,0.85); border: 1px solid var(--purple); color: var(--purple); }
      .pcb-comp.boost { background: rgba(120,60,0,0.85); border: 1px solid var(--accent); color: var(--accent); }
      .pcb-comp.temp { background: rgba(0,80,80,0.85); border: 1px solid #06b6d4; color: #22d3ee; }
      
      @keyframes pulse-bad {
        0%, 100% { box-shadow: 0 0 3px var(--red); }
        50% { box-shadow: 0 0 10px var(--red); }
      }
      .trace-svg { position: absolute; top:0; left:0; pointer-events: none; z-index: 2; }
      .tr-clk { animation: flow-fwd 1.5s linear infinite; }
      .tr-tx { animation: flow-fwd 2s linear infinite; }
      .tr-rx { animation: flow-rev 2s linear infinite; }
      .tr-bo { animation: flow-fwd 3s linear infinite; }
      .tr-rst { animation: flow-fwd 4s linear infinite; }
      @keyframes flow-fwd { from { stroke-dashoffset: 160 } to { stroke-dashoffset: 0 } }
      @keyframes flow-rev { from { stroke-dashoffset: 0 } to { stroke-dashoffset: 160 } }

      .checklist { list-style: none; }
      .checklist li {
        padding: 6px 0;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        display: flex;
        align-items: flex-start;
        gap: 10px;
        font-size: 12.5px;
      }
      .chk {
        flex-shrink: 0;
        width: 15px;
        height: 15px;
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
      .chk.done { background: rgba(34,197,94,0.15); }
      
      .link-list { display: flex; flex-direction: column; gap: 8px; }
      .link-item {
        display: flex;
        gap: 12px;
        padding: 12px;
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 6px;
      }
      .lbadge {
        font-size: 8px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 2px;
        text-transform: uppercase;
        height: fit-content;
      }
      .lb-blue { background: rgba(14,165,233,0.1); border: 1px solid var(--blue); color: var(--blue); }
      .lb-orange { background: rgba(247,147,26,0.1); border: 1px solid var(--accent); color: var(--accent); }
      .lb-green { background: rgba(34,197,94,0.1); border: 1px solid var(--green); color: var(--green); }
      .lb-red { background: rgba(239,68,68,0.1); border: 1px solid var(--red); color: var(--red); }
      .lurl { display: block; color: var(--blue); font-size: 10px; margin-top: 4px; text-decoration: none; word-break: break-all; }
      .lurl:hover { text-decoration: underline; }
      
      .ftree { font-size: 12px; line-height: 1.8; }
      .ft-folder { color: var(--blue); font-weight: 700; }
      .ft-file { color: var(--text); }
      .ft-file.star { color: var(--green); font-weight: 700; }
      .ft-file.pdf { color: #fca5a5; }
      .ft-indent { padding-left: 18px; }
      .ft-desc { color: var(--dim); font-size: 10px; margin-left: 6px; }
      .search-box-wrap {
        margin-bottom: 20px;
        position: relative;
      }
      .search-input {
        width: 100%;
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 12px 16px 12px 40px;
        color: var(--bright);
        font-size: 13.5px;
        outline: none;
        transition: all 0.15s ease-in-out;
      }
      .search-input:focus {
        border-color: var(--accent);
        box-shadow: 0 0 8px rgba(247,147,26,0.2);
      }
      .search-icon {
        position: absolute;
        left: 14px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--dim);
        font-size: 14px;
        pointer-events: none;
      }
      .pi-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        font-size: 12.5px;
      }
      .pi-key {
        color: var(--dim);
      }
      .pi-val {
        color: var(--bright);
        font-family: monospace;
      }
      .pi-val.ok {
        color: var(--green);
        font-weight: bold;
      }
    `}</style>

    <div className="course-header">
      <div>
        <div className="ch-title">AULA MASTER: <span>REPARO DE HASHBOARDS</span></div>
        <div className="ch-subtitle">Curso Completo & Simulador de Falhas Dicotômicas Integrado</div>
      </div>
      <Tag color={C.accent} small>CURSO TÉCNICO</Tag>
    </div>

    <div className="layout-grid">
      <div className="course-menu">
        {COURSE_MODULES.map(mod => (
          <button
            key={mod.id}
            className={`menu-btn ${activeModule === mod.id ? 'active' : ''}`}
            onClick={() => {
              setActiveModule(mod.id);
              if (mod.id !== 'mod5') clearFaults();
            }}
          >
            <span>{mod.icon}</span> {mod.title}
          </button>
        ))}
      </div>

      <div className="course-content">
        {/* MODULO 0: TABELA DE MODELOS & PCB */}
        {activeModule === 'mod0' && <div>
          <div className="module-title">🔍 MÓDULO 0: Mapeamento de Modelos, Placas e ASICs</div>
          
          <div className="search-box-wrap">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="Digite o modelo da máquina, código da placa ou modelo de chip... (ex: S19j, BHB2868, BM1362)"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Categoria 1 */}
          {filterList(S19_FAMILY).length > 0 && (
            <div className="card blue" style={{ overflowX: 'auto' }}>
              <div className="card-title">1. Família Antminer S19 (Todas as Variantes e Modelos Hydro)</div>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Modelo da Máquina (Antminer)</th>
                    <th>Código/Modelo da Placa (Hashboard)</th>
                    <th>Tipo de Placa / Resfriamento</th>
                    <th>Chip Utilizado</th>
                  </tr>
                </thead>
                <tbody>
                  {filterList(S19_FAMILY).map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 'bold', color: 'var(--bright)' }}>{item.model}</td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{item.code}</td>
                      <td>{item.type}</td>
                      <td style={{ fontWeight: 'bold', color: 'var(--blue)' }}>{item.chip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Categoria 2 */}
          {filterList(MODERN_FAMILY).length > 0 && (
            <div className="card green" style={{ overflowX: 'auto' }}>
              <div className="card-title">2. Linha Ultra Moderna e Atual (S21, S23 e Outros Algoritmos)</div>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Modelo da Máquina (Antminer)</th>
                    <th>Código/Modelo da Placa (Hashboard)</th>
                    <th>Algoritmo / Moeda</th>
                    <th>Chip Utilizado</th>
                  </tr>
                </thead>
                <tbody>
                  {filterList(MODERN_FAMILY).map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 'bold', color: 'var(--bright)' }}>{item.model}</td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{item.code}</td>
                      <td>{item.type}</td>
                      <td style={{ fontWeight: 'bold', color: 'var(--blue)' }}>{item.chip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filterList(S19_FAMILY).length === 0 && filterList(MODERN_FAMILY).length === 0 && (
            <div style={{ color: 'var(--dim)', textAlign: 'center', padding: '40px 0', fontSize: 13.5 }}>
              Nenhum modelo encontrado correspondente a "{searchQuery}".
            </div>
          )}
        </div>}

        {/* MODULO 9: VISUALIZADOR 3D INTERATIVO */}
        {activeModule === 'mod9' && <div>
          <div className="module-title">📐 MÓDULO 9: Visualizador Técnico de Hashboard Interativo 3D</div>
          <p style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 12 }}>
            Use o mouse para rotacionar a placa 3D. Clique em chips, reguladores LDO ou tradutores lógicos para inspecionar os parâmetros lógicos e a forma de onda do osciloscópio.
          </p>
          
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <div className="card" style={{ padding: 6, background: '#080c16', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.3)', alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--accent)' }}>RENDERIZADOR WEBGL / THREE.JS</span>
                <span style={{ fontSize: 8, background: 'rgba(57,255,20,0.1)', padding: '2px 6px', color: 'var(--green)', borderRadius: 3, fontWeight: 'bold' }}>LIVE 3D</span>
              </div>
              <div ref={canvas3DRef} style={{ width: '100%', height: 350, position: 'relative', cursor: 'grab' }} />
            </div>

            <div className="card blue" style={{ minHeight: 372 }}>
              <div className="card-title">📋 Informações do Componente 3D</div>
              {selected3DComponent ? (
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--bright)' }}>{selected3DComponent.name}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 12, fontFamily: 'monospace' }}>Posição no PCB: {selected3DComponent.pos}</div>
                  
                  <div className="pi-row"><span className="pi-key">Tensão Nominal</span><span className="pi-val ok" style={{ fontWeight: 'bold' }}>{selected3DComponent.vNom}</span></div>
                  <div className="pi-row"><span className="pi-key">Sinal de Dados</span><span className="pi-val">{selected3DComponent.signal}</span></div>
                  
                  <div style={{ marginTop: 12 }}>
                    <span className="pi-key" style={{ display: 'block', fontSize: 11 }}>Forma de Onda (Osciloscópio):</span>
                    <OscilloscopeWaveform signal={selected3DComponent.signal} />
                  </div>
                  
                  <div style={{ marginTop: 12, fontSize: 11.5, color: '#fca5a5', borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
                    <b>Defeito Comum:</b> {selected3DComponent.fault}
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--dim)', textAlign: 'center', padding: '80px 0', fontSize: 13.5 }}>
                  🖱️ Clique em qualquer componente lúdico sobre a placa 3D para inspecionar.
                </div>
              )}
            </div>
          </div>
        </div>}

        {/* MODULO 1: ELETRÔNICA & ANATOMIA */}
        {activeModule === 'mod1' && <div>
          <div className="module-title">🎓 MÓDULO 1: Fundamentos e Eletrônica de Hashboard</div>
          
          <div className="card blue">
            <div className="card-title">🔬 O que é uma Hashboard?</div>
            <p>
              A Hashboard é a "placa de trabalho" de um minerador ASIC. Ela contém dezenas de processadores dedicados (chips ASIC) que executam um único cálculo repetitivo de hash (SHA-256 no caso do Bitcoin) bilhões de vezes por segundo.
            </p>
            <p>
              Para que os chips operem, a placa fornece alimentação de alta potência (bornes de cobre) e linhas de sinais de dados (cabo de IO/fita).
            </p>
          </div>

          <div className="card">
            <div className="card-title">⛓️ Domínio de Tensão (Ligação em Série)</div>
            <p>
              Diferente de circuitos eletrônicos tradicionais onde todos os chips são ligados em paralelo (recebendo a mesma tensão), os chips ASIC nas hashboards são ligados em <b>série</b>, agrupados em <b>domínios</b>.
            </p>
            <div className="code-block">
<span className="comment">// ESTRUTURA DE ENERGIA SÉRIE</span>
Fonte Externa (ex: 15V) ──→ [Domínio 01: 3 chips / Vcore ~0.32V]
                          ├─→ [Domínio 02: 3 chips / Vcore ~0.32V]
                          ├─→ [Domínio 03: 3 chips / Vcore ~0.32V]
                          └─→ ... Totalizando 42 domínios (15V / 42 ≈ 0.32V)
            </div>
            <div className="warn-box">
              ⚠️ <b>CONSEQUÊNCIA CRÍTICA:</b> Como os domínios estão em série, a corrente flui de um domínio para o outro como pilhas empilhadas. Se um chip queima em curto ou abre o circuito em um domínio, <b>o domínio inteiro para ou altera as tensões dos outros</b>, travando a placa.
            </div>
          </div>

          <div className="card green">
            <div className="card-title">🔌 Tradutores Lógicos e Proteção de Sinais</div>
            <p>
              Como a controladora opera em nível lógico de 3.3V e a hashboard opera em níveis de 1.8V ou 1.2V, são utilizados chips integrados chamados <b>Level Shifters (Tradutores Lógicos)</b> na entrada do cabo de IO:
            </p>
            <ul>
              <li><b>U1 (RST):</b> Traduz o sinal de Reset (RST) enviado da controladora (3.3V) para o nível da placa (1.2V / 1.8V).</li>
              <li><b>U2 (RX/RI):</b> Traduz o sinal de retorno RX (RI) da hashboard (1.2V / 1.8V) para o nível da controladora (3.3V).</li>
            </ul>
          </div>
          
          <div className="card purple">
            <div className="card-title">📡 Fluxo de Transmissão de Sinais (Topologia Daisy-Chain)</div>
            <p>
              Os chips ASIC comunicam-se em formato "fila indiana" (Daisy-Chain) através de cinco linhas de comunicação:
            </p>
            <div className="code-block">
<span className="keyword">1. CLK (Clock):</span> Onda constante de 25MHz gerada pelo cristal. Ruma de chip em chip (01 ➔ N).
<span className="keyword">2. RST (Reset):</span> Sinal de partida geral da placa (0V desliga, 1.8V/1.2V inicializa). Ruma do chip 01 ➔ N.
<span className="keyword">3. CO (Command Output):</span> Linha de transmissão de dados enviados pela controladora. Ruma do chip 01 ➔ N.
<span className="keyword">4. RI (Receive Input):</span> <span className="warn">SINAL REVERSO.</span> Resposta dos chips enviada de volta à controladora. Ruma do chip N ➔ 01.
<span className="keyword">5. BO (Busy Output):</span> Indica se o chip está sobrecarregado. Ruma do chip 01 ➔ N.
            </div>
          </div>
        </div>}

        {/* MODULO 2: BANCADA E QUÍMICA */}
        {activeModule === 'mod2' && <div>
          <div className="module-title">🖥️ MÓDULO 2: Recondicionamento Térmico e Limpeza Química</div>
          
          <div className="card">
            <div className="card-title">🔧 1. Desmontagem e Limpeza Profunda</div>
            <p>
              O fechamento de uma hashboard moderna de alumínio (como S19j Pro ou S21) exige precisão cirúrgica. Um erro milimétrico esmaga o chip ou gera falta de contato elétrico.
            </p>
            <ul className="checklist">
              <li><span className="chk done">✓</span> Remova todos os parafusos de fixação em ordem cruzada (padrão X) para evitar empenamento do PCB.</li>
              <li><span className="chk done">✓</span> Utilize um soprador térmico regulado a <b>100°C</b> por cima do dissipador por 1 minuto para amolecer a pasta térmica antiga. <b>Nunca use chaves de fenda como alavanca</b> para não arrancar os ASICs.</li>
              <li><span className="chk done">✓</span> Limpe os resíduos utilizando <b>Álcool Isopropílico (99.8%)</b> e uma espátula de plástico rígido.</li>
            </ul>
          </div>

          <div className="card blue">
            <div className="card-title">🧪 2. Protocolo de Limpeza e Descontaminação</div>
            <p>
              A poeira retém umidade e resíduos de fluxo de solda antigos, gerando fuga de corrente que causa erros de CRC nos chips.
            </p>
            <div className="code-block">
1. <span className="keyword">Jateamento de Ar:</span> Remova a poeira grossa (sempre segurando as hélices dos coolers para não gerar tensão reversa Back-EMF).
2. <span className="keyword">Banho Ultrassônico:</span> Placa imersa em solvente removedor de fluxo por 10 a 15 minutos a 50°C.
3. <span className="keyword">Enxágue:</span> Álcool isopropílico abundante para remover vestígios de água.
4. <span className="keyword">Estufa (Secagem Crítica):</span> Placa mantida a 60°C - 70°C na estufa por no mínimo 4 horas.
            </div>
          </div>

          <div className="card green">
            <div className="card-title">🌡️ 3. Recondicionamento Térmico (Massa Térmica e Pads)</div>
            <ul className="checklist">
              <li><span className="chk done">✓</span> <b>Condutividade:</b> Utilize pasta térmica com no mínimo <b>8.5 W/mK</b>.</li>
              <li><span className="chk done">✓</span> <b>Aplicação:</b> Uma gota centralizada sobre o espelho de silício de cada chip. Não espalhe excessivamente.</li>
              <li><span className="chk done">✓</span> <b>Thermal Pads:</b> Use a espessura exata (1.0mm ou 1.5mm) conforme o modelo. Espessuras erradas impedem o contato térmico com os ASICs, provocando queima por superaquecimento.</li>
            </ul>
          </div>
        </div>}

        {/* MODULO 3: TESTES COM MULTÍMETRO */}
        {activeModule === 'mod3' && <div>
          <div className="module-title">📐 MÓDULO 3: Mapeamento de Medições e Sinais no Osciloscópio</div>
          
          <div className="card blue">
            <div className="card-title">📐 1. Pontos de Teste Padrão (Test Points)</div>
            <p>Meça os pontos de teste dourados ao redor de cada ASIC com a placa energizada na seguinte ordem:</p>
            <table className="tbl">
              <thead>
                <tr><th>Sinal</th><th>Valor Esperado S19</th><th>Valor Esperado S19j Pro</th><th>Observação</th></tr>
              </thead>
              <tbody>
                <tr><td><b>CLK</b></td><td>~0.9V</td><td>0.5V a 0.6V</td><td>Se 0V está em curto. Se 1.8V o oscilador travou.</td></tr>
                <tr><td><b>RST</b></td><td>1.8V</td><td>1.2V</td><td>Tensão constante após boot. Se 0V está aterrado.</td></tr>
                <tr><td><b>CO</b></td><td>1.8V</td><td>1.2V</td><td>Oscila ligeiramente durante envio de pacotes.</td></tr>
                <tr><td><b>RI</b></td><td>1.8V</td><td>1.2V</td><td>Sinal de retorno dos dados.</td></tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-title">🔋 2. Linhas lógicas LDO (0.8V e 1.8V/1.2V)</div>
            <p>Cada domínio de ASICs depende de LDOs locais para alimentar as portas digitais:</p>
            <ul>
              <li><b>LDO 1.8V / 1.2V:</b> Alimentação lógica dos barramentos (CLK, RST, CO, RI). Sem essa tensão, as linhas lógicas morrem.</li>
              <li><b>LDO 0.8V:</b> Alimentação do núcleo de processamento. Se abaixo de 0.6V, gera erros crônicos de CRC de dados.</li>
            </ul>
          </div>

          <div className="card purple">
            <div className="card-title">📊 3. Sinais e Formas de Onda no Osciloscópio</div>
            <div className="code-block">
<span className="keyword">- CLK (Clock):</span> Onda senoidal ou quadrada perfeita de 25MHz. Amplitude pico a pico deve ser de 0.4V a 0.9V. Onda arredondada ou abaixo de 0.2V indica atenuação ou resistor aberto.
<span className="keyword">- RST (Reset):</span> Capturar borda de subida rápida. Se a subida for lenta (rampa), indica fuga de corrente por capacitores avariados.
<span className="keyword">- CO / RI (Dados):</span> Rajadas de pulsos lógicos de 0V a 1.8V/1.2V. Presença de "espinhos" acima de 2.1V indica capacitores buck esgotados.
            </div>
          </div>
        </div>}

        {/* MODULO 4: JIGS E TESTADORES */}
        {activeModule === 'mod4' && <div>
          <div className="module-title">🔌 MÓDULO 4: Diagnóstico Clínico com Testadores Jigs</div>
          
          <div className="card red">
            <div className="card-title">🔴 Sintoma: ASIC COUNT = 0</div>
            <p>
              A controladora não obteve resposta lógica do primeiro chip da hashboard.
            </p>
            <div className="code-block">
<span className="keyword">Causas Principais:</span>
1. PIC microcontrolador de partida (U6) sem alimentação de 3.3V ou desprogramado.
2. Regulador Buck principal não está gerando a alta tensão de alimentação dos domínios.
3. Tradutores de sinal lógicos U1 ou U2 queimados por inversão de ordem dos cabos.
            </div>
          </div>

          <div className="card">
            <div className="card-title">🟡 Sintoma: Cadeia Parcial (ex: ASIC COUNT = 32 de 126)</div>
            <p>
              O sinal lógicos de transmissão fluiu com sucesso até o chip 32. O ponto de quebra está posicionado exatamente entre os chips 32 e 33.
            </p>
            <div className="tip-box">
              👉 <b>Procedimento de Bancada:</b> Meça as tensões do domínio do chip 33. Verifique se o regulador LDO local está entregando as tensões reguladas, meça a integridade do capacitor de acoplamento de 100nF na linha de sinal e faça reflow no chip 33.
            </div>
          </div>
        </div>}

        {/* MODULO 5: SIMULADOR PCB INTERATIVO */}
        {activeModule === 'mod5' && <div>
          <div className="module-title">🛠️ MÓDULO 5: Simulador PCB Interativo de Diagnóstico</div>
          
          <div className="ctrl-bar" style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>SELECIONE O MODELO DA PLACA:</span>
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
              MOSTRAR DOMÍNIOS
            </div>
          </div>

          <div style={{ overflowX: 'auto', background: '#05070c', padding: 12, borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16 }}>
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

              <div className="pcb-conn io" style={{ left: 8, top: 8, width: 26, height: H * 0.22 }}>IO</div>
              <div className="pcb-conn pwr" style={{ left: 8, top: H * 0.35, width: 26, height: H * 0.3 }}>PWR</div>

              <div className="pcb-comp cryst" style={{ left: padX + 20, top: 6, width: 28, height: 14 }}>Y1 25M</div>

              {m.boost !== '—' && <div className="pcb-comp boost" style={{ left: W - 50, top: 6, width: 40, height: 16 }}>BOOST</div>}

              <div className="pcb-comp temp" style={{ left: padX + Math.floor(W * 0.3), top: 6, width: 26, height: 14 }}>NTC</div>
              <div className="pcb-comp temp" style={{ left: padX + Math.floor(W * 0.7), top: 6, width: 26, height: 14 }}>NTC</div>

              {domainZones}

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
                    onClick={() => setSelChip(i)}
                  >
                    <span className="chip-label">{i + 1}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="ctrl-bar" style={{ marginBottom: 16 }}>
            <button className={`btn-sm ${animOn ? 'active' : ''}`} onClick={() => setAnimOn(!animOn)}>
              {animOn ? '⏸ Pausar Sinais' : '⚡ Animar Sinais'}
            </button>
            <button className="btn-sm" style={{ borderColor: C.red, color: C.red, fontWeight: 700 }} onClick={simFault}>💥 SIMULAR FALHA DICOTÔMICA (ASIC=X)</button>
            <button className="btn-sm" onClick={clearFaults}>✓ Resetar Placa</button>
            <span style={{ fontSize: 11, color: C.green, marginLeft: 8 }}>
              {simulatedFault ? `🚨 Falha Ativa: Parou no Chip #${simulatedFault.fs + 1}` : '✓ Placa sem falhas'}
            </span>
          </div>

          <div className="grid-2">
            <div className="card blue">
              <div className="card-title">ℹ️ Painel de Inspeção do Multímetro</div>
              {selChip !== null ? (
                <div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: (chipStates[selChip] || 'ok') === 'ok' ? 'var(--green)' : 'var(--red)' }}>
                    CHIP #{selChip + 1}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>Modelo: {m.chip} · Domínio {Math.floor(selChip / m.cpd) + 1}</div>
                  
                  <div className="pi-row"><span className="pi-key">Tensão Core (Vcore)</span><span className="pi-val ok">{m.vDom}</span></div>
                  <div className="pi-row"><span className="pi-key">Nível de Sinal Lógico</span><span className="pi-val ok">{m.tx}</span></div>
                  <div className="pi-row"><span className="pi-key">Sinal de Entrada CLK</span><span className="pi-val ok">{m.clk}</span></div>
                  <div className="pi-row"><span className="pi-key">Tensão regulador LDO</span><span className="pi-val ok">{m.ldo}</span></div>
                  <div className="pi-row"><span className="pi-key">Alimentação PLL</span><span className="pi-val ok">{m.pll}</span></div>
                </div>
              ) : (
                <div style={{ color: C.muted, textAlign: 'center', padding: '20px 0', fontSize: 13 }}>
                  Clique em qualquer chip na PCB acima para medir as tensões do circuito.
                </div>
              )}
            </div>

            <div className="card red">
              <div className="card-title">📝 Diagnóstico do Testador & Guia de Ação</div>
              {simulatedFault ? (
                <div>
                  <div style={{ color: C.red, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                    🚨 LOG DO TESTADOR: <code style={{ background: '#000', padding: '2px 6px', borderRadius: 4 }}>ASIC={simulatedFault.fs}</code>
                  </div>
                  <p style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                    O testador reportou que encontrou exatamente <b>{simulatedFault.fs}</b> chips. O sinal foi cortado ao tentar se comunicar com o <b>Chip #{simulatedFault.fs + 1}</b>.
                  </p>
                  <div className="warn-box" style={{ padding: 10, margin: '8px 0', fontSize: 12 }}>
                    <b>O que medir agora:</b><br/>
                    1. Verifique se o regulador LDO do domínio do chip #{simulatedFault.fs + 1} está entregando {m.ldo}.<br/>
                    2. Meça a continuidade no sinal CO/TX saindo do chip #{simulatedFault.fs} para o chip #{simulatedFault.fs + 1}.
                  </div>
                  <div className="tip-box" style={{ padding: 10, margin: 0, fontSize: 12 }}>
                    <b>Ação corretiva recomendada:</b><br/>
                    - Faça reflow (resolda) no <b>Chip #{simulatedFault.fs + 1}</b>. Se a solda fria persistir, efetue a substituição (reballing BGA) do chip.
                  </div>
                </div>
              ) : (
                <div style={{ color: C.muted, textAlign: 'center', padding: '20px 0', fontSize: 13 }}>
                  Clique no botão "Simular Falha" para gerar um diagnóstico de bancada realista.
                </div>
              )}
            </div>
          </div>
        </div>}

        {/* MODULO 6: ANÁLISE COMPLETA DE LOGS */}
        {activeModule === 'mod6' && <div>
          <div className="module-title">📄 MÓDULO 6: Mapeamento de Erros e logs de Inicialização</div>
          
          <div className="card red">
            <div className="card-title">📋 Tabela de Erros Críticos de Log</div>
            <table className="tbl">
              <thead>
                <tr><th>Mensagem do Log</th><th>Causa Raiz do Problema</th><th>Ação de Reparo Necessária</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>ERROR: Find 0 ASICs on chain [0]</code></td>
                  <td>O PIC não armou os conversores Buck ou a linha de reset geral (RST) está morta no Chip 01.</td>
                  <td>Verificar alimentação do PIC (3.3V). Medir resistência da entrada positiva de energia para verificar curto na linha principal.</td>
                </tr>
                <tr>
                  <td><code>Chain [1] PCB Temp Sensor Error!</code></td>
                  <td>A controladora perdeu comunicação via I2C com o chip sensor de temperatura da placa 1.</td>
                  <td>Medir resistores de pull-up da linha I2C perto do conector de dados. Substituir o sensor de temperatura físico.</td>
                </tr>
                <tr>
                  <td><code>EEPROM checksum validate failed!</code></td>
                  <td>Dados de calibração guardados na memória da hashboard foram corrompidos ou o chip EEPROM queimou.</td>
                  <td>Utilizar o gravador EEPROM/STASIC para regravar o arquivo binário (.bin) de firmware correspondente.</td>
                </tr>
                <tr>
                  <td><code>ASIC id checking failed, expected 126, found 84</code></td>
                  <td>A malha de sinal de retorno (RI) quebrou exatamente no Chip de número 84.</td>
                  <td>Ir até a região do Chip 84 e 85. Testar os LDOs locais e injetar sinal para verificar quem parou de transmitir.</td>
                </tr>
                <tr>
                  <td><code>Voltage deviation is too large / Power supply protect</code></td>
                  <td>A fonte de alimentação detectou que o consumo elétrico da placa ultrapassou a janela segura devido a um chip em curto.</td>
                  <td>Executar teste térmico com câmera infravermelha para identificar qual chip ASIC está aquecendo instantaneamente ao ligar.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card blue">
            <div className="card-title">🖥️ Dicionário Triplo de Erros de Logs (Sistemas)</div>
            <table className="tbl">
              <thead>
                <tr><th>Problema</th><th>Log Bitmain Stock</th><th>Log VNISH</th><th>Log Braiins OS</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>Cabo I2C / Fonte Queimada</b></td>
                  <td><code>get psu type unsuccess</code></td>
                  <td><code>[PSU] Error: Voltage can't reach target</code></td>
                  <td><code>E0012: PSU disconnected</code></td>
                </tr>
                <tr>
                  <td><b>Voltagem Tomada Baixa</b></td>
                  <td><code>voltage mismatch</code></td>
                  <td><code>[PSU] Input voltage too low (under 180V)</code></td>
                  <td><code>psu_input_undervoltage</code></td>
                </tr>
                <tr>
                  <td><b>Cooler Tacômetro Cortado</b></td>
                  <td><code>Fatal Error: Fan count is less than 4</code></td>
                  <td><code>[FANS] Fan [X] speed too low</code></td>
                  <td><code>E0021: Fan speed threshold violated</code></td>
                </tr>
                <tr>
                  <td><b>EEPROM Corrompida</b></td>
                  <td><code>CRC error on EEPROM</code></td>
                  <td><code>[EEPROM] Invalid magic number</code></td>
                  <td><code>hashboard_eeprom_corrupted</code></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-title">🔮 Como Prever que uma Hashboard vai Falhar nos Próximos Dias</div>
            <ol style={{ paddingLeft: 16 }}>
              <li><b>Aumento de Erros de Hardware (HW):</b> Se os erros de HW acumularem velozmente em uma única placa, significa que as soldas físicas dos chips estão se deteriorando.</li>
              <li><b>Flutuação de Frequência:</b> Se o autotuning forçar a frequência de um domínio para patamares muito baixos, indica fadiga dos reguladores de tensão daquele bloco.</li>
              <li><b>Diferença Abrupta de Temperatura:</b> Uma variação maior que 15°C entre os sensores de temperatura de uma mesma placa aponta que a pasta térmica secou em uma zona da placa.</li>
            </ol>
          </div>
        </div>}

        {/* MODULO 7: OVERCLOCK & BYPASS NTC */}
        {activeModule === 'mod7' && <div>
          <div className="module-title">🔥 MÓDULO 7: Configurações e Diagnóstico de Performance (VNISH)</div>
          
          <div className="card">
            <div className="card-title">⚙️ 1. Como Controlar os Coolers para Teste de Bancada</div>
            <p>
              Ao testar placas soltas sem refrigeração completa, as ventoinhas devem ser configuradas manualmente para não interromper a inicialização da máquina:
            </p>
            <ol style={{ paddingLeft: 16 }}>
              <li>Acesse o dashboard do <b>VNish</b> ➔ <i>Settings ➔ Miner Settings</i>.</li>
              <li>Altere o <b>Fan Control</b> de <i>Auto</i> para <i>Manual</i>, ajustando a velocidade para 100%.</li>
              <li><b>Modo Imersão (Desativar Leitura):</b> Ative a opção <b>Immersion Mode</b>. Isso instruirá a controladora a ignorar os pinos de tacômetro de velocidade das ventoinhas, permitindo o funcionamento total sem coolers conectados fisicamente.</li>
            </ol>
          </div>

          <div className="card red">
            <div className="card-title">⚠️ Riscos Térmicos de Overclock e Runaway</div>
            <p>
              O <b>Overclocking</b> aumenta a frequência de clock (CLK) e a tensão nos domínios (Vcore) dos ASICs para arrancar mais TH/s da máquina. Isso gera um aumento exponencial de dissipação térmica.
            </p>
            <p>
              Se o chip exceder sua temperatura de junção máxima (geralmente 105°C a 115°C), ocorre o <b>Thermal Runaway</b>: as conexões de solda derretem, a placa entra em curto total e pode provocar fogo na carcaça.
            </p>
          </div>

          <div className="card blue">
            <div className="card-title">⚙️ Como Burlar Sensores de Temperatura Falhos</div>
            <p>
              Quando um sensor de temperatura NTC queima ou apresenta leituras falsas de temperatura máxima, o firmware original Bitmain desliga a mineradora por segurança (temperatura falsa = shutdown).
            </p>
            <p>
              Firmwares customizados (como VNish e Braiins OS+) permitem desativar essa proteção física nas configurações avançadas de hardware:
            </p>
            <ul>
              <li><b>No VNish:</b> Vá em <i>Settings ➔ Advanced Hardware Settings</i> e marque a opção <b>"Ignore broken temp sensors"</b>.</li>
              <li><b>No Braiins OS:</b> No arquivo de configuração ou nas opções avançadas, altere a política de verificação dos sensores para desativar a interrupção.</li>
            </ul>
            <div className="warn-box">
              🚨 <b>CUIDADO EXTREMO:</b> Ao desativar os sensores, a máquina funcionará "no escuro". Se a ventoinha parar ou a pasta térmica secar, a placa <b>queimará completamente sem aviso prévio</b>. Utilize essa opção apenas em ambientes com refrigeração por imersão líquida ou sob monitoramento manual constante!
            </div>
          </div>
        </div>}

        {/* MODULO 8: DRIVE DE DOCUMENTAÇÕES */}
        {activeModule === 'mod8' && <div>
          <div className="module-title">🔗 MÓDULO 8: Documentação de Apoio e Links Úteis</div>
          
          <div className="card green">
            <div className="card-title">📁 Documentos no Drive "MINING ISH"</div>
            <div className="ftree">
              <div><span className="ft-folder">📁 MIning ish/</span></div>
              <div className="ft-indent">
                <div><span className="ft-folder">📁 ANTMINER guides/</span></div>
                <div className="ft-indent">
                  <div><span className="ft-file star">★ S21 XP User Guide-V1.1.0.pdf</span><span className="ft-desc">(Inglês com esquemáticos de sinais)</span></div>
                  <div><span className="ft-file pdf">S21&T21维修指导V1.2.pdf</span><span className="ft-desc">(Manual de conserto do chip BM1368)</span></div>
                  <div><span className="ft-file pdf">S19J-PRO维修指导.pdf</span><span className="ft-desc">(Manual do chip BM1362 - S19j Pro)</span></div>
                  <div><span className="ft-file star">★ PIC programming tools.zip</span><span className="ft-desc">(HEX para gravação do PIC U6)</span></div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">🔗 Links Recomendados de Manuais</div>
            <div className="link-list">
              <div className="link-item">
                <div className="lbadge lb-orange">ZEUSBTC</div>
                <div className="linfo">
                  <div className="ltitle">S19j Pro Hash Board Repair Guide — BM1362</div>
                  <div className="ldesc">Guia de diagnóstico passo a passo oficial de ZeusBTC para placas S19j Pro.</div>
                  <a className="lurl" href="https://www.zeusbtc.com/articles/information/3530-antminer-s19j-pro-hash-board-repair-guide" target="_blank" rel="noreferrer">zeusbtc.com/articles/information/3530-antminer-s19j-pro-hash-board-repair-guide</a>
                </div>
              </div>
              <div className="link-item">
                <div className="lbadge lb-green">D-CENTRAL</div>
                <div className="linfo">
                  <div className="ltitle">Antminer S19 Complete Maintenance Guide</div>
                  <div className="ldesc">Manual completo com foco em integridade térmica, fontes inteligentes APW12 e troca de chips.</div>
                  <a className="lurl" href="https://d-central.tech/manuals/antminer-s19-maintenance-repair-guide/" target="_blank" rel="noreferrer">d-central.tech/manuals/antminer-s19-maintenance-repair-guide/</a>
                </div>
              </div>
            </div>
          </div>
        </div>}
      </div>
    </div>
  </div>;
}
