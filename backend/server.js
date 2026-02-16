const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
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
app.use(express.static('../frontend')); // Раздача статических файлов

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
app.use('/uploads', express.static('../frontend/uploads'));

// WebSocket setup
const gameEvents = require('./socket/gameEvents');
gameEvents(io);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📺 Overlay available at http://localhost:${PORT}/overlay/index.html`);
  console.log(`⚡ WebSocket server ready`);
});

module.exports = { io };
