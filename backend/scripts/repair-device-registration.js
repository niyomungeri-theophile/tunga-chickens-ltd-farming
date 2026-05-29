require('dotenv').config();
const pool = require('../config/db');

function parseArgs(argv) {
  const args = {
    apply: false,
    serial: '',
    chipId: '',
    userId: '',
    deviceName: 'Eco-Smart Poultry'
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];

    if (token === '--apply') args.apply = true;
    else if (token === '--serial') args.serial = String(next || '').trim();
    else if (token === '--chip-id') args.chipId = String(next || '').trim();
    else if (token === '--user-id') args.userId = String(next || '').trim();
    else if (token === '--device-name') args.deviceName = String(next || '').trim() || args.deviceName;
  }

  return args;
}

function generateApiKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 48; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv);

  try {
    const [orphans] = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.device_serial_number
       FROM users u
       LEFT JOIN device_registrations d ON d.device_serial = u.device_serial_number
       WHERE LOWER(u.role) = 'farmer'
         AND u.device_serial_number IS NOT NULL
         AND u.device_serial_number <> ''
         AND d.device_serial IS NULL
       ORDER BY u.created_at DESC`
    );

    console.log('Orphaned farmer serials:');
    if (orphans.length === 0) {
      console.log('- none');
    } else {
      for (const row of orphans) {
        console.log(`- ${row.full_name} (${row.email}) -> ${row.device_serial_number}`);
      }
    }

    if (!args.apply) {
      console.log('\nDry run only. Re-run with --apply and these required values:');
      console.log('  node backend/scripts/repair-device-registration.js --apply --serial NT-01-TCL --chip-id YOUR_ESP32_CHIP_ID --user-id USER_ID');
      return;
    }

    if (!args.serial || !args.chipId) {
      throw new Error('Both --serial and --chip-id are required when using --apply.');
    }

    let userId = args.userId;
    if (!userId) {
      const [matchedUsers] = await pool.query(
        `SELECT id FROM users WHERE device_serial_number = ? LIMIT 1`,
        [args.serial]
      );
      userId = matchedUsers?.[0]?.id || '';
    }

    if (!userId) {
      throw new Error('No matching user was found for that serial. Provide --user-id explicitly.');
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [existingDevice] = await conn.query(
        'SELECT device_serial, esp32_chip_id, user_id FROM device_registrations WHERE device_serial = ? OR esp32_chip_id = ? LIMIT 1',
        [args.serial, args.chipId]
      );

      if (existingDevice.length > 0) {
        throw new Error(`A device row already exists for serial ${existingDevice[0].device_serial} or chip ${existingDevice[0].esp32_chip_id}.`);
      }

      const apiKey = generateApiKey();

      await conn.query(
        `INSERT INTO device_registrations
         (device_serial, esp32_chip_id, user_id, device_name, api_key, status, first_seen, linked_at)
         VALUES (?, ?, ?, ?, ?, 'linked', NOW(), NOW())`,
        [args.serial, args.chipId, userId, args.deviceName, apiKey]
      );

      await conn.query(
        `INSERT INTO device_credentials (device_serial, api_key)
         VALUES (?, ?)` ,
        [args.serial, apiKey]
      );

      await conn.query(
        'UPDATE users SET device_serial_number = ? WHERE id = ?',
        [args.serial, userId]
      );

      await conn.commit();

      console.log('Repair applied successfully.');
      console.log(`- user_id: ${userId}`);
      console.log(`- device_serial: ${args.serial}`);
      console.log(`- esp32_chip_id: ${args.chipId}`);
      console.log(`- api_key: ${apiKey}`);
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('Repair failed:', error.message);
    process.exitCode = 1;
  }
}

main();