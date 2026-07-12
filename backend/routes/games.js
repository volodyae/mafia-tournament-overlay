// c:\mafia-overlay\backend\routes\games.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const Game = require('../models/Game');
const { requireAuth } = require('../middleware/auth');

// Хелпер: достаём io из app в момент вызова, а не при загрузке модуля
function getIO(req) {
  return req.app.get('io');
}
// ============================================================
// РАСЧЁТ АВТО-ШТРАФА ЗА КАРТОЧКИ / УДАЛЕНИЕ
// ============================================================

// Считает авто-штраф (card_penalty) для одного игрока в конкретной игре.
// Логика:
//   - красная карточка ИЛИ удаление -> -0.5 (некритика) / -1 (критика)
//   - жёлтая карточка -> -0.15 * (порядковый номер жёлтой по турниру)
//   - красная и удаление не суммируются (взаимоисключающие)
// dbClient — pool или client (для работы внутри транзакции)
async function calcCardPenaltyForPlayer(dbClient, tournamentId, gameNumber, seat) {
  let penalty = 0;

  const isRemovedOrRed =
    seat.card === 'red' ||
    (seat.is_eliminated && seat.elimination_reason === 'removed');

  if (isRemovedOrRed) {
    // Удаление / красная карточка: -1 на критике, иначе -0.5
    penalty += seat.is_critical ? -1 : -0.5;
  }

  if (seat.card === 'yellow') {
    // Прогрессия жёлтых по турниру: считаем, какая это по счёту жёлтая
    // среди игр турнира с номером <= текущего (включительно) у этого игрока.
    const yellowRes = await dbClient.query(
      `SELECT COUNT(*) AS cnt
       FROM game_seating gs
       INNER JOIN games g ON g.id = gs.game_id
       WHERE g.tournament_id = $1
         AND g.game_number <= $2
         AND gs.player_id = $3
         AND gs.card = 'yellow'`,
      [tournamentId, gameNumber, seat.player_id]
    );
    const yellowIndex = parseInt(yellowRes.rows[0].cnt, 10) || 1;
    penalty += -0.15 * yellowIndex;
  }

  // Округляем до 2 знаков, чтобы не копить погрешность float
  return Math.round(penalty * 100) / 100;
}

// ============================================================
// КАСКАДНЫЙ ПЕРЕСЧЁТ ШТРАФОВ ПО ТУРНИРУ
// ============================================================

// Пересчитывает card_penalty и total_score во ВСЕХ подтверждённых играх
// турнира для указанного игрока. Вызывается при изменении карточки,
// удаления или критичности в любой игре.
async function recalcTournamentPenaltiesForPlayer(dbClient, tournamentId, playerId) {
  // Берём все подтверждённые игры турнира, где этот игрок есть в scores
  const gamesRes = await dbClient.query(
    `SELECT g.id AS game_id, g.game_number
     FROM games g
     INNER JOIN game_results gr ON gr.game_id = g.id AND gr.confirmed = TRUE
     INNER JOIN game_player_scores gps ON gps.game_id = g.id AND gps.player_id = $2
     WHERE g.tournament_id = $1
     ORDER BY g.game_number ASC`,
    [tournamentId, playerId]
  );

  for (const gameRow of gamesRes.rows) {
    // Данные посадки игрока в этой игре
    const seatRes = await dbClient.query(
      `SELECT player_id, card, is_eliminated, elimination_reason, is_critical
       FROM game_seating
       WHERE game_id = $1 AND player_id = $2`,
      [gameRow.game_id, playerId]
    );
    if (seatRes.rows.length === 0) continue;
    const seat = seatRes.rows[0];

    const newCardPenalty = await calcCardPenaltyForPlayer(
      dbClient, tournamentId, gameRow.game_number, seat
    );

    // Обновляем card_penalty и пересчитываем total_score
    await dbClient.query(
      `UPDATE game_player_scores
       SET card_penalty = $1,
           total_score = win_score + judge_bonus + penalty_score + $1 + lh_score + ci_score
       WHERE game_id = $2 AND player_id = $3`,
      [newCardPenalty, gameRow.game_id, playerId]
    );
  }
}

// Хелпер: получить tournament_id по game_id
async function getTournamentIdByGame(dbClient, gameId) {
  const res = await dbClient.query(
    'SELECT tournament_id FROM games WHERE id = $1',
    [gameId]
  );
  return res.rows[0]?.tournament_id || null;
}

// Получить игру по номеру внутри турнира
router.get('/by-number/:tournamentId/:gameNumber', async (req, res) => {
  try {
    const { tournamentId, gameNumber } = req.params;
    const result = await pool.query(
      'SELECT id FROM games WHERE tournament_id = $1 AND game_number = $2',
      [tournamentId, gameNumber]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const game = await Game.getFullData(result.rows[0].id);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json(game);
  } catch (error) {
    console.error('Error getting game by number:', error);
    res.status(500).json({ error: error.message });
  }
});

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
router.post('/', requireAuth, async (req, res) => {
  try {
    const { tournament_id, game_number, table_number, series_name } = req.body;
    const game = await Game.create({ tournament_id, game_number, table_number, series_name });
    res.status(201).json(game);
  } catch (error) {
    console.error('Error creating game:', error);
    res.status(500).json({ error: error.message });
  }
});

// Скрыть / показать оверлей
router.post('/:id/overlay-visibility', requireAuth, async (req, res) => {
  try {
    const gameId = req.params.id;
    const { overlay_hidden } = req.body;

    const result = await pool.query(
      `UPDATE games SET overlay_hidden = $1 WHERE id = $2 RETURNING *`,
      [overlay_hidden === true, gameId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating overlay visibility:', error);
    res.status(500).json({ error: error.message });
  }
});

// Создать или обновить рассадку игры, сохраняя роли
router.post('/:id/seating', requireAuth, async (req, res) => {
  const client = await pool.connect();

  try {
    const gameId = req.params.id;
    const { seating } = req.body;

    if (!Array.isArray(seating) || seating.length !== 10) {
      return res.status(400).json({ error: 'seating must be an array of 10 items' });
    }

    await client.query('BEGIN');

    const currentRes = await client.query(
      'SELECT player_id, role, team, is_eliminated, elimination_reason FROM game_seating WHERE game_id = $1',
      [gameId]
    );
    const currentMap = new Map(
      currentRes.rows.map(row => [row.player_id, { 
        role: row.role, 
        team: row.team,
        is_eliminated: row.is_eliminated,
        elimination_reason: row.elimination_reason
      }])
    );

    await client.query('DELETE FROM game_seating WHERE game_id = $1', [gameId]);

    for (const seat of seating) {
      const prev = currentMap.get(seat.player_id) || { 
        role: 'civilian', team: 'red', is_eliminated: false, elimination_reason: null
      };

      await client.query(
        `INSERT INTO game_seating (id, game_id, player_id, position, role, team, is_eliminated, elimination_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [uuidv4(), gameId, seat.player_id, seat.position, prev.role, prev.team, prev.is_eliminated, prev.elimination_reason]
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
router.post('/:id/roles', requireAuth, async (req, res) => {
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
        `UPDATE game_seating SET role = $1, team = $2 WHERE game_id = $3 AND position = $4`,
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

// Обновить список выставленных на голосование
router.put('/:id/nominees', requireAuth, async (req, res) => {
  try {
    const gameId = req.params.id;
    const { player_ids } = req.body;

    if (!Array.isArray(player_ids)) {
      return res.status(400).json({ error: 'player_ids must be an array' });
    }

    await pool.query('DELETE FROM voting_nominees WHERE game_id = $1', [gameId]);

    const uniqueIds = [...new Set(player_ids)];

    for (let index = 0; index < uniqueIds.length; index++) {
      const playerId = uniqueIds[index];
      await pool.query(
        `INSERT INTO voting_nominees (id, game_id, player_id, position) VALUES ($1, $2, $3, $4)`,
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
router.post('/:id/rounds', requireAuth, async (req, res) => {
  try {
    const gameId = req.params.id;
    const {
      round_number, mafia_kill_player_id, mafia_miss,
      don_check_player_id, sheriff_check_player_id,
      voted_out_players, nobody_voted_out
    } = req.body;

    const votedOutArray = Array.isArray(voted_out_players) ? voted_out_players : [];

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
        uuidv4(), gameId, round_number,
        mafia_kill_player_id || null, mafia_miss === true,
        don_check_player_id || null, sheriff_check_player_id || null,
        JSON.stringify(votedOutArray), nobody_voted_out === true
      ]
    );

    const round = result.rows[0];

    if (round.round_number === 1) {
      let firstKilledPlayerId = null;
      if (!round.mafia_miss && round.mafia_kill_player_id) {
        firstKilledPlayerId = round.mafia_kill_player_id;
      }

      if (firstKilledPlayerId) {
        // Есть первый убитый — записываем его, подозреваемых не трогаем
        await pool.query(
          `INSERT INTO best_move (id, game_id, first_killed_player_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (game_id) DO UPDATE SET first_killed_player_id = EXCLUDED.first_killed_player_id`,
          [uuidv4(), gameId, firstKilledPlayerId]
        );
      } else {
        // Убийство отменено/промах — ЛХ невозможен, обнуляем всё
        await pool.query(
          `UPDATE best_move
           SET first_killed_player_id = NULL, suspect_1 = NULL, suspect_2 = NULL, suspect_3 = NULL
           WHERE game_id = $1`,
          [gameId]
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
router.put('/:id/rounds/:roundNumber', requireAuth, async (req, res) => {
  try {
    const gameId = req.params.id;
    const roundNumber = parseInt(req.params.roundNumber, 10);
    const {
      mafia_kill_player_id, mafia_miss,
      don_check_player_id, sheriff_check_player_id,
      voted_out_players, nobody_voted_out
    } = req.body;

    const votedOutArray = Array.isArray(voted_out_players) ? voted_out_players : [];

    const result = await pool.query(
      `UPDATE game_rounds SET
        mafia_kill_player_id = $1, mafia_miss = $2,
        don_check_player_id = $3, sheriff_check_player_id = $4,
        voted_out_players = $5, nobody_voted_out = $6
       WHERE game_id = $7 AND round_number = $8
       RETURNING *`,
      [
        mafia_kill_player_id || null, mafia_miss === true,
        don_check_player_id || null, sheriff_check_player_id || null,
        JSON.stringify(votedOutArray), nobody_voted_out === true,
        gameId, roundNumber
      ]
    );

    const round = result.rows[0];

    if (round && round.round_number === 1) {
      let firstKilledPlayerId = null;
      if (!round.mafia_miss && round.mafia_kill_player_id) {
        firstKilledPlayerId = round.mafia_kill_player_id;
      }

      if (firstKilledPlayerId) {
        // Есть первый убитый — записываем его, подозреваемых не трогаем
        await pool.query(
          `INSERT INTO best_move (id, game_id, first_killed_player_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (game_id) DO UPDATE SET first_killed_player_id = EXCLUDED.first_killed_player_id`,
          [uuidv4(), gameId, firstKilledPlayerId]
        );
      } else {
        // Убийство отменено/промах — ЛХ невозможен, обнуляем всё
        await pool.query(
          `UPDATE best_move
           SET first_killed_player_id = NULL, suspect_1 = NULL, suspect_2 = NULL, suspect_3 = NULL
           WHERE game_id = $1`,
          [gameId]
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
router.post('/:id/best-move', requireAuth, async (req, res) => {
  try {
    const gameId = req.params.id;
    const { first_killed_player_id, suspect_1, suspect_2, suspect_3 } = req.body;

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

// Дисквалификация / восстановление игрока
router.post('/:id/player-elimination', requireAuth, async (req, res) => {
  try {
    const gameId = req.params.id;
    const { player_id, eliminated } = req.body;

    if (!player_id) {
      return res.status(400).json({ error: 'player_id is required' });
    }

    const makeRemoved = eliminated === true;

    const result = await pool.query(
      `UPDATE game_seating
       SET is_eliminated = $1,
           elimination_reason = CASE WHEN $1 = TRUE THEN 'removed' ELSE NULL END
       WHERE game_id = $2 AND player_id = $3
       RETURNING *`,
      [makeRemoved, gameId, player_id]
    );

        if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Seating record not found for this player in game' });
    }

    // Каскадный пересчёт штрафов по турниру для этого игрока
    const tournamentId = await getTournamentIdByGame(pool, gameId);
    if (tournamentId) {
      await recalcTournamentPenaltiesForPlayer(pool, tournamentId, player_id);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating player elimination:', error);
    res.status(500).json({ error: error.message });
  }
});
// Установить/снять критичность круга для игрока (для расчёта штрафа за удаление)
router.post('/:id/player-critical', requireAuth, async (req, res) => {
  try {
    const gameId = req.params.id;
    const { player_id, is_critical } = req.body;

    if (!player_id) {
      return res.status(400).json({ error: 'player_id is required' });
    }

    const result = await pool.query(
      `UPDATE game_seating SET is_critical = $1 WHERE game_id = $2 AND player_id = $3 RETURNING *`,
      [is_critical === true, gameId, player_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Seating record not found for this player in game' });
    }

    // Каскадный пересчёт штрафов по турниру для этого игрока
    const tournamentId = await getTournamentIdByGame(pool, gameId);
    if (tournamentId) {
      await recalcTournamentPenaltiesForPlayer(pool, tournamentId, player_id);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating player critical:', error);
    res.status(500).json({ error: error.message });
  }
});
// Изменение количества фолов игрока (инкремент/декремент, диапазон 0..4)
router.post('/:id/player-foul', requireAuth, async (req, res) => {
  try {
    const gameId = req.params.id;
    const { player_id, delta } = req.body;

    if (!player_id || (delta !== 1 && delta !== -1)) {
      return res.status(400).json({ error: 'Некорректные параметры (нужны player_id и delta = +1 или -1)' });
    }

    // Текущее значение
    const cur = await pool.query(
      `SELECT fouls FROM game_seating WHERE game_id = $1 AND player_id = $2`,
      [gameId, player_id]
    );
    if (cur.rows.length === 0) {
      return res.status(404).json({ error: 'Игрок в рассадке не найден' });
    }

    const current = cur.rows[0].fouls || 0;
    const newFouls = Math.max(0, Math.min(4, current + delta));

    const result = await pool.query(
      `UPDATE game_seating SET fouls = $1 WHERE game_id = $2 AND player_id = $3 RETURNING *`,
      [newFouls, gameId, player_id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating fouls:', error);
    res.status(500).json({ error: error.message });
  }
});

// Превью авто-штрафа за карточки/удаление для всех игроков игры
// (для предзаполнения модалки результата). Возвращает { player_id: penalty }
router.get('/:id/card-penalties', requireAuth, async (req, res) => {
  try {
    const gameId = req.params.id;

    const gameRes = await pool.query(
      'SELECT tournament_id, game_number FROM games WHERE id = $1',
      [gameId]
    );
    if (gameRes.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }
    const { tournament_id, game_number } = gameRes.rows[0];

    const seatingRes = await pool.query(
      `SELECT player_id, card, is_eliminated, elimination_reason, is_critical
       FROM game_seating WHERE game_id = $1`,
      [gameId]
    );

    const penalties = {};
    for (const seat of seatingRes.rows) {
      penalties[seat.player_id] = await calcCardPenaltyForPlayer(
        pool, tournament_id, game_number, seat
      );
    }

    res.json({ penalties });
  } catch (error) {
    console.error('Error getting card penalties preview:', error);
    res.status(500).json({ error: error.message });
  }
});

// Установить карточку игроку
router.post('/:id/player-card', requireAuth, async (req, res) => {
  try {
    const gameId = req.params.id;
    const { player_id, card } = req.body;

    if (!player_id) {
      return res.status(400).json({ error: 'player_id is required' });
    }

    let finalCard = 'none';
    if (card === 'yellow') finalCard = 'yellow';
    if (card === 'red') finalCard = 'red';

    const result = await pool.query(
      `UPDATE game_seating SET card = $1 WHERE game_id = $2 AND player_id = $3 RETURNING *`,
      [finalCard, gameId, player_id]
    );

        if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Seating record not found for this player in game' });
    }

    if (finalCard === 'red') {
      // Красная карточка — удаляем игрока
      await pool.query(
        `UPDATE game_seating SET is_eliminated = TRUE, elimination_reason = 'removed'
         WHERE game_id = $1 AND player_id = $2`,
        [gameId, player_id]
      );
    } else {
      // Карточка снята или изменена на жёлтую — снимаем удаление,
      // но только если игрок был удалён именно по красной карточке (reason = 'removed')
      await pool.query(
        `UPDATE game_seating SET is_eliminated = FALSE, elimination_reason = NULL
         WHERE game_id = $1 AND player_id = $2 AND elimination_reason = 'removed'`,
        [gameId, player_id]
      );
    }

        // Возвращаем актуальную запись после возможного снятия удаления
    const finalRow = await pool.query(
      `SELECT * FROM game_seating WHERE game_id = $1 AND player_id = $2`,
      [gameId, player_id]
    );

    // Каскадный пересчёт штрафов по турниру для этого игрока
    const tournamentId = await getTournamentIdByGame(pool, gameId);
    if (tournamentId) {
      await recalcTournamentPenaltiesForPlayer(pool, tournamentId, player_id);
    }

    res.json(finalRow.rows[0]);

  } catch (error) {
    console.error('Error updating player card:', error);
    res.status(500).json({ error: error.message });
  }
});

// Инициализировать результат игры
router.post('/:id/result-init', requireAuth, async (req, res) => {
  const gameId = req.params.id;
  const { winner_team } = req.body;

  if (!['red', 'black', 'draw'].includes(winner_team)) {
    return res.status(400).json({ error: 'Invalid winner_team' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO game_results (id, game_id, winner_team, confirmed)
       VALUES ($1, $2, $3, FALSE)
       ON CONFLICT (game_id) DO UPDATE
         SET winner_team = EXCLUDED.winner_team, confirmed = FALSE`,
      [uuidv4(), gameId, winner_team]
    );

    const seatingRes = await client.query(
      `SELECT position, player_id FROM game_seating WHERE game_id = $1 ORDER BY position ASC`,
      [gameId]
    );

    await client.query('DELETE FROM game_player_scores WHERE game_id = $1', [gameId]);

    for (const seat of seatingRes.rows) {
      await client.query(
        `INSERT INTO game_player_scores (id, game_id, player_id, position) VALUES ($1, $2, $3, $4)`,
        [uuidv4(), gameId, seat.player_id, seat.position]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error init game result:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Подтвердить результаты игры и посчитать баллы
router.post('/:id/result-confirm', requireAuth, async (req, res) => {
  const gameId = req.params.id;
  const { judge_scores } = req.body;
  const io = getIO(req);

  if (!Array.isArray(judge_scores) || judge_scores.length === 0) {
    return res.status(400).json({ error: 'judge_scores must be a non-empty array' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const resultRes = await client.query(
      `SELECT winner_team FROM game_results WHERE game_id = $1`,
      [gameId]
    );
    if (resultRes.rows.length === 0) {
      throw new Error('Game result not initialized');
    }
    const winnerTeam = resultRes.rows[0].winner_team;

    const gameRes = await client.query(
      `SELECT tournament_id, game_number FROM games WHERE id = $1`,
      [gameId]
    );
    const tournamentId = gameRes.rows[0].tournament_id;
    const gameNumber = gameRes.rows[0].game_number;


    const seatingRes = await client.query(
      `SELECT position, player_id, role, team, card, is_eliminated, elimination_reason, is_critical
       FROM game_seating WHERE game_id = $1`,
      [gameId]
    );

    const roundsRes = await client.query(
      `SELECT * FROM game_rounds WHERE game_id = $1 ORDER BY round_number ASC`,
      [gameId]
    );

    const bestMoveRes = await client.query(
      `SELECT * FROM best_move WHERE game_id = $1`,
      [gameId]
    );
    const bestMove = bestMoveRes.rows[0] || null;

    const seatingByPlayer = new Map(
      seatingRes.rows.map(s => [s.player_id, s])
    );

    const firstRound = roundsRes.rows.find(r => r.round_number === 1) || null;
    const firstKilledId =
      firstRound && !firstRound.mafia_miss ? firstRound.mafia_kill_player_id : null;

    // === Расчёт Ci ===
    let ciForFirstKilled = 0;

    if (firstKilledId) {
      const firstKilledSeat = seatingByPlayer.get(firstKilledId);

      if (firstKilledSeat && firstKilledSeat.team === 'red') {
        const tournamentRes = await client.query(
          `SELECT total_games FROM tournaments WHERE id = $1`,
          [tournamentId]
        );
        const totalGames = tournamentRes.rows[0]?.total_games || 0;
        const B = Math.max(4, Math.round(totalGames * 0.4));

        const firstKillCountRes = await client.query(
          `SELECT COUNT(*) AS cnt
           FROM game_rounds gr
           INNER JOIN games g ON g.id = gr.game_id
           INNER JOIN game_seating gs ON gs.game_id = gr.game_id AND gs.player_id = gr.mafia_kill_player_id
           WHERE g.tournament_id = $1
             AND gr.round_number = 1
             AND gr.mafia_miss = FALSE
             AND gr.mafia_kill_player_id = $2
             AND gs.team = 'red'`,
          [tournamentId, firstKilledId]
        );
        const i = parseInt(firstKillCountRes.rows[0].cnt, 10);

        const ciBase = i <= B ? (i * 0.4) / B : 0.4;

        const suspects = bestMove
          ? [bestMove.suspect_1, bestMove.suspect_2, bestMove.suspect_3].filter(Boolean)
          : [];

        let hasBlackInLH = false;
        for (const pid of suspects) {
          const s = seatingByPlayer.get(pid);
          if (s && (s.role === 'mafia' || s.role === 'don')) {
            hasBlackInLH = true;
            break;
          }
        }

        const redWon = winnerTeam === 'red';

        let ciMultiplier = 0;
        if (hasBlackInLH && !redWon) ciMultiplier = 1.0;
        else if (hasBlackInLH && redWon) ciMultiplier = 0.5;
        else if (!hasBlackInLH && !redWon) ciMultiplier = 0.5;
        else if (!hasBlackInLH && redWon) ciMultiplier = 0.25;

        ciForFirstKilled = Math.round(ciBase * ciMultiplier * 100) / 100;
      }
    }

    for (const js of judge_scores) {
      const seat = seatingByPlayer.get(js.player_id);
      if (!seat) continue;

      const judgeBonus = Number(js.bonus) || 0;
      // Ручной штраф судьи (минусы) — приходит отдельным полем
      const penaltyScore = Number(js.penalty) || 0;
      // При ничьей никто не получает балл за победу
      const winScore = (winnerTeam !== 'draw' && seat.team === winnerTeam) ? 1.0 : 0.0;

      let lhScore = 0;
      if (firstKilledId && seat.player_id === firstKilledId && seat.team === 'red') {
        const suspects = bestMove
          ? [bestMove.suspect_1, bestMove.suspect_2, bestMove.suspect_3].filter(Boolean)
          : [];
        let blackCount = 0;
        for (const pid of suspects) {
          const s = seatingByPlayer.get(pid);
          if (s && (s.role === 'mafia' || s.role === 'don')) blackCount++;
        }
        if (blackCount >= 3) lhScore = 0.5;
        else if (blackCount >= 2) lhScore = 0.3;
      }

            let ciScore = 0;
      if (firstKilledId && seat.player_id === firstKilledId && seat.team === 'red') {
        ciScore = ciForFirstKilled;
      }

      // Авто-штраф за карточки берём из модалки (судья мог его поправить).
      // Если по какой-то причине не пришёл — считаем сами как запасной вариант.
      let cardPenalty;
      if (js.card_penalty !== undefined && js.card_penalty !== null) {
        cardPenalty = Number(js.card_penalty) || 0;
      } else {
        cardPenalty = await calcCardPenaltyForPlayer(
          client, tournamentId, gameNumber, seat
        );
      }

      const total = winScore + judgeBonus + penaltyScore + cardPenalty + lhScore + ciScore;

      await client.query(
        `UPDATE game_player_scores
         SET judge_bonus = $1, win_score = $2, lh_score = $3, ci_score = $4,
             penalty_score = $5, card_penalty = $6, total_score = $7
         WHERE game_id = $8 AND player_id = $9`,
        [judgeBonus, winScore, lhScore, ciScore, penaltyScore, cardPenalty, total, gameId, seat.player_id]
      );
    }

    await client.query(
      `UPDATE game_results SET confirmed = TRUE WHERE game_id = $1`,
      [gameId]
    );

    await client.query('COMMIT');

    // Уведомляем через socket
    if (io) {
      io.to(`game_${gameId}`).emit('game_scores_confirmed', { gameId, tournamentId });
    }

    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error confirm game result:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Получить рассчитанную таблицу по игре
router.get('/:id/scores', async (req, res) => {
  try {
    const gameId = req.params.id;

    const resultRes = await pool.query(
      `SELECT * FROM game_results WHERE game_id = $1`,
      [gameId]
    );
    if (resultRes.rows.length === 0) {
      return res.status(404).json({ error: 'Game results not found' });
    }

    const scoresRes = await pool.query(
      `SELECT gps.*, p.nickname, p.photo_url, gs.role, gs.team
       FROM game_player_scores gps
       INNER JOIN players p ON gps.player_id = p.id
       INNER JOIN game_seating gs ON gs.game_id = gps.game_id AND gs.player_id = gps.player_id
       WHERE gps.game_id = $1
       ORDER BY gps.total_score DESC, gps.position ASC`,
      [gameId]
    );

    res.json({
      result: resultRes.rows[0],
      scores: scoresRes.rows
    });
  } catch (error) {
    console.error('Error getting game scores:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
