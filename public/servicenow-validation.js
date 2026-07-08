(() => {
  const VERSION = "20260708-servicenow-autoapi";
  let modal = null;
  let lastReport = null;

  document.addEventListener("DOMContentLoaded", initServiceNowValidation);

  function initServiceNowValidation() {
    const actions = document.querySelector(".export-actions");
    if (!actions || document.getElementById("validateServiceNowBtn")) return;

    const button = document.createElement("button");
    button.id = "validateServiceNowBtn";
    button.type = "button";
    button.textContent = "Validate ServiceNow";
    button.title = "Automatically validate the currently visible tracker rows against read-only ServiceNow API data.";

    const exportButton = document.getElementById("exportBtn");
    actions.insertBefore(button, exportButton || null);
    button.addEventListener("click", validateVisibleRows);

    window.dtpServiceNowValidation = {
      version: VERSION,
      validateVisibleRows,
      getLastReport: () => lastReport
    };
  }

  async function validateVisibleRows() {
    const rows = visibleValidationRows();
    if (!rows.length) {
      showValidationToast("No visible tracker rows to validate.");
      return;
    }

    if (!modal) modal = buildModal();
    modal.hidden = false;
    renderWorking(rows.length);

    try {
      const report = await trackerApi("/api/servicenow/validate", {
        method: "POST",
        body: JSON.stringify({ rows })
      });
      lastReport = report;
      if (report.state && typeof setState === "function") {
        setState(report.state, { preserveScroll: true });
      } else if (typeof loadState === "function") {
        loadState(true, { preserveScroll: true });
      }
      renderReport(report);
      showValidationToast(`ServiceNow validation finished: ${report.totalProcessed} row(s), ${report.categoryUpdates} category update(s).`);
    } catch (error) {
      renderSetupNeeded(error);
      showValidationToast(error.message);
    }
  }

  function buildModal() {
    const root = document.createElement("div");
    root.id = "serviceNowValidationModal";
    root.className = "sn-modal-backdrop";
    root.hidden = true;
    root.innerHTML = `
      <div class="sn-modal sn-queue-modal" role="dialog" aria-modal="true" aria-labelledby="snValidationTitle">
        <header class="sn-modal-head">
          <div>
            <p>ServiceNow validation</p>
            <h2 id="snValidationTitle">Automatic visible-row check</h2>
          </div>
          <button type="button" class="sn-close" data-sn-close aria-label="Close validation">Close</button>
        </header>
        <div class="sn-modal-body">
          <section class="sn-queue-layout">
            <div class="sn-input-panel">
              <div data-sn-status class="sn-status">Ready.</div>
              <div data-sn-summary class="sn-summary"></div>
              <section class="sn-report" data-sn-report></section>
            </div>
            <aside class="sn-help-panel">
              <h3>What this does</h3>
              <ul>
                <li>Uses only the tracker rows visible after your filters.</li>
                <li>Searches ServiceNow by Request # from the backend.</li>
                <li>Updates tracker Category of work only.</li>
                <li>Reports slide and Bryan production-minute mismatches without changing them.</li>
                <li>Does not write anything back to ServiceNow.</li>
              </ul>
              <p class="sn-note">A deployed website cannot control or read a separate logged-in ServiceNow Chrome tab. This automatic version needs read-only ServiceNow API access configured on the server.</p>
            </aside>
          </section>
        </div>
      </div>
    `;
    document.body.append(root);
    root.querySelector("[data-sn-close]").addEventListener("click", () => {
      root.hidden = true;
      if (typeof loadState === "function") loadState(true, { preserveScroll: true });
    });
    root.addEventListener("click", (event) => {
      if (event.target === root) root.hidden = true;
    });
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") root.hidden = true;
    });
    return root;
  }

  function renderWorking(count) {
    setStatus(`Checking ${count} visible row(s) against ServiceNow. This can take a little while for big date ranges.`);
    setSummaryHtml(`
      <div class="sn-metric info"><span>Rows queued</span><strong>${count}</strong></div>
      <div class="sn-metric"><span>Mode</span><strong>Read-only</strong></div>
      <div class="sn-metric"><span>Tracker edits</span><strong>Category only</strong></div>
    `);
    setReportHtml("");
  }

  function renderSetupNeeded(error) {
    let missing = [];
    let warnings = [];
    if (error.payload) {
      missing = Array.isArray(error.payload.missing) ? error.payload.missing : [];
      warnings = Array.isArray(error.payload.warnings) ? error.payload.warnings : [];
    }

    setStatus("Automatic ServiceNow validation needs server API access before it can search one by one.");
    setSummaryHtml(`
      <div class="sn-metric danger"><span>Status</span><strong>Not ready</strong></div>
      <div class="sn-metric"><span>Visible rows</span><strong>${visibleValidationRows().length}</strong></div>
      <div class="sn-metric info"><span>Manual typing</span><strong>None</strong></div>
    `);
    setReportHtml(`
      <div class="sn-setup-card">
        <h3>Why it cannot click your ServiceNow tab</h3>
        <p>Chrome blocks a tracker page from reading or clicking another logged-in ServiceNow tab. Render also has no access to your Chrome session. To make the button truly automatic, the server needs read-only ServiceNow API settings.</p>
        <h3>Missing server settings</h3>
        <ul class="sn-setup-list">
          ${(missing.length ? missing : ["ServiceNow API settings"]).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
        ${warnings.length ? `<h3>Warnings</h3><ul class="sn-setup-list">${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
        <p class="sn-note">No tracker rows were changed. Once these environment variables are set in Render, this same button can validate the visible rows automatically.</p>
      </div>
    `);
  }

  function renderReport(report) {
    const rows = Array.isArray(report.results) ? report.results : [];
    const matched = rows.filter((row) => row.status === "matched").length;
    const notFound = rows.filter((row) => row.status === "not-found").length;
    const errors = rows.filter((row) => row.status === "error").length;
    const slideIssues = rows.filter((row) => row.slidesMismatch).length;
    const minuteIssues = rows.filter((row) => row.minutesMismatch).length;

    setStatus(report.truncated
      ? `Validated the first ${report.totalProcessed} visible row(s). Narrow the filter to validate the remaining rows.`
      : "Validation complete.");
    setSummaryHtml(`
      <div class="sn-metric info"><span>Processed</span><strong>${report.totalProcessed}</strong></div>
      <div class="sn-metric"><span>Matched</span><strong>${matched}</strong></div>
      <div class="sn-metric warning"><span>Not found</span><strong>${notFound}</strong></div>
      <div class="sn-metric info"><span>Category updates</span><strong>${report.categoryUpdates || 0}</strong></div>
      <div class="sn-metric ${slideIssues ? "danger" : ""}"><span>Slide mismatches</span><strong>${slideIssues}</strong></div>
      <div class="sn-metric ${minuteIssues ? "danger" : ""}"><span>Minute mismatches</span><strong>${minuteIssues}</strong></div>
      <div class="sn-metric ${errors ? "danger" : ""}"><span>Errors</span><strong>${errors}</strong></div>
    `);

    const body = rows.map((row, index) => {
      const issue = [
        row.categoryUpdated ? "Category updated" : "",
        row.slidesMismatch ? "Slides mismatch" : "",
        row.minutesMismatch ? "Mins mismatch" : "",
        ...(Array.isArray(row.messages) ? row.messages : [])
      ].filter(Boolean).join("; ") || "--";
      const statusClass = row.status === "matched" && !row.slidesMismatch && !row.minutesMismatch
        ? "sn-row-ok"
        : row.status === "error"
          ? "sn-row-error"
          : row.status === "not-found"
            ? "sn-row-warning"
            : "";
      return `
        <tr class="${statusClass}">
          <td>${index + 1}</td>
          <td>${escapeHtml(row.requestNo || "")}</td>
          <td>${escapeHtml(row.status || "")}</td>
          <td>${escapeHtml(row.tracker?.category || "")}</td>
          <td>${escapeHtml(row.serviceNow?.category || "")}</td>
          <td>${displayCompare(row.tracker?.slides, row.serviceNow?.slides)}</td>
          <td>${displayCompare(row.tracker?.minutes, row.serviceNow?.minutes)}</td>
          <td>${escapeHtml(issue)}</td>
        </tr>
      `;
    }).join("");

    setReportHtml(`
      <div class="sn-report-head">
        <strong>ServiceNow validation report</strong>
        <span>Only Category of work was auto-updated in the tracker.</span>
      </div>
      <div class="sn-report-table-wrap">
        <table class="sn-report-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Request #</th>
              <th>Status</th>
              <th>Tracker category</th>
              <th>ServiceNow category</th>
              <th>Slides</th>
              <th>Mins</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>${body || `<tr><td colspan="8">No results returned.</td></tr>`}</tbody>
        </table>
      </div>
    `);
  }

  function visibleValidationRows() {
    let tasks = [];
    try {
      if (typeof filteredTasks === "function") tasks = filteredTasks();
    } catch {
      tasks = [];
    }
    return tasks.map((task) => ({
      id: task.id,
      requestNo: task.requestNo,
      slides: task.slides,
      durationSeconds: task.durationSeconds,
      category: task.category,
      client: task.client,
      dateWorked: task.dateWorked
    }));
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
      const error = new Error(payload.error || `Request failed: ${response.status}`);
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function setStatus(message) {
    if (!modal) return;
    modal.querySelector("[data-sn-status]").textContent = message;
  }

  function setSummaryHtml(html) {
    if (!modal) return;
    modal.querySelector("[data-sn-summary]").innerHTML = html;
  }

  function setReportHtml(html) {
    if (!modal) return;
    modal.querySelector("[data-sn-report]").innerHTML = html;
  }

  function displayCompare(tracker, serviceNow) {
    return `${escapeHtml(valueOrDash(tracker))} / ${escapeHtml(valueOrDash(serviceNow))}`;
  }

  function valueOrDash(value) {
    return value === null || value === undefined || value === "" ? "--" : String(value);
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
})();
