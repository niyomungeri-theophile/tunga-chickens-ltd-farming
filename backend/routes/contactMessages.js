const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware } = require('./auth');

let tableEnsured = false;

async function ensureContactMessagesTable() {
  if (tableEnsured) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id VARCHAR(36) PRIMARY KEY,
      full_name VARCHAR(120) NOT NULL,
      email VARCHAR(150) NOT NULL,
      subject VARCHAR(120) NOT NULL,
      message TEXT NOT NULL,
      status ENUM('unread', 'read') DEFAULT 'unread',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  tableEnsured = true;
}

router.post('/', async (req, res) => {
  try {
    await ensureContactMessagesTable();

    const { firstName, lastName, email, subject, message } = req.body || {};

    const fullName = `${(firstName || '').trim()} ${(lastName || '').trim()}`.trim();

    if (!fullName || !email || !subject || !message) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const [uuidResult] = await pool.query('SELECT UUID() as uuid');
    const id = uuidResult[0].uuid;

    await pool.query(
      `INSERT INTO contact_messages (id, full_name, email, subject, message, status)
       VALUES (?, ?, ?, ?, ?, 'unread')`,
      [id, fullName, email.trim(), subject.trim(), message.trim()]
    );

    return res.json({ success: true, id, message: 'Message sent successfully.' });
  } catch (error) {
    console.error('Create contact message error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send message.' });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    if (!['admin', 'staff', 'supervisor'].includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await ensureContactMessagesTable();

    const [rows] = await pool.query(
      `SELECT id, full_name, email, subject, message, status, created_at
       FROM contact_messages
       ORDER BY created_at DESC`
    );

    return res.json(rows);
  } catch (error) {
    console.error('Get contact messages error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch contact messages.' });
  }
});

router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    if (!['admin', 'staff', 'supervisor'].includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await ensureContactMessagesTable();

    const { id } = req.params;

    await pool.query(
      `UPDATE contact_messages SET status = 'read' WHERE id = ?`,
      [id]
    );

    return res.json({ success: true, message: 'Message marked as read.' });
  } catch (error) {
    console.error('Mark message as read error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update message status.' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (!['admin', 'staff', 'supervisor'].includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await ensureContactMessagesTable();

    const { id } = req.params;

    await pool.query(
      `DELETE FROM contact_messages WHERE id = ?`,
      [id]
    );

    return res.json({ success: true, message: 'Message deleted successfully.' });
  } catch (error) {
    console.error('Delete contact message error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete message.' });
  }
});

module.exports = router;
