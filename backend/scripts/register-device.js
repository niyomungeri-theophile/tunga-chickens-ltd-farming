/**
 * Script to manually register an unregistered device
 * Usage: node scripts/register-device.js <device_serial> <esp32_chip_id> [user_id]
 */

const crypto = require('crypto');
const pool = require('../config/db');

function generateApiKey() {
  return crypto.randomBytes(24).toString('hex');
}

async function registerDevice(deviceSerial, chipId, userId) {
  if (!deviceSerial || !chipId) {
    console.error('❌ Usage: node scripts/register-device.js <device_serial> <esp32_chip_id> [user_id]');
    console.error('Example: node scripts/register-device.js NT-01-TCL 3c71050a3220');
    console.error('With user: node scripts/register-device.js NT-01-TCL 3c71050a3220 1');
    process.exit(1);
  }

  try {
    console.log(`\n📝 Registering device: ${deviceSerial}\n`);

    // Check if already exists
    const [existing] = await pool.query(
      'SELECT id FROM device_registrations WHERE device_serial = ? LIMIT 1',
      [deviceSerial]
    );

    if (existing.length > 0) {
      console.error(`❌ Device ${deviceSerial} already exists in database`);
      console.error('Use: node scripts/fix-device-registration.js to update it');
      process.exit(1);
    }

    const apiKey = generateApiKey();
    const status = userId ? 'linked' : 'registered';

    console.log('📋 Registration details:');
    console.table({
      'Serial': deviceSerial,
      'Chip ID': chipId,
      'API Key': `${apiKey.substring(0, 20)}...`,
      'User ID': userId || '(unassigned)',
      'Status': status
    });

    // Insert into device_registrations
    await pool.query(
      `INSERT INTO device_registrations 
       (device_serial, esp32_chip_id, api_key, user_id, status) 
       VALUES (?, ?, ?, ?, ?)`,
      [deviceSerial, chipId, apiKey, userId || null, status]
    );

    console.log('\n✅ Device registered successfully!\n');
    console.log('Device is now ready to authenticate with telemetry API');
    console.log(`API Key: ${apiKey}`);
    
    if (!userId) {
      console.log('\n⚠️  Device is not assigned to any user yet');
      console.log('Admin must link it to a farmer account via Device Manager\n');
    } else {
      console.log(`✅ Assigned to user ID: ${userId}\n`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

const deviceSerial = process.argv[2];
const chipId = process.argv[3];
const userId = process.argv[4];
registerDevice(deviceSerial, chipId, userId);
