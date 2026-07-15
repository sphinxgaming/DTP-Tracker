(() => {
  const VERSION = "20260715-servicenow-portal-queue";
  const DEFAULT_PRODUCTION_NAME = "Bryan Logapo";
  const SETTINGS_KEY = "serviceNowPortalValidationSettings";
  const RESULTS_KEY = "serviceNowPortalValidationResults";
  const DEFAULT_SEARCH_URL = "https://fticonsulting.service-now.com/nav_to.do?uri=%2Fu_dtp_request_list.do%3Fsysparm_query%3Dnumber%253D{request}";

  let modal = null;
  let queue = [];
  let currentIndex = 0;
  let results = loadResults();

  document.addEventListener("DOMContentLoaded", initServiceNowValidation);

  function initServiceNowValidation() {
    const actions = document.querySelector(".export-actions");
    if (!actions || document.getElementById("validateServiceNowBtn")) return;

    const button = document.createElement("button");
    button.id = "validateServiceNowBtn";
    button.type = "button";
    button.textContent = "Validate ServiceNow";
    button.title = "Validate the currently visible tracker rows through the ServiceNow Portal queue.";

    const exportButton = document.getElementById("exportBtn");
    actions.insertBefore(button, exportButton || null);
    button.addEventListener("click", openValidationQueue);

    window.dtpServiceNowValidation = {
      version: VERSION,
      openValidationQueue,
      getQueue: () => queue,
      getResults: () => results
    };
  }

  function openValidationQueue() {
    queue = getVisibleTasks();
    currentIndex = firstUncheckedIndex(queue);
    if (!queue.length) {
      showValidationToast("No visible tracker rows to validate.");
      return;
    }

    if (!modal) modal = buildValidationModal();
    modal.hidden = false;
    renderQueue();
    openCurrentServiceNowSearch();
  }

  function closeValidationModal() {
    if (modal) modal.hidden = true;
    if (typeof loadState === "function") loadState(true, { preserveScroll: true });
  }

  function buildValidationModal() {
    const settings = loadSettings();
    const root = document.createElement("div");
    root.id = "serviceNowValidationModal";
    root.className = "sn-modal-backdrop";
    root.hidden = true;
    root.innerHTML = `
      <div class="sn-modal sn-queue-modal" role="dialog" aria-modal="true" aria-labelledby="snValidationTitle">
        <header class="sn-modal-head">
          <div>
            <p>ServiceNow portal validation</p>
            <h2 id="snValidationTitle">Validate filtered DTP rows one by one</h2>
          </div>
          <button type="button" class="sn-close" data-sn-close aria-label="Close validation">Close</button>
        </header>
        <div class="sn-modal-body">
          <section class="sn-queue-layout">
            <div class="sn-input-panel">
              <div class="sn-current-card">
                <div>
                  <span data-sn-progress>0 / 0</span>
                  <strong data-sn-request>--</strong>
                  <small data-sn-context>--</small>
                </div>
                <div class="sn-current-actions">
                  <button type="button" data-sn-copy>Copy Request #</button>
                  <button type="button" data-sn-open>Open in ServiceNow</button>
                </div>
              </div>

              <details class="sn-settings">
                <summary>Portal search setup</summary>
                <label>
                  ServiceNow Portal/search URL
                  <input data-sn-url type="url" value="${escapeAttr(settings.searchUrl || DEFAULT_SEARCH_URL)}" placeholder="Use {request} where the DTP number should go.">
                </label>
                <label>
                  Production name
                  <input data-sn-production type="text" value="${escapeAttr(settings.productionName || DEFAULT_PRODUCTION_NAME)}">
                </label>
                <label class="sn-checkline">
                  <input data-sn-auto-open type="checkbox" ${settings.autoOpenNext ? "checked" : ""}>
                  Auto-open the next ServiceNow search after each validated row
                </label>
                <button type="button" data-sn-save-settings>Save setup</button>
                <p class="sn-note">No ServiceNow API is required. This queue copies the Request #, opens a ServiceNow page when possible, and lets you record the portal values here. Only Category of work can be updated automatically in the tracker.</p>
              </details>

              <div class="sn-tracker-compare">
                <h3>Tracker row</h3>
                <dl>
                  <div><dt>Category</dt><dd data-sn-tracker-category>--</dd></div>
                  <div><dt>Slides</dt><dd data-sn-tracker-slides>--</dd></div>
                  <div><dt>Worked mins</dt><dd data-sn-tracker-mins>--</dd></div>
                </dl>
              </div>

              <div class="sn-field-grid">
                <label>
                  ServiceNow Graphic Design Category
                  <input data-sn-category type="text" list="categoryOptions" placeholder="Category from portal">
                </label>
                <label>
                  ServiceNow Number Of Slides
                  <input data-sn-slides type="number" min="0" step="1" placeholder="Slides">
                </label>
                <label>
                  ServiceNow Production time in mins
                  <input data-sn-mins type="number" min="0" step="1" placeholder="Bryan mins">
                </label>
              </div>

              <div data-sn-status class="sn-status">Open/copy the Request #, check the portal, then enter the values here.</div>

              <div class="sn-actions">
                <button type="button" data-sn-validate>Validate row + next</button>
                <button type="button" data-sn-mark-ok>Mark checked + next</button>
                <button type="button" data-sn-prev>Previous</button>
                <button type="button" data-sn-skip>Skip</button>
                <button type="button" data-sn-next>Next</button>
              </div>
            </div>

            <aside class="sn-help-panel">
              <h3>Portal flow</h3>
              <ol>
                <li>Filter the DTP Tracker rows first.</li>
                <li>Click Validate ServiceNow.</li>
                <li>The current Request # is copied and ServiceNow opens when possible.</li>
                <li>Check the portal fields for category, slides, and Bryan production mins.</li>
                <li>Enter the values here, then click Validate row + next.</li>
              </ol>
              <p class="sn-note">The tracker cannot read another ServiceNow tab directly, so this is a portal queue instead of an API integration. ServiceNow stays read-only.</p>
              <div class="sn-mini-summary" data-sn-summary></div>
            </aside>
          </section>
          <section class="sn-report" data-sn-report></section>
        </div>
      </div>
    `;

    document.body.append(root);
    root.querySelector("[data-sn-close]").addEventListener("click", closeValidationModal);
    root.addEventListener("click", (event) => {
      if (event.target === root) closeValidationModal();
    });
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeValidationModal();
    });
    root.querySelector("[data-sn-copy]").addEventListener("click", copyCurrentRequest);
    root.querySelector("[data-sn-open]").addEventListener("click", () => openCurrentServiceNowSearch());
    root.querySelector("[data-sn-save-settings]").addEventListener("click", saveSettingsFromModal);
    root.querySelector("[data-sn-validate]").addEventListener("click", validateCurrentRow);
    root.querySelector("[data-sn-mark-ok]").addEventListener("click", markCurrentChecked);
    root.querySelector("[data-sn-prev]").addEventListener("click", () => moveTo(currentIndex - 1));
    root.querySelector("[data-sn-skip]").addEventListener("click", () => moveTo(currentIndex + 1, { autoOpen: shouldAutoOpenNext() }));
    root.querySelector("[data-sn-next]").addEventListener("click", () => moveTo(currentIndex + 1, { autoOpen: shouldAutoOpenNext() }));

    for (const selector of ["[data-sn-category]", "[data-sn-slides]", "[data-sn-mins]"]) {
      root.querySelector(selector).addEventListener("input", renderCurrentStatus);
    }
    return root;
  }

  function renderQueue() {
    if (!modal) return;
    const task = queue[currentIndex];
    const checkedCount = queue.filter((item) => results[item.id]?.status === "checked").length;
    modal.querySelector("[data-sn-summary]").innerHTML = `
      <div><span>Visible rows</span><strong>${queue.length}</strong></div>
      <div><span>Checked</span><strong>${checkedCount}</strong></div>
      <div><span>Remaining</span><strong>${queue.length - checkedCount}</strong></div>
    `;

    if (!task) {
      modal.querySelector("[data-sn-progress]").textContent = `${queue.length} / ${queue.length}`;
      modal.querySelector("[data-sn-request]").textContent = "Done";
      modal.querySelector("[data-sn-context]").textContent = "All visible rows have been reviewed in this queue.";
      modal.querySelector("[data-sn-status]").textContent = "Validation queue complete.";
      modal.querySelector("[data-sn-report]").innerHTML = reportHtml();
      return;
    }

    modal.querySelector("[data-sn-progress]").textContent = `${currentIndex + 1} / ${queue.length}`;
    modal.querySelector("[data-sn-request]").textContent = task.requestNo || "--";
    modal.querySelector("[data-sn-context]").textContent = `${displayDate(task.dateWorked)} | ${task.client || "No client"} | ${task.deadlineText || "No deadline"}`;
    modal.querySelector("[data-sn-tracker-category]").textContent = displayCategory(task.category);
    modal.querySelector("[data-sn-tracker-slides]").textContent = displayValue(task.slides);
    modal.querySelector("[data-sn-tracker-mins]").textContent = displayValue(taskMinutes(task));

    const saved = results[task.id] || {};
    modal.querySelector("[data-sn-category]").value = saved.category || "";
    modal.querySelector("[data-sn-slides]").value = saved.slides ?? "";
    modal.querySelector("[data-sn-mins]").value = saved.minutes ?? "";

    renderCurrentStatus();
    modal.querySelector("[data-sn-report]").innerHTML = reportHtml();
  }

  function renderCurrentStatus() {
    const task = queue[currentIndex];
    if (!task || !modal) return;

    const values = currentInputValues();
    const issues = compareValues(task, values);
    const parts = [];
    if (values.category && cleanCategory(values.category) !== cleanCategory(task.category)) {
      parts.push(`Category will update to "${values.category}".`);
    }
    if (issues.slidesMismatch) {
      parts.push(`Slides mismatch: tracker ${displayValue(task.slides)} vs ServiceNow ${values.slides}.`);
    }
    if (issues.minutesMismatch) {
      parts.push(`Minutes mismatch: tracker ${taskMinutes(task)} vs ServiceNow ${values.minutes}.`);
    }
    if (!parts.length) parts.push("No mismatch detected from the entered ServiceNow values.");
    modal.querySelector("[data-sn-status]").textContent = parts.join(" ");
  }

  async function validateCurrentRow() {
    const task = queue[currentIndex];
    if (!task) return;

    const values = currentInputValues();
    const issues = compareValues(task, values);
    const category = cleanCategory(values.category);
    const trackerCategory = cleanCategory(task.category);
    const categoryChanged = Boolean(category && category !== trackerCategory);

    try {
      if (categoryChanged) {
        const state = await trackerApi(`/api/tasks/${encodeURIComponent(task.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ category })
        });
        task.category = category;
        if (typeof setState === "function") setState(state, { preserveScroll: true });
      }

      results[task.id] = {
        status: "checked",
        requestNo: task.requestNo || "",
        category,
        slides: values.slides ?? "",
        minutes: values.minutes ?? "",
        categoryChanged,
        slidesMismatch: issues.slidesMismatch,
        minutesMismatch: issues.minutesMismatch,
        checkedAt: new Date().toISOString()
      };
      saveResults();
      showValidationToast(categoryChanged ? "Category updated. Moving to next row." : "Row checked. Moving to next row.");
      moveTo(currentIndex + 1, { autoOpen: shouldAutoOpenNext() });
    } catch (error) {
      showValidationToast(error.message || "Validation update failed.");
    }
  }

  function markCurrentChecked() {
    const task = queue[currentIndex];
    if (!task) return;

    results[task.id] = {
      status: "checked",
      requestNo: task.requestNo || "",
      category: task.category || "",
      slides: task.slides || "",
      minutes: taskMinutes(task),
      categoryChanged: false,
      slidesMismatch: false,
      minutesMismatch: false,
      checkedAt: new Date().toISOString()
    };
    saveResults();
    showValidationToast("Marked checked. Moving to next row.");
    moveTo(currentIndex + 1, { autoOpen: shouldAutoOpenNext() });
  }

  function moveTo(index, options = {}) {
    currentIndex = Math.max(0, Math.min(index, queue.length));
    renderQueue();
    if (options.autoOpen && queue[currentIndex]) openCurrentServiceNowSearch();
  }

  async function openCurrentServiceNowSearch() {
    const task = queue[currentIndex];
    if (!task) return;

    const requestNo = task.requestNo || "";
    await copyText(requestNo);
    const settings = saveSettingsFromModal({ silent: true });
    const searchUrl = buildSearchUrl(settings.searchUrl, requestNo);

    if (!searchUrl) {
      showValidationToast("Request # copied. Open ServiceNow Portal and paste/search it there.");
      return;
    }
    window.open(searchUrl, "ServiceNowDtpValidation");
    showValidationToast(`${requestNo} copied and opened in ServiceNow.`);
  }

  function copyCurrentRequest() {
    const task = queue[currentIndex];
    if (!task) return;
    copyText(task.requestNo || "").then(() => showValidationToast(`${task.requestNo} copied.`));
  }

  function saveSettingsFromModal(options = {}) {
    const existing = loadSettings();
    const settings = {
      searchUrl: modal?.querySelector("[data-sn-url]")?.value.trim() || existing.searchUrl || DEFAULT_SEARCH_URL,
      productionName: modal?.querySelector("[data-sn-production]")?.value.trim() || DEFAULT_PRODUCTION_NAME,
      autoOpenNext: Boolean(modal?.querySelector("[data-sn-auto-open]")?.checked)
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if (!options.silent) showValidationToast("ServiceNow portal setup saved.");
    return settings;
  }

  function buildSearchUrl(template, requestNo) {
    const raw = String(template || "").trim();
    if (!raw || !/^https?:\/\//i.test(raw)) return "";
    return raw.includes("{request}") ? raw.replace(/\{request\}/g, encodeURIComponent(requestNo)) : raw;
  }

  function currentInputValues() {
    return {
      category: modal.querySelector("[data-sn-category]").value.trim(),
      slides: parseWholeNumber(modal.querySelector("[data-sn-slides]").value),
      minutes: parseWholeNumber(modal.querySelector("[data-sn-mins]").value)
    };
  }

  function compareValues(task, values) {
    const trackerSlides = parseWholeNumber(task.slides);
    const trackerMinutes = taskMinutes(task);
    return {
      slidesMismatch: values.slides !== null && trackerSlides !== null && values.slides !== trackerSlides,
      minutesMismatch: values.minutes !== null && trackerMinutes !== null && values.minutes !== trackerMinutes
    };
  }

  function reportHtml() {
    if (!queue.length) return "";

    const rows = queue.map((task, index) => {
      const result = results[task.id] || {};
      const status = result.status === "checked" ? "Checked" : index === currentIndex ? "Current" : "Pending";
      const issue = [
        result.categoryChanged ? "Category updated" : "",
        result.slidesMismatch ? "Slides mismatch" : "",
        result.minutesMismatch ? "Mins mismatch" : ""
      ].filter(Boolean).join(", ") || "--";
      return `
        <tr class="${status === "Checked" ? "sn-row-ok" : index === currentIndex ? "sn-row-current" : ""}">
          <td>${index + 1}</td>
          <td>${escapeHtml(displayDate(task.dateWorked))}</td>
          <td>${escapeHtml(task.requestNo || "")}</td>
          <td>${escapeHtml(status)}</td>
          <td>${escapeHtml(issue)}</td>
        </tr>
      `;
    }).join("");

    return `
      <div class="sn-report-head">
        <strong>Visible-row portal validation queue</strong>
        <span>Only Category of work is updated in the tracker. Slides and minutes stay report-only.</span>
      </div>
      <div class="sn-report-table-wrap">
        <table class="sn-report-table">
          <thead>
            <tr><th>#</th><th>Date</th><th>Request #</th><th>Status</th><th>Result</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function firstUncheckedIndex(tasks) {
    const index = tasks.findIndex((task) => results[task.id]?.status !== "checked");
    return index >= 0 ? index : 0;
  }

  function shouldAutoOpenNext() {
    return Boolean(modal?.querySelector("[data-sn-auto-open]")?.checked);
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
      const error = new Error(payload.error || `Request failed: ${response.status}`);
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  async function copyText(text) {
    const value = String(text || "");
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      input.style.position = "fixed";
      input.style.left = "-9999px";
      document.body.append(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
  }

  function loadSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      if (!parsed.searchUrl) parsed.searchUrl = DEFAULT_SEARCH_URL;
      return parsed;
    } catch {
      return { searchUrl: DEFAULT_SEARCH_URL };
    }
  }

  function loadResults() {
    try {
      return JSON.parse(localStorage.getItem(RESULTS_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveResults() {
    localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
  }

  function taskMinutes(task) {
    if (task.durationSeconds === null || task.durationSeconds === undefined) return null;
    return Math.round(Math.max(0, Number(task.durationSeconds) || 0) / 60);
  }

  function parseWholeNumber(value) {
    const text = String(value ?? "").replace(/,/g, "").trim();
    if (!text || /^--+$/.test(text)) return null;
    const match = text.match(/-?\d+(\.\d+)?/);
    if (!match) return null;
    return Math.round(Number(match[0]));
  }

  function displayCategory(value) {
    const category = cleanCategory(value);
    return category || "Uncategorized";
  }

  function cleanCategory(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return /^other\s*\/?\s*type$/i.test(text) ? "" : text;
  }

  function displayValue(value) {
    return value === null || value === undefined || value === "" ? "--" : String(value);
  }

  function displayDate(value) {
    if (typeof formatDateWorkedWithYear === "function") return formatDateWorkedWithYear(value);
    return String(value || "");
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
})();
