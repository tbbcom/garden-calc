/* tool.homegardenlot.com: menu, sortable/filterable tables, copy buttons, offline support */
(function () {
  'use strict';
  var d = document;

  var toggle = d.querySelector('.hgt-nav__toggle');
  var nav = d.getElementById('hgt-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('hgt-nav--open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Cells carry a numeric data-v so dates sort by season, not alphabetically.
  Array.prototype.forEach.call(d.querySelectorAll('table[data-sortable]'), function (table) {
    var heads = table.querySelectorAll('thead th');
    Array.prototype.forEach.call(heads, function (th, col) {
      var btn = th.querySelector('button');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var asc = th.getAttribute('aria-sort') !== 'ascending';
        Array.prototype.forEach.call(heads, function (h) { h.removeAttribute('aria-sort'); });
        th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
        var body = table.tBodies[0];
        var rows = Array.prototype.slice.call(body.rows);
        rows.sort(function (a, b) {
          var x = a.cells[col], y = b.cells[col];
          var vx = x.getAttribute('data-v'), vy = y.getAttribute('data-v');
          var r = vx !== null && vy !== null ? vx - vy : x.textContent.localeCompare(y.textContent);
          return asc ? r : -r;
        });
        rows.forEach(function (r) { body.appendChild(r); });
      });
    });
  });

  Array.prototype.forEach.call(d.querySelectorAll('[data-filter]'), function (input) {
    var table = d.getElementById(input.getAttribute('data-filter'));
    if (!table) return;
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      Array.prototype.forEach.call(table.tBodies[0].rows, function (r) {
        r.hidden = q && r.cells[0].textContent.toLowerCase().indexOf(q) === -1;
      });
    });
  });

  Array.prototype.forEach.call(d.querySelectorAll('[data-copy]'), function (btn) {
    btn.addEventListener('click', function () {
      var src = d.querySelector(btn.getAttribute('data-copy'));
      if (!src) return;
      if (window.dataLayer) window.dataLayer.push({ event: 'embed_code_copy' });
      var done = function () { btn.textContent = 'Copied!'; setTimeout(function () { btn.textContent = 'Copy code'; }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(src.value).then(done, function () { src.select(); });
      else { src.select(); d.execCommand('copy'); done(); }
    });
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }
})();
