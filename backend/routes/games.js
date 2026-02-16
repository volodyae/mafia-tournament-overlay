const express = require('express');
const router = express.Router();
const Game = require('../models/Game');
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// GET /api/games/:id - Получить полные данные игры
router.get('/:id', async (req, res) => {
  try {
    const gameData = await Game.getFullData(req.params.id);
    res.json(gameData);
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

// POST /api/games/:id/seating - Создать рассадку
router.post('/:id/seating', async (req, res) => {
  try {
    const { seating } = req.body; // массив [{position: 1, player_id: '...'}]
    
    const values = seating.map(s => 
      `('${uuidv4()}', '${req.params.id}', ${s.position}, '${s.player_id}')`
    ).join(',');
    
    await pool.query(
      `INSERT INTO game_seating (id, game_id, position, player_id) 
       VALUES ${values}`
    );
    
    res.json({ message: 'Seating created' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/games/:id/roles - Назначить роли
router.put('/:id/roles', async (req, res) => {
  try {
    const { roles } = req.body; // [{position: 1, role: 'don', team: 'black'}]
    
    for (const r of roles) {
      await pool.query(
        'UPDATE game_seating SET role = $1, team = $2 WHERE game_id = $3 AND position = $4',
        [r.role, r.team, req.params.id, r.position]
      );
    }
    
    res.json({ message: 'Roles assigned' });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

// POST /api/games/:id/nominees - Обновить выставленных
router.post('/:id/nominees', async (req, res) => {
    try {
        const { player_ids } = req.body; // Массив ID в нужном порядке
        
        // Очистить текущих
        await pool.query('DELETE FROM voting_nominees WHERE game_id = $1', [req.params.id]);
        
        // Добавить новых с сохранением порядка
        if (player_ids && player_ids.length > 0) {
            const values = player_ids.map((pid, index) => 
                `('${uuidv4()}', '${req.params.id}', '${pid}', ${index + 1})`
            ).join(',');
            
            await pool.query(
                `INSERT INTO voting_nominees (id, game_id, player_id, position) VALUES ${values}`
            );
        }
        
        res.json({ message: 'Nominees updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
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

module.exports = router;
