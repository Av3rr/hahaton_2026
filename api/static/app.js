const apiBase = "";

const state = {
  token: localStorage.getItem("t2_token") || "",
  user: null,
  entries: {}, // YYYY-MM-DD -> {status, meta}
  currentPeriod: null,
  currentMonth: new Date(),
  selectedDate: null,
  canEditSchedule: true,
};

const authCard = document.getElementById("authCard");
const loginForm = document.getElementById("loginForm");
const authError = document.getElementById("authError");
const userPanel = document.getElementById("userPanel");
const userEmail = document.getElementById("userEmail");
const logoutBtn = document.getElementById("logoutBtn");
const calendarSection = document.getElementById("calendarSection");
const monthLabel = document.getElementById("monthLabel");
const calendarGrid = document.getElementById("calendarGrid");
const verificationWarning = document.getElementById("verificationWarning");
const periodWarning = document.getElementById("periodWarning");
const saveStatus = document.getElementById("saveStatus");

const dayEditorDialog = document.getElementById("dayEditorDialog");
const dayEditorForm = document.getElementById("dayEditorForm");
const editorDateTitle = document.getElementById("editorDateTitle");
const statusSelect = document.getElementById("statusSelect");
const shiftFields = document.getElementById("shiftFields");
const splitFields = document.getElementById("splitFields");
const shiftStart = document.getElementById("shiftStart");
const shiftEnd = document.getElementById("shiftEnd");
const splitStart1 = document.getElementById("splitStart1");
const splitEnd1 = document.getElementById("splitEnd1");
const splitStart2 = document.getElementById("splitStart2");
const splitEnd2 = document.getElementById("splitEnd2");
const removeEntryBtn = document.getElementById("removeEntryBtn");
const cancelBtn = document.getElementById("cancelBtn");

document.getElementById("prevMonthBtn").addEventListener("click", () => {
  state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() - 1, 1);
  renderCalendar();
});

document.getElementById("nextMonthBtn").addEventListener("click", () => {
  state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + 1, 1);
  renderCalendar();
});

statusSelect.addEventListener("change", syncStatusFieldsVisibility);
removeEntryBtn.addEventListener("click", removeCurrentDayEntry);
cancelBtn.addEventListener("click", () => dayEditorDialog.close());
logoutBtn.addEventListener("click", logout);

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authError.textContent = "";

  const email = document.getElementById("emailInput").value.trim();
  const password = document.getElementById("passwordInput").value;

  try {
    const body = new URLSearchParams({ username: email, password });
    const response = await fetch(`${apiBase}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      const err = await parseError(response);
      throw new Error(err);
    }

    const data = await response.json();
    state.token = data.access_token;
    localStorage.setItem("t2_token", state.token);

    await bootstrapAuthorizedUI();
  } catch (error) {
    authError.textContent = error.message || "Ошибка авторизации";
  }
});

dayEditorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.selectedDate) return;

  const status = statusSelect.value;
  let meta = {};

  if (status === "shift") {
    if (!shiftStart.value || !shiftEnd.value) {
      saveStatus.textContent = "Для смены укажите начало и конец.";
      return;
    }
    meta = { shiftStart: shiftStart.value, shiftEnd: shiftEnd.value };
  }

  if (status === "split") {
    const values = [splitStart1.value, splitEnd1.value, splitStart2.value, splitEnd2.value];
    if (values.some((v) => !v)) {
      saveStatus.textContent = "Для разделенной смены заполните все 4 времени.";
      return;
    }
    meta = {
      splitStart1: splitStart1.value,
      splitEnd1: splitEnd1.value,
      splitStart2: splitStart2.value,
      splitEnd2: splitEnd2.value,
    };
  }

  if (status === "dayoff" || status === "vacation") {
    meta = {};
  }

  state.entries[state.selectedDate] = { status, meta };

  try {
    await syncSchedule();
    dayEditorDialog.close();
    renderCalendar();
    saveStatus.textContent = `Сохранено: ${formatDateHuman(state.selectedDate)}`;
  } catch (error) {
    saveStatus.textContent = error.message || "Ошибка сохранения";
  }
});

async function bootstrapAuthorizedUI() {
  const me = await apiGet("/auth/me");
  state.user = me;

  const period = await apiGet("/periods/current");
  state.currentPeriod = period;

  state.canEditSchedule = true;
  verificationWarning.textContent = "";

  try {
    const schedule = await apiGet("/schedules/me");
    state.entries = normalizeEntries(schedule);
  } catch (error) {
    if ((error.message || "").toLowerCase().includes("верифиц")) {
      state.canEditSchedule = false;
      state.entries = {};
      verificationWarning.textContent = "Ваш аккаунт не верифицирован. Заполнение графика станет доступно после подтверждения учётной записи администратором.";
    } else {
      throw error;
    }
  }

  authCard.classList.add("hidden");
  calendarSection.classList.remove("hidden");
  userPanel.classList.remove("hidden");
  userEmail.textContent = me.email || me.full_name || "Пользователь";

  if (!state.currentPeriod) {
    periodWarning.textContent = "Сейчас нет активного периода. Редактирование недоступно.";
  } else {
    periodWarning.textContent = "";
    state.currentMonth = new Date(state.currentPeriod.period_start);
  }

  renderCalendar();
}

function logout() {
  localStorage.removeItem("t2_token");
  state.token = "";
  state.user = null;
  state.entries = {};
  state.currentPeriod = null;
  state.canEditSchedule = true;
  verificationWarning.textContent = "";
  periodWarning.textContent = "";
  saveStatus.textContent = "";
  authCard.classList.remove("hidden");
  calendarSection.classList.add("hidden");
  userPanel.classList.add("hidden");
}

function renderCalendar() {
  const month = state.currentMonth.getMonth();
  const year = state.currentMonth.getFullYear();
  monthLabel.textContent = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(state.currentMonth);

  const first = new Date(year, month, 1);
  const firstWeekday = (first.getDay() + 6) % 7; // monday=0
  const start = new Date(year, month, 1 - firstWeekday);

  const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  calendarGrid.innerHTML = weekdays.map((d) => `<div class="weekday">${d}</div>`).join("");

  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const iso = toISODate(date);
    const inCurrentMonth = date.getMonth() === month;
    const isInPeriod = inPeriod(iso);
    const canEditDay = state.canEditSchedule && isInPeriod;
    const entry = state.entries[iso];

    const classes = ["day-cell"];
    if (!inCurrentMonth) classes.push("outside");
    if (isInPeriod) classes.push("in-period");

    let entryMarkup = "";
    if (entry) {
      const label = formatEntry(entry);
      const offClass = entry.status === "dayoff" || entry.status === "vacation" ? "off" : "";
      entryMarkup = `<div class="entry ${offClass}">${label}</div>`;
    }

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = classes.join(" ");
    cell.innerHTML = `<span class="date">${date.getDate()}</span>${entryMarkup}`;

    if (!canEditDay) {
      cell.disabled = true;
      cell.title = state.canEditSchedule ? "Дата вне активного периода" : "Заполнение графика доступно только верифицированным пользователям";
    } else {
      cell.addEventListener("click", () => openEditor(iso));
    }

    calendarGrid.appendChild(cell);
  }
}

function openEditor(iso) {
  state.selectedDate = iso;
  const entry = state.entries[iso] || { status: "shift", meta: {} };

  editorDateTitle.textContent = `Редактирование: ${formatDateHuman(iso)}`;
  statusSelect.value = entry.status;

  shiftStart.value = entry.meta?.shiftStart || "";
  shiftEnd.value = entry.meta?.shiftEnd || "";
  splitStart1.value = entry.meta?.splitStart1 || "";
  splitEnd1.value = entry.meta?.splitEnd1 || "";
  splitStart2.value = entry.meta?.splitStart2 || "";
  splitEnd2.value = entry.meta?.splitEnd2 || "";

  syncStatusFieldsVisibility();
  dayEditorDialog.showModal();
}

function removeCurrentDayEntry() {
  if (!state.selectedDate) return;
  delete state.entries[state.selectedDate];
  syncSchedule()
    .then(() => {
      dayEditorDialog.close();
      renderCalendar();
      saveStatus.textContent = `Очищено: ${formatDateHuman(state.selectedDate)}`;
    })
    .catch((error) => {
      saveStatus.textContent = error.message || "Ошибка удаления";
    });
}

async function syncSchedule() {
  const payload = { days: state.entries };
  await apiPut("/schedules/me", payload);
}

function normalizeEntries(source) {
  if (!source || typeof source !== "object") return {};
  const result = {};
  for (const [date, entry] of Object.entries(source)) {
    if (entry && entry.status) {
      result[date] = { status: entry.status, meta: entry.meta || {} };
    }
  }
  return result;
}

function syncStatusFieldsVisibility() {
  shiftFields.classList.toggle("hidden", statusSelect.value !== "shift");
  splitFields.classList.toggle("hidden", statusSelect.value !== "split");
}

function formatEntry(entry) {
  if (entry.status === "shift") {
    const start = entry.meta?.shiftStart || "--:--";
    const end = entry.meta?.shiftEnd || "--:--";
    return `Смена ${start}-${end}`;
  }
  if (entry.status === "split") {
    return `Сплит ${entry.meta?.splitStart1 || ""}-${entry.meta?.splitEnd1 || ""} ${entry.meta?.splitStart2 || ""}-${entry.meta?.splitEnd2 || ""}`;
  }
  if (entry.status === "dayoff") return "Выходной";
  if (entry.status === "vacation") return "Отпуск";
  return entry.status;
}

function inPeriod(iso) {
  if (!state.currentPeriod) return false;
  return iso >= state.currentPeriod.period_start && iso <= state.currentPeriod.period_end;
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateHuman(iso) {
  const [year, month, day] = iso.split("-").map((x) => Number(x));
  return new Date(year, month - 1, day).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

async function apiGet(path) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${state.token}` },
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json();
}

async function apiPut(path, body) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.token}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json();
}

async function parseError(response) {
  try {
    const data = await response.json();
    return data.detail || JSON.stringify(data);
  } catch (_) {
    return `HTTP ${response.status}`;
  }
}

(async function init() {
  if (!state.token) return;
  try {
    await bootstrapAuthorizedUI();
  } catch (_) {
    logout();
  }
})();
