(function attachDtpServiceNowDom(root) {
  "use strict";

  const core = root.DtpServiceNowCore;
  if (!core) return;

  function textOf(element) {
    return core.cleanText(element && (element.innerText || element.textContent || ""));
  }

  function cellElements(row, selector) {
    return Array.from(row.querySelectorAll(selector)).filter((cell) => cell.closest("tr,[role='row']") === row);
  }

  function matrixFromRoot(table) {
    const rows = Array.from(table.querySelectorAll("tr,[role='row']"));
    const headerRow = rows.find((row) => row.querySelector("th,[role='columnheader']"));
    if (!headerRow) return null;
    const headerCells = cellElements(headerRow, "th,[role='columnheader']");
    if (!headerCells.length) return null;
    const headers = headerCells.map(textOf);
    const dataRows = [];

    for (const row of rows) {
      if (row === headerRow || row.querySelector("th,[role='columnheader']")) continue;
      const cells = cellElements(row, "td,[role='gridcell']");
      if (!cells.length) continue;
      dataRows.push({
        cells: cells.map(textOf),
        links: cells.map((cell) => {
          const link = cell.querySelector("a[href]");
          return link ? link.href : "";
        })
      });
    }
    return { headers, rows: dataRows };
  }

  function collectMatrices() {
    const roots = Array.from(document.querySelectorAll("[role='grid'],table"));
    const matrices = [];
    const signatures = new Set();
    for (const table of roots) {
      const matrix = matrixFromRoot(table);
      if (!matrix) continue;
      const signature = `${matrix.headers.join("|")}::${matrix.rows.length}`;
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      matrices.push(matrix);
    }
    return matrices;
  }

  function loginRequired() {
    if (/login\.do|sso/i.test(location.href)) return true;
    const password = document.querySelector("input[type='password']");
    const loginButton = Array.from(document.querySelectorAll("button,input[type='submit']"))
      .some((element) => /log\s*in|sign\s*in/i.test(textOf(element) || element.value || ""));
    return Boolean(password && loginButton);
  }

  function controlDescriptor(control) {
    const labels = control.labels ? Array.from(control.labels).map(textOf).join(" ") : "";
    return core.normalize([
      control.getAttribute("aria-label"),
      control.getAttribute("title"),
      control.getAttribute("name"),
      control.id,
      labels
    ].filter(Boolean).join(" "));
  }

  function controlValue(control) {
    if (!control) return "";
    if (control.tagName === "SELECT") {
      return core.cleanText(control.selectedOptions && control.selectedOptions[0]
        ? control.selectedOptions[0].textContent
        : control.value);
    }
    return core.cleanText(control.value || control.getAttribute("value") || textOf(control));
  }

  function findControlValue(needle) {
    const wanted = core.normalize(needle);
    const controls = Array.from(document.querySelectorAll("input,select,textarea"));
    const exact = controls.find((control) => controlDescriptor(control) === wanted);
    if (exact) return controlValue(exact);
    const partial = controls.find((control) => controlDescriptor(control).includes(wanted));
    return controlValue(partial);
  }

  function scrapeRequest(requestNo) {
    if (loginRequired()) return { status: "login-required", requestNo: core.normalizeRequestNo(requestNo) };
    return core.parseRequestMatrices(collectMatrices(), requestNo);
  }

  function scrapeRecord(productionName) {
    if (loginRequired()) return { status: "login-required" };
    const reporting = core.parseReportingMatrices(collectMatrices(), productionName);
    const category = findControlValue("Graphic Design Category");
    const slides = core.parseWholeNumber(findControlValue("Number Of Slides"));
    const hasUsefulData = Boolean(category || slides !== null || reporting.reportingTableFound);
    if (!hasUsefulData) return { status: "waiting" };
    return {
      status: "matched",
      category,
      slides,
      minutes: reporting.minutes,
      minuteRows: reporting.minuteRows,
      reportingTableFound: reporting.reportingTableFound,
      recordUrl: location.href
    };
  }

  root.DtpServiceNowDom = { scrapeRequest, scrapeRecord, collectMatrices, findControlValue };
})(typeof globalThis !== "undefined" ? globalThis : this);
