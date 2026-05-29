const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware } = require('./auth');
const fs = require('fs');
const path = require('path');

/**
 * For any base64 data-URL (image or video), decode to disk and return
 * a server-relative path like /uploads/images/<id>.jpg.
 * For plain external URLs (http/https/already a path) return unchanged.
 * This keeps MySQL free of large binary data entirely.
 */
function saveMediaToDisk(id, mediaType, mediaDataUrl) {
  // External URL or already a server path → store as-is
  if (!mediaDataUrl.startsWith('data:')) return mediaDataUrl;

  const match = mediaDataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) return mediaDataUrl;

  const mime = match[1]; // e.g. 'image/jpeg' or 'video/mp4'
  const ext = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const folder = mediaType === 'video' ? 'videos' : 'images';
  const filename = `${id}.${ext}`;

  const targetDir = path.join(__dirname, '..', 'uploads', folder);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  fs.writeFileSync(path.join(targetDir, filename), Buffer.from(match[2], 'base64'));
  return `/uploads/${folder}/${filename}`;
}

let tableEnsured = false;

async function ensureHeroMediaTable() {
  if (tableEnsured) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hero_media (
      id VARCHAR(36) PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      description TEXT NOT NULL,
      media_type ENUM('image', 'video') NOT NULL DEFAULT 'image',
      media_data_url LONGTEXT NOT NULL,
      display_order INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  tableEnsured = true;
}

router.get('/', async (req, res) => {
  try {
    await ensureHeroMediaTable();

    const [rows] = await pool.query(
      `SELECT id, title, description, media_type, media_data_url, display_order, created_at
       FROM hero_media
       ORDER BY display_order ASC, created_at DESC`
    );

    return res.json(rows);
  } catch (error) {
    console.error('Get hero media error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch hero media.' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    await ensureHeroMediaTable();

    const { title, description, mediaType, mediaDataUrl, displayOrder } = req.body || {};

    if (!title || !description || !mediaType || !mediaDataUrl) {
      return res.status(400).json({ success: false, message: 'Title, description, media type, and media content are required.' });
    }

    if (!['image', 'video'].includes(mediaType)) {
      return res.status(400).json({ success: false, message: 'Invalid media type.' });
    }

    const [uuidResult] = await pool.query('SELECT UUID() as uuid');
    const id = uuidResult[0].uuid;

    // For any base64 data-URL, write to disk instead of MySQL (avoids max_allowed_packet)
    // For external http/https URLs, stored directly as-is
    const storageUrl = saveMediaToDisk(id, mediaType, mediaDataUrl);

    await pool.query(
      `INSERT INTO hero_media (id, title, description, media_type, media_data_url, display_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, String(title).trim(), String(description).trim(), mediaType, storageUrl, Number(displayOrder) || 1]
    );

    return res.json({ success: true, id, message: 'Hero media saved successfully.' });
  } catch (error) {
    console.error('Create hero media error:', error?.code, error?.message);

    let userMessage = error?.message ? `Save failed: ${error.message}` : 'Failed to save hero media.';
    if (error?.code === 'ER_BAD_NULL_ERROR') {
      userMessage = 'A required field is missing. Please fill in title, description, and media.';
    }

    return res.status(500).json({ success: false, message: userMessage });
  }
});

router.put('/:id/order', authMiddleware, async (req, res) => {
  try {
    await ensureHeroMediaTable();

    const { id } = req.params;
    const { displayOrder } = req.body || {};

    await pool.query(
      `UPDATE hero_media SET display_order = ? WHERE id = ?`,
      [Number(displayOrder) || 1, id]
    );

    return res.json({ success: true, message: 'Hero media order updated.' });
  } catch (error) {
    console.error('Update hero media order error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update hero media order.' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await ensureHeroMediaTable();

    const { id } = req.params;

    // Fetch stored URL so we can clean up any on-disk video file
    const [existing] = await pool.query(
      'SELECT media_data_url FROM hero_media WHERE id = ?', [id]
    );
    const storedUrl = existing[0]?.media_data_url || '';

    await pool.query(
      `DELETE FROM hero_media WHERE id = ?`,
      [id]
    );

    // Remove disk file if it was saved there
    if (storedUrl.startsWith('/uploads/')) {
      const diskPath = path.join(__dirname, '..', storedUrl);
      try { fs.unlinkSync(diskPath); } catch (_) { /* already gone */ }
    }

    return res.json({ success: true, message: 'Hero media deleted successfully.' });
  } catch (error) {
    console.error('Delete hero media error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete hero media.' });
  }
});

module.exports = router;