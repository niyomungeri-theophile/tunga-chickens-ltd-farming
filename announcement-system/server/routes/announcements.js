const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// Get latest announcements
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 100');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create announcement (public)
router.post('/', async (req, res) => {
  try {
    const { name, phone, email, message, user_id, user_role } = req.body;
    const sql = 'INSERT INTO announcements (name, phone, email, message, user_id, user_role) VALUES (?, ?, ?, ?, ?, ?)';
    const [result] = await pool.query(sql, [name, phone, email, message, user_id || null, user_role || 'farmer']);
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete announcement (protected)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query('DELETE FROM announcements WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;