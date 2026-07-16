(function () {
  "use strict";

  const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|tiff?|webp)$/i;
  const ARCHIVE_EXTENSION = /\.(?:docx|odp|ods|odt|pptx|xlsx|zip)$/i;
  const MAX_LOCAL_ITEMS = 500;

  const state = {
    items: [],
    selected: new Set(),
    warnings: [],
    objectUrls: new Set(),
    busy: false,
    mode: "single",
    pdfModulePromise: null
  };

  const els = {
    statusText: document.querySelector("#statusText"),
    singleUrlInput: document.querySelector("#singleUrlInput"),
    urlInput: document.querySelector("#urlInput"),
    scanBtn: document.querySelector("#scanBtn"),
    scanMultipleBtn: document.querySelector("#scanMultipleBtn"),
    includeCss: document.querySelector("#includeCss"),
    followLinks: document.querySelector("#followLinks"),
    pageLimit: document.querySelector("#pageLimit"),
    modeTabs: document.querySelectorAll(".mode-tab"),
    sourceViews: document.querySelectorAll(".source-view"),
    optionsRow: document.querySelector(".options-row"),
    fileInput: document.querySelector("#fileInput"),
    pickFilesBtn: document.querySelector("#pickFilesBtn"),
    dropZone: document.querySelector("#dropZone"),
    countText: document.querySelector("#countText"),
    selectedText: document.querySelector("#selectedText"),
    resultsGrid: document.querySelector("#resultsGrid"),
    emptyState: document.querySelector("#emptyState"),
    warnings: document.querySelector("#warnings"),
    searchInput: document.querySelector("#searchInput"),
    minWidthInput: document.querySelector("#minWidthInput"),
    formatFilter: document.querySelector("#formatFilter"),
    sortSelect: document.querySelector("#sortSelect"),
    selectVisibleBtn: document.querySelector("#selectVisibleBtn"),
    deselectBtn: document.querySelector("#deselectBtn"),
    downloadSelectedBtn: document.querySelector("#downloadSelectedBtn"),
    clearBtn: document.querySelector("#clearBtn")
  };

  function setStatus(text) {
    els.statusText.textContent = text;
  }

  function setBusy(value) {
    state.busy = Boolean(value);
    syncControls();
  }

  function syncControls() {
    for (const element of [els.scanBtn, els.scanMultipleBtn, els.pickFilesBtn]) {
      element.disabled = state.busy;
    }
    els.downloadSelectedBtn.disabled = state.busy || state.selected.size === 0;
  }

  function parseUrls(text) {
    return [...new Set(
      String(text || "")
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
        .filter((value) => /^https?:\/\/[^\s,]+$/i.test(value))
    )];
  }

  function imageFormat(item) {
    const source = `${item.name || ""} ${item.source || ""} ${item.mime || ""}`.toLowerCase();
    if (source.includes("jpeg") || /\.jpe?g(?:\?|$|\s)/.test(source)) return "jpg";
    if (source.includes("png") || /\.png(?:\?|$|\s)/.test(source)) return "png";
    if (source.includes("webp") || /\.webp(?:\?|$|\s)/.test(source)) return "webp";
    if (source.includes("gif") || /\.gif(?:\?|$|\s)/.test(source)) return "gif";
    if (source.includes("svg") || /\.svg(?:\?|$|\s)/.test(source)) return "svg";
    return "other";
  }

  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (!bytes) return "size ?";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
  }

  function resolutionLabel(item) {
    return item.width && item.height ? `${item.width} x ${item.height}` : "resolution ?";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function addWarnings(messages) {
    state.warnings.push(...(messages || []).filter(Boolean));
    state.warnings = state.warnings.slice(-30);
  }

  function addItems(items) {
    const existing = new Map(state.items.map((item) => [item.id, item]));
    for (const item of items || []) {
      if (!item || !item.id || existing.has(item.id)) continue;
      existing.set(item.id, item);
      state.selected.add(item.id);
    }
    state.items = [...existing.values()].slice(0, MAX_LOCAL_ITEMS);
    const retainedIds = new Set(state.items.map((item) => item.id));
    state.selected = new Set([...state.selected].filter((id) => retainedIds.has(id)));
  }

  function visibleItems() {
    const query = els.searchInput.value.trim().toLowerCase();
    const minWidth = Number(els.minWidthInput.value || 0);
    const format = els.formatFilter.value;
    const sort = els.sortSelect.value;
    const filtered = state.items.filter((item) => {
      const haystack = `${item.name || ""} ${item.source || ""} ${item.page || ""}`.toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (minWidth && (Number(item.width) || 0) < minWidth) return false;
      if (format !== "all" && imageFormat(item) !== format) return false;
      return true;
    });

    filtered.sort((a, b) => {
      if (sort === "size") return (Number(b.bytes) || 0) - (Number(a.bytes) || 0);
      if (sort === "source") return String(a.source || "").localeCompare(String(b.source || ""));
      return ((Number(b.width) || 0) * (Number(b.height) || 0)) - ((Number(a.width) || 0) * (Number(a.height) || 0));
    });
    return filtered;
  }

  function renderWarnings() {
    if (!state.warnings.length) {
      els.warnings.hidden = true;
      els.warnings.innerHTML = "";
      return;
    }
    els.warnings.hidden = false;
    els.warnings.innerHTML = state.warnings.slice(-6).map((warning) => `<div>${escapeHtml(warning)}</div>`).join("");
  }

  function render() {
    const items = visibleItems();
    els.countText.textContent = `${state.items.length} ${state.items.length === 1 ? "image" : "images"}`;
    els.selectedText.textContent = `${state.selected.size} selected`;
    els.emptyState.hidden = state.items.length !== 0;
    els.resultsGrid.hidden = state.items.length === 0;
    syncControls();

    els.resultsGrid.innerHTML = items.map((item) => {
      const selected = state.selected.has(item.id);
      const sourceTitle = item.page || item.source || "";
      const openTarget = item.kind === "remote" ? item.source : item.preview;
      return `
        <article class="image-card${selected ? " is-selected" : ""}" data-id="${escapeHtml(item.id)}">
          <div class="thumb">
            <img loading="lazy" data-image-id="${escapeHtml(item.id)}" src="${escapeHtml(item.preview)}" alt="">
            <label class="select-box">
              <input type="checkbox" data-action="toggle" data-id="${escapeHtml(item.id)}" ${selected ? "checked" : ""}>
              <span>Select</span>
            </label>
          </div>
          <div class="meta">
            <div class="name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
            <div class="facts">
              <span class="pill" data-resolution="${escapeHtml(item.id)}">${escapeHtml(resolutionLabel(item))}</span>
              <span class="pill">${escapeHtml(formatBytes(item.bytes))}</span>
              <span class="pill">${escapeHtml(imageFormat(item).toUpperCase())}</span>
            </div>
            <div class="source-line" title="${escapeHtml(sourceTitle)}">${escapeHtml(sourceTitle)}</div>
            <div class="card-actions">
              <a href="${escapeHtml(openTarget)}" target="_blank" rel="noreferrer">Open</a>
              <a href="${escapeHtml(item.download)}" download="${escapeHtml(item.name)}">Download</a>
            </div>
          </div>
        </article>
      `;
    }).join("");
    renderWarnings();
  }

  async function scanUrls() {
    const raw = state.mode === "multiple" ? els.urlInput.value : els.singleUrlInput.value;
    const urls = parseUrls(raw);
    if (!urls.length) {
      setStatus("Add at least one URL");
      return;
    }

    setBusy(true);
    setStatus(`Scanning ${urls.length} site${urls.length === 1 ? "" : "s"}...`);
    try {
      const response = await fetch("/api/tools/image-scan", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          urls,
          includeCss: els.includeCss.checked,
          followLinks: els.followLinks.checked,
          pageLimit: Number(els.pageLimit.value || 12)
        })
      });
      if (response.status === 401) {
        window.location.replace("/");
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Website extraction failed.");
      addItems(payload.items);
      addWarnings(payload.warnings);
      if (payload.limited) addWarnings(["The result was limited to 600 website images."]);
      setStatus(`Added ${(payload.items || []).length} image${(payload.items || []).length === 1 ? "" : "s"}`);
    } catch (error) {
      addWarnings([error.message || "Website extraction failed."]);
      setStatus("Scan failed");
    } finally {
      setBusy(false);
      render();
    }
  }

  async function uploadFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    setBusy(true);
    let added = 0;
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setStatus(`Extracting ${file.name} (${index + 1}/${files.length})...`);
        const before = state.items.length;
        try {
          await extractFile(file);
        } catch (error) {
          addWarnings([`${file.name}: ${error.message || "Could not extract this file."}`]);
        }
        added += Math.max(0, state.items.length - before);
        render();
        if (state.items.length >= MAX_LOCAL_ITEMS) {
          addWarnings([`The result was limited to ${MAX_LOCAL_ITEMS} images.`]);
          break;
        }
      }
      setStatus(`Added ${added} image${added === 1 ? "" : "s"}`);
    } finally {
      els.fileInput.value = "";
      setBusy(false);
      render();
    }
  }

  async function extractFile(file) {
    const lowerName = file.name.toLowerCase();
    if (file.type.startsWith("image/") || IMAGE_EXTENSION.test(lowerName)) {
      addItems([await itemFromBlob(file, file.name, file.name)]);
      return;
    }
    if (lowerName.endsWith(".pdf") || file.type === "application/pdf") {
      await extractPdf(file);
      return;
    }
    if (ARCHIVE_EXTENSION.test(lowerName)) {
      await extractArchive(file);
      return;
    }
    throw new Error("Unsupported file. Use PDF, PPTX, DOCX, XLSX, ZIP, OpenDocument, or an image.");
  }

  async function extractArchive(file) {
    if (!window.JSZip) throw new Error("The archive reader did not load.");
    const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
    const entries = Object.values(zip.files).filter((entry) => !entry.dir && IMAGE_EXTENSION.test(entry.name));
    if (!entries.length) throw new Error("No image files were found inside this package.");

    for (const entry of entries) {
      if (state.items.length >= MAX_LOCAL_ITEMS) break;
      const bytes = await entry.async("uint8array");
      const name = entry.name.split("/").pop() || "embedded-image";
      const blob = new Blob([bytes], { type: mimeFromName(name) });
      addItems([await itemFromBlob(blob, name, `${file.name} / ${entry.name}`)]);
    }
  }

  async function getPdfModule() {
    if (!state.pdfModulePromise) {
      state.pdfModulePromise = import("/tools/vendor/pdf.min.mjs").then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = "/tools/vendor/pdf.worker.min.mjs";
        return pdfjs;
      });
    }
    return state.pdfModulePromise;
  }

  async function extractPdf(file) {
    const pdfjs = await getPdfModule();
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false
    });
    const pdf = await loadingTask.promise;
    let extracted = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (state.items.length >= MAX_LOCAL_ITEMS) break;
      setStatus(`Extracting ${file.name}, page ${pageNumber}/${pdf.numPages}...`);
      const page = await pdf.getPage(pageNumber);
      let pageCount = 0;
      try {
        pageCount = await extractPdfPageImages(pdfjs, page, file.name, pageNumber);
      } catch {
        pageCount = 0;
      }
      if (!pageCount) {
        const pageBlob = await renderPdfPage(page);
        addItems([await itemFromBlob(pageBlob, `${stripExtension(file.name)}-page-${pageNumber}.png`, `${file.name} / page ${pageNumber}`)]);
        pageCount = 1;
      }
      extracted += pageCount;
      page.cleanup();
      render();
    }
    await pdf.destroy();
    if (!extracted) throw new Error("No PDF images or pages could be extracted.");
  }

  async function extractPdfPageImages(pdfjs, page, fileName, pageNumber) {
    const operatorList = await page.getOperatorList();
    const seenIds = new Set();
    const candidates = [];

    for (let index = 0; index < operatorList.fnArray.length; index += 1) {
      const fn = operatorList.fnArray[index];
      const args = operatorList.argsArray[index] || [];
      if (fn === pdfjs.OPS.paintInlineImageXObject && args[0]) {
        candidates.push({ key: `inline-${index}`, image: args[0] });
      } else if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintJpegXObject) {
        const id = args[0];
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        try {
          candidates.push({ key: String(id), image: await getPdfObject(page, id) });
        } catch {
          // A page render fallback is used when PDF.js does not expose an image object.
        }
      }
    }

    let count = 0;
    for (const candidate of candidates) {
      if (state.items.length >= MAX_LOCAL_ITEMS) break;
      const blob = await pdfImageToBlob(candidate.image);
      if (!blob) continue;
      count += 1;
      const name = `${stripExtension(fileName)}-p${pageNumber}-image-${count}.png`;
      addItems([await itemFromBlob(blob, name, `${fileName} / page ${pageNumber}`)]);
    }
    return count;
  }

  function getPdfObject(page, id) {
    const readFrom = (store) => new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) reject(new Error("PDF image timed out."));
      }, 7000);
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      try {
        const immediate = store.get(id, finish);
        if (immediate) finish(immediate);
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });

    return readFrom(page.objs).catch(() => readFrom(page.commonObjs));
  }

  async function pdfImageToBlob(image) {
    if (!image) return null;
    const drawable = image.bitmap || image;
    const width = Number(drawable.width || image.width) || 0;
    const height = Number(drawable.height || image.height) || 0;
    if (!width || !height) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });

    if (
      (typeof ImageBitmap !== "undefined" && drawable instanceof ImageBitmap) ||
      (typeof HTMLImageElement !== "undefined" && drawable instanceof HTMLImageElement) ||
      (typeof HTMLCanvasElement !== "undefined" && drawable instanceof HTMLCanvasElement)
    ) {
      context.drawImage(drawable, 0, 0, width, height);
      return canvasToBlob(canvas);
    }

    const data = image.data || drawable.data;
    if (!data) return null;
    const source = new Uint8ClampedArray(data.buffer || data, data.byteOffset || 0, data.byteLength || data.length);
    const pixels = width * height;
    const rgba = new Uint8ClampedArray(pixels * 4);
    if (source.length >= pixels * 4) {
      rgba.set(source.subarray(0, pixels * 4));
    } else if (source.length >= pixels * 3) {
      for (let i = 0; i < pixels; i += 1) {
        rgba[i * 4] = source[i * 3];
        rgba[i * 4 + 1] = source[i * 3 + 1];
        rgba[i * 4 + 2] = source[i * 3 + 2];
        rgba[i * 4 + 3] = 255;
      }
    } else if (source.length >= pixels) {
      for (let i = 0; i < pixels; i += 1) {
        rgba[i * 4] = source[i];
        rgba[i * 4 + 1] = source[i];
        rgba[i * 4 + 2] = source[i];
        rgba[i * 4 + 3] = 255;
      }
    } else {
      return null;
    }
    context.putImageData(new ImageData(rgba, width, height), 0, 0);
    return canvasToBlob(canvas);
  }

  async function renderPdfPage(page) {
    const baseViewport = page.getViewport({ scale: 2.2 });
    const maxPixels = 10_000_000;
    const scaleDown = Math.min(1, Math.sqrt(maxPixels / Math.max(1, baseViewport.width * baseViewport.height)));
    const viewport = page.getViewport({ scale: 2.2 * scaleDown });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    return canvasToBlob(canvas);
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not create an extracted image."));
      }, "image/png");
    });
  }

  async function itemFromBlob(blob, name, source) {
    const objectUrl = URL.createObjectURL(blob);
    state.objectUrls.add(objectUrl);
    const dimensions = await measureImage(objectUrl);
    return {
      id: `local-${crypto.randomUUID()}`,
      kind: "local",
      name,
      source,
      page: source,
      preview: objectUrl,
      download: objectUrl,
      width: dimensions.width,
      height: dimensions.height,
      bytes: blob.size,
      mime: blob.type || mimeFromName(name)
    };
  }

  function measureImage(url) {
    return new Promise((resolve) => {
      const image = new Image();
      const finish = () => resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 });
      image.onload = finish;
      image.onerror = finish;
      image.src = url;
    });
  }

  function mimeFromName(name) {
    const lower = String(name || "").toLowerCase();
    if (/\.jpe?g$/.test(lower)) return "image/jpeg";
    if (/\.png$/.test(lower)) return "image/png";
    if (/\.gif$/.test(lower)) return "image/gif";
    if (/\.webp$/.test(lower)) return "image/webp";
    if (/\.svg$/.test(lower)) return "image/svg+xml";
    if (/\.bmp$/.test(lower)) return "image/bmp";
    if (/\.avif$/.test(lower)) return "image/avif";
    if (/\.ico$/.test(lower)) return "image/x-icon";
    return "application/octet-stream";
  }

  function stripExtension(name) {
    return String(name || "file").replace(/\.[^.]+$/, "");
  }

  async function downloadItems(items) {
    if (!items.length) {
      setStatus("No images selected");
      return;
    }
    setBusy(true);
    try {
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const link = document.createElement("a");
        link.href = item.download;
        link.download = item.name || `image-${index + 1}`;
        link.style.display = "none";
        document.body.append(link);
        link.click();
        link.remove();
        if (items.length > 1) await new Promise((resolve) => setTimeout(resolve, 220));
      }
      setStatus(`Downloaded ${items.length} image${items.length === 1 ? "" : "s"}`);
    } catch (error) {
      addWarnings([error.message || "Download failed."]);
      setStatus("Download failed");
    } finally {
      setBusy(false);
      render();
    }
  }

  function setMode(mode) {
    state.mode = mode;
    for (const tab of els.modeTabs) {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-pressed", String(active));
    }
    for (const view of els.sourceViews) {
      view.classList.toggle("is-active", view.dataset.view === mode);
    }
    els.optionsRow.hidden = mode === "files";
  }

  function clearAll() {
    for (const url of state.objectUrls) URL.revokeObjectURL(url);
    state.objectUrls.clear();
    state.items = [];
    state.selected.clear();
    state.warnings = [];
    els.singleUrlInput.value = "";
    els.urlInput.value = "";
    setStatus("Ready");
    render();
  }

  for (const tab of els.modeTabs) {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
  }
  els.scanBtn.addEventListener("click", scanUrls);
  els.scanMultipleBtn.addEventListener("click", scanUrls);
  els.singleUrlInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      scanUrls();
    }
  });
  els.pickFilesBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    els.fileInput.click();
  });
  els.fileInput.addEventListener("change", () => uploadFiles(els.fileInput.files));
  els.dropZone.addEventListener("click", () => els.fileInput.click());
  els.dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      els.fileInput.click();
    }
  });
  for (const eventName of ["dragenter", "dragover"]) {
    els.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropZone.classList.add("is-dragging");
    });
  }
  for (const eventName of ["dragleave", "drop"]) {
    els.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropZone.classList.remove("is-dragging");
    });
  }
  els.dropZone.addEventListener("drop", (event) => uploadFiles(event.dataTransfer.files));

  els.resultsGrid.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.dataset.action !== "toggle") return;
    if (target.checked) state.selected.add(target.dataset.id);
    else state.selected.delete(target.dataset.id);
    render();
  });

  els.resultsGrid.addEventListener("load", (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.dataset.imageId) return;
    const item = state.items.find((candidate) => candidate.id === image.dataset.imageId);
    if (!item || (item.width && item.height) || !image.naturalWidth || !image.naturalHeight) return;
    item.width = image.naturalWidth;
    item.height = image.naturalHeight;
    const label = els.resultsGrid.querySelector(`[data-resolution="${CSS.escape(item.id)}"]`);
    if (label) label.textContent = resolutionLabel(item);
  }, true);

  for (const element of [els.searchInput, els.minWidthInput, els.formatFilter, els.sortSelect]) {
    element.addEventListener("input", render);
    element.addEventListener("change", render);
  }
  els.selectVisibleBtn.addEventListener("click", () => {
    for (const item of visibleItems()) state.selected.add(item.id);
    render();
  });
  els.deselectBtn.addEventListener("click", () => {
    state.selected.clear();
    render();
  });
  els.downloadSelectedBtn.addEventListener("click", () => {
    downloadItems(state.items.filter((item) => state.selected.has(item.id)));
  });
  els.clearBtn.addEventListener("click", clearAll);
  window.addEventListener("beforeunload", () => {
    for (const url of state.objectUrls) URL.revokeObjectURL(url);
  });

  render();
})();
