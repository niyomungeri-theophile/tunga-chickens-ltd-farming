require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'eco_smart_poultry',
    port: Number(process.env.DB_PORT || 3306),
  });

  await connection.query(`
    CREATE TABLE IF NOT EXISTS power_readings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36) NULL,
      device_serial VARCHAR(100) NULL,
      reading_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      power_source ENUM('SOLAR', 'GRID') DEFAULT 'SOLAR',
      voltage_dc DECIMAL(6,2) DEFAULT 13.2,
      current_dc DECIMAL(6,2) DEFAULT 1.8,
      grid_energy_kwh DECIMAL(12,4) DEFAULT 0,
      cost_rwf DECIMAL(12,2) DEFAULT 0,
      cost_usd DECIMAL(12,4) DEFAULT 0,
      battery_percent INT DEFAULT 95,
      battery_status VARCHAR(20) NULL,
      energy_note VARCHAR(100) NULL,
      INDEX idx_power_readings_user_id (user_id),
      INDEX idx_power_readings_device_serial (device_serial),
      INDEX idx_power_readings_reading_time (reading_time)
    )
  `);

  // Backwards compatibility: add columns if an older table exists.
  const alterStatements = [
    'ALTER TABLE power_readings ADD COLUMN user_id VARCHAR(36) NULL AFTER id',
    'ALTER TABLE power_readings ADD COLUMN device_serial VARCHAR(100) NULL',
    'ALTER TABLE power_readings ADD COLUMN reading_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    'ALTER TABLE power_readings ADD COLUMN power_source ENUM(\'SOLAR\',\'GRID\') DEFAULT \'SOLAR\'',
    'ALTER TABLE power_readings ADD COLUMN voltage_dc DECIMAL(6,2) DEFAULT 13.2',
    'ALTER TABLE power_readings ADD COLUMN current_dc DECIMAL(6,2) DEFAULT 1.8',
    'ALTER TABLE power_readings ADD COLUMN grid_energy_kwh DECIMAL(12,4) DEFAULT 0',
    'ALTER TABLE power_readings ADD COLUMN cost_rwf DECIMAL(12,2) DEFAULT 0',
    'ALTER TABLE power_readings ADD COLUMN cost_usd DECIMAL(12,4) DEFAULT 0',
    'ALTER TABLE power_readings ADD COLUMN battery_percent INT DEFAULT 95',
    'ALTER TABLE power_readings ADD COLUMN battery_status VARCHAR(20) NULL',
    'ALTER TABLE power_readings ADD COLUMN energy_note VARCHAR(100) NULL'
  ];

  for (const statement of alterStatements) {
    try {
      await connection.query(statement);
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') {
        throw error;
      }
    }
  }

  const [rows] = await connection.query('SELECT COUNT(*) AS count FROM power_readings');
  console.log(JSON.stringify(rows[0]));

  await connection.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});