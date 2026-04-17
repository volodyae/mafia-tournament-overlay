let tournaments = [];

// DOM элементы
const tournamentsList = document.getElementById('tournamentsList');
const createTournamentBtn = document.getElementById('createTournamentBtn');
const createTournamentModal = document.getElementById('createTournamentModal');
const createTournamentForm = document.getElementById('createTournamentForm');
const closeModal = document.getElementById('closeModal');
const cancelBtn = document.getElementById('cancelBtn');

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    loadTournaments();
    setupEventListeners();
    setupNumberInputs();
});

// Загрузка турниров
async function loadTournaments() {
    try {
        UI.showLoading(tournamentsList);
        tournaments = await API.getTournaments();
        renderTournaments();
    } catch (error) {
        UI.showToast('Ошибка загрузки турниров', 'error');
        console.error(error);
    }
}

// Отрисовка списка турниров
function renderTournaments() {
    if (tournaments.length === 0) {
        UI.showEmpty(tournamentsList, 'Нет турниров. Создайте первый турнир!');
        return;
    }

    tournamentsList.innerHTML = tournaments.map(tournament => `
        <div class="tournament-card">
            <h3>🏆 ${tournament.name}</h3>
            <div class="tournament-meta">
                📅 ${UI.formatDate(tournament.created_at)}<br>
                🎮 Игр: ${tournament.total_games} | 🪑 Столов: ${tournament.total_tables}<br>
                ${tournament.status === 'active' 
                    ? '<span style="color: var(--success);">✅ Активен</span>' 
                    : '<span style="color: var(--text-secondary);">Завершён</span>'}
            </div>
            <div class="tournament-actions">
                <button class="btn btn-primary open-tournament" data-id="${tournament.id}">
                    Открыть турнир
                </button>
                <button class="btn btn-danger delete-tournament" data-id="${tournament.id}">
                    🗑️ Удалить
                </button>
            </div>
        </div>
    `).join('');

    // Обработчики
    document.querySelectorAll('.open-tournament').forEach(btn => {
        btn.addEventListener('click', () => {
            window.location.href = `tournament.html?id=${btn.dataset.id}`;
        });
    });

    document.querySelectorAll('.delete-tournament').forEach(btn => {
        btn.addEventListener('click', () => deleteTournament(btn.dataset.id));
    });
}

// Удаление турнира
async function deleteTournament(tournamentId) {
    const tournament = tournaments.find(t => t.id === tournamentId);
    if (!tournament) return;

    if (!UI.confirm(`Удалить турнир "${tournament.name}"? Все игры будут удалены!`)) {
        return;
    }

    try {
        await API.deleteTournament(tournamentId);
        UI.showToast('Турнир удалён');
        loadTournaments();
    } catch (error) {
        UI.showToast('Ошибка удаления турнира', 'error');
    }
}

// Создание турнира
createTournamentForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = {
        name: document.getElementById('tournamentName').value.trim(),
        total_games: parseInt(document.getElementById('totalGames').value),
        total_tables: parseInt(document.getElementById('totalTables').value),
        player_ids: [] // Пока без игроков (добавим позже)
    };

    try {
        await API.createTournament(data);
        UI.showToast('Турнир создан');
        createTournamentModal.classList.remove('active');
        createTournamentForm.reset();
        loadTournaments();
    } catch (error) {
        UI.showToast('Ошибка создания турнира', 'error');
    }
});

// Открытие модального окна
createTournamentBtn.addEventListener('click', () => {
    createTournamentModal.classList.add('active');
});

// Закрытие модального окна
function setupEventListeners() {
    closeModal.addEventListener('click', () => {
        createTournamentModal.classList.remove('active');
    });

    cancelBtn.addEventListener('click', () => {
        createTournamentModal.classList.remove('active');
    });

    // Закрытие по клику вне модалки
    createTournamentModal.addEventListener('click', (e) => {
        if (e.target === createTournamentModal) {
            createTournamentModal.classList.remove('active');
        }
    });
}

// Кнопки +/- для number input
function setupNumberInputs() {
    document.querySelectorAll('.btn-plus').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = document.getElementById(btn.dataset.target);
            const max = parseInt(input.max);
            const current = parseInt(input.value);
            if (current < max) {
                input.value = current + 1;
            }
        });
    });

    document.querySelectorAll('.btn-minus').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = document.getElementById(btn.dataset.target);
            const min = parseInt(input.min);
            const current = parseInt(input.value);
            if (current > min) {
                input.value = current - 1;
            }
        });
    });
}
