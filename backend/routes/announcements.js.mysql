const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authMiddleware } = require('./auth');

let announcementsSchemaReady = false;

async function ensureAnnouncementsSchema() {
  if (announcementsSchemaReady) return;
  try {
    await db.execute(
      "ALTER TABLE announcements ADD COLUMN user_role VARCHAR(50) DEFAULT 'user'"
    );
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') {
      throw err;
    }
  }
  announcementsSchemaReady = true;
}

router.use(async (req, res, next) => {
  try {
    await ensureAnnouncementsSchema();
    next();
  } catch (err) {
    console.error('Announcement schema error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Announcement schema update failed',
      error: err.message
    });
  }
});

// GET all announcements (last 24 hours) - PUBLIC (everyone can view)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM announcements WHERE created_at >= (NOW() - INTERVAL 1 DAY) ORDER BY created_at DESC'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch announcements', 
      error: err.message 
    });
  }
});

// POST new announcement - ANY authenticated user
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, phone, email, message } = req.body;
    const user_id = req.user?.uid;
    const user_role = req.user?.role;

    // Validate required fields
    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    if (!phone?.trim()) {
      return res.status(400).json({ success: false, message: 'Phone is required' });
    }
    if (!email?.trim()) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    if (!message?.trim()) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }
    if (!user_id) {
      return res.status(401).json({ success: false, message: 'User ID not found' });
    }

    const result = await db.execute(
      `INSERT INTO announcements (name, phone, email, message, user_id, user_role, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [name.trim(), phone.trim(), email.trim(), message.trim(), user_id, user_role || 'user']
    );

    res.json({ 
      success: true, 
      message: 'Announcement posted successfully',
      id: result[0].insertId 
    });
  } catch (err) {
    console.error('Error posting announcement:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to post announcement', 
      error: err.message 
    });
  }
});

// UPDATE announcement - Admin/Supervisor can edit ANY, others only their OWN
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, phone, email, message } = req.body;
    const { id } = req.params;
    const user_id = req.user?.uid;
    const user_role = req.user?.role;

    if (!name?.trim() || !phone?.trim() || !email?.trim() || !message?.trim()) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // Check if announcement exists and get its owner
    const [rows] = await db.execute('SELECT user_id FROM announcements WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }

    // Check permission: Admin/Supervisor OR owner
    const isAdminOrSupervisor = ['admin', 'supervisor'].includes(String(user_role).toLowerCase());
    const isOwner = rows[0].user_id === user_id;

    if (!isAdminOrSupervisor && !isOwner) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to edit this announcement' 
      });
    }

    await db.execute(
      'UPDATE announcements SET name=?, phone=?, email=?, message=? WHERE id=?',
      [name.trim(), phone.trim(), email.trim(), message.trim(), id]
    );

    res.json({ success: true, message: 'Announcement updated successfully' });
  } catch (err) {
    console.error('Error updating announcement:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update announcement', 
      error: err.message 
    });
  }
});

// DELETE announcement - Admin/Supervisor can delete ANY, others only their OWN
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user?.uid;
    const user_role = req.user?.role;

    // Check if announcement exists and get its owner
    const [rows] = await db.execute('SELECT user_id FROM announcements WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }

    // Check permission: Admin/Supervisor OR owner
    const isAdminOrSupervisor = ['admin', 'supervisor'].includes(String(user_role).toLowerCase());
    const isOwner = rows[0].user_id === user_id;

    if (!isAdminOrSupervisor && !isOwner) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to delete this announcement' 
      });
    }

    await db.execute('DELETE FROM announcements WHERE id = ?', [id]);

    res.json({ success: true, message: 'Announcement deleted successfully' });
  } catch (err) {
    console.error('Error deleting announcement:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete announcement', 
      error: err.message 
    });
  }
});

module.exports = router;
