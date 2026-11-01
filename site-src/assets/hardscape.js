/* Gravel (single layer or driveway layers) and paver calculators: tools.homegardenlot.com
   Materials, densities, paver sizes and base rules arrive in data-config from the page build. */
(function () {
  'use strict';
  var roots = document.querySelectorAll('[data-hgt-hard]');
  if (!roots.length) return;

  var SHAPES = { r: ['Rectangle', 'Length (ft)', 'Width (ft)'], c: ['Circle', 'Diameter (ft)', ''], t: ['Triangle', 'Base (ft)', 'Height (ft)'], s: ['Known area', 'Square feet', ''] };

  function track(ev) {
    if (window.hgtGA4 && window.gtag) window.gtag('event', 'calc_result', ev);
    else if (window.dataLayer) window.dataLayer.push(Object.assign({ event: 'calc_result' }, ev));
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { var n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) && n > 0 ? n : 0; }
  function fmt(n, d) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function up1(n) { return Math.ceil(n * 10 - 1e-9) / 10; }
  function money(n) { return '$' + fmt(n, n < 100 ? 2 : 0); }
  function stat(cls, name, value, hint) {
    return '<div class="hgt-stat' + (cls ? ' ' + cls : '') + '"><span class="hgt-stat__label">' + name +
      '</span><span class="hgt-stat__value">' + value + '</span>' + (hint ? '<span class="hgt-stat__hint">' + hint + '</span>' : '') + '</div>';
  }
  function geo(shape, a, b) {
    if (shape === 'c') return { sq: Math.PI * a * a / 4, per: Math.PI * a };
    if (shape === 't') return { sq: a * b / 2, per: a + b + Math.sqrt(a * a + b * b) };
    if (shape === 's') return { sq: a, per: 4 * Math.sqrt(a) };
    return { sq: a * b, per: 2 * (a + b) };
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
      var shape = r.querySelector('[data-shape]').value, a = num(r.querySelector('[data-a]').value), b = num(r.querySelector('[data-b]').value);
      var g = geo(shape, a, b);
      if (g.sq) out.push({ shape: shape, a: a, b: b, sq: g.sq, per: g.per });
    });
    return out;
  }
  function describe(r) {
    if (r.shape === 'c') return 'circle ' + r.a + ' ft across = ' + fmt(r.sq) + ' sq ft';
    if (r.shape === 't') return 'triangle ' + r.a + ' × ' + r.b + ' ÷ 2 = ' + fmt(r.sq) + ' sq ft';
    if (r.shape === 's') return fmt(r.sq) + ' sq ft';
    return r.a + ' × ' + r.b + ' ft = ' + fmt(r.sq) + ' sq ft';
  }
  function readHash() {
    var o = {};
    location.hash.replace(/^#/, '').split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) o[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ''); });
    return o;
  }
  function encRows(rows) { return rows.map(function (r) { return r.shape + ':' + r.a + (SHAPES[r.shape][2] ? 'x' + r.b : ''); }).join(','); }
  function decRows(s) {
    return (s || '').split(',').map(function (p) { var m = /^([rcts]):([\d.]+)(?:x([\d.]+))?$/.exec(p); return m ? [m[1], m[2], m[3] || ''] : null; }).filter(Boolean);
  }

  function setup(root, cfg) {
    var kind = root.getAttribute('data-hgt-hard');
    var form = root.querySelector('form'), out = root.querySelector('[data-out]'), rows = root.querySelector('[data-rows]');
    var f = function (n) { return form.elements[n]; };
    var has = function (n) { return !!form.elements[n]; };
    var embed = root.hasAttribute('data-embed');
    var KEYS = ['mat', 'depth', 'unit', 'm1', 'd1', 'm2', 'd2', 'm3', 'd3', 'size', 'pl', 'pw', 'pattern', 'base', 'per'];

    function layerCalc(sqft, mat, depthIn) {
      var m = cfg.materials[mat];
      var cuft = sqft * depthIn / 12 * (1 + (m.compact || 0));
      return { m: m, cuft: cuft, yd: cuft / 27, tons: cuft / 27 * m.tpy };
    }

    function calc() {
      var list = readRows(root);
      var sqft = list.reduce(function (a, r) { return a + r.sq; }, 0);
      var perim = list.reduce(function (a, r) { return a + r.per; }, 0);
      if (!sqft) { out.hidden = true; return; }
      var html = '', s = '', math = ['<li>Area: ' + list.map(describe).join('; ') + (list.length > 1 ? '; total ' + fmt(sqft) + ' sq ft' : '') + '.</li>'], cost = 0;
      var priceUnit = has('unit') ? f('unit').value : 'ton';
      var price = has('price') ? num(f('price').value) : 0;

      if (kind === 'gravel') {
        var L = layerCalc(sqft, f('mat').value, num(f('depth').value));
        var bags = Math.ceil(L.cuft / cfg.bagCuft);
        cost = price * (priceUnit === 'ton' ? L.tons : L.yd);
        html += '<h2 class="hgt-frost__head">You need about ' + fmt(up1(L.yd), 1) + ' cubic yards (' + fmt(up1(L.tons), 1) + ' tons) of ' + esc(L.m.short) + '</h2>';
        s += stat('hgt-stat--frost', 'Cubic yards', fmt(up1(L.yd), 1), fmt(L.cuft, 1) + ' cu ft');
        s += stat('hgt-stat--frost', 'Tons', fmt(up1(L.tons), 1), '≈ ' + L.m.tpy + ' tons per cu yd for ' + esc(L.m.short));
        s += stat('', 'Bags', fmt(bags), cfg.bagCuft + ' cu ft bags, about ' + Math.round(cfg.bagCuft * 27 * L.m.tpy * 2000 / 27) + ' lb each');
        s += stat('', 'Coverage', fmt(sqft / L.yd) + ' sq ft per cu yd', 'At ' + f('depth').value + ' in deep');
        if (cost) s += stat('hgt-stat--frost', 'Estimated cost', money(cost), money(price) + ' per ' + priceUnit + ', before delivery');
        math.push('<li>Volume: ' + fmt(sqft) + ' sq ft × ' + f('depth').value + ' in ÷ 12' + (L.m.compact ? ' × ' + (1 + L.m.compact) + ' for compaction' : '') + ' = ' + fmt(L.cuft, 1) + ' cu ft ÷ 27 = ' + fmt(L.yd, 2) + ' cu yd.</li>');
        math.push('<li>Weight: ' + fmt(L.yd, 2) + ' cu yd × ' + L.m.tpy + ' tons per cu yd = ' + fmt(L.tons, 2) + ' tons.</li>');
        track({ calc: 'gravel', mat: f('mat').value });
      }

      if (kind === 'driveway') {
        var layers = [1, 2, 3].map(function (i) { return { i: i, mat: f('m' + i).value, d: num(f('d' + i).value) }; }).filter(function (l) { return l.d; });
        var tot = { yd: 0, tons: 0 };
        html += '<h2 class="hgt-frost__head">Order about ' + '__T__' + ' tons of stone for ' + fmt(sqft) + ' sq ft of driveway</h2>';
        layers.forEach(function (l, k) {
          var r = layerCalc(sqft, l.mat, l.d);
          tot.yd += r.yd; tot.tons += r.tons;
          cost += price * (priceUnit === 'ton' ? r.tons : r.yd);
          s += stat(k === 0 ? 'hgt-stat--frost' : '', ['Base', 'Middle', 'Top'][l.i - 1] + ': ' + esc(r.m.short), fmt(up1(r.tons), 1) + ' tons', fmt(up1(r.yd), 1) + ' cu yd at ' + l.d + ' in');
          math.push('<li>' + ['Base', 'Middle', 'Top'][l.i - 1] + ': ' + fmt(sqft) + ' sq ft × ' + l.d + ' in ÷ 12' + (r.m.compact ? ' × ' + (1 + r.m.compact) : '') + ' ÷ 27 = ' + fmt(r.yd, 2) + ' cu yd × ' + r.m.tpy + ' = ' + fmt(r.tons, 2) + ' tons.</li>');
        });
        html = html.replace('__T__', fmt(up1(tot.tons), 1));
        s += stat('hgt-stat--frost', 'Total', fmt(up1(tot.tons), 1) + ' tons', fmt(up1(tot.yd), 1) + ' cu yd · ' + layers.reduce(function (a, l) { return a + l.d; }, 0) + ' in deep');
        s += stat('', 'Fabric underneath', fmt(Math.ceil(sqft * 1.1)) + ' sq ft', 'Woven geotextile, 10% for overlaps');
        if (cost) s += stat('hgt-stat--frost', 'Estimated cost', money(cost), money(price) + ' per ' + priceUnit + ', before delivery');
        track({ calc: 'driveway', tons: Math.round(tot.tons) });
      }

      if (kind === 'paver') {
        var size = f('size').value, pz = cfg.pavers[size] || { l: num(f('pl').value), w: num(f('pw').value) };
        if (!pz.l || !pz.w) { out.hidden = true; return; }
        var waste = cfg.patterns[f('pattern').value].waste;
        var each = pz.l * pz.w / 144, net = Math.ceil(sqft / each), order = Math.ceil(net * (1 + waste));
        var edge = num(f('per').value) || perim;
        var baseIn = num(f('base').value) || cfg.baseIn;
        var baseSq = sqft + edge * cfg.baseOverhang / 12;
        var baseCuft = baseSq * baseIn / 12 * (1 + cfg.compact), baseYd = baseCuft / 27, baseTons = baseYd * cfg.baseTpy;
        var sandCuft = sqft * cfg.sandIn / 12, sandYd = sandCuft / 27, sandBags = Math.ceil(sandCuft / cfg.bagCuft);
        var polyLo = Math.ceil(sqft / cfg.polyMax), polyHi = Math.ceil(sqft / cfg.polyMin);
        var restraint = Math.ceil(edge / cfg.restraintFt);
        cost = order * num(f('pPaver').value) + baseTons * num(f('pBase').value) + sandBags * num(f('pSand').value) + Math.ceil((polyLo + polyHi) / 2) * num(f('pPoly').value) + restraint * num(f('pEdge').value);
        html += '<h2 class="hgt-frost__head">You need about ' + fmt(order) + ' pavers</h2>';
        s += stat('hgt-stat--frost', 'Pavers', fmt(order), fmt(net) + ' + ' + Math.round(waste * 100) + '% for a ' + cfg.patterns[f('pattern').value].name.toLowerCase() + ' pattern');
        s += stat('', 'Paver base', fmt(up1(baseTons), 1) + ' tons', fmt(up1(baseYd), 1) + ' cu yd for ' + baseIn + ' in compacted');
        s += stat('', 'Bedding sand', sandBags + ' bags', fmt(up1(sandYd), 1) + ' cu yd, ' + cfg.sandIn + ' in screeded');
        s += stat('', 'Polymeric sand', polyLo === polyHi ? String(polyLo) : polyLo + '–' + polyHi + ' bags', '50 lb bags; depends on joint width');
        s += stat('', 'Edge restraint', fmt(restraint) + ' × ' + cfg.restraintFt + ' ft', fmt(edge) + ' ft of edges, ~' + fmt(Math.ceil(edge)) + ' spikes');
        if (cost) s += stat('hgt-stat--frost', 'Estimated materials', money(cost), 'Edit prices below');
        math.push('<li>Pavers: ' + pz.l + ' × ' + pz.w + ' in = ' + fmt(each, 3) + ' sq ft each; ' + fmt(sqft) + ' ÷ ' + fmt(each, 3) + ' = ' + fmt(net) + ', plus ' + Math.round(waste * 100) + '% = ' + fmt(order) + '.</li>');
        math.push('<li>Base: (' + fmt(sqft) + ' sq ft + ' + fmt(edge) + ' ft of edge × ' + cfg.baseOverhang + ' in overhang) × ' + baseIn + ' in × ' + (1 + cfg.compact) + ' for compaction ÷ 12 ÷ 27 = ' + fmt(baseYd, 2) + ' cu yd × ' + cfg.baseTpy + ' = ' + fmt(baseTons, 2) + ' tons.</li>');
        math.push('<li>Sand: ' + fmt(sqft) + ' sq ft × ' + cfg.sandIn + ' in ÷ 12 = ' + fmt(sandCuft, 1) + ' cu ft = ' + sandBags + ' bags of ' + cfg.bagCuft + ' cu ft.</li>');
        math.push('<li>Polymeric sand: ' + fmt(sqft) + ' sq ft ÷ ' + cfg.polyMax + '–' + cfg.polyMin + ' sq ft per bag.</li>');
        track({ calc: 'paver', pavers: order });
      }

      html += '<div class="hgt-frost__stats">' + s + '</div>';
      html += '<details class="hgt-calc__math"' + (embed ? '' : ' open') + '><summary>Show the math</summary><ul>' + math.join('') + '</ul></details>';
      if (!embed) html += '<div class="hgt-frost__actions"><button class="hgt-btn" type="button" data-print>Print shopping list</button><button class="hgt-btn hgt-btn--ghost" type="button" data-share>Copy link to this result</button></div>';
      out.innerHTML = html;
      out.hidden = false;
      if (history.replaceState && window.self === window.top) {
        history.replaceState(null, '', '#a=' + encodeURIComponent(encRows(list)) + KEYS.filter(has).map(function (k) { return '&' + k + '=' + encodeURIComponent(f(k).value); }).join(''));
      }
    }

    function sync() {
      if (has('size')) root.querySelector('[data-custom]').hidden = f('size').value !== 'custom';
    }

    var h = readHash();
    KEYS.forEach(function (k) { if (h[k] !== undefined && has(k)) f(k).value = h[k]; });
    var list = decRows(h.a);
    if (!list.length) list = [['r', cfg.defaultL, cfg.defaultW]];
    rows.innerHTML = list.map(function (r, i) { return rowHtml(i, r[0], r[1], r[2]); }).join('');
    sync();
    var timer;
    form.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(calc, 150); });
    form.addEventListener('change', function (e) {
      if (e.target.hasAttribute('data-shape')) {
        var row = e.target.closest('[data-row]'), sh = SHAPES[e.target.value];
        row.querySelector('[data-la]').textContent = sh[1];
        row.querySelector('[data-b]').parentNode.hidden = !sh[2];
        row.querySelector('[data-lb]').textContent = sh[2] || '';
      }
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
        Array.prototype.forEach.call(rows.querySelectorAll('[data-row]'), function (r, i) { r.querySelector('label span').textContent = 'Area ' + (i + 1); });
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
