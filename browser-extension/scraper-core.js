(function attachDtpServiceNowCore(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DtpServiceNowCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function buildDtpServiceNowCore() {
  "use strict";

  function cleanText(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function normalize(value) {
    return cleanText(value)
      .toLowerCase()
      .replace(/column options/g, " ")
      .replace(/open record:/g, " ")
      .replace(/[^a-z0-9#]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeRequestNo(value) {
    const match = cleanText(value).toUpperCase().match(/\bDTP\d+\b/);
    return match ? match[0] : "";
  }

  function parseWholeNumber(value) {
    const text = cleanText(value).replace(/,/g, "");
    if (!/^\d+(?:\.0+)?$/.test(text)) return null;
    const number = Number(text);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  }

  function uniqueRequestNos(values) {
    const seen = new Set();
    const requests = [];
    for (const value of values || []) {
      const requestNo = normalizeRequestNo(value);
      if (!requestNo || seen.has(requestNo)) continue;
      seen.add(requestNo);
      requests.push(requestNo);
    }
    return requests;
  }

  function findHeader(headers, predicate) {
    return (headers || []).findIndex((header) => predicate(normalize(header)));
  }

  function requestHeaderIndexes(headers) {
    return {
      number: findHeader(headers, (header) => header === "number" || (header.includes("number") && !header.includes("slides"))),
      state: findHeader(headers, (header) => header === "state" || header.endsWith(" state")),
      category: findHeader(headers, (header) => header.includes("graphic design category")),
      slides: findHeader(headers, (header) => header.includes("number of slides"))
    };
  }

  function reportingHeaderIndexes(headers) {
    return {
      production: findHeader(headers, (header) => header === "production" || (header.includes("production") && !header.includes("time"))),
      minutes: findHeader(headers, (header) => header.includes("production time") && header.includes("min"))
    };
  }

  function parseRequestMatrices(matrices, wantedRequestNo) {
    const requestNo = normalizeRequestNo(wantedRequestNo);
    let sawRequestTable = false;

    for (const matrix of matrices || []) {
      const indexes = requestHeaderIndexes(matrix.headers || []);
      if (indexes.number < 0 || indexes.category < 0 || indexes.slides < 0) continue;
      sawRequestTable = true;

      for (const row of matrix.rows || []) {
        const cells = row.cells || [];
        if (normalizeRequestNo(cells[indexes.number]) !== requestNo) continue;
        const link = row.links && row.links[indexes.number] ? cleanText(row.links[indexes.number]) : "";
        return {
          status: "matched",
          requestNo,
          state: indexes.state >= 0 ? cleanText(cells[indexes.state]) : "",
          category: cleanText(cells[indexes.category]),
          slides: parseWholeNumber(cells[indexes.slides]),
          recordUrl: link
        };
      }
    }

    return sawRequestTable
      ? { status: "not-found", requestNo }
      : { status: "waiting", requestNo };
  }

  function parseReportingMatrices(matrices, productionName) {
    const wantedName = normalize(productionName);
    let sawReportingTable = false;
    let minuteRows = 0;
    let minutes = 0;

    for (const matrix of matrices || []) {
      const indexes = reportingHeaderIndexes(matrix.headers || []);
      if (indexes.production < 0 || indexes.minutes < 0) continue;
      sawReportingTable = true;

      for (const row of matrix.rows || []) {
        const cells = row.cells || [];
        if (!wantedName || normalize(cells[indexes.production]) !== wantedName) continue;
        const value = parseWholeNumber(cells[indexes.minutes]);
        if (value === null) continue;
        minuteRows += 1;
        minutes += value;
      }
    }

    return {
      reportingTableFound: sawReportingTable,
      minutes: minuteRows ? minutes : null,
      minuteRows
    };
  }

  function mergeRecordDetails(listRecord, recordDetails) {
    const details = recordDetails || {};
    return {
      requestNo: normalizeRequestNo(listRecord && listRecord.requestNo),
      category: cleanText(details.category || (listRecord && listRecord.category)),
      slides: details.slides !== null && details.slides !== undefined
        ? parseWholeNumber(details.slides)
        : parseWholeNumber(listRecord && listRecord.slides),
      minutes: details.minutes !== null && details.minutes !== undefined
        ? parseWholeNumber(details.minutes)
        : null,
      minuteRows: parseWholeNumber(details.minuteRows) || 0,
      state: cleanText((listRecord && listRecord.state) || details.state),
      recordUrl: cleanText((listRecord && listRecord.recordUrl) || details.recordUrl)
    };
  }

  async function validateRequests(requestNos, productionName, adapter, onProgress) {
    const requests = uniqueRequestNos(requestNos);
    const records = [];
    const notFound = [];
    const warnings = [];

    for (let index = 0; index < requests.length; index += 1) {
      const requestNo = requests[index];
      if (onProgress) onProgress({ phase: "search", index, completed: index, total: requests.length, requestNo });
      try {
        const listRecord = await adapter.findRequest(requestNo);
        if (!listRecord || listRecord.status === "not-found") {
          notFound.push(requestNo);
          if (onProgress) onProgress({ phase: "done", index, completed: index + 1, total: requests.length, requestNo, status: "not-found" });
          continue;
        }
        if (listRecord.status === "login-required") {
          const error = new Error("Sign in to ServiceNow in the opened tab, then run validation again.");
          error.code = "LOGIN_REQUIRED";
          throw error;
        }
        if (listRecord.status !== "matched") throw new Error(`ServiceNow request ${requestNo} did not finish loading.`);

        let recordDetails = {};
        if (listRecord.recordUrl) {
          if (onProgress) onProgress({ phase: "record", index, completed: index, total: requests.length, requestNo });
          recordDetails = await adapter.readRequest(listRecord.recordUrl, productionName);
          if (recordDetails && recordDetails.status === "login-required") {
            const error = new Error("Sign in to ServiceNow in the opened tab, then run validation again.");
            error.code = "LOGIN_REQUIRED";
            throw error;
          }
        } else {
          warnings.push(`${requestNo}: record link was unavailable, so production minutes could not be read.`);
        }

        records.push(mergeRecordDetails(listRecord, recordDetails));
        if (recordDetails && recordDetails.reportingTableFound === false) {
          warnings.push(`${requestNo}: DTP Time Reportings did not finish loading.`);
        } else if (productionName && recordDetails && recordDetails.minutes === null) {
          warnings.push(`${requestNo}: no Production row matched "${productionName}".`);
        }
        if (onProgress) onProgress({ phase: "done", index, completed: index + 1, total: requests.length, requestNo, status: "matched" });
      } catch (error) {
        if (error && error.code === "LOGIN_REQUIRED") throw error;
        warnings.push(`${requestNo}: ${cleanText(error && error.message) || "validation failed"}`);
        if (onProgress) onProgress({ phase: "done", index, completed: index + 1, total: requests.length, requestNo, status: "error" });
      }
    }

    return { records, notFound, warnings, total: requests.length };
  }

  return {
    cleanText,
    normalize,
    normalizeRequestNo,
    parseWholeNumber,
    uniqueRequestNos,
    parseRequestMatrices,
    parseReportingMatrices,
    mergeRecordDetails,
    validateRequests
  };
});
