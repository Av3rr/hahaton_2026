const state = {
  apiUrl: 'http://localhost:8000',
  token: '',
  period: null,
  schedule: {}, // { 'YYYY-MM-DD': { status, meta } }
  selectedDay: null,
  viewMonthDate: new Date(),
};

const $ = (id) => document.getElementById(id);

function log(message, data) {
  const now = new Date().toLocaleTimeString();
  const line = `[${now}] ${message}`;
  const payload = data ? `\n${JSON.stringify(data, null, 2)}` : '';
  $('log').textContent = `${line}${payload}\n${$('log').textContent}`;
}

function formatDateKey(d) {
  return d.toISOString().slice(0, 10);
}

function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`${state.apiUrl}${path}`, { ...options, headers });

  if (!res.ok) {
    let error = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.detail) error = body.detail;
    } catch {
      // ignore parse errors
    }
    throw new Error(error);
  }

  if (res.status === 204) return null;
  return res.json();
}

function inPeriod(date) {
  if (!state.period) return false;
  const key = formatDateKey(date);
  return key >= state.period.period_start && key <= state.period.period_end;
}

function monthName(date) {
  return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

function renderCalendar() {
  const cal = $('calendar');
  cal.innerHTML = '';
  $('monthLabel').textContent = monthName(state.viewMonthDate);

  const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  weekdays.forEach((w) => {
    const el = document.createElement('div');
    el.className = 'weekday';
    el.textContent = w;
    cal.appendChild(el);
  });

  const y = state.viewMonthDate.getFullYear();
  const m = state.viewMonthDate.getMonth();
  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  // JS: 0=Sun..6=Sat => convert so Monday=0
  const startOffset = (first.getDay() + 6) % 7;
  for (let i = 0; i < startOffset; i += 1) {
    const blank = document.createElement('div');
    blank.className = 'day disabled';
    cal.appendChild(blank);
  }

  for (let d = 1; d <= daysInMonth; d += 1) {
    const dayDate = new Date(y, m, d);
    const key = formatDateKey(dayDate);
    const value = state.schedule[key];

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'day';
    if (inPeriod(dayDate)) cell.classList.add('in-period');
    else cell.classList.add('disabled');
    if (value) cell.classList.add('has-value');
    if (state.selectedDay === key) cell.classList.add('selected');

    cell.innerHTML = `
      <div class="day-number">${d}</div>
      ${value ? `<span class="badge">${value.status}</span>` : ''}
    `;

    cell.addEventListener('click', () => {
      if (!inPeriod(dayDate)) return;
      state.selectedDay = key;
      const entry = state.schedule[key];
      $('selectedDate').textContent = `Выбрана дата: ${key}`;
      $('dayStatus').value = entry?.status || 'work';
      $('dayComment').value = entry?.meta?.comment || '';
      $('shiftStart').value = entry?.meta?.shift_start || '';
      $('shiftEnd').value = entry?.meta?.shift_end || '';
      $('breakStart').value = entry?.meta?.break_start || '';
      $('breakEnd').value = entry?.meta?.break_end || '';
      renderCalendar();
    });

    cal.appendChild(cell);
  }
}

async function login() {
  const email = $('email').value.trim();
  const password = $('password').value;
  state.apiUrl = $('apiUrl').value.trim().replace(/\/$/, '');

  if (!email || !password) {
    throw new Error('Введите email и пароль');
  }

  const form = new URLSearchParams();
  form.set('username', email);
  form.set('password', password);

  const token = await apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });

  state.token = token.access_token;
  $('authState').textContent = `Авторизован: ${email}`;
  log('Успешный логин');
  await loadData();
}

async function loadData() {
  const period = await apiFetch('/periods/current');
  state.period = period;

  if (!period) {
    $('periodCard').hidden = false;
    $('editCard').hidden = true;
    $('rangeCard').hidden = true;
    $('saveCard').hidden = true;
    $('periodText').textContent = 'Активного периода нет.';
    $('calendar').innerHTML = '';
    log('Активный период не найден');
    return;
  }

  state.viewMonthDate = parseDateKey(period.period_start);
  $('periodText').textContent =
    `Период: ${period.period_start} → ${period.period_end}, дедлайн: ${new Date(period.deadline).toLocaleString('ru-RU')}`;

  const schedule = await apiFetch('/schedules/me');
  state.schedule = schedule || {};

  $('periodCard').hidden = false;
  $('editCard').hidden = false;
  $('rangeCard').hidden = false;
  $('saveCard').hidden = false;
  $('rangeStart').value = period.period_start;
  $('rangeEnd').value = period.period_end;
  renderCalendar();
  log('Загружены период и график', { period, scheduleCount: Object.keys(state.schedule).length });
}

function collectMetaFromForm() {
  const comment = $('dayComment').value.trim();
  const shiftStart = $('shiftStart').value;
  const shiftEnd = $('shiftEnd').value;
  const breakStart = $('breakStart').value;
  const breakEnd = $('breakEnd').value;

  const meta = {};
  if (comment) meta.comment = comment;
  if (shiftStart) meta.shift_start = shiftStart;
  if (shiftEnd) meta.shift_end = shiftEnd;
  if (breakStart) meta.break_start = breakStart;
  if (breakEnd) meta.break_end = breakEnd;

  return Object.keys(meta).length ? meta : null;
}

function saveDay() {
  if (!state.selectedDay) {
    throw new Error('Сначала выберите дату');
  }

  const status = $('dayStatus').value;
  const meta = collectMetaFromForm();

  state.schedule[state.selectedDay] = { status, meta };
  renderCalendar();
  log(`День ${state.selectedDay} обновлен локально`, state.schedule[state.selectedDay]);
}

function removeDay() {
  if (!state.selectedDay) {
    throw new Error('Сначала выберите дату');
  }

  delete state.schedule[state.selectedDay];
  renderCalendar();
  log(`День ${state.selectedDay} удален локально`);
}

function applyRange() {
  if (!state.period) {
    throw new Error('Сначала загрузите активный период');
  }

  const start = $('rangeStart').value;
  const end = $('rangeEnd').value;
  if (!start || !end || start > end) {
    throw new Error('Проверьте корректность диапазона дат');
  }

  if (start < state.period.period_start || end > state.period.period_end) {
    throw new Error('Диапазон должен быть внутри активного периода');
  }

  const status = $('rangeStatus').value;
  const meta = collectMetaFromForm();
  let changes = 0;
  let cursor = parseDateKey(start);
  const endDate = parseDateKey(end);

  while (cursor <= endDate) {
    const key = formatDateKey(cursor);
    state.schedule[key] = { status, meta };
    changes += 1;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }

  renderCalendar();
  log(`Массово обновлено дней: ${changes}`, { start, end, status });
}

async function saveAll() {
  const payload = { days: state.schedule };
  const updated = await apiFetch('/schedules/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  state.schedule = updated || {};
  renderCalendar();
  log('График сохранен в API', { savedCount: Object.keys(state.schedule).length });
}

function shiftMonth(delta) {
  state.viewMonthDate = new Date(
    state.viewMonthDate.getFullYear(),
    state.viewMonthDate.getMonth() + delta,
    1,
  );
  renderCalendar();
}

async function runAction(fn) {
  try {
    await fn();
  } catch (e) {
    log(`Ошибка: ${e.message}`);
    alert(e.message);
  }
}

$('loginBtn').addEventListener('click', () => runAction(login));
$('loadBtn').addEventListener('click', () => runAction(loadData));
$('saveDayBtn').addEventListener('click', () => runAction(saveDay));
$('removeDayBtn').addEventListener('click', () => runAction(removeDay));
$('applyRangeBtn').addEventListener('click', () => runAction(applyRange));
$('saveAllBtn').addEventListener('click', () => runAction(saveAll));
$('reloadBtn').addEventListener('click', () => runAction(loadData));
$('prevMonth').addEventListener('click', () => shiftMonth(-1));
$('nextMonth').addEventListener('click', () => shiftMonth(1));

log('Интерфейс инициализирован. Выполните вход и загрузите данные.');
