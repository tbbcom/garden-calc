/* Concrete block and retaining wall calculators: tools.homegardenlot.com
   Sizes and coverage rates arrive in data-config from the page build, so the
   reference tables on the page and this script always use the same numbers. */
(function () {
  'use strict';
  var roots = document.querySelectorAll('[data-hgt-calc]');
  if (!roots.length) return;

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
  function round1(n) { return Math.ceil(n * 10) / 10; }

  function stat(cls, name, value, hint) {
    return '<div class="hgt-stat' + (cls ? ' ' + cls : '') + '"><span class="hgt-stat__label">' + name +
      '</span><span class="hgt-stat__value">' + value + '</span>' + (hint ? '<span class="hgt-stat__hint">' + hint + '</span>' : '') + '</div>';
  }

  // ---------- shared: wall rows ----------
  function rowHtml(i, l, h) {
    return '<div class="hgt-calc__row" data-row>' +
      '<label><span>Wall ' + (i + 1) + ' length (ft)</span><input type="number" inputmode="decimal" min="0" step="0.5" data-l value="' + esc(l) + '"></label>' +
      '<label><span>Height (ft)</span><input type="number" inputmode="decimal" min="0" step="0.25" data-h value="' + esc(h) + '"></label>' +
      '<button type="button" class="hgt-calc__del" data-del aria-label="Remove wall ' + (i + 1) + '">×</button></div>';
  }
  function readRows(root) {
    var out = [];
    Array.prototype.forEach.call(root.querySelectorAll('[data-row]'), function (r) {
      var l = num(r.querySelector('[data-l]').value), h = num(r.querySelector('[data-h]').value);
      if (l && h) out.push([l, h]);
    });
    return out;
  }
  function renumber(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-row]'), function (r, i) {
      r.querySelector('span').textContent = 'Wall ' + (i + 1) + ' length (ft)';
      r.querySelector('[data-del]').setAttribute('aria-label', 'Remove wall ' + (i + 1));
    });
  }

  // State lives in the URL hash so a result can be shared or bookmarked.
  function readHash() {
    var o = {};
    location.hash.replace(/^#/, '').split('&').forEach(function (p) {
      var kv = p.split('=');
      if (kv[0]) o[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return o;
  }
  function writeHash(o) {
    if (!history.replaceState) return;
    var s = Object.keys(o).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&');
    history.replaceState(null, '', '#' + s);
  }

  // ---------- concrete block (CMU) wall ----------
  function cmu(root, cfg) {
    var form = root.querySelector('form');
    var rows = root.querySelector('[data-rows]');
    var out = root.querySelector('[data-out]');
    var f = function (n) { return form.elements[n]; };

    function calc() {
      var walls = readRows(root);
      var size = cfg.sizes[f('size').value] || cfg.sizes['8'];
      var waste = num(f('waste').value) / 100;
      var openSqft = num(f('openings').value);
      var groutMode = f('grout').value;
      var spacing = num(f('rebar').value);
      var footing = f('footing').checked;
      var perSqft = 144 / (size.h * size.l);
      if (!walls.length) { out.hidden = true; return; }

      var blocks = 0, courses = 0, area = 0, bars = 0, barFt = 0, wireFt = 0, footFt = 0, cells = 0;
      walls.forEach(function (w) {
        var lin = w[0] * 12, hin = w[1] * 12;
        var c = Math.ceil(hin / size.h - 1e-9);
        var per = Math.ceil(lin / size.l - 1e-9);
        blocks += per * c;
        courses = Math.max(courses, c);
        area += w[0] * w[1];
        footFt += w[0];
        if (spacing) {
          var n = Math.floor(lin / spacing) + 1;
          bars += n;
          barFt += n * (w[1] + cfg.dowelFt);
          cells += n * c;
        }
        wireFt += w[0] * Math.floor(c / 2);
      });
      var openBlocks = Math.floor(openSqft * perSqft);
      var net = Math.max(0, blocks - openBlocks);
      var netArea = Math.max(0, area - openSqft);
      var order = Math.ceil(net * (1 + waste));
      var bags = Math.ceil(order / cfg.blocksPerBag);

      var groutCuft = 0;
      if (size.grout) {
        if (groutMode === 'full') groutCuft = net * size.grout;
        else if (groutMode === 'rebar' && spacing) groutCuft = Math.min(cells, net) * size.grout / 2;
      }
      groutCuft *= 1 + cfg.groutWaste;
      var groutYd = groutCuft / 27;
      var groutBags = Math.ceil(groutCuft / cfg.bagYield);

      var footW = Math.max(cfg.minFooting, size.w * 2), footD = Math.max(cfg.minFooting, size.w);
      var footCuft = footing ? footFt * (footW / 12) * (footD / 12) * (1 + cfg.groutWaste) : 0;
      var footYd = footCuft / 27, footBags = Math.ceil(footCuft / cfg.bagYield);

      var sticks = 0;
      if (spacing) {
        walls.forEach(function (w) {
          var n = Math.floor(w[0] * 12 / spacing) + 1, len = w[1] + cfg.dowelFt;
          sticks += len <= 20 ? Math.ceil(n / Math.floor(20 / len)) : n * Math.ceil(len / 19);
        });
      }
      var wire = Math.ceil(wireFt / 9.5);

      var p = function (n) { return num(f(n).value); };
      var cost = order * p('pBlock') + bags * p('pMortar') +
        (groutYd >= 1 ? Math.ceil(groutYd * 4) / 4 * p('pReady') : groutBags * p('pBag')) +
        (footYd >= 1 ? Math.ceil(footYd * 4) / 4 * p('pReady') : footBags * p('pBag')) +
        sticks * p('pRebar') + wire * p('pWire');

      var html = '<h2 class="hgt-frost__head">You need about ' + fmt(order) + ' blocks</h2>';
      var s = stat('hgt-stat--frost', size.short + ' blocks', fmt(order), fmt(net) + ' + ' + Math.round(waste * 100) + '% for cuts and breakage');
      s += stat('', 'Mortar', fmt(bags) + ' bags', '80 lb Type S or N premix, ~' + cfg.blocksPerBag + ' blocks per bag');
      if (groutCuft) s += stat('', 'Core grout', round1(groutYd) + ' cu yd', groutYd >= 1 ? 'Order ready-mix grout' : fmt(groutBags) + ' × 80 lb bags');
      if (footCuft) s += stat('', 'Footing concrete', round1(footYd) + ' cu yd', footW + ' × ' + footD + ' in · ' + (footYd >= 1 ? 'order ready-mix' : fmt(footBags) + ' × 80 lb bags'));
      if (spacing) s += stat('', '#4 rebar', fmt(sticks) + ' × 20 ft', fmt(bars) + ' vertical bars @ ' + spacing + ' in');
      s += stat('', 'Ladder wire', fmt(wire) + ' × 10 ft', 'Every other course');
      if (cost > 0) s += stat('hgt-stat--frost', 'Estimated materials', money(cost), 'Edit prices below');
      html += '<div class="hgt-frost__stats">' + s + '</div>';

      html += svgWall(walls[0], size);
      html += '<details class="hgt-calc__math" open><summary>Show the math</summary><ul>' +
        '<li>Wall area: ' + fmt(area, 1) + ' sq ft' + (openSqft ? ' − ' + fmt(openSqft, 1) + ' sq ft openings = ' + fmt(netArea, 1) + ' sq ft' : '') + '.</li>' +
        '<li>A ' + size.short + ' block covers ' + size.l + ' × ' + size.h + ' in of wall face (including the ⅜ in joint), so ' + fmt(perSqft, 3) + ' blocks per sq ft.</li>' +
        '<li>Counted by course: ' + walls.map(function (w) { return Math.ceil(w[0] * 12 / size.l - 1e-9) + ' blocks × ' + Math.ceil(w[1] * 12 / size.h - 1e-9) + ' courses'; }).join(' + ') +
        ' = ' + fmt(blocks) + (openBlocks ? ' − ' + fmt(openBlocks) + ' for openings = ' + fmt(net) : '') + '. Partial blocks at the ends count as whole blocks because they are cut from one.</li>' +
        '<li>With ' + Math.round(waste * 100) + '% waste: ' + fmt(net) + ' × ' + (1 + waste).toFixed(2) + ' = ' + fmt(order) + '.</li>' +
        '<li>Mortar: ' + fmt(order) + ' ÷ ' + cfg.blocksPerBag + ' blocks per 80 lb bag = ' + fmt(bags) + ' bags.</li>' +
        (groutCuft ? '<li>Grout: ' + (groutMode === 'full' ? fmt(net) + ' blocks' : fmt(Math.min(cells, net)) + ' reinforced cells (half a block each)') + ' × ' + size.grout + ' cu ft + ' + Math.round(cfg.groutWaste * 100) + '% = ' + fmt(groutCuft, 1) + ' cu ft (' + round1(groutYd) + ' cu yd).</li>' : '') +
        (footCuft ? '<li>Footing: ' + fmt(footFt, 1) + ' ft × ' + footW + ' in × ' + footD + ' in + ' + Math.round(cfg.groutWaste * 100) + '% = ' + fmt(footCuft, 1) + ' cu ft.</li>' : '') +
        '</ul></details>';
      html += '<div class="hgt-frost__actions"><button class="hgt-btn" type="button" data-print>Print shopping list</button><button class="hgt-btn hgt-btn--ghost" type="button" data-share>Copy link to this result</button></div>';
      out.innerHTML = html;
      out.hidden = false;

      writeHash({ w: walls.map(function (w) { return w[0] + 'x' + w[1]; }).join(','), s: f('size').value, o: openSqft || '', g: groutMode, r: spacing, ft: footing ? 1 : 0, x: Math.round(waste * 100) });
      track({ calc: 'cmu', blocks: order });
    }

    function load() {
      var h = readHash();
      var walls = (h.w || '').split(',').map(function (p) { return p.split('x'); }).filter(function (p) { return num(p[0]) && num(p[1]); });
      if (!walls.length) walls = [[cfg.defaultL, cfg.defaultH]];
      rows.innerHTML = walls.map(function (w, i) { return rowHtml(i, w[0], w[1]); }).join('');
      if (h.s && cfg.sizes[h.s]) f('size').value = h.s;
      if (h.o) f('openings').value = h.o;
      if (h.g) f('grout').value = h.g;
      if (h.r !== undefined) f('rebar').value = h.r;
      if (h.ft !== undefined) f('footing').checked = h.ft === '1';
      if (h.x) f('waste').value = h.x;
      sync();
    }
    // 4-inch blocks are rarely grouted or reinforced, so those inputs switch off.
    function sync() {
      var size = cfg.sizes[f('size').value];
      f('grout').disabled = !size.grout;
      if (!size.grout) f('grout').value = 'none';
    }

    wire(root, form, rows, calc, sync);
    load();
    calc();
  }

  function svgWall(w, size) {
    var lin = w[0] * 12, hin = w[1] * 12;
    var W = 640, scale = Math.min(W / lin, 220 / hin), bw = size.l * scale, bh = size.h * scale;
    var c = Math.ceil(hin / size.h - 1e-9), H = c * bh, wpx = lin * scale, out = '';
    for (var r = 0; r < c; r++) {
      var y = H - (r + 1) * bh, off = r % 2 ? -bw / 2 : 0;
      for (var x = off; x < wpx; x += bw) {
        var x0 = Math.max(0, x), x1 = Math.min(wpx, x + bw);
        out += '<rect x="' + x0.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (x1 - x0).toFixed(1) + '" height="' + bh.toFixed(1) + '"' + (x0 > x || x1 < x + bw ? ' class="cut"' : '') + '/>';
      }
    }
    return '<figure class="hgt-calc__fig"><svg viewBox="-2 -2 ' + (wpx + 4).toFixed(0) + ' ' + (H + 4).toFixed(0) + '" class="hgt-wallsvg" role="img" aria-label="Running-bond layout of wall 1: ' + c + ' courses">' +
      out + '</svg>' +
      '<figcaption>Wall 1 in running bond: ' + c + ' courses. Yellow blocks are cut to fit.</figcaption></figure>';
  }

  // ---------- segmental retaining wall ----------
  function srw(root, cfg) {
    var form = root.querySelector('form');
    var rows = root.querySelector('[data-rows]');
    var out = root.querySelector('[data-out]');
    var f = function (n) { return form.elements[n]; };

    function block() {
      var b = cfg.blocks[f('block').value];
      if (f('block').value !== 'custom') return b;
      return { short: 'custom', h: num(f('bh').value) || 6, l: num(f('bl').value) || 16, d: num(f('bd').value) || 12, lb: num(f('bw').value) || 0 };
    }

    function calc() {
      var walls = readRows(root);
      var b = block();
      var waste = num(f('waste').value) / 100;
      var capL = f('cap').checked ? num(f('capl').value) || 12 : 0;
      var pipe = f('pipe').checked;
      if (!walls.length) { out.hidden = true; return; }

      var blocks = 0, caps = 0, len = 0, maxExp = 0, baseCuft = 0, drainCuft = 0, fabric = 0, buriedC = 0, totalC = 0;
      var trench = (b.d + cfg.baseExtra) / 12;
      walls.forEach(function (w) {
        var lin = w[0] * 12, exp = w[1] * 12;
        // Bury at least one course, or a tenth of the exposed height if that is more.
        var bc = Math.max(1, Math.ceil(exp * cfg.buryRatio / b.h - 1e-9));
        var ec = Math.ceil(exp / b.h - 1e-9);
        var c = bc + ec, per = Math.ceil(lin / b.l - 1e-9);
        blocks += per * c;
        if (capL) caps += Math.ceil(lin / capL - 1e-9);
        len += w[0];
        maxExp = Math.max(maxExp, w[1]);
        buriedC = Math.max(buriedC, bc);
        totalC = Math.max(totalC, c);
        var hFt = c * b.h / 12;
        baseCuft += w[0] * trench * cfg.baseIn / 12;
        drainCuft += w[0] * cfg.drainIn / 12 * hFt;
        fabric += w[0] * (hFt + 1);
      });
      var order = Math.ceil(blocks * (1 + waste));
      var capOrder = Math.ceil(caps * (1 + waste));
      var baseYd = baseCuft / 27, drainYd = drainCuft / 27;
      var tons = (baseYd + drainYd) * cfg.tonsPerYd;
      var weight = b.lb ? order * b.lb : 0;

      var p = function (n) { return num(f(n).value); };
      var cost = order * p('pBlock') + capOrder * p('pCap') + (baseYd + drainYd) * p('pStone') + (pipe ? Math.ceil(len / 10) * p('pPipe') : 0) + Math.ceil(fabric / cfg.fabricRoll) * p('pFabric');

      var html = '';
      if (maxExp > cfg.permitFt) html += '<p class="hgt-note"><strong>Engineering needed:</strong> a wall over ' + cfg.permitFt + ' ft usually needs a permit and an engineered design with geogrid. Use these numbers for budgeting only.</p>';
      else if (maxExp > cfg.gridFt) html += '<p class="hgt-note"><strong>Check the block maker\'s chart:</strong> many segmental blocks need geogrid reinforcement above about ' + cfg.gridFt + ' ft, and sooner if the wall holds back a slope, a driveway or clay soil.</p>';
      html += '<h2 class="hgt-frost__head">You need about ' + fmt(order) + ' wall blocks</h2>';
      var s = stat('hgt-stat--frost', 'Wall blocks', fmt(order), fmt(blocks) + ' + ' + Math.round(waste * 100) + '% · ' + totalC + ' courses (' + buriedC + ' buried)');
      if (capL) s += stat('', 'Cap blocks', fmt(capOrder), capL + ' in caps, glue with landscape block adhesive');
      s += stat('', 'Base gravel', round1(baseYd) + ' cu yd', cfg.baseIn + ' in compacted, ' + fmt(trench * 12) + ' in wide trench');
      s += stat('', 'Drainage stone', round1(drainYd) + ' cu yd', cfg.drainIn + ' in of clean ¾ in stone behind the wall');
      s += stat('', 'Total stone', fmt(tons, 1) + ' tons', '≈ ' + cfg.tonsPerYd + ' tons per cu yd');
      if (pipe) s += stat('', 'Perforated drain pipe', fmt(Math.ceil(len)) + ' ft', '4 in pipe at the base, daylighted at one end');
      s += stat('', 'Filter fabric', fmt(Math.ceil(fabric)) + ' sq ft', 'Between drainage stone and soil');
      if (weight) s += stat('', 'Block weight', fmt(weight / 2000, 1) + ' tons', 'About ' + b.lb + ' lb per block, check delivery');
      if (cost > 0) s += stat('hgt-stat--frost', 'Estimated materials', money(cost), 'Edit prices below');
      html += '<div class="hgt-frost__stats">' + s + '</div>';
      html += svgSection(b, buriedC, totalC, pipe);
      html += '<details class="hgt-calc__math" open><summary>Show the math</summary><ul>' +
        walls.map(function (w, i) {
          var exp = w[1] * 12, bc = Math.max(1, Math.ceil(exp * cfg.buryRatio / b.h - 1e-9)), ec = Math.ceil(exp / b.h - 1e-9);
          return '<li>Wall ' + (i + 1) + ': ' + Math.ceil(w[0] * 12 / b.l - 1e-9) + ' blocks per course (' + fmt(w[0] * 12) + ' in ÷ ' + b.l + ' in) × (' + ec + ' exposed + ' + bc + ' buried courses at ' + b.h + ' in) = ' + fmt(Math.ceil(w[0] * 12 / b.l - 1e-9) * (ec + bc)) + ' blocks.</li>';
        }).join('') +
        '<li>Base: ' + fmt(len, 1) + ' ft × ' + fmt(trench * 12) + ' in wide × ' + cfg.baseIn + ' in deep = ' + fmt(baseCuft, 1) + ' cu ft.</li>' +
        '<li>Drainage: ' + fmt(len, 1) + ' ft × ' + cfg.drainIn + ' in wide × full wall height = ' + fmt(drainCuft, 1) + ' cu ft.</li>' +
        '<li>Stone weight: ' + fmt(baseYd + drainYd, 2) + ' cu yd × ' + cfg.tonsPerYd + ' = ' + fmt(tons, 1) + ' tons.</li></ul></details>';
      html += '<div class="hgt-frost__actions"><button class="hgt-btn" type="button" data-print>Print shopping list</button><button class="hgt-btn hgt-btn--ghost" type="button" data-share>Copy link to this result</button></div>';
      out.innerHTML = html;
      out.hidden = false;

      var st = { w: walls.map(function (w) { return w[0] + 'x' + w[1]; }).join(','), b: f('block').value, c: capL ? capL : 0, p: pipe ? 1 : 0, x: Math.round(waste * 100) };
      if (f('block').value === 'custom') st.bs = [b.h, b.l, b.d, b.lb].join('x');
      writeHash(st);
      track({ calc: 'srw', blocks: order });
    }

    function load() {
      var h = readHash();
      var walls = (h.w || '').split(',').map(function (p) { return p.split('x'); }).filter(function (p) { return num(p[0]) && num(p[1]); });
      if (!walls.length) walls = [[cfg.defaultL, cfg.defaultH]];
      rows.innerHTML = walls.map(function (w, i) { return rowHtml(i, w[0], w[1]); }).join('');
      if (h.b && (cfg.blocks[h.b] || h.b === 'custom')) f('block').value = h.b;
      if (h.bs) { var v = h.bs.split('x'); ['bh', 'bl', 'bd', 'bw'].forEach(function (n, i) { if (v[i]) f(n).value = v[i]; }); }
      if (h.c !== undefined) { f('cap').checked = h.c !== '0'; if (num(h.c)) f('capl').value = h.c; }
      if (h.p !== undefined) f('pipe').checked = h.p === '1';
      if (h.x) f('waste').value = h.x;
      sync();
    }
    function sync() {
      root.querySelector('[data-custom]').hidden = f('block').value !== 'custom';
      f('capl').disabled = !f('cap').checked;
    }

    wire(root, form, rows, calc, sync);
    load();
    calc();
  }

  function svgSection(b, buried, total, pipe) {
    var s = 22, bw = b.d / b.h * s * 0.9, x0 = 120, ground = 40 + (total - buried) * s, base = 14;
    var out = '';
    for (var i = 0; i < total; i++) {
      var y = 40 + i * s, set = (total - 1 - i) * 3;
      out += '<rect class="blk" x="' + (x0 + set) + '" y="' + y + '" width="' + bw.toFixed(1) + '" height="' + (s - 1) + '"/>';
    }
    var bottom = 40 + total * s;
    out += '<rect class="base" x="' + (x0 - 18) + '" y="' + bottom + '" width="' + (bw + 36).toFixed(1) + '" height="' + base + '"/>';
    out += '<rect class="drain" x="' + (x0 + bw + 2).toFixed(1) + '" y="40" width="36" height="' + (bottom - 40) + '"/>';
    if (pipe) out += '<circle class="pipe" cx="' + (x0 + bw + 20).toFixed(1) + '" cy="' + (bottom - 9) + '" r="7"/>';
    out += '<line class="gnd" x1="0" y1="' + ground + '" x2="' + x0 + '" y2="' + ground + '"/>';
    out += '<text x="4" y="' + (ground - 6) + '">Ground</text><text x="' + (x0 + bw + 46).toFixed(1) + '" y="56">Drainage stone</text>' +
      '<text x="' + (x0 + bw + 46).toFixed(1) + '" y="' + (bottom + 10) + '">Gravel base</text>' +
      (pipe ? '<text x="' + (x0 + bw + 46).toFixed(1) + '" y="' + (bottom - 12) + '">Drain pipe</text>' : '');
    return '<figure class="hgt-calc__fig"><svg viewBox="0 0 360 ' + (bottom + base + 8) + '" class="hgt-secsvg" role="img" aria-label="Cross-section: ' + total + ' courses, ' + buried + ' buried, gravel base, drainage stone behind the wall">' +
      out + '</svg><figcaption>Cross-section, not to scale: each course steps back slightly into the slope.</figcaption></figure>';
  }

  // ---------- shared wiring ----------
  function wire(root, form, rows, calc, sync) {
    var t;
    var later = function () { clearTimeout(t); t = setTimeout(calc, 150); };
    form.addEventListener('input', later);
    form.addEventListener('change', function () { sync(); calc(); });
    form.addEventListener('submit', function (e) { e.preventDefault(); calc(); });
    root.querySelector('[data-add]').addEventListener('click', function () {
      var n = rows.querySelectorAll('[data-row]').length;
      rows.insertAdjacentHTML('beforeend', rowHtml(n, '', ''));
      rows.lastElementChild.querySelector('input').focus();
    });
    root.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del && rows.querySelectorAll('[data-row]').length > 1) { del.closest('[data-row]').remove(); renumber(root); calc(); }
      if (e.target.closest('[data-print]')) window.print();
      var share = e.target.closest('[data-share]');
      if (share && navigator.clipboard) {
        navigator.clipboard.writeText(location.href).then(function () {
          share.textContent = 'Link copied';
          setTimeout(function () { share.textContent = 'Copy link to this result'; }, 2000);
        });
      }
    });
  }

  for (var i = 0; i < roots.length; i++) {
    var cfg = JSON.parse(roots[i].getAttribute('data-config'));
    if (roots[i].getAttribute('data-hgt-calc') === 'cmu') cmu(roots[i], cfg);
    else srw(roots[i], cfg);
  }
})();
