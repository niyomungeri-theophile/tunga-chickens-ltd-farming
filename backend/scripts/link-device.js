#!/usr/bin/env node
/**
 * Link a device to a user account
 * Usage: node scripts/link-device.js DEVICE_SERIAL USER_ID
 */

require('dotenv').config();
const pool = require('../config/db');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function linkDevice(deviceSerial, userId) {
  try {
    console.log('\n=== LINK DEVICE TO USER ===\n');

    if (!deviceSerial || !userId) {
      console.log('Usage: node scripts/link-device.js DEVICE_SERIAL USER_ID\n');
      console.log('Example: node scripts/link-device.js ESP32-ABC123 5\n');
      process.exit(1);
    }

    // Verify device exists
    const [devices] = await pool.query(
      'SELECT id, api_key, user_id, status FROM device_registrations WHERE device_serial = ?',
      [deviceSerial]
    );

    if (!devices.length) {
      console.log(`❌ Device not found: ${deviceSerial}\n`);
      process.exit(1);
    }

    const device = devices[0];
    console.log(`✓ Device found:`);
    console.log(`  - Serial: ${deviceSerial}`);
    console.log(`  - Current User ID: ${device.user_id || 'UNLINKED'}`);
    console.log(`  - Status: ${device.status}\n`);

    // Verify user exists
    const [users] = await pool.query(
      'SELECT id, username, status FROM users WHERE id = ?',
      [userId]
    );

    if (!users.length) {
      console.log(`❌ User not found: ${userId}\n`);
      process.exit(1);
    }

    const user = users[0];
    console.log(`✓ User found:`);
    console.log(`  - ID: ${userId}`);
    console.log(`  - Username: ${user.username}`);
    console.log(`  - Status: ${user.status}\n`);

    // Confirm action
    const confirm = await prompt(`Link device ${deviceSerial} to user ${user.username} (${userId})? (yes/no): `);
    
    if (confirm.toLowerCase() !== 'yes') {
      console.log('Cancelled.\n');
      process.exit(0);
    }

    // Link device to user
    await pool.query(
      'UPDATE device_registrations SET user_id = ?, status = "linked" WHERE device_serial = ?',
      [userId, deviceSerial]
    );

    // Update user's device_serial_number
    await pool.query(
      'UPDATE users SET device_serial_number = ? WHERE id = ?',
      [deviceSerial, userId]
    );

    console.log('\n✅ Device linked successfully!\n');
    console.log('Device should now be able to send data.');
    console.log('ESP32 might need to restart to verify new credentials.\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    rl.close();
    await pool.end();
  }
}

const serial = process.argv[2];
const userId = process.argv[3];
linkDevice(serial, userId);
