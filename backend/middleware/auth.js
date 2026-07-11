const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'mafia-overlay-secret-key-change-me';
const TOKEN_EXPIRY = '24h';

// Генерация токена
function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

// Middleware: проверка авторизации
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

// Middleware: только суперадмин
function requireSuperadmin(req, res, next) {
  if (!req.user || req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }
  next();
}

// Middleware: проверка активной подписки
async function requireActiveSubscription(req, res, next) {
  if (req.user.role === 'superadmin') {
    return next();
  }

  const pool = require('../config/database');
  try {
    const result = await pool.query(
      'SELECT subscription_until, is_active FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Аккаунт деактивирован' });
    }

    if (user.subscription_until && new Date(user.subscription_until) < new Date()) {
      return res.status(403).json({ error: 'Подписка истекла' });
    }

    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({ error: 'Ошибка проверки подписки' });
  }
}

// Middleware: проверка владельца турнира
async function requireTournamentOwner(req, res, next) {
  if (req.user.role === 'superadmin') {
    return next();
  }

  const pool = require('../config/database');
  const tournamentId = req.params.id || req.params.tournamentId || req.body.tournament_id;

  if (!tournamentId) {
    return next();
  }

  try {
    const result = await pool.query(
      'SELECT owner_id FROM tournaments WHERE id = $1',
      [tournamentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    if (result.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Нет доступа к этому турниру' });
    }

    next();
  } catch (error) {
    console.error('Tournament owner check error:', error);
    res.status(500).json({ error: 'Ошибка проверки доступа' });
  }
}

module.exports = {
  JWT_SECRET,
  generateToken,
  requireAuth,
  requireSuperadmin,
  requireActiveSubscription,
  requireTournamentOwner
};
