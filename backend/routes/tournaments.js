const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');
const Game = require('../models/Game'); // ⬅️ добавили

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

    // 1) создаём турнир
    const tournament = await Tournament.create({ name, total_games, total_tables });

    // 2) при необходимости добавляем игроков в турнир
    if (player_ids && player_ids.length > 0) {
      await Tournament.addPlayers(tournament.id, player_ids);
    }

    // 3) автоматически создаём игры для каждого стола
    //    для каждого стола от 1 до total_tables
    //    для каждого game_number от 1 до total_games
    for (let table = 1; table <= total_tables; table++) {
      for (let gameNumber = 1; gameNumber <= total_games; gameNumber++) {
        await Game.create({
          tournament_id: tournament.id,
          game_number: gameNumber,
          table_number: table,
          series_name: null
        });
      }
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

// POST /api/tournaments/:id/players - Добавить игроков в турнир
router.post('/:id/players', async (req, res) => {
  try {
    const { player_ids } = req.body;

    if (!player_ids || !Array.isArray(player_ids) || player_ids.length === 0) {
      return res.status(400).json({ error: 'player_ids array is required' });
    }

    await Tournament.addPlayers(req.params.id, player_ids);
    const players = await Tournament.getPlayers(req.params.id);
    res.json({ message: 'Players added successfully', players });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/tournaments/:id/players/:playerId - Удалить игрока из турнира
router.delete('/:id/players/:playerId', async (req, res) => {
  try {
    await Tournament.removePlayer(req.params.id, req.params.playerId);
    const players = await Tournament.getPlayers(req.params.id);
    res.json({ message: 'Player removed successfully', players });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
