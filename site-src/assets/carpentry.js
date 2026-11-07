/* Fence, post-hole concrete and deck calculators: tools.homegardenlot.com
   Sizes, spacings and bag yields arrive in data-config from the page build. */
(function () {
  'use strict';
  var roots = document.querySelectorAll('[data-hgt-carp]');
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
  function readHash() {
    var o = {};
    location.hash.replace(/^#/, '').split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) o[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ''); });
    return o;
  }
  function stock(ft, lengths) { return lengths.filter(function (l) { return l >= ft - 1e-9; })[0] || lengths[lengths.length - 1]; }
  // Concrete around a post: hole cylinder minus the post, in cubic feet.
  function holeCuft(diaIn, depthIn, postIn, round) {
    var hole = Math.PI * Math.pow(diaIn / 2, 2) * depthIn;
    var post = postIn ? (round ? Math.PI * Math.pow(postIn / 2, 2) : postIn * postIn) * depthIn : 0;
    return Math.max(0, hole - post) / 1728;
  }

  function setup(root, cfg) {
    var kind = root.getAttribute('data-hgt-carp');
    var form = root.querySelector('form'), out = root.querySelector('[data-out]');
    var f = function (n) { return form.elements[n]; };
    var has = function (n) { return !!form.elements[n]; };
    var embed = root.hasAttribute('data-embed');
    var KEYS = Array.prototype.map.call(form.elements, function (e) { return e.name; }).filter(Boolean);

    function calc() {
      var html = '', s = '', math = [], cost = 0, ev = { calc: kind };

      if (kind === 'fence') {
        var L = num(f('len').value), H = num(f('height').value), sp = num(f('spacing').value) || 8;
        var runs = Math.max(1, num(f('runs').value)), gates = num(f('gates').value);
        if (!L || !H) { out.hidden = true; return; }
        var style = cfg.styles[f('style').value];
        var sections = Math.ceil(L / sp - 1e-9) + (runs - 1);
        var posts = sections + runs + gates;
        var depthIn = num(f('depth').value) || Math.max(cfg.minDepth, Math.ceil(H * 12 / 3));
        var postFt = stock(H + depthIn / 12, cfg.postLengths);
        var rails = sections * (H > 5 ? 3 : 2);
        var pickets = style.gap === null ? 0 : Math.ceil(L * 12 / (cfg.picketW + style.gap) * (1 + cfg.waste));
        var panels = style.panel ? Math.ceil(L / style.panel - 1e-9) : 0;
        var cuft = holeCuft(cfg.holeDia, depthIn, cfg.postIn, false) * posts;
        var bags = Math.ceil(cuft / cfg.bags[0].yield - 1e-9);
        cost = posts * num(f('pPost').value) + (panels ? panels * num(f('pPanel').value) : rails * num(f('pRail').value) + pickets * num(f('pPicket').value)) + bags * num(f('pBag').value);
        html += '<h2 class="hgt-frost__head">' + fmt(posts) + ' posts' + (panels ? ', ' + fmt(panels) + ' panels' : ', ' + fmt(rails) + ' rails and ' + fmt(pickets) + ' pickets') + '</h2>';
        s += stat('hgt-stat--frost', 'Posts (4×4)', fmt(posts), postFt + ' ft long · ' + sp + ' ft apart · ' + depthIn + ' in deep');
        if (panels) s += stat('', 'Panels', fmt(panels), style.panel + ' ft panels');
        else {
          s += stat('', 'Rails (2×4, 8 ft)', fmt(rails), (H > 5 ? 3 : 2) + ' per section');
          s += stat('', 'Pickets', fmt(pickets), cfg.picketW + ' in wide' + (style.gap ? ', ' + style.gap + ' in gaps' : ', touching') + ', +' + Math.round(cfg.waste * 100) + '%');
        }
        s += stat('', 'Post concrete', fmt(bags) + ' bags', cfg.bags[0].name + ' · ' + fmt(cuft, 1) + ' cu ft');
        s += stat('', 'Gravel under posts', fmt(Math.ceil(posts * holeCuft(cfg.holeDia, 6, 0) * 10) / 10, 1) + ' cu ft', '6 in in each hole for drainage');
        if (cost) s += stat('hgt-stat--frost', 'Estimated materials', money(cost), 'Edit prices below');
        math.push('<li>Sections: ' + fmt(L) + ' ft ÷ ' + sp + ' ft = ' + Math.ceil(L / sp - 1e-9) + (runs > 1 ? ' + ' + (runs - 1) + ' for extra runs' : '') + ' = ' + sections + '.</li>');
        math.push('<li>Posts: ' + sections + ' sections + ' + runs + ' end post' + (runs > 1 ? 's' : '') + (gates ? ' + ' + gates + ' for gates' : '') + ' = ' + posts + '.</li>');
        math.push('<li>Post length: ' + H + ' ft above ground + ' + depthIn + ' in in the ground = ' + fmt(H + depthIn / 12, 1) + ' ft → buy ' + postFt + ' ft.</li>');
        if (!panels) math.push('<li>Pickets: ' + fmt(L * 12) + ' in ÷ (' + cfg.picketW + ' + ' + style.gap + ') in × ' + (1 + cfg.waste) + ' = ' + fmt(pickets) + '.</li>');
        math.push('<li>Concrete: ' + cfg.holeDia + ' in hole × ' + depthIn + ' in deep, minus the post = ' + fmt(cuft / posts, 2) + ' cu ft per post.</li>');
        ev.posts = posts;
      }

      if (kind === 'post') {
        var n = Math.max(1, num(f('count').value)), dia = num(f('dia').value), dep = num(f('depth').value);
        var p = cfg.posts[f('post').value];
        if (!dia || !dep) { out.hidden = true; return; }
        var each = holeCuft(dia, dep, p.size, p.round), tot = each * n * (1 + cfg.concreteWaste);
        html += '<h2 class="hgt-frost__head">' + fmt(tot, 1) + ' cu ft of concrete for ' + n + (n === 1 ? ' hole' : ' holes') + '</h2>';
        cfg.bags.forEach(function (b, i) {
          s += stat(i === 0 ? 'hgt-stat--frost' : '', b.name, fmt(Math.ceil(tot / b.yield - 1e-9)) + ' bags', fmt(Math.ceil(each * (1 + cfg.concreteWaste) / b.yield * 10) / 10, 1) + ' per hole (' + b.yield + ' cu ft each)');
        });
        s += stat('', 'Per hole', fmt(each, 2) + ' cu ft', p.size ? 'After subtracting the ' + p.name : 'Solid footing, no post');
        if (tot / 27 >= 1) s += stat('', 'Ready-mix', fmt(Math.ceil(tot / 27 * 4) / 4, 2) + ' cu yd', 'Cheaper than bags above about 1 cu yd');
        math.push('<li>Hole: π × (' + dia + ' ÷ 2)² × ' + dep + ' in = ' + fmt(Math.PI * Math.pow(dia / 2, 2) * dep) + ' cu in.</li>');
        if (p.size) math.push('<li>Minus the post: ' + (p.round ? 'π × (' + p.size + ' ÷ 2)²' : p.size + ' × ' + p.size) + ' × ' + dep + ' in.</li>');
        math.push('<li>Per hole: ' + fmt(each, 3) + ' cu ft; × ' + n + ' + ' + Math.round(cfg.concreteWaste * 100) + '% spill = ' + fmt(tot, 2) + ' cu ft.</li>');
        ev.holes = n;
      }

      if (kind === 'deck') {
        var W = num(f('width').value), D = num(f('proj').value);
        if (!W || !D) { out.hidden = true; return; }
        var board = cfg.boards[f('board').value], bl = num(f('blen').value), js = num(f('jspace').value);
        var rows = Math.ceil(D * 12 / (board.w + cfg.gap) - 1e-9);
        var lf = rows * W * (1 + cfg.waste);
        var boards = Math.ceil(lf / bl - 1e-9);
        var joists = Math.ceil(W * 12 / js - 1e-9) + 1;
        var jlen = stock(D, cfg.lumber);
        var crossings = rows * joists;
        var fasteners = Math.ceil(crossings * (f('fasten').value === 'clips' ? 1 : 2) * 1.05);
        var postsN = Math.ceil(W / (num(f('pspace').value) || 6) - 1e-9) + 1;
        var foot = holeCuft(cfg.footDia, cfg.footDepth, 0) * postsN;
        cost = boards * num(f('pBoard').value) + joists * num(f('pJoist').value) + Math.ceil(foot / cfg.bags[1].yield) * num(f('pBag').value);
        html += '<h2 class="hgt-frost__head">' + fmt(boards) + ' deck boards and ' + fmt(joists) + ' joists for ' + fmt(W * D) + ' sq ft</h2>';
        s += stat('hgt-stat--frost', 'Deck boards', fmt(boards), bl + ' ft ' + board.name + ' · ' + rows + ' rows · +' + Math.round(cfg.waste * 100) + '%');
        s += stat('', 'Joists', fmt(joists), jlen + ' ft ' + '2× joists at ' + js + ' in on center');
        s += stat('', 'Rim and ledger', fmt(Math.ceil(W / bl - 1e-9) * 2) + ' boards', bl + ' ft, one rim and one ledger along the ' + W + ' ft side');
        s += stat('', 'Joist hangers', fmt(joists * (f('ledger').checked ? 1 : 2)), f('ledger').checked ? 'One end on the ledger' : 'Both ends (freestanding)');
        s += stat('', f('fasten').value === 'clips' ? 'Hidden clips' : 'Deck screws', fmt(fasteners), f('fasten').value === 'clips' ? 'One per board per joist, +5%' : 'Two per board per joist, +5%');
        s += stat('', 'Beam posts', fmt(postsN), num(f('pspace').value) + ' ft apart · ' + fmt(Math.ceil(foot / cfg.bags[1].yield)) + ' × ' + cfg.bags[1].name + ' for footings');
        if (cost) s += stat('hgt-stat--frost', 'Estimated materials', money(cost), 'Boards, joists and footing concrete');
        math.push('<li>Rows: ' + D + ' ft × 12 ÷ (' + board.w + ' in board + ' + cfg.gap + ' in gap) = ' + rows + ' rows.</li>');
        math.push('<li>Boards: ' + rows + ' rows × ' + W + ' ft × ' + (1 + cfg.waste) + ' = ' + fmt(lf) + ' linear ft ÷ ' + bl + ' ft = ' + boards + '.</li>');
        math.push('<li>Joists: ' + W + ' ft × 12 ÷ ' + js + ' in + 1 = ' + joists + ', each ' + D + ' ft long (buy ' + jlen + ' ft).</li>');
        math.push('<li>Footings: ' + postsN + ' × (' + cfg.footDia + ' in × ' + cfg.footDepth + ' in) = ' + fmt(foot, 1) + ' cu ft.</li>');
        ev.boards = boards;
      }

      html += '<div class="hgt-frost__stats">' + s + '</div>';
      html += '<details class="hgt-calc__math"' + (embed ? '' : ' open') + '><summary>Show the math</summary><ul>' + math.join('') + '</ul></details>';
      if (!embed) html += '<div class="hgt-frost__actions"><button class="hgt-btn" type="button" data-print>Print shopping list</button><button class="hgt-btn hgt-btn--ghost" type="button" data-share>Copy link to this result</button></div>';
      out.innerHTML = html;
      out.hidden = false;
      if (history.replaceState && window.self === window.top) {
        history.replaceState(null, '', '#' + KEYS.filter(function (k) { return !/^p[A-Z]/.test(k); }).map(function (k) { var e = f(k); return k + '=' + encodeURIComponent(e.type === 'checkbox' ? (e.checked ? 1 : 0) : e.value); }).join('&'));
      }
      track(ev);
    }

    var h = readHash();
    KEYS.forEach(function (k) {
      if (h[k] === undefined || !has(k)) return;
      if (f(k).type === 'checkbox') f(k).checked = h[k] === '1'; else f(k).value = h[k];
    });
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
