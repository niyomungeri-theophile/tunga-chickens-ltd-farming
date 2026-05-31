const mysql = require('mysql2/promise');
const { Client } = require('pg');

const mysqlConfig = {
  host: 'localhost',
  user: 'root',
  password: '', // ← your MariaDB password
  database: 'eco_smart_poultry'
};
const path = require('path');

require('dotenv').config({
  path: path.resolve(__dirname, '.env')
});

const pgConnectionString = process.env.DATABASE_URL;

async function migrate() {
  // Connect to MySQL
  const mysql_conn = await mysql.createConnection(mysqlConfig);
  console.log('✅ Connected to MariaDB');

  // Connect to Neon
  const pg = new Client({ connectionString: pgConnectionString });
  await pg.connect();
  console.log('✅ Connected to Neon');

  // Get all tables
  const [tables] = await mysql_conn.query('SHOW TABLES');
  const tableNames = tables.map(row => Object.values(row)[0]);
  console.log('📋 Tables found:', tableNames);

  for (const table of tableNames) {
    try {
      console.log(`\n🔄 Migrating table: ${table}`);

      // Get table structure
      const [columns] = await mysql_conn.query(`DESCRIBE ${table}`);

      // Build CREATE TABLE for PostgreSQL
      const colDefs = columns.map(col => {
        const mappedType = mapType(col.Type);
        let def = `"${col.Field}" ${mappedType}`;

        if (col.Key === 'PRI' && col.Extra === 'auto_increment') {
          def = `"${col.Field}" SERIAL PRIMARY KEY`;
        } else {
          if (col.Default !== null) {
            if (
              col.Default === 'current_timestamp()' ||
              col.Default === 'CURRENT_TIMESTAMP'
            ) {
              def += ` DEFAULT CURRENT_TIMESTAMP`;
            } else if (mappedType === 'BOOLEAN' && !isNaN(col.Default)) {
              // ✅ Fix: convert 0/1 integer defaults to PostgreSQL boolean literals
              def += ` DEFAULT ${col.Default === '0' ? 'FALSE' : 'TRUE'}`;
            } else if (!isNaN(col.Default)) {
              def += ` DEFAULT ${col.Default}`;
            } else {
              def += ` DEFAULT '${col.Default}'`;
            }
          }
        }

        return def;
      });

      // Drop and recreate table
      await pg.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
      await pg.query(`CREATE TABLE "${table}" (${colDefs.join(', ')})`);
      console.log(`  ✅ Table "${table}" created`);

      // Get data
      const [rows] = await mysql_conn.query(`SELECT * FROM ${table}`);
      console.log(`  📦 ${rows.length} rows to insert`);

      if (rows.length > 0) {
        const cols = columns.map(c => `"${c.Field}"`).join(', ');

        // Insert in batches of 100
        const batchSize = 100;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          for (const row of batch) {
            const values = columns.map(col => {
              const val = row[col.Field];
              if (val === null || val === undefined) return null;
              if (val instanceof Date) return val.toISOString();
              if (typeof val === 'object') return JSON.stringify(val);
              return val;
            });
            const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
            try {
              await pg.query(
                `INSERT INTO "${table}" (${cols}) VALUES (${placeholders})`,
                values
              );
            } catch (insertErr) {
              console.warn(`  ⚠️ Row insert failed:`, insertErr.message);
            }
          }
          console.log(`  ✅ Inserted batch ${Math.floor(i / batchSize) + 1}`);
        }
      }

      console.log(`  ✅ Table "${table}" migrated successfully`);
    } catch (err) {
      console.error(`  ❌ Error migrating table ${table}:`, err.message);
    }
  }

  await mysql_conn.end();
  await pg.end();
  console.log('\n🎉 Migration complete!');
}

function mapType(mysqlType) {
  const type = mysqlType.toLowerCase();
  if (type.includes('int') && type.includes('unsigned')) return 'BIGINT';
  if (type.startsWith('tinyint(1)')) return 'BOOLEAN';
  if (type.startsWith('tinyint')) return 'SMALLINT';
  if (type.startsWith('smallint')) return 'SMALLINT';
  if (type.startsWith('mediumint')) return 'INTEGER';
  if (type.startsWith('bigint')) return 'BIGINT';
  if (type.startsWith('int')) return 'INTEGER';
  if (type.startsWith('float')) return 'REAL';
  if (type.startsWith('double')) return 'DOUBLE PRECISION';
  if (type.startsWith('decimal')) return type.replace('decimal', 'NUMERIC');
  if (type.startsWith('varchar')) return type.replace('varchar', 'VARCHAR');
  if (type.startsWith('char')) return type.replace('char', 'CHAR');
  if (type === 'text') return 'TEXT';
  if (type === 'mediumtext') return 'TEXT';
  if (type === 'longtext') return 'TEXT';
  if (type === 'json') return 'JSONB';
  if (type === 'datetime') return 'TIMESTAMP';
  if (type === 'timestamp') return 'TIMESTAMP';
  if (type === 'date') return 'DATE';
  if (type === 'time') return 'TIME';
  if (type.startsWith('enum')) return 'TEXT';
  if (type === 'blob') return 'BYTEA';
  return 'TEXT';
}

migrate().catch(console.error);