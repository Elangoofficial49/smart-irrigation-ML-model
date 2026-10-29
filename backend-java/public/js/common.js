// ==========================================================================
// Smart Irrigation System - Common JavaScript Utilities & Navigation (PWA Ready)
// ==========================================================================

const API_BASE = (window.location.protocol.startsWith("http") && !window.location.host.includes("github.io")) 
  ? "" 
  : "https://smart-irrigation-ml-model-1.onrender.com";

function getToken() {
  return localStorage.getItem("token");
}

function getUsername() {
  return localStorage.getItem("username") || "User";
}

function saveSession(token, username) {
  localStorage.setItem("token", token);
  localStorage.setItem("username", username);
}

function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
}

/** Redirects to login if user is not authenticated */
function requireAuth() {
  if (!getToken()) {
    window.location.href = "login.html";
  }
}

/** Robust API fetch wrapper with token injection and offline cache fallback */
async function apiFetch(path, options = {}) {
  const headers = options.headers || {};
  if (!headers["Content-Type"] && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const token = getToken();
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }

  try {
    const response = await fetch(API_BASE + path, { ...options, headers });
    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      data = {};
    }

    if (response.status === 401) {
      clearSession();
      showToast("Session expired. Please log in again.", "warning");
      setTimeout(() => {
        window.location.href = "login.html";
      }, 1000);
      throw new Error("Not authenticated");
    }

    if (!response.ok) {
      throw new Error(data.error || "Request failed (" + response.status + ")");
    }
    return data;
  } catch (err) {
    // Check if offline
    if (!navigator.onLine) {
      console.warn("[PWA Offline] Network unavailable for:", path);
    }
    throw err;
  }
}

/** User logout action */
async function logout() {
  try {
    await apiFetch("/api/logout", { method: "POST" });
  } catch (e) {
    /* ignore network errors on logout */
  }
  clearSession();
  window.location.href = "login.html";
}

/** Toast Notification System */
function showToast(message, type = "info") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: "fa-circle-check",
    error: "fa-circle-exclamation",
    warning: "fa-triangle-exclamation",
    info: "fa-circle-info"
  };

  toast.innerHTML = `
    <i class="fa-solid ${iconMap[type] || 'fa-circle-info'}"></i>
    <div style="flex:1;">${escapeHtml(message)}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(40px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function showMessage(elementId, text, isError = true) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? "#C44747" : "#21834A";
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Layout and Navigation Initializer */
function initLayout(activePage) {
  // Highlight active link
  document.querySelectorAll(".nav-item").forEach((link) => {
    if (link.dataset.page === activePage) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });

  // Set user badge initials & name
  const username = getUsername();
  const userBadge = document.getElementById("userBadge");
  const avatarInitials = document.getElementById("avatarInitials");
  if (userBadge) userBadge.textContent = username;
  if (avatarInitials) avatarInitials.textContent = username.slice(0, 2).toUpperCase();

  const sidebar = document.querySelector(".sidebar");

  // Restore desktop collapsed state
  if (sidebar && localStorage.getItem("agropulse_sidebar_collapsed") === "1") {
    sidebar.classList.add("collapsed");
  }

  // Mobile menu toggle (#mobileToggle or #mobileMenuBtn)
  const mobileBtn = document.getElementById("mobileToggle") || document.getElementById("mobileMenuBtn");
  if (mobileBtn && sidebar) {
    mobileBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });
  }

  // Desktop sidebar collapse toggle
  let collapseBtn = document.getElementById("sidebarCollapseBtn");
  const topLeft = document.querySelector(".top-navbar > div:first-child");
  if (!collapseBtn && topLeft && sidebar) {
    collapseBtn = document.createElement("button");
    collapseBtn.id = "sidebarCollapseBtn";
    collapseBtn.className = "sidebar-toggle-btn";
    collapseBtn.type = "button";
    collapseBtn.title = "Toggle sidebar (compact mode)";
    collapseBtn.setAttribute("aria-label", "Toggle sidebar");
    collapseBtn.innerHTML = '<i class="fa-solid fa-table-columns"></i>';
    topLeft.insertBefore(collapseBtn, topLeft.firstChild);
  }
  if (collapseBtn && sidebar) {
    collapseBtn.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
      localStorage.setItem("agropulse_sidebar_collapsed", sidebar.classList.contains("collapsed") ? "1" : "0");
    });
  }

  // Setup Offline / Online Listener
  setupNetworkStatusMonitor();
}

/** Network Status Monitor & Offline Banner for Remote Farms */
function setupNetworkStatusMonitor() {
  let banner = document.getElementById("pwaNetworkBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "pwaNetworkBanner";
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
      background: #B7791F; color: #fff; text-align: center;
      padding: 8px 16px; font-size: 13px; font-weight: 600;
      display: none; align-items: center; justify-content: center; gap: 8px;
      box-shadow: 0 1px 3px rgba(23,35,29,0.2);
    `;
    document.body.appendChild(banner);
  }

  function updateStatus() {
    if (!navigator.onLine) {
      banner.style.display = "flex";
      banner.style.background = "#B7791F";
      banner.innerHTML = '<i class="fa-solid fa-plane-slash"></i> <span><strong>Offline Mode:</strong> Network unavailable. Displaying cached farm telemetry.</span>';
    } else {
      if (banner.style.display === "flex") {
        banner.style.background = "#21834A";
        banner.innerHTML = '<i class="fa-solid fa-wifi"></i> <span><strong>Online:</strong> Connection restored.</span>';
        setTimeout(() => { banner.style.display = "none"; }, 3000);
      }
    }
  }

  window.addEventListener("online", updateStatus);
  window.addEventListener("offline", updateStatus);
  if (!navigator.onLine) updateStatus();
}

// ==========================================================================
// PWA Service Worker Registration & Cache Refresh
// ==========================================================================
if ("caches" in window) {
  caches.keys().then((keys) => {
    keys.forEach((k) => {
      if (k !== "agropulse-enterprise-v3") {
        caches.delete(k);
      }
    });
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then((reg) => {
        reg.update();
        console.log("[PWA] Service Worker registered with scope:", reg.scope);
      })
      .catch((err) => {
        console.warn("[PWA] Service Worker registration failed:", err);
      });
  });
}

// PWA Install Prompt Handler
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  console.log("[PWA] App can be installed.");
});
