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

// DOM элементы
const rolesSection = document.getElementById('rolesSection');
const rolesGrid = document.getElementById('rolesGrid');
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

    rolesSection.style.display = 'block';
    syncNominees();
    renderRoles();
    ppSyncFromData();
    renderPhasePanel();
    updateResultButtons();
    updateNextGameButton();
    
  } catch (error) {
    console.error('Ошибка загрузки игры:', error);
    UI.showToast('Ошибка загрузки игры: ' + error.message, 'error');
  }
}

function updateNextGameButton() {
  const btn = document.getElementById('nextGameBtn');
  if (!btn || !gameData) return;
  const total = Number(gameData.total_games) || null;
  // Кнопка видна всегда, но блокируется на последней игре
    if (total && gameNumber >= total) {
    btn.disabled = true;
    btn.title = 'Это последняя игра турнира';
  } else {
    btn.disabled = false;
    btn.title = '';
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
  const numEl = document.getElementById('gtGameNum');
  const subEl = document.getElementById('gtGameSub');
  if (numEl) numEl.textContent = `Игра ${gameData.game_number}`;
  if (subEl) subEl.textContent = gameData.series_name || '';
}

// Ссылка на оверлей
let overlayLinkUrl = '';
function renderOverlayLink() {
  const base = window.OVERLAY_CONFIG?.BASE_URL || window.location.origin;
  overlayLinkUrl = `${base}/overlay/index.html?tournament=${tournamentId}&game=${gameNumber}`;
  const btn = document.getElementById('copyOverlayBtn');
  if (btn) btn.title = 'Скопировать ссылку на оверлей\n' + overlayLinkUrl;
}

// Копирование с запасным способом (буфер обмена недоступен на http:// по IP)
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {}
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) {}
  ta.remove();
  return ok;
}

// === Рассадка + роли ===

function renderRoles() {
  const hasSeating = gameData.seating && gameData.seating.length > 0;

  if (!hasSeating) {
    rolesGrid.innerHTML = Array.from({ length: 10 }, (_, i) => {
      const position = i + 1;
      return `
        <div class="pl-row">
          <div class="pl-num">${position}</div>
          <div class="pl-name-wrap">
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

  rolesGrid.innerHTML = gameData.seating.map(seat => {
    const fouls = seat.fouls || 0;
    const out = seat.is_eliminated;
    const bars = Array.from({ length: 4 }, (_, i) =>
      `<div class="foul-bar ${i < fouls ? 'filled' : ''}"></div>`
    ).join('');

    const flags = [
      seat.card === 'yellow' ? '<span class="pl-flag f-yellow">ЖК</span>' : '',
      seat.card === 'red' ? '<span class="pl-flag f-red">КК</span>' : '',
      seat.is_critical ? '<span class="pl-flag f-crit">Крит</span>' : ''
    ].join('');
    const expanded = Number(plExpanded) === Number(seat.position);
    const outNow = isPlayerOut(seat.player_id);
    const nominated = (gameData.nominees || []).some(n => n.player_id === seat.player_id);

    return `
    <div class="pl-row ${out ? 'is-out' : ''} ${expanded ? 'expanded' : ''}" data-position="${seat.position}">
        <div class="pl-num">${seat.position}</div>

        <div class="pl-name-wrap">
            <select class="form-select seating-player-select" data-position="${seat.position}" onchange="updateAvailablePlayers()">
                <option value="">Выберите игрока</option>
                ${tournamentPlayers.map(p => `
                    <option value="${p.id}" ${p.id === seat.player_id ? 'selected' : ''}>${p.nickname}</option>
                `).join('')}
            </select>
        </div>

        <div class="pl-flags">${flags}</div>
        <button class="pl-nom ${nominated ? 'active' : ''} ${outNow ? 'is-hidden' : ''}" type="button"
            data-player-id="${seat.player_id}" title="Выставить / снять">Выст.</button>

        <div class="pl-fouls" title="Фолы (0-4). Клик по полоскам +1, «−» убирает">
            <div class="foul-bars foul-plus" data-player-id="${seat.player_id}">${bars}</div>
            <button class="foul-minus-btn foul-minus" type="button" data-player-id="${seat.player_id}">−</button>
        </div>

        <button class="pl-more" type="button" data-position="${seat.position}" aria-label="Карточки и статус">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
        </button>

        <div class="pl-controls">
            <div class="pl-roles">
                <button class="pl-btn role-civ ${!seat.role || seat.role === 'civilian' ? 'active' : ''}"
                    data-position="${seat.position}" data-role="civilian" data-team="red">Мир</button>
                <button class="pl-btn role-maf ${seat.role === 'mafia' ? 'active' : ''}"
                    data-position="${seat.position}" data-role="mafia" data-team="black">Маф</button>
                <button class="pl-btn role-don ${seat.role === 'don' ? 'active' : ''}"
                    data-position="${seat.position}" data-role="don" data-team="black">Дон</button>
                <button class="pl-btn role-sher ${seat.role === 'sheriff' ? 'active' : ''}"
                    data-position="${seat.position}" data-role="sheriff" data-team="red">Шер</button>
            </div>
            <div class="pl-extra">
                <button class="pl-btn card-yellow ${seat.card === 'yellow' ? 'active' : ''}"
                    type="button" data-player-id="${seat.player_id}" title="Жёлтая карточка">ЖК</button>
                <button class="pl-btn card-red ${seat.card === 'red' ? 'active' : ''}"
                    type="button" data-player-id="${seat.player_id}" title="Красная карточка">КК</button>
                <button class="pl-btn critical-toggle ${seat.is_critical ? 'active' : ''}"
                    type="button" data-player-id="${seat.player_id}" title="Критический круг">Крит</button>
                <button class="pl-btn eliminated-toggle ${out && seat.elimination_reason === 'removed' ? 'active' : ''}"
                    type="button" data-player-id="${seat.player_id}" title="Удалён">Удал</button>
            </div>
        </div>
    </div>
    `;
  }).join('');

  document.querySelectorAll('.pl-btn, .foul-plus, .foul-minus').forEach(btn => {
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
        const newCritical = !btn.classList.contains('active');
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
        const newEliminated = !btn.classList.contains('active');
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
          if (hasRed) newCard = 'red';
          else if (hasYellow) newCard = 'red';
          else newCard = 'yellow';
        } else if (isCardRed) {
          newCard = hasRed ? 'none' : 'red';
        }

        try {
          await API.setPlayerCard(gameIdFromData(), playerId, newCard);
          socket.emit('game_updated', { gameId: gameIdFromData() });
          await loadGameData();
        } catch (error) {
          UI.showToast('Ошибка изменения карточки игрока', 'error');
          console.error(error);
        }
      });
    } else {
      // Кнопки ролей
      btn.addEventListener('click', async () => {
        const position = btn.dataset.position;
        document.querySelectorAll(`.pl-btn[data-position="${position}"]`).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        await applyRolesInstant();
      });
    }
  });

  updateAvailablePlayers();
  applyPickHighlight();
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
  // «Сохранить рассадку»: после сохранения видна только при несохранённых изменениях
  if (gameData && gameData.seating && gameData.seating.length) {
    const dirty = Array.from(selects).some(s => {
      const seat = gameData.seating.find(x => String(x.position) === s.dataset.position);
      return !seat || s.value !== seat.player_id;
    });
    saveSeatingBtn.style.display = dirty ? 'inline-block' : 'none';
  }
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
    const activeBtn = document.querySelector(`.pl-btn[data-position="${position}"].active`);
    
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

  try {
    await API.assignRoles(gameIdFromData(), roles);
    socket.emit('game_updated', { gameId: gameIdFromData() });
    socket.emit('roles_changed', { gameId: gameIdFromData(), positions: changedPositions });
  } catch (error) {
    UI.showToast('Ошибка назначения ролей', 'error');
    console.error(error);
  }
}

// === ВЫСТАВЛЕНИЕ НА ГОЛОСОВАНИЕ ===
// Актуальный список выставленных (только живые, в порядке выставления)
function syncNominees() {
  const aliveSeats = gameData.seating.filter(s => !isPlayerOut(s.player_id));
  currentNominees = (gameData.nominees || []).filter(n =>
    aliveSeats.some(s => s.player_id === n.player_id)
  );
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

window.removeNominee = async (playerId) => {
  currentNominees = currentNominees.filter(n => n.player_id !== playerId);
  await updateNomineesOnServer();
};

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

// === Общие обработчики ===

function setupEventListeners() {
  const copyOverlayBtn = document.getElementById('copyOverlayBtn');
  if (copyOverlayBtn) {
    copyOverlayBtn.addEventListener('click', async () => {
      if (await copyText(overlayLinkUrl)) UI.showToast('Ссылка на оверлей скопирована');
      else window.prompt('Скопируйте ссылку:', overlayLinkUrl);
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
  
  const nextGameBtn = document.getElementById('nextGameBtn');
  if (nextGameBtn) {
    nextGameBtn.addEventListener('click', () => {
      const nextNumber = gameNumber + 1;
      // 1) Переключаем оверлей
      socket.emit('switch_overlay_game', {
        tournamentId,
        currentGameId: gameIdFromData(),
        nextGameNumber: nextNumber
      });
      UI.showToast(`Переключение на игру ${nextNumber}...`);
      // 2) Переключаем саму админку на следующую игру
      setTimeout(() => {
        window.location.href = `game.html?tournament=${tournamentId}&game=${nextNumber}`;
      }, 300);
    });
  }

  const rolesToggle = document.getElementById('rolesToggle');
if (rolesToggle) {
  rolesToggle.addEventListener('click', () => {
    const on = rolesToggle.classList.toggle('on');
    rolesSection.classList.toggle('roles-visible', on);
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
}

// Утилиты

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
// ================== ПАНЕЛЬ КРУГА (этап 2) ==================
let phaseState = { gameId: null, round: 1, step: null }; // step: null = автоматически
let phaseBusy = false;
let bmPick = [];

const PHASE_STEPS = [
  { key: 'vote',    label: 'Голосование',     icon: 'vote' },
  { key: 'kill',    label: 'Отстрел',         icon: 'kill' },
  { key: 'don',     label: 'Проверка Дона',   icon: 'don' },
  { key: 'sheriff', label: 'Проверка Шерифа', icon: 'sheriff' },
  { key: 'bm',      label: 'Лучший ход',      icon: null }
];

function ppRound(n) { return (gameData.rounds || []).find(r => r.round_number === n) || null; }
function ppSeat(id) { return gameData.seating.find(s => s.player_id === id) || null; }
function ppNum(id) { const s = ppSeat(id); return s ? s.position : '?'; }
function ppMaxRound() { return Math.max(0, ...(gameData.rounds || []).map(r => r.round_number)); }

function ppBmSkipped() { return localStorage.getItem('bm_skip_' + gameIdFromData()) === '1'; }
function ppBmDone() {
  const bm = gameData.best_move;
  return ppBmSkipped() || !!(bm && (bm.suspect_1 || bm.suspect_2 || bm.suspect_3));
}
function ppHasBm(r) { return !!(r && r.round_number === 1 && r.mafia_kill_player_id && !r.mafia_miss); }

function ppStepFilled(r, key) {
  if (!r) return false;
  switch (key) {
    case 'vote':    return (r.voted_out_players || []).length > 0 || r.nobody_voted_out === true;
    case 'kill':    return !!r.mafia_kill_player_id || r.mafia_miss === true;
    case 'don':     return !!r.don_check_player_id || r.don_check_none === true;
    case 'sheriff': return !!r.sheriff_check_player_id || r.sheriff_check_none === true;
    case 'bm':      return ppBmDone();
  }
  return false;
}

function ppSteps(r) { return PHASE_STEPS.filter(s => s.key !== 'bm' || ppHasBm(r)); }
function ppAutoStep(r) {
  const s = ppSteps(r).find(s => !ppStepFilled(r, s.key));
  return s ? s.key : 'done';
}
function ppCurrentStep() { return phaseState.step || ppAutoStep(ppRound(phaseState.round)); }

function ppStepValue(r, key) {
  if (key === 'bm') {
    const bm = gameData.best_move;
    const arr = bm ? [bm.suspect_1, bm.suspect_2, bm.suspect_3].filter(Boolean).map(ppNum) : [];
    return arr.length ? arr.join(',') : (ppBmSkipped() ? '—' : '');
  }
  if (!r) return '';
  switch (key) {
    case 'vote':
      if ((r.voted_out_players || []).length) return r.voted_out_players.map(ppNum).join(',');
      return r.nobody_voted_out ? '✕' : '';
    case 'kill':    return r.mafia_kill_player_id ? ppNum(r.mafia_kill_player_id) : (r.mafia_miss ? 'промах' : '');
    case 'don':     return r.don_check_player_id ? ppNum(r.don_check_player_id) : (r.don_check_none ? '✕' : '');
    case 'sheriff': return r.sheriff_check_player_id ? ppNum(r.sheriff_check_player_id) : (r.sheriff_check_none ? '✕' : '');
  }
  return '';
}

// Можно ли выбрать игрока на этом шаге круга n
function ppIsPickable(seat, step, n) {
  if (step === 'bm') {
    const r1 = ppRound(1);
    return !(r1 && seat.player_id === r1.mafia_kill_player_id);
  }
  if (step === 'don' || step === 'sheriff') return true; // проверять можно и выбывших
  if (seat.is_eliminated) return false;
  for (const r of gameData.rounds || []) {
    const killedBefore = !r.mafia_miss && r.mafia_kill_player_id === seat.player_id && r.round_number < n;
    const voted = !r.nobody_voted_out && (r.voted_out_players || []).includes(seat.player_id);
    const votedInRange = step === 'vote' ? r.round_number < n : r.round_number <= n;
    if (killedBefore || (voted && votedInRange)) return false;
  }
  return true;
}

function ppIsPicked(id, step, r) {
  if (step === 'bm') return bmPick.includes(id);
  if (!r) return false;
  return (step === 'vote' && (r.voted_out_players || []).includes(id)) ||
         (step === 'kill' && r.mafia_kill_player_id === id) ||
         (step === 'don' && r.don_check_player_id === id) ||
         (step === 'sheriff' && r.sheriff_check_player_id === id);
}

// Активная роль выбыла (или убита этой ночью) — подсказка судье
function ppRoleOut(role, n) {
  const seat = gameData.seating.find(s => s.role === role);
  if (!seat) return false;
  const r = ppRound(n);
  return !ppIsPickable(seat, 'kill', n) || (r && !r.mafia_miss && r.mafia_kill_player_id === seat.player_id);
}

function ppSyncFromData() {
  const gid = gameIdFromData();
  if (phaseState.gameId !== gid) {
    phaseState = { gameId: gid, round: Math.max(1, ppMaxRound()), step: null };
  }
  const bm = gameData.best_move;
  bmPick = bm ? [bm.suspect_1, bm.suspect_2, bm.suspect_3].filter(Boolean) : [];
}

function applyPickHighlight() {
  const grid = document.getElementById('rolesGrid');
  if (!grid || !gameData || !gameData.seating || !gameData.seating.length) return;
  const step = ppCurrentStep();
  const active = step !== 'done';
  const r = ppRound(phaseState.round);
  grid.classList.toggle('pick-mode', active);
  grid.querySelectorAll('.pl-row[data-position]').forEach(row => {
    const seat = gameData.seating.find(s => String(s.position) === row.dataset.position);
    const can = active && seat && ppIsPickable(seat, step, phaseState.round);
    row.classList.toggle('pickable', !!can);
    row.classList.toggle('pick-dead', !!(can && seat && (step === 'don' || step === 'sheriff') && ppIsDeadAtNight(seat, phaseState.round)));
    row.classList.toggle('picked', !!(active && seat && ppIsPicked(seat.player_id, step, r)));
  });
}

function renderPhasePanel() {
  const panel = document.getElementById('phasePanel');
  if (!panel || !gameData) return;
  if (!gameData.seating || !gameData.seating.length) { panel.style.display = 'none'; return; }
  panel.style.display = '';

  const n = phaseState.round;
  const r = ppRound(n);
  const step = ppCurrentStep();
  const max = ppMaxRound();
  const btn = (act, text, cls = 'secondary') =>
    `<button type="button" class="btn btn-${cls}" data-act="${act}">${text}</button>`;

  const chips = ppSteps(r).map(s => {
    const val = ppStepValue(r, s.key);
    const isNone = ['✕', 'промах', '—'].includes(val);
    const icon = s.icon
      ? `<span class="pp-ic pp-ic-${s.icon}"></span>`
      : '<span class="pp-ic-text">ЛХ</span>';
    const value = isNone
      ? '<span class="pp-ic pp-ic-none"></span>'
      : (val !== '' ? `<span class="pp-val">${val}</span>` : '');
    return `<button type="button" class="pp-chip ${step === s.key ? 'active' : ''} ${ppStepFilled(r, s.key) ? 'filled' : ''}" data-step="${s.key}" title="${s.label}">${icon}${value}</button>`;
  }).join('');

  // Идёт подсчёт: шаг «Голосование», не заполнен, есть выставленные
  const counting = step === 'vote' && !ppStepFilled(r, 'vote') && vcNominees(n).length > 0;

  let hint = '', buttons = '';
  switch (step) {
    case 'vote':
      if (!counting) buttons = btn('nobody', 'Никто не выбыл');
      break;
    case 'kill':
      buttons = btn('miss', 'Промах');
      break;
    case 'don':
      hint = ppRoleOut('don', n) ? 'Дон выбыл' : '';
      buttons = btn('don-none', 'Не проверял');
      break;
    case 'sheriff':
      hint = ppRoleOut('sheriff', n) ? 'Шериф выбыл' : '';
      buttons = btn('sheriff-none', 'Не проверял');
      break;
    case 'bm':
      hint = `ЛХ №${ppNum(r.mafia_kill_player_id)}`;
      buttons = btn('bm-save', `Сохранить (${bmPick.length})`, 'primary') + btn('bm-skip', 'Пропустить');
      break;
    case 'done':
      buttons = btn('next-round', `Круг ${n + 1} →`, 'primary');
      break;
  }
  if (['vote', 'kill', 'don', 'sheriff'].includes(step) && ppStepFilled(r, step)) {
    buttons += btn('clear', 'Очистить');
  }

  const action = (hint || buttons)
    ? `<div class="pp-action">${hint ? `<span class="pp-hint">${hint}</span>` : ''}<div class="pp-buttons">${buttons}</div></div>`
    : '';

  panel.classList.toggle('pp-unstick', counting);
  panel.innerHTML = `
    <div class="pp-top">
      <div class="pp-round">
        <button type="button" class="gt-nav-btn" data-nav="-1" ${n <= 1 ? 'disabled' : ''}>
          <svg class="ic" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span>Круг ${n}</span>
        <button type="button" class="gt-nav-btn" data-nav="1" ${n > max ? 'disabled' : ''}>
          <svg class="ic" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
      <div class="pp-steps">${chips}</div>
    </div>
    ${counting ? vcRender(n) : action + vcNomineesRow(n)}`;

  applyPickHighlight();
}

async function ppSave(fields) {
  if (phaseBusy) return;
  phaseBusy = true;
  try {
    const n = phaseState.round;
    if (ppRound(n)) await API.updateRound(gameIdFromData(), n, fields);
    else await API.addRound(gameIdFromData(), { round_number: n, ...fields });
    socket.emit('game_updated', { gameId: gameIdFromData() });
    phaseState.step = null;
    await loadGameData();
  } catch (e) {
    UI.showToast('Ошибка сохранения круга', 'error');
    console.error(e);
  } finally {
    phaseBusy = false;
  }
}

async function ppPick(playerId) {
  const step = ppCurrentStep();
  const r = ppRound(phaseState.round);
  if (step === 'vote') {
    const cur = (r && r.voted_out_players) || [];
    const next = cur.includes(playerId) ? cur.filter(x => x !== playerId) : [...cur, playerId];
    return ppSave({ voted_out_players: next, nobody_voted_out: false });
  }
  if (step === 'kill')    return ppSave({ mafia_kill_player_id: playerId, mafia_miss: false });
  if (step === 'don')     return ppSave({ don_check_player_id: playerId, don_check_none: false });
  if (step === 'sheriff') return ppSave({ sheriff_check_player_id: playerId, sheriff_check_none: false });
  if (step === 'bm') {
    const i = bmPick.indexOf(playerId);
    if (i > -1) bmPick.splice(i, 1);
    else {
      if (bmPick.length >= 3) { UI.showToast('Максимум 3 номера', 'error'); return; }
      bmPick.push(playerId);
    }
    bmPick.sort((a, b) => ppNum(a) - ppNum(b));
    renderPhasePanel();
  }
}

async function ppAction(act, el) {
  if (act.startsWith('nom-') || act.startsWith('vc-')) return vcAction(act, el);
  const step = ppCurrentStep();
  const gid = gameIdFromData();
  switch (act) {
    case 'nobody':       return ppSave({ voted_out_players: [], nobody_voted_out: true });
    case 'miss':         return ppSave({ mafia_kill_player_id: null, mafia_miss: true });
    case 'don-none':     return ppSave({ don_check_player_id: null, don_check_none: true });
    case 'sheriff-none': return ppSave({ sheriff_check_player_id: null, sheriff_check_none: true });
    case 'clear': {
      const map = {
        vote:    { voted_out_players: [], nobody_voted_out: false },
        kill:    { mafia_kill_player_id: null, mafia_miss: false },
        don:     { don_check_player_id: null, don_check_none: false },
        sheriff: { sheriff_check_player_id: null, sheriff_check_none: false }
      };
      if (!map[step]) return;
      await ppSave(map[step]);
      phaseState.step = step;
      renderPhasePanel();
      return;
    }
    case 'bm-save': {
      const r1 = ppRound(1);
      if (!r1 || !r1.mafia_kill_player_id) return;
      if (!bmPick.length) { UI.showToast('Отметьте номера или нажмите «Пропустить»', 'error'); return; }
      if (phaseBusy) return;
      phaseBusy = true;
      try {
        await API.setBestMove(gid, {
          first_killed_player_id: r1.mafia_kill_player_id,
          suspect_1: bmPick[0] || null,
          suspect_2: bmPick[1] || null,
          suspect_3: bmPick[2] || null
        });
        localStorage.removeItem('bm_skip_' + gid);
        socket.emit('game_updated', { gameId: gid });
        phaseState.step = null;
        await loadGameData();
      } catch (e) {
        UI.showToast('Ошибка сохранения ЛХ', 'error');
        console.error(e);
      } finally {
        phaseBusy = false;
      }
      return;
    }
    case 'bm-skip':
      localStorage.setItem('bm_skip_' + gid, '1');
      phaseState.step = null;
      renderPhasePanel();
      return;
    case 'next-round':
      phaseState.round = Math.min(phaseState.round + 1, ppMaxRound() + 1);
      phaseState.step = null;
      renderPhasePanel();
      return;
  }
}

// Клики по панели (делегирование — навешиваем один раз)
document.getElementById('phasePanel')?.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav && !nav.disabled) {
    const n = phaseState.round + parseInt(nav.dataset.nav, 10);
    phaseState.round = Math.max(1, Math.min(n, ppMaxRound() + 1));
    phaseState.step = null;
    renderPhasePanel();
    return;
  }
  const chip = e.target.closest('[data-step]');
  if (chip) { phaseState.step = chip.dataset.step; renderPhasePanel(); return; }
  const act = e.target.closest('[data-act]');
  if (act) ppAction(act.dataset.act, act);
});

// Клик по строке игрока в режиме выбора
document.getElementById('rolesGrid')?.addEventListener('click', (e) => {
  const grid = e.currentTarget;
  if (!grid.classList.contains('pick-mode')) return;
  if (e.target.closest('button, select, .foul-bars')) return;
  const row = e.target.closest('.pl-row.pickable');
  if (!row) return;
  const seat = gameData.seating.find(s => String(s.position) === row.dataset.position);
  if (seat) ppPick(seat.player_id);
});

// ============================================================
// КОМПАКТНЫЙ МОБИЛЬНЫЙ ВИД
// ============================================================
var plExpanded = null; // позиция раскрытого игрока (только один)

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.pl-more');
  if (!btn) return;
  const pos = Number(btn.dataset.position);
  plExpanded = (Number(plExpanded) === pos) ? null : pos;
  document.querySelectorAll('#rolesGrid .pl-row').forEach(row => {
    row.classList.toggle('expanded', Number(row.dataset.position) === plExpanded);
  });
});

// Высота шапки → CSS-переменная, чтобы панель круга прилипала прямо под ней
(function syncTopbarHeight() {
  const tb = document.getElementById('gameTopbar');
  if (!tb) return;
  const set = () => document.documentElement.style.setProperty('--topbar-h', tb.offsetHeight + 'px');
  set();
  window.addEventListener('resize', set);
  if (window.ResizeObserver) new ResizeObserver(set).observe(tb);
})();

// ============================================================
// ВЫСТАВЛЕНИЕ И ПОДСЧЁТ ГОЛОСОВ (этап 3)
// ============================================================
var VOTE_CLEAR_NOMINEES = true; // очищать выставленных после подтверждения итога
var voteState = null;

// Кнопка «Выст.» в строке игрока
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.pl-nom');
  if (!btn || btn.classList.contains('is-hidden')) return;
  toggleNominee(btn);
});

// Живые на момент дневного голосования круга n
function vcAlive(n) {
  return gameData.seating.filter(s => ppIsPickable(s, 'vote', n));
}

// Выставленные (живые) в порядке выставления
function vcNominees(n) {
  const alive = vcAlive(n);
  return (gameData.nominees || [])
    .slice()
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .filter(nm => alive.some(s => s.player_id === nm.player_id))
    .map(nm => nm.player_id);
}

var VC_ICON_RESET = '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';
var VC_ICON_CLEAR = '<svg viewBox="0 0 24 24"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>';

// Выставленные вне подсчёта: только номера
function vcNomineesRow(n) {
  const ids = vcNominees(n);
  if (!ids.length) return '';
  const items = ids.map(id =>
    `<button type="button" class="pp-nom" data-act="nom-remove" data-id="${id}" title="Снять">${ppNum(id)}</button>`).join('');
  return `<div class="pp-noms"><span class="pp-ic pp-ic-vote"></span>${items}<button type="button" class="vc-icon" data-act="nom-clear" title="Очистить">${VC_ICON_CLEAR}</button></div>`;
}

function vcState(n) {
  const gid = gameIdFromData();
  const ids = vcNominees(n);
  const key = gid + '|' + n + '|' + ids.join(',');
  if (!voteState || voteState.key !== key) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('vote_' + gid) || 'null'); } catch (e) {}
    voteState = (saved && saved.key === key)
      ? saved
      : { key, stage: 'main', candidates: ids, counts: ids.map(() => null), raise: null };
  }
  return voteState;
}

function vcStore() {
  localStorage.setItem('vote_' + gameIdFromData(), JSON.stringify(voteState));
}

// Последнему кандидату — все оставшиеся голоса (п. 4.4.9)
function vcAutoFill(st, alive) {
  const k = st.candidates.length;
  if (!k || st.stage === 'raise') return;
  const before = st.counts.slice(0, k - 1);
  st.counts[k - 1] = before.every(v => v !== null)
    ? alive - before.reduce((a, v) => a + v, 0)
    : null;
}

function vcResult(st, alive) {
  if (!st.candidates.length || st.counts.some(v => v === null)) return null;
  const max = Math.max(...st.counts);
  const leaders = st.candidates.filter((_, i) => st.counts[i] === max);
  if (leaders.length === 1) return { type: 'out', ids: leaders };
  if (st.stage === 'main' || leaders.length < st.candidates.length) return { type: 'revote', ids: leaders };
  if (leaders.length >= alive) return { type: 'nobody', note: 'Ничья между всеми живыми — подъём не проводится' };
  return { type: 'raise', ids: leaders };
}

function vcRender(n) {
  const st = vcState(n);
  const k = st.candidates.length;
  if (!k) return '';
  const alive = vcAlive(n).length;
  const list = ids => ids.map(ppNum).join(', ');
  const btn = (act, text, cls = 'secondary') =>
    `<button type="button" class="btn btn-${cls}" data-act="${act}">${text}</button>`;
  const reset = `<button type="button" class="vc-icon" data-act="vc-reset" title="Сбросить подсчёт">${VC_ICON_RESET}</button>`;
  const actions = (primary, withNobody) =>
    `<div class="vc-actions">${primary}${withNobody ? btn('vc-nobody', 'Никто не выбыл') : ''}</div>`;
  const plain = ids => ids.map(id => `<span class="pp-nom">${ppNum(id)}</span>`).join('');

  // 1-й день, один кандидат (4.4.12)
  if (st.stage === 'main' && k === 1 && n === 1) {
    return `<div class="vc-cands">${plain(st.candidates)}</div>${actions(btn('vc-nobody', 'Никто не выбыл', 'primary'), false)}`;
  }

  // Подъём
  if (st.stage === 'raise') {
    const need = Math.floor(alive / 2) + 1;
    const nums = Array.from({ length: alive + 1 }, (_, v) =>
      `<button type="button" class="vc-num ${st.raise === v ? 'sel' : ''}" data-act="vc-raise" data-v="${v}">${v}</button>`).join('');
    let primary = '', withNobody = true;
    if (st.raise !== null) {
      if (st.raise >= need) primary = btn('vc-confirm', `Выбывают ${list(st.candidates)}`, 'primary');
      else { primary = btn('vc-confirm', 'Никто не выбыл', 'primary'); withNobody = false; }
    }
    return `<div class="vc-cands"><span class="vc-tag">Подъём · ${need}+</span>${plain(st.candidates)}${reset}</div>
      <div class="vc-nums">${nums}</div>${actions(primary, withNobody)}`;
  }

  // Подсчёт / переголосование
  vcAutoFill(st, alive);
  const active = st.counts.findIndex(v => v === null);

  const cands = st.candidates.map((id, i) => {
    const c = st.counts[i];
    const dis = (c === null || i === k - 1) ? 'disabled' : '';
    return `<button type="button" class="vc-cand ${i === active ? 'active' : ''} ${c !== null ? 'set' : ''}" data-act="vc-edit" data-i="${i}" ${dis}><span class="vc-c-num">${ppNum(id)}</span><span class="vc-c-cnt">${c !== null ? c : ''}</span></button>`;
  }).join('');

  let nums = '';
  if (active > -1) {
    const left = alive - st.counts.slice(0, active).reduce((a, v) => a + (v || 0), 0);
    nums = '<div class="vc-nums">' + Array.from({ length: left + 1 }, (_, v) =>
      `<button type="button" class="vc-num" data-act="vc-set" data-i="${active}" data-v="${v}">${v}</button>`).join('') + '</div>';
  }

  const res = vcResult(st, alive);
  let primary = '', withNobody = true;
  if (res && res.type === 'out')    primary = btn('vc-confirm', `Выбывает №${ppNum(res.ids[0])}`, 'primary');
  if (res && res.type === 'revote') primary = btn('vc-revote', 'Переголосование', 'primary');
  if (res && res.type === 'raise')  primary = btn('vc-to-raise', 'Подъём', 'primary');
  if (res && res.type === 'nobody') { primary = btn('vc-nobody', 'Никто не выбыл', 'primary'); withNobody = false; }

  const tag = st.stage === 'revote' ? '<span class="vc-tag">Переголос.</span>' : '';
  return `<div class="vc-cands">${tag}${cands}${reset}</div>${nums}${actions(primary, withNobody)}`;
}

async function vcAction(act, el) {
  const n = phaseState.round;
  const gid = gameIdFromData();
  const alive = vcAlive(n).length;
  const st = vcState(n);
  vcAutoFill(st, alive);
  const i = el ? parseInt(el.dataset.i, 10) : NaN;
  const v = el ? parseInt(el.dataset.v, 10) : NaN;

  switch (act) {
    case 'nom-remove':
      return window.removeNominee(el.dataset.id);
    case 'nom-clear':
      currentNominees = [];
      return updateNomineesOnServer();
    case 'vc-set':
      st.counts[i] = v;
      for (let j = i + 1; j < st.counts.length; j++) st.counts[j] = null;
      break;
    case 'vc-edit':
      for (let j = i; j < st.counts.length; j++) st.counts[j] = null;
      break;
    case 'vc-revote': {
      const res = vcResult(st, alive);
      if (!res || res.type !== 'revote') return;
      st.stage = 'revote';
      st.candidates = res.ids;
      st.counts = res.ids.map(() => null);
      break;
    }
    case 'vc-to-raise': {
      const res = vcResult(st, alive);
      if (!res || res.type !== 'raise') return;
      st.stage = 'raise';
      st.candidates = res.ids;
      st.counts = [];
      st.raise = null;
      break;
    }
    case 'vc-raise':
      st.raise = v;
      break;
    case 'vc-reset':
      localStorage.removeItem('vote_' + gid);
      voteState = null;
      renderPhasePanel();
      return;
    case 'vc-confirm': {
      let ids;
      if (st.stage === 'raise') {
        if (st.raise === null) return;
        ids = st.raise >= Math.floor(alive / 2) + 1 ? st.candidates.slice() : [];
      } else {
        const res = vcResult(st, alive);
        if (!res || res.type !== 'out') return;
        ids = res.ids;
      }
      return vcFinish(ids);
    }
    case 'vc-nobody':
      return vcFinish([]);
  }
  vcStore();
  renderPhasePanel();
}

async function vcFinish(ids) {
  const gid = gameIdFromData();
  const n = phaseState.round;
  localStorage.removeItem('vote_' + gid);
  voteState = null;
  await ppSave(ids.length
    ? { voted_out_players: ids, nobody_voted_out: false }
    : { voted_out_players: [], nobody_voted_out: true });
  // Очищаем выставленных, только если круг реально сохранился
  if (VOTE_CLEAR_NOMINEES && ppStepFilled(ppRound(n), 'vote') && (gameData.nominees || []).length) {
    currentNominees = [];
    await updateNomineesOnServer();
  }
}

// Игрок уже не в игре к моменту ночных проверок круга n (убит раньше, заголосован днём или убит этой ночью)
function ppIsDeadAtNight(seat, n) {
  const r = ppRound(n);
  return !ppIsPickable(seat, 'kill', n) || !!(r && !r.mafia_miss && r.mafia_kill_player_id === seat.player_id);
}
