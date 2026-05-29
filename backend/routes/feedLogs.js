const express = require('express');
const pool = require('../config/db');
const { authMiddleware } = require('./auth');

const router = express.Router();

let feedingLogsSchemaReady = false;

async function ensureFeedingLogsSchema() {
  if (feedingLogsSchemaReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS feeding_logs (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      chick_category VARCHAR(50) NULL,
      chick_specific_type VARCHAR(120) NULL,
      age_months DECIMAL(5,2) NULL,
      flock_size INT NULL,
      farm_size VARCHAR(100) NULL,
      farm_location VARCHAR(255) NULL,
      feed_type VARCHAR(120) NOT NULL,
      quantity_kg DECIMAL(10,3) NOT NULL,
      fed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_feeding_logs_user_id (user_id),
      INDEX idx_feeding_logs_fed_at (fed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Best-effort schema upgrades for existing installations.
  // Ignore errors (e.g. duplicate columns or unsupported defaults).
  const alters = [
    'ALTER TABLE feeding_logs ADD COLUMN farm_size VARCHAR(100) NULL',
    'ALTER TABLE feeding_logs ADD COLUMN farm_location VARCHAR(255) NULL',
    'ALTER TABLE feeding_logs MODIFY fed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
  ];

  for (const sql of alters) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await pool.query(sql);
    } catch (e) {
      // ignore
    }
  }

  feedingLogsSchemaReady = true;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  return Math.min(max, Math.max(min, i));
}

function isAdminLike(role) {
  return ['admin', 'supervisor'].includes(String(role || '').toLowerCase());
}

// GET /api/feed-logs?limit=50
router.get('/', authMiddleware, async (req, res) => {
  try {
    await ensureFeedingLogsSchema();

    const limit = clampInt(req.query?.limit, 1, 200, 50);
    const requestedUserId = String(req.query?.userId || '').trim();
    const adminLike = isAdminLike(req.user?.role);

    if (requestedUserId && !adminLike) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const targetUserId = adminLike && requestedUserId ? requestedUserId : req.user.uid;
    const [rows] = await pool.query(
      'SELECT * FROM feeding_logs WHERE user_id = ? ORDER BY fed_at DESC LIMIT ?',
      [targetUserId, limit]
    );

    return res.json({ success: true, logs: rows || [] });
  } catch (error) {
    console.error('Get feeding logs error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch feeding logs' });
  }
});

// POST /api/feed-logs
router.post('/', authMiddleware, async (req, res) => {
  try {
    await ensureFeedingLogsSchema();

    const requestedUserId = String(req.body?.userId || '').trim();
    const adminLike = isAdminLike(req.user?.role);

    if (requestedUserId && !adminLike) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const targetUserId = adminLike && requestedUserId ? requestedUserId : req.user.uid;

    const chickCategory = req.body?.chickCategory ? String(req.body.chickCategory).trim() : null;
    const chickSpecificType = req.body?.chickSpecificType ? String(req.body.chickSpecificType).trim() : null;
    const ageMonthsRaw = req.body?.ageMonths;
    const ageMonths = typeof ageMonthsRaw === 'undefined' || ageMonthsRaw === null
      ? null
      : clampNumber(ageMonthsRaw, 0, 36, 0);
    const flockSizeRaw = req.body?.flockSize;
    const flockSize = typeof flockSizeRaw === 'undefined' || flockSizeRaw === null
      ? null
      : clampInt(flockSizeRaw, 1, 1000000, 1);

    const feedType = String(req.body?.feedType || '').trim();
    const quantityKg = clampNumber(req.body?.quantityKg, 0.001, 100000, 1);

    if (!feedType) {
      return res.status(400).json({ success: false, message: 'feedType is required' });
    }

    const [uuidResult] = await pool.query('SELECT UUID() as uuid');
    const id = uuidResult[0].uuid;

    let farmSize = null;
    let farmLocation = null;
    try {
      const [userRows] = await pool.query('SELECT farm_size, farm_location FROM users WHERE id = ?', [targetUserId]);
      const u = userRows?.[0];
      farmSize = u?.farm_size ?? null;
      farmLocation = u?.farm_location ?? null;
    } catch (e) {
      // If users table isn't reachable for any reason, still allow feeding log save.
    }

    await pool.query(
      `INSERT INTO feeding_logs (
        id, user_id, chick_category, chick_specific_type, age_months, flock_size,
        farm_size, farm_location,
        feed_type, quantity_kg, fed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())` ,
      [
        id,
        targetUserId,
        chickCategory,
        chickSpecificType,
        ageMonths,
        flockSize,
        farmSize,
        farmLocation,
        feedType,
        quantityKg,
      ]
    );

    return res.json({ success: true, id, message: 'Feeding log saved' });
  } catch (error) {
    console.error('Add feeding log error:', error);
    return res.status(500).json({ success: false, message: 'Failed to save feeding log' });
  }
});

// PUT /api/feed-logs/:id
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    await ensureFeedingLogsSchema();

    const id = String(req.params?.id || '').trim();
    if (!id) {
      return res.status(400).json({ success: false, message: 'id is required' });
    }

    const requestedUserId = String(req.query?.userId || '').trim();
    const adminLike = isAdminLike(req.user?.role);

    if (requestedUserId && !adminLike) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const targetUserId = adminLike && requestedUserId ? requestedUserId : req.user.uid;

    const [existingRows] = await pool.query(
      'SELECT * FROM feeding_logs WHERE id = ? AND user_id = ? LIMIT 1',
      [id, targetUserId]
    );
    const existing = existingRows?.[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Feeding log not found' });
    }

    const has = (key) => Object.prototype.hasOwnProperty.call(req.body || {}, key);

    const chickCategory = has('chickCategory')
      ? (req.body?.chickCategory ? String(req.body.chickCategory).trim() : null)
      : existing.chick_category;

    const chickSpecificType = has('chickSpecificType')
      ? (req.body?.chickSpecificType ? String(req.body.chickSpecificType).trim() : null)
      : existing.chick_specific_type;

    const ageMonths = has('ageMonths')
      ? (typeof req.body?.ageMonths === 'undefined' || req.body?.ageMonths === null
        ? null
        : clampNumber(req.body.ageMonths, 0, 36, 0))
      : existing.age_months;

    const flockSize = has('flockSize')
      ? (typeof req.body?.flockSize === 'undefined' || req.body?.flockSize === null
        ? null
        : clampInt(req.body.flockSize, 1, 1000000, 1))
      : existing.flock_size;

    const feedType = has('feedType') ? String(req.body?.feedType || '').trim() : existing.feed_type;
    const quantityKg = has('quantityKg') ? clampNumber(req.body?.quantityKg, 0.001, 100000, 1) : existing.quantity_kg;

    if (!feedType) {
      return res.status(400).json({ success: false, message: 'feedType is required' });
    }

    await pool.query(
      `UPDATE feeding_logs
       SET chick_category = ?, chick_specific_type = ?, age_months = ?, flock_size = ?, feed_type = ?, quantity_kg = ?
       WHERE id = ? AND user_id = ?`,
      [
        chickCategory,
        chickSpecificType,
        ageMonths,
        flockSize,
        feedType,
        quantityKg,
        id,
        targetUserId,
      ]
    );

    return res.json({ success: true, message: 'Feeding log updated' });
  } catch (error) {
    console.error('Update feeding log error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update feeding log' });
  }
});

// DELETE /api/feed-logs/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await ensureFeedingLogsSchema();

    const id = String(req.params?.id || '').trim();
    if (!id) {
      return res.status(400).json({ success: false, message: 'id is required' });
    }

    const requestedUserId = String(req.query?.userId || '').trim();
    const adminLike = isAdminLike(req.user?.role);

    if (requestedUserId && !adminLike) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const targetUserId = adminLike && requestedUserId ? requestedUserId : req.user.uid;

    const [result] = await pool.query(
      'DELETE FROM feeding_logs WHERE id = ? AND user_id = ?',
      [id, targetUserId]
    );

    if (!result?.affectedRows) {
      return res.status(404).json({ success: false, message: 'Feeding log not found' });
    }

    return res.json({ success: true, message: 'Feeding log deleted' });
  } catch (error) {
    console.error('Delete feeding log error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete feeding log' });
  }
});

module.exports = router;
