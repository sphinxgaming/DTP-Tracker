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
  assert.match(html, /20260828-operations-qc-8/);

  assert.match(app, /let focusedTaskId = ""/);
  assert.match(app, /function focusTaskRow\(id\)/);
  assert.match(app, /clickedRow = event\.target\.closest\("tr\[data-id\]"\)/);
  assert.match(styles, /tbody tr\.focused-row/);
  assert.match(onboarding, /Clicking anywhere in a row highlights the whole row/);
  assert.doesNotMatch(onboarding, /Start DXB|Add break/);
  assert.match(app, /requestCopyMarkup\(task\.requestNo\)/);
  assert.match(app, /function copyRequestNumber\(requestNo\)/);
  assert.match(styles, /\.copy-request-btn/);
  assert.match(styles, /\.copy-request-btn \{[\s\S]*?border: 0;[\s\S]*?background: transparent;/);
  assert.match(styles, /\.copy-request-btn span,[\s\S]*?border-radius: 2px;/);
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
  assert.match(html, /Last synced \(DXB\)/);
  assert.match(html, /Designers and shifts/);
  assert.match(html, /Handover and next jobs/);
  assert.match(html, /Quality check/);
  assert.match(html, /QC approved/);
  assert.match(app, /async function openOperationsWorkspace\(\)/);
  assert.match(app, /\/api\/admin\/operations/);
  assert.match(app, /Designer workload:/);
  assert.match(app, /await openOperationsWorkspace\(\)/);
});

test("designers can view Operations without access to other designers' trackers", () => {
  const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
  const onboarding = fs.readFileSync(path.join(root, "public", "onboarding.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "public", "styles.css"), "utf8");
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

  assert.match(app, /els\.operationsBtn\.hidden = false/);
  assert.match(app, /els\.trackerBtn\.hidden = false/);
  assert.match(app, /const canViewTrackers = currentUser\?\.role === "admin"/);
  assert.match(app, /canViewTrackers \? `<td><button[^`]+view-tracker/);
  assert.match(app, /const data = await api\("\/api\/operations"\)/);
  assert.match(html, /<th data-operations-admin-only>Tracker<\/th>/);
  assert.match(server, /url\.pathname === "\/api\/operations"/);
  assert.match(server, /actor\.role === "admin"[\s\S]+rowCount/);
  assert.match(styles, /\.operations-item-form\[hidden\]/);
  assert.match(onboarding, /activeWorkspace !== "tracker"/);
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
  assert.match(styles, /\.team-operations-table td:not\(:first-child\) \{[\s\S]*?vertical-align: middle;/);
  assert.match(app, /class="qc-status-stack"/);
  assert.match(styles, /\.qc-status-stack \{[\s\S]*?flex-direction: column;/);
  assert.match(styles, /#operationsQcRows td \{[\s\S]*?text-align: center;[\s\S]*?vertical-align: middle;/);
  assert.doesNotMatch(app, /designer-identity[^\n]+escapeHtml\(user\.username\)[^\n]+<\/span>/);
});

test("operations uses one combined DXB ETA or deadline field", () => {
  const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");

  assert.match(html, /id="operationsDeadline"[^>]+placeholder="ETA \/ deadline \(DXB\)"/);
  assert.doesNotMatch(html, /id="operationsEta"/);
  assert.match(app, /data-ops-item-field="dueText"/);
  assert.match(app, /function operationDueText\(item\)/);
  assert.doesNotMatch(app, /data-ops-item-field="etaText"/);
});

test("operations prioritizes QC, handover, and dismissible approved cards", () => {
  const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
  const styles = fs.readFileSync(path.join(root, "public", "styles.css"), "utf8");

  const linksIndex = html.indexOf('id="operationsLinksTitle"');
  const qcIndex = html.indexOf('id="qcQueueTitle"');
  const handoverIndex = html.indexOf('id="handoverTitle"');
  const approvedIndex = html.indexOf('id="approvedTitle"');
  assert.ok(linksIndex < qcIndex && qcIndex < handoverIndex && handoverIndex < approvedIndex);
  assert.match(app, /data-ops-action="dismiss-approved"/);
  assert.match(app, /finished tracker row will be preserved/);
  assert.match(styles, /\.approved-dismiss/);
});
