// frontend/admin/js/api.js

const API_BASE_URL = window.OVERLAY_CONFIG?.API_URL || 'http://localhost:3000/api';

const API = {
  // Получить токен из localStorage
  getToken() {
    return localStorage.getItem('auth_token');
  },

  setToken(token) {
    localStorage.setItem('auth_token', token);
  },

  removeToken() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem('auth_user'));
    } catch {
      return null;
    }
  },

  setUser(user) {
    localStorage.setItem('auth_user', JSON.stringify(user));
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  isSuperadmin() {
    const user = this.getUser();
    return user && user.role === 'superadmin';
  },

  async request(path, options = {}) {
    const url = `${API_BASE_URL}${path}`;

    const defaultHeaders = {
      'Content-Type': 'application/json'
    };

    // Добавляем токен авторизации
    const token = this.getToken();
    if (token) {
      defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      method: options.method || 'GET',
      headers: { ...defaultHeaders, ...(options.headers || {}) }
    };

    if (options.body) {
      config.body = options.body;
    }

    try {
      const response = await fetch(url, config);

      // Если 401 — перенаправляем на логин
      if (response.status === 401) {
        this.removeToken();
        if (!window.location.pathname.includes('login.html')) {
          window.location.href = 'login.html';
        }
        throw new Error('Требуется авторизация');
      }

      if (response.status === 403) {
        const data = await response.json();
        throw new Error(data.error || 'Доступ запрещён');
      }

      if (!response.ok) {
        const text = await response.text();
        console.error('API Error Response:', text);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (response.status === 204) return null;
      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  // ===== Auth =====
  async login(username, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    this.setToken(data.token);
    this.setUser(data.user);
    return data;
  },

  logout() {
    this.removeToken();
    window.location.href = 'login.html';
  },

  async getMe() {
    return this.request('/auth/me');
  },

  async getUsers() {
    return this.request('/auth/users');
  },

  async createUser(data) {
    return this.request('/auth/users', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateUser(id, data) {
    return this.request(`/auth/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteUser(id) {
    return this.request(`/auth/users/${id}`, {
      method: 'DELETE'
    });
  },

  // ===== Турниры =====
  async getTournaments() { return this.request('/tournaments'); },
  async getTournament(id) { return this.request(`/tournaments/${id}`); },
  async createTournament(data) {
    return this.request('/tournaments', { method: 'POST', body: JSON.stringify(data) });
  },
  async updateTournament(id, data) {
    return this.request(`/tournaments/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async deleteTournament(id) {
    return this.request(`/tournaments/${id}`, { method: 'DELETE' });
  },

  // ===== Игроки =====
  async getPlayers() { return this.request('/players'); },
  async searchPlayers(query) {
    return this.request(`/players/search?q=${encodeURIComponent(query)}`);
  },
  async createPlayer(data) {
    return this.request('/players', { method: 'POST', body: JSON.stringify(data) });
  },
  async updatePlayer(id, data) {
    return this.request(`/players/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async deletePlayer(id) {
    return this.request(`/players/${id}`, { method: 'DELETE' });
  },
  async getTournamentPlayers(tournamentId) {
    return this.request(`/tournaments/${tournamentId}/players`);
  },
  async addPlayersToTournament(tournamentId, playerIds) {
    return this.request(`/tournaments/${tournamentId}/players`, {
      method: 'POST', body: JSON.stringify({ player_ids: playerIds })
    });
  },
  async removePlayerFromTournament(tournamentId, playerId) {
    return this.request(`/tournaments/${tournamentId}/players/${playerId}`, { method: 'DELETE' });
  },

  // ===== Игры =====
  async getGame(gameId) { return this.request(`/games/${gameId}`); },
  async createGame(data) {
    return this.request('/games', { method: 'POST', body: JSON.stringify(data) });
  },
  async getTournamentGames(tournamentId) {
    return this.request(`/tournaments/${tournamentId}/games`);
  },
  async setOverlayVisibility(gameId, overlay_hidden) {
    return this.request(`/games/${gameId}/overlay-visibility`, {
      method: 'POST', body: JSON.stringify({ overlay_hidden })
    });
  },
  async createSeating(gameId, seating) {
    return this.request(`/games/${gameId}/seating`, {
      method: 'POST', body: JSON.stringify({ seating })
    });
  },
  async assignRoles(gameId, roles) {
    return this.request(`/games/${gameId}/roles`, {
      method: 'POST', body: JSON.stringify({ roles })
    });
  },
  async updateNominees(gameId, player_ids) {
    return this.request(`/games/${gameId}/nominees`, {
      method: 'PUT', body: JSON.stringify({ player_ids })
    });
  },
  async addRound(gameId, roundData) {
    return this.request(`/games/${gameId}/rounds`, {
      method: 'POST', body: JSON.stringify(roundData)
    });
  },
  async updateRound(gameId, roundNumber, roundData) {
    return this.request(`/games/${gameId}/rounds/${roundNumber}`, {
      method: 'PUT', body: JSON.stringify(roundData)
    });
  },
  async setBestMove(gameId, data) {
    return this.request(`/games/${gameId}/best-move`, {
      method: 'POST', body: JSON.stringify(data)
    });
  },
  async setPlayerElimination(gameId, playerId, eliminated) {
    return this.request(`/games/${gameId}/player-elimination`, {
      method: 'POST', body: JSON.stringify({ player_id: playerId, eliminated })
    });
  },
  async setPlayerCard(gameId, playerId, card) {
    return this.request(`/games/${gameId}/player-card`, {
      method: 'POST', body: JSON.stringify({ player_id: playerId, card })
    });
  },
  async setPlayerCritical(gameId, playerId, is_critical) {
    return this.request(`/games/${gameId}/player-critical`, {
      method: 'POST', body: JSON.stringify({ player_id: playerId, is_critical })
    });
  },
  async setPlayerFoul(gameId, playerId, delta) {
  return this.request(`/games/${gameId}/player-foul`, {
    method: 'POST',
    body: JSON.stringify({ player_id: playerId, delta })
  });
},
    async getGameScores(gameId) {
    return this.request(`/games/${gameId}/scores`);
  },
    async setPlayerCritical(gameId, playerId, is_critical) {
    return this.request(`/games/${gameId}/player-critical`, {
      method: 'POST', body: JSON.stringify({ player_id: playerId, is_critical })
    });
  },
async getTournamentAccess(tournamentId) {
  return this.request(`/tournaments/${tournamentId}/access`);
},
async grantTournamentAccess(tournamentId, userId) {
  return this.request(`/tournaments/${tournamentId}/access`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId })
  });
},
async revokeTournamentAccess(tournamentId, userId) {
  return this.request(`/tournaments/${tournamentId}/access/${userId}`, {
    method: 'DELETE'
  });
},
  async getCardPenalties(gameId) {
    return this.request(`/games/${gameId}/card-penalties`);
  }
};

window.API = API;