const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl, child) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    if (child.exitCode !== null) throw new Error(`Tracker server exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Wait for the server to bind.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Tracker server did not become ready.");
}

test("admin operations routes assignment through the designer tracker and QC", async (t) => {
  const port = await freePort();
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dtp-admin-operations-test-"));
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      DATA_DIR: dataDir,
      SEED_DB_FILE: path.join(dataDir, "missing-seed.json"),
      ADMIN_BOOTSTRAP_USERNAME: "admin",
      ADMIN_BOOTSTRAP_DISPLAY_NAME: "Test Admin",
      ADMIN_BOOTSTRAP_PASSWORD: "TestPassword123!"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const output = [];
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));

  t.after(async () => {
    child.kill();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl, child);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "TestPassword123!" })
  });
  assert.equal(loginResponse.status, 200, output.join(""));
  const adminLogin = await loginResponse.json();
  const cookie = loginResponse.headers.getSetCookie?.()[0]?.split(";")[0]
    || loginResponse.headers.get("set-cookie").split(";")[0];
  const headers = { "content-type": "application/json", cookie };

  const createUserResponse = await fetch(`${baseUrl}/api/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      displayName: "Designer One",
      username: "designer.one",
      password: "DesignerPassword123!",
      role: "designer"
    })
  });
  const createUser = await createUserResponse.json();
  assert.equal(createUserResponse.status, 201, JSON.stringify(createUser));

  const designerLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "designer.one", password: "DesignerPassword123!" })
  });
  assert.equal(designerLoginResponse.status, 200, JSON.stringify(await designerLoginResponse.clone().json()));
  const designerCookie = designerLoginResponse.headers.getSetCookie?.()[0]?.split(";")[0]
    || designerLoginResponse.headers.get("set-cookie").split(";")[0];

  const designerOperationsResponse = await fetch(`${baseUrl}/api/operations`, {
    headers: { cookie: designerCookie }
  });
  const designerOperations = await designerOperationsResponse.json();
  assert.equal(designerOperationsResponse.status, 200, JSON.stringify(designerOperations));
  assert.equal(designerOperations.currentUser.id, createUser.user.id);
  assert.deepEqual(designerOperations.capabilities, { review: false, coordinate: false });
  assert.equal(designerOperations.designers.some((entry) => entry.user.id === createUser.user.id), true);
  assert.equal(Object.hasOwn(designerOperations.designers[0], "rowCount"), false, "designers must not receive another user's tracker row count");

  const designerAdminOperationsResponse = await fetch(`${baseUrl}/api/admin/operations`, {
    headers: { cookie: designerCookie }
  });
  assert.equal(designerAdminOperationsResponse.status, 403, "admin Operations endpoint stays admin-only");

  const protectedTrackerResponse = await fetch(`${baseUrl}/api/state`, {
    headers: { cookie: designerCookie, "x-dtp-view-user": adminLogin.user.id }
  });
  const protectedTracker = await protectedTrackerResponse.json();
  assert.equal(protectedTrackerResponse.status, 200, JSON.stringify(protectedTracker));
  assert.equal(protectedTracker.currentUser.id, createUser.user.id);
  assert.equal(protectedTracker.viewUser.id, createUser.user.id, "designer cannot use the admin view header to open another tracker");

  const designerMutationResponse = await fetch(`${baseUrl}/api/admin/operations/items`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: designerCookie },
    body: JSON.stringify({ requestNo: "DTP-NOT-ALLOWED" })
  });
  assert.equal(designerMutationResponse.status, 403, "designer Operations access is read-only");

  const manualResponse = await fetch(`${baseUrl}/api/tasks/manual`, {
    method: "POST",
    headers: { ...headers, "x-dtp-view-user": createUser.user.id },
    body: JSON.stringify({
      rawJob: "DTP0000001 / Historic Client / 1 Slides / MON 9AM",
      dateWorked: "2026-01-01",
      workedHours: "30"
    })
  });
  const manualState = await manualResponse.json();
  assert.equal(manualResponse.status, 201, JSON.stringify(manualState));
  assert.equal(manualState.tasks.find((task) => task.requestNo === "DTP0000001").deadlineText, "MON 9AM");

  const deadlineCases = [
    ["DTP0000002 / Client ASAP / 2 Slides / (Deadline: ASAP)", "ASAP"],
    ["DTP0000003 / Client Friday / 3 Slides / Deadline Friday, 10.30 p.m. DXB", "FRI 10:30PM"],
    ["DTP0000004 / Client Blank / 4 Slides / No confirmed deadline", ""]
  ];
  for (const [rawJob, expectedDeadline] of deadlineCases) {
    const response = await fetch(`${baseUrl}/api/tasks/manual`, {
      method: "POST",
      headers: { ...headers, "x-dtp-view-user": createUser.user.id },
      body: JSON.stringify({ rawJob, dateWorked: "2026-01-01", workedHours: "0" })
    });
    const state = await response.json();
    assert.equal(response.status, 201, JSON.stringify(state));
    const requestNo = rawJob.match(/DTP\d{7}/)[0];
    assert.equal(state.tasks.find((task) => task.requestNo === requestNo).deadlineText, expectedDeadline);
  }

  const promoteResponse = await fetch(`${baseUrl}/api/admin/users/${encodeURIComponent(createUser.user.id)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ role: "admin", adminScope: "both" })
  });
  const promoted = await promoteResponse.json();
  assert.equal(promoteResponse.status, 200, JSON.stringify(promoted));
  assert.equal(promoted.user.role, "admin");
  assert.equal(promoted.user.canReceiveJobs, true, "promoted designers must retain their workload and tracker");

  const itemResponse = await fetch(`${baseUrl}/api/admin/operations/items`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      requestNo: "DTP0099001",
      client: "Operations Client",
      slides: "6",
      category: "Visual",
      dueText: "fri 3 pm",
      assignedUserId: createUser.user.id
    })
  });
  const itemData = await itemResponse.json();
  assert.equal(itemResponse.status, 201, JSON.stringify(itemData));
  const item = itemData.workItems.find((candidate) => candidate.requestNo === "DTP0099001");
  assert.ok(item);
  assert.equal(item.lane, "next");
  assert.equal(item.assignedUserId, createUser.user.id);
  assert.equal(item.deadlineText, "FRI 3PM");
  assert.equal(item.etaText, "");
  assert.equal(itemData.workItems.some((candidate) => candidate.requestNo === "DTP0000001"), false, "historical imported rows must not enter Operations");

  const designerStateResponse = await fetch(`${baseUrl}/api/state`, {
    headers: { cookie, "x-dtp-view-user": createUser.user.id }
  });
  const designerState = await designerStateResponse.json();
  const queuedTask = designerState.tasks.find((task) => task.requestNo === "DTP0099001");
  assert.ok(queuedTask, "assigned Operations item should create a private queued tracker row");
  assert.equal(queuedTask.startAt, null);

  const continueResponse = await fetch(`${baseUrl}/api/action`, {
    method: "POST",
    headers: { ...headers, "x-dtp-view-user": createUser.user.id },
    body: JSON.stringify({ type: "continueTask", taskId: queuedTask.id })
  });
  assert.equal(continueResponse.status, 200, JSON.stringify(await continueResponse.json()));

  const runningOperationsResponse = await fetch(`${baseUrl}/api/admin/operations`, { headers: { cookie } });
  const runningOperations = await runningOperationsResponse.json();
  assert.equal(runningOperations.workItems.find((candidate) => candidate.id === item.id).lane, "current");
  assert.equal(runningOperations.designers.find((entry) => entry.user.id === createUser.user.id).activeTask.requestNo, "DTP0099001");

  const endResponse = await fetch(`${baseUrl}/api/action`, {
    method: "POST",
    headers: { ...headers, "x-dtp-view-user": createUser.user.id },
    body: JSON.stringify({ type: "endJob" })
  });
  assert.equal(endResponse.status, 200, JSON.stringify(await endResponse.json()));

  const qcOperationsResponse = await fetch(`${baseUrl}/api/admin/operations`, { headers: { cookie } });
  const qcOperations = await qcOperationsResponse.json();
  assert.equal(qcOperations.workItems.find((candidate) => candidate.id === item.id).lane, "qc");

  const reworkResponse = await fetch(`${baseUrl}/api/admin/operations/items/${encodeURIComponent(item.id)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ action: "rework" })
  });
  const rework = await reworkResponse.json();
  assert.equal(reworkResponse.status, 200, JSON.stringify(rework));
  const reworkItem = rework.workItems.find((candidate) => candidate.id === item.id);
  assert.equal(reworkItem.lane, "rework");
  assert.equal(reworkItem.reworkCount, 1);
  assert.notEqual(reworkItem.taskId, queuedTask.id);

  const reworkStateResponse = await fetch(`${baseUrl}/api/state`, {
    headers: { cookie, "x-dtp-view-user": createUser.user.id }
  });
  const reworkState = await reworkStateResponse.json();
  const reworkTask = reworkState.tasks.find((task) => task.id === reworkItem.taskId);
  assert.ok(reworkTask, "sending QC rework should create a new private queued tracker row");
  assert.equal(reworkTask.startAt, null);

  const continueReworkResponse = await fetch(`${baseUrl}/api/action`, {
    method: "POST",
    headers: { ...headers, "x-dtp-view-user": createUser.user.id },
    body: JSON.stringify({ type: "continueTask", taskId: reworkTask.id })
  });
  assert.equal(continueReworkResponse.status, 200, JSON.stringify(await continueReworkResponse.json()));

  const endReworkResponse = await fetch(`${baseUrl}/api/action`, {
    method: "POST",
    headers: { ...headers, "x-dtp-view-user": createUser.user.id },
    body: JSON.stringify({ type: "endJob" })
  });
  assert.equal(endReworkResponse.status, 200, JSON.stringify(await endReworkResponse.json()));

  const secondQcResponse = await fetch(`${baseUrl}/api/admin/operations`, { headers: { cookie } });
  const secondQc = await secondQcResponse.json();
  assert.equal(secondQc.workItems.find((candidate) => candidate.id === item.id).lane, "qc");

  const approveResponse = await fetch(`${baseUrl}/api/admin/operations/items/${encodeURIComponent(item.id)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ action: "approve" })
  });
  const approved = await approveResponse.json();
  assert.equal(approveResponse.status, 200, JSON.stringify(approved));
  assert.equal(approved.workItems.find((candidate) => candidate.id === item.id).lane, "approved");

  const dismissApprovedResponse = await fetch(`${baseUrl}/api/admin/operations/items/${encodeURIComponent(item.id)}`, {
    method: "DELETE",
    headers
  });
  const dismissed = await dismissApprovedResponse.json();
  assert.equal(dismissApprovedResponse.status, 200, JSON.stringify(dismissed));
  assert.equal(dismissed.workItems.some((candidate) => candidate.id === item.id), false, "sent QC card should leave the approved board");

  const db = JSON.parse(await fs.readFile(path.join(dataDir, "tracker.json"), "utf8"));
  assert.equal(db.tasks.some((task) => task.requestNo === "DTP0000001"), true, "historical tracker data remains intact");
  assert.equal(db.tasks.some((task) => task.requestNo === "DTP0099001" && task.finishedAt), true, "dismissing an approved card preserves the finished tracker row");
  assert.equal(db.operations.workItems.some((candidate) => candidate.requestNo === "DTP0000001"), false);
});
