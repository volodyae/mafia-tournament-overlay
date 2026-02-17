const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Game {
  // Получить все игры турнира
  static async getByTournament(tournamentId) {
    const result = await pool.query(
      'SELECT * FROM games WHERE tournament_id = $1 ORDER BY game_number ASC',
      [tournamentId]
    );
    return result.rows;
  }

  // Получить игру по ID
  static async getById(id) {
    const result = await pool.query(
      'SELECT * FROM games WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  // Создать игру
  static async create({ tournament_id, game_number, table_number, series_name }) {
    const id = uuidv4();
    const result = await pool.query(
      'INSERT INTO games (id, tournament_id, game_number, table_number, series_name) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, tournament_id, game_number, table_number || 1, series_name]
    );
    return result.rows[0];
  }

  // Получить полные данные игры (с рассадкой, ролями, кругами)
  static async getFullData(gameId) {
    try {
      const game = await this.getById(gameId);
      
      if (!game) {
        return null;
      }

      // Подтягиваем название турнира
      const tournamentResult = await pool.query(
        'SELECT name FROM tournaments WHERE id = $1',
        [game.tournament_id]
      );
      const tournamentName = tournamentResult.rows[0]?.name || null;
      
      // Рассадка с информацией об игроках
      const seating = await pool.query(
        `SELECT gs.*, p.nickname, p.photo_url 
         FROM game_seating gs
         INNER JOIN players p ON gs.player_id = p.id
         WHERE gs.game_id = $1
         ORDER BY gs.position ASC`,
        [gameId]
      );

      // Круги
      const rounds = await pool.query(
        'SELECT * FROM game_rounds WHERE game_id = $1 ORDER BY round_number ASC',
        [gameId]
      );

      // Обработать voted_out_players как массив
      const processedRounds = rounds.rows.map(round => {
        let votedOut = [];

        if (Array.isArray(round.voted_out_players)) {
          votedOut = round.voted_out_players;
        } else if (typeof round.voted_out_players === 'string' && round.voted_out_players.trim() !== '') {
          try {
            votedOut = JSON.parse(round.voted_out_players);
          } catch {
            votedOut = [];
          }
        }

        return {
          ...round,
          voted_out_players: votedOut
        };
      });

      // Лучший ход
      const bestMove = await pool.query(
        'SELECT * FROM best_move WHERE game_id = $1',
        [gameId]
      );

      // Текущие кандидаты
      const nominees = await pool.query(
        `SELECT vn.*, p.nickname 
         FROM voting_nominees vn
         INNER JOIN players p ON vn.player_id = p.id
         WHERE vn.game_id = $1
         ORDER BY vn.position ASC`,
        [gameId]
      );

      return {
        ...game,
        tournament_name: tournamentName,
        seating: seating.rows,
        rounds: processedRounds,
        best_move: bestMove.rows[0] || null,
        nominees: nominees.rows
      };
    } catch (error) {
      console.error('Error in getFullData:', error);
      throw error;
    }
  }
}

module.exports = Game;
