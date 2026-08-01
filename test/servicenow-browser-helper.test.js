const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../browser-extension/scraper-core.js");

test("browser helper parses the real Closed DTP Requests sample", () => {
  const matrices = [{
    headers: [
      "Personalize List",
      "Actions",
      "Created column optionsCreated",
      "Number column optionsNumber",
      "State column optionsState",
      "Requester Name column optionsRequester Name",
      "Deadline column optionsDeadline",
      "Submission Time column optionsSubmission Time",
      "Assigned to column optionsAssigned to",
      "Number Of Slides column optionsNumber Of Slides",
      "Graphic Design Category column optionsGraphic Design Category"
    ],
    rows: [{
      cells: [
        "",
        "",
        "2025-09-17 01:39:15",
        "DTP0031176",
        "Closed Complete",
        "Lynn Arakji",
        "2025-09-16 19:59:13",
        "",
        "Bryan Logapo",
        "5",
        "Presentation Design"
      ],
      links: [
        "",
        "",
        "",
        "https://fticonsulting.service-now.com/u_dtp_request.do?sys_id=2e085855fbcc72944900fe5755efdccf"
      ]
    }]
  }];

  const result = core.parseRequestMatrices(matrices, "dtp0031176");
  assert.deepEqual(result, {
    status: "matched",
    requestNo: "DTP0031176",
    state: "Closed Complete",
    category: "Presentation Design",
    slides: 5,
    recordUrl: "https://fticonsulting.service-now.com/u_dtp_request.do?sys_id=2e085855fbcc72944900fe5755efdccf"
  });
});

test("browser helper totals only the selected designer production minutes", () => {
  const matrices = [{
    headers: [
      "Personalize List",
      "Actions",
      "Coordination Name column optionsCoordination Name",
      "Coordination time (in mins) column optionsCoordination time (in mins)",
      "Proof-reading column optionsProof-reading",
      "Proof-reading time (in mins) column optionsProof-reading time (in mins)",
      "Production column optionsProduction",
      "Production time (in mins) column optionsProduction time (in mins)"
    ],
    rows: [
      { cells: ["", "", "Devaraj Moorthy", "5", "Amit Shetkar", "5", "Bryan Logapo", "95"] },
      { cells: ["", "", "", "", "", "", "Other Designer", "120"] },
      { cells: ["", "", "", "", "", "", "Bryan Logapo", "0"] }
    ]
  }];

  const result = core.parseReportingMatrices(matrices, "Bryan Logapo");
  assert.deepEqual(result, {
    reportingTableFound: true,
    minutes: 95,
    minuteRows: 2
  });
});

test("sample run searches unique request numbers one by one and remains read-only", async () => {
  const calls = [];
  const adapter = {
    async findRequest(requestNo) {
      calls.push(["find", requestNo]);
      if (requestNo === "DTP0039999") return { status: "not-found", requestNo };
      return {
        status: "matched",
        requestNo,
        state: "Closed Complete",
        category: "Presentation Design",
        slides: 5,
        recordUrl: "https://fticonsulting.service-now.com/u_dtp_request.do?sys_id=sample"
      };
    },
    async readRequest(recordUrl, productionName) {
      calls.push(["read", recordUrl, productionName]);
      return {
        status: "matched",
        category: "Presentation Design",
        slides: 5,
        minutes: 95,
        minuteRows: 1,
        reportingTableFound: true
      };
    }
  };
  const progress = [];

  const report = await core.validateRequests(
    ["DTP0031176", "DTP0031176", "DTP0039999"],
    "Bryan Logapo",
    adapter,
    (item) => progress.push(item)
  );

  assert.deepEqual(calls, [
    ["find", "DTP0031176"],
    ["read", "https://fticonsulting.service-now.com/u_dtp_request.do?sys_id=sample", "Bryan Logapo"],
    ["find", "DTP0039999"]
  ]);
  assert.equal(report.total, 2);
  assert.equal(report.records.length, 1);
  assert.deepEqual(report.records[0], {
    requestNo: "DTP0031176",
    category: "Presentation Design",
    slides: 5,
    minutes: 95,
    minuteRows: 1,
    state: "Closed Complete",
    recordUrl: "https://fticonsulting.service-now.com/u_dtp_request.do?sys_id=sample"
  });
  assert.deepEqual(report.notFound, ["DTP0039999"]);
  assert.equal(progress.at(-1).completed, 2);
  assert.ok(calls.every(([method]) => method === "find" || method === "read"));
});
