import React, { useState, useEffect } from 'react';
import { VIDEOS_DATA } from './VideosData';

export default function GuiaTecnicoPage({ ctx, C, Tag }) {
  const [activeTab, setActiveTab] = useState('busca'); // 'busca' or 'manual'
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedAccordion, setExpandedAccordion] = useState('mod1');

  // Check if current user is Admin 019
  const isAdmin019 = ctx.user?.code === '019';

  // Default models dataset with initial chip counts
  const DEFAULT_MODELS = [
    // s19 family
    { id: '1', family: 's19', model: 'S19 (95T / 90T)', code: 'BHB2856 / BB-2856F', type: 'Fibra (PCB)', chip: 'BM1398', chips: 76 },
    { id: '2', family: 's19', model: 'S19 (Placa de Alumínio)', code: 'BB-2856A / BHB2856A', type: 'Alumínio', chip: 'BM1398', chips: 76 },
    { id: '3', family: 's19', model: 'S19 Pro (110T)', code: 'BHB2858 / BHB2858D', type: 'Fibra (PCB)', chip: 'BM1398', chips: 76 },
    { id: '4', family: 's19', model: 'S19j', code: 'BHB2866', type: 'Fibra (PCB)', chip: 'BM1362', chips: 114 },
    { id: '5', family: 's19', model: 'S19j Pro', code: 'BHB28682 / BB-2868 / BHB2868', type: 'Fibra (PCB)', chip: 'BM1362', chips: 126 },
    { id: '6', family: 's19', model: 'S19j Pro+', code: 'BHB28685 / BHB28688', type: 'Fibra (PCB)', chip: 'BM1362', chips: 120 },
    { id: '7', family: 's19', model: 'S19j L', code: 'BHB2866A / BHB2868A', type: 'Alumínio', chip: 'BM1362', chips: 126 },
    { id: '8', family: 's19', model: 'S19k Pro', code: 'BHB56902 / BHB56903', type: 'Alumínio', chip: 'BM1368', chips: 77 },
    { id: '9', family: 's19', model: 'S19 XP', code: 'BHB42801 / BHB42831', type: 'Alumínio', chip: 'BM1366', chips: 77 },
    { id: '10', family: 's19', model: 'S19 XP Pro', code: 'BHB56801', type: 'Alumínio', chip: 'BM1366', chips: 77 },
    { id: '11', family: 's19', model: 'S19a', code: 'BHB2876', type: 'Fibra (PCB)', chip: 'BM1398AC', chips: 76 },
    { id: '12', family: 's19', model: 'S19a Pro', code: 'BHB2878', type: 'Fibra (PCB)', chip: 'BM1398AC', chips: 76 },
    { id: '13', family: 's19', model: 'S19al', code: 'BHB2856A_AL / BHB2858A', type: 'Alumínio', chip: 'BM1398', chips: 76 },
    { id: '14', family: 's19', model: 'T19', code: 'BHB2836 / BHB28362', type: 'Fibra (PCB)', chip: 'BM1398AA', chips: 76 },
    { id: '15', family: 's19', model: 'S19 Hydro', code: 'BHB2856H', type: 'Hidro (Bloco de Água)', chip: 'BM1398BA', chips: 76 },
    { id: '16', family: 's19', model: 'S19 Pro+ Hydro', code: 'BHB38801 / BHB38811', type: 'Hidro (Bloco de Água)', chip: 'BM1366AC', chips: 120 },
    { id: '17', family: 's19', model: 'S19 XP Hydro', code: 'BHB42821 / BHB42851', type: 'Hidro (Bloco de Água)', chip: 'BM1366AL', chips: 120 },
    // modern family
    { id: '18', family: 'modern', model: 'S23 / S23 Hyd.', code: 'Linha S23 Series', type: 'SHA-256 (Bitcoin)', chip: 'Nova Geração BMU3', chips: 80 },
    { id: '19', family: 'modern', model: 'S23H', code: 'S23 Hydro High-Density', type: 'SHA-256 (Bitcoin)', chip: 'Nova Geração BM', chips: 96 },
    { id: '20', family: 'modern', model: 'S21 / S21 Ultra', code: 'BHB68601 / BHB68603', type: 'SHA-256 (Bitcoin)', chip: 'BM1368', chips: 84 },
    { id: '21', family: 'modern', model: 'S21 XP Hyd.', code: 'BHB68612 / BHB68620', type: 'SHA-256 (Bitcoin)', chip: 'BM1368 XP', chips: 84 },
    { id: '22', family: 'modern', model: 'L9', code: 'BLB68101', type: 'Scrypt (LTC/DOGE)', chip: 'BM1489', chips: 80 },
    { id: '23', family: 'modern', model: 'L7', code: 'BLB2881 / BLB2882', type: 'Scrypt (LTC/DOGE)', chip: 'BM1489', chips: 120 },
    { id: '24', family: 'modern', model: 'KS7', code: 'BKB68201', type: 'kHeavyHash (Kaspa)', chip: 'BM1724', chips: 80 },
    { id: '25', family: 'modern', model: 'KS5 / KS5 Pro', code: 'BKB68101', type: 'kHeavyHash (Kaspa)', chip: 'BM1724', chips: 80 },
    { id: '26', family: 'modern', model: 'KS3', code: 'BKB2881', type: 'kHeavyHash (Kaspa)', chip: 'BM1720', chips: 80 },
    { id: '27', family: 'modern', model: 'E11', code: 'BEB68101', type: 'Ethash/Etchash (ETC)', chip: 'BM1762', chips: 80 },
    { id: '28', family: 'modern', model: 'E9 / E9 Pro', code: 'BEB2881', type: 'Ethash/Etchash (ETC)', chip: 'BM1760', chips: 80 }
  ];

  // Persistent models list state
  const [modelsList, setModelsList] = useState(() => {
    const saved = localStorage.getItem('hashboard_models');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return DEFAULT_MODELS;
  });

  const updateModels = (newList) => {
    setModelsList(newList);
    localStorage.setItem('hashboard_models', JSON.stringify(newList));
  };

  // Modals state for admin edits
  const [editingModel, setEditingModel] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const [videoSearchQuery, setVideoSearchQuery] = useState('');
  const [videoSelectedCategory, setVideoSelectedCategory] = useState('TODOS');
  const [videoLimit, setVideoLimit] = useState(15);

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

  // Styling helpers
  const inputStyle = {
    width: '100%',
    background: '#07090e',
    border: '1px solid #212c49',
    borderRadius: 6,
    padding: '10px',
    color: '#ffffff',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box'
  };

  const btnCancelStyle = {
    background: 'transparent',
    border: '1px solid #212c49',
    color: '#c8d6e8',
    borderRadius: 6,
    padding: '8px 16px',
    fontSize: '12.5px',
    cursor: 'pointer'
  };

  const btnSaveStyle = {
    background: '#f7931a',
    border: 'none',
    color: '#fff',
    borderRadius: 6,
    padding: '8px 20px',
    fontSize: '12.5px',
    fontWeight: 'bold',
    cursor: 'pointer'
  };

  const accordionStyle = (isOpen) => ({
    background: '#0d121f',
    border: '1px solid',
    borderColor: isOpen ? '#f7931a' : '#212c49',
    borderRadius: 8,
    overflow: 'hidden',
    transition: 'all 0.15s ease-in-out'
  });

  const accordionHeaderStyle = {
    padding: '16px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontWeight: 'bold',
    cursor: 'pointer',
    background: 'rgba(255,255,255,0.02)',
    userSelect: 'none',
    fontSize: '13.5px',
    color: '#ffffff'
  };

  const accordionBodyStyle = {
    padding: '20px',
    borderTop: '1px solid #212c49',
    background: '#131a2d'
  };

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
      
      .code-block {
        background: #04060b;
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 14px;
        font-family: monospace;
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
    `}</style>

    <div className="course-header">
      <div>
        <div className="ch-title">MANUAL TÉCNICO: <span>ESTAÇÃO DE HASHBOARDS</span></div>
        <div className="ch-subtitle">Calibração, Mapeamento, Dicionário de Logs & Métodos de Reparo</div>
      </div>
      <Tag color={C.accent} small>CURSO TÉCNICO</Tag>
    </div>

    {/* Primary 2 Tabs Layout */}
    <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
      <button
        style={{
          flex: 1,
          padding: '14px',
          background: activeTab === 'busca' ? 'rgba(247,147,26,0.15)' : '#0d121f',
          border: '1px solid',
          borderColor: activeTab === 'busca' ? '#f7931a' : '#212c49',
          color: activeTab === 'busca' ? '#f7931a' : '#c8d6e8',
          borderRadius: 8,
          fontWeight: 800,
          cursor: 'pointer',
          transition: 'all 0.15s'
        }}
        onClick={() => setActiveTab('busca')}
      >
        🔍 Busca de Modelos / Edição Admin 019
      </button>
      <button
        style={{
          flex: 1,
          padding: '14px',
          background: activeTab === 'manual' ? 'rgba(247,147,26,0.15)' : '#0d121f',
          border: '1px solid',
          borderColor: activeTab === 'manual' ? '#f7931a' : '#212c49',
          color: activeTab === 'manual' ? '#f7931a' : '#c8d6e8',
          borderRadius: 8,
          fontWeight: 800,
          cursor: 'pointer',
          transition: 'all 0.15s'
        }}
        onClick={() => setActiveTab('manual')}
      >
        📚 Manual Técnico & Aulas Organizadas
      </button>
    </div>

    {/* TAB 1: SEARCH & EDIT MODEL */}
    {activeTab === 'busca' && <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 'bold', color: 'var(--bright)' }}>Modelos Cadastrados de Hashboard</div>
        {isAdmin019 && (
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              background: 'var(--green)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            + Adicionar Modelo
          </button>
        )}
      </div>

      <div className="search-box-wrap">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          className="search-input"
          placeholder="Pesquise por modelo da máquina, hashboard, chip... (Ex: S19j, BHB2868, BM1362)"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* S19 Table */}
      {filterList(modelsList.filter(m => m.family === 's19')).length > 0 && (
        <div className="card blue" style={{ overflowX: 'auto', marginBottom: 20 }}>
          <div className="card-title">1. Família Antminer S19 (Todas as Variantes e Modelos Hydro)</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Modelo da Máquina</th>
                <th>Código/Modelo da Placa</th>
                <th>Tipo/Resfriamento</th>
                <th>Chip Utilizado</th>
                <th>Qtd Chips</th>
                {isAdmin019 && <th style={{ width: 120 }}>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {filterList(modelsList.filter(m => m.family === 's19')).map((item) => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 'bold', color: 'var(--bright)' }}>{item.model}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{item.code}</td>
                  <td>{item.type}</td>
                  <td style={{ fontWeight: 'bold', color: 'var(--blue)' }}>{item.chip}</td>
                  <td style={{ fontWeight: 'bold' }}>{item.chips}</td>
                  {isAdmin019 && (
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setEditingModel(item)}
                          style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer' }}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Deseja remover o modelo ${item.model}?`)) {
                              updateModels(modelsList.filter(x => x.id !== item.id));
                            }
                          }}
                          style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer' }}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modern / Altcoins Table */}
      {filterList(modelsList.filter(m => m.family === 'modern')).length > 0 && (
        <div className="card green" style={{ overflowX: 'auto' }}>
          <div className="card-title">2. Linha Ultra Moderna e Outros Algoritmos (S21, S23, L7, KS5, ETC)</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Modelo da Máquina</th>
                <th>Código/Modelo da Placa</th>
                <th>Algoritmo / Moeda</th>
                <th>Chip Utilizado</th>
                <th>Qtd Chips</th>
                {isAdmin019 && <th style={{ width: 120 }}>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {filterList(modelsList.filter(m => m.family === 'modern')).map((item) => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 'bold', color: 'var(--bright)' }}>{item.model}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{item.code}</td>
                  <td>{item.type}</td>
                  <td style={{ fontWeight: 'bold', color: 'var(--blue)' }}>{item.chip}</td>
                  <td style={{ fontWeight: 'bold' }}>{item.chips}</td>
                  {isAdmin019 && (
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setEditingModel(item)}
                          style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer' }}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Deseja remover o modelo ${item.model}?`)) {
                              updateModels(modelsList.filter(x => x.id !== item.id));
                            }
                          }}
                          style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer' }}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filterList(modelsList).length === 0 && (
        <div style={{ color: 'var(--dim)', textAlign: 'center', padding: '40px 0' }}>
          Nenhum modelo correspondente encontrado para "{searchQuery}".
        </div>
      )}
    </div>}

    {/* TAB 2: ORGANIZED MANUAL CONTENT */}
    {activeTab === 'manual' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        
        {/* MODULO 1: ELETRÔNICA & ANATOMIA */}
        <div style={accordionStyle(expandedAccordion === 'mod1')}>
          <div style={accordionHeaderStyle} onClick={() => setExpandedAccordion(expandedAccordion === 'mod1' ? null : 'mod1')}>
            <span>⚡ MÓDULO 1: Fundamentos de Eletrônica & Fluxo de Sinais</span>
            <span>{expandedAccordion === 'mod1' ? '▼' : '►'}</span>
          </div>
          {expandedAccordion === 'mod1' && (
            <div style={accordionBodyStyle}>
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
  Fonte Externa (ex: 15V) ──→ [Domínio 01: 3 chips / Vcore ~0.32V]
                            ├─→ [Domínio 02: 3 chips / Vcore ~0.32V]
                            ├─→ [Domínio 03: 3 chips / Vcore ~0.32V]
                            └─→ ... Totalizando 42 domínios (15V / 42 ≈ 0.32V)
                </div>
                <div className="warn-box">
                  ⚠️ <b>CONSEQUÊNCIA CRÍTICA:</b> Como os domínios estão em série, a corrente flui de um domínio para o outro como pilhas empilhadas. Se um chip queima em curto ou abre o circuito em um domínio, o domínio inteiro para ou altera as tensões dos outros, travando a placa.
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
  1. CLK (Clock): Onda constante de 25MHz gerada pelo cristal. Ruma de chip em chip (01 ➔ N).
  2. RST (Reset): Sinal de partida geral da placa (0V desliga, 1.8V/1.2V inicializa). Ruma do chip 01 ➔ N.
  3. CO (Command Output): Linha de transmissão de dados enviados pela controladora. Ruma do chip 01 ➔ N.
  4. RI (Receive Input): SINAL REVERSO. Resposta dos chips enviada de volta à controladora. Ruma do chip N ➔ 01.
  5. BO (Busy Output): Indica se o chip está sobrecarregado. Ruma do chip 01 ➔ N.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODULO 2: BANCADA, QUÍMICA & CURTOS */}
        <div style={accordionStyle(expandedAccordion === 'mod2')}>
          <div style={accordionHeaderStyle} onClick={() => setExpandedAccordion(expandedAccordion === 'mod2' ? null : 'mod2')}>
            <span>🛠️ MÓDULO 2: Bancada, Química & Como Achar Curto</span>
            <span>{expandedAccordion === 'mod2' ? '▼' : '►'}</span>
          </div>
          {expandedAccordion === 'mod2' && (
            <div style={accordionBodyStyle}>
              {/* HOW TO FIND SHORT CIRCUITS */}
              <div className="card red">
                <div className="card-title">⚠️ GUIA TÉCNICO: COMO LOCALIZAR CURTO-CIRCUITO NA HASHBOARD</div>
                <p style={{ fontSize: 13 }}>
                  O curto-circuito na linha de alimentação principal (Vcore) ou nas linhas lógicas secundárias (LDO 1.8V / 1.2V / 0.8V) é um dos defeitos mais comuns. Se houver curto, a fonte de alimentação desarmará imediatamente para se proteger (Power Supply Protect).
                </p>
                
                <h4 style={{ color: '#fff', fontSize: 12.5, margin: '12px 0 6px' }}>1. Teste de Resistência de Entrada (Diagnóstico Rápido)</h4>
                <p style={{ fontSize: 12.5 }}>
                  Com a placa desenergizada, ajuste o multímetro na escala de <b>Resistência (Ohms)</b> ou <b>Diodo/Continuidade</b>. Coloque a ponta preta no terminal negativo (-) da placa (Terra) e a ponta vermelha no terminal positivo (+).
                  <br/>
                  <b>Valores Normais:</b> A resistência deve subir gradualmente até a casa dos Kilo-Ohms.
                  <br/>
                  <b>Curto-Circuito:</b> Se o multímetro apitar ou ler um valor próximo a <b>0 ohms</b>, há um curto total na linha principal de alimentação.
                </p>

                <h4 style={{ color: '#fff', fontSize: 12.5, margin: '12px 0 6px' }}>2. Localização do Componente em Curto (Técnicas de Bancada)</h4>
                <p style={{ fontSize: 12.5 }}>
                  Para achar qual dos chips ASIC ou capacitores cerâmicos está em curto-circuito, utilize o método de <b>Injeção de Tensão Controlada</b>:
                </p>
                <ol style={{ fontSize: 12.5, paddingLeft: 16 }}>
                  <li><b>Configure a Fonte de Bancada:</b> Ajuste a tensão da fonte externa para uma voltagem baixa e segura:
                    <ul style={{ paddingLeft: 12 }}>
                      <li>Para curtos na linha principal: <b>1.0V a 1.2V DC</b> (Corrente limitada a 2A ou 3A).</li>
                      <li>Para curtos na linha LDO: <b>1.0V DC</b> (nunca injete tensões altas nas linhas de sinal para não queimar as portas lógicas).</li>
                    </ul>
                  </li>
                  <li><b>Injete a Tensão:</b> Conecte o negativo da fonte no terra da placa e toque com a ponta positiva no terminal positivo de entrada ou na bobina/capacitor do LDO em curto.</li>
                  <li><b>Identifique o Calor Emitido:</b>
                    <ul style={{ paddingLeft: 12 }}>
                      <li><b>Técnica A (Câmera Térmica - Recomendado):</b> Aponte uma câmera infravermelha para a placa. O componente em curto brilhará instantaneamente na tela.</li>
                      <li><b>Técnica B (Álcool Isopropílico):</b> Pincele álcool isopropílico sobre a placa. O calor do componente em curto fará com que o álcool evapore muito mais rápido sobre ele.</li>
                      <li><b>Técnica C (Fumaça de Breu / Rosin):</b> Utilize um aplicador de fumaça de breu para criar uma fina camada esbranquiçada sobre os componentes. Ao injetar a tensão, o breu derreterá exatamente em cima do componente em curto.</li>
                    </ul>
                  </li>
                </ol>
              </div>

              <div className="card">
                <div className="card-title">🔧 Desmontagem e Recondicionamento Térmico</div>
                <ul className="checklist">
                  <li><span className="chk done">✓</span> Remova todos os parafusos de fixação em ordem cruzada (padrão X) para evitar empenamento do PCB.</li>
                  <li><span className="chk done">✓</span> Utilize um soprador térmico regulado a <b>100°C</b> por cima do dissipador por 1 minuto para amolecer a pasta térmica antiga. <b>Nunca use chaves de fenda como alavanca</b> para não arrancar os ASICs.</li>
                  <li><span className="chk done">✓</span> Limpe os resíduos utilizando <b>Álcool Isopropílico (99.8%)</b> e uma espátula de plástico rígido.</li>
                </ul>
              </div>

              <div className="card blue">
                <div className="card-title">🧪 Protocolo de Limpeza e Descontaminação Química</div>
                <p>
                  A poeira retém umidade e resíduos de fluxo de solda antigos, gerando fuga de corrente que causa erros de CRC nos chips.
                </p>
                <div className="code-block">
1. Jateamento de Ar: Remova a poeira grossa (sempre segurando as hélices dos coolers para não gerar tensão reversa Back-EMF).
2. Banho Ultrassônico: Placa imersa em solvente removedor de fluxo por 10 a 15 minutos a 50°C.
3. Enxágue: Álcool isopropílico abundante para remover vestígios de água.
4. Estufa (Secagem Crítica): Placa mantida a 60°C - 70°C na estufa por no mínimo 4 horas.
                </div>
              </div>

              <div className="card green">
                <div className="card-title">🌡️ Recondicionamento Térmico (Massa Térmica e Pads)</div>
                <ul className="checklist">
                  <li><span className="chk done">✓</span> <b>Condutividade:</b> Utilize pasta térmica com no mínimo <b>8.5 W/mK</b>.</li>
                  <li><span className="chk done">✓</span> <b>Aplicação:</b> Uma gota centralizada sobre o espelho de silício de cada chip. Não espalhe excessivamente.</li>
                  <li><span className="chk done">✓</span> <b>Thermal Pads:</b> Use a espessura exata (1.0mm ou 1.5mm) conforme o modelo. Espessuras erradas impedem o contato térmico com os ASICs, provocando queima por superaquecimento.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* MODULO 3: MULTÍMETRO & OSCILOSCÓPIO */}
        <div style={accordionStyle(expandedAccordion === 'mod3')}>
          <div style={accordionHeaderStyle} onClick={() => setExpandedAccordion(expandedAccordion === 'mod3' ? null : 'mod3')}>
            <span>📐 MÓDULO 3: Multímetro, Medições & Formas de Onda</span>
            <span>{expandedAccordion === 'mod3' ? '▼' : '►'}</span>
          </div>
          {expandedAccordion === 'mod3' && (
            <div style={accordionBodyStyle}>
              <div className="card blue">
                <div className="card-title">📐 Pontos de Teste Padrão (Test Points)</div>
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
                <div className="card-title">🔋 Linhas lógicas LDO (0.8V e 1.8V/1.2V)</div>
                <p>Cada domínio de ASICs depende de LDOs locais para alimentar as portas digitais:</p>
                <ul>
                  <li><b>LDO 1.8V / 1.2V:</b> Alimentação lógica dos barramentos (CLK, RST, CO, RI). Sem essa tensão, as linhas lógicas morrem.</li>
                  <li><b>LDO 0.8V:</b> Alimentação do núcleo de processamento. Se abaixo de 0.6V, gera erros crônicos de CRC de dados.</li>
                </ul>
              </div>

              <div className="card purple">
                <div className="card-title">📊 Sinais e Formas de Onda no Osciloscópio</div>
                <div className="code-block">
- CLK (Clock): Onda senoidal ou quadrada perfeita de 25MHz. Amplitude pico a pico deve ser de 0.4V a 0.9V. Onda arredondada ou abaixo de 0.2V indica atenuação ou resistor aberto.
- RST (Reset): Capturar borda de subida rápida. Se a subida for lenta (rampa), indica fuga de corrente por capacitores avariados.
- CO / RI (Dados): Rajadas de pulsos lógicos de 0V a 1.8V/1.2V. Presença de "espinhos" acima de 2.1V indica capacitores buck esgotados.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODULO 4: JIGS E TESTADORES */}
        <div style={accordionStyle(expandedAccordion === 'mod4')}>
          <div style={accordionHeaderStyle} onClick={() => setExpandedAccordion(expandedAccordion === 'mod4' ? null : 'mod4')}>
            <span>🔌 MÓDULO 4: Testadores Estáticos & Jigs (Anvil/Stasic)</span>
            <span>{expandedAccordion === 'mod4' ? '▼' : '►'}</span>
          </div>
          {expandedAccordion === 'mod4' && (
            <div style={accordionBodyStyle}>
              <div className="card red">
                <div className="card-title">🔴 Sintoma: ASIC COUNT = 0</div>
                <p>
                  A controladora não obteve resposta lógica do primeiro chip da hashboard.
                </p>
                <div className="code-block">
Causas Principais:
1. PIC microcontrolador de partida (U6) sem alimentação de 3.3V ou desprogramado.
2. Regulador Buck principal não está gerando a alta tensão de alimentação dos domínios.
3. Tradutores de sinal lógicos U1 ou U2 queimados por inversão de ordem dos cabos.
                </div>
              </div>

              <div className="card">
                <div className="card-title">💡 Sintoma: Cadeia Parcial (ex: ASIC COUNT = 32 de 126)</div>
                <p>
                  O sinal lógicos de transmissão fluiu com sucesso até o chip 32. O ponto de quebra está posicionado exatamente entre os chips 32 e 33.
                </p>
                <div className="tip-box">
                  👉 <b>Procedimento de Bancada:</b> Meça as tensões do domínio do chip 33. Verifique se o regulador LDO local está entregando as tensões reguladas, meça a integridade do capacitor de acoplamento de 100nF na linha de sinal e faça reflow no chip 33.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODULO 6: ANÁLISE COMPLETA DE LOGS */}
        <div style={accordionStyle(expandedAccordion === 'mod6')}>
          <div style={accordionHeaderStyle} onClick={() => setExpandedAccordion(expandedAccordion === 'mod6' ? null : 'mod6')}>
            <span>📄 MÓDULO 5: logs de Inicialização & Decodificador</span>
            <span>{expandedAccordion === 'mod6' ? '▼' : '►'}</span>
          </div>
          {expandedAccordion === 'mod6' && (
            <div style={accordionBodyStyle}>
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
        </div>
      )}
    </div>

        {/* MODULO 7: OVERCLOCK & VNISH */}
        <div style={accordionStyle(expandedAccordion === 'mod7')}>
          <div style={accordionHeaderStyle} onClick={() => setExpandedAccordion(expandedAccordion === 'mod7' ? null : 'mod7')}>
            <span>🔥 MÓDULO 6: Overclocking, Fans & VNish Control</span>
            <span>{expandedAccordion === 'mod7' ? '▼' : '►'}</span>
          </div>
          {expandedAccordion === 'mod7' && (
            <div style={accordionBodyStyle}>
              <div className="card">
                <div className="card-title">⚙️ Como Controlar os Coolers para Teste de Bancada</div>
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
            </div>
          )}
        </div>

        {/* MODULO 8: CURSOS E VÍDEOS DE REPARO */}
        <div style={accordionStyle(expandedAccordion === 'mod8')}>
          <div style={accordionHeaderStyle} onClick={() => setExpandedAccordion(expandedAccordion === 'mod8' ? null : 'mod8')}>
            <span>🔗 MÓDULO 7: Cursos & Vídeos de Reparo</span>
            <span>{expandedAccordion === 'mod8' ? '▼' : '►'}</span>
          </div>
          {expandedAccordion === 'mod8' && (
            <div style={accordionBodyStyle}>
              {/* Category Filter Pills */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {['TODOS', 'S19', 'S19j Pro', 'S19k Pro', 'S19 XP', 'S19 Hydro Series', 'S21 / T21', 'S21 XP', 'Whatsminer', 'L7', 'Avalon', 'S9 / T9 (Série Clássica)', 'Diagnóstico de Logs / Geral', 'Geral / Outros Modelos'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => {
                      setVideoSelectedCategory(cat);
                      setVideoLimit(15);
                    }}
                    style={{
                      background: videoSelectedCategory === cat ? '#f97316' : '#1e293b',
                      border: `1px solid ${videoSelectedCategory === cat ? '#f97316' : '#334155'}`,
                      borderRadius: 20,
                      padding: '6px 12px',
                      color: '#ffffff',
                      fontSize: '11px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      fontWeight: videoSelectedCategory === cat ? 'bold' : 'normal',
                      boxShadow: videoSelectedCategory === cat ? '0 2px 8px rgba(249,115,22,0.3)' : 'none'
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar vídeo por título ou palavra-chave (ex: 'sensor', '0 chip', 'power')..."
                  value={videoSearchQuery}
                  onChange={(e) => {
                    setVideoSearchQuery(e.target.value);
                    setVideoLimit(15);
                  }}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '10px 36px 10px 12px',
                    color: '#ffffff',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                {videoSearchQuery && (
                  <button 
                    onClick={() => {
                      setVideoSearchQuery('');
                      setVideoLimit(15);
                    }}
                    style={{
                      position: 'absolute',
                      right: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Results info */}
              {(() => {
                const filtered = VIDEOS_DATA.filter(video => {
                  if (videoSelectedCategory !== 'TODOS' && video.category !== videoSelectedCategory) {
                    return false;
                  }
                  if (videoSearchQuery) {
                    const q = videoSearchQuery.toLowerCase();
                    return (
                      video.title.toLowerCase().includes(q) ||
                      video.category.toLowerCase().includes(q) ||
                      video.curso.toLowerCase().includes(q)
                    );
                  }
                  return true;
                });

                return (
                  <>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Encontrados: <strong>{filtered.length}</strong> vídeo(s)</span>
                      <span>Mostrando até {Math.min(filtered.length, videoLimit)}</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {filtered.slice(0, videoLimit).map((vid, idx) => (
                        <div 
                          key={idx} 
                          style={{
                            background: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: 8,
                            padding: '14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            position: 'relative'
                          }}
                        >
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ background: '#f97316', color: '#fff', fontSize: '9px', fontWeight: 'bold', padding: '2px 6px', borderRadius: 4 }}>
                              {vid.category}
                            </span>
                            <span style={{ background: '#475569', color: '#fff', fontSize: '9px', fontWeight: 'bold', padding: '2px 6px', borderRadius: 4 }}>
                              {vid.curso}
                            </span>
                          </div>
                          <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#f8fafc', lineHeight: '1.4' }}>
                            {vid.title}
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            <a 
                              href={vid.youtubeLink} 
                              target="_blank" 
                              rel="noreferrer"
                              style={{
                                background: '#ef4444', 
                                color: '#fff', 
                                textDecoration: 'none', 
                                borderRadius: 6, 
                                padding: '6px 12px', 
                                fontSize: '11px', 
                                fontWeight: 'bold',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                cursor: 'pointer'
                              }}
                            >
                              🎥 Assistir no YouTube
                            </a>
                            {vid.courseLink && (
                              <a 
                                href={vid.courseLink} 
                                target="_blank" 
                                rel="noreferrer"
                                style={{
                                  background: '#334155', 
                                  color: '#f8fafc', 
                                  textDecoration: 'none', 
                                  borderRadius: 6, 
                                  padding: '6px 12px', 
                                  fontSize: '11px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  cursor: 'pointer'
                                }}
                              >
                                📖 Aula ZeusBTC
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {filtered.length > videoLimit && (
                      <button
                        onClick={() => setVideoLimit(prev => prev + 20)}
                        style={{
                          width: '100%',
                          background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                          border: 'none',
                          color: '#fff',
                          borderRadius: 8,
                          padding: '12px',
                          marginTop: 14,
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          fontSize: '13px',
                          boxShadow: '0 4px 12px rgba(249,115,22,0.2)'
                        }}
                      >
                        Carregar Mais Vídeos (+20)
                      </button>
                    )}

                    {filtered.length === 0 && (
                      <div style={{ textAlign: 'center', color: '#94a3b8', padding: '30px 0', fontSize: '13px' }}>
                        Nenhum vídeo encontrado para a busca ou filtro selecionado.
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    )}

    {/* ADD / EDIT MODEL MODAL (ADMIN ONLY) */}
    {(editingModel || showAddForm) && isAdmin019 && (
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}>
        <div style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          width: 480,
          padding: 24,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          boxSizing: 'border-box'
        }}>
          <h3 style={{ marginTop: 0, color: 'var(--accent)', fontSize: 16, fontWeight: 900, marginBottom: 16, fontFamily: 'monospace' }}>
            {showAddForm ? '➕ ADICIONAR NOVO MODELO' : '✏️ EDITAR MODELO'}
          </h3>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const modelData = {
              id: showAddForm ? String(Date.now()) : editingModel.id,
              family: fd.get('family'),
              model: fd.get('model'),
              code: fd.get('code'),
              type: fd.get('type'),
              chip: fd.get('chip'),
              chips: Number(fd.get('chips')) || 0
            };
            
            if (showAddForm) {
              updateModels([...modelsList, modelData]);
              setShowAddForm(false);
            } else {
              updateModels(modelsList.map(x => x.id === editingModel.id ? modelData : x));
              setEditingModel(null);
            }
          }}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--dim)', marginBottom: 4, fontWeight: 'bold' }}>Família / Categoria:</label>
              <select name="family" defaultValue={showAddForm ? 's19' : editingModel.family} style={inputStyle}>
                <option value="s19">Família Antminer S19 (e Hydro)</option>
                <option value="modern">Linha Ultra Moderna (S21, S23, Altcoins)</option>
              </select>
            </div>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--dim)', marginBottom: 4, fontWeight: 'bold' }}>Modelo da Máquina:</label>
              <input type="text" name="model" required defaultValue={showAddForm ? '' : editingModel.model} style={inputStyle} placeholder="Ex: S19j Pro" />
            </div>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--dim)', marginBottom: 4, fontWeight: 'bold' }}>Código da Hashboard:</label>
              <input type="text" name="code" required defaultValue={showAddForm ? '' : editingModel.code} style={inputStyle} placeholder="Ex: BHB2868" />
            </div>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--dim)', marginBottom: 4, fontWeight: 'bold' }}>Tipo de Resfriamento / Algoritmo:</label>
              <input type="text" name="type" required defaultValue={showAddForm ? '' : editingModel.type} style={inputStyle} placeholder="Ex: Alumínio ou SHA-256" />
            </div>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--dim)', marginBottom: 4, fontWeight: 'bold' }}>Nomenclatura do Chip:</label>
              <input type="text" name="chip" required defaultValue={showAddForm ? '' : editingModel.chip} style={inputStyle} placeholder="Ex: BM1362AC" />
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--dim)', marginBottom: 4, fontWeight: 'bold' }}>Quantidade de Chips:</label>
              <input type="number" name="chips" required defaultValue={showAddForm ? 76 : editingModel.chips} style={inputStyle} placeholder="Ex: 126" />
            </div>
            
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setShowAddForm(false); setEditingModel(null); }} style={btnCancelStyle}>Cancelar</button>
              <button type="submit" style={btnSaveStyle}>Salvar</button>
            </div>
          </form>
        </div>
      </div>
    )}
  </div>;
}
