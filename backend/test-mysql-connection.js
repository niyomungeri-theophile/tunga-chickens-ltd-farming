// test-mysql-connection.js
const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'your_password', // <-- Replace with your actual MySQL password
  database: 'eco_smart_poultry',
  port: 3306
});

connection.connect((err) => {
  if (err) {
    console.error('MySQL connection failed:', err.message);
    process.exit(1);
  }
  console.log('MySQL connection successful!');
  connection.query('SELECT email, role FROM users', (err, results) => {
    if (err) {
      console.error('Query error:', err.message);
    } else {
      console.log('Users:', results);
    }
    connection.end();
  });
});
