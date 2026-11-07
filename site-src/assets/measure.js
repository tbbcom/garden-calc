/* Square footage, countertop, cubic yard, tons, board foot, log scale, potting soil and raised bed soil
   calculators: tools.homegardenlot.com. Row layouts, densities, log rules and soil mixes arrive in
   data-config from the page build. */
(function () {
  'use strict';
  var roots = document.querySelectorAll('[data-hgt-measure]');
  if (!roots.length) return;

  function track(ev) {
    if (window.hgtGA4 && window.gtag) window.gtag('event', 'calc_result', ev);
    else if (window.dataLayer) window.dataLayer.push(Object.assign({ event: 'calc_result' }, ev));
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { var n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) && n >= 0 ? n : 0; }
  function fmt(n, d) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d === undefined ? 0 : d }); }
  function smart(n) { return n >= 100 ? fmt(n) : n >= 10 ? fmt(n, 1) : fmt(n, 2); }
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

  // Area and volume of one row; shape-aware rows carry their shape in r.s.
  function areaOf(r) {
    if (r.s === 'c') return Math.PI * r.a * r.a / 4;
    if (r.s === 't') return r.a * r.b / 2;
    return r.a * r.b;
  }
  // A tapered pot is a frustum; the base is taken as 80% of the rim, a typical nursery-pot taper.
  function potCuIn(r) {
    if (r.s === 'g') return r.a * 231 * 0.9;
    if (r.s === 'b') return r.a * r.b * Math.max(0, r.c - 1);
    var R = r.a / 2, rb = R * 0.8, h = Math.max(0, r.c - 1);
    return Math.PI * h / 3 * (R * R + R * rb + rb * rb);
  }
  function logBf(rule, d, L) {
    if (rule === 'doyle') return Math.max(0, Math.pow(d - 4, 2) * L / 16);
    if (rule === 'scribner') return Math.max(0, (0.79 * d * d - 2 * d - 4) * L / 16);
    // International ¼ in: 4 ft sections, the diameter growing ½ in per section (taper), × 0.905 for kerf.
    var bf = 0, full = Math.floor(L / 4), rest = L - full * 4;
    for (var i = 0; i < full; i++) { var di = d + 0.5 * i; bf += 0.22 * di * di - 0.71 * di; }
    if (rest) { var dr = d + 0.5 * full; bf += (0.22 * dr * dr - 0.71 * dr) * rest / 4; }
    return Math.max(0, bf * 0.905);
  }

  function setup(root, cfg) {
    var kind = root.getAttribute('data-hgt-measure');
    var form = root.querySelector('form'), out = root.querySelector('[data-out]'), rows = root.querySelector('[data-rows]');
    var f = function (n) { return form.elements[n]; };
    var has = function (n) { return !!form.elements[n]; };
    var embed = root.hasAttribute('data-embed');
    var R = cfg.rows || {};

    function cols(shape) { return (R.shapes ? R.shapes[shape].cols : R.cols); }
    function rowHtml(i, vals) {
      var shape = R.shapes ? (vals.s && R.shapes[vals.s] ? vals.s : Object.keys(R.shapes)[0]) : null;
      var c = cols(shape);
      var html = '<div class="hgt-calc__row hgt-calc__row--m" data-row>';
      if (R.shapes) html += '<label><span>' + R.label + ' ' + (i + 1) + '</span><select data-shape>' + Object.keys(R.shapes).map(function (k) {
        return '<option value="' + k + '"' + (k === shape ? ' selected' : '') + '>' + R.shapes[k].name + '</option>';
      }).join('') + '</select></label>';
      html += c.map(function (col, k) {
        var v = vals[col.k] !== undefined ? vals[col.k] : (i === 0 ? col.v : '');
        return '<label><span>' + (!R.shapes && k === 0 ? R.label + ' ' + (i + 1) + ': ' : '') + col.label + '</span><input type="number" inputmode="decimal" min="0" step="any" data-k="' + col.k + '" value="' + esc(v === undefined ? '' : v) + '"></label>';
      }).join('');
      return html + '<button type="button" class="hgt-calc__del" data-del aria-label="Remove ' + R.label.toLowerCase() + ' ' + (i + 1) + '">×</button></div>';
    }
    function readRows() {
      var list = [];
      Array.prototype.forEach.call(rows.querySelectorAll('[data-row]'), function (r) {
        var o = { s: r.querySelector('[data-shape]') ? r.querySelector('[data-shape]').value : '' };
        var ok = true;
        Array.prototype.forEach.call(r.querySelectorAll('[data-k]'), function (i) {
          var k = i.getAttribute('data-k'), v = num(i.value);
          o[k] = v;
          if (!v && !/^(ai|bi|ci|q)$/.test(k)) ok = false;
        });
        if (o.q === undefined) o.q = 1;
        if (!o.q) o.q = 1;
        // Feet + inches inputs combine into decimal feet.
        if (o.ai !== undefined) o.a = (o.a || 0) + o.ai / 12;
        if (o.bi !== undefined) o.b = (o.b || 0) + o.bi / 12;
        if (o.ai !== undefined || o.bi !== undefined) ok = o.a > 0 && (o.s === 'c' || o.b > 0);
        if (ok) list.push(o);
      });
      return list;
    }

    function calc() {
      var list = rows ? readRows() : [];
      if (!list.length && kind !== 'tons') { out.hidden = true; return; }
      var html = '', s = '', math = [], ev = { calc: kind }, cost = 0, price = has('price') ? num(f('price').value) : 0;

      if (kind === 'sqft' || kind === 'counter') {
        var sq = 0;
        list.forEach(function (r) {
          var a = kind === 'counter' ? r.a * r.b / 144 * r.q : areaOf(r) * r.q;
          sq += a;
          math.push('<li>' + (kind === 'counter' ? r.a + ' × ' + r.b + ' in ÷ 144' + (r.q > 1 ? ' × ' + r.q : '') : r.s === 'c' ? 'π × (' + fmt(r.a, 2) + ' ÷ 2)²' : r.s === 't' ? fmt(r.a, 2) + ' × ' + fmt(r.b, 2) + ' ÷ 2' : fmt(r.a, 2) + ' × ' + fmt(r.b, 2) + ' ft' + (r.q > 1 ? ' × ' + r.q : '')) + ' = ' + fmt(a, 2) + ' sq ft</li>');
        });
        if (kind === 'counter' && f('splash').checked) {
          var run = list.reduce(function (t, r) { return t + r.a * r.q; }, 0), sp = run * num(f('splashh').value) / 144;
          sq += sp;
          math.push('<li>Backsplash: ' + fmt(run) + ' in of counter × ' + f('splashh').value + ' in ÷ 144 = ' + fmt(sp, 2) + ' sq ft</li>');
        }
        var sub = has('sub') ? Math.min(num(f('sub').value), sq) : 0;
        if (sub) { sq -= sub; math.push('<li>Minus ' + fmt(sub, 2) + ' sq ft excluded.</li>'); }
        cost = sq * price;
        html += '<h2 class="hgt-frost__head">' + fmt(sq, 2) + ' square feet</h2>';
        s += stat('hgt-stat--frost', 'Square feet', fmt(sq, 2), list.length + ' ' + (list.length === 1 ? 'piece' : 'pieces'));
        s += stat('', 'Square yards', fmt(sq / 9, 2), 'sq ft ÷ 9');
        s += stat('', 'Square meters', fmt(sq * 0.09290304, 2), 'sq ft × 0.0929');
        if (kind === 'sqft') s += stat('', 'Acres', fmt(sq / 43560, 4), 'sq ft ÷ 43,560');
        else s += stat('', 'Square inches', fmt(sq * 144), 'sq ft × 144');
        if (cost) s += stat('hgt-stat--frost', 'Cost', money(cost), money(price) + ' per sq ft');
        ev.sqft = Math.round(sq);
      }

      if (kind === 'cuyd') {
        var cuft = 0;
        list.forEach(function (r) {
          var v = areaOf(r) * r.c / 12 * r.q;
          cuft += v;
          math.push('<li>' + (r.s === 'c' ? 'π × (' + r.a + ' ÷ 2)²' : r.s === 't' ? r.a + ' × ' + r.b + ' ÷ 2' : r.a + ' × ' + r.b) + ' ft × ' + r.c + ' in ÷ 12' + (r.q > 1 ? ' × ' + r.q : '') + ' = ' + fmt(v, 2) + ' cu ft</li>');
        });
        var yd = cuft / 27, m = cfg.materials[f('mat').value];
        cost = price * (f('unit').value === 'ton' ? yd * m.tpy : yd);
        html += '<h2 class="hgt-frost__head">' + fmt(yd, 2) + ' cubic yards</h2>';
        s += stat('hgt-stat--frost', 'Cubic yards', fmt(yd, 2), fmt(cuft, 1) + ' cu ft ÷ 27');
        s += stat('', 'Weight (' + esc(m.short) + ')', smart(yd * m.tpy) + ' tons', '≈ ' + fmt(yd * m.tpy * 2000) + ' lb at ' + m.tpy + ' tons per cu yd');
        s += stat('', 'Cubic meters', fmt(yd * 0.764555, 2), 'cu yd × 0.7646');
        s += stat('', 'Bags', fmt(Math.ceil(cuft / 2 - 1e-9)) + ' × 2 cu ft', fmt(Math.ceil(cuft / 1.5 - 1e-9)) + ' × 1.5 cu ft · ' + fmt(Math.ceil(cuft / 0.5 - 1e-9)) + ' × 0.5 cu ft');
        if (cost) s += stat('hgt-stat--frost', 'Cost', money(cost), money(price) + ' per ' + (f('unit').value === 'ton' ? 'ton' : 'cu yd'));
        math.push('<li>Total: ' + fmt(cuft, 2) + ' cu ft ÷ 27 = ' + fmt(yd, 3) + ' cu yd.</li>');
        ev.yd = Math.round(yd);
      }

      if (kind === 'tons') {
        var mt = cfg.materials[f('mat').value], amt = num(f('amount').value), toYd = f('dir').value === 'tons';
        if (!amt) { out.hidden = true; return; }
        var res = toYd ? amt / mt.tpy : amt * mt.tpy;
        html += '<h2 class="hgt-frost__head">' + fmt(amt, 2) + (toYd ? ' tons = ' : ' cu yd = ') + smart(res) + (toYd ? ' cubic yards' : ' tons') + ' of ' + esc(mt.short) + '</h2>';
        s += stat('hgt-stat--frost', toYd ? 'Cubic yards' : 'Tons', smart(res), 'At ' + mt.tpy + ' tons per cu yd');
        s += stat('', 'Pounds', fmt((toYd ? amt : res) * 2000), '1 ton = 2,000 lb');
        s += stat('', 'Covers at 3 in deep', fmt((toYd ? res : amt) * 108) + ' sq ft', '1 cu yd covers 108 sq ft at 3 in');
        math.push('<li>' + (toYd ? fmt(amt, 2) + ' tons ÷ ' + mt.tpy + ' = ' + fmt(res, 3) + ' cu yd' : fmt(amt, 2) + ' cu yd × ' + mt.tpy + ' = ' + fmt(res, 3) + ' tons') + '.</li>');
        list.length = 0;
      }

      if (kind === 'bf') {
        var bf = 0, lf = 0;
        list.forEach(function (r) {
          var b = r.a * r.b * r.c / 12 * r.q;
          bf += b; lf += r.c * r.q;
          math.push('<li>' + r.a + ' in × ' + r.b + ' in × ' + r.c + ' ft ÷ 12' + (r.q > 1 ? ' × ' + r.q : '') + ' = ' + fmt(b, 2) + ' bd ft</li>');
        });
        cost = bf * price;
        html += '<h2 class="hgt-frost__head">' + fmt(bf, 2) + ' board feet</h2>';
        s += stat('hgt-stat--frost', 'Board feet', fmt(bf, 2), 'Thickness × width (in) × length (ft) ÷ 12');
        s += stat('', 'Linear feet', fmt(lf, 1), 'Total length of all pieces');
        s += stat('', 'Cubic feet', fmt(bf / 12, 2), '12 board feet = 1 cu ft');
        if (cost) s += stat('hgt-stat--frost', 'Cost', money(cost), money(price) + ' per board foot');
        ev.bf = Math.round(bf);
      }

      if (kind === 'log') {
        var rule = f('rule').value, tot = 0;
        list.forEach(function (r) {
          var b = logBf(rule, r.a, r.c) * r.q;
          tot += b;
          math.push('<li>' + r.a + ' in × ' + r.c + ' ft' + (r.q > 1 ? ' × ' + r.q + ' logs' : '') + ': ' + fmt(b) + ' bd ft (' + cfg.rules[rule] + ')</li>');
        });
        var others = Object.keys(cfg.rules).filter(function (k) { return k !== rule; });
        html += '<h2 class="hgt-frost__head">' + fmt(tot) + ' board feet (' + cfg.rules[rule] + ')</h2>';
        s += stat('hgt-stat--frost', cfg.rules[rule], fmt(tot) + ' bd ft', list.length + ' log row' + (list.length > 1 ? 's' : ''));
        others.forEach(function (k) {
          var o = list.reduce(function (t, r) { return t + logBf(k, r.a, r.c) * r.q; }, 0);
          s += stat('', cfg.rules[k], fmt(o) + ' bd ft', 'Same logs, other rule');
        });
        if (price) { cost = tot * price; s += stat('hgt-stat--frost', 'Value', money(cost), money(price) + ' per board foot (' + cfg.rules[rule] + ')'); }
        ev.bf = Math.round(tot);
      }

      if (kind === 'pot') {
        var cuin = 0;
        list.forEach(function (r) {
          var v = potCuIn(r) * r.q;
          cuin += v;
          math.push('<li>' + (r.s === 'g' ? r.a + ' gal grow bag (filled to 90%)' : r.s === 'b' ? r.a + ' × ' + r.b + ' in planter, ' + r.c + ' in deep (1 in below rim)' : r.a + ' in pot, ' + r.c + ' in tall (taper to 80%, 1 in below rim)') + (r.q > 1 ? ' × ' + r.q : '') + ' = ' + fmt(v / 1728, 2) + ' cu ft</li>');
        });
        var cf = cuin / 1728, qt = cf * 25.714, gal = cuin / 231;
        html += '<h2 class="hgt-frost__head">' + fmt(cf, 2) + ' cu ft of potting mix (' + fmt(qt) + ' quarts)</h2>';
        s += stat('hgt-stat--frost', 'Potting mix', fmt(cf, 2) + ' cu ft', fmt(qt) + ' dry quarts · ' + fmt(gal, 1) + ' gal');
        s += stat('', 'Bags', [2, 1.5, 1].map(function (b) { return Math.ceil(cf / b - 1e-9) + ' × ' + b; }).join(' · ') + ' cu ft', 'Or ' + Math.ceil(qt / 16 - 1e-9) + ' × 16 qt · ' + Math.ceil(qt / 8 - 1e-9) + ' × 8 qt bags');
        s += stat('', 'Perlite to add (optional)', fmt(qt * 0.2) + ' qt', 'About 20% extra for drainage in heavy mixes');
        ev.cuft = Math.round(cf);
      }

      if (kind === 'bed') {
        var mix = cfg.mixes[f('mix').value], fill = num(f('fill').value), settle = cfg.settle;
        var vol = 0;
        list.forEach(function (r) {
          var d = Math.max(0, r.c - fill), v = areaOf(r) * d / 12 * r.q;
          vol += v;
          math.push('<li>' + (r.s === 'c' ? 'π × (' + r.a + ' ÷ 2)²' : r.a + ' × ' + r.b) + ' ft × ' + d + ' in of soil ÷ 12' + (r.q > 1 ? ' × ' + r.q : '') + ' = ' + fmt(v, 2) + ' cu ft</li>');
        });
        var need = vol * (1 + settle);
        html += '<h2 class="hgt-frost__head">' + fmt(need, 1) + ' cu ft (' + fmt(need / 27, 2) + ' cu yd) of soil</h2>';
        s += stat('hgt-stat--frost', 'Soil mix', fmt(need, 1) + ' cu ft', fmt(need / 27, 2) + ' cu yd, +' + Math.round(settle * 100) + '% for settling');
        mix.parts.forEach(function (p) {
          var v = need * p.share;
          s += stat('', p.name + ' (' + Math.round(p.share * 100) + '%)', fmt(v, 1) + ' cu ft', Math.ceil(v / p.bag - 1e-9) + ' × ' + p.bag + ' cu ft bags' + (v / 27 >= 1 ? ' or ' + fmt(v / 27, 1) + ' cu yd bulk' : ''));
        });
        if (fill) s += stat('', 'Filler at the bottom', fill + ' in', 'Logs, branches or leaves save ' + fmt(list.reduce(function (t, r) { return t + areaOf(r) * Math.min(fill, r.c) / 12 * r.q; }, 0), 1) + ' cu ft of soil');
        math.push('<li>Total ' + fmt(vol, 2) + ' cu ft × ' + (1 + settle) + ' for settling = ' + fmt(need, 2) + ' cu ft.</li>');
        ev.cuft = Math.round(need);
      }

      html += '<div class="hgt-frost__stats">' + s + '</div>';
      if (math.length) html += '<details class="hgt-calc__math"' + (embed ? '' : ' open') + '><summary>Show the math</summary><ul>' + math.join('') + '</ul></details>';
      if (!embed) html += '<div class="hgt-frost__actions"><button class="hgt-btn hgt-btn--ghost" type="button" data-share>Copy link to this result</button></div>';
      out.innerHTML = html;
      out.hidden = false;
      if (history.replaceState && window.self === window.top) {
        var keys = Array.prototype.map.call(form.elements, function (e) { return e.name; }).filter(function (k) { return k && k !== 'price'; });
        var enc = !rows ? '' : readRowsRaw().map(function (o) {
          return (o.s ? o.s + ':' : '') + cols(o.s || null).map(function (c) { return num(o[c.k]); }).join('x');
        }).join(',');
        history.replaceState(null, '', '#rows=' + encodeURIComponent(enc) + keys.map(function (k) { var e = f(k); return '&' + k + '=' + encodeURIComponent(e.type === 'checkbox' ? (e.checked ? 1 : 0) : e.value); }).join(''));
      }
      track(ev);
    }

    var h = readHash();
    Array.prototype.forEach.call(form.elements, function (e) {
      if (!e.name || h[e.name] === undefined) return;
      if (e.type === 'checkbox') e.checked = h[e.name] === '1'; else e.value = h[e.name];
    });
    var start = (h.rows || '').split(',').filter(Boolean).map(function (t) {
      var m = /^(?:([a-z]):)?([\d.x]+)$/.exec(t);
      if (!m) return null;
      var o = { s: m[1] || '' }, v = m[2].split('x');
      cols(R.shapes ? (o.s && R.shapes[o.s] ? o.s : Object.keys(R.shapes)[0]) : null).forEach(function (c, i) { o[c.k] = v[i]; });
      return o;
    }).filter(Boolean);
    if (!start.length) start = [{}];
    if (rows) rows.innerHTML = start.map(function (o, i) { return rowHtml(i, o); }).join('');

    var timer;
    form.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(calc, 150); });
    form.addEventListener('change', function (e) {
      if (e.target.hasAttribute('data-shape')) {
        var row = e.target.closest('[data-row]'), i = Array.prototype.indexOf.call(rows.children, row);
        row.outerHTML = rowHtml(i, { s: e.target.value });
      }
      calc();
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); calc(); });
    if (rows) root.querySelector('[data-add]').addEventListener('click', function () {
      rows.insertAdjacentHTML('beforeend', rowHtml(rows.querySelectorAll('[data-row]').length, {}));
      rows.lastElementChild.querySelector('input').focus();
    });
    root.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del && rows && rows.querySelectorAll('[data-row]').length > 1) {
        del.closest('[data-row]').remove();
        var all = readRowsRaw();
        rows.innerHTML = all.map(function (o, i) { return rowHtml(i, o); }).join('');
        calc();
      }
      var share = e.target.closest('[data-share]');
      if (share && navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { share.textContent = 'Link copied'; setTimeout(function () { share.textContent = 'Copy link to this result'; }, 2000); });
    });
    // Raw values (including blanks) so renumbering rows after a delete keeps what was typed.
    function readRowsRaw() {
      return Array.prototype.map.call(rows.querySelectorAll('[data-row]'), function (r) {
        var o = { s: r.querySelector('[data-shape]') ? r.querySelector('[data-shape]').value : '' };
        Array.prototype.forEach.call(r.querySelectorAll('[data-k]'), function (i) { o[i.getAttribute('data-k')] = i.value; });
        return o;
      });
    }
    calc();
  }

  for (var i = 0; i < roots.length; i++) setup(roots[i], JSON.parse(roots[i].getAttribute('data-config')));
})();
