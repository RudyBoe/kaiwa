// Offline support. On install the app shell and every file listed in
// library/index.json are cached. The page and library/ are fetched network
// first (new kaiwa arrive as soon as you're online) with the cache as
// fallback; everything else is cache first. Google Fonts are cached as they
// load, in a cache that survives version bumps.
// Bump VERSION together with the ?v= tags in index.html on every change.
const VERSION = "v3";
const CACHE = `kaiwa-${VERSION}`;
const FONTS = "kaiwa-fonts";
const V = VERSION.replace("v", "v=");
const SHELL = [
  "./",
  "index.html",
  `style.css?${V}`,
  `app.js?${V}`,
  "store.js",
  "practice.js",
  "speech.js",
  "ui.js",
  "validate.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "library/index.json",
];

// cache: "reload" skips the browser's HTTP cache, so a new version never
// installs stale files.
const fresh = (url) => new Request(url, { cache: "reload" });

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL.map(fresh));
    const names = await (await c.match("library/index.json")).json();
    await c.addAll(names.map((n) => fresh("library/" + encodeURIComponent(n))));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => /^kaiwa-v\d+$/.test(k) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function networkFirst(req, key) {
  const timeout = new Promise((resolve) => setTimeout(resolve, 4000));
  const net = fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key || req, copy)); }
    return res;
  });
  const cached = () => caches.match(key || req, { ignoreSearch: true });
  // Use the network unless it fails or takes longer than 4 s and a cached copy exists.
  return Promise.race([net.catch(() => null), timeout.then(() => "slow")]).then(async (r) => {
    if (r && r !== "slow") return r;
    const hit = await cached();
    if (hit) return hit;
    return net;
  });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com") {
    e.respondWith(caches.open(FONTS).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === "opaque") c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  if (url.origin !== location.origin) return;

  if (req.mode === "navigate") { e.respondWith(networkFirst(req, "index.html")); return; }
  if (url.pathname.includes("/library/")) { e.respondWith(networkFirst(req)); return; }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })),
  );
});
