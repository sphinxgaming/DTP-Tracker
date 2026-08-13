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

test("admin permanently deletes another account and its private tracker data", async (t) => {
  const port = await freePort();
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dtp-admin-delete-test-"));
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
  const cookie = loginResponse.headers.getSetCookie?.()[0]?.split(";")[0]
    || loginResponse.headers.get("set-cookie").split(";")[0];

  const createResponse = await fetch(`${baseUrl}/api/admin/users`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      displayName: "Delete Me",
      username: "delete.me",
      password: "DeletePassword123!",
      role: "designer"
    })
  });
  const created = await createResponse.json();
  assert.equal(createResponse.status, 201, JSON.stringify(created));
  assert.equal(created.user.serviceNowProductionName, undefined);

  const taskResponse = await fetch(`${baseUrl}/api/tasks/manual`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      "x-dtp-view-user": created.user.id
    },
    body: JSON.stringify({
      rawJob: "DTP0099999 / Client / 1 Slides / MON 9AM",
      dateWorked: "2026-08-13",
      workedHours: "30"
    })
  });
  assert.equal(taskResponse.status, 201, JSON.stringify(await taskResponse.json()));

  const deleteResponse = await fetch(`${baseUrl}/api/admin/users/${encodeURIComponent(created.user.id)}`, {
    method: "DELETE",
    headers: { cookie }
  });
  const deleted = await deleteResponse.json();
  assert.equal(deleteResponse.status, 200, JSON.stringify(deleted));
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.deletedRows, 1);

  const usersResponse = await fetch(`${baseUrl}/api/admin/users`, { headers: { cookie } });
  const users = await usersResponse.json();
  assert.equal(users.users.some((user) => user.id === created.user.id), false);

  const db = JSON.parse(await fs.readFile(path.join(dataDir, "tracker.json"), "utf8"));
  assert.equal(db.tasks.some((task) => task.ownerId === created.user.id), false);
  assert.equal(db.userSettings[created.user.id], undefined);
  assert.equal(db.userTimers[created.user.id], undefined);

  const selfDeleteResponse = await fetch(`${baseUrl}/api/admin/users/${encodeURIComponent(users.users[0].id)}`, {
    method: "DELETE",
    headers: { cookie }
  });
  const selfDelete = await selfDeleteResponse.json();
  assert.equal(selfDeleteResponse.status, 400);
  assert.match(selfDelete.error, /cannot delete your own/i);
});
