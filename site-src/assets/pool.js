/* Pool volume, salt and shock calculators: tools.homegardenlot.com
   Shape factors, product strengths and targets arrive in data-config from the page build. */
(function () {
  'use strict';
  var roots = document.querySelectorAll('[data-hgt-pool]');
  if (!roots.length) return;

  function track(ev) {
    if (window.hgtGA4 && window.gtag) window.gtag('event', 'calc_result', ev);
    else if (window.dataLayer) window.dataLayer.push(Object.assign({ event: 'calc_result' }, ev));
  }
  function num(v) { var n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) && n >= 0 ? n : 0; }
  function fmt(n, d) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function stat(cls, name, value, hint) {
    return '<div class="hgt-stat' + (cls ? ' ' + cls : '') + '"><span class="hgt-stat__label">' + name +
      '</span><span class="hgt-stat__value">' + value + '</span>' + (hint ? '<span class="hgt-stat__hint">' + hint + '</span>' : '') + '</div>';
  }
  function readHash() {
    var o = {};
    location.hash.replace(/^#/, '').split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) o[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ''); });
    return o;
  }
  // Pounds below 2 lb read better in ounces; liquids in gallons, or fluid ounces under a quart.
  function weight(lb) { return lb < 2 ? fmt(lb * 16, 1) + ' oz' : fmt(lb, 1) + ' lb'; }
  function liquid(gal) { return gal < 0.25 ? fmt(gal * 128, 0) + ' fl oz' : fmt(gal, 2) + ' gal'; }

  var FIELDS = ['shape', 'len', 'wid', 'dia', 'ka', 'kb', 'shallow', 'deep', 'known', 'gpm', 'cur', 'target', 'bag', 'product', 'mode', 'raise', 'fc', 'cya'];

  function setup(root, cfg) {
    var kind = root.getAttribute('data-hgt-pool');
    var form = root.querySelector('form'), out = root.querySelector('[data-out]');
    var f = function (n) { return form.elements[n]; };
    var has = function (n) { return !!form.elements[n]; };
    var embed = root.hasAttribute('data-embed');

    function sync() {
      var sh = f('shape').value;
      Array.prototype.forEach.call(root.querySelectorAll('[data-for]'), function (el) {
        el.hidden = el.getAttribute('data-for').split(' ').indexOf(sh) < 0;
      });
      if (has('mode')) Array.prototype.forEach.call(root.querySelectorAll('[data-mode]'), function (el) {
        el.hidden = el.getAttribute('data-mode') !== f('mode').value;
      });
    }

    function volume() {
      var sh = f('shape').value;
      if (sh === 'known') return { gal: num(f('known').value), how: 'Entered: ' + fmt(num(f('known').value)) + ' gallons.' };
      var d1 = num(f('shallow').value), d2 = num(f('deep').value) || d1, avg = (d1 + d2) / 2;
      var g = 0, how = '';
      var avgTxt = d2 !== d1 ? 'average depth (' + d1 + ' + ' + d2 + ') ÷ 2 = ' + fmt(avg, 2) + ' ft' : 'depth ' + fmt(avg, 2) + ' ft';
      if (sh === 'rect') { g = num(f('len').value) * num(f('wid').value) * avg * cfg.galPerCuft; how = f('len').value + ' × ' + f('wid').value + ' ft × ' + avgTxt + ' × ' + cfg.galPerCuft + ' gal per cu ft'; }
      if (sh === 'round') { g = Math.pow(num(f('dia').value), 2) * avg * cfg.round; how = f('dia').value + '² ft × ' + avgTxt + ' × ' + cfg.round; }
      if (sh === 'oval') { g = num(f('len').value) * num(f('wid').value) * avg * cfg.round; how = f('len').value + ' × ' + f('wid').value + ' ft × ' + avgTxt + ' × ' + cfg.round; }
      if (sh === 'kidney') { g = (num(f('ka').value) + num(f('kb').value)) * num(f('len').value) * avg * cfg.kidney; how = '(' + f('ka').value + ' + ' + f('kb').value + ') × ' + f('len').value + ' ft × ' + avgTxt + ' × ' + cfg.kidney; }
      return { gal: g, how: how + ' = ' + fmt(g) + ' gallons.' };
    }

    function calc() {
      var v = volume();
      if (!v.gal) { out.hidden = true; return; }
      var gal = v.gal, html = '', s = '', math = ['<li>Volume: ' + v.how + '</li>'];

      if (kind === 'volume') {
        var gpm = num(f('gpm').value) || cfg.hoseGpm, hours = gal / gpm / 60;
        html += '<h2 class="hgt-frost__head">Your pool holds about ' + fmt(gal) + ' gallons</h2>';
        s += stat('hgt-stat--frost', 'Gallons', fmt(gal), fmt(gal * cfg.litersPerGal) + ' liters');
        s += stat('', 'Cubic feet', fmt(gal / cfg.galPerCuft), fmt(gal / cfg.galPerCuft / 35.315, 1) + ' cubic meters');
        s += stat('', 'Fill time', fmt(hours, 1) + ' hours', 'At ' + gpm + ' gallons per minute (garden hose ≈ ' + cfg.hoseGpm + ')');
        s += stat('', 'Salt to start a salt pool', fmt(gal * 8.34 * cfg.saltTarget / 1e6) + ' lb', 'From 0 to ' + fmt(cfg.saltTarget) + ' ppm');
        s += stat('', 'Shock dose (+10 ppm)', weight(gal * 8.34 * 10 / 1e6 / 0.65), 'Cal-hypo 65%, or ' + liquid(gal * 10 / 125000) + ' of 12.5% liquid');
        math.push('<li>Fill time: ' + fmt(gal) + ' gal ÷ ' + gpm + ' gal/min ÷ 60 = ' + fmt(hours, 1) + ' hours.</li>');
      }

      if (kind === 'salt') {
        var cur = num(f('cur').value), tgt = num(f('target').value) || cfg.saltTarget, bag = num(f('bag').value) || 40;
        if (tgt > cur) {
          var lb = gal * 8.34 * (tgt - cur) / 1e6, bags = Math.ceil(lb / bag);
          html += '<h2 class="hgt-frost__head">Add about ' + fmt(lb) + ' lb of pool salt</h2>';
          s += stat('hgt-stat--frost', 'Salt to add', fmt(lb) + ' lb', 'Raises ' + fmt(gal) + ' gal from ' + fmt(cur) + ' to ' + fmt(tgt) + ' ppm');
          s += stat('', bag + ' lb bags', String(bags), 'Add about ¾ now, retest after 24 h, then top up');
          s += stat('', 'Per 1,000 gallons', fmt(8.34 * (tgt - cur) / 1000, 1) + ' lb', 'For this ' + fmt(tgt - cur) + ' ppm increase');
          math.push('<li>Salt: ' + fmt(gal) + ' gal × 8.34 lb per gallon × (' + fmt(tgt) + ' − ' + fmt(cur) + ') ppm ÷ 1,000,000 = ' + fmt(lb, 1) + ' lb.</li>');
          track({ calc: 'pool_salt', lb: Math.round(lb) });
        } else {
          var drain = (1 - tgt / cur) * 100;
          html += '<h2 class="hgt-frost__head">Salt is already at or above target</h2>';
          s += stat('hgt-stat--frost', 'Salt to add', '0 lb', 'Salt only leaves by draining or splash-out');
          if (drain > 0) s += stat('', 'Drain and refill', fmt(drain) + '%', 'About ' + fmt(gal * drain / 100) + ' gal to reach ' + fmt(tgt) + ' ppm');
          math.push('<li>Dilution: 1 − ' + fmt(tgt) + ' ÷ ' + fmt(cur) + ' = ' + fmt(drain, 1) + '% of the water.</li>');
        }
      }

      if (kind === 'shock') {
        var p = cfg.products[f('product').value];
        var raise;
        if (f('mode').value === 'slam') {
          var cya = num(f('cya').value), fc = num(f('fc').value), target = cya * cfg.slamRatio;
          raise = Math.max(0, target - fc);
          math.push('<li>Shock level: CYA ' + fmt(cya) + ' × ' + cfg.slamRatio + ' = ' + fmt(target, 1) + ' ppm free chlorine; minus current ' + fmt(fc, 1) + ' = raise by ' + fmt(raise, 1) + ' ppm.</li>');
        } else raise = num(f('raise').value);
        if (!raise) { out.innerHTML = '<p class="hgt-note">Free chlorine is already at the shock level for that CYA. Hold it there and retest every few hours.</p>'; out.hidden = false; return; }
        var amount = p.liquid ? gal * raise / (p.strength * 10000) : gal * 8.34 * raise / (1e6 * p.strength / 100);
        html += '<h2 class="hgt-frost__head">Add ' + (p.liquid ? liquid(amount) : weight(amount)) + ' of ' + p.name.toLowerCase() + '</h2>';
        s += stat('hgt-stat--frost', 'Dose', p.liquid ? liquid(amount) : weight(amount), 'Raises free chlorine by ' + fmt(raise, 1) + ' ppm in ' + fmt(gal) + ' gal');
        if (!p.liquid && p.bagLb) s += stat('', p.bagLb + ' lb bags', String(Math.ceil(amount / p.bagLb)), 'Rounded up to whole bags');
        if (p.liquid) s += stat('', 'Jugs', String(Math.ceil(amount / p.jugGal)), p.jugGal + ' gal jugs');
        if (p.cya) s += stat('', 'Adds CYA', '+' + fmt(raise * p.cya, 1) + ' ppm', 'Dichlor raises stabilizer with every dose');
        if (p.ca) s += stat('', 'Adds calcium', '+' + fmt(raise * p.ca, 1) + ' ppm', 'Cal-hypo raises calcium hardness');
        math.push('<li>Dose: ' + (p.liquid
          ? fmt(gal) + ' gal × ' + fmt(raise, 1) + ' ppm ÷ (' + p.strength + '% × 10,000) = ' + fmt(amount, 2) + ' gal.'
          : fmt(gal) + ' gal × 8.34 × ' + fmt(raise, 1) + ' ppm ÷ (1,000,000 × ' + p.strength + '%) = ' + fmt(amount, 2) + ' lb.') + '</li>');
        track({ calc: 'pool_shock', product: f('product').value });
      }

      if (kind === 'volume') track({ calc: 'pool_volume', gallons: Math.round(gal / 1000) * 1000 });
      html += '<div class="hgt-frost__stats">' + s + '</div>';
      html += '<details class="hgt-calc__math"' + (embed ? '' : ' open') + '><summary>Show the math</summary><ul>' + math.join('') + '</ul></details>';
      if (!embed) html += '<div class="hgt-frost__actions"><button class="hgt-btn hgt-btn--ghost" type="button" data-share>Copy link to this result</button></div>';
      out.innerHTML = html;
      out.hidden = false;
      if (history.replaceState && window.self === window.top) {
        history.replaceState(null, '', '#' + FIELDS.filter(has).map(function (k) { return k + '=' + encodeURIComponent(f(k).value); }).join('&'));
      }
    }

    var h = readHash();
    FIELDS.forEach(function (k) { if (h[k] !== undefined && has(k)) f(k).value = h[k]; });
    sync();
    var timer;
    form.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(calc, 150); });
    form.addEventListener('change', function () { sync(); calc(); });
    form.addEventListener('submit', function (e) { e.preventDefault(); calc(); });
    root.addEventListener('click', function (e) {
      var share = e.target.closest('[data-share]');
      if (share && navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { share.textContent = 'Link copied'; setTimeout(function () { share.textContent = 'Copy link to this result'; }, 2000); });
    });
    calc();
  }

  for (var i = 0; i < roots.length; i++) setup(roots[i], JSON.parse(roots[i].getAttribute('data-config')));
})();
