/* Hardiness zone by ZIP code: tools.homegardenlot.com (USDA 2023 map, plus NOAA frost dates) */
(function () {
  'use strict';
  var roots = document.querySelectorAll('[data-hgt-zone]');
  if (!roots.length) return;

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var STORE = 'hgt:zip';
  var cache = {};

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function label(v) {
    if (v === 'rare') return 'Rare';
    if (v === 'all') return 'Any month';
    var p = /^(\d\d)-(\d\d)$/.exec(v || '');
    return p ? MON[+p[1] - 1] + ' ' + +p[2] : '–';
  }
  // Zone 1a starts at -60°F; each half zone is 5°F wider.
  function low(z) { return -60 + (parseInt(z, 10) - 1) * 10 + (/b$/.test(z) ? 5 : 0); }
  function f(n) { return (n < 0 ? '−' : '') + Math.abs(n) + '°F'; }
  function c(n) { var v = Math.round((n - 32) * 5 / 9); return (v < 0 ? '−' : '') + Math.abs(v) + '°C'; }
  function hue(z) { return Math.round(225 - ((parseInt(z, 10) * 2 + (/b$/.test(z) ? 1 : 0) - 2) / 25) * 205); }

  function load(url) {
    if (cache[url]) return Promise.resolve(cache[url]);
    return fetch(url).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) { cache[url] = j; return j; });
  }

  function stat(cls, name, value, hint) {
    return '<div class="hgt-stat' + (cls ? ' ' + cls : '') + '"><span class="hgt-stat__label">' + name +
      '</span><span class="hgt-stat__value">' + value + '</span>' + (hint ? '<span class="hgt-stat__hint">' + hint + '</span>' : '') + '</div>';
  }

  function render(root, zip, zone, frost, state) {
    var out = root.querySelector('.hgt-frost__out');
    var lo = low(zone);
    var html = '<h2 class="hgt-frost__head">ZIP ' + esc(zip) + ' is in hardiness zone <span class="hgt-zone hgt-zone--lg" style="--hgt-zone-h:' + hue(zone) + '">' + esc(zone) + '</span></h2>';
    var stats = stat('hgt-stat--frost', 'Coldest winter night', f(lo) + ' to ' + f(lo + 5), c(lo) + ' to ' + c(lo + 5) + ' · average annual minimum');
    stats += stat('', 'Plants to choose', 'Zone ' + parseInt(zone, 10) + ' or lower', 'Rated hardy to zone ' + esc(zone) + ' or colder');

    var near = frost && frost.z[zip] && frost.z[zip][0];
    var s = near && near[1] <= 100 ? frost.s[near[0]] : null;
    // Station row: [name, st, lat, lon, elevFt, last50, last10, first50, first10, season50, …]
    if (s && /^\d/.test(s[5])) {
      stats += stat('hgt-stat--frost', 'Last spring frost', label(s[5]), 'Plant tender crops after ' + label(s[6]));
      stats += stat('', 'First fall frost', label(s[7]), s[9] ? Math.round(s[9]) + ' frost-free days' : '');
    } else if (s && s[5] === 'rare') {
      stats += stat('', 'Frost risk', 'Rare', 'Frost-free in most years');
    }
    html += '<div class="hgt-frost__stats">' + stats + '</div>';
    html += '<p class="hgt-frost__station">Zone from the USDA 2023 Plant Hardiness Zone Map' +
      (s ? '. Frost dates from the nearest NOAA station, <strong>' + esc(s[0]) + ', ' + esc(s[1]) + '</strong> (' + near[1] + ' mi).' : '.') + '</p>';

    var actions = [];
    var plan = root.getAttribute('data-plan-url');
    if (plan) actions.push('<a class="hgt-btn" href="' + esc(plan) + '#zip=' + esc(zip) + '">Get my planting calendar</a>');
    if (state && location.pathname !== '/hardiness-zones/' + state[3] + '/') {
      actions.push('<a class="hgt-btn hgt-btn--ghost" href="/hardiness-zones/' + esc(state[3]) + '/">Zones across ' + esc(state[4]) + '</a>');
    }
    if (s) actions.push('<a class="hgt-btn hgt-btn--ghost" href="/frost-dates/#zip=' + esc(zip) + '">Full frost dates</a>');
    if (actions.length) html += '<div class="hgt-frost__actions">' + actions.join('') + '</div>';
    out.innerHTML = html;
    out.hidden = false;
  }

  function stateOf(ranges, zip) {
    var p = +zip.slice(0, 3);
    for (var i = 0; i < ranges.length; i++) if (p >= ranges[i][0] && p <= ranges[i][1]) return ranges[i];
    return null;
  }

  function setup(root) {
    var form = root.querySelector('form');
    var input = root.querySelector('input');
    var status = root.querySelector('.hgt-frost__status');
    var ranges = [];
    try { ranges = JSON.parse(root.getAttribute('data-states') || '[]'); } catch (e) { /* bad attribute */ }

    function say(msg, err) {
      status.textContent = msg;
      status.classList.toggle('hgt-frost__status--error', !!err);
    }

    function lookup(zip, quiet) {
      if (!/^\d{5}$/.test(zip)) { say('Enter a 5-digit US ZIP code.', true); return; }
      say('Looking up ' + zip + '…');
      var p = zip.slice(0, 3);
      Promise.all([
        load('/data/zones/' + p + '.json'),
        load('/data/frost/zip/' + p + '.json').catch(function () { return null; })
      ]).then(function (r) {
        var zone = r[0] && r[0][zip];
        if (!zone) {
          say('ZIP ' + zip + ' is not in the USDA zone files (PO box and business-only ZIPs are not). Try a nearby residential ZIP.', true);
          return;
        }
        var state = stateOf(ranges, zip);
        say('');
        render(root, zip, zone, r[1], state);
        // Analytics event: zone and state only, never the ZIP code (see /privacy/).
        var ev = { zone: zone, zone_state: state ? state[2] : '' };
        if (window.hgtGA4 && window.gtag) window.gtag('event', 'zone_lookup', ev);
        else if (window.dataLayer) window.dataLayer.push(Object.assign({ event: 'zone_lookup' }, ev));
        try { localStorage.setItem(STORE, zip); } catch (e) { /* storage blocked */ }
        if (!quiet && history.replaceState) history.replaceState(null, '', '#zip=' + zip);
      }).catch(function () {
        say('Could not load the zone data. Check your connection and try again.', true);
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
