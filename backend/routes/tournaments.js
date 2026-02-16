const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');

// GET /api/tournaments - Получить все турниры
router.get('/', async (req, res) => {
  try {
    const tournaments = await Tournament.getAll();
    res.json(tournaments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/tournaments/:id - Получить турнир по ID
router.get('/:id', async (req, res) => {
  try {
    const tournament = await Tournament.getById(req.params.id);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    res.json(tournament);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/tournaments - Создать турнир
router.post('/', async (req, res) => {
  try {
    const { name, total_games, total_tables, player_ids } = req.body;
    
    const tournament = await Tournament.create({ name, total_games, total_tables });
    
    if (player_ids && player_ids.length > 0) {
      await Tournament.addPlayers(tournament.id, player_ids);
    }
    
    res.status(201).json(tournament);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/tournaments/:id/players - Получить игроков турнира
router.get('/:id/players', async (req, res) => {
  try {
    const players = await Tournament.getPlayers(req.params.id);
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/tournaments/:id - Удалить турнир
router.delete('/:id', async (req, res) => {
  try {
    const tournament = await Tournament.delete(req.params.id);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    res.json({ message: 'Tournament deleted', tournament });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
