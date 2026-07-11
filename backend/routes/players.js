const express = require('express');
const router = express.Router();
const Player = require('../models/Player');
<<<<<<< HEAD
const { requireAuth } = require('../middleware/auth');
=======
>>>>>>> b97b7072eb7decf4a1da26e2fa7ec060e7c7628f

// GET /api/players - Получить всех игроков
router.get('/', async (req, res) => {
  try {
    const players = await Player.getAll();
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/players/search?q=nickname - Поиск
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    const players = await Player.search(q || '');
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/players/:id - Получить игрока по ID
router.get('/:id', async (req, res) => {
  try {
    const player = await Player.getById(req.params.id);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.json(player);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/players - Создать игрока
<<<<<<< HEAD
router.post('/', requireAuth, async (req, res) => {
=======
router.post('/', async (req, res) => {
>>>>>>> b97b7072eb7decf4a1da26e2fa7ec060e7c7628f
  try {
    const player = await Player.create(req.body);
    res.status(201).json(player);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/players/:id - Обновить игрока
<<<<<<< HEAD
router.put('/:id', requireAuth, async (req, res) => {
=======
router.put('/:id', async (req, res) => {
>>>>>>> b97b7072eb7decf4a1da26e2fa7ec060e7c7628f
  try {
    const player = await Player.update(req.params.id, req.body);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.json(player);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/players/:id - Удалить игрока
<<<<<<< HEAD
router.delete('/:id', requireAuth, async (req, res) => {
=======
router.delete('/:id', async (req, res) => {
>>>>>>> b97b7072eb7decf4a1da26e2fa7ec060e7c7628f
  try {
    const player = await Player.delete(req.params.id);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.json({ message: 'Player deleted', player });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
