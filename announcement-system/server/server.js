require('dotenv').config();
const express = require('express');
const app = express();
const announcements = require('./routes/announcements');
const pool = require('./config/db');

app.use(express.json());
app.use('/api/announcements', announcements);

const port = process.env.PORT || 5001;
app.listen(port, async () => {
  try {
    await pool.getConnection();
    console.log(`Announcement API running on port ${port}`);
  } catch (err) {
    console.warn('DB connection failed:', err.message);
  }
});