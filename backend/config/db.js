const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'eco_smart_poultry',
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
});

const testConnection = async () => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.query('SELECT 1');
    console.log('✅ MySQL database connected successfully');
  } catch (error) {
    console.error('❌ MySQL connection error:', error.message);
  } finally {
    if (connection) await connection.release();
  }
};

testConnection();

module.exports = pool;
