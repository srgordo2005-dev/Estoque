const net = require('net');
const http = require('http');

// Utility to check if a TCP port is open
const checkPort = (ip, port, timeout = 1200) => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, ip);
  });
};

// Query CGMiner TCP JSON API
const queryCGMiner = (ip, command, port = 4028, timeout = 2000) => {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = '';
    socket.setTimeout(timeout);
    socket.connect(port, ip, () => {
      socket.write(JSON.stringify({ command }) + '\n');
    });
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
    });
    socket.on('close', () => {
      try {
        const cleaned = buffer.replace(/\0/g, '').trim();
        if (cleaned.startsWith('{')) {
          resolve(JSON.parse(cleaned));
        } else if (cleaned.length > 0) {
          resolve({ raw: cleaned });
        } else {
          reject(new Error('Empty response'));
        }
      } catch(e) {
        resolve({ raw: buffer, error: 'parse_error' });
      }
    });
    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('timeout'));
    });
  });
};

// Query Avalon plain text API
const queryAvalon = (ip, command, port = 4028, timeout = 2000) => {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = '';
    socket.setTimeout(timeout);
    socket.connect(port, ip, () => {
      socket.write(command + '\n');
    });
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
    });
    socket.on('close', () => {
      resolve(buffer.replace(/\0/g, '').trim());
    });
    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('timeout'));
    });
  });
};

// Query REST API (Vnish / Braiins OS / HTTP APIs)
const queryREST = (ip, endpoint, port = 80, timeout = 2000) => {
  return new Promise((resolve) => {
    const options = {
      hostname: ip,
      port: port,
      path: endpoint,
      method: 'GET',
      timeout: timeout
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
};

// Helper to parse key-value raw pipe strings (Avalon style)
const parsePipeString = (str) => {
  const result = {};
  if (!str) return result;
  const parts = str.split('|');
  parts.forEach(part => {
    const pairs = part.split(',');
    pairs.forEach(pair => {
      const kv = pair.split('=');
      if (kv.length === 2) {
        result[kv[0].trim()] = kv[1].trim();
      }
    });
  });
  return result;
};

// Robust Model Name Sanitizer & Normalizer
const cleanModelName = (model, hardware, brand) => {
  let name = String(model || hardware || '').trim();
  
  // Clean up BMMiner/CGMiner prefix
  name = name.replace(/cgminer[sd.]*/gi, '')
             .replace(/bmminer[sd.]*/gi, '')
             .trim();
             
  // If name is just version numbers or kernels, discard it
  if (/^\d+(\.\d+)*$/.test(name) || name.toLowerCase() === 'stats' || name.toLowerCase() === 'version' || name.includes('.') || name.length < 3) {
    name = '';
  }
  
  if (!name && hardware) {
    let hw = String(hardware).trim();
    if (!hw.includes('.') && isNaN(hw)) {
      name = hw;
    }
  }
  
  if (!name) {
    name = 'Antminer S19'; // Default sane fallback instead of a random number
  }
  
  // Clean special characters
  name = name.replace(/[\s\-_]+/g, ' ').trim();
  
  // Normalize known Antminer / Whatsminer model formats
  const upper = name.toUpperCase();
  if (upper.includes('S21XP') || upper.includes('S21 XP')) {
    name = 'S21 XP';
  } else if (upper.includes('S19JPRO') || upper.includes('S19J PRO') || upper.includes('S19J-PRO')) {
    name = 'S19j Pro';
  } else if (upper.includes('S19PRO') || upper.includes('S19 PRO')) {
    name = 'S19 Pro';
  } else if (upper.includes('S19XP') || upper.includes('S19 XP')) {
    name = 'S19 XP';
  } else if (upper.includes('S19') && !upper.includes('ANTMINER')) {
    name = 'S19';
  } else if (upper.includes('M30S') && !upper.includes('WHATSMINER')) {
    name = 'M30S';
  } else if (upper.includes('M50') && !upper.includes('WHATSMINER')) {
    name = 'M50';
  }
  
  // Prepend brand prefix if not present
  if (brand === 'Bitmain' && !name.toLowerCase().includes('antminer') && name !== 'ASIC Miner') {
    name = 'Antminer ' + name;
  } else if (brand === 'MicroBT' && !name.toLowerCase().includes('whatsminer')) {
    name = 'Whatsminer ' + name;
  } else if (brand === 'Canaan' && !name.toLowerCase().includes('avalon')) {
    name = 'Avalon ' + name;
  }
  
  return name;
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

const parseUptimeString = (str) => {
  if (!str) return 0;
  const s = String(str).trim();
  
  if (s.includes('d') || s.includes('h') || s.includes('m') || s.includes('s')) {
    let days = 0, hours = 0, minutes = 0, seconds = 0;
    const dMatch = s.match(/(\d+)\s*d/);
    const hMatch = s.match(/(\d+)\s*h/);
    const mMatch = s.match(/(\d+)\s*m/);
    const sMatch = s.match(/(\d+)\s*s/);
    if (dMatch) days = parseInt(dMatch[1], 10);
    if (hMatch) hours = parseInt(hMatch[1], 10);
    if (mMatch) minutes = parseInt(mMatch[1], 10);
    if (sMatch) seconds = parseInt(sMatch[1], 10);
    return (days * 86400) + (hours * 3600) + (minutes * 60) + seconds;
  }
  
  const parts = s.split(':').map(x => parseInt(x, 10) || 0);
  if (parts.length === 3) {
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  } else if (parts.length === 2) {
    return (parts[0] * 3600) + (parts[1] * 60);
  }
  
  const num = Number(s);
  return isNaN(num) ? 0 : num;
};

// Main Scanner & Normalizer
const scanMiner = async (ip) => {
  const hasCGMinerPort = await checkPort(ip, 4028);
  const hasWebPort = await checkPort(ip, 80);

  if (!hasCGMinerPort && !hasWebPort) {
    return {
      ip,
      mac_address: '',
      serial_number: '',
      brand: 'Unknown',
      model: 'Offline',
      firmware_version: '',
      uptime_seconds: 0,
      status: 'OFFLINE',
      hashrate: { nominal_th: 0, current_th: 0, average_th: 0, unit: 'TH/s' },
      efficiency: { power_consumption_watts: 0, joules_per_th: 0 },
      hardware: { boards_total: 0, boards_active: 0, chips_total: 0, chips_active: 0, boards_detail: [], fans: [] },
      pools: [],
      alerts: []
    };
  }

  const miner = {
    ip,
    mac_address: '',
    serial_number: '',
    brand: 'Unknown',
    model: '',
    firmware_version: 'Factory',
    uptime_seconds: 0,
    status: 'HEALTHY',
    hashrate: { nominal_th: 0, current_th: 0, average_th: 0, unit: 'TH/s' },
    efficiency: { power_consumption_watts: 0, joules_per_th: 0 },
    hardware: { boards_total: 3, boards_active: 0, chips_total: 0, chips_active: 0, boards_detail: [], fans: [] },
    pools: [],
    alerts: []
  };

  try {
    // A. DRIVER: Braiins OS / Vnish REST API (Port 80)
    if (hasWebPort) {
      const vnishInfo = await queryREST(ip, '/api/v1/info');
      const vnishSummary = await queryREST(ip, '/api/v1/summary');
      const vnishStatus = await queryREST(ip, '/api/v1/status');

      const isRealVnish = 
        (vnishInfo && (vnishInfo.fw_name === 'Vnish' || vnishInfo.fw_name === 'Braiins' || vnishInfo.miner || vnishInfo.platform)) ||
        (vnishSummary && (vnishSummary.miner || vnishSummary.cooling || vnishSummary.chains)) ||
        (vnishStatus && (vnishStatus.miner_state !== undefined || vnishStatus.unlocked !== undefined));

      if (isRealVnish) {
        miner.brand = 'Bitmain';
        if (vnishInfo?.miner && vnishInfo.miner.toLowerCase().includes('whats')) {
          miner.brand = 'MicroBT';
        }
        miner.firmware_version = vnishInfo?.fw_version || vnishInfo?.system?.firmware_version || 'Vnish';
        miner.model = cleanModelName(vnishInfo?.miner || vnishInfo?.model || 'Antminer Vnish', '', miner.brand);
        
        const rawUptime = vnishInfo?.system?.uptime || vnishSummary?.miner_status?.miner_state_time || vnishSummary?.miner?.elapsed || 0;
        miner.uptime_seconds = typeof rawUptime === 'string' ? parseUptimeString(rawUptime) : Number(rawUptime);
        
        miner.serial_number = (vnishInfo?.serial && vnishInfo.serial !== 'N/A') ? vnishInfo.serial : '';
        
        // Vnish reports hashrate in GH/s, convert to TH/s by dividing by 1000
        const divisor = 1000;
        const avgHash = (vnishSummary?.miner?.hr_average || vnishSummary?.miner?.average_hashrate || vnishSummary?.hashrate || 0) / divisor;
        const rtHash = (vnishSummary?.miner?.hr_realtime || vnishSummary?.miner?.instant_hashrate || vnishSummary?.miner?.hashrate || 0) / divisor;
        
        miner.hashrate.current_th = Number(rtHash.toFixed(1));
        miner.hashrate.average_th = Number(avgHash.toFixed(1));
        miner.hashrate.nominal_th = Number((vnishSummary?.miner?.hr_nominal || vnishInfo?.preset_hashrate || avgHash).toFixed(1));

        miner.mac_address = vnishInfo?.system?.network_status?.mac || '';

        // Power & Efficiency
        miner.efficiency.power_consumption_watts = vnishSummary?.miner?.power_consumption || 0;
        if (miner.hashrate.current_th > 0) {
          miner.efficiency.joules_per_th = Number((miner.efficiency.power_consumption_watts / miner.hashrate.current_th).toFixed(1));
        }

        // Boards details
        const chains = vnishSummary?.miner?.chains || vnishSummary?.chains || [];
        miner.hardware.boards_total = chains.length || 3;
        chains.forEach((c, idx) => {
          const isOk = c.status?.state === 'mining' || (c.hashrate_rt > 0 && !(c.chip_statuses?.red > 0));
          if (isOk) miner.hardware.boards_active++;
          
          miner.hardware.boards_detail.push({
            board_index: idx,
            hashrate_th: Number(((c.hashrate_rt || c.hashrate || 0) / 1000).toFixed(1)),
            temp_inlet: c.pcb_temp?.min || 0,
            temp_outlet: c.pcb_temp?.max || 0,
            temp_chip: c.chip_temp?.max || 0,
            voltage: c.voltage || 0,
            hardware_errors: c.hw_errors || 0
          });
        });

        // Fans speed
        const fans = vnishSummary?.cooling?.fans || vnishSummary?.miner?.fans || [];
        fans.forEach((f, idx) => {
          miner.hardware.fans.push({
            fan_index: idx,
            speed_rpm: f.rpm || 0,
            status: f.status === 'ok' ? 'OK' : 'FAILED'
          });
        });

        // Pools
        const pools = vnishSummary?.miner?.pools || [];
        pools.forEach((p, idx) => {
          miner.pools.push({
            index: idx,
            url: p.url || '',
            user: p.user || '',
            status: p.status === 'active' || p.status === 'working' ? 'ALIVE' : 'DEAD',
            accepted: p.accepted || 0,
            rejected: p.rejected || 0,
            stale: p.stale || 0
          });
        });

        // Extract active pool and worker
        const activePool = miner.pools.find(p => p.status === 'ALIVE') || miner.pools[0];
        if (activePool) {
          miner.pool = activePool.url;
          miner.worker = activePool.user;
        }

        const isInitializing = vnishSummary?.miner?.miner_status?.miner_state === 'initializing';
        miner.status = (rtHash === 0 && !isInitializing) ? 'ERROR' : (miner.hardware.boards_active < miner.hardware.boards_total ? 'WARNING' : 'HEALTHY');
        return miner;
      }
    }

    // B. DRIVER: CGMiner / BMMiner API (Port 4028)
    if (hasCGMinerPort) {
      const summaryData = await queryCGMiner(ip, 'summary').catch(() => null);
      if (summaryData && summaryData.SUMMARY) {
        await sleep(150);
        const statsData = await queryCGMiner(ip, 'stats').catch(() => null);
        await sleep(150);
        const poolsData = await queryCGMiner(ip, 'pools').catch(() => null);
        await sleep(150);
        const versionData = await queryCGMiner(ip, 'version').catch(() => null);

        const sum = summaryData.SUMMARY[0] || {};
        const ver = versionData?.VERSION?.[0] || {};
        
        // Merge all stats elements to prevent array index confusion (STATS[0] vs STATS[1])
        let statsObj = {};
        if (statsData && Array.isArray(statsData.STATS)) {
          statsData.STATS.forEach(s => {
            statsObj = { ...statsObj, ...s };
          });
        }

        miner.uptime_seconds = sum.Elapsed || 0;
        
        let hashrate = 0;
        if (sum['MHS av']) hashrate = sum['MHS av'] / 1000000;
        if (sum['GHS av']) hashrate = sum['GHS av'] / 1000;
        if (sum['THS av']) hashrate = sum['THS av'];

        miner.hashrate.average_th = Number(hashrate.toFixed(1));
        miner.hashrate.current_th = Number(hashrate.toFixed(1));
        miner.hashrate.nominal_th = Number((hashrate * 1.02).toFixed(1));

        // Detect MAC securely across all variables
        miner.mac_address = statsObj.mac || statsObj.MAC || statsObj.Mac || statsObj['MAC Address'] || statsObj['mac_address'] || ver.MAC || sum.MAC || '';
        miner.serial_number = statsObj.DeviceSerial || statsObj.Serial || statsObj['Device Serial'] || statsObj.Device_Serial || ver.Serial || '';
        
        // Brand & Model identification
        const rawModel = ver.Type || ver.Hardware || statsObj.Type || statsObj.Miner || statsObj['Miner Type'] || statsObj.hardware || statsObj.product || '';
        
        if (rawModel.toLowerCase().includes('whats') || statsObj.Miner === 'Whatsminer' || sum.Miner === 'Whatsminer') {
          miner.brand = 'MicroBT';
        } else {
          miner.brand = 'Bitmain';
        }

        miner.model = cleanModelName(rawModel, ver.Hardware || statsObj.hardware, miner.brand);
        miner.firmware_version = ver.CGMiner || ver.Version || 'Factory';

        // Power Consumption Estimation & Sensor Reading
        let sensorPower = statsObj.Power || statsObj['Power Consumption'] || statsObj.power || statsObj.power_consumption || sum.Power || sum['Power Consumption'] || 0;
        let estPower = 0;
        const modelUpper = miner.model.toUpperCase();
        if (modelUpper.includes('S21')) estPower = 3500;
        else if (modelUpper.includes('S19 PRO')) estPower = 3250;
        else if (modelUpper.includes('S19J PRO')) estPower = 3100;
        else if (modelUpper.includes('S19 XP')) estPower = 3000;
        else if (modelUpper.includes('S19')) estPower = 3250;
        else if (modelUpper.includes('T19')) estPower = 3150;
        else if (modelUpper.includes('M30S')) estPower = 3400;
        else if (modelUpper.includes('M50')) estPower = 3300;
        
        miner.efficiency.power_consumption_watts = sensorPower || estPower;
        if (miner.hashrate.current_th > 0 && miner.efficiency.power_consumption_watts > 0) {
          miner.efficiency.joules_per_th = Number((miner.efficiency.power_consumption_watts / miner.hashrate.current_th).toFixed(1));
        }

        // Hashboard slots / Details
        const boardCount = 3;
        miner.hardware.boards_total = boardCount;
        miner.hardware.boards_active = 0;

        for (let b = 0; b < boardCount; b++) {
          const acn = statsObj[`chain_acn${b+1}`] || statsObj[`chain_acn${b}`] || statsObj[`acn${b+1}`] || statsObj[`acn_${b+1}`] || 0;
          const rate = statsObj[`chain_rate${b+1}`] || statsObj[`chain_rate${b}`] || statsObj[`mhs${b+1}`] || statsObj[`mhs_${b+1}`] || 0;
          const tempChip = statsObj[`temp_chip${b+1}`] || statsObj[`temp${b+1}`] || statsObj[`temp_chip[${b}]`] || statsObj[`temp_${b+1}`] || 0;
          const hw = statsObj[`chain_hw${b+1}`] || statsObj[`chain_hw${b}`] || statsObj[`hw${b+1}`] || 0;
          const volt = statsObj[`voltage${b+1}`] || statsObj[`voltage_${b+1}`] || statsObj[`vol${b+1}`] || 0;

          const tempVal = Number(String(tempChip).split('-')[0]) || 0;
          const isActive = acn > 0 || rate > 0 || (tempVal > 0 && volt > 0) || (hashrate > 0 && acn !== 0 && tempVal > 0);

          if (isActive) miner.hardware.boards_active++;

          let boardHashrate = rate ? rate / 1000 : 0;
          if (boardHashrate === 0 && isActive && hashrate > 0) {
            boardHashrate = hashrate / 3;
          }

          miner.hardware.boards_detail.push({
            board_index: b,
            hashrate_th: Number(boardHashrate.toFixed(1)),
            temp_inlet: statsObj[`temp${b+1}`] || statsObj[`temp_in${b+1}`] || 0,
            temp_outlet: statsObj[`temp2_${b+1}`] || statsObj[`temp_out${b+1}`] || 0,
            temp_chip: tempVal,
            voltage: volt,
            hardware_errors: hw
          });
        }

        // Fans
        for (let f = 1; f <= 4; f++) {
          const speed = statsObj[`fan${f}`] || statsObj[`Fan Speed ${f}`] || statsObj[`fan_${f}`] || 0;
          if (speed > 0) {
            miner.hardware.fans.push({
              fan_index: f - 1,
              speed_rpm: speed,
              status: speed > 500 ? 'OK' : 'FAILED'
            });
          }
        }

        // Pools
        const poolsList = poolsData?.POOLS || [];
        poolsList.forEach((p, idx) => {
          miner.pools.push({
            index: idx,
            url: p.URL || '',
            user: p.User || '',
            status: p.Status === 'Alive' || p.Status === 'working' || p.Status === 'active' ? 'ALIVE' : 'DEAD',
            accepted: p.Accepted || 0,
            rejected: p.Rejected || 0,
            stale: p.Stale || 0
          });
        });

        // Extract active pool and worker
        const activePool = miner.pools.find(p => p.status === 'ALIVE') || miner.pools[0];
        if (activePool) {
          miner.pool = activePool.url;
          miner.worker = activePool.user;
        }

        miner.status = (hashrate === 0) ? 'ERROR' : (miner.hardware.boards_active < miner.hardware.boards_total ? 'WARNING' : 'HEALTHY');
        return miner;
      }


      // C. DRIVER: Avalon Canaan plain text (Port 4028 fallback)
      const avalonSummary = await queryAvalon(ip, 'summary').catch(() => null);
      if (avalonSummary && (avalonSummary.includes('STATUS=') || avalonSummary.includes('M=summary'))) {
        const dataMap = parsePipeString(avalonSummary);
        miner.brand = 'Canaan';
        miner.model = dataMap.Type || dataMap.Hardware || 'Avalon';
        miner.uptime_seconds = Number(dataMap.Elapsed || 0);

        let hashrate = Number(dataMap['MHS av'] || 0) / 1000000;
        if (dataMap['THS av']) hashrate = Number(dataMap['THS av']);

        miner.hashrate.average_th = hashrate;
        miner.hashrate.current_th = hashrate;
        miner.hashrate.nominal_th = hashrate;

        miner.hardware.boards_total = 3;
        miner.hardware.boards_active = hashrate > 0 ? 3 : 0;
        
        miner.status = hashrate > 0 ? 'HEALTHY' : 'ERROR';
        return miner;
      }
    }

  } catch(err) {
    console.error(`Erro ao analisar mineradora em ${ip}:`, err.message);
  }

  return {
    ip,
    mac_address: '',
    brand: 'Unknown',
    model: 'Offline',
    firmware_version: '',
    uptime_seconds: 0,
    status: 'OFFLINE',
    hashrate: { nominal_th: 0, current_th: 0, average_th: 0, unit: 'TH/s' },
    efficiency: { power_consumption_watts: 0, joules_per_th: 0 },
    hardware: { boards_total: 0, boards_active: 0, chips_total: 0, chips_active: 0, boards_detail: [], fans: [] },
    pools: [],
    alerts: []
  };
};

// Sequential Worker Pool Scanner
const scanRange = async (ipList, progressCallback) => {
  const results = [];
  const limit = 20; // Concurrency limit
  let activeCount = 0;
  let index = 0;

  const next = async () => {
    if (index >= ipList.length) return;
    const ip = ipList[index++];
    activeCount++;
    try {
      const data = await scanMiner(ip);
      if (data.status !== 'OFFLINE') {
        results.push(data);
        if (progressCallback) progressCallback(data);
      }
    } catch(e) {}
    activeCount--;
    await next();
  };

  const pool = [];
  for (let i = 0; i < Math.min(ipList.length, limit); i++) {
    pool.push(next());
  }
  await Promise.all(pool);
  return results;
};

module.exports = {
  scanMiner,
  scanRange
};
