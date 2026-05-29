require('dotenv').config();
const pool = require('../config/db');

async function checkFullDataset() {
  try {
    // Get all users by role
    const [users] = await pool.query(`
      SELECT 
        id,
        full_name,
        email,
        role,
        device_serial_number,
        created_at
      FROM users
      ORDER BY role, created_at DESC
    `);

    console.log('\n================== ALL USERS ==================');
    const byRole = {};
    users.forEach(u => {
      if (!byRole[u.role]) byRole[u.role] = [];
      byRole[u.role].push(u);
    });

    Object.entries(byRole).forEach(([role, userList]) => {
      console.log(`\n👥 ${role.toUpperCase()} (${userList.length})`);
      userList.forEach(u => {
        console.log(`   • ${u.full_name} (${u.email})`);
        if (u.device_serial_number) {
          console.log(`     Device: ${u.device_serial_number}`);
        }
      });
    });

    // Get all devices
    const [devices] = await pool.query(`
      SELECT 
        device_serial,
        esp32_chip_id,
        user_id,
        api_key,
        status,
        first_seen,
        linked_at
      FROM device_registrations
      ORDER BY device_serial ASC
    `);

    console.log(`\n================== ALL DEVICES ==================`);
    console.log(`Total: ${devices.length}\n`);
    
    devices.forEach(d => {
      const linked = d.linked_at ? '🔗 LINKED' : '⭕ UNLINKED';
      console.log(`${linked} ${d.device_serial}`);
      console.log(`       Chip ID: ${d.esp32_chip_id}`);
      console.log(`       Status: ${d.status}`);
      console.log(`       User ID: ${d.user_id || '(none)'}`);
      console.log(`       First Seen: ${new Date(d.first_seen).toLocaleString()}`);
      if (d.linked_at) console.log(`       Linked: ${new Date(d.linked_at).toLocaleString()}`);
      console.log('');
    });

    // Device summary
    const assigned = devices.filter(d => d.user_id).length;
    const unassigned = devices.filter(d => !d.user_id).length;

    console.log(`================== DATASET SUMMARY ==================`);
    console.log(`Users:`);
    Object.entries(byRole).forEach(([role, list]) => {
      console.log(`  ${role}: ${list.length}`);
    });
    console.log(`\nDevices:`);
    console.log(`  Total: ${devices.length}`);
    console.log(`  Assigned: ${assigned}`);
    console.log(`  Unassigned: ${unassigned}`);
    console.log(`=================================================\n`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkFullDataset();
