/* Tile, shower tile and drywall calculators: tools.homegardenlot.com
   Tile sizes, trowel coverage, grout density and drywall rules arrive in data-config from the page build. */
(function () {
  'use strict';
  var roots = document.querySelectorAll('[data-hgt-int]');
  if (!roots.length) return;

  function track(ev) {
    if (window.hgtGA4 && window.gtag) window.gtag('event', 'calc_result', ev);
    else if (window.dataLayer) window.dataLayer.push(Object.assign({ event: 'calc_result' }, ev));
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { var n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) && n >= 0 ? n : 0; }
  function fmt(n, d) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function money(n) { return '$' + fmt(n, n < 100 ? 2 : 0); }
  function stat(cls, name, value, hint) {
    return '<div class="hgt-stat' + (cls ? ' ' + cls : '') + '"><span class="hgt-stat__label">' + name +
      '</span><span class="hgt-stat__value">' + value + '</span>' + (hint ? '<span class="hgt-stat__hint">' + hint + '</span>' : '') + '</div>';
  }
  function readHash() {
    var o = {};
    location.hash.replace(/^#/, '').split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) o[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ''); });
    return o;
  }

  function setup(root, cfg) {
    var kind = root.getAttribute('data-hgt-int');
    var form = root.querySelector('form'), out = root.querySelector('[data-out]'), rows = root.querySelector('[data-rows]');
    var f = function (n) { return form.elements[n]; };
    var has = function (n) { return !!form.elements[n]; };
    var embed = root.hasAttribute('data-embed');
    var dims = kind === 'drywall' ? ['Length (ft)', 'Width (ft)', 'Wall height (ft)'] : ['Length (ft)', 'Width (ft)'];
    var label = kind === 'drywall' ? 'Room' : 'Area';

    function rowHtml(i, vals) {
      return '<div class="hgt-calc__row' + (dims.length === 3 ? ' hgt-calc__row--3' : '') + '" data-row>' + dims.map(function (d, k) {
        return '<label><span>' + (k === 0 ? label + ' ' + (i + 1) + ' ' + d.toLowerCase() : d) + '</span><input type="number" inputmode="decimal" min="0" step="0.5" data-d="' + k + '" value="' + esc(vals[k] || '') + '"></label>';
      }).join('') + '<button type="button" class="hgt-calc__del" data-del aria-label="Remove ' + label.toLowerCase() + ' ' + (i + 1) + '">×</button></div>';
    }
    function readRows() {
      var list = [];
      if (!rows) return list;
      Array.prototype.forEach.call(rows.querySelectorAll('[data-row]'), function (r) {
        var v = Array.prototype.map.call(r.querySelectorAll('[data-d]'), function (i) { return num(i.value); });
        if (v.every(function (x) { return x; })) list.push(v);
      });
      return list;
    }
    function tileSize(prefix) {
      var k = f(prefix + 'size').value;
      return cfg.tiles[k] || { l: num(f(prefix + 'l').value), w: num(f(prefix + 'w').value), name: 'custom' };
    }
    function trowel(t) {
      var big = Math.max(t.l, t.w);
      return cfg.trowels.filter(function (x) { return big <= x.upTo; })[0] || cfg.trowels[cfg.trowels.length - 1];
    }
    // Tiles, grout and thinset for one surface.
    function tileJob(sqft, t, joint, thick, waste) {
      var per = 144 / ((t.l + joint) * (t.w + joint));
      var tiles = Math.ceil(sqft * per * (1 + waste));
      var groutCuIn = sqft * 144 * ((t.l + t.w) * joint * thick) / (t.l * t.w);
      var groutLb = groutCuIn * cfg.groutDensity * (1 + cfg.groutWaste);
      var tr = trowel(t);
      return { per: per, tiles: tiles, groutLb: groutLb, tr: tr, thinset: Math.ceil(sqft * (1 + waste) / tr.cover - 1e-9) };
    }

    function calc() {
      var html = '', s = '', math = [], cost = 0, ev = { calc: kind };
      var joint = has('joint') ? num(f('joint').value) : 0, thick = has('thick') ? num(f('thick').value) || 0.375 : 0;

      if (kind === 'tile') {
        var list = readRows(), gross = list.reduce(function (a, r) { return a + r[0] * r[1]; }, 0);
        var sqft = Math.max(0, gross - num(f('sub').value));
        var t = tileSize('');
        if (!sqft || !t.l || !t.w) { out.hidden = true; return; }
        var waste = cfg.patterns[f('pattern').value].waste, box = num(f('box').value);
        var j = tileJob(sqft, t, joint, thick, waste);
        var boxes = box ? Math.ceil(sqft * (1 + waste) / box - 1e-9) : 0;
        cost = (box ? boxes * box : sqft * (1 + waste)) * num(f('pSqft').value) + Math.ceil(j.groutLb / cfg.groutBag) * num(f('pGrout').value) + j.thinset * num(f('pThin').value);
        html += '<h2 class="hgt-frost__head">You need about ' + fmt(j.tiles) + ' tiles' + (boxes ? ' (' + boxes + ' boxes)' : '') + ' for ' + fmt(sqft) + ' sq ft</h2>';
        s += stat('hgt-stat--frost', 'Tiles', fmt(j.tiles), t.l + ' × ' + t.w + ' in · ' + fmt(j.per, 2) + ' per sq ft + ' + Math.round(waste * 100) + '%');
        if (boxes) s += stat('', 'Boxes', fmt(boxes), box + ' sq ft per box · ' + fmt(boxes * box) + ' sq ft total');
        s += stat('', 'Grout', fmt(Math.max(1, Math.ceil(j.groutLb)), 0) + ' lb', fmt(Math.ceil(j.groutLb / cfg.groutBag)) + ' × ' + cfg.groutBag + ' lb bag' + (Math.ceil(j.groutLb / cfg.groutBag) > 1 ? 's' : '') + ' · ' + (joint < 0.125 ? 'unsanded' : 'sanded'));
        s += stat('', 'Thinset mortar', fmt(j.thinset) + ' × 50 lb', j.tr.name + ' notch trowel (~' + j.tr.cover + ' sq ft per bag)');
        if (cost) s += stat('hgt-stat--frost', 'Estimated materials', money(cost), 'Edit prices below');
        math.push('<li>Area: ' + list.map(function (r) { return r[0] + ' × ' + r[1]; }).join(' + ') + (num(f('sub').value) ? ' − ' + num(f('sub').value) : '') + ' = ' + fmt(sqft, 1) + ' sq ft.</li>');
        math.push('<li>Tiles per sq ft: 144 ÷ ((' + t.l + ' + ' + joint + ') × (' + t.w + ' + ' + joint + ')) = ' + fmt(j.per, 3) + '. × ' + fmt(sqft, 1) + ' × ' + (1 + waste) + ' = ' + fmt(j.tiles) + '.</li>');
        math.push('<li>Grout: ' + fmt(sqft, 1) + ' sq ft × 144 × (' + t.l + ' + ' + t.w + ') × ' + joint + ' × ' + thick + ' ÷ (' + t.l + ' × ' + t.w + ') cu in × ' + cfg.groutDensity + ' lb per cu in + ' + Math.round(cfg.groutWaste * 100) + '% = ' + fmt(j.groutLb, 1) + ' lb.</li>');
        ev.tiles = j.tiles;
      }

      if (kind === 'shower') {
        var W = num(f('width').value), D = num(f('depth').value), H = num(f('wallh').value);
        if (!W || !D || !H) { out.hidden = true; return; }
        var wallSq = (W + 2 * D) * H / 144 - num(f('niche').value);
        var floorSq = W * D / 144;
        var tw = tileSize('w'), tf = tileSize('f');
        var wj = tileJob(wallSq, tw, joint, thick, cfg.wallWaste);
        var fj = f('floor').checked ? tileJob(floorSq, tf, joint, thick, cfg.floorWaste) : null;
        html += '<h2 class="hgt-frost__head">' + fmt(wj.tiles) + ' wall tiles' + (fj ? ' and ' + fmt(fj.tiles) + ' floor tiles' : '') + '</h2>';
        s += stat('hgt-stat--frost', 'Wall tile', fmt(wj.tiles), tw.l + ' × ' + tw.w + ' in · ' + fmt(wallSq, 1) + ' sq ft + ' + Math.round(cfg.wallWaste * 100) + '%');
        if (fj) s += stat('hgt-stat--frost', 'Floor tile', fmt(fj.tiles), tf.l + ' × ' + tf.w + ' in · ' + fmt(floorSq, 1) + ' sq ft + ' + Math.round(cfg.floorWaste * 100) + '%');
        s += stat('', 'Grout', fmt(Math.ceil(wj.groutLb + (fj ? fj.groutLb : 0))) + ' lb', 'Walls and floor together');
        s += stat('', 'Thinset', fmt(wj.thinset + (fj ? fj.thinset : 0)) + ' × 50 lb', 'Use a polymer-modified mortar for showers');
        s += stat('', 'Waterproofing', fmt(Math.ceil((wallSq + floorSq) * 1.1)) + ' sq ft', 'Membrane for walls and floor, +10% for overlaps');
        math.push('<li>Walls: (back ' + W + ' in + 2 × side ' + D + ' in) × ' + H + ' in ÷ 144' + (num(f('niche').value) ? ' − ' + num(f('niche').value) + ' sq ft niche' : '') + ' = ' + fmt(wallSq, 1) + ' sq ft.</li>');
        math.push('<li>Floor: ' + W + ' × ' + D + ' in ÷ 144 = ' + fmt(floorSq, 1) + ' sq ft.</li>');
        ev.tiles = wj.tiles;
      }

      if (kind === 'drywall') {
        var rooms = readRows();
        if (!rooms.length) { out.hidden = true; return; }
        var walls = rooms.reduce(function (a, r) { return a + 2 * (r[0] + r[1]) * r[2]; }, 0);
        var ceil = f('ceiling').checked ? rooms.reduce(function (a, r) { return a + r[0] * r[1]; }, 0) : 0;
        var openings = num(f('doors').value) * cfg.door + num(f('windows').value) * cfg.window;
        var area = Math.max(0, walls + ceil - openings);
        var sheet = cfg.sheets[f('sheet').value], waste = num(f('waste').value) / 100;
        var sheets = Math.ceil(area * (1 + waste) / sheet.sqft - 1e-9);
        var screws = Math.ceil(area * cfg.screwsPerSqft);
        var mudLb = area * cfg.mudLbPerSqft, pails = Math.ceil(mudLb / cfg.pailLb - 1e-9), tape = Math.ceil(area * cfg.tapePerSqft);
        cost = sheets * num(f('pSheet').value) + pails * num(f('pMud').value) + Math.ceil(tape / 250) * num(f('pTape').value);
        html += '<h2 class="hgt-frost__head">You need about ' + fmt(sheets) + ' sheets of ' + sheet.name + ' drywall</h2>';
        s += stat('hgt-stat--frost', 'Drywall sheets', fmt(sheets), sheet.name + ' · ' + fmt(area) + ' sq ft + ' + Math.round(waste * 100) + '%');
        s += stat('', 'Screws', fmt(screws), '~1 per sq ft (about ' + fmt(Math.ceil(screws / cfg.screwsPerLb)) + ' lb of 1¼ in)');
        s += stat('', 'Joint compound', pails + ' pails', '4.5 gal premixed · ~' + fmt(mudLb) + ' lb for three coats');
        s += stat('', 'Paper tape', fmt(tape) + ' ft', fmt(Math.ceil(tape / 250)) + ' × 250 ft rolls');
        if (ceil) s += stat('', 'Ceiling', fmt(ceil) + ' sq ft', 'Use ⅝ in or sag-resistant ½ in board');
        if (cost) s += stat('hgt-stat--frost', 'Estimated materials', money(cost), 'Edit prices below');
        math.push('<li>Walls: ' + rooms.map(function (r) { return '2 × (' + r[0] + ' + ' + r[1] + ') × ' + r[2]; }).join(' + ') + ' = ' + fmt(walls) + ' sq ft' + (ceil ? '; ceilings ' + fmt(ceil) + ' sq ft' : '') + '.</li>');
        if (openings) math.push('<li>Openings: ' + num(f('doors').value) + ' doors × ' + cfg.door + ' + ' + num(f('windows').value) + ' windows × ' + cfg.window + ' = ' + fmt(openings) + ' sq ft removed.</li>');
        math.push('<li>Sheets: ' + fmt(area) + ' sq ft × ' + (1 + waste).toFixed(2) + ' ÷ ' + sheet.sqft + ' sq ft per sheet = ' + sheets + '.</li>');
        math.push('<li>Finishing: ' + cfg.mudLbPerSqft + ' lb compound and ' + cfg.tapePerSqft + ' ft of tape per sq ft of board.</li>');
        ev.sheets = sheets;
      }

      html += '<div class="hgt-frost__stats">' + s + '</div>';
      html += '<details class="hgt-calc__math"' + (embed ? '' : ' open') + '><summary>Show the math</summary><ul>' + math.join('') + '</ul></details>';
      if (!embed) html += '<div class="hgt-frost__actions"><button class="hgt-btn" type="button" data-print>Print shopping list</button><button class="hgt-btn hgt-btn--ghost" type="button" data-share>Copy link to this result</button></div>';
      out.innerHTML = html;
      out.hidden = false;
      if (history.replaceState && window.self === window.top) {
        var st = Array.prototype.map.call(form.elements, function (e) { return e.name; }).filter(function (k) { return k && !/^p[A-Z]/.test(k); });
        history.replaceState(null, '', '#' + (rows ? 'rows=' + encodeURIComponent(readRows().map(function (r) { return r.join('x'); }).join(',')) + '&' : '') +
          st.map(function (k) { var e = f(k); return k + '=' + encodeURIComponent(e.type === 'checkbox' ? (e.checked ? 1 : 0) : e.value); }).join('&'));
      }
      track(ev);
    }

    function sync() {
      Array.prototype.forEach.call(root.querySelectorAll('[data-custom]'), function (el) {
        el.hidden = f(el.getAttribute('data-custom')).value !== 'custom';
      });
    }

    var h = readHash();
    Array.prototype.forEach.call(form.elements, function (e) {
      if (!e.name || h[e.name] === undefined) return;
      if (e.type === 'checkbox') e.checked = h[e.name] === '1'; else e.value = h[e.name];
    });
    if (rows) {
      var start = (h.rows || '').split(',').map(function (r) { return r.split('x'); }).filter(function (r) { return r.length === dims.length && r.every(num); });
      if (!start.length) start = [cfg.defaultRow];
      rows.innerHTML = start.map(function (r, i) { return rowHtml(i, r); }).join('');
      root.querySelector('[data-add]').addEventListener('click', function () {
        rows.insertAdjacentHTML('beforeend', rowHtml(rows.querySelectorAll('[data-row]').length, []));
        rows.lastElementChild.querySelector('input').focus();
      });
    }
    sync();
    var timer;
    form.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(calc, 150); });
    form.addEventListener('change', function () { sync(); calc(); });
    form.addEventListener('submit', function (e) { e.preventDefault(); calc(); });
    root.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del && rows && rows.querySelectorAll('[data-row]').length > 1) {
        del.closest('[data-row]').remove();
        Array.prototype.forEach.call(rows.querySelectorAll('[data-row]'), function (r, i) { r.querySelector('label span').textContent = label + ' ' + (i + 1) + ' ' + dims[0].toLowerCase(); });
        calc();
      }
      if (e.target.closest('[data-print]')) window.print();
      var share = e.target.closest('[data-share]');
      if (share && navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { share.textContent = 'Link copied'; setTimeout(function () { share.textContent = 'Copy link to this result'; }, 2000); });
    });
    calc();
  }

  for (var i = 0; i < roots.length; i++) setup(roots[i], JSON.parse(roots[i].getAttribute('data-config')));
})();
