/**
 * Diagnostic script to check device registration issues
 * Usage: node scripts/diagnose-device-registration.js <device_serial>
 */

const pool = require('../config/db');

async function diagnoseDevice(deviceSerial) {
  if (!deviceSerial) {
    console.error('❌ Usage: node scripts/diagnose-device-registration.js <device_serial>');
    console.error('Example: node scripts/diagnose-device-registration.js NT-01-TCL');
    process.exit(1);
  }

  try {
    console.log(`\n🔍 Diagnosing device: ${deviceSerial}\n`);

    // 1. Check if device exists in device_registrations
    const [registrations] = await pool.query(
      `SELECT id, device_serial, api_key, esp32_chip_id, user_id, status, created_at, last_seen 
       FROM device_registrations 
       WHERE device_serial = ? 
       LIMIT 1`,
      [deviceSerial]
    );

    if (registrations.length === 0) {
      console.log('❌ Device NOT found in device_registrations table');
      console.log('\n📋 All registered devices:');
      const [allDevices] = await pool.query(
        `SELECT device_serial, user_id, status, api_key, esp32_chip_id 
         FROM device_registrations 
         ORDER BY created_at DESC 
         LIMIT 10`
      );
      console.table(allDevices);
      process.exit(0);
    }

    const device = registrations[0];
    console.log('✅ Device found in database:');
    console.table({
      'Device Serial': device.device_serial,
      'ESP32 Chip ID': device.esp32_chip_id || '(empty)',
      'API Key': device.api_key ? `${device.api_key.substring(0, 10)}...` : '(empty)',
      'User ID': device.user_id || '(not assigned)',
      'Status': device.status,
      'Created': device.created_at,
      'Last Seen': device.last_seen
    });

    // 2. Check API key validity
    if (!device.api_key) {
      console.log('\n⚠️  WARNING: Device has NO API key!');
      console.log('The device cannot authenticate because api_key is empty.');
    } else {
      console.log(`\n✅ API Key exists: ${device.api_key.substring(0, 20)}...`);
    }

    // 3. Check chip ID
    if (!device.esp32_chip_id) {
      console.log('⚠️  WARNING: Device has NO chip ID recorded!');
      console.log('The backend did not record the ESP32 chip ID when the device requested serial.');
    } else {
      console.log(`✅ Chip ID recorded: ${device.esp32_chip_id}`);
    }

    // 4. Check assignment status
    if (!device.user_id) {
      console.log('\n⚠️  Device is NOT assigned to any user');
      console.log('The device must be assigned by an admin in the Device Manager.');
      console.log('Status:', device.status);
    } else {
      const [user] = await pool.query(
        'SELECT id, email, status FROM users WHERE id = ? LIMIT 1',
        [device.user_id]
      );
      if (user.length > 0) {
        console.log(`\n✅ Device IS assigned to user:`);
        console.table({
          'User ID': user[0].id,
          'Email': user[0].email,
          'Status': user[0].status
        });
      }
    }

    // 5. Try to simulate telemetry auth
    console.log('\n🧪 Simulating telemetry authentication...');
    const [authTest] = await pool.query(
      `SELECT dr.user_id, dr.status, u.status as user_status 
       FROM device_registrations dr
       LEFT JOIN users u ON dr.user_id = u.id
       WHERE dr.device_serial = ? AND dr.api_key = ? LIMIT 1`,
      [deviceSerial, device.api_key]
    );

    if (authTest.length > 0) {
      console.log('✅ Device would PASS authentication for telemetry');
    } else {
      console.log('❌ Device would FAIL authentication for telemetry');
      console.log('The API key mismatch or device not found');
    }

    console.log('\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

const deviceSerial = process.argv[2];
diagnoseDevice(deviceSerial);
