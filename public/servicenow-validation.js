(() => {
  const DEFAULT_PRODUCTION_NAME = "Bryan Logapo";
  const VERSION = "20260708-servicenow-validation";
  let modal = null;
  let lastValidation = null;

  document.addEventListener("DOMContentLoaded", initServiceNowValidation);

  function initServiceNowValidation() {
    const actions = document.querySelector(".export-actions");
    if (!actions || document.getElementById("validateServiceNowBtn")) return;

    const button = document.createElement("button");
    button.id = "validateServiceNowBtn";
    button.type = "button";
    button.textContent = "Validate ServiceNow";
    button.title = "Validate only the currently visible tracker rows against a ServiceNow export or pasted table.";

    const exportButton = document.getElementById("exportBtn");
    actions.insertBefore(button, exportButton || null);
    button.addEventListener("click", openValidationModal);
    exposeTestApi();
  }

  function openValidationModal() {
    if (!modal) modal = buildValidationModal();
    const rows = getVisibleTasks();
    modal.querySelector("[data-sn-visible-count]").textContent = String(rows.length);
    modal.querySelector("[data-sn-summary]").innerHTML = "";
    modal.querySelector("[data-sn-report]").innerHTML = "";
    modal.querySelector("[data-sn-apply]").disabled = true;
    modal.hidden = false;
    modal.querySelector("[data-sn-text]").focus();
  }

  function closeValidationModal() {
    if (modal) modal.hidden = true;
  }

  function buildValidationModal() {
    const root = document.createElement("div");
    root.id = "serviceNowValidationModal";
    root.className = "sn-modal-backdrop";
    root.hidden = true;
    root.innerHTML = `
      <div class="sn-modal" role="dialog" aria-modal="true" aria-labelledby="snValidationTitle">
        <header class="sn-modal-head">
          <div>
            <p>ServiceNow validation</p>
            <h2 id="snValidationTitle">Validate visible tracker rows</h2>
          </div>
          <button type="button" class="sn-close" data-sn-close aria-label="Close validation">Close</button>
        </header>
        <div class="sn-modal-body">
          <section class="sn-validation-grid">
            <div class="sn-input-panel">
              <p class="sn-note">
                Export or copy the ServiceNow Closed DTP Requests table, then paste it here. The tracker stays read-only against ServiceNow and checks only the visible rows after your current filters.
              </p>
              <div class="sn-inline-fields">
                <label>
                  Production name
                  <input data-sn-production type="text" value="${escapeAttr(localStorage.getItem("serviceNowProductionName") || DEFAULT_PRODUCTION_NAME)}">
                </label>
                <label>
                  ServiceNow file
                  <input data-sn-file type="file" accept=".csv,.tsv,.txt,.html,.htm">
                </label>
              </div>
              <label class="sn-paste-label">
                Paste ServiceNow CSV, TSV, copied table, or HTML table
                <textarea data-sn-text rows="10" spellcheck="false" placeholder="Number, Graphic Design Category, Number Of Slides, Production, Production time (in mins)"></textarea>
              </label>
              <div class="sn-actions">
                <button type="button" data-sn-run>Validate visible (<span data-sn-visible-count>0</span>)</button>
                <button type="button" data-sn-apply disabled>Apply category fills</button>
              </div>
            </div>
            <div class="sn-help-panel">
              <h3>What it checks</h3>
              <ul>
                <li><strong>Graphic Design Category</strong> can be applied to tracker Category of work.</li>
                <li><strong>Number Of Slides</strong> is compared only.</li>
                <li><strong>Production time (in mins)</strong> for the selected Production name is compared only.</li>
                <li>ServiceNow is never changed by this tracker.</li>
              </ul>
              <p class="sn-note">If ServiceNow gives Excel only, save/export it as CSV first. Browser validation cannot use your logged-in ServiceNow session directly because of authentication and CORS.</p>
            </div>
          </section>
          <section class="sn-summary" data-sn-summary></section>
          <section class="sn-report" data-sn-report></section>
        </div>
      </div>
    `;
    document.body.append(root);

    root.querySelector("[data-sn-close]").addEventListener("click", closeValidationModal);
    root.addEventListener("click", (event) => {
      if (event.target === root) closeValidationModal();
    });
    root.querySelector("[data-sn-file]").addEventListener("change", handleValidationFile);
    root.querySelector("[data-sn-run]").addEventListener("click", runValidationFromModal);
    root.querySelector("[data-sn-apply]").addEventListener("click", applyCategoryFills);
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeValidationModal();
    });

    return root;
  }

  async function handleValidationFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !modal) return;

    const lowerName = file.name.toLowerCase();
    if (/\.(xlsx|xlsm|xls)$/.test(lowerName)) {
      showValidationToast("Please export the ServiceNow list as CSV or HTML first. XLSX cannot be read safely in the browser validator.");
      return;
    }

    try {
      const text = await file.text();
      modal.querySelector("[data-sn-text]").value = text;
      showValidationToast(`Loaded ${file.name}.`);
    } catch (error) {
      showValidationToast(error.message);
    }
  }

  function runValidationFromModal() {
    if (!modal) return;
    const text = modal.querySelector("[data-sn-text]").value;
    const productionName = modal.querySelector("[data-sn-production]").value.trim() || DEFAULT_PRODUCTION_NAME;
    localStorage.setItem("serviceNowProductionName", productionName);

    const visibleTasks = getVisibleTasks();
    if (!visibleTasks.length) {
      showValidationToast("No visible tracker rows to validate.");
      return;
    }

    const sourceRows = parseServiceNowText(text);
    if (!sourceRows.length) {
      showValidationToast("No ServiceNow rows found. Paste or load an exported table first.");
      return;
    }

    const sourceMap = buildServiceNowMap(sourceRows, productionName);
    lastValidation = validateVisibleTasks(visibleTasks, sourceMap);
    renderValidationResult(lastValidation, productionName, sourceRows.length);
  }

  async function applyCategoryFills() {
    if (!lastValidation) return;
    const updates = lastValidation.rows.filter((row) => row.canApplyCategory);
    if (!updates.length) {
      showValidationToast("No category fills to apply.");
      return;
    }
    if (!confirm(`Apply ServiceNow category to ${updates.length} visible tracker row(s)? Slides and minutes will not be changed.`)) {
      return;
    }

    const button = modal.querySelector("[data-sn-apply]");
    button.disabled = true;
    button.textContent = "Applying...";
    try {
      for (const item of updates) {
        await trackerApi(`/api/tasks/${encodeURIComponent(item.task.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ category: item.serviceNow.category })
        });
      }
      showValidationToast(`Applied ${updates.length} category update(s).`);
      await reloadTrackerState();
      closeValidationModal();
    } catch (error) {
      showValidationToast(error.message);
      button.disabled = false;
    } finally {
      button.textContent = "Apply category fills";
    }
  }

  function renderValidationResult(result, productionName, sourceRowCount) {
    const summary = modal.querySelector("[data-sn-summary]");
    const report = modal.querySelector("[data-sn-report]");
    const applyButton = modal.querySelector("[data-sn-apply]");

    summary.innerHTML = `
      <div class="sn-metric"><span>Visible rows</span><strong>${result.total}</strong></div>
      <div class="sn-metric"><span>SN rows read</span><strong>${sourceRowCount}</strong></div>
      <div class="sn-metric"><span>Matched</span><strong>${result.matched}</strong></div>
      <div class="sn-metric warning"><span>Missing</span><strong>${result.missing}</strong></div>
      <div class="sn-metric info"><span>Category fills</span><strong>${result.categoryUpdates}</strong></div>
      <div class="sn-metric danger"><span>Slides mismatch</span><strong>${result.slideMismatches}</strong></div>
      <div class="sn-metric danger"><span>Minutes mismatch</span><strong>${result.minuteMismatches}</strong></div>
    `;

    const rowsHtml = result.rows.map((row) => validationRowHtml(row)).join("");
    report.innerHTML = `
      <div class="sn-report-head">
        <strong>Production checked: ${escapeHtml(productionName)}</strong>
        <span>Category can be applied. Slides and minutes are report-only.</span>
      </div>
      <div class="sn-report-table-wrap">
        <table class="sn-report-table">
          <thead>
            <tr>
              <th>Tracker date</th>
              <th>Request #</th>
              <th>Tracker category</th>
              <th>ServiceNow category</th>
              <th>Slides</th>
              <th>Mins</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
    applyButton.disabled = result.categoryUpdates === 0;
  }

  function validationRowHtml(row) {
    if (!row.serviceNow) {
      return `
        <tr class="sn-row-missing">
          <td>${escapeHtml(displayDate(row.task.dateWorked))}</td>
          <td>${escapeHtml(row.task.requestNo || "")}</td>
          <td>${escapeHtml(row.task.category || "")}</td>
          <td>--</td>
          <td>${escapeHtml(displayCompare(row.trackerSlides, null))}</td>
          <td>${escapeHtml(displayCompare(row.trackerMinutes, null))}</td>
          <td>Missing in ServiceNow export</td>
        </tr>
      `;
    }

    const status = [];
    if (row.canApplyCategory) status.push("Category fill");
    if (row.slidesMismatch) status.push("Slides mismatch");
    if (row.minutesMismatch) status.push("Minutes mismatch");
    if (!status.length) status.push("OK");

    return `
      <tr class="${status.includes("OK") ? "sn-row-ok" : "sn-row-check"}">
        <td>${escapeHtml(displayDate(row.task.dateWorked))}</td>
        <td>${escapeHtml(row.task.requestNo || "")}</td>
        <td>${escapeHtml(row.task.category || "")}</td>
        <td>${escapeHtml(row.serviceNow.category || "--")}</td>
        <td class="${row.slidesMismatch ? "sn-bad" : ""}">${escapeHtml(displayCompare(row.trackerSlides, row.serviceNow.slides))}</td>
        <td class="${row.minutesMismatch ? "sn-bad" : ""}">${escapeHtml(displayCompare(row.trackerMinutes, row.serviceNow.productionMinutes))}</td>
        <td>${escapeHtml(status.join(", "))}</td>
      </tr>
    `;
  }

  function parseServiceNowText(text) {
    const raw = String(text || "").trim();
    if (!raw) return [];
    if (/<\s*(table|tr|td|th)\b/i.test(raw)) {
      return parseHtmlRows(raw);
    }
    return parseDelimitedRows(raw);
  }

  function parseHtmlRows(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const matrices = Array.from(doc.querySelectorAll("table")).map((table) =>
      Array.from(table.querySelectorAll("tr")).map((tr) =>
        Array.from(tr.querySelectorAll("th,td")).map((cell) => cleanCell(cell.textContent))
      ).filter((row) => row.some(Boolean))
    );
    if (!matrices.length) {
      matrices.push(Array.from(doc.querySelectorAll("tr")).map((tr) =>
        Array.from(tr.querySelectorAll("th,td")).map((cell) => cleanCell(cell.textContent))
      ).filter((row) => row.some(Boolean)));
    }
    return matrices.flatMap(matrixToObjects);
  }

  function parseDelimitedRows(text) {
    const lines = String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return [];

    const delimiter = detectDelimiter(lines);
    const matrix = lines.map((line) => parseDelimitedLine(line, delimiter).map(cleanCell));
    return matrixToObjects(matrix);
  }

  function detectDelimiter(lines) {
    const sample = lines.slice(0, 10).join("\n");
    const tabs = (sample.match(/\t/g) || []).length;
    const commas = (sample.match(/,/g) || []).length;
    const semicolons = (sample.match(/;/g) || []).length;
    if (tabs >= commas && tabs >= semicolons && tabs > 0) return "\t";
    if (semicolons > commas) return ";";
    return ",";
  }

  function parseDelimitedLine(line, delimiter) {
    const cells = [];
    let value = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === delimiter && !quoted) {
        cells.push(value);
        value = "";
      } else {
        value += char;
      }
    }
    cells.push(value);
    return cells;
  }

  function matrixToObjects(matrix) {
    const headerIndex = matrix.findIndex((row) => row.some((cell) => classifyHeader(cell) === "requestNo"));
    if (headerIndex < 0) return [];
    const headers = matrix[headerIndex].map(classifyHeader);
    return matrix.slice(headerIndex + 1).map((row) => {
      const object = {};
      for (let i = 0; i < headers.length; i += 1) {
        const key = headers[i];
        if (!key || object[key]) continue;
        object[key] = cleanCell(row[i]);
      }
      return object;
    }).filter((row) => normalizeRequestNo(row.requestNo));
  }

  function classifyHeader(header) {
    const normalized = String(header || "").toLowerCase().replace(/[^a-z0-9#]+/g, "");
    if (!normalized) return "";
    if (
      normalized === "request#" ||
      normalized === "requestno" ||
      normalized === "requestnumber" ||
      normalized === "number" ||
      normalized.includes("dtprequest") ||
      normalized.includes("request#")
    ) return "requestNo";
    if (normalized.includes("graphicdesigncategory") || normalized === "category" || normalized.includes("categoryofwork")) return "category";
    if (normalized.includes("numberofslides") || normalized.includes("#ofslides") || normalized === "slides") return "slides";
    if (normalized.includes("productiontime") || normalized.includes("timeinmins") || normalized.includes("productionmins") || normalized.includes("mins")) return "productionMinutes";
    if (normalized === "production" || normalized.includes("productionname") || normalized.includes("assignedproduction")) return "productionName";
    return "";
  }

  function buildServiceNowMap(rows, productionName) {
    const map = new Map();
    for (const row of rows) {
      const requestNo = normalizeRequestNo(row.requestNo);
      if (!requestNo) continue;
      const current = map.get(requestNo) || {
        requestNo,
        category: "",
        slides: null,
        productionMinutes: null,
        productionRows: 0
      };
      if (!current.category && cleanCell(row.category)) current.category = cleanCell(row.category);
      const slides = parseWholeNumber(row.slides);
      if (slides !== null) current.slides = slides;

      const minutes = parseMinutes(row.productionMinutes);
      if (minutes !== null && matchesProductionName(row.productionName, productionName)) {
        current.productionMinutes = (current.productionMinutes || 0) + minutes;
        current.productionRows += 1;
      }
      map.set(requestNo, current);
    }
    return map;
  }

  function validateVisibleTasks(tasks, sourceMap) {
    const rows = tasks.map((task) => {
      const requestNo = normalizeRequestNo(task.requestNo);
      const serviceNow = sourceMap.get(requestNo) || null;
      const trackerSlides = parseWholeNumber(task.slides);
      const trackerMinutes = task.durationSeconds === null || task.durationSeconds === undefined
        ? null
        : Math.round(Math.max(0, Number(task.durationSeconds) || 0) / 60);
      const trackerCategory = cleanCategory(task.category);
      const serviceNowCategory = serviceNow ? cleanCategory(serviceNow.category) : "";
      const canApplyCategory = Boolean(serviceNowCategory && trackerCategory !== serviceNowCategory);
      const slidesMismatch = Boolean(serviceNow && serviceNow.slides !== null && trackerSlides !== null && trackerSlides !== serviceNow.slides);
      const minutesMismatch = Boolean(serviceNow && serviceNow.productionMinutes !== null && trackerMinutes !== null && trackerMinutes !== serviceNow.productionMinutes);
      return {
        task,
        serviceNow,
        trackerSlides,
        trackerMinutes,
        canApplyCategory,
        slidesMismatch,
        minutesMismatch
      };
    });

    return {
      total: rows.length,
      matched: rows.filter((row) => row.serviceNow).length,
      missing: rows.filter((row) => !row.serviceNow).length,
      categoryUpdates: rows.filter((row) => row.canApplyCategory).length,
      slideMismatches: rows.filter((row) => row.slidesMismatch).length,
      minuteMismatches: rows.filter((row) => row.minutesMismatch).length,
      rows
    };
  }

  function getVisibleTasks() {
    try {
      if (typeof filteredTasks === "function") return filteredTasks();
    } catch {
      return [];
    }
    return [];
  }

  async function trackerApi(path, options = {}) {
    const response = await fetch(path, {
      headers: {
        "content-type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Request failed: ${response.status}`);
    }
    return payload;
  }

  async function reloadTrackerState() {
    if (typeof loadState === "function") {
      await loadState(true, { preserveScroll: true });
    } else {
      window.location.reload();
    }
  }

  function matchesProductionName(value, productionName) {
    if (!productionName) return true;
    if (!value) return true;
    const haystack = String(value).toLowerCase();
    return productionName
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((part) => haystack.includes(part));
  }

  function normalizeRequestNo(value) {
    const text = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
    const match = text.match(/DTP\d+/);
    return match ? match[0] : "";
  }

  function cleanCategory(value) {
    const text = cleanCell(value);
    return /^other\s*\/?\s*type$/i.test(text) ? "" : text;
  }

  function parseWholeNumber(value) {
    const text = String(value ?? "").replace(/,/g, "").trim();
    if (!text || /^--+$/.test(text)) return null;
    const match = text.match(/-?\d+(\.\d+)?/);
    if (!match) return null;
    return Math.round(Number(match[0]));
  }

  function parseMinutes(value) {
    const text = String(value ?? "").replace(/,/g, "").trim();
    if (!text || /^--+$/.test(text)) return null;
    const hhmm = text.match(/^(\d{1,3}):(\d{2})$/);
    if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2]);
    const match = text.match(/-?\d+(\.\d+)?/);
    if (!match) return null;
    return Math.round(Number(match[0]));
  }

  function displayCompare(trackerValue, serviceNowValue) {
    const left = trackerValue === null || trackerValue === undefined ? "--" : String(trackerValue);
    const right = serviceNowValue === null || serviceNowValue === undefined ? "--" : String(serviceNowValue);
    return `${left} / ${right}`;
  }

  function displayDate(value) {
    if (typeof formatDateWorkedWithYear === "function") return formatDateWorkedWithYear(value);
    return String(value || "");
  }

  function cleanCell(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function showValidationToast(message) {
    if (typeof showToast === "function") {
      showToast(message);
      return;
    }
    alert(message);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function exposeTestApi() {
    window.__serviceNowValidation = {
      version: VERSION,
      parseServiceNowText,
      buildServiceNowMap,
      validateVisibleTasks,
      normalizeRequestNo,
      parseMinutes,
      parseWholeNumber
    };
  }
})();
