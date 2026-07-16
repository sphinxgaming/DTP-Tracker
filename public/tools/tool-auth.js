(async function protectToolPage() {
  "use strict";

  try {
    const response = await fetch("/api/auth/status", {
      cache: "no-store",
      credentials: "same-origin"
    });
    const status = await response.json().catch(() => ({}));
    if (!response.ok || !status.authenticated || !status.user) {
      window.location.replace("/");
      return;
    }

    const userLabel = document.querySelector("[data-tool-user]");
    if (userLabel) {
      userLabel.textContent = `${status.user.displayName || status.user.username} (${status.user.role})`;
    }
    document.body.classList.remove("tool-loading");
  } catch (error) {
    document.body.classList.remove("tool-loading");
    document.body.innerHTML = `
      <div class="tool-auth-error">
        <h1>Could not open this tool</h1>
        <p>The DTP Tracker server is not reachable. Return to the tracker and try again.</p>
        <a class="tool-button primary" href="/">Back to tracker</a>
      </div>
    `;
  }
})();
