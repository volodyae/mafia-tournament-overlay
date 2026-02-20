const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const { Server } = require('socket.io');

// Подгружаем переменные окружения (локально из .env, на Render они уже есть в process.env)
dotenv.config();

const app = express();
const server = http.createServer(app);

// Инициализация Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*', // при желании сузишь под конкретные домены
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// ===== Middleware =====
app.use(cors());
app.use(express.json());

// ===== Статика фронта =====
const frontendPath = path.join(__dirname, '../frontend');

// отдаем всё содержимое frontend (admin, overlay, config.js, uploads)
app.use(express.static(frontendPath));
app.use('/uploads', express.static(path.join(frontendPath, 'uploads')));

// ===== API роуты (все под /api) =====
const tournamentsRouter = require('./routes/tournaments');
const gamesRouter = require('./routes/games');
const playersRouter = require('./routes/players');
const uploadRouter = require('./routes/upload');

app.use('/api/tournaments', tournamentsRouter);
app.use('/api/games', gamesRouter);
app.use('/api/players', playersRouter);
app.use('/api/upload', uploadRouter);

// ===== Socket.IO события =====
const registerGameEvents = require('./socket/gameEvents');
registerGameEvents(io);

// ===== Маршруты для HTML =====

// Корень сайта — сразу админка
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'admin', 'index.html'));
});

// Админка (если открывают прямо /admin или /admin/index.html — статика уже работает,
// но можно оставить на всякий случай явный маршрут)
// app.get('/admin/*', (req, res) => {
//   res.sendFile(path.join(frontendPath, 'admin', 'index.html'));
// });

// Оверлей
app.get('/overlay/*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'overlay', 'index.html'));
});

// ===== Старт сервера =====
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
