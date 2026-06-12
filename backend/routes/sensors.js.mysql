const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware } = require('./auth');

// Get Socket.IO instance from server
let io;
router.use((req, res, next) => {
  if (!io) {
    try {
      io = require('../server').io;
    } catch (e) {
      // Socket.IO not available yet
    }
  }
  next();
});

function runPythonPrediction(payload) {
  const { spawn } = require('child_process');
  const path = require('path');
  const scriptPath = path.join(__dirname, '../ml/predict.py');

  const runOnce = (command, args) => new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => reject(err));

    proc.on('close', (code) => {
      if (stderr && process.env.ML_DEBUG === '1') {
        console.warn('[ML predict] stderr:', stderr);
      }

      try {
        const parsed = JSON.parse(stdout || '{}');
        if (code === 0 && parsed && parsed.success !== false) {
          return resolve(parsed);
        }
        return reject(new Error(parsed.message || `Prediction failed (exit ${code}).`));
      } catch (e) {
        return reject(new Error(`Invalid prediction output. Exit ${code}. Output: ${stdout || '(empty)'}`));
      }
    });

    proc.stdin.write(JSON.stringify(payload || {}));
    proc.stdin.end();
  });

  const preferredCmd = process.env.PYTHON_BIN || 'python';
  return runOnce(preferredCmd, [scriptPath])
    .catch((err) => {
      if (err && err.code === 'ENOENT' && preferredCmd === 'python') {
        return runOnce('py', ['-3', scriptPath]);
      }
      throw err;
    });
}

const LOCK_MESSAGE = 'Hello your system was locked. Contact admin for support 0755233511, Eng TheophileNIYOMWUNGERI';

// GET /range — fetch aggregated sensor data for a date range
router.get('/range', authMiddleware, async (req, res) => {
  try {
    await ensureSensorsSchema();
    const admin = isAdminLike(req.user?.role);
    const requestedUserId = admin ? (req.query.userId || null) : req.user.uid;
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ success: false, message: 'Missing start or end date' });
    }
    const whereClause = requestedUserId ? 'WHERE user_id = ? AND recorded_at BETWEEN ? AND ?' : 'WHERE recorded_at BETWEEN ? AND ?';
    const whereArgs = requestedUserId ? [requestedUserId, start, end] : [start, end];

    // Aggregate sensor data in range
    const [rows] = await pool.query(
      `SELECT 
        AVG(temperature) AS temperature,
        AVG(humidity) AS humidity,
        AVG(light_lux) AS light_lux,
        AVG(co2) AS co2,
        AVG(nh3) AS nh3,
        AVG(ch4) AS ch4,
        AVG(o2) AS o2,
        AVG(h2s) AS h2s
      FROM sensors ${whereClause}`,
      whereArgs
    );
    const agg = rows[0] || null;

    // Determine whether any sensor data exists in the requested range.
    const hasData = Boolean(agg && Object.values(agg).some((v) => v !== null && v !== undefined));

    if (!hasData) {
      // Return explicit zeros so the dashboard can show "00" instead of previous/default values.
      return res.json({
        success: true,
        data: {
          temperature: 0,
          humidity: 0,
          light_lux: 0,
          co2: 0,
          nh3: 0,
          ch4: 0,
          o2: 0,
          h2s: 0,
          hasData: false
        }
      });
    }

    res.json({
      success: true,
      data: {
        temperature: parseFloat(agg.temperature) || 0,
        humidity: parseFloat(agg.humidity) || 0,
        light_lux: parseFloat(agg.light_lux) || 0,
        co2: parseFloat(agg.co2) || 0,
        nh3: parseFloat(agg.nh3) || 0,
        ch4: parseFloat(agg.ch4) || 0,
        o2: parseFloat(agg.o2) || 0,
        h2s: parseFloat(agg.h2s) || 0,
        hasData: true
      }
    });
  } catch (error) {
    console.error('Get sensor range error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sensor data for range' });
  }
});


let sensorsSchemaReady = false;

function isAdminLike(role) {
  return ['admin', 'supervisor'].includes(String(role || '').toLowerCase());
}

async function ensureSensorsSchema() {
  if (sensorsSchemaReady) return;

  const createStatements = [
    `CREATE TABLE IF NOT EXISTS sensors (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36) NULL,
      temperature DECIMAL(5,2) DEFAULT 37.5,
      humidity DECIMAL(5,2) DEFAULT 62.0,
      light_lux DECIMAL(10,2) DEFAULT 520,
      co2 DECIMAL(8,2) DEFAULT 400,
      nh3 DECIMAL(8,2) DEFAULT 2,
      ch4 DECIMAL(8,2) DEFAULT 0,
      o2 DECIMAL(5,2) DEFAULT 20.9,
      lpg DECIMAL(8,2) DEFAULT 0,
      h2s DECIMAL(8,2) DEFAULT 0,
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS gas_readings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36) NULL,
      co2 DECIMAL(8,2) DEFAULT 415,
      nh3 DECIMAL(8,2) DEFAULT 2,
      ch4 DECIMAL(8,2) DEFAULT 0,
      o2 DECIMAL(5,2) DEFAULT 20.9,
      lpg DECIMAL(8,2) DEFAULT 0,
      h2s DECIMAL(8,2) DEFAULT 0,
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    // Preferred power table used by the system (per device + per user).
    `CREATE TABLE IF NOT EXISTS power_readings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36) NULL,
      device_serial VARCHAR(100) NULL,
      reading_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      power_source ENUM('SOLAR', 'GRID') DEFAULT 'SOLAR',
      voltage_dc DECIMAL(6,2) DEFAULT 13.2,
      current_dc DECIMAL(6,2) DEFAULT 1.8,
      grid_energy_kwh DECIMAL(12,4) DEFAULT 0,
      cost_rwf DECIMAL(12,2) DEFAULT 0,
      cost_usd DECIMAL(12,4) DEFAULT 0,
      battery_percent INT DEFAULT 95,
      battery_status VARCHAR(20) NULL,
      energy_note VARCHAR(100) NULL,
      INDEX idx_power_readings_user_id (user_id),
      INDEX idx_power_readings_device_serial (device_serial),
      INDEX idx_power_readings_reading_time (reading_time)
    )`,
    `CREATE TABLE IF NOT EXISTS device_status (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36) NULL,
      heater ENUM('ON', 'OFF') DEFAULT 'OFF',
      fan ENUM('ON', 'OFF') DEFAULT 'ON',
      rotator ENUM('ON', 'OFF', 'AUTO') DEFAULT 'AUTO',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS device_commands (
      id INT AUTO_INCREMENT PRIMARY KEY,
      device_id VARCHAR(100) NOT NULL,
      command VARCHAR(50) NOT NULL,
      relay VARCHAR(50) NULL,
      state TINYINT(1) DEFAULT 0,
      requested_by VARCHAR(100) NULL,
      executed TINYINT(1) DEFAULT 0,
      executed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_device_commands_device_id (device_id),
      INDEX idx_device_commands_executed (executed)
    )`
  ];

  for (const statement of createStatements) {
    await pool.query(statement);
  }

  await pool.query(
    `INSERT INTO device_status (heater, fan, rotator)
     SELECT 'OFF', 'ON', 'AUTO'
     WHERE NOT EXISTS (SELECT 1 FROM device_status LIMIT 1)`
  );

  const alterStatements = [
    'ALTER TABLE sensors ADD COLUMN user_id VARCHAR(36) NULL AFTER id',
    'ALTER TABLE sensors ADD COLUMN light_lux DECIMAL(10,2) DEFAULT 520',
    'ALTER TABLE gas_readings ADD COLUMN user_id VARCHAR(36) NULL AFTER id',
    'ALTER TABLE device_status ADD COLUMN user_id VARCHAR(36) NULL AFTER id',
    'ALTER TABLE sensors ADD COLUMN co2 DECIMAL(8,2) DEFAULT 400',
    'ALTER TABLE sensors ADD COLUMN nh3 DECIMAL(8,2) DEFAULT 2',
    'ALTER TABLE sensors ADD COLUMN ch4 DECIMAL(8,2) DEFAULT 0',
    'ALTER TABLE sensors ADD COLUMN o2 DECIMAL(5,2) DEFAULT 20.9',
    'ALTER TABLE sensors ADD COLUMN lpg DECIMAL(8,2) DEFAULT 0',
    'ALTER TABLE sensors ADD COLUMN h2s DECIMAL(8,2) DEFAULT 0',
    'ALTER TABLE sensors MODIFY COLUMN recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER h2s',
  ];

  for (const statement of alterStatements) {
    try {
      await pool.query(statement);
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') {
        throw error;
      }
    }
  }

  // Ensure/repair power_readings columns for older manual tables.
  const alterPowerReadings = [
    'ALTER TABLE power_readings ADD COLUMN user_id VARCHAR(36) NULL AFTER id',
    'ALTER TABLE power_readings ADD COLUMN device_id VARCHAR(100) NULL',
    'ALTER TABLE power_readings ADD COLUMN device_serial VARCHAR(100) NULL',
    'ALTER TABLE power_readings ADD COLUMN reading_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    'ALTER TABLE power_readings ADD COLUMN power_source ENUM(\'SOLAR\',\'GRID\') DEFAULT \'SOLAR\'',
    'ALTER TABLE power_readings ADD COLUMN voltage_dc DECIMAL(6,2) DEFAULT 13.2',
    'ALTER TABLE power_readings ADD COLUMN current_dc DECIMAL(6,2) DEFAULT 1.8',
    'ALTER TABLE power_readings ADD COLUMN solar_voltage DECIMAL(6,2) DEFAULT 0',
    'ALTER TABLE power_readings ADD COLUMN solar_current DECIMAL(8,2) DEFAULT 0',
    'ALTER TABLE power_readings ADD COLUMN solar_power DECIMAL(8,2) DEFAULT 0',
    'ALTER TABLE power_readings ADD COLUMN load_power DECIMAL(8,2) DEFAULT 0',
    'ALTER TABLE power_readings ADD COLUMN grid_energy_kwh DECIMAL(12,4) DEFAULT 0',
    'ALTER TABLE power_readings ADD COLUMN cost_rwf DECIMAL(12,2) DEFAULT 0',
    'ALTER TABLE power_readings ADD COLUMN cost_usd DECIMAL(12,4) DEFAULT 0',
    'ALTER TABLE power_readings ADD COLUMN battery_percent INT DEFAULT 95',
    'ALTER TABLE power_readings ADD COLUMN battery_status VARCHAR(20) NULL',
    'ALTER TABLE power_readings ADD COLUMN energy_note VARCHAR(100) NULL'
  ];

  const alterGasReadings = [
    'ALTER TABLE gas_readings ADD COLUMN lpg DECIMAL(8,2) DEFAULT 0',
    'ALTER TABLE gas_readings ADD COLUMN h2s DECIMAL(8,2) DEFAULT 0'
  ];

  for (const statement of alterPowerReadings) {
    try {
      await pool.query(statement);
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') {
        // Ignore when the column exists but the statement differs by type.
        // Those differences can be handled manually if needed.
        if (error.code === 'ER_PARSE_ERROR' || error.code === 'ER_NO_SUCH_TABLE') {
          // If the table doesn't exist yet, CREATE TABLE above covers it.
          continue;
        }
        throw error;
      }
    }
  }

  for (const statement of alterGasReadings) {
    try {
      await pool.query(statement);
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME' && error.code !== 'ER_DUP_KEYNAME') {
        if (error.code === 'ER_PARSE_ERROR' || error.code === 'ER_NO_SUCH_TABLE') {
          continue;
        }
        throw error;
      }
    }
  }

  // Backfill user_id for rows that have a device_serial but no user_id.
  // This enforces per-user isolation when reading power data.
  try {
    await pool.query(`
      UPDATE power_readings pr
      INNER JOIN users u ON u.device_serial_number = pr.device_serial
      SET pr.user_id = u.id
      WHERE pr.user_id IS NULL AND pr.device_serial IS NOT NULL
    `);
  } catch (error) {
    // Ignore if manual table doesn't match exactly.
    console.warn('power_readings backfill skipped:', error.code || error.message);
  }

  sensorsSchemaReady = true;
}

// GET /all-users-latest — supervisor reporting: latest sensor snapshot per farmer
router.get('/all-users-latest', authMiddleware, async (req, res) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    await ensureSensorsSchema();

    // Latest sensor row per user_id
    const [sensors] = await pool.query(`
      SELECT s.user_id, s.temperature, s.humidity, s.co2, s.nh3, s.recorded_at,
             u.full_name, u.email
      FROM sensors s
      INNER JOIN (
        SELECT user_id, MAX(id) AS max_id FROM sensors WHERE user_id IS NOT NULL GROUP BY user_id
      ) latest ON s.id = latest.max_id
      LEFT JOIN users u ON u.id = s.user_id
      ORDER BY s.recorded_at DESC
    `);

    res.json({ success: true, sensors });
  } catch (error) {
    console.error('Get all-users-latest sensors error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sensor data' });
  }
});

// Get all sensor data (combined endpoint)
router.get('/', authMiddleware, async (req, res) => {
  try {
    await ensureSensorsSchema();
    const admin = isAdminLike(req.user?.role);
    const requestedUserId = admin ? (req.query.userId || null) : req.user.uid;
    const whereClause = requestedUserId ? 'WHERE user_id = ?' : '';
    const whereArgs = requestedUserId ? [requestedUserId] : [];

    // Get latest sensor readings
    const [sensors] = await pool.query(
      `SELECT * FROM sensors ${whereClause} ORDER BY recorded_at DESC LIMIT 1`,
      whereArgs
    );
    
    // Get latest gas readings
    const [gas] = await pool.query(
      `SELECT * FROM gas_readings ${whereClause} ORDER BY recorded_at DESC LIMIT 1`,
      whereArgs
    );
    
    // Get latest power data (from power_readings)
    const [power] = await pool.query(
      `SELECT * FROM power_readings ${whereClause} ORDER BY reading_time DESC, id DESC LIMIT 1`,
      whereArgs
    );
    
    // Get device status
    const [status] = await pool.query(
      `SELECT * FROM device_status ${whereClause} ORDER BY updated_at DESC LIMIT 1`,
      whereArgs
    );

    // Get latest device heartbeat/status timestamp from registration table
    const [deviceRegistration] = await pool.query(
      `SELECT last_seen FROM device_registrations ${whereClause} ORDER BY last_seen DESC LIMIT 1`,
      whereArgs
    );

    // Get recent history (used by dashboard charts)
    const limit = 12;
    const [sensorHistory] = await pool.query(
      `SELECT temperature, humidity, light_lux, co2, recorded_at FROM sensors ${whereClause} ORDER BY recorded_at DESC LIMIT ?`,
      [...whereArgs, limit]
    );
    const [gasHistory] = await pool.query(
      `SELECT co2, nh3, ch4, o2, lpg, h2s, recorded_at FROM gas_readings ${whereClause} ORDER BY recorded_at DESC LIMIT ?`,
      [...whereArgs, limit]
    );
    const [powerHistory] = await pool.query(
      `SELECT voltage_dc AS voltage, current_dc AS current, reading_time AS recorded_at FROM power_readings ${whereClause} ORDER BY reading_time DESC, id DESC LIMIT ?`,
      [...whereArgs, limit]
    );
    
    const sensorDataRaw = sensors[0] || null;
    const gasDataRaw = gas[0] || null;
    const powerRow = power[0] || null;

    const deviceLastSeenRaw = deviceRegistration[0]?.last_seen || null;

    // Determine whether any data exists for this user/device
    const hasAnyData = Boolean(sensorDataRaw || gasDataRaw || powerRow);

    // freshness threshold (minutes) configurable via env var
    const THRESH_MIN = Number(process.env.DEVICE_ONLINE_THRESHOLD_MINUTES || 10);
    const THRESH_MS = Math.max(1, THRESH_MIN) * 60 * 1000;

    if (!hasAnyData) {
      const heartbeatLastSeen = deviceLastSeenRaw ? new Date(deviceLastSeenRaw) : null;
      const heartbeatLastSeenIso = heartbeatLastSeen ? heartbeatLastSeen.toISOString() : null;
      const heartbeatOnline = heartbeatLastSeen ? (Date.now() - heartbeatLastSeen.getTime() <= THRESH_MS) : false;

      return res.json({
        sensors: { temperature: 0, humidity: 0, light_lux: 0 },
        gas: { CO2: 0, NH3: 0, CH4: 0, O2: 0, LPG: 0, H2S: 0 },
        power: null,
        status: null,
        history: [],
        asOf: heartbeatLastSeenIso,
        connected: heartbeatOnline,
        hasData: false,
        lastSeen: heartbeatLastSeenIso,
        isOnline: heartbeatOnline
      });
    }

    const sensorData = sensorDataRaw || { temperature: 0, humidity: 0, light_lux: 0, co2: 0, nh3: 0, ch4: 0, o2: 0, lpg: 0, h2s: 0 };
    const gasData = gasDataRaw || {
      co2: sensorData.co2 || 0,
      nh3: sensorData.nh3 || 0,
      ch4: sensorData.ch4 || 0,
      o2: sensorData.o2 || 0,
      lpg: sensorData.lpg || sensorData.h2s || 0,
      h2s: sensorData.h2s || 0
    };

    // compute lastSeen using available timestamps
    const lastSeenCandidates = [sensorData.recorded_at, gasData.recorded_at, powerRow?.reading_time, deviceLastSeenRaw].filter(Boolean);
    const lastSeen = lastSeenCandidates.length ? new Date(lastSeenCandidates[0]) : null;
    const lastSeenIso = lastSeen ? lastSeen.toISOString() : null;
    const isOnline = lastSeen ? (Date.now() - lastSeen.getTime() <= THRESH_MS) : false;
    const powerData = powerRow
      ? {
          source: powerRow.power_source || 'SOLAR',
          voltage: powerRow.voltage_dc,
          current: powerRow.current_dc,
          cost_rwf: powerRow.cost_rwf,
          total_energy_kwh: powerRow.grid_energy_kwh,
          consumed_kwh: powerRow.grid_energy_kwh,
          cost_usd: powerRow.cost_usd,
          battery_level: powerRow.battery_percent,
        }
      : { source: 'SOLAR', voltage: 12.8, current: 2.1, cost_rwf: 0, total_energy_kwh: 0, consumed_kwh: 0, cost_usd: 0, battery_level: 92 };
    const statusData = status[0] || { heater: 'OFF', fan: 'ON', rotator: 'AUTO' };

    const history = Array.from({ length: limit }).map((_, index) => {
      const sensorPoint = sensorHistory[limit - 1 - index] || {};
      const gasPoint = gasHistory[limit - 1 - index] || {};
      const powerPoint = powerHistory[limit - 1 - index] || {};
      const recordedAt = sensorPoint.recorded_at || gasPoint.recorded_at || powerPoint.recorded_at;

      return {
        time: recordedAt
          ? new Date(recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : `P${index + 1}`,
        temp: parseFloat(sensorPoint.temperature || 37.5),
        hum: parseFloat(sensorPoint.humidity || 62),
        light: parseFloat(sensorPoint.light_lux || 520),
        co2: parseFloat(gasPoint.co2 || sensorPoint.co2 || 400),
        nh3: parseFloat(gasPoint.nh3 || 0),
        ch4: parseFloat(gasPoint.ch4 || 0),
        o2: parseFloat(gasPoint.o2 || 20.9),
        lpg: parseFloat(gasPoint.lpg || gasPoint.h2s || 0),
        h2s: parseFloat(gasPoint.h2s || gasPoint.lpg || 0),
        voltage: parseFloat(powerPoint.voltage || 12.8),
        current: parseFloat(powerPoint.current || 2.1),
      };
    });

    const asOf = (sensors[0] && sensors[0].recorded_at) || (gas[0] && gas[0].recorded_at) || (powerRow && powerRow.reading_time) || null;
    
    res.json({
      sensors: {
        temperature: parseFloat(sensorData.temperature),
        humidity: parseFloat(sensorData.humidity),
        light_lux: parseFloat(sensorData.light_lux || 520)
      },
      gas: {
        CO2: parseFloat(gasData.co2),
        NH3: parseFloat(gasData.nh3),
        CH4: parseFloat(gasData.ch4 || 0),
        O2: parseFloat(gasData.o2),
        LPG: parseFloat(gasData.lpg || gasData.h2s || 0),
        H2S: parseFloat(gasData.h2s || gasData.lpg || 0)
      },
      power: {
        source: powerData.source,
        voltage: parseFloat(powerData.voltage),
        current: parseFloat(powerData.current),
        cost_RWF: parseFloat(powerData.cost_rwf),
        totalEnergy_kWh: parseFloat(powerData.total_energy_kwh),
        consumed_kWh: parseFloat(powerData.consumed_kwh || 0),
        cost_USD: parseFloat(powerData.cost_usd || 0),
        batteryLevel: parseInt(powerData.battery_level)
      },
      status: {
        heater: statusData.heater,
        fan: statusData.fan,
        rotator: statusData.rotator
      },
      history,
      asOf,
      connected: true,
      hasData: true,
      lastSeen: lastSeenIso,
      isOnline
    });
  } catch (error) {
    console.error('Get sensors error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sensor data' });
  }
});

// Update sensor readings (for IoT devices)
router.post('/update', async (req, res) => {
  try {
    await ensureSensorsSchema();

    const { userId, sensors, temperature, humidity, light_lux, gas, power, status } = req.body;
    const ownerUserId = userId || null;
    const sensorPayload = sensors || {};
    const gasPayload = gas || sensorPayload.gas || {};
    const gasLpg = gasPayload.LPG ?? gasPayload.lpg ?? gasPayload.H2S ?? gasPayload.h2s ?? 0;
    const gasH2S = gasPayload.H2S ?? gasPayload.h2s ?? 0;

    const sensorTemperature = temperature ?? sensorPayload.temperature;
    const sensorHumidity = humidity ?? sensorPayload.humidity;
    const sensorLightLux = light_lux ?? sensorPayload.light_lux;
    const hasSensorValues =
      sensorTemperature !== undefined ||
      sensorHumidity !== undefined ||
      sensorLightLux !== undefined ||
      Object.keys(gasPayload).length > 0;
    
    if (hasSensorValues) {
      await pool.query(
        'INSERT INTO sensors (user_id, temperature, humidity, light_lux, co2, nh3, ch4, o2, lpg, h2s) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          ownerUserId,
          sensorTemperature ?? 37.5,
          sensorHumidity ?? 62,
          sensorLightLux ?? 520,
          gasPayload.CO2 ?? 400,
          gasPayload.NH3 ?? 2,
          gasPayload.CH4 ?? 0,
          gasPayload.O2 ?? 21,
          gasLpg,
          gasH2S
        ]
      );
      // Update last_seen heartbeat for user
      try {
        if (ownerUserId) await pool.query('UPDATE users SET last_seen = NOW() WHERE id = ?', [ownerUserId]);
      } catch (e) {
        console.warn('Failed to update users.last_seen', e.message || e);
      }
      try {
        if (ownerUserId) {
          await pool.query(
            `UPDATE device_registrations
             SET status = 'active', last_seen = NOW()
             WHERE user_id = ?`,
            [ownerUserId]
          );
        }
      } catch (e) {
        console.warn('Failed to update device_registrations.last_seen', e.message || e);
      }
    }
    
    if (Object.keys(gasPayload).length > 0) {
      await pool.query(
        'INSERT INTO gas_readings (user_id, co2, nh3, ch4, o2, lpg, h2s) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [ownerUserId, gasPayload.CO2 || 400, gasPayload.NH3 || 2, gasPayload.CH4 || 0, gasPayload.O2 || 21, gasLpg, gasH2S]
      );
    }
    
    if (power) {
      const normalizedSource = String(power.source || 'SOLAR').trim().toUpperCase().includes('GRID') ? 'GRID' : 'SOLAR';

      // Always store device serial for per-device tracking.
      const serialFromPayload = power.serialNumber || power.serial_number || power.deviceSerial || power.device_serial || null;
      let deviceSerial = serialFromPayload;
      if (!deviceSerial && ownerUserId) {
        try {
          const [rows] = await pool.query('SELECT device_serial_number FROM users WHERE id = ? LIMIT 1', [ownerUserId]);
          deviceSerial = rows?.[0]?.device_serial_number || null;
        } catch (error) {
          deviceSerial = null;
        }
      }

      // Normalize current units: some devices send mA instead of A. If current > 50 assume mA and convert to A.
      const rawCurrent = Number(power.current ?? power.current_dc ?? 0);
      const normalizedCurrent = rawCurrent > 50 ? (rawCurrent / 1000.0) : rawCurrent;

      // Compute cost fields server-side if not provided (300 RWF/kWh, 1 USD = 1400 RWF)
      const consumedKwh = normalizedSource === 'GRID'
        ? Number(power.consumed_kWh ?? power.totalEnergy_kWh ?? 0)
        : 0;
      const costRwf = normalizedSource === 'GRID'
        ? Number(power.cost_RWF ?? (consumedKwh * 300))
        : 0;
      const costUsd = normalizedSource === 'GRID'
        ? Number(power.cost_USD ?? (costRwf / 1400))
        : 0;

      await pool.query(
        `INSERT INTO power_readings (
          user_id, device_serial, power_source, voltage_dc, current_dc,
          grid_energy_kwh, cost_rwf, cost_usd,
          battery_percent, battery_status, energy_note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ownerUserId,
          deviceSerial,
          normalizedSource,
          Number(power.voltage ?? 13.2),
          Number(normalizedCurrent || 0),
          consumedKwh,
          costRwf,
          costUsd,
          power.batteryLevel || 95,
          power.batteryStatus || null,
          power.energy_note || (normalizedSource === 'GRID' ? 'GRID USAGE' : 'FREE - Solar Active')
        ]
      );
    }
    
    if (status) {
      await pool.query(
        'INSERT INTO device_status (user_id, heater, fan, rotator) VALUES (?, ?, ?, ?)',
        [ownerUserId, status.heater || 'OFF', status.fan || 'ON', status.rotator || 'AUTO']
      );
    }
    
    // Trigger real-time prediction if user ID available
    if (ownerUserId && hasSensorValues) {
      triggerRealtimePrediction(ownerUserId);
    }
    
    res.json({ success: true, message: 'Sensor data updated' });
  } catch (error) {
    console.error('Update sensors error:', error);
    res.status(500).json({ success: false, message: 'Failed to update sensor data' });
  }
});

// POST /sensors/update-by-serial — IoT devices POST data using their serial number.
// The server resolves the device_serial_number -> user.id and stores the data under that user_id.
router.post('/update-by-serial', async (req, res) => {
  try {
    await ensureSensorsSchema();

    const { serialNumber, sensors, temperature, humidity, light_lux, gas, power, status } = req.body;
    const headerSerial = String(req.headers['x-device-serial'] || '').trim();
    const headerApiKey = String(req.headers['x-api-key'] || '').trim();
    const resolvedSerial = String(serialNumber || headerSerial || '').trim();

    if (!resolvedSerial) {
      return res.status(400).json({ success: false, message: 'serialNumber is required' });
    }

    if (!headerApiKey) {
      return res.status(401).json({ success: false, message: 'x-api-key is required' });
    }

    if (headerSerial && headerSerial !== resolvedSerial) {
      return res.status(400).json({ success: false, message: 'Serial mismatch between payload and headers' });
    }

    // Resolve serial number from the device registry first so unassigned chips cannot post data.
    const [registrations] = await pool.query(
      'SELECT user_id, status FROM device_registrations WHERE device_serial = ? AND api_key = ? LIMIT 1',
      [resolvedSerial, headerApiKey]
    );
    if (!registrations.length) {
      return res.status(403).json({ success: false, message: `Invalid device credentials for serial number: ${resolvedSerial}` });
    }

    const registration = registrations[0];
    const registrationStatus = String(registration.status || '').toLowerCase();
    const ownerUserId = String(registration.user_id || '').trim();

    if (!ownerUserId || !['linked', 'active'].includes(registrationStatus)) {
      return res.status(409).json({
        success: false,
        locked: true,
        message: 'Device serial is not yet assigned by admin. Waiting for assignment before storing sensor data.'
      });
    }

    const [users] = await pool.query(
      'SELECT id, status FROM users WHERE id = ? LIMIT 1',
      [ownerUserId]
    );
    if (!users.length) {
      return res.status(404).json({ success: false, message: `No user found for assigned device serial: ${resolvedSerial}` });
    }
    const userStatus = String(users[0].status || 'active').toLowerCase();
    if (userStatus !== 'active') {
      return res.status(403).json({ success: false, locked: true, message: LOCK_MESSAGE });
    }

    // Delegate to the same insert logic
    const sensorPayload = sensors || {};
    const gasPayload = gas || sensorPayload.gas || {};
    const gasLpg = gasPayload.LPG ?? gasPayload.lpg ?? gasPayload.H2S ?? gasPayload.h2s ?? 0;
    const gasH2S = gasPayload.H2S ?? gasPayload.h2s ?? 0;
    const sensorTemperature = temperature ?? sensorPayload.temperature;
    const sensorHumidity = humidity ?? sensorPayload.humidity;
    const sensorLightLux = light_lux ?? sensorPayload.light_lux;

    const hasSensorValues =
      sensorTemperature !== undefined ||
      sensorHumidity !== undefined ||
      sensorLightLux !== undefined ||
      Object.keys(gasPayload).length > 0;

    if (hasSensorValues) {
      await pool.query(
        'INSERT INTO sensors (user_id, temperature, humidity, light_lux, co2, nh3, ch4, o2, lpg, h2s) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [ownerUserId, sensorTemperature ?? 37.5, sensorHumidity ?? 62, sensorLightLux ?? 520,
         gasPayload.CO2 ?? 400, gasPayload.NH3 ?? 2, gasPayload.CH4 ?? 0, gasPayload.O2 ?? 21, gasLpg, gasH2S]
      );
      try {
        if (ownerUserId) await pool.query('UPDATE users SET last_seen = NOW() WHERE id = ?', [ownerUserId]);
      } catch (e) {
        console.warn('Failed to update users.last_seen (by-serial)', e.message || e);
      }
      try {
        await pool.query(
          `UPDATE device_registrations
           SET status = 'active', last_seen = NOW()
           WHERE device_serial = ?`,
          [resolvedSerial]
        );
      } catch (e) {
        console.warn('Failed to update device_registrations.last_seen (by-serial)', e.message || e);
      }
    }

    if (Object.keys(gasPayload).length > 0) {
      await pool.query(
        'INSERT INTO gas_readings (user_id, co2, nh3, ch4, o2, lpg, h2s) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [ownerUserId, gasPayload.CO2 || 400, gasPayload.NH3 || 2, gasPayload.CH4 || 0, gasPayload.O2 || 21, gasLpg, gasH2S]
      );
    }

    if (power) {
      const normalizedSource = String(power.source || 'SOLAR').trim().toUpperCase().includes('GRID') ? 'GRID' : 'SOLAR';

      const consumedKwh = normalizedSource === 'GRID'
        ? Number(power.consumed_kWh ?? power.totalEnergy_kWh ?? 0)
        : 0;
      const costRwf = normalizedSource === 'GRID'
        ? Number(power.cost_RWF ?? (consumedKwh * 300))
        : 0;
      const costUsd = normalizedSource === 'GRID'
        ? Number(power.cost_USD ?? (costRwf / 1400))
        : 0;

      await pool.query(
        `INSERT INTO power_readings (
          user_id, device_serial, power_source, voltage_dc, current_dc,
          grid_energy_kwh, cost_rwf, cost_usd,
          battery_percent, battery_status, energy_note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ownerUserId,
          resolvedSerial,
          normalizedSource,
          power.voltage || 13.2,
          power.current || 1.8,
          consumedKwh,
          costRwf,
          costUsd,
          power.batteryLevel || 95,
          power.batteryStatus || null,
          power.energy_note || (normalizedSource === 'GRID' ? 'GRID USAGE' : 'FREE - Solar Active')
        ]
      );
      try {
        await pool.query(
          `UPDATE device_registrations
           SET status = 'active', last_seen = NOW()
           WHERE device_serial = ?`,
          [resolvedSerial]
        );
      } catch (e) {
        console.warn('Failed to update device_registrations.last_seen after power insert', e.message || e);
      }
    }

    if (status) {
      await pool.query(
        'INSERT INTO device_status (user_id, heater, fan, rotator) VALUES (?, ?, ?, ?)',
        [ownerUserId, status.heater || 'OFF', status.fan || 'ON', status.rotator || 'AUTO']
      );
    }

    // Trigger realtime prediction for the device owner so Socket.IO clients update automatically.
    triggerRealtimePrediction(ownerUserId).catch((error) => {
      console.error('Realtime prediction trigger failed:', error);
    });

    res.json({ success: true, message: 'Sensor data stored', userId: ownerUserId });
  } catch (error) {
    console.error('Update-by-serial error:', error);
    res.status(500).json({ success: false, message: 'Failed to update sensor data' });
  }
});

// Get power cost
router.get('/power/cost', authMiddleware, async (req, res) => {
  try {
    const admin = isAdminLike(req.user?.role);
    const requestedUserId = admin ? (req.query.userId || null) : req.user.uid;
    const [power] = await pool.query(
      `SELECT cost_rwf FROM power_readings ${requestedUserId ? 'WHERE user_id = ?' : ''} ORDER BY reading_time DESC, id DESC LIMIT 1`,
      requestedUserId ? [requestedUserId] : []
    );
    res.json({ cost_RWF: power[0]?.cost_rwf || 0 });
  } catch (error) {
    console.error('Get power cost error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch power cost' });
  }
});

// Helper function to trigger real-time prediction on new sensor data
async function triggerRealtimePrediction(userId) {
  if (!io) return; // Socket.IO not available
  
  try {
    // Get latest sensor row
    const [rows] = await pool.query(
      'SELECT * FROM sensors WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1',
      [userId]
    );
    
    if (!rows || !rows.length) return;
    
    const sensorRow = rows[0];
    
    // Normalize sensor data to model features
    const features = {
      Ammonia_ppm: Number(sensorRow.nh3 ?? 0),
      CO2_ppm: Number(sensorRow.co2 ?? 0),
      H2S_ppm: Number(sensorRow.h2s ?? 0),
      LPG_ppm: Number(sensorRow.lpg ?? sensorRow.h2s ?? 0),
      CO_ppm: Number(sensorRow.co ?? 0),
      Oxygen_percent: Number(sensorRow.o2 ?? 0),
      Temperature_C: Number(sensorRow.temperature ?? 0),
      Humidity_percent: Number(sensorRow.humidity ?? 0),
      Light_lux: Number(sensorRow.light_lux ?? 0),
      Methane_ppm: Number(sensorRow.ch4 ?? 0),
    };
    
    const prediction = await runPythonPrediction({ features });

    io.to(`predictions:${userId}`).emit('prediction', {
      ...prediction,
      mode: 'realtime-auto',
      inputs: features,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error triggering real-time prediction:', error);
  }
}

module.exports = router;
