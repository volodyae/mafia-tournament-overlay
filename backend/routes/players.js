const express = require('express');
const router = express.Router();
const Player = require('../models/Player');

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
    const players = await Player.search(q);
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
router.post('/', async (req, res) => {
  try {
    const player = await Player.create(req.body);
    res.status(201).json(player);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/players/:id - Обновить игрока
router.put('/:id', async (req, res) => {
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
router.delete('/:id', async (req, res) => {
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
