require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/, /^http:\/\/192\.168\.110\.7:\d+$/],
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
  /^http:\/\/192\.168\.110\.7:\d+$/,
];

// Middleware
app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    const isAllowed = allowedOrigins.some((pattern) => pattern.test(origin));
    if (isAllowed) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));
// Hero media uploads may be sent as base64 data-URLs from the frontend.
// Base64 expands payload size, so keep this limit comfortably above the UI file limit.
app.use(express.json({ limit: process.env.REQUEST_BODY_LIMIT || '1000mb' }));

// Return a clear 400 response for invalid JSON payloads
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
  }
  next(err);
});

// Serve uploaded video/image files as static assets
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
const { router: authRoutes } = require('./routes/auth');

const usersRoutes = require('./routes/users');
const devicesRoutes = require('./routes/devices');
const sensorsRoutes = require('./routes/sensors');
const transactionsRoutes = require('./routes/transactions');
const incubatorsRoutes = require('./routes/incubators');
const contactMessagesRoutes = require('./routes/contactMessages');
const heroMediaRoutes = require('./routes/heroMedia');
const contractsRoutes = require('./routes/contracts');
const notificationsRoutes = require('./routes/notifications');
const predictionsRoutes = require('./routes/predictions');
const recommendationsRoutes = require('./routes/recommendations');
const feedLogsRoutes = require('./routes/feedLogs');
const announcementsRoutes = require('./routes/announcements');

const teamMembersRoutes = require('./routes/teamMembers');
const productsRoutes = require('./routes/products');
const sellerApplicationsRoutes = require('./routes/sellerApplications');


app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api/sensors', sensorsRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/incubators', incubatorsRoutes);
app.use('/api/contact-messages', contactMessagesRoutes);
app.use('/api/hero-media', heroMediaRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/predictions', predictionsRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/feed-logs', feedLogsRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/team-members', teamMembersRoutes);
app.use('/api/seller-applications', sellerApplicationsRoutes);

// Products API
app.use('/api/products', productsRoutes);

// Auto-delete announcements older than 1 day
const db = require('./config/db');
const AUTO_DELETE_INTERVAL_MS = 60 * 60 * 1000; // Check every hour

setInterval(async () => {
  try {
    const [result] = await db.execute(
      'DELETE FROM announcements WHERE created_at < (NOW() - INTERVAL 1 DAY)'
    );
    if (result.affectedRows > 0) {
      console.log(`Auto-deleted ${result.affectedRows} old announcements`);
    }
  } catch (err) {
    console.error('Auto-delete error:', err.message);
  }
}, AUTO_DELETE_INTERVAL_MS);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Eco-Smart Poultry API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Something went wrong!' });
});

// Start server (bind to IPv4 so LAN/ESP32 can reach it)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Eco-Smart Poultry API running on port ${PORT}`);
  console.log(`📡 API available at http://localhost:${PORT}/api`);
  console.log(`🔌 WebSocket ready at ws://localhost:${PORT}`);
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`✓ Client connected: ${socket.id}`);

  // Join a prediction room for a specific user
  socket.on('join-predictions', (userId) => {
    if (userId) {
      socket.join(`predictions:${userId}`);
      console.log(`  └─ ${socket.id} joined predictions:${userId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`✗ Client disconnected: ${socket.id}`);
  });
});

// Export io instance for use in routes
module.exports.io = io;
