const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware } = require('./auth');

function isAdminLike(role) {
  return ['admin', 'supervisor'].includes(String(role || '').toLowerCase());
}

// Get all transactions
router.get('/', authMiddleware, async (req, res) => {
  try {
    const admin = isAdminLike(req.user?.role);
    const requestedUserId = admin ? (req.query.userId || null) : req.user.uid;
    const [transactions] = await pool.query(
      `SELECT * FROM transactions ${requestedUserId ? 'WHERE user_id = ?' : ''} ORDER BY timestamp DESC`,
      requestedUserId ? [requestedUserId] : []
    );
    
    const formattedTransactions = transactions.reduce((acc, trans) => {
      acc[trans.id] = {
        date: trans.date,
        timestamp: parseInt(trans.timestamp),
        type: trans.type,
        category: trans.category,
        amount: parseFloat(trans.amount),
        uid: trans.user_id
      };
      return acc;
    }, {});
    
    res.json(formattedTransactions);
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
});

// Add new transaction
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { date, type, category, amount, userId } = req.body;
    const admin = isAdminLike(req.user?.role);
    const targetUserId = admin && userId ? userId : req.user.uid;
    
    const [uuidResult] = await pool.query('SELECT UUID() as uuid');
    const id = uuidResult[0].uuid;
    const timestamp = Date.now();
    
    await pool.query(
      'INSERT INTO transactions (id, date, timestamp, type, category, amount, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, date || new Date().toLocaleDateString(), timestamp, type, category, amount, targetUserId]
    );
    
    res.json({ success: true, id, message: 'Transaction added successfully' });
  } catch (error) {
    console.error('Add transaction error:', error);
    res.status(500).json({ success: false, message: 'Failed to add transaction' });
  }
});

// Delete transaction
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const admin = isAdminLike(req.user?.role);
    const [result] = await pool.query(
      `DELETE FROM transactions WHERE id = ? ${admin ? '' : 'AND user_id = ?'}`,
      admin ? [req.params.id] : [req.params.id, req.user.uid]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    res.json({ success: true, message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete transaction' });
  }
});

// Update transaction
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const admin = isAdminLike(req.user?.role);
    const { date, type, category, amount } = req.body;
    const [result] = await pool.query(
      `UPDATE transactions SET date = ?, type = ?, category = ?, amount = ? WHERE id = ? ${admin ? '' : 'AND user_id = ?'}`,
      admin ? [date, type, category, amount, req.params.id] : [date, type, category, amount, req.params.id, req.user.uid]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    res.json({ success: true, message: 'Transaction updated successfully' });
  } catch (error) {
    console.error('Update transaction error:', error);
    res.status(500).json({ success: false, message: 'Failed to update transaction' });
  }
});

module.exports = router;
