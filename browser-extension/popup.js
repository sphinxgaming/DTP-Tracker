document.getElementById("openTracker").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://dtp-web-tracker-y2fl.onrender.com/" });
});

chrome.storage.local.get("lastValidation").then(({ lastValidation }) => {
  if (!lastValidation) return;
  const when = new Date(lastValidation.at).toLocaleString();
  document.getElementById("lastRun").textContent =
    `${when}: ${lastValidation.matched} matched, ${lastValidation.notFound} not found, ${lastValidation.warnings} warning(s).`;
});
