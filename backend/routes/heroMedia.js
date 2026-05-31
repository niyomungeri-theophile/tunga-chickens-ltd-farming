const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware } = require('./auth');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;

/**
 * For any base64 data-URL (image or video), decode to disk and return
 * a server-relative path like /uploads/images/<id>.jpg.
 * For plain external URLs (http/https/already a path) return unchanged.
 * This keeps MySQL free of large binary data entirely.
 */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function saveMediaToCloud(id, mediaType, mediaDataUrl) {
  // Already an external URL — store as-is
  if (!mediaDataUrl.startsWith('data:')) return mediaDataUrl;

  const resourceType = mediaType === 'video' ? 'video' : 'image';

  const result = await cloudinary.uploader.upload(mediaDataUrl, {
    public_id: `hero_media/${id}`,
    resource_type: resourceType,
    overwrite: true,
  });

  return result.secure_url;
}
let tableEnsured = false;

async function ensureHeroMediaTable() {
  if (tableEnsured) return;

 await pool.query(`
  CREATE TABLE IF NOT EXISTS hero_media (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    media_type VARCHAR(10) NOT NULL DEFAULT 'image',
    media_data_url TEXT NOT NULL,
    display_order INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);
  tableEnsured = true;
}

router.get('/', async (req, res) => {
  try {
    await ensureHeroMediaTable();

    const { rows: rows } = await pool.query(
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

    const { rows: uuidResult } = await pool.query('SELECT gen_random_uuid() as uuid');
    const id = uuidResult[0].uuid;

    // For any base64 data-URL, write to disk instead of MySQL (avoids max_allowed_packet)
    // For external http/https URLs, stored directly as-is
    const storageUrl = await saveMediaToCloud(id, mediaType, mediaDataUrl);

    await pool.query(`INSERT INTO hero_media (id, title, description, media_type, media_data_url, display_order)
       VALUES ($1, $2, $3, $4, $5, $6)`, [id, String(title).trim(), String(description).trim(), mediaType, storageUrl, Number(displayOrder) || 1]
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

    await pool.query(`UPDATE hero_media SET display_order = $1 WHERE id = $2`, [Number(displayOrder) || 1, id]
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
    const { rows: existing } = await pool.query('SELECT media_data_url FROM hero_media WHERE id = $1', [id]
    );
    const storedUrl = existing[0]?.media_data_url || '';

    await pool.query(`DELETE FROM hero_media WHERE id = $1`, [id]
    );

    // Remove disk file if it was saved there
   if (storedUrl.includes('cloudinary.com')) {
  try {
    const publicId = `hero_media/${id}`;
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (_) {}
}


    return res.json({ success: true, message: 'Hero media deleted successfully.' });
  } catch (error) {
    console.error('Delete hero media error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete hero media.' });
  }
});

module.exports = router;