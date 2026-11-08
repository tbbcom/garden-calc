/* Topsoil, sand and polymeric sand calculators: tools.homegardenlot.com
   Volume from measured areas and depth, plus settling; tons from bulk density; polymeric sand from the
   joint volume of the paver grid. Densities, presets and bag sizes arrive in data-config. */
(function () {
  'use strict';
  var roots = document.querySelectorAll('[data-hgt-fill]');
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

  function setup(root, cfg) {
    var kind = root.getAttribute('data-hgt-fill');
    var form = root.querySelector('form'), out = root.querySelector('[data-out]'), rows = root.querySelector('[data-rows]');
    var f = function (n) { return form.elements[n]; };
    var embed = root.hasAttribute('data-embed');
    var hashRows = null;

    function rowHtml(i, v) {
      v = v || {};
      var sh = v.sh || 'r';
      return '<div class="hgt-calc__row hgt-calc__row--m" data-row>' +
        '<label><span>Area ' + (i + 1) + '</span><select data-k="sh"><option value="r"' + (sh === 'r' ? ' selected' : '') + '>Rectangle</option><option value="c"' + (sh === 'c' ? ' selected' : '') + '>Circle</option></select></label>' +
        '<label><span>' + (sh === 'c' ? 'Diameter' : 'Length') + ' (ft)</span><input type="number" inputmode="decimal" min="0" step="0.5" data-k="a" value="' + esc(v.a !== undefined ? v.a : (i ? '' : cfg.defaultL)) + '"></label>' +
        '<label' + (sh === 'c' ? ' hidden' : '') + '><span>Width (ft)</span><input type="number" inputmode="decimal" min="0" step="0.5" data-k="b" value="' + esc(v.b !== undefined ? v.b : (i ? '' : cfg.defaultW)) + '"></label>' +
        '<button type="button" class="hgt-calc__del" data-del aria-label="Remove area ' + (i + 1) + '">×</button></div>';
    }
    function raw() {
      return Array.prototype.map.call(rows.querySelectorAll('[data-row]'), function (r) {
        var o = {};
        Array.prototype.forEach.call(r.querySelectorAll('[data-k]'), function (i) { o[i.getAttribute('data-k')] = i.value; });
        return o;
      });
    }
    function rowArea(r) { return r.sh === 'c' ? Math.PI * Math.pow(num(r.a) / 2, 2) : num(r.a) * num(r.b); }
    function renumber() {
      Array.prototype.forEach.call(rows.querySelectorAll('[data-row]'), function (r, i) {
        r.querySelector('span').textContent = 'Area ' + (i + 1);
        r.querySelector('[data-del]').setAttribute('aria-label', 'Remove area ' + (i + 1));
      });
    }

    function finish(html, ev) {
      if (!embed) html += '<div class="hgt-frost__actions"><button class="hgt-btn hgt-btn--ghost" type="button" data-share>Copy link to this result</button></div>';
      out.innerHTML = html;
      out.hidden = false;
      if (history.replaceState && window.self === window.top) {
        var keys = Array.prototype.map.call(form.elements, function (e) { return e.name; }).filter(function (k) { return k && !/^p[A-Z]/.test(k); });
        var h = keys.filter(function (k, i) { return keys.indexOf(k) === i; }).map(function (k) { return k + '=' + encodeURIComponent(f(k).value); });
        h.push('rows=' + encodeURIComponent(raw().map(function (r) { return [r.sh, r.a, r.b].join(','); }).join(';')));
        history.replaceState(null, '', '#' + h.join('&'));
      }
      track(ev);
    }

    // ---- topsoil and sand: area × depth + settling ----
    function calcBulk(areas, sqft) {
      var depth = num(f('depth').value), extra = num(f('extra').value) / 100, m = cfg.materials[f('mat').value];
      if (!depth) { out.hidden = true; return; }
      var cuft = sqft * depth / 12 * (1 + extra), yd = cuft / 27, tons = yd * m.tpy, lb = tons * 2000;
      var bag = num(f('bag').value), bags = bag ? up(cuft / bag) : 0;
      var order = Math.ceil(yd * 2 - 1e-9) / 2;
      var html = '<h2 class="hgt-frost__head">' + fmt(yd, 2) + ' cubic yards of ' + m.short + ' (' + fmt(tons, 1) + ' tons)</h2>';
      var s = stat('hgt-stat--frost', 'Cubic yards', fmt(yd, 2), 'Order ' + fmt(order, 1) + ' yd in bulk');
      s += stat('hgt-stat--frost', 'Weight', fmt(tons, 2) + ' tons', fmt(lb) + ' lb at ' + m.tpy + ' tons per yd (' + m.note + ')');
      s += stat('', 'Cubic feet', fmt(cuft, 1), fmt(sqft) + ' sq ft × ' + fmt(depth, 2) + ' in deep' + (extra ? ' + ' + Math.round(extra * 100) + '% settling' : ''));
      if (bags) s += stat('', 'Bags', fmt(bags), cfg.bagName(bag));
      s += stat('', 'Pickup loads', fmt(up(lb / cfg.pickupLb)), 'Half-ton pickup, about ' + fmt(cfg.pickupLb) + ' lb per load');
      var bulk = order * num(f('pYd').value) + (order ? num(f('pDel').value) : 0), bagCost = bags * num(f('pBag').value);
      if (bulk) s += stat(bulk <= bagCost || !bagCost ? 'hgt-stat--frost' : '', 'Bulk delivered', money(bulk), fmt(order, 1) + ' yd × ' + money(num(f('pYd').value)) + ' + delivery');
      if (bagCost) s += stat(bagCost < bulk ? 'hgt-stat--frost' : '', 'Bagged', money(bagCost), fmt(bags) + ' bags × ' + money(num(f('pBag').value)));
      html += '<div class="hgt-frost__stats">' + s + '</div>';
      var math = areas.map(function (r, i) { return '<li>Area ' + (i + 1) + ': ' + (r.sh === 'c' ? 'π × (' + fmt(num(r.a), 1) + ' ÷ 2)²' : fmt(num(r.a), 1) + ' × ' + fmt(num(r.b), 1)) + ' = ' + fmt(rowArea(r), 1) + ' sq ft.</li>'; });
      math.push('<li>Volume = ' + fmt(sqft, 1) + ' sq ft × ' + fmt(depth, 2) + ' in ÷ 12' + (extra ? ' × ' + fmt(1 + extra, 2) : '') + ' = ' + fmt(cuft, 1) + ' cu ft ÷ 27 = ' + fmt(yd, 2) + ' cu yd.</li>');
      math.push('<li>Weight = ' + fmt(yd, 2) + ' × ' + m.tpy + ' = ' + fmt(tons, 2) + ' tons. Wet material weighs more.</li>');
      html += '<details class="hgt-calc__math"' + (embed ? '' : ' open') + '><summary>Show the math</summary><ul>' + math.join('') + '</ul></details>';
      var use = cfg.uses[f('use').value];
      if (use && use.tip) html += '<p class="hgt-note">' + use.tip + '</p>';
      finish(html, { calc: kind, yd: Math.round(yd * 10) / 10 });
    }

    // ---- polymeric sand: joint volume of a paver grid ----
    function calcPoly(sqft) {
      var L = num(f('pl').value), W = num(f('pw').value), j = num(f('joint').value), d = num(f('jd').value), bagLb = num(f('bag').value) || 50;
      if (!L || !W || !j || !d) { out.hidden = true; return; }
      var cell = (L + j) * (W + j), share = (cell - L * W) / cell;
      var lbPerSqft = share * 144 * d / 1728 * cfg.density, lb = lbPerSqft * sqft * (1 + cfg.waste);
      var bags = up(lb / bagLb), cover = bagLb / lbPerSqft;
      var html = '<h2 class="hgt-frost__head">' + fmt(bags) + (bags === 1 ? ' bag' : ' bags') + ' of polymeric sand (' + fmt(bagLb) + ' lb)</h2>';
      var s = stat('hgt-stat--frost', 'Bags', fmt(bags), fmt(lb) + ' lb including ' + Math.round(cfg.waste * 100) + '% waste');
      s += stat('hgt-stat--frost', 'Coverage per bag', fmt(cover) + ' sq ft', fmt(L, 2) + ' × ' + fmt(W, 2) + ' in pavers, ' + cfg.jointName(j) + ' joints');
      s += stat('', 'Joint share', fmt(share * 100, 1) + '%', 'Of the surface that is joint');
      s += stat('', 'Patio area', fmt(sqft) + ' sq ft', fmt(d, 2) + ' in deep joints');
      var price = num(f('pBag').value);
      if (price) s += stat('', 'Cost', money(bags * price), money(price) + ' per bag');
      html += '<div class="hgt-frost__stats">' + s + '</div>';
      var math = ['<li>Each paver plus its joint covers (' + fmt(L, 2) + ' + ' + fmt(j, 3) + ') × (' + fmt(W, 2) + ' + ' + fmt(j, 3) + ') = ' + fmt(cell, 2) + ' in²; the joint is ' + fmt(cell - L * W, 2) + ' in² of it (' + fmt(share * 100, 2) + '%).</li>',
        '<li>Joint volume per sq ft = 144 × ' + fmt(share, 4) + ' × ' + fmt(d, 2) + ' in = ' + fmt(share * 144 * d, 2) + ' in³ = ' + fmt(share * 144 * d / 1728, 4) + ' cu ft.</li>',
        '<li>× ' + cfg.density + ' lb per cu ft = ' + fmt(lbPerSqft, 3) + ' lb per sq ft; × ' + fmt(sqft) + ' sq ft × ' + fmt(1 + cfg.waste, 2) + ' = ' + fmt(lb, 1) + ' lb.</li>'];
      html += '<details class="hgt-calc__math"' + (embed ? '' : ' open') + '><summary>Show the math</summary><ul>' + math.join('') + '</ul></details>';
      if (j > cfg.wideJoint) html += '<p class="hgt-note">Joints wider than ' + cfg.jointName(cfg.wideJoint) + ' need a wide-joint polymeric sand or stone dust; check the bag\'s joint-width range.</p>';
      finish(html, { calc: 'polymeric_sand', bags: bags });
    }

    function calc() {
      var areas = raw().filter(function (r) { return rowArea(r) > 0; });
      var sqft = areas.reduce(function (t, r) { return t + rowArea(r); }, 0);
      if (!sqft) { out.hidden = true; return; }
      if (kind === 'poly') calcPoly(sqft); else calcBulk(areas, sqft);
    }

    location.hash.replace(/^#/, '').split('&').forEach(function (kv) {
      var p = kv.split('='), k = decodeURIComponent(p[0] || ''), v = decodeURIComponent(p[1] || '');
      if (k === 'rows') { hashRows = v.split(';').map(function (r) { var x = r.split(','); return { sh: x[0], a: x[1], b: x[2] }; }); return; }
      var e = k && form.elements[k];
      if (e && !(!e.options && e.length)) e.value = v;
    });
    (hashRows || [null]).forEach(function (v, i) { rows.insertAdjacentHTML('beforeend', rowHtml(i, v)); });
    root.querySelector('[data-add]').addEventListener('click', function () { rows.insertAdjacentHTML('beforeend', rowHtml(rows.children.length, { a: '', b: '' })); rows.lastElementChild.querySelector('input').focus(); });
    rows.addEventListener('click', function (e) { if (e.target.closest('[data-del]') && rows.children.length > 1) { e.target.closest('[data-row]').remove(); renumber(); calc(); } });
    rows.addEventListener('change', function (e) {
      if (e.target.getAttribute('data-k') !== 'sh') return;
      var r = e.target.closest('[data-row]'), labels = r.querySelectorAll('label');
      labels[1].querySelector('span').textContent = (e.target.value === 'c' ? 'Diameter' : 'Length') + ' (ft)';
      labels[2].hidden = e.target.value === 'c';
    });
    var timer;
    form.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(calc, 150); });
    form.addEventListener('change', function (e) {
      // Presets fill in the depth or paver size; the fields stay editable.
      if (e.target.name === 'use' && cfg.uses[e.target.value]) f('depth').value = cfg.uses[e.target.value].depth;
      if (e.target.name === 'pv' && cfg.pavers[e.target.value]) { f('pl').value = cfg.pavers[e.target.value].l; f('pw').value = cfg.pavers[e.target.value].w; }
      calc();
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); calc(); });
    root.addEventListener('click', function (e) {
      var share = e.target.closest('[data-share]');
      if (share && navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { share.textContent = 'Link copied'; setTimeout(function () { share.textContent = 'Copy link to this result'; }, 2000); });
    });
    cfg.bagName = function (cuft) { var b = cfg.bags.filter(function (x) { return x[0] === cuft; })[0]; return b ? b[1] : fmt(cuft, 2) + ' cu ft bags'; };
    cfg.jointName = function (j) { var b = cfg.joints && cfg.joints.filter(function (x) { return x[0] === j; })[0]; return b ? b[1] : fmt(j, 3) + ' in'; };
    calc();
  }

  for (var i = 0; i < roots.length; i++) setup(roots[i], JSON.parse(roots[i].getAttribute('data-config')));
})();
