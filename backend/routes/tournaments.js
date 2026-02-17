// backend/routes/tournaments.js

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Получить список турниров
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM tournaments
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting tournaments:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить один турнир
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM tournaments
       WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting tournament:', error);
    res.status(500).json({ error: error.message });
  }
});

// Создать турнир + автоматически создать игры
router.post('/', async (req, res) => {
  const client = await pool.connect();

  try {
    const { name, total_games, total_tables } = req.body;

    if (!name || !total_games) {
      return res.status(400).json({ error: 'name and total_games are required' });
    }

    await client.query('BEGIN');

    const tournamentId = uuidv4();
    const tablesCount = total_tables || 1;

    // Создаём турнир
    const tournamentResult = await client.query(
      `INSERT INTO tournaments (id, name, total_games, total_tables)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [tournamentId, name, total_games, tablesCount]
    );

    // Генерируем игры: для простоты все игры на столе 1
    const gamesValues = [];
    for (let gameNumber = 1; gameNumber <= total_games; gameNumber++) {
      gamesValues.push(`('${uuidv4()}', '${tournamentId}', ${gameNumber}, 1, NULL)`);
    }

    if (gamesValues.length > 0) {
      await client.query(
        `INSERT INTO games (id, tournament_id, game_number, table_number, series_name)
         VALUES ${gamesValues.join(',')}`
      );
    }

    await client.query('COMMIT');

    res.status(201).json(tournamentResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating tournament with games:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});


// Обновить турнир (минимальный вариант: только имя и количество игр/столов)
router.put('/:id', async (req, res) => {
  try {
    const { name, total_games, total_tables, status } = req.body;

    const result = await pool.query(
      `UPDATE tournaments
       SET name = COALESCE($1, name),
           total_games = COALESCE($2, total_games),
           total_tables = COALESCE($3, total_tables),
           status = COALESCE($4, status)
       WHERE id = $5
       RETURNING *`,
      [name, total_games, total_tables, status, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating tournament:', error);
    res.status(500).json({ error: error.message });
  }
});

// Удалить турнир (каскадно с играми и связями)
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM tournaments
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    res.json({ message: 'Tournament deleted', tournament: result.rows[0] });
  } catch (error) {
    console.error('Error deleting tournament:', error);
    res.status(500).json({ error: error.message });
  }
});

// Игроки турнира
router.get('/:id/players', async (req, res) => {
  try {
    const tournamentId = req.params.id;

    const result = await pool.query(
      `SELECT tp.id AS tournament_player_id,
              p.*
       FROM tournament_players tp
       INNER JOIN players p ON tp.player_id = p.id
       WHERE tp.tournament_id = $1
       ORDER BY p.nickname ASC`,
      [tournamentId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error getting tournament players:', error);
    res.status(500).json({ error: error.message });
  }
});

// Добавить игроков в турнир
router.post('/:id/players', async (req, res) => {
  try {
    const tournamentId = req.params.id;
    const { player_ids } = req.body;

    if (!Array.isArray(player_ids) || player_ids.length === 0) {
      return res.status(400).json({ error: 'player_ids must be a non-empty array' });
    }

    const values = player_ids
      .map(playerId => `('${uuidv4()}', '${tournamentId}', '${playerId}')`)
      .join(',');

    await pool.query(
      `INSERT INTO tournament_players (id, tournament_id, player_id)
       VALUES ${values}
       ON CONFLICT (tournament_id, player_id) DO NOTHING`
    );

    const updated = await pool.query(
      `SELECT tp.id AS tournament_player_id,
              p.*
       FROM tournament_players tp
       INNER JOIN players p ON tp.player_id = p.id
       WHERE tp.tournament_id = $1
       ORDER BY p.nickname ASC`,
      [tournamentId]
    );

    res.json({ players: updated.rows });
  } catch (error) {
    console.error('Error adding players to tournament:', error);
    res.status(500).json({ error: error.message });
  }
});

// Удалить игрока из турнира
router.delete('/:id/players/:playerId', async (req, res) => {
  try {
    const tournamentId = req.params.id;
    const playerId = req.params.playerId;

    await pool.query(
      `DELETE FROM tournament_players
       WHERE tournament_id = $1 AND player_id = $2`,
      [tournamentId, playerId]
    );

    const updated = await pool.query(
      `SELECT tp.id AS tournament_player_id,
              p.*
       FROM tournament_players tp
       INNER JOIN players p ON tp.player_id = p.id
       WHERE tp.tournament_id = $1
       ORDER BY p.nickname ASC`,
      [tournamentId]
    );

    res.json({ players: updated.rows });
  } catch (error) {
    console.error('Error removing player from tournament:', error);
    res.status(500).json({ error: error.message });
  }
});

// Игры турнира
router.get('/:id/games', async (req, res) => {
  try {
    const tournamentId = req.params.id;

    const result = await pool.query(
      `SELECT g.*,
              COUNT(gs.id) AS seating_count
       FROM games g
       LEFT JOIN game_seating gs ON gs.game_id = g.id
       WHERE g.tournament_id = $1
       GROUP BY g.id
       ORDER BY g.game_number ASC`,
      [tournamentId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error getting tournament games:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
