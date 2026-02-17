window.UI = window.UI || {
  showToast(message, type = 'info') {
    console.log(`[${type}] ${message}`);
    // сюда потом повесишь нормальные тосты,
    // пока просто лог в консоль или alert
    // alert(message);
  }
};
// frontend/admin/js/game.js

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
const saveSeatingBtn = document.getElementById('saveSeatingBtn');

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Страница игры загружается...');
    
    const urlParams = new URLSearchParams(window.location.search);
    gameId = urlParams.get('id');
    
    console.log('Game ID:', gameId);
    
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
    try {
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
            loadGameData();
        });
    } catch (error) {
        console.error('WebSocket connection error:', error);
    }
}

// Загрузка данных игры
async function loadGameData() {
    try {
        console.log('📥 Загрузка данных игры...');
        
        gameData = await API.getGame(gameId);
        console.log('✅ Данные игры получены:', gameData);
        
        tournamentPlayers = await API.getTournamentPlayers(gameData.tournament_id);
        console.log('✅ Игроки турнира получены:', tournamentPlayers.length, 'игроков');
        
        renderGameHeader();
        renderOverlayLink();
        
        if (gameData.seating && gameData.seating.length > 0) {
            console.log('✅ Рассадка найдена:', gameData.seating.length, 'игроков');
        } else {
            console.log('⚠️ Рассадка не найдена, показываем пустую форму');
        }

        rolesSection.style.display = 'block';
        renderRoles();

        bestMoveSection.style.display = 'block';
        nomineesSection.style.display = 'block';
        roundsSection.style.display = 'block';
        
        loadBestMoveData();
        renderBestMove();
        renderNominees();
        renderRounds();
        
        console.log('✅ Страница игры полностью загружена');
    } catch (error) {
        console.error('❌ Ошибка загрузки игры:', error);
        UI.showToast('Ошибка загрузки игры: ' + error.message, 'error');
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

// === РАССАДКА + РОЛИ В ОДНОМ БЛОКЕ ===

function renderRoles() {
    const hasSeating = gameData.seating && gameData.seating.length > 0;

    if (!hasSeating) {
        rolesGrid.innerHTML = Array.from({ length: 10 }, (_, i) => {
            const position = i + 1;
            return `
              <div class="seating-item" style="margin-bottom: 16px;">
                <div class="position-number">${position}</div>
                <div style="flex: 1;">
                  <select class="form-select seating-player-select" data-position="${position}" onchange="updateAvailablePlayers()">
                    <option value="">Выберите игрока</option>
                    ${tournamentPlayers.map(p => `<option value="${p.id}">${p.nickname}</option>`).join('')}
                  </select>
                </div>
              </div>
            `;
        }).join('');

        saveSeatingBtn.style.display = 'inline-block';
        return;
    }

    rolesGrid.innerHTML = gameData.seating.map(seat => `
        <div class="seating-item" style="margin-bottom: 16px;">
            <div class="position-number">${seat.position}</div>
            <div style="flex: 1;">
                <div style="margin-bottom: 8px;">
                    <select class="form-select seating-player-select" data-position="${seat.position}" onchange="updateAvailablePlayers()">
                        <option value="">Выберите игрока</option>
                        ${tournamentPlayers.map(p => `
                            <option value="${p.id}" ${p.id === seat.player_id ? 'selected' : ''}>
                                ${p.nickname}
                            </option>
                        `).join('')}
                    </select>
                </div>
                <div class="role-buttons">
                    <button class="role-btn ${!seat.role || seat.role === 'civilian' ? 'active' : ''}" 
                            data-position="${seat.position}" data-role="none">
                        Мирный
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

    saveSeatingBtn.style.display = 'inline-block';

    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const position = btn.dataset.position;
            
            document.querySelectorAll(`.role-btn[data-position="${position}"]`).forEach(b => {
                b.classList.remove('active');
            });
            
            btn.classList.add('active');
        });
    });

    updateAvailablePlayers();
}

// Обновить доступных игроков в селектах рассадки
window.updateAvailablePlayers = () => {
    const selects = document.querySelectorAll('.seating-player-select');
    const selectedPlayerIds = Array.from(selects)
      .map(s => s.value)
      .filter(v => v !== '');
    
    selects.forEach(select => {
      const currentValue = select.value;
      const options = Array.from(select.options);
      
      options.forEach(option => {
        if (option.value === '') return;
        
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

// Сохранение рассадки (создание или редактирование)
saveSeatingBtn.addEventListener('click', async () => {
    const selects = document.querySelectorAll('.seating-player-select');
    const seating = [];
    const usedPlayers = new Set();

    for (const select of selects) {
        const playerId = select.value;
        const position = parseInt(select.dataset.position, 10);

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

        // оповещаем overlay
        socket.emit('game_updated', { gameId });

        await loadGameData();
    } catch (error) {
        UI.showToast('Ошибка сохранения рассадки', 'error');
        console.error(error);
    }
});

// === РОЛИ: применение ===

applyRolesBtn.addEventListener('click', async () => {
    if (!gameData.seating || gameData.seating.length === 0) {
        UI.showToast('Сначала сохраните рассадку', 'error');
        return;
    }

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
        
        socket.emit('game_updated', { gameId });
        
        await loadGameData();
    } catch (error) {
        UI.showToast('Ошибка назначения ролей', 'error');
        console.error(error);
    }
});

// === ЛУЧШИЙ ХОД ===

function renderBestMove() {
  const aliveSeats = gameData.seating.filter(s => !s.is_eliminated);
  
  const bestMoveInfo = document.getElementById('bestMoveInfo');
  if (gameData.best_move && gameData.best_move.first_killed_player_id) {
    const firstKilledSeat = gameData.seating.find(s => s.player_id === gameData.best_move.first_killed_player_id);
    if (firstKilledSeat) {
      bestMoveInfo.innerHTML = `<p><strong>Первый убитый (из круга 1):</strong> ${firstKilledSeat.position}. ${firstKilledSeat.nickname}</p>`;
    }
  } else {
    bestMoveInfo.innerHTML = `<p style="color: var(--text-secondary);">Первый убитый будет установлен автоматически после добавления круга 1</p>`;
  }
  
  const suspectsButtons = document.getElementById('suspectsButtons');
  suspectsButtons.innerHTML = aliveSeats.map(s => `
    <button class="btn ${selectedSuspects.includes(s.player_id) ? 'btn-primary' : 'btn-secondary'}" 
        onclick="toggleSuspect('${s.player_id}', ${s.position})"
        style="min-width: 50px;">
        ${s.position}
    </button>
  `).join('');
  
  const positions = selectedSuspects.map(id => {
    const seat = gameData.seating.find(s => s.player_id === id);
    return seat ? seat.position : '?';
  });
  document.getElementById('suspectsDisplay').textContent = 
    positions.length > 0 ? positions.join(', ') : 'нет';
}

function loadBestMoveData() {
  if (gameData.best_move) {
    selectedSuspects = [
      gameData.best_move.suspect_1,
      gameData.best_move.suspect_2,
      gameData.best_move.suspect_3
    ].filter(Boolean);
  }
}

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
  
  selectedSuspects.sort((a, b) => {
    const posA = gameData.seating.find(s => s.player_id === a).position;
    const posB = gameData.seating.find(s => s.player_id === b).position;
    return posA - posB;
  });
  
  renderBestMove();
};

document.getElementById('applyBestMoveBtn').addEventListener('click', async () => {
  if (selectedSuspects.length !== 3) {
    UI.showToast('Выберите ровно 3 подозреваемых', 'error');
    return;
  }
  
  let firstKilledPlayerId = gameData.best_move?.first_killed_player_id;
  
  if (!firstKilledPlayerId) {
    UI.showToast('Сначала добавьте круг 1 с первым убитым', 'error');
    return;
  }
  
  const data = {
    first_killed_player_id: firstKilledPlayerId,
    suspect_1: selectedSuspects[0],
    suspect_2: selectedSuspects[1],
    suspect_3: selectedSuspects[2]
  };
  
  try {
    await API.setBestMove(gameId, data);
    UI.showToast('ЛХ сохранен');
    socket.emit('game_updated', { gameId });
    
    await loadGameData();
  } catch (error) {
    UI.showToast('Ошибка сохранения ЛХ', 'error');
    console.error(error);
  }
});

// === ВЫСТАВЛЕНИЕ НА ГОЛОСОВАНИЕ ===

function renderNominees() {
    const aliveSeats = gameData.seating.filter(s => !s.is_eliminated);

    currentNominees = (gameData.nominees || []).filter(n =>
        aliveSeats.some(s => s.player_id === n.player_id)
    );

    const nomineeButtons = document.getElementById('nomineeButtons');
    nomineeButtons.innerHTML = Array.from({ length: 10 }, (_, i) => {
        const position = i + 1;
        const seat = aliveSeats.find(s => s.position === position);

        if (!seat) {
            return `<button class="nominee-btn" disabled>${position}</button>`;
        }

        const isSelected = currentNominees.some(n => n.player_id === seat.player_id);
        const btnClass = isSelected ? 'nominee-btn active' : 'nominee-btn';

        return `<button 
            class="${btnClass}" 
            type="button"
            data-player-id="${seat.player_id}" 
            data-position="${position}">
            ${position}
        </button>`;
    }).join('');

    nomineeButtons.querySelectorAll('.nominee-btn').forEach(btn => {
        if (btn.disabled) return;
        btn.addEventListener('click', () => toggleNominee(btn));
    });

    renderNomineesList();
}

function toggleNominee(button) {
    const playerId = button.dataset.playerId;

    const seat = gameData.seating.find(s => s.player_id === playerId);
    if (!seat || seat.is_eliminated) {
        UI.showToast('Игрок уже выбыл и не может быть выставлен', 'error');
        return;
    }

    const existingIndex = currentNominees.findIndex(n => n.player_id === playerId);

    if (existingIndex > -1) {
        currentNominees.splice(existingIndex, 1);
    } else {
        currentNominees.push({ player_id: playerId, nickname: seat.nickname });
    }

    updateNomineesOnServer();
}

async function updateNomineesOnServer() {
    try {
        const playerIds = currentNominees.map(n => n.player_id);
        await API.updateNominees(gameId, playerIds);
        
        socket.emit('game_updated', { gameId });
        
        renderNomineesList();
        renderNominees();
    } catch (error) {
        UI.showToast('Ошибка обновления выставленных', 'error');
        console.error(error);
    }
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
    await updateNomineesOnServer();
};

document.getElementById('clearNomineesBtn').addEventListener('click', async () => {
    currentNominees = [];
    await updateNomineesOnServer();
    UI.showToast('Список очищен');
});

// === КРУГи ===

function renderRounds() {
  if (!gameData.rounds || gameData.rounds.length === 0) {
    roundsList.innerHTML = '<div class="empty-state"><p>Нет кругов. Добавьте первый круг.</p></div>';
    return;
  }
  
  roundsList.innerHTML = gameData.rounds.map(round => {
    const mafiaKill = round.mafia_miss ? '❌ Промах' : round.mafia_kill_player_id ? getPlayerName(round.mafia_kill_player_id) : '-';
    const donCheck = round.don_check_player_id ? getPlayerName(round.don_check_player_id) : '❌';
    const sheriffCheck = round.sheriff_check_player_id ? getPlayerName(round.sheriff_check_player_id) : '❌';
    const votedOut = round.nobody_voted_out ? '❌ Никто' : (round.voted_out_players && round.voted_out_players.length > 0
      ? round.voted_out_players.map(id => getPlayerName(id)).join(', ') : '-');
    
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

window.editRound = async (roundNumber) => {
  const round = gameData.rounds.find(r => r.round_number === roundNumber);
  if (!round) return;
  
  votedOutPlayers = round.voted_out_players || [];
  
  document.getElementById('roundModalTitle').textContent = `Редактировать круг ${roundNumber}`;
  document.getElementById('roundNumber').value = roundNumber;
  
  populateRoundSelects();
  
  document.getElementById('mafiaKill').value = round.mafia_miss ? 'miss' : (round.mafia_kill_player_id || '');
  document.getElementById('donCheck').value = round.don_check_player_id || 'none';
  document.getElementById('sheriffCheck').value = round.sheriff_check_player_id || 'none';
  
  renderVotedOutList();
  roundModal.classList.add('active');
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
    roundForm.dataset.mode = '';
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
    
    socket.emit('game_updated', { gameId });
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
