const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware } = require('./auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const TEAM_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'team');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(TEAM_UPLOAD_DIR, { recursive: true });
    cb(null, TEAM_UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const safeExt = ext.replace(/[^.a-zA-Z0-9]/g, '') || '.jpg';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image uploads are allowed for team members.'));
    } else {
      cb(null, true);
    }
  }
});

let tableEnsured = false;

async function ensureTeamMembersTable() {
  if (tableEnsured) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_members (
      id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
      name VARCHAR(120) NOT NULL,
      role VARCHAR(120) NOT NULL,
      description TEXT NULL,
      image_url VARCHAR(500) NOT NULL,
      display_order INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  tableEnsured = true;
}

router.get('/', async (_req, res) => {
  try {
    await ensureTeamMembersTable();
    const [rows] = await pool.query(
      `SELECT id, name, role, description, image_url, display_order, created_at
       FROM team_members
       ORDER BY display_order ASC, created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Get team members error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch team members.' });
  }
});

router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    await ensureTeamMembersTable();

    const { name, role, description, displayOrder } = req.body || {};
    if (!name || !role) {
      return res.status(400).json({ success: false, message: 'Name and role are required.' });
    }
    const imageUrl = req.file ? `/uploads/team/${req.file.filename}` : (req.body.imageUrl ? String(req.body.imageUrl).trim() : '');
    if (!imageUrl) {
      return res.status(400).json({ success: false, message: 'Team member image is required.' });
    }
    const [uuidResult] = await pool.query('SELECT UUID() as uuid');
    const id = uuidResult[0]?.uuid;

    await pool.query(
      `INSERT INTO team_members (id, name, role, description, image_url, display_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, String(name).trim(), String(role).trim(), description ? String(description).trim() : null, imageUrl, Number(displayOrder) || 1]
    );

    res.json({ success: true, id, imageUrl });
  } catch (error) {
    console.error('Create team member error:', error);

    // Clean up uploaded file if DB insert failed
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
    }

    res.status(500).json({ success: false, message: 'Failed to save team member.' });
  }
});

router.put('/:id/order', authMiddleware, async (req, res) => {
  try {
    await ensureTeamMembersTable();
    const { id } = req.params;
    const { displayOrder } = req.body || {};

    await pool.query(
      'UPDATE team_members SET display_order = ? WHERE id = ?',
      [Number(displayOrder) || 1, id]
    );

    res.json({ success: true, message: 'Team member order updated.' });
  } catch (error) {
    console.error('Update team member order error:', error);
    res.status(500).json({ success: false, message: 'Failed to update order.' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await ensureTeamMembersTable();
    const { id } = req.params;

    const [existing] = await pool.query('SELECT image_url FROM team_members WHERE id = ?', [id]);
    const storedUrl = existing[0]?.image_url || '';

    await pool.query('DELETE FROM team_members WHERE id = ?', [id]);

    if (storedUrl.startsWith('/uploads/')) {
      const diskPath = path.join(__dirname, '..', storedUrl);
      try { fs.unlinkSync(diskPath); } catch (_) { /* already removed */ }
    }

    res.json({ success: true, message: 'Team member deleted.' });
  } catch (error) {
    console.error('Delete team member error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete team member.' });
  }
});

module.exports = router;
