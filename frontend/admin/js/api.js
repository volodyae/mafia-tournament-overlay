// frontend/admin/js/api.js

const API_BASE_URL = window.OVERLAY_CONFIG?.API_URL || 'http://localhost:3000/api';

const API = {
  async request(path, options = {}) {
    const url = `${API_BASE_URL}${path}`;

    const defaultHeaders = {
      'Content-Type': 'application/json'
    };

    const config = {
      method: options.method || 'GET',
      headers: { ...defaultHeaders, ...(options.headers || {}) }
    };

    if (options.body) {
      config.body = options.body;
    }

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const text = await response.text();
        console.error('API Error Response:', text);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (response.status === 204) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  // ===== Турниры =====
  async getTournaments() {
    return this.request('/tournaments');
  },

  async getTournament(id) {
    return this.request(`/tournaments/${id}`);
  },

  async createTournament(data) {
    return this.request('/tournaments', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateTournament(id, data) {
    return this.request(`/tournaments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteTournament(id) {
    return this.request(`/tournaments/${id}`, {
      method: 'DELETE'
    });
  },

  // ===== Игроки =====
  async getPlayers() {
    return this.request('/players');
  },

  async searchPlayers(query) {
    const q = encodeURIComponent(query);
    return this.request(`/players/search?q=${q}`);
  },

  async createPlayer(data) {
    return this.request('/players', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updatePlayer(id, data) {
    return this.request(`/players/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deletePlayer(id) {
    return this.request(`/players/${id}`, {
      method: 'DELETE'
    });
  },

  async getTournamentPlayers(tournamentId) {
    return this.request(`/tournaments/${tournamentId}/players`);
  },

  async addPlayersToTournament(tournamentId, playerIds) {
    return this.request(`/tournaments/${tournamentId}/players`, {
      method: 'POST',
      body: JSON.stringify({ player_ids: playerIds })
    });
  },

  async removePlayerFromTournament(tournamentId, playerId) {
    return this.request(`/tournaments/${tournamentId}/players/${playerId}`, {
      method: 'DELETE'
    });
  },

  // ===== Игры =====
  async getGame(gameId) {
    return this.request(`/games/${gameId}`);
  },

  async createGame(data) {
    return this.request('/games', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async getTournamentGames(tournamentId) {
    return this.request(`/tournaments/${tournamentId}/games`);
  },

  async setOverlayVisibility(gameId, overlay_hidden) {
    return this.request(`/games/${gameId}/overlay-visibility`, {
      method: 'POST',
      body: JSON.stringify({ overlay_hidden })
    });
  },

  // ===== Рассадка =====
  async createSeating(gameId, seating) {
    return this.request(`/games/${gameId}/seating`, {
      method: 'POST',
      body: JSON.stringify({ seating })
    });
  },

  // ===== Роли =====
  async assignRoles(gameId, roles) {
    return this.request(`/games/${gameId}/roles`, {
      method: 'POST',
      body: JSON.stringify({ roles })
    });
  },

  // ===== Выставленные на голосование =====
  async updateNominees(gameId, player_ids) {
    return this.request(`/games/${gameId}/nominees`, {
      method: 'PUT',
      body: JSON.stringify({ player_ids })
    });
  },

  // ===== Круги =====
  async addRound(gameId, roundData) {
    return this.request(`/games/${gameId}/rounds`, {
      method: 'POST',
      body: JSON.stringify(roundData)
    });
  },

  async updateRound(gameId, roundNumber, roundData) {
    return this.request(`/games/${gameId}/rounds/${roundNumber}`, {
      method: 'PUT',
      body: JSON.stringify(roundData)
    });
  },

  // ===== Лучший ход =====
  async setBestMove(gameId, data) {
    return this.request(`/games/${gameId}/best-move`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
};

window.API = API;
