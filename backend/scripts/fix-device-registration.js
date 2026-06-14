/**
 * Script to fix device registration issues
 * Ensures device has valid API key and is ready for telemetry
 * Usage: node scripts/fix-device-registration.js <device_serial> [esp32_chip_id]
 */

const crypto = require('crypto');
const pool = require('../config/db');

function generateApiKey() {
  return crypto.randomBytes(24).toString('hex');
}

async function fixDevice(deviceSerial, chipId) {
  if (!deviceSerial) {
    console.error('❌ Usage: node scripts/fix-device-registration.js <device_serial> [esp32_chip_id]');
    console.error('Example: node scripts/fix-device-registration.js NT-01-TCL 3c71050a3220');
    process.exit(1);
  }

  try {
    console.log(`\n🔧 Attempting to fix device: ${deviceSerial}\n`);

    // 1. Check if device exists
    const [existingDevice] = await pool.query(
      `SELECT id, device_serial, api_key, esp32_chip_id, user_id, status 
       FROM device_registrations 
       WHERE device_serial = ? 
       LIMIT 1`,
      [deviceSerial]
    );

    if (existingDevice.length === 0) {
      console.error(`❌ Device ${deviceSerial} not found in database`);
      process.exit(1);
    }

    const device = existingDevice[0];
    console.log('📋 Current device state:');
    console.table({
      'Serial': device.device_serial,
      'Chip ID': device.esp32_chip_id || '(missing)',
      'API Key': device.api_key ? 'exists' : '(MISSING)',
      'User ID': device.user_id || '(unassigned)',
      'Status': device.status
    });

    // 2. Check what needs fixing
    const needsApiKey = !device.api_key;
    const needsChipId = chipId && !device.esp32_chip_id;

    if (!needsApiKey && !needsChipId) {
      console.log('\n✅ Device looks OK - no fixes needed');
      console.log('\nNote: Device still needs admin assignment if user_id is null');
      process.exit(0);
    }

    // 3. Apply fixes
    console.log('\n🔨 Applying fixes...');

    if (needsApiKey) {
      const newApiKey = generateApiKey();
      await pool.query(
        'UPDATE device_registrations SET api_key = ? WHERE id = ?',
        [newApiKey, device.id]
      );
      console.log(`✅ Generated new API key: ${newApiKey.substring(0, 20)}...`);
    }

    if (needsChipId) {
      await pool.query(
        'UPDATE device_registrations SET esp32_chip_id = ? WHERE id = ?',
        [chipId, device.id]
      );
      console.log(`✅ Recorded chip ID: ${chipId}`);
    }

    // 4. Verify the fix
    const [updatedDevice] = await pool.query(
      `SELECT id, device_serial, api_key, esp32_chip_id, user_id, status 
       FROM device_registrations 
       WHERE device_serial = ? 
       LIMIT 1`,
      [deviceSerial]
    );

    const fixed = updatedDevice[0];
    console.log('\n📋 Fixed device state:');
    console.table({
      'Serial': fixed.device_serial,
      'Chip ID': fixed.esp32_chip_id || '(still missing)',
      'API Key': fixed.api_key ? '✅ exists' : '❌ missing',
      'User ID': fixed.user_id || '⚠️  (unassigned)',
      'Status': fixed.status
    });

    console.log('\n✨ Device should now be ready for telemetry!');
    console.log('📝 Next step: If device is not assigned to a user, admin must link it via Device Manager\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

const deviceSerial = process.argv[2];
const chipId = process.argv[3];
fixDevice(deviceSerial, chipId);
