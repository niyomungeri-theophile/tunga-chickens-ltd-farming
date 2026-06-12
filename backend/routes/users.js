const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { authMiddleware } = require('./auth');

let usersStatusSchemaReady = false;

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

  usersStatusSchemaReady = true;
}

function isAdminLike(role) {
  return ['admin', 'supervisor'].includes(String(role || '').toLowerCase());
}

function canManageUser(requesterRole, targetRole) {
  const requester = String(requesterRole || '').toLowerCase();
  const target = String(targetRole || '').toLowerCase();

  if (requester === 'supervisor') {
    return true;
  }

  if (requester === 'admin') {
    return target !== 'supervisor';
  }

  return false;
}

function buildEmailTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

function formatMailDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function sendAccountLockedEmail({ email, fullName, lockedAt, role }) {
  const transporter = buildEmailTransporter();
  if (!transporter) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.');
  }

  await transporter.verify();

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'Eco-Smart <no-reply@eco-smart.local>';
  const subject = 'Eco-Smart Account Locked';
  const greetingName = fullName || 'User';
  const lockedDate = formatMailDate(lockedAt) || new Date().toLocaleString('en-GB');
  const websiteUrl = 'http://localhost:5173/';
  const contactPhones = '+250785133511 / 0787853990';
  const roleLabel = role ? String(role).toUpperCase() : 'ACCOUNT';

  const text = [
    `Hello ${greetingName},`,
    '',
    `Your ${roleLabel.toLowerCase()} account has been locked because the status was changed to inactive.`,
    `Locked at: ${lockedDate}`,
    'Your device and account access are no longer available until the account is reactivated.',
    `Contact: ${contactPhones}`,
    `Website: ${websiteUrl}`,
    '',
    'Thank you,',
    'Eco-Smart Poultry Care Team'
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <p>Hello ${greetingName},</p>
      <p>Your ${roleLabel.toLowerCase()} account has been locked because the status was changed to inactive.</p>
      <p><strong>Locked at:</strong> ${lockedDate}</p>
      <p>Your device and account access are no longer available until the account is reactivated.</p>
      <p><strong>Contact:</strong> ${contactPhones}</p>
      <p><strong>Website:</strong> <a href="${websiteUrl}">${websiteUrl}</a></p>
      <p>Thank you,<br>Eco-Smart Poultry Care Team</p>
    </div>
  `;

  return transporter.sendMail({
    from,
    to: email,
    subject,
    text,
    html
  });
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

// Get all users
router.get('/', authMiddleware, async (req, res) => {
  try {
    await ensureUsersStatusSchema();
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Only admin/supervisor can list all users' });
    }

    const [users] = await pool.query(
      'SELECT id, full_name, email, role, status, photo_url, contact, farm_size, farm_location, device_serial_number, can_sell, seller_otp, seller_otp_expires_at, seller_paid_until, created_at FROM users ORDER BY created_at DESC'
    );
    
    const formattedUsers = users.reduce((acc, user) => {
      acc[user.id] = {
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        status: user.status || 'active',
        photoURL: user.photo_url,
        contact: user.contact,
        farmSize: user.farm_size,
        farmLocation: user.farm_location,
        deviceSerialNumber: user.device_serial_number,
        canSell: Boolean(user.can_sell),
        sellerOtp: user.seller_otp || null,
        sellerOtpExpiresAt: user.seller_otp_expires_at || null,
        sellerPaidUntil: user.seller_paid_until || null,
        createdAt: user.created_at
      };
      return acc;
    }, {});
    
    res.json(formattedUsers);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

// Get user by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    await ensureUsersStatusSchema();
    const isAdmin = isAdminLike(req.user?.role);
    if (!isAdmin && req.params.id !== req.user?.uid) {
      return res.status(403).json({ success: false, message: 'You can only access your own profile' });
    }

    const [users] = await pool.query(
      'SELECT id, full_name, email, role, status, photo_url, contact, farm_size, farm_location, device_serial_number, can_sell, seller_otp, seller_otp_expires_at, seller_paid_until, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const user = users[0];
    const canViewSensitive = isAdmin;
    res.json({
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      status: user.status || 'active',
      photoURL: user.photo_url,
      contact: user.contact,
      farmSize: user.farm_size,
      farmLocation: user.farm_location,
      deviceSerialNumber: user.device_serial_number,
      canSell: Boolean(user.can_sell),
      sellerOtp: canViewSensitive ? (user.seller_otp || null) : null,
      sellerOtpExpiresAt: canViewSensitive ? (user.seller_otp_expires_at || null) : null,
      sellerPaidUntil: user.seller_paid_until || null,
      createdAt: user.created_at
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user' });
  }
});

// Admin: fetch OTP info by email (debug/support)
router.get('/otp/by-email', authMiddleware, async (req, res) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Only admin/supervisor can view OTP data' });
    }

    const email = String(req.query?.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    await ensureUsersStatusSchema();
    const [rows] = await pool.query(
      'SELECT id, email, role, can_sell, seller_otp, seller_otp_expires_at, seller_paid_until FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1',
      [email]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const user = rows[0];
    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        canSell: Boolean(user.can_sell),
        sellerOtp: user.seller_otp || null,
        sellerOtpExpiresAt: user.seller_otp_expires_at || null,
        sellerPaidUntil: user.seller_paid_until || null
      }
    });
  } catch (error) {
    console.error('Get OTP by email error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch OTP data.' });
  }
});

// Delete user
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Only admin/supervisor can delete users' });
    }

    const [targets] = await pool.query('SELECT role FROM users WHERE id = ? LIMIT 1', [req.params.id]);
    if (!targets.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const targetRole = String(targets[0].role || '').toLowerCase();
    if (!canManageUser(req.user?.role, targetRole)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to delete this account.' });
    }

    // Reset linked device registrations so their serial numbers become available for the next farmer.
    // The device_registrations row is kept (serial preserved) but chip ID, user link, and credentials
    // are cleared so the ESP32 must re-provision on next boot.
    const [deviceRows] = await pool.query(
      'SELECT device_serial FROM device_registrations WHERE user_id = ?',
      [req.params.id]
    );
    const deviceSerials = deviceRows.map(row => row.device_serial).filter(Boolean);

    if (deviceSerials.length > 0) {
      // Invalidate old API keys so the ESP32 cannot reuse them
      await pool.query(
        `DELETE FROM device_credentials WHERE device_serial IN (${deviceSerials.map(() => '?').join(',')})`,
        deviceSerials
      );
      // Free the serial: clear chip ID and user link so the slot is reusable
      await pool.query(
        `UPDATE device_registrations
         SET esp32_chip_id = NULL, user_id = NULL, status = 'unregistered',
             linked_at = NULL, last_seen = NULL
         WHERE device_serial IN (${deviceSerials.map(() => '?').join(',')})`,
        deviceSerials
      );
    }

    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'User deleted successfully. Device serial numbers have been freed for reassignment.' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
});

// Update user
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    await ensureUsersStatusSchema();
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Only admin/supervisor can update users' });
    }

    const [existingUsers] = await pool.query(
      'SELECT id, full_name, email, role, status, photo_url, contact, farm_size, farm_location, device_serial_number FROM users WHERE id = ?',
      [req.params.id]
    );

    if (existingUsers.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const current = existingUsers[0];
    const requesterRole = String(req.user?.role || '').toLowerCase();
    const currentRole = String(current.role || '').toLowerCase();
    if (!canManageUser(requesterRole, currentRole)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to edit this account.' });
    }
    const { fullName, email, role, photoURL, status, contact, farmSize, farmLocation, deviceSerialNumber } = req.body;

    const nextFullName = (fullName ?? current.full_name ?? '').trim();
    const nextEmail = (email ?? current.email ?? '').trim();
    const rawRole = typeof role === 'undefined' ? current.role : role;
    const nextRole = String(rawRole ?? 'farmer').toLowerCase();
    const normalizedStatus = String(status ?? current.status ?? 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active';

    if (!nextFullName || !nextEmail) {
      return res.status(400).json({ success: false, message: 'Full name and email are required.' });
    }

    const allowedRoles = ['farmer', 'admin', 'supervisor', 'customer'];
    if (typeof role !== 'undefined' && !allowedRoles.includes(nextRole)) {
      return res.status(400).json({ success: false, message: 'Invalid role.' });
    }
    const safeRole = allowedRoles.includes(nextRole) ? nextRole : 'customer';

    if (requesterRole === 'admin' && safeRole === 'supervisor') {
      return res.status(403).json({ success: false, message: 'Admin cannot manage supervisor accounts.' });
    }

    if (safeRole === 'supervisor') {
      if (!['admin', 'supervisor'].includes(requesterRole)) {
        return res.status(403).json({ success: false, message: 'Only admin/supervisor can assign supervisor role.' });
      }
      const [supervisors] = await pool.query(
        'SELECT COUNT(*) AS total FROM users WHERE role = ? AND id <> ? LIMIT 1',
        ['supervisor', req.params.id]
      );
      if (Number(supervisors?.[0]?.total || 0) > 0) {
        return res.status(400).json({ success: false, message: 'Only one supervisor account is allowed.' });
      }
    }

    const [emailConflict] = await pool.query(
      'SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1',
      [nextEmail, req.params.id]
    );

    if (emailConflict.length > 0) {
      return res.status(400).json({ success: false, message: 'This email is already used by another account.' });
    }

    const providedFarmSize = typeof farmSize === 'string' ? farmSize.trim() : farmSize;
    const providedFarmLocation = typeof farmLocation === 'string' ? farmLocation.trim() : farmLocation;
    const providedDeviceSerialNumber = typeof deviceSerialNumber === 'string' ? deviceSerialNumber.trim() : deviceSerialNumber;
    const shouldLockAccount = current.status !== 'inactive' && normalizedStatus === 'inactive';

    const nextFarmSize = safeRole === 'farmer'
      ? (providedFarmSize || current.farm_size || null)
      : null;
    const nextFarmLocation = safeRole === 'farmer'
      ? (providedFarmLocation || current.farm_location || null)
      : null;

    let nextDeviceSerialNumber = safeRole === 'farmer'
      ? (providedDeviceSerialNumber || current.device_serial_number || null)
      : null;

    // If an account is (or becomes) a farmer, ensure it has an assigned serial.
    let serialWasJustGenerated = false;
    if (safeRole === 'farmer' && !nextDeviceSerialNumber) {
      nextDeviceSerialNumber = await reserveNextDeviceSerial();
      serialWasJustGenerated = true;
    }

    // Pre-reserve the slot in device_registrations so the ESP32 can claim it on first boot.
    if (serialWasJustGenerated && nextDeviceSerialNumber) {
      const apiKey = generateApiKey();
      try {
        await pool.query(
          `INSERT INTO device_registrations (device_serial, esp32_chip_id, user_id, api_key, status)
           VALUES (?, NULL, NULL, ?, 'unregistered')
           ON DUPLICATE KEY UPDATE esp32_chip_id = NULL, user_id = NULL, api_key = VALUES(api_key), status = 'unregistered'`,
          [nextDeviceSerialNumber, apiKey]
        );
        await pool.query(
          'INSERT IGNORE INTO device_credentials (device_serial, api_key) VALUES (?, ?)',
          [nextDeviceSerialNumber, apiKey]
        );
      } catch (deviceErr) {
        console.warn('Pre-reserve device serial slot failed:', deviceErr.message);
      }
    }

    if (safeRole === 'farmer' && (!nextFarmSize || !nextFarmLocation)) {
      return res.status(400).json({ success: false, message: 'Farmer account requires farm size and farm location.' });
    }

    await pool.query(
      'UPDATE users SET full_name = ?, email = ?, role = ?, photo_url = ?, status = ?, contact = ?, farm_size = ?, farm_location = ?, device_serial_number = ? WHERE id = ?',
      [
        nextFullName,
        nextEmail,
        safeRole,
        photoURL ?? current.photo_url ?? null,
        normalizedStatus,
        contact ?? current.contact ?? null,
        nextFarmSize,
        nextFarmLocation,
        nextDeviceSerialNumber,
        req.params.id
      ]
    );

    let mailSent = false;
    let mailError = null;

    if (shouldLockAccount && nextEmail) {
      try {
        await sendAccountLockedEmail({
          email: nextEmail,
          fullName: nextFullName,
          lockedAt: new Date(),
          role: safeRole
        });
        mailSent = true;
      } catch (error) {
        console.error('Failed to send account locked email:', error);
        mailSent = false;
        mailError = error?.message || 'Unable to send account locked email.';
      }
    }

    res.json({
      success: true,
      message: 'User updated successfully',
      mailSent,
      mailError
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
});

// Reset user password
router.put('/:id/password', authMiddleware, async (req, res) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Only admin/supervisor can reset passwords' });
    }

    const { newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const [existingUsers] = await pool.query('SELECT id, role FROM users WHERE id = ?', [req.params.id]);
    if (existingUsers.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const targetRole = String(existingUsers[0].role || '').toLowerCase();
    if (!canManageUser(req.user?.role, targetRole)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to reset this password.' });
    }

    const hashedPassword = await bcrypt.hash(String(newPassword), 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.params.id]);

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
});

// Reactivate seller subscription
router.put('/:id/reactivate-seller', authMiddleware, async (req, res) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Only admin/supervisor can reactivate seller subscriptions' });
    }

    const [existingUsers] = await pool.query(
      'SELECT id, can_sell, seller_paid_until FROM users WHERE id = ?',
      [req.params.id]
    );
    if (existingUsers.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = existingUsers[0];
    if (!user.can_sell) {
      return res.status(400).json({ success: false, message: 'User is not a seller' });
    }

    // Update seller_paid_until to 30 days from now
    const newPaidUntil = new Date();
    newPaidUntil.setDate(newPaidUntil.getDate() + 30);

    await pool.query(
      'UPDATE users SET seller_paid_until = ? WHERE id = ?',
      [newPaidUntil, req.params.id]
    );

    res.json({
      success: true,
      message: 'Seller subscription reactivated successfully',
      sellerPaidUntil: newPaidUntil.toISOString()
    });
  } catch (error) {
    console.error('Reactivate seller error:', error);
    res.status(500).json({ success: false, message: 'Failed to reactivate seller subscription' });
  }
});

module.exports = router;
