#!/usr/bin/env node
/**
 * Diagnostic script to check device registration status
 * Usage: node scripts/diagnose-device.js [device_serial]
 */

require('dotenv').config();
const pool = require('../config/db');

async function diagnoseDevice(deviceSerial) {
  try {
    console.log('\n=== DEVICE DIAGNOSTICS ===\n');

    if (!deviceSerial) {
      console.log('ERROR: Device serial not provided');
      console.log('Usage: node scripts/diagnose-device.js DEVICE_SERIAL\n');
      process.exit(1);
    }

    console.log(`Checking device: ${deviceSerial}\n`);

    // Check device_registrations table
    const [registrations] = await pool.query(
      'SELECT id, user_id, api_key, status FROM device_registrations WHERE device_serial = ?',
      [deviceSerial]
    );

    if (!registrations.length) {
      console.log('❌ ISSUE 1: Device NOT found in device_registrations table');
      console.log('   Action: Admin must create device registration first\n');
      process.exit(1);
    }

    const reg = registrations[0];
    console.log('✓ Device found in device_registrations:');
    console.log(`  - ID: ${reg.id}`);
    console.log(`  - API Key: ${reg.api_key ? reg.api_key.substring(0, 8) + '...' : 'MISSING'}`);
    console.log(`  - User ID: ${reg.user_id || 'NOT SET (UNLINKED)'}`);
    console.log(`  - Status: ${reg.status}\n`);

    // Check if linked to user
    if (!reg.user_id) {
      console.log('❌ ISSUE 2: Device is NOT linked to any user');
      console.log('   This causes 403 "Device not linked to any user account"\n');
      console.log('   ACTION: Admin must link this device to a farmer account\n');
      process.exit(1);
    }

    // Check user exists and is active
    const [users] = await pool.query(
      'SELECT id, username, status, device_serial_number FROM users WHERE id = ?',
      [reg.user_id]
    );

    if (!users.length) {
      console.log('❌ ISSUE 3: User account NOT found');
      console.log(`   User ID ${reg.user_id} does not exist in users table\n`);
      process.exit(1);
    }

    const user = users[0];
    console.log('✓ User account found:');
    console.log(`  - Username: ${user.username}`);
    console.log(`  - Status: ${user.status}`);
    console.log(`  - Device Serial: ${user.device_serial_number || 'NOT SET'}\n`);

    // Check if user is active
    if (user.status !== 'active') {
      console.log(`❌ ISSUE 4: User account is INACTIVE (status: ${user.status})`);
      console.log('   This causes 403 "Associated user account is inactive"\n');
      console.log('   ACTION: Activate user account in admin panel\n');
      process.exit(1);
    }

    // Check if device serial matches user's device_serial_number
    if (user.device_serial_number !== deviceSerial) {
      console.log('⚠️  WARNING: Device serial in user row does not match');
      console.log(`   - User's device_serial_number: ${user.device_serial_number || 'NOT SET'}`);
      console.log(`   - Registration device_serial: ${deviceSerial}\n`);
    }

    console.log('✅ Device looks good!');
    console.log('   Device is registered, linked to user, and user is active.\n');
    console.log('If you still get 403 errors:');
    console.log('1. Verify API_KEY in firmware matches: ' + reg.api_key.substring(0, 8) + '...');
    console.log('2. Check that device is sending correct x-device-serial header');
    console.log('3. Verify backend is running on 192.168.137.209:5000\n');

  } catch (error) {
    console.error('\n❌ Database error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

const serial = process.argv[2];
diagnoseDevice(serial);
