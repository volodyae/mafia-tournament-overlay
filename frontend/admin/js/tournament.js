// c:\mafia-overlay\frontend\admin\js\tournament.js
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

// элементы модалки управления игроками
const managePlayersModal = document.getElementById('managePlayersModal');
const managePlayersBtn = document.getElementById('managePlayers');
const closePlayersModalBtn = document.getElementById('closePlayersModal');
const playerSearchInput = document.getElementById('playerSearchInput');
const playerSearchResults = document.getElementById('playerSearchResults');
const modalPlayersList = document.getElementById('modalPlayersList');
const modalPlayersCount = document.getElementById('modalPlayersCount');

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
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

// Отрисовка игроков (основной список)
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
    if (!games || games.length === 0) {
        UI.showEmpty(gamesList, 'Игр ещё нет. Попробуйте заново создать турнир.');
        return;
    }

    gamesList.innerHTML = games.map(game => {
        const hasSeating = game.seating_count && game.seating_count > 0;
        const statusText = game.status === 'in_progress' 
            ? '<span style="color: var(--success);">В процессе</span>'
            : game.status === 'finished'
            ? '<span style="color: var(--text-secondary);">Завершена</span>'
            : 'Не начата';

        return `
            <div class="tournament-card">
                <h3>🎮 ИГРА ${game.game_number}/${tournament.total_games}, стол ${game.table_number}</h3>
                <div class="tournament-meta">
                    ${game.series_name ? `📺 ${game.series_name}<br>` : ''}
                    ${statusText}<br>
                    ${hasSeating ? `✅ Рассадка создана (${game.seating_count}/10)` : '⚠️ Рассадка не создана'}
                </div>
                <button class="btn btn-primary open-game" data-id="${game.id}" data-game-number="${game.game_number}">
                    ⚙️ ${hasSeating ? 'Управлять игрой' : 'Создать рассадку'}
                </button>
            </div>
        `;
    }).join('');

    document.querySelectorAll('.open-game').forEach(btn => {
        btn.addEventListener('click', () => {
            const gameNum = btn.dataset.gameNumber;
            window.location.href = `game.html?tournament=${tournamentId}&game=${gameNum}`;
        });
    });
}

// === УПРАВЛЕНИЕ ИГРОКАМИ ===

// Открыть модальное окно управления игроками
async function openManagePlayersModal() {
    await populateAvailablePlayersBySearch(''); // показать первых кандидатов
    renderModalPlayersList();
    managePlayersModal.classList.add('active');
    if (playerSearchInput) {
        playerSearchInput.value = '';
        playerSearchInput.focus();
    }
}

// Список доступных игроков по строке поиска
async function populateAvailablePlayersBySearch(query) {
    if (!playerSearchResults) return;

    const q = (query || '').trim().toLowerCase();

    // ID игроков, уже в турнире
    const playerIds = players.map(p => p.id);
    const inTournament = new Set(playerIds);

    let availablePlayers = allPlayers.filter(p => !inTournament.has(p.id));

    if (q) {
        availablePlayers = availablePlayers.filter(p =>
            (p.nickname && p.nickname.toLowerCase().includes(q)) ||
            (p.id && p.id.toLowerCase().includes(q))
        );
    }

    availablePlayers = availablePlayers.slice(0, 20);

    if (availablePlayers.length === 0) {
        playerSearchResults.innerHTML = '<div class="player-search-empty">Ничего не найдено</div>';
        return;
    }

playerSearchResults.innerHTML = availablePlayers.map(p => `
    <div class="player-search-item" onclick="addPlayerToTournament('${p.id}')">
        <div>
            <span class="player-search-name">${p.nickname}</span>
        </div>
    </div>
`).join('');

}

// Отрисовать список игроков в модальном окне
function renderModalPlayersList() {
    modalPlayersCount.textContent = players.length;
    
    if (players.length === 0) {
        modalPlayersList.innerHTML = '<div class="empty-state"><p>Нет участников</p></div>';
        return;
    }
    
    modalPlayersList.innerHTML = players.map(player => `
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

// Добавить игрока в турнир
window.addPlayerToTournament = async (playerId) => {
    try {
        const response = await API.addPlayersToTournament(tournamentId, [playerId]);
        players = response.players;
        UI.showToast('Игрок добавлен');
        
        renderPlayers();
        renderModalPlayersList();
        await populateAvailablePlayersBySearch(playerSearchInput.value);
    } catch (error) {
        UI.showToast('Ошибка добавления игрока', 'error');
        console.error(error);
    }
};

// Удалить игрока из турнира (без window.confirm)
window.removePlayerFromTournament = async (playerId) => {
    try {
        const response = await API.removePlayerFromTournament(tournamentId, playerId);
        players = response.players;
        UI.showToast('Игрок удален');
        
        renderPlayers();
        renderModalPlayersList();
    } catch (error) {
        UI.showToast('Ошибка удаления игрока', 'error');
        console.error(error);
    }
};


// Обработчики событий
// Обработчики событий
function setupEventListeners() {
    // Управление игроками
    if (managePlayersBtn) {
        managePlayersBtn.addEventListener('click', async () => {
            await openManagePlayersModal();
        });
    }
    
    // Закрытие модального окна управления игроками только по крестику
    if (closePlayersModalBtn) {
        closePlayersModalBtn.addEventListener('click', () => {
            managePlayersModal.classList.remove('active');
        });
    }

    // Живой поиск по игрокам
    if (playerSearchInput) {
        playerSearchInput.addEventListener('input', () => {
            populateAvailablePlayersBySearch(playerSearchInput.value);
        });
    }
}