// Глобальные переменные
let gameId = null;
let gameData = null;
let tournamentPlayers = [];
let socket = null;
let currentNominees = [];
let votedOutPlayers = [];
let selectedFirstKilled = null;
let selectedSuspects = [];

// DOM элементы
const gameTitle = document.getElementById('gameTitle');
const overlayUrl = document.getElementById('overlayUrl');
const copyOverlayBtn = document.getElementById('copyOverlayBtn');
const openOverlayBtn = document.getElementById('openOverlayBtn');
const seatingGrid = document.getElementById('seatingGrid');
const saveSeatingBtn = document.getElementById('saveSeatingBtn');
const rolesSection = document.getElementById('rolesSection');
const rolesGrid = document.getElementById('rolesGrid');
const applyRolesBtn = document.getElementById('applyRolesBtn');
const bestMoveSection = document.getElementById('bestMoveSection');
const nomineesSection = document.getElementById('nomineesSection');
const roundsSection = document.getElementById('roundsSection');
const roundModal = document.getElementById('roundModal');
const roundForm = document.getElementById('roundForm');
const closeRoundModal = document.getElementById('closeRoundModal');
const cancelRoundBtn = document.getElementById('cancelRoundBtn');
const addRoundBtn = document.getElementById('addRoundBtn');
const roundsList = document.getElementById('roundsList');

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    gameId = urlParams.get('id');

    if (!gameId) {
        UI.showToast('Игра не найдена', 'error');
        setTimeout(() => window.location.href = 'index.html', 2000);
        return;
    }

    connectWebSocket();
    await loadGameData();
    setupEventListeners();
});

// Подключение к WebSocket
function connectWebSocket() {
    socket = io('http://localhost:3000');
    
    socket.on('connect', () => {
        console.log('✅ WebSocket connected');
        socket.emit('join_game', gameId);
    });

    socket.on('disconnect', () => {
        console.log('❌ WebSocket disconnected');
    });

    socket.on('game_updated', (data) => {
        console.log('Game update received:', data);
    });
}

// Загрузка данных игры
async function loadGameData() {
    try {
        gameData = await API.getGame(gameId);
        tournamentPlayers = await API.getTournamentPlayers(gameData.tournament_id);
        
        renderGameHeader();
        renderOverlayLink();
        
        if (gameData.seating && gameData.seating.length > 0) {
            renderSeatingWithPlayers();
            rolesSection.style.display = 'block';
            renderRoles();
            
            bestMoveSection.style.display = 'block';
            nomineesSection.style.display = 'block';
            roundsSection.style.display = 'block';
            
            renderBestMove();
            renderNominees();
            renderRounds();
        } else {
            renderEmptySeating();
        }
    } catch (error) {
        UI.showToast('Ошибка загрузки игры', 'error');
        console.error(error);
    }
}

// Отрисовка заголовка
function renderGameHeader() {
    gameTitle.textContent = `Игра ${gameData.game_number} ${gameData.series_name ? '- ' + gameData.series_name : ''}`;
}

// Отрисовка ссылки на оверлей
function renderOverlayLink() {
    const url = `http://localhost:3000/overlay/index.html?gameId=${gameId}`;
    overlayUrl.textContent = url;
}

// === РАССАДКА ===

function renderEmptySeating() {
  seatingGrid.innerHTML = Array.from({ length: 10 }, (_, i) => {
    const position = i + 1;
    return `
      <div class="seating-item">
        <div class="position-number">${position}</div>
        <select class="form-select seating-player-select" data-position="${position}" onchange="updateAvailablePlayers()">
          <option value="">Выберите игрока</option>
          ${tournamentPlayers.map(p => `<option value="${p.id}">${p.nickname}</option>`).join('')}
        </select>
      </div>
    `;
  }).join('');
  
  saveSeatingBtn.style.display = 'block';
}

// ЗАДАЧА 7: Обновить доступных игроков
window.updateAvailablePlayers = () => {
  const selects = document.querySelectorAll('.seating-player-select');
  const selectedPlayerIds = Array.from(selects)
    .map(s => s.value)
    .filter(v => v !== '');
  
  selects.forEach(select => {
    const currentValue = select.value;
    const options = Array.from(select.options);
    
    options.forEach(option => {
      if (option.value === '') return; // Пропустить "Выберите игрока"
      
      // Скрыть уже выбранных игроков (кроме текущего значения)
      if (selectedPlayerIds.includes(option.value) && option.value !== currentValue) {
        option.disabled = true;
        option.style.display = 'none';
      } else {
        option.disabled = false;
        option.style.display = '';
      }
    });
  });
};

function renderSeatingWithPlayers() {
    seatingGrid.innerHTML = gameData.seating.map(seat => `
        <div class="seating-item">
            <div class="position-number">${seat.position}</div>
            <div style="flex: 1;">
                <strong>${seat.nickname}</strong>
                ${seat.role ? ` - ${getRoleLabel(seat.role)}` : ''}
            </div>
        </div>
    `).join('');
    
    saveSeatingBtn.style.display = 'none';
}

saveSeatingBtn.addEventListener('click', async () => {
    const selects = document.querySelectorAll('.seating-player-select');
    const seating = [];
    const usedPlayers = new Set();

    for (const select of selects) {
        const playerId = select.value;
        const position = parseInt(select.dataset.position);

        if (!playerId) {
            UI.showToast(`Выберите игрока для позиции ${position}`, 'error');
            return;
        }

        if (usedPlayers.has(playerId)) {
            UI.showToast('Один игрок выбран дважды!', 'error');
            return;
        }

        usedPlayers.add(playerId);
        seating.push({ position, player_id: playerId });
    }

    try {
        await API.createSeating(gameId, seating);
        UI.showToast('Рассадка сохранена');
        await loadGameData();
    } catch (error) {
        UI.showToast('Ошибка сохранения рассадки', 'error');
    }
});

// === РОЛИ ===

function renderRoles() {
    rolesGrid.innerHTML = gameData.seating.map(seat => `
        <div class="seating-item" style="margin-bottom: 16px;">
            <div class="position-number">${seat.position}</div>
            <div style="flex: 1;">
                <div style="margin-bottom: 8px;"><strong>${seat.nickname}</strong></div>
                <div class="role-buttons">
                    <button class="role-btn ${!seat.role || seat.role === 'civilian' ? '' : 'active'} ${seat.role === 'mafia' ? 'black' : ''}" 
                            data-position="${seat.position}" data-role="none">
                        Мирный (по умолчанию)
                    </button>
                    <button class="role-btn black ${seat.role === 'mafia' ? 'active' : ''}" 
                            data-position="${seat.position}" data-role="mafia" data-team="black">
                        Мафия
                    </button>
                    <button class="role-btn black ${seat.role === 'don' ? 'active' : ''}" 
                            data-position="${seat.position}" data-role="don" data-team="black">
                        Дон
                    </button>
                    <button class="role-btn yellow ${seat.role === 'sheriff' ? 'active' : ''}" 
                            data-position="${seat.position}" data-role="sheriff" data-team="red">
                        Шериф
                    </button>
                </div>
            </div>
        </div>
    `).join('');

    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const position = btn.dataset.position;
            
            document.querySelectorAll(`.role-btn[data-position="${position}"]`).forEach(b => {
                b.classList.remove('active');
            });
            
            btn.classList.add('active');
        });
    });
}


applyRolesBtn.addEventListener('click', async () => {
    const roles = [];

    for (let position = 1; position <= 10; position++) {
        const activeBtn = document.querySelector(`.role-btn[data-position="${position}"].active`);
        
        let role = 'civilian';
        let team = 'red';
        
        if (activeBtn && activeBtn.dataset.role !== 'none') {
            role = activeBtn.dataset.role;
            team = activeBtn.dataset.team;
        }

        roles.push({ position, role, team });
    }

    // Валидация: 1 дон, 1 шериф, 2-3 мафии
    const donCount = roles.filter(r => r.role === 'don').length;
    const sheriffCount = roles.filter(r => r.role === 'sheriff').length;
    const mafiaCount = roles.filter(r => r.role === 'mafia').length;

    if (donCount !== 1) {
        UI.showToast('Должен быть ровно 1 дон!', 'error');
        return;
    }

    if (sheriffCount !== 1) {
        UI.showToast('Должен быть ровно 1 шериф!', 'error');
        return;
    }

    if (mafiaCount < 2 || mafiaCount > 3) {
        UI.showToast('Должно быть 2-3 мафии!', 'error');
        return;
    }

    try {
        await API.assignRoles(gameId, roles);
        UI.showToast('Роли назначены');
        
        socket.emit('roles_updated', { gameId, roles });
        
        await loadGameData();
    } catch (error) {
        UI.showToast('Ошибка назначения ролей', 'error');
    }
});


// === ЛУЧШИЙ ХОД ===
function renderBestMove() {
  const aliveSeats = gameData.seating.filter(s => !s.is_eliminated);
  
  // Кнопки для первого убитого
  const bestMoveButtons = document.getElementById('bestMoveButtons');
  bestMoveButtons.innerHTML = aliveSeats.map(s => `
    <button class="btn ${selectedFirstKilled === s.player_id ? 'btn-primary' : 'btn-secondary'}" 
            onclick="selectFirstKilled('${s.player_id}', ${s.position})"
            style="min-width: 50px;">
      ${s.position}
    </button>
  `).join('');
  
  // Кнопки для подозреваемых
  const suspectsButtons = document.getElementById('suspectsButtons');
  suspectsButtons.innerHTML = aliveSeats.map(s => `
    <button class="btn ${selectedSuspects.includes(s.player_id) ? 'btn-primary' : 'btn-secondary'}" 
            onclick="toggleSuspect('${s.player_id}', ${s.position})"
            style="min-width: 50px;">
      ${s.position}
    </button>
  `).join('');
  
  // Загрузить сохраненные данные
  if (gameData.best_move) {
    selectedFirstKilled = gameData.best_move.first_killed_player_id;
    selectedSuspects = [
      gameData.best_move.suspect_1,
      gameData.best_move.suspect_2,
      gameData.best_move.suspect_3
    ].filter(Boolean);
    updateBestMoveUI();
  }
}

// Выбрать первого убитого
window.selectFirstKilled = (playerId, position) => {
  selectedFirstKilled = playerId;
  renderBestMove();
};

// Переключить подозреваемого
window.toggleSuspect = (playerId, position) => {
  const index = selectedSuspects.indexOf(playerId);
  
  if (index > -1) {
    selectedSuspects.splice(index, 1);
  } else {
    if (selectedSuspects.length >= 3) {
      UI.showToast('Максимум 3 подозреваемых', 'error');
      return;
    }
    selectedSuspects.push(playerId);
  }
  
  // Сортировать по позициям
  selectedSuspects.sort((a, b) => {
    const posA = gameData.seating.find(s => s.player_id === a).position;
    const posB = gameData.seating.find(s => s.player_id === b).position;
    return posA - posB;
  });
  
  updateBestMoveUI();
};

// Обновить отображение
function updateBestMoveUI() {
  renderBestMove();
  
  const positions = selectedSuspects.map(id => {
    const seat = gameData.seating.find(s => s.player_id === id);
    return seat ? seat.position : '?';
  });
  document.getElementById('suspectsDisplay').textContent = 
    positions.length > 0 ? positions.join(', ') : 'нет';
}

// Сохранить ЛХ
document.getElementById('applyBestMoveBtn').addEventListener('click', async () => {
  if (!selectedFirstKilled) {
    UI.showToast('Выберите первого убитого', 'error');
    return;
  }
  
  if (selectedSuspects.length !== 3) {
    UI.showToast('Выберите ровно 3 подозреваемых', 'error');
    return;
  }
  
  const data = {
    first_killed_player_id: selectedFirstKilled,
    suspect_1: selectedSuspects[0],
    suspect_2: selectedSuspects[1],
    suspect_3: selectedSuspects[2]
  };
  
  try {
    await API.setBestMove(gameId, data);
    UI.showToast('ЛХ сохранен');
    socket.emit('best_move_set', { gameId, data });
    
    // ЗАДАЧА 3: Автоматически записать первого убитого в круг 1
    await autoSetFirstKilledInRound1();
    
    await loadGameData();
  } catch (error) {
    UI.showToast('Ошибка сохранения ЛХ', 'error');
  }
});

// === ЗАДАЧА 3: Автозапись первого убитого ===
async function autoSetFirstKilledInRound1() {
  if (!selectedFirstKilled) return;
  
  // Проверить, есть ли уже круг 1
  const round1 = gameData.rounds?.find(r => r.round_number === 1);
  if (round1 && round1.mafia_kill_player_id) {
    // Круг 1 уже есть и убийство записано
    return;
  }
  
  // Если круга 1 нет, создать его с первым убитым
  if (!round1) {
    const roundData = {
      round_number: 1,
      mafia_kill_player_id: selectedFirstKilled,
      mafia_miss: false,
      don_check_player_id: null,
      sheriff_check_player_id: null,
      voted_out_players: [],
      nobody_voted_out: false
    };
    
    try {
      await API.addRound(gameId, roundData);
      UI.showToast('Первый убитый автоматически записан в круг 1');
    } catch (error) {
      console.error('Ошибка автозаписи первого убитого:', error);
    }
  }
}

// === ВЫСТАВЛЕНИЕ НА ГОЛОСОВАНИЕ ===

function renderNominees() {
    const aliveSeats = gameData.seating.filter(s => !s.is_eliminated);
    
    const options = aliveSeats.map(s => 
        `<option value="${s.player_id}">${s.position}. ${s.nickname}</option>`
    ).join('');

    document.getElementById('addNomineeSelect').innerHTML = 
        '<option value="">Выберите игрока</option>' + options;

    currentNominees = gameData.nominees || [];
    renderNomineesList();
}

function renderNomineesList() {
    const nomineesList = document.getElementById('nomineesList');
    
    if (currentNominees.length === 0) {
        nomineesList.innerHTML = '<p style="color: var(--text-secondary);">Нет кандидатов</p>';
        return;
    }

    nomineesList.innerHTML = currentNominees.map(nominee => {
        const seat = gameData.seating.find(s => s.player_id === nominee.player_id);
        return `
            <div class="nominee-tag">
                <span>${seat.position}. ${nominee.nickname}</span>
                <button onclick="removeNominee('${nominee.player_id}')">×</button>
            </div>
        `;
    }).join('');
}

window.removeNominee = async (playerId) => {
    currentNominees = currentNominees.filter(n => n.player_id !== playerId);
    
    // АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ
    try {
        const playerIds = currentNominees.map(n => n.player_id);
        await API.updateNominees(gameId, playerIds);
        
        socket.emit('nominees_updated', { gameId, nominees: currentNominees });
        
        renderNomineesList();
    } catch (error) {
        UI.showToast('Ошибка удаления', 'error');
    }
};

document.getElementById('addNomineeSelect').addEventListener('change', async (e) => {
    const playerId = e.target.value;
    if (!playerId) return;

    if (currentNominees.find(n => n.player_id === playerId)) {
        UI.showToast('Игрок уже в списке', 'error');
        e.target.value = '';
        return;
    }

    const seat = gameData.seating.find(s => s.player_id === playerId);
    currentNominees.push({ player_id: playerId, nickname: seat.nickname });
    
    // АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ
    try {
        const playerIds = currentNominees.map(n => n.player_id);
        await API.updateNominees(gameId, playerIds);
        
        socket.emit('nominees_updated', { gameId, nominees: currentNominees });
        
        renderNomineesList();
        e.target.value = '';
        
        // Не показываем уведомление, чтобы не спамить
        // UI.showToast('Кандидат добавлен');
    } catch (error) {
        UI.showToast('Ошибка добавления', 'error');
        currentNominees.pop(); // Откатываем если ошибка
    }
});

//document.getElementById('updateNomineesBtn').addEventListener('click', async () => {
//    const playerIds = currentNominees.map(n => n.player_id);
//    
//    try {
//        await API.updateNominees(gameId, playerIds);
//        UI.showToast('Выставленные обновлены');
//        
//        socket.emit('nominees_updated', { gameId, nominees: currentNominees });
//        
//        await loadGameData();
//    } catch (error) {
//        UI.showToast('Ошибка обновления', 'error');
//    }
//});

document.getElementById('clearNomineesBtn').addEventListener('click', async () => {
  // Убрали подтверждение для быстрой очистки
    
    currentNominees = [];
    
    try {
        await API.updateNominees(gameId, []);
        UI.showToast('Список очищен');
        
        socket.emit('nominees_updated', { gameId, nominees: [] });
        
        renderNomineesList();
    } catch (error) {
        UI.showToast('Ошибка очистки', 'error');
    }
});

// === КРУГИ ===

function renderRounds() {
  if (!gameData.rounds || gameData.rounds.length === 0) {
    roundsList.innerHTML = '<div class="empty-state"><p>Нет кругов. Добавьте первый круг.</p></div>';
    return;
  }
  
  roundsList.innerHTML = gameData.rounds.map(round => {
    const mafiaKill = round.mafia_miss ? '❌ Промах' : round.mafia_kill_player_id ? getPlayerName(round.mafia_kill_player_id) : '-';
    const donCheck = round.don_check_player_id ? getPlayerName(round.don_check_player_id) : '❌';
    const sheriffCheck = round.sheriff_check_player_id ? getPlayerName(round.sheriff_check_player_id) : '❌';
    const votedOut = round.nobody_voted_out ? '❌ Никто' : round.voted_out_players ? JSON.parse(round.voted_out_players).map(id => getPlayerName(id)).join(', ') : '-';
    
    return `
      <div class="card" style="margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h4>🌙 Круг ${round.round_number}</h4>
          <button class="btn btn-secondary" onclick="editRound(${round.round_number})" style="padding: 6px 12px; font-size: 14px;">
            ✏️ Редактировать
          </button>
        </div>
        <div style="margin-top: 12px;">
          <p><strong>🔫 Убийство мафии:</strong> ${mafiaKill}</p>
          <p><strong>🎩 Проверка дона:</strong> ${donCheck}</p>
          <p><strong>⭐ Проверка шерифа:</strong> ${sheriffCheck}</p>
          <p><strong>👍 Голосование:</strong> ${votedOut}</p>
        </div>
      </div>
    `;
  }).join('');
}

// ЗАДАЧА 5: Редактировать круг
window.editRound = async (roundNumber) => {
  const round = gameData.rounds.find(r => r.round_number === roundNumber);
  if (!round) return;
  
  votedOutPlayers = round.voted_out_players ? JSON.parse(round.voted_out_players) : [];
  
  document.getElementById('roundModalTitle').textContent = `Редактировать круг ${roundNumber}`;
  document.getElementById('roundNumber').value = roundNumber;
  
  populateRoundSelects();
  
  // Заполнить текущие значения
  document.getElementById('mafiaKill').value = round.mafia_miss ? 'miss' : (round.mafia_kill_player_id || '');
  document.getElementById('donCheck').value = round.don_check_player_id || 'none';
  document.getElementById('sheriffCheck').value = round.sheriff_check_player_id || 'none';
  
  renderVotedOutList();
  roundModal.classList.add('active');
  
  // Изменить форму на режим редактирования
  roundForm.dataset.mode = 'edit';
};

addRoundBtn.addEventListener('click', () => {
    votedOutPlayers = [];
    const nextRoundNumber = (gameData.rounds?.length || 0) + 1;
    
    document.getElementById('roundModalTitle').textContent = `Круг ${nextRoundNumber}`;
    document.getElementById('roundNumber').value = nextRoundNumber;
    
    populateRoundSelects();
    renderVotedOutList();
    
    roundModal.classList.add('active');
});

function populateRoundSelects() {
    const aliveSeats = gameData.seating.filter(s => !s.is_eliminated);
    
    const options = aliveSeats.map(s => 
        `<option value="${s.player_id}">${s.position}. ${s.nickname}</option>`
    ).join('');

    document.getElementById('mafiaKill').innerHTML = 
        '<option value="">Выберите игрока</option><option value="miss">❌ Промах</option>' + options;
    
    document.getElementById('donCheck').innerHTML = 
        '<option value="">Выберите игрока</option><option value="none">❌ Не проверял</option>' + options;
    
    document.getElementById('sheriffCheck').innerHTML = 
        '<option value="">Выберите игрока</option><option value="none">❌ Не проверял</option>' + options;
    
    document.getElementById('addVotedOut').innerHTML = 
        '<option value="">+ Добавить игрока</option><option value="nobody">❌ Никто не выбыл</option>' + options;
}

function renderVotedOutList() {
    const votedOutList = document.getElementById('votedOutList');
    
    if (votedOutPlayers.length === 0) {
        votedOutList.innerHTML = '';
        return;
    }

    votedOutList.innerHTML = votedOutPlayers.map(playerId => {
        const seat = gameData.seating.find(s => s.player_id === playerId);
        return `
            <div class="nominee-tag">
                <span>${seat.position}. ${seat.nickname}</span>
                <button onclick="removeVotedOut('${playerId}')">×</button>
            </div>
        `;
    }).join('');
}

window.removeVotedOut = (playerId) => {
    votedOutPlayers = votedOutPlayers.filter(id => id !== playerId);
    renderVotedOutList();
};

document.getElementById('addVotedOut').addEventListener('change', (e) => {
    const value = e.target.value;
    if (!value) return;

    if (value === 'nobody') {
        votedOutPlayers = [];
        renderVotedOutList();
        e.target.value = '';
        return;
    }

    if (votedOutPlayers.includes(value)) {
        UI.showToast('Игрок уже добавлен', 'error');
        e.target.value = '';
        return;
    }

    votedOutPlayers.push(value);
    renderVotedOutList();
    e.target.value = '';
});

roundForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const mafiaKillValue = document.getElementById('mafiaKill').value;
  const donCheckValue = document.getElementById('donCheck').value;
  const sheriffCheckValue = document.getElementById('sheriffCheck').value;
  const roundNumber = parseInt(document.getElementById('roundNumber').value);
  
  const roundData = {
    round_number: roundNumber,
    mafia_kill_player_id: mafiaKillValue === 'miss' ? null : (mafiaKillValue || null),
    mafia_miss: mafiaKillValue === 'miss',
    don_check_player_id: donCheckValue === 'none' ? null : (donCheckValue || null),
    sheriff_check_player_id: sheriffCheckValue === 'none' ? null : (sheriffCheckValue || null),
    voted_out_players: votedOutPlayers.length > 0 ? votedOutPlayers : [],
    nobody_voted_out: votedOutPlayers.length === 0
  };
  
  try {
    const isEdit = roundForm.dataset.mode === 'edit';
    
    if (isEdit) {
      await API.updateRound(gameId, roundNumber, roundData);
      UI.showToast('Круг обновлен');
    } else {
      await API.addRound(gameId, roundData);
      UI.showToast('Круг добавлен');
    }
    
    socket.emit('round_updated', { gameId, roundData });
    roundModal.classList.remove('active');
    roundForm.dataset.mode = '';
    await loadGameData();
  } catch (error) {
    UI.showToast(isEdit ? 'Ошибка обновления круга' : 'Ошибка добавления круга', 'error');
    console.error(error);
  }
});

// === ОБРАБОТЧИКИ ===

function setupEventListeners() {
    copyOverlayBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(overlayUrl.textContent);
        UI.showToast('Ссылка скопирована');
    });

    openOverlayBtn.addEventListener('click', () => {
        window.open(overlayUrl.textContent, '_blank');
    });

    closeRoundModal.addEventListener('click', () => {
        roundModal.classList.remove('active');
    });

    cancelRoundBtn.addEventListener('click', () => {
        roundModal.classList.remove('active');
    });

    roundModal.addEventListener('click', (e) => {
        if (e.target === roundModal) {
            roundModal.classList.remove('active');
        }
    });
}

// === УТИЛИТЫ ===

function getRoleLabel(role) {
    const labels = {
        'civilian': 'Мирный',
        'mafia': 'Мафия',
        'don': 'Дон',
        'sheriff': 'Шериф'
    };
    return labels[role] || role;
}

function getPlayerName(playerId) {
    const seat = gameData.seating.find(s => s.player_id === playerId);
    return seat ? `${seat.position}. ${seat.nickname}` : '?';
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

