const DUBAI_TZ = "Asia/Dubai";

const els = {};
let state = null;
let currentUser = null;
let activeViewUserId = "";
let serverOffsetMs = 0;
let toastTimer = null;
let breakPlannerTouched = false;
const selectedTaskIds = new Set();
const chartColors = ["#16a9dc", "#ef7531", "#48bd63", "#ed1c24", "#7b61ff", "#00a878", "#f4b400", "#7a5c58", "#2c7be5", "#d14d9f"];
const DAILY_OVERTIME_THRESHOLD_SECONDS = 8 * 3600;
const MINIMUM_COUNTABLE_OVERTIME_SECONDS = 30 * 60;

const capitalTimezones = [
  ["Abu Dhabi, UAE", "Asia/Dubai"],
  ["Manila, Philippines", "Asia/Manila"],
  ["Singapore, Singapore", "Asia/Singapore"],
  ["New Delhi, India", "Asia/Kolkata"],
  ["London, United Kingdom", "Europe/London"],
  ["Paris, France", "Europe/Paris"],
  ["Berlin, Germany", "Europe/Berlin"],
  ["Rome, Italy", "Europe/Rome"],
  ["Madrid, Spain", "Europe/Madrid"],
  ["Lisbon, Portugal", "Europe/Lisbon"],
  ["Amsterdam, Netherlands", "Europe/Amsterdam"],
  ["Brussels, Belgium", "Europe/Brussels"],
  ["Dublin, Ireland", "Europe/Dublin"],
  ["Copenhagen, Denmark", "Europe/Copenhagen"],
  ["Oslo, Norway", "Europe/Oslo"],
  ["Stockholm, Sweden", "Europe/Stockholm"],
  ["Helsinki, Finland", "Europe/Helsinki"],
  ["Warsaw, Poland", "Europe/Warsaw"],
  ["Prague, Czechia", "Europe/Prague"],
  ["Vienna, Austria", "Europe/Vienna"],
  ["Budapest, Hungary", "Europe/Budapest"],
  ["Athens, Greece", "Europe/Athens"],
  ["Bucharest, Romania", "Europe/Bucharest"],
  ["Sofia, Bulgaria", "Europe/Sofia"],
  ["Zagreb, Croatia", "Europe/Zagreb"],
  ["Belgrade, Serbia", "Europe/Belgrade"],
  ["Sarajevo, Bosnia and Herzegovina", "Europe/Sarajevo"],
  ["Tirana, Albania", "Europe/Tirane"],
  ["Skopje, North Macedonia", "Europe/Skopje"],
  ["Podgorica, Montenegro", "Europe/Podgorica"],
  ["Ljubljana, Slovenia", "Europe/Ljubljana"],
  ["Bratislava, Slovakia", "Europe/Bratislava"],
  ["Tallinn, Estonia", "Europe/Tallinn"],
  ["Riga, Latvia", "Europe/Riga"],
  ["Vilnius, Lithuania", "Europe/Vilnius"],
  ["Kyiv, Ukraine", "Europe/Kyiv"],
  ["Chisinau, Moldova", "Europe/Chisinau"],
  ["Reykjavik, Iceland", "Atlantic/Reykjavik"],
  ["Bern, Switzerland", "Europe/Zurich"],
  ["Luxembourg, Luxembourg", "Europe/Luxembourg"],
  ["Valletta, Malta", "Europe/Malta"],
  ["Nicosia, Cyprus", "Asia/Nicosia"],
  ["Ankara, Turkiye", "Europe/Istanbul"],
  ["Moscow, Russia", "Europe/Moscow"],
  ["Washington DC, United States", "America/New_York"],
  ["Ottawa, Canada", "America/Toronto"],
  ["Mexico City, Mexico", "America/Mexico_City"],
  ["Guatemala City, Guatemala", "America/Guatemala"],
  ["Belmopan, Belize", "America/Belize"],
  ["San Salvador, El Salvador", "America/El_Salvador"],
  ["Tegucigalpa, Honduras", "America/Tegucigalpa"],
  ["Managua, Nicaragua", "America/Managua"],
  ["San Jose, Costa Rica", "America/Costa_Rica"],
  ["Panama City, Panama", "America/Panama"],
  ["Havana, Cuba", "America/Havana"],
  ["Kingston, Jamaica", "America/Jamaica"],
  ["Port-au-Prince, Haiti", "America/Port-au-Prince"],
  ["Santo Domingo, Dominican Republic", "America/Santo_Domingo"],
  ["Nassau, Bahamas", "America/Nassau"],
  ["Bridgetown, Barbados", "America/Barbados"],
  ["Port of Spain, Trinidad and Tobago", "America/Port_of_Spain"],
  ["Bogota, Colombia", "America/Bogota"],
  ["Caracas, Venezuela", "America/Caracas"],
  ["Quito, Ecuador", "America/Guayaquil"],
  ["Lima, Peru", "America/Lima"],
  ["La Paz, Bolivia", "America/La_Paz"],
  ["Santiago, Chile", "America/Santiago"],
  ["Buenos Aires, Argentina", "America/Argentina/Buenos_Aires"],
  ["Montevideo, Uruguay", "America/Montevideo"],
  ["Asuncion, Paraguay", "America/Asuncion"],
  ["Brasilia, Brazil", "America/Sao_Paulo"],
  ["Georgetown, Guyana", "America/Guyana"],
  ["Paramaribo, Suriname", "America/Paramaribo"],
  ["Rabat, Morocco", "Africa/Casablanca"],
  ["Algiers, Algeria", "Africa/Algiers"],
  ["Tunis, Tunisia", "Africa/Tunis"],
  ["Tripoli, Libya", "Africa/Tripoli"],
  ["Cairo, Egypt", "Africa/Cairo"],
  ["Khartoum, Sudan", "Africa/Khartoum"],
  ["Addis Ababa, Ethiopia", "Africa/Addis_Ababa"],
  ["Nairobi, Kenya", "Africa/Nairobi"],
  ["Kampala, Uganda", "Africa/Kampala"],
  ["Kigali, Rwanda", "Africa/Kigali"],
  ["Bujumbura, Burundi", "Africa/Bujumbura"],
  ["Dodoma, Tanzania", "Africa/Dar_es_Salaam"],
  ["Mogadishu, Somalia", "Africa/Mogadishu"],
  ["Djibouti, Djibouti", "Africa/Djibouti"],
  ["Asmara, Eritrea", "Africa/Asmara"],
  ["Juba, South Sudan", "Africa/Juba"],
  ["Lagos/Abuja, Nigeria", "Africa/Lagos"],
  ["Accra, Ghana", "Africa/Accra"],
  ["Dakar, Senegal", "Africa/Dakar"],
  ["Bamako, Mali", "Africa/Bamako"],
  ["Ouagadougou, Burkina Faso", "Africa/Ouagadougou"],
  ["Niamey, Niger", "Africa/Niamey"],
  ["Conakry, Guinea", "Africa/Conakry"],
  ["Freetown, Sierra Leone", "Africa/Freetown"],
  ["Monrovia, Liberia", "Africa/Monrovia"],
  ["Yamoussoukro, Cote d'Ivoire", "Africa/Abidjan"],
  ["Lome, Togo", "Africa/Lome"],
  ["Porto-Novo, Benin", "Africa/Porto-Novo"],
  ["Yaounde, Cameroon", "Africa/Douala"],
  ["Libreville, Gabon", "Africa/Libreville"],
  ["Brazzaville, Republic of the Congo", "Africa/Brazzaville"],
  ["Kinshasa, DR Congo", "Africa/Kinshasa"],
  ["Luanda, Angola", "Africa/Luanda"],
  ["Windhoek, Namibia", "Africa/Windhoek"],
  ["Gaborone, Botswana", "Africa/Gaborone"],
  ["Pretoria, South Africa", "Africa/Johannesburg"],
  ["Maseru, Lesotho", "Africa/Maseru"],
  ["Mbabane, Eswatini", "Africa/Mbabane"],
  ["Maputo, Mozambique", "Africa/Maputo"],
  ["Harare, Zimbabwe", "Africa/Harare"],
  ["Lusaka, Zambia", "Africa/Lusaka"],
  ["Lilongwe, Malawi", "Africa/Blantyre"],
  ["Antananarivo, Madagascar", "Indian/Antananarivo"],
  ["Port Louis, Mauritius", "Indian/Mauritius"],
  ["Victoria, Seychelles", "Indian/Mahe"],
  ["Beijing, China", "Asia/Shanghai"],
  ["Tokyo, Japan", "Asia/Tokyo"],
  ["Seoul, South Korea", "Asia/Seoul"],
  ["Pyongyang, North Korea", "Asia/Pyongyang"],
  ["Taipei, Taiwan", "Asia/Taipei"],
  ["Hong Kong, Hong Kong", "Asia/Hong_Kong"],
  ["Bangkok, Thailand", "Asia/Bangkok"],
  ["Hanoi, Vietnam", "Asia/Ho_Chi_Minh"],
  ["Phnom Penh, Cambodia", "Asia/Phnom_Penh"],
  ["Vientiane, Laos", "Asia/Vientiane"],
  ["Naypyidaw, Myanmar", "Asia/Yangon"],
  ["Kuala Lumpur, Malaysia", "Asia/Kuala_Lumpur"],
  ["Jakarta, Indonesia", "Asia/Jakarta"],
  ["Bandar Seri Begawan, Brunei", "Asia/Brunei"],
  ["Dili, Timor-Leste", "Asia/Dili"],
  ["Kathmandu, Nepal", "Asia/Kathmandu"],
  ["Thimphu, Bhutan", "Asia/Thimphu"],
  ["Dhaka, Bangladesh", "Asia/Dhaka"],
  ["Colombo, Sri Lanka", "Asia/Colombo"],
  ["Male, Maldives", "Indian/Maldives"],
  ["Islamabad, Pakistan", "Asia/Karachi"],
  ["Kabul, Afghanistan", "Asia/Kabul"],
  ["Tashkent, Uzbekistan", "Asia/Tashkent"],
  ["Astana, Kazakhstan", "Asia/Almaty"],
  ["Bishkek, Kyrgyzstan", "Asia/Bishkek"],
  ["Dushanbe, Tajikistan", "Asia/Dushanbe"],
  ["Ashgabat, Turkmenistan", "Asia/Ashgabat"],
  ["Tehran, Iran", "Asia/Tehran"],
  ["Baghdad, Iraq", "Asia/Baghdad"],
  ["Riyadh, Saudi Arabia", "Asia/Riyadh"],
  ["Doha, Qatar", "Asia/Qatar"],
  ["Manama, Bahrain", "Asia/Bahrain"],
  ["Kuwait City, Kuwait", "Asia/Kuwait"],
  ["Muscat, Oman", "Asia/Muscat"],
  ["Sana'a, Yemen", "Asia/Aden"],
  ["Amman, Jordan", "Asia/Amman"],
  ["Beirut, Lebanon", "Asia/Beirut"],
  ["Damascus, Syria", "Asia/Damascus"],
  ["Jerusalem, Israel", "Asia/Jerusalem"],
  ["Ramallah, Palestine", "Asia/Hebron"],
  ["Yerevan, Armenia", "Asia/Yerevan"],
  ["Baku, Azerbaijan", "Asia/Baku"],
  ["Tbilisi, Georgia", "Asia/Tbilisi"],
  ["Canberra, Australia", "Australia/Sydney"],
  ["Wellington, New Zealand", "Pacific/Auckland"],
  ["Port Moresby, Papua New Guinea", "Pacific/Port_Moresby"],
  ["Suva, Fiji", "Pacific/Fiji"],
  ["Apia, Samoa", "Pacific/Apia"],
  ["Nuku'alofa, Tonga", "Pacific/Tongatapu"],
  ["Honiara, Solomon Islands", "Pacific/Guadalcanal"],
  ["Port Vila, Vanuatu", "Pacific/Efate"],
  ["Palikir, Micronesia", "Pacific/Pohnpei"],
  ["Majuro, Marshall Islands", "Pacific/Majuro"],
  ["Tarawa, Kiribati", "Pacific/Tarawa"],
  ["Funafuti, Tuvalu", "Pacific/Funafuti"],
  ["Yaren, Nauru", "Pacific/Nauru"],
  ["Melekeok, Palau", "Pacific/Palau"]
];

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  setupTimezones();
  setupBreakPlanner();
  bindEvents();
  initializeAuth();
  setInterval(tick, 1000);
  setInterval(refreshStateQuietly, 7000);
});

function bindElements() {
  for (const id of [
    "headerDubaiTime",
    "budgetInput",
    "breakBudgetInput",
    "updateBudgetBtn",
    "saveBreakBtn",
    "workTimer",
    "breakTimer",
    "breakStartSelect",
    "breakEndSelect",
    "plannedBreakBtn",
    "plannedBreakLabel",
    "reviewTimer",
    "reviewBtn",
    "startBtn",
    "endBtn",
    "resetBtn",
    "pauseBtn",
    "breakBtn",
    "stopBreakBtn",
    "etaClock",
    "viewerClock",
    "timezoneSelect",
    "statePill",
    "jobInput",
    "reviewSubmitBtn",
    "searchInput",
    "dateFromFilter",
    "dateToFilter",
    "categoryFilter",
    "categoryOptions",
    "addManualRowBtn",
    "selectVisibleBtn",
    "deleteSelectedBtn",
    "importInput",
    "importBtn",
    "exportBtn",
    "taskRows",
    "dashboardRange",
    "dashboardJobCount",
    "dashboardHours",
    "dashboardMins",
    "dashboardOtRows",
    "dashboardOtHours",
    "dashboardOtDayCount",
    "dashboardOtDays",
    "categoryBars",
    "categoryPie",
    "pieLegend",
    "toast",
    "currentUserBadge",
    "tourBtn",
    "adminPanelBtn",
    "logoutBtn",
    "authGate",
    "authTitle",
    "authIntro",
    "loginForm",
    "loginUsername",
    "loginPassword",
    "adminModal",
    "adminCloseBtn",
    "createUserForm",
    "newUserDisplayName",
    "newUsername",
    "newUserPassword",
    "newUserRole",
    "adminUsers"
  ]) {
    els[id] = document.getElementById(id);
  }
}

function setupTimezones() {
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const choices = [
    { capital: "Local browser time", country: "", zone: localTz, local: true },
    ...capitalTimezones.map(([label, zone]) => {
      const parts = label.split(",");
      const capital = parts.shift().trim();
      const country = parts.join(",").trim() || capital;
      return { capital, country, zone, local: false };
    }).sort((a, b) => a.country.localeCompare(b.country) || a.capital.localeCompare(b.capital))
  ];
  const seen = new Set();
  for (const { capital, country, zone, local } of choices) {
    if (!isSupportedTimeZone(zone)) continue;
    const key = `${country}|${capital}|${zone}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const option = document.createElement("option");
    option.value = zone;
    option.textContent = local ? `Local browser time (${zone})` : `${country} - ${capital} (${zone})`;
    els.timezoneSelect.append(option);
  }
  els.timezoneSelect.value = localStorage.getItem("viewerTimezone") || localTz;
  if (!els.timezoneSelect.value) els.timezoneSelect.value = DUBAI_TZ;
}

function setupBreakPlanner() {
  const options = [];
  for (let minute = 0; minute < 24 * 60; minute += 5) {
    options.push(new Option(formatMinuteOfDay(minute), String(minute)));
  }
  els.breakStartSelect.replaceChildren(...options.map((option) => option.cloneNode(true)));
  els.breakEndSelect.replaceChildren(...options.map((option) => option.cloneNode(true)));
  syncBreakPlannerDefaults(true);
}

function isSupportedTimeZone(zone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function bindEvents() {
  els.reviewBtn.addEventListener("click", submitReview);
  els.reviewSubmitBtn.addEventListener("click", submitReview);
  els.jobInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitReview();
  });
  els.startBtn.addEventListener("click", () => postAction("startWork", { workBudget: els.budgetInput.value }));
  els.updateBudgetBtn.addEventListener("click", () => postAction("updateBudget", { workBudget: els.budgetInput.value }));
  els.saveBreakBtn.addEventListener("click", saveSettings);
  els.pauseBtn.addEventListener("click", () => {
    const phase = getPhase();
    postAction(phase === "paused" || phase === "expired" ? "resumeWork" : "pauseWork");
  });
  els.breakBtn.addEventListener("click", () => postAction("startBreak"));
  els.stopBreakBtn.addEventListener("click", () => postAction("stopBreak"));
  els.breakStartSelect.addEventListener("change", () => {
    breakPlannerTouched = true;
    adjustBreakEndDefault();
  });
  els.breakEndSelect.addEventListener("change", () => {
    breakPlannerTouched = true;
  });
  els.plannedBreakBtn.addEventListener("click", startPlannedBreak);
  els.endBtn.addEventListener("click", () => postAction("endJob"));
  els.resetBtn.addEventListener("click", () => postAction("resetTimers"));
  els.addManualRowBtn.addEventListener("click", addManualRow);
  els.selectVisibleBtn.addEventListener("click", selectVisibleRows);
  els.deleteSelectedBtn.addEventListener("click", deleteSelectedRows);
  els.importBtn.addEventListener("click", () => els.importInput.click());
  els.importInput.addEventListener("change", importDataFile);
  els.exportBtn.addEventListener("click", generateTimesheetWord);
  els.timezoneSelect.addEventListener("change", () => {
    localStorage.setItem("viewerTimezone", els.timezoneSelect.value);
    tick();
  });
  els.searchInput.addEventListener("input", renderTable);
  els.dateFromFilter.addEventListener("change", renderTable);
  els.dateToFilter.addEventListener("change", renderTable);
  els.categoryFilter.addEventListener("change", renderTable);
  els.taskRows.addEventListener("change", handleTableChange);
  els.taskRows.addEventListener("click", handleTableClick);
  els.loginForm.addEventListener("submit", loginUser);
  els.logoutBtn.addEventListener("click", logoutUser);
  els.adminPanelBtn.addEventListener("click", openAdminPanel);
  els.adminCloseBtn.addEventListener("click", closeAdminPanel);
  els.adminModal.addEventListener("click", (event) => {
    if (event.target === els.adminModal) closeAdminPanel();
  });
  els.createUserForm.addEventListener("submit", createDesignerUser);
}

async function api(path, options = {}) {
  const viewHeaders = currentUser?.role === "admin" && activeViewUserId
    ? { "x-dtp-view-user": activeViewUserId }
    : {};
  const response = await fetch(path, {
    headers: {
      "content-type": "application/json",
      ...viewHeaders,
      ...(options.headers || {})
    },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      currentUser = null;
      state = null;
      activeViewUserId = "";
      localStorage.removeItem("adminViewUserId");
      showAuthGate();
    }
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

async function initializeAuth() {
  try {
    const status = await api("/api/auth/status");
    if (status.authenticated && status.user) {
      currentUser = status.user;
      activeViewUserId = currentUser.role === "admin" ? (localStorage.getItem("adminViewUserId") || "") : "";
      hideAuthGate();
      renderAuthBar();
      await loadState();
      return;
    }
    showAuthGate();
  } catch (error) {
    showAuthGate();
    showToast(error.message);
  }
}

function showAuthGate() {
  document.body.classList.add("auth-locked");
  els.authGate.hidden = false;
  els.loginForm.hidden = false;
  els.authTitle.textContent = "Sign in";
  els.authIntro.textContent = "Use your account to open your tracker rows.";
  els.logoutBtn.hidden = true;
  els.tourBtn.hidden = true;
  els.adminPanelBtn.hidden = true;
  els.currentUserBadge.textContent = "Not signed in";
  announceAuthUser(null, null);
}

function hideAuthGate() {
  els.authGate.hidden = true;
  document.body.classList.remove("auth-locked");
  renderAuthBar();
}

function renderAuthBar() {
  const user = state?.currentUser || state?.auth?.user || currentUser;
  const viewUser = state?.viewUser || state?.auth?.viewUser;
  currentUser = user || currentUser;
  if (!user) {
    els.currentUserBadge.textContent = "Not signed in";
    els.logoutBtn.hidden = true;
    els.tourBtn.hidden = true;
    els.adminPanelBtn.hidden = true;
    announceAuthUser(null, null);
    return;
  }
  const base = `${user.displayName || user.username} (${user.role})`;
  const viewingOther = user.role === "admin" && viewUser && viewUser.id !== user.id;
  els.currentUserBadge.textContent = viewingOther
    ? `${base} viewing ${viewUser.displayName || viewUser.username}`
    : base;
  els.logoutBtn.hidden = false;
  els.tourBtn.hidden = false;
  els.adminPanelBtn.hidden = user.role !== "admin";
  announceAuthUser(user, viewUser);
}

function announceAuthUser(user, viewUser) {
  window.dispatchEvent(new CustomEvent("dtp:auth-user", {
    detail: {
      user: user || null,
      viewUser: viewUser || null
    }
  }));
}

async function loginUser(event) {
  event.preventDefault();
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: els.loginUsername.value,
        password: els.loginPassword.value
      })
    });
    currentUser = data.user;
    activeViewUserId = "";
    localStorage.removeItem("adminViewUserId");
    els.loginPassword.value = "";
    hideAuthGate();
    await loadState();
    showToast("Logged in.");
  } catch (error) {
    showToast(error.message);
  }
}

async function logoutUser() {
  try {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
  } catch {
    // Continue local logout even if the session is already gone.
  }
  currentUser = null;
  state = null;
  activeViewUserId = "";
  localStorage.removeItem("adminViewUserId");
  selectedTaskIds.clear();
  closeAdminPanel();
  showAuthGate();
  showToast("Logged out.");
}

async function loadState(silent = false, options = {}) {
  try {
    const data = await api("/api/state");
    setState(data, options);
  } catch (error) {
    if (activeViewUserId && /Designer account not found/i.test(error.message)) {
      activeViewUserId = "";
      localStorage.removeItem("adminViewUserId");
      const data = await api("/api/state");
      setState(data, options);
      showToast("That designer account was not found. Showing your tracker.");
      return;
    }
    if (!silent) showToast(error.message);
  }
}

function setState(data, options = {}) {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  state = data;
  serverOffsetMs = Date.parse(data.serverNow) - Date.now();
  renderAll();
  if (options.preserveScroll) {
    requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
  }
}

function refreshStateQuietly() {
  if (isEditingField()) return;
  loadState(true, { preserveScroll: true });
}

function isEditingField() {
  const active = document.activeElement;
  if (!active || active === document.body) return false;
  return Boolean(active.closest("input, select, textarea, [contenteditable='true']"));
}

async function submitReview() {
  const rawJob = els.jobInput.value.trim();
  if (!rawJob) {
    showToast("Enter job details first.");
    els.jobInput.focus();
    return;
  }
  try {
    const data = await api("/api/review", {
      method: "POST",
      body: JSON.stringify({ rawJob })
    });
    els.jobInput.value = "";
    setState(data);
    showToast("Job added and review timer started.");
  } catch (error) {
    showToast(error.message);
  }
}

async function postAction(type, extra = {}) {
  try {
    const data = await api("/api/action", {
      method: "POST",
      body: JSON.stringify({ type, ...extra })
    });
    setState(data);
    showToast(actionMessage(type));
  } catch (error) {
    showToast(error.message);
  }
}

async function startPlannedBreak() {
  await postAction("startPlannedBreak", {
    breakStartMinutes: Number(els.breakStartSelect.value),
    breakEndMinutes: Number(els.breakEndSelect.value)
  });
}

async function addManualRow() {
  const defaultDate = defaultManualDate();
  const dateWorked = prompt("Date worked (YYYY-MM-DD). You can edit it later in the table.", defaultDate);
  if (dateWorked === null) return;
  if (!dateWorked.trim()) {
    showToast("Enter a date for the manual row.");
    return;
  }

  const rawJob = prompt("Job details for the manual row:\nExample: DTP0030748 / Anthony / 4 Slides / 1PM", "");
  if (rawJob === null) return;
  if (!rawJob.trim()) {
    showToast("Manual row needs job details so the protected Request # is correct.");
    return;
  }

  const workedHours = prompt("Worked hours (optional). Example: 01:06, 66, 66min, or 1.5h.", "");
  if (workedHours === null) return;

  try {
    const data = await api("/api/tasks/manual", {
      method: "POST",
      body: JSON.stringify({
        dateWorked,
        rawJob,
        workedHours,
        category: els.categoryFilter.value || ""
      })
    });
    setState(data);
    const created = data.tasks.find((task) => task.id === data.manualTaskId);
    if (created) revealManualTask(created);
    showToast("Manual row added. You can edit its date, hours, slides, category, client, and deadline.");
  } catch (error) {
    showToast(error.message);
  }
}

async function importDataFile() {
  const file = els.importInput.files?.[0];
  els.importInput.value = "";
  if (!file) return;
  if (!confirm(`Import tracker rows from "${file.name}"?`)) return;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = await api("/api/import", {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        contentBase64: arrayBufferToBase64(arrayBuffer)
      })
    });
    setState(data.state);
    const skipped = Number(data.skipped || 0);
    const removed = Number(data.removedDuplicates || 0);
    showToast(`Imported ${data.imported} row(s)${skipped ? `, skipped ${skipped} duplicate(s)` : ""}${removed ? `, cleaned ${removed} old duplicate(s)` : ""}.`);
  } catch (error) {
    showToast(error.message);
  }
}

async function saveSettings() {
  try {
    const data = await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        workBudget: els.budgetInput.value,
        breakBudget: els.breakBudgetInput.value
      })
    });
    setState(data);
    showToast("Settings saved.");
  } catch (error) {
    showToast(error.message);
  }
}

function actionMessage(type) {
  return {
    startWork: "Work timer started.",
    pauseWork: "Work timer paused.",
    resumeWork: "Work timer resumed.",
    continueTask: "Job continued.",
    startBreak: "Break started.",
    startPlannedBreak: "Planned break started.",
    stopBreak: "Break stopped.",
    endJob: "Job finished.",
    resetTimers: "Timers reset.",
    updateBudget: "Budget and expected finish updated."
  }[type] || "Updated.";
}

function renderAll() {
  if (!state) return;
  renderAuthBar();
  renderSettings();
  renderCategoryControls();
  syncBreakPlannerDefaults();
  tick();
  renderTable();
}

async function openAdminPanel() {
  if (!currentUser || currentUser.role !== "admin") return;
  els.adminModal.hidden = false;
  await loadAdminUsers();
}

function closeAdminPanel() {
  if (els.adminModal) els.adminModal.hidden = true;
}

async function loadAdminUsers() {
  try {
    const data = await api("/api/admin/users");
    renderAdminUsers(data.users || []);
  } catch (error) {
    showToast(error.message);
  }
}

function renderAdminUsers(users) {
  if (!users.length) {
    els.adminUsers.innerHTML = `<p class="empty-admin">No designer accounts yet.</p>`;
    return;
  }
  els.adminUsers.innerHTML = users.map((user) => `
    <article class="admin-user ${user.active ? "" : "inactive"} ${activeViewUserId === user.id || (!activeViewUserId && currentUser?.id === user.id) ? "viewing" : ""}" data-user-id="${escapeAttr(user.id)}" data-user-role="${escapeAttr(user.role)}">
      <div>
        <strong>${escapeHtml(user.displayName || user.username)}</strong>
        <span>${escapeHtml(user.username)} | ${escapeHtml(user.role)} | ${Number(user.rowCount || 0)} row(s)</span>
      </div>
      <div class="admin-user-actions">
        <button type="button" data-admin-action="view-tracker">${activeViewUserId === user.id || (!activeViewUserId && currentUser?.id === user.id) ? "Viewing" : "View tracker"}</button>
        <button type="button" data-admin-action="toggle-role">${user.role === "admin" ? "Make designer" : "Make admin"}</button>
        <button type="button" data-admin-action="toggle-active">${user.active ? "Deactivate" : "Activate"}</button>
        <button type="button" data-admin-action="reset-password">Reset password</button>
      </div>
    </article>
  `).join("");
  els.adminUsers.querySelectorAll("button[data-admin-action]").forEach((button) => {
    button.addEventListener("click", handleAdminUserAction);
  });
}

async function createDesignerUser(event) {
  event.preventDefault();
  try {
    const data = await api("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        displayName: els.newUserDisplayName.value,
        username: els.newUsername.value,
        password: els.newUserPassword.value,
        role: els.newUserRole.value
      })
    });
    els.newUserDisplayName.value = "";
    els.newUsername.value = "";
    els.newUserPassword.value = "";
    els.newUserRole.value = "designer";
    await loadAdminUsers();
    showToast(`Account created for ${data.user.displayName || data.user.username}.`);
  } catch (error) {
    showToast(error.message);
  }
}

async function handleAdminUserAction(event) {
  const card = event.target.closest(".admin-user");
  const userId = card?.dataset.userId;
  const userRole = card?.dataset.userRole || "designer";
  const action = event.target.dataset.adminAction;
  if (!userId || !action) return;

  try {
    if (action === "view-tracker") {
      activeViewUserId = userId === currentUser?.id ? "" : userId;
      if (activeViewUserId) {
        localStorage.setItem("adminViewUserId", activeViewUserId);
      } else {
        localStorage.removeItem("adminViewUserId");
      }
      selectedTaskIds.clear();
      closeAdminPanel();
      await loadState();
      showToast(activeViewUserId ? "Designer tracker opened." : "Your tracker opened.");
      return;
    }

    if (action === "toggle-role") {
      const nextRole = userRole === "admin" ? "designer" : "admin";
      const label = nextRole === "admin" ? "make this user an admin" : "make this admin a designer";
      if (!confirm(`Are you sure you want to ${label}?`)) return;
      await api(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole })
      });
      await loadAdminUsers();
      if (state?.viewUser?.id === userId) await loadState(true, { preserveScroll: true });
      showToast(nextRole === "admin" ? "User promoted to admin." : "User changed to designer.");
      return;
    }

    if (action === "toggle-active") {
      const isActive = !card.classList.contains("inactive");
      await api(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !isActive })
      });
      await loadAdminUsers();
      showToast(isActive ? "Designer deactivated." : "Designer activated.");
      return;
    }

    if (action === "reset-password") {
      const password = prompt("New password for this user (at least 8 characters):", "");
      if (password === null) return;
      await api(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        body: JSON.stringify({ password })
      });
      await loadAdminUsers();
      showToast("Password reset.");
    }
  } catch (error) {
    showToast(error.message);
  }
}

function renderSettings() {
  if (document.activeElement !== els.budgetInput) {
    els.budgetInput.value = secondsToBudgetText(state.settings.workBudgetSeconds);
  }
  if (document.activeElement !== els.breakBudgetInput) {
    els.breakBudgetInput.value = secondsToBreakText(state.settings.breakBudgetSeconds);
  }
}

function renderCategoryControls() {
  const currentFilter = els.categoryFilter.value;
  const categories = allCategories();
  els.categoryFilter.replaceChildren(new Option("All categories", ""));
  els.categoryOptions.replaceChildren();
  for (const category of categories) {
    els.categoryFilter.append(new Option(category, category));
    const option = document.createElement("option");
    option.value = category;
    els.categoryOptions.append(option);
  }
  els.categoryFilter.value = currentFilter;
}

function allCategories() {
  return Array.from(new Set([
    ...(state.categories || []),
    "Other",
    "Quality checking",
    ...state.tasks.map((task) => task.category).filter(Boolean)
  ])).sort((a, b) => a.localeCompare(b));
}

function tick() {
  if (!state) return;
  const now = new Date(nowMs());
  const workRemaining = getWorkRemaining();
  const breakRemaining = getBreakRemaining();
  const reviewElapsed = getReviewElapsed();
  const phase = getPhase(workRemaining);

  els.headerDubaiTime.textContent = formatDateTime(now, DUBAI_TZ);
  els.viewerClock.textContent = formatDateTime(now, els.timezoneSelect.value);
  els.workTimer.textContent = formatHMS(workRemaining);
  els.breakTimer.textContent = formatHMS(breakRemaining);
  els.reviewTimer.textContent = formatMS(reviewElapsed);

  els.workTimer.classList.toggle("muted", phase === "paused" || phase === "break");
  renderStatePill(phase);
  renderExpectedFinish();
  renderPlannedBreakLabel();
  renderButtons(phase);
}

function renderStatePill(phase) {
  const labels = {
    idle: "Idle",
    review: "Reviewing",
    work: "Working",
    paused: "Paused",
    break: "On break",
    expired: "Time reached"
  };
  els.statePill.className = `state-pill ${phase}`;
  els.statePill.textContent = labels[phase] || phase;
}

function renderExpectedFinish() {
  const timer = state.timer;
  if (timer.expectedFinishAt) {
    const eta = formatTime(expectedFinishForDisplay(timer), DUBAI_TZ);
    els.etaClock.textContent = eta;
    return;
  }
  els.etaClock.textContent = "--";
}

function expectedFinishForDisplay(timer) {
  if (timer.phase !== "break" || !timer.activeTaskId || !timer.breakStartedAt) {
    return timer.expectedFinishAt;
  }

  const remainingWorkSeconds = Math.max(0, Number(timer.workRemainingBaseSeconds) || 0);
  const plannedEndMs = Date.parse(timer.plannedBreakEndAt || "");
  const finishBaseMs = Number.isFinite(plannedEndMs) ? Math.max(nowMs(), plannedEndMs) : nowMs();
  return new Date(finishBaseMs + remainingWorkSeconds * 1000).toISOString();
}

function renderPlannedBreakLabel() {
  const timer = state.timer || {};
  if (timer.phase === "break" && timer.breakWindowLabel) {
    els.plannedBreakLabel.textContent = `Loop break: ${timer.breakWindowLabel}`;
    return;
  }
  const start = Number(els.breakStartSelect.value);
  const end = Number(els.breakEndSelect.value);
  const duration = plannedBreakDurationMinutes(start, end);
  if (duration <= 0) {
    els.plannedBreakLabel.textContent = "Choose an end time after the start time";
    return;
  }
  els.plannedBreakLabel.textContent = `Planned: ${formatMinuteOfDay(start)} - ${formatMinuteOfDay(end)} (${duration} min)`;
}

function renderButtons(phase) {
  const hasActive = Boolean(state.timer.activeTaskId && getActiveTask());
  const canBreak = hasActive || hasTaskToday();
  els.startBtn.disabled = !(hasActive && (phase === "review" || phase === "idle" || phase === "paused"));
  els.endBtn.disabled = !hasActive;
  els.pauseBtn.disabled = !(hasActive && ["work", "paused", "expired"].includes(phase));
  els.pauseBtn.textContent = phase === "paused" || phase === "expired" ? "Resume" : "Pause";
  els.breakBtn.disabled = !(canBreak && ["idle", "work", "paused", "expired"].includes(phase));
  const plannedDuration = plannedBreakDurationMinutes(Number(els.breakStartSelect.value), Number(els.breakEndSelect.value));
  els.plannedBreakBtn.disabled = !(canBreak && plannedDuration > 0 && ["idle", "work", "paused", "expired"].includes(phase));
  els.stopBreakBtn.disabled = phase !== "break";
  els.updateBudgetBtn.disabled = !hasActive;
  els.reviewBtn.disabled = false;
  els.reviewSubmitBtn.disabled = false;
}

function renderTable() {
  if (!state) return;
  pruneSelectedTasks();
  const rows = filteredTasks();
  renderDashboard(rows);
  els.taskRows.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="12" class="empty">No tracker rows match the current view.</td>`;
    els.taskRows.append(tr);
    renderSelectionControls();
    return;
  }

  const activeId = state.timer.activeTaskId;
  for (const task of rows) {
    const tr = document.createElement("tr");
    if (task.id === activeId) tr.classList.add("active-row");
    if (selectedTaskIds.has(task.id)) tr.classList.add("selected-row");
    if (task.pauseStartedAt && task.id !== activeId && !task.finishedAt) tr.classList.add("parked-row");
    tr.dataset.id = task.id;
    tr.innerHTML = `
      <td>${dateWorkedInput(task)}</td>
      <td><span class="readonly-cell">${escapeHtml(task.requestNo || "")}</span></td>
      <td>${durationInput(task)}</td>
      <td>${escapeHtml(formatMinutes(task.durationSeconds))}</td>
      <td>${editableInput(task, "slides", task.slides, "Slides")}</td>
      <td>${categorySelect(task)}</td>
      <td>${editableInput(task, "client", task.client, "Client")}</td>
      <td>${editableInput(task, "deadlineText", task.deadlineText, "Deadline")}</td>
      <td>${escapeHtml(formatTime(task.startAt, DUBAI_TZ))}</td>
      <td>${escapeHtml(task.finishedAt ? formatTime(task.finishedAt, DUBAI_TZ) : "--")}</td>
      <td>${breakInput(task)}</td>
      <td>${rowActions(task, activeId)}</td>
    `;
    els.taskRows.append(tr);
  }
  renderSelectionControls();
}

function editableInput(task, field, value, label) {
  return `<input class="cell-input" aria-label="${label}" data-field="${field}" data-id="${task.id}" value="${escapeAttr(value || "")}">`;
}

function dateWorkedInput(task) {
  return `<input class="cell-input date-worked-input" type="date" aria-label="Date worked" data-field="dateWorked" data-id="${task.id}" value="${escapeAttr(toDateInputValue(task.dateWorked))}">`;
}

function durationInput(task) {
  const value = formatDuration(task.durationSeconds).replace("--", "");
  return `<input class="cell-input duration-input" aria-label="Worked hours" title="Use HH:MM, whole minutes like 66, or decimal hours like 1.5h" data-field="workedHours" data-id="${task.id}" value="${escapeAttr(value)}" placeholder="00:00">`;
}

function breakInput(task) {
  const value = formatDuration(task.breakSeconds || 0).replace("--", "00:00");
  return `<input class="cell-input break-input" aria-label="Break time" title="Use HH:MM, whole minutes like 5, or 5min. This subtracts from worked hours." data-field="breakSeconds" data-id="${task.id}" value="${escapeAttr(value)}" placeholder="00:00">`;
}

function categorySelect(task) {
  return `<input class="cell-input" list="categoryOptions" aria-label="Category" data-field="category" data-id="${task.id}" value="${escapeAttr(task.category || "")}" placeholder="Other / type">`;
}

function rowActions(task, activeId) {
  const buttons = [];
  buttons.push(`<label class="select-row"><input type="checkbox" data-action="select-row" data-id="${escapeAttr(task.id)}" ${selectedTaskIds.has(task.id) ? "checked" : ""}> Select</label>`);
  if (!task.finishedAt && !task.imported && task.id !== activeId) {
    buttons.push(`<button class="continue-btn" data-action="continue" type="button">Continue</button>`);
  }
  return `<div class="row-actions">${buttons.join("")}</div>`;
}

async function handleTableChange(event) {
  if (event.target.dataset.action === "select-row") {
    const id = event.target.dataset.id;
    if (id && event.target.checked) selectedTaskIds.add(id);
    if (id && !event.target.checked) selectedTaskIds.delete(id);
    renderSelectionControls();
    return;
  }

  const field = event.target.dataset.field;
  const id = event.target.dataset.id;
  if (!field || !id) return;
  try {
    const data = await api(`/api/tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ [field]: event.target.value })
    });
    setState(data, { preserveScroll: true });
  } catch (error) {
    showToast(error.message);
  }
}

async function handleTableClick(event) {
  const continueButton = event.target.closest("button[data-action='continue']");
  if (continueButton) {
    const tr = continueButton.closest("tr");
    const id = tr?.dataset.id;
    if (!id) return;
    try {
      const data = await api("/api/action", {
        method: "POST",
        body: JSON.stringify({ type: "continueTask", taskId: id })
      });
      setState(data);
      showToast("Job continued.");
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
}

function selectVisibleRows() {
  const rows = filteredTasks();
  const allVisibleSelected = rows.length > 0 && rows.every((task) => selectedTaskIds.has(task.id));
  if (allVisibleSelected) {
    for (const task of rows) selectedTaskIds.delete(task.id);
  } else {
    for (const task of rows) selectedTaskIds.add(task.id);
  }
  renderTable();
}

async function deleteSelectedRows() {
  const ids = Array.from(selectedTaskIds);
  if (!ids.length) {
    showToast("No rows selected.");
    return;
  }
  if (!confirm(`Delete ${ids.length} selected row(s)?`)) return;
  try {
    const data = await api("/api/tasks/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids })
    });
    selectedTaskIds.clear();
    setState(data.state);
    showToast(`Deleted ${data.deleted} row(s).`);
  } catch (error) {
    showToast(error.message);
  }
}

function pruneSelectedTasks() {
  const ids = new Set(state.tasks.map((task) => task.id));
  for (const id of Array.from(selectedTaskIds)) {
    if (!ids.has(id)) selectedTaskIds.delete(id);
  }
}

function renderSelectionControls() {
  const visible = filteredTasks();
  const selectedVisible = visible.filter((task) => selectedTaskIds.has(task.id)).length;
  const allVisibleSelected = visible.length > 0 && selectedVisible === visible.length;
  els.selectVisibleBtn.textContent = allVisibleSelected ? "Clear visible" : "Select visible";
  els.selectVisibleBtn.disabled = visible.length === 0;
  els.deleteSelectedBtn.disabled = selectedTaskIds.size === 0;
  els.deleteSelectedBtn.textContent = selectedTaskIds.size ? `Delete selected (${selectedTaskIds.size})` : "Delete selected";
}

function renderDashboard(rows) {
  const totalSeconds = sumDurationSeconds(rows);
  const stats = categoryStats(rows);
  const overtime = overtimeStats(rows);
  els.dashboardRange.textContent = dashboardRangeLabel(rows);
  els.dashboardJobCount.textContent = String(rows.length);
  els.dashboardHours.textContent = formatDuration(totalSeconds);
  els.dashboardMins.textContent = formatMinutes(totalSeconds);
  renderOvertimeOverview(overtime);
  renderCategoryBars(stats);
  renderCategoryPie(stats, totalSeconds);
}

function dashboardRangeLabel(rows) {
  const from = els.dateFromFilter.value;
  const to = els.dateToFilter.value;
  if (from && to) return formatDateRangeWithYear(from, to);
  if (from || to) return formatDateWorkedWithYear(from || to);
  if (!rows.length) return "Visible data";
  const dates = rows.map((task) => task.dateWorked).filter(Boolean).sort();
  return formatDateRangeWithYear(dates[0], dates[dates.length - 1]);
}

function sumDurationSeconds(rows) {
  return rows.reduce((sum, task) => sum + Math.max(0, Number(task.durationSeconds) || 0), 0);
}

function categoryStats(rows) {
  const map = new Map();
  for (const task of rows) {
    const name = task.category || "Uncategorized";
    const current = map.get(name) || { name, seconds: 0, count: 0 };
    current.seconds += Math.max(0, Number(task.durationSeconds) || 0);
    current.count += 1;
    map.set(name, current);
  }
  return Array.from(map.values()).sort((a, b) => b.seconds - a.seconds || b.count - a.count || a.name.localeCompare(b.name));
}

function overtimeStats(rows) {
  const days = new Map();
  let rowsCount = 0;
  let seconds = 0;

  for (const { task, overtime, overtimeSeconds } of applyCountableOvertimeMarkers([...rows].sort(compareTaskOldestFirst))) {
    if (!overtime && overtimeSeconds <= 0) continue;
    const dateKey = task.dateWorked || "";
    const current = days.get(dateKey) || { dateKey, rows: 0, seconds: 0 };
    if (overtime) {
      rowsCount += 1;
      current.rows += 1;
    }
    seconds += overtimeSeconds;
    current.seconds += overtimeSeconds;
    days.set(dateKey, current);
  }

  return {
    rows: rowsCount,
    seconds,
    days: Array.from(days.values()).sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)))
  };
}

function renderOvertimeOverview(summary) {
  els.dashboardOtRows.textContent = String(summary.rows);
  els.dashboardOtHours.textContent = formatDuration(summary.seconds);
  els.dashboardOtDayCount.textContent = String(summary.days.length);
  els.dashboardOtDays.replaceChildren();

  if (!summary.rows) {
    els.dashboardOtDays.innerHTML = `<div class="dashboard-empty">No overtime in visible data.</div>`;
    return;
  }

  for (const day of summary.days) {
    const row = document.createElement("div");
    row.className = "overtime-day-row";
    row.innerHTML = `
      <span>${escapeHtml(formatDateWorkedWithYear(day.dateKey))}</span>
      <strong>${escapeHtml(formatDuration(day.seconds))}</strong>
    `;
    els.dashboardOtDays.append(row);
  }
}

function renderCategoryBars(stats) {
  els.categoryBars.replaceChildren();
  if (!stats.length) {
    els.categoryBars.innerHTML = `<div class="dashboard-empty">No visible rows.</div>`;
    return;
  }
  const maxSeconds = Math.max(...stats.map((item) => item.seconds), 1);
  for (const [index, item] of stats.slice(0, 8).entries()) {
    const color = chartColors[index % chartColors.length];
    const width = Math.max(2, Math.round((item.seconds / maxSeconds) * 100));
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div class="bar-meta">
        <span>${escapeHtml(item.name)}</span>
        <span>${escapeHtml(formatDuration(item.seconds))}</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${width}%;background:${color}"></div></div>
    `;
    els.categoryBars.append(row);
  }
}

function renderCategoryPie(stats, totalSeconds) {
  els.pieLegend.replaceChildren();
  if (!stats.length || totalSeconds <= 0) {
    els.categoryPie.style.background = "#e8eef3";
    els.pieLegend.innerHTML = `<div class="dashboard-empty">No hours to chart.</div>`;
    return;
  }

  let cursor = 0;
  const segments = [];
  for (const [index, item] of stats.entries()) {
    const color = chartColors[index % chartColors.length];
    const start = cursor;
    cursor += (item.seconds / totalSeconds) * 100;
    segments.push(`${color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`);
  }
  els.categoryPie.style.background = `conic-gradient(${segments.join(", ")})`;

  for (const [index, item] of stats.slice(0, 8).entries()) {
    const color = chartColors[index % chartColors.length];
    const percent = Math.round((item.seconds / totalSeconds) * 100);
    const row = document.createElement("div");
    row.className = "legend-row";
    row.innerHTML = `
      <span class="legend-swatch" style="background:${color}"></span>
      <span>${escapeHtml(item.name)}</span>
      <strong>${percent}%</strong>
    `;
    els.pieLegend.append(row);
  }
}

function filteredTasks() {
  const term = els.searchInput.value.trim().toLowerCase();
  const fromDate = els.dateFromFilter.value;
  const toDate = els.dateToFilter.value;
  const category = els.categoryFilter.value;
  return [...state.tasks]
    .sort(compareTaskLatestFirst)
    .filter((task) => {
      if (fromDate && toDate) {
        if (task.dateWorked < fromDate || task.dateWorked > toDate) return false;
      } else if (fromDate || toDate) {
        if (task.dateWorked !== (fromDate || toDate)) return false;
      }
      if (category && task.category !== category) return false;
      if (!term) return true;
      const haystack = [
        task.dateWorked,
        task.requestNo,
        task.client,
        task.slides,
        task.category,
        task.deadlineText,
        formatTime(task.startAt, DUBAI_TZ),
        formatTime(task.finishedAt, DUBAI_TZ)
      ].join(" ").toLowerCase();
      return haystack.includes(term);
    });
}

function defaultManualDate() {
  const selectedVisible = filteredTasks().find((task) => selectedTaskIds.has(task.id));
  if (selectedVisible?.dateWorked) return selectedVisible.dateWorked;
  return els.dateFromFilter.value || els.dateToFilter.value || formatDateKey(new Date(nowMs()), DUBAI_TZ);
}

function datePassesActiveFilter(dateWorked) {
  const fromDate = els.dateFromFilter.value;
  const toDate = els.dateToFilter.value;
  if (fromDate && toDate) return dateWorked >= fromDate && dateWorked <= toDate;
  if (fromDate || toDate) return dateWorked === (fromDate || toDate);
  return true;
}

function revealManualTask(task) {
  let changed = false;
  if (task.dateWorked && !datePassesActiveFilter(task.dateWorked)) {
    els.dateFromFilter.value = task.dateWorked;
    els.dateToFilter.value = "";
    changed = true;
  }
  if (els.categoryFilter.value && task.category !== els.categoryFilter.value) {
    els.categoryFilter.value = "";
    changed = true;
  }
  if (els.searchInput.value.trim()) {
    els.searchInput.value = "";
    changed = true;
  }
  if (changed) renderTable();
}

function compareTaskOldestFirst(a, b) {
  return taskSortTime(a) - taskSortTime(b);
}

function compareTaskLatestFirst(a, b) {
  return taskSortTime(b) - taskSortTime(a);
}

function taskSortTime(task) {
  if (task.startAt) return Date.parse(task.startAt) || 0;
  if (task.dateWorked) return Date.parse(`${task.dateWorked}T00:00:00Z`) || 0;
  return Date.parse(task.createdAt || 0) || 0;
}

async function generateTimesheetWord() {
  const rows = filteredTasks();
  if (!rows.length) {
    showToast("No visible rows to generate.");
    return;
  }

  const name = prompt("Name for timesheet:", localStorage.getItem("timesheetName") || "");
  if (name === null) return;
  const timekeeperId = prompt("FTI TimeKeeper ID:", localStorage.getItem("timekeeperId") || "");
  if (timekeeperId === null) return;
  localStorage.setItem("timesheetName", name.trim());
  localStorage.setItem("timekeeperId", timekeeperId.trim());

  const reportDate = formatSlashDate(new Date(nowMs()), DUBAI_TZ);
  const exportRows = applyCountableOvertimeMarkers([...rows].sort(compareTaskOldestFirst)).map(({ task, overtime }) => ({
    dateWorked: overtimeDateWorked(formatDateWorked(task.dateWorked), overtime),
    requestNo: stripOvertimePrefix(task.requestNo),
    workedHours: formatDuration(task.durationSeconds).replace("--", ""),
    durationSeconds: task.durationSeconds || 0,
    slides: task.slides || "",
    category: task.category || "",
    client: task.client || ""
  }));

  try {
    const response = await fetch("/api/timesheet-docx", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || "NAME",
        timekeeperId: timekeeperId.trim() || "",
        reportDate,
        rows: exportRows
      })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Export failed: ${response.status}`);
    }
    const blob = await response.blob();
    downloadBlob(blob, `DTP_Timesheet_${formatFileDate(new Date(nowMs()))}.docx`);
    showToast(`Generated Word timesheet with ${rows.length} row(s).`);
  } catch (error) {
    showToast(error.message);
  }
}

function applyOvertimeMarkers(tasks) {
  const dailyTotals = new Map();
  return tasks.map((task) => {
    const dateKey = task.dateWorked || "";
    const duration = Math.max(0, Number(task.durationSeconds) || 0);
    const before = dailyTotals.get(dateKey) || 0;
    const after = before + duration;
    dailyTotals.set(dateKey, after);
    const overtimeSeconds = Math.max(0, after - DAILY_OVERTIME_THRESHOLD_SECONDS) - Math.max(0, before - DAILY_OVERTIME_THRESHOLD_SECONDS);
    return { task, overtime: after > DAILY_OVERTIME_THRESHOLD_SECONDS, overtimeSeconds };
  });
}

function applyCountableOvertimeMarkers(tasks) {
  const marked = applyOvertimeMarkers(tasks);
  const dailyOvertimeSeconds = new Map();

  for (const item of marked) {
    const dateKey = item.task.dateWorked || "";
    dailyOvertimeSeconds.set(dateKey, (dailyOvertimeSeconds.get(dateKey) || 0) + item.overtimeSeconds);
  }

  return marked.map((item) => ({
    ...item,
    overtime: item.overtime && isCountableOvertime(dailyOvertimeSeconds.get(item.task.dateWorked || "")),
    overtimeSeconds: isCountableOvertime(dailyOvertimeSeconds.get(item.task.dateWorked || ""))
      ? item.overtimeSeconds
      : 0
  }));
}

function isCountableOvertime(seconds) {
  return Math.max(0, Number(seconds) || 0) >= MINIMUM_COUNTABLE_OVERTIME_SECONDS;
}

function overtimeDateWorked(dateWorked, overtime) {
  const value = String(dateWorked || "").trim();
  if (!overtime || !value) return value;
  return value.startsWith("*") ? value : `*${value}`;
}

function stripOvertimePrefix(value) {
  return String(value || "").trim().replace(/^\*+/, "");
}

function buildTimesheetDocx({ name, timekeeperId, reportDate, rows }) {
  const tableRows = rows.map((task) => [
    formatDateWorked(task.dateWorked),
    task.requestNo || "",
    formatDuration(task.durationSeconds).replace("--", ""),
    task.slides || "",
    task.category || "",
    task.client || ""
  ]);

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraph("APPENDIX 1", { size: 22 })}
    ${paragraph("Pro Forma Timesheet", { bold: true, size: 28 })}
    ${paragraph(`This Timesheet is dated: ${reportDate}`, { size: 20, indent: 180 })}
    ${paragraph("", { size: 12 })}
    ${paragraph(`NAME: ${name}`, { size: 22 })}
    ${paragraph(`FTI TimeKeeper ID: ${timekeeperId}`, { size: 22 })}
    ${paragraph("Consultant Timesheet", { bold: true, size: 20 })}
    ${paragraph("* = Overtime", { bold: true, size: 20, align: "right", right: 1200 })}
    ${timesheetTable(tableRows)}
    ${paragraph("", { size: 12 })}
    ${paragraph("Signature: ________________________________", { size: 22 })}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="720" w:right="900" w:bottom="720" w:left="900" w:header="450" w:footer="450" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const files = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    },
    { name: "word/document.xml", content: documentXml }
  ];

  return new Blob([zipStore(files)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraph(text, options = {}) {
  const align = options.align ? `<w:jc w:val="${options.align}"/>` : "";
  const ind = options.right ? `<w:ind w:right="${options.right}"/>` : "";
  const pPr = align || ind ? `<w:pPr>${align}${ind}</w:pPr>` : "";
  return `<w:p>${pPr}${run(text, options)}</w:p>`;
}

function run(text, options = {}) {
  const bold = options.bold ? "<w:b/>" : "";
  const size = options.size || 20;
  const parts = String(text ?? "").split("\n").map((part, index) => {
    const br = index === 0 ? "" : "<w:br/>";
    return `${br}<w:t xml:space="preserve">${xmlEscape(part)}</w:t>`;
  }).join("");
  return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>${bold}<w:sz w:val="${size}"/></w:rPr>${parts}</w:r>`;
}

function timesheetTable(rows) {
  const widths = [1200, 1500, 1100, 1050, 1800, 2500];
  const headers = ["Date\nworked", "Request #", "# of\nhours\nworked", "# of slides", "Category of work", "Relevant Client"];
  const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
  const headerRow = tableRow(headers, widths, { bold: true });
  const bodyRows = rows.map((row) => tableRow(row, widths)).join("");
  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="9150" w:type="dxa"/>
      <w:tblLook w:firstRow="1" w:noHBand="0" w:noVBand="1"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="8" w:space="0" w:color="000000"/>
        <w:left w:val="single" w:sz="8" w:space="0" w:color="000000"/>
        <w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/>
        <w:right w:val="single" w:sz="8" w:space="0" w:color="000000"/>
        <w:insideH w:val="single" w:sz="8" w:space="0" w:color="000000"/>
        <w:insideV w:val="single" w:sz="8" w:space="0" w:color="000000"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>${grid}</w:tblGrid>
    ${headerRow}${bodyRows}
  </w:tbl>`;
}

function tableRow(values, widths, options = {}) {
  const cells = values.map((value, index) => tableCell(value, widths[index], options)).join("");
  return `<w:tr>${cells}</w:tr>`;
}

function tableCell(value, width, options = {}) {
  return `<w:tc>
    <w:tcPr>
      <w:tcW w:w="${width}" w:type="dxa"/>
      <w:tcMar>
        <w:top w:w="60" w:type="dxa"/>
        <w:left w:w="80" w:type="dxa"/>
        <w:bottom w:w="60" w:type="dxa"/>
        <w:right w:w="80" w:type="dxa"/>
      </w:tcMar>
      <w:vAlign w:val="center"/>
    </w:tcPr>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr>${run(value, { bold: options.bold, size: 20 })}</w:p>
  </w:tc>`;
}

function zipStore(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = encoder.encode(file.content);
    const crc = crc32(contentBytes);
    const localHeader = concatBytes(
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(contentBytes.length),
      u32(contentBytes.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes
    );
    localParts.push(localHeader, contentBytes);

    centralParts.push(concatBytes(
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(contentBytes.length),
      u32(contentBytes.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes
    ));
    offset += localHeader.length + contentBytes.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = concatBytes(
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralSize),
    u32(offset),
    u16(0)
  );
  return concatBytes(...localParts, ...centralParts, end);
}

function u16(value) {
  const bytes = new Uint8Array(2);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, value, true);
  return bytes;
}

function u32(value) {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, value >>> 0, true);
  return bytes;
}

function concatBytes(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.append(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}

function nowMs() {
  return Date.now() + serverOffsetMs;
}

function secondsSinceIso(iso) {
  if (!iso) return 0;
  const start = Date.parse(iso);
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((nowMs() - start) / 1000));
}

function syncBreakPlannerDefaults(force = false) {
  if (!force && breakPlannerTouched) return;
  const startMinute = roundUpToFive(getDubaiMinuteOfDay(new Date(nowMs())));
  const remainingSeconds = state ? getBreakRemaining() : 15 * 60;
  const remainingMinutes = Math.max(5, Math.round(remainingSeconds / 60) || 15);
  const defaultDuration = Math.min(15, remainingMinutes);
  els.breakStartSelect.value = String(startMinute);
  els.breakEndSelect.value = String((startMinute + defaultDuration) % (24 * 60));
}

function adjustBreakEndDefault() {
  const start = Number(els.breakStartSelect.value);
  const end = Number(els.breakEndSelect.value);
  if (plannedBreakDurationMinutes(start, end) > 0) return;
  els.breakEndSelect.value = String((start + 15) % (24 * 60));
}

function plannedBreakDurationMinutes(start, end) {
  const cleanStart = Number.isFinite(start) ? start : 0;
  const cleanEnd = Number.isFinite(end) ? end : cleanStart + 15;
  if (cleanEnd === cleanStart) return 0;
  let duration = cleanEnd - cleanStart;
  if (duration <= 0) duration += 24 * 60;
  return duration;
}

function getDubaiMinuteOfDay(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DUBAI_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const map = {};
  for (const part of parts) map[part.type] = part.value;
  return Number(map.hour) * 60 + Number(map.minute);
}

function roundUpToFive(minute) {
  return (Math.ceil(minute / 5) * 5) % (24 * 60);
}

function getWorkRemaining() {
  const timer = state.timer;
  const base = Number(timer.workRemainingBaseSeconds ?? timer.workRemainingSeconds ?? state.settings.workBudgetSeconds);
  if (timer.phase === "work" && timer.workCountdownStartedAt) {
    return Math.max(0, Math.floor(base - secondsSinceIso(timer.workCountdownStartedAt)));
  }
  return Math.max(0, Math.floor(base));
}

function getBreakRemaining() {
  const timer = state.timer;
  const base = Number(timer.breakRemainingBaseSeconds ?? timer.breakRemainingSeconds ?? state.settings.breakBudgetSeconds);
  if (timer.phase === "break" && timer.breakCountdownStartedAt) {
    const elapsed = secondsSinceIso(timer.breakCountdownStartedAt);
    const planned = Number(timer.plannedBreakDurationSeconds || 0);
    const counted = planned > 0 ? Math.min(elapsed, planned) : elapsed;
    return Math.max(0, Math.floor(base - counted));
  }
  return Math.max(0, Math.floor(base));
}

function getReviewElapsed() {
  const timer = state.timer;
  const base = Number(timer.reviewElapsedBaseSeconds ?? timer.reviewElapsedSeconds ?? 0);
  if (timer.phase === "review" && timer.reviewStartedAt) {
    return Math.max(0, Math.floor(base + secondsSinceIso(timer.reviewStartedAt)));
  }
  return Math.max(0, Math.floor(base));
}

function getPhase(workRemaining = getWorkRemaining()) {
  if (!state) return "idle";
  if (state.timer.phase === "break" && state.timer.plannedBreakEndAt && Date.parse(state.timer.plannedBreakEndAt) <= nowMs()) {
    return workRemaining > 0 ? "work" : "expired";
  }
  if (state.timer.phase === "work" && workRemaining <= 0) return "expired";
  return state.timer.phase || "idle";
}

function getActiveTask() {
  return state.tasks.find((task) => task.id === state.timer.activeTaskId);
}

function hasTaskToday() {
  const today = formatDateKey(new Date(nowMs()), DUBAI_TZ);
  return state.tasks.some((task) => task.dateWorked === today);
}

function secondsToBudgetText(seconds) {
  const sec = Number(seconds || 0);
  if (sec > 0 && sec % 3600 === 0) return `${sec / 3600}.0`;
  if (sec > 0 && sec % 60 === 0) return String(sec / 60);
  const hours = sec / 3600;
  return String(Math.round(hours * 100) / 100);
}

function secondsToBreakText(seconds) {
  const minutes = Number(seconds || 0) / 60;
  if (Number.isInteger(minutes)) return `${minutes}min`;
  return secondsToBudgetText(seconds);
}

function formatHMS(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function formatMS(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

function formatDuration(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined || totalSeconds === "") return "--";
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const totalMin = Math.round(sec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function formatMinutes(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined || totalSeconds === "") return "--";
  return String(Math.round(Math.max(0, Number(totalSeconds) || 0) / 60));
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateTime(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(date).replace(",", "");
}

function formatTime(value, timeZone) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).format(new Date(value));
}

function formatMinuteOfDay(minute) {
  const normalized = ((Number(minute) % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${pad2(h12)}:${pad2(minutes)} ${suffix}`;
}

function formatDateWorked(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return value;
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  }).format(date).replace(" ", "-");
}

function toDateInputValue(value) {
  const raw = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function formatDateWorkedWithYear(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return value;
  const date = new Date(Date.UTC(year, month - 1, day));
  const shortDate = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  }).format(date).replace(" ", "-");
  return `${shortDate}-${year}`;
}

function formatDateRangeWithYear(startValue, endValue) {
  if (!startValue || !endValue || startValue === endValue) return formatDateWorkedWithYear(startValue || endValue);
  return `${formatDateWorkedWithYear(startValue)} - ${formatDateWorkedWithYear(endValue)}`;
}

function formatFileDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DUBAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const map = {};
  for (const part of parts) map[part.type] = part.value;
  return `${map.year}${map.month}${map.day}_${map.hour}${map.minute}`;
}

function formatSlashDate(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatDateKey(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = {};
  for (const part of parts) map[part.type] = part.value;
  return `${map.year}-${map.month}-${map.day}`;
}

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function csvEscape(value) {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  if (/[",]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2800);
}
