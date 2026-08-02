const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("ServiceNow validation keeps worked minutes as a manual comparison", () => {
  const script = fs.readFileSync(path.join(root, "public", "servicenow-validation.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");

  assert.match(script, /Worked minutes comparison/);
  assert.match(script, /Tracker minutes are never overwritten/);
  assert.match(script, /data-sn-minute-decision/);
  assert.match(script, /Difference \(SN - Tracker\)/);
  assert.match(script, /Download minutes report/);
  assert.match(script, /does not change the tracker or ServiceNow minutes/);
  assert.match(script, /Are you sure you want to validate these rows\?/);
  assert.match(script, /data-sn-cancel-confirm/);
  assert.match(script, /data-sn-confirm-run/);
  assert.match(script, /No filters are active/);
  assert.match(html, /20260802-validation-confirm-1/);
});
