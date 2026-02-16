let tournamentId = null;
let tournament = null;
let games = [];
let players = [];

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
        
        // Загружаем игры турнира (нужно добавить метод в API)
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
        // Пока у нас нет отдельного endpoint для игр турнира
        // Возвращаем пустой массив, позже доработаем backend
        return [];
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

        return `
            <div class="tournament-card">
                <h3>🎮 ИГРА ${game.game_number}/${tournament.total_games}</h3>
                <div class="tournament-meta">
                    ${game.series_name ? `📺 ${game.series_name}<br>` : ''}
                    Стол ${game.table_number} | 
                    ${game.status === 'in_progress' 
                        ? '<span style="color: var(--success);">В процессе</span>'
                        : game.status === 'finished'
                        ? '<span style="color: var(--text-secondary);">Завершена</span>'
                        : 'Не начата'
                    }
                </div>
                <button class="btn btn-primary open-game" data-id="${game.id}">
                    ⚙️ Управлять игрой
                </button>
            </div>
        `;
    }).join('');

    // Обработчики
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

// Обработчики
function setupEventListeners() {
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

    // Управление игроками (пока заглушка)
    document.getElementById('managePlayers').addEventListener('click', () => {
        UI.showToast('Функция в разработке', 'error');
    });
}
