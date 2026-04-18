const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const {
  generateToken,
  requireAuth,
  requireSuperadmin
} = require('../middleware/auth');

const SALT_ROUNDS = 10;

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Введите логин и пароль' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username.trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Аккаунт деактивирован' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    // Проверяем подписку (кроме суперадмина)
    if (user.role !== 'superadmin' && user.subscription_until) {
      if (new Date(user.subscription_until) < new Date()) {
        return res.status(403).json({ error: 'Подписка истекла. Обратитесь к администратору.' });
      }
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        subscription_until: user.subscription_until
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка авторизации' });
  }
});

// GET /api/auth/me — информация о текущем пользователе
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, role, subscription_until, is_active, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Укажите текущий и новый пароль' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }

    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    const match = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Неверный текущий пароль' });
    }

    const newHash = await bcrypt.hash(new_password, SALT_ROUNDS);
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newHash, req.user.id]
    );

    res.json({ success: true, message: 'Пароль изменён' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ (только superadmin) =====

// GET /api/auth/users
router.get('/users', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, role, subscription_until, is_active, created_at
       FROM users ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/users — создать пользователя
router.post('/users', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const { username, password, subscription_days } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Укажите логин и пароль' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }

    // Проверяем уникальность
    const existing = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username.trim().toLowerCase()]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Пользователь с таким логином уже существует' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    let subscriptionUntil = null;
    if (subscription_days && subscription_days > 0) {
      subscriptionUntil = new Date();
      subscriptionUntil.setDate(subscriptionUntil.getDate() + subscription_days);
    }

    const result = await pool.query(
      `INSERT INTO users (id, username, password_hash, role, subscription_until, is_active)
       VALUES ($1, $2, $3, 'user', $4, TRUE)
       RETURNING id, username, role, subscription_until, is_active, created_at`,
      [uuidv4(), username.trim().toLowerCase(), passwordHash, subscriptionUntil]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/auth/users/:id — обновить пользователя (продлить подписку и т.д.)
router.put('/users/:id', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const { subscription_days, is_active, new_password } = req.body;
    const userId = req.params.id;

    if (subscription_days !== undefined && subscription_days > 0) {
      // Продлеваем от текущей даты или от конца подписки
      const userRes = await pool.query(
        'SELECT subscription_until FROM users WHERE id = $1',
        [userId]
      );

      if (userRes.rows.length === 0) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      let baseDate = new Date();
      const currentSub = userRes.rows[0].subscription_until;
      if (currentSub && new Date(currentSub) > baseDate) {
        baseDate = new Date(currentSub);
      }

      baseDate.setDate(baseDate.getDate() + subscription_days);

      await pool.query(
        'UPDATE users SET subscription_until = $1 WHERE id = $2',
        [baseDate, userId]
      );
    }

    if (is_active !== undefined) {
      await pool.query(
        'UPDATE users SET is_active = $1 WHERE id = $2',
        [is_active, userId]
      );
    }

    if (new_password && new_password.length >= 6) {
      const hash = await bcrypt.hash(new_password, SALT_ROUNDS);
      await pool.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [hash, userId]
      );
    }

    const result = await pool.query(
      'SELECT id, username, role, subscription_until, is_active, created_at FROM users WHERE id = $1',
      [userId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/auth/users/:id
router.delete('/users/:id', requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 AND role != $2 RETURNING id, username',
      [req.params.id, 'superadmin']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден или нельзя удалить суперадмина' });
    }

    res.json({ success: true, deleted: result.rows[0] });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
