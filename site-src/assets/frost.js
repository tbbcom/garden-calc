/* Frost dates by ZIP code: tools.homegardenlot.com (NOAA 1991–2020 normals, nearest stations) */
(function () {
  'use strict';
  var roots = document.querySelectorAll('[data-hgt-frost]');
  if (!roots.length) return;

  var DAY = 864e5;
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var STORE = 'hgt:zip';
  var cache = {};

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function today() { var t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
  function md(v) { var p = /^(\d\d)-(\d\d)$/.exec(v || ''); return p ? [+p[1], +p[2]] : null; }
  function label(v) {
    if (v === 'rare') return 'Rare';
    if (v === 'all') return 'Any month';
    var m = md(v);
    return m ? MON[m[0] - 1] + ' ' + m[1] : '–';
  }
  function fmt(d) { return MON[d.getMonth()] + ' ' + d.getDate(); }
  // The next calendar occurrence of a month-day, counting today.
  function next(v) {
    var m = md(v);
    if (!m) return null;
    var t = today();
    var d = new Date(t.getFullYear(), m[0] - 1, m[1]);
    if (d < t) d = new Date(t.getFullYear() + 1, m[0] - 1, m[1]);
    return d;
  }
  function inDays(d) {
    var n = Math.round((d - today()) / DAY);
    return n === 0 ? 'today' : n === 1 ? 'tomorrow' : 'in ' + n + ' days';
  }
  function shift(v, weeks) {
    var m = md(v);
    if (!m) return null;
    var t = today();
    // Anchor to the season that hasn't fully passed so plans point forward.
    var base = new Date(t.getFullYear(), m[0] - 1, m[1]);
    if (base.getTime() + 6 * 7 * DAY < t.getTime()) base = new Date(t.getFullYear() + 1, m[0] - 1, m[1]);
    return new Date(base.getTime() + weeks * 7 * DAY);
  }
  function span(v, a, b) {
    var x = shift(v, a), y = shift(v, b);
    return x && y ? fmt(x) + ' – ' + fmt(y) : null;
  }

  function load(base, prefix) {
    if (cache[prefix]) return Promise.resolve(cache[prefix]);
    return fetch(base + prefix + '.json').then(function (r) {
      if (r.status === 404) return { s: {}, z: {} };
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) { cache[prefix] = j; return j; });
  }

  function stat(cls, name, value, hint) {
    return '<div class="hgt-stat' + (cls ? ' ' + cls : '') + '"><span class="hgt-stat__label">' + name +
      '</span><span class="hgt-stat__value">' + value + '</span>' + (hint ? '<span class="hgt-stat__hint">' + hint + '</span>' : '') + '</div>';
  }

  function render(root, zip, data) {
    var near = data.z[zip];
    var out = root.querySelector('.hgt-frost__out');
    var compact = root.hasAttribute('data-compact');
    var s = data.s[near[0][0]];
    var dist = near[0][1];
    // [name, st, lat, lon, elevFt, last50, last10, first50, first10, season50, hard50, hardFirst50]
    var last50 = s[5], last10 = s[6], first50 = s[7], first10 = s[8], season = s[9];
    var html = '<h2 class="hgt-frost__head">Frost dates for ZIP ' + esc(zip) + '</h2>';
    var stats = '';

    if (last50 === 'rare') {
      stats += stat('', 'Frost risk', 'Rare', 'Too few freezes in 1991–2020 to compute a date');
      stats += stat('', 'Frost-free days', season ? Math.round(season) : '365', 'Median per year');
    } else if (last50 === 'all') {
      stats += stat('hgt-stat--frost', 'Frost risk', 'Any month', 'A 32°F night is possible all year');
      stats += stat('', 'Frost-free days', season ? Math.round(season) : '–', 'Median per year');
    } else {
      var nl = next(last50), nf = next(first50);
      stats += stat('hgt-stat--frost', 'Last spring frost', label(last50), 'Median (50% chance later) · ' + inDays(nl));
      stats += stat('', 'Safer planting date', label(last10), 'Only a 10% chance of frost after this');
      stats += stat('hgt-stat--frost', 'First fall frost', label(first50), 'Median · ' + inDays(nf));
      if (!compact) stats += stat('', 'Early fall frost', label(first10), '10% chance of frost before this');
      stats += stat('', 'Frost-free days', season ? Math.round(season) : '–', 'Median growing season');
    }
    html += '<div class="hgt-frost__stats">' + stats + '</div>';

    if (!compact && md(last50) && md(first50)) {
      var todo = [
        ['Start tomato seeds indoors', span(last50, -8, -6)],
        ['Sow peas and spinach outdoors', span(last50, -6, -4)],
        ['Transplant tomatoes and peppers', 'from ' + label(last10)],
        ['Plant garlic for next summer', span(first50, -2, 2)]
      ].filter(function (p) { return p[1]; });
      html += '<h3>What to do when</h3><ul class="hgt-frost__plan"><li>' + todo.map(function (p) {
        return '<strong>' + p[0] + ':</strong> ' + p[1];
      }).join('</li><li>') + '</li></ul>';
    }

    html += '<p class="hgt-frost__station">Nearest NOAA weather station: <strong>' + esc(s[0]) + ', ' + esc(s[1]) + '</strong>, ' +
      dist + ' mi away, elevation ' + Number(s[4]).toLocaleString('en-US') + ' ft.' +
      (dist > 30 ? ' This station is far away, so treat the dates as a rough guide.' : '') + '</p>';

    if (!compact && near.length > 1) {
      html += '<details class="hgt-frost__alt"><summary>Compare nearby stations</summary><ul>' + near.slice(1).map(function (n) {
        var x = data.s[n[0]];
        return '<li>' + esc(x[0]) + ', ' + esc(x[1]) + ' (' + n[1] + ' mi, ' + Number(x[4]).toLocaleString('en-US') + ' ft): last frost ' +
          label(x[5]) + ', first frost ' + label(x[7]) + '</li>';
      }).join('') + '</ul></details>';
    }

    var planUrl = root.getAttribute('data-plan-url');
    if (planUrl) {
      html += '<div class="hgt-frost__actions"><a class="hgt-btn" href="' + esc(planUrl) + '#zip=' + esc(zip) + '"' +
        (compact ? ' target="_blank" rel="noopener"' : '') + '>Get my planting calendar</a></div>';
    }
    out.innerHTML = html;
    out.hidden = false;
  }

  function setup(root) {
    var form = root.querySelector('form');
    var input = root.querySelector('input');
    var status = root.querySelector('.hgt-frost__status');
    var base = root.getAttribute('data-src') || '/data/frost/zip/';

    function say(msg, err) {
      status.textContent = msg;
      status.classList.toggle('hgt-frost__status--error', !!err);
    }

    function lookup(zip, quiet) {
      if (!/^\d{5}$/.test(zip)) { say('Enter a 5-digit US ZIP code.', true); return; }
      say('Looking up ' + zip + '…');
      load(base, zip.slice(0, 3)).then(function (data) {
        if (data.z[zip] && data.z[zip][0][1] > 100) {
          say('There is no NOAA frost station within 100 miles of ZIP ' + zip + ', so we can\'t give reliable frost dates here.', true);
          return;
        }
        if (!data.z[zip]) {
          say('ZIP ' + zip + ' is not in the Census ZIP list (PO boxes and business-only ZIPs are not). Try a nearby residential ZIP.', true);
          return;
        }
        say('');
        render(root, zip, data);
        // Analytics event: the station's state only, never the ZIP code (see /privacy/).
        if (window.dataLayer) window.dataLayer.push({ event: 'frost_lookup', frost_state: data.s[data.z[zip][0][0]][1], frost_embed: root.hasAttribute('data-compact') });
        try { localStorage.setItem(STORE, zip); } catch (e) { /* storage blocked */ }
        if (!quiet && !root.hasAttribute('data-compact') && history.replaceState) history.replaceState(null, '', '#zip=' + zip);
      }).catch(function () {
        say('Could not load the frost data. Check your connection and try again.', true);
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      lookup(input.value.replace(/\D/g, '').slice(0, 5));
    });

    var h = /zip=(\d{5})/.exec(location.hash);
    var saved = null;
    try { saved = localStorage.getItem(STORE); } catch (e) { /* storage blocked */ }
    var start = h ? h[1] : saved;
    if (start) { input.value = start; lookup(start, true); }
  }

  for (var i = 0; i < roots.length; i++) setup(roots[i]);
})();
