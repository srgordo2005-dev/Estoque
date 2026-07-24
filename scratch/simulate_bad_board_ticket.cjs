const http = require('http');
const fs = require('fs');
const path = require('path');

const targetIP = '192.168.1.39';

function queryHTTP(endpoint) {
    return new Promise((resolve) => {
        const req = http.get(`http://${targetIP}${endpoint}`, { timeout: 4000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch(e) { resolve({ raw: data }); }
            });
        });
        req.on('error', (err) => resolve({ error: err.message }));
        req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    });
}

async function simulateTicket() {
    console.log(`Querying miner at ${targetIP} for Hashboard SNs and simulating Bad Board Ticket...`);

    const info = await queryHTTP('/api/v1/info');
    const summary = await queryHTTP('/api/v1/summary');

    const s = summary?.miner || {};
    const net = info?.system?.network_status || {};
    const mac = net.mac || '02:42:41:02:1F:F3';

    // Chains (Hashboards)
    const chains = s.chains || [];

    const boardsList = chains.map((c, idx) => {
        return {
            slot_id: c.id || (idx + 1),
            sn: c.sn || c.serial || `HASH-${mac.replace(/:/g,'').slice(-6)}-BOARD0${c.id || (idx+1)}`,
            frequency: c.frequency,
            voltage: c.voltage,
            hashrate_th: (c.hashrate_rt / 1000).toFixed(1),
            pcb_temp: c.pcb_temp?.max,
            chip_temp: c.chip_temp?.max,
            status: c.status?.state || 'mining',
            chips_summary: `${c.chip_statuses?.grey || 108} OK / ${c.chip_statuses?.orange || 0} Warn / ${c.chip_statuses?.red || 0} Defect`
        };
    });

    console.log("\n=== 1. EXTRACTED HASHBOARD SNs ===");
    console.table(boardsList);

    // Simulate bad board on Chain 1 (e.g. Chain 1 has 2 orange chips and lower TH)
    const badBoard = boardsList[0]; // Placa #1

    const simulatedTicket = {
        ticket_id: `TCK-${Date.now().toString().slice(-6)}`,
        timestamp: new Date().toLocaleString('pt-BR'),
        status: "🔴 ENVIADO PARA REPARO / BANCADA",
        machine: {
            ip: targetIP,
            model: info.miner || "Antminer S21 (Vnish 1.2.7)",
            mac: mac,
            slot_location: "Prateleira 1 - Slot #39",
            worker: s.pools?.[0]?.user || "srgordo.001"
        },
        defective_hashboard: {
            board_number: badBoard.slot_id,
            board_sn: badBoard.sn,
            chips_status: badBoard.chips_summary,
            temp_max: `${badBoard.chip_temp}°C`,
            current_hashrate: `${badBoard.hashrate_th} TH/s`
        },
        error_diagnostics: {
            reason: "⚠️ 2 Chips com Instabilidade de Frequência (Orange Status) & Queda de TH/s",
            log_snippet: `[2026-07-24 10:44:02] [WARN] Chain 1: Chip #42 and Chip #78 frequency drop to 320MHz.\n[2026-07-24 10:44:05] [ERROR] Chain 1: Hashrate 54.9 TH/s is below nominal 58.8 TH/s.`
        },
        dashboard_proof: {
            screenshot_url: `http://localhost:3001/api/screenshot?ip=${targetIP}`,
            note: "Print da Dashboard anexado automaticamente via API"
        }
    };

    console.log("\n=== 2. SIMULATED TICKET DE CONSERTO (ENVIADO PARA A BANCADA) ===");
    console.log(JSON.stringify(simulatedTicket, null, 2));
}

simulateTicket();
