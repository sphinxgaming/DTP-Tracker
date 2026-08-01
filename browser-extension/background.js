importScripts("scraper-core.js");

const CORE = globalThis.DtpServiceNowCore;
const SERVICE_NOW_ORIGIN = "https://fticonsulting.service-now.com";
const MAX_REQUESTS = 120;
const PAGE_TIMEOUT_MS = 30000;
let activeRun = false;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "dtp-servicenow-validation") return;
  port.onMessage.addListener((message) => {
    if (!message || message.type !== "DTP_SN_VALIDATE") return;
    runValidation(message, port).catch((error) => {
      safePost(port, {
        type: "DTP_SN_RESULT",
        requestId: message.requestId,
        ok: false,
        error: error && error.message ? error.message : "ServiceNow validation failed.",
        code: error && error.code ? error.code : "VALIDATION_FAILED"
      });
    });
  });
});

async function runValidation(message, port) {
  if (activeRun) throw new Error("Another ServiceNow validation is already running in this browser.");
  const requestNos = CORE.uniqueRequestNos(message.payload && message.payload.requestNos).slice(0, MAX_REQUESTS);
  const productionName = CORE.cleanText(message.payload && message.payload.productionName);
  if (!requestNos.length) throw new Error("No Request # values were supplied by the tracker.");

  activeRun = true;
  let helperTab = null;
  try {
    helperTab = await chrome.tabs.create({ url: `${SERVICE_NOW_ORIGIN}/`, active: false });
    const adapter = {
      findRequest: (requestNo) => findRequest(helperTab.id, requestNo),
      readRequest: (recordUrl, wantedProduction) => readRequest(helperTab.id, recordUrl, wantedProduction)
    };
    const report = await CORE.validateRequests(requestNos, productionName, adapter, (progress) => {
      safePost(port, { type: "DTP_SN_PROGRESS", requestId: message.requestId, progress });
    });
    if ((message.payload && message.payload.requestNos || []).length > MAX_REQUESTS) {
      report.warnings.push(`Only the first ${MAX_REQUESTS} unique Request # values were checked in this run.`);
    }
    await chrome.storage.local.set({
      lastValidation: {
        at: new Date().toISOString(),
        matched: report.records.length,
        notFound: report.notFound.length,
        warnings: report.warnings.length
      }
    });
    safePost(port, {
      type: "DTP_SN_RESULT",
      requestId: message.requestId,
      ok: true,
      result: { ...report, productionName, version: chrome.runtime.getManifest().version }
    });
    if (helperTab && helperTab.id) await chrome.tabs.remove(helperTab.id).catch(() => {});
  } catch (error) {
    if (helperTab && helperTab.id && error && error.code === "LOGIN_REQUIRED") {
      await chrome.tabs.update(helperTab.id, { active: true }).catch(() => {});
    } else if (helperTab && helperTab.id) {
      await chrome.tabs.remove(helperTab.id).catch(() => {});
    }
    throw error;
  } finally {
    activeRun = false;
  }
}

async function findRequest(tabId, requestNo) {
  const encodedQuery = `stateIN3^GOTOnumber=${requestNo}`;
  const innerUrl = `/u_dtp_request_list.do?sysparm_view=&sysparm_first_row=1&sysparm_query=${encodedQuery}&sysparm_clear_stack=true`;
  const url = `${SERVICE_NOW_ORIGIN}/nav_to.do?uri=${encodeURIComponent(innerUrl)}`;
  return navigateAndScrape(tabId, url, "request", requestNo);
}

async function readRequest(tabId, recordUrl, productionName) {
  const url = new URL(recordUrl, SERVICE_NOW_ORIGIN);
  if (url.origin !== SERVICE_NOW_ORIGIN || !/\/u_dtp_request\.do$/i.test(url.pathname)) {
    throw new Error("ServiceNow returned an unexpected request link.");
  }
  return navigateAndScrape(tabId, url.href, "record", productionName);
}

async function navigateAndScrape(tabId, url, mode, argument) {
  await chrome.tabs.update(tabId, { url, active: false });
  await waitForTabComplete(tabId, PAGE_TIMEOUT_MS);
  const startedAt = Date.now();
  let lastResult = null;
  let notFoundCount = 0;

  while (Date.now() - startedAt < PAGE_TIMEOUT_MS) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ["scraper-core.js", "servicenow-dom.js"]
      });
      const frames = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: (scrapeMode, scrapeArgument) => {
          const scraper = globalThis.DtpServiceNowDom;
          if (!scraper) return { status: "waiting" };
          return scrapeMode === "request"
            ? scraper.scrapeRequest(scrapeArgument)
            : scraper.scrapeRecord(scrapeArgument);
        },
        args: [mode, argument]
      });
      const results = frames.map((frame) => frame.result).filter(Boolean);
      const login = results.find((result) => result.status === "login-required");
      if (login) return login;
      const matched = results.find((result) => result.status === "matched");
      if (matched) return matched;
      const notFound = results.find((result) => result.status === "not-found");
      if (notFound) {
        notFoundCount += 1;
        if (notFoundCount >= 3 && Date.now() - startedAt > 1200) return notFound;
      } else {
        notFoundCount = 0;
      }
      lastResult = results.find((result) => result.status !== "waiting") || lastResult;
    } catch (error) {
      lastResult = { status: "error", message: error.message };
    }
    await delay(500);
  }
  if (lastResult && lastResult.status === "error") throw new Error(lastResult.message);
  throw new Error(`ServiceNow ${mode === "request" ? "list" : "record"} page did not finish loading.`);
}

function waitForTabComplete(tabId, timeoutMs) {
  return chrome.tabs.get(tabId).catch(() => null).then((current) => new Promise((resolve, reject) => {
    if (current && current.status === "complete") {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("ServiceNow page timed out while loading."));
    }, timeoutMs);
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    chrome.tabs.onUpdated.addListener(listener);
  }));
}

function safePost(port, payload) {
  try {
    port.postMessage(payload);
  } catch {
    // The tracker tab may have been closed during a long validation run.
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
