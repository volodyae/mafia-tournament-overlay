const express = require('express');
const router = express.Router();
const Game = require('../models/Game');
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// GET /api/games/:id - Получить игру по ID
router.get('/:id', async (req, res) => {
  try {
    const game = await Game.getById(req.params.id);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/games - Создать игру
router.post('/', async (req, res) => {
  try {
    const game = await Game.create(req.body);
    res.status(201).json(game);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/games/:id/seating - Создать рассадку (ИСПРАВЛЕНО - без SQL-инъекций)
router.post('/:id/seating', async (req, res) => {
  const client = await pool.connect();
  try {
    const { seating } = req.body;
    
    await client.query('BEGIN');
    
    // Используем параметризованные запросы
    for (const s of seating) {
      await client.query(
        'INSERT INTO game_seating (id, game_id, position, player_id) VALUES ($1, $2, $3, $4)',
        [uuidv4(), req.params.id, s.position, s.player_id]
      );
    }
    
    await client.query('COMMIT');
    res.json({ message: 'Seating created' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// PUT /api/games/:id/roles - Назначить роли
router.put('/:id/roles', async (req, res) => {
  const client = await pool.connect();
  try {
    const { roles } = req.body;
    
    await client.query('BEGIN');
    
    for (const r of roles) {
      await client.query(
        'UPDATE game_seating SET role = $1, team = $2 WHERE game_id = $3 AND position = $4',
        [r.role, r.team, req.params.id, r.position]
      );
    }
    
    await client.query('COMMIT');
    res.json({ message: 'Roles assigned' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// POST /api/games/:id/best-move - Установить ЛХ
router.post('/:id/best-move', async (req, res) => {
  try {
    const { first_killed_player_id, suspect_1, suspect_2, suspect_3 } = req.body;
    
    await pool.query(
      `INSERT INTO best_move (id, game_id, first_killed_player_id, suspect_1, suspect_2, suspect_3)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (game_id) DO UPDATE SET
         first_killed_player_id = $3, suspect_1 = $4, suspect_2 = $5, suspect_3 = $6`,
      [uuidv4(), req.params.id, first_killed_player_id, suspect_1, suspect_2, suspect_3]
    );
    
    res.json({ message: 'Best move set' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/games/:id/nominees - Обновить выставленных (ИСПРАВЛЕНО)
router.post('/:id/nominees', async (req, res) => {
  const client = await pool.connect();
  try {
    const { player_ids } = req.body;
    
    await client.query('BEGIN');
    
    // Очистить текущих
    await client.query('DELETE FROM voting_nominees WHERE game_id = $1', [req.params.id]);
    
    // Добавить новых с параметризованными запросами
    if (player_ids && player_ids.length > 0) {
      for (let index = 0; index < player_ids.length; index++) {
        await client.query(
          'INSERT INTO voting_nominees (id, game_id, player_id, position) VALUES ($1, $2, $3, $4)',
          [uuidv4(), req.params.id, player_ids[index], index + 1]
        );
      }
    }
    
    await client.query('COMMIT');
    res.json({ message: 'Nominees updated' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// POST /api/games/:id/rounds - Добавить круг
router.post('/:id/rounds', async (req, res) => {
  try {
    const { 
      round_number, 
      mafia_kill_player_id, 
      mafia_miss,
      don_check_player_id,
      sheriff_check_player_id,
      voted_out_players,
      nobody_voted_out
    } = req.body;
    
    await pool.query(
      `INSERT INTO game_rounds (
        id, game_id, round_number, mafia_kill_player_id, mafia_miss,
        don_check_player_id, sheriff_check_player_id, voted_out_players, nobody_voted_out
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        uuidv4(), req.params.id, round_number, 
        mafia_kill_player_id || null, mafia_miss || false,
        don_check_player_id || null, sheriff_check_player_id || null,
        JSON.stringify(voted_out_players || []), nobody_voted_out || false
      ]
    );
    
    res.json({ message: 'Round added' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/tournaments/:tournamentId/games - Получить игры турнира
router.get('/tournaments/:tournamentId/games', async (req, res) => {
  try {
    const games = await Game.getByTournamentId(req.params.tournamentId);
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/games/:id/rounds/:roundNumber - Обновить круг
router.put('/:id/rounds/:roundNumber', async (req, res) => {
  try {
    const { gameId, roundNumber } = { gameId: req.params.id, roundNumber: parseInt(req.params.roundNumber) };
    await Game.updateRound(gameId, roundNumber, req.body);
    res.json({ message: 'Round updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
