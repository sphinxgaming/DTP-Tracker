const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");

function loadApp() {
  const app = vm.createContext({ document: { addEventListener() {} } });
  vm.runInContext(source, app);
  return app;
}

function task(id, seconds, dateWorked = "2026-09-14") {
  return { id, requestNo: `DTP${id}`, dateWorked, durationSeconds: seconds, slides: "2" };
}

test("exactly 30 minutes of daily overtime is included", () => {
  const app = loadApp();
  const rows = [task("0000001", 8 * 3600), task("0000002", 30 * 60)];
  const marked = app.applyCountableOvertimeMarkers(rows);
  assert.equal(marked[0].overtime, false);
  assert.equal(marked[1].overtime, true);
  assert.equal(app.overtimeStats(rows).rows, 1);
  assert.equal(app.formatDuration(app.overtimeStats(rows).seconds), "00:30");
});

test("OT qualification uses the same rounded minute shown in the tracker", () => {
  const app = loadApp();
  for (const seconds of [29 * 60 + 30, 29 * 60 + 59, 30 * 60]) {
    const rows = [task("0000001", 8 * 3600), task("0000002", seconds)];
    const before = JSON.stringify(rows);
    assert.equal(app.formatDuration(app.sumDurationSeconds(rows)), "08:30");
    const summary = app.overtimeStats(rows);
    assert.equal(summary.days.length, 1, `Missing displayed 30-minute OT for ${seconds}s`);
    assert.equal(app.formatDuration(summary.seconds), "00:30");
    assert.equal(summary.seconds, seconds, "raw recorded seconds must not be rewritten");
    assert.equal(JSON.stringify(rows), before);
  }
});

test("displayed OT under 30 minutes is still excluded", () => {
  const app = loadApp();
  for (const seconds of [0, 60, 29 * 60, 29 * 60 + 29]) {
    const summary = app.overtimeStats([task("0000001", 8 * 3600 + seconds)]);
    assert.equal(summary.rows, 0);
    assert.equal(summary.seconds, 0);
    assert.equal(summary.days.length, 0);
  }
});

test("OT qualification aggregates requests per day, without combining days", () => {
  const app = loadApp();
  const rows = [
    task("0000001", 8 * 3600),
    task("0000002", 14 * 60 + 45),
    task("0000003", 14 * 60 + 45),
    task("0000004", 8 * 3600 + 20 * 60, "2026-09-15")
  ];
  const summary = app.overtimeStats(rows);
  assert.equal(summary.rows, 2);
  assert.equal(summary.days.length, 1);
  assert.equal(summary.days[0].dateKey, "2026-09-14");
  assert.equal(app.formatDuration(summary.seconds), "00:30");
  assert.equal(app.applyCountableOvertimeMarkers(rows)[3].overtime, false);
});

test("larger overtime and a single task crossing eight hours remain counted", () => {
  const app = loadApp();
  const rows = [task("0000001", 9 * 3600 + 15 * 60)];
  const summary = app.overtimeStats(rows);
  assert.equal(summary.rows, 1);
  assert.equal(summary.seconds, 75 * 60);
  assert.equal(app.formatDuration(summary.seconds), "01:15");
});

test("Word timesheet sends the 30-minute OT marker without altering hours or slides", async () => {
  const app = loadApp();
  const rows = [task("0000001", 8 * 3600), task("0000002", 29 * 60 + 50)];
  const before = JSON.stringify(rows);
  let payload;
  app.filteredTasks = () => rows;
  app.prompt = () => "Sample";
  app.localStorage = { getItem: () => "", setItem() {} };
  app.fetch = async (url, options) => {
    assert.equal(url, "/api/timesheet-docx");
    payload = JSON.parse(options.body);
    return { ok: true, blob: async () => ({}) };
  };
  app.downloadBlob = () => {};
  app.showToast = () => {};
  await app.generateTimesheetWord();
  assert.equal(payload.rows[0].dateWorked.startsWith("*"), false);
  assert.equal(payload.rows[1].dateWorked.startsWith("*"), true);
  assert.equal(payload.rows[1].workedHours, "00:30");
  assert.equal(payload.rows[1].durationSeconds, 1790);
  assert.equal(payload.rows[1].slides, "2");
  assert.equal(JSON.stringify(rows), before);
});
