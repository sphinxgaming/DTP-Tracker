const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
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

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
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

test("visible rows validate through OAuth and aggregate by request", async (t) => {
  const trackerPort = await freePort();
  const serviceNowPort = await freePort();
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dtp-sn-test-"));
  let tokenRequests = 0;
  const serviceNowMethods = [];

  const mockServiceNow = http.createServer(async (req, res) => {
    serviceNowMethods.push(`${req.method} ${req.url.split("?")[0]}`);
    if (req.method === "POST" && req.url === "/oauth_token.do") {
      tokenRequests += 1;
      let body = "";
      for await (const chunk of req) body += chunk;
      const params = new URLSearchParams(body);
      assert.equal(params.get("grant_type"), "client_credentials");
      assert.equal(params.get("client_id"), "test-client");
      assert.equal(params.get("client_secret"), "test-secret");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ access_token: "mock-token", expires_in: 600 }));
      return;
    }

    assert.equal(req.headers.authorization, "Bearer mock-token");
    const url = new URL(req.url, `http://127.0.0.1:${serviceNowPort}`);
    res.writeHead(200, { "content-type": "application/json" });
    if (url.pathname === "/api/now/table/u_dtp_request") {
      res.end(JSON.stringify({
        result: [{
          sys_id: { value: "request-sys-id", display_value: "request-sys-id" },
          number: { value: "DTP0012345", display_value: "DTP0012345" },
          u_graphic_design_category: { value: "Presentation Design", display_value: "Presentation Design" },
          u_number_of_slides: { value: "5", display_value: "5" }
        }]
      }));
      return;
    }
    if (url.pathname === "/api/now/table/u_dtp_time_reporting") {
      res.end(JSON.stringify({
        result: [{
          u_dtp_request: { value: "request-sys-id", display_value: "DTP0012345" },
          u_production: { value: "designer-id", display_value: "Alice Designer" },
          u_production_time_in_mins: { value: "90", display_value: "90" }
        }]
      }));
      return;
    }
    res.end(JSON.stringify({ result: [] }));
  });
  await listen(mockServiceNow, serviceNowPort);

  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(trackerPort),
      DATA_DIR: dataDir,
      SEED_DB_FILE: path.join(dataDir, "missing-seed.json"),
      ADMIN_BOOTSTRAP_USERNAME: "alice",
      ADMIN_BOOTSTRAP_DISPLAY_NAME: "Alice Designer",
      ADMIN_BOOTSTRAP_PASSWORD: "TestPassword123!",
      SERVICENOW_INSTANCE_URL: `http://127.0.0.1:${serviceNowPort}`,
      SERVICENOW_REQUEST_TABLE: "u_dtp_request",
      SERVICENOW_REPORTING_TABLE: "u_dtp_time_reporting",
      SERVICENOW_REPORTING_PARENT_FIELD: "u_dtp_request",
      SERVICENOW_OAUTH_CLIENT_ID: "test-client",
      SERVICENOW_OAUTH_CLIENT_SECRET: "test-secret",
      SERVICENOW_OAUTH_GRANT_TYPE: "client_credentials"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const output = [];
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));

  t.after(async () => {
    child.kill();
    mockServiceNow.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${trackerPort}`;
  await waitForHealth(baseUrl, child);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "alice", password: "TestPassword123!" })
  });
  assert.equal(loginResponse.status, 200, output.join(""));
  const cookie = loginResponse.headers.getSetCookie?.()[0]?.split(";")[0]
    || loginResponse.headers.get("set-cookie").split(";")[0];

  const createRow = async (slides, minutes) => {
    const response = await fetch(`${baseUrl}/api/tasks/manual`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        rawJob: `DTP0012345 / Client A / ${slides} Slides / MON 9AM`,
        dateWorked: "2026-07-15",
        workedHours: String(minutes),
        category: "Visual"
      })
    });
    const payload = await response.json();
    assert.equal(response.status, 201, JSON.stringify(payload));
    return payload;
  };

  await createRow(2, 30);
  const state = await createRow(3, 60);
  const rows = state.tasks.filter((task) => task.requestNo === "DTP0012345");
  assert.equal(rows.length, 2);

  const configResponse = await fetch(`${baseUrl}/api/servicenow/config`, { headers: { cookie } });
  const config = await configResponse.json();
  assert.equal(config.configured, true);
  assert.equal(config.authMode, "oauth-client-credentials");
  assert.equal(config.productionName, "Alice Designer");

  const validationResponse = await fetch(`${baseUrl}/api/servicenow/validate`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ rows: rows.map((row) => ({ id: row.id, requestNo: row.requestNo })) })
  });
  const report = await validationResponse.json();
  assert.equal(validationResponse.status, 200, JSON.stringify(report));

  assert.equal(report.totalRequestedRows, 2);
  assert.equal(report.totalRequests, 1);
  assert.equal(report.totalProcessed, 1);
  assert.equal(report.categoryUpdatedRows, 2);
  assert.equal(report.slideMismatches, 0);
  assert.equal(report.minuteMismatches, 0);
  assert.equal(report.results[0].tracker.slides, 5);
  assert.equal(report.results[0].tracker.minutes, 90);
  assert.equal(report.results[0].serviceNow.slides, 5);
  assert.equal(report.results[0].serviceNow.minutes, 90);
  assert.ok(report.state.tasks.filter((task) => task.requestNo === "DTP0012345").every((task) => task.category === "Presentation Design"));
  assert.equal(tokenRequests, 1);
  assert.deepEqual(serviceNowMethods.filter((entry) => entry.includes("/api/now/table/")), [
    "GET /api/now/table/u_dtp_request",
    "GET /api/now/table/u_dtp_time_reporting"
  ]);
});
