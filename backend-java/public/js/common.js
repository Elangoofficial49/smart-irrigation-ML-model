// common.js - shared helpers used by every page

const API_BASE = "https://smart-irrigation-ml-model.onrender.com";
function getToken() {
  return localStorage.getItem("token");
}

function getUsername() {
  return localStorage.getItem("username") || "";
}

function saveSession(token, username) {
  localStorage.setItem("token", token);
  localStorage.setItem("username", username);
}

function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
}

/** Redirects to login if there is no token. Call at the top of protected pages. */
function requireAuth() {
  if (!getToken()) {
    window.location.href = "login.html";
  }
}

/** fetch() wrapper that automatically attaches the auth token */
async function apiFetch(path, options = {}) {
  const headers = options.headers || {};
  headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = "Bearer " + token;

  const response = await fetch(API_BASE + path, { ...options, headers });
  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    data = {};
  }

  if (response.status === 401) {
    clearSession();
    window.location.href = "login.html";
    throw new Error("Not authenticated");
  }

  if (!response.ok) {
    throw new Error(data.error || "Request failed (" + response.status + ")");
  }
  return data;
}

async function logout() {
  try {
    await apiFetch("/api/logout", { method: "POST" });
  } catch (e) {
    /* ignore network errors on logout */
  }
  clearSession();
  window.location.href = "login.html";
}

function showMessage(elementId, text, isError = true) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? "#d64545" : "#2f8f4e";
}

/** Highlights the current page in the sidebar nav and fills in the username badge */
function initLayout(activePage) {
  document.querySelectorAll(".nav-link").forEach((link) => {
    if (link.dataset.page === activePage) link.classList.add("active");
  });
  const userBadge = document.getElementById("userBadge");
  if (userBadge) userBadge.textContent = getUsername();
}
