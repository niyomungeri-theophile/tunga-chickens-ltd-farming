const express = require('express');
const nodemailer = require('nodemailer');
const pool = require('../config/db');
const { authMiddleware } = require('./auth');

const router = express.Router();

function isAdminLike(role) {
  return ['admin', 'supervisor'].includes(String(role || '').toLowerCase());
}

function buildTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

router.post('/prediction-alert', authMiddleware, async (req, res) => {
  try {
    const transporter = buildTransporter();
    if (!transporter) {
      return res.status(503).json({
        success: false,
        message: 'Email service is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS.',
      });
    }

    const requestedUserId = String(req.body?.userId || '').trim();
    const targetUserId = requestedUserId && isAdminLike(req.user?.role)
      ? requestedUserId
      : req.user?.uid;

    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'Target user not found.' });
    }

    const [rows] = await pool.query(
      'SELECT id, full_name, email, role, status FROM users WHERE id = ? LIMIT 1',
      [targetUserId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Farmer account not found.' });
    }

    const farmer = rows[0];
    if (String(farmer.role || '').toLowerCase() !== 'farmer') {
      return res.status(400).json({ success: false, message: 'Target account is not a farmer.' });
    }

    if (!farmer.email) {
      return res.status(400).json({ success: false, message: 'Farmer email is missing.' });
    }

    const prediction = req.body?.prediction || {};
    const snapshot = req.body?.snapshot || {};

    const feedbackStatus = String(prediction.feedbackStatus || 'Risks');
    const hatchRate = String(prediction.hatchRate || 'N/A');
    const riskNotes = String(prediction.riskNotes || 'Critical risk detected in real-time prediction.');

    const temperature = snapshot.temperature ?? 'N/A';
    const humidity = snapshot.humidity ?? 'N/A';
    const lightLux = snapshot.lightLux ?? 'N/A';
    const powerSource = snapshot.powerSource ?? 'N/A';

    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
    const sentAt = new Date().toLocaleString('en-GB');

    await transporter.sendMail({
      from: fromAddress,
      to: farmer.email,
      subject: 'Eco-Smart Alert: Critical Real-Time Prediction Detected',
      text: `Hello ${farmer.full_name || 'Farmer'},\n\nA critical real-time prediction has been detected in your incubator system.\n\nStatus: ${feedbackStatus}\nPredicted hatch success: ${hatchRate}\nRisk notes: ${riskNotes}\n\nLive Snapshot\n- Temperature: ${temperature} °C\n- Humidity: ${humidity} %\n- Light: ${lightLux} lux\n- Power source: ${powerSource}\n\nTime: ${sentAt}\n\nPlease check your dashboard immediately and take corrective action.\n\nEco-Smart Poultry Care System`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height:1.6; color:#0f172a;">
          <h2 style="color:#b91c1c;">Critical Real-Time Prediction Alert</h2>
          <p>Hello <strong>${farmer.full_name || 'Farmer'}</strong>,</p>
          <p>A critical real-time prediction has been detected in your incubator system.</p>
          <ul>
            <li><strong>Status:</strong> ${feedbackStatus}</li>
            <li><strong>Predicted hatch success:</strong> ${hatchRate}</li>
            <li><strong>Risk notes:</strong> ${riskNotes}</li>
          </ul>
          <p><strong>Live Snapshot</strong></p>
          <ul>
            <li>Temperature: ${temperature} °C</li>
            <li>Humidity: ${humidity} %</li>
            <li>Light: ${lightLux} lux</li>
            <li>Power source: ${powerSource}</li>
          </ul>
          <p><strong>Time:</strong> ${sentAt}</p>
          <p>Please check your dashboard immediately and take corrective action.</p>
          <p>Eco-Smart Poultry Care System</p>
        </div>
      `,
    });

    return res.json({ success: true, message: 'Farmer notification email sent.' });
  } catch (error) {
    console.error('Prediction alert email error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send prediction alert email.' });
  }
});

module.exports = router;