const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT id, device_serial, esp32_chip_id, user_id, api_key, status, first_seen, last_seen FROM device_registrations WHERE esp32_chip_id = 'b6215788' LIMIT 1");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('QUERY ERROR', err.message || err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
