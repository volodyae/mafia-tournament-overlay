const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const path = require('path');
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Делаем io доступным для всех routes через app
app.set('io', io);

// Import routes
const playersRouter = require('./routes/players');
const tournamentsRouter = require('./routes/tournaments');
const gamesRouter = require('./routes/games');
const uploadRouter = require('./routes/upload');

// API Routes
app.use('/api/players', playersRouter);
app.use('/api/tournaments', tournamentsRouter);
app.use('/api/games', gamesRouter);
app.use('/api/upload', uploadRouter);
app.use('/uploads', express.static(path.join(__dirname, '../frontend/uploads')));

// WebSocket setup
const gameEvents = require('./socket/gameEvents');
gameEvents(io);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Проверка подключения к БД и запуск сервера
const pool = require('./config/database');

async function startServer() {
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection verified');
    
    const PORT = process.env.PORT || 3000;
    const HOST = '0.0.0.0';

    server.listen(PORT, HOST, () => {
      console.log(`🚀 Server running on http://${HOST}:${PORT}`);
      console.log(`📺 Overlay: http://<YOUR_LAN_IP>:${PORT}/overlay/index.html`);
      console.log(`🎮 Admin: http://<YOUR_LAN_IP>:${PORT}/admin/index.html`);
      console.log(`⚡ WebSocket server ready`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    console.error('Please check your database configuration in .env file');
    process.exit(1);
  }
}

startServer();

module.exports = { app, io };
