
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { authMiddleware } = require('./auth');

const generateProductId = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
};

// Multer storage config (image or video)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const isVideo = file.mimetype.startsWith('video/');
    const folder = isVideo ? '../uploads/videos' : '../uploads/images';
    cb(null, path.join(__dirname, folder));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

const isAdminLike = (role) => ['admin', 'supervisor'].includes(String(role || '').toLowerCase());

// Ensure products table includes reposted_until and repost_count columns
let productsSchemaReady = false;
async function ensureProductsSchema() {
  if (productsSchemaReady) return;
  try {
    await db.execute("ALTER TABLE products ADD COLUMN reposted_until TIMESTAMP NULL");
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_CANT_DROP_FIELD_OR_KEY') {
      // ignore duplicate column errors, rethrow others
    }
  }
  try {
    await db.execute("ALTER TABLE products ADD COLUMN repost_count INT NOT NULL DEFAULT 0");
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_CANT_DROP_FIELD_OR_KEY') {
    }
  }
  productsSchemaReady = true;
}

function getEmailTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

async function processProductReposts() {
  try {
    await ensureProductsSchema();

    // Auto-repost products older than 3 days that haven't been reposted yet
    const [toRepost] = await db.query("SELECT id, product_id, uploaded_by FROM products WHERE (COALESCE(updated_at, created_at) <= DATE_SUB(NOW(), INTERVAL 3 DAY)) AND reposted_until IS NULL");
    for (const p of toRepost) {
      try {
        const [res] = await db.execute(
          "UPDATE products SET reposted_until = DATE_ADD(NOW(), INTERVAL 5 DAY), repost_count = COALESCE(repost_count,0) + 1, updated_at = NOW() WHERE id = ?",
          [p.id]
        );
        // optional: notify owner via email if SMTP configured
        try {
          const transporter = getEmailTransporter();
          if (transporter) {
            const [urows] = await db.execute('SELECT full_name, email FROM users WHERE id = ? LIMIT 1', [p.uploaded_by]);
            const user = urows?.[0];
            if (user?.email) {
              await transporter.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: user.email,
                subject: 'Your product was auto-reposted on Eco-Smart',
                text: `Hello ${user.full_name || ''},\n\nYour product listing has been automatically reposted for 5 more days to keep it visible on the marketplace.\n\nRegards, Eco-Smart Team`
              });
            }
          }
        } catch (mailErr) {
          console.error('Auto-repost mail error:', mailErr.message || mailErr);
        }
      } catch (err) {
        console.error('Auto-repost update error for product', p.id, err.message || err);
      }
    }

    // Auto-delete products whose reposted_until expired
    const [toDelete] = await db.query("SELECT id, product_id, uploaded_by FROM products WHERE reposted_until IS NOT NULL AND reposted_until < NOW()");
    for (const p of toDelete) {
      try {
        await db.execute('DELETE FROM products WHERE id = ?', [p.id]);
        // optional: notify owner about deletion
        try {
          const transporter = getEmailTransporter();
          if (transporter) {
            const [urows] = await db.execute('SELECT full_name, email FROM users WHERE id = ? LIMIT 1', [p.uploaded_by]);
            const user = urows?.[0];
            if (user?.email) {
              await transporter.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: user.email,
                subject: 'Your product was removed from Eco-Smart',
                text: `Hello ${user.full_name || ''},\n\nYour product listing has been removed as its repost period expired. You may repost it from the marketplace.\n\nRegards, Eco-Smart Team`
              });
            }
          }
        } catch (mailErr) {
          console.error('Auto-delete mail error:', mailErr.message || mailErr);
        }
      } catch (err) {
        console.error('Auto-delete error for product', p.id, err.message || err);
      }
    }
  } catch (err) {
    console.error('processProductReposts error:', err.message || err);
  }
}

// Run the repost/delete job every hour
setInterval(processProductReposts, 60 * 60 * 1000);
// Also run once at startup
processProductReposts().catch(e => console.error('Initial repost job failed:', e.message || e));

// Create a new product with image upload (store all data in products table)
router.post('/', authMiddleware, upload.single('media'), async (req, res) => {
  try {
    const {
      product_name,
      description,
      address,
      price,
      location,
      seller_name,
      contact,
      uploaded_by
    } = req.body;

    const requesterId = req.user?.uid;
    if (!requesterId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!product_name || !price || !description || !location) {
      return res.status(400).json({ success: false, message: 'Missing required fields: product_name, description, location, and price' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Image or video is required' });
    }

    const [users] = await db.execute(
      'SELECT full_name, email, contact FROM users WHERE id = ? LIMIT 1',
      [requesterId]
    );

    const profile = users[0] || {};
    const normalizedSellerName = String(seller_name || '').trim() || profile.full_name || profile.email || null;
    const normalizedContact = String(contact || '').trim() || profile.contact || profile.email || null;
    const normalizedUploadedBy = requesterId;

    const productId = generateProductId();
    const isVideo = req.file.mimetype.startsWith('video/');
    const mediaFolder = isVideo ? 'videos' : 'images';
    const mediaUrl = `/uploads/${mediaFolder}/${req.file.filename}`;
    const mediaType = isVideo ? 'video' : 'image';

    const [result] = await db.execute(
      `INSERT INTO products (
        product_id,
        product_name,
        media_type,
        media_url,
        description,
        address,
        location,
        price,
        seller_name,
        contact,
        uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId,
        product_name,
        mediaType,
        mediaUrl,
        description || null,
        address || null,
        location || null,
        price,
        normalizedSellerName,
        normalizedContact,
        normalizedUploadedBy
      ]
    );

    res.status(201).json({ success: true, id: result.insertId, product_id: productId });
  } catch (err) {
    console.error(err);
    const message = err && err.message ? `Database error: ${err.message}` : 'Database error';
    res.status(500).json({
      success: false,
      message,
      errorCode: err?.code || null,
      sqlMessage: err?.sqlMessage || null,
    });
  }
});

// Get all products
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        p.*,
        p.media_url AS image_url,
        u.full_name AS uploader_full_name,
        u.email AS uploader_email,
        u.contact AS uploader_contact
      FROM products p
      LEFT JOIN users u ON u.id = p.uploaded_by
      ORDER BY p.uploaded_at DESC
    `);
    res.json({ success: true, products: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// Publish/unpublish a product
router.patch('/:id/publish', authMiddleware, async (req, res) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to publish products' });
    }
    const { published } = req.body;
    const [result] = await db.execute(
      'UPDATE products SET published = ? WHERE id = ?',
      [published, req.params.id]
    );
    res.json({ success: true, affectedRows: result.affectedRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// Update a product (with optional image)
router.put('/:id', authMiddleware, upload.single('media'), async (req, res) => {
  try {
    const {
      product_name,
      description,
      address,
      price,
      location,
      seller_name,
      contact,
      uploaded_by
    } = req.body;

    const requesterId = req.user?.uid;
    if (!requesterId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const requesterRole = req.user?.role;

    if (!product_name || !price || !description || !location) {
      return res.status(400).json({ success: false, message: 'Missing required fields: product_name, description, location, and price' });
    }

    const [rows] = await db.execute('SELECT uploaded_by FROM products WHERE id = ?', [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const owner = rows[0].uploaded_by;
    const adminLike = isAdminLike(requesterRole);
    if (!adminLike && owner && owner !== requesterId) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this product' });
    }
    if (!adminLike && !owner) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this product' });
    }

    const mediaUrl = req.file
      ? `/uploads/${req.file.mimetype.startsWith('video/') ? 'videos' : 'images'}/${req.file.filename}`
      : null;

    const normalizedSellerName = String(seller_name || '').trim();
    const normalizedContact = String(contact || '').trim();
    const [result] = await db.execute(
      `UPDATE products
       SET product_name = ?,
           description = ?,
           address = ?,
           location = ?,
           price = ?,
           seller_name = COALESCE(NULLIF(?, ''), seller_name),
           contact = COALESCE(NULLIF(?, ''), contact),
             media_url = COALESCE(?, media_url),
             media_type = CASE WHEN ? IS NULL THEN media_type ELSE ? END
       WHERE id = ?`,
      [
        product_name,
        description || null,
        address || null,
        location || null,
        price,
        normalizedSellerName,
        normalizedContact,
        mediaUrl,
        mediaUrl,
        req.file ? (req.file.mimetype.startsWith('video/') ? 'video' : 'image') : null,
        req.params.id
      ]
    );

    res.json({ success: true, affectedRows: result.affectedRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// Delete a product (only by owner or admin)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const requesterId = req.user?.uid;
    if (!requesterId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const adminLike = isAdminLike(req.user?.role);
    // Check ownership
    const [rows] = await db.execute('SELECT uploaded_by FROM products WHERE id = ?', [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    const owner = rows[0].uploaded_by;
    if (!adminLike && owner && owner !== requesterId) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this product' });
    }
    if (!adminLike && !owner) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this product' });
    }
    // Delete product
    const [result] = await db.execute('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ success: true, affectedRows: result.affectedRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// Export router
module.exports = router;
