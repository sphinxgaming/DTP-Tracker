(function () {
  "use strict";

  const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  const EMU_PER_INCH = 914400;
  const XML_MIME = "application/xml";

  const NS = {
    a: "http://schemas.openxmlformats.org/drawingml/2006/main",
    p: "http://schemas.openxmlformats.org/presentationml/2006/main",
    r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    rel: "http://schemas.openxmlformats.org/package/2006/relationships",
    ct: "http://schemas.openxmlformats.org/package/2006/content-types",
  };

  const REL_TYPES = {
    image: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
    slide: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
    slideLayout: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout",
    slideMaster: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster",
  };

  const DEFAULTS = {
    targetPpi: 180,
    jpegQuality: 92,
    cleanMasters: true,
    protectSmallArt: true,
  };

  const els = {
    dropZone: document.querySelector("#dropZone"),
    fileInput: document.querySelector("#fileInput"),
    fileCard: document.querySelector("#fileCard"),
    fileName: document.querySelector("#fileName"),
    fileSize: document.querySelector("#fileSize"),
    clearFile: document.querySelector("#clearFile"),
    optimizeButton: document.querySelector("#optimizeButton"),
    targetPpi: document.querySelector("#targetPpi"),
    jpegQuality: document.querySelector("#jpegQuality"),
    cleanMasters: document.querySelector("#cleanMasters"),
    protectSmallArt: document.querySelector("#protectSmallArt"),
    resetSettings: document.querySelector("#resetSettings"),
    progressPanel: document.querySelector("#progressPanel"),
    meterBar: document.querySelector("#meterBar"),
    progressText: document.querySelector("#progressText"),
    resultPanel: document.querySelector("#resultPanel"),
    newSize: document.querySelector("#newSize"),
    savedSize: document.querySelector("#savedSize"),
    downloadLink: document.querySelector("#downloadLink"),
    statsGrid: document.querySelector("#statsGrid"),
    logList: document.querySelector("#logList"),
    copyLog: document.querySelector("#copyLog"),
  };

  const state = {
    file: null,
    downloadUrl: null,
    logLines: [],
  };

  init();

  function init() {
    els.fileInput.addEventListener("change", () => {
      const file = els.fileInput.files && els.fileInput.files[0];
      if (file) selectFile(file);
    });

    els.dropZone.addEventListener("dragenter", handleDrag);
    els.dropZone.addEventListener("dragover", handleDrag);
    els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("is-dragging"));
    els.dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      els.dropZone.classList.remove("is-dragging");
      const file = event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) selectFile(file);
    });

    els.clearFile.addEventListener("click", clearFile);
    els.optimizeButton.addEventListener("click", optimizeSelectedFile);
    els.resetSettings.addEventListener("click", resetSettings);
    els.copyLog.addEventListener("click", copyLog);

    log("Ready. Choose a .pptx file to optimize.");
  }

  function handleDrag(event) {
    event.preventDefault();
    els.dropZone.classList.add("is-dragging");
  }

  function selectFile(file) {
    clearDownload();
    clearLog();

    if (!file.name.toLowerCase().endsWith(".pptx")) {
      state.file = null;
      els.fileInput.value = "";
      els.optimizeButton.disabled = true;
      els.fileCard.classList.add("hidden");
      log("This tool supports .pptx files only. Old .ppt files use a binary format and need to be converted first.", "error");
      return;
    }

    state.file = file;
    els.fileName.textContent = file.name;
    els.fileSize.textContent = formatBytes(file.size);
    els.fileCard.classList.remove("hidden");
    els.optimizeButton.disabled = false;
    els.resultPanel.classList.add("hidden");
    log(`Loaded ${file.name} (${formatBytes(file.size)}).`);
  }

  function clearFile() {
    state.file = null;
    els.fileInput.value = "";
    els.fileCard.classList.add("hidden");
    els.optimizeButton.disabled = true;
    els.progressPanel.classList.add("hidden");
    els.resultPanel.classList.add("hidden");
    clearDownload();
    clearLog();
    log("Ready. Choose a .pptx file to optimize.");
  }

  function resetSettings() {
    els.targetPpi.value = String(DEFAULTS.targetPpi);
    els.jpegQuality.value = String(DEFAULTS.jpegQuality);
    els.cleanMasters.checked = DEFAULTS.cleanMasters;
    els.protectSmallArt.checked = DEFAULTS.protectSmallArt;
  }

  function getOptions() {
    return {
      targetPpi: clamp(parseInt(els.targetPpi.value, 10) || DEFAULTS.targetPpi, 150, 300),
      jpegQuality: clamp(parseInt(els.jpegQuality.value, 10) || DEFAULTS.jpegQuality, 80, 98) / 100,
      cleanMasters: els.cleanMasters.checked,
      protectSmallArt: els.protectSmallArt.checked,
    };
  }

  async function optimizeSelectedFile() {
    if (!state.file) return;

    clearDownload();
    els.resultPanel.classList.add("hidden");
    els.optimizeButton.disabled = true;
    setProgress(2, "Reading PPTX package");
    log("Starting optimization.");

    const stats = {
      imagesFound: 0,
      imagesResized: 0,
      imagesSkipped: 0,
      imageBytesBefore: 0,
      imageBytesAfter: 0,
      mastersDeleted: 0,
      layoutsDeleted: 0,
      orphanMediaRemoved: 0,
      orphanBytesRemoved: 0,
    };

    try {
      const options = getOptions();
      const originalSize = state.file.size;
      const zip = await JSZip.loadAsync(await state.file.arrayBuffer());

      if (!zip.file("ppt/presentation.xml")) {
        throw new Error("This file does not look like a valid .pptx package.");
      }

      if (options.cleanMasters) {
        setProgress(14, "Removing unused slide masters and layouts");
        const cleanupStats = await cleanUnusedMastersAndLayouts(zip);
        Object.assign(stats, cleanupStats);
        if (stats.mastersDeleted || stats.layoutsDeleted) {
          log(`Removed ${stats.mastersDeleted} unused master(s) and ${stats.layoutsDeleted} unused layout(s).`);
        } else {
          log("No unused slide masters or layouts were found.");
        }
      }

      setProgress(32, "Analyzing image placements");
      const slideSize = await readPresentationSize(zip);
      const usages = await collectImageUsages(zip, slideSize);
      stats.imagesFound = usages.size;
      log(`Found ${stats.imagesFound} referenced raster image(s).`);

      setProgress(45, "Resizing oversized images");
      await optimizeImages(zip, usages, options, stats, (index, total) => {
        const percent = 45 + Math.round((index / Math.max(total, 1)) * 30);
        setProgress(percent, `Resizing oversized images (${index}/${total})`);
      });

      setProgress(78, "Removing orphaned media");
      const orphanStats = await removeOrphanMedia(zip);
      stats.orphanMediaRemoved = orphanStats.count;
      stats.orphanBytesRemoved = orphanStats.bytes;
      if (orphanStats.count) {
        log(`Removed ${orphanStats.count} unreferenced media file(s).`);
      }

      setProgress(88, "Repacking optimized deck");
      const optimizedBlob = await zip.generateAsync(
        {
          type: "blob",
          mimeType: PPTX_MIME,
          compression: "DEFLATE",
          compressionOptions: { level: 9 },
        },
        (metadata) => {
          const percent = 88 + Math.round((metadata.percent / 100) * 11);
          setProgress(percent, `Repacking optimized deck (${Math.round(metadata.percent)}%)`);
        },
      );

      const optimizedName = makeOptimizedName(state.file.name);
      state.downloadUrl = URL.createObjectURL(optimizedBlob);
      els.downloadLink.href = state.downloadUrl;
      els.downloadLink.download = optimizedName;

      showResults(originalSize, optimizedBlob.size, stats);
      setProgress(100, "Done");
      log(`Finished. Output file: ${optimizedName}.`);
    } catch (error) {
      setProgress(0, "Could not optimize this file");
      log(error && error.message ? error.message : String(error), "error");
    } finally {
      els.optimizeButton.disabled = !state.file;
    }
  }

  async function cleanUnusedMastersAndLayouts(zip) {
    const stats = { mastersDeleted: 0, layoutsDeleted: 0 };
    const deletedPaths = new Set();
    const presDoc = await readXml(zip, "ppt/presentation.xml");
    const presRels = await getRelationships(zip, "ppt/_rels/presentation.xml.rels", "ppt/presentation.xml");

    if (!presDoc || !presRels) return stats;

    const slidePaths = collectSlidePathsFromPresentation(presDoc, presRels);
    if (!slidePaths.length) {
      for (const path of getPartPaths(zip, /^ppt\/slides\/slide\d+\.xml$/)) slidePaths.push(path);
    }

    const usedLayouts = new Set();
    for (const slidePath of slidePaths) {
      const rels = await getRelationshipsForPart(zip, slidePath);
      if (!rels) continue;
      for (const rel of rels.list) {
        if (isRelType(rel.type, "slideLayout") && rel.targetPath) usedLayouts.add(rel.targetPath);
      }
    }

    const usedMasters = new Set();
    for (const layoutPath of usedLayouts) {
      const rels = await getRelationshipsForPart(zip, layoutPath);
      if (!rels) continue;
      for (const rel of rels.list) {
        if (isRelType(rel.type, "slideMaster") && rel.targetPath) usedMasters.add(rel.targetPath);
      }
    }

    const allLayouts = getPartPaths(zip, /^ppt\/slideLayouts\/slideLayout\d+\.xml$/);
    const allMasters = getPartPaths(zip, /^ppt\/slideMasters\/slideMaster\d+\.xml$/);
    const unusedLayouts = allLayouts.filter((path) => !usedLayouts.has(path));
    const unusedMasters = allMasters.filter((path) => !usedMasters.has(path));

    updatePresentationMasterRefs(zip, presDoc, presRels, usedMasters);

    for (const masterPath of allMasters) {
      if (!unusedMasters.includes(masterPath)) {
        await updateMasterLayoutRefs(zip, masterPath, usedLayouts);
      }
    }

    for (const path of unusedLayouts) {
      zip.remove(path);
      zip.remove(relsPathForPart(path));
      deletedPaths.add(path);
      stats.layoutsDeleted += 1;
    }

    for (const path of unusedMasters) {
      zip.remove(path);
      zip.remove(relsPathForPart(path));
      deletedPaths.add(path);
      stats.mastersDeleted += 1;
    }

    if (deletedPaths.size) await removeContentTypeOverrides(zip, deletedPaths);
    return stats;
  }

  function collectSlidePathsFromPresentation(presDoc, presRels) {
    const paths = [];
    for (const sldId of elementsByLocalName(presDoc, "sldId")) {
      const rid = relAttr(sldId, "id");
      const rel = rid ? presRels.byId.get(rid) : null;
      if (rel && isRelType(rel.type, "slide") && rel.targetPath) paths.push(rel.targetPath);
    }
    return paths;
  }

  function updatePresentationMasterRefs(zip, presDoc, presRels, usedMasters) {
    const masterIds = elementsByLocalName(presDoc, "sldMasterId");
    for (const masterId of masterIds) {
      const rid = relAttr(masterId, "id");
      const rel = rid ? presRels.byId.get(rid) : null;
      if (rel && isRelType(rel.type, "slideMaster") && !usedMasters.has(rel.targetPath)) {
        masterId.parentNode.removeChild(masterId);
      }
    }

    for (const relEl of elementsByLocalName(presRels.doc, "Relationship")) {
      const rel = relationshipFromElement(relEl, "ppt/presentation.xml");
      if (isRelType(rel.type, "slideMaster") && !usedMasters.has(rel.targetPath)) {
        relEl.parentNode.removeChild(relEl);
      }
    }

    writeXml(zip, "ppt/presentation.xml", presDoc);
    writeXml(zip, "ppt/_rels/presentation.xml.rels", presRels.doc);
  }

  async function updateMasterLayoutRefs(zip, masterPath, usedLayouts) {
    const masterDoc = await readXml(zip, masterPath);
    const masterRels = await getRelationshipsForPart(zip, masterPath);
    if (!masterDoc || !masterRels) return;

    for (const layoutId of elementsByLocalName(masterDoc, "sldLayoutId")) {
      const rid = relAttr(layoutId, "id");
      const rel = rid ? masterRels.byId.get(rid) : null;
      if (rel && isRelType(rel.type, "slideLayout") && !usedLayouts.has(rel.targetPath)) {
        layoutId.parentNode.removeChild(layoutId);
      }
    }

    for (const relEl of elementsByLocalName(masterRels.doc, "Relationship")) {
      const rel = relationshipFromElement(relEl, masterPath);
      if (isRelType(rel.type, "slideLayout") && !usedLayouts.has(rel.targetPath)) {
        relEl.parentNode.removeChild(relEl);
      }
    }

    writeXml(zip, masterPath, masterDoc);
    writeXml(zip, relsPathForPart(masterPath), masterRels.doc);
  }

  async function readPresentationSize(zip) {
    const doc = await readXml(zip, "ppt/presentation.xml");
    const slideSize = doc ? elementsByLocalName(doc, "sldSz")[0] : null;
    const cx = slideSize ? parseInt(slideSize.getAttribute("cx"), 10) : 0;
    const cy = slideSize ? parseInt(slideSize.getAttribute("cy"), 10) : 0;
    return {
      cx: Number.isFinite(cx) && cx > 0 ? cx : 12192000,
      cy: Number.isFinite(cy) && cy > 0 ? cy : 6858000,
    };
  }

  async function collectImageUsages(zip, slideSize) {
    const usageMap = new Map();
    const parts = [
      ...getPartPaths(zip, /^ppt\/slides\/slide\d+\.xml$/),
      ...getPartPaths(zip, /^ppt\/slideLayouts\/slideLayout\d+\.xml$/),
      ...getPartPaths(zip, /^ppt\/slideMasters\/slideMaster\d+\.xml$/),
    ];

    for (const partPath of parts) {
      const doc = await readXml(zip, partPath);
      const rels = await getRelationshipsForPart(zip, partPath);
      if (!doc || !rels) continue;

      const imageRels = new Map();
      for (const rel of rels.list) {
        if (isRelType(rel.type, "image") && rel.targetPath && rel.targetPath.startsWith("ppt/media/")) {
          imageRels.set(rel.id, rel.targetPath);
        }
      }

      if (!imageRels.size) continue;

      for (const blip of elementsByLocalName(doc, "blip")) {
        const rid = relAttr(blip, "embed") || relAttr(blip, "link");
        const mediaPath = rid ? imageRels.get(rid) : null;
        if (!mediaPath) continue;

        const extent = findExtentForBlip(blip) || slideSize;
        const usage = getOrCreateUsage(usageMap, mediaPath);
        usage.count += 1;
        usage.maxCx = Math.max(usage.maxCx, extent.cx || 0);
        usage.maxCy = Math.max(usage.maxCy, extent.cy || 0);
        usage.partTypes.add(partType(partPath));
      }
    }

    return usageMap;
  }

  async function optimizeImages(zip, usages, options, stats, progress) {
    const entries = Array.from(usages.entries()).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

    for (let index = 0; index < entries.length; index += 1) {
      const [path, usage] = entries[index];
      progress(index + 1, entries.length);

      const file = zip.file(path);
      if (!file) continue;

      const ext = extension(path);
      const mime = imageMimeForExtension(ext);
      if (!mime) {
        stats.imagesSkipped += 1;
        continue;
      }

      const originalBytes = await file.async("uint8array");
      stats.imageBytesBefore += originalBytes.byteLength;

      if (originalBytes.byteLength < 120 * 1024) {
        stats.imagesSkipped += 1;
        stats.imageBytesAfter += originalBytes.byteLength;
        continue;
      }

      const blob = new Blob([originalBytes], { type: mime });
      let bitmap;
      try {
        bitmap = await createImageBitmap(blob);
      } catch (error) {
        stats.imagesSkipped += 1;
        stats.imageBytesAfter += originalBytes.byteLength;
        continue;
      }

      const dimensions = { width: bitmap.width, height: bitmap.height };
      const hasAlpha = ext === "png" && pngHasAlpha(originalBytes);
      const protectionReason = protectedImageReason(usage, dimensions, hasAlpha, options);
      if (protectionReason) {
        bitmap.close();
        stats.imagesSkipped += 1;
        stats.imageBytesAfter += originalBytes.byteLength;
        continue;
      }

      const plan = planResize(dimensions, usage, options.targetPpi);
      if (!plan) {
        bitmap.close();
        stats.imagesSkipped += 1;
        stats.imageBytesAfter += originalBytes.byteLength;
        continue;
      }

      const resizedBlob = await resizeBitmap(bitmap, plan.width, plan.height, mime, options.jpegQuality);
      bitmap.close();

      if (!resizedBlob || resizedBlob.size >= originalBytes.byteLength * 0.95) {
        stats.imagesSkipped += 1;
        stats.imageBytesAfter += originalBytes.byteLength;
        continue;
      }

      zip.file(path, await resizedBlob.arrayBuffer(), { binary: true });
      stats.imagesResized += 1;
      stats.imageBytesAfter += resizedBlob.size;
      log(`Resized ${basename(path)} from ${dimensions.width}x${dimensions.height} to ${plan.width}x${plan.height}.`);
    }
  }

  function protectedImageReason(usage, dimensions, hasAlpha, options) {
    if (!options.protectSmallArt) return "";

    const maxDisplayInches = Math.max(usage.maxCx / EMU_PER_INCH, usage.maxCy / EMU_PER_INCH);
    const shortestSide = Math.min(dimensions.width, dimensions.height);
    const isMasterArt = usage.partTypes.has("master") || usage.partTypes.has("layout");

    if (shortestSide <= 512) return "small art";
    if (hasAlpha && maxDisplayInches <= 3) return "transparent logo-like art";
    if (isMasterArt && maxDisplayInches <= 3.25) return "master logo-like art";
    if (usage.count >= 3 && maxDisplayInches <= 3.25) return "reused logo-like art";
    return "";
  }

  function planResize(dimensions, usage, targetPpi) {
    const displayWidth = usage.maxCx / EMU_PER_INCH;
    const displayHeight = usage.maxCy / EMU_PER_INCH;
    if (!displayWidth || !displayHeight) return null;

    const minScaleForPpi = Math.max(
      (displayWidth * targetPpi) / dimensions.width,
      (displayHeight * targetPpi) / dimensions.height,
    );

    if (!Number.isFinite(minScaleForPpi) || minScaleForPpi >= 0.92) return null;

    const scale = Math.max(0.5, minScaleForPpi);
    if (scale >= 0.92) return null;

    const width = Math.max(1, Math.round(dimensions.width * scale));
    const height = Math.max(1, Math.round(dimensions.height * scale));

    if (width >= dimensions.width || height >= dimensions.height) return null;
    return { width, height, scale };
  }

  async function resizeBitmap(bitmap, width, height, mime, jpegQuality) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: mime === "image/png" });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    return new Promise((resolve) => {
      canvas.toBlob(resolve, mime, mime === "image/jpeg" ? jpegQuality : undefined);
    });
  }

  async function removeOrphanMedia(zip) {
    const mediaPaths = getPartPaths(zip, /^ppt\/media\/[^/]+$/);
    const referenced = new Set();

    for (const relsPath of getPartPaths(zip, /(^|\/)_rels\/.*\.rels$/)) {
      const sourcePath = sourcePartFromRelsPath(relsPath);
      const rels = await getRelationships(zip, relsPath, sourcePath);
      if (!rels) continue;

      for (const rel of rels.list) {
        if (rel.targetPath && rel.targetPath.startsWith("ppt/media/")) referenced.add(rel.targetPath);
      }
    }

    let count = 0;
    let bytes = 0;
    for (const mediaPath of mediaPaths) {
      if (referenced.has(mediaPath)) continue;
      const file = zip.file(mediaPath);
      if (file) {
        bytes += file._data && typeof file._data.uncompressedSize === "number" ? file._data.uncompressedSize : 0;
      }
      zip.remove(mediaPath);
      count += 1;
    }

    return { count, bytes };
  }

  async function removeContentTypeOverrides(zip, deletedPaths) {
    const doc = await readXml(zip, "[Content_Types].xml");
    if (!doc) return;

    for (const override of elementsByLocalName(doc, "Override")) {
      const partName = (override.getAttribute("PartName") || "").replace(/^\//, "");
      if (deletedPaths.has(partName)) override.parentNode.removeChild(override);
    }

    writeXml(zip, "[Content_Types].xml", doc);
  }

  function findExtentForBlip(blip) {
    let cursor = blip.parentNode;
    while (cursor && cursor.nodeType === Node.ELEMENT_NODE) {
      if (["pic", "sp", "graphicFrame", "cxnSp", "grpSp"].includes(cursor.localName)) {
        for (const xfrm of elementsByLocalName(cursor, "xfrm")) {
          for (const child of Array.from(xfrm.childNodes)) {
            if (child.nodeType === Node.ELEMENT_NODE && child.localName === "ext") {
              const cx = parseInt(child.getAttribute("cx"), 10);
              const cy = parseInt(child.getAttribute("cy"), 10);
              if (Number.isFinite(cx) && Number.isFinite(cy) && cx > 0 && cy > 0) return { cx, cy };
            }
          }
        }
      }
      cursor = cursor.parentNode;
    }
    return null;
  }

  function getOrCreateUsage(map, path) {
    if (!map.has(path)) {
      map.set(path, {
        count: 0,
        maxCx: 0,
        maxCy: 0,
        partTypes: new Set(),
      });
    }
    return map.get(path);
  }

  async function readXml(zip, path) {
    const file = zip.file(path);
    if (!file) return null;
    const text = await file.async("string");
    const doc = new DOMParser().parseFromString(text, XML_MIME);
    const parserError = doc.getElementsByTagName("parsererror")[0];
    if (parserError) throw new Error(`Could not parse ${path}.`);
    return doc;
  }

  function writeXml(zip, path, doc) {
    zip.file(path, new XMLSerializer().serializeToString(doc));
  }

  async function getRelationshipsForPart(zip, partPath) {
    return getRelationships(zip, relsPathForPart(partPath), partPath);
  }

  async function getRelationships(zip, relsPath, sourcePath) {
    const doc = await readXml(zip, relsPath);
    if (!doc) return null;

    const list = elementsByLocalName(doc, "Relationship").map((el) => relationshipFromElement(el, sourcePath));
    return {
      doc,
      list,
      byId: new Map(list.map((rel) => [rel.id, rel])),
    };
  }

  function relationshipFromElement(el, sourcePath) {
    const target = el.getAttribute("Target") || "";
    const targetMode = el.getAttribute("TargetMode") || "";
    const isExternal = targetMode.toLowerCase() === "external" || /^https?:/i.test(target);
    return {
      id: el.getAttribute("Id") || "",
      type: el.getAttribute("Type") || "",
      target,
      targetMode,
      targetPath: isExternal ? "" : resolvePartTarget(sourcePath, target),
    };
  }

  function isRelType(type, key) {
    const expected = REL_TYPES[key];
    return type === expected || type.endsWith(`/${key}`);
  }

  function relAttr(el, localName) {
    return el.getAttributeNS(NS.r, localName) || el.getAttribute(`r:${localName}`) || el.getAttribute(localName) || "";
  }

  function elementsByLocalName(root, localName) {
    return Array.from(root.getElementsByTagName("*")).filter((el) => el.localName === localName);
  }

  function relsPathForPart(partPath) {
    const dir = dirname(partPath);
    const name = basename(partPath);
    return dir ? `${dir}/_rels/${name}.rels` : `_rels/${name}.rels`;
  }

  function sourcePartFromRelsPath(relsPath) {
    const pieces = relsPath.split("/");
    const relsIndex = pieces.lastIndexOf("_rels");
    if (relsIndex === -1) return "";
    const relsFile = pieces[relsIndex + 1] || "";
    const sourceFile = relsFile.replace(/\.rels$/i, "");
    const base = pieces.slice(0, relsIndex).join("/");
    return base ? `${base}/${sourceFile}` : sourceFile;
  }

  function resolvePartTarget(sourcePath, target) {
    if (!target || target.startsWith("/")) return target.replace(/^\//, "");
    return normalizePath(`${dirname(sourcePath)}/${target}`);
  }

  function normalizePath(path) {
    const out = [];
    for (const piece of path.split("/")) {
      if (!piece || piece === ".") continue;
      if (piece === "..") out.pop();
      else out.push(piece);
    }
    return out.join("/");
  }

  function getPartPaths(zip, pattern) {
    return Object.keys(zip.files)
      .filter((path) => !zip.files[path].dir && pattern.test(path))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  function partType(path) {
    if (path.includes("/slideMasters/")) return "master";
    if (path.includes("/slideLayouts/")) return "layout";
    return "slide";
  }

  function dirname(path) {
    const index = path.lastIndexOf("/");
    return index === -1 ? "" : path.slice(0, index);
  }

  function basename(path) {
    const index = path.lastIndexOf("/");
    return index === -1 ? path : path.slice(index + 1);
  }

  function extension(path) {
    const index = path.lastIndexOf(".");
    return index === -1 ? "" : path.slice(index + 1).toLowerCase();
  }

  function imageMimeForExtension(ext) {
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "png") return "image/png";
    return "";
  }

  function pngHasAlpha(bytes) {
    if (bytes.length < 33) return false;
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < signature.length; i += 1) {
      if (bytes[i] !== signature[i]) return false;
    }

    const colorType = bytes[25];
    if (colorType === 4 || colorType === 6) return true;

    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = readUint32(bytes, offset);
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      if (type === "tRNS") return true;
      offset += 12 + length;
    }
    return false;
  }

  function readUint32(bytes, offset) {
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  }

  function showResults(originalSize, optimizedSize, stats) {
    const savedBytes = Math.max(0, originalSize - optimizedSize);
    const savedPercent = originalSize ? (savedBytes / originalSize) * 100 : 0;

    els.newSize.textContent = formatBytes(optimizedSize);
    els.savedSize.textContent = `${formatBytes(savedBytes)} (${savedPercent.toFixed(1)}%)`;
    els.statsGrid.innerHTML = "";

    const cards = [
      ["Images resized", stats.imagesResized],
      ["Images protected/skipped", stats.imagesSkipped],
      ["Masters removed", stats.mastersDeleted],
      ["Layouts removed", stats.layoutsDeleted],
      ["Orphan media removed", stats.orphanMediaRemoved],
      ["Image bytes saved", formatBytes(Math.max(0, stats.imageBytesBefore - stats.imageBytesAfter))],
      ["Original size", formatBytes(originalSize)],
      ["Package saved", formatBytes(savedBytes)],
    ];

    for (const [label, value] of cards) {
      const card = document.createElement("div");
      card.className = "stat";
      card.innerHTML = `<strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span>`;
      els.statsGrid.appendChild(card);
    }

    els.resultPanel.classList.remove("hidden");
  }

  function setProgress(percent, text) {
    els.progressPanel.classList.remove("hidden");
    els.meterBar.style.width = `${clamp(percent, 0, 100)}%`;
    els.progressText.textContent = text;
  }

  function log(message, level) {
    const line = { message, level: level || "info" };
    state.logLines.push(line);
    const item = document.createElement("li");
    item.textContent = message;
    if (level === "error") item.classList.add("error");
    els.logList.appendChild(item);
    els.logList.scrollTop = els.logList.scrollHeight;
  }

  function clearLog() {
    state.logLines = [];
    els.logList.innerHTML = "";
  }

  async function copyLog() {
    const text = state.logLines.map((line) => line.message).join("\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      log("Log copied.");
    } catch (error) {
      log("Could not copy the log in this browser.", "error");
    }
  }

  function clearDownload() {
    if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
    state.downloadUrl = null;
    els.downloadLink.removeAttribute("href");
  }

  function makeOptimizedName(name) {
    return name.replace(/\.pptx$/i, "") + "-optimized.pptx";
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function escapeHtml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
