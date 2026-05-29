const pool = require('./backend/config/db.js');

async function run() {
  try {
    // 1. Database name
    const [dbResult] = await pool.query('SELECT DATABASE() as db');
    console.log(`(1) Database name: ${dbResult[0].db}`);

    // 2. SHOW TABLES
    const [tablesRegistrations] = await pool.query("SHOW TABLES LIKE 'device_registrations'");
    const [tablesCredentials] = await pool.query("SHOW TABLES LIKE 'device_credentials'");
    console.log(`(2) Tables: device_registrations exists: ${tablesRegistrations.length > 0}, device_credentials exists: ${tablesCredentials.length > 0}`);

    // 3. SHOW COLUMNS FROM device_registrations
    if (tablesRegistrations.length > 0) {
      const [columns] = await pool.query("SHOW COLUMNS FROM device_registrations");
      console.log('(3) Columns in device_registrations:');
      columns.forEach(col => console.log(`  - ${col.Field} (${col.Type})`));
    }

    // 4. Row counts
    const getCount = async (table, where = '') => {
      try {
        const [rows] = await pool.query(`SELECT COUNT(*) as count FROM ${table} ${where}`);
        return rows[0].count;
      } catch (e) {
        return `Error: ${e.message}`;
      }
    };
    console.log('(4) Row counts:');
    console.log(`  - device_registrations: ${await getCount('device_registrations')}`);
    console.log(`  - device_credentials: ${await getCount('device_credentials')}`);
    console.log(`  - users with device_serial_number: ${await getCount('users', 'WHERE device_serial_number IS NOT NULL')}`);

    // 5. Up to 20 rows from device_registrations
    if (tablesRegistrations.length > 0) {
      const [rows] = await pool.query("SELECT * FROM device_registrations ORDER BY created_at DESC LIMIT 20");
      console.log('(5) Recent device_registrations:');
      console.table(rows);
    }

    // 6. users with device_serial_number that have no matching device_registrations row
    // Note: Column name is device_serial in device_registrations
    const [orphanUsers] = await pool.query("SELECT id, email, device_serial_number FROM users WHERE device_serial_number IS NOT NULL AND device_serial_number NOT IN (SELECT device_serial FROM device_registrations)");
    console.log(`(6) Users with serial number but no registration: ${orphanUsers.length}`);
    if (orphanUsers.length > 0) console.table(orphanUsers);

    // 7. device_registrations rows with user_id not matching any users.id
    const [orphanRegs] = await pool.query("SELECT id, device_serial, user_id FROM device_registrations WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users)");
    console.log(`(7) Registration rows with invalid user_id: ${orphanRegs.length}`);
    if (orphanRegs.length > 0) console.table(orphanRegs);

  } catch (error) {
    console.error('Fatal Error:', error.message);
  } finally {
    const p = await pool;
    if (p.end) await p.end();
    process.exit(0);
  }
}

run();
