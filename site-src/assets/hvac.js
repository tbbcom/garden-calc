/* BTU (room AC + heating) and mini-split sizing calculators: tools.homegardenlot.com
   Cooling uses the ENERGY STAR room air conditioner sizing chart and its adjustments; heating uses
   BTU-per-square-foot rules by climate. Both arrive in data-config from the page build. */
(function () {
  'use strict';
  var roots = document.querySelectorAll('[data-hgt-hvac]');
  if (!roots.length) return;

  function track(ev) {
    if (window.hgtGA4 && window.gtag) window.gtag('event', 'calc_result', ev);
    else if (window.dataLayer) window.dataLayer.push(Object.assign({ event: 'calc_result' }, ev));
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
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

  function setup(root, cfg) {
    var kind = root.getAttribute('data-hgt-hvac');
    var form = root.querySelector('form'), out = root.querySelector('[data-out]'), rows = root.querySelector('[data-rows]');
    var f = function (n) { return form.elements[n]; };
    var embed = root.hasAttribute('data-embed');
    var SUN = [['avg', 'Average sun'], ['shade', 'Heavily shaded'], ['sun', 'Very sunny']];

    function rowHtml(i, v) {
      v = v || {};
      return '<div class="hgt-calc__row hgt-calc__row--m" data-row>' +
        '<label><span>Room ' + (i + 1) + ' name</span><input type="text" data-k="name" value="' + esc(v.name !== undefined ? v.name : (i ? '' : 'Living room')) + '" maxlength="24"></label>' +
        '<label><span>Length (ft)</span><input type="number" inputmode="decimal" min="0" step="0.5" data-k="l" value="' + esc(v.l !== undefined ? v.l : (i ? '' : 20)) + '"></label>' +
        '<label><span>Width (ft)</span><input type="number" inputmode="decimal" min="0" step="0.5" data-k="w" value="' + esc(v.w !== undefined ? v.w : (i ? '' : 15)) + '"></label>' +
        '<label><span>Ceiling (ft)</span><input type="number" inputmode="decimal" min="6" step="0.5" data-k="h" value="' + esc(v.h || 8) + '"></label>' +
        '<label><span>Sun</span><select data-k="sun">' + SUN.map(function (s) { return '<option value="' + s[0] + '"' + (v.sun === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></label>' +
        '<label><span>People</span><input type="number" inputmode="numeric" min="0" step="1" data-k="ppl" value="' + esc(v.ppl !== undefined ? v.ppl : 2) + '"></label>' +
        '<label class="hgt-calc__check"><input type="checkbox" data-k="kit"' + (v.kit ? ' checked' : '') + '> Kitchen</label>' +
        '<button type="button" class="hgt-calc__del" data-del aria-label="Remove room ' + (i + 1) + '">×</button></div>';
    }
    function raw() {
      return Array.prototype.map.call(rows.querySelectorAll('[data-row]'), function (r) {
        var o = {};
        Array.prototype.forEach.call(r.querySelectorAll('[data-k]'), function (i) { o[i.getAttribute('data-k')] = i.type === 'checkbox' ? i.checked : i.value; });
        return o;
      });
    }
    // ENERGY STAR chart by floor area, then its adjustments; ceilings over 8 ft scale by volume.
    function cool(r) {
      var sq = num(r.l) * num(r.w);
      var band = cfg.chart.filter(function (b) { return sq <= b[0]; })[0] || cfg.chart[cfg.chart.length - 1];
      var btu = sq > cfg.chart[cfg.chart.length - 1][0] ? sq * cfg.overPerSqft : band[1];
      var steps = ['Chart: ' + fmt(sq) + ' sq ft → ' + fmt(btu) + ' BTU'];
      if (r.sun === 'shade') { btu *= 0.9; steps.push('shaded −10%'); }
      if (r.sun === 'sun') { btu *= 1.1; steps.push('very sunny +10%'); }
      var extra = Math.max(0, num(r.ppl) - 2) * cfg.perPerson;
      if (extra) { btu += extra; steps.push('+' + fmt(extra) + ' for ' + (num(r.ppl) - 2) + ' extra people'); }
      if (r.kit) { btu += cfg.kitchen; steps.push('+' + fmt(cfg.kitchen) + ' kitchen'); }
      var h = num(r.h) || 8;
      if (h > 8) { btu *= h / 8; steps.push('× ' + fmt(h / 8, 2) + ' for ' + h + ' ft ceilings'); }
      return { sq: sq, btu: btu, steps: steps };
    }
    function heat(r) {
      var sq = num(r.l) * num(r.w), c = cfg.climates[f('climate').value], ins = cfg.insulation[f('insul').value];
      return sq * c.perSqft * ins.factor * Math.max(1, (num(r.h) || 8) / 8);
    }
    function pick(list, btu) { return list.filter(function (s) { return s >= btu - 1e-9; })[0] || list[list.length - 1]; }

    function calc() {
      var list = raw().filter(function (r) { return num(r.l) && num(r.w); });
      if (!list.length) { out.hidden = true; return; }
      var html = '', s = '', math = [];
      var res = list.map(function (r, i) { var c = cool(r); return { name: r.name || 'Room ' + (i + 1), sq: c.sq, cool: c.btu, heat: heat(r), steps: c.steps }; });
      var totCool = res.reduce(function (a, r) { return a + r.cool; }, 0), totHeat = res.reduce(function (a, r) { return a + r.heat; }, 0), totSq = res.reduce(function (a, r) { return a + r.sq; }, 0);

      if (kind === 'btu') {
        html += '<h2 class="hgt-frost__head">' + fmt(Math.round(totCool / 100) * 100) + ' BTU to cool · ' + fmt(Math.round(totHeat / 100) * 100) + ' BTU to heat</h2>';
        s += stat('hgt-stat--frost', 'Cooling', fmt(Math.round(totCool / 100) * 100) + ' BTU/h', fmt(totCool / 12000, 2) + ' tons · ' + fmt(totSq) + ' sq ft');
        s += stat('hgt-stat--frost', 'Heating', fmt(Math.round(totHeat / 100) * 100) + ' BTU/h', esc(cfg.climates[f('climate').value].name) + ', ' + esc(cfg.insulation[f('insul').value].name.toLowerCase()) + ' insulation');
        if (res.length === 1) s += stat('', 'Window or portable AC', fmt(pick(cfg.roomAc, totCool)) + ' BTU', 'Nearest standard size at or above');
        else s += stat('', 'Central AC', fmt(pick(cfg.central, totCool / 12000), 1) + ' tons', 'Nearest standard size; confirm with a Manual J');
        s += stat('', 'Electric heat', fmt(totHeat / 3412, 1) + ' kW', 'BTU/h ÷ 3,412');
        res.forEach(function (r) { math.push('<li>' + esc(r.name) + ': ' + r.steps.join(', ') + ' = ' + fmt(r.cool) + ' BTU cooling; heating ' + fmt(r.sq) + ' sq ft × ' + cfg.climates[f('climate').value].perSqft + ' × ' + cfg.insulation[f('insul').value].factor + ' = ' + fmt(r.heat) + ' BTU.</li>'); });
        track({ calc: 'btu', rooms: res.length });
      }

      if (kind === 'split') {
        var heads = res.map(function (r) { var need = Math.max(r.cool, f('mode').value === 'heat' ? r.heat : 0); return { r: r, need: need, size: pick(cfg.heads, need) }; });
        var nominal = heads.reduce(function (a, h) { return a + h.size; }, 0), need = heads.reduce(function (a, h) { return a + h.need; }, 0);
        var outdoor = pick(cfg.outdoor, need);
        html += '<h2 class="hgt-frost__head">' + heads.length + (heads.length === 1 ? ' zone' : '-zone') + ' system: ' + fmt(outdoor) + ' BTU outdoor unit</h2>';
        s += stat('hgt-stat--frost', 'Outdoor unit', fmt(outdoor) + ' BTU', fmt(outdoor / 12000, 1) + ' tons · load ' + fmt(Math.round(need / 100) * 100) + ' BTU');
        heads.forEach(function (h) { s += stat('', esc(h.r.name) + ' head', fmt(h.size) + ' BTU', fmt(h.r.sq) + ' sq ft · needs ' + fmt(Math.round(h.need / 100) * 100)); });
        s += stat('', 'Connected heads', fmt(nominal) + ' BTU', fmt(nominal / outdoor * 100) + '% of outdoor capacity');
        if (nominal / outdoor > cfg.maxRatio) s += stat('hgt-stat--frost', 'Check', 'Too many heads', 'Most multi-zone units allow up to about ' + Math.round(cfg.maxRatio * 100) + '% connected; go one size up');
        heads.forEach(function (h) { math.push('<li>' + esc(h.r.name) + ': cooling ' + fmt(h.r.cool) + (f('mode').value === 'heat' ? ', heating ' + fmt(h.r.heat) : '') + ' BTU → smallest head that covers it: ' + fmt(h.size) + '.</li>'); });
        math.push('<li>Outdoor unit: the smallest standard size at or above the total load of ' + fmt(need) + ' BTU.</li>');
        track({ calc: 'mini_split', zones: heads.length });
      }

      html += '<div class="hgt-frost__stats">' + s + '</div>';
      html += '<details class="hgt-calc__math"' + (embed ? '' : ' open') + '><summary>Show the math</summary><ul>' + math.join('') + '</ul></details>';
      if (!embed) html += '<div class="hgt-frost__actions"><button class="hgt-btn hgt-btn--ghost" type="button" data-share>Copy link to this result</button></div>';
      out.innerHTML = html;
      out.hidden = false;
      if (history.replaceState && window.self === window.top) {
        var st = raw().map(function (r) { return [r.name, r.l, r.w, r.h, r.sun, r.ppl, r.kit ? 1 : 0].map(function (x) { return String(x).replace(/[|,]/g, ' '); }).join('|'); }).join(',');
        history.replaceState(null, '', '#rooms=' + encodeURIComponent(st) + '&climate=' + f('climate').value + '&insul=' + f('insul').value + (f('mode') ? '&mode=' + f('mode').value : ''));
      }
    }

    var h = readHash();
    ['climate', 'insul', 'mode'].forEach(function (k) { if (h[k] && f(k)) f(k).value = h[k]; });
    var start = (h.rooms || '').split(',').filter(Boolean).map(function (t) { var p = t.split('|'); return { name: p[0], l: p[1], w: p[2], h: p[3], sun: p[4], ppl: p[5], kit: p[6] === '1' }; });
    if (!start.length) start = [cfg.firstRoom || {}];
    rows.innerHTML = start.map(function (o, i) { return rowHtml(i, o); }).join('');
    var timer;
    form.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(calc, 150); });
    form.addEventListener('change', calc);
    form.addEventListener('submit', function (e) { e.preventDefault(); calc(); });
    root.querySelector('[data-add]').addEventListener('click', function () {
      var n = rows.querySelectorAll('[data-row]').length;
      rows.insertAdjacentHTML('beforeend', rowHtml(n, { name: 'Room ' + (n + 1), l: '', w: '' }));
      rows.lastElementChild.querySelectorAll('input')[1].focus();
    });
    root.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del && rows.querySelectorAll('[data-row]').length > 1) {
        del.closest('[data-row]').remove();
        var all = raw();
        rows.innerHTML = all.map(function (o, i) { return rowHtml(i, o); }).join('');
        calc();
      }
      var share = e.target.closest('[data-share]');
      if (share && navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { share.textContent = 'Link copied'; setTimeout(function () { share.textContent = 'Copy link to this result'; }, 2000); });
    });
    calc();
  }

  for (var i = 0; i < roots.length; i++) setup(roots[i], JSON.parse(roots[i].getAttribute('data-config')));
})();
