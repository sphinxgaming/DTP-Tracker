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
  assert.match(html, /20260813-password-eye-1/);

  assert.match(app, /let focusedTaskId = ""/);
  assert.match(app, /function focusTaskRow\(id\)/);
  assert.match(app, /clickedRow = event\.target\.closest\("tr\[data-id\]"\)/);
  assert.match(styles, /tbody tr\.focused-row/);
  assert.match(onboarding, /Clicking anywhere in a row highlights the whole row/);
  assert.doesNotMatch(onboarding, /Start DXB|Add break/);
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
