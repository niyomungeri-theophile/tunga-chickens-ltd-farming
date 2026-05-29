const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function main() {
  const email = 'niyomungeritheophile02@gmail.com';
  const password = 'admin123';
  const hash = await bcrypt.hash(password, 10);

  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    database: 'eco_smart_poultry',
    port: 3306,
  });

  const [result] = await connection.execute(
    'UPDATE users SET password = ? WHERE email = ?',
    [hash, email]
  );

  const [rows] = await connection.execute(
    'SELECT password FROM users WHERE email = ?',
    [email]
  );

  const matches = await bcrypt.compare(password, rows[0].password);
  console.log(JSON.stringify({ affectedRows: result.affectedRows, matches }, null, 2));

  await connection.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});