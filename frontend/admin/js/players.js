let players = [];
let editingPlayerId = null;
let photoUploadMode = 'upload'; // 'upload' или 'url'
let uploadedPhotoUrl = null;

// DOM элементы
const playersList = document.getElementById('playersList');
const searchInput = document.getElementById('searchInput');
const addPlayerBtn = document.getElementById('addPlayerBtn');
const playerModal = document.getElementById('playerModal');
const playerForm = document.getElementById('playerForm');
const closePlayerModal = document.getElementById('closePlayerModal');
const cancelPlayerBtn = document.getElementById('cancelPlayerBtn');
const modalTitle = document.getElementById('modalTitle');
const baseUrl = window.OVERLAY_CONFIG.BASE_URL;

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    loadPlayers();
    setupEventListeners();
    setupPhotoModeButtons();
});

// Загрузка игроков
async function loadPlayers() {
    try {
        UI.showLoading(playersList);
        players = await API.getPlayers();
        renderPlayers(players);
    } catch (error) {
        UI.showToast('Ошибка загрузки игроков', 'error');
        console.error(error);
    }
}

// Отрисовка списка игроков
function renderPlayers(playersToRender) {
    if (playersToRender.length === 0) {
        UI.showEmpty(playersList, 'Нет игроков. Добавьте первого игрока!');
        return;
    }

    playersList.innerHTML = playersToRender.map(player => `
        <div class="player-card" data-id="${player.id}">
            ${player.photo_url 
                ? `<img src="${player.photo_url}" alt="${player.nickname}" class="player-photo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                   <div class="player-placeholder" style="display:none;">👤</div>`
                : `<div class="player-placeholder">👤</div>`
            }
            <div class="player-info">
                <h4>${player.nickname}</h4>
                <small style="color: var(--text-secondary);">ID: ${player.id.slice(0, 8)}...</small>
            </div>
            <div class="player-actions">
                <button class="btn btn-secondary btn-icon edit-player" data-id="${player.id}" title="Редактировать">
                    ✏️
                </button>
                <button class="btn btn-danger btn-icon delete-player" data-id="${player.id}" title="Удалить">
                    🗑️
                </button>
            </div>
        </div>
    `).join('');

    // Добавляем обработчики
    document.querySelectorAll('.edit-player').forEach(btn => {
        btn.addEventListener('click', () => editPlayer(btn.dataset.id));
    });

    document.querySelectorAll('.delete-player').forEach(btn => {
        btn.addEventListener('click', () => deletePlayer(btn.dataset.id));
    });
}

// Поиск игроков
searchInput.addEventListener('input', async (e) => {
    const query = e.target.value.trim();
    
    if (query.length === 0) {
        renderPlayers(players);
        return;
    }

    try {
        const results = await API.searchPlayers(query);
        renderPlayers(results);
    } catch (error) {
        console.error('Ошибка поиска:', error);
    }
});

// Открыть модальное окно добавления
addPlayerBtn.addEventListener('click', () => {
    editingPlayerId = null;
    modalTitle.textContent = 'Добавить игрока';
    playerForm.reset();
    document.getElementById('photoPreview').style.display = 'none';
    uploadedPhotoUrl = null;
    
    // Сброс режима на загрузку
    photoUploadMode = 'upload';
    document.getElementById('uploadPhotoBlock').style.display = 'block';
    document.getElementById('urlPhotoBlock').style.display = 'none';
    document.getElementById('uploadPhotoBtn').classList.add('btn-primary');
    document.getElementById('uploadPhotoBtn').classList.remove('btn-secondary');
    document.getElementById('urlPhotoBtn').classList.remove('btn-primary');
    document.getElementById('urlPhotoBtn').classList.add('btn-secondary');
    
    playerModal.classList.add('active');
});

// Редактирование игрока
async function editPlayer(playerId) {
    try {
        const player = players.find(p => p.id === playerId);
        if (!player) return;

        editingPlayerId = playerId;
        modalTitle.textContent = 'Редактировать игрока';
        
        document.getElementById('playerId').value = player.id;
        document.getElementById('playerNickname').value = player.nickname;
        
        // Если есть фото, показываем в URL-режиме
        if (player.photo_url) {
            photoUploadMode = 'url';
            document.getElementById('playerPhoto').value = player.photo_url;
            document.getElementById('uploadPhotoBlock').style.display = 'none';
            document.getElementById('urlPhotoBlock').style.display = 'block';
            document.getElementById('urlPhotoBtn').classList.add('btn-primary');
            document.getElementById('urlPhotoBtn').classList.remove('btn-secondary');
            document.getElementById('uploadPhotoBtn').classList.remove('btn-primary');
            document.getElementById('uploadPhotoBtn').classList.add('btn-secondary');
        } else {
            photoUploadMode = 'upload';
            document.getElementById('uploadPhotoBlock').style.display = 'block';
            document.getElementById('urlPhotoBlock').style.display = 'none';
            document.getElementById('uploadPhotoBtn').classList.add('btn-primary');
            document.getElementById('uploadPhotoBtn').classList.remove('btn-secondary');
            document.getElementById('urlPhotoBtn').classList.remove('btn-primary');
            document.getElementById('urlPhotoBtn').classList.add('btn-secondary');
        }
        
        playerModal.classList.add('active');
    } catch (error) {
        UI.showToast('Ошибка загрузки данных игрока', 'error');
    }
}

// Удаление игрока
async function deletePlayer(playerId) {
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    if (!UI.confirm(`Удалить игрока "${player.nickname}"?`)) {
        return;
    }

    try {
        await API.deletePlayer(playerId);
        UI.showToast('Игрок удалён');
        loadPlayers();
    } catch (error) {
        UI.showToast('Ошибка удаления игрока', 'error');
    }
}

// Сохранение игрока
playerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    let photoUrl = null;

    // Загрузка фото
    if (photoUploadMode === 'upload') {
        const fileInput = document.getElementById('playerPhotoFile');
        if (fileInput.files.length > 0) {
            const formData = new FormData();
            formData.append('photo', fileInput.files[0]);

            try {
                const token = localStorage.getItem('auth_token');
const response = await fetch(`${baseUrl}/api/upload/player-photo`, {
  method: 'POST',
  headers: token ? { 'Authorization': 'Bearer ' + token } : {},
  body: formData
});

if (!response.ok) {
    throw new Error('Ошибка загрузки файла');
}

const result = await response.json();
photoUrl = result.photo_url; // уже полный URL от сервера
            } catch (error) {
                UI.showToast('Ошибка загрузки фото', 'error');
                console.error(error);
                return;
            }
        }
    } else {
        photoUrl = document.getElementById('playerPhoto').value.trim() || null;
    }

    const data = {
        nickname: document.getElementById('playerNickname').value.trim(),
        photo_url: photoUrl
    };

    try {
        if (editingPlayerId) {
            await API.updatePlayer(editingPlayerId, data);
            UI.showToast('Игрок обновлён');
        } else {
            await API.createPlayer(data);
            UI.showToast('Игрок добавлен');
        }

        playerModal.classList.remove('active');
        loadPlayers();
    } catch (error) {
        UI.showToast('Ошибка сохранения', 'error');
        console.error(error);
    }
});

// Настройка переключения режимов фото
function setupPhotoModeButtons() {
    // Переключение на загрузку файла
    document.getElementById('uploadPhotoBtn').addEventListener('click', () => {
        photoUploadMode = 'upload';
        document.getElementById('uploadPhotoBlock').style.display = 'block';
        document.getElementById('urlPhotoBlock').style.display = 'none';
        document.getElementById('uploadPhotoBtn').classList.add('btn-primary');
        document.getElementById('uploadPhotoBtn').classList.remove('btn-secondary');
        document.getElementById('urlPhotoBtn').classList.remove('btn-primary');
        document.getElementById('urlPhotoBtn').classList.add('btn-secondary');
    });

    // Переключение на URL
    document.getElementById('urlPhotoBtn').addEventListener('click', () => {
        photoUploadMode = 'url';
        document.getElementById('uploadPhotoBlock').style.display = 'none';
        document.getElementById('urlPhotoBlock').style.display = 'block';
        document.getElementById('urlPhotoBtn').classList.add('btn-primary');
        document.getElementById('urlPhotoBtn').classList.remove('btn-secondary');
        document.getElementById('uploadPhotoBtn').classList.remove('btn-primary');
        document.getElementById('uploadPhotoBtn').classList.add('btn-secondary');
    });

    // Предпросмотр загруженного фото
    document.getElementById('playerPhotoFile').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById('previewImage').src = event.target.result;
                document.getElementById('photoPreview').style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });
}

// Закрытие модального окна
function setupEventListeners() {
    closePlayerModal.addEventListener('click', () => {
        playerModal.classList.remove('active');
    });

    cancelPlayerBtn.addEventListener('click', () => {
        playerModal.classList.remove('active');
    });

    // Закрытие по клику вне модалки
    playerModal.addEventListener('click', (e) => {
        if (e.target === playerModal) {
            playerModal.classList.remove('active');
        }
    });
}
