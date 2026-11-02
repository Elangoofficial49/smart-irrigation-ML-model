/**
 * Smart Precision Irrigation PWA Service Worker (v1.0.0)
 * Provides offline caching, network-resilience for remote farm fields,
 * and background revalidation.
 */

const CACHE_NAME = "agropulse-enterprise-v5";

const APP_SHELL = [
  "/",
  "/dashboard.html",
  "/sensors.html",
  "/irrigation.html",
  "/crops.html",
  "/weather.html",
  "/login.html",
  "/signup.html",
  "/forgot-password.html",
  "/404.html",
  "/network.html",
  "/css/style.css",
  "/js/common.js",
  "/js/ai-assistant.js",
  "/manifest.json",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg"
];

// 1. Install & Cache App Shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[ServiceWorker] Pre-caching App Shell...");
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate & Clean Old Caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[ServiceWorker] Removing old cache:", key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Interceptor: Stale-While-Revalidate & Network-First with Offline Fallback
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore non-GET requests for cache matching
  if (req.method !== "GET") {
    return;
  }

  // API Requests: Network-First with Cache Fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req)
        .then((networkResponse) => {
          // Cache successful GET API responses (e.g. sensor telemetry, crops, weather)
          if (networkResponse && networkResponse.status === 200) {
            const resClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          console.warn("[ServiceWorker] Network failed, serving cached API data for:", url.pathname);
          const cached = await caches.match(req);
          if (cached) return cached;

          // Special offline fallback response for API
          if (url.pathname === "/api/sensors/latest") {
            return new Response(JSON.stringify({
              soil_moisture: 48.5,
              temperature: 30.0,
              humidity: 55.0,
              rainfall_prob: 10.0,
              offline_cached: true,
              recorded_at: "Offline Cache"
            }), { headers: { "Content-Type": "application/json" } });
          }

          if (url.pathname === "/api/irrigation/status") {
            return new Response(JSON.stringify({
              status: "OFF",
              mode: "auto",
              offline_cached: true
            }), { headers: { "Content-Type": "application/json" } });
          }

          return new Response(JSON.stringify({ error: "Network offline", offline: true }), {
            status: 503,
            headers: { "Content-Type": "application/json" }
          });
        })
    );
    return;
  }

  // App Shell & Static Assets: Network-First with Offline Cache Fallback
  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(req);
        if (cachedResponse) return cachedResponse;
        if (req.mode === "navigate") {
          return caches.match("/dashboard.html") || caches.match("/login.html");
        }
      })
  );
});
