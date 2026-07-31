const fs = require('fs');
const path = require('path');
const net = require('net');
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
    
    // Scan in sequential batches to not overload the local network
    const ipList = [];
    for (let i = startOctet; i <= endOctet; i++) {
        ipList.push(`${ipPrefix}.${i}`);
    }

    const batchSize = 20;
    for (let i = 0; i < ipList.length; i += batchSize) {
        const batch = ipList.slice(i, i + batchSize);
        await Promise.all(batch.map(async (ip) => {
            totalMachines++;
            try {
                const summaryData = await queryMinerAPI(ip, 'summary').catch(() => null);
                if (!summaryData) {
                    offlineCount++;
                    return;
                }
                const statsData = await queryMinerAPI(ip, 'stats').catch(() => null);
                
                const sum = summaryData?.SUMMARY?.[0] || {};
                const stat = statsData?.STATS?.[1] || statsData?.STATS?.[0] || {};
                
                let hashrate = 0;
                if (sum['MHS av']) hashrate = sum['MHS av'] / 1000000;
                if (sum['GHS av']) hashrate = sum['GHS av'] / 1000;
                if (sum['THS av']) hashrate = sum['THS av'];
                
                totalHashrate += hashrate;
                onlineCount++;

                let maxTemp = 0;
                for(let t=1; t<=4; t++) {
                    if(stat[\`temp\${t}\`] > maxTemp) maxTemp = stat[\`temp\${t}\`];
                    if(stat[\`temp_chip\${t}\`]) {
                        const temps = String(stat[\`temp_chip\${t}\`]).split('-').map(Number);
                        temps.forEach(tp => { if(tp > maxTemp) maxTemp = tp; });
                    }
                }

                if (hashrate === 0) {
                    errors.push(\`[${ip}] 0 TH/s (Placas Zeradas)\`);
                }
                if (maxTemp > 85) {
                    errors.push(\`[${ip}] Superaquecimento (\${maxTemp}°C)\`);
                }
            } catch (e) {
                offlineCount++;
            }
        }));
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
