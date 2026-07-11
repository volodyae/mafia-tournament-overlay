const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Tournament {
  // Получить все турниры
  static async getAll() {
    const result = await pool.query(
      'SELECT * FROM tournaments ORDER BY created_at DESC'
    );
    return result.rows;
  }

  // Получить турнир по ID
  static async getById(id) {
    const result = await pool.query(
      'SELECT * FROM tournaments WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  // Создать турнир
  static async create({ name, total_games, total_tables }) {
    const id = uuidv4();
    const result = await pool.query(
      'INSERT INTO tournaments (id, name, total_games, total_tables) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, name, total_games, total_tables]
    );
    return result.rows[0];
  }

<<<<<<< HEAD
    // Добавить игроков в турнир
  static async addPlayers(tournamentId, playerIds) {
    const values = [];
    const params = [];
    let idx = 1;
    for (const playerId of playerIds) {
      values.push(`($${idx}, $${idx + 1}, $${idx + 2})`);
      params.push(uuidv4(), tournamentId, playerId);
      idx += 3;
    }
    if (values.length === 0) return;
    await pool.query(
      `INSERT INTO tournament_players (id, tournament_id, player_id) VALUES ${values.join(',')} ON CONFLICT DO NOTHING`,
      params
=======
  // Добавить игроков в турнир
  static async addPlayers(tournamentId, playerIds) {
    const values = playerIds.map(playerId => `('${uuidv4()}', '${tournamentId}', '${playerId}')`).join(',');
    await pool.query(
      `INSERT INTO tournament_players (id, tournament_id, player_id) VALUES ${values} ON CONFLICT DO NOTHING`
>>>>>>> b97b7072eb7decf4a1da26e2fa7ec060e7c7628f
    );
  }

  // Получить игроков турнира
  static async getPlayers(tournamentId) {
    const result = await pool.query(
      `SELECT p.* FROM players p
       INNER JOIN tournament_players tp ON p.id = tp.player_id
       WHERE tp.tournament_id = $1
       ORDER BY p.nickname ASC`,
      [tournamentId]
    );
    return result.rows;
  }

  // Удалить турнир
  static async delete(id) {
    const result = await pool.query(
      'DELETE FROM tournaments WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }

// Удалить игрока из турнира
static async removePlayer(tournamentId, playerId) {
  await pool.query(
    'DELETE FROM tournament_players WHERE tournament_id = $1 AND player_id = $2',
    [tournamentId, playerId]
  );
}
}
module.exports = Tournament;
