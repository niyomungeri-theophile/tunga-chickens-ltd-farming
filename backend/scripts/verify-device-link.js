const pool = require('../config/db');

async function main() {
  const serialNumber = process.argv[2];
  if (!serialNumber) {
    console.error('Usage: node scripts/verify-device-link.js <DEVICE_SERIAL_NUMBER>');
    process.exit(1);
  }

  try {
    const [users] = await pool.query(
      'SELECT id, full_name, email, role, device_serial_number FROM users WHERE device_serial_number = ? LIMIT 1',
      [serialNumber]
    );

    if (!users.length) {
      console.error(`No user found with device_serial_number = ${serialNumber}`);
      console.error('Fix: set the farmer\'s device serial number to match your ESP32 firmware.');
      process.exit(2);
    }

    const user = users[0];
    const userId = user.id;

    const queries = {
      latestSensors: pool.query('SELECT * FROM sensors WHERE user_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 1', [userId]),
      latestGas: pool.query('SELECT * FROM gas_readings WHERE user_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 1', [userId]),
      latestPower: pool.query('SELECT * FROM power_readings WHERE user_id = ? ORDER BY reading_time DESC, id DESC LIMIT 1', [userId]),
      latestStatus: pool.query('SELECT * FROM device_status WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1', [userId]),
      recentSensorCount: pool.query('SELECT COUNT(*) AS count FROM sensors WHERE user_id = ?', [userId]),
    };

    const [latestSensors] = await queries.latestSensors;
    const [latestGas] = await queries.latestGas;
    const [latestPower] = await queries.latestPower;
    const [latestStatus] = await queries.latestStatus;
    const [recentSensorCount] = await queries.recentSensorCount;

    const result = {
      linkedUser: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        deviceSerialNumber: user.device_serial_number,
      },
      dbWriteStatus: {
        sensorsRows: Number(recentSensorCount?.[0]?.count || 0),
        hasLatestSensors: Boolean(latestSensors?.[0]),
        hasLatestGas: Boolean(latestGas?.[0]),
        hasLatestPower: Boolean(latestPower?.[0]),
        hasLatestStatus: Boolean(latestStatus?.[0]),
      },
      latest: {
        sensors: latestSensors?.[0] || null,
        gas: latestGas?.[0] || null,
        power: latestPower?.[0] || null,
        status: latestStatus?.[0] || null,
      },
    };

    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Verification failed:', error?.message || error);
    console.error('If this says a table is missing, start the backend once so it auto-creates schema.');
    process.exit(3);
  }
}

main();
