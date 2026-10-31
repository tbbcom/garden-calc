/* Sod and grass seed calculators: tools.homegardenlot.com
   Rates, piece sizes and bag sizes arrive in data-config from the page build. */
(function () {
  'use strict';
  var roots = document.querySelectorAll('[data-hgt-lawn]');
  if (!roots.length) return;

  var SHAPES = {
    r: ['Rectangle', 'Length (ft)', 'Width (ft)'],
    c: ['Circle', 'Diameter (ft)', ''],
    t: ['Triangle', 'Base (ft)', 'Height (ft)'],
    s: ['Known area', 'Square feet', '']
  };

  // Same routing as frost.js: direct GA4 when configured, otherwise the GTM dataLayer.
  function track(ev) {
    if (window.hgtGA4 && window.gtag) window.gtag('event', 'calc_result', ev);
    else if (window.dataLayer) window.dataLayer.push(Object.assign({ event: 'calc_result' }, ev));
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function num(v) { var n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) && n > 0 ? n : 0; }
  function fmt(n, d) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function money(n) { return '$' + fmt(n, n < 100 ? 2 : 0); }
  function stat(cls, name, value, hint) {
    return '<div class="hgt-stat' + (cls ? ' ' + cls : '') + '"><span class="hgt-stat__label">' + name +
      '</span><span class="hgt-stat__value">' + value + '</span>' + (hint ? '<span class="hgt-stat__hint">' + hint + '</span>' : '') + '</div>';
  }
  function area(shape, a, b) {
    if (shape === 'c') return Math.PI * a * a / 4;
    if (shape === 't') return a * b / 2;
    if (shape === 's') return a;
    return a * b;
  }

  function rowHtml(i, shape, a, b) {
    var s = SHAPES[shape] || SHAPES.r;
    return '<div class="hgt-calc__row hgt-calc__row--shape" data-row>' +
      '<label><span>Area ' + (i + 1) + '</span><select data-shape>' + Object.keys(SHAPES).map(function (k) {
        return '<option value="' + k + '"' + (k === shape ? ' selected' : '') + '>' + SHAPES[k][0] + '</option>';
      }).join('') + '</select></label>' +
      '<label><span data-la>' + s[1] + '</span><input type="number" inputmode="decimal" min="0" step="0.5" data-a value="' + esc(a) + '"></label>' +
      '<label' + (s[2] ? '' : ' hidden') + '><span data-lb>' + (s[2] || '&nbsp;') + '</span><input type="number" inputmode="decimal" min="0" step="0.5" data-b value="' + esc(b) + '"></label>' +
      '<button type="button" class="hgt-calc__del" data-del aria-label="Remove area ' + (i + 1) + '">×</button></div>';
  }
  function readRows(root) {
    var out = [];
    Array.prototype.forEach.call(root.querySelectorAll('[data-row]'), function (r) {
      var shape = r.querySelector('[data-shape]').value;
      var a = num(r.querySelector('[data-a]').value), b = num(r.querySelector('[data-b]').value);
      var sq = area(shape, a, b);
      if (sq) out.push({ shape: shape, a: a, b: b, sq: sq });
    });
    return out;
  }
  function relabel(row) {
    var s = SHAPES[row.querySelector('[data-shape]').value];
    row.querySelector('[data-la]').textContent = s[1];
    var lb = row.querySelector('[data-b]').parentNode;
    lb.hidden = !s[2];
    row.querySelector('[data-lb]').textContent = s[2] || '';
  }
  function describe(r) {
    if (r.shape === 'c') return 'circle ' + r.a + ' ft across = ' + fmt(r.sq) + ' sq ft';
    if (r.shape === 't') return 'triangle ' + r.a + ' × ' + r.b + ' ÷ 2 = ' + fmt(r.sq) + ' sq ft';
    if (r.shape === 's') return fmt(r.sq) + ' sq ft';
    return r.a + ' × ' + r.b + ' ft = ' + fmt(r.sq) + ' sq ft';
  }

  function readHash() {
    var o = {};
    location.hash.replace(/^#/, '').split('&').forEach(function (p) {
      var kv = p.split('=');
      if (kv[0]) o[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return o;
  }
  function writeHash(o) {
    if (!history.replaceState || window.self !== window.top) return;
    history.replaceState(null, '', '#' + Object.keys(o).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&'));
  }
  function encRows(rows) { return rows.map(function (r) { return r.shape + ':' + r.a + (SHAPES[r.shape][2] ? 'x' + r.b : ''); }).join(','); }
  function decRows(s) {
    return (s || '').split(',').map(function (p) {
      var m = /^([rcts]):([\d.]+)(?:x([\d.]+))?$/.exec(p);
      return m ? [m[1], m[2], m[3] || ''] : null;
    }).filter(Boolean);
  }

  function totals(root, f) {
    var rows = readRows(root);
    var gross = rows.reduce(function (a, r) { return a + r.sq; }, 0);
    var sub = Math.min(num(f('sub').value), gross);
    return { rows: rows, gross: gross, sub: sub, net: gross - sub };
  }
  function mathAreas(t) {
    return '<li>Areas: ' + t.rows.map(describe).join('; ') + '.</li>' +
      (t.sub ? '<li>Total ' + fmt(t.gross) + ' sq ft − ' + fmt(t.sub) + ' sq ft excluded = ' + fmt(t.net) + ' sq ft.</li>' : '<li>Total: ' + fmt(t.net) + ' sq ft (' + fmt(t.net / 43560, 3) + ' acres).</li>');
  }
  function actions(embed) {
    return embed ? '' : '<div class="hgt-frost__actions"><button class="hgt-btn" type="button" data-print>Print shopping list</button><button class="hgt-btn hgt-btn--ghost" type="button" data-share>Copy link to this result</button></div>';
  }

  // ---------- sod ----------
  function sod(root, cfg) {
    var form = root.querySelector('form'), out = root.querySelector('[data-out]');
    var f = function (n) { return form.elements[n]; };
    var embed = root.hasAttribute('data-embed');

    function calc() {
      var t = totals(root, f);
      if (!t.net) { out.hidden = true; return; }
      var waste = num(f('waste').value) / 100;
      var piece = cfg.pieces[f('piece').value] || cfg.pieces.slab;
      var pallet = num(f('pallet').value) || cfg.pallet;
      var need = t.net * (1 + waste);
      var pieces = Math.ceil(need / piece.sqft);
      var pallets = need / pallet;
      var full = Math.floor(pallets), extra = Math.ceil((need - full * pallet) / piece.sqft);
      var soilYd = t.net * num(f('soil').value) / 12 / 27;
      var price = num(f('pSqft').value);
      var cost = need * price + num(f('pDelivery').value) + soilYd * num(f('pSoil').value);

      var html = '<h2 class="hgt-frost__head">You need about ' + fmt(Math.ceil(need)) + ' sq ft of sod</h2>';
      var s = stat('hgt-stat--frost', 'Sod to order', fmt(Math.ceil(need)) + ' sq ft', fmt(t.net) + ' sq ft + ' + Math.round(waste * 100) + '% for cuts and edges');
      s += stat('', 'Pallets', fmt(Math.ceil(pallets * 10) / 10, 1), pallet + ' sq ft per pallet' + (full && extra ? ': ' + full + ' full + ' + extra + ' ' + piece.plural : ''));
      s += stat('', piece.name, fmt(pieces), piece.size + ' (' + piece.sqft + ' sq ft each)');
      if (soilYd) s += stat('', 'Topsoil', fmt(Math.ceil(soilYd * 10) / 10, 1) + ' cu yd', f('soil').value + ' in under the sod');
      s += stat('', 'First 2 weeks', 'Water daily', 'Keep the soil under the sod moist');
      if (cost > 0) s += stat('hgt-stat--frost', 'Estimated cost', money(cost), money(price) + ' per sq ft' + (num(f('pDelivery').value) ? ' + delivery' : ''));
      html += '<div class="hgt-frost__stats">' + s + '</div>';
      html += '<details class="hgt-calc__math"' + (embed ? '' : ' open') + '><summary>Show the math</summary><ul>' + mathAreas(t) +
        '<li>With ' + Math.round(waste * 100) + '% extra: ' + fmt(t.net) + ' × ' + (1 + waste).toFixed(2) + ' = ' + fmt(need, 1) + ' sq ft.</li>' +
        '<li>' + piece.name + ': ' + fmt(need, 1) + ' ÷ ' + piece.sqft + ' sq ft = ' + fmt(pieces) + '. Pallets: ' + fmt(need, 1) + ' ÷ ' + pallet + ' = ' + fmt(pallets, 2) + '.</li>' +
        (soilYd ? '<li>Topsoil: ' + fmt(t.net) + ' sq ft × ' + f('soil').value + ' in ÷ 12 ÷ 27 = ' + fmt(soilYd, 2) + ' cu yd.</li>' : '') +
        '</ul></details>' + actions(embed);
      out.innerHTML = html;
      out.hidden = false;
      writeHash({ a: encRows(t.rows), sub: t.sub || '', p: f('piece').value, pl: pallet, x: Math.round(waste * 100), so: f('soil').value });
      track({ calc: 'sod', sqft: Math.round(need) });
    }
    function load() {
      var h = readHash();
      if (h.sub) f('sub').value = h.sub;
      if (h.p && cfg.pieces[h.p]) f('piece').value = h.p;
      if (h.pl) f('pallet').value = h.pl;
      if (h.x) f('waste').value = h.x;
      if (h.so) f('soil').value = h.so;
      return decRows(h.a);
    }
    start(root, form, calc, load, function () {}, cfg);
  }

  // ---------- grass seed ----------
  function seed(root, cfg) {
    var form = root.querySelector('form'), out = root.querySelector('[data-out]');
    var f = function (n) { return form.elements[n]; };
    var embed = root.hasAttribute('data-embed');

    function rate() {
      if (f('grass').value === 'custom') return num(f('custom').value);
      var g = cfg.grasses[f('grass').value];
      return f('job').value === 'over' ? g.over : g.rate;
    }
    // Least leftover seed, with each extra bag counted as 2 lb so a pile of small bags doesn't win.
    function bags(lb) {
      var sizes = cfg.bags, best = null;
      if (lb > 500) return { total: Math.ceil(lb / sizes[0]) * sizes[0], count: Math.ceil(lb / sizes[0]), used: [Math.ceil(lb / sizes[0])] };
      (function walk(i, left, used) {
        if (i === sizes.length) {
          if (left > 1e-9) return;
          var total = used.reduce(function (a, n, k) { return a + n * sizes[k]; }, 0);
          var count = used.reduce(function (a, n) { return a + n; }, 0);
          var score = total + 2 * count;
          if (!best || score < best.score - 1e-9) best = { total: total, count: count, score: score, used: used.slice() };
          return;
        }
        var max = i === sizes.length - 1 ? Math.ceil(Math.max(left, 0) / sizes[i]) : Math.floor(Math.max(left, 0) / sizes[i]) + 1;
        for (var n = 0; n <= Math.min(max, 60); n++) { used.push(n); walk(i + 1, left - n * sizes[i], used); used.pop(); }
      })(0, lb, []);
      return best;
    }

    function calc() {
      var t = totals(root, f);
      var r = rate();
      if (!t.net || !r) { out.hidden = true; return; }
      var g = cfg.grasses[f('grass').value];
      var lb = t.net / 1000 * r;
      var b = bags(lb);
      var bagText = b ? b.used.map(function (n, k) { return n ? n + ' × ' + cfg.bags[k] + ' lb' : ''; }).filter(Boolean).join(' + ') : '';
      var straw = f('straw').checked ? Math.ceil(t.net / cfg.strawSqft) : 0;
      var cost = lb * num(f('pLb').value) + straw * num(f('pStraw').value);

      var html = '<h2 class="hgt-frost__head">You need about ' + fmt(lb, lb < 100 ? 1 : 0) + ' lb of ' + (g ? esc(g.name.toLowerCase()) + ' seed' : 'grass seed') + '</h2>';
      var s = stat('hgt-stat--frost', 'Seed', fmt(lb, 1) + ' lb', fmt(r, 1) + ' lb per 1,000 sq ft' + (g ? ' (' + (f('job').value === 'over' ? 'overseeding' : 'new lawn') + ')' : ''));
      if (bagText) s += stat('', 'Bags to buy', bagText, fmt(b.total) + ' lb total');
      s += stat('', 'Spreader', '2 passes', 'Half the seed each way, at right angles');
      if (g) s += stat('', 'Best time to sow', g.season, g.soil);
      if (straw) s += stat('', 'Straw mulch', fmt(straw) + ' bales', 'About 1 bale per ' + fmt(cfg.strawSqft) + ' sq ft');
      if (cost > 0) s += stat('hgt-stat--frost', 'Estimated cost', money(cost), money(num(f('pLb').value)) + ' per lb of seed');
      html += '<div class="hgt-frost__stats">' + s + '</div>';
      if (g && g.note) html += '<p class="hgt-note">' + g.note + '</p>';
      html += '<details class="hgt-calc__math"' + (embed ? '' : ' open') + '><summary>Show the math</summary><ul>' + mathAreas(t) +
        '<li>Seed: ' + fmt(t.net) + ' sq ft ÷ 1,000 × ' + fmt(r, 2) + ' lb = ' + fmt(lb, 2) + ' lb.</li>' +
        (g ? '<li>Rate: ' + (f('job').value === 'over' ? 'about half of the ' + g.rate + ' lb new-lawn rate, for thin existing turf' : 'new-lawn rate for bare soil') + '. The rate printed on your seed bag takes priority: blends and coated seed differ.</li>' : '') +
        (bagText ? '<li>Bags: the mix of ' + cfg.bags.join(', ') + ' lb bags with the least leftover seed and the fewest bags.</li>' : '') +
        '</ul></details>' + actions(embed);
      out.innerHTML = html;
      out.hidden = false;
      writeHash({ a: encRows(t.rows), sub: t.sub || '', g: f('grass').value, j: f('job').value, cr: f('grass').value === 'custom' ? r : '' });
      track({ calc: 'seed', grass: f('grass').value });
    }
    function sync() {
      var custom = f('grass').value === 'custom';
      root.querySelector('[data-custom]').hidden = !custom;
      f('job').disabled = custom;
    }
    function load() {
      var h = readHash();
      if (h.sub) f('sub').value = h.sub;
      if (h.g && (cfg.grasses[h.g] || h.g === 'custom')) f('grass').value = h.g;
      if (h.j) f('job').value = h.j;
      if (h.cr) f('custom').value = h.cr;
      return decRows(h.a);
    }
    start(root, form, calc, load, sync, cfg);
  }

  // ---------- shared wiring ----------
  function start(root, form, calc, load, sync, cfg) {
    var rows = root.querySelector('[data-rows]');
    var list = load();
    if (!list.length) list = [['r', cfg.defaultL, cfg.defaultW]];
    rows.innerHTML = list.map(function (r, i) { return rowHtml(i, r[0], r[1], r[2]); }).join('');
    sync();
    var t;
    form.addEventListener('input', function () { clearTimeout(t); t = setTimeout(calc, 150); });
    form.addEventListener('change', function (e) {
      if (e.target.hasAttribute('data-shape')) relabel(e.target.closest('[data-row]'));
      sync();
      calc();
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); calc(); });
    root.querySelector('[data-add]').addEventListener('click', function () {
      rows.insertAdjacentHTML('beforeend', rowHtml(rows.querySelectorAll('[data-row]').length, 'r', '', ''));
      rows.lastElementChild.querySelector('[data-a]').focus();
    });
    root.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del && rows.querySelectorAll('[data-row]').length > 1) {
        del.closest('[data-row]').remove();
        Array.prototype.forEach.call(rows.querySelectorAll('[data-row]'), function (r, i) {
          r.querySelector('label span').textContent = 'Area ' + (i + 1);
          r.querySelector('[data-del]').setAttribute('aria-label', 'Remove area ' + (i + 1));
        });
        calc();
      }
      if (e.target.closest('[data-print]')) window.print();
      var share = e.target.closest('[data-share]');
      if (share && navigator.clipboard) {
        navigator.clipboard.writeText(location.href).then(function () {
          share.textContent = 'Link copied';
          setTimeout(function () { share.textContent = 'Copy link to this result'; }, 2000);
        });
      }
    });
    calc();
  }

  for (var i = 0; i < roots.length; i++) {
    var cfg = JSON.parse(roots[i].getAttribute('data-config'));
    if (roots[i].getAttribute('data-hgt-lawn') === 'sod') sod(roots[i], cfg);
    else seed(roots[i], cfg);
  }
})();
