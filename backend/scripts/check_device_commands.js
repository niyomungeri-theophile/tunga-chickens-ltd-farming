const db = require('../config/db');

(async () => {
  try {
    const [rows] = await db.query(`SELECT dc.id, dr.device_serial, dc.command, dc.executed, dc.requested_by, dc.created_at, dc.executed_at
      FROM device_commands dc
      LEFT JOIN device_registrations dr ON dc.device_id = dr.id
      ORDER BY dc.created_at DESC
      LIMIT 50`);
    console.log('Recent device_commands:');
    console.table(rows);
    process.exit(0);
  } catch (err) {
    console.error('Error querying device_commands:', err);
    process.exit(1);
  }
})();