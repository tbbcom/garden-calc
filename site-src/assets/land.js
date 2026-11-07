/* Acreage calculator (draw on a map or enter dimensions) and area converter: tools.homegardenlot.com
   The map loads Leaflet only when opened, so it costs nothing on first paint. Imagery: USGS National Map
   (public domain); streets: OpenStreetMap; search: OpenStreetMap Nominatim, one request per search. */
(function () {
  'use strict';
  var roots = document.querySelectorAll('[data-hgt-land]');
  if (!roots.length) return;

  var SQFT = { sqft: 1, acre: 43560, sqm: 10.7639104, ha: 107639.104, sqyd: 9, sqmi: 27878400 };
  var NAMES = { sqft: 'square feet', acre: 'acres', sqm: 'square meters', ha: 'hectares', sqyd: 'square yards', sqmi: 'square miles' };
  var LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';

  function track(ev) {
    if (window.hgtGA4 && window.gtag) window.gtag('event', 'calc_result', ev);
    else if (window.dataLayer) window.dataLayer.push(Object.assign({ event: 'calc_result' }, ev));
  }
  function num(v) { var n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) && n > 0 ? n : 0; }
  function fmt(n, d) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function stat(cls, name, value, hint) {
    return '<div class="hgt-stat' + (cls ? ' ' + cls : '') + '"><span class="hgt-stat__label">' + name +
      '</span><span class="hgt-stat__value">' + value + '</span>' + (hint ? '<span class="hgt-stat__hint">' + hint + '</span>' : '') + '</div>';
  }
  function areaStats(sqft, extra) {
    return stat('hgt-stat--frost', 'Acres', fmt(sqft / SQFT.acre, sqft / SQFT.acre < 10 ? 3 : 2), 'sq ft ÷ 43,560') +
      stat('', 'Square feet', fmt(sqft), fmt(sqft / 9) + ' sq yd') +
      stat('', 'Hectares', fmt(sqft / SQFT.ha, 3), fmt(sqft / SQFT.sqm) + ' m²') + (extra || '');
  }
  // Heron's formula; returns 0 when the sides can't close into a triangle.
  function heron(a, b, c) {
    var s = (a + b + c) / 2, v = s * (s - a) * (s - b) * (s - c);
    return v > 0 ? Math.sqrt(v) : 0;
  }
  // Geodesic polygon area on the WGS84 sphere (the formula Leaflet.draw uses), in square meters.
  function geoArea(pts) {
    var R = 6378137, d2r = Math.PI / 180, a = 0, n = pts.length;
    if (n < 3) return 0;
    for (var i = 0; i < n; i++) {
      var p1 = pts[i], p2 = pts[(i + 1) % n];
      a += (p2.lng - p1.lng) * d2r * (2 + Math.sin(p1.lat * d2r) + Math.sin(p2.lat * d2r));
    }
    return Math.abs(a * R * R / 2);
  }
  function loadLeaflet(cb) {
    if (window.L) return cb();
    var css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = LEAFLET + 'leaflet.css';
    document.head.appendChild(css);
    var s = document.createElement('script');
    s.src = LEAFLET + 'leaflet.js';
    s.onload = function () { cb(); };
    s.onerror = function () { cb(new Error('map')); };
    document.head.appendChild(s);
  }

  function shapes(root) {
    var form = root.querySelector('form[data-shapes]'), out = root.querySelector('[data-shape-out]');
    if (!form) return;
    var f = function (n) { return form.elements[n]; };
    function sync() {
      var sh = f('shape').value;
      Array.prototype.forEach.call(form.querySelectorAll('[data-for]'), function (el) { el.hidden = el.getAttribute('data-for').split(' ').indexOf(sh) < 0; });
    }
    function calc() {
      var u = f('unit').value === 'm' ? 3.2808399 : 1, g = function (n) { return num(f(n).value) * u; };
      var sh = f('shape').value, sq = 0, how = '';
      if (sh === 'rect') { sq = g('a') * g('b'); how = fmt(g('a'), 1) + ' × ' + fmt(g('b'), 1) + ' ft'; }
      if (sh === 'tri') { sq = heron(g('a'), g('b'), g('c')); how = 'Heron\'s formula with sides ' + [g('a'), g('b'), g('c')].map(function (x) { return fmt(x, 1); }).join(', ') + ' ft'; }
      if (sh === 'quad') {
        var t1 = heron(g('a'), g('b'), g('diag')), t2 = heron(g('c'), g('d'), g('diag'));
        sq = t1 && t2 ? t1 + t2 : 0;
        how = 'two triangles split by the ' + fmt(g('diag'), 1) + ' ft diagonal: ' + fmt(t1) + ' + ' + fmt(t2) + ' sq ft';
      }
      if (sh === 'circle') { sq = Math.PI * Math.pow(g('a') / 2, 2); how = 'π × (' + fmt(g('a'), 1) + ' ÷ 2)²'; }
      if (sh === 'known') { sq = num(f('known').value) * SQFT[f('kunit').value]; how = f('known').value + ' ' + NAMES[f('kunit').value]; }
      if (!sq) {
        out.innerHTML = sh === 'tri' || sh === 'quad' ? '<p class="hgt-note">Those sides can\'t form a closed shape. Check the measurements (each side must be shorter than the other two added together).</p>' : '';
        out.hidden = !out.innerHTML;
        return;
      }
      out.innerHTML = '<h2 class="hgt-frost__head">' + fmt(sq / SQFT.acre, 3) + ' acres</h2><div class="hgt-frost__stats">' + areaStats(sq) + '</div>' +
        '<details class="hgt-calc__math"><summary>Show the math</summary><ul><li>Area: ' + how + ' = ' + fmt(sq) + ' sq ft.</li><li>Acres: ' + fmt(sq) + ' ÷ 43,560 = ' + fmt(sq / SQFT.acre, 4) + '.</li></ul></details>';
      out.hidden = false;
      track({ calc: 'acreage', mode: sh });
    }
    var t;
    form.addEventListener('input', function () { clearTimeout(t); t = setTimeout(calc, 150); });
    form.addEventListener('change', function () { sync(); calc(); });
    form.addEventListener('submit', function (e) { e.preventDefault(); calc(); });
    sync();
    calc();
  }

  function mapTool(root) {
    var box = root.querySelector('[data-map]');
    if (!box) return;
    var startBtn = root.querySelector('[data-map-start]'), ui = root.querySelector('[data-map-ui]'), out = root.querySelector('[data-map-out]');
    var map, pts = [], markers = [], poly, line;

    function render() {
      if (poly) { map.removeLayer(poly); poly = null; }
      if (line) { map.removeLayer(line); line = null; }
      if (pts.length >= 3) poly = window.L.polygon(pts, { color: '#facc15', weight: 3, fillOpacity: 0.25 }).addTo(map);
      else if (pts.length === 2) line = window.L.polyline(pts, { color: '#facc15', weight: 3 }).addTo(map);
      var m2 = geoArea(pts), sq = m2 * SQFT.sqm, per = 0;
      for (var i = 0; i < pts.length; i++) {
        if (pts.length < 2 || (i === pts.length - 1 && pts.length < 3)) break;
        per += map.distance(pts[i], pts[(i + 1) % pts.length]);
      }
      if (pts.length < 3) {
        out.innerHTML = '<p class="hgt-frost__status">' + (pts.length ? 'Tap ' + (3 - pts.length) + ' more corner' + (pts.length === 2 ? '' : 's') + ' to close the shape.' : 'Tap the corners of your lot on the map, in order.') + '</p>';
        return;
      }
      out.innerHTML = '<h2 class="hgt-frost__head">' + fmt(sq / SQFT.acre, 3) + ' acres</h2><div class="hgt-frost__stats">' +
        areaStats(sq, stat('', 'Perimeter', fmt(per * 3.2808399) + ' ft', fmt(per) + ' m · ' + pts.length + ' corners')) + '</div>' +
        '<p class="hgt-frost__station">Drag a corner to adjust it. Map outlines are estimates; a survey or your deed gives the legal acreage.</p>';
      track({ calc: 'acreage', mode: 'map', corners: pts.length });
    }
    function addPoint(ll) {
      var mk = window.L.marker(ll, { draggable: true, icon: window.L.divIcon({ className: 'hgt-map__pt', iconSize: [16, 16] }) }).addTo(map);
      var idx = pts.length;
      pts.push(ll);
      markers.push(mk);
      mk.on('drag', function (e) { pts[idx] = e.target.getLatLng(); render(); });
      render();
    }
    function start() {
      startBtn.disabled = true;
      startBtn.textContent = 'Loading map…';
      loadLeaflet(function (err) {
        if (err) { startBtn.textContent = 'Map could not load. Check your connection.'; return; }
        startBtn.hidden = true;
        ui.hidden = false;
        box.hidden = false;
        var L = window.L;
        map = L.map(box, { center: [39.5, -98.35], zoom: 4, tap: true });
        var sat = L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 16, maxZoom: 20, attribution: 'Imagery: <a href="https://www.usgs.gov/">USGS</a>' });
        var street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' });
        sat.addTo(map);
        L.control.layers({ Satellite: sat, Streets: street }).addTo(map);
        map.on('click', function (e) { addPoint(e.latlng); });
        render();
      });
    }
    startBtn.addEventListener('click', start);
    root.querySelector('[data-map-undo]').addEventListener('click', function () {
      if (!pts.length) return;
      pts.pop();
      map.removeLayer(markers.pop());
      render();
    });
    root.querySelector('[data-map-clear]').addEventListener('click', function () {
      markers.forEach(function (m) { map.removeLayer(m); });
      pts = []; markers = [];
      render();
    });
    root.querySelector('[data-map-search]').addEventListener('submit', function (e) {
      e.preventDefault();
      var q = this.elements.q.value.trim(), msg = root.querySelector('[data-map-msg]');
      if (!q) return;
      msg.textContent = 'Searching…';
      fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.length) { msg.textContent = 'No match. Try a street address with city and state.'; return; }
          msg.textContent = '';
          map.setView([+j[0].lat, +j[0].lon], 18);
        })
        .catch(function () { msg.textContent = 'Search is unavailable right now; zoom in on the map instead.'; });
    });
    root.querySelector('[data-map-locate]').addEventListener('click', function () {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(function (p) { map.setView([p.coords.latitude, p.coords.longitude], 18); });
    });
  }

  function converter(root) {
    var form = root.querySelector('form'), out = root.querySelector('[data-out]');
    var f = function (n) { return form.elements[n]; };
    function calc() {
      var v = num(f('value').value), from = f('from').value;
      if (!v) { out.hidden = true; return; }
      var sq = v * SQFT[from];
      out.innerHTML = '<h2 class="hgt-frost__head">' + fmt(v, v < 10 ? 3 : 2) + ' ' + NAMES[from] + ' = ' + (from === 'acre' ? fmt(sq) + ' square feet' : fmt(sq / SQFT.acre, 4) + ' acres') + '</h2><div class="hgt-frost__stats">' +
        Object.keys(SQFT).filter(function (k) { return k !== from; }).map(function (k, i) {
          return stat(i === 0 ? 'hgt-stat--frost' : '', NAMES[k].replace(/^./, function (c) { return c.toUpperCase(); }), fmt(sq / SQFT[k], sq / SQFT[k] < 10 ? 4 : 2), '');
        }).join('') + '</div><details class="hgt-calc__math"><summary>Show the math</summary><ul><li>' + fmt(v, 4) + ' ' + NAMES[from] + ' × ' + fmt(SQFT[from], 4) + ' = ' + fmt(sq, 2) + ' sq ft; ÷ 43,560 = ' + fmt(sq / SQFT.acre, 4) + ' acres.</li></ul></details>';
      out.hidden = false;
      if (history.replaceState && window.self === window.top) history.replaceState(null, '', '#v=' + v + '&from=' + from);
      track({ calc: 'area_convert', from: from });
    }
    var h = /v=([\d.]+)&from=(\w+)/.exec(location.hash);
    if (h && SQFT[h[2]]) { f('value').value = h[1]; f('from').value = h[2]; }
    form.addEventListener('input', calc);
    form.addEventListener('change', calc);
    form.addEventListener('submit', function (e) { e.preventDefault(); calc(); });
    calc();
  }

  for (var i = 0; i < roots.length; i++) {
    if (roots[i].getAttribute('data-hgt-land') === 'convert') converter(roots[i]);
    else { shapes(roots[i]); mapTool(roots[i]); }
  }
})();
