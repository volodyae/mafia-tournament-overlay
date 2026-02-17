const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const Game = require('../models/Game');

// Получить игру с полными данными
router.get('/:id', async (req, res) => {
  try {
    const game = await Game.getFullData(req.params.id);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    res.json(game);
  } catch (error) {
    console.error('Error getting game:', error);
    res.status(500).json({ error: error.message });
  }
});

// Создать игру
router.post('/', async (req, res) => {
  try {
    const { tournament_id, game_number, table_number, series_name } = req.body;
    const game = await Game.create({ tournament_id, game_number, table_number, series_name });
    res.status(201).json(game);
  } catch (error) {
    console.error('Error creating game:', error);
    res.status(500).json({ error: error.message });
  }
});

// Создать или обновить рассадку игры, сохраняя роли
router.post('/:id/seating', async (req, res) => {
  const client = await pool.connect();

  try {
    const gameId = req.params.id;
    const { seating } = req.body;

    if (!Array.isArray(seating) || seating.length !== 10) {
      return res.status(400).json({ error: 'seating must be an array of 10 items' });
    }

    await client.query('BEGIN');

    // Текущая рассадка с ролями
    const currentRes = await client.query(
      'SELECT player_id, role, team FROM game_seating WHERE game_id = $1',
      [gameId]
    );
    const currentMap = new Map(
      currentRes.rows.map(row => [row.player_id, { role: row.role, team: row.team }])
    );

    // Удаляем старую рассадку
    await client.query('DELETE FROM game_seating WHERE game_id = $1', [gameId]);

    // Вставляем новую, роли сохраняем по player_id
    for (const seat of seating) {
      const prev = currentMap.get(seat.player_id) || { role: 'civilian', team: 'red' };

      await client.query(
        `INSERT INTO game_seating (id, game_id, player_id, position, role, team)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), gameId, seat.player_id, seat.position, prev.role, prev.team]
      );
    }

    await client.query('COMMIT');

    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving seating:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Назначить роли
router.post('/:id/roles', async (req, res) => {
  const client = await pool.connect();

  try {
    const gameId = req.params.id;
    const { roles } = req.body;

    if (!Array.isArray(roles) || roles.length !== 10) {
      return res.status(400).json({ error: 'roles must be an array of 10 items' });
    }

    await client.query('BEGIN');

    for (const r of roles) {
      await client.query(
        `UPDATE game_seating 
         SET role = $1, team = $2
         WHERE game_id = $3 AND position = $4`,
        [r.role, r.team, gameId, r.position]
      );
    }

    await client.query('COMMIT');

    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error assigning roles:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Обновить список выставленных на голосование (с сохранением порядка)
router.put('/:id/nominees', async (req, res) => {
  try {
    const gameId = req.params.id;
    const { player_ids } = req.body;

    if (!Array.isArray(player_ids)) {
      return res.status(400).json({ error: 'player_ids must be an array' });
    }

    await pool.query('DELETE FROM voting_nominees WHERE game_id = $1', [gameId]);

    for (let index = 0; index < player_ids.length; index++) {
      const playerId = player_ids[index];
      await pool.query(
        `INSERT INTO voting_nominees (id, game_id, player_id, position)
         VALUES ($1, $2, $3, $4)`,
        [uuidv4(), gameId, playerId, index + 1]
      );
    }

    const nominees = await pool.query(
      `SELECT vn.*, p.nickname
       FROM voting_nominees vn
       INNER JOIN players p ON vn.player_id = p.id
       WHERE vn.game_id = $1
       ORDER BY vn.position ASC`,
      [gameId]
    );

    res.json(nominees.rows);
  } catch (error) {
    console.error('Error updating nominees:', error);
    res.status(500).json({ error: error.message });
  }
});

// Добавить круг
router.post('/:id/rounds', async (req, res) => {
  try {
    const gameId = req.params.id;
    const {
      round_number,
      mafia_kill_player_id,
      mafia_miss,
      don_check_player_id,
      sheriff_check_player_id,
      voted_out_players,
      nobody_voted_out
    } = req.body;

    const result = await pool.query(
      `INSERT INTO game_rounds (
        id, game_id, round_number,
        mafia_kill_player_id, mafia_miss,
        don_check_player_id, sheriff_check_player_id,
        voted_out_players, nobody_voted_out
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (game_id, round_number) DO UPDATE SET
        mafia_kill_player_id = EXCLUDED.mafia_kill_player_id,
        mafia_miss = EXCLUDED.mafia_miss,
        don_check_player_id = EXCLUDED.don_check_player_id,
        sheriff_check_player_id = EXCLUDED.sheriff_check_player_id,
        voted_out_players = EXCLUDED.voted_out_players,
        nobody_voted_out = EXCLUDED.nobody_voted_out
      RETURNING *`,
      [
        uuidv4(),
        gameId,
        round_number,
        mafia_kill_player_id,
        mafia_miss,
        don_check_player_id,
        sheriff_check_player_id,
        JSON.stringify(voted_out_players || []),
        nobody_voted_out
      ]
    );

    const round = result.rows[0];

    // авто-обновление first_killed в best_move для круга 1
    if (round.round_number === 1) {
      let firstKilledPlayerId = null;
      if (!round.mafia_miss && round.mafia_kill_player_id) {
        firstKilledPlayerId = round.mafia_kill_player_id;
      }

      if (firstKilledPlayerId) {
        await pool.query(
          `INSERT INTO best_move (id, game_id, first_killed_player_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (game_id) DO UPDATE SET
             first_killed_player_id = EXCLUDED.first_killed_player_id`,
          [uuidv4(), gameId, firstKilledPlayerId]
        );
      }
    }

    res.json(round);
  } catch (error) {
    console.error('Error adding round:', error);
    res.status(500).json({ error: error.message });
  }
});

// Обновить круг
router.put('/:id/rounds/:roundNumber', async (req, res) => {
  try {
    const gameId = req.params.id;
    const roundNumber = parseInt(req.params.roundNumber, 10);
    const {
      mafia_kill_player_id,
      mafia_miss,
      don_check_player_id,
      sheriff_check_player_id,
      voted_out_players,
      nobody_voted_out
    } = req.body;

    const result = await pool.query(
      `UPDATE game_rounds SET
        mafia_kill_player_id = $1,
        mafia_miss = $2,
        don_check_player_id = $3,
        sheriff_check_player_id = $4,
        voted_out_players = $5,
        nobody_voted_out = $6
       WHERE game_id = $7 AND round_number = $8
       RETURNING *`,
      [
        mafia_kill_player_id,
        mafia_miss,
        don_check_player_id,
        sheriff_check_player_id,
        JSON.stringify(voted_out_players || []),
        nobody_voted_out,
        gameId,
        roundNumber
      ]
    );

    const round = result.rows[0];

    if (round && round.round_number === 1) {
      let firstKilledPlayerId = null;
      if (!round.mafia_miss && round.mafia_kill_player_id) {
        firstKilledPlayerId = round.mafia_kill_player_id;
      }

      if (firstKilledPlayerId) {
        await pool.query(
          `INSERT INTO best_move (id, game_id, first_killed_player_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (game_id) DO UPDATE SET
             first_killed_player_id = EXCLUDED.first_killed_player_id`,
          [uuidv4(), gameId, firstKilledPlayerId]
        );
      }
    }

    res.json(round);
  } catch (error) {
    console.error('Error updating round:', error);
    res.status(500).json({ error: error.message });
  }
});

// Установить лучший ход
router.post('/:id/best-move', async (req, res) => {
  try {
    const gameId = req.params.id;
    const {
      first_killed_player_id,
      suspect_1,
      suspect_2,
      suspect_3
    } = req.body;

    const result = await pool.query(
      `INSERT INTO best_move (id, game_id, first_killed_player_id, suspect_1, suspect_2, suspect_3)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (game_id) DO UPDATE SET
         first_killed_player_id = EXCLUDED.first_killed_player_id,
         suspect_1 = EXCLUDED.suspect_1,
         suspect_2 = EXCLUDED.suspect_2,
         suspect_3 = EXCLUDED.suspect_3
       RETURNING *`,
      [uuidv4(), gameId, first_killed_player_id, suspect_1, suspect_2, suspect_3]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error setting best move:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
