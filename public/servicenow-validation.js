(() => {
  const VERSION = "20260801-export-validation";
  let modal = null;
  let visibleRows = [];
  let running = false;
  let lastConfig = {};

  document.addEventListener("DOMContentLoaded", initServiceNowValidation);

  function initServiceNowValidation() {
    const actions = document.querySelector(".export-actions");
    if (!actions || document.getElementById("validateServiceNowBtn")) return;

    const button = document.createElement("button");
    button.id = "validateServiceNowBtn";
    button.type = "button";
    button.textContent = "Validate ServiceNow";
    button.title = "Validate visible rows through the approved read-only API or a ServiceNow list export.";
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
              <h3>Two safe validation modes</h3>
              <ul>
                <li>Uses only rows visible after the current filters.</li>
                <li>Groups repeated rows by Request #.</li>
                <li>Totals tracker slides and worked minutes per request.</li>
                <li>Updates Category of work only.</li>
                <li>Keeps ServiceNow completely read-only.</li>
              </ul>
              <p class="sn-note"><strong>Export mode</strong> needs no OAuth or IT secret. Export the lists through your normal ServiceNow login, then upload them here.</p>
              <p class="sn-note"><strong>API mode</strong> is fully automatic only when IT provides an approved read-only integration.</p>
              <p class="sn-note">Neither mode uses Codex or writes anything to ServiceNow.</p>
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
    });
    root.addEventListener("change", (event) => {
      if (event.target.matches("[data-sn-export-files]")) updateExportFileSummary(event.target.files);
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
      if (!config.configured) {
        renderSetupRequired(config);
        return;
      }

      const report = await apiRequest("/api/servicenow/validate", {
        method: "POST",
        body: JSON.stringify({
          rows: visibleRows.map((row) => ({ id: row.id, requestNo: row.requestNo }))
        })
      });

      if (report.state) {
        try {
          if (typeof setState === "function") setState(report.state, { preserveScroll: true });
        } catch {
          // The report remains valid even if the surrounding table refresh fails.
        }
      }
      renderIdentity({ ...config, productionName: report.productionName || config.productionName });
      renderReport(report);
      notify(`Validated ${report.totalProcessed || 0} ServiceNow request(s).`);
    } catch (error) {
      const payload = error.payload || {};
      lastConfig = { ...lastConfig, ...payload };
      renderIdentity(lastConfig);
      if (payload.configured === false || payload.missing) {
        renderSetupRequired(payload);
      } else {
        renderFailure(error.message || "ServiceNow validation failed.");
      }
    } finally {
      running = false;
      setButtonBusy(false);
    }
  }

  function renderLoading() {
    modal.querySelector("[data-sn-main]").innerHTML = `
      <div class="sn-status">Connecting to the read-only ServiceNow integration...</div>
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
      <p><strong>API authentication:</strong> ${escapeHtml(authMode)}</p>
      <p><strong>Export mode:</strong> Ready, no OAuth needed</p>
    `;
  }

  function renderSetupRequired(config = {}) {
    lastConfig = { ...lastConfig, ...config };
    renderExportMode(lastConfig);
  }

  function renderExportMode(config = {}, apiError = "") {
    const missing = Array.isArray(config.missing) ? config.missing : [];
    const warnings = Array.isArray(config.warnings) ? config.warnings : [];
    modal.querySelector("[data-sn-main]").innerHTML = `
      <div class="sn-status">No OAuth is needed when validating from a ServiceNow list export.</div>
      ${apiError ? `<div class="sn-status warning">Automatic API check failed: ${escapeHtml(apiError)} You can continue with an export below.</div>` : ""}
      <div class="sn-setup-card sn-export-card">
        <h3>Validate from ServiceNow export</h3>
        <p>In your normal signed-in ServiceNow page, export the read-only list data, then select the file here. The tracker matches only the rows currently visible behind this window.</p>
        <ol class="sn-export-steps">
          <li>Closed DTP Requests export: include <strong>Number</strong>, <strong>Graphic Design Category</strong>, and <strong>Number Of Slides</strong>.</li>
          <li>Optional DTP Time Reportings export: include <strong>DTP Request</strong>, <strong>Production</strong>, and <strong>Production time (in mins)</strong>.</li>
        </ol>
        <label class="sn-export-file">
          ServiceNow exported file(s)
          <input type="file" multiple accept=".csv,.tsv,.txt,.xlsx,.xlsm,.html,.htm" data-sn-export-files>
          <small data-sn-export-summary>CSV, Excel, TSV, TXT, or HTML. Up to 5 files, 15 MB combined.</small>
        </label>
        <label class="sn-paste-label">
          Or paste exported table rows
          <textarea data-sn-export-paste placeholder="Paste a copied ServiceNow table here, including the header row."></textarea>
        </label>
        <div class="sn-actions">
          <button type="button" data-sn-run-export>Validate visible from export</button>
          <button type="button" data-sn-run-again>Check automatic API again</button>
        </div>
        <p class="sn-note">This does not bypass ServiceNow authentication. You export data using your own permitted login; the tracker never receives your password, OAuth token, cookie, or browser session.</p>
      </div>
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
    const warnings = Array.isArray(report.warnings) ? report.warnings : [];
    const fromExport = report.source === "export";
    modal.querySelector("[data-sn-main]").innerHTML = `
      <div class="sn-status">Validation complete${fromExport ? " from the supplied ServiceNow export" : " through the read-only API"}. Category changes were saved; slides and minutes were compared only.</div>
      <div class="sn-summary">
        ${metric("Visible rows", report.totalRequestedRows ?? visibleRows.length)}
        ${metric("Requests", report.totalProcessed ?? 0)}
        ${metric("Rows updated", report.categoryUpdatedRows ?? 0, "info")}
        ${metric("Slide mismatch", report.slideMismatches ?? 0, report.slideMismatches ? "warning" : "")}
        ${metric("Minute mismatch", report.minuteMismatches ?? 0, report.minuteMismatches ? "warning" : "")}
        ${metric("Not found", report.notFound ?? 0, report.notFound ? "danger" : "")}
      </div>
      ${fromExport ? `<div class="sn-status">Read ${Number(report.exportRows || 0)} ServiceNow row(s) from ${Number(report.exportSources?.length || 0)} supplied source(s).</div>` : ""}
      ${warnings.length ? `<div class="sn-status warning"><strong>Export notes</strong><ul class="sn-setup-list">${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}
      ${report.truncated ? `<div class="sn-status">Only the first ${Number(report.totalProcessed || 0)} requests were processed. Narrow the filters and run again for the remaining requests.</div>` : ""}
      <div class="sn-actions">
        <button type="button" data-sn-show-export>Validate another export</button>
        ${lastConfig.configured ? `<button type="button" data-sn-run-again>Run automatic API validation</button>` : ""}
      </div>
    `;

    modal.querySelector("[data-sn-report]").innerHTML = `
      <div class="sn-report-head">
        <strong>ServiceNow comparison report</strong>
        <span>${fromExport ? "Source: exported list" : "Source: API"} | Production: ${escapeHtml(report.productionName || "Not set")}</span>
      </div>
      <div class="sn-report-table-wrap">
        <table class="sn-report-table">
          <thead>
            <tr>
              <th>Request #</th>
              <th>Rows</th>
              <th>Category</th>
              <th>Slides T / SN</th>
              <th>Mins T / SN</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>${results.map(resultRowHtml).join("")}</tbody>
        </table>
      </div>
    `;
  }

  function resultRowHtml(result) {
    const hasIssue = result.slidesMismatch || result.minutesMismatch;
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
        <td>${escapeHtml(pair(result.tracker?.minutes, result.serviceNow?.minutes))}</td>
        <td>${escapeHtml((result.messages || []).join(" ") || result.status || "Matched")}</td>
      </tr>
    `;
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
