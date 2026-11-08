/* Lawn fertilizer calculator: tools.homegardenlot.com
   Product needed = target nutrient (lb per 1,000 sq ft) ÷ that nutrient's share of the product (N-P-K is % by weight).
   Grass types, yearly nitrogen ranges and timing arrive in data-config. */
(function () {
  'use strict';
  var roots = document.querySelectorAll('[data-hgt-fert]');
  if (!roots.length) return;

  function track(ev) {
    if (window.hgtGA4 && window.gtag) window.gtag('event', 'calc_result', ev);
    else if (window.dataLayer) window.dataLayer.push(Object.assign({ event: 'calc_result' }, ev));
  }
  function num(v) { var n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) && n >= 0 ? n : 0; }
  function fmt(n, d) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function money(n) { return '$' + fmt(n, n < 100 ? 2 : 0); }
  function up(n) { return Math.ceil(n - 1e-9); }
  function stat(cls, name, value, hint) {
    return '<div class="hgt-stat' + (cls ? ' ' + cls : '') + '"><span class="hgt-stat__label">' + name +
      '</span><span class="hgt-stat__value">' + value + '</span>' + (hint ? '<span class="hgt-stat__hint">' + hint + '</span>' : '') + '</div>';
  }

  function setup(root, cfg) {
    var form = root.querySelector('form'), out = root.querySelector('[data-out]');
    var f = function (n) { return form.elements[n]; };
    var embed = root.hasAttribute('data-embed');
    var NUT = { n: ['nitrogen', 'N'], p: ['phosphate', 'P₂O₅'], k: ['potash', 'K₂O'] };

    function showForm() {
      var v = f('form').value;
      Array.prototype.forEach.call(form.querySelectorAll('[data-show]'), function (l) { l.hidden = l.getAttribute('data-show') !== v; });
    }

    function calc() {
      var area = num(f('area').value), pct = { n: num(f('n').value), p: num(f('p').value), k: num(f('k').value) };
      var by = f('by').value, rate = num(f('rate').value), liquid = f('form').value === 'liquid', g = cfg.grasses[f('grass').value];
      if (!area || !rate) { out.hidden = true; return; }
      var html = '', s = '', math = [];
      if (!pct[by]) {
        out.innerHTML = '<p class="hgt-note">This product has no ' + NUT[by][0] + ' (' + NUT[by][1] + '). Enter a product with ' + NUT[by][1] + ' or target a different nutrient.</p>';
        out.hidden = false;
        return;
      }
      var per1k = rate / (pct[by] / 100), total = per1k * area / 1000;
      html = '<h2 class="hgt-frost__head">' + fmt(per1k, 2) + ' lb of ' + pct.n + '-' + pct.p + '-' + pct.k + ' per 1,000 sq ft</h2>';
      if (liquid) {
        var dens = num(f('dens').value) || 10, gal = total / dens, oz1k = per1k / dens * 128;
        s += stat('hgt-stat--frost', 'Per 1,000 sq ft', fmt(oz1k, 1) + ' fl oz', fmt(per1k, 2) + ' lb at ' + fmt(dens, 2) + ' lb per gallon');
        s += stat('hgt-stat--frost', 'Total product', fmt(gal, 2) + ' gal', fmt(total, 1) + ' lb for ' + fmt(area) + ' sq ft');
        var pg = num(f('pGal').value);
        if (pg) s += stat('', 'Cost', money(gal * pg), money(pg) + ' per gallon');
        math.push('<li>Liquid: ' + fmt(per1k, 3) + ' lb ÷ ' + fmt(dens, 2) + ' lb per gallon × 128 = ' + fmt(oz1k, 1) + ' fl oz per 1,000 sq ft.</li>');
      } else {
        var bag = num(f('bag').value), bags = bag ? up(total / bag) : 0;
        s += stat('hgt-stat--frost', 'Per 1,000 sq ft', fmt(per1k, 2) + ' lb', 'Of product, for ' + fmt(rate, 2) + ' lb of ' + NUT[by][1]);
        s += stat('hgt-stat--frost', 'Total product', fmt(total, 1) + ' lb', fmt(area) + ' sq ft' + (bags ? ' = ' + bags + ' × ' + fmt(bag, 1) + ' lb bag' + (bags > 1 ? 's' : '') : ''));
        if (bag) s += stat('', 'One bag covers', fmt(bag / per1k * 1000) + ' sq ft', 'At this rate');
        var pb = num(f('pBag').value);
        if (pb && bags) s += stat('', 'Cost', money(bags * pb), bags + ' × ' + money(pb));
      }
      var deliv = ['n', 'p', 'k'].filter(function (x) { return pct[x]; }).map(function (x) { return fmt(per1k * pct[x] / 100, 2) + ' lb ' + NUT[x][1]; });
      s += stat('', 'Nutrients per 1,000 sq ft', deliv.join(' · '), 'Total: ' + ['n', 'p', 'k'].filter(function (x) { return pct[x]; }).map(function (x) { return fmt(total * pct[x] / 100, 2) + ' lb ' + NUT[x][1]; }).join(', '));
      var nPer = per1k * pct.n / 100;
      if (g && nPer) {
        var mid = (g.lo + g.hi) / 2, apps = Math.max(1, Math.round(mid / nPer));
        s += stat('', g.name + ' needs', g.lo + '–' + g.hi + ' lb N per year', 'About ' + apps + ' feeding' + (apps > 1 ? 's' : '') + ' at this rate');
      }
      html += '<div class="hgt-frost__stats">' + s + '</div>';
      math.unshift('<li>Product per 1,000 sq ft = ' + fmt(rate, 2) + ' lb ' + NUT[by][1] + ' ÷ ' + pct[by] + '% = ' + fmt(per1k, 3) + ' lb.</li>',
        '<li>Total = ' + fmt(per1k, 3) + ' × ' + fmt(area) + ' ÷ 1,000 = ' + fmt(total, 2) + ' lb.</li>');
      html += '<details class="hgt-calc__math"' + (embed ? '' : ' open') + '><summary>Show the math</summary><ul>' + math.join('') + '</ul></details>';
      var notes = [];
      if (nPer > cfg.maxQuickN) notes.push('<strong>Burn risk:</strong> more than ' + cfg.maxQuickN + ' lb of nitrogen per 1,000 sq ft at once is only safe with slow-release products. Split it into two feedings.');
      if (g) notes.push('<strong>When to feed ' + g.name.toLowerCase() + ':</strong> ' + cfg.timing[g.season]);
      notes.push('Set your spreader from the bag\'s chart and sweep any granules off paving back onto the lawn. Local rules may limit phosphorus or set blackout dates; check your state before buying.');
      html += '<div class="hgt-note"><ul>' + notes.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul></div>';
      if (!embed) html += '<div class="hgt-frost__actions"><button class="hgt-btn hgt-btn--ghost" type="button" data-share>Copy link to this result</button></div>';
      out.innerHTML = html;
      out.hidden = false;
      if (history.replaceState && window.self === window.top) {
        history.replaceState(null, '', '#' + Array.prototype.map.call(form.elements, function (e) { return e.name; }).filter(function (k) { return k && !/^p[A-Z]/.test(k); })
          .map(function (k) { return k + '=' + encodeURIComponent(f(k).value); }).join('&'));
      }
      track({ calc: 'fertilizer', npk: pct.n + '-' + pct.p + '-' + pct.k });
    }

    location.hash.replace(/^#/, '').split('&').forEach(function (kv) {
      var p = kv.split('='), e = p[0] && form.elements[decodeURIComponent(p[0])];
      if (e && !(!e.options && e.length)) e.value = decodeURIComponent(p[1] || '');
    });
    showForm();
    var timer;
    form.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(calc, 150); });
    form.addEventListener('change', function (e) {
      if (e.target.name === 'form') showForm();
      if (e.target.name === 'npk' && e.target.value) { var v = e.target.value.split('-'); f('n').value = v[0]; f('p').value = v[1]; f('k').value = v[2]; }
      calc();
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); calc(); });
    root.addEventListener('click', function (e) {
      var share = e.target.closest('[data-share]');
      if (share && navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { share.textContent = 'Link copied'; setTimeout(function () { share.textContent = 'Copy link to this result'; }, 2000); });
    });
    calc();
  }

  for (var i = 0; i < roots.length; i++) setup(roots[i], JSON.parse(roots[i].getAttribute('data-config')));
})();
