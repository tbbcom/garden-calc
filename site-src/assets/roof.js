/* Roof pitch, roofing and shingle calculators: tools.homegardenlot.com
   Roof area = plan area × slope factor √(1 + (pitch/12)²) for any roof whose planes share one pitch.
   Coverage figures (bundles, starter, ridge cap, underlayment) arrive in data-config from the page build. */
(function () {
  'use strict';
  var roots = document.querySelectorAll('[data-hgt-roof]');
  if (!roots.length) return;

  function track(ev) {
    if (window.hgtGA4 && window.gtag) window.gtag('event', 'calc_result', ev);
    else if (window.dataLayer) window.dataLayer.push(Object.assign({ event: 'calc_result' }, ev));
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { var n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) && n >= 0 ? n : 0; }
  function fmt(n, d) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function money(n) { return '$' + fmt(n, n < 100 ? 2 : 0); }
  function up(n) { return Math.ceil(n - 1e-9); }
  function stat(cls, name, value, hint) {
    return '<div class="hgt-stat' + (cls ? ' ' + cls : '') + '"><span class="hgt-stat__label">' + name +
      '</span><span class="hgt-stat__value">' + value + '</span>' + (hint ? '<span class="hgt-stat__hint">' + hint + '</span>' : '') + '</div>';
  }
  function ftIn(ft) { var t = Math.round(ft * 12); return Math.floor(t / 12) + ' ft ' + (t % 12) + ' in'; }
  function pitchName(p) { var r = Math.round(p * 10) / 10; return (r % 1 ? fmt(r, 1) : fmt(r)) + '/12'; }
  function slopeFactor(p) { return Math.sqrt(1 + p * p / 144); }

  function setup(root, cfg) {
    var kind = root.getAttribute('data-hgt-roof');
    var form = root.querySelector('form'), out = root.querySelector('[data-out]'), rows = root.querySelector('[data-rows]');
    var f = function (n) { return form.elements[n]; };
    var embed = root.hasAttribute('data-embed');
    var hashRows = null;

    function finish(html, ev) {
      if (!embed) html += '<div class="hgt-frost__actions"><button class="hgt-btn hgt-btn--ghost" type="button" data-share>Copy link to this result</button></div>';
      out.innerHTML = html;
      out.hidden = false;
      if (history.replaceState && window.self === window.top) {
        var keys = Array.prototype.map.call(form.elements, function (e) { return e.name; }).filter(function (k) { return k && !/^p[A-Z]/.test(k); });
        var h = keys.filter(function (k, i) { return keys.indexOf(k) === i; }).map(function (k) { return k + '=' + encodeURIComponent(f(k).value); });
        if (rows) h.push('rows=' + encodeURIComponent(raw().map(function (r) { return [r.a, r.b, r.s].join(','); }).join(';')));
        history.replaceState(null, '', '#' + h.join('&'));
      }
      track(ev);
    }

    // ---- roof pitch ----
    function showMode() {
      var m = f('mode').value;
      Array.prototype.forEach.call(form.querySelectorAll('[data-show]'), function (l) { l.hidden = l.getAttribute('data-show').split(' ').indexOf(m) < 0; });
    }
    function svg(p, k, wid) {
      var h = Math.min(130, Math.max(8, 130 * p / 12)), top = 160 - h;
      return '<figure class="hgt-calc__fig"><svg class="hgt-roofsvg" viewBox="0 0 320 190" role="img" aria-label="Roof cross-section at ' + pitchName(p) + ' pitch">' +
        '<rect class="wall" x="40" y="160" width="240" height="22"/><polygon class="roof" points="20,' + (160 + 20 * p / 12) + ' 160,' + top + ' 300,' + (160 + 20 * p / 12) + '"/>' +
        '<line class="run" x1="160" y1="160" x2="280" y2="160"/><line class="run" x1="160" y1="160" x2="160" y2="' + top + '"/>' +
        '<text x="220" y="176" text-anchor="middle">run 12</text><text x="154" y="' + (top + h / 2 + 4) + '" text-anchor="end">rise ' + fmt(p, p % 1 ? 1 : 0) + '</text>' +
        '<text x="236" y="' + (top + h / 2 - 8) + '" text-anchor="start">' + fmt(Math.atan(p / 12) * 180 / Math.PI, 1) + '°</text></svg>' +
        '<figcaption>' + pitchName(p) + ' pitch' + (wid ? '; ' + fmt(wid) + ' ft wide building, rafter ' + ftIn((wid / 2) * k) + ' before overhang' : '') + '</figcaption></figure>';
    }
    function calcPitch() {
      var m = f('mode').value, p = 0, wid = num(f('width').value), oh = num(f('oh').value);
      if (m === 'rr') p = num(f('run').value) ? num(f('rise').value) / num(f('run').value) * 12 : 0;
      if (m === 'rs') p = wid ? num(f('riseft').value) / (wid / 2) * 12 : 0;
      if (m === 'ang') p = Math.tan(Math.min(num(f('deg').value), 80) * Math.PI / 180) * 12;
      if (m === 'p') p = num(f('px').value);
      if (!p) { out.hidden = true; return; }
      var k = slopeFactor(p), deg = Math.atan(p / 12) * 180 / Math.PI, near = Math.round(p);
      var lvl = cfg.walk.filter(function (w) { return p <= w[0]; })[0] || cfg.walk[cfg.walk.length - 1];
      var mats = cfg.minPitch.filter(function (x) { return p >= x[0] && p < x[1]; }).map(function (x) { return x[2]; });
      var html = '<h2 class="hgt-frost__head">' + pitchName(p) + ' pitch = ' + fmt(deg, 1) + '°</h2>';
      var s = stat('hgt-stat--frost', 'Pitch', pitchName(p), Math.abs(p - near) > 0.05 && near ? 'Closest standard pitch: ' + near + '/12' : 'Inches of rise per 12 in of run');
      s += stat('hgt-stat--frost', 'Angle', fmt(deg, 2) + '°', fmt(p / 12 * 100, 1) + '% grade · ratio 1:' + fmt(12 / p, 2));
      s += stat('', 'Slope factor', fmt(k, 3), 'Roof area = footprint × ' + fmt(k, 3));
      if (wid) {
        var rise = wid / 2 * p / 12, raft = (wid / 2 + oh / 12) * k;
        s += stat('', 'Rafter length', ftIn(raft), fmt(wid) + ' ft span' + (oh ? ' + ' + fmt(oh) + ' in overhang' : '') + ', before ridge and plumb cuts');
        s += stat('', 'Ridge height', ftIn(rise), 'Above the top of the walls');
      }
      s += stat('', 'Hip or valley rafter', fmt(Math.sqrt(p * p + 288), 2) + ' in', 'Per foot of common run (diagonal run 16.97 in)');
      s += stat('', 'Walkability', lvl[1], lvl[2]);
      html += '<div class="hgt-frost__stats">' + s + '</div>' + svg(p, k, wid);
      html += '<p class="hgt-note"><strong>Suitable roofing at ' + pitchName(p) + ':</strong> ' + (mats.length ? mats.join('; ') : 'flat-roof membranes only (EPDM, TPO or modified bitumen)') + '.</p>';
      var math = ['<li>Pitch = rise ÷ run × 12' + (m === 'rs' ? ' (run = half the building width)' : m === 'ang' ? ' = tan(angle) × 12' : '') + ' = ' + fmt(p, 2) + '/12.</li>',
        '<li>Angle = arctan(' + fmt(p, 2) + ' ÷ 12) = ' + fmt(deg, 2) + '°.</li>',
        '<li>Slope factor = √(1 + (' + fmt(p, 2) + '/12)²) = ' + fmt(k, 4) + '.</li>'];
      if (wid) math.push('<li>Rafter = (' + fmt(wid / 2, 2) + ' ft run + ' + fmt(oh / 12, 2) + ' ft overhang) × ' + fmt(k, 4) + ' = ' + fmt((wid / 2 + oh / 12) * k, 2) + ' ft.</li>');
      html += '<details class="hgt-calc__math"' + (embed ? '' : ' open') + '><summary>Show the math</summary><ul>' + math.join('') + '</ul></details>';
      finish(html, { calc: 'roof_pitch', pitch: Math.round(p) });
    }

    // ---- roofing (whole roof from the footprint) ----
    function calcRoof() {
      var L = num(f('len').value), W = num(f('wid').value), oh = num(f('oh').value) / 12, p = num(f('pitch').value), style = f('style').value, mat = cfg.materials[f('mat').value];
      if (!L || !W) { out.hidden = true; return; }
      var Lp = L + 2 * oh, Wp = W + 2 * oh, k = slopeFactor(p), run = (style === 'shed' ? Wp : Wp / 2);
      var area = Lp * Wp * k, ridge = 0, hips = 0, eaves = 0, rakes = 0;
      if (style === 'gable') { ridge = Lp; rakes = 4 * run * k; eaves = 2 * Lp; }
      if (style === 'hip') { ridge = Math.max(0, Lp - Wp); hips = 4 * Math.sqrt(2 * run * run + Math.pow(run * p / 12, 2)); eaves = 2 * (Lp + Wp); }
      if (style === 'shed') { rakes = 2 * run * k; eaves = Lp; }
      var wasteV = f('waste').value, waste = wasteV === 'auto' ? cfg.waste[style] : num(wasteV) / 100;
      var sq = area * (1 + waste) / 100;
      var html = '<h2 class="hgt-frost__head">' + fmt(area) + ' sq ft of roof: ' + fmt(sq, 1) + ' squares</h2>';
      var s = stat('hgt-stat--frost', 'Roof area', fmt(area) + ' sq ft', fmt(Lp, 1) + ' × ' + fmt(Wp, 1) + ' ft with overhangs × ' + fmt(k, 3) + ' for ' + p + '/12');
      s += stat('hgt-stat--frost', 'Squares', fmt(sq, 1), 'Includes ' + Math.round(waste * 100) + '% waste (100 sq ft per square)');
      var cost = 0, lines = [];
      if (mat.bundles) {
        var bundles = up(sq * mat.bundles);
        s += stat('hgt-stat--frost', 'Shingle bundles', fmt(bundles), mat.name + ', ' + mat.bundles + ' per square');
        cost += bundles * num(f('pBundle').value); lines.push([bundles, 'bundles of ' + mat.name.toLowerCase()]);
        var starterLf = eaves + rakes, starter = up(starterLf / cfg.starterLf);
        s += stat('', 'Starter strip', fmt(starter) + ' bundles', fmt(starterLf) + ' ft of eaves and rakes ÷ ' + cfg.starterLf + ' ft');
        cost += starter * num(f('pStarter').value);
        var ridgeLf = ridge + hips;
        if (ridgeLf) { var cap = up(ridgeLf / cfg.ridgeLf); s += stat('', 'Ridge cap', fmt(cap) + ' bundles', fmt(ridgeLf) + ' ft of ridge' + (hips ? ' and hips' : '') + ' ÷ ' + cfg.ridgeLf + ' ft'); cost += cap * num(f('pRidge').value); }
        var nails = Math.round(sq * cfg.nailsPerSq[f('nails').value]);
        s += stat('', 'Roofing nails', fmt(nails), 'About ' + fmt(up(nails / cfg.nailsPerLb)) + ' lb of 1¼ in nails (' + f('nails').value + ' per shingle)');
      } else {
        var lf = area * (1 + waste) / (cfg.panelIn / 12);
        s += stat('hgt-stat--frost', 'Metal panels', fmt(up(lf)) + ' linear ft', cfg.panelIn + ' in coverage width');
        if (style !== 'hip') s += stat('', 'Panel layout', fmt(up(Lp * 12 / cfg.panelIn) * (style === 'gable' ? 2 : 1)) + ' panels', 'Each ' + ftIn(run * k) + ' long');
        if (ridge + hips) s += stat('', 'Ridge and hip cap', fmt(up((ridge + hips) / 10 * 1.1)) + ' × 10 ft', fmt(ridge + hips) + ' ft');
        s += stat('', 'Screws', fmt(up(sq * cfg.screwsPerSq)), 'About ' + cfg.screwsPerSq + ' per square');
        cost += area * (1 + waste) * num(f('pMetal').value);
      }
      var under = up(area * (1 + cfg.underLap) / cfg.underRoll);
      s += stat('', 'Synthetic underlayment', fmt(under) + ' rolls', cfg.underRoll + ' sq ft rolls with ' + Math.round(cfg.underLap * 100) + '% for laps');
      cost += under * num(f('pUnder').value);
      var iw = num(f('ice').value);
      if (iw) { var iwRolls = up(eaves * iw / cfg.iceLf); s += stat('', 'Ice and water shield', fmt(iwRolls) + ' rolls', iw + ' row' + (iw > 1 ? 's' : '') + ' along ' + fmt(eaves) + ' ft of eaves'); cost += iwRolls * num(f('pIce').value); }
      var drip = up((eaves + rakes) / cfg.dripLf);
      s += stat('', 'Drip edge', fmt(drip) + ' × 10 ft', fmt(eaves + rakes) + ' ft of eaves and rakes');
      cost += drip * num(f('pDrip').value);
      if (cost) s += stat('hgt-stat--frost', 'Materials', money(cost), 'Before tear-off, labor, flashing and vents');
      html += '<div class="hgt-frost__stats">' + s + '</div>';
      var math = ['<li>Plan with overhangs: (' + fmt(L) + ' + ' + fmt(2 * oh, 2) + ') × (' + fmt(W) + ' + ' + fmt(2 * oh, 2) + ') = ' + fmt(Lp * Wp) + ' sq ft.</li>',
        '<li>Roof area = plan × slope factor √(1 + (' + p + '/12)²) = ' + fmt(Lp * Wp) + ' × ' + fmt(k, 4) + ' = ' + fmt(area) + ' sq ft. This holds for gable, hip and shed roofs when every plane has the same pitch.</li>',
        '<li>Edges: eaves ' + fmt(eaves) + ' ft, rakes ' + fmt(rakes) + ' ft, ridge ' + fmt(ridge) + ' ft' + (hips ? ', hips ' + fmt(hips) + ' ft (4 × √(2 × run² + rise²))' : '') + '.</li>',
        '<li>Squares = ' + fmt(area) + ' × ' + fmt(1 + waste, 2) + ' ÷ 100 = ' + fmt(sq, 2) + '.</li>'];
      html += '<details class="hgt-calc__math"' + (embed ? '' : ' open') + '><summary>Show the math</summary><ul>' + math.join('') + '</ul></details>';
      if (p < 4 && mat.bundles) html += '<p class="hgt-note">' + (p < 2 ? '<strong>Too flat for shingles.</strong> Below 2/12 use a low-slope membrane.' : '<strong>Low slope:</strong> between 2/12 and 4/12, shingle makers require two layers of underlayment (or full ice and water shield).') + '</p>';
      finish(html, { calc: 'roofing', squares: Math.round(sq) });
    }

    // ---- shingles from measured roof planes ----
    function rowHtml(i, v) {
      v = v || {};
      return '<div class="hgt-calc__row hgt-calc__row--m" data-row>' +
        '<label><span>Plane ' + (i + 1) + ': eave length (ft)</span><input type="number" inputmode="decimal" min="0" step="0.5" data-k="a" value="' + esc(v.a !== undefined ? v.a : (i ? '' : 40)) + '"></label>' +
        '<label><span>Top edge (ft)</span><input type="number" inputmode="decimal" min="0" step="0.5" data-k="b" value="' + esc(v.b !== undefined ? v.b : (i ? '' : 40)) + '"></label>' +
        '<label><span>Slope length (ft)</span><input type="number" inputmode="decimal" min="0" step="0.5" data-k="s" value="' + esc(v.s !== undefined ? v.s : (i ? '' : 17)) + '"></label>' +
        '<button type="button" class="hgt-calc__del" data-del aria-label="Remove plane ' + (i + 1) + '">×</button></div>';
    }
    function raw() {
      return Array.prototype.map.call(rows.querySelectorAll('[data-row]'), function (r) {
        var o = {};
        Array.prototype.forEach.call(r.querySelectorAll('[data-k]'), function (i) { o[i.getAttribute('data-k')] = i.value; });
        return o;
      });
    }
    function renumber() {
      Array.prototype.forEach.call(rows.querySelectorAll('[data-row]'), function (r, i) {
        r.querySelector('span').textContent = 'Plane ' + (i + 1) + ': eave length (ft)';
        r.querySelector('[data-del]').setAttribute('aria-label', 'Remove plane ' + (i + 1));
      });
    }
    function calcShingle() {
      var planes = raw().filter(function (r) { return num(r.a) && num(r.s); });
      if (!planes.length) { out.hidden = true; return; }
      var area = planes.reduce(function (t, r) { return t + (num(r.a) + num(r.b)) / 2 * num(r.s); }, 0);
      var waste = num(f('waste').value) / 100, mat = cfg.materials[f('mat').value];
      var sq = area * (1 + waste) / 100, bundles = up(sq * mat.bundles);
      var html = '<h2 class="hgt-frost__head">' + fmt(bundles) + ' bundles of shingles (' + fmt(sq, 1) + ' squares)</h2>';
      var s = stat('hgt-stat--frost', 'Bundles', fmt(bundles), mat.name + ', ' + mat.bundles + ' per square');
      s += stat('hgt-stat--frost', 'Roof area', fmt(area) + ' sq ft', planes.length + ' plane' + (planes.length > 1 ? 's' : '') + ' + ' + Math.round(waste * 100) + '% waste = ' + fmt(area * (1 + waste)) + ' sq ft');
      var st = num(f('starter').value), rd = num(f('ridge').value), cost = bundles * num(f('pBundle').value);
      if (st) { s += stat('', 'Starter strip', fmt(up(st / cfg.starterLf)) + ' bundles', fmt(st) + ' ft ÷ ' + cfg.starterLf + ' ft per bundle'); cost += up(st / cfg.starterLf) * num(f('pStarter').value); }
      if (rd) { s += stat('', 'Ridge cap', fmt(up(rd / cfg.ridgeLf)) + ' bundles', fmt(rd) + ' ft ÷ ' + cfg.ridgeLf + ' ft per bundle'); cost += up(rd / cfg.ridgeLf) * num(f('pRidge').value); }
      s += stat('', 'Nails', fmt(Math.round(sq * cfg.nailsPerSq[4])), '4 per shingle; ' + fmt(Math.round(sq * cfg.nailsPerSq[6])) + ' for a 6-nail high-wind pattern');
      if (cost) s += stat('hgt-stat--frost', 'Shingle cost', money(cost), 'Shingles, starter and ridge cap only');
      html += '<div class="hgt-frost__stats">' + s + '</div>';
      var math = planes.map(function (r, i) { return '<li>Plane ' + (i + 1) + ': (' + fmt(num(r.a), 1) + ' + ' + fmt(num(r.b), 1) + ') ÷ 2 × ' + fmt(num(r.s), 1) + ' = ' + fmt((num(r.a) + num(r.b)) / 2 * num(r.s)) + ' sq ft.</li>'; });
      math.push('<li>Squares = ' + fmt(area) + ' × ' + fmt(1 + waste, 2) + ' ÷ 100 = ' + fmt(sq, 2) + '; × ' + mat.bundles + ' bundles = ' + fmt(sq * mat.bundles, 1) + ', rounded up.</li>');
      html += '<details class="hgt-calc__math"' + (embed ? '' : ' open') + '><summary>Show the math</summary><ul>' + math.join('') + '</ul></details>';
      finish(html, { calc: 'shingles', bundles: bundles });
    }

    var calc = kind === 'pitch' ? calcPitch : kind === 'roof' ? calcRoof : calcShingle;
    location.hash.replace(/^#/, '').split('&').forEach(function (kv) {
      var p = kv.split('='), k = decodeURIComponent(p[0] || ''), v = decodeURIComponent(p[1] || '');
      if (k === 'rows' && rows) { hashRows = v.split(';').map(function (r) { var x = r.split(','); return { a: x[0], b: x[1], s: x[2] }; }); return; }
      var e = k && form.elements[k];
      if (e && !(!e.options && e.length)) e.value = v;
    });
    if (rows) {
      (hashRows || cfg.planes || [null]).forEach(function (v, i) { rows.insertAdjacentHTML('beforeend', rowHtml(i, v)); });
      root.querySelector('[data-add]').addEventListener('click', function () { rows.insertAdjacentHTML('beforeend', rowHtml(rows.children.length, { a: '', b: '', s: '' })); rows.lastElementChild.querySelector('input').focus(); });
      rows.addEventListener('click', function (e) { if (e.target.closest('[data-del]') && rows.children.length > 1) { e.target.closest('[data-row]').remove(); renumber(); calc(); } });
    }
    if (kind === 'pitch') showMode();
    var timer;
    form.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(calc, 150); });
    form.addEventListener('change', function (e) { if (e.target.name === 'mode') showMode(); calc(); });
    form.addEventListener('submit', function (e) { e.preventDefault(); calc(); });
    root.addEventListener('click', function (e) {
      var share = e.target.closest('[data-share]');
      if (share && navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { share.textContent = 'Link copied'; setTimeout(function () { share.textContent = 'Copy link to this result'; }, 2000); });
    });
    calc();
  }

  for (var i = 0; i < roots.length; i++) setup(roots[i], JSON.parse(roots[i].getAttribute('data-config')));
})();
