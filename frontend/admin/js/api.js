// Базовый URL API
const API_URL = 'http://localhost:3000/api';

// Утилита для HTTP-запросов
class API {
    static async request(endpoint, options = {}) {
        try {
            const response = await fetch(`${API_URL}${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Ошибка запроса');
            }
            
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // === ИГРОКИ ===
    static async getPlayers() {
        return this.request('/players');
    }

    static async getPlayer(id) {
        return this.request(`/players/${id}`);
    }

    static async createPlayer(data) {
        return this.request('/players', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    static async updatePlayer(id, data) {
        return this.request(`/players/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    static async deletePlayer(id) {
        return this.request(`/players/${id}`, {
            method: 'DELETE'
        });
    }

    static async searchPlayers(query) {
        return this.request(`/players/search?q=${encodeURIComponent(query)}`);
    }

    // === ТУРНИРЫ ===
    static async getTournaments() {
        return this.request('/tournaments');
    }

    static async getTournament(id) {
        return this.request(`/tournaments/${id}`);
    }

    static async createTournament(data) {
        return this.request('/tournaments', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    static async getTournamentPlayers(id) {
        return this.request(`/tournaments/${id}/players`);
    }

    static async deleteTournament(id) {
        return this.request(`/tournaments/${id}`, {
            method: 'DELETE'
        });
    }

    static async addPlayersToTournament(tournamentId, playerIds) {
        return this.request(`/tournaments/${tournamentId}/players`, {
            method: 'POST',
            body: JSON.stringify({ player_ids: playerIds })
        });
    }

    static async removePlayerFromTournament(tournamentId, playerId) {
        return this.request(`/tournaments/${tournamentId}/players/${playerId}`, {
            method: 'DELETE'
        });
    }

    // === ИГРЫ ===
    static async getGame(id) {
        return this.request(`/games/${id}`);
    }

    static async createGame(data) {
        return this.request('/games', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    static async createSeating(gameId, seating) {
        return this.request(`/games/${gameId}/seating`, {
            method: 'POST',
            body: JSON.stringify({ seating })
        });
    }

    static async assignRoles(gameId, roles) {
        return this.request(`/games/${gameId}/roles`, {
            method: 'PUT',
            body: JSON.stringify({ roles })
        });
    }

    static async setBestMove(gameId, data) {
        return this.request(`/games/${gameId}/best-move`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    static async updateNominees(gameId, playerIds) {
        return this.request(`/games/${gameId}/nominees`, {
            method: 'POST',
            body: JSON.stringify({ player_ids: playerIds })
        });
    }

    static async addRound(gameId, roundData) {
        return this.request(`/games/${gameId}/rounds`, {
            method: 'POST',
            body: JSON.stringify(roundData)
        });
    }

    static async updateRound(gameId, roundNumber, roundData) {
        return this.request(`/games/${gameId}/rounds/${roundNumber}`, {
            method: 'PUT',
            body: JSON.stringify(roundData)
        });
    }

    static async getTournamentGames(tournamentId) {
        return this.request(`/games/tournaments/${tournamentId}/games`);
    }
}

// Утилиты UI
class UI {
    // Показать уведомление
    static showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    // Показать загрузку
    static showLoading(container) {
        container.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Загрузка...</p>
            </div>
        `;
    }

    // Показать пустое состояние
    static showEmpty(container, message) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>${message}</h3>
            </div>
        `;
    }

    // Подтверждение действия
    static confirm(message) {
        return window.confirm(message);
    }

    // Форматирование даты
    static formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }
}
