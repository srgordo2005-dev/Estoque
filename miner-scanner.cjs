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
  // Format: STATUS=S,M=summary,Elapsed=3600|...
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

// Main Scanner & Normalizer
const scanMiner = async (ip) => {
  // 1. Detect open ports
  const hasCGMinerPort = await checkPort(ip, 4028);
  const hasWebPort = await checkPort(ip, 80);

  if (!hasCGMinerPort && !hasWebPort) {
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
  }

  // Initialize normalized structure
  const miner = {
    ip,
    mac_address: '',
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

      if (vnishInfo || vnishSummary || vnishStatus) {
        miner.brand = 'Braiins'; // or Vnish custom
        miner.firmware_version = vnishInfo?.system?.firmware_version || 'Vnish / Custom';
        miner.model = vnishInfo?.model || vnishInfo?.preset_name || 'Antminer Vnish';
        miner.uptime_seconds = Number(vnishInfo?.system?.uptime || vnishSummary?.miner?.elapsed || 0);
        
        const avgHash = (vnishSummary?.miner?.average_hashrate || vnishSummary?.hashrate || 0) / 1000000; // in TH
        const rtHash = (vnishSummary?.miner?.hashrate || 0) / 1000000;
        
        miner.hashrate.current_th = Number(rtHash.toFixed(1));
        miner.hashrate.average_th = Number(avgHash.toFixed(1));
        miner.hashrate.nominal_th = Number((vnishInfo?.preset_hashrate || avgHash).toFixed(1));

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
          const isOk = c.hashrate > 0 && !(c.chip_statuses?.red > 0);
          if (isOk) miner.hardware.boards_active++;
          
          miner.hardware.boards_detail.push({
            board_index: c.id || idx,
            hashrate_th: Number(((c.hashrate || 0) / 1000).toFixed(1)),
            temp_inlet: c.pcb_temp?.min || 0,
            temp_outlet: c.pcb_temp?.max || 0,
            temp_chip: c.chip_temp?.max || 0,
            voltage: c.voltage || 0,
            hardware_errors: c.hw_errors || 0
          });
        });

        // Fans speed
        const fans = vnishSummary?.miner?.fans || [];
        fans.forEach((f, idx) => {
          miner.hardware.fans.push({
            fan_index: idx,
            speed_rpm: f.rpm || 0,
            status: (f.rpm || 0) > 500 ? 'OK' : 'FAILED'
          });
        });

        // Pools
        const pools = vnishSummary?.miner?.pools || [];
        pools.forEach((p, idx) => {
          miner.pools.push({
            index: idx,
            url: p.url || '',
            user: p.user || '',
            status: p.status === 'alive' ? 'ALIVE' : 'DEAD',
            accepted: p.accepted || 0,
            rejected: p.rejected || 0,
            stale: 0
          });
        });

        miner.status = (rtHash === 0) ? 'ERROR' : (miner.hardware.boards_active < miner.hardware.boards_total ? 'WARNING' : 'HEALTHY');
        return miner;
      }
    }

    // B. DRIVER: CGMiner / BMMiner API (Port 4028)
    if (hasCGMinerPort) {
      // Handshake
      const summaryData = await queryCGMiner(ip, 'summary').catch(() => null);
      if (summaryData && summaryData.SUMMARY) {
        const statsData = await queryCGMiner(ip, 'stats').catch(() => null);
        const poolsData = await queryCGMiner(ip, 'pools').catch(() => null);
        const versionData = await queryCGMiner(ip, 'version').catch(() => null);

        const sum = summaryData.SUMMARY[0] || {};
        const stat = statsData?.STATS?.[1] || statsData?.STATS?.[0] || {};
        const ver = versionData?.VERSION?.[0] || {};

        miner.uptime_seconds = sum.Elapsed || 0;
        
        let hashrate = 0;
        if (sum['MHS av']) hashrate = sum['MHS av'] / 1000000;
        if (sum['GHS av']) hashrate = sum['GHS av'] / 1000;
        if (sum['THS av']) hashrate = sum['THS av'];

        miner.hashrate.average_th = Number(hashrate.toFixed(1));
        miner.hashrate.current_th = Number(hashrate.toFixed(1)); // fallback
        miner.hashrate.nominal_th = Number((hashrate * 1.02).toFixed(1));

        miner.mac_address = stat.mac || stat.MAC || '';
        
        // Brand & Model identification
        const rawModel = stat.Type || stat.Miner || stat['Miner Type'] || ver.Type || ver.Hardware || '';
        miner.model = rawModel.replace(/cgminer[sd.]*/gi, '').replace(/bmminer[sd.]*/gi, '').trim();

        if (miner.model.toLowerCase().includes('whats') || stat.Miner === 'Whatsminer' || sum.Miner === 'Whatsminer') {
          miner.brand = 'MicroBT';
        } else if (miner.model.toLowerCase().includes('ant') || stat.Miner === 'Antminer') {
          miner.brand = 'Bitmain';
        } else {
          miner.brand = 'Bitmain'; // general fallback
        }

        // Hashboard slots / Details
        const boardCount = stat.chain_acn ? 3 : 3;
        miner.hardware.boards_total = boardCount;
        for (let b = 0; b < boardCount; b++) {
          const tempChip = stat[`temp_chip${b+1}`] || stat[`temp${b+1}`] || 0;
          const sn = stat[`chain_sn${b}`] || stat[`board_sn${b}`] || stat[`hash board ${b} sn`] || null;
          
          let active = true;
          if (sn === null && hashrate === 0) active = false;
          if (active) miner.hardware.boards_active++;

          miner.hardware.boards_detail.push({
            board_index: b,
            hashrate_th: Number((miner.hashrate.current_th / boardCount).toFixed(1)),
            temp_inlet: stat[`temp${b+1}`] || 0,
            temp_outlet: stat[`temp2_${b+1}`] || 0,
            temp_chip: Number(String(tempChip).split('-')[0]) || 0,
            voltage: stat[`voltage${b+1}`] || 0,
            hardware_errors: stat[`chain_hw${b}`] || 0
          });
        }

        // Fans
        for (let f = 1; f <= 4; f++) {
          const speed = stat[`fan${f}`] || stat[`Fan Speed ${f}`] || 0;
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
            status: p.Status === 'Alive' ? 'ALIVE' : 'DEAD',
            accepted: p.Accepted || 0,
            rejected: p.Rejected || 0,
            stale: p.Stale || 0
          });
        });

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
    miner.status = 'ERROR';
    miner.alerts.push(err.message);
  }

  // Fallback if details could not be extracted
  miner.model = 'ASIC Miner';
  miner.status = 'WARNING';
  return miner;
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
