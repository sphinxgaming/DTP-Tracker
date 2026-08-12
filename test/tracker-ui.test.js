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
  assert.match(html, /20260813-simple-break-row-focus-1/);

  assert.match(app, /let focusedTaskId = ""/);
  assert.match(app, /function focusTaskRow\(id\)/);
  assert.match(app, /clickedRow = event\.target\.closest\("tr\[data-id\]"\)/);
  assert.match(styles, /tbody tr\.focused-row/);
  assert.match(onboarding, /Clicking anywhere in a row highlights the whole row/);
  assert.doesNotMatch(onboarding, /Start DXB|Add break/);
});
