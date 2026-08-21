const fs = require('fs');
const path = require('path');
const net = require('net');
const minerScanner = require('./miner-scanner');
const TelegramBot = require('node-telegram-bot-api').default || require('node-telegram-bot-api');

// Store farms config
let farmsConfig = [];
const configFile = path.join(__dirname, 'farmsConfig.json');

try {
    if (fs.existsSync(configFile)) {
        farmsConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    }
} catch (e) {
    console.error("Failed to load farmsConfig.json");
}

let bots = {}; // Cache for initialized Telegram bots

// Helper to query CGMiner/Whatsminer API over TCP port 4028
const queryMinerAPI = (ip, cmd) => {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        let data = '';
        client.setTimeout(2000);

        client.connect(4028, ip, () => {
            client.write(JSON.stringify({ command: cmd }) + '\\n');
        });

        client.on('data', (chunk) => {
            data += chunk.toString();
        });

        client.on('close', () => {
            data = data.replace(/\\0/g, '').trim();
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

const scanFarm = async (farm) => {
    if (!farm.ipRange || !farm.tgToken || !farm.tgChatId) return;

    let [base, end] = farm.ipRange.split('-');
    if (!base || !end) return;

    let ipPrefix = base.split('.').slice(0, 3).join('.');
    let startOctet = parseInt(base.split('.')[3]);
    let endOctet = parseInt(end);
    
    if (isNaN(startOctet) || isNaN(endOctet)) return;

    console.log(`[Farm Reporter] Iniciando scan da fazenda ${farm.name} (${ipPrefix}.${startOctet}-${endOctet})...`);

    let totalMachines = 0;
    let onlineCount = 0;
    let totalHashrate = 0;
    let offlineCount = 0;
    let errors = [];
    
    const ipList = [];
    for (let i = startOctet; i <= endOctet; i++) {
        ipList.push(`${ipPrefix}.${i}`);
    }

    try {
        const scanResults = await minerScanner.scanRange(ipList);
        totalMachines = ipList.length;
        scanResults.forEach(m => {
            if (m.status === 'OFFLINE') {
                offlineCount++;
                return;
            }
            totalHashrate += m.hashrate.current_th;
            onlineCount++;

            const maxTemp = m.hardware.boards_detail.reduce((max, b) => Math.max(max, b.temp_chip || b.temp_outlet || 0), 0);

            if (m.hashrate.current_th === 0) {
                errors.push(`[${m.ip}] 0 TH/s (Placas Zeradas)`);
            }
            if (maxTemp > 85) {
                errors.push(`[${m.ip}] Superaquecimento (${maxTemp}°C)`);
            }
        });
        offlineCount = totalMachines - onlineCount;
    } catch(e) {
        console.error("Error during scanFarm:", e);
    }

    console.log(`[Farm Reporter] Concluído scan da fazenda ${farm.name}`);
    
    // Initialize bot if not exists
    if (!bots[farm.id]) {
        bots[farm.id] = new TelegramBot(farm.tgToken, {polling: false});
    }
    
    const bot = bots[farm.id];
    
    let reportMsg = \`📊 <b>RELATÓRIO DE HORA EM HORA - \${farm.name.toUpperCase()}</b>\n\n\`;
    reportMsg += \`🌐 <b>IPs Verificados:</b> \${totalMachines}\n\`;
    reportMsg += \`🟢 <b>Online:</b> \${onlineCount}\n\`;
    reportMsg += \`🔴 <b>Offline/Sem Leitura:</b> \${offlineCount}\n\`;
    reportMsg += \`⚡ <b>Hashrate Total:</b> \${totalHashrate.toFixed(0)} TH/s\n\n\`;
    
    if (errors.length > 0) {
        reportMsg += \`⚠️ <b>MÁQUINAS COM PROBLEMAS:</b>\n\`;
        errors.slice(0, 20).forEach(err => {
            reportMsg += \`• \${err}\n\`;
        });
        if (errors.length > 20) {
            reportMsg += \`• ... e mais \${errors.length - 20} máquinas.\n\`;
        }
    } else {
        reportMsg += \`✅ Nenhuma máquina com temperatura crítica ou 0 TH detectada.\`;
    }

    try {
        await bot.sendMessage(farm.tgChatId, reportMsg, {parse_mode: 'HTML'});
        console.log(\`[Farm Reporter] Relatório enviado para o Telegram (\${farm.name})\`);
    } catch(e) {
        console.error(\`[Farm Reporter] Erro ao enviar Telegram para \${farm.name}:\`, e.message);
    }
};

const timers = {};

const startFarmTimers = () => {
    Object.keys(timers).forEach(k => clearInterval(timers[k]));
    
    farmsConfig.forEach(farm => {
        if (farm.interval && farm.tgToken && farm.tgChatId) {
            const ms = farm.interval * 60 * 60 * 1000;
            console.log(\`[Farm Reporter] Configurando relatório para \${farm.name} a cada \${farm.interval} horas.\`);
            timers[farm.id] = setInterval(() => scanFarm(farm), ms);
            // Initial scan in 1 minute
            setTimeout(() => scanFarm(farm), 60000);
        }
    });
};

// Auto-start
startFarmTimers();

module.exports = (app) => {
    app.post('/api/farms-config', (req, res) => {
        if (req.body.farms) {
            farmsConfig = req.body.farms;
            fs.writeFileSync(configFile, JSON.stringify(farmsConfig, null, 2));
            console.log(\`[Farm Reporter] Recebida nova configuração. Reiniciando timers...\`);
            startFarmTimers();
            res.json({success: true});
        } else {
            res.status(400).json({error: 'No farms payload'});
        }
    });
};
