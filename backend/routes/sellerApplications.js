const express = require('express');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware } = require('./auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

let applicationsSchemaReady = false;

async function ensureSellerApplicationsSchema() {
  if (applicationsSchemaReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS seller_applications (
      id VARCHAR(36) PRIMARY KEY,
      full_name VARCHAR(120) NOT NULL,
      email VARCHAR(150) NOT NULL,
      contact VARCHAR(120) NOT NULL,
      location VARCHAR(255) NULL,
      farm_size VARCHAR(120) NULL,
      reason TEXT NULL,
      payment_screenshot_url VARCHAR(500) NULL,
      status ENUM('pending','approved','rejected') DEFAULT 'pending',
      reviewed_by VARCHAR(36) NULL,
      reviewed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_seller_applications_status (status),
      INDEX idx_seller_applications_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  try {
    await pool.query('ALTER TABLE seller_applications ADD COLUMN payment_screenshot_url VARCHAR(500) NULL');
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') throw error;
  }

  applicationsSchemaReady = true;
}

function isAdminLike(role) {
  return ['admin', 'supervisor'].includes(String(role || '').toLowerCase());
}

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < 12; i += 1) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function generateSellerOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
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

const PAYMENT_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'payments');

const paymentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(PAYMENT_UPLOAD_DIR, { recursive: true });
    cb(null, PAYMENT_UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const safeExt = ext.replace(/[^.a-zA-Z0-9]/g, '') || '.jpg';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}${safeExt}`);
  }
});

const uploadPaymentProof = multer({
  storage: paymentStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image uploads are allowed for payment proof.'));
    } else {
      cb(null, true);
    }
  }
});

function getEmailTransporter() {
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

async function sendApprovalEmail({ email, fullName, tempPassword, created, sellerOtp, sellerOtpExpiresAt, sellerPaidUntil }) {
  const transporter = getEmailTransporter();
  if (!transporter) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.');
  }

  await transporter.verify();

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'Eco-Smart <no-reply@eco-smart.local>';
  const subject = 'Eco-Smart Seller Application Approved';
  const greetingName = fullName || 'Applicant';

  const bodyLines = [
    `Hello ${greetingName},`,
    '',
    'Your seller application has been approved.',
    created
      ? 'An account has been created for you. Use the credentials below to log in:'
      : 'Your existing account now has seller access. You can log in with your current password.',
    ''
  ];

  if (tempPassword) {
    bodyLines.push(`Email: ${email}`);
    bodyLines.push(`Temporary password: ${tempPassword}`);
    bodyLines.push('Please change your password after logging in.');
    bodyLines.push('');
  }

  const otpExpiresAt = formatMailDate(sellerOtpExpiresAt || sellerPaidUntil);
  const accessUntil = formatMailDate(sellerPaidUntil);

  if (sellerOtp) {
    bodyLines.push(`Seller OTP: ${sellerOtp}`);
    if (otpExpiresAt) {
      bodyLines.push(`OTP expires on: ${otpExpiresAt}`);
    }
    if (accessUntil) {
      bodyLines.push(`Seller access valid until: ${accessUntil}`);
    }
    bodyLines.push('');
  }

  const htmlLines = [
    `<p>Hello ${greetingName},</p>`,
    '<p>Your seller application has been approved.</p>',
    created
      ? '<p>An account has been created for you. Use the credentials below to log in:</p>'
      : '<p>Your existing account now has seller access. You can log in with your current password.</p>'
  ];

  if (tempPassword) {
    htmlLines.push(
      `<p><strong>Email:</strong> ${email}</p>`,
      `<p><strong>Temporary password:</strong> ${tempPassword}</p>`,
      '<p>Please change your password after logging in.</p>'
    );
  }

  if (sellerOtp) {
    htmlLines.push(`<p><strong>Seller OTP:</strong> ${sellerOtp}</p>`);
    if (otpExpiresAt) {
      htmlLines.push(`<p><strong>OTP expires on:</strong> ${otpExpiresAt}</p>`);
    }
    if (accessUntil) {
      htmlLines.push(`<p><strong>Seller access valid until:</strong> ${accessUntil}</p>`);
    }
  }

  htmlLines.push(
    '<p><a href="http://localhost:5173/#/login">Login here</a></p>',
    '<p>Thank you,<br>Eco-Smart Poultry Care Team</p>'
  );

  bodyLines.push('Login here: http://localhost:5173/#/login');
  bodyLines.push('');
  bodyLines.push('Thank you,');
  bodyLines.push('Eco-Smart Poultry Care Team');

  return transporter.sendMail({
    from,
    to: email,
    subject,
    text: bodyLines.join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        ${htmlLines.join('\n')}
      </div>
    `
  });
}

async function sendRejectionEmail({ email, fullName }) {
  const transporter = getEmailTransporter();
  if (!transporter) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.');
  }

  await transporter.verify();

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'Eco-Smart <no-reply@eco-smart.local>';
  const greetingName = fullName || 'Applicant';
  const subject = 'Eco-Smart Seller Application Rejected';
  const contactPhones = '+250785133511 / 0787853990';
  const websiteUrl = 'http://localhost:5173/';

  const text = [
    `Hello ${greetingName},`,
    '',
    'Your seller application has been reviewed and was not approved at this time.',
    'If you believe this is a mistake or would like to reapply, please contact the Eco-Smart team.',
    `Phone: ${contactPhones}`,
    `Website: ${websiteUrl}`,
    '',
    'Thank you,',
    'Eco-Smart Poultry Care Team'
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <p>Hello ${greetingName},</p>
      <p>Your seller application has been reviewed and was not approved at this time.</p>
      <p>If you believe this is a mistake or would like to reapply, please contact the Eco-Smart team.</p>
      <p><strong>Phone:</strong> ${contactPhones}</p>
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

async function ensureUsersCanSellSchema() {
  try {
    await pool.query("ALTER TABLE users ADD COLUMN can_sell TINYINT(1) NOT NULL DEFAULT 0");
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') throw error;
  }

  const extraColumns = [
    'ALTER TABLE users ADD COLUMN seller_otp VARCHAR(20) NULL',
    'ALTER TABLE users ADD COLUMN seller_otp_expires_at TIMESTAMP NULL',
    'ALTER TABLE users ADD COLUMN seller_paid_until TIMESTAMP NULL'
  ];

  for (const statement of extraColumns) {
    try {
      await pool.query(statement);
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
}

router.post('/', uploadPaymentProof.single('paymentScreenshot'), async (req, res) => {
  try {
    await ensureSellerApplicationsSchema();

    const fullName = String(req.body?.fullName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const contact = String(req.body?.contact || '').trim();
    const location = String(req.body?.location || '').trim();
    const farmSize = String(req.body?.farmSize || '').trim();
    const reason = String(req.body?.reason || '').trim();

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Payment screenshot is required.' });
    }

    const paymentScreenshotUrl = `/uploads/payments/${req.file.filename}`;

    if (!fullName || !email || !contact) {
      return res.status(400).json({ success: false, message: 'Full name, email, and contact are required.' });
    }

    const [uuidResult] = await pool.query('SELECT UUID() as uuid');
    const id = uuidResult[0].uuid;

    await pool.query(
      `INSERT INTO seller_applications
       (id, full_name, email, contact, location, farm_size, reason, payment_screenshot_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [id, fullName, email, contact, location || null, farmSize || null, reason || null, paymentScreenshotUrl]
    );

    return res.json({ success: true, id, message: 'Application submitted successfully.' });
  } catch (error) {
    console.error('Create seller application error:', error);
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
    }
    return res.status(500).json({ success: false, message: 'Failed to submit application.' });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await ensureSellerApplicationsSchema();

    const status = String(req.query?.status || '').trim().toLowerCase();
    const params = [];
    const where = status && ['pending', 'approved', 'rejected'].includes(status)
      ? 'WHERE status = ?'
      : '';

    if (where) params.push(status);

    const [rows] = await pool.query(
      `SELECT id, full_name, email, contact, location, farm_size, reason, payment_screenshot_url, status, reviewed_by, reviewed_at, created_at, updated_at
       FROM seller_applications
       ${where}
       ORDER BY created_at DESC`,
      params
    );

    return res.json({ success: true, applications: rows });
  } catch (error) {
    console.error('List seller applications error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch applications.' });
  }
});

router.put('/:id/approve', authMiddleware, async (req, res) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await ensureSellerApplicationsSchema();
    await ensureUsersCanSellSchema();

    const { id } = req.params;
    const [[application]] = await pool.query(
      'SELECT * FROM seller_applications WHERE id = ? LIMIT 1',
      [id]
    );

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }

    if (application.status === 'approved') {
      return res.json({ success: true, message: 'Application already approved.' });
    }

    const email = String(application.email || '').trim().toLowerCase();

    const [existingUsers] = await pool.query('SELECT id, created_at FROM users WHERE email = ? LIMIT 1', [email]);
    let created = false;
    let tempPassword = null;
    let userId = existingUsers?.[0]?.id || null;

    if (existingUsers.length === 0) {
      const [uuidResult] = await pool.query('SELECT UUID() as uuid');
      userId = uuidResult[0].uuid;
      tempPassword = generateTempPassword();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      const sellerOtp = generateSellerOtp();
      await pool.query(
        `INSERT INTO users (id, full_name, email, password, role, status, photo_url, contact, farm_size, farm_location, device_serial_number, can_sell, seller_otp, seller_otp_expires_at, seller_paid_until)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
        [
          userId,
          application.full_name,
          email,
          hashedPassword,
          'customer',
          'active',
          null,
          application.contact,
          application.farm_size || null,
          application.location || null,
          null,
          1,
          sellerOtp,
          null,
          null
        ]
      );

      await pool.query(
        `UPDATE users
         SET seller_otp_expires_at = DATE_ADD(created_at, INTERVAL 30 DAY),
             seller_paid_until = DATE_ADD(created_at, INTERVAL 30 DAY)
         WHERE id = ?`,
        [userId]
      );

      const [[timing]] = await pool.query(
        'SELECT seller_otp_expires_at, seller_paid_until FROM users WHERE id = ? LIMIT 1',
        [userId]
      );

      created = true;
      application.seller_otp = sellerOtp;
      application.seller_otp_expires_at = timing?.seller_otp_expires_at || null;
      application.seller_paid_until = timing?.seller_paid_until || null;
    } else {
      const sellerOtp = generateSellerOtp();
      await pool.query(
        `UPDATE users
         SET can_sell = 1,
             seller_otp = ?,
             seller_otp_expires_at = DATE_ADD(created_at, INTERVAL 30 DAY),
             seller_paid_until = DATE_ADD(created_at, INTERVAL 30 DAY)
         WHERE email = ?`,
        [sellerOtp, email]
      );

      const [[timing]] = await pool.query(
        'SELECT seller_otp_expires_at, seller_paid_until FROM users WHERE email = ? LIMIT 1',
        [email]
      );

      application.seller_otp = sellerOtp;
      application.seller_otp_expires_at = timing?.seller_otp_expires_at || null;
      application.seller_paid_until = timing?.seller_paid_until || null;
    }

    await pool.query(
      `UPDATE seller_applications
       SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [req.user.uid, id]
    );

    let mailSent = false;
    let mailError = null;

    try {
      await sendApprovalEmail({
        email,
        fullName: application.full_name,
        tempPassword,
        created,
        sellerOtp: application.seller_otp,
        sellerOtpExpiresAt: application.seller_otp_expires_at,
        sellerPaidUntil: application.seller_paid_until
      });
      mailSent = true;
    } catch (error) {
      console.error('Failed to send approval email:', error);
      mailSent = false;
      mailError = error?.message || 'Unable to send approval email.';
    }

    return res.json({
      success: true,
      created,
      userId,
      email,
      tempPassword,
      sellerOtp: application.seller_otp,
      sellerOtpExpiresAt: application.seller_otp_expires_at,
      sellerPaidUntil: application.seller_paid_until,
      mailSent,
      mailError,
      message: created
        ? 'Application approved and seller account created.'
        : 'Application approved and existing account updated.'
    });
  } catch (error) {
    console.error('Approve seller application error:', error);
    return res.status(500).json({ success: false, message: 'Failed to approve application.' });
  }
});

router.put('/:id/reject', authMiddleware, async (req, res) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await ensureSellerApplicationsSchema();

    const { id } = req.params;
    const [[application]] = await pool.query(
      'SELECT full_name, email FROM seller_applications WHERE id = ? LIMIT 1',
      [id]
    );

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }

    await pool.query(
      `UPDATE seller_applications
       SET status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [req.user.uid, id]
    );

    let mailSent = false;
    let mailError = null;

    try {
      await sendRejectionEmail({
        email: String(application.email || '').trim().toLowerCase(),
        fullName: application.full_name
      });
      mailSent = true;
    } catch (error) {
      console.error('Failed to send rejection email:', error);
      mailSent = false;
      mailError = error?.message || 'Unable to send rejection email.';
    }

    return res.json({
      success: true,
      mailSent,
      mailError,
      message: 'Application rejected.'
    });
  } catch (error) {
    console.error('Reject seller application error:', error);
    return res.status(500).json({ success: false, message: 'Failed to reject application.' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await ensureSellerApplicationsSchema();

    const { id } = req.params;
    const [[application]] = await pool.query(
      'SELECT id, status FROM seller_applications WHERE id = ? LIMIT 1',
      [id]
    );

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }

    if (String(application.status || '').toLowerCase() !== 'rejected') {
      return res.status(400).json({ success: false, message: 'Only rejected applications can be deleted.' });
    }

    await pool.query('DELETE FROM seller_applications WHERE id = ?', [id]);

    return res.json({ success: true, message: 'Rejected application deleted.' });
  } catch (error) {
    console.error('Delete seller application error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete application.' });
  }
});

module.exports = router;
