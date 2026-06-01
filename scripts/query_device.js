const { Client } = require('pg');
const connectionString = 'postgresql://neondb_owner:npg_2zWB5XyFJMNV@ep-cold-tooth-aq21yovy-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
(async () => {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const res = await client.query("SELECT id, device_serial, esp32_chip_id, user_id, api_key, status, first_seen, last_seen FROM device_registrations WHERE esp32_chip_id = 'b6215788' LIMIT 1");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('QUERY ERROR', err.message || err);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
