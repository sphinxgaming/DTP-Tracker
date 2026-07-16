const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const zlib = require("node:zlib");
const { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } = require("node:crypto");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "tracker.json");
const DB_BACKUP_FILE = `${DB_FILE}.bak`;
const SEED_DB_FILE = process.env.SEED_DB_FILE || path.join(ROOT, "data", "tracker.seed.json");
const TEMPLATE_FILE = path.join(PUBLIC_DIR, "timesheet-template.docx");
const DUBAI_TZ = "Asia/Dubai";
const SERVICE_NOW_BATCH_LIMIT = 300;

const SERVICE_NOW_ENV = {
  instanceUrl: envValue("SERVICENOW_INSTANCE_URL", "SN_INSTANCE_URL"),
  username: envValue("SERVICENOW_USER", "SN_USER"),
  password: envValue("SERVICENOW_PASSWORD", "SN_PASSWORD"),
  bearerToken: envValue("SERVICENOW_BEARER_TOKEN", "SN_BEARER_TOKEN"),
  cookie: envValue("SERVICENOW_COOKIE", "SN_COOKIE"),
  requestTable: envValue("SERVICENOW_REQUEST_TABLE", "SN_REQUEST_TABLE"),
  numberField: envValue("SERVICENOW_NUMBER_FIELD", "SN_NUMBER_FIELD") || "number",
  categoryField: envValue("SERVICENOW_CATEGORY_FIELD", "SN_CATEGORY_FIELD") || "u_graphic_design_category",
  slidesField: envValue("SERVICENOW_SLIDES_FIELD", "SN_SLIDES_FIELD") || "u_number_of_slides",
  requestQueryExtra: envValue("SERVICENOW_REQUEST_QUERY_EXTRA", "SN_REQUEST_QUERY_EXTRA"),
  reportingTable: envValue("SERVICENOW_REPORTING_TABLE", "SN_REPORTING_TABLE"),
  reportingParentField: envValue("SERVICENOW_REPORTING_PARENT_FIELD", "SN_REPORTING_PARENT_FIELD"),
  reportingParentMode: (envValue("SERVICENOW_REPORTING_PARENT_MODE", "SN_REPORTING_PARENT_MODE") || "sys_id").toLowerCase(),
  reportingProductionField: envValue("SERVICENOW_REPORTING_PRODUCTION_FIELD", "SN_REPORTING_PRODUCTION_FIELD") || "u_production",
  reportingMinutesField: envValue("SERVICENOW_REPORTING_MINUTES_FIELD", "SN_REPORTING_MINUTES_FIELD") || "u_production_time_in_mins",
  reportingQueryExtra: envValue("SERVICENOW_REPORTING_QUERY_EXTRA", "SN_REPORTING_QUERY_EXTRA"),
  productionName: envValue("SERVICENOW_PRODUCTION_NAME", "SN_PRODUCTION_NAME") || "Bryan Logapo"
};

const CATEGORIES = [
  "Formatting",
  "Visual",
  "Creative",
  "High End",
  "straight convertion",
  "video creation",
  "Consistency check",
  "Indesign",
  "Word formatting",
  "Excel",
  "Conversion to FTIC",
  "Visual PPT Report",
  "Video Edit",
  "Marketing brochure",
  "Booklet",
  "Creation Charts",
  "Conversion",
  "Info Graphics",
  "Visual Illustration",
  "Quality checking"
];

const initialDb = {
  version: 1,
  users: [],
  sessions: [],
  userSettings: {},
  userTimers: {},
  settings: {
    workBudgetSeconds: 3 * 3600,
    breakBudgetSeconds: 3600
  },
  categories: CATEGORIES,
  timer: {
    phase: "idle",
    activeTaskId: null,
    reviewStartedAt: null,
    reviewElapsedBaseSeconds: 0,
    workBudgetSeconds: 3 * 3600,
    workRemainingBaseSeconds: 3 * 3600,
    workCountdownStartedAt: null,
    breakBudgetSeconds: 3600,
    breakRemainingBaseSeconds: 3600,
    breakCountdownStartedAt: null,
    breakStartedAt: null,
    plannedBreakEndAt: null,
    plannedBreakDurationSeconds: 0,
    breakWindowLabel: "",
    expectedFinishAt: null
  },
  tasks: [],
  audit: []
};

let dbCache = null;
let writeQueue = Promise.resolve();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

async function ensureDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  if (dbCache) return dbCache;
  try {
    const text = await fs.readFile(DB_FILE, "utf8");
    dbCache = normalizeDb(JSON.parse(text.replace(/^\uFEFF/, "")));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    dbCache = await loadSeedDb();
    await saveDb(dbCache);
  }
  return dbCache;
}

async function loadSeedDb() {
  try {
    const text = await fs.readFile(SEED_DB_FILE, "utf8");
    return normalizeDb(JSON.parse(text.replace(/^\uFEFF/, "")));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return structuredClone(initialDb);
  }
}

function normalizeDb(db) {
  const clean = {
    ...structuredClone(initialDb),
    ...db
  };
  clean.users = Array.isArray(db.users) ? db.users.map(normalizeUser).filter(Boolean) : [];
  clean.sessions = Array.isArray(db.sessions) ? db.sessions.filter((session) => session && session.tokenHash && session.userId) : [];
  clean.userSettings = db.userSettings && typeof db.userSettings === "object" ? db.userSettings : {};
  clean.userTimers = db.userTimers && typeof db.userTimers === "object" ? db.userTimers : {};
  clean.settings = {
    ...initialDb.settings,
    ...(db.settings || {})
  };
  clean.timer = {
    ...initialDb.timer,
    ...(db.timer || {})
  };
  clean.categories = Array.from(new Set([...(db.categories || []), ...CATEGORIES]));
  clean.tasks = Array.isArray(db.tasks) ? db.tasks : [];
  const fallbackOwner = clean.users.find((user) => user.role === "admin") || clean.users[0];
  if (fallbackOwner) {
    for (const task of clean.tasks) {
      if (!task.ownerId) task.ownerId = fallbackOwner.id;
    }
  }
  for (const user of clean.users) ensureUserRuntime(clean, user.id);
  clean.audit = Array.isArray(db.audit) ? db.audit.slice(-200) : [];
  return clean;
}

function normalizeUser(user) {
  if (!user || !user.id || !user.username || !user.passwordHash || !user.passwordSalt) return null;
  const role = user.role === "admin" ? "admin" : "designer";
  return {
    id: safeString(user.id, 120),
    username: normalizeUsername(user.username),
    displayName: safeString(user.displayName || user.username, 120),
    role,
    active: user.active !== false,
    passwordHash: safeString(user.passwordHash, 300),
    passwordSalt: safeString(user.passwordSalt, 120),
    mustChangePassword: Boolean(user.mustChangePassword),
    createdAt: safeString(user.createdAt, 80) || nowIso(),
    updatedAt: safeString(user.updatedAt, 80) || nowIso()
  };
}

function ensureUserRuntime(db, userId) {
  if (!userId) return;
  if (!db.userSettings[userId]) {
    db.userSettings[userId] = {
      ...initialDb.settings,
      ...(db.settings || {})
    };
  }
  if (!db.userTimers[userId]) {
    db.userTimers[userId] = {
      ...initialDb.timer,
      ...(db.timer || {}),
      activeTaskId: null,
      phase: "idle",
      reviewStartedAt: null,
      workCountdownStartedAt: null,
      breakCountdownStartedAt: null,
      breakStartedAt: null,
      plannedBreakEndAt: null,
      expectedFinishAt: null
    };
  }
}

function runtimeDbForUser(rootDb, user) {
  ensureUserRuntime(rootDb, user.id);
  const scoped = {
    ...rootDb,
    settings: rootDb.userSettings[user.id],
    timer: rootDb.userTimers[user.id],
    tasks: rootDb.tasks,
    categories: rootDb.categories,
    audit: rootDb.audit
  };
  Object.defineProperties(scoped, {
    __root: { value: rootDb },
    __ownerId: { value: user.id },
    __user: { value: user }
  });
  return scoped;
}

function rootDbOf(db) {
  return db.__root || db;
}

function replaceTasks(db, tasks) {
  db.tasks = tasks;
  const root = rootDbOf(db);
  if (root !== db) root.tasks = tasks;
}

function replaceTimer(db, timer) {
  db.timer = timer;
  const root = rootDbOf(db);
  if (db.__ownerId) root.userTimers[db.__ownerId] = timer;
  else root.timer = timer;
}

function taskBelongsToScope(db, task) {
  if (!task) return false;
  if (!db.__ownerId) return true;
  return task.ownerId === db.__ownerId;
}

function scopedTasks(db) {
  return db.__ownerId ? db.tasks.filter((task) => taskBelongsToScope(db, task)) : db.tasks;
}

function attachOwner(db, task) {
  if (db.__ownerId && !task.ownerId) task.ownerId = db.__ownerId;
  return task;
}

function normalizeUsername(value) {
  return safeString(value, 80).toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(String(password || ""), salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  if (!user || !user.passwordHash || !user.passwordSalt) return false;
  const { hash } = hashPassword(password, user.passwordSalt);
  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = Buffer.from(hash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function tokenHash(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function sessionCookieName() {
  return "dtp_session";
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function setSessionCookie(req, res, token) {
  const secure = String(req.headers["x-forwarded-proto"] || "").includes("https");
  const parts = [
    `${sessionCookieName()}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${7 * 24 * 3600}`
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${sessionCookieName()}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function safeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    active: user.active !== false,
    mustChangePassword: Boolean(user.mustChangePassword)
  };
}

function findUserByUsername(db, username) {
  const clean = normalizeUsername(username);
  return db.users.find((user) => user.username === clean) || null;
}

function createUser(db, { username, displayName, password, role = "designer", mustChangePassword = false }) {
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername) throw new Error("Enter a username.");
  if (db.users.some((user) => user.username === cleanUsername)) throw new Error("Username already exists.");
  validatePassword(password);
  const now = nowIso();
  const { salt, hash } = hashPassword(password);
  const user = {
    id: randomUUID(),
    username: cleanUsername,
    displayName: safeString(displayName || cleanUsername, 120),
    role: role === "admin" ? "admin" : "designer",
    active: true,
    passwordHash: hash,
    passwordSalt: salt,
    mustChangePassword: Boolean(mustChangePassword),
    createdAt: now,
    updatedAt: now
  };
  db.users.push(user);
  ensureUserRuntime(db, user.id);
  return user;
}

function validatePassword(password) {
  if (String(password || "").length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
}

function currentSession(db, req) {
  const token = parseCookies(req)[sessionCookieName()];
  if (!token) return null;
  const hash = tokenHash(token);
  const now = Date.now();
  db.sessions = db.sessions.filter((session) => Date.parse(session.expiresAt) > now);
  const session = db.sessions.find((item) => item.tokenHash === hash) || null;
  if (!session) return null;
  const user = db.users.find((item) => item.id === session.userId && item.active !== false) || null;
  if (!user) return null;
  return { token, session, user };
}

function createSession(db, user) {
  const token = randomBytes(32).toString("base64url");
  const session = {
    id: randomUUID(),
    userId: user.id,
    tokenHash: tokenHash(token),
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
  };
  db.sessions.push(session);
  return { token, session };
}

function requireAuthenticated(db, req, res) {
  const auth = currentSession(db, req);
  if (!auth) {
    json(res, 401, { error: "Please log in.", authenticated: false, setupRequired: db.users.length === 0 });
    return null;
  }
  return auth.user;
}

function requireAdmin(db, req, res) {
  const user = requireAuthenticated(db, req, res);
  if (!user) return null;
  if (user.role !== "admin") {
    json(res, 403, { error: "Admin access required." });
    return null;
  }
  return user;
}

async function saveDb(db) {
  db = rootDbOf(db);
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${DB_FILE}.tmp`;
    try {
      await fs.copyFile(DB_FILE, DB_BACKUP_FILE);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await fs.writeFile(tmp, `${JSON.stringify(db, null, 2)}\n`, "utf8");
    await fs.rename(tmp, DB_FILE);
  });
  await writeQueue;
}

function nowIso() {
  return new Date().toISOString();
}

function envValue(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function audit(db, action, detail = {}) {
  db.audit.push({ at: nowIso(), action, detail });
  db.audit = db.audit.slice(-200);
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function text(res, status, message) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(message);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Invalid JSON body.");
    error.statusCode = 400;
    throw error;
  }
}

function secondsSince(iso, nowMs = Date.now()) {
  if (!iso) return 0;
  const start = Date.parse(iso);
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((nowMs - start) / 1000));
}

function clampSeconds(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function parseHoursInput(input) {
  if (input === null || input === undefined) return 0;
  if (typeof input === "number") return Number.isFinite(input) ? Math.max(0, Math.round(input)) : 0;
  let txt = String(input).trim().toLowerCase();
  if (!txt) return 0;
  txt = txt.replace(",", ".");

  const hhmm = txt.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (hhmm) {
    return Number(hhmm[1]) * 3600 + Number(hhmm[2]) * 60 + Number(hhmm[3] || 0);
  }
  if (txt.includes("min")) return Math.round(parseFloat(txt) * 60);
  if (txt.includes("hour") || txt.includes("hr") || txt.endsWith("h")) {
    return Math.round(parseFloat(txt) * 3600);
  }
  if (/^\d+\.\d+$/.test(txt)) return Math.round(Number(txt) * 3600);
  if (/^\d+$/.test(txt)) return Math.round(Number(txt) * 60);
  return 0;
}

function dubaiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DUBAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const map = {};
  for (const part of parts) map[part.type] = part.value;
  return map;
}

function dubaiDateKey(date = new Date()) {
  const p = dubaiParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function normalizeMinuteOfDay(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return ((Math.floor(n) % 1440) + 1440) % 1440;
}

function plannedBreakDurationSeconds(startMinute, endMinute) {
  if (startMinute === null || endMinute === null) return 0;
  if (startMinute === endMinute) return 0;
  let diff = endMinute - startMinute;
  if (diff <= 0) diff += 1440;
  return diff * 60;
}

function formatMinuteOfDay(minute) {
  const value = normalizeMinuteOfDay(minute) || 0;
  const hour24 = Math.floor(value / 60);
  const minutes = value % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${String(hour12).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function getTask(db, id) {
  return db.tasks.find((task) => task.id === id && taskBelongsToScope(db, task)) || null;
}

function activeTask(db) {
  return db.timer.activeTaskId ? getTask(db, db.timer.activeTaskId) : null;
}

function currentWorkRemaining(timer, nowMs = Date.now()) {
  const base = clampSeconds(timer.workRemainingBaseSeconds, timer.workBudgetSeconds || 0);
  if (timer.phase === "work" && timer.workCountdownStartedAt) {
    return Math.max(0, base - secondsSince(timer.workCountdownStartedAt, nowMs));
  }
  return base;
}

function currentBreakRemaining(timer, nowMs = Date.now()) {
  const base = clampSeconds(timer.breakRemainingBaseSeconds, timer.breakBudgetSeconds || 3600);
  if (timer.phase === "break" && timer.breakCountdownStartedAt) {
    const elapsed = secondsSince(timer.breakCountdownStartedAt, nowMs);
    const planned = clampSeconds(timer.plannedBreakDurationSeconds, 0);
    const counted = planned > 0 ? Math.min(elapsed, planned) : elapsed;
    return Math.max(0, base - counted);
  }
  return base;
}

function breakSecondsUsed(timer, nowMs = Date.now()) {
  if (!timer.breakStartedAt) return 0;
  const elapsed = secondsSince(timer.breakStartedAt, nowMs);
  const planned = clampSeconds(timer.plannedBreakDurationSeconds, 0);
  return planned > 0 ? Math.min(elapsed, planned) : elapsed;
}

function setExpectedFinishFromRemainingWork(timer, nowMs = Date.now()) {
  if (!timer.expectedFinishAt || !timer.activeTaskId) return;
  const remaining = clampSeconds(timer.workRemainingBaseSeconds, 0);
  timer.expectedFinishAt = new Date(nowMs + remaining * 1000).toISOString();
}

function currentReviewElapsed(timer, nowMs = Date.now()) {
  const base = clampSeconds(timer.reviewElapsedBaseSeconds, 0);
  if (timer.phase === "review" && timer.reviewStartedAt) {
    return base + secondsSince(timer.reviewStartedAt, nowMs);
  }
  return base;
}

function derivedState(db) {
  const nowMs = Date.now();
  const timer = db.timer;
  const workRemainingSeconds = currentWorkRemaining(timer, nowMs);
  const breakRemainingSeconds = currentBreakRemaining(timer, nowMs);
  const reviewElapsedSeconds = currentReviewElapsed(timer, nowMs);
  const derivedPhase = timer.phase === "work" && workRemainingSeconds <= 0 ? "expired" : timer.phase;

  return {
    ...db,
    users: undefined,
    sessions: undefined,
    userSettings: undefined,
    userTimers: undefined,
    tasks: scopedTasks(db),
    serverNow: nowIso(),
    dubaiTimeZone: DUBAI_TZ,
    currentUser: safeUser(db.__user),
    auth: db.__user ? {
      user: safeUser(db.__user),
      isAdmin: db.__user.role === "admin"
    } : null,
    timer: {
      ...timer,
      derivedPhase,
      workRemainingSeconds,
      breakRemainingSeconds,
      reviewElapsedSeconds
    }
  };
}

function resetTimerToIdle(db, options = {}) {
  const breakRemaining = options.preserveBreak
    ? currentBreakRemaining(db.timer)
    : db.settings.breakBudgetSeconds;
  replaceTimer(db, {
    ...initialDb.timer,
    workBudgetSeconds: db.settings.workBudgetSeconds,
    workRemainingBaseSeconds: db.settings.workBudgetSeconds,
    breakBudgetSeconds: db.settings.breakBudgetSeconds,
    breakRemainingBaseSeconds: breakRemaining
  });
}

function finalizePlannedBreakIfDue(db, nowMs = Date.now()) {
  const timer = db.timer;
  if (timer.phase !== "break" || !timer.plannedBreakEndAt || Date.parse(timer.plannedBreakEndAt) > nowMs) {
    return false;
  }

  const task = activeTask(db);
  const plannedSeconds = clampSeconds(timer.plannedBreakDurationSeconds, 0);
  const countedSeconds = timer.breakStartedAt ? breakSecondsUsed(timer, nowMs) : plannedSeconds;
  const remaining = currentBreakRemaining(timer, nowMs);
  const now = new Date(nowMs).toISOString();

  if (task && !task.finishedAt && countedSeconds > 0) {
    task.breakSeconds = clampSeconds(task.breakSeconds, 0) + countedSeconds;
    task.updatedAt = now;
    setExpectedFinishFromRemainingWork(timer, nowMs);
  }

  timer.breakRemainingBaseSeconds = remaining;
  timer.breakCountdownStartedAt = null;
  timer.breakStartedAt = null;
  timer.plannedBreakEndAt = null;
  timer.plannedBreakDurationSeconds = 0;
  timer.breakWindowLabel = "";

  if (task && !task.finishedAt) {
    timer.phase = timer.workRemainingBaseSeconds > 0 ? "work" : "expired";
    timer.workCountdownStartedAt = timer.phase === "work" ? now : null;
  } else {
    timer.phase = "idle";
    timer.activeTaskId = null;
    timer.workCountdownStartedAt = null;
    timer.expectedFinishAt = null;
  }

  audit(db, "timer.plannedBreakFinished", { activeTaskId: timer.activeTaskId, countedSeconds });
  return true;
}

function finalizeTaskPause(task, now = nowIso()) {
  if (!task || !task.pauseStartedAt) return 0;
  const pausedSeconds = secondsSince(task.pauseStartedAt, Date.parse(now));
  task.pauseSeconds = clampSeconds(task.pauseSeconds, 0) + pausedSeconds;
  task.pauseStartedAt = null;
  task.updatedAt = now;
  return pausedSeconds;
}

function parkActiveTask(db, now = nowIso()) {
  const task = activeTask(db);
  if (!task || task.finishedAt) return null;

  if (db.timer.phase === "break" && db.timer.breakStartedAt) {
    const elapsed = secondsSince(db.timer.breakStartedAt, Date.parse(now));
    const planned = clampSeconds(db.timer.plannedBreakDurationSeconds, 0);
    task.breakSeconds = clampSeconds(task.breakSeconds, 0) + (planned > 0 ? Math.min(elapsed, planned) : elapsed);
  }

  task.workRemainingSeconds = currentWorkRemaining(db.timer, Date.parse(now));
  task.workBudgetSeconds = clampSeconds(db.timer.workBudgetSeconds, db.settings.workBudgetSeconds);
  if (!task.pauseStartedAt) task.pauseStartedAt = now;
  task.updatedAt = now;
  audit(db, "task.park", { id: task.id, workRemainingSeconds: task.workRemainingSeconds });
  return task;
}

function hasTaskOnDubaiDate(db, dateKey = dubaiDateKey(new Date())) {
  return db.tasks.some((task) => task.dateWorked === dateKey && taskBelongsToScope(db, task));
}

function stripParens(s) {
  return String(s || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

function extractJobCode(s) {
  const match = String(s || "").match(/DTP\d{7}/i);
  return match ? match[0].toUpperCase() : "";
}

function extractFirstNumber(s) {
  const match = String(s || "").match(/\d+/);
  return match ? match[0] : "";
}

function extractSlidesNumber(s, jobCode = "") {
  const text = String(s || "");
  const slideMatch = text.match(/\b(\d+)\s*(slides?|sld|slide)\b/i);
  if (slideMatch) return slideMatch[1];
  const last7 = jobCode.length === 10 ? jobCode.slice(3) : "";
  const nums = text.match(/\b\d+\b/g) || [];
  return nums.find((n) => n !== last7) || "";
}

function isDowToken(token) {
  return /^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)/i.test(token);
}

function cleanDayToken(token) {
  const t = String(token || "").toUpperCase();
  if (t.startsWith("MON")) return "MON";
  if (t.startsWith("TUE")) return "TUE";
  if (t.startsWith("WED")) return "WED";
  if (t.startsWith("THU")) return "THU";
  if (t.startsWith("FRI")) return "FRI";
  if (t.startsWith("SAT")) return "SAT";
  if (t.startsWith("SUN")) return "SUN";
  return "";
}

function extractClientAfterCode(s, jobCode) {
  let cleaned = stripParens(s);
  if (jobCode) cleaned = cleaned.replace(new RegExp(jobCode, "i"), " ");
  cleaned = cleaned.replace(/\b\d+\s*(slides?|sld|slide)\b/gi, " ");
  const tokens = cleaned.split(/\s+/).map((t) => t.replace(/[^A-Za-z-]/g, "")).filter(Boolean);
  for (const token of tokens) {
    if (isDowToken(token)) continue;
    if (/^(am|pm|slides?|sld|slide)$/i.test(token)) continue;
    return token;
  }
  return "";
}

function normalizeHHMM(digits) {
  const raw = String(digits || "");
  if (raw.length === 3) return `${Number(raw.slice(0, 1))}:${raw.slice(1)}`;
  if (raw.length === 4) return `${Number(raw.slice(0, 2))}:${raw.slice(2)}`;
  return raw;
}

function cleanTimePiece(hour, minute, ap) {
  const h = Number(hour);
  const suffix = String(ap || "").toUpperCase();
  const mm = String(minute || "");
  if (!mm || mm === "00") return `${h}${suffix}`;
  return `${h}:${mm.padStart(2, "0")}${suffix}`;
}

function cleanDeadlineText(input) {
  const txt = stripParens(input);
  if (!txt) return "";

  const withDay = txt.match(/\b(Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)\b[^\dA-Za-z]*((\d{1,2})(?::(\d{2}))?|(\d{3,4}))\s*(AM|PM)\b/i);
  if (withDay) {
    const day = cleanDayToken(withDay[1]);
    const ap = withDay[6].toUpperCase();
    if (withDay[5]) return `${day} ${normalizeHHMM(withDay[5])}${ap}`;
    return `${day} ${cleanTimePiece(withDay[3], withDay[4], ap)}`;
  }

  const timeOnly = txt.match(/\b((\d{1,2})(?::(\d{2}))?|(\d{3,4}))\s*(AM|PM)\b/i);
  if (timeOnly) {
    const ap = timeOnly[5].toUpperCase();
    if (timeOnly[4]) return `${normalizeHHMM(timeOnly[4])}${ap}`;
    return cleanTimePiece(timeOnly[2], timeOnly[3], ap);
  }

  return txt.toUpperCase();
}

function extractDeadlineLike(input) {
  const txt = stripParens(input);
  const withDay = txt.match(/\b(Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)\b[^\dA-Za-z]*((\d{1,2})(:\d{2})?|(\d{3,4}))\s*(AM|PM)\b/i);
  if (withDay) return withDay[0];
  const timeOnly = txt.match(/\b((\d{1,2})(:\d{2})?|(\d{3,4}))\s*(AM|PM)\b/i);
  return timeOnly ? timeOnly[0] : "";
}

function cleanJobCode(s) {
  return extractJobCode(s) || String(s || "").trim().toUpperCase();
}

function parseJobInput(raw) {
  const textValue = String(raw || "").trim();
  const parsed = {
    requestNo: "",
    client: "",
    slides: "",
    deadlineText: ""
  };

  if (textValue.includes("/")) {
    const parts = textValue.split("/").map((part) => part.trim());
    parsed.requestNo = cleanJobCode(parts[0] || "");
    parsed.client = parts[1] || "";
    parsed.slides = extractFirstNumber(parts[2] || "");
    parsed.deadlineText = cleanDeadlineText(parts.slice(3).join(" ") || "");
    return parsed;
  }

  parsed.requestNo = extractJobCode(textValue) || textValue;
  parsed.client = extractClientAfterCode(textValue, parsed.requestNo);
  parsed.slides = extractSlidesNumber(textValue, parsed.requestNo);
  parsed.deadlineText = cleanDeadlineText(extractDeadlineLike(textValue));
  return parsed;
}

function normalizeImportHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function importFieldForHeader(value) {
  const header = normalizeImportHeader(value);
  if (header === "dateworked" || header === "date") return "dateWorked";
  if (header === "request" || header === "requestno" || header === "requestnumber") return "requestNo";
  if (["workedhours", "hoursworked", "workedhrs", "hrworked", "nohoursworked", "ofhoursworked"].includes(header)) return "workedHours";
  if (["workedmins", "workedminutes", "minsworked", "minutesworked"].includes(header)) return "workedMinutes";
  if (["ofslides", "slides", "slide", "ofsldies", "sldies"].includes(header)) return "slides";
  if (header === "categoryofwork" || header === "category") return "category";
  if (header === "relevantclient" || header === "client") return "client";
  return null;
}

function parseImportedRows(filename, buffer) {
  const ext = path.extname(filename || "").toLowerCase();
  let rows;
  if ([".xlsx", ".xlsm"].includes(ext)) {
    rows = parseWorkbookRows(buffer);
  } else if (ext === ".docx") {
    rows = parseDocxRows(buffer);
  } else {
    const textValue = buffer.toString("utf8").replace(/^\uFEFF/, "");
    rows = ext === ".html" || ext === ".htm" || /<table[\s>]/i.test(textValue)
      ? parseHtmlRows(textValue)
      : parseDelimitedRows(textValue);
  }
  return rowsToImportedTasks(rows, filename);
}

function rowsToImportedTasks(rows, filename) {
  const headerInfo = findImportHeader(rows);
  if (!headerInfo) {
    throw new Error("Import failed: required columns were not found. Need Date worked, Request #, Worked hours, # of slides, Category of work, and Relevant Client.");
  }

  const now = nowIso();
  const dateContext = extractImportDateContext(filename);
  const imported = [];
  for (let r = headerInfo.index + 1; r < rows.length; r += 1) {
    const row = rows[r] || [];
    const get = (field) => {
      const index = headerInfo.columns[field];
      return index === undefined ? "" : safeString(row[index], 300);
    };
    const dateWorked = parseImportDate(get("dateWorked"), dateContext);
    const requestNo = cleanJobCode(get("requestNo"));
    const durationSeconds = parseImportDuration(get("workedHours")) || parseImportMinutes(get("workedMinutes"));
    const slides = safeString(get("slides"), 20);
    const category = safeString(get("category"), 120);
    const client = safeString(get("client"), 120);
    if (!dateWorked || (!requestNo && !client && !durationSeconds)) continue;

    imported.push({
      id: randomUUID(),
      dateWorked,
      requestNo,
      slides,
      category,
      client,
      deadlineText: "",
      startAt: null,
      finishedAt: null,
      breakSeconds: 0,
      pauseSeconds: 0,
      pauseStartedAt: null,
      importedDurationSeconds: durationSeconds || 0,
      imported: true,
      notes: "",
      rawJob: `Imported from ${filename}`,
      createdAt: now,
      updatedAt: now
    });
  }
  return imported;
}

function findImportHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 40); r += 1) {
    const columns = {};
    for (let c = 0; c < (rows[r] || []).length; c += 1) {
      const field = importFieldForHeader(rows[r][c]);
      if (field && columns[field] === undefined) columns[field] = c;
    }
    const requiredScore = ["dateWorked", "requestNo", "workedHours", "slides", "category", "client"]
      .filter((field) => columns[field] !== undefined).length;
    if (requiredScore >= 5 && columns.dateWorked !== undefined && columns.requestNo !== undefined) {
      return { index: r, columns };
    }
  }
  return null;
}

function parseDelimitedRows(textValue) {
  const lines = String(textValue || "").split(/\r?\n/).filter((line) => line.trim() !== "");
  const sample = lines.slice(0, 5).join("\n");
  const delimiter = (sample.match(/\t/g) || []).length > (sample.match(/,/g) || []).length ? "\t" : ",";
  return lines.map((line) => splitDelimitedLine(line, delimiter));
}

function splitDelimitedLine(line, delimiter) {
  const cells = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (quoted && line[i + 1] === "\"") {
        cur += "\"";
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function parseHtmlRows(textValue) {
  const rows = [];
  const rowMatches = String(textValue || "").match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const rowXml of rowMatches) {
    const cells = [];
    const cellMatches = rowXml.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
    for (const cellXml of cellMatches) {
      cells.push(decodeXml(cellXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()));
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function parseWorkbookRows(buffer) {
  const files = readZip(buffer);
  const entryName = (file) => String(file.name || "").replace(/\\/g, "/");
  const sharedStrings = parseSharedStrings(files.find((file) => entryName(file) === "xl/sharedStrings.xml")?.data.toString("utf8") || "");
  const sheetFiles = files
    .filter((file) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entryName(file)))
    .sort((a, b) => entryName(a).localeCompare(entryName(b)));
  const rows = [];
  for (const sheet of sheetFiles) {
    rows.push(...parseWorksheetRows(sheet.data.toString("utf8"), sharedStrings));
  }
  return rows;
}

function parseDocxRows(buffer) {
  const files = readZip(buffer);
  const entryName = (file) => String(file.name || "").replace(/\\/g, "/");
  const document = files.find((file) => entryName(file) === "word/document.xml");
  if (!document) throw new Error("Import failed: the Word document content was not found.");

  const rows = [];
  const xml = document.data.toString("utf8");
  const tableMatches = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/g) || [];
  for (const tableXml of tableMatches) {
    const rowMatches = tableXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
    for (const rowXml of rowMatches) {
      const cellMatches = rowXml.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
      const row = cellMatches.map(docxCellText);
      if (row.some((cell) => String(cell || "").trim() !== "")) rows.push(row);
    }
  }
  return rows;
}

function docxCellText(cellXml) {
  const pieces = [];
  const tokenMatches = String(cellXml || "").match(/<w:t\b[^>]*>[\s\S]*?<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g) || [];
  for (const token of tokenMatches) {
    if (/^<w:tab\b/i.test(token) || /^<w:br\b/i.test(token)) {
      pieces.push(" ");
      continue;
    }
    const text = (token.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/i) || [])[1] || "";
    pieces.push(decodeXml(text));
  }
  return pieces.join("").replace(/\s+/g, " ").trim();
}

function parseSharedStrings(xml) {
  const strings = [];
  const items = String(xml || "").match(/<si[\s\S]*?<\/si>/g) || [];
  for (const item of items) {
    const pieces = [...item.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1]));
    strings.push(pieces.join(""));
  }
  return strings;
}

function parseWorksheetRows(xml, sharedStrings) {
  const rows = [];
  const rowMatches = String(xml || "").match(/<row\b[\s\S]*?<\/row>/g) || [];
  for (const rowXml of rowMatches) {
    const row = [];
    const cellMatches = rowXml.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || [];
    for (const cellXml of cellMatches) {
      const ref = (cellXml.match(/\br="([A-Z]+)\d+"/i) || [])[1] || "";
      const col = ref ? columnNameToIndex(ref) : row.length;
      const type = (cellXml.match(/\bt="([^"]+)"/i) || [])[1] || "";
      const raw = (cellXml.match(/<v[^>]*>([\s\S]*?)<\/v>/) || [])[1];
      const inline = (cellXml.match(/<is[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/) || [])[1];
      let value = "";
      if (type === "s" && raw !== undefined) value = sharedStrings[Number(raw)] || "";
      else if (inline !== undefined) value = decodeXml(inline);
      else if (raw !== undefined) value = decodeXml(raw);
      row[col] = value;
    }
    if (row.some((cell) => String(cell || "").trim() !== "")) rows.push(row.map((cell) => cell || ""));
  }
  return rows;
}

function columnNameToIndex(name) {
  let index = 0;
  for (const ch of String(name || "").toUpperCase()) {
    index = index * 26 + (ch.charCodeAt(0) - 64);
  }
  return Math.max(0, index - 1);
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseImportDate(value, context = {}) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d+(\.\d+)?$/.test(raw)) return excelSerialToDateKey(Number(raw));
  const iso = raw.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  const slash = raw.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (slash) {
    const year = normalizeImportYear(slash[3], context.year);
    return `${year}-${String(slash[1]).padStart(2, "0")}-${String(slash[2]).padStart(2, "0")}`;
  }
  const monthText = raw.match(/\b(\d{1,2})[-\s]([A-Za-z]{3,})(?:[-\s](\d{2,4}))?\b/);
  if (monthText) {
    const month = monthNameToNumber(monthText[2]);
    if (month) {
      const year = inferImportYear(monthText[3], month, context);
      return `${year}-${String(month).padStart(2, "0")}-${String(monthText[1]).padStart(2, "0")}`;
    }
  }
  return "";
}

function parseTaskDateWorked(value) {
  const p = dubaiParts(new Date());
  const parsed = parseImportDate(value, { year: p.year, month: Number(p.month) });
  if (!parsed) return "";
  const dt = new Date(`${parsed}T00:00:00Z`);
  return Number.isNaN(dt.valueOf()) ? "" : parsed;
}

function normalizeImportYear(value, defaultYear = "") {
  if (!value) return defaultYear || dubaiParts(new Date()).year;
  const year = Number(value);
  if (year < 100) return String(2000 + year);
  return String(year);
}

function inferImportYear(explicitYear, rowMonth, context = {}) {
  if (explicitYear) return normalizeImportYear(explicitYear, context.year);
  if (context.year && context.month && rowMonth > context.month) {
    return String(Number(context.year) - 1);
  }
  return normalizeImportYear("", context.year);
}

function extractImportDateContext(filename) {
  const text = String(filename || "");
  const yearMatch = text.match(/(20\d{2})/);
  const year = yearMatch ? yearMatch[1] : "";
  const monthMatch = text.match(/(?:^|[^A-Za-z])(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)(?=[^A-Za-z]|$)/i);
  const month = monthMatch ? monthNameToNumber(monthMatch[1]) : 0;
  return { year, month };
}

function monthNameToNumber(value) {
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const index = months.findIndex((month) => String(value || "").toLowerCase().startsWith(month));
  return index >= 0 ? index + 1 : 0;
}

function excelSerialToDateKey(serial) {
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.floor(serial) * 86400000);
  return date.toISOString().slice(0, 10);
}

function parseImportDuration(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "--") return 0;
  const hms = raw.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3] || 0);
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    if (numeric > 0 && numeric < 2) return Math.round(numeric * 86400);
    return Math.round(numeric * 60);
  }
  const hourMin = raw.match(/(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?/i);
  if (hourMin && (hourMin[1] || hourMin[2])) {
    return Math.round(Number(hourMin[1] || 0) * 3600 + Number(hourMin[2] || 0) * 60);
  }
  return 0;
}

function parseImportMinutes(value) {
  const n = Number(String(value || "").trim());
  return Number.isFinite(n) ? Math.round(n * 60) : 0;
}

function parseEditedDuration(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "--") return null;

  const hms = raw.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3] || 0);

  const minuteOnly = raw.match(/^(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)$/i);
  if (minuteOnly) return Math.round(Number(minuteOnly[1]) * 60);

  const hourMin = raw.match(/^(?:(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes))?$/i);
  if (hourMin && (hourMin[1] || hourMin[2])) {
    return Math.round(Number(hourMin[1] || 0) * 3600 + Number(hourMin[2] || 0) * 60);
  }

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return Math.round(numeric * (raw.includes(".") ? 3600 : 60));
  }

  return null;
}

function taskDurationSeconds(task) {
  const breakSeconds = clampSeconds(task.breakSeconds, 0);
  const pauseSeconds = clampSeconds(task.pauseSeconds, 0);
  if (Number.isFinite(Number(task.manualDurationSeconds))) {
    const base = clampSeconds(task.manualDurationSeconds, 0);
    return task.durationIncludesBreak ? Math.max(0, base - breakSeconds - pauseSeconds) : base;
  }
  if (Number.isFinite(Number(task.importedDurationSeconds))) {
    const base = clampSeconds(task.importedDurationSeconds, 0);
    return task.durationIncludesBreak ? Math.max(0, base - breakSeconds - pauseSeconds) : base;
  }
  if (!task.startAt || !task.finishedAt) return null;
  const raw = Math.floor((Date.parse(task.finishedAt) - Date.parse(task.startAt)) / 1000);
  return Math.max(0, raw - breakSeconds - pauseSeconds);
}

function taskImportKey(task) {
  return [
    task.dateWorked || "",
    cleanJobCode(task.requestNo || ""),
    clampSeconds(taskDurationSeconds(task), 0),
    safeString(task.slides, 20),
    safeString(task.category, 120).toLowerCase(),
    safeString(task.client, 120).toLowerCase()
  ].join("|");
}

function dedupeImportedTasks(db) {
  const seen = new Set();
  const kept = [];
  let removed = 0;
  for (const task of db.tasks) {
    if (!taskBelongsToScope(db, task)) {
      kept.push(task);
      continue;
    }
    if (!task.imported) {
      kept.push(task);
      continue;
    }
    const key = taskImportKey(task);
    if (seen.has(key)) {
      removed += 1;
      continue;
    }
    seen.add(key);
    kept.push(task);
  }
  if (removed) replaceTasks(db, kept);
  return removed;
}

function serializeTask(task) {
  return {
    ...task,
    durationSeconds: taskDurationSeconds(task)
  };
}

function serializeForClient(db) {
  const state = derivedState(db);
  return {
    ...state,
    tasks: state.tasks.map(serializeTask)
  };
}

function safeString(value, max = 500) {
  return String(value ?? "").slice(0, max).trim();
}

function applyTaskPatch(task, patch) {
  const editable = ["requestNo", "client", "slides", "category", "deadlineText"];
  for (const key of editable) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      task[key] = safeString(patch[key], 120);
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "dateWorked")) {
    const dateWorked = parseTaskDateWorked(patch.dateWorked);
    if (!dateWorked) {
      throw new Error("Enter Date worked as YYYY-MM-DD, mm/dd/yyyy, or 8-May.");
    }
    task.dateWorked = dateWorked;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "workedHours")) {
    const durationSeconds = parseEditedDuration(patch.workedHours);
    if (durationSeconds === null) {
      throw new Error("Enter worked hours like 01:06, 66, 66min, or 1.5h.");
    }
    task.manualDurationSeconds = clampSeconds(durationSeconds, 0) + clampSeconds(task.breakSeconds, 0) + clampSeconds(task.pauseSeconds, 0);
    task.durationIncludesBreak = true;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "breakSeconds")) {
    const breakSeconds = parseEditedDuration(patch.breakSeconds);
    if (breakSeconds === null) {
      throw new Error("Enter break like 00:05, 5, 5min, or 0.5h.");
    }
    task.breakSeconds = clampSeconds(breakSeconds, 0);
    if (Number.isFinite(Number(task.manualDurationSeconds)) || Number.isFinite(Number(task.importedDurationSeconds))) {
      task.durationIncludesBreak = true;
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "startAt") && patch.startAt) {
    const dt = new Date(patch.startAt);
    if (!Number.isNaN(dt.valueOf())) task.startAt = dt.toISOString();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "finishedAt")) {
    if (!patch.finishedAt) {
      task.finishedAt = null;
    } else {
      const dt = new Date(patch.finishedAt);
      if (!Number.isNaN(dt.valueOf())) task.finishedAt = dt.toISOString();
    }
  }
  task.requestNo = cleanJobCode(task.requestNo);
  task.deadlineText = cleanDeadlineText(task.deadlineText);
  task.updatedAt = nowIso();
}

function ensureCategory(db, category) {
  const clean = safeString(category, 120);
  if (!clean) return;
  if (!db.categories.some((item) => item.toLowerCase() === clean.toLowerCase())) {
    db.categories.push(clean);
  }
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripDocxText(value) {
  return safeString(value, 160);
}

function formatDocxDuration(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const totalMin = Math.round(sec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function buildDocxParagraph(text, { bold = false, size = 20, align = null } = {}) {
  const jc = align ? `<w:jc w:val="${align}"/>` : "";
  const pPr = jc ? `<w:pPr>${jc}</w:pPr>` : "";
  return `<w:p>${pPr}${buildDocxRun(text, { bold, size })}</w:p>`;
}

function buildDocxRun(text, { bold = false, size = 20 } = {}) {
  const b = bold ? "<w:b/>" : "";
  const pieces = String(text ?? "").split("\n").map((part, index) => {
    const br = index ? "<w:br/>" : "";
    return `${br}<w:t xml:space="preserve">${xmlEscape(part)}</w:t>`;
  }).join("");
  return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Arial" w:hAnsi="Arial" w:cs="Arial"/>${b}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>${pieces}</w:r>`;
}

function buildNameIdParagraph(name, timekeeperId) {
  return buildDocxParagraph(`NAME: ${name}\nFTI TimeKeeper ID: ${timekeeperId}`, { size: 20 });
}

function buildTimesheetTableXml(rows) {
  const widths = [1200, 1500, 1100, 1050, 1800, 2500];
  const headers = ["Date\nworked", "Request #", "# of\nhours\nworked", "# of slides", "Category of work", "Relevant Client"];
  const dataRows = rows.map((row) => tableRowXml([
    stripDocxText(row.dateWorked),
    stripDocxText(row.requestNo),
    stripDocxText(row.workedHours),
    stripDocxText(row.slides),
    stripDocxText(row.category),
    stripDocxText(row.client)
  ], widths));
  const totalSeconds = rows.reduce((sum, row) => sum + (Number(row.durationSeconds) || 0), 0);
  const totalRow = tableRowXml(["Total", "", formatDocxDuration(totalSeconds), "", "", ""], widths, { bold: true, shade: "D9D9D9" });
  const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
  return `<w:tbl>
    <w:tblPr>
      <w:tblStyle w:val="a0"/>
      <w:tblW w:w="9165" w:type="dxa"/>
      <w:tblInd w:w="-108" w:type="dxa"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>${grid}</w:tblGrid>
    ${tableRowXml(headers, widths, { bold: true })}
    ${dataRows.join("")}
    ${totalRow}
  </w:tbl>`;
}

function tableRowXml(values, widths, options = {}) {
  return `<w:tr>${values.map((value, index) => tableCellXml(value, widths[index], options)).join("")}</w:tr>`;
}

function tableCellXml(value, width, { bold = false, shade = null } = {}) {
  const fill = shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : "";
  return `<w:tc>
    <w:tcPr>
      <w:tcW w:w="${width}" w:type="dxa"/>
      ${fill}
      <w:tcMar>
        <w:top w:w="35" w:type="dxa"/>
        <w:left w:w="45" w:type="dxa"/>
        <w:bottom w:w="35" w:type="dxa"/>
        <w:right w:w="45" w:type="dxa"/>
      </w:tcMar>
      <w:vAlign w:val="center"/>
    </w:tcPr>
    ${buildDocxParagraph(value, { bold, size: 18, align: "center" })}
  </w:tc>`;
}

function replaceTimesheetTable(documentXml, rows) {
  const tables = [...documentXml.matchAll(/<w:tbl[\s\S]*?<\/w:tbl>/g)];
  const target = tables.find((match) => match[0].includes("# of hours worked") && match[0].includes("Relevant Client"));
  if (!target) throw new Error("Timesheet table was not found in the template.");
  return documentXml.slice(0, target.index) + buildTimesheetTableXml(rows) + documentXml.slice(target.index + target[0].length);
}

function replaceTemplateDetails(documentXml, { name, timekeeperId, reportDate }) {
  let xml = documentXml.replace(/14\/08\/2025/g, xmlEscape(reportDate));
  xml = xml.replace(/<w:p\b(?=[^>]*>)(?:(?!<\/w:p>)[\s\S])*?NAME:\s*(?:(?!<\/w:p>)[\s\S])*?FTI TimeKeeper ID:\s*(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/, buildNameIdParagraph(name, timekeeperId));
  return xml;
}

async function buildTimesheetFromTemplate({ name, timekeeperId, reportDate, rows }) {
  const template = await fs.readFile(TEMPLATE_FILE);
  const files = readZip(template);
  const documentEntry = files.find((file) => file.name === "word/document.xml");
  if (!documentEntry) throw new Error("word/document.xml was not found in the template.");
  let documentXml = documentEntry.data.toString("utf8");
  documentXml = replaceTemplateDetails(documentXml, { name, timekeeperId, reportDate });
  documentXml = replaceTimesheetTable(documentXml, rows);
  documentEntry.data = Buffer.from(documentXml, "utf8");
  return writeZip(files);
}

function readZip(buffer) {
  const eocdOffset = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocdOffset < 0) throw new Error("Invalid DOCX zip: end record not found.");
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const files = [];
  let ptr = centralOffset;
  for (let i = 0; i < totalEntries; i += 1) {
    if (buffer.readUInt32LE(ptr) !== 0x02014b50) throw new Error("Invalid DOCX zip: central directory is corrupt.");
    const method = buffer.readUInt16LE(ptr + 10);
    const crc = buffer.readUInt32LE(ptr + 16);
    const compressedSize = buffer.readUInt32LE(ptr + 20);
    const uncompressedSize = buffer.readUInt32LE(ptr + 24);
    const nameLength = buffer.readUInt16LE(ptr + 28);
    const extraLength = buffer.readUInt16LE(ptr + 30);
    const commentLength = buffer.readUInt16LE(ptr + 32);
    const localOffset = buffer.readUInt32LE(ptr + 42);
    const name = buffer.slice(ptr + 46, ptr + 46 + nameLength).toString("utf8");

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = zlib.inflateRawSync(compressed);
    else throw new Error(`Unsupported DOCX compression method: ${method}`);
    if (data.length !== uncompressedSize) throw new Error(`DOCX entry size mismatch: ${name}`);
    files.push({ name, data, crc });
    ptr += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function writeZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const nameBuffer = Buffer.from(file.name, "utf8");
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const crc = crc32(data);
    const localHeader = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc),
      u32(data.length), u32(data.length), u16(nameBuffer.length), u16(0), nameBuffer
    ]);
    localParts.push(localHeader, data);
    centralParts.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc),
      u32(data.length), u32(data.length), u16(nameBuffer.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), nameBuffer
    ]));
    offset += localHeader.length + data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralSize), u32(offset), u16(0)
  ]);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

function serviceNowConfigStatus() {
  const missing = [];
  if (!SERVICE_NOW_ENV.instanceUrl) missing.push("SERVICENOW_INSTANCE_URL");
  if (!SERVICE_NOW_ENV.requestTable) missing.push("SERVICENOW_REQUEST_TABLE");
  if (!SERVICE_NOW_ENV.bearerToken && !SERVICE_NOW_ENV.cookie && !(SERVICE_NOW_ENV.username && SERVICE_NOW_ENV.password)) {
    missing.push("SERVICENOW_USER/SERVICENOW_PASSWORD or SERVICENOW_BEARER_TOKEN");
  }

  const warnings = [];
  if (!SERVICE_NOW_ENV.reportingTable || !SERVICE_NOW_ENV.reportingParentField) {
    warnings.push("Production minutes validation is skipped until SERVICENOW_REPORTING_TABLE and SERVICENOW_REPORTING_PARENT_FIELD are set.");
  }

  return {
    configured: missing.length === 0,
    missing,
    warnings,
    requestTable: Boolean(SERVICE_NOW_ENV.requestTable),
    reportingTable: Boolean(SERVICE_NOW_ENV.reportingTable && SERVICE_NOW_ENV.reportingParentField)
  };
}

function serviceNowBaseUrl() {
  return SERVICE_NOW_ENV.instanceUrl.replace(/\/+$/, "");
}

function serviceNowHeaders() {
  const headers = {
    accept: "application/json"
  };
  if (SERVICE_NOW_ENV.bearerToken) {
    headers.authorization = `Bearer ${SERVICE_NOW_ENV.bearerToken}`;
  } else if (SERVICE_NOW_ENV.cookie) {
    headers.cookie = SERVICE_NOW_ENV.cookie;
  } else {
    const token = Buffer.from(`${SERVICE_NOW_ENV.username}:${SERVICE_NOW_ENV.password}`).toString("base64");
    headers.authorization = `Basic ${token}`;
  }
  return headers;
}

function serviceNowTableUrl(table, params = {}) {
  const url = new URL(`${serviceNowBaseUrl()}/api/now/table/${encodeURIComponent(table)}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function serviceNowGetTable(table, params = {}) {
  const response = await fetch(serviceNowTableUrl(table, params), {
    method: "GET",
    headers: serviceNowHeaders()
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error?.message || payload.error?.detail || `ServiceNow request failed (${response.status})`;
    throw new Error(message);
  }
  return Array.isArray(payload.result) ? payload.result : [];
}

function snEncodedEquals(field, value) {
  return `${field}=${String(value ?? "").replace(/\^/g, " ")}`;
}

function snAppendQuery(base, extra) {
  const cleanBase = String(base || "").replace(/\^+$/g, "");
  const cleanExtra = String(extra || "").replace(/^\^+/g, "");
  return [cleanBase, cleanExtra].filter(Boolean).join("^");
}

function serviceNowFieldValue(record, field) {
  if (!record || !field) return "";
  const value = record[field];
  if (value && typeof value === "object") {
    return safeString(value.display_value || value.value || "", 300);
  }
  return safeString(value, 300);
}

function parseWholeNumberValue(value) {
  const textValue = safeString(value, 80).replace(/,/g, "");
  if (!textValue || /^--+$/.test(textValue)) return null;
  const match = textValue.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function serviceNowCategoryValue(record) {
  return serviceNowFieldValue(record, SERVICE_NOW_ENV.categoryField).replace(/\s+/g, " ").trim();
}

function visibleRowRequest(row) {
  return cleanJobCode(row.requestNo || row.request || row.number || "");
}

function trackerMinutesValue(task) {
  const seconds = taskDurationSeconds(task);
  if (seconds === null || seconds === undefined) return null;
  return Math.round(Math.max(0, Number(seconds) || 0) / 60);
}

async function fetchServiceNowRequest(requestNo) {
  const fields = [
    "sys_id",
    SERVICE_NOW_ENV.numberField,
    SERVICE_NOW_ENV.categoryField,
    SERVICE_NOW_ENV.slidesField
  ].filter(Boolean).join(",");
  const query = snAppendQuery(snEncodedEquals(SERVICE_NOW_ENV.numberField, requestNo), SERVICE_NOW_ENV.requestQueryExtra);
  const rows = await serviceNowGetTable(SERVICE_NOW_ENV.requestTable, {
    sysparm_query: query,
    sysparm_fields: fields,
    sysparm_limit: 1,
    sysparm_display_value: "all",
    sysparm_exclude_reference_link: "true"
  });
  return rows[0] || null;
}

async function fetchServiceNowProductionMinutes(requestNo, requestRecord) {
  if (!SERVICE_NOW_ENV.reportingTable || !SERVICE_NOW_ENV.reportingParentField) {
    return { configured: false, minutes: null, count: 0 };
  }

  const parentValue = SERVICE_NOW_ENV.reportingParentMode === "number"
    ? requestNo
    : serviceNowFieldValue(requestRecord, "sys_id");
  if (!parentValue) return { configured: true, minutes: null, count: 0 };

  const fields = [
    SERVICE_NOW_ENV.reportingParentField,
    SERVICE_NOW_ENV.reportingProductionField,
    SERVICE_NOW_ENV.reportingMinutesField
  ].filter(Boolean).join(",");
  const productionPart = SERVICE_NOW_ENV.productionName && SERVICE_NOW_ENV.reportingProductionField
    ? `${SERVICE_NOW_ENV.reportingProductionField}LIKE${SERVICE_NOW_ENV.productionName.replace(/\^/g, " ")}`
    : "";
  const query = snAppendQuery(
    [snEncodedEquals(SERVICE_NOW_ENV.reportingParentField, parentValue), productionPart].filter(Boolean).join("^"),
    SERVICE_NOW_ENV.reportingQueryExtra
  );
  const rows = await serviceNowGetTable(SERVICE_NOW_ENV.reportingTable, {
    sysparm_query: query,
    sysparm_fields: fields,
    sysparm_limit: 20,
    sysparm_display_value: "all",
    sysparm_exclude_reference_link: "true"
  });

  let total = 0;
  let count = 0;
  for (const row of rows) {
    const production = serviceNowFieldValue(row, SERVICE_NOW_ENV.reportingProductionField).toLowerCase();
    if (SERVICE_NOW_ENV.productionName && production && !production.includes(SERVICE_NOW_ENV.productionName.toLowerCase())) {
      continue;
    }
    const minutes = parseWholeNumberValue(serviceNowFieldValue(row, SERVICE_NOW_ENV.reportingMinutesField));
    if (minutes === null) continue;
    total += minutes;
    count += 1;
  }

  return { configured: true, minutes: count ? total : null, count };
}

async function validateOneServiceNowRow(db, inputRow) {
  const id = safeString(inputRow.id, 120);
  const task = getTask(db, id);
  const requestNo = visibleRowRequest(inputRow);
  const result = {
    id,
    requestNo,
    status: "pending",
    tracker: {
      category: task?.category || "",
      slides: task?.slides || "",
      minutes: task ? trackerMinutesValue(task) : null
    },
    serviceNow: {
      category: "",
      slides: null,
      minutes: null,
      minuteRows: 0
    },
    categoryUpdated: false,
    slidesMismatch: false,
    minutesMismatch: false,
    messages: []
  };

  if (!task) {
    result.status = "missing-tracker-row";
    result.messages.push("Tracker row no longer exists.");
    return result;
  }
  if (!requestNo) {
    result.status = "missing-request";
    result.messages.push("No Request # to search.");
    return result;
  }

  const requestRecord = await fetchServiceNowRequest(requestNo);
  if (!requestRecord) {
    result.status = "not-found";
    result.messages.push("Request was not found in the configured ServiceNow request table.");
    return result;
  }

  result.status = "matched";
  result.serviceNow.category = serviceNowCategoryValue(requestRecord);
  result.serviceNow.slides = parseWholeNumberValue(serviceNowFieldValue(requestRecord, SERVICE_NOW_ENV.slidesField));

  const trackerSlides = parseWholeNumberValue(task.slides);
  if (trackerSlides !== null && result.serviceNow.slides !== null && trackerSlides !== result.serviceNow.slides) {
    result.slidesMismatch = true;
    result.messages.push(`Slides mismatch: tracker ${trackerSlides}, ServiceNow ${result.serviceNow.slides}.`);
  }

  const serviceNowMinutes = await fetchServiceNowProductionMinutes(requestNo, requestRecord);
  result.serviceNow.minutes = serviceNowMinutes.minutes;
  result.serviceNow.minuteRows = serviceNowMinutes.count;
  if (!serviceNowMinutes.configured) {
    result.messages.push("Production minutes lookup is not configured.");
  } else if (result.tracker.minutes !== null && result.serviceNow.minutes !== null && result.tracker.minutes !== result.serviceNow.minutes) {
    result.minutesMismatch = true;
    result.messages.push(`Minutes mismatch: tracker ${result.tracker.minutes}, ServiceNow ${result.serviceNow.minutes}.`);
  }

  const category = result.serviceNow.category;
  if (category && category.toLowerCase() !== safeString(task.category, 120).toLowerCase()) {
    task.category = safeString(category, 120);
    ensureCategory(db, task.category);
    task.updatedAt = nowIso();
    result.categoryUpdated = true;
    result.tracker.category = task.category;
    result.messages.push(`Category updated to "${task.category}".`);
  }

  if (!result.messages.length) result.messages.push("Matched.");
  return result;
}

async function validateServiceNowRows(db, rows) {
  const limitedRows = rows.slice(0, SERVICE_NOW_BATCH_LIMIT);
  const results = [];
  let categoryUpdates = 0;

  for (const row of limitedRows) {
    try {
      const result = await validateOneServiceNowRow(db, row);
      if (result.categoryUpdated) categoryUpdates += 1;
      results.push(result);
    } catch (error) {
      results.push({
        id: safeString(row.id, 120),
        requestNo: visibleRowRequest(row),
        status: "error",
        tracker: {},
        serviceNow: {},
        categoryUpdated: false,
        slidesMismatch: false,
        minutesMismatch: false,
        messages: [error.message || "ServiceNow validation failed."]
      });
    }
  }

  return {
    totalRequested: rows.length,
    totalProcessed: limitedRows.length,
    truncated: rows.length > limitedRows.length,
    categoryUpdates,
    results
  };
}

async function handleApi(req, res, url) {
  const rootDb = await ensureDb();

  if (req.method === "GET" && url.pathname === "/api/health") {
    return json(res, 200, {
      ok: true,
      rows: rootDb.tasks.length,
      users: rootDb.users.length,
      auth: true
    });
  }

  if (req.method === "GET" && url.pathname === "/api/auth/status") {
    const auth = currentSession(rootDb, req);
    return json(res, 200, {
      authenticated: Boolean(auth),
      setupRequired: rootDb.users.length === 0,
      user: auth ? safeUser(auth.user) : null
    });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/setup") {
    if (rootDb.users.length > 0) return json(res, 409, { error: "Admin setup is already complete." });
    const body = await readBody(req);
    try {
      const admin = createUser(rootDb, {
        username: body.username || "admin",
        displayName: body.displayName || body.username || "Admin",
        password: body.password,
        role: "admin"
      });
      for (const task of rootDb.tasks) {
        if (!task.ownerId) task.ownerId = admin.id;
      }
      rootDb.userSettings[admin.id] = {
        ...initialDb.settings,
        ...(rootDb.settings || {})
      };
      rootDb.userTimers[admin.id] = {
        ...initialDb.timer,
        ...(rootDb.timer || {})
      };
      const { token } = createSession(rootDb, admin);
      audit(rootDb, "auth.setup", { userId: admin.id, username: admin.username });
      await saveDb(rootDb);
      setSessionCookie(req, res, token);
      return json(res, 201, { authenticated: true, setupRequired: false, user: safeUser(admin) });
    } catch (error) {
      return json(res, 400, { error: error.message || "Setup failed." });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readBody(req);
    const user = findUserByUsername(rootDb, body.username);
    if (!user || user.active === false || !verifyPassword(body.password, user)) {
      return json(res, 401, { error: "Invalid username or password." });
    }
    const { token } = createSession(rootDb, user);
    audit(rootDb, "auth.login", { userId: user.id, username: user.username });
    await saveDb(rootDb);
    setSessionCookie(req, res, token);
    return json(res, 200, { authenticated: true, setupRequired: false, user: safeUser(user) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const auth = currentSession(rootDb, req);
    if (auth) {
      rootDb.sessions = rootDb.sessions.filter((session) => session.id !== auth.session.id);
      audit(rootDb, "auth.logout", { userId: auth.user.id });
      await saveDb(rootDb);
    }
    clearSessionCookie(res);
    return json(res, 200, { authenticated: false });
  }

  const authUser = requireAuthenticated(rootDb, req, res);
  if (!authUser) return;
  const db = runtimeDbForUser(rootDb, authUser);

  if (finalizePlannedBreakIfDue(db)) {
    await saveDb(db);
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    return json(res, 200, serializeForClient(db));
  }

  if (req.method === "GET" && url.pathname === "/api/servicenow/config") {
    return json(res, 200, serviceNowConfigStatus());
  }

  if (req.method === "GET" && url.pathname === "/api/admin/users") {
    if (authUser.role !== "admin") return json(res, 403, { error: "Admin access required." });
    return json(res, 200, {
      users: rootDb.users.map((user) => ({
        ...safeUser(user),
        rowCount: rootDb.tasks.filter((task) => task.ownerId === user.id).length,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }))
    });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/users") {
    if (authUser.role !== "admin") return json(res, 403, { error: "Admin access required." });
    const body = await readBody(req);
    try {
      const user = createUser(rootDb, {
        username: body.username,
        displayName: body.displayName,
        password: body.password,
        role: body.role === "admin" ? "admin" : "designer",
        mustChangePassword: Boolean(body.mustChangePassword)
      });
      audit(rootDb, "admin.userCreate", { adminId: authUser.id, userId: user.id, username: user.username, role: user.role });
      await saveDb(rootDb);
      return json(res, 201, { user: safeUser(user) });
    } catch (error) {
      return json(res, 400, { error: error.message || "Could not create user." });
    }
  }

  const userMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (userMatch && req.method === "PATCH") {
    if (authUser.role !== "admin") return json(res, 403, { error: "Admin access required." });
    const id = decodeURIComponent(userMatch[1]);
    const user = rootDb.users.find((item) => item.id === id);
    if (!user) return json(res, 404, { error: "User not found." });
    const body = await readBody(req);
    try {
      const nextRole = Object.prototype.hasOwnProperty.call(body, "role")
        ? (body.role === "admin" ? "admin" : "designer")
        : user.role;
      const nextActive = Object.prototype.hasOwnProperty.call(body, "active")
        ? Boolean(body.active)
        : user.active !== false;
      const hasOtherActiveAdmin = rootDb.users.some((item) => item.id !== user.id && item.active !== false && item.role === "admin");
      if ((!nextActive || nextRole !== "admin") && user.role === "admin" && !hasOtherActiveAdmin) {
        throw new Error("At least one active admin is required.");
      }
      if (Object.prototype.hasOwnProperty.call(body, "displayName")) user.displayName = safeString(body.displayName || user.username, 120);
      user.role = nextRole;
      user.active = nextActive;
      if (Object.prototype.hasOwnProperty.call(body, "password") && String(body.password || "")) {
        validatePassword(body.password);
        const { salt, hash } = hashPassword(body.password);
        user.passwordSalt = salt;
        user.passwordHash = hash;
        user.mustChangePassword = Boolean(body.mustChangePassword);
        rootDb.sessions = rootDb.sessions.filter((session) => session.userId !== user.id);
      }
      user.updatedAt = nowIso();
      ensureUserRuntime(rootDb, user.id);
      audit(rootDb, "admin.userUpdate", { adminId: authUser.id, userId: user.id });
      await saveDb(rootDb);
      return json(res, 200, { user: safeUser(user) });
    } catch (error) {
      return json(res, 400, { error: error.message || "Could not update user." });
    }
  }

  if (req.method === "PUT" && url.pathname === "/api/settings") {
    const body = await readBody(req);
    const work = parseHoursInput(body.workBudget || body.workBudgetSeconds);
    const brk = parseHoursInput(body.breakBudget || body.breakBudgetSeconds);
    if (work > 0) {
      db.settings.workBudgetSeconds = work;
      db.timer.workBudgetSeconds = work;
      if (!["work", "break", "paused"].includes(db.timer.phase)) {
        db.timer.workRemainingBaseSeconds = work;
      }
    }
    if (brk > 0) {
      db.settings.breakBudgetSeconds = brk;
      db.timer.breakBudgetSeconds = brk;
      if (db.timer.phase !== "break") db.timer.breakRemainingBaseSeconds = brk;
    }
    audit(db, "settings.update", { work, brk });
    await saveDb(db);
    return json(res, 200, serializeForClient(db));
  }

  if (req.method === "POST" && url.pathname === "/api/review") {
    const body = await readBody(req);
    const rawJob = safeString(body.rawJob, 600);
    if (!rawJob) return json(res, 400, { error: "Job details are required." });
    const parsed = parseJobInput(rawJob);
    const id = randomUUID();
    const createdAt = nowIso();
    parkActiveTask(db, createdAt);
    const breakRemaining = currentBreakRemaining(db.timer);
    const task = {
      id,
      dateWorked: dubaiDateKey(new Date()),
      requestNo: cleanJobCode(parsed.requestNo),
      slides: safeString(parsed.slides, 20),
      category: safeString(body.category || "", 120),
      client: safeString(parsed.client, 120),
      deadlineText: cleanDeadlineText(parsed.deadlineText),
      startAt: createdAt,
      finishedAt: null,
      breakSeconds: 0,
      pauseSeconds: 0,
      pauseStartedAt: null,
      workBudgetSeconds: db.settings.workBudgetSeconds,
      workRemainingSeconds: db.settings.workBudgetSeconds,
      notes: "",
      rawJob,
      createdAt,
      updatedAt: createdAt
    };
    ensureCategory(db, task.category);
    db.tasks.push(attachOwner(db, task));
    replaceTimer(db, {
      ...db.timer,
      phase: "review",
      activeTaskId: id,
      reviewStartedAt: createdAt,
      reviewElapsedBaseSeconds: 0,
      workBudgetSeconds: db.settings.workBudgetSeconds,
      workRemainingBaseSeconds: db.settings.workBudgetSeconds,
      workCountdownStartedAt: null,
      breakBudgetSeconds: db.settings.breakBudgetSeconds,
      breakRemainingBaseSeconds: breakRemaining,
      breakCountdownStartedAt: null,
      breakStartedAt: null,
      plannedBreakEndAt: null,
      plannedBreakDurationSeconds: 0,
      breakWindowLabel: "",
      expectedFinishAt: null
    });
    audit(db, "task.review", { id, requestNo: task.requestNo });
    await saveDb(db);
    return json(res, 201, serializeForClient(db));
  }

  if (req.method === "POST" && url.pathname === "/api/tasks/manual") {
    const body = await readBody(req);
    const rawJob = safeString(body.rawJob, 600);
    if (!rawJob) return json(res, 400, { error: "Job details are required for a manual row." });

    const dateWorked = parseTaskDateWorked(body.dateWorked);
    if (!dateWorked) return json(res, 400, { error: "Enter Date worked as YYYY-MM-DD, mm/dd/yyyy, or 8-May." });

    const parsed = parseJobInput(rawJob);
    const requestNo = cleanJobCode(parsed.requestNo);
    if (!requestNo) {
      return json(res, 400, { error: "Include the DTP request number in the job details so the protected Request # is correct." });
    }

    const workedHours = safeString(body.workedHours, 80);
    let manualDurationSeconds = null;
    if (workedHours) {
      manualDurationSeconds = parseEditedDuration(workedHours);
      if (manualDurationSeconds === null) {
        return json(res, 400, { error: "Enter worked hours like 01:06, 66, 66min, or 1.5h." });
      }
      manualDurationSeconds = clampSeconds(manualDurationSeconds, 0);
    }

    const createdAt = nowIso();
    const id = randomUUID();
    const task = {
      id,
      dateWorked,
      requestNo,
      slides: safeString(parsed.slides, 20),
      category: safeString(body.category || "", 120),
      client: safeString(parsed.client, 120),
      deadlineText: cleanDeadlineText(parsed.deadlineText),
      startAt: null,
      finishedAt: null,
      breakSeconds: 0,
      pauseSeconds: 0,
      pauseStartedAt: null,
      workBudgetSeconds: db.settings.workBudgetSeconds,
      workRemainingSeconds: db.settings.workBudgetSeconds,
      imported: true,
      notes: "Manual row",
      rawJob,
      createdAt,
      updatedAt: createdAt
    };
    if (manualDurationSeconds !== null) task.manualDurationSeconds = manualDurationSeconds;
    ensureCategory(db, task.category);
    db.tasks.push(attachOwner(db, task));
    audit(db, "task.manualCreate", { id, requestNo: task.requestNo, dateWorked });
    await saveDb(db);
    const payload = serializeForClient(db);
    payload.manualTaskId = id;
    return json(res, 201, payload);
  }

  if (req.method === "POST" && url.pathname === "/api/action") {
    const body = await readBody(req);
    const type = safeString(body.type, 80);
    const task = activeTask(db);
    const now = nowIso();

    if (type === "startWork") {
      if (!task || task.finishedAt) return json(res, 409, { error: "No active job row found." });
      const budget = parseHoursInput(body.workBudget || db.settings.workBudgetSeconds) || db.settings.workBudgetSeconds;
      finalizeTaskPause(task, now);
      db.settings.workBudgetSeconds = budget;
      db.timer.phase = "work";
      db.timer.reviewElapsedBaseSeconds = currentReviewElapsed(db.timer);
      db.timer.reviewStartedAt = null;
      db.timer.workBudgetSeconds = budget;
      db.timer.workRemainingBaseSeconds = budget;
      db.timer.workCountdownStartedAt = now;
      db.timer.expectedFinishAt = new Date(Date.parse(now) + budget * 1000).toISOString();
      task.workBudgetSeconds = budget;
      task.workRemainingSeconds = budget;
      task.updatedAt = now;
      audit(db, "timer.startWork", { id: task.id, budget });
    } else if (type === "pauseWork") {
      db.timer.workRemainingBaseSeconds = currentWorkRemaining(db.timer);
      db.timer.workCountdownStartedAt = null;
      db.timer.phase = "paused";
      if (task && !task.finishedAt) {
        task.workRemainingSeconds = db.timer.workRemainingBaseSeconds;
        task.workBudgetSeconds = clampSeconds(db.timer.workBudgetSeconds, db.settings.workBudgetSeconds);
        if (!task.pauseStartedAt) task.pauseStartedAt = now;
        task.updatedAt = now;
      }
      audit(db, "timer.pauseWork", { activeTaskId: db.timer.activeTaskId });
    } else if (type === "resumeWork") {
      if (!task || task.finishedAt) return json(res, 409, { error: "No active job to resume." });
      finalizeTaskPause(task, now);
      db.timer.phase = "work";
      db.timer.workCountdownStartedAt = now;
      setExpectedFinishFromRemainingWork(db.timer, Date.parse(now));
      task.workRemainingSeconds = db.timer.workRemainingBaseSeconds;
      task.updatedAt = now;
      audit(db, "timer.resumeWork", { activeTaskId: db.timer.activeTaskId });
    } else if (type === "continueTask") {
      const id = safeString(body.taskId, 80);
      const nextTask = getTask(db, id);
      if (!nextTask) return json(res, 404, { error: "Task not found." });
      if (nextTask.finishedAt) return json(res, 409, { error: "This job is already finished." });

      if (db.timer.activeTaskId && db.timer.activeTaskId !== id) {
        parkActiveTask(db, now);
      }

      finalizeTaskPause(nextTask, now);
      const budget = clampSeconds(nextTask.workBudgetSeconds, db.settings.workBudgetSeconds) || db.settings.workBudgetSeconds;
      const remaining = clampSeconds(nextTask.workRemainingSeconds, budget) || budget;
      db.timer.phase = "work";
      db.timer.activeTaskId = id;
      db.timer.reviewStartedAt = null;
      db.timer.reviewElapsedBaseSeconds = 0;
      db.timer.workBudgetSeconds = budget;
      db.timer.workRemainingBaseSeconds = remaining;
      db.timer.workCountdownStartedAt = now;
      db.timer.breakCountdownStartedAt = null;
      db.timer.breakStartedAt = null;
      db.timer.plannedBreakEndAt = null;
      db.timer.plannedBreakDurationSeconds = 0;
      db.timer.breakWindowLabel = "";
      db.timer.expectedFinishAt = new Date(Date.parse(now) + remaining * 1000).toISOString();
      nextTask.workRemainingSeconds = remaining;
      nextTask.updatedAt = now;
      audit(db, "task.continue", { id, remaining });
    } else if (type === "startBreak") {
      if ((!task || task.finishedAt) && !hasTaskOnDubaiDate(db)) {
        return json(res, 409, { error: "Add or finish at least one job today before starting a break." });
      }
      if (task && !task.finishedAt) finalizeTaskPause(task, now);
      if (task && !task.finishedAt) db.timer.workRemainingBaseSeconds = currentWorkRemaining(db.timer);
      db.timer.workCountdownStartedAt = null;
      db.timer.phase = "break";
      if (!db.timer.breakRemainingBaseSeconds || db.timer.breakRemainingBaseSeconds <= 0) {
        db.timer.breakRemainingBaseSeconds = db.settings.breakBudgetSeconds;
      }
      db.timer.breakStartedAt = now;
      db.timer.breakCountdownStartedAt = now;
      db.timer.plannedBreakEndAt = null;
      db.timer.plannedBreakDurationSeconds = 0;
      db.timer.breakWindowLabel = "";
      if (task && !task.finishedAt) {
        task.workRemainingSeconds = db.timer.workRemainingBaseSeconds;
        task.updatedAt = now;
      } else {
        db.timer.activeTaskId = null;
        db.timer.expectedFinishAt = null;
      }
      audit(db, "timer.startBreak", { id: task?.id || null });
    } else if (type === "startPlannedBreak") {
      if ((!task || task.finishedAt) && !hasTaskOnDubaiDate(db)) {
        return json(res, 409, { error: "Add or finish at least one job today before starting a break." });
      }
      if (db.timer.phase === "break") return json(res, 409, { error: "A break is already running." });
      if (task && !task.finishedAt) finalizeTaskPause(task, now);

      const startMinute = normalizeMinuteOfDay(body.breakStartMinutes);
      const endMinute = normalizeMinuteOfDay(body.breakEndMinutes);
      const durationSeconds = plannedBreakDurationSeconds(startMinute, endMinute);
      if (durationSeconds <= 0) return json(res, 400, { error: "Choose a valid start and end break time." });
      if (durationSeconds > 12 * 3600) return json(res, 400, { error: "Break window is too long." });

      const remainingBeforeBreak = currentBreakRemaining(db.timer);
      if (durationSeconds > remainingBeforeBreak) {
        return json(res, 400, { error: "Selected break is longer than your remaining break." });
      }

      if (task && !task.finishedAt) db.timer.workRemainingBaseSeconds = currentWorkRemaining(db.timer);
      db.timer.workCountdownStartedAt = null;
      db.timer.phase = "break";
      db.timer.breakRemainingBaseSeconds = remainingBeforeBreak;
      db.timer.breakStartedAt = now;
      db.timer.breakCountdownStartedAt = now;
      db.timer.plannedBreakDurationSeconds = durationSeconds;
      db.timer.plannedBreakEndAt = new Date(Date.parse(now) + durationSeconds * 1000).toISOString();
      db.timer.breakWindowLabel = `${formatMinuteOfDay(startMinute)} - ${formatMinuteOfDay(endMinute)}`;
      if (task && !task.finishedAt) {
        task.workRemainingSeconds = db.timer.workRemainingBaseSeconds;
        task.updatedAt = now;
      } else {
        db.timer.activeTaskId = null;
        db.timer.expectedFinishAt = null;
      }
      audit(db, "timer.startPlannedBreak", { id: task?.id || null, durationSeconds, window: db.timer.breakWindowLabel });
    } else if (type === "stopBreak") {
      const countedSeconds = task && !task.finishedAt ? breakSecondsUsed(db.timer, Date.parse(now)) : 0;
      if (task && !task.finishedAt && db.timer.breakStartedAt) {
        task.breakSeconds = clampSeconds(task.breakSeconds, 0) + countedSeconds;
        task.updatedAt = now;
        setExpectedFinishFromRemainingWork(db.timer, Date.parse(now));
      }
      db.timer.breakRemainingBaseSeconds = currentBreakRemaining(db.timer);
      db.timer.breakCountdownStartedAt = null;
      db.timer.breakStartedAt = null;
      db.timer.plannedBreakEndAt = null;
      db.timer.plannedBreakDurationSeconds = 0;
      db.timer.breakWindowLabel = "";
      if (task && !task.finishedAt) {
        db.timer.phase = db.timer.workRemainingBaseSeconds > 0 ? "work" : "expired";
        db.timer.workCountdownStartedAt = db.timer.phase === "work" ? now : null;
        task.workRemainingSeconds = db.timer.workRemainingBaseSeconds;
        task.updatedAt = now;
      } else {
        db.timer.phase = "idle";
        db.timer.activeTaskId = null;
        db.timer.workCountdownStartedAt = null;
        db.timer.expectedFinishAt = null;
      }
      audit(db, "timer.stopBreak", { activeTaskId: db.timer.activeTaskId, countedSeconds });
    } else if (type === "endJob") {
      if (!task) return json(res, 409, { error: "No active job to end." });
      finalizeTaskPause(task, now);
      if (db.timer.phase === "break" && db.timer.breakStartedAt) {
        const elapsed = secondsSince(db.timer.breakStartedAt);
        const planned = clampSeconds(db.timer.plannedBreakDurationSeconds, 0);
        task.breakSeconds = clampSeconds(task.breakSeconds, 0) + (planned > 0 ? Math.min(elapsed, planned) : elapsed);
      }
      task.finishedAt = now;
      task.updatedAt = now;
      resetTimerToIdle(db, { preserveBreak: true });
      audit(db, "task.end", { id: task.id });
    } else if (type === "resetTimers") {
      resetTimerToIdle(db);
      audit(db, "timer.reset");
    } else if (type === "updateBudget") {
      if (!task || task.finishedAt) return json(res, 409, { error: "No active job row found." });
      const budget = parseHoursInput(body.workBudget || db.settings.workBudgetSeconds);
      if (budget <= 0) return json(res, 400, { error: "Enter a valid budget, for example 10, 190min, 1.5, or 2.0." });
      db.settings.workBudgetSeconds = budget;
      db.timer.workBudgetSeconds = budget;
      db.timer.workRemainingBaseSeconds = budget;
      db.timer.expectedFinishAt = new Date(Date.parse(now) + budget * 1000).toISOString();
      task.workBudgetSeconds = budget;
      task.workRemainingSeconds = budget;
      task.updatedAt = now;
      if (db.timer.phase !== "break") {
        db.timer.phase = "work";
        db.timer.workCountdownStartedAt = now;
      }
      audit(db, "timer.updateBudget", { id: task.id, budget });
    } else {
      return json(res, 400, { error: `Unknown action: ${type}` });
    }

    await saveDb(db);
    return json(res, 200, serializeForClient(db));
  }

  if (req.method === "POST" && url.pathname === "/api/timesheet-docx") {
    const body = await readBody(req);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return json(res, 400, { error: "No visible rows to export." });
    const docx = await buildTimesheetFromTemplate({
      name: safeString(body.name, 120) || "NAME",
      timekeeperId: safeString(body.timekeeperId, 60),
      reportDate: safeString(body.reportDate, 40) || new Date().toLocaleDateString("en-GB"),
      rows: rows.map((row) => ({
        dateWorked: row.dateWorked,
        requestNo: row.requestNo,
        workedHours: row.workedHours,
        durationSeconds: row.durationSeconds,
        slides: row.slides,
        category: row.category,
        client: row.client
      }))
    });
    res.writeHead(200, {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="DTP_Timesheet_${Date.now()}.docx"`,
      "cache-control": "no-store"
    });
    res.end(docx);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/servicenow/validate") {
    const config = serviceNowConfigStatus();
    if (!config.configured) {
      return json(res, 424, {
        error: "ServiceNow automatic validation is not configured on this server.",
        configured: false,
        missing: config.missing,
        warnings: config.warnings
      });
    }

    const body = await readBody(req);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return json(res, 400, { error: "No visible rows to validate." });

    const report = await validateServiceNowRows(db, rows);
    if (report.categoryUpdates) {
      audit(db, "servicenow.validate", {
        rows: report.totalProcessed,
        categoryUpdates: report.categoryUpdates,
        truncated: report.truncated
      });
      await saveDb(db);
    } else {
      audit(db, "servicenow.validate", {
        rows: report.totalProcessed,
        categoryUpdates: 0,
        truncated: report.truncated
      });
      await saveDb(db);
    }

    return json(res, 200, {
      ok: true,
      configured: true,
      ...report,
      state: serializeForClient(db)
    });
  }

  if (req.method === "POST" && url.pathname === "/api/import") {
    const body = await readBody(req);
    const filename = safeString(body.filename, 260) || "import.csv";
    const base64 = String(body.contentBase64 || "");
    if (!base64) return json(res, 400, { error: "No file content received." });
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length > 15 * 1024 * 1024) return json(res, 413, { error: "Import file is too large. Please keep it under 15 MB." });

    const importedRows = parseImportedRows(filename, buffer);
    if (!importedRows.length) return json(res, 400, { error: "No usable tracker rows were found in the file." });
    const removedDuplicates = dedupeImportedTasks(db);
    const seen = new Set(scopedTasks(db).map(taskImportKey));
    let skipped = 0;
    let added = 0;
    for (const task of importedRows) {
      const key = taskImportKey(task);
      if (seen.has(key)) {
        skipped += 1;
        continue;
      }
      seen.add(key);
      ensureCategory(db, task.category);
      db.tasks.push(attachOwner(db, task));
      added += 1;
    }
    audit(db, "tasks.import", { filename, rows: added, skipped, removedDuplicates });
    await saveDb(db);
    return json(res, 200, { imported: added, skipped, removedDuplicates, state: serializeForClient(db) });
  }

  if (req.method === "POST" && url.pathname === "/api/tasks/bulk-delete") {
    const body = await readBody(req);
    const ids = Array.isArray(body.ids)
      ? [...new Set(body.ids.map((id) => safeString(id, 120)).filter(Boolean))]
      : [];
    if (!ids.length) return json(res, 400, { error: "No rows selected." });

    const idSet = new Set(ids);
    const before = db.tasks.length;
    replaceTasks(db, db.tasks.filter((task) => !(idSet.has(task.id) && taskBelongsToScope(db, task))));
    if (db.timer.activeTaskId && idSet.has(db.timer.activeTaskId)) resetTimerToIdle(db);

    const deleted = before - db.tasks.length;
    audit(db, "tasks.bulkDelete", { deleted, requested: ids.length });
    await saveDb(db);
    return json(res, 200, { deleted, state: serializeForClient(db) });
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch && req.method === "PATCH") {
    const id = decodeURIComponent(taskMatch[1]);
    const task = getTask(db, id);
    if (!task) return json(res, 404, { error: "Task not found." });
    const patch = await readBody(req);
    if (Object.prototype.hasOwnProperty.call(patch, "workedHours") && parseEditedDuration(patch.workedHours) === null) {
      return json(res, 400, { error: "Enter worked hours like 01:06, 66, 66min, or 1.5h." });
    }
    if (Object.prototype.hasOwnProperty.call(patch, "breakSeconds") && parseEditedDuration(patch.breakSeconds) === null) {
      return json(res, 400, { error: "Enter break like 00:05, 5, 5min, or 0.5h." });
    }
    if (Object.prototype.hasOwnProperty.call(patch, "dateWorked") && !parseTaskDateWorked(patch.dateWorked)) {
      return json(res, 400, { error: "Enter Date worked as YYYY-MM-DD, mm/dd/yyyy, or 8-May." });
    }
    applyTaskPatch(task, patch);
    ensureCategory(db, task.category);
    audit(db, "task.patch", { id, fields: Object.keys(patch) });
    await saveDb(db);
    return json(res, 200, serializeForClient(db));
  }

  if (taskMatch && req.method === "DELETE") {
    const id = decodeURIComponent(taskMatch[1]);
    const before = db.tasks.length;
    replaceTasks(db, db.tasks.filter((task) => !(task.id === id && taskBelongsToScope(db, task))));
    if (db.timer.activeTaskId === id) resetTimerToIdle(db);
    if (db.tasks.length === before) return json(res, 404, { error: "Task not found." });
    audit(db, "task.delete", { id });
    await saveDb(db);
    return json(res, 200, serializeForClient(db));
  }

  return json(res, 404, { error: "API route not found." });
}

async function serveStatic(req, res, url) {
  let filePath = decodeURIComponent(url.pathname);
  if (filePath === "/") filePath = "/index.html";
  const resolved = path.normalize(path.join(PUBLIC_DIR, filePath));
  if (!resolved.startsWith(PUBLIC_DIR)) return text(res, 403, "Forbidden");

  try {
    const data = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const noStore = [".html", ".css", ".js"].includes(ext);
    res.writeHead(200, {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": noStore ? "no-store" : "public, max-age=300"
    });
    res.end(data);
  } catch (error) {
    if (error.code === "ENOENT") return text(res, 404, "Not found");
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (error) {
    console.error(error);
    json(res, error.statusCode || 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, HOST, async () => {
  await ensureDb();
  console.log(`DTP web tracker running at http://localhost:${PORT}`);
  console.log(`Local data file: ${DB_FILE}`);
});
