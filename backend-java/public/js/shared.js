/**
 * ==========================================================================
 * AgroPulse Shared Core - Shell, Navigation, Formatters, Modals & Toast
 * ==========================================================================
 */

(function (window, document) {
  "use strict";

  // Global Namespace
  const AgroPulse = window.AgroPulse || {};
  window.AgroPulse = AgroPulse;

  // Authentication Helpers
  AgroPulse.getToken = function () {
    return localStorage.getItem("token");
  };

  AgroPulse.getUsername = function () {
    return localStorage.getItem("username") || "Farmer";
  };

  AgroPulse.requireAuth = function () {
    if (!AgroPulse.getToken()) {
      window.location.replace("login.html");
    }
  };

  AgroPulse.logout = async function () {
    try {
      if (typeof AgroPulse.apiFetch === "function") {
        await AgroPulse.apiFetch("/api/logout", { method: "POST" });
      }
    } catch (e) {
      /* ignore network error on logout */
    }
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    window.location.replace("login.html");
  };

  // Safe Formatters (Rule 2: Never NaN, null, undefined, Invalid Date)
  AgroPulse.formatNumber = function (val, decimals = 1, unit = "") {
    if (val === null || val === undefined || isNaN(Number(val))) {
      return "--" + (unit ? " " + unit : "");
    }
    return Number(val).toFixed(decimals) + (unit ? " " + unit : "");
  };

  AgroPulse.formatMoisture = function (val) {
    if (val === null || val === undefined || isNaN(Number(val))) return "-- %";
    return Number(val).toFixed(1) + " %";
  };

  AgroPulse.formatTemp = function (val) {
    if (val === null || val === undefined || isNaN(Number(val))) return "-- °C";
    return Number(val).toFixed(1) + " °C";
  };

  AgroPulse.formatHumidity = function (val) {
    if (val === null || val === undefined || isNaN(Number(val))) return "-- % RH";
    return Math.round(Number(val)) + " % RH";
  };

  AgroPulse.formatWater = function (liters) {
    if (liters === null || liters === undefined || isNaN(Number(liters))) return "-- L";
    return Math.round(Number(liters)).toLocaleString() + " L";
  };

  AgroPulse.formatDuration = function (mins) {
    if (mins === null || mins === undefined || isNaN(Number(mins))) return "-- min";
    return Math.round(Number(mins)) + " min";
  };

  AgroPulse.formatConfidence = function (conf) {
    if (conf === null || conf === undefined || isNaN(Number(conf))) return "-- %";
    let pct = Number(conf);
    if (pct <= 1.0) pct = pct * 100;
    return Math.round(pct) + " %";
  };

  AgroPulse.formatDate = function (rawDate) {
    if (!rawDate) return "--";
    try {
      const cleaned = String(rawDate).replace(" ", "T").split(".")[0];
      const d = new Date(cleaned);
      if (isNaN(d.getTime())) return "--";
      return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(d);
    } catch (e) {
      return "--";
    }
  };

  // Toast Notifications
  AgroPulse.showToast = function (message, type = "info") {
    let container = document.getElementById("toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.setAttribute("aria-live", "polite");
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.setAttribute("role", "status");

    const iconMap = {
      success: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--green)" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
      warning: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--amber)" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
      error: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--red)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
      info: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--blue)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
    };

    toast.innerHTML = `
      ${iconMap[type] || iconMap.info}
      <div style="flex:1;">${escapeHtml(message)}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      toast.style.transition = "all 0.25s ease";
      setTimeout(() => toast.remove(), 250);
    }, 4000);
  };

  // Confirm Modal Dialog
  AgroPulse.showConfirmModal = function ({ title, message, confirmText = "Confirm", cancelText = "Cancel", onConfirm, isDanger = false }) {
    let backdrop = document.getElementById("confirmModalBackdrop");
    if (backdrop) backdrop.remove();

    backdrop = document.createElement("div");
    backdrop.id = "confirmModalBackdrop";
    backdrop.className = "modal-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");

    backdrop.innerHTML = `
      <div class="modal-card">
        <h3 class="modal-title">${escapeHtml(title)}</h3>
        <p class="modal-desc">${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="modalCancelBtn">${escapeHtml(cancelText)}</button>
          <button type="button" class="btn ${isDanger ? 'btn-danger' : 'btn-primary'}" id="modalConfirmBtn">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const confirmBtn = backdrop.querySelector("#modalConfirmBtn");
    const cancelBtn = backdrop.querySelector("#modalCancelBtn");

    const cleanup = () => {
      document.removeEventListener("keydown", handleKey);
      backdrop.remove();
    };

    const handleKey = (e) => {
      if (e.key === "Escape") cleanup();
    };

    document.addEventListener("keydown", handleKey);
    cancelBtn.addEventListener("click", cleanup);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) cleanup();
    });

    confirmBtn.addEventListener("click", async () => {
      confirmBtn.disabled = true;
      if (typeof onConfirm === "function") {
        await onConfirm();
      }
      cleanup();
    });

    confirmBtn.focus();
  };

  // CSV Export Utility (Clean, RFC-4180 compliant with Excel BOM)
  AgroPulse.downloadCsv = function (filename, headers, rows) {
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    let csvContent = "\uFEFF"; // UTF-8 BOM
    csvContent += headers.map(escapeCsv).join(",") + "\r\n";

    rows.forEach((row) => {
      csvContent += row.map(escapeCsv).join(",") + "\r\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Tab Visibility Helper (Rule 6: Pause intervals when hidden)
  AgroPulse.isTabVisible = function () {
    return !document.hidden;
  };

  AgroPulse.onTabVisibilityChange = function (onVisible, onHidden) {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (typeof onHidden === "function") onHidden();
      } else {
        if (typeof onVisible === "function") onVisible();
      }
    });
  };

  // Safe HTML Escaping
  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  AgroPulse.escapeHtml = escapeHtml;

  // Sidebar Destinations Specification (Order defined by Part A)
  const NAV_ITEMS = [
    {
      id: "dashboard",
      name: "Dashboard",
      href: "dashboard.html",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"></rect><rect x="14" y="3" width="7" height="5" rx="1"></rect><rect x="14" y="12" width="7" height="9" rx="1"></rect><rect x="3" y="16" width="7" height="5" rx="1"></rect></svg>`
    },
    {
      id: "sensors",
      name: "Sensor Monitoring",
      href: "sensors.html",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"></path><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"></path><circle cx="12" cy="12" r="2"></circle><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"></path><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"></path></svg>`
    },
    {
      id: "crops",
      name: "Crop Management",
      href: "crops.html",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 22 12 2l10 20H2z"></path><path d="M12 2v20"></path><path d="m7 15 5-5 5 5"></path></svg>`
    },
    {
      id: "prediction",
      name: "ML Prediction",
      href: "prediction.html",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>`
    },
    {
      id: "irrigation",
      name: "Irrigation Control",
      href: "irrigation.html",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path></svg>`
    },
    {
      id: "reports",
      name: "Reports & History",
      href: "reports.html",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`
    }
  ];

  // Shell Initializer (Renders or Enhances Sidebar and Header)
  AgroPulse.initShell = function (currentPageId, pageTitle, pageSubtitle) {
    const shell = document.querySelector(".dashboard-shell");
    if (!shell) return;

    const username = AgroPulse.getUsername();
    const initials = username.slice(0, 2).toUpperCase();

    // 1. Inject or verify Sidebar
    let sidebar = shell.querySelector(".app-sidebar");
    if (!sidebar) {
      sidebar = document.createElement("aside");
      sidebar.className = "app-sidebar";
      sidebar.setAttribute("aria-label", "Main Navigation");
      shell.insertBefore(sidebar, shell.firstChild);
    }

    sidebar.innerHTML = `
      <div class="sidebar-top">
        <a href="dashboard.html" class="brand-logo-btn" title="AgroPulse Dashboard" aria-label="AgroPulse Home">
          <svg viewBox="0 0 24 24"><path d="M12 2L9.5 8.5C7.5 13.5 10 18 12 22C14 18 16.5 13.5 14.5 8.5L12 2Z"></path><path d="M12 22V10"></path></svg>
        </a>
        <nav class="sidebar-nav">
          ${NAV_ITEMS.map((item, idx) => {
            const isActive = item.id === currentPageId;
            return `
              ${idx === 3 ? '<div class="nav-divider"></div>' : ''}
              <a href="${item.href}" class="nav-item ${isActive ? 'active' : ''}" data-page="${item.id}" title="${item.name}" aria-label="${item.name}" ${isActive ? 'aria-current="page"' : ''}>
                ${item.icon}
              </a>
            `;
          }).join("")}
        </nav>
      </div>

      <div class="sidebar-bottom">
        <div class="sidebar-avatar" id="avatarInitials" title="Operator: ${escapeHtml(username)}">${initials}</div>
        <button type="button" class="btn-sidebar-logout" id="sidebarLogoutBtn" title="Sign Out" aria-label="Sign Out">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
        </button>
      </div>
    `;

    sidebar.querySelector("#sidebarLogoutBtn").addEventListener("click", AgroPulse.logout);

    // 2. Setup Header
    let mainWrap = shell.querySelector(".app-main");
    if (!mainWrap) {
      mainWrap = document.createElement("div");
      mainWrap.className = "app-main";
      // move existing children except sidebar into mainWrap
      const children = Array.from(shell.childNodes).filter((n) => n !== sidebar);
      children.forEach((c) => mainWrap.appendChild(c));
      shell.appendChild(mainWrap);
    }

    let header = mainWrap.querySelector(".app-header");
    if (!header) {
      header = document.createElement("header");
      header.className = "app-header";
      mainWrap.insertBefore(header, mainWrap.firstChild);
    }

    const titleText = pageTitle || shell.dataset.title || "AgroPulse";
    const subText = pageSubtitle || shell.dataset.subtitle || "Precision Irrigation Telemetry";

    header.innerHTML = `
      <div class="header-title-box">
        <h1 class="page-title">${escapeHtml(titleText)}</h1>
        <p class="page-subtitle">${escapeHtml(subText)}</p>
      </div>

      <div class="header-controls">
        <div class="chip-live-status" id="headerLiveChip" aria-live="polite">
          <span class="pulse-dot" id="headerLiveDot"></span>
          <span id="headerLiveText">Probe #1 · Telemetry Active</span>
        </div>

        <div id="headerCustomActions" style="display:flex; align-items:center; gap:8px;"></div>

        <div class="user-dropdown-wrap">
          <div class="user-card-pill" id="userCardDropdownTrigger" role="button" aria-haspopup="true" aria-expanded="false" tabindex="0">
            <div class="user-card-avatar" id="userCardAvatar">${initials}</div>
            <div class="user-card-meta">
              <div class="user-card-name" id="userBadge">${escapeHtml(username)}</div>
              <div class="user-card-role">operator@agropulse.farm</div>
            </div>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>

          <div class="user-dropdown-menu" id="userDropdownMenu" role="menu">
            <a href="crops.html" class="user-dropdown-item" role="menuitem">Crop Inventory</a>
            <a href="sensors.html" class="user-dropdown-item" role="menuitem">Sensor Settings</a>
            <div class="user-dropdown-divider"></div>
            <button type="button" class="user-dropdown-item" id="menuLogoutBtn" role="menuitem">Sign out</button>
          </div>
        </div>
      </div>
    `;

    // Dropdown toggling
    const trigger = header.querySelector("#userCardDropdownTrigger");
    const menu = header.querySelector("#userDropdownMenu");
    const logoutBtn = header.querySelector("#menuLogoutBtn");

    if (trigger && menu) {
      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = menu.classList.toggle("show");
        trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
      });

      document.addEventListener("click", (e) => {
        if (!trigger.contains(e.target) && !menu.contains(e.target)) {
          menu.classList.remove("show");
          trigger.setAttribute("aria-expanded", "false");
        }
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          menu.classList.remove("show");
          trigger.setAttribute("aria-expanded", "false");
        }
      });
    }

    if (logoutBtn) logoutBtn.addEventListener("click", AgroPulse.logout);
  };

  // Update live chip in header
  AgroPulse.updateLiveChip = function (status = "live", timeStr = "") {
    const dot = document.getElementById("headerLiveDot");
    const text = document.getElementById("headerLiveText");
    if (!dot || !text) return;

    dot.className = "pulse-dot";
    if (status === "paused") {
      dot.classList.add("paused");
      text.textContent = `Probe #1 · Paused ${timeStr}`;
    } else if (status === "offline") {
      dot.classList.add("offline");
      text.textContent = `Probe #1 · Offline`;
    } else {
      text.textContent = `Probe #1 · ${timeStr || 'Telemetry Active'}`;
    }
  };

  // Expose global shorthand functions for compatibility
  window.showToast = AgroPulse.showToast;
  window.logout = AgroPulse.logout;
  window.requireAuth = AgroPulse.requireAuth;
})(window, document);

