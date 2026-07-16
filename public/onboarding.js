(function () {
  "use strict";

  const BASE_STEPS = [
    {
      target: ".intake-band",
      title: "Add a job and start review",
      text: "Paste or type the Request #, client, slide count, and deadline, then select Add + Review. The tracker creates the row and starts review time immediately."
    },
    {
      target: ".work-panel",
      title: "Set your production budget",
      text: "Whole numbers are minutes, so 30 means 30 minutes. Decimal values are hours, so 1.5 means 1 hour 30 minutes. Review time stays separate from this production budget."
    },
    {
      target: ".work-panel .button-grid",
      title: "Start, pause, resume, and finish",
      text: "Select Start when production begins. Use Pause only when another review or quality-check job interrupts the current job. Resume continues the same row, and End Job closes it."
    },
    {
      target: ".break-panel",
      title: "Track or plan a break",
      text: "Use Break for an immediate break, or choose a Start DXB and End DXB time before selecting Add break. Used break time reduces the remaining break balance and extends your expected finish."
    },
    {
      target: ".clock-panel",
      title: "Check your DXB expected finish",
      text: "Expected Finish is always shown in Dubai time and updates as work or break timing changes. Viewer time converts the current time to your selected country and capital."
    },
    {
      target: ".filters",
      title: "Choose the records you want to see",
      text: "Search by request, client, or deadline. From, To, and Category filters control the visible table rows and every dashboard calculation."
    },
    {
      target: ".table-wrap",
      title: "Review and correct your rows",
      text: "Date, worked hours, slides, category, client, deadline, and break are editable. Request # is locked against accidental edits. Selecting a row highlights it, and Continue resumes a parked unfinished job."
    },
    {
      target: ".export-actions",
      title: "Import, add, select, and export",
      text: "Add a missing manual row, import old Excel or Word timesheet data, select visible rows for bulk deletion, or generate the filtered records in the official Word timesheet."
    },
    {
      target: ".dashboard-panel .dashboard-head",
      title: "Understand your visible workload",
      text: "The dashboard totals visible rows, hours, minutes, qualifying overtime, and category share. Overtime is counted only when the daily overtime reaches at least 30 minutes."
    },
    {
      target: ".header-tools",
      title: "Open the DTP utility tools",
      text: "PPTX Slimmer reduces presentation size in the browser. Image Extractor collects high-resolution images from public sites and uploaded files. Both open in a separate tab so your tracker stays available."
    }
  ];

  let els = {};
  let currentUser = null;
  let pendingAuthDetail = null;
  let ready = false;
  let promptShown = false;
  let promptTimer = 0;
  let tourActive = false;
  let tourSteps = [];
  let tourIndex = 0;
  let currentTarget = null;
  let layoutFrame = 0;
  let lastFocused = null;

  window.addEventListener("dtp:auth-user", (event) => {
    pendingAuthDetail = event.detail || { user: null, viewUser: null };
    if (ready) applyAuthDetail(pendingAuthDetail);
  });

  document.addEventListener("DOMContentLoaded", () => {
    bindElements();
    bindEvents();
    ready = true;
    if (pendingAuthDetail) applyAuthDetail(pendingAuthDetail);
  });

  function bindElements() {
    els = {
      tourBtn: document.querySelector("#tourBtn"),
      welcome: document.querySelector("#tourWelcome"),
      startBtn: document.querySelector("#tourStartBtn"),
      skipWelcomeBtn: document.querySelector("#tourSkipWelcomeBtn"),
      layer: document.querySelector("#tourLayer"),
      spotlight: document.querySelector("#tourSpotlight"),
      callout: document.querySelector("#tourCallout"),
      progress: document.querySelector("#tourProgress"),
      title: document.querySelector("#tourStepTitle"),
      text: document.querySelector("#tourStepText"),
      backBtn: document.querySelector("#tourBackBtn"),
      nextBtn: document.querySelector("#tourNextBtn"),
      closeBtn: document.querySelector("#tourCloseBtn")
    };
  }

  function bindEvents() {
    els.tourBtn.addEventListener("click", showWelcome);
    els.startBtn.addEventListener("click", startTour);
    els.skipWelcomeBtn.addEventListener("click", skipTour);
    els.closeBtn.addEventListener("click", skipTour);
    els.backBtn.addEventListener("click", previousStep);
    els.nextBtn.addEventListener("click", nextStep);
    window.addEventListener("resize", schedulePosition);
    window.addEventListener("scroll", schedulePosition, true);
    document.addEventListener("keydown", handleKeydown);
  }

  function applyAuthDetail(detail) {
    const nextUser = detail?.user || null;
    const changedUser = nextUser?.id !== currentUser?.id;
    currentUser = nextUser;

    if (!currentUser) {
      clearTimeout(promptTimer);
      promptShown = false;
      hideWelcome();
      closeTour(false);
      els.tourBtn.hidden = true;
      return;
    }

    if (changedUser) promptShown = false;
    els.tourBtn.hidden = false;
    els.tourBtn.textContent = currentUser.onboardingCompleted === false ? "Get Started" : "Tour";

    if (currentUser.onboardingCompleted === false && !promptShown && !tourActive && els.welcome.hidden) {
      promptShown = true;
      clearTimeout(promptTimer);
      promptTimer = window.setTimeout(() => {
        if (currentUser?.onboardingCompleted === false && !document.body.classList.contains("auth-locked")) {
          showWelcome();
        }
      }, 650);
    }
  }

  function showWelcome() {
    if (!currentUser) return;
    lastFocused = document.activeElement;
    els.welcome.hidden = false;
    requestAnimationFrame(() => els.startBtn.focus());
  }

  function hideWelcome() {
    els.welcome.hidden = true;
  }

  function startTour() {
    if (!currentUser) return;
    hideWelcome();
    tourSteps = buildSteps();
    if (!tourSteps.length) {
      completeOnboarding();
      return;
    }
    tourActive = true;
    tourIndex = 0;
    els.layer.hidden = false;
    renderStep();
  }

  function buildSteps() {
    const steps = [...BASE_STEPS];
    if (currentUser?.role === "admin") {
      steps.push({
        target: "#adminPanelBtn",
        title: "Manage designer accounts",
        text: "Admins can add designers, promote another admin, reset passwords, deactivate access, and open each designer name to review that person's private tracker."
      });
    }
    return steps.filter((step) => {
      const target = document.querySelector(step.target);
      return target && isVisible(target);
    });
  }

  function isVisible(element) {
    if (!element || element.hidden) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function renderStep() {
    if (!tourActive) return;
    const step = tourSteps[tourIndex];
    currentTarget = step ? document.querySelector(step.target) : null;
    if (!step || !currentTarget || !isVisible(currentTarget)) {
      if (tourIndex < tourSteps.length - 1) {
        tourIndex += 1;
        renderStep();
      } else {
        finishTour();
      }
      return;
    }

    els.progress.textContent = `Step ${tourIndex + 1} of ${tourSteps.length}`;
    els.title.textContent = step.title;
    els.text.textContent = step.text;
    els.backBtn.disabled = tourIndex === 0;
    els.nextBtn.textContent = tourIndex === tourSteps.length - 1 ? "Finish" : "Next";
    currentTarget.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    schedulePosition();
    window.setTimeout(() => {
      positionTour();
      els.nextBtn.focus();
    }, 360);
  }

  function schedulePosition() {
    if (!tourActive || !currentTarget) return;
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(positionTour);
  }

  function positionTour() {
    if (!tourActive || !currentTarget || !isVisible(currentTarget)) return;
    const margin = 10;
    const padding = 7;
    const gap = 14;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const rect = currentTarget.getBoundingClientRect();

    const spotLeft = clamp(rect.left - padding, 5, viewportWidth - 25);
    const spotTop = clamp(rect.top - padding, 5, viewportHeight - 25);
    const spotRight = clamp(rect.right + padding, 25, viewportWidth - 5);
    const spotBottom = clamp(rect.bottom + padding, 25, viewportHeight - 5);
    els.spotlight.style.left = `${spotLeft}px`;
    els.spotlight.style.top = `${spotTop}px`;
    els.spotlight.style.width = `${Math.max(20, spotRight - spotLeft)}px`;
    els.spotlight.style.height = `${Math.max(20, spotBottom - spotTop)}px`;

    els.callout.style.visibility = "hidden";
    els.callout.style.left = `${margin}px`;
    els.callout.style.top = `${margin}px`;
    const calloutRect = els.callout.getBoundingClientRect();
    const calloutWidth = calloutRect.width;
    const calloutHeight = calloutRect.height;
    const centeredLeft = rect.left + (rect.width / 2) - (calloutWidth / 2);
    const left = clamp(centeredLeft, margin, viewportWidth - calloutWidth - margin);
    const below = spotBottom + gap;
    const above = spotTop - calloutHeight - gap;
    let top;
    if (below + calloutHeight <= viewportHeight - margin) {
      top = below;
    } else if (above >= margin) {
      top = above;
    } else {
      top = Math.max(margin, viewportHeight - calloutHeight - margin);
    }
    els.callout.style.left = `${left}px`;
    els.callout.style.top = `${top}px`;
    els.callout.style.visibility = "visible";
  }

  function previousStep() {
    if (!tourActive || tourIndex <= 0) return;
    tourIndex -= 1;
    renderStep();
  }

  function nextStep() {
    if (!tourActive) return;
    if (tourIndex >= tourSteps.length - 1) {
      finishTour();
      return;
    }
    tourIndex += 1;
    renderStep();
  }

  function finishTour() {
    closeTour(true);
    completeOnboarding();
  }

  function skipTour() {
    hideWelcome();
    closeTour(true);
    completeOnboarding();
  }

  function closeTour(restoreFocus) {
    tourActive = false;
    currentTarget = null;
    tourSteps = [];
    els.layer.hidden = true;
    els.callout.style.visibility = "";
    cancelAnimationFrame(layoutFrame);
    if (restoreFocus && lastFocused instanceof HTMLElement) lastFocused.focus();
  }

  async function completeOnboarding() {
    if (!currentUser || currentUser.onboardingCompleted !== false) {
      if (els.tourBtn) els.tourBtn.textContent = "Tour";
      return;
    }
    currentUser.onboardingCompleted = true;
    els.tourBtn.textContent = "Tour";
    try {
      const response = await fetch("/api/auth/onboarding", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completed: true })
      });
      if (response.status === 401) {
        window.location.replace("/");
        return;
      }
      if (!response.ok) throw new Error("Could not save onboarding progress.");
      const payload = await response.json();
      if (payload.user) currentUser = payload.user;
    } catch (error) {
      console.error(error);
    }
  }

  function handleKeydown(event) {
    if (!tourActive && els.welcome.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      skipTour();
      return;
    }
    if (!tourActive) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      nextStep();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      previousStep();
    }
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }
})();
