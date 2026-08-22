// ==========================================================================
// Smart Irrigation System - Common JavaScript Utilities & Navigation
// ==========================================================================

// Intelligent API base URL detection:
// When served from the backend (localhost:5000 or production server), use relative path ""
// If running from file:// or separate frontend origin, fallback to configured URL.
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

/** Robust API fetch wrapper with token injection and error handling */
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
  el.style.color = isError ? "#ef4444" : "#10b981";
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

  // Mobile menu toggle logic
  const mobileToggle = document.getElementById("mobileToggle");
  const sidebar = document.querySelector(".sidebar");
  if (mobileToggle && sidebar) {
    mobileToggle.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });

    document.addEventListener("click", (e) => {
      if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && !mobileToggle.contains(e.target)) {
        sidebar.classList.remove("open");
      }
    });
  }
}
