(() => {
  const VERSION = "20260802-minute-review-1";
  const PAGE_SOURCE = "dtp-tracker-page";
  const HELPER_SOURCE = "dtp-servicenow-helper";
  let modal = null;
  let visibleRows = [];
  let running = false;
  let lastConfig = {};
  let helperVersion = "";
  let lastReportResults = [];
  const minuteReviewState = new Map();

  document.addEventListener("DOMContentLoaded", initServiceNowValidation);

  function initServiceNowValidation() {
    const actions = document.querySelector(".export-actions");
    if (!actions || document.getElementById("validateServiceNowBtn")) return;

    const button = document.createElement("button");
    button.id = "validateServiceNowBtn";
    button.type = "button";
    button.textContent = "Validate ServiceNow";
    button.title = "Validate visible rows through the read-only ServiceNow browser helper or approved API.";
    actions.insertBefore(button, document.getElementById("exportBtn") || null);
    button.addEventListener("click", openValidation);

    window.dtpServiceNowValidation = {
      version: VERSION,
      open: openValidation
    };
  }

  function getVisibleRows() {
    try {
      return typeof filteredTasks === "function" ? filteredTasks() : [];
    } catch {
      return [];
    }
  }

  function openValidation() {
    visibleRows = getVisibleRows();
    if (!visibleRows.length) {
      notify("No visible tracker rows to validate.");
      return;
    }
    if (!modal) modal = buildModal();
    modal.hidden = false;
    runValidation();
  }

  function closeValidation() {
    if (modal) modal.hidden = true;
  }

  function buildModal() {
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
          <button type="button" class="sn-close" data-sn-close>Close</button>
        </header>
        <div class="sn-modal-body">
          <div class="sn-validation-grid">
            <section class="sn-input-panel" data-sn-main></section>
            <aside class="sn-help-panel">
              <h3>Read-only validation</h3>
              <ul>
                <li>Uses only rows visible after the current filters.</li>
                <li>Groups repeated rows by Request #.</li>
                <li>Totals tracker slides and worked minutes per request.</li>
                <li>Updates Category of work only.</li>
                <li>Keeps ServiceNow completely read-only.</li>
              </ul>
              <p class="sn-note"><strong>Browser helper</strong> uses the designer's normal signed-in ServiceNow tab. No OAuth application or exported file is required.</p>
              <p class="sn-note"><strong>Optional API mode</strong> is available only when IT provides an approved read-only integration.</p>
              <p class="sn-note">No validation mode uses Codex or writes anything to ServiceNow.</p>
              <div class="sn-setup-card" data-sn-identity></div>
            </aside>
          </div>
          <section class="sn-report" data-sn-report></section>
        </div>
      </div>
    `;
    document.body.append(root);
    root.querySelector("[data-sn-close]").addEventListener("click", closeValidation);
    root.addEventListener("click", (event) => {
      if (event.target === root) closeValidation();
      if (event.target.matches("[data-sn-run-again]")) {
        visibleRows = getVisibleRows();
        runValidation();
      }
      if (event.target.matches("[data-sn-show-export]")) renderExportMode(lastConfig);
      if (event.target.matches("[data-sn-run-export]")) runExportValidation();
      if (event.target.matches("[data-sn-download-minute-review]")) downloadMinuteReviewCsv();
    });
    root.addEventListener("change", (event) => {
      if (event.target.matches("[data-sn-export-files]")) updateExportFileSummary(event.target.files);
      if (event.target.matches("[data-sn-minute-decision]")) {
        updateMinuteReviewState(event.target.dataset.reviewKey, { decision: event.target.value });
      }
    });
    root.addEventListener("input", (event) => {
      if (event.target.matches("[data-sn-minute-note]")) {
        updateMinuteReviewState(event.target.dataset.reviewKey, { note: event.target.value });
      }
    });
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeValidation();
    });
    return root;
  }

  async function runValidation() {
    if (running || !modal) return;
    if (!visibleRows.length) {
      renderMessage("No visible tracker rows to validate.", "warning");
      return;
    }

    running = true;
    setButtonBusy(true);
    renderLoading();
    try {
      const config = await apiRequest("/api/servicenow/config");
      lastConfig = config;
      renderIdentity(config);
      const helper = await detectBrowserHelper();
      if (helper.available) {
        helperVersion = helper.version || "installed";
        renderIdentity(config);
        await runBrowserHelperValidation(config);
        return;
      }
      helperVersion = "";
      renderIdentity(config);
      if (config.configured) {
        await runApiValidation(config);
      } else {
        renderSetupRequired(config);
      }
    } catch (error) {
      const payload = error.payload || {};
      lastConfig = { ...lastConfig, ...payload };
      renderIdentity(lastConfig);
      if (error.code === "LOGIN_REQUIRED") {
        renderExportMode(lastConfig, "ServiceNow opened a login page. Sign in there, then select Check helper again.", true);
      } else if (error.code && error.code.startsWith("HELPER_")) {
        renderExportMode(lastConfig, error.message || "The browser helper could not complete validation.", true);
      } else if (payload.configured === false || payload.missing) {
        renderSetupRequired(payload);
      } else {
        renderFailure(error.message || "ServiceNow validation failed.");
      }
    } finally {
      running = false;
      setButtonBusy(false);
    }
  }

  async function runApiValidation(config) {
    const report = await apiRequest("/api/servicenow/validate", {
      method: "POST",
      body: JSON.stringify({
        rows: visibleRows.map((row) => ({ id: row.id, requestNo: row.requestNo }))
      })
    });
    applyValidationState(report);
    renderIdentity({ ...config, productionName: report.productionName || config.productionName });
    renderReport(report);
    notify(`Validated ${report.totalProcessed || 0} ServiceNow request(s).`);
  }

  async function runBrowserHelperValidation(config) {
    const requestNos = Array.from(new Set(visibleRows.map((row) => String(row.requestNo || "").trim()).filter(Boolean)));
    if (!requestNos.length) throw helperError("HELPER_NO_REQUESTS", "The visible rows have no Request # values to search.");

    const helperResult = await browserHelperRequest("DTP_SN_VALIDATE", {
      requestNos,
      productionName: config.productionName || ""
    }, {
      timeoutMs: Math.max(180000, requestNos.length * 35000),
      onProgress: renderHelperProgress
    });
    if (!helperResult.ok) {
      const code = helperResult.code === "LOGIN_REQUIRED" ? "LOGIN_REQUIRED" : "HELPER_FAILED";
      throw helperError(code, helperResult.error || "Browser helper validation failed.");
    }

    const result = helperResult.result || {};
    const records = Array.isArray(result.records) ? result.records : [];
    if (!records.length) {
      const missing = Array.isArray(result.notFound) && result.notFound.length
        ? ` Not found: ${result.notFound.join(", ")}.`
        : "";
      throw helperError("HELPER_NO_MATCHES", `No visible Request # was found in Closed DTP Requests.${missing}`);
    }

    const report = await apiRequest("/api/servicenow/validate-export", {
      method: "POST",
      body: JSON.stringify({
        rows: visibleRows.map((row) => ({ id: row.id, requestNo: row.requestNo })),
        files: [],
        pastedText: buildBrowserHelperTsv(records, config.productionName || result.productionName || "")
      })
    });
    report.source = "browser-helper";
    report.warnings = [
      ...(Array.isArray(report.warnings) ? report.warnings : []),
      ...(Array.isArray(result.warnings) ? result.warnings : [])
    ];
    report.browserHelperVersion = result.version || helperVersion;
    applyValidationState(report);
    renderIdentity({ ...config, productionName: report.productionName || config.productionName });
    renderReport(report);
    notify(`Validated ${report.totalProcessed || 0} request(s) through the ServiceNow browser helper.`);
  }

  function applyValidationState(report) {
    if (!report?.state) return;
    try {
      if (typeof setState === "function") setState(report.state, { preserveScroll: true });
    } catch {
      // The comparison report remains usable if the surrounding table refresh fails.
    }
  }

  function renderHelperProgress(progress = {}) {
    if (!modal) return;
    const completed = Number(progress.completed || 0);
    const total = Number(progress.total || 0);
    const action = progress.phase === "record" ? "Reading details" : "Searching Closed DTP Requests";
    modal.querySelector("[data-sn-main]").innerHTML = `
      <div class="sn-status">${escapeHtml(action)}: ${escapeHtml(progress.requestNo || "")}</div>
      <div class="sn-summary">
        ${metric("Completed", `${completed} / ${total}`)}
        ${metric("Current request", progress.requestNo || "--")}
        ${metric("ServiceNow writes", "None", "info")}
      </div>
      <div class="sn-progress" aria-label="ServiceNow validation progress"><span style="width:${total ? Math.min(100, completed / total * 100) : 0}%"></span></div>
    `;
  }

  function buildBrowserHelperTsv(records, productionName) {
    const clean = (value) => String(value == null ? "" : value).replace(/[\t\r\n]+/g, " ").trim();
    const rows = [["Number", "Graphic Design Category", "Number Of Slides", "Production", "Production time (in mins)"]];
    for (const record of records) {
      rows.push([
        record.requestNo,
        record.category,
        record.slides ?? "",
        productionName,
        record.minutes ?? ""
      ]);
    }
    return rows.map((row) => row.map(clean).join("\t")).join("\n");
  }

  function helperError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  async function detectBrowserHelper() {
    try {
      const response = await browserHelperRequest("DTP_SN_PING", {}, { timeoutMs: 900 });
      return { available: response.type === "DTP_SN_READY", version: response.version || "" };
    } catch {
      return { available: false, version: "" };
    }
  }

  function browserHelperRequest(type, payload, options = {}) {
    const requestId = `sn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timeoutMs = Number(options.timeoutMs || 1000);
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(helperError("HELPER_NOT_FOUND", "DTP ServiceNow Helper was not detected in this browser."));
      }, timeoutMs);

      function cleanup() {
        window.clearTimeout(timer);
        window.removeEventListener("message", onMessage);
      }

      function onMessage(event) {
        if (event.source !== window || event.origin !== location.origin) return;
        const message = event.data;
        if (!message || message.source !== HELPER_SOURCE || message.requestId !== requestId) return;
        if (message.type === "DTP_SN_PROGRESS") {
          if (typeof options.onProgress === "function") options.onProgress(message.progress || {});
          return;
        }
        if (message.type !== "DTP_SN_RESULT" && message.type !== "DTP_SN_READY") return;
        cleanup();
        resolve(message);
      }

      window.addEventListener("message", onMessage);
      window.postMessage({ source: PAGE_SOURCE, type, requestId, payload }, location.origin);
    });
  }

  function renderLoading() {
    modal.querySelector("[data-sn-main]").innerHTML = `
      <div class="sn-status">Checking for the read-only ServiceNow browser helper...</div>
      <div class="sn-summary">
        ${metric("Visible rows", visibleRows.length)}
        ${metric("Requests", "Grouping")}
        ${metric("Manual typing", "None", "info")}
      </div>
    `;
    modal.querySelector("[data-sn-report]").innerHTML = "";
  }

  function renderIdentity(config = {}) {
    if (!modal) return;
    const target = modal.querySelector("[data-sn-identity]");
    const authMode = config.authMode ? config.authMode.replace(/-/g, " ") : "Not configured";
    target.innerHTML = `
      <h3>Current validation access</h3>
      <p><strong>Production:</strong> ${escapeHtml(config.productionName || "Not set")}</p>
      <p><strong>Browser helper:</strong> ${helperVersion ? `Ready (${escapeHtml(helperVersion)})` : "Not detected"}</p>
      <p><strong>API authentication:</strong> ${escapeHtml(authMode)}</p>
      <p><strong>ServiceNow writes:</strong> None</p>
    `;
  }

  function renderSetupRequired(config = {}) {
    lastConfig = { ...lastConfig, ...config };
    renderExportMode(lastConfig);
  }

  function renderExportMode(config = {}, apiError = "", helperWasDetected = false) {
    const missing = Array.isArray(config.missing) ? config.missing : [];
    const warnings = Array.isArray(config.warnings) ? config.warnings : [];
    modal.querySelector("[data-sn-main]").innerHTML = `
      <div class="sn-status">Automatic no-OAuth validation uses the DTP ServiceNow browser helper and your existing ServiceNow login.</div>
      ${apiError ? `<div class="sn-status warning">${escapeHtml(apiError)}</div>` : ""}
      <div class="sn-setup-card sn-companion-card">
        <h3>${helperWasDetected ? "Browser helper needs attention" : "Install the browser helper once"}</h3>
        <p>The helper opens Closed DTP Requests in a dedicated tab, reads only the request details, and returns the comparison values to this tracker.</p>
        <ol class="sn-export-steps">
          <li><a class="sn-download-link" href="/downloads/DTP-ServiceNow-Helper.zip" download>Download DTP ServiceNow Helper</a> and extract it.</li>
          <li>Open <strong>chrome://extensions</strong> or <strong>edge://extensions</strong>, enable Developer mode, then select <strong>Load unpacked</strong>.</li>
          <li>Choose the extracted <strong>browser-extension</strong> folder, sign in normally to ServiceNow, then check again.</li>
        </ol>
        <div class="sn-actions"><button type="button" data-sn-run-again>Check helper again</button></div>
        <p class="sn-note">This does not bypass ServiceNow authentication. It uses only pages the signed-in designer is already allowed to read and never sends the ServiceNow cookie or password to Render.</p>
      </div>
      <details class="sn-setup-card sn-api-details">
        <summary>Manual supplied-data fallback</summary>
        <p>If a ServiceNow administrator enables list export later, CSV/Excel/TSV/HTML data can still be supplied here.</p>
        <label class="sn-export-file">
          ServiceNow exported file(s)
          <input type="file" multiple accept=".csv,.tsv,.txt,.xlsx,.xlsm,.html,.htm" data-sn-export-files>
          <small data-sn-export-summary>CSV, Excel, TSV, TXT, or HTML. Up to 5 files, 15 MB combined.</small>
        </label>
        <label class="sn-paste-label">
          Or paste copied table rows
          <textarea data-sn-export-paste placeholder="Paste a copied ServiceNow table here, including the header row."></textarea>
        </label>
        <div class="sn-actions"><button type="button" data-sn-run-export>Validate visible from supplied data</button></div>
      </details>
      <details class="sn-setup-card sn-api-details">
        <summary>Optional fully automatic API setup</summary>
        <p>Fully automatic validation still requires company-approved read-only ServiceNow API access.</p>
        ${missing.length ? `<strong>Missing</strong><ul class="sn-setup-list">${missing.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
        ${warnings.length ? `<strong>Warnings</strong><ul class="sn-setup-list">${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
        <p class="sn-note">If IT later approves API access, secrets belong in Render Environment Variables only, never in GitHub or the browser.</p>
      </details>
    `;
    modal.querySelector("[data-sn-report]").innerHTML = "";
  }

  async function runExportValidation() {
    if (running || !modal) return;
    visibleRows = getVisibleRows();
    if (!visibleRows.length) {
      renderMessage("No visible tracker rows to validate.", "warning");
      return;
    }

    const fileInput = modal.querySelector("[data-sn-export-files]");
    const pasteInput = modal.querySelector("[data-sn-export-paste]");
    const files = Array.from(fileInput?.files || []);
    const pastedText = pasteInput?.value || "";
    if (!files.length && !pastedText.trim()) {
      notify("Choose a ServiceNow export file or paste exported rows first.");
      fileInput?.focus();
      return;
    }
    if (files.length > 5) {
      notify("Choose no more than 5 ServiceNow export files at once.");
      return;
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > 15 * 1024 * 1024) {
      notify("Keep the combined ServiceNow export files under 15 MB.");
      return;
    }

    running = true;
    setButtonBusy(true);
    modal.querySelector("[data-sn-main]").innerHTML = `
      <div class="sn-status">Reading the supplied ServiceNow export and matching visible Request # values...</div>
      <div class="sn-summary">
        ${metric("Visible rows", visibleRows.length)}
        ${metric("Export files", files.length)}
        ${metric("ServiceNow writes", "None", "info")}
      </div>
    `;
    modal.querySelector("[data-sn-report]").innerHTML = "";

    try {
      const encodedFiles = [];
      for (const file of files) {
        encodedFiles.push({ filename: file.name, contentBase64: await fileToBase64(file) });
      }
      const report = await apiRequest("/api/servicenow/validate-export", {
        method: "POST",
        body: JSON.stringify({
          rows: visibleRows.map((row) => ({ id: row.id, requestNo: row.requestNo })),
          files: encodedFiles,
          pastedText
        })
      });
      if (report.state) {
        try {
          if (typeof setState === "function") setState(report.state, { preserveScroll: true });
        } catch {
          // The report remains usable if the surrounding table refresh fails.
        }
      }
      renderIdentity({ ...lastConfig, productionName: report.productionName || lastConfig.productionName });
      renderReport(report);
      notify(`Validated ${report.totalProcessed || 0} request(s) from the ServiceNow export.`);
    } catch (error) {
      renderExportMode(lastConfig, error.message || "The ServiceNow export could not be validated.");
    } finally {
      running = false;
      setButtonBusy(false);
    }
  }

  function renderFailure(message) {
    renderExportMode(lastConfig, message);
  }

  function updateExportFileSummary(fileList) {
    const target = modal?.querySelector("[data-sn-export-summary]");
    if (!target) return;
    const files = Array.from(fileList || []);
    if (!files.length) {
      target.textContent = "CSV, Excel, TSV, TXT, or HTML. Up to 5 files, 15 MB combined.";
      return;
    }
    const sizeMb = files.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024);
    target.textContent = `${files.length} file(s) selected, ${sizeMb.toFixed(2)} MB: ${files.map((file) => file.name).join(", ")}`;
  }

  async function fileToBase64(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const chunkSize = 0x8000;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  function renderMessage(message, kind = "") {
    modal.querySelector("[data-sn-main]").innerHTML = `<div class="sn-status ${escapeHtml(kind)}">${escapeHtml(message)}</div>`;
  }

  function renderReport(report) {
    const results = Array.isArray(report.results) ? report.results : [];
    lastReportResults = results;
    const warnings = Array.isArray(report.warnings) ? report.warnings : [];
    const fromExport = report.source === "export";
    const fromBrowserHelper = report.source === "browser-helper";
    const sourceLabel = fromBrowserHelper ? "ServiceNow browser helper" : (fromExport ? "supplied list data" : "approved API");
    modal.querySelector("[data-sn-main]").innerHTML = `
      <div class="sn-status">Validation complete through the ${sourceLabel}. Category changes were saved; slides and minutes were compared only.</div>
      <div class="sn-summary">
        ${metric("Visible rows", report.totalRequestedRows ?? visibleRows.length)}
        ${metric("Requests", report.totalProcessed ?? 0)}
        ${metric("Rows updated", report.categoryUpdatedRows ?? 0, "info")}
        ${metric("Slide mismatch", report.slideMismatches ?? 0, report.slideMismatches ? "warning" : "")}
        ${metric("Minute mismatch", report.minuteMismatches ?? 0, report.minuteMismatches ? "warning" : "")}
        ${metric("Not found", report.notFound ?? 0, report.notFound ? "danger" : "")}
      </div>
      ${fromExport ? `<div class="sn-status">Read ${Number(report.exportRows || 0)} ServiceNow row(s) from ${Number(report.exportSources?.length || 0)} supplied source(s).</div>` : ""}
      ${fromBrowserHelper ? `<div class="sn-status">Helper version ${escapeHtml(report.browserHelperVersion || helperVersion || "installed")}; ServiceNow remained read-only.</div>` : ""}
      ${warnings.length ? `<div class="sn-status warning"><strong>Validation notes</strong><ul class="sn-setup-list">${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}
      ${report.truncated ? `<div class="sn-status">Only the first ${Number(report.totalProcessed || 0)} requests were processed. Narrow the filters and run again for the remaining requests.</div>` : ""}
      <div class="sn-actions">
        <button type="button" data-sn-run-again>Validate visible again</button>
        <button type="button" data-sn-show-export>Setup or supplied data</button>
      </div>
    `;

    modal.querySelector("[data-sn-report]").innerHTML = `
      ${minuteReviewFormHtml(results)}
      <div class="sn-report-head">
        <strong>Category and slide comparison</strong>
        <span>Source: ${escapeHtml(sourceLabel)} | Production: ${escapeHtml(report.productionName || "Not set")}</span>
      </div>
      <div class="sn-report-table-wrap">
        <table class="sn-report-table">
          <thead>
            <tr>
              <th>Request #</th>
              <th>Rows</th>
              <th>Category</th>
              <th>Slides T / SN</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>${results.map(resultRowHtml).join("")}</tbody>
        </table>
      </div>
    `;
    refreshMinuteReviewSummary();
  }

  function resultRowHtml(result) {
    const hasIssue = result.slidesMismatch;
    const rowClass = result.status === "error" || result.status === "not-found"
      ? "sn-row-error"
      : hasIssue
        ? "sn-row-warning"
        : "sn-row-ok";
    const categoryText = result.categoryUpdated
      ? `${displayValue(result.serviceNow?.category)} (updated)`
      : `${displayValue(result.tracker?.category)} / ${displayValue(result.serviceNow?.category)}`;
    return `
      <tr class="${rowClass}">
        <td>${escapeHtml(result.requestNo || "--")}</td>
        <td>${Number(result.rowCount || 0)}</td>
        <td>${escapeHtml(categoryText)}</td>
        <td>${escapeHtml(pair(result.tracker?.slides, result.serviceNow?.slides))}</td>
        <td>${escapeHtml(categorySlideResultText(result))}</td>
      </tr>
    `;
  }

  function minuteReviewFormHtml(results) {
    return `
      <section class="sn-minute-review" aria-labelledby="snMinuteReviewTitle">
        <div class="sn-minute-review-head">
          <div>
            <p>Critical manual check</p>
            <h3 id="snMinuteReviewTitle">Worked minutes comparison</h3>
            <span>Tracker minutes are never overwritten. Review each Request # and record your decision below.</span>
          </div>
          <button type="button" data-sn-download-minute-review>Download minutes report</button>
        </div>
        <div class="sn-minute-review-summary">
          ${metric("Requests", results.length)}
          ${metric("Exact values", results.filter(hasExactMinutes).length, "info")}
          ${metric("Needs attention", results.filter(needsMinuteAttention).length, results.some(needsMinuteAttention) ? "warning" : "")}
          <div class="sn-metric info" data-sn-minute-reviewed><span>Manually reviewed</span><strong>0</strong></div>
          <div class="sn-metric ${results.length ? "warning" : ""}" data-sn-minute-pending><span>Pending</span><strong>${results.length}</strong></div>
        </div>
        <div class="sn-minute-review-table-wrap">
          <table class="sn-minute-review-table">
            <thead>
              <tr>
                <th>Request #</th>
                <th>Tracker rows</th>
                <th>Tracker mins</th>
                <th>ServiceNow mins</th>
                <th>Difference<br><small>SN - Tracker</small></th>
                <th>Comparison</th>
                <th>Manual decision</th>
                <th>Reviewer note</th>
              </tr>
            </thead>
            <tbody>${results.map(minuteReviewRowHtml).join("")}</tbody>
          </table>
        </div>
        <p class="sn-minute-review-note">Selecting a decision records the review only in this open report. It does not change the tracker or ServiceNow minutes.</p>
      </section>
    `;
  }

  function minuteReviewRowHtml(result) {
    const key = minuteReviewKey(result);
    const saved = minuteReviewState.get(key) || { decision: "pending", note: "" };
    const trackerMinutes = numberOrNull(result.tracker?.minutes);
    const serviceNowMinutes = numberOrNull(result.serviceNow?.minutes);
    const difference = trackerMinutes === null || serviceNowMinutes === null
      ? null
      : serviceNowMinutes - trackerMinutes;
    const comparison = minuteComparison(result);
    const attentionClass = needsMinuteAttention(result) ? "sn-minute-attention" : "sn-minute-match";
    return `
      <tr class="${attentionClass}" data-sn-minute-review-row data-review-key="${escapeHtml(key)}">
        <td><strong>${escapeHtml(result.requestNo || "--")}</strong></td>
        <td>${Number(result.rowCount || 0)}</td>
        <td class="sn-minute-value">${escapeHtml(displayValue(trackerMinutes))}</td>
        <td class="sn-minute-value">${escapeHtml(displayValue(serviceNowMinutes))}</td>
        <td class="sn-minute-difference">${escapeHtml(formatMinuteDifference(difference))}</td>
        <td><span class="sn-comparison-badge ${attentionClass}">${escapeHtml(comparison)}</span></td>
        <td>
          <select data-sn-minute-decision data-review-key="${escapeHtml(key)}" aria-label="Manual decision for ${escapeHtml(result.requestNo || "request")}">
            ${minuteDecisionOptions(saved.decision)}
          </select>
        </td>
        <td><input type="text" data-sn-minute-note data-review-key="${escapeHtml(key)}" value="${escapeHtml(saved.note || "")}" placeholder="Reason or action needed" aria-label="Reviewer note for ${escapeHtml(result.requestNo || "request")}"></td>
      </tr>
    `;
  }

  function minuteDecisionOptions(selected) {
    const options = [
      ["pending", "Pending manual check"],
      ["confirmed-match", "Confirmed: both values correct"],
      ["tracker-correct", "Tracker correct; ServiceNow needs correction"],
      ["servicenow-correct", "ServiceNow correct; tracker needs correction"],
      ["investigate", "Needs investigation"],
      ["missing-data", "Missing data"]
    ];
    return options.map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`).join("");
  }

  function categorySlideResultText(result) {
    const messages = (result.messages || []).filter((message) => {
      const text = String(message || "").toLowerCase();
      return !text.includes("minute") && !text.includes("production time");
    });
    if (messages.length) return messages.join(" ");
    if (result.categoryUpdated) return "Category updated; slides matched.";
    return result.status || "Category and slides matched";
  }

  function minuteReviewKey(result) {
    return [
      result.requestNo || "",
      displayValue(result.tracker?.minutes),
      displayValue(result.serviceNow?.minutes)
    ].join("|");
  }

  function updateMinuteReviewState(key, patch) {
    if (!key) return;
    const current = minuteReviewState.get(key) || { decision: "pending", note: "" };
    minuteReviewState.set(key, { ...current, ...patch });
    refreshMinuteReviewSummary();
  }

  function refreshMinuteReviewSummary() {
    if (!modal) return;
    const rows = Array.from(modal.querySelectorAll("[data-sn-minute-review-row]"));
    let reviewed = 0;
    for (const row of rows) {
      const key = row.dataset.reviewKey;
      const decision = minuteReviewState.get(key)?.decision || row.querySelector("[data-sn-minute-decision]")?.value || "pending";
      const isReviewed = decision !== "pending";
      row.classList.toggle("sn-minute-reviewed", isReviewed);
      if (isReviewed) reviewed += 1;
    }
    const reviewedMetric = modal.querySelector("[data-sn-minute-reviewed] strong");
    const pendingMetric = modal.querySelector("[data-sn-minute-pending] strong");
    if (reviewedMetric) reviewedMetric.textContent = String(reviewed);
    if (pendingMetric) pendingMetric.textContent = String(Math.max(0, rows.length - reviewed));
  }

  function downloadMinuteReviewCsv() {
    if (!lastReportResults.length) return;
    const headers = ["Request #", "Tracker rows", "Tracker minutes", "ServiceNow minutes", "Difference (SN - Tracker)", "Comparison", "Manual decision", "Reviewer note"];
    const rows = lastReportResults.map((result) => {
      const key = minuteReviewKey(result);
      const review = minuteReviewState.get(key) || { decision: "pending", note: "" };
      const trackerMinutes = numberOrNull(result.tracker?.minutes);
      const serviceNowMinutes = numberOrNull(result.serviceNow?.minutes);
      const difference = trackerMinutes === null || serviceNowMinutes === null ? null : serviceNowMinutes - trackerMinutes;
      return [
        result.requestNo || "",
        Number(result.rowCount || 0),
        trackerMinutes ?? "",
        serviceNowMinutes ?? "",
        difference ?? "",
        minuteComparison(result),
        minuteDecisionLabel(review.decision),
        review.note || ""
      ];
    });
    const csv = [headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `DTP-Minutes-Comparison-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function csvValue(value) {
    const text = String(value ?? "").replace(/\r?\n/g, " ");
    return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function minuteDecisionLabel(value) {
    const labels = {
      pending: "Pending manual check",
      "confirmed-match": "Confirmed: both values correct",
      "tracker-correct": "Tracker correct; ServiceNow needs correction",
      "servicenow-correct": "ServiceNow correct; tracker needs correction",
      investigate: "Needs investigation",
      "missing-data": "Missing data"
    };
    return labels[value] || labels.pending;
  }

  function minuteComparison(result) {
    const trackerMinutes = numberOrNull(result.tracker?.minutes);
    const serviceNowMinutes = numberOrNull(result.serviceNow?.minutes);
    if (trackerMinutes === null && serviceNowMinutes === null) return "Both missing";
    if (trackerMinutes === null) return "Tracker missing";
    if (serviceNowMinutes === null) return "ServiceNow missing";
    return trackerMinutes === serviceNowMinutes ? "Exact match" : "Mismatch";
  }

  function hasExactMinutes(result) {
    const trackerMinutes = numberOrNull(result.tracker?.minutes);
    const serviceNowMinutes = numberOrNull(result.serviceNow?.minutes);
    return trackerMinutes !== null && serviceNowMinutes !== null && trackerMinutes === serviceNowMinutes;
  }

  function needsMinuteAttention(result) {
    return !hasExactMinutes(result);
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function formatMinuteDifference(value) {
    if (value === null) return "--";
    if (value === 0) return "0";
    return value > 0 ? `+${value}` : String(value);
  }

  function metric(label, value, className = "") {
    return `<div class="sn-metric ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  function pair(trackerValue, serviceNowValue) {
    return `${displayValue(trackerValue)} / ${displayValue(serviceNowValue)}`;
  }

  function displayValue(value) {
    return value === null || value === undefined || value === "" ? "--" : String(value);
  }

  function setButtonBusy(isBusy) {
    const button = document.getElementById("validateServiceNowBtn");
    if (!button) return;
    button.disabled = isBusy;
    button.textContent = isBusy ? "Validating..." : "Validate ServiceNow";
  }

  async function apiRequest(path, options = {}) {
    const viewHeaders = (() => {
      try {
        return currentUser?.role === "admin" && activeViewUserId
          ? { "x-dtp-view-user": activeViewUserId }
          : {};
      } catch {
        return {};
      }
    })();
    const response = await fetch(path, {
      headers: {
        "content-type": "application/json",
        ...viewHeaders,
        ...(options.headers || {})
      },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `Request failed: ${response.status}`);
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function notify(message) {
    try {
      if (typeof showToast === "function") {
        showToast(message);
        return;
      }
    } catch {
      // Fall through to a lightweight status message.
    }
    const toast = document.getElementById("toast");
    if (toast) toast.textContent = message;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
