const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { authMiddleware } = require('./auth');

let contractsSchemaReady = false;

function isAdminLike(role) {
  return ['admin', 'supervisor'].includes(String(role || '').toLowerCase());
}

function forbidIfNotAdmin(req, res) {
  if (!isAdminLike(req.user?.role)) {
    res.status(403).json({ success: false, message: 'Only admin/supervisor can perform this action.' });
    return true;
  }
  return false;
}

function formatDeviceSerialNumber(sequence) {
  return `NT-${String(sequence).padStart(2, '0')}-TCL`;
}

async function generateNextDeviceSerialNumber() {
  const [rows] = await pool.query(`
    SELECT MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(device_serial_number, '-', 2), '-', -1) AS UNSIGNED)) AS max_serial
    FROM users
    WHERE device_serial_number REGEXP '^NT-[0-9]+-TCL$'
  `);

  const currentMax = Number(rows?.[0]?.max_serial);
  const nextSequence = Number.isFinite(currentMax) ? currentMax + 1 : 1;
  return formatDeviceSerialNumber(nextSequence);
}

async function ensureContractsSchema() {
  if (contractsSchemaReady) return;
  const conn = await pool.getConnection();
  try {
    // Ensure buyer profile fields exist on `users` (older DBs may not have them).
    // We keep this here because contracts list joins these columns.
    const userAlterStatements = [
      'ALTER TABLE users ADD COLUMN contact VARCHAR(100) NULL',
      'ALTER TABLE users ADD COLUMN farm_size VARCHAR(100) NULL',
      'ALTER TABLE users ADD COLUMN farm_location VARCHAR(255) NULL',
      'ALTER TABLE users ADD COLUMN device_serial_number VARCHAR(100) NULL'
    ];

    for (const statement of userAlterStatements) {
      try {
        await conn.query(statement);
      } catch (error) {
        if (error.code !== 'ER_DUP_FIELDNAME') throw error;
      }
    }

    try {
      await conn.query('CREATE INDEX idx_users_device_serial_number ON users(device_serial_number)');
    } catch (error) {
      if (error.code !== 'ER_DUP_KEYNAME') throw error;
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS contracts (
        id              VARCHAR(36)    PRIMARY KEY,
        contract_number VARCHAR(50)    UNIQUE NOT NULL,
        buyer_name      VARCHAR(255)   NOT NULL,
        buyer_email     VARCHAR(255)   NOT NULL,
        buyer_phone     VARCHAR(50),
        buyer_address   TEXT,
        system_name     VARCHAR(255)   DEFAULT 'Eco-Smart Poultry Care System',
        modules_included TEXT,
        hardware        TEXT,
        quantity        INT            DEFAULT 1,
        total_price_rwf DECIMAL(15,2)  DEFAULT 0,
        deposit_rwf     DECIMAL(15,2)  DEFAULT 0,
        balance_rwf     DECIMAL(15,2)  DEFAULT 0,
        payment_method  ENUM('bank_transfer','mobile_money','cash','cheque') DEFAULT 'bank_transfer',
        payment_status  ENUM('pending','partial','paid')                     DEFAULT 'pending',
        delivery_date   DATE,
        warranty_months INT            DEFAULT 12,
        installation_address TEXT,
        notes           TEXT,
        status          ENUM('draft','active','completed','cancelled')       DEFAULT 'draft',
        buyer_user_id   VARCHAR(36),
        admin_id        VARCHAR(36),
        created_at      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    contractsSchemaReady = true;
  } finally {
    conn.release();
  }
}

// Auto-generate contract number: ESPCS-YYYY-NNN
async function generateContractNumber() {
  const year = new Date().getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const startOfNextYear = new Date(year + 1, 0, 1);
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM contracts WHERE created_at >= ? AND created_at < ?',
    [startOfYear, startOfNextYear]
  );
  const seq = (parseInt(rows[0].cnt, 10) || 0) + 1;
  return `ESPCS-${year}-${String(seq).padStart(3, '0')}`;
}

// ─── GET /api/contracts ─────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    await ensureContractsSchema();
    const isAdmin = isAdminLike(req.user?.role);
    // Admin can pass ?userId= to filter by a specific buyer; farmer sees only own
    const filterUserId = isAdmin ? (req.query.userId || null) : req.user.uid;
    const [rows] = await pool.query(`
      SELECT
        c.*,
        u.full_name  AS buyer_user_name,
        u.email      AS buyer_user_email,
        u.role       AS buyer_user_role,
        u.contact    AS buyer_user_contact,
        u.farm_size  AS buyer_user_farm_size,
        u.farm_location AS buyer_user_farm_location,
        u.device_serial_number AS buyer_user_device_serial_number,
        a.full_name  AS admin_name,
        a.email      AS admin_email
      FROM contracts c
      LEFT JOIN users u ON u.id = c.buyer_user_id
      LEFT JOIN users a ON a.id = c.admin_id
      ${filterUserId ? 'WHERE c.buyer_user_id = ?' : ''}
      ORDER BY c.created_at DESC
    `, filterUserId ? [filterUserId] : []);
    res.json({ success: true, contracts: rows });
  } catch (err) {
    console.error('List contracts error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch contracts' });
  }
});

// ─── GET /api/contracts/:id ──────────────────────────────────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    await ensureContractsSchema();
    const isAdmin = isAdminLike(req.user?.role);
    const [rows] = await pool.query(
      `SELECT * FROM contracts WHERE id = ? ${isAdmin ? '' : 'AND buyer_user_id = ?'}`,
      isAdmin ? [req.params.id] : [req.params.id, req.user.uid]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Contract not found' });
    }
    res.json({ success: true, contract: rows[0] });
  } catch (err) {
    console.error('Get contract error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch contract' });
  }
});

// ─── Helper: resolve + validate buyer_user_id ────────────────────────────────
async function resolveBuyerUserId(buyer_user_id, status) {
  if (!buyer_user_id) {
    if (status === 'active') {
      throw { status: 400, message: 'A registered buyer account must be assigned before the contract can be set to Active. Please select a user or use the Activate button.' };
    }
    return null;
  }
  const [rows] = await pool.query('SELECT id FROM users WHERE id = ?', [buyer_user_id]);
  if (!rows.length) {
    throw { status: 400, message: 'The selected buyer user was not found in the system.' };
  }
  return buyer_user_id;
}

// ─── POST /api/contracts ─────────────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (forbidIfNotAdmin(req, res)) return;
    await ensureContractsSchema();

    const {
      buyer_name, buyer_email, buyer_phone, buyer_address,
      system_name, modules_included, hardware, quantity,
      total_price_rwf, deposit_rwf, payment_method, payment_status,
      delivery_date, warranty_months, installation_address, notes, status,
      buyer_user_id
    } = req.body;

    if (!buyer_name || !buyer_email) {
      return res.status(400).json({ success: false, message: 'buyer_name and buyer_email are required' });
    }

    // Validate buyer_user_id — required when status is 'active'
    let resolvedBuyerUserId;
    try {
      resolvedBuyerUserId = await resolveBuyerUserId(buyer_user_id, status || 'draft');
    } catch (e) {
      return res.status(e.status || 400).json({ success: false, message: e.message });
    }

    const [uuidRes] = await pool.query('SELECT UUID() AS uuid');
    const id = uuidRes[0].uuid;
    const contract_number = await generateContractNumber();
    const total = parseFloat(total_price_rwf) || 0;
    const deposit = parseFloat(deposit_rwf) || 0;
    const balance_rwf = total - deposit;

    await pool.query(
      `INSERT INTO contracts (
         id, contract_number, buyer_name, buyer_email, buyer_phone, buyer_address,
         system_name, modules_included, hardware, quantity,
         total_price_rwf, deposit_rwf, balance_rwf,
         payment_method, payment_status, delivery_date, warranty_months,
         installation_address, notes, status, buyer_user_id, admin_id
       ) VALUES (?,?,?,?,?,?, ?,?,?,?, ?,?,?, ?,?,?,?, ?,?,?,?,?)`,
      [
        id, contract_number, buyer_name, buyer_email,
        buyer_phone || null, buyer_address || null,
        system_name || 'Eco-Smart Poultry Care System',
        modules_included || null, hardware || null, quantity || 1,
        total, deposit, balance_rwf,
        payment_method || 'bank_transfer', payment_status || 'pending',
        delivery_date || null, warranty_months || 12,
        installation_address || null, notes || null,
        status || 'draft', resolvedBuyerUserId, req.user.uid
      ]
    );

    const [created] = await pool.query('SELECT * FROM contracts WHERE id = ?', [id]);
    res.json({ success: true, contract: created[0] });
  } catch (err) {
    console.error('Create contract error:', err);
    res.status(500).json({ success: false, message: 'Failed to create contract' });
  }
});

// ─── PUT /api/contracts/:id ──────────────────────────────────────────────────
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    if (forbidIfNotAdmin(req, res)) return;
    await ensureContractsSchema();

    const {
      buyer_name, buyer_email, buyer_phone, buyer_address,
      system_name, modules_included, hardware, quantity,
      total_price_rwf, deposit_rwf, payment_method, payment_status,
      delivery_date, warranty_months, installation_address, notes, status,
      buyer_user_id
    } = req.body;

    // Validate buyer_user_id — required when status is 'active'
    let resolvedBuyerUserId;
    try {
      resolvedBuyerUserId = await resolveBuyerUserId(buyer_user_id, status || 'draft');
    } catch (e) {
      return res.status(e.status || 400).json({ success: false, message: e.message });
    }

    const total = parseFloat(total_price_rwf) || 0;
    const deposit = parseFloat(deposit_rwf) || 0;
    const balance_rwf = total - deposit;

    await pool.query(
      `UPDATE contracts SET
         buyer_name=?, buyer_email=?, buyer_phone=?, buyer_address=?,
         system_name=?, modules_included=?, hardware=?, quantity=?,
         total_price_rwf=?, deposit_rwf=?, balance_rwf=?,
         payment_method=?, payment_status=?, delivery_date=?,
         warranty_months=?, installation_address=?, notes=?, status=?,
         buyer_user_id=?
       WHERE id=?`,
      [
        buyer_name, buyer_email, buyer_phone || null, buyer_address || null,
        system_name || 'Eco-Smart Poultry Care System',
        modules_included || null, hardware || null, quantity || 1,
        total, deposit, balance_rwf,
        payment_method || 'bank_transfer', payment_status || 'pending',
        delivery_date || null, warranty_months || 12,
        installation_address || null, notes || null, status || 'draft',
        resolvedBuyerUserId,
        req.params.id
      ]
    );

    const [updated] = await pool.query('SELECT * FROM contracts WHERE id = ?', [req.params.id]);
    if (!updated.length) {
      return res.status(404).json({ success: false, message: 'Contract not found' });
    }
    res.json({ success: true, contract: updated[0] });
  } catch (err) {
    console.error('Update contract error:', err);
    res.status(500).json({ success: false, message: 'Failed to update contract' });
  }
});

// ─── DELETE /api/contracts/:id ───────────────────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (forbidIfNotAdmin(req, res)) return;
    await ensureContractsSchema();
    const [result] = await pool.query('DELETE FROM contracts WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Contract not found' });
    }
    res.json({ success: true, message: 'Contract deleted' });
  } catch (err) {
    console.error('Delete contract error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete contract' });
  }
});

// ─── POST /api/contracts/:id/activate ────────────────────────────────────────
// Creates a buyer user account (or links existing) and activates the contract.
router.post('/:id/activate', authMiddleware, async (req, res) => {
  try {
    if (forbidIfNotAdmin(req, res)) return;
    await ensureContractsSchema();

    const [rows] = await pool.query('SELECT * FROM contracts WHERE id = ?', [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Contract not found' });
    }

    const contract = rows[0];
    if (!contract.buyer_user_id && contract.status === 'active') {
      return res.status(400).json({
        success: false,
        message: 'Active contract must have an assigned buyer account.'
      });
    }

    if (contract.status === 'active' && contract.buyer_user_id) {
      return res.status(400).json({
        success: false,
        message: 'Contract is already active.'
      });
    }

    let userId = contract.buyer_user_id;
    let tempPassword = null;

    if (!userId) {
      // Check for existing account with the buyer email
      const [existing] = await pool.query(
        'SELECT id FROM users WHERE email = ?',
        [contract.buyer_email]
      );

      if (existing.length > 0) {
        // Link to existing user — no new account created
        userId = existing[0].id;
      } else {
      // Generate a secure temporary password
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
      tempPassword = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      const hashed = await bcrypt.hash(tempPassword, 10);

      const [uuidRes] = await pool.query('SELECT UUID() AS uuid');
      userId = uuidRes[0].uuid;

      const deviceSerialNumber = await generateNextDeviceSerialNumber();

      await pool.query(
        'INSERT INTO users (id, full_name, email, password, role, device_serial_number) VALUES (?,?,?,?,?,?)',
        [userId, contract.buyer_name, contract.buyer_email, hashed, 'farmer', deviceSerialNumber]
      );
      }
    }

    await pool.query(
      "UPDATE contracts SET status='active', buyer_user_id=? WHERE id=?",
      [userId, contract.id]
    );

    const [final] = await pool.query('SELECT * FROM contracts WHERE id = ?', [contract.id]);
    res.json({
      success: true,
      contract: final[0],
      tempPassword,
      linked: !tempPassword,
      message: tempPassword
        ? `Buyer account created. Share this temporary password: ${tempPassword}`
        : 'Existing user account linked. Contract is now active.'
    });
  } catch (err) {
    console.error('Activate contract error:', err);
    res.status(500).json({ success: false, message: 'Failed to activate contract' });
  }
});

module.exports = router;
