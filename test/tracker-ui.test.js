const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("tracker keeps breaks simple and highlights the clicked row", () => {
  const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
  const styles = fs.readFileSync(path.join(root, "public", "styles.css"), "utf8");
  const onboarding = fs.readFileSync(path.join(root, "public", "onboarding.js"), "utf8");

  assert.match(html, /id="breakBtn"/);
  assert.match(html, /id="stopBreakBtn"/);
  assert.doesNotMatch(html, /breakStartSelect|breakEndSelect|plannedBreakBtn|plannedBreakLabel/);
  assert.doesNotMatch(html, /servicenow-validation/);
  assert.doesNotMatch(html, /Validate ServiceNow/);
  assert.match(html, /20260820-operations-theme-3/);

  assert.match(app, /let focusedTaskId = ""/);
  assert.match(app, /function focusTaskRow\(id\)/);
  assert.match(app, /clickedRow = event\.target\.closest\("tr\[data-id\]"\)/);
  assert.match(styles, /tbody tr\.focused-row/);
  assert.match(onboarding, /Clicking anywhere in a row highlights the whole row/);
  assert.doesNotMatch(onboarding, /Start DXB|Add break/);
  assert.match(app, /requestCopyMarkup\(task\.requestNo\)/);
  assert.match(app, /function copyRequestNumber\(requestNo\)/);
  assert.match(styles, /\.copy-request-btn/);
});

test("password fields have accessible visibility toggles", () => {
  const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
  const styles = fs.readFileSync(path.join(root, "public", "styles.css"), "utf8");

  assert.match(html, /data-password-toggle="loginPassword"[^>]+aria-label="Show password"/);
  assert.match(html, /data-password-toggle="newUserPassword"[^>]+aria-label="Show password"/);
  assert.match(app, /function bindPasswordToggles\(\)/);
  assert.match(app, /input\.type = visible \? "text" : "password"/);
  assert.match(styles, /\.password-toggle\[aria-pressed="true"\]::after/);
});

test("admin accounts expose deletion without ServiceNow-name controls", () => {
  const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");

  assert.doesNotMatch(html, /newUserServiceNowName|ServiceNow production name/i);
  assert.doesNotMatch(app, /data-admin-action="servicenow-name"|ServiceNow production name updated/i);
  assert.match(app, /data-admin-action="delete-user"/);
  assert.match(app, /method: "DELETE"/);
});

test("admins get a dedicated centralized operations workspace", () => {
  const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");

  assert.match(html, /id="adminWorkspace"/);
  assert.match(html, /Live DTP team dashboard/);
  assert.match(html, /Designers and shifts/);
  assert.match(html, /Handover and next jobs/);
  assert.match(html, /Quality check/);
  assert.match(html, /QC approved/);
  assert.match(app, /async function openOperationsWorkspace\(\)/);
  assert.match(app, /\/api\/admin\/operations/);
  assert.match(app, /Designer workload:/);
  assert.match(app, /await openOperationsWorkspace\(\)/);
});

test("operations workspace has consistent status styling and a persistent theme switch", () => {
  const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
  const styles = fs.readFileSync(path.join(root, "public", "styles.css"), "utf8");

  assert.match(html, /id="themeToggle"[^>]+role="switch"/);
  assert.match(app, /const THEME_STORAGE_KEY = "dtpTheme"/);
  assert.match(app, /function applyTheme\(theme, persist = true\)/);
  assert.match(styles, /:root\[data-theme="dark"\]/);
  assert.match(styles, /\.presence-pill\.idle/);
  assert.match(styles, /\.presence-pill\.work/);
  assert.doesNotMatch(app, /designer-identity[^\n]+escapeHtml\(user\.username\)[^\n]+<\/span>/);
});
