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
  
  const alterations = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'",
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS contact VARCHAR(100) NULL',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS farm_size VARCHAR(100) NULL',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS farm_location VARCHAR(255) NULL',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS device_serial_number VARCHAR(100) NULL',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS can_sell SMALLINT NOT NULL DEFAULT 0',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_otp VARCHAR(20) NULL',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_otp_expires_at TIMESTAMP NULL',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_paid_until TIMESTAMP NULL',
  ];

  // Try each ALTER individually - continue even if one fails
  for (const sql of alterations) {
    try {
      await pool.query(sql);
    } catch (err) {
      // Column already exists with different type or other issue - safe to ignore
      console.log(`Skipping ALTER: ${err.message}`);
    }
  }

  // Update seller expiry dates if needed
  try {
    await pool.query(`
      UPDATE users
      SET seller_otp_expires_at = created_at + INTERVAL '30 days',
          seller_paid_until = created_at + INTERVAL '30 days'
      WHERE role = 'customer' AND can_sell = 1 AND seller_otp_expires_at IS NULL
    `);
  } catch (err) {
    console.log('Could not update seller expiry dates:', err.message);
  }

  // Create index
  try {
    await pool.query('CREATE INDEX IF NOT EXISTS idx_users_device_serial_number ON users(device_serial_number)');
  } catch (err) {
    console.log('Could not create index:', err.message);
  }

  usersStatusSchemaReady = true;
}

function isAdminLike(role) {
  return ['admin', 'supervisor'].includes(String(role || '').toLowerCase());
}

function formatDeviceSerialNumber(sequence) {
  return `NT-${String(sequence).padStart(2, '0')}-TCL`;
}

async function generateNextDeviceSerialNumber() {
  const { rows } = await pool.query(`
    SELECT MAX(
      CAST(
        split_part(device_serial_number, '-', 2)
        AS INTEGER
      )
    ) AS max_serial
    FROM users
    WHERE device_serial_number ~ '^NT-[0-9]+-TCL$'
  `);

  const currentMax = Number(rows[0]?.max_serial || 0);
  const nextSequence = Number.isFinite(currentMax) ? currentMax + 1 : 1;
  return formatDeviceSerialNumber(nextSequence);
}

async function ensureAuthSessionsSchema() {
  if (authSessionsSchemaReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      role VARCHAR(30) NULL,
      login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      logout_at TIMESTAMP NULL DEFAULT NULL
    )
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_auth_sessions_logout_at ON auth_sessions(logout_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_auth_sessions_role ON auth_sessions(role)');

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
    const { rows } = await pool.query('SELECT role, status, can_sell, seller_paid_until FROM users WHERE id = $1 LIMIT 1', [decoded.uid]);
    
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
      const { rows: supervisors } = await pool.query('SELECT COUNT(*) AS total FROM users WHERE role = $1 LIMIT 1', ['supervisor']);
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
    const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'This email is already registered.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate UUID
    const { rows: uuidResult } = await pool.query('SELECT gen_random_uuid() as uuid');
    const id = uuidResult[0].uuid;

    const generatedDeviceSerialNumber = normalizedRole === 'farmer'
      ? await generateNextDeviceSerialNumber()
      : null;

    // Insert user
    await pool.query(`INSERT INTO users (id, full_name, email, password, role, status, photo_url, contact, farm_size, farm_location, device_serial_number) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [
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
    ]);

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

    const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'This email is already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const { rows: uuidResult } = await pool.query('SELECT gen_random_uuid() as uuid');
    const id = uuidResult[0].uuid;

    await pool.query(`INSERT INTO users (id, full_name, email, password, role, status, photo_url, contact, farm_size, farm_location, device_serial_number) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [
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
    ]);

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
    const { rows: users } = await pool.query('SELECT * FROM users WHERE LOWER(TRIM(email)) = $1', [email]);
    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = users[0];

    if (String(user.status || 'active').toLowerCase() !== 'active') {
      return res.status(403).json({ success: false, message: LOCK_MESSAGE });
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

    const { rows: sidResult } = await pool.query('SELECT gen_random_uuid() as uuid');
    const sid = sidResult[0].uuid;

    await pool.query('INSERT INTO auth_sessions (id, user_id, role) VALUES ($1, $2, $3)', [sid, user.id, user.role]);

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
      await pool.query('UPDATE auth_sessions SET logout_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 AND logout_at IS NULL', [sessionId, req.user.uid]);
    }

    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
  }
});

// Verify admin password for sensitive access
router.post('/verify-admin-password', authMiddleware, async (req, res) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const password = String(req.body?.password || '');
    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required.' });
    }

    const { rows: users } = await pool.query('SELECT password FROM users WHERE id = $1 LIMIT 1', [req.user.uid]);
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

    const { rows } = await pool.query(`
      SELECT
        SUM(CASE WHEN DATE(login_at) = CURRENT_DATE THEN 1 ELSE 0 END) AS today_logins,
        SUM(CASE WHEN logout_at IS NOT NULL AND DATE(logout_at) = CURRENT_DATE THEN 1 ELSE 0 END) AS today_logouts,
        SUM(CASE WHEN logout_at IS NULL AND DATE(login_at) = CURRENT_DATE THEN 1 ELSE 0 END) AS currently_logged_in
      FROM auth_sessions
    `);
    const todayStats = rows[0];

    res.json({
      success: true,
      todayLogins: Number(todayStats.today_logins || 0),
      todayLogouts: Number(todayStats.today_logouts || 0),
      currentlyLoggedIn: Number(todayStats.currently_logged_in || 0)
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
    const { rows: users } = await pool.query(`SELECT id, full_name, email, role, photo_url, status, contact, farm_size, 
      farm_location, device_serial_number, can_sell, seller_paid_until, created_at 
      FROM users WHERE id = $1`, [req.user.uid]);

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

    const { rows: users } = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.uid]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const isValid = await bcrypt.compare(currentPassword, users[0].password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, req.user.uid]);

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
  }
});

module.exports = { router, authMiddleware };