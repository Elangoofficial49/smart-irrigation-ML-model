// ==========================================================================
// AgroPulse AI — Common Utilities, Skeleton & Network Loader, 1-to-1 Routing
// ==========================================================================

const API_BASE = (window.location.protocol.startsWith("http") && !window.location.host.includes("github.io")) 
  ? "" 
  : "https://smart-irrigation-ml-model-1.onrender.com";

let activeNetworkRequests = 0;

function getToken() {
  return localStorage.getItem("token");
}

function getUsername() {
  return localStorage.getItem("username") || "Operator";
}

function saveSession(token, username) {
  localStorage.setItem("token", token);
  localStorage.setItem("username", username);
}

function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
}

/** Redirects 1-to-1 to login.html if user is not authenticated */
function requireAuth() {
  if (!getToken()) {
    window.location.replace("login.html");
  }
}

/** Top Network Loading Progress Bar */
function startNetworkLoader() {
  activeNetworkRequests++;
  let bar = document.getElementById("networkLoadingBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "networkLoadingBar";
    document.body.appendChild(bar);
  }
  bar.style.opacity = "1";
  bar.style.width = "72%";
}

function stopNetworkLoader() {
  activeNetworkRequests = Math.max(0, activeNetworkRequests - 1);
  if (activeNetworkRequests === 0) {
    const bar = document.getElementById("networkLoadingBar");
    if (bar) {
      bar.style.width = "100%";
      setTimeout(() => {
        if (activeNetworkRequests === 0) {
          bar.style.opacity = "0";
          setTimeout(() => {
            if (activeNetworkRequests === 0) bar.style.width = "0%";
          }, 200);
        }
      }, 160);
    }
  }
}

/** Render Skeleton Loading rows inside any table while fetching data */
function renderTableSkeleton(tbodySelector, colCount = 5, rowCount = 4) {
  const tbody = typeof tbodySelector === "string" ? document.querySelector(tbodySelector) : tbodySelector;
  if (!tbody) return;
  let html = "";
  for (let r = 0; r < rowCount; r++) {
    html += '<tr class="skeleton-row">';
    for (let c = 0; c < colCount; c++) {
      const width = c === 0 ? "75%" : (c === colCount - 1 ? "55%" : "65%");
      html += `<td><div class="skeleton-bar" style="width:${width};"></div></td>`;
    }
    html += "</tr>";
  }
  tbody.innerHTML = html;
}

/** Robust API fetch wrapper with token injection, network loader, and offline fallback */
async function apiFetch(path, options = {}) {
  const headers = options.headers || {};
  if (!headers["Content-Type"] && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const token = getToken();
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }

  startNetworkLoader();
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
      showToast("Session expired. Redirecting to Sign In…", "warning");
      setTimeout(() => {
        window.location.replace("login.html");
      }, 700);
      throw new Error("Not authenticated");
    }

    if (!response.ok) {
      throw new Error(data.error || "Request failed (" + response.status + ")");
    }
    return data;
  } catch (err) {
    if (!navigator.onLine) {
      console.warn("[PWA Offline] Network unavailable for:", path);
    }
    throw err;
  } finally {
    stopNetworkLoader();
  }
}

/** User logout action -> 1-to-1 redirect to login.html */
async function logout() {
  try {
    await apiFetch("/api/logout", { method: "POST" });
  } catch (e) {
    /* ignore network errors on logout */
  }
  clearSession();
  window.location.replace("login.html");
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

/** Layout and Navigation Initializer (Hover-Expand Compact Sidebar) */
function initLayout(activePage) {
  // Highlight active sidebar link
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

  // Mobile menu toggle (#mobileToggle) for small screens only
  const mobileBtn = document.getElementById("mobileToggle") || document.getElementById("mobileMenuBtn");
  if (mobileBtn && sidebar) {
    mobileBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });
  }

  // Setup Network Status Monitor
  setupNetworkStatusMonitor();
}

/** Network Loading / Offline Status Monitor */
function setupNetworkStatusMonitor() {
  let banner = document.getElementById("pwaNetworkBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "pwaNetworkBanner";
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
      background: #B7791F; color: #fff; text-align: center;
      padding: 8px 16px; font-size: 13px; font-weight: 600;
      display: none; align-items: center; justify-content: center; gap: 10px;
      box-shadow: 0 1px 3px rgba(23,35,29,0.2);
    `;
    document.body.appendChild(banner);
  }

  function updateStatus() {
    if (!navigator.onLine) {
      banner.style.display = "flex";
      banner.style.background = "#B7791F";
      banner.innerHTML = '<i class="fa-solid fa-wifi"></i> <span><strong>Network Offline:</strong> Waiting for connection — displaying cached farm telemetry.</span> <a href="network.html" style="color:#fff; text-decoration:underline; margin-left:6px;">Diagnostics</a>';
    } else {
      if (banner.style.display === "flex") {
        banner.style.background = "#21834A";
        banner.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span><strong>Network Online:</strong> Live telemetry link restored.</span>';
        setTimeout(() => { banner.style.display = "none"; }, 2500);
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
      if (k !== "agropulse-enterprise-v5") {
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
      })
      .catch(() => {});
  });
}
