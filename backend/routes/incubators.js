const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware } = require('./auth');

let incubatorsSchemaReady = false;

function isAdminLike(role) {
  return ['admin', 'supervisor'].includes(String(role || '').toLowerCase());
}

async function ensureIncubatorsSchema() {
  if (incubatorsSchemaReady) return;
  try {
    await pool.query('ALTER TABLE incubators ADD COLUMN user_id VARCHAR(36) NULL');
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') {
      throw error;
    }
  }
  incubatorsSchemaReady = true;
}

// Get all incubators
router.get('/', authMiddleware, async (req, res) => {
  try {
    await ensureIncubatorsSchema();
    const admin = isAdminLike(req.user?.role);
    const requestedUserId = admin ? (req.query.userId || null) : req.user.uid;
    const [incubators] = await pool.query(
      `SELECT * FROM incubators ${requestedUserId ? 'WHERE user_id = ?' : ''} ORDER BY created_at DESC`,
      requestedUserId ? [requestedUserId] : []
    );
    
    const formattedIncubators = incubators.reduce((acc, inc) => {
      acc[inc.id] = {
        id: inc.physical_id,
        description: inc.description,
        location: inc.location,
        capacity: inc.capacity,
        status: inc.status
      };
      return acc;
    }, {});
    
    res.json(formattedIncubators);
  } catch (error) {
    console.error('Get incubators error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch incubators' });
  }
});

// Add new incubator
router.post('/', authMiddleware, async (req, res) => {
  try {
    await ensureIncubatorsSchema();
    const { physicalId, description, location, capacity, status } = req.body;
    
    const [uuidResult] = await pool.query('SELECT UUID() as uuid');
    const id = uuidResult[0].uuid;
    
    await pool.query(
      'INSERT INTO incubators (id, user_id, physical_id, description, location, capacity, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, req.user.uid, physicalId, description, location, capacity || 100, status || 'Active']
    );
    
    res.json({ success: true, id, message: 'Incubator added successfully' });
  } catch (error) {
    console.error('Add incubator error:', error);
    res.status(500).json({ success: false, message: 'Failed to add incubator' });
  }
});

// Delete incubator
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await ensureIncubatorsSchema();
    const admin = isAdminLike(req.user?.role);
    const [result] = await pool.query(
      `DELETE FROM incubators WHERE id = ? ${admin ? '' : 'AND user_id = ?'}`,
      admin ? [req.params.id] : [req.params.id, req.user.uid]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Incubator not found' });
    }
    res.json({ success: true, message: 'Incubator deleted successfully' });
  } catch (error) {
    console.error('Delete incubator error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete incubator' });
  }
});

// Update incubator
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    await ensureIncubatorsSchema();
    const admin = isAdminLike(req.user?.role);
    const { physicalId, description, location, capacity, status } = req.body;
    const [result] = await pool.query(
      `UPDATE incubators SET physical_id = ?, description = ?, location = ?, capacity = ?, status = ? WHERE id = ? ${admin ? '' : 'AND user_id = ?'}`,
      admin ? [physicalId, description, location, capacity, status, req.params.id] : [physicalId, description, location, capacity, status, req.params.id, req.user.uid]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Incubator not found' });
    }
    res.json({ success: true, message: 'Incubator updated successfully' });
  } catch (error) {
    console.error('Update incubator error:', error);
    res.status(500).json({ success: false, message: 'Failed to update incubator' });
  }
});

module.exports = router;
