/* Offline support: pages network-first, assets and ZIP data (frost and zones) stale-while-revalidate. */
var CACHE = 'hgt-v5';
var SHELL = ['/', '/frost-dates/', '/hardiness-zones/', '/concrete-block-calculator/', '/retaining-wall-calculator/', '/sod-calculator/', '/grass-seed-calculator/', '/assets/site.css', '/assets/site.js', '/assets/frost.js', '/assets/zone.js', '/assets/masonry.js', '/assets/lawn.js', '/assets/icon.svg'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  var url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) { return hit || caches.match('/frost-dates/'); });
    }));
    return;
  }

  if (url.pathname.indexOf('/assets/') === 0 || url.pathname.indexOf('/data/frost/zip/') === 0 || url.pathname.indexOf('/data/zones/') === 0) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) { if (res.ok) c.put(req, res.clone()); return res; });
        return hit || net;
      });
    }));
  }
});
