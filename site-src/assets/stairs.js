/* Stair and stair stringer calculator: tools.homegardenlot.com
   Code limits (IRC R311.7) and stringer rules (AWC DCA 6) arrive in data-config from the page build. */
(function () {
  'use strict';
  var roots = document.querySelectorAll('[data-hgt-stairs]');
  if (!roots.length) return;

  function track(ev) {
    if (window.hgtGA4 && window.gtag) window.gtag('event', 'calc_result', ev);
    else if (window.dataLayer) window.dataLayer.push(Object.assign({ event: 'calc_result' }, ev));
  }
  function num(v) { var n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) && n > 0 ? n : 0; }
  function fmt(n, d) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  // Inches to the nearest 1/16 in, the way a tape measure reads.
  function inch(x) {
    var s = Math.round(x * 16), w = Math.floor(s / 16), r = s % 16, d = 16;
    while (r && r % 2 === 0) { r /= 2; d /= 2; }
    return (w ? w : '') + (r ? (w ? ' ' : '') + r + '/' + d : (w ? '' : '0')) + '″';
  }
  function feetIn(x) { var f = Math.floor(x / 12), i = x - f * 12; return f ? f + '′ ' + inch(i) : inch(i); }
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
    var form = root.querySelector('form'), out = root.querySelector('[data-out]');
    var f = function (n) { return form.elements[n]; };
    var embed = root.hasAttribute('data-embed');

    function calc() {
      var rise = num(f('rise').value) * (f('unit').value === 'ft' ? 12 : 1);
      var maxR = num(f('maxr').value) || cfg.maxRiser;
      var tread = num(f('tread').value) || cfg.minTread;
      var thick = num(f('thick').value);
      var width = num(f('width').value) || cfg.minWidth;
      var depth = cfg.boards[f('board').value] || 11.25;
      if (!rise) { out.hidden = true; return; }

      var n = Math.ceil(rise / maxR - 1e-9);
      var r = rise / n;
      var treads = n - 1;
      var run = treads * tread;
      var hyp = Math.sqrt(rise * rise + run * run);
      // One extra riser-run of length at the bottom so the stringer has full bearing.
      var stringer = hyp + Math.sqrt(r * r + tread * tread);
      var buy = cfg.lengths.filter(function (l) { return l * 12 >= stringer; })[0];
      var angle = Math.atan(r / tread) * 180 / Math.PI;
      var throat = depth - (r * tread) / Math.sqrt(r * r + tread * tread);
      var count = Math.max(2, Math.ceil(width / cfg.maxSpacing - 1e-9) + 1);
      var rule = 2 * r + tread;

      var warn = [];
      if (r > cfg.maxRiser + 1e-9) warn.push('Riser ' + inch(r) + ' is over the ' + inch(cfg.maxRiser) + ' limit in the IRC.');
      if (tread < cfg.minTread) warn.push('Treads under ' + cfg.minTread + ' in are below the IRC minimum.');
      if (rise > cfg.maxFlight) warn.push('A single flight can rise at most ' + fmt(cfg.maxFlight) + ' in (12 ft 7 in); add a landing.');
      if (width < cfg.minWidth) warn.push('Stairs must be at least ' + cfg.minWidth + ' in wide.');
      if (throat < cfg.minThroat) warn.push('Only ' + inch(throat) + ' of wood remains under the cuts; use a deeper board or a lower riser (at least ' + cfg.minThroat + ' in).');
      if (!buy) warn.push('Stringers over ' + cfg.lengths[cfg.lengths.length - 1] + ' ft need a landing or a special-order board.');

      var html = warn.length ? '<div class="hgt-note"><strong>Check before you cut:</strong><ul>' + warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul></div>' : '';
      html += '<h2 class="hgt-frost__head">' + n + ' risers of ' + inch(r) + ' and ' + treads + ' treads of ' + inch(tread) + '</h2>';
      var s = stat('hgt-stat--frost', 'Riser height', inch(r), n + ' risers · ' + fmt(r * 25.4) + ' mm');
      s += stat('', 'Treads', String(treads), inch(tread) + ' deep · total run ' + feetIn(run));
      s += stat('', 'Stringer length', feetIn(stringer), buy ? 'Buy ' + buy + ' ft ' + f('board').value + ' boards' : 'Longer than stock lengths');
      s += stat('', 'Stringers', String(count), 'For ' + inch(width) + ' wide stairs (max ' + cfg.maxSpacing + ' in apart)');
      s += stat('', 'Angle', fmt(angle, 1) + '°', '2 × riser + tread = ' + fmt(rule, 1) + ' in' + (rule >= 24 && rule <= 25.5 ? ' (comfortable)' : ''));
      s += stat(throat < cfg.minThroat ? 'hgt-stat--frost' : '', 'Wood left (throat)', inch(throat), 'Under the deepest cut');
      if (thick) s += stat('', 'Bottom cut', inch(r - thick), 'First riser on the stringer, ' + inch(thick) + ' shorter for the tread');
      html += '<div class="hgt-frost__stats">' + s + '</div>';
      html += svg(n, r, tread, depth, thick);
      html += '<details class="hgt-calc__math"' + (embed ? '' : ' open') + '><summary>Show the math</summary><ul>' +
        '<li>Risers: ' + inch(rise) + ' total rise ÷ ' + inch(maxR) + ' max riser = ' + fmt(rise / maxR, 2) + ', rounded up to ' + n + '. Riser height: ' + fmt(rise, 2) + ' ÷ ' + n + ' = ' + fmt(r, 3) + ' in (' + inch(r) + ').</li>' +
        '<li>Treads: ' + n + ' risers − 1 = ' + treads + ', because the top step is the upper floor or deck. Total run: ' + treads + ' × ' + fmt(tread, 2) + ' = ' + fmt(run, 2) + ' in.</li>' +
        '<li>Stringer: √(' + fmt(rise, 2) + '² + ' + fmt(run, 2) + '²) = ' + fmt(hyp, 2) + ' in, plus one more step diagonal (' + fmt(stringer - hyp, 2) + ' in) for bearing at the bottom = ' + fmt(stringer, 2) + ' in.</li>' +
        '<li>Throat: ' + fmt(depth, 2) + ' in board − (' + fmt(r, 3) + ' × ' + fmt(tread, 2) + ' ÷ ' + fmt(Math.sqrt(r * r + tread * tread), 2) + ') = ' + fmt(throat, 2) + ' in.</li>' +
        (thick ? '<li>Bottom cut: the first riser is cut ' + inch(thick) + ' shorter so every step is equal once treads are on.</li>' : '') +
        '</ul></details>';
      if (!embed) html += '<div class="hgt-frost__actions"><button class="hgt-btn" type="button" data-print>Print cut list</button><button class="hgt-btn hgt-btn--ghost" type="button" data-share>Copy link to this result</button></div>';
      out.innerHTML = html;
      out.hidden = false;
      if (history.replaceState && window.self === window.top) {
        history.replaceState(null, '', '#r=' + f('rise').value + '&u=' + f('unit').value + '&m=' + maxR + '&t=' + tread + '&k=' + thick + '&w=' + width + '&b=' + encodeURIComponent(f('board').value));
      }
      track({ calc: 'stairs', risers: n });
    }

    function svg(n, r, t, depth, thick) {
      var W = 620, H = 300, run = (n - 1) * t, sc = Math.min((W - 40) / (run + t), (H - 40) / (n * r)), pts = [], x = 20, y = H - 20;
      pts.push([x, y]);
      for (var i = 0; i < n; i++) { y -= r * sc; pts.push([x, y]); if (i < n - 1) { x += t * sc; pts.push([x, y]); } }
      var steps = pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
      var ang = Math.atan2(n * r, run + t), dx = Math.sin(ang) * depth * sc, dy = Math.cos(ang) * depth * sc;
      var a = [20 + t * sc, H - 20], b = [pts[pts.length - 1][0] + t * sc * 0.6, pts[pts.length - 1][1] - r * sc * 0.6];
      var edge = '<line class="edge" x1="' + (a[0] + dx).toFixed(1) + '" y1="' + (a[1] + dy).toFixed(1) + '" x2="' + (b[0] + dx).toFixed(1) + '" y2="' + (b[1] + dy).toFixed(1) + '"/>';
      var lbl = '<text x="' + (pts[1][0] + 6).toFixed(1) + '" y="' + ((pts[0][1] + pts[1][1]) / 2 + 4).toFixed(1) + '">' + inch(r) + ' rise</text>' +
        '<text x="' + (pts[1][0] + 4).toFixed(1) + '" y="' + (pts[1][1] - 6).toFixed(1) + '">' + inch(t) + ' run</text>';
      return '<figure class="hgt-calc__fig"><svg class="hgt-stairsvg" viewBox="0 0 ' + W + ' ' + (H + 20) + '" role="img" aria-label="Stringer layout: ' + n + ' risers, ' + (n - 1) + ' treads">' +
        '<polyline class="step" points="' + steps + '"/>' + edge + lbl + '</svg><figcaption>Stringer layout (not to scale). The dashed line is the bottom edge of the board; keep at least the throat shown above between it and each cut.</figcaption></figure>';
    }

    var h = readHash();
    ['rise', 'unit', 'maxr', 'tread', 'thick', 'width'].forEach(function (k, i) {
      var key = ['r', 'u', 'm', 't', 'k', 'w'][i];
      if (h[key]) f(k).value = h[key];
    });
    if (h.b && cfg.boards[h.b]) f('board').value = h.b;
    var timer;
    form.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(calc, 150); });
    form.addEventListener('change', calc);
    form.addEventListener('submit', function (e) { e.preventDefault(); calc(); });
    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-print]')) window.print();
      var share = e.target.closest('[data-share]');
      if (share && navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { share.textContent = 'Link copied'; setTimeout(function () { share.textContent = 'Copy link to this result'; }, 2000); });
    });
    calc();
  }

  for (var i = 0; i < roots.length; i++) setup(roots[i], JSON.parse(roots[i].getAttribute('data-config')));
})();
