const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, deviceAuthMiddleware } = require('../middleware/auth');
const nodemailer = require('nodemailer');

// Nodemailer transporter using env config. Ensure .env has SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
const mailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.example.com',
  port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

async function getAdminEmails() {
  try {
    const [rows] = await pool.query("SELECT email FROM users WHERE LOWER(role) IN ('admin','supervisor') AND email IS NOT NULL AND email <> ''");
    return rows.map(r => r.email).filter(Boolean);
  } catch (err) {
    console.error('Failed to fetch admin emails:', err);
    return [];
  }
}

async function sendAdminEmail(subject, text, html) {
  try {
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (adminEmails.length === 0) {
      // fallback to querying users table
      const queried = await getAdminEmails();
      adminEmails.push(...queried);
    }
    if (adminEmails.length === 0) {
      console.warn('No admin email addresses configured; skipping email send.');
      return;
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || 'no-reply@example.com',
      to: adminEmails.join(','),
      subject,
      text,
      html
    };
    await sendWithRetry(mailOptions);
  } catch (err) {
    console.error('Failed to send admin email:', err);
  }
}

// Simple retry/backoff wrapper for sendMail
async function sendWithRetry(mailOptions, retries = 3, initialDelay = 1000) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      const info = await mailTransporter.sendMail(mailOptions);
      console.log('Email sent:', info && info.messageId);
      return info;
    } catch (err) {
      attempt++;
      console.error(`Email send attempt ${attempt} failed:`, err && err.message ? err.message : err);
      if (attempt >= retries) {
        console.error('All email send attempts failed.');
        throw err;
      }
      const delay = initialDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Email templates
function adminAssignmentTemplate(deviceSerial, fullName, userEmail) {
  const subject = `Device Assigned: ${deviceSerial}`;
  const text = `Device ${deviceSerial} was assigned to ${fullName} (${userEmail}).`;
  const html = `<p>Device <strong>${deviceSerial}</strong> was assigned to <strong>${fullName}</strong> (${userEmail}).</p>`;
  return { subject, text, html };
}

function farmerAssignmentTemplate(deviceSerial, fullName) {
  const subject = `Your device ${deviceSerial} has been assigned`;
  const text = `Hello ${fullName},\n\nYour device with serial ${deviceSerial} has been assigned to your account by an administrator.`;
  const html = `<p>Hello ${fullName},</p><p>Your device with serial <strong>${deviceSerial}</strong> has been assigned to your account by an administrator.</p>`;
  return { subject, text, html };
}

function lockNotificationTemplate(fullName, deviceSerial) {
  const subject = `Dear farmer, your system is locked !!`;
  const text = [
    `Dear ${fullName},`,
    '',
    'YOUR SYSTEM LOCKED !!',
    'Contact TCL Team For immediate call Eng Theophile',
    '+250785133511 & 0725283858',
    '',
    `Device serial: ${deviceSerial}`
  ].join('\n');
  const html = `
    <p>Dear ${fullName},</p>
    <p><strong>YOUR SYSTEM LOCKED !!</strong></p>
    <p>Contact TCL Team For immediate call Eng Theophile</p>
    <p><strong>+250785133511 &amp; 0725283858</strong></p>
    <p>Device serial: <strong>${deviceSerial}</strong></p>
  `;
  return { subject, text, html };
}

const lockNotificationCooldownMs = 60 * 60 * 1000;
const lockNotificationSentAt = new Map();

async function maybeSendLockNotification(deviceSerial, userId, userRow) {
  try {
    const key = `${deviceSerial}:${userId}`;
    const lastSent = lockNotificationSentAt.get(key) || 0;
    if (Date.now() - lastSent < lockNotificationCooldownMs) {
      return;
    }

    const fullName = String(userRow?.full_name || 'Farmer').trim() || 'Farmer';
    const email = String(userRow?.email || '').trim();
    if (!email) {
      return;
    }

    const tmpl = lockNotificationTemplate(fullName, deviceSerial);
    await sendWithRetry({
      from: process.env.SMTP_FROM || 'no-reply@example.com',
      to: email,
      subject: tmpl.subject,
      text: tmpl.text,
      html: tmpl.html
    });

    lockNotificationSentAt.set(key, Date.now());
    console.log('Lock notification email sent to farmer:', email);
  } catch (err) {
    console.error('Failed to send lock notification email:', err);
  }
}

let io;
router.use((req, res, next) => {
  if (!io) {
    try {
      io = require('../server').io;
    } catch (error) {
      // Socket.IO not ready yet
    }
  }
  next();
});

async function ensureDeviceSchema() {
  const createStatements = [
    `CREATE TABLE IF NOT EXISTS device_registrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      device_serial VARCHAR(100) NOT NULL UNIQUE,
      esp32_chip_id VARCHAR(100) NULL UNIQUE,
      -- ds18b20_address removed, only chip id is used
      user_id VARCHAR(36) NULL,
      device_name VARCHAR(100) DEFAULT 'Eco-Smart Poultry',
      device_mac_address VARCHAR(20) NULL,
      api_key VARCHAR(256) NOT NULL UNIQUE,
      firmware_version VARCHAR(20) NULL,
      status ENUM('unregistered', 'registered', 'linked', 'active', 'inactive', 'error') DEFAULT 'unregistered',
      first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_seen TIMESTAMP NULL,
      linked_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_device_registrations_serial (device_serial),
      INDEX idx_device_registrations_chip_id (esp32_chip_id),
      -- INDEX idx_device_registrations_ds18b20 removed
      INDEX idx_device_registrations_user_id (user_id),
      INDEX idx_device_registrations_api_key (api_key)
    )`,
    `CREATE TABLE IF NOT EXISTS device_credentials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      device_serial VARCHAR(100) NOT NULL,
      api_key VARCHAR(256) NOT NULL,
      secret_key VARCHAR(256) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NULL,
      revoked TINYINT(1) DEFAULT 0,
      FOREIGN KEY (device_serial) REFERENCES device_registrations(device_serial),
      INDEX idx_device_credentials_serial (device_serial),
      INDEX idx_device_credentials_api_key (api_key)
    )`
    , `CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      recipient_role VARCHAR(50) NULL,
      type VARCHAR(100) NOT NULL,
      message TEXT NOT NULL,
      data JSON NULL,
      is_read TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notifications_recipient_role (recipient_role)
    )`
  ];

  for (const statement of createStatements) {
    try {
      await pool.query(statement);
    } catch (error) {
      if (error.code !== 'ER_TABLE_EXISTS_ERROR') {
        console.error('Error creating device schema:', error);
      }
    }
  }
}

ensureDeviceSchema().catch(console.error);

function isAdminLike(role) {
  return ['admin', 'supervisor'].includes(String(role || '').toLowerCase());
}

function generateApiKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 48; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function formatDeviceSerialNumber(sequence) {
  return `NT-${String(sequence).padStart(2, '0')}-TCL`;
}

async function generateNextDeviceSerialNumber() {
  // Use a dedicated sequence table and a transaction to ensure
  // serial numbers are allocated atomically and without gaps
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // ensure sequence table exists
    await conn.query(`CREATE TABLE IF NOT EXISTS device_serial_sequence (
      id INT PRIMARY KEY,
      last_seq INT NOT NULL
    )`);

    // try to lock the single sequence row
    const [seqRows] = await conn.query('SELECT last_seq FROM device_serial_sequence WHERE id = 1 FOR UPDATE');
    let nextSeq;
    if (seqRows.length === 0) {
      // initialize based on current maximum across users and registrations
      const [rows] = await conn.query(`
        SELECT GREATEST(
          COALESCE((SELECT MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(device_serial_number,'-',2),'-',-1) AS UNSIGNED))
                    FROM users WHERE device_serial_number REGEXP '^NT-[0-9]+-TCL$'), 0),
          COALESCE((SELECT MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(device_serial,'-',2),'-',-1) AS UNSIGNED))
                    FROM device_registrations WHERE device_serial REGEXP '^NT-[0-9]+-TCL$'), 0)
        ) AS max_serial
      `);
      const currentMax = Number(rows?.[0]?.max_serial) || 0;
      nextSeq = currentMax + 1 || 1;
      await conn.query('INSERT INTO device_serial_sequence (id, last_seq) VALUES (1, ?)', [nextSeq]);
    } else {
      const lastSeq = Number(seqRows[0].last_seq) || 0;
      nextSeq = lastSeq + 1;
      await conn.query('UPDATE device_serial_sequence SET last_seq = ? WHERE id = 1', [nextSeq]);
    }

    await conn.commit();
    return formatDeviceSerialNumber(nextSeq);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Sync a user's assigned device serial to the actual linked device record.
async function syncUserDeviceSerial(deviceSerial, userId) {
  if (!deviceSerial || !userId) return;

  const [userRows] = await pool.query(
    'SELECT device_serial_number FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  const currentSerial = String(userRows?.[0]?.device_serial_number || '').trim();
  if (currentSerial !== deviceSerial) {
    await pool.query(
      'UPDATE users SET device_serial_number = ? WHERE id = ?',
      [deviceSerial, userId]
    );
  }
}

// Admin-only reset: clears stored device registrations so numbering starts again at NT-01-TCL.
// This is destructive and should only be used when you want to rebuild the device registry from scratch.
async function resetDeviceSerialSequence() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT device_serial FROM device_registrations WHERE device_serial REGEXP ?',
      ['^NT-[0-9]+-TCL$']
    );

    const serials = rows.map((row) => row.device_serial).filter(Boolean);
    if (serials.length > 0) {
      await conn.query(
        'UPDATE users SET device_serial_number = NULL WHERE device_serial_number REGEXP ?',
        ['^NT-[0-9]+-TCL$']
      );
      await conn.query(
        'DELETE FROM device_credentials WHERE device_serial REGEXP ?',
        ['^NT-[0-9]+-TCL$']
      );
      await conn.query(
        'DELETE FROM device_registrations WHERE device_serial REGEXP ?',
        ['^NT-[0-9]+-TCL$']
      );
    }

    await conn.commit();
    return { cleared: serials.length };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function handleRequestSerial(req, res, options = {}) {
  try {
    await ensureDeviceSchema();

    const esp32ChipId = String(req.body?.esp32_chip_id || req.body?.chipId || req.query?.esp32_chip_id || req.query?.chipId || '').trim();
    // DS18B20 address removed, only chip id is used
    if (!esp32ChipId) {
      if (options.allowMissingChipId) {
        return res.status(200).json({
          success: true,
          message: 'Send a POST request with esp32_chip_id to request a device serial',
        });
      }

      return res.status(400).json({ success: false, message: 'esp32_chip_id is required' });
    }

    let [existing] = await pool.query(
      `SELECT dr.device_serial, dr.api_key, dr.user_id, dr.status,
              u.id AS linked_user_exists, u.status AS user_status
       FROM device_registrations dr
       LEFT JOIN users u ON dr.user_id = u.id
       WHERE dr.esp32_chip_id = ?
       LIMIT 1`,
      [esp32ChipId]
    );

    if (existing.length > 0) {
      const device = existing[0];
      const hasRealUser = Boolean(device.linked_user_exists);
      const isLinked = hasRealUser && ['linked', 'active'].includes(String(device.status || '').toLowerCase());

      if (isLinked) {
        try {
          await syncUserDeviceSerial(device.device_serial, device.user_id);
        } catch (syncError) {
          console.warn('Failed to sync linked user device serial:', syncError.message || syncError);
        }
      }

      return res.json({
        success: true,
        device_serial: device.device_serial,
        api_key: device.api_key,
        user_id: isLinked ? device.user_id : null,
        status: device.status,
        isExisting: true,
        message: isLinked ? 'Linked device serial retrieved successfully' : 'Device serial retrieved successfully'
      });
    }

    // Check for serials pre-assigned to a farmer but not yet claimed by any ESP32.
    // This handles the case where admin assigns NT-01 to a new farmer BEFORE the new
    // ESP32 boots. Without this check the new ESP32 would skip NT-01 and get NT-10+.
    const [preAssignedRows] = await pool.query(
      `SELECT dr.id, dr.device_serial, dr.api_key, dr.status, dr.user_id
       FROM device_registrations dr
       WHERE dr.user_id IS NOT NULL
         AND (dr.esp32_chip_id IS NULL OR dr.esp32_chip_id = '')
         AND dr.status IN ('registered', 'linked')
       ORDER BY CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(dr.device_serial, '-', 2), '-', -1) AS UNSIGNED) ASC
       LIMIT 1`
    );

    if (preAssignedRows.length > 0) {
      const pre = preAssignedRows[0];
      let apiKey = String(pre.api_key || '').trim();
      if (!apiKey) {
        apiKey = generateApiKey();
        await pool.query('UPDATE device_registrations SET api_key = ? WHERE id = ?', [apiKey, pre.id]);
      }
      await pool.query(
        `UPDATE device_registrations SET esp32_chip_id = ?, status = 'active', last_seen = NOW() WHERE id = ?`,
        [esp32ChipId, pre.id]
      );
      try { await syncUserDeviceSerial(pre.device_serial, pre.user_id); } catch (_) {}
      return res.json({
        success: true,
        device_serial: pre.device_serial,
        api_key: apiKey,
        user_id: pre.user_id,
        status: 'active',
        isExisting: true,
        message: 'Pre-assigned device serial claimed by this ESP32'
      });
    }

    const [reservedRows] = await pool.query(
      `SELECT id, device_serial, api_key, status
       FROM device_registrations
       WHERE user_id IS NULL
         AND (esp32_chip_id IS NULL OR esp32_chip_id = '')
         AND status IN ('unregistered', 'registered')
       ORDER BY CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(device_serial, '-', 2), '-', -1) AS UNSIGNED) ASC, first_seen ASC
       LIMIT 1`
    );

    if (reservedRows.length > 0) {
      const reserved = reservedRows[0];
      let apiKey = String(reserved.api_key || '').trim();
      if (!apiKey) {
        apiKey = generateApiKey();
        await pool.query(
          'UPDATE device_registrations SET api_key = ? WHERE id = ?',
          [apiKey, reserved.id]
        );
      }

      const nextStatus = String(reserved.status || '').toLowerCase() === 'unregistered' ? 'registered' : reserved.status;
      await pool.query(
        'UPDATE device_registrations SET esp32_chip_id = ?, status = ?, last_seen = NOW() WHERE id = ?',
        [esp32ChipId, nextStatus, reserved.id]
      );

      return res.json({
        success: true,
        device_serial: reserved.device_serial,
        api_key: apiKey,
        user_id: null,
        status: nextStatus,
        isExisting: true,
        message: 'Reserved device serial assigned to this ESP'
      });
    }

    const deviceSerial = await generateNextDeviceSerialNumber();
    const apiKey = generateApiKey();

    await pool.query(
      `INSERT INTO device_registrations (device_serial, esp32_chip_id, api_key, status)
       VALUES (?, ?, ?, 'unregistered')`,
      [deviceSerial, esp32ChipId, apiKey]
    );

    await pool.query(
      'INSERT INTO device_credentials (device_serial, api_key) VALUES (?, ?)',
      [deviceSerial, apiKey]
    );

    return res.json({
      success: true,
      device_serial: deviceSerial,
      api_key: apiKey,
      isExisting: false,
      message: 'New device serial generated and registered'
    });
  } catch (error) {
    console.error('Request serial error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function repairDeviceRegistration(req, res) {
  const conn = await pool.getConnection();
  try {
    await ensureDeviceSchema();

    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const esp32ChipId = String(req.body?.esp32_chip_id || req.body?.chipId || '').trim();
    const deviceSerial = String(req.body?.device_serial || req.body?.deviceSerial || '').trim();
    const userId = String(req.body?.user_id || req.body?.userId || '').trim();
    const deviceName = String(req.body?.device_name || req.body?.deviceName || 'Eco-Smart Poultry').trim() || 'Eco-Smart Poultry';
    const macAddress = String(req.body?.device_mac_address || req.body?.macAddress || '').trim();
    const firmwareVersion = String(req.body?.firmware_version || req.body?.firmwareVersion || '').trim();

    if (!esp32ChipId) {
      return res.status(400).json({ success: false, message: 'esp32_chip_id is required' });
    }

    await conn.beginTransaction();

    const [existingDeviceRows] = await conn.query(
      'SELECT device_serial, esp32_chip_id, user_id FROM device_registrations WHERE esp32_chip_id = ? OR ( ? <> "" AND device_serial = ? ) LIMIT 1',
      [esp32ChipId, deviceSerial, deviceSerial]
    );

    if (existingDeviceRows.length > 0) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message: 'A registration already exists for this chip ID or device serial',
        device: existingDeviceRows[0]
      });
    }

    const [userRows] = await conn.query(
      'SELECT id, full_name, email, role, device_serial_number FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    if (!userRows.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (String(userRows[0].role || '').toLowerCase() === 'admin') {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Cannot attach a device to an admin account' });
    }

    const finalSerial = deviceSerial || userRows[0].device_serial_number || await generateNextDeviceSerialNumber();
    const apiKey = generateApiKey();

    await conn.query(
      `INSERT INTO device_registrations
       (device_serial, esp32_chip_id, user_id, device_name, device_mac_address, api_key, firmware_version, status, first_seen, linked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'linked', NOW(), NOW())`,
      [finalSerial, esp32ChipId, userId, deviceName, macAddress || null, apiKey, firmwareVersion || null]
    );

    await conn.query(
      'INSERT INTO device_credentials (device_serial, api_key) VALUES (?, ?)',
      [finalSerial, apiKey]
    );

    await conn.query(
      'UPDATE users SET device_serial_number = ? WHERE id = ?',
      [finalSerial, userId]
    );

    await conn.commit();

    return res.json({
      success: true,
      message: 'Device registration repaired successfully',
      device: {
        device_serial: finalSerial,
        esp32_chip_id: esp32ChipId,
        user_id: userId,
        device_name: deviceName,
        api_key: apiKey
      }
    });
  } catch (error) {
    await conn.rollback();
    console.error('Repair device registration error:', error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    conn.release();
  }
}

// ESP32 boot request: get or create serial for the board
router.get('/request-serial', (req, res) => handleRequestSerial(req, res, { allowMissingChipId: true }));
router.post('/request-serial', handleRequestSerial);

// Register a device explicitly if needed
router.post('/register', async (req, res) => {
  try {
    await ensureDeviceSchema();

    const { chipId, macAddress, firmwareVersion } = req.body || {};
    if (!chipId) {
      return res.status(400).json({ success: false, message: 'Missing chipId' });
    }

    const [existing] = await pool.query(
      'SELECT device_serial, api_key, user_id, status FROM device_registrations WHERE esp32_chip_id = ? LIMIT 1',
      [chipId]
    );

    if (existing.length > 0) {
      const device = existing[0];
      return res.json({
        success: true,
        message: 'Device already registered',
        deviceSerial: device.device_serial,
        apiKey: device.api_key,
        userId: device.user_id,
        status: device.status,
        registered: true
      });
    }

    const deviceSerial = await generateNextDeviceSerialNumber();
    const apiKey = generateApiKey();

    await pool.query(
      `INSERT INTO device_registrations 
       (device_serial, esp32_chip_id, device_mac_address, api_key, firmware_version, status)
       VALUES (?, ?, ?, ?, ?, 'unregistered')`,
      [deviceSerial, chipId, macAddress || null, apiKey, firmwareVersion || 'unknown']
    );

    await pool.query(
      'INSERT INTO device_credentials (device_serial, api_key) VALUES (?, ?)',
      [deviceSerial, apiKey]
    );

    return res.json({
      success: true,
      message: 'Device registered successfully',
      deviceSerial,
      apiKey,
      chipId,
      status: 'unregistered'
    });
  } catch (error) {
    console.error('Device registration error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Admin assigns a serial to a user
router.post('/admin/assign', authMiddleware, async (req, res) => {
  try {
    await ensureDeviceSchema();

    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const deviceSerial = String(req.body?.device_serial || '').trim();
    const userId = String(req.body?.user_id || '').trim();
    if (!deviceSerial || !userId) {
      return res.status(400).json({ success: false, message: 'device_serial and user_id are required' });
    }

    const [devices] = await pool.query(
      'SELECT device_serial, user_id, esp32_chip_id FROM device_registrations WHERE device_serial = ? LIMIT 1',
      [deviceSerial]
    );
    if (!devices.length) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    if (!String(devices[0].esp32_chip_id || '').trim()) {
      return res.status(400).json({ success: false, message: 'Chip ID must be assigned before linking a user' });
    }

    const [users] = await pool.query(
      'SELECT id, full_name, email, role FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (!users.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (String(users[0].role || '').toLowerCase() === 'admin') {
      return res.status(400).json({ success: false, message: 'Cannot assign a device to an admin account' });
    }

    const previousUserId = devices[0].user_id;
    const [existingLinks] = await pool.query(
      'SELECT device_serial FROM device_registrations WHERE user_id = ? AND device_serial <> ?',
      [userId, deviceSerial]
    );

    await pool.query(
      `UPDATE device_registrations SET user_id = ?, status = 'linked', linked_at = NOW() WHERE device_serial = ?`,
      [userId, deviceSerial]
    );
    await pool.query(
      'UPDATE users SET device_serial_number = ? WHERE id = ?',
      [deviceSerial, userId]
    );
    if (previousUserId && previousUserId !== userId) {
      await pool.query(
        'UPDATE users SET device_serial_number = NULL WHERE id = ? AND device_serial_number = ?',
        [previousUserId, deviceSerial]
      );
    }

    for (const link of existingLinks) {
      await pool.query(
        `UPDATE device_registrations SET user_id = NULL, status = 'registered', linked_at = NULL WHERE device_serial = ?`,
        [link.device_serial]
      );
    }

    if (io) {
      io.emit('device-assigned', {
        device_serial: deviceSerial,
        user_id: userId,
        timestamp: new Date().toISOString()
      });
    }

    // Log admin notification and emit to admin/supervisor channels
    try {
      const notifMsg = `Device ${deviceSerial} assigned to ${users[0].full_name} (${users[0].email})`;
      await pool.query(
        'INSERT INTO notifications (recipient_role, type, message, data) VALUES (?, ?, ?, ?)',
        ['admin', 'device_assigned', notifMsg, JSON.stringify({ device_serial: deviceSerial, user_id: userId })]
      );
      if (io) io.emit('admin-notification', { type: 'device_assigned', message: notifMsg, data: { device_serial: deviceSerial, user_id: userId } });
      // Send email alert to admins
      sendAdminEmail(
        `Device Assigned: ${deviceSerial}`,
        notifMsg,
        `<p>${notifMsg}</p><p>Device serial: <strong>${deviceSerial}</strong></p><p>User: <strong>${users[0].full_name}</strong> (${users[0].email})</p>`
      );
      // Send copy to the farmer user
      try {
        if (users[0].email) {
          const tmpl = farmerAssignmentTemplate(deviceSerial, users[0].full_name);
          await sendWithRetry({
            from: process.env.SMTP_FROM || 'no-reply@example.com',
            to: users[0].email,
            subject: tmpl.subject,
            text: tmpl.text,
            html: tmpl.html
          });
          console.log('Notification email sent to farmer:', users[0].email);
        }
      } catch (mailErr) {
        console.error('Failed to send farmer email:', mailErr);
      }
    } catch (nerr) {
      console.error('Notification insert error:', nerr);
    }

    return res.json({
      success: true,
      message: 'Device assigned successfully',
      device: {
        device_serial: deviceSerial,
        user_id: userId,
        user_name: users[0].full_name,
        user_email: users[0].email
      }
    });
  } catch (error) {
    console.error('Admin assign error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Admin unassigns a serial from a user
router.post('/admin/unassign', authMiddleware, async (req, res) => {
  try {
    await ensureDeviceSchema();

    if (!isAdminLike(req.user?.role)) {

    }

    const deviceSerial = String(req.body?.device_serial || '').trim();
    if (!deviceSerial) {
      return res.status(400).json({ success: false, message: 'device_serial is required' });
    }

    const [devices] = await pool.query(
      'SELECT device_serial, user_id FROM device_registrations WHERE device_serial = ? LIMIT 1',
      [deviceSerial]
    );
    if (!devices.length) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    const oldUserId = devices[0].user_id;

    await pool.query(
      `UPDATE device_registrations SET user_id = NULL, status = 'registered', linked_at = NULL WHERE device_serial = ?`,
      [deviceSerial]
    );

    if (oldUserId) {
      await pool.query(
        'UPDATE users SET device_serial_number = NULL WHERE id = ? AND device_serial_number = ?',
        [oldUserId, deviceSerial]
      );
    }

    if (io) {
      io.emit('device-unassigned', {
        device_serial: deviceSerial,
        timestamp: new Date().toISOString()
      });
    }

    // Log admin notification and emit to admin/supervisor channels
    try {
      const notifMsg = `Device ${deviceSerial} unassigned`;
      await pool.query(
        'INSERT INTO notifications (recipient_role, type, message, data) VALUES (?, ?, ?, ?)',
        ['admin', 'device_unassigned', notifMsg, JSON.stringify({ device_serial: deviceSerial })]
      );
      if (io) io.emit('admin-notification', { type: 'device_unassigned', message: notifMsg, data: { device_serial: deviceSerial } });
      // Send email alert to admins
      sendAdminEmail(
        `Device Unassigned: ${deviceSerial}`,
        notifMsg,
        `<p>${notifMsg}</p><p>Device serial: <strong>${deviceSerial}</strong></p>`
      );
    } catch (nerr) {
      console.error('Notification insert error:', nerr);
    }

    return res.json({
      success: true,
      message: 'Device unassigned successfully',
      device_serial: deviceSerial
    });
  } catch (error) {
    console.error('Admin unassign error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Admin lists all devices
router.get('/admin/all', authMiddleware, async (req, res) => {
  try {
    await ensureDeviceSchema();

    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const [devices] = await pool.query(
      `SELECT 
        d.id, d.device_serial, d.esp32_chip_id, d.device_name, d.status,
        d.user_id,
        d.first_seen, d.last_seen, d.linked_at,
        u.full_name, u.email
       FROM device_registrations d
       LEFT JOIN users u ON d.user_id = u.id
       ORDER BY CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(d.device_serial, '-', 2), '-', -1) AS UNSIGNED) ASC`
    );

    return res.json({ success: true, devices });
  } catch (error) {
    console.error('Get all devices error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Admin lists devices without a user
router.get('/admin/unassigned', authMiddleware, async (req, res) => {
  try {
    await ensureDeviceSchema();

    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const [devices] = await pool.query(
      `SELECT id, device_serial, esp32_chip_id, device_name, status, first_seen, last_seen, created_at
       FROM device_registrations
       WHERE user_id IS NULL
       ORDER BY CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(device_serial, '-', 2), '-', -1) AS UNSIGNED) ASC, created_at ASC`
    );

    return res.json({ success: true, devices });
  } catch (error) {
    console.error('Get unassigned devices error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Logged-in user's assigned device
router.get('/my-device', authMiddleware, async (req, res) => {
  try {
    await ensureDeviceSchema();

    const userId = req.user?.uid || req.user?.id;
    const [devices] = await pool.query(
      `SELECT id, device_serial, esp32_chip_id, device_mac_address, device_name, firmware_version, status, first_seen, last_seen, linked_at
       FROM device_registrations
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    );

    if (!devices.length) {
      return res.json({ success: true, device: null, message: 'No device linked to this account yet' });
    }

    return res.json({
      success: true,
      device: {
        id: devices[0].id,
        deviceSerial: devices[0].device_serial,
        chipId: devices[0].esp32_chip_id,
        macAddress: devices[0].device_mac_address,
        deviceName: devices[0].device_name,
        firmwareVersion: devices[0].firmware_version,
        status: devices[0].status,
        firstSeen: devices[0].first_seen,
        lastSeen: devices[0].last_seen,
        linkedAt: devices[0].linked_at
      }
    });
  } catch (error) {
    console.error('Get my device error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ESP32 heartbeat/status
router.post('/status', async (req, res) => {
  try {
    await ensureDeviceSchema();

    const deviceSerial = String(req.headers['x-device-serial'] || '').trim();
    const apiKey = String(req.headers['x-api-key'] || '').trim();

    if (!deviceSerial || !apiKey) {
      return res.status(400).json({ success: false, message: 'Missing x-device-serial or x-api-key headers' });
    }

    const [devices] = await pool.query(
      `SELECT dr.user_id, u.id AS linked_user_exists, u.status AS user_status
       FROM device_registrations dr
       LEFT JOIN users u ON dr.user_id = u.id
       WHERE dr.device_serial = ? AND dr.api_key = ?
       LIMIT 1`,
      [deviceSerial, apiKey]
    );

    if (!devices.length) {
      return res.status(404).json({ success: false, message: 'Device registration not found' });
    }

    const device = devices[0];
    if (!device.user_id || !device.linked_user_exists) {
      // Device is known but not yet linked to a farmer account.
      return res.json({
        success: true,
        message: 'Device not linked to any account',
        deviceBlocked: false,
        registration_status: 'UNLINKED'
      });
    }

    try {
      await syncUserDeviceSerial(deviceSerial, device.user_id);
    } catch (syncError) {
      console.warn('Failed to sync user device serial on status update:', syncError.message || syncError);
    }

    if (String(device.user_status || 'active').toLowerCase() !== 'active') {
      try {
        const [userRows] = await pool.query(
          'SELECT full_name, email FROM users WHERE id = ? LIMIT 1',
          [device.user_id]
        );
        await maybeSendLockNotification(deviceSerial, device.user_id, userRows?.[0]);
      } catch (notifyErr) {
        console.error('Lock notification lookup failed:', notifyErr);
      }

      return res.status(403).json({ success: false, message: 'Account inactive - device locked', deviceBlocked: true });
    }

    await pool.query(
      `UPDATE device_registrations SET status = 'active', last_seen = NOW() WHERE device_serial = ?`,
      [deviceSerial]
    );

    return res.json({ success: true, message: 'Status updated' });
  } catch (error) {
    console.error('Device status error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ESP32 registration status check - determines if device should use EEPROM or safe mode
// If status is UNREGISTERED → ignore EEPROM, enter safe mode
// If status is ACTIVE → proceed normally (EEPROM values are valid)
router.post('/check-status', async (req, res) => {
  try {
    await ensureDeviceSchema();

    const deviceSerial = String(req.headers['x-device-serial'] || req.body?.device_serial || '').trim();
    const apiKey = String(req.headers['x-api-key'] || req.body?.api_key || '').trim();

    if (!deviceSerial || !apiKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing x-device-serial or x-api-key headers' 
      });
    }

    const [devices] = await pool.query(
      `SELECT dr.id, dr.device_serial, dr.status, dr.user_id, dr.linked_at,
              u.id AS linked_user_exists, u.status AS user_status
       FROM device_registrations dr
       LEFT JOIN users u ON dr.user_id = u.id
       WHERE dr.device_serial = ? AND dr.api_key = ?
       LIMIT 1`,
      [deviceSerial, apiKey]
    );

    if (!devices.length) {
      // Device registration missing or deleted. Force firmware to reprovision.
      return res.status(404).json({ 
        success: false, 
        message: 'Device registration not found',
        registration_status: 'UNREGISTERED',
        use_eeprom: false
      });
    }

    const device = devices[0];
    const regStatus = String(device.status || '').toLowerCase();
    const hasRealUser = Boolean(device.user_id && device.linked_user_exists);
    const isUserActive = String(device.user_status || 'inactive').toLowerCase() === 'active';

    // Determine effective registration status
    let effectiveStatus;
    let useEeprom;

    if (!hasRealUser || regStatus === 'unregistered') {
      // Device not yet linked to a valid user account
      effectiveStatus = 'UNREGISTERED';
      useEeprom = false; // Ignore EEPROM, enter safe mode
    } else if (isUserActive && ['linked', 'active', 'registered'].includes(regStatus)) {
      // Device is fully registered and user account is active
      effectiveStatus = 'ACTIVE';
      useEeprom = true; // Use EEPROM values normally
    } else {
      // Device is linked but user is inactive or invalid
      effectiveStatus = 'INACTIVE';
      useEeprom = false; // Treat as unregistered for safety
    }

    return res.json({
      success: true,
      registration_status: effectiveStatus,
      use_eeprom: useEeprom,
      device_serial: deviceSerial,
      linked_at: device.linked_at,
      user_id: hasRealUser ? device.user_id : null,
      message: effectiveStatus === 'ACTIVE' 
        ? 'Device is active and registered - EEPROM values are valid'
        : 'Device is not fully registered - enter safe mode and ignore EEPROM'
    });
  } catch (error) {
    console.error('Device check-status error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message,
      registration_status: 'UNREGISTERED',
      use_eeprom: false
    });
  }
});

// User device link endpoint for manual pairing
router.post('/link', authMiddleware, async (req, res) => {
  try {
    await ensureDeviceSchema();

    const deviceSerial = String(req.body?.deviceSerial || req.body?.device_serial || '').trim();
    const apiKey = String(req.body?.apiKey || req.body?.api_key || '').trim();
    const userId = req.user?.uid || req.user?.id;

    if (!deviceSerial || !apiKey) {
      return res.status(400).json({ success: false, message: 'Missing deviceSerial or apiKey' });
    }

    const [devices] = await pool.query(
      'SELECT device_serial, user_id FROM device_registrations WHERE device_serial = ? AND api_key = ? LIMIT 1',
      [deviceSerial, apiKey]
    );

    if (!devices.length) {
      return res.status(403).json({ success: false, message: 'Invalid deviceSerial or apiKey' });
    }

    await pool.query(
      `UPDATE device_registrations SET user_id = ?, status = 'linked', linked_at = NOW() WHERE device_serial = ?`,
      [userId, deviceSerial]
    );
    await pool.query(
      'UPDATE users SET device_serial_number = ? WHERE id = ? AND device_serial_number IS NULL',
      [deviceSerial, userId]
    );

    const [existingLinks] = await pool.query(
      'SELECT device_serial FROM device_registrations WHERE user_id = ? AND device_serial <> ?',
      [userId, deviceSerial]
    );

    for (const link of existingLinks) {
      await pool.query(
        `UPDATE device_registrations SET user_id = NULL, status = 'registered', linked_at = NULL WHERE device_serial = ?`,
        [link.device_serial]
      );
    }

    return res.json({ success: true, message: 'Device linked to account successfully' });
  } catch (error) {
    console.error('Device link error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/admin/repair', authMiddleware, repairDeviceRegistration);

// ===================== BROODING CONTROL ENDPOINTS =====================

// ESP32 restores brooding start time from its most recent telemetry state
router.get('/brooding/restore', deviceAuthMiddleware, async (req, res) => {
  try {
    const deviceSerial = req.authorizedDeviceSerial;
    const [telemetry] = await pool.query(
      'SELECT data FROM sensor_data WHERE device_id = (SELECT id FROM device_registrations WHERE device_serial = ?) ORDER BY timestamp DESC LIMIT 1',
      [deviceSerial]
    );

    let broodingData = null;
    if (telemetry.length && telemetry[0].data) {
      try {
        const data = JSON.parse(telemetry[0].data);
        if (data.brooding) {
          broodingData = data.brooding;
        }
      } catch (e) {
        console.error('Brooding restore JSON parse failed:', e);
      }
    }

    if (!broodingData) {
      return res.status(404).json({ success: false, message: 'No brooding telemetry found' });
    }

    return res.json({ success: true, brooding: broodingData });
  } catch (error) {
    console.error('Brooding restore error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Dashboard: Get brooding status for a device
router.get('/brooding/:deviceSerial', authMiddleware, async (req, res) => {
  try {
    const { deviceSerial } = req.params;
    const userId = req.user?.uid || req.user?.id;

    if (!deviceSerial) {
      return res.status(400).json({ success: false, message: 'deviceSerial is required' });
    }

    // Verify user owns this device
    const [devices] = await pool.query(
      'SELECT user_id FROM device_registrations WHERE device_serial = ? LIMIT 1',
      [deviceSerial]
    );

    if (!devices.length) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    if (devices[0].user_id !== userId && req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Return brooding state (from device telemetry)
    const [telemetry] = await pool.query(
      'SELECT data FROM sensor_data WHERE device_id = (SELECT id FROM device_registrations WHERE device_serial = ?) ORDER BY timestamp DESC LIMIT 1',
      [deviceSerial]
    );

    let broodingData = {
      active: false,
      age_days: 0,
      week: 0,
      temp_range_c: '--',
      required_light_hours: 0,
      heater_duty_secs: 0,
      status: 'WAITING'
    };

    if (telemetry.length && telemetry[0].data) {
      try {
        const data = JSON.parse(telemetry[0].data);
        if (data.brooding) {
          broodingData = data.brooding;
        }
      } catch (e) {}
    }

    return res.json({ success: true, brooding: broodingData });
  } catch (error) {
    console.error('Brooding status error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Dashboard: Send brooding command to device
router.post('/brooding/:deviceSerial/command', authMiddleware, async (req, res) => {
  try {
    const { deviceSerial } = req.params;
    const { command } = req.body;  // 'start', 'stop', 'reset'
    const userId = req.user?.uid || req.user?.id;

    if (!deviceSerial || !command) {
      return res.status(400).json({ success: false, message: 'deviceSerial and command are required' });
    }

    if (!['start', 'stop', 'reset'].includes(command)) {
      return res.status(400).json({ success: false, message: 'Invalid command. Use: start, stop, or reset' });
    }

    // Verify user owns this device
    const [devices] = await pool.query(
      'SELECT id, user_id FROM device_registrations WHERE device_serial = ? LIMIT 1',
      [deviceSerial]
    );

    if (!devices.length) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    if (devices[0].user_id !== userId && req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const device = devices[0];
    if (!device.id) {
      return res.status(500).json({ success: false, message: 'Device registration is missing an id' });
    }

    await pool.query(
      `INSERT INTO device_commands (device_id, command, relay, state, requested_by, created_at)
       VALUES (?, ?, NULL, NULL, ?, NOW())`,
      [device.id, command, req.user?.uid || req.user?.id || 'system']
    );

    console.log(`[BROODING] Command '${command}' queued for device ${deviceSerial}`);

    return res.json({ 
      success: true, 
      message: `Brooding ${command} command sent to device`,
      command,
      deviceSerial
    });
  } catch (error) {
    console.error('Brooding command error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ESP32 Polls for pending brooding commands
router.post('/brooding/status', async (req, res) => {
  try {
    const { device_serial } = req.body;

    console.log(`[BROODING] Status poll received from device serial: ${device_serial}`);

    if (!device_serial) {
      return res.status(400).json({ success: false, message: 'device_serial is required' });
    }

    const [devices] = await pool.query(
      'SELECT id FROM device_registrations WHERE device_serial = ? LIMIT 1',
      [device_serial]
    );

    if (!devices.length) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    const deviceId = devices[0].id;
    const unexecutedValue = 0;
    const executedValue = 1;

    const [commands] = await pool.query(
      `SELECT id, command FROM device_commands
       WHERE device_id = ? AND executed = ?
       ORDER BY created_at ASC
       LIMIT 1`,
      [deviceId, unexecutedValue]
    );

    if (commands.length === 0) {
      console.log(`[BROODING] No pending command for device serial: ${device_serial}`);
      return res.json({ success: true, command: null });
    }

    const pendingCommand = commands[0];
    await pool.query(
      `UPDATE device_commands
       SET executed = ?, executed_at = NOW()
       WHERE id = ?`,
      [executedValue, pendingCommand.id]
    );

    console.log(`[BROODING] Returning command '${pendingCommand.command}' for device serial: ${device_serial}`);
    return res.json({ success: true, command: pendingCommand.command });
  } catch (error) {
    console.error('Brooding status poll error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
