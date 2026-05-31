const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||"",
  ssl: {
    rejectUnauthorized: false // Required for Neon
  }
});

// Test connection
const testConnection = async () => {
  let client;
  try {
    client = await pool.connect();
    console.log('✅ PostgreSQL (Neon) Database connected successfully');
  } catch (error) {
    console.error('❌ PostgreSQL connection error:', error.message);
  } finally {
    if (client) client.release();
  }
};

testConnection();

module.exports = pool;