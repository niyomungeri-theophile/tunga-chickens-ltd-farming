const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const { authMiddleware } = require('./auth');

const router = express.Router();

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

const MODEL_FEATURE_ORDER = [
  'Ammonia_ppm',
  'CO2_ppm',
  'H2S_ppm',
  'CO_ppm',
  'Oxygen_percent',
  'Temperature_C',
  'Humidity_percent',
  'Light_lux',
  'Methane_ppm',
];

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSensorRow(row = {}) {
  return {
    Ammonia_ppm: toNumber(row.nh3 ?? row.ammonia ?? row.Ammonia_ppm, 0),
    CO2_ppm: toNumber(row.co2 ?? row.CO2_ppm, 0),
    H2S_ppm: toNumber(row.h2s ?? row.H2S_ppm, 0),
    CO_ppm: toNumber(row.co ?? row.co_ppm ?? row.CO_ppm, 0),
    Oxygen_percent: toNumber(row.o2 ?? row.oxygen ?? row.Oxygen_percent, 0),
    Temperature_C: toNumber(row.temperature ?? row.temp ?? row.Temperature_C, 0),
    Humidity_percent: toNumber(row.humidity ?? row.hum ?? row.Humidity_percent, 0),
    Light_lux: toNumber(row.light_lux ?? row.lightLux ?? row.Light_lux, 0),
    Methane_ppm: toNumber(row.ch4 ?? row.methane ?? row.Methane_ppm, 0),
  };
}

function isAdminLike(role) {
  return ['admin', 'supervisor'].includes(String(role || '').toLowerCase());
}

function buildWhereClause(userId) {
  if (userId) {
    return {
      clause: 'WHERE user_id = ? AND recorded_at BETWEEN ? AND ?',
      params: [userId],
    };
  }

  return {
    clause: 'WHERE recorded_at BETWEEN ? AND ?',
    params: [],
  };
}

function runPythonPrediction(payload) {
  const scriptPath = path.join(__dirname, '..', 'ml', 'predict.py');

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
      // Windows often has `py` launcher but no `python` shim.
      if (err && err.code === 'ENOENT' && preferredCmd === 'python') {
        return runOnce('py', ['-3', scriptPath]);
      }
      throw err;
    });
}


// DB connection
const db = require('../config/db');

// POST /api/predictions/predict
router.post('/predict', authMiddleware, async (req, res) => {
  try {
    const mode = String(req.body.mode || (req.body.startDate && req.body.endDate ? 'historical' : 'realtime')).toLowerCase();
    const authUserId = req.user?.uid || null;
    // Admins may request another user's data by passing userId; non-admins default to their own id
    const requestedUserId = isAdminLike(req.user?.role) ? (req.body.userId || null) : authUserId;

    if (mode === 'historical') {
      if (!req.body.startDate || !req.body.endDate) {
        return res.status(400).json({ success: false, message: 'Missing startDate or endDate for historical prediction' });
      }

      const { clause, params } = buildWhereClause(requestedUserId);
      const [rows] = await db.query(
        `SELECT
          AVG(temperature) AS temperature,
          AVG(humidity) AS humidity,
          AVG(light_lux) AS light_lux,
          AVG(co2) AS co2,
          AVG(nh3) AS nh3,
          AVG(ch4) AS ch4,
          AVG(o2) AS o2,
          AVG(h2s) AS h2s
        FROM sensors ${clause}`,
        [...params, req.body.startDate, req.body.endDate]
      );

      const snapshot = rows && rows[0] ? rows[0] : null;
      if (!snapshot || Object.values(snapshot).every((value) => value === null || value === undefined)) {
        return res.status(404).json({ success: false, message: 'No sensor data in selected range' });
      }

      const features = normalizeSensorRow(snapshot);
      const result = await runPythonPrediction({ features });
      const response = {
        ...result,
        mode: 'historical',
        model: 'Chickhelf.pkl',
        featureOrder: MODEL_FEATURE_ORDER,
        inputs: features,
        range: {
          startDate: req.body.startDate,
          endDate: req.body.endDate,
        },
      };
      
      // Emit prediction via Socket.IO to the requesting user's room (or the target user if admin requested)
      if (io) {
        const emitTo = requestedUserId || authUserId;
        if (emitTo) io.to(`predictions:${emitTo}`).emit('prediction', response);
      }
      
      return res.json(response);
    }

    const { clause, params } = requestedUserId
      ? { clause: 'WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1', params: [requestedUserId] }
      : { clause: 'ORDER BY recorded_at DESC LIMIT 1', params: [] };

    const [rows] = await db.query(`SELECT * FROM sensors ${clause}`, params);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'No sensor data available' });
    }

    const features = normalizeSensorRow(rows[0]);
    const result = await runPythonPrediction({ features });
    const response = {
      ...result,
      mode: 'realtime',
      model: 'Chickhelf.pkl',
      featureOrder: MODEL_FEATURE_ORDER,
      inputs: features,
    };
    
    // Emit prediction via Socket.IO to the requesting user's room
    if (io) {
      const emitTo = requestedUserId || authUserId;
      if (emitTo) io.to(`predictions:${emitTo}`).emit('prediction', response);
    }
    
    return res.json(response);
  } catch (error) {
    console.error('Prediction error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Prediction failed' });
  }
});

// ========== REAL-TIME SENSOR DATA STREAMING (from ESP32) ==========

// POST /api/predictions/stream — ESP32 sends real-time sensor data
// Device auth helper
async function verifyDeviceAndCheckAccount(deviceSerial, apiKey) {
  try {
    // Get device registration and user info
    const [devices] = await db.query(
      `SELECT dr.id, dr.user_id, u.status as user_status 
       FROM device_registrations dr 
       LEFT JOIN users u ON dr.user_id = u.id
       WHERE dr.device_serial = ? AND dr.api_key = ?`,
      [deviceSerial, apiKey]
    );

    if (!devices || devices.length === 0) {
      return { valid: false, error: 'Invalid device credentials', code: 403 };
    }

    const device = devices[0];

    // Check if device is linked to account
    if (!device.user_id) {
      return { valid: false, error: 'Device not linked to any account', code: 403 };
    }

    // Check if user account is active
    const userStatus = String(device.user_status || 'active').toLowerCase();
    if (userStatus !== 'active') {
      return { 
        valid: false, 
        error: 'Account inactive - device locked', 
        code: 403,
        deviceBlocked: true 
      };
    }

    return { valid: true, userId: device.user_id, deviceId: devices[0].id };
  } catch (error) {
    console.error('Device verification error:', error);
    return { valid: false, error: error.message, code: 500 };
  }
}

router.post('/stream', async (req, res) => {
  try {
    const { 
      deviceId,        // ESP32 unique identifier
      temp1, temp2,    // DHT22, DS18B20
      humidity, light, 
      co2, nh3, lpg,   // Gas sensors
      solarVoltage, solarCurrent, solarPower,
      loadPower
    } = req.body;

    // Get device credentials from headers
    const deviceSerial = req.headers['x-device-serial'];
    const apiKey = req.headers['x-api-key'];

    if (!deviceSerial || !apiKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing x-device-serial or x-api-key headers' 
      });
    }

    // Verify device and check account status
    const authResult = await verifyDeviceAndCheckAccount(deviceSerial, apiKey);
    if (!authResult.valid) {
      return res.status(authResult.code).json({ 
        success: false, 
        message: authResult.error,
        deviceBlocked: authResult.deviceBlocked || false
      });
    }

    // Validate required fields
    if (!deviceId) {
      return res.status(400).json({ success: false, message: 'Missing deviceId' });
    }

    // Store sensor data in database (use verified user id from device verification)
    const ownerUserId = authResult.userId;
    const resolvedDeviceId = authResult.deviceId || deviceId;

    const [sensorResult] = await db.query(
      `INSERT INTO sensors (user_id, temperature, humidity, light_lux, co2, nh3, ch4, o2, h2s)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ownerUserId,
        toNumber(temp2 || temp1, 25),
        toNumber(humidity, 60),
        toNumber(light, 500),
        toNumber(co2, 400),
        toNumber(nh3, 5),
        0, // ch4
        21, // o2
        0  // h2s
      ]
    );

    // Update user's last_seen heartbeat
    try {
      if (ownerUserId) {
        await db.query('UPDATE users SET last_seen = NOW() WHERE id = ?', [ownerUserId]);
      }
    } catch (e) {
      // non-fatal
      console.warn('Failed to update last_seen for user', ownerUserId, e.message || e);
    }

    // Store power data (associate with resolved device id)
    await db.query(
      `INSERT INTO power_readings (device_id, solar_voltage, solar_current, solar_power, load_power)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
       solar_voltage = VALUES(solar_voltage),
       solar_current = VALUES(solar_current),
       solar_power = VALUES(solar_power),
       load_power = VALUES(load_power)`,
      [resolvedDeviceId, toNumber(solarVoltage, 0), toNumber(solarCurrent, 0), toNumber(solarPower, 0), toNumber(loadPower, 0)]
    );

    // Build normalized features for ML prediction
    const features = {
      Ammonia_ppm: toNumber(nh3, 0),
      CO2_ppm: toNumber(co2, 0),
      H2S_ppm: 0,
      CO_ppm: 0,
      Oxygen_percent: 21,
      Temperature_C: toNumber(temp2 || temp1, 25),
      Humidity_percent: toNumber(humidity, 60),
      Light_lux: toNumber(light, 500),
      Methane_ppm: 0,
    };

    // Run real-time prediction
    let prediction = null;
    try {
      prediction = await runPythonPrediction({ features });
    } catch (mlError) {
      console.warn('[Prediction] ML model error:', mlError.message);
      // Continue without prediction if ML fails
    }

    const response = {
      success: true,
      deviceId: resolvedDeviceId,
      userId: ownerUserId,
      timestamp: new Date().toISOString(),
      sensorData: {
        temp1, temp2, humidity, light,
        co2, nh3, lpg,
        solarVoltage, solarCurrent, solarPower, loadPower
      },
      prediction,
      storedId: sensorResult.insertId
    };

    // Broadcast to the owning user's room via Socket.IO
    if (io) {
      if (ownerUserId) {
        io.to(`predictions:${ownerUserId}`).emit('sensor-data', response);
      } else {
        io.emit('sensor-data', response);
      }

      if (prediction) {
        if (ownerUserId) {
          io.to(`predictions:${ownerUserId}`).emit('real-time-prediction', {
            deviceId: resolvedDeviceId,
            timestamp: new Date().toISOString(),
            ...prediction,
            inputs: features,
            mode: 'realtime'
          });
        } else {
          io.emit('real-time-prediction', {
            deviceId: resolvedDeviceId,
            timestamp: new Date().toISOString(),
            ...prediction,
            inputs: features,
            mode: 'realtime'
          });
        }
      }
    }

    return res.json(response);
  } catch (error) {
    console.error('Stream error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Stream failed' });
  }
});

// ========== REMOTE CONTROL ENDPOINTS (from Web Dashboard) ==========

// POST /api/predictions/control — Send control commands to ESP32
router.post('/control', authMiddleware, async (req, res) => {
  try {
    const { deviceId, command, relay, state } = req.body;

    if (!deviceId || !command) {
      return res.status(400).json({ success: false, message: 'Missing deviceId or command' });
    }

    const isAdmin = ['admin', 'supervisor'].includes(String(req.user?.role || '').toLowerCase());
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Only admins can send control commands' });
    }

    // Store control command in database for ESP32 to fetch
    const [commandResult] = await db.query(
      `INSERT INTO device_commands (device_id, command, relay, state, requested_by, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [deviceId, command, relay || null, state ? 1 : 0, req.user?.id || 'system']
    );

    // Broadcast control command via Socket.IO (for real-time feedback)
    if (io) {
      io.emit('device-control', {
        deviceId,
        command,
        relay,
        state,
        requestedBy: req.user?.username || 'admin',
        timestamp: new Date().toISOString()
      });
    }

    return res.json({
      success: true,
      message: `Command '${command}' sent to device ${deviceId}`,
      commandId: commandResult.insertId,
      command,
      relay,
      state
    });
  } catch (error) {
    console.error('Control command error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Command failed' });
  }
});

// GET /api/predictions/control/:deviceId — ESP32 polls for pending commands
router.get('/control/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;

    // Get device credentials from headers
    const deviceSerial = req.headers['x-device-serial'];
    const apiKey = req.headers['x-api-key'];

    if (!deviceSerial || !apiKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing x-device-serial or x-api-key headers' 
      });
    }

    // Verify device and check account status
    const authResult = await verifyDeviceAndCheckAccount(deviceSerial, apiKey);
    if (!authResult.valid) {
      return res.status(authResult.code).json({ 
        success: false, 
        message: authResult.error,
        deviceBlocked: authResult.deviceBlocked || false,
        commands: []
      });
    }

    const [commands] = await db.query(
      `SELECT id, command, relay, state, created_at 
       FROM device_commands 
       WHERE device_id = ? AND executed = 0
       ORDER BY created_at ASC
       LIMIT 10`,
      [deviceId]
    );

    if (commands.length > 0) {
      // Mark as executed
      await db.query(
        `UPDATE device_commands SET executed = 1 WHERE device_id = ? AND executed = 0`,
        [deviceId]
      );
    }

    return res.json({
      success: true,
      commands: commands.map(cmd => ({
        id: cmd.id,
        command: cmd.command,
        relay: cmd.relay,
        state: cmd.state === 1
      }))
    });
  } catch (error) {
    console.error('Get commands error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch commands' });
  }
});

// GET /api/predictions/stream/latest/:deviceId — Get latest sensor data
router.get('/stream/latest/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;

    const [rows] = await db.query(
      `SELECT * FROM sensors WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`,
      [deviceId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'No sensor data found' });
    }

    return res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Get latest sensor error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
