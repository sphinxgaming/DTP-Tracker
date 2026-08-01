(() => {
  "use strict";

  const PAGE_SOURCE = "dtp-tracker-page";
  const HELPER_SOURCE = "dtp-servicenow-helper";
  const port = chrome.runtime.connect({ name: "dtp-servicenow-validation" });

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = event.data;
    if (!message || message.source !== PAGE_SOURCE) return;

    if (message.type === "DTP_SN_PING") {
      window.postMessage({
        source: HELPER_SOURCE,
        type: "DTP_SN_READY",
        requestId: message.requestId,
        version: chrome.runtime.getManifest().version
      }, location.origin);
      return;
    }

    if (message.type === "DTP_SN_VALIDATE") {
      port.postMessage({
        type: "DTP_SN_VALIDATE",
        requestId: message.requestId,
        payload: message.payload || {}
      });
    }
  });

  port.onMessage.addListener((message) => {
    if (!message || !message.requestId) return;
    window.postMessage({ source: HELPER_SOURCE, ...message }, location.origin);
  });

  port.onDisconnect.addListener(() => {
    window.postMessage({
      source: HELPER_SOURCE,
      type: "DTP_SN_HELPER_DISCONNECTED"
    }, location.origin);
  });
})();
