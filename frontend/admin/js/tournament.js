let tournamentId = null;
let tournament = null;
let games = [];
let players = [];
let allPlayers = []; // Все игроки в системе

// DOM элементы
const tournamentName = document.getElementById('tournamentName');
const tournamentMeta = document.getElementById('tournamentMeta');
const gamesList = document.getElementById('gamesList');
const tournamentPlayers = document.getElementById('tournamentPlayers');
const playersCount = document.getElementById('playersCount');
const createGameModal = document.getElementById('createGameModal');
const createGameForm = document.getElementById('createGameForm');
const closeGameModal = document.getElementById('closeGameModal');
const cancelGameBtn = document.getElementById('cancelGameBtn');

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    // Получить ID турнира из URL
    const urlParams = new URLSearchParams(window.location.search);
    tournamentId = urlParams.get('id');
    
    if (!tournamentId) {
        UI.showToast('Турнир не найден', 'error');
        setTimeout(() => window.location.href = 'index.html', 2000);
        return;
    }
    
    loadTournamentData();
    setupEventListeners();
});

// Загрузка данных турнира
async function loadTournamentData() {
    try {
        tournament = await API.getTournament(tournamentId);
        players = await API.getTournamentPlayers(tournamentId);
        allPlayers = await API.getPlayers();
        
        // Загружаем игры турнира
        games = await loadGames();
        
        renderTournamentHeader();
        renderPlayers();
        renderGames();
    } catch (error) {
        UI.showToast('Ошибка загрузки турнира', 'error');
        console.error(error);
    }
}

// Загрузка игр турнира
async function loadGames() {
    try {
        const games = await API.getTournamentGames(tournamentId);
        return games;
    } catch (error) {
        console.error(error);
        return [];
    }
}

// Отрисовка заголовка
function renderTournamentHeader() {
    tournamentName.textContent = tournament.name;
    tournamentMeta.innerHTML = `
        📅 ${UI.formatDate(tournament.created_at)} | 
        🎮 ${tournament.total_games} игр | 
        🪑 ${tournament.total_tables} столов
    `;
}

// Отрисовка игроков
function renderPlayers() {
    playersCount.textContent = players.length;
    
    if (players.length === 0) {
        UI.showEmpty(tournamentPlayers, 'Нет участников. Добавьте игроков в турнир.');
        return;
    }
    
    tournamentPlayers.innerHTML = players.map(player => `
        <div class="player-card" style="padding: 12px;">
            ${player.photo_url 
                ? `<img src="${player.photo_url}" alt="${player.nickname}" class="player-photo" style="width: 40px; height: 40px;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                   <div class="player-placeholder" style="width: 40px; height: 40px; font-size: 16px; display: none;">👤</div>`
                : `<div class="player-placeholder" style="width: 40px; height: 40px; font-size: 16px;">👤</div>`
            }
            <div class="player-info">
                <h4 style="font-size: 14px;">${player.nickname}</h4>
            </div>
        </div>
    `).join('');
}

// Отрисовка списка игр
function renderGames() {
    // Создаём массив игр по количеству из tournament.total_games
    const gameSlots = Array.from({ length: tournament.total_games }, (_, i) => {
        const gameNumber = i + 1;
        const existingGame = games.find(g => g.game_number === gameNumber);
        return existingGame || { game_number: gameNumber, created: false };
    });
    
    gamesList.innerHTML = gameSlots.map(game => {
        if (!game.created) {
            return `
                <div class="tournament-card">
                    <h3>🎮 ИГРА ${game.game_number}/${tournament.total_games}</h3>
                    <div class="tournament-meta">
                        ⚠️ Игра не создана
                    </div>
                    <button class="btn btn-primary create-game" data-game-number="${game.game_number}">
                        + Создать игру
                    </button>
                </div>
            `;
        }
        
        // Игра создана
        const hasSeating = game.seating_count && game.seating_count > 0;
        const statusText = game.status === 'in_progress' 
            ? '<span style="color: var(--success);">В процессе</span>'
            : game.status === 'finished'
            ? '<span style="color: var(--text-secondary);">Завершена</span>'
            : 'Не начата';
        
        return `
            <div class="tournament-card">
                <h3>🎮 ИГРА ${game.game_number}/${tournament.total_games}</h3>
                <div class="tournament-meta">
                    ${game.series_name ? `📺 ${game.series_name}<br>` : ''}
                    Стол ${game.table_number} | ${statusText}<br>
                    ${hasSeating ? `✅ Рассадка создана (${game.seating_count}/10)` : '⚠️ Рассадка не создана'}
                </div>
                <button class="btn btn-primary open-game" data-id="${game.id}">
                    ⚙️ ${hasSeating ? 'Управлять игрой' : 'Создать рассадку'}
                </button>
            </div>
        `;
    }).join('');
    
    // Обработчики кнопок
    document.querySelectorAll('.create-game').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('gameNumber').value = btn.dataset.gameNumber;
            createGameModal.classList.add('active');
        });
    });
    
    document.querySelectorAll('.open-game').forEach(btn => {
        btn.addEventListener('click', () => {
            window.location.href = `game.html?id=${btn.dataset.id}`;
        });
    });
}

// Создание игры
createGameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = {
        tournament_id: tournamentId,
        game_number: parseInt(document.getElementById('gameNumber').value),
        table_number: parseInt(document.getElementById('tableNumber').value),
        series_name: document.getElementById('seriesName').value.trim() || null
    };
    
    try {
        const newGame = await API.createGame(data);
        UI.showToast('Игра создана');
        createGameModal.classList.remove('active');
        
        // Перенаправляем на страницу игры для создания рассадки
        window.location.href = `game.html?id=${newGame.id}`;
    } catch (error) {
        UI.showToast('Ошибка создания игры', 'error');
        console.error(error);
    }
});

// Обработчики событий
function setupEventListeners() {
    // Закрытие модального окна создания игры
    closeGameModal.addEventListener('click', () => {
        createGameModal.classList.remove('active');
    });
    
    cancelGameBtn.addEventListener('click', () => {
        createGameModal.classList.remove('active');
    });
    
    createGameModal.addEventListener('click', (e) => {
        if (e.target === createGameModal) {
            createGameModal.classList.remove('active');
        }
    });
    
    // Управление игроками
    document.getElementById('managePlayers').addEventListener('click', async () => {
        await openManagePlayersModal();
    });
    
    // Закрытие модального окна управления игроками
    document.getElementById('closePlayersModal').addEventListener('click', () => {
        document.getElementById('managePlayersModal').classList.remove('active');
    });
    
    document.getElementById('managePlayersModal').addEventListener('click', (e) => {
        if (e.target.id === 'managePlayersModal') {
            e.target.classList.remove('active');
        }
    });
    
    // Добавление игрока в турнир
    document.getElementById('addPlayerSelect').addEventListener('change', async (e) => {
        const playerId = e.target.value;
        if (!playerId) return;
        
        try {
            const response = await API.addPlayersToTournament(tournamentId, [playerId]);
            players = response.players;
            UI.showToast('Игрок добавлен');
            
            // Обновить отображение
            renderPlayers();
            renderModalPlayersList();
            await populateAvailablePlayers();
            e.target.value = '';
        } catch (error) {
            UI.showToast('Ошибка добавления игрока', 'error');
            console.error(error);
        }
    });
}

// === УПРАВЛЕНИЕ ИГРОКАМИ ===

// Открыть модальное окно управления игроками
async function openManagePlayersModal() {
    const modal = document.getElementById('managePlayersModal');
    await populateAvailablePlayers();
    renderModalPlayersList();
    modal.classList.add('active');
}

// Заполнить список доступных игроков
async function populateAvailablePlayers() {
    const select = document.getElementById('addPlayerSelect');
    const playerIds = players.map(p => p.id);
    const availablePlayers = allPlayers.filter(p => !playerIds.includes(p.id));
    
    select.innerHTML = '<option value="">Выберите игрока</option>' + 
        availablePlayers.map(p => `<option value="${p.id}">${p.nickname}</option>`).join('');
}

// Отрисовать список игроков в модальном окне
function renderModalPlayersList() {
    const list = document.getElementById('modalPlayersList');
    document.getElementById('modalPlayersCount').textContent = players.length;
    
    if (players.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Нет участников</p></div>';
        return;
    }
    
    list.innerHTML = players.map(player => `
        <div class="player-card" style="display: flex; align-items: center; padding: 12px; margin-bottom: 8px; background: var(--card-bg); border-radius: 8px;">
            ${player.photo_url 
                ? `<img src="${player.photo_url}" alt="${player.nickname}" style="width: 40px; height: 40px; border-radius: 50%; margin-right: 12px; object-fit: cover;" onerror="this.style.display='none';">`
                : `<div style="width: 40px; height: 40px; border-radius: 50%; background: var(--accent); display: flex; align-items: center; justify-content: center; margin-right: 12px; font-size: 20px;">👤</div>`
            }
            <div style="flex: 1;">
                <strong>${player.nickname}</strong>
            </div>
            <button class="btn btn-danger" onclick="removePlayerFromTournament('${player.id}')" style="padding: 6px 12px; font-size: 14px;">
                Удалить
            </button>
        </div>
    `).join('');
}

// Удалить игрока из турнира
window.removePlayerFromTournament = async (playerId) => {
    if (!confirm('Удалить игрока из турнира?')) return;
    
    try {
        const response = await API.removePlayerFromTournament(tournamentId, playerId);
        players = response.players;
        UI.showToast('Игрок удален');
        
        // Обновить отображение
        renderPlayers();
        renderModalPlayersList();
        await populateAvailablePlayers();
    } catch (error) {
        UI.showToast('Ошибка удаления игрока', 'error');
        console.error(error);
    }
};
