(() => {
  const VERSION = "20260801-team-api";
  let modal = null;
  let visibleRows = [];
  let running = false;

  document.addEventListener("DOMContentLoaded", initServiceNowValidation);

  function initServiceNowValidation() {
    const actions = document.querySelector(".export-actions");
    if (!actions || document.getElementById("validateServiceNowBtn")) return;

    const button = document.createElement("button");
    button.id = "validateServiceNowBtn";
    button.type = "button";
    button.textContent = "Validate ServiceNow";
    button.title = "Automatically validate the currently visible rows through the secure read-only ServiceNow integration.";
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
            <h2 id="snValidationTitle">Automatic visible-row check</h2>
          </div>
          <button type="button" class="sn-close" data-sn-close>Close</button>
        </header>
        <div class="sn-modal-body">
          <div class="sn-validation-grid">
            <section class="sn-input-panel" data-sn-main></section>
            <aside class="sn-help-panel">
              <h3>Team-wide validation</h3>
              <ul>
                <li>Uses only rows visible after the current filters.</li>
                <li>Groups repeated rows by Request #.</li>
                <li>Totals tracker slides and worked minutes per request.</li>
                <li>Updates Category of work only.</li>
                <li>Keeps ServiceNow completely read-only.</li>
              </ul>
              <p class="sn-note">The validation runs on the Render backend. It does not use Codex, browser automation, or the designer's ServiceNow session.</p>
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
      renderIdentity(payload);
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
      <h3>Current integration</h3>
      <p><strong>Production:</strong> ${escapeHtml(config.productionName || "Not set")}</p>
      <p><strong>Authentication:</strong> ${escapeHtml(authMode)}</p>
    `;
  }

  function renderSetupRequired(config = {}) {
    const missing = Array.isArray(config.missing) ? config.missing : [];
    const warnings = Array.isArray(config.warnings) ? config.warnings : [];
    modal.querySelector("[data-sn-main]").innerHTML = `
      <div class="sn-status">Automatic validation needs company-approved read-only ServiceNow API access.</div>
      <div class="sn-setup-card">
        <h3>Integration not ready</h3>
        <p>Ask the FTI ServiceNow administrator to provide an OAuth client-credentials integration account with read-only access to the DTP request and time-reporting tables.</p>
        ${missing.length ? `<strong>Missing</strong><ul class="sn-setup-list">${missing.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
        ${warnings.length ? `<strong>Warnings</strong><ul class="sn-setup-list">${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
        <p class="sn-note">Secrets belong in Render Environment Variables only. Never place them in GitHub or the browser.</p>
        <button type="button" data-sn-run-again>Check setup again</button>
      </div>
    `;
    modal.querySelector("[data-sn-report]").innerHTML = "";
  }

  function renderFailure(message) {
    modal.querySelector("[data-sn-main]").innerHTML = `
      <div class="sn-status">Validation could not complete.</div>
      <div class="sn-setup-card">
        <h3>ServiceNow returned an error</h3>
        <p>${escapeHtml(message)}</p>
        <button type="button" data-sn-run-again>Try again</button>
      </div>
    `;
    modal.querySelector("[data-sn-report]").innerHTML = "";
  }

  function renderMessage(message, kind = "") {
    modal.querySelector("[data-sn-main]").innerHTML = `<div class="sn-status ${escapeHtml(kind)}">${escapeHtml(message)}</div>`;
  }

  function renderReport(report) {
    const results = Array.isArray(report.results) ? report.results : [];
    modal.querySelector("[data-sn-main]").innerHTML = `
      <div class="sn-status">Validation complete. Category changes were saved; slides and minutes were compared only.</div>
      <div class="sn-summary">
        ${metric("Visible rows", report.totalRequestedRows ?? visibleRows.length)}
        ${metric("Requests", report.totalProcessed ?? 0)}
        ${metric("Rows updated", report.categoryUpdatedRows ?? 0, "info")}
        ${metric("Slide mismatch", report.slideMismatches ?? 0, report.slideMismatches ? "warning" : "")}
        ${metric("Minute mismatch", report.minuteMismatches ?? 0, report.minuteMismatches ? "warning" : "")}
        ${metric("Not found", report.notFound ?? 0, report.notFound ? "danger" : "")}
      </div>
      ${report.truncated ? `<div class="sn-status">Only the first ${Number(report.totalProcessed || 0)} requests were processed. Narrow the filters and run again for the remaining requests.</div>` : ""}
      <div class="sn-actions"><button type="button" data-sn-run-again>Validate visible again</button></div>
    `;

    modal.querySelector("[data-sn-report]").innerHTML = `
      <div class="sn-report-head">
        <strong>ServiceNow comparison report</strong>
        <span>Production: ${escapeHtml(report.productionName || "Not set")}</span>
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
