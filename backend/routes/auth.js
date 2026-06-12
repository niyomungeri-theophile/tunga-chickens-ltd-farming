const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const LOCK_MESSAGE = 'Hello your system was locked. Contact admin for support 0755233511, Eng TheophileNIYOMWUNGERI';

let usersStatusSchemaReady = false;
let authSessionsSchemaReady = false;

async function ensureUsersStatusSchema() {
  if (usersStatusSchemaReady) return;
  try {
    await pool.query("ALTER TABLE users ADD COLUMN status ENUM('active','inactive') NOT NULL DEFAULT 'active'");
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') throw error;
  }

  const profileAlterStatements = [
    'ALTER TABLE users ADD COLUMN contact VARCHAR(100) NULL',
    'ALTER TABLE users ADD COLUMN farm_size VARCHAR(100) NULL',
    'ALTER TABLE users ADD COLUMN farm_location VARCHAR(255) NULL',
    'ALTER TABLE users ADD COLUMN device_serial_number VARCHAR(100) NULL',
    'ALTER TABLE users ADD COLUMN can_sell TINYINT(1) NOT NULL DEFAULT 0',
    'ALTER TABLE users ADD COLUMN seller_otp VARCHAR(20) NULL',
    'ALTER TABLE users ADD COLUMN seller_otp_expires_at TIMESTAMP NULL',
    'ALTER TABLE users ADD COLUMN seller_paid_until TIMESTAMP NULL'
  ];

  for (const statement of profileAlterStatements) {
    try {
      await pool.query(statement);
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }

  await pool.query(`
    UPDATE users
    SET seller_otp_expires_at = DATE_ADD(created_at, INTERVAL 30 DAY),
        seller_paid_until = DATE_ADD(created_at, INTERVAL 30 DAY)
    WHERE role = 'customer'
      AND can_sell = 1
      AND seller_otp_expires_at IS NULL
  `);

  // Speed up serialNumber -> user lookup (used by ESP32 update-by-serial).
  // Note: we avoid UNIQUE here to not break existing DBs with duplicates.
  if (pool.isPostgres) {
    await pool.query('CREATE INDEX IF NOT EXISTS idx_users_device_serial_number ON users(device_serial_number)');
  } else {
    await pool.query('CREATE INDEX idx_users_device_serial_number ON users(device_serial_number)');
  }

  usersStatusSchemaReady = true;
}

function isAdminLike(role) {
  return ['admin', 'supervisor'].includes(String(role || '').toLowerCase());
}

function generateApiKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 48; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

// Returns the next available serial: reuses freed slots (from deleted farmers) before
// generating a new number, ensuring ascending order without gaps.
async function reserveNextDeviceSerial() {
  try {
    const [freed] = await pool.query(`
      SELECT device_serial FROM device_registrations
      WHERE user_id IS NULL
        AND (esp32_chip_id IS NULL OR esp32_chip_id = '')
        AND status = 'unregistered'
        AND device_serial REGEXP '^NT-[0-9]+-TCL$'
      ORDER BY CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(device_serial, '-', 2), '-', -1) AS UNSIGNED) ASC
      LIMIT 1
    `);
    if (freed.length > 0) return freed[0].device_serial;
  } catch (_) { /* device_registrations table not yet created, fall through */ }

  const [rows] = await pool.query(`
    SELECT GREATEST(
      COALESCE((SELECT MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(device_serial_number,'-',2),'-',-1) AS UNSIGNED))
                FROM users WHERE device_serial_number REGEXP '^NT-[0-9]+-TCL$'), 0),
      COALESCE((SELECT MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(device_serial,'-',2),'-',-1) AS UNSIGNED))
                FROM device_registrations WHERE device_serial REGEXP '^NT-[0-9]+-TCL$'), 0)
    ) AS max_serial
  `);
  const currentMax = Number(rows?.[0]?.max_serial);
  const nextSeq = (Number.isFinite(currentMax) && currentMax > 0) ? currentMax + 1 : 1;
  return `NT-${String(nextSeq).padStart(2, '0')}-TCL`;
}

async function ensureAuthSessionsSchema() {
  if (authSessionsSchemaReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      role VARCHAR(30) NULL,
      login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      logout_at TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_auth_sessions_user_id (user_id),
      INDEX idx_auth_sessions_logout_at (logout_at),
      INDEX idx_auth_sessions_role (role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  authSessionsSchemaReady = true;
}

// Middleware to verify JWT token
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    await ensureUsersStatusSchema();
    const [rows] = await pool.query(
    'SELECT role, status, can_sell, seller_paid_until FROM users WHERE id = ? LIMIT 1',
      [decoded.uid]
    );
    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    const status = String(rows[0].status || 'active').toLowerCase();
    if (status !== 'active') {
      return res.status(403).json({ success: false, message: LOCK_MESSAGE });
    }

    const canSell = Number(rows[0].can_sell || 0) === 1;
    const paidUntil = rows[0].seller_paid_until ? new Date(rows[0].seller_paid_until) : null;
    if (canSell && paidUntil && paidUntil.getTime() < Date.now()) {
      return res.status(403).json({ success: false, message: 'Seller subscription expired. Please pay again.' });
    }

    req.user = { ...decoded, role: String(rows[0].role || decoded.role || '').toLowerCase(), status };
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// Register a new user
router.post('/register', authMiddleware, async (req, res) => {
  try {
    await ensureUsersStatusSchema();
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Only admin/supervisor can create accounts.' });
    }

    const { email, password, fullName, role, photoURL, contact, farmSize, farmLocation } = req.body;
    const normalizedRole = String(role || 'farmer').toLowerCase();

    if (!['farmer', 'admin', 'supervisor', 'customer'].includes(normalizedRole)) {
      return res.status(400).json({ success: false, message: 'Invalid role.' });
    }

    if (normalizedRole === 'supervisor') {
      const requesterRole = String(req.user?.role || '').toLowerCase();
      if (!['admin', 'supervisor'].includes(requesterRole)) {
        return res.status(403).json({ success: false, message: 'Only admin/supervisor can assign supervisor role.' });
      }
      const [supervisors] = await pool.query('SELECT COUNT(*) AS total FROM users WHERE role = ? LIMIT 1', ['supervisor']);
      if (Number(supervisors?.[0]?.total || 0) > 0) {
        return res.status(400).json({ success: false, message: 'Only one supervisor account is allowed.' });
      }
    }

    if (!fullName || !contact || !email || !password) {
      return res.status(400).json({ success: false, message: 'Missing required account information.' });
    }

    if (normalizedRole === 'farmer' && (!farmSize || !farmLocation)) {
      return res.status(400).json({ success: false, message: 'Farmer account requires farm size and farm location.' });
    }
    
    // Check if user already exists
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'This email is already registered.' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Generate UUID
    const [uuidResult] = await pool.query('SELECT UUID() as uuid');
    const id = uuidResult[0].uuid;
    
    // Reserve the serial slot in device_registrations BEFORE inserting the user,
    // so the ESP32 can find and claim it via /request-serial on first boot.
    let generatedDeviceSerialNumber = null;
    if (normalizedRole === 'farmer') {
      generatedDeviceSerialNumber = await reserveNextDeviceSerial();
      const apiKey = generateApiKey();
      try {
        // INSERT or re-confirm a freed slot (ON DUPLICATE handles reused serials)
        await pool.query(
          `INSERT INTO device_registrations (device_serial, esp32_chip_id, user_id, api_key, status)
           VALUES (?, NULL, NULL, ?, 'unregistered')
           ON DUPLICATE KEY UPDATE esp32_chip_id = NULL, user_id = NULL, api_key = VALUES(api_key), status = 'unregistered'`,
          [generatedDeviceSerialNumber, apiKey]
        );
        await pool.query(
          'INSERT IGNORE INTO device_credentials (device_serial, api_key) VALUES (?, ?)',
          [generatedDeviceSerialNumber, apiKey]
        );
      } catch (deviceErr) {
        console.warn('Pre-reserve device serial slot failed:', deviceErr.message);
      }
    }

    // Insert user
    await pool.query(
      'INSERT INTO users (id, full_name, email, password, role, status, photo_url, contact, farm_size, farm_location, device_serial_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        fullName,
        email,
        hashedPassword,
        normalizedRole,
        'active',
        photoURL || null,
        contact,
        normalizedRole === 'farmer' ? farmSize : null,
        normalizedRole === 'farmer' ? farmLocation : null,
        generatedDeviceSerialNumber
      ]
    );

    res.json({
      success: true,
      message: 'User registered successfully',
      deviceSerialNumber: generatedDeviceSerialNumber
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
  }
});

// Public customer registration
router.post('/register-customer', async (req, res) => {
  try {
    await ensureUsersStatusSchema();
    const { email, password, fullName, contact } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!fullName || !contact || !normalizedEmail || !password) {
      return res.status(400).json({ success: false, message: 'Missing required account information.' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'This email is already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [uuidResult] = await pool.query('SELECT UUID() as uuid');
    const id = uuidResult[0].uuid;

    await pool.query(
      'INSERT INTO users (id, full_name, email, password, role, status, photo_url, contact, farm_size, farm_location, device_serial_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        fullName,
        normalizedEmail,
        hashedPassword,
        'customer',
        'active',
        null,
        contact,
        null,
        null,
        null
      ]
    );

    res.json({ success: true, message: 'Customer account created successfully' });
  } catch (error) {
    console.error('Customer registration error:', error);
    res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    await ensureUsersStatusSchema();
    await ensureAuthSessionsSchema();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const otpCandidate = password.trim();

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }
    
    // Find user
    const [users] = await pool.query('SELECT * FROM users WHERE LOWER(TRIM(email)) = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    
    const user = users[0];

    if (String(user.status || 'active').toLowerCase() !== 'active') {
      return res.status(403).json({
        success: false,
        message: LOCK_MESSAGE
      });
    }

    const canSell = Number(user.can_sell || 0) === 1;
    if (canSell && user.seller_paid_until) {
      const paidUntil = new Date(user.seller_paid_until);
      if (paidUntil.getTime() < Date.now()) {
        return res.status(403).json({ success: false, message: 'Seller subscription expired. Please pay on 0785133511 or momopay code: 511358 to be reactivated' });
      }
    }
    
    const role = String(user.role || '').toLowerCase();
    const otp = String(user.seller_otp || '');
    const otpExpiresAt = user.seller_otp_expires_at ? new Date(user.seller_otp_expires_at) : null;
    const canUseOtp = role === 'customer' || canSell;
    const otpMatches = otp && otpCandidate === otp;
    if (otpMatches && canUseOtp) {
      if (!otpExpiresAt) {
        return res.status(403).json({ success: false, message: 'OTP expired. Please request a new OTP.' });
      }
      if (otpExpiresAt.getTime() < Date.now()) {
        return res.status(403).json({ success: false, message: 'OTP expired. Please request a new OTP.' });
      }
    }

    let isValidPassword = false;
    if (!(canUseOtp && otpMatches)) {
      isValidPassword = await bcrypt.compare(password, user.password);
    } else {
      isValidPassword = true;
    }

    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: 'Invalid email, password, or OTP.' });
    }
    
    const [sidResult] = await pool.query('SELECT UUID() as uuid');
    const sid = sidResult[0].uuid;

    await pool.query(
      'INSERT INTO auth_sessions (id, user_id, role) VALUES (?, ?, ?)',
      [sid, user.id, user.role]
    );

    // Generate JWT token
    const token = jwt.sign(
      { uid: user.id, email: user.email, role: user.role, sid },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    res.json({
      success: true,
      token,
      user: {
        uid: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        photoURL: user.photo_url,
        status: user.status || 'active',
        contact: user.contact,
        farmSize: user.farm_size,
        farmLocation: user.farm_location,
        deviceSerialNumber: user.device_serial_number,
        canSell: Boolean(user.can_sell),
        sellerPaidUntil: user.seller_paid_until || null,
        sellerOtp: user.seller_otp || null,
        sellerOtpExpiresAt: user.seller_otp_expires_at || null
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
  }
});

// Logout (mark session as ended)
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    await ensureAuthSessionsSchema();
    const sessionId = req.user?.sid;

    if (sessionId) {
      await pool.query(
        'UPDATE auth_sessions SET logout_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND logout_at IS NULL',
        [sessionId, req.user.uid]
      );
    }

    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
  }
});

// Verify admin password for sensitive access (e.g., farmer dashboards)
router.post('/verify-admin-password', authMiddleware, async (req, res) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const password = String(req.body?.password || '');
    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required.' });
    }

    const [users] = await pool.query('SELECT password FROM users WHERE id = ? LIMIT 1', [req.user.uid]);
    if (!users.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const isValid = await bcrypt.compare(password, users[0].password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid admin password.' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Verify admin password error:', error);
    return res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
  }
});

// Daily session statistics for reporting
router.get('/session-stats', authMiddleware, async (req, res) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await ensureAuthSessionsSchema();

    const [[todayStats]] = await pool.query(
      `SELECT
        SUM(CASE WHEN DATE(login_at) = CURDATE() THEN 1 ELSE 0 END) AS today_logins,
        SUM(CASE WHEN logout_at IS NOT NULL AND DATE(logout_at) = CURDATE() THEN 1 ELSE 0 END) AS today_logouts,
        SUM(CASE WHEN logout_at IS NULL AND DATE(login_at) = CURDATE() THEN 1 ELSE 0 END) AS currently_logged_in
      FROM auth_sessions`
    );

    res.json({
      success: true,
      todayLogins: Number(todayStats?.today_logins || 0),
      todayLogouts: Number(todayStats?.today_logouts || 0),
      currentlyLoggedIn: Number(todayStats?.currently_logged_in || 0)
    });
  } catch (error) {
    console.error('Session stats error:', error);
    res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    await ensureUsersStatusSchema();
    const [users] = await pool.query(
      'SELECT id, full_name, email, role, photo_url, status, contact, farm_size, farm_location, device_serial_number, can_sell, seller_paid_until, created_at FROM users WHERE id = ?',
      [req.user.uid]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const user = users[0];
    res.json({
      success: true,
      user: {
        uid: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        photoURL: user.photo_url,
        status: user.status || 'active',
        contact: user.contact,
        farmSize: user.farm_size,
        farmLocation: user.farm_location,
        deviceSerialNumber: user.device_serial_number,
        canSell: Boolean(user.can_sell),
        sellerPaidUntil: user.seller_paid_until || null,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
  }
});

// Verify token (for auth state checking)
router.get('/verify', authMiddleware, (req, res) => {
  res.json({ success: true, user: req.user });
});

// Change user password
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All password fields are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'New passwords do not match.' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, message: 'New password must be different from current password.' });
    }

    const [users] = await pool.query('SELECT password FROM users WHERE id = ?', [req.user.uid]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const isValid = await bcrypt.compare(currentPassword, users[0].password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.uid]);

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
  }
});

module.exports = { router, authMiddleware };
