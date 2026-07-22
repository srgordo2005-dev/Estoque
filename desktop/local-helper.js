
// Helper to accurately extract Miner Model and SN from Stats/Summary/Version
function detectMinerDetails(stat = {}, summary = {}, version = {}) {
    let rawModel = stat.Type || stat.Miner || stat['Miner Type'] || stat.hardware || stat.product || 
                   version?.VERSION?.[0]?.Miner || version?.VERSION?.[0]?.Type || version?.VERSION?.[0]?.Hardware || '';
    
    if (!rawModel && summary?.STATUS?.[0]?.Description) {
        rawModel = summary.STATUS[0].Description;
    }

    let model = 'Antminer S19j Pro'; // Default clean fallback if miner detected but model string is empty
    if (rawModel) {
        const lower = String(rawModel).toLowerCase();
        if (lower.includes('s19j pro') || lower.includes('s19jpro')) model = 'Antminer S19j Pro';
        else if (lower.includes('s19 pro') || lower.includes('s19pro')) model = 'Antminer S19 Pro';
        else if (lower.includes('s19 xp')) model = 'Antminer S19 XP';
        else if (lower.includes('s19')) model = 'Antminer S19';
        else if (lower.includes('s21')) model = 'Antminer S21';
        else if (lower.includes('t21')) model = 'Antminer T21';
        else if (lower.includes('m30s+')) model = 'Whatsminer M30S+';
        else if (lower.includes('m30s')) model = 'Whatsminer M30S';
        else if (lower.includes('m31s')) model = 'Whatsminer M31S';
        else if (lower.includes('m50')) model = 'Whatsminer M50';
        else if (lower.includes('whatsminer') || lower.includes('m20') || lower.includes('m32')) model = 'Whatsminer M30S';
        else model = String(rawModel).replace(/bmminer/gi, '').trim() || 'Antminer S19j Pro';
    } else if (stat.chain_acn || stat.chain_acs || stat.BMMiner || stat['hash board 0 sn']) {
        model = 'Antminer S19j Pro';
    } else if (stat['system_miner_type']) {
        model = stat['system_miner_type'];
    }

    let sn = stat.Miner_SN || stat.miner_sn || stat.SN || stat.mac || version?.VERSION?.[0]?.SN || '';
    return { model, sn };
}

const express = require('express');
const cors = require('cors');
const dgram = require('dgram');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const TelegramBot = require('node-telegram-bot-api');
// puppeteer-core is dynamically imported inside /api/screenshot handler to support ESM packaging

const botToken = '8627853322:AAEwVrIwNz3vPejxiaUFGR0sb2I6bBRieyo';
const bot = new TelegramBot(botToken, {polling: true});
let telegramChatId = null;

bot.onText(/\/start/, (msg) => {
  telegramChatId = msg.chat.id;
  bot.sendMessage(telegramChatId, '🚨 Farm Monitor Bridge conectada! Você passará a receber alertas de superaquecimento e falhas aqui.');
});


const ws = require('ws');
globalThis.WebSocket = ws;

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://paelbarlmayswqilhoxa.supabase.co';
const supabaseKey = 'sb_publishable_6Kz2o4DWlxhBgc7oyDt2AA_KmphGK-h';
const supabase = createClient(supabaseUrl, supabaseKey);

// Parse --farm argument from command line or default to "Fazenda Principal"
const argsList = process.argv.slice(2);
const farmIdx = argsList.indexOf('--farm');
const activeFarmName = farmIdx !== -1 ? argsList[farmIdx + 1] : 'Fazenda Principal';

console.log(`[HashStock Bridge] Monitorando Fazenda: "${activeFarmName}"`);

// Setup Supabase Realtime Broadcast Bridge
const setupRealtimeBridge = () => {
    const channelName = `farm-${activeFarmName.replace(/\s+/g, '_')}`;
    const channel = supabase.channel(channelName);

    channel.on('broadcast', { event: 'command' }, async ({ payload }) => {
        console.log(`[HashStock Bridge] Comando Remoto Recebido:`, payload);
        const { type, ip, ...args } = payload;
        if (!ip) return;

        try {
            if (type === 'reboot') {
                await queryMinerAPI(ip, 'reboot').catch(() => null);
            } else if (type === 'blink') {
                const stateStr = args.on ? '1' : '0';
                await queryMinerAPI(ip, `ascset|0,led,${stateStr}`).catch(() => null);
            } else if (type === 'set-pool') {
                await fetch('http://localhost:3001/api/set-pool', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ ip, url: args.url, worker: args.worker, password: args.password })
                }).catch(() => null);
            }
            // Trigger quick update and broadcast back
            await updateFarmStatus();
            broadcastStatus();
        } catch (e) {
            console.error('[HashStock Bridge] Erro ao executar comando remoto:', e);
        }
    });

    const broadcastStatus = () => {
        channel.send({
            type: 'broadcast',
            event: 'status-update',
            payload: {
                farm: activeFarmName,
                statusCache: minerStatusCache
            }
        });
    };

    channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            console.log(`[HashStock Bridge] Conectado e transmitindo na sala: ${channelName}`);
            // Initial broadcast
            broadcastStatus();
            // Relay status updates every 7 seconds
            setInterval(broadcastStatus, 7000);
        }
    });
};

// Start Bridge after setup
setTimeout(setupRealtimeBridge, 5000);


const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;

// IP Report state
let lastIPReports = [];

// Status tracking for UDP ports
let udpStatuses = {};

// Setup UDP Listeners for Bitmain and Whatsminer IP Reports
const setupUDPServer = (port) => {
    const server = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    udpStatuses[port] = 'iniciando';

    server.on('error', (err) => {
        console.error(`UDP Server error on port ${port}:`, err);
        udpStatuses[port] = `erro: ${err.message}`;
        try { server.close(); } catch(e){}
    });
    server.on('message', (msg, rinfo) => {
        console.log(`Received IP Report broadcast from ${rinfo.address} on port ${port}`);
        
        // Log to a permanent file to debug firewall issues
        try {
            const logLine = `[${new Date().toISOString()}] Port ${port}: Received packet from ${rinfo.address} - Hex: ${msg.toString('hex')}\n`;
            fs.appendFileSync(path.join(__dirname, 'ipreport_debug.log'), logLine);
        } catch(e) {}

        const existingIdx = lastIPReports.findIndex(x => x.ip === rinfo.address);
        if (existingIdx !== -1) {
            lastIPReports.splice(existingIdx, 1);
        }
        lastIPReports.unshift({
            ip: rinfo.address,
            timestamp: Date.now(),
            source_port: port,
            raw_hex: msg.toString('hex')
        });
        if (lastIPReports.length > 30) lastIPReports.pop();
    });
    server.on('listening', () => {
        const addr = server.address();
        udpStatuses[port] = 'ativo';
        console.log(`UDP Listener active for IP Reports on ${addr.address}:${addr.port} (reuseAddr shared)`);
        try {
            server.setBroadcast(true);
            console.log(`Enabled UDP broadcast mode on port ${port}`);
        } catch(e) {
            console.error(`Failed to setBroadcast on port ${port}:`, e.message);
        }
    });
    try {
        server.bind({ port: port, address: '0.0.0.0', exclusive: false });
    } catch (e) {
        udpStatuses[port] = `erro bind: ${e.message}`;
        console.error(`Could not bind UDP on port ${port}:`, e.message);
    }
};


setupUDPServer(4000); // Bitmain
setupUDPServer(3456); // Whatsminer
setupUDPServer(14285); // Whatsminer alternate
setupUDPServer(8888); // Braiins/Vnish alternate

// Helper to query CGMiner/Whatsminer API over TCP port 4028
const queryMinerAPI = (ip, cmd) => {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        let data = '';
        client.setTimeout(2500);

        client.connect(4028, ip, () => {
            client.write(JSON.stringify({ command: cmd }) + '\n');
        });

        client.on('data', (chunk) => {
            data += chunk.toString();
        });

        client.on('close', () => {
            data = data.replace(/\0/g, '').trim();
            try {
                if (data.startsWith('{')) {
                    resolve(JSON.parse(data));
                } else if (data.length > 0) {
                    resolve({ raw: data });
                } else {
                    reject(new Error('Empty response'));
                }
            } catch (e) {
                resolve({ raw: data, error: 'parse_error' });
            }
        });

        client.on('error', (err) => {
            client.destroy();
            reject(err);
        });

        client.on('timeout', () => {
            client.destroy();
            reject(new Error('timeout'));
        });
    });
};

// Endpoint to fetch IP reports
app.get('/api/ping', (req, res) => res.json({ status: 'ok' }));

app.get('/api/ipreport', (req, res) => {
    if (req.query.clear === 'true') {
        lastIPReports = [];
        return res.json([]);
    }
    // Keep only reports from the last 2 minutes
    lastIPReports = lastIPReports.filter(r => Date.now() - r.timestamp < 120000);
    res.json(lastIPReports);
});

// Endpoint to scan a range of IPs (BTC Tools style scanner)
app.post('/api/scan-range', async (req, res) => {
    let { start, end, subnet } = req.body;
    let ipList = [];
    
    if (subnet) {
        for (let i = 1; i <= 254; i++) ipList.push(`${subnet}.${i}`);
    } else if (start && end) {
        const ipToLong = ip => ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
        const longToIp = long => [(long >>> 24) & 255, (long >>> 16) & 255, (long >>> 8) & 255, long & 255].join('.');
        const startLong = ipToLong(start);
        const endLong = ipToLong(end);
        for (let l = startLong; l <= endLong && ipList.length < 256; l++) {
            ipList.push(longToIp(l));
        }
    } else {
        return res.status(400).json({ error: 'Informe start/end ou subnet' });
    }

    console.log(`BTC Tools Scanner: Scanning ${ipList.length} IPs...`);
    const results = [];
    const batchSize = 35;
    for (let i = 0; i < ipList.length; i += batchSize) {
        const batch = ipList.slice(i, i + batchSize);
        await Promise.all(batch.map(async (ip) => {
            try {
                const summaryData = await queryMinerAPI(ip, 'summary').catch(() => null);
                if (!summaryData) return;
                const statsData = await queryMinerAPI(ip, 'stats').catch(() => null);
                
                const sum = summaryData?.SUMMARY?.[0] || {};
                const stat = statsData?.STATS?.[1] || {};
                
                let hashrate = 0;
                if (sum['MHS av']) hashrate = sum['MHS av'] / 1000000;
                if (sum['GHS av']) hashrate = sum['GHS av'] / 1000;
                if (sum['THS av']) hashrate = sum['THS av'];
                
                let maxTemp = 0;
                for(let t=1; t<=4; t++) {
                    if(stat[`temp${t}`] > maxTemp) maxTemp = stat[`temp${t}`];
                    if(stat[`temp_chip${t}`]) {
                        const temps = String(stat[`temp_chip${t}`]).split('-').map(Number);
                        temps.forEach(tp => { if(tp > maxTemp) maxTemp = tp; });
                    }
                }

                results.push({
                    ip,
                    status: hashrate > 0 ? 'mining' : 'idle',
                    model: detectMinerDetails(stat, summaryData, null).model,
                    sn: detectMinerDetails(stat, summaryData, null).sn || stat.Miner_SN || '',
                    sn: stat.Miner_SN || stat.miner_sn || stat.SN || '',
                    uptime: sum.Elapsed || 0,
                    hashrate: hashrate,
                    temp: maxTemp,
                    slots: [
                        stat.chain_sn0 || stat.pcb_sn0 || stat['hash board 0 sn'] || stat['board_sn0'] || null,
                        stat.chain_sn1 || stat.pcb_sn1 || stat['hash board 1 sn'] || stat['board_sn1'] || null,
                        stat.chain_sn2 || stat.pcb_sn2 || stat['hash board 2 sn'] || stat['board_sn2'] || null
                    ]
                });
            } catch (e) {
                // Ignore non-responsive IPs
            }
        }));
    }

    res.json({ count: results.length, miners: results });
});

// Endpoint to get miner details (Model, SN, MAC, Hashboard SNs, Hashrate, Uptime)
app.get('/api/miner-info', async (req, res) => {
    const ip = req.query.ip;
    if (!ip) return res.status(400).json({ error: 'IP parameter is required' });

    try {
        // Run commands in parallel if possible, but some miners block parallel conns.
        // Let's do them sequentially just to be safe.
        const summaryData = await queryMinerAPI(ip, 'summary').catch(e => null);
        const statsData = await queryMinerAPI(ip, 'stats').catch(e => null);
        const devsData = await queryMinerAPI(ip, 'devs').catch(e => null);
        
        let result = {
            ip,
            mac: '',
            model: '',
            sn: '',
            uptime: 0,
            hashrate: 0,
            slots: [null, null, null],
            status: 'unknown',
            raw_summary: summaryData,
            raw_stats: statsData,
            raw_devs: devsData
        };

        // Extract Uptime & Hashrate from Summary
        if (summaryData && summaryData.SUMMARY && summaryData.SUMMARY.length > 0) {
            const sum = summaryData.SUMMARY[0];
            result.uptime = sum.Elapsed || 0;
            // MH/s or GH/s or TH/s handling
            if (sum['MHS av']) result.hashrate = sum['MHS av'] / 1000000;
            if (sum['GHS av']) result.hashrate = sum['GHS av'] / 1000;
            if (sum['THS av']) result.hashrate = sum['THS av'];
        }

        // Extract MAC, SN, Model, Hashboard SNs from Stats
        if (statsData && statsData.STATS && statsData.STATS.length > 1) {
            const stat = statsData.STATS[1];
            result.mac = stat.mac || stat.MAC || '';
            result.model = stat.Type || stat.Miner || stat['Miner Type'] || '';
            result.sn = stat.Miner_SN || stat.miner_sn || stat.SN || '';
            
            if (stat.chain_acn) {
                // Array of active chips or boards
                result.status = 'mining';
            }

            // Look for board SNs
            // Usually formatted as chain_sn0, pcb_sn0, hash_sn0, or similar
            const pcb0 = stat.chain_sn0 || stat.pcb_sn0 || stat['hash board 0 sn'] || stat['board_sn0'];
            const pcb1 = stat.chain_sn1 || stat.pcb_sn1 || stat['hash board 1 sn'] || stat['board_sn1'];
            const pcb2 = stat.chain_sn2 || stat.pcb_sn2 || stat['hash board 2 sn'] || stat['board_sn2'];
            
            if (pcb0) result.slots[0] = pcb0;
            if (pcb1) result.slots[1] = pcb1;
            if (pcb2) result.slots[2] = pcb2;
        }
        
        // Look into Devs for Whatsminer specific info
        if (devsData && devsData.DEVS) {
            if (result.hashrate === 0) {
                 const totalMH = devsData.DEVS.reduce((acc, dev) => acc + (dev['MHS av'] || 0), 0);
                 result.hashrate = totalMH / 1000000;
            }
        }

        // Decide status
        if (result.hashrate > 0) {
            result.status = 'mining';
        } else {
            result.status = 'idle/error';
        }

        res.json(result);
    } catch (e) {
        console.error('Error querying miner:', e);
        res.status(500).json({ error: e.message });
    }
});

// Endpoint to fetch logs for a bad hashboard
app.get('/api/miner-log', async (req, res) => {
    const ip = req.query.ip;
    if (!ip) return res.status(400).json({ error: 'IP parameter is required' });

    try {
        const estatsData = await queryMinerAPI(ip, 'estats').catch(e => null);
        const configData = await queryMinerAPI(ip, 'config').catch(e => null);
        const statsData = await queryMinerAPI(ip, 'stats').catch(e => null);
        
        // Try to gather any relevant errors
        let logs = [];
        if (estatsData && estatsData.STATS) {
            logs.push(JSON.stringify(estatsData.STATS, null, 2));
        }
        if (statsData && statsData.STATS) {
             const stat = statsData.STATS[1] || {};
             if(stat.chain_hw) logs.push(`HW Errors: ${JSON.stringify(stat.chain_hw)}`);
        }
        
        res.json({ log: logs.join('\n\n') });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const findChromePath = () => {
    const paths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
};

// Endpoint to capture screenshot
app.post('/api/screenshot', async (req, res) => {
    const { ip, user, pass } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP is required' });

    const executablePath = findChromePath();
    if (!executablePath) {
        return res.status(500).json({ error: 'Nenhum navegador (Chrome/Edge) encontrado no PC local.' });
    }

    let browser;
    try {
        console.log(`Taking screenshot of http://${ip} ...`);
        const { default: puppeteer } = await import('puppeteer-core');
        browser = await puppeteer.launch({
            executablePath,
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
        });
        
        const page = await browser.newPage();
        const creds = [
            {username: user || 'root', password: pass || 'root'},
            {username: user || 'admin', password: pass || 'admin'},
            {username: user || 'root', password: pass || 'admin'}
        ];

        let screenshotBuffer = null;
        await page.authenticate({ username: creds[0].username, password: creds[0].password });
        await page.goto(`http://${ip}`, { waitUntil: 'networkidle0', timeout: 15000 }).catch(e => console.log('Goto timeout/error:', e.message));
        screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: true });

        const base64 = screenshotBuffer.toString('base64');
        res.json({ success: true, image: `data:image/jpeg;base64,${base64}` });

    } catch (error) {
        console.error('Screenshot error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (browser) await browser.close();
    }
});

// Blink / Locate Device
app.post('/api/blink', async (req, res) => {
    const { ip, firmware, on } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP parameter is required' });

    try {
        if (firmware === 'braiins') {
            const state = on ? 'on' : 'off';
            const cmd = `./braiins-toolbox system locate-device ${state} ${ip}`;
            console.log(`Executing: ${cmd}`);
            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    console.error('Braiins blink error:', stderr);
                    return res.status(500).json({ error: stderr || error.message });
                }
                res.json({ success: true, message: `Braiins blink ${state} command sent`, stdout });
            });
            return;
        }

        // Vnish or default (CGMiner API)
        // Vnish typically uses ascset 0,led,1 or ascset 0,led,0
        // Or sometimes through web API. Let's try CGMiner API first.
        const stateStr = on ? '1' : '0';
        const result = await queryMinerAPI(ip, `ascset|0,led,${stateStr}`).catch(e => null);
        if (result && result.STATUS && result.STATUS[0] && result.STATUS[0].STATUS !== 'E') {
            res.json({ success: true, message: `Vnish blink ${stateStr} command sent via CGMiner API`, result });
        } else {
            // Fallback: try HTTP if CGMiner fails (assuming standard /cgi-bin/blink.cgi)
            // Need node-fetch, which we installed earlier.
            res.json({ success: false, message: 'Falha ao acionar LED via API padrão.', raw: result });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Farm Monitoring and Status Caching
let farmMachines = []; // array of { ip, sn, location }
const cacheFile = path.join(__dirname, 'miner_status_cache.json');
let minerStatusCache = {};
try {
    if (fs.existsSync(cacheFile)) {
        minerStatusCache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        console.log(`[Cache] Loaded ${Object.keys(minerStatusCache).length} cached miner statuses from file.`);
    }
} catch(e) {
    console.error("[Cache] Failed to load miner status cache from file:", e.message);
}

app.post('/api/set-farm', (req, res) => {
    if (req.body.machines) {
        farmMachines = req.body.machines;
        console.log(`Farm list updated. Monitoring ${farmMachines.length} machines.`);
        // Clean cache of removed IPs
        const activeIPs = new Set(farmMachines.map(m => m.ip).filter(Boolean));
        for (const cachedIP in minerStatusCache) {
             if (!activeIPs.has(cachedIP)) delete minerStatusCache[cachedIP];
        }
        // Run update immediately
        updateFarmStatus();
    }
    res.json({ success: true, count: farmMachines.length });
});

app.get('/api/farm-status', (req, res) => {
    res.json(minerStatusCache);
});

const updateFarmStatus = async () => {
    let activeIPs = farmMachines.map(m => m.ip).filter(Boolean);
    
    // Auto-discover local subnet 192.168.1.x if activeIPs is empty
    if (activeIPs.length === 0) {
        for (let i = 1; i <= 254; i++) {
            activeIPs.push("192.168.1." + i);
        }
    }

    const batchSize = 30;
    for (let i = 0; i < activeIPs.length; i += batchSize) {
        const batch = activeIPs.slice(i, i + batchSize);
        await Promise.all(batch.map(async (ip) => {
            try {
                const summaryData = await queryMinerAPI(ip, 'summary').catch(() => null);
                if (!summaryData) return;
                const statsData = await queryMinerAPI(ip, 'stats').catch(() => null);
                
                const sum = summaryData?.SUMMARY?.[0] || {};
                const stat = statsData?.STATS?.[1] || statsData?.STATS?.[0] || {};
                
                let hashrate = 0;
                if (sum['MHS av']) hashrate = sum['MHS av'] / 1000000;
                if (sum['GHS av']) hashrate = sum['GHS av'] / 1000;
                if (sum['THS av']) hashrate = sum['THS av'];
                
                let maxTemp = 0;
                for(let t=1; t<=4; t++) {
                    if(stat[`temp${t}`] > maxTemp) maxTemp = stat[`temp${t}`];
                    if(stat[`temp_chip${t}`]) {
                        const temps = String(stat[`temp_chip${t}`]).split('-').map(Number);
                        temps.forEach(tp => { if(tp > maxTemp) maxTemp = tp; });
                    }
                }
                
                const slots = [
                    stat.chain_sn0 || stat.pcb_sn0 || stat['hash board 0 sn'] || stat['board_sn0'] || null,
                    stat.chain_sn1 || stat.pcb_sn1 || stat['hash board 1 sn'] || stat['board_sn1'] || null,
                    stat.chain_sn2 || stat.pcb_sn2 || stat['hash board 2 sn'] || stat['board_sn2'] || null
                ];
                
                const details = detectMinerDetails(stat, summaryData, null);
                minerStatusCache[ip] = {
                    ip,
                    status: hashrate > 0 ? 'mining' : 'idle',
                    model: details.model,
                    sn: details.sn,
                    uptime: sum.Elapsed || 0,
                    hashrate: hashrate,
                    temp: maxTemp,
                    slots,
                    lastUpdate: Date.now()
                };
            } catch (e) {
                // Non-responsive IP
            }
        }));
        
        // Save cache to disk
        try {
            fs.writeFileSync(cacheFile, JSON.stringify(minerStatusCache, null, 2), 'utf8');
        } catch(e) {}
    }
};

setInterval(updateFarmStatus, 10000);

// Telegram alert checker runs every 5 minutes on the cached data (preventing double pings)
setInterval(() => {
    if (farmMachines.length === 0) return;
    console.log(`Monitoring Alert Check: analyzing ${farmMachines.length} cached machines...`);
    
    for (const m of farmMachines) {
        if (!m.ip) continue;
        const cached = minerStatusCache[m.ip];
        if (!cached || cached.status === 'offline') {
            // Only alert offline once or keep quiet to avoid spam. Let's send basic notification.
            if (telegramChatId && (!cached || Date.now() - cached.lastUpdate > 300000)) {
                bot.sendMessage(telegramChatId, `⚠️ MÁQUINA OFFLINE / ERRO DE LEITURA\n📍 Local: ${m.location}\n📦 SN: ${m.sn}\n🌐 IP: ${m.ip}`);
            }
            continue;
        }
        
        if (cached.temp > 89) {
            if (telegramChatId) {
                bot.sendMessage(telegramChatId, `🔥 ALERTA DE SUPERAQUECIMENTO\n📍 Local: ${m.location}\n📦 SN: ${m.sn}\n🌐 IP: ${m.ip}\n🌡️ Temperatura Crítica: ${cached.temp}°C`);
            }
        }
    }
}, 5 * 60 * 1000);


app.get('/api/ipreport-status', (req, res) => {
    res.json(udpStatuses);
});

app.listen(PORT, () => {
    console.log(`✅ HashStock Local Helper Service running on http://localhost:${PORT}`);
});
