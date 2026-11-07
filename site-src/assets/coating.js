/* Deck stain, fence stain and exterior house paint calculators: tools.homegardenlot.com
   Coverage by product and surface, and the surface allowances, arrive in data-config from the page build. */
(function () {
  'use strict';
  var roots = document.querySelectorAll('[data-hgt-coat]');
  if (!roots.length) return;

  function track(ev) {
    if (window.hgtGA4 && window.gtag) window.gtag('event', 'calc_result', ev);
    else if (window.dataLayer) window.dataLayer.push(Object.assign({ event: 'calc_result' }, ev));
  }
  function num(v) { var n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) && n >= 0 ? n : 0; }
  function fmt(n, d) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function money(n) { return '$' + fmt(n, n < 100 ? 2 : 0); }
  function stat(cls, name, value, hint) {
    return '<div class="hgt-stat' + (cls ? ' ' + cls : '') + '"><span class="hgt-stat__label">' + name +
      '</span><span class="hgt-stat__value">' + value + '</span>' + (hint ? '<span class="hgt-stat__hint">' + hint + '</span>' : '') + '</div>';
  }
  // Whole 5-gallon pails plus single gallons, preferring a pail once 4+ gallons would be left over.
  function cans(gal) {
    var g = Math.ceil(gal - 1e-9), pails = Math.floor(g / 5), rest = g - pails * 5;
    if (rest >= 4) { pails++; rest = 0; }
    return { pails: pails, gallons: rest, total: pails * 5 + rest };
  }

  function setup(root, cfg) {
    var kind = root.getAttribute('data-hgt-coat');
    var form = root.querySelector('form'), out = root.querySelector('[data-out]');
    var f = function (n) { return form.elements[n]; };
    var embed = root.hasAttribute('data-embed');

    function calc() {
      var p = cfg.products[f('product').value], rough = f('surface').value === 'rough', coats = num(f('coats').value) || 1;
      var parts = [], math = [];
      if (kind === 'deck') {
        var floor = num(f('len').value) * num(f('wid').value) * (1 + cfg.edges);
        parts.push(['Deck floor', floor, num(f('len').value) + ' × ' + num(f('wid').value) + ' ft + ' + Math.round(cfg.edges * 100) + '% for board edges']);
        var rail = num(f('rail').value) * num(f('railh').value) / 12 * cfg.railFactor;
        if (rail) parts.push(['Railings', rail, f('rail').value + ' ft × ' + f('railh').value + ' in high × ' + cfg.railFactor + ' (both sides of rails and balusters)']);
        var st = num(f('steps').value) * num(f('stepw').value) * cfg.stepSqftPerFt;
        if (st) parts.push(['Stairs', st, f('steps').value + ' steps × ' + f('stepw').value + ' ft wide × ' + cfg.stepSqftPerFt + ' sq ft per foot (tread, riser, stringers)']);
      }
      if (kind === 'fence') {
        var style = cfg.styles[f('style').value], sides = num(f('sides').value) || 1;
        var a = num(f('len').value) * num(f('height').value) * sides * style.factor;
        parts.push(['Fence', a, f('len').value + ' ft × ' + f('height').value + ' ft × ' + sides + ' side' + (sides > 1 ? 's' : '') + ' × ' + style.factor + ' (' + style.name.toLowerCase() + ')']);
      }
      if (kind === 'house') {
        var per = 2 * (num(f('len').value) + num(f('wid').value)), walls = per * num(f('wallh').value);
        var gables = num(f('gables').value) * num(f('gw').value) * num(f('gr').value) / 2;
        var open = num(f('doors').value) * cfg.door + num(f('windows').value) * cfg.window + num(f('garage').value) * cfg.garage;
        var body = Math.max(0, walls + gables - open);
        parts.push(['Siding', body, '2 × (' + f('len').value + ' + ' + f('wid').value + ') × ' + f('wallh').value + ' ft' + (gables ? ' + ' + fmt(gables) + ' sq ft of gables' : '') + (open ? ' − ' + fmt(open) + ' sq ft of doors and windows' : '')]);
      }
      var area = parts.reduce(function (t, x) { return t + x[1]; }, 0);
      if (!area) { out.hidden = true; return; }
      var cover = rough ? p.rough : p.smooth;
      var first = area / cover, more = coats > 1 ? (coats - 1) * first * p.second : 0, gal = first + more;
      var trim = kind === 'house' && f('trim').checked ? gal * cfg.trimShare : 0;
      var c = cans(gal), price = num(f('price').value);
      var html = '<h2 class="hgt-frost__head">About ' + fmt(Math.ceil(gal * 10) / 10, 1) + ' gallons of ' + p.name.toLowerCase() + '</h2>';
      var s = stat('hgt-stat--frost', 'Gallons', fmt(Math.ceil(gal * 10) / 10, 1), fmt(area) + ' sq ft · ' + coats + ' coat' + (coats > 1 ? 's' : ''));
      s += stat('', 'Buy', (c.pails ? c.pails + ' × 5 gal' : '') + (c.pails && c.gallons ? ' + ' : '') + (c.gallons ? c.gallons + ' × 1 gal' : ''), fmt(c.total) + ' gallons in total');
      s += stat('', 'Coverage used', fmt(cover) + ' sq ft/gal', (rough ? 'Rough or weathered wood' : 'Smooth or new surface') + (coats > 1 && p.second < 1 ? '; later coats use about ' + Math.round(p.second * 100) + '%' : ''));
      parts.forEach(function (x) { s += stat('', x[0], fmt(x[1]) + ' sq ft', ''); });
      if (trim) s += stat('', 'Trim paint', fmt(Math.ceil(trim)) + ' gal', 'About ' + Math.round(cfg.trimShare * 100) + '% of the body paint');
      if (price) s += stat('hgt-stat--frost', 'Cost', money(c.total * price + Math.ceil(trim) * price), money(price) + ' per gallon');
      parts.forEach(function (x) { math.push('<li>' + x[0] + ': ' + x[2] + ' = ' + fmt(x[1]) + ' sq ft.</li>'); });
      math.push('<li>First coat: ' + fmt(area) + ' ÷ ' + cover + ' sq ft per gallon = ' + fmt(first, 2) + ' gal' + (coats > 1 ? '; ' + (coats - 1) + ' more coat' + (coats > 2 ? 's' : '') + ' at ' + Math.round(p.second * 100) + '% = ' + fmt(more, 2) + ' gal' : '') + '.</li>');
      html += '<div class="hgt-frost__stats">' + s + '</div>';
      html += '<details class="hgt-calc__math"' + (embed ? '' : ' open') + '><summary>Show the math</summary><ul>' + math.join('') + '</ul></details>';
      if (!embed) html += '<div class="hgt-frost__actions"><button class="hgt-btn hgt-btn--ghost" type="button" data-share>Copy link to this result</button></div>';
      out.innerHTML = html;
      out.hidden = false;
      if (history.replaceState && window.self === window.top) {
        history.replaceState(null, '', '#' + Array.prototype.map.call(form.elements, function (e) { return e.name; }).filter(function (k) { return k && k !== 'price'; })
          .map(function (k) { var e = f(k); return k + '=' + encodeURIComponent(e.type === 'checkbox' ? (e.checked ? 1 : 0) : e.value); }).join('&'));
      }
      track({ calc: kind + '_coating', gal: Math.round(gal) });
    }

    location.hash.replace(/^#/, '').split('&').forEach(function (kv) {
      var p = kv.split('='), e = p[0] && form.elements[decodeURIComponent(p[0])];
      if (!e || e.length) return;
      if (e.type === 'checkbox') e.checked = p[1] === '1'; else e.value = decodeURIComponent(p[1] || '');
    });
    var timer;
    form.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(calc, 150); });
    form.addEventListener('change', calc);
    form.addEventListener('submit', function (e) { e.preventDefault(); calc(); });
    root.addEventListener('click', function (e) {
      var share = e.target.closest('[data-share]');
      if (share && navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { share.textContent = 'Link copied'; setTimeout(function () { share.textContent = 'Copy link to this result'; }, 2000); });
    });
    calc();
  }

  for (var i = 0; i < roots.length; i++) setup(roots[i], JSON.parse(roots[i].getAttribute('data-config')));
})();
