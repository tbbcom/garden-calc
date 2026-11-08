/* Concrete project calculator (slabs, footings, round columns, steps) with bags vs ready-mix,
   trucks, rebar or mesh and gravel base: tools.homegardenlot.com. Element layouts, bag yields
   and rules arrive in data-config from the page build. */
(function () {
  'use strict';
  var roots = document.querySelectorAll('[data-hgt-concrete]');
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
  // Cubic feet of one element.
  function cuft(t, v) {
    if (t === 'slab') return v.a * v.b * v.c / 12 * v.q;
    if (t === 'footing') return v.a * (v.b / 12) * (v.c / 12) * v.q;
    if (t === 'column') return Math.PI * Math.pow(v.a / 24, 2) * v.c / 12 * v.q;
    // Steps: each step is a block one rise taller than the one in front of it.
    if (t === 'steps') { var n = v.q; return v.a * (v.b / 12) * (v.c / 12) * n * (n + 1) / 2; }
    return 0;
  }
  function describe(t, v, cf) {
    if (t === 'slab') return 'Slab ' + v.a + ' × ' + v.b + ' ft × ' + v.c + ' in' + (v.q > 1 ? ' × ' + v.q : '') + ' = ' + fmt(cf, 1) + ' cu ft';
    if (t === 'footing') return 'Footing ' + v.a + ' ft long × ' + v.b + ' in wide × ' + v.c + ' in deep' + (v.q > 1 ? ' × ' + v.q : '') + ' = ' + fmt(cf, 1) + ' cu ft';
    if (t === 'column') return 'Column ' + v.a + ' in across × ' + v.c + ' in deep × ' + v.q + ' = ' + fmt(cf, 1) + ' cu ft';
    return v.q + ' steps, ' + v.a + ' ft wide, ' + v.c + ' in rise × ' + v.b + ' in run = ' + fmt(cf, 1) + ' cu ft';
  }

  function setup(root, cfg) {
    var form = root.querySelector('form'), out = root.querySelector('[data-out]'), rows = root.querySelector('[data-rows]');
    var f = function (n) { return form.elements[n]; };
    var embed = root.hasAttribute('data-embed');
    var T = cfg.types;

    function rowHtml(i, v) {
      var t = v && T[v.t] ? v.t : cfg.firstType;
      return '<div class="hgt-calc__row hgt-calc__row--m" data-row>' +
        '<label><span>Part ' + (i + 1) + '</span><select data-t>' + Object.keys(T).map(function (k) { return '<option value="' + k + '"' + (k === t ? ' selected' : '') + '>' + T[k].name + '</option>'; }).join('') + '</select></label>' +
        T[t].cols.map(function (c) { var val = v && v[c.k] !== undefined ? v[c.k] : c.v; return '<label><span>' + c.label + '</span><input type="number" inputmode="decimal" min="0" step="any" data-k="' + c.k + '" value="' + esc(val) + '"></label>'; }).join('') +
        '<button type="button" class="hgt-calc__del" data-del aria-label="Remove part ' + (i + 1) + '">×</button></div>';
    }
    function raw() {
      return Array.prototype.map.call(rows.querySelectorAll('[data-row]'), function (r) {
        var o = { t: r.querySelector('[data-t]').value };
        Array.prototype.forEach.call(r.querySelectorAll('[data-k]'), function (i) { o[i.getAttribute('data-k')] = i.value; });
        return o;
      });
    }

    function calc() {
      var parts = raw().map(function (o) { var v = { a: num(o.a), b: num(o.b), c: num(o.c), q: Math.max(1, num(o.q) || 1) }; return { t: o.t, v: v, cf: cuft(o.t, v) }; }).filter(function (p) { return p.cf > 0; });
      if (!parts.length) { out.hidden = true; return; }
      var waste = num(f('waste').value) / 100;
      var net = parts.reduce(function (a, p) { return a + p.cf; }, 0), cf = net * (1 + waste), yd = cf / 27;
      var slabs = parts.filter(function (p) { return p.t === 'slab'; });
      var slabSq = slabs.reduce(function (a, p) { return a + p.v.a * p.v.b * p.v.q; }, 0);
      var bags = cfg.bags.map(function (b) { return { b: b, n: Math.ceil(cf / b.yield - 1e-9) }; });
      var trucks = Math.ceil(yd / cfg.truckYd - 1e-9);
      var bagCost = bags[0].n * num(f('pBag').value), readyCost = Math.max(yd, cfg.minOrder) * num(f('pReady').value) + (yd < cfg.shortLoad ? num(f('pShort').value) : 0);
      var s = '', math = parts.map(function (p) { return '<li>' + describe(p.t, p.v, p.cf) + '</li>'; });

      var html = '<h2 class="hgt-frost__head">' + fmt(yd, 2) + ' cubic yards of concrete (' + fmt(bags[0].n) + ' × ' + bags[0].b.name + ' bags)</h2>';
      s += stat('hgt-stat--frost', 'Concrete', fmt(yd, 2) + ' cu yd', fmt(cf, 1) + ' cu ft incl. ' + Math.round(waste * 100) + '% extra');
      s += stat('', 'Bags', bags.map(function (x) { return fmt(x.n) + ' × ' + x.b.name; }).join(' · '), 'Premixed concrete');
      s += stat('', 'Ready-mix', yd >= cfg.bagLimitYd ? fmt(trucks) + ' truck' + (trucks > 1 ? 's' : '') : 'Bags are fine', yd >= cfg.bagLimitYd ? 'Up to ~' + cfg.truckYd + ' cu yd per truck' + (yd < cfg.shortLoad ? '; short-load fee likely' : '') : 'Under ' + cfg.bagLimitYd + ' cu yd, mixing bags is usually simpler');
      s += stat('', 'Weight', fmt(yd * cfg.lbPerYd / 2000, 1) + ' tons', '≈ ' + fmt(cfg.lbPerYd) + ' lb per cu yd');
      if (slabSq) {
        var base = slabSq * num(f('base').value) / 12 / 27 * (1 + cfg.baseCompact);
        if (base) s += stat('', 'Gravel base', fmt(base, 1) + ' cu yd', fmt(base * 1.4, 1) + ' tons at ' + f('base').value + ' in compacted');
        var r = f('reinf').value;
        if (r === 'mesh') { var sheets = Math.ceil(slabSq * 1.1 / cfg.meshSheet - 1e-9); s += stat('', 'Wire mesh', fmt(sheets) + ' sheets', '5 × 10 ft, overlapped one square'); }
        else if (r !== 'none') {
          var sp = num(r) / 12, lf = 0;
          slabs.forEach(function (p) { var L = p.v.a, W = p.v.b; lf += ((Math.floor(W / sp) + 1) * L + (Math.floor(L / sp) + 1) * W) * p.v.q; });
          var lap = cfg.lapIn / 12, sticks = Math.ceil(lf * (1 + lap / cfg.stickFt) / cfg.stickFt - 1e-9);
          s += stat('', '#' + f('bar').value + ' rebar', fmt(sticks) + ' × ' + cfg.stickFt + ' ft', fmt(lf) + ' ft in a ' + r + ' in grid, + laps');
          s += stat('', 'Chairs and ties', fmt(Math.ceil(slabSq / ((num(r) / 12) * (num(r) / 12)) / 2)) + ' chairs', 'About one at every other crossing');
        }
      }
      if (bagCost || readyCost) s += stat('hgt-stat--frost', 'Bags vs ready-mix', money(bagCost) + ' vs ' + money(readyCost), (bagCost < readyCost ? 'Bags are cheaper' : 'Ready-mix is cheaper') + (yd < cfg.minOrder ? ' (ready-mix minimum ' + cfg.minOrder + ' cu yd)' : ''));
      math.push('<li>Total: ' + fmt(net, 1) + ' cu ft × ' + (1 + waste).toFixed(2) + ' = ' + fmt(cf, 1) + ' cu ft ÷ 27 = ' + fmt(yd, 3) + ' cu yd.</li>');
      math.push('<li>Bags: ' + fmt(cf, 1) + ' cu ft ÷ ' + bags.map(function (x) { return x.b.yield + ' (' + x.b.name + ')'; }).join(', ') + ' cu ft per bag.</li>');
      html += '<div class="hgt-frost__stats">' + s + '</div>';
      html += '<details class="hgt-calc__math"' + (embed ? '' : ' open') + '><summary>Show the math</summary><ul>' + math.join('') + '</ul></details>';
      if (!embed) html += '<div class="hgt-frost__actions"><button class="hgt-btn" type="button" data-print>Print order list</button><button class="hgt-btn hgt-btn--ghost" type="button" data-share>Copy link to this result</button></div>';
      out.innerHTML = html;
      out.hidden = false;
      if (history.replaceState && window.self === window.top) {
        var st = raw().map(function (o) { return o.t + ':' + T[o.t].cols.map(function (c) { return num(o[c.k]); }).join('x'); }).join(',');
        history.replaceState(null, '', '#parts=' + encodeURIComponent(st) + ['waste', 'reinf', 'bar', 'base'].map(function (k) { return '&' + k + '=' + encodeURIComponent(f(k).value); }).join(''));
      }
      track({ calc: 'concrete', yd: Math.round(yd) });
    }

    var h = readHash();
    ['waste', 'reinf', 'bar', 'base'].forEach(function (k) { if (h[k] !== undefined) f(k).value = h[k]; });
    var start = (h.parts || '').split(',').filter(Boolean).map(function (t) {
      var m = /^(\w+):([\d.x]+)$/.exec(t);
      if (!m || !T[m[1]]) return null;
      var o = { t: m[1] }, v = m[2].split('x');
      T[m[1]].cols.forEach(function (c, i) { o[c.k] = v[i]; });
      return o;
    }).filter(Boolean);
    if (!start.length) start = [{ t: cfg.firstType }];
    rows.innerHTML = start.map(function (o, i) { return rowHtml(i, o); }).join('');
    var timer;
    form.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(calc, 150); });
    form.addEventListener('change', function (e) {
      if (e.target.hasAttribute('data-t')) {
        var row = e.target.closest('[data-row]');
        row.outerHTML = rowHtml(Array.prototype.indexOf.call(rows.children, row), { t: e.target.value });
      }
      calc();
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); calc(); });
    root.querySelector('[data-add]').addEventListener('click', function () {
      rows.insertAdjacentHTML('beforeend', rowHtml(rows.querySelectorAll('[data-row]').length, { t: cfg.firstType }));
      calc();
    });
    root.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del && rows.querySelectorAll('[data-row]').length > 1) {
        del.closest('[data-row]').remove();
        var all = raw();
        rows.innerHTML = all.map(function (o, i) { return rowHtml(i, o); }).join('');
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
