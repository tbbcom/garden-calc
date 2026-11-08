/* Deck joist, floor joist and rafter span calculators: tools.homegardenlot.com
   Spans come from NDS 2018 design values with the same checks the AWC DCA 6 and IRC span tables use:
   bending, live-load deflection and shear. Species values and load cases arrive in data-config. */
(function () {
  'use strict';
  var roots = document.querySelectorAll('[data-hgt-span]');
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
  function ftIn(inch) { var r = Math.round(inch); return Math.floor(r / 12) + ' ft ' + (r % 12) + ' in'; }
  function ftInShort(inch) { var r = Math.round(inch); return Math.floor(r / 12) + '′' + (r % 12) + '″'; }

  // Max span in inches for one member. o: {live, dead, cd, defl, wet, incised, cap (ft)}.
  function span(cfg, sp, size, oc, o) {
    var s = cfg.species[sp], b = 1.5, d = cfg.depth[size];
    var S = b * d * d / 6, I = b * d * d * d / 12, A = b * d;
    var fb = typeof s.fb === 'object' ? s.fb[size] : s.fb * cfg.cf[size];
    var inc = o.incised ? cfg.incised : { fb: 1, e: 1, fv: 1 };
    var fbp = fb * o.cd * cfg.cr * (o.wet && fb > cfg.wetFbLimit ? cfg.wet.fb : 1) * inc.fb;
    var ep = s.e * (o.wet ? cfg.wet.e : 1) * inc.e;
    var fvp = s.fv * o.cd * (o.wet ? cfg.wet.fv : 1) * inc.fv;
    var w = (o.live + o.dead) * oc / 144, wl = o.live * oc / 144;
    var lb = Math.sqrt(8 * fbp * S / w), ld = Math.cbrt(384 * ep * I / (5 * o.defl * wl)), lv = 4 / 3 * fvp * A / w;
    var L = Math.min(lb, ld, lv), by = L === lb ? 'bending' : L === ld ? 'deflection' : 'shear';
    if (o.cap && L > o.cap * 12) { L = o.cap * 12; by = 'the ' + o.cap + ' ft table limit'; }
    return { L: L, by: by, lb: lb, ld: ld, lv: lv, fb: fb, fbp: fbp, ep: ep, fvp: fvp, w: w, wl: wl, S: S, I: I, A: A };
  }

  function setup(root, cfg) {
    var kind = root.getAttribute('data-hgt-span');
    var form = root.querySelector('form'), out = root.querySelector('[data-out]');
    var f = function (n) { return form.elements[n]; };
    var embed = root.hasAttribute('data-embed');

    function loads() {
      if (kind === 'deck') return { live: num(f('live').value) || 40, dead: cfg.deckDead, cd: 1, defl: 360, wet: true, incised: f('incised').checked, cap: cfg.deckCap, label: f('live').value + ' psf live + ' + cfg.deckDead + ' psf dead, L/360, wet service' };
      if (kind === 'floor') {
        var u = cfg.uses[f('use').value];
        return { live: u.live, dead: u.dead, cd: 1, defl: num(f('defl').value) || 360, wet: false, incised: false, label: u.live + ' psf live + ' + u.dead + ' psf dead, L/' + (num(f('defl').value) || 360) };
      }
      var r = cfg.roofLoads[f('roof').value];
      return { live: r.live, dead: num(f('dead').value) || 10, cd: r.cd, defl: num(f('defl').value) || 240, wet: false, incised: false, label: r.name + ' + ' + (num(f('dead').value) || 10) + ' psf dead, L/' + (num(f('defl').value) || 240) + ', CD ' + r.cd };
    }

    function calc() {
      var sp = f('species').value, size = f('size').value, oc = num(f('oc').value) || 16, o = loads();
      var r = span(cfg, sp, size, oc, o);
      var want = num(f('ft').value) * 12 + num(f('in').value);
      var sizes = cfg.sizes[kind], spacings = cfg.spacings;
      var member = kind === 'rafter' ? 'rafter' : 'joist';
      var html = '<h2 class="hgt-frost__head">' + size.replace('x', '×') + ' at ' + oc + ' in on center: ' + ftIn(r.L) + ' max ' + (kind === 'rafter' ? 'horizontal span' : 'span') + '</h2>';
      var s = stat('hgt-stat--frost', 'Max span', ftIn(r.L), cfg.species[sp].name + ', limited by ' + r.by);
      if (want) {
        var ok = want <= Math.round(r.L);
        var fit = sizes.filter(function (z) { return span(cfg, sp, z, oc, o).L >= want - 0.5; })[0];
        s += stat(ok ? 'hgt-stat--frost' : 'hgt-stat--warn', 'Your ' + ftIn(want) + ' span', ok ? 'OK' : 'Too long', ok ? fmt(Math.round(r.L) - want) + ' in to spare' : fit ? 'Use ' + fit.replace('x', '×') + ' at ' + oc + ' in, or closer spacing' : 'Add a beam or use engineered lumber');
      }
      if (kind === 'deck') s += stat('', 'Max cantilever', ftIn(r.L / 4), 'About ¼ of the joist span; DCA 6 also caps it by joist size');
      if (kind === 'rafter') s += stat('', 'Rafter length factor', 'Span × slope', 'Measure span horizontally; see the roof pitch calculator for length');
      s += stat('', 'Design load', fmt(o.live + o.dead) + ' psf', o.label);
      html += '<div class="hgt-frost__stats">' + s + '</div>';
      html += '<div class="hgt-table-wrap"><table class="hgt-table"><thead><tr><th scope="col">' + cfg.species[sp].name.replace(/ No\. 2$/, '') + '</th>' +
        spacings.map(function (x) { return '<th scope="col">' + x + ' in o.c.</th>'; }).join('') + '</tr></thead><tbody>' +
        sizes.map(function (z) {
          return '<tr><td>' + z.replace('x', '×') + '</td>' + spacings.map(function (x) {
            var v = ftInShort(span(cfg, sp, z, x, o).L);
            return '<td>' + (z === size && x === oc ? '<strong>' + v + '</strong>' : v) + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>';
      var math = [
        '<li>Design values (' + cfg.species[sp].name + '): F<sub>b</sub> ' + fmt(r.fb) + ' psi' + (typeof cfg.species[sp].fb === 'object' ? '' : ' (with size factor ' + cfg.cf[size] + ')') + ', E ' + fmt(cfg.species[sp].e) + ' psi, F<sub>v</sub> ' + cfg.species[sp].fv + ' psi.</li>',
        '<li>Adjusted: F<sub>b</sub>′ = ' + fmt(r.fbp) + ' psi (repetitive member ×' + cfg.cr + (o.cd !== 1 ? ', load duration ×' + o.cd : '') + (o.wet ? ', wet service' : '') + (o.incised ? ', incised ×' + cfg.incised.fb : '') + '); E′ = ' + fmt(r.ep) + ' psi; F<sub>v</sub>′ = ' + fmt(r.fvp) + ' psi.</li>',
        '<li>Load on each ' + member + ': (' + o.live + ' + ' + o.dead + ') psf × ' + oc + ' in ÷ 12 = ' + fmt(r.w * 12, 1) + ' lb per ft.</li>',
        '<li>Bending: L = √(8 F<sub>b</sub>′ S ÷ w) = ' + ftIn(r.lb) + ' (S = ' + fmt(r.S, 2) + ' in³).</li>',
        '<li>Deflection (L/' + o.defl + ', live load only): L = ∛(384 E′ I ÷ (5 × ' + o.defl + ' × w<sub>live</sub>)) = ' + ftIn(r.ld) + ' (I = ' + fmt(r.I, 1) + ' in⁴).</li>',
        '<li>Shear: L = 4 F<sub>v</sub>′ A ÷ (3 w) = ' + ftIn(r.lv) + '.</li>',
        '<li>Allowed span = the smallest' + (o.cap ? ', capped at ' + o.cap + ' ft' : '') + ': <strong>' + ftIn(r.L) + '</strong>, rounded to the nearest inch.</li>'];
      html += '<details class="hgt-calc__math"' + (embed ? '' : ' open') + '><summary>Show the math</summary><ul>' + math.join('') + '</ul></details>';
      html += '<p class="hgt-note">Planning estimate for No. 2 sawn lumber with uniform loads. Your building department\'s span tables govern; point loads, hot tubs, heavy planters and unusual framing need an engineer.</p>';
      if (!embed) html += '<div class="hgt-frost__actions"><button class="hgt-btn hgt-btn--ghost" type="button" data-share>Copy link to this result</button></div>';
      out.innerHTML = html;
      out.hidden = false;
      if (history.replaceState && window.self === window.top) {
        history.replaceState(null, '', '#' + Array.prototype.map.call(form.elements, function (e) { return e.name; }).filter(Boolean)
          .map(function (k) { var e = f(k); return k + '=' + encodeURIComponent(e.type === 'checkbox' ? (e.checked ? 1 : 0) : e.value); }).join('&'));
      }
      track({ calc: kind + '_span', size: size, oc: oc });
    }

    location.hash.replace(/^#/, '').split('&').forEach(function (kv) {
      var p = kv.split('='), e = p[0] && form.elements[decodeURIComponent(p[0])];
      if (!e || (!e.options && e.length)) return; // skip radio groups, keep selects
      if (e.type === 'checkbox') e.checked = p[1] === '1'; else e.value = decodeURIComponent(p[1] || '');
    });
    var timer;
    form.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(calc, 150); });
    form.addEventListener('change', function (e) {
      // Treated hem-fir, Douglas fir and SPF are usually incised; Southern pine usually is not.
      if (e.target.name === 'species' && f('incised')) f('incised').checked = e.target.value !== 'syp' && e.target.value !== 'wc';
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
