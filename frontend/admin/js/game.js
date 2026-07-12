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
    const socketUrl = window.OVERLAY_CONFIG?.SOCKET_URL || window.location.origin;
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

// Проверяем, подтверждены ли результаты; если да — показываем редактируемую таблицу
async function updateResultButtons() {
  const editBlock = document.getElementById('resultEditBlock');
  try {
    const scoresData = await API.request(`/games/${gameIdFromData()}/scores`);
    if (scoresData && scoresData.result && scoresData.result.confirmed) {
      if (showStandingsBtn) showStandingsBtn.disabled = false;
      renderResultEditTable(scoresData);
      if (editBlock) editBlock.style.display = 'block';
    } else {
      if (editBlock) editBlock.style.display = 'none';
    }
  } catch (e) {
    // Результаты ещё не созданы — прячем таблицу
    if (editBlock) editBlock.style.display = 'none';
  }
}

// Текущий выбранный исход в редактируемой таблице
let editWinnerTeam = null;

// Отрисовка редактируемой таблицы результата
function renderResultEditTable(scoresData) {
  const body = document.getElementById('resultEditBody');
  const label = document.getElementById('resultWinnerLabel');
  if (!body) return;

  const scores = scoresData.scores || [];
  editWinnerTeam = scoresData.result.winner_team;

  // Переключатель исхода
  const teams = [
    { key: 'red', text: 'Победа МИР', cls: 'btn-success' },
    { key: 'black', text: 'Победа МАФ', cls: 'btn-danger' },
    { key: 'draw', text: 'Ничья', cls: 'btn-secondary' }
  ];
  label.innerHTML = 'Исход: ' + teams.map(t =>
    `<button class="btn ${t.cls} result-winner-btn" data-team="${t.key}"
       style="padding:6px 12px; font-size:13px; margin-right:6px; ${editWinnerTeam === t.key ? '' : 'opacity:0.45;'}">
       ${t.text}${editWinnerTeam === t.key ? ' ✓' : ''}
     </button>`
  ).join('');

  label.querySelectorAll('.result-winner-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      editWinnerTeam = btn.dataset.team;
      // Перерисовываем подсветку исхода и пересчитываем колонку "Победа" визуально
      renderResultEditTable({
        result: { winner_team: editWinnerTeam },
        scores: collectResultRows(scores)
      });
    });
  });

  // Сортировка по позиции для стабильного вида
  const sorted = scores.slice().sort((a, b) => a.position - b.position);

  body.innerHTML = sorted.map(s => {
    const win = (editWinnerTeam !== 'draw' && s.team === editWinnerTeam) ? 1 : 0;
    return `
      <tr data-player-id="${s.player_id}" data-team="${s.team}">
        <td style="padding:4px 6px;">${s.position}</td>
        <td style="padding:4px 6px;">${s.nickname}</td>
        <td style="text-align:center; padding:4px 6px;" class="cell-win">${win === 1 ? '1' : '—'}</td>
        <td style="text-align:center; padding:4px 6px;">
          <input type="number" class="form-input res-bonus" value="${Number(s.judge_bonus) || 0}" step="0.1" min="0"
                 style="max-width:70px; padding:4px 6px; min-height:0;">
        </td>
        <td style="text-align:center; padding:4px 6px;">
          <input type="number" class="form-input res-penalty" value="${Number(s.penalty_score) || 0}" step="0.1" max="0"
                 style="max-width:70px; padding:4px 6px; min-height:0;">
        </td>
        <td style="text-align:center; padding:4px 6px;">
          <input type="number" class="form-input res-card" value="${Number(s.card_penalty) || 0}" step="0.05"
                 style="max-width:70px; padding:4px 6px; min-height:0;">
        </td>
        <td style="text-align:center; padding:4px 6px;">${Number(s.lh_score) || 0}</td>
        <td style="text-align:center; padding:4px 6px;">${Number(s.ci_score) || 0}</td>
        <td style="text-align:center; padding:4px 6px; font-weight:700;" class="cell-total">${Number(s.total_score) || 0}</td>
      </tr>
    `;
  }).join('');
}

// Собирает текущие значения из полей таблицы (для перерисовки при смене исхода)
function collectResultRows(originalScores) {
  const rows = document.querySelectorAll('#resultEditBody tr');
  const map = {};
  rows.forEach(tr => {
    const pid = tr.dataset.playerId;
    map[pid] = {
      judge_bonus: Number(tr.querySelector('.res-bonus')?.value || 0),
      penalty_score: Number(tr.querySelector('.res-penalty')?.value || 0),
      card_penalty: Number(tr.querySelector('.res-card')?.value || 0)
    };
  });
  // Мержим введённые значения обратно в исходные scores
  return originalScores.map(s => ({
    ...s,
    judge_bonus: map[s.player_id]?.judge_bonus ?? s.judge_bonus,
    penalty_score: map[s.player_id]?.penalty_score ?? s.penalty_score,
    card_penalty: map[s.player_id]?.card_penalty ?? s.card_penalty
  }));
}

// Заголовок
function renderGameHeader() {
  gameTitle.textContent = `Игра ${gameData.game_number} ${gameData.series_name ? '- ' + gameData.series_name : ''}`;
}

// Ссылка на оверлей
function renderOverlayLink() {
  const base = window.OVERLAY_CONFIG?.BASE_URL || window.location.origin;
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
                class="role-btn critical-toggle ${seat.is_critical ? 'active' : ''}"
                type="button"
                data-player-id="${seat.player_id}"
                title="Критический круг (штраф за удаление -1 вместо -0.5)">
                Крит
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
            <span class="foul-counter" title="Фолы (0-4)" style="display:inline-flex; align-items:center; gap:4px; margin-left:8px; font-weight:700;">
                <button class="role-btn foul-minus" type="button" data-player-id="${seat.player_id}" style="padding:2px 8px;">−</button>
                <span class="foul-value" data-player-id="${seat.player_id}" style="min-width:18px; text-align:center;">${seat.fouls || 0}</span>
                <button class="role-btn foul-plus" type="button" data-player-id="${seat.player_id}" style="padding:2px 8px;">+</button>
                <span style="font-size:12px; color:var(--text-secondary);">фол</span>
            </span>
        </div>
    </div>
  `).join('');

  saveSeatingBtn.style.display = 'inline-block';

  document.querySelectorAll('.role-btn').forEach(btn => {
    const isEliminateBtn = btn.classList.contains('eliminated-toggle');
    const isCriticalBtn = btn.classList.contains('critical-toggle');
    const isCardYellow = btn.classList.contains('card-yellow');
    const isCardRed = btn.classList.contains('card-red');
    const isFoulPlus = btn.classList.contains('foul-plus');
    const isFoulMinus = btn.classList.contains('foul-minus');

    if (isFoulPlus || isFoulMinus) {
      btn.addEventListener('click', async () => {
        const playerId = btn.dataset.playerId;
        const delta = isFoulPlus ? 1 : -1;
        try {
          await API.setPlayerFoul(gameIdFromData(), playerId, delta);
          socket.emit('game_updated', { gameId: gameIdFromData() });
          await loadGameData();
        } catch (error) {
          UI.showToast('Ошибка изменения фолов', 'error');
          console.error(error);
        }
      });
    } else if (isCriticalBtn) {
      btn.addEventListener('click', async () => {
        const playerId = btn.dataset.playerId;
        const isActive = btn.classList.contains('active');
        const newCritical = !isActive;

        try {
          await API.setPlayerCritical(gameIdFromData(), playerId, newCritical);
          socket.emit('game_updated', { gameId: gameIdFromData() });
          await loadGameData();
        } catch (error) {
          UI.showToast('Ошибка изменения критичности круга', 'error');
          console.error(error);
        }
      });
    } else if (isEliminateBtn) {
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
  } else {
    selectedSuspects = [];
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
async function openScoresModal() {
  if (!gameData || !gameData.seating) {
    UI.showToast('Сначала сохраните рассадку', 'error');
    return;
  }

  // Получаем предпосчитанный авто-штраф за карточки/удаление (с прогрессией ЖК)
  let cardPenalties = {};
  try {
    const resp = await API.getCardPenalties(gameIdFromData());
    cardPenalties = resp.penalties || {};
  } catch (e) {
    console.error('Не удалось получить авто-штрафы карточек:', e);
  }

  scoresTableBody.innerHTML = gameData.seating
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(seat => {
      const autoPenalty = cardPenalties[seat.player_id] || 0;
      return `
      <tr>
        <td style="padding:4px 8px;">${seat.position}</td>
        <td style="padding:4px 8px;">${seat.nickname}</td>
        <td style="padding:4px 8px;">
          <input
            type="number"
            class="form-input score-bonus"
            data-player-id="${seat.player_id}"
            value="0"
            step="0.1"
            min="0"
            style="max-width:80px; padding:6px 8px; min-height:0;">
        </td>
        <td style="padding:4px 8px;">
          <input
            type="number"
            class="form-input score-penalty"
            data-player-id="${seat.player_id}"
            value="0"
            step="0.1"
            max="0"
            style="max-width:80px; padding:6px 8px; min-height:0;">
        </td>
        <td style="padding:4px 8px;">
          <input
            type="number"
            class="form-input score-card-penalty"
            data-player-id="${seat.player_id}"
            value="${autoPenalty}"
            step="0.05"
            style="max-width:80px; padding:6px 8px; min-height:0;">
        </td>
      </tr>
    `;
    }).join('');

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
  const winDrawBtn = document.getElementById('winDrawBtn');
  if (winDrawBtn) {
    winDrawBtn.addEventListener('click', async () => {
      selectedWinnerTeam = 'draw';
      try {
        await API.request(`/games/${gameIdFromData()}/result-init`, {
          method: 'POST',
          body: JSON.stringify({ winner_team: 'draw' })
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
        // Собираем по каждому игроку: доп.балл, ручной штраф, авто-штраф карточек
        const rows = scoresTableBody.querySelectorAll('tr');
        const judge_scores = [];
        scoresTableBody.querySelectorAll('.score-bonus').forEach(bonusInput => {
          const playerId = bonusInput.dataset.playerId;
          const penaltyInput = scoresTableBody.querySelector(`.score-penalty[data-player-id="${playerId}"]`);
          const cardInput = scoresTableBody.querySelector(`.score-card-penalty[data-player-id="${playerId}"]`);

          // Доп. балл — только положительный или 0
          let bonus = Number(bonusInput.value || 0);
          if (bonus < 0) bonus = 0;

          // Штраф — только отрицательный или 0
          let penalty = Number(penaltyInput ? penaltyInput.value : 0);
          if (penalty > 0) penalty = 0;

          judge_scores.push({
            player_id: playerId,
            bonus: bonus,
            penalty: penalty,
            card_penalty: Number(cardInput ? cardInput.value : 0)
          });
        });

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
        // показать редактируемую таблицу сразу, без перезагрузки
        await updateResultButtons();
      } catch (error) {
        UI.showToast('Ошибка сохранения результатов', 'error');
        console.error(error);
      }
    });
  }
const saveResultBtn = document.getElementById('saveResultBtn');
if (saveResultBtn) {
    saveResultBtn.addEventListener('click', async () => {
        try {
            const rows = document.querySelectorAll('#resultEditBody tr');
            const judge_scores = [];
            rows.forEach(tr => {
                const playerId = tr.dataset.playerId;
                if (!playerId) return;
                let bonus = Number(tr.querySelector('.res-bonus')?.value) || 0;
                let penalty = Number(tr.querySelector('.res-penalty')?.value) || 0;
                const card_penalty = Number(tr.querySelector('.res-card')?.value) || 0;
                // те же ограничения знаков, что и в модалке судьи
                bonus = Math.max(bonus, 0);
                penalty = Math.min(penalty, 0);
                judge_scores.push({ player_id: playerId, bonus, penalty, card_penalty });
            });

            if (!editWinnerTeam) {
                UI.showToast('Не выбран итог игры', 'error');
                return;
            }

            // сначала фиксируем актуальный итог (на случай смены победителя переключателем)
            await API.request(`/games/${gameIdFromData()}/result-init`, {
                method: 'POST',
                body: JSON.stringify({ winner_team: editWinnerTeam })
            });

            await API.request(`/games/${gameIdFromData()}/result-confirm`, {
                method: 'POST',
                body: JSON.stringify({ judge_scores })
            });

            UI.showToast('Изменения сохранены');
            socket.emit('game_updated', { gameId: gameIdFromData() });

            // перерисовываем блок актуальными данными из БД
            await updateResultButtons();
        } catch (error) {
            UI.showToast('Ошибка сохранения изменений', 'error');
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