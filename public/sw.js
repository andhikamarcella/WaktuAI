const CACHE_NAME = "waktuai-static-v3";
const APP_SHELL = ["/manifest.webmanifest", "/icons/icon.svg"];

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL);
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => 
      Promise.all(keys.map((key) => (key === CACHE_NAME ? Promise.resolve(false) : caches.delete(key))))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === "navigate" || requestUrl.pathname === "/" || requestUrl.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then((response) => response)
        .catch(() => caches.match("/offline.html").then((cached) => cached ?? new Response("WaktuAI sedang offline. Buka lagi saat koneksi tersedia.", { headers: { "Content-Type": "text/plain; charset=utf-8" } })))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        if (response.ok && (requestUrl.pathname.startsWith("/assets/") || requestUrl.pathname.startsWith("/icons/") || requestUrl.pathname === "/manifest.webmanifest")) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "CLEAR_WAKTUAI_CACHE") {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .then((response) => {
          event.source?.postMessage({ type: "WAKTUAI_CACHE_CLEARED", ok: response.every(Boolean) });
        })
    );
  }
});
