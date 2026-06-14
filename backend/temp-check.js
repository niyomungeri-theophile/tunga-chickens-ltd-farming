const pool = require('./config/db');

(async () => {
  try {
    console.log('Searching all tables for NT-01-TCL...\n');
    
    // Tables that might contain device data
    const tablesToCheck = [
      'device_registrations', 'device_registration', 'devices',
      'users', 'device_commands', 'device_credentials', 'device_status'
    ];
    
    for (const table of tablesToCheck) {
      try {
        const [result] = await pool.query(
          `SELECT * FROM ${table} WHERE device_serial = ? OR device_serial LIKE ? LIMIT 1`,
          ['NT-01-TCL', '%NT-01%']
        );
        
        if (result && result.length > 0) {
          console.log(`✅ Found NT-01-TCL in table: ${table}`);
          console.log(JSON.stringify(result[0], null, 2));
          console.log('');
        }
      } catch (e) {
        // Table doesn't exist or query failed, skip
      }
    }
    
    console.log('\nSearching for "mukama" in users table...');
    const [users] = await pool.query('SELECT * FROM users WHERE email LIKE ? OR full_name LIKE ?', ['%mukama%', '%mukama%']);
    if (users.length > 0) {
      console.log('✅ Found mukama user:');
      console.log(JSON.stringify(users[0], null, 2));
    } else {
      console.log('❌ No mukama user found');
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    process.exit(0);
  }
})();
