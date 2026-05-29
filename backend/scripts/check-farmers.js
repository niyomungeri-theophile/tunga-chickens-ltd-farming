require('dotenv').config();
const pool = require('../config/db');

async function checkFarmers() {
  try {
    const [farmers] = await pool.query(`
      SELECT 
        u.id,
        u.full_name,
        u.email,
        u.device_serial_number,
        u.created_at,
        dr.device_serial,
        dr.status,
        dr.esp32_chip_id,
        dr.first_seen
      FROM users u
      LEFT JOIN device_registrations dr ON u.device_serial_number = dr.device_serial
      WHERE LOWER(u.role) = 'farmer'
      ORDER BY u.created_at DESC, dr.device_serial ASC
    `);

    console.log('\n================== FARMER ACCOUNTS & DEVICES ==================');
    console.log(`Total farmers: ${new Set(farmers.map(f => f.id)).size}\n`);

    let currentUser = null;
    farmers.forEach((row, idx) => {
      if (currentUser !== row.id) {
        currentUser = row.id;
        console.log(`\n📋 Farmer: ${row.full_name}`);
        console.log(`   Email: ${row.email}`);
        console.log(`   Assigned Serial: ${row.device_serial_number || '(none)'}`);
        console.log(`   Created: ${new Date(row.created_at).toLocaleDateString()}`);
      }

      if (row.device_serial) {
        console.log(`   ├─ Device: ${row.device_serial}`);
        console.log(`   │  Status: ${row.status}`);
        console.log(`   │  Chip ID: ${row.esp32_chip_id}`);
        console.log(`   │  First Seen: ${new Date(row.first_seen).toLocaleDateString()}`);
      }
    });

    // Summary of unassigned devices
    const [unassigned] = await pool.query(`
      SELECT COUNT(*) as count FROM device_registrations 
      WHERE user_id IS NULL OR user_id = ''
    `);

    const [assigned] = await pool.query(`
      SELECT COUNT(*) as count FROM device_registrations 
      WHERE user_id IS NOT NULL AND user_id != ''
    `);

    const [total] = await pool.query(`
      SELECT COUNT(*) as count FROM device_registrations
    `);

    console.log(`\n================== DEVICE SUMMARY ==================`);
    console.log(`Total Devices: ${total[0].count}`);
    console.log(`Assigned: ${assigned[0].count}`);
    console.log(`Unassigned: ${unassigned[0].count}`);

    console.log(`\n=======================================================\n`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkFarmers();
