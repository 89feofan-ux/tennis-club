// ============================================================
// TennisSwap v3 — без баланса, оплата по СБП отдельно
// ============================================================

// ----- Telegram Mini App -----
let tg = null;
let tgUser = null;
try {
  if (window.Telegram && window.Telegram.WebApp) {
    tg = window.Telegram.WebApp;
    tg.expand(); // разворачиваем на полный экран
    tgUser = tg.initDataUnsafe?.user || null;
    // Подстраиваем цвета под тему Telegram
    document.documentElement.style.setProperty('--bg', tg.backgroundColor || '#0d1117');
    document.documentElement.style.setProperty('--text', tg.textColor || '#e6edf3');
    document.documentElement.style.setProperty('--accent', tg.buttonColor || '#58a6ff');
    tg.ready();
  }
} catch(e) {
  console.log('Not in Telegram');
}

// ----- HELPERS -----
function makeSlotId(courtId, date, time) {
  return `${courtId}_${date}_${time}`;
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDateShort(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function getWeekStart(date, offset) {
  const d = new Date(date);
  d.setDate(d.getDate() + (offset || 0) * 7);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0,0,0,0);
  return d;
}

function isToday(iso) {
  return iso === new Date().toISOString().slice(0,10);
}

// ----- STORE (серверный API) -----
const API_URL = '/api';

async function apiSave(data) {
  try {
    await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({action: 'save_all', ...data})
    });
  } catch(e) {
    console.error('API save error:', e);
  }
}

let serverData = {players: [], courts: [], slots: [], weekStart: null};
let loadPromise = null;

async function apiLoad() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const r = await fetch(API_URL, {cache: 'no-cache'});
      serverData = await r.json();
      // Если сервер пуст, подгружаем из localStorage (миграция)
      if ((!serverData.players || serverData.players.length === 0) && localStorage.getItem('ts_players')) {
        serverData.players = JSON.parse(localStorage.getItem('ts_players') || '[]');
        serverData.courts = JSON.parse(localStorage.getItem('ts_courts') || '[]');
        serverData.slots = JSON.parse(localStorage.getItem('ts_slots') || '[]');
        serverData.weekStart = localStorage.getItem('ts_week_start') || null;
        await apiSave(serverData);
        console.log('Migrated local data to server');
      }
    } catch(e) {
      console.error('API load error, using local fallback:', e);
      // Fallback to localStorage
      serverData.players = JSON.parse(localStorage.getItem('ts_players') || '[]');
      serverData.courts = JSON.parse(localStorage.getItem('ts_courts') || '[]');
      serverData.slots = JSON.parse(localStorage.getItem('ts_slots') || '[]');
      serverData.weekStart = localStorage.getItem('ts_week_start') || null;
    }
    loadPromise = null;
  })();
  return loadPromise;
}

async function apiSaveAll() {
  await apiSave(serverData);
}

const Store = {
  async init() { await apiLoad(); },

  getPlayers() { return serverData.players || []; },
  getCourts() { return serverData.courts || []; },
  getSlots() { return serverData.slots || []; },
  getWeekStart() { return serverData.weekStart || null; },

  async setPlayers(p) { serverData.players = p; await apiSaveAll(); },
  async setCourts(c) { serverData.courts = c; await apiSaveAll(); },
  async setSlots(s) { serverData.slots = s; await apiSaveAll(); },
  async setWeekStart(w) { serverData.weekStart = w; await apiSaveAll(); },

  // Locally stored: current player ID
  getCurrentPlayerId() { return localStorage.getItem('ts_current_player') || null; },
  setCurrentPlayerId(id) {
    if (id) localStorage.setItem('ts_current_player', id);
    else localStorage.removeItem('ts_current_player');
  },

  getCurrentPlayer() {
    const id = this.getCurrentPlayerId();
    if (!id) return null;
    return this.getPlayers().find(p => p.id === id) || null;
  },

  async savePlayer(player) {
    const players = this.getPlayers();
    const idx = players.findIndex(p => p.id === player.id);
    if (idx >= 0) players[idx] = player;
    else players.push(player);
    await this.setPlayers(players);
  },

  clearAll() {
    localStorage.removeItem('ts_players');
    localStorage.removeItem('ts_courts');
    localStorage.removeItem('ts_slots');
    localStorage.removeItem('ts_current_player');
    localStorage.removeItem('ts_week_start');
    serverData = {players: [], courts: [], slots: [], weekStart: null};
  }
};

// ----- STATE -----
let state = {
  players: [],
  courts: [],
  slots: [],
  currentPlayer: null,
  weekOffset: 0,
  weekStart: null,
};

async function loadState() {
  await Store.init(); // загружаем с сервера
  state.players = Store.getPlayers();
  state.courts = Store.getCourts();
  state.slots = Store.getSlots();
  state.currentPlayer = Store.getCurrentPlayer();
}

function saveSlots() { Store.setSlots(state.slots).catch(()=>{}); }
function savePlayers() { Store.setPlayers(state.players).catch(()=>{}); }

// ----- NAVIGATION -----
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + pageId);
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === pageId);
  });
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = (state.currentPlayer?.isAdmin || state.currentPlayer?.name === 'admin') ? '' : 'none';
  });
}

// ----- RENDER: CALENDAR -----
let filterDate = '';
let filterTime = '';
let filterCourt = '';

function renderCalendar() {
  const grid = document.getElementById('week-grid');
  const label = document.getElementById('week-label');

  if (!state.weekStart) {
    label.textContent = 'Неделя не выбрана';
    grid.innerHTML = '<p class="empty-msg">Админ ещё не установил расписание на эту неделю.</p>';
    return;
  }

  const start = new Date(state.weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  label.textContent = `${formatDateShort(start.toISOString().slice(0,10))} — ${formatDateShort(end.toISOString().slice(0,10))}`;

  grid.innerHTML = '';

  for (let d = 0; d < 7; d++) {
    const date = new Date(start);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().slice(0,10);

    // Filter by date
    if (filterDate && dateStr !== filterDate) continue;

    const col = document.createElement('div');
    col.className = 'day-col';

    const header = document.createElement('div');
    header.className = 'day-header' + (isToday(dateStr) ? ' today' : '');
    header.innerHTML = formatDate(dateStr);
    col.appendChild(header);

    for (const court of state.courts) {
      // Filter by court
      if (filterCourt && court.id !== filterCourt) continue;

      let courtSlots = state.slots.filter(s => s.courtId === court.id && s.date === dateStr)
        .sort((a,b) => a.time.localeCompare(b.time));

      // Filter by time
      if (filterTime) {
        courtSlots = courtSlots.filter(s => s.time >= filterTime);
      }

      if (courtSlots.length === 0) continue;

      const courtLabel = document.createElement('div');
      courtLabel.style.cssText = 'padding: 4px 8px; font-size: 0.75rem; color: var(--text2); font-weight: 600;';
      courtLabel.textContent = court.name;
      col.appendChild(courtLabel);

      for (const slot of courtSlots) {
        const el = document.createElement('div');
        el.className = 'slot-item';
        const isMySlot = state.currentPlayer && slot.ownerId === state.currentPlayer.id;
        const owner = state.players.find(p => p.id === slot.ownerId);

        let statusLabel = slot.time;
        if (slot.status === 'free') {
          el.classList.add('free');
          statusLabel += ' — свободно';
        } else if (slot.status === 'booked') {
          if (isMySlot) {
            el.classList.add('mine');
            statusLabel += ' ✅ Мой';
          } else {
            el.classList.add('booked');
            statusLabel += owner ? ` — ${owner.name}` : ' — занято';
          }
        } else if (slot.status === 'selling') {
          el.classList.add('selling');
          const ownerName = owner && !isMySlot ? ` — ${owner.name}` : '';
          statusLabel += ownerName;
          if (isMySlot) statusLabel += ' ✅';
        }

        el.textContent = statusLabel;
        if (slot.status !== 'booked' || isMySlot) {
          el.addEventListener('click', () => openSlotModal(slot));
        }
        col.appendChild(el);
      }
    }

    if (col.children.length === 1) {
      const empty = document.createElement('div');
      empty.className = 'empty-msg';
      empty.textContent = 'Нет слотов';
      empty.style.cssText = 'padding: 12px; text-align: center;';
      col.appendChild(empty);
    }

    grid.appendChild(col);
  }
}

function updateFilterOptions() {
  // Update time filter
  const timeSelect = document.getElementById('filter-time');
  const currentVal = timeSelect.value;
  timeSelect.innerHTML = '<option value="">Любое время</option>';
  for (let h = 6; h <= 23; h++) {
    ['00', '30'].forEach(m => {
      const t = `${String(h).padStart(2,'0')}:${m}`;
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      timeSelect.appendChild(opt);
    });
  }
  timeSelect.value = currentVal;

  // Update court filter
  const courtSelect = document.getElementById('filter-court');
  courtSelect.innerHTML = '<option value="">Все корты</option>';
  state.courts.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    courtSelect.appendChild(opt);
  });
}

// ----- MODAL -----
function openSlotModal(slot) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';

  const court = state.courts.find(c => c.id === slot.courtId);
  const owner = slot.ownerId ? state.players.find(p => p.id === slot.ownerId) : null;

  let html = `<h2>${court ? court.name : 'Корт'} — ${slot.date} в ${slot.time}</h2>`;
  html += `<p><strong>Статус:</strong> ${
    slot.status === 'free' ? 'Свободно' :
    slot.status === 'booked' ? 'Забронировано' : 'Продаётся'
  }</p>`;
  html += `<p><strong>Цена:</strong> ${slot.price} ₽</p>`;
  if (slot.sellingPrice) html += `<p><strong>Цена продажи:</strong> ${slot.sellingPrice} ₽</p>`;
  if (owner) html += `<p><strong>Владелец:</strong> ${owner.name}</p>`;
  html += '<p style="color:var(--orange); margin-top:8px; font-size:0.85rem;">💳 Оплата по СБП — отдельно от приложения</p>';

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'actions';

  const isMySlot = state.currentPlayer && slot.ownerId === state.currentPlayer.id;
  const isAdmin = state.currentPlayer?.isAdmin || state.currentPlayer?.name === 'admin';

  // Если админ — показываем кнопку назначения
  if (isAdmin && slot.status === 'free') {
    const assignBtn = document.createElement('button');
    assignBtn.className = 'success';
    assignBtn.textContent = '📋 Назначить игрока';
    assignBtn.addEventListener('click', () => {
      overlay.remove();
      showAssignModal(slot);
    });
    actionsDiv.appendChild(assignBtn);
  }

  // My booked slot -> sell
  if (isMySlot && slot.status === 'booked') {
    const sellBtn = document.createElement('button');
    sellBtn.textContent = 'Продать слот другому';
    sellBtn.addEventListener('click', () => {
      slot.status = 'selling';
      slot.sellingPrice = slot.price;
      saveSlots();
      overlay.remove();
      refresh();
    });
    actionsDiv.appendChild(sellBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'danger';
    cancelBtn.textContent = 'Освободить слот';
    cancelBtn.addEventListener('click', () => {
      if (confirm('Вернуть слот в свободные?')) {
        slot.status = 'free';
        slot.ownerId = null;
        slot.sellingPrice = null;
        saveSlots();
        overlay.remove();
        refresh();
      }
    });
    actionsDiv.appendChild(cancelBtn);
  }

  // My selling slot -> cancel sale or keep
  if (isMySlot && slot.status === 'selling') {
    const unsellBtn = document.createElement('button');
    unsellBtn.textContent = 'Снять с продажи';
    unsellBtn.addEventListener('click', () => {
      slot.status = 'booked';
      slot.sellingPrice = null;
      saveSlots();
      overlay.remove();
      refresh();
    });
    actionsDiv.appendChild(unsellBtn);
  }

  // Selling slot -> take (not mine)
  if (slot.status === 'selling' && state.currentPlayer && !isMySlot) {
    const takeBtn = document.createElement('button');
    takeBtn.className = 'success';
    takeBtn.textContent = 'Забрать слот';
    takeBtn.addEventListener('click', () => {
      slot.ownerId = state.currentPlayer.id;
      slot.status = 'booked';
      slot.sellingPrice = null;
      saveSlots();
      overlay.remove();
      refresh();
    });
    actionsDiv.appendChild(takeBtn);
  }

  // Admin: force clear
  if (isAdmin) {
    const clearBtn = document.createElement('button');
    clearBtn.className = 'danger';
    clearBtn.textContent = '🧹 Освободить (админ)';
    clearBtn.addEventListener('click', () => {
      if (confirm('Освободить слот?')) {
        slot.status = 'free';
        slot.ownerId = null;
        slot.sellingPrice = null;
        saveSlots();
        overlay.remove();
        refresh();
      }
    });
    actionsDiv.appendChild(clearBtn);
  }

  if (!state.currentPlayer && slot.status === 'free') {
    const note = document.createElement('p');
    note.style.color = 'var(--orange)';
    note.textContent = '💡 Войдите в профиль, чтобы бронировать.';
    modal.appendChild(note);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'outline';
  closeBtn.textContent = 'Закрыть';
  closeBtn.addEventListener('click', () => overlay.remove());
  actionsDiv.appendChild(closeBtn);

  modal.innerHTML = html;
  modal.appendChild(actionsDiv);
  overlay.appendChild(modal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}

// ----- MODAL: ASSIGN PLAYER -----
function showAssignModal(slot) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';

  const court = state.courts.find(c => c.id === slot.courtId);
  modal.innerHTML = `<h2>${court ? court.name : 'Корт'} — ${slot.date} в ${slot.time}</h2><p style="margin-bottom:12px;color:var(--text2);">Выберите игрока или создайте нового:</p>`;

  // Select existing players
  const playerSelect = document.createElement('select');
  playerSelect.style.cssText = 'width:100%; padding:10px; margin-bottom:8px; border-radius:6px;';
  const players = state.players.filter(p => p.name !== 'admin');
  playerSelect.innerHTML = '<option value="">— выберите игрока —</option>';
  players.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.phone ? `${p.name} (${p.phone})` : p.name;
    playerSelect.appendChild(opt);
  });
  modal.appendChild(playerSelect);

  // New player inline
  const newRow = document.createElement('div');
  newRow.style.cssText = 'display:flex; gap:8px; margin-bottom:8px;';
  const newName = document.createElement('input');
  newName.type = 'text';
  newName.placeholder = 'Имя нового игрока';
  newName.style.cssText = 'flex:1; padding:10px; border-radius:6px;';
  const newPhone = document.createElement('input');
  newPhone.type = 'text';
  newPhone.placeholder = 'Телефон (СБП)';
  newPhone.style.cssText = 'flex:1; padding:10px; border-radius:6px;';
  newRow.appendChild(newName);
  newRow.appendChild(newPhone);
  modal.appendChild(newRow);

  // Buttons
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'actions';

  const assignBtn = document.createElement('button');
  assignBtn.className = 'success';
  assignBtn.textContent = '✅ Назначить';
  assignBtn.addEventListener('click', () => {
    let playerId = playerSelect.value;
    if (!playerId) {
      // Try to create new
      const name = newName.value.trim();
      if (!name) { alert('Выберите игрока или введите имя нового'); return; }
      const phone = newPhone.value.trim();
      const newPlayer = {
        id: 'p_' + Date.now(),
        name,
        phone,
        isAdmin: false,
      };
      state.players.push(newPlayer);
      savePlayers();
      playerId = newPlayer.id;
    }
    slot.status = 'booked';
    slot.ownerId = playerId;
    saveSlots();
    overlay.remove();
    refresh();
  });
  actionsDiv.appendChild(assignBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'outline';
  cancelBtn.textContent = 'Отмена';
  cancelBtn.addEventListener('click', () => overlay.remove());
  actionsDiv.appendChild(cancelBtn);

  modal.appendChild(actionsDiv);
  overlay.appendChild(modal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ----- RENDER: MARKET -----
function renderMarket() {
  const list = document.getElementById('market-list');
  const selling = state.slots.filter(s =>
    s.status === 'selling' && s.ownerId !== state.currentPlayer?.id
  );

  if (selling.length === 0) {
    list.innerHTML = '<p class="empty-msg">Сейчас нет слотов в продаже</p>';
    return;
  }

  list.innerHTML = '';
  selling.forEach(slot => {
    const court = state.courts.find(c => c.id === slot.courtId);
    const owner = state.players.find(p => p.id === slot.ownerId);
    const card = document.createElement('div');
    card.className = 'market-card';
    card.innerHTML = `
      <div class="info">
        <strong>${court ? court.name : 'Корт'}</strong>
        <small>${formatDate(slot.date)} в ${slot.time}</small>
        <small>Продаёт: ${owner ? owner.name : 'Неизвестно'}</small>
        <small style="color:var(--orange);">💳 Оплата продавцу по СБП</small>
      </div>
      <div class="info">
        <strong>${slot.price} ₽</strong>
      </div>
    `;
    const takeBtn = document.createElement('button');
    takeBtn.className = 'success';
    takeBtn.textContent = 'Забрать';
    takeBtn.addEventListener('click', () => openSlotModal(slot));
    card.appendChild(takeBtn);
    list.appendChild(card);
  });
}

// ----- RENDER: PROFILE -----
function renderProfile() {
  const loginDiv = document.getElementById('profile-login');
  const infoDiv = document.getElementById('profile-info');

  // Update player select list
  const select = document.getElementById('player-select');
  select.innerHTML = '<option value="">— выберите игрока —</option>';
  state.players.filter(p => !p.isAdmin).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });

  // Show/hide seed button
  const noPlayersMsg = document.getElementById('no-players-msg');
  const hasAdmin = state.players.some(p => p.isAdmin);
  if (!hasAdmin) {
    noPlayersMsg.style.display = '';
    document.querySelector('#no-players-msg p').textContent = 'Нет администратора. Создать?';
  } else {
    noPlayersMsg.style.display = 'none';
  }

  if (!state.currentPlayer) {
    loginDiv.style.display = '';
    infoDiv.style.display = 'none';
    document.getElementById('user-name').textContent = 'Не вошли';
    document.getElementById('btn-logout').style.display = 'none';
    document.getElementById('user-balance-header').style.display = 'none';
    return;
  }

  loginDiv.style.display = 'none';
  infoDiv.style.display = '';
  document.getElementById('user-name').textContent = state.currentPlayer.name;
  document.getElementById('btn-logout').style.display = '';
  document.getElementById('user-balance-header').style.display = 'none'; // скрываем баланс в шапке

  const mySlotsDiv = document.getElementById('my-slots');
  const mySlots = state.slots.filter(s => s.ownerId === state.currentPlayer.id && s.status !== 'free');
  if (mySlots.length === 0) {
    mySlotsDiv.innerHTML = '<p class="empty-msg">У вас нет забронированных слотов</p>';
  } else {
    mySlotsDiv.innerHTML = '';
    mySlots.forEach(slot => {
      const court = state.courts.find(c => c.id === slot.courtId);
      const card = document.createElement('div');
      card.className = 'market-card';
      card.style.cursor = 'pointer';
      card.innerHTML = `
        <div class="info">
          <strong>${court ? court.name : 'Корт'}</strong>
          <small>${formatDate(slot.date)} в ${slot.time}</small>
          <small>${slot.status === 'selling' ? 'Продаётся' : 'Забронирован'}</small>
        </div>
      `;
      card.addEventListener('click', () => openSlotModal(slot));
      mySlotsDiv.appendChild(card);
    });
  }
}

// ----- RENDER: PLAYERS (справочник) -----
function renderPlayers() {
  const list = document.getElementById('players-list');
  const players = state.players.filter(p => !p.isAdmin);

  if (players.length === 0) {
    list.innerHTML = '<p class="empty-msg">Список игроков пуст</p>';
    return;
  }

  list.innerHTML = '';
  players.forEach(p => {
    const card = document.createElement('div');
    card.className = 'market-card';
    const hasPhone = p.phone && p.phone.trim();
    card.innerHTML = `
      <div class="info">
        <strong>${p.name}</strong>
        ${hasPhone ? `<small>📞 ${p.phone}</small>` : '<small style="color:var(--text2)">Телефон не указан</small>'}
        <small style="color:var(--orange);">💳 Перевод по СБП</small>
      </div>
    `;
    if (hasPhone) {
      card.style.cursor = 'pointer';
      card.title = 'Нажми, чтобы скопировать телефон';
      card.addEventListener('click', () => {
        navigator.clipboard.writeText(p.phone).then(() => {
          const orig = card.innerHTML;
          card.innerHTML = '<div class="info"><strong>✅ Скопировано!</strong></div>';
          setTimeout(() => { card.innerHTML = orig; }, 1500);
        }).catch(() => {});
      });
    }
    list.appendChild(card);
  });
}

// ----- RENDER: ADMIN -----
function renderAdmin() {
  // -- Players --
  const playerList = document.getElementById('player-list');
  playerList.innerHTML = '';
  state.players.filter(p => !p.isAdmin).forEach(p => {
    const row = document.createElement('li');
    row.className = 'court-row';
    row.innerHTML = `<span>${p.name}</span><span style="color:var(--text2);font-size:0.85rem;">${p.phone || '—'}</span>`;
    const delBtn = document.createElement('button');
    delBtn.className = 'danger';
    delBtn.textContent = 'Удалить';
    delBtn.style.padding = '4px 10px';
    delBtn.addEventListener('click', () => {
      if (confirm(`Удалить игрока "${p.name}"? Его слоты станут свободными.`)) {
        state.slots.forEach(s => {
          if (s.ownerId === p.id) { s.status = 'free'; s.ownerId = null; s.sellingPrice = null; }
        });
        state.players = state.players.filter(x => x.id !== p.id);
        saveSlots();
        savePlayers();
        if (state.currentPlayer?.id === p.id) {
          Store.setCurrentPlayerId(null);
          state.currentPlayer = null;
        }
        renderAdmin();
        refresh();
      }
    });
    row.appendChild(delBtn);
    playerList.appendChild(row);
  });

  // -- Courts --
  const courtSelect = document.getElementById('admin-court-select');
  courtSelect.innerHTML = '';
  state.courts.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.pricePerHour}₽/ч)`;
    courtSelect.appendChild(opt);
  });

  const courtList = document.getElementById('court-list');
  courtList.innerHTML = '';
  state.courts.forEach(c => {
    const row = document.createElement('li');
    row.className = 'court-row';
    row.innerHTML = `<span>${c.name}</span><span>${c.pricePerHour} ₽/ч</span>`;
    const delBtn = document.createElement('button');
    delBtn.className = 'danger';
    delBtn.textContent = 'Удалить';
    delBtn.style.padding = '4px 10px';
    delBtn.addEventListener('click', () => {
      if (confirm(`Удалить корт "${c.name}"? Слоты тоже удалятся.`)) {
        state.courts = state.courts.filter(x => x.id !== c.id);
        state.slots = state.slots.filter(s => s.courtId !== c.id);
        Store.setCourts(state.courts);
        saveSlots();
        renderAdmin();
        renderCalendar();
      }
    });
    row.appendChild(delBtn);
    courtList.appendChild(row);
  });
}

// ----- INIT EVENTS -----
function initEvents() {
  // Navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showPage(btn.dataset.page);
      refresh();
    });
  });

  // Week navigation
  document.getElementById('week-prev').addEventListener('click', () => {
    if (!state.weekStart) return;
    state.weekOffset--;
    renderCalendar();
  });
  document.getElementById('week-next').addEventListener('click', () => {
    if (!state.weekStart) return;
    state.weekOffset++;
    renderCalendar();
  });

  // Refresh button
  document.getElementById('btn-refresh').addEventListener('click', async () => {
    await refresh();
    updateFilterOptions();
  });

  // Filters
  document.getElementById('filter-date').addEventListener('change', (e) => {
    filterDate = e.target.value;
    renderCalendar();
  });
  document.getElementById('filter-time').addEventListener('change', (e) => {
    filterTime = e.target.value;
    renderCalendar();
  });
  document.getElementById('filter-court').addEventListener('change', (e) => {
    filterCourt = e.target.value;
    renderCalendar();
  });
  document.getElementById('btn-filter-clear').addEventListener('click', () => {
    filterDate = '';
    filterTime = '';
    filterCourt = '';
    document.getElementById('filter-date').value = '';
    document.getElementById('filter-time').value = '';
    document.getElementById('filter-court').value = '';
    renderCalendar();
  });

  // Login
  document.getElementById('btn-login').addEventListener('click', () => {
    const id = document.getElementById('player-select').value;
    if (!id) { alert('Выберите игрока из списка'); return; }
    const player = state.players.find(p => p.id === id);
    if (!player) return;
    Store.setCurrentPlayerId(player.id);
    state.currentPlayer = player;
    refresh();
    showPage('calendar');
  });

  // Admin login by password
  document.getElementById('btn-admin-login').addEventListener('click', () => {
    const password = document.getElementById('admin-password').value.trim();
    if (password !== '03теннис') {
      alert('Неверный пароль администратора');
      return;
    }
    const admin = state.players.find(p => p.isAdmin);
    if (!admin) {
      // Create admin if doesn't exist
      state.players.push({
        id: 'p_admin',
        name: 'admin',
        isAdmin: true,
      });
      savePlayers();
      Store.setCurrentPlayerId('p_admin');
      state.currentPlayer = state.players.find(p => p.id === 'p_admin');
    } else {
      Store.setCurrentPlayerId(admin.id);
      state.currentPlayer = admin;
    }
    document.getElementById('admin-password').value = '';
    refresh();
    showPage('admin');
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', () => {
    Store.setCurrentPlayerId(null);
    state.currentPlayer = null;
    refresh();
    showPage('calendar');
  });

  // Admin: add player
  document.getElementById('btn-add-player').addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim();
    const phone = document.getElementById('player-phone').value.trim();
    if (!name) { alert('Введите ФИО игрока'); return; }
    if (state.players.find(p => p.name === name)) { alert('Игрок с таким именем уже есть'); return; }
    state.players.push({
      id: 'p_' + Date.now(),
      name,
      phone,
      isAdmin: false,
    });
    savePlayers();
    document.getElementById('player-name').value = '';
    document.getElementById('player-phone').value = '';
    renderAdmin();
    renderProfile();
  });

  // Admin: add court
  document.getElementById('btn-add-court').addEventListener('click', () => {
    const name = document.getElementById('court-name').value.trim();
    const price = Number(document.getElementById('court-price').value);
    if (!name || !price) { alert('Введите название и цену'); return; }
    state.courts.push({ id: 'c_' + Date.now(), name, pricePerHour: price });
    Store.setCourts(state.courts);
    document.getElementById('court-name').value = '';
    document.getElementById('court-price').value = '';
    renderAdmin();
    renderCalendar();
  });

  // Admin: set week
  document.getElementById('btn-set-week').addEventListener('click', () => {
    const date = document.getElementById('admin-week-start').value;
    if (!date) { alert('Выберите дату начала недели'); return; }
    const d = new Date(date + 'T00:00:00');
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    state.weekStart = d.toISOString().slice(0,10);
    state.weekOffset = 0;
    localStorage.setItem('ts_week_start', state.weekStart);
    Store.setWeekStart(state.weekStart).catch(()=>{});
    renderCalendar();
    showPage('calendar');
    alert(`Неделя установлена: ${formatDateShort(state.weekStart)}`);
  });

  // Admin: generate 7 days
  document.getElementById('btn-gen-week').addEventListener('click', () => {
    if (!state.weekStart) { alert('Сначала установите неделю'); return; }
    if (state.courts.length === 0) { alert('Сначала добавьте корты'); return; }

    const start = document.getElementById('admin-start').value;
    const end = document.getElementById('admin-end').value;
    const interval = Number(document.getElementById('admin-interval').value);
    if (!start || !end || !interval) { alert('Заполните все поля'); return; }

    const times = [];
    let [h, m] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    while (h < eh || (h === eh && m < em)) {
      times.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
      m += interval;
      while (m >= 60) { m -= 60; h++; }
    }

    const startDate = new Date(state.weekStart + 'T00:00:00');
    let added = 0;
    for (let d = 0; d < 7; d++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + d);
      const dateStr = date.toISOString().slice(0,10);
      for (const court of state.courts) {
        for (const time of times) {
          const id = makeSlotId(court.id, dateStr, time);
          if (!state.slots.find(s => s.id === id)) {
            state.slots.push({
              id, courtId: court.id, date: dateStr, time,
              status: 'free', ownerId: null,
              price: court.pricePerHour, sellingPrice: null,
            });
            added++;
          }
        }
      }
    }
    saveSlots();
    Store.setWeekStart(state.weekStart).catch(()=>{});
    renderCalendar();
    alert(`Сгенерировано ${added} слотов на неделю`);
  });

  // Admin: single slot
  document.getElementById('btn-add-slot').addEventListener('click', () => {
    const courtId = document.getElementById('admin-court-select').value;
    const date = document.getElementById('admin-date').value;
    const time = document.getElementById('admin-time').value;
    if (!date || !time) { alert('Выберите дату и время'); return; }
    const court = state.courts.find(c => c.id === courtId);
    if (!court) return;
    const id = makeSlotId(courtId, date, time);
    if (state.slots.find(s => s.id === id)) { alert('Такой слот уже существует'); return; }
    state.slots.push({
      id, courtId, date, time,
      status: 'free', ownerId: null,
      price: court.pricePerHour, sellingPrice: null,
    });
    saveSlots();
    renderCalendar();
    alert('Слот создан');
  });

  // Seed default data
  document.getElementById('btn-seed-default').addEventListener('click', () => {
    Store.clearAll();
    state.players = [];
    state.courts = [];
    state.slots = [];
    state.currentPlayer = null;
    state.weekStart = null;
    firstRunSeed();
    refresh();
    showPage('profile');
    alert('✅ Admin создан! Теперь выберите admin в списке и войдите.');
  });

  // Reset all data
  document.getElementById('btn-reset-all').addEventListener('click', () => {
    if (confirm('Точно сбросить все данные? Это удалит всех игроков, корты и слоты.')) {
      if (confirm('Ещё раз: все данные будут потеряны. Продолжить?')) {
        Store.clearAll();
        state.players = [];
        state.courts = [];
        state.slots = [];
        state.currentPlayer = null;
        state.weekStart = null;
        firstRunSeed();
        refresh();
        showPage('admin');
        alert('Данные сброшены. admin создан заново.');
      }
    }
  });
}

// ----- REFRESH -----
async function refresh() {
  await loadState();
  renderCalendar();
  updateFilterOptions();
  renderPlayers();
  renderMarket();
  renderProfile();
  renderAdmin();
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = (state.currentPlayer?.isAdmin || state.currentPlayer?.name === 'admin') ? '' : 'none';
  });
  document.getElementById('user-name').textContent = state.currentPlayer?.name || 'Не вошли';
  document.getElementById('btn-logout').style.display = state.currentPlayer ? '' : 'none';
  document.getElementById('user-balance-header').style.display = 'none';
}

// ----- INIT (first run seed) -----
async function firstRunSeed() {
  if (state.players.length === 0) {
    state.players.push({
      id: 'p_admin',
      name: 'admin',
      isAdmin: true,
    });
    await savePlayers();
  }
  if (!state.weekStart) {
    const saved = localStorage.getItem('ts_week_start');
    if (saved) state.weekStart = saved;
  }
}

// ----- BOOT -----
document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  await firstRunSeed();
  initEvents();
  showPage('calendar');

  // Auto-login via Telegram
  if (tgUser) {
    const tgId = String(tgUser.id);
    let player = state.players.find(p => p.telegramId === tgId);
    if (!player) {
      const name = tgUser.first_name || tgUser.username || 'Player ' + tgId.slice(-4);
      player = {
        id: 'p_' + tgId,
        name,
        telegramId: tgId,
        isAdmin: false,
      };
      state.players.push(player);
      await savePlayers();
    }
    Store.setCurrentPlayerId(player.id);
    state.currentPlayer = player;
  }

  await refresh();

  const today = new Date().toISOString().slice(0,10);
  document.getElementById('admin-date').value = today;
  document.getElementById('admin-week-start').value = today;
});
