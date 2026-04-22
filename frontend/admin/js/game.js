// c:\mafia-overlay\frontend\admin\js\game.js
window.UI = window.UI || {
  showToast(message, type = 'info') {
    console.log(`[${type}] ${message}`);
  }
};

// Глобальные переменные
let tournamentId = null;
let gameNumber = null;
let gameData = null;
let tournamentPlayers = [];
let socket = null; // локальная переменная для удобства
let currentNominees = [];
let votedOutPlayers = [];
let selectedFirstKilled = null;
let selectedSuspects = [];

// DOM элементы
const gameTitle = document.getElementById('gameTitle');
const overlayUrl = document.getElementById('overlayUrl');
const copyOverlayBtn = document.getElementById('copyOverlayBtn');
const openOverlayBtn = document.getElementById('openOverlayBtn');
const toggleOverlayVisibilityBtn = document.getElementById('toggleOverlayVisibilityBtn');
const rolesSection = document.getElementById('rolesSection');
const rolesGrid = document.getElementById('rolesGrid');
const bestMoveSection = document.getElementById('bestMoveSection');
const nomineesSection = document.getElementById('nomineesSection');
const roundsSection = document.getElementById('roundsSection');
const roundModal = document.getElementById('roundModal');
const roundForm = document.getElementById('roundForm');
const closeRoundModal = document.getElementById('closeRoundModal');
const closeRoundBtn = document.getElementById('closeRoundBtn');
const addRoundBtn = document.getElementById('addRoundBtn');
const roundsList = document.getElementById('roundsList');
const saveSeatingBtn = document.getElementById('saveSeatingBtn');
const winRedBtn = document.getElementById('winRedBtn');
const winBlackBtn = document.getElementById('winBlackBtn');
const showStandingsBtn = document.getElementById('showStandingsBtn');
const scoresModal = document.getElementById('scoresModal');
const scoresTableBody = document.getElementById('scoresTableBody');
const closeScoresModal = document.getElementById('closeScoresModal');
const cancelScoresBtn = document.getElementById('cancelScoresBtn');
const confirmScoresBtn = document.getElementById('confirmScoresBtn');

let selectedWinnerTeam = null;

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  tournamentId = urlParams.get('tournament');
  gameNumber = parseInt(urlParams.get('game'), 10);

  if (!tournamentId || !gameNumber) {
    UI.showToast('Игра не найдена (нет tournament или game в URL)', 'error');
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
    const socketUrl = window.OVERLAY_CONFIG?.SOCKET_URL || 'http://192.168.0.121:3000';
    socket = io(socketUrl);
    window.gameSocket = socket; // делаем доступным для панели управления
    
    socket.on('connect', () => {
      if (gameData?.id) {
        socket.emit('join_game', gameData.id);
      }
    });
    
    socket.on('disconnect', () => {});
    
    socket.on('game_updated', () => {
      loadGameData();
    });

    socket.on('roles_changed', payload => {
      if (!payload || !gameData || payload.gameId !== gameData.id) return;
      animateRoleChange(payload.positions || []);
    });
  } catch (error) {
    console.error('WebSocket connection error:', error);
  }
}

function isPlayerOut(playerId) {
  if (!gameData) return false;

  const seat = gameData.seating.find(s => s.player_id === playerId);
  if (seat && seat.is_eliminated) {
    return true;
  }

  if (!gameData.rounds || gameData.rounds.length === 0) {
    return false;
  }

  for (const round of gameData.rounds) {
    if (!round) continue;

    if (!round.mafia_miss && round.mafia_kill_player_id === playerId) {
      return true;
    }

    if (!round.nobody_voted_out && Array.isArray(round.voted_out_players)) {
      if (round.voted_out_players.includes(playerId)) {
        return true;
      }
    }
  }

  return false;
}

// Загрузка данных игры
async function loadGameData() {
  try {
    gameData = await API.request(`/games/by-number/${tournamentId}/${gameNumber}`);
    tournamentPlayers = await API.getTournamentPlayers(gameData.tournament_id);
    
    renderGameHeader();
    renderOverlayLink();
    updateOverlayVisibilityButton();
    
    rolesSection.style.display = 'block';
    renderRoles();

    bestMoveSection.style.display = 'block';
    nomineesSection.style.display = 'block';
    roundsSection.style.display = 'block';
    
    loadBestMoveData();
    renderBestMove();
    renderNominees();
    renderRounds();
    updateResultButtons();
  } catch (error) {
    console.error('Ошибка загрузки игры:', error);
    UI.showToast('Ошибка загрузки игры: ' + error.message, 'error');
  }
}

function gameIdFromData() {
  return gameData.id;
}

// Проверяем, подтверждены ли результаты, и активируем кнопку
async function updateResultButtons() {
  try {
    const scoresData = await API.request(`/games/${gameIdFromData()}/scores`);
    if (scoresData && scoresData.result && scoresData.result.confirmed) {
      if (showStandingsBtn) {
        showStandingsBtn.disabled = false;
      }
    }
  } catch (e) {
    // Результаты ещё не созданы — это нормально
  }
}

// Заголовок
function renderGameHeader() {
  gameTitle.textContent = `Игра ${gameData.game_number} ${gameData.series_name ? '- ' + gameData.series_name : ''}`;
}

// Ссылка на оверлей
function renderOverlayLink() {
  const base = window.OVERLAY_CONFIG?.BASE_URL || 'http://192.168.0.121:3000';
  const url = `${base}/overlay/index.html?tournament=${tournamentId}&game=${gameNumber}`;
  overlayUrl.textContent = url;
}

function updateOverlayVisibilityButton() {
  if (!toggleOverlayVisibilityBtn || !gameData) return;
  toggleOverlayVisibilityBtn.textContent = gameData.overlay_hidden ? 'Отобразить оверлей' : 'Скрыть оверлей';
}

// === Рассадка + роли ===

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
    <div class="seating-item seating-line" style="margin-bottom: 16px;">
        <div class="position-number">${seat.position}</div>
        <div class="seating-select-wrapper">
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
            <button class="role-btn civilian ${!seat.role || seat.role === 'civilian' ? 'active' : ''}" 
                data-position="${seat.position}" data-role="civilian" data-team="red">
                Мир
            </button>
            <button class="role-btn black ${seat.role === 'mafia' ? 'active' : ''}" 
                    data-position="${seat.position}" data-role="mafia" data-team="black">
                Маф
            </button>
            <button class="role-btn black ${seat.role === 'don' ? 'active' : ''}" 
                    data-position="${seat.position}" data-role="don" data-team="black">
                Дон
            </button>
            <button class="role-btn yellow ${seat.role === 'sheriff' ? 'active' : ''}" 
                    data-position="${seat.position}" data-role="sheriff" data-team="red">
                Шер
            </button>
            <button 
                class="role-btn eliminated-toggle ${seat.is_eliminated && seat.elimination_reason === 'removed' ? 'active' : ''}"
                type="button"
                data-player-id="${seat.player_id}">
                Удален
            </button>
            <button 
                class="role-btn card-yellow ${seat.card === 'yellow' ? 'active' : ''}"
                type="button"
                data-player-id="${seat.player_id}">
                ЖК
            </button>
            <button 
                class="role-btn card-red ${seat.card === 'red' ? 'active' : ''}"
                type="button"
                data-player-id="${seat.player_id}">
                КК
            </button>
        </div>
    </div>
  `).join('');

  saveSeatingBtn.style.display = 'inline-block';

  document.querySelectorAll('.role-btn').forEach(btn => {
    const isEliminateBtn = btn.classList.contains('eliminated-toggle');
    const isCardYellow = btn.classList.contains('card-yellow');
    const isCardRed = btn.classList.contains('card-red');

    if (isEliminateBtn) {
      btn.addEventListener('click', async () => {
        const playerId = btn.dataset.playerId;
        const isActive = btn.classList.contains('active');
        const newEliminated = !isActive;

        try {
          await API.setPlayerElimination(gameIdFromData(), playerId, newEliminated);
          socket.emit('game_updated', { gameId: gameIdFromData() });
          await loadGameData();
        } catch (error) {
          UI.showToast('Ошибка изменения статуса удаления игрока', 'error');
          console.error(error);
        }
      });
    } else if (isCardYellow || isCardRed) {
      btn.addEventListener('click', async () => {
        const playerId = btn.dataset.playerId;
        const parent = btn.parentElement;
        const yBtn = parent.querySelector('.card-yellow');
        const rBtn = parent.querySelector('.card-red');
        const hasYellow = yBtn.classList.contains('active');
        const hasRed = rBtn.classList.contains('active');

        let newCard = 'none';

        if (isCardYellow) {
          if (hasRed) {
            newCard = 'red';
          } else if (hasYellow) {
            newCard = 'red';
          } else {
            newCard = 'yellow';
          }
        } else if (isCardRed) {
          newCard = hasRed ? 'none' : 'red';
        }

        try {
          await API.setPlayerCard(gameIdFromData(), playerId, newCard);

          yBtn.classList.remove('active');
          rBtn.classList.remove('active');

          if (newCard === 'yellow') {
            yBtn.classList.add('active');
          } else if (newCard === 'red') {
            rBtn.classList.add('active');
          }

          socket.emit('game_updated', { gameId: gameIdFromData() });
          await loadGameData();
        } catch (error) {
          UI.showToast('Ошибка изменения карточки игрока', 'error');
          console.error(error);
        }
      });
    } else {
      btn.addEventListener('click', async () => {
        const position = btn.dataset.position;
        
        document.querySelectorAll(`.role-btn[data-position="${position}"]`).forEach(b => {
          if (!b.classList.contains('eliminated-toggle') &&
              !b.classList.contains('card-yellow') &&
              !b.classList.contains('card-red')) {
            b.classList.remove('active');
          }
        });
        btn.classList.add('active');

        await applyRolesInstant();
      });
    }
  });

  updateAvailablePlayers();
}

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
    await API.createSeating(gameIdFromData(), seating);
    UI.showToast('Рассадка сохранена');

    socket.emit('game_updated', { gameId: gameIdFromData() });

    await loadGameData();
  } catch (error) {
    UI.showToast('Ошибка сохранения рассадки', 'error');
    console.error(error);
  }
});

async function applyRolesInstant() {
  if (!gameData.seating || gameData.seating.length === 0) {
    UI.showToast('Сначала сохраните рассадку', 'error');
    return;
  }

  const roles = [];
  const changedPositions = [];

  for (let position = 1; position <= 10; position++) {
    const activeBtn = document.querySelector(`.role-btn[data-position="${position}"].active`);
    
    let role = 'civilian';
    let team = 'red';
    
    if (activeBtn && activeBtn.dataset.role !== 'none') {
      role = activeBtn.dataset.role;
      team = activeBtn.dataset.team;
    }

    roles.push({ position, role, team });

    const seat = gameData.seating.find(s => s.position === position);
    if (seat && (seat.role !== role || seat.team !== team)) {
      changedPositions.push(position);
    }
  }

  const donCount = roles.filter(r => r.role === 'don').length;
  const sheriffCount = roles.filter(r => r.role === 'sheriff').length;
  const mafiaCount = roles.filter(r => r.role === 'mafia').length;

  if (donCount !== 1 || sheriffCount !== 1 || mafiaCount < 2 || mafiaCount > 3) {
    UI.showToast('Распределение ролей сейчас не соответствует стандарту (1 Дон, 1 Шериф, 2–3 мафии)', 'error');
  }

  try {
    await API.assignRoles(gameIdFromData(), roles);
    socket.emit('game_updated', { gameId: gameIdFromData() });
    socket.emit('roles_changed', { gameId: gameIdFromData(), positions: changedPositions });
  } catch (error) {
    UI.showToast('Ошибка назначения ролей', 'error');
    console.error(error);
  }
}

// === ЛУЧШИЙ ХОД ===

function renderBestMove() {
  const aliveSeats = gameData.seating.filter(s => !s.is_eliminated);
  
  const bestMoveInfo = document.getElementById('bestMoveInfo');
  if (gameData.best_move && gameData.best_move.first_killed_player_id) {
    const firstKilledSeat = gameData.seating.find(s => s.player_id === gameData.best_move.first_killed_player_id);
    if (firstKilledSeat) {
      bestMoveInfo.innerHTML = `<p><strong>ПУ:</strong> ${firstKilledSeat.position}. ${firstKilledSeat.nickname}</p>`;
    }
  } else {
    bestMoveInfo.innerHTML = `<p style="color: var(--text-secondary);">ПУ</p>`;
  }
  
  const suspectsButtons = document.getElementById('suspectsButtons');
  suspectsButtons.innerHTML = aliveSeats.map(s => `
    <button class="btn ${selectedSuspects.includes(s.player_id) ? 'btn-primary' : 'btn-secondary'}" 
        onclick="toggleSuspect('${s.player_id}', ${s.position})"
        style="min-width: 50px;">
        ${s.position}
    </button>
  `).join('');
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

window.toggleSuspect = (playerId) => {
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
    await API.setBestMove(gameIdFromData(), data);
    UI.showToast('ЛХ сохранен');
    socket.emit('game_updated', { gameId: gameIdFromData() });
    
    await loadGameData();
  } catch (error) {
    UI.showToast('Ошибка сохранения ЛХ', 'error');
    console.error(error);
  }
});

// === ВЫСТАВЛЕНИЕ НА ГОЛОСОВАНИЕ ===

function renderNominees() {
  const aliveSeats = gameData.seating.filter(s => !isPlayerOut(s.player_id));

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
  if (!seat || isPlayerOut(playerId)) {
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
    await API.updateNominees(gameIdFromData(), playerIds);
    
    socket.emit('game_updated', { gameId: gameIdFromData() });
    
    await loadGameData();
  } catch (error) {
    UI.showToast('Ошибка обновления выставленных', 'error');
    console.error(error);
  }
}

function renderNomineesList() {
  const nomineesList = document.getElementById('nomineesList');
  
  if (!currentNominees || currentNominees.length === 0) {
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

// === Круги ===

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
          <p><strong>🔫Убит:</strong> ${mafiaKill}</p>
          <p><strong>🎩 Проверка дона:</strong> ${donCheck}</p>
          <p><strong>⭐ Проверка шерифа:</strong> ${sheriffCheck}</p>
          <p><strong>👍 Голосование:</strong> ${votedOut}</p>
        </div>
      </div>
    `;
  }).join('');
}

window.editRound = (roundNumber) => {
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
  roundForm.dataset.mode = 'create';
});

// Модалка доп. баллов судьи
function openScoresModal() {
  if (!gameData || !gameData.seating) {
    UI.showToast('Сначала сохраните рассадку', 'error');
    return;
  }

  scoresTableBody.innerHTML = gameData.seating
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(seat => `
      <tr>
        <td style="padding:4px 8px;">${seat.position}</td>
        <td style="padding:4px 8px;">${seat.nickname}</td>
        <td style="padding:4px 8px;">
          <input
            type="number"
            class="form-input"
            data-player-id="${seat.player_id}"
            value="0"
            step="0.1"
            min="-3"
            max="2"
            style="max-width:90px; padding:6px 8px; min-height:0;">
        </td>
      </tr>
    `).join('');

  scoresModal.classList.add('active');
}

function populateRoundSelects() {
  const aliveSeats = gameData.seating.filter(s => !isPlayerOut(s.player_id));
  const allSeats = gameData.seating.slice();

  const aliveOptions = aliveSeats.map(s => 
    `<option value="${s.player_id}">${s.position}. ${s.nickname}</option>`
  ).join('');

  const allOptions = allSeats.map(s => 
    `<option value="${s.player_id}">${s.position}. ${s.nickname}</option>`
  ).join('');

  document.getElementById('mafiaKill').innerHTML = 
    '<option value="">Выберите игрока</option><option value="miss">❌ Промах</option>' + aliveOptions;
  
  document.getElementById('donCheck').innerHTML = 
    '<option value="">Выберите игрока</option><option value="none">❌ Не проверял</option>' + allOptions;
  
  document.getElementById('sheriffCheck').innerHTML = 
    '<option value="">Выберите игрока</option><option value="none">❌ Не проверял</option>' + allOptions;

  const votedSet = new Set(votedOutPlayers);

  const addVotedOutOptions = aliveSeats.map(s => {
    const disabled = votedSet.has(s.player_id) ? 'disabled' : '';
    return `<option value="${s.player_id}" ${disabled}>${s.position}. ${s.nickname}</option>`;
  }).join('');

  document.getElementById('addVotedOut').innerHTML = 
    '<option value="">+ Добавить игрока</option><option value="nobody">❌ Никто не выбыл</option>' + addVotedOutOptions;
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

window.removeVotedOut = async (playerId) => {
  votedOutPlayers = votedOutPlayers.filter(id => id !== playerId);
  renderVotedOutList();
  await saveRound();
};

document.getElementById('addVotedOut').addEventListener('change', async (e) => {
  const value = e.target.value;
  if (!value) return;

  if (value === 'nobody') {
    votedOutPlayers = [];
    renderVotedOutList();
    e.target.value = '';
    await saveRound();
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
  await saveRound();
});

['mafiaKill', 'donCheck', 'sheriffCheck'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    saveRound();
  });
});

async function saveRound() {
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
      await API.updateRound(gameIdFromData(), roundNumber, roundData);
    } else {
      await API.addRound(gameIdFromData(), roundData);
      roundForm.dataset.mode = 'edit';
    }

    socket.emit('game_updated', { gameId: gameIdFromData() });
    await loadGameData();
  } catch (error) {
    UI.showToast('Ошибка сохранения круга', 'error');
    console.error(error);
  }
}

// === Общие обработчики ===

function setupEventListeners() {
  copyOverlayBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(overlayUrl.textContent);
    UI.showToast('Ссылка скопирована');
  });

  openOverlayBtn.addEventListener('click', () => {
    window.open(overlayUrl.textContent, '_blank');
  });

  if (toggleOverlayVisibilityBtn) {
    toggleOverlayVisibilityBtn.addEventListener('click', async () => {
      try {
        const newHidden = !gameData.overlay_hidden;
        await API.setOverlayVisibility(gameIdFromData(), newHidden);
        UI.showToast(newHidden ? 'Оверлей скрыт' : 'Оверлей отображается');
        socket.emit('game_updated', { gameId: gameIdFromData() });
        await loadGameData();
      } catch (error) {
        UI.showToast('Ошибка переключения видимости оверлея', 'error');
        console.error(error);
      }
    });
  }

  // Кнопки результата игры
  if (winRedBtn) {
    winRedBtn.addEventListener('click', async () => {
      selectedWinnerTeam = 'red';
      try {
        await API.request(`/games/${gameIdFromData()}/result-init`, {
          method: 'POST',
          body: JSON.stringify({ winner_team: 'red' })
        });
        openScoresModal();
      } catch (error) {
        UI.showToast('Ошибка инициализации результата игры', 'error');
        console.error(error);
      }
    });
  }

  if (winBlackBtn) {
    winBlackBtn.addEventListener('click', async () => {
      selectedWinnerTeam = 'black';
      try {
        await API.request(`/games/${gameIdFromData()}/result-init`, {
          method: 'POST',
          body: JSON.stringify({ winner_team: 'black' })
        });
        openScoresModal();
      } catch (error) {
        UI.showToast('Ошибка инициализации результата игры', 'error');
        console.error(error);
      }
    });
  }

  // Модалка доп. баллов
  if (closeScoresModal) {
    closeScoresModal.addEventListener('click', () => {
      scoresModal.classList.remove('active');
    });
  }
  if (cancelScoresBtn) {
    cancelScoresBtn.addEventListener('click', () => {
      scoresModal.classList.remove('active');
    });
  }
  if (scoresModal) {
    scoresModal.addEventListener('click', (e) => {
      if (e.target === scoresModal) {
        scoresModal.classList.remove('active');
      }
    });
  }

  if (confirmScoresBtn) {
    confirmScoresBtn.addEventListener('click', async () => {
      try {
        const inputs = scoresTableBody.querySelectorAll('input[data-player-id]');
        const judge_scores = Array.from(inputs).map(input => ({
          player_id: input.dataset.playerId,
          bonus: Number(input.value || 0)
        }));

        await API.request(`/games/${gameIdFromData()}/result-confirm`, {
          method: 'POST',
          body: JSON.stringify({ judge_scores })
        });

        scoresModal.classList.remove('active');
        UI.showToast('Результат игры подтверждён');

        if (showStandingsBtn) {
          showStandingsBtn.disabled = false;
        }

        socket.emit('game_scores_confirmed', { gameId: gameIdFromData(), tournamentId });
      } catch (error) {
        UI.showToast('Ошибка сохранения результатов', 'error');
        console.error(error);
      }
    });
  }

  // Кнопка «Промежуточный итог»
  if (showStandingsBtn) {
    showStandingsBtn.addEventListener('click', () => {
      if (!gameData) return;
      socket.emit('show_tournament_standings', {
        gameId: gameIdFromData(),
        tournamentId
      });
    });
  }

  closeRoundModal.addEventListener('click', () => {
    roundModal.classList.remove('active');
  });

  closeRoundBtn.addEventListener('click', () => {
    roundModal.classList.remove('active');
  });

  roundModal.addEventListener('click', (e) => {
    if (e.target === roundModal) {
      roundModal.classList.remove('active');
    }
  });
}

// Утилиты

function getPlayerName(playerId) {
  const seat = gameData.seating.find(s => s.player_id === playerId);
  return seat ? `${seat.position}. ${seat.nickname}` : '?';
}

function animateRoleChange(positions) {
  if (!Array.isArray(positions) || positions.length === 0) return;

  requestAnimationFrame(() => {
    positions.forEach(pos => {
      const card = document.querySelector(`.player-card[data-position="${pos}"]`);
      if (!card) return;

      card.classList.remove('role-changed');
      void card.offsetWidth;
      card.classList.add('role-changed');

      setTimeout(() => {
        card.classList.remove('role-changed');
      }, 600);
    });
  });
}
