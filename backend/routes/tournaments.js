const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const {
  requireAuth,
  requireActiveSubscription,
  requireTournamentOwner
} = require('../middleware/auth');

// Получить список турниров (только свои, суперадмин видит все)
router.get('/', requireAuth, requireActiveSubscription, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'superadmin') {
      result = await pool.query(
        `SELECT t.*, u.username AS owner_username
         FROM tournaments t
         LEFT JOIN users u ON t.owner_id = u.id
         ORDER BY t.created_at DESC`
      );
    } else {
      result = await pool.query(
        `SELECT * FROM tournaments WHERE owner_id = $1 ORDER BY created_at DESC`,
        [req.user.id]
      );
    }
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting tournaments:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить один турнир
router.get('/:id', requireAuth, requireActiveSubscription, requireTournamentOwner, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM tournaments WHERE id = $1`,
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

// Создать турнир
router.post('/', requireAuth, requireActiveSubscription, async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, total_games, total_tables } = req.body;
    if (!name || !total_games) {
      return res.status(400).json({ error: 'name and total_games are required' });
    }
    await client.query('BEGIN');
    const tournamentId = uuidv4();
    const tablesCount = total_tables || 1;
    const tournamentResult = await client.query(
      `INSERT INTO tournaments (id, name, total_games, total_tables, owner_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tournamentId, name, total_games, tablesCount, req.user.id]
    );
<<<<<<< HEAD
        const gamesValues = [];
    const gamesParams = [];
    let paramIndex = 1;
    for (let gameNumber = 1; gameNumber <= total_games; gameNumber++) {
      gamesValues.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, 1, NULL)`);
      gamesParams.push(uuidv4(), tournamentId, gameNumber);
      paramIndex += 3;
    }
    if (gamesValues.length > 0) {
      await client.query(
        `INSERT INTO games (id, tournament_id, game_number, table_number, series_name) VALUES ${gamesValues.join(',')}`,
        gamesParams
=======
    const gamesValues = [];
    for (let gameNumber = 1; gameNumber <= total_games; gameNumber++) {
      gamesValues.push(`('${uuidv4()}', '${tournamentId}', ${gameNumber}, 1, NULL)`);
    }
    if (gamesValues.length > 0) {
      await client.query(
        `INSERT INTO games (id, tournament_id, game_number, table_number, series_name) VALUES ${gamesValues.join(',')}`
>>>>>>> b97b7072eb7decf4a1da26e2fa7ec060e7c7628f
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

// Обновить турнир
router.put('/:id', requireAuth, requireActiveSubscription, requireTournamentOwner, async (req, res) => {
  try {
    const { name, total_games, total_tables, status } = req.body;
    const result = await pool.query(
      `UPDATE tournaments
       SET name = COALESCE($1, name),
           total_games = COALESCE($2, total_games),
           total_tables = COALESCE($3, total_tables),
           status = COALESCE($4, status)
       WHERE id = $5 RETURNING *`,
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

// Удалить турнир
router.delete('/:id', requireAuth, requireActiveSubscription, requireTournamentOwner, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM tournaments WHERE id = $1 RETURNING *`,
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
router.get('/:id/players', requireAuth, requireTournamentOwner, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT tp.id AS tournament_player_id, p.*
       FROM tournament_players tp
       INNER JOIN players p ON tp.player_id = p.id
       WHERE tp.tournament_id = $1
       ORDER BY p.nickname ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting tournament players:', error);
    res.status(500).json({ error: error.message });
  }
});

// Добавить игроков в турнир
router.post('/:id/players', requireAuth, requireActiveSubscription, requireTournamentOwner, async (req, res) => {
  try {
    const tournamentId = req.params.id;
    const { player_ids } = req.body;
    if (!Array.isArray(player_ids) || player_ids.length === 0) {
      return res.status(400).json({ error: 'player_ids must be a non-empty array' });
    }
<<<<<<< HEAD
        const values = [];
    const params = [];
    let idx = 1;
    for (const playerId of player_ids) {
      values.push(`($${idx}, $${idx + 1}, $${idx + 2})`);
      params.push(uuidv4(), tournamentId, playerId);
      idx += 3;
    }
    await pool.query(
      `INSERT INTO tournament_players (id, tournament_id, player_id) VALUES ${values.join(',')} ON CONFLICT (tournament_id, player_id) DO NOTHING`,
      params
=======
    const values = player_ids
      .map(playerId => `('${uuidv4()}', '${tournamentId}', '${playerId}')`)
      .join(',');
    await pool.query(
      `INSERT INTO tournament_players (id, tournament_id, player_id) VALUES ${values} ON CONFLICT (tournament_id, player_id) DO NOTHING`
>>>>>>> b97b7072eb7decf4a1da26e2fa7ec060e7c7628f
    );
    const updated = await pool.query(
      `SELECT tp.id AS tournament_player_id, p.*
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
router.delete('/:id/players/:playerId', requireAuth, requireActiveSubscription, requireTournamentOwner, async (req, res) => {
  try {
    const tournamentId = req.params.id;
    const playerId = req.params.playerId;
    await pool.query(
      `DELETE FROM tournament_players WHERE tournament_id = $1 AND player_id = $2`,
      [tournamentId, playerId]
    );
    const updated = await pool.query(
      `SELECT tp.id AS tournament_player_id, p.*
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
router.get('/:id/games', requireAuth, requireTournamentOwner, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT g.*, COUNT(gs.id) AS seating_count
       FROM games g
       LEFT JOIN game_seating gs ON gs.game_id = g.id
       WHERE g.tournament_id = $1
       GROUP BY g.id
       ORDER BY g.game_number ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting tournament games:', error);
    res.status(500).json({ error: error.message });
  }
});

// Промежуточный итог турнира
router.get('/:id/standings', async (req, res) => {
  try {
    const tournamentId = req.params.id;
    const result = await pool.query(
      `SELECT
         p.id AS player_id, p.nickname, p.photo_url,
<<<<<<< HEAD
         COUNT(DISTINCT gps.game_id) AS games_played,
         COALESCE(SUM(gps.total_score), 0) AS total_score,
         -- Все доп.баллы = итог минус победные баллы (судья + ЛХ + Ci + штрафы)
         COALESCE(SUM(gps.total_score - gps.win_score), 0) AS total_extra,
         COUNT(DISTINCT gps.game_id) FILTER (WHERE gps.win_score = 1) AS wins,
         COUNT(DISTINCT gps.game_id) FILTER (WHERE gps.win_score = 1 AND gs.role IN ('don', 'sheriff')) AS wins_as_don_sheriff,
         COUNT(DISTINCT gps.game_id) FILTER (
           WHERE gr1.mafia_kill_player_id = gps.player_id
             AND gr1.mafia_miss = FALSE
             AND gs.team = 'red'
         ) AS first_night_deaths,
         COUNT(DISTINCT gps.game_id) FILTER (WHERE gps.win_score = 0 AND gs.role IN ('don', 'sheriff')) AS losses_as_don_sheriff
=======
         COUNT(gps.id) AS games_played,
         COALESCE(SUM(gps.total_score), 0) AS total_score,
         COALESCE(SUM(gps.judge_bonus), 0) AS total_judge_bonus,
         COUNT(*) FILTER (WHERE gps.win_score = 1) AS wins,
         COUNT(*) FILTER (WHERE gps.win_score = 1 AND gs.role IN ('don', 'sheriff')) AS wins_as_don_sheriff,
         COUNT(*) FILTER (WHERE gr_round1.mafia_kill_player_id = gps.player_id AND gr_round1.mafia_miss = FALSE) AS first_night_deaths,
         COUNT(*) FILTER (WHERE gps.win_score = 0 AND gs.role IN ('don', 'sheriff')) AS losses_as_don_sheriff
>>>>>>> b97b7072eb7decf4a1da26e2fa7ec060e7c7628f
       FROM game_player_scores gps
       INNER JOIN games g ON g.id = gps.game_id
       INNER JOIN game_results gres ON gres.game_id = g.id AND gres.confirmed = TRUE
       INNER JOIN players p ON p.id = gps.player_id
       LEFT JOIN game_seating gs ON gs.game_id = gps.game_id AND gs.player_id = gps.player_id
<<<<<<< HEAD
       LEFT JOIN game_rounds gr1 ON gr1.game_id = gps.game_id AND gr1.round_number = 1
       WHERE g.tournament_id = $1
       GROUP BY p.id, p.nickname, p.photo_url
       ORDER BY total_score DESC,
                total_extra DESC,
                wins DESC,
                wins_as_don_sheriff DESC,
                first_night_deaths DESC,
                losses_as_don_sheriff ASC,
                p.nickname ASC`,
=======
       LEFT JOIN game_rounds gr_round1 ON gr_round1.game_id = gps.game_id AND gr_round1.round_number = 1
       WHERE g.tournament_id = $1
       GROUP BY p.id, p.nickname, p.photo_url
       ORDER BY total_score DESC, total_judge_bonus DESC, wins DESC, wins_as_don_sheriff DESC,
                first_night_deaths DESC, losses_as_don_sheriff ASC, p.nickname ASC`,
>>>>>>> b97b7072eb7decf4a1da26e2fa7ec060e7c7628f
      [tournamentId]
    );
    res.json({ standings: result.rows });
  } catch (error) {
    console.error('Error getting tournament standings:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
