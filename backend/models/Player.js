const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Player {
    // Получить всех игроков
    static async getAll() {
        const result = await pool.query(
            'SELECT * FROM players ORDER BY nickname ASC'
        );
        return result.rows;
    }

    // Получить игрока по ID
    static async getById(id) {
        const result = await pool.query(
            'SELECT * FROM players WHERE id = $1',
            [id]
        );
        return result.rows[0];
    }

    // Создать нового игрока
    static async create({ nickname, photo_url }) {
        const id = uuidv4();
        const result = await pool.query(
            'INSERT INTO players (id, nickname, photo_url) VALUES ($1, $2, $3) RETURNING *',
            [id, nickname, photo_url || null]
        );
        return result.rows[0];
    }

    // Обновить игрока
    static async update(id, { nickname, photo_url }) {
        const result = await pool.query(
            'UPDATE players SET nickname = $1, photo_url = $2 WHERE id = $3 RETURNING *',
            [nickname, photo_url, id]
        );
        return result.rows[0];
    }

    // Удалить игрока
    static async delete(id) {
        const result = await pool.query(
            'DELETE FROM players WHERE id = $1 RETURNING *',
            [id]
        );
        return result.rows[0];
    }

    // Поиск игроков по nickname
    static async search(query) {
        const result = await pool.query(
            'SELECT * FROM players WHERE nickname ILIKE $1 ORDER BY nickname ASC',
            [`%${query}%`]
        );
        return result.rows;
    }
}

module.exports = Player;