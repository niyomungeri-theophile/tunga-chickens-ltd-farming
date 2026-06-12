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
});

(async () => {
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.query("SELECT id, device_serial, esp32_chip_id, user_id, api_key, status, first_seen, last_seen FROM device_registrations WHERE esp32_chip_id = 'b6215788' LIMIT 1");
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error('QUERY ERROR', err.message || err);
    process.exit(1);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
})();
