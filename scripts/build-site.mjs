#!/usr/bin/env node
// Builds the static site for tool.homegardenlot.com into _site/ from site-src/ and data/frost/.
// Every number on the generated pages comes from NOAA's 1991–2020 normals (data/frost/stations.json).
//
// Usage: node scripts/build-site.mjs
import { mkdir, readFile, writeFile, rm, cp, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const SITE = 'https://tool.homegardenlot.com';
const MAIN = 'https://www.homegardenlot.com';
const BRAND = 'Home Garden Lot';
const ORG_ID = `${MAIN}/#organization`;
const LOGO = 'https://blogger.googleusercontent.com/img/a/AVvXsEjoJpzMbdp1wYSHq9FW-psCak7EAnomwXHFP0PLmjO9oj7qYViGtHMvMQaROVdxWLXHulSUqRJ0PGqg8Kj82uquNfFDDssLYe8ZIQdMgD_004eTkwwXpuU5h0T2k5MOgQ1J6aDfIwToU3XmkKTSIw2ASFhZ-sJhzeYnzqMQdiNcLXZFZ1B2vg2o1--ECfdrY=s150';
const PLAN_URL = `${MAIN}/p/planting-calendar.html`;
const OUT = '_site';
const CSV_NAME = 'frost-dates-1991-2020.csv';
const NOAA_URL = 'https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals';
const LICENSE = 'https://creativecommons.org/licenses/by/4.0/';

const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  PR: 'Puerto Rico',
};
const MAIN_TOOLS = [
  ['🌱', 'Planting Calendar by ZIP', `${MAIN}/p/planting-calendar.html`, 'Start-indoors, transplant and sowing dates for 30 vegetables and herbs, built from your frost dates.'],
  ['🪵', 'Mulch Calculator', `${MAIN}/p/mulch-calculator.html`, 'Cubic yards, bags and cost for any bed shape, with depth guidance by mulch type.'],
  ['🪴', 'Soil Calculator', `${MAIN}/p/soil-calculator.html`, 'Soil for raised beds and borders in cubic feet, yards and bags.'],
  ['🪨', 'Topsoil & Gravel Calculator', `${MAIN}/p/topsoil-gravel-calculator.html`, 'Tons and yards of topsoil, gravel and sand for paths, bases and fills.'],
  ['🌾', 'Lawn Fertilizer Calculator', `${MAIN}/p/lawn-fertilizer-npk-calculator.html`, 'Pounds of product per 1,000 sq ft from the NPK numbers on the bag.'],
  ['🧱', 'Paver & Patio Calculator', `${MAIN}/p/paver-patio-calculator.html`, 'Pavers, base gravel and sand for a patio or walkway.'],
];

// ---------- helpers ----------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const isDate = (v) => /^\d\d-\d\d$/.test(v || '');
const doy = (v) => { const [m, d] = v.split('-').map(Number); return CUM[m - 1] + d; };
const fromDoy = (n) => { n = Math.round(n); let m = 11; while (m > 0 && CUM[m] >= n) m--; return `${String(m + 1).padStart(2, '0')}-${String(n - CUM[m]).padStart(2, '0')}`; };
const short = (v) => (v === 'rare' ? 'Rare' : v === 'all' ? 'Any month' : isDate(v) ? `${MON[+v.slice(0, 2) - 1]} ${+v.slice(3)}` : '–');
const long = (v) => (isDate(v) ? `${MONTH[+v.slice(0, 2) - 1]} ${+v.slice(3)}` : short(v));
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const plural = (n, w) => `${fmtInt(n)} ${w}${Math.round(n) === 1 ? '' : 's'}`;
// Spring-frost dates in the late fall (warm sites) sort better as negative days.
const springDoy = (v) => { const d = doy(v); return d > 250 ? d - 365 : d; };
const springFromDoy = (n) => fromDoy(n < 1 ? n + 365 : n);
const fallDoy = (v) => { const d = doy(v); return d < 120 ? d + 365 : d; };
const fallFromDoy = (n) => fromDoy(n > 365 ? n - 365 : n);
const jsonLd = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

function slope(points) {
  const n = points.length;
  if (n < 8) return null;
  const mx = points.reduce((a, p) => a + p[0], 0) / n;
  const my = points.reduce((a, p) => a + p[1], 0) / n;
  let num = 0, den = 0;
  for (const [x, y] of points) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
  return den ? num / den : null;
}

// ---------- layout ----------
const LEAF = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#247b49"/><path d="M9 23c0-8 5-13 14-14-1 9-6 14-14 14Zm0 0 7-7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const NAV = [
  ['/frost-dates/', 'Frost Dates'],
  ['/frost-dates/#states', 'By State'],
  ['/data/', 'Free Data'],
  ['/embed/', 'Embed'],
  ['/about/', 'About'],
];

function page({ path, title, description, body, crumbs = [], schema = [], scripts = [], noindex = false, active }) {
  const url = SITE + path;
  const crumbHtml = crumbs.length
    ? `<nav class="hgt-crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Tools</a></li>${crumbs.map(([p, n], i) => (i === crumbs.length - 1 ? `<li aria-current="page">${esc(n)}</li>` : `<li><a href="${p}">${esc(n)}</a></li>`)).join('')}</ol></nav>`
    : '';
  const graph = [...schema];
  if (crumbs.length) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [['/', 'Tools'], ...crumbs].map(([p, n], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: SITE + p.replace(/#.*$/, '') })),
    });
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
${noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">'}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${BRAND} Tools">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#247b49">
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/icon-192.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="stylesheet" href="/assets/site.css">
${graph.length ? jsonLd({ '@context': 'https://schema.org', '@graph': graph }) : ''}
</head>
<body>
<a class="hgt-skip" href="#main">Skip to content</a>
<header class="hgt-header">
  <div class="hgt-wrap hgt-header__in">
    <a class="hgt-logo" href="/">${LEAF}<span>${BRAND} <span class="hgt-logo__sub">Tools</span></span></a>
    <button class="hgt-nav__toggle" type="button" aria-expanded="false" aria-controls="hgt-nav">Menu</button>
    <nav class="hgt-nav" id="hgt-nav" aria-label="Main">
      <ul class="hgt-nav__list">
        ${NAV.map(([p, n]) => `<li><a class="hgt-nav__link" href="${p}"${active === p ? ' aria-current="page"' : ''}>${n}</a></li>`).join('\n        ')}
        <li><a class="hgt-nav__link" href="${MAIN}/">Guides &amp; blog ↗</a></li>
      </ul>
    </nav>
  </div>
</header>
<main class="hgt-main" id="main">
  <div class="hgt-wrap">
    ${crumbHtml}
    ${body}
  </div>
</main>
<footer class="hgt-footer">
  <div class="hgt-wrap hgt-footer__grid">
    <div class="hgt-footer__about">
      <p class="hgt-footer__title">${BRAND} Tools</p>
      <p class="hgt-footer__text">Free garden tools built on public data from NOAA, the USDA and university extension services. Companion to <a href="${MAIN}/">${BRAND}</a>, practical guides for growing food and improving your home.</p>
    </div>
    <div>
      <p class="hgt-footer__title">Data tools</p>
      <ul class="hgt-footer__list">
        <li><a href="/frost-dates/">Frost dates by ZIP</a></li>
        <li><a href="/frost-dates/#states">Frost dates by state</a></li>
        <li><a href="/data/">Download the data</a></li>
        <li><a href="/embed/">Embed on your site</a></li>
      </ul>
    </div>
    <div>
      <p class="hgt-footer__title">Calculators</p>
      <ul class="hgt-footer__list">
        ${MAIN_TOOLS.slice(0, 5).map(([, n, u]) => `<li><a href="${u}">${n}</a></li>`).join('\n        ')}
      </ul>
    </div>
    <div>
      <p class="hgt-footer__title">Company</p>
      <ul class="hgt-footer__list">
        <li><a href="/about/">About these tools</a></li>
        <li><a href="${MAIN}/p/about.html">About &amp; Author</a></li>
        <li><a href="${MAIN}/p/contact.html">Contact</a></li>
        <li><a href="${MAIN}/p/privacy-policy.html">Privacy Policy</a></li>
        <li><a href="${MAIN}/p/disclaimer.html">Disclaimer</a></li>
      </ul>
    </div>
  </div>
  <div class="hgt-footer__bar">© ${new Date().getUTCFullYear()} ${BRAND}. Frost data: NOAA NCEI 1991–2020 U.S. Climate Normals. Dates are long-term averages, not forecasts.</div>
</footer>
<script src="/assets/site.js" defer></script>
${scripts.map((s) => `<script src="${s}" defer></script>`).join('\n')}
</body>
</html>
`;
}

const frostWidget = (id, compact = false) => `<div class="hgt-card hgt-frost" data-hgt-frost data-plan-url="${PLAN_URL}"${compact ? ' data-compact' : ''}>
  <form class="hgt-frost__form" novalidate>
    <div>
      <label class="hgt-frost__label" for="${id}">Your ZIP code</label>
      <input class="hgt-frost__input" id="${id}" inputmode="numeric" autocomplete="postal-code" maxlength="5" pattern="[0-9]{5}" placeholder="e.g. 10001">
    </div>
    <button class="hgt-btn" type="submit">Find frost dates</button>
  </form>
  <p class="hgt-frost__status" role="status" aria-live="polite"></p>
  <div class="hgt-frost__out" hidden></div>
</div>`;

const faqBlock = (faqs) => `<section class="hgt-faq hgt-read"><h2>Frequently asked questions</h2>${faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join('')}</section>`;
const faqSchema = (faqs) => ({
  '@type': 'FAQPage',
  mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })),
});
const datasetSchema = (meta, extra = {}) => ({
  '@type': 'Dataset',
  name: 'U.S. frost dates by weather station (1991–2020 normals)',
  description: `Median and 10%-risk last spring and first fall 32°F freeze dates, 28°F hard-freeze dates and frost-free days for ${fmtInt(meta.stations)} U.S. weather stations, derived from NOAA NCEI 1991–2020 U.S. Climate Normals, with a ZIP-code lookup for ${fmtInt(meta.zips)} ZIP codes.`,
  url: `${SITE}/data/`,
  creator: { '@id': ORG_ID },
  publisher: { '@id': ORG_ID },
  license: LICENSE,
  isAccessibleForFree: true,
  isBasedOn: NOAA_URL,
  temporalCoverage: '1991/2020',
  spatialCoverage: { '@type': 'Place', name: 'United States' },
  dateModified: meta.built,
  variableMeasured: ['Median last spring frost date (32°F)', 'Median first fall frost date (32°F)', 'Frost-free days', 'Hard freeze date (28°F)'],
  distribution: [{ '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: `${SITE}/data/${CSV_NAME}` }],
  ...extra,
});
const orgRef = { '@type': 'Organization', '@id': ORG_ID, name: BRAND, url: `${MAIN}/`, logo: LOGO };

// ---------- state statistics ----------
function stateStats(list) {
  const dated = list.filter((s) => isDate(s.last50) && isDate(s.first50));
  const rare = list.filter((s) => s.last50 === 'rare').length;
  const all = list.filter((s) => s.last50 === 'all').length;
  if (!dated.length) return { n: list.length, dated: 0, rare, all };
  const byLast = [...dated].sort((a, b) => springDoy(a.last50) - springDoy(b.last50));
  const byFirst = [...dated].sort((a, b) => fallDoy(a.first50) - fallDoy(b.first50));
  const seasons = dated.map((s) => s.season50).filter((v) => v !== null);
  const bySeason = [...dated].filter((s) => s.season50 !== null).sort((a, b) => a.season50 - b.season50);
  const st = {
    n: list.length, dated: dated.length, rare, all,
    medLast: springFromDoy(median(dated.map((s) => springDoy(s.last50)))),
    medFirst: fallFromDoy(median(dated.map((s) => fallDoy(s.first50)))),
    medSafe: springFromDoy(median(dated.filter((s) => isDate(s.last10)).map((s) => springDoy(s.last10)))),
    medSeason: median(seasons),
    earliest: byLast[0], latest: byLast[byLast.length - 1],
    firstEarly: byFirst[0], firstLate: byFirst[byFirst.length - 1],
    shortest: bySeason[0], longest: bySeason[bySeason.length - 1],
  };
  // Elevation effect (days per 1,000 ft) when the state has real relief.
  const elevs = dated.map((s) => s.elevFt);
  if (Math.max(...elevs) - Math.min(...elevs) >= 1500) {
    const k = slope(dated.map((s) => [s.elevFt / 1000, springDoy(s.last50)]));
    if (k !== null && k >= 2) st.elevDays = Math.round(k);
  }
  // North vs south thirds by latitude.
  if (dated.length >= 9) {
    const byLat = [...dated].sort((a, b) => a.lat - b.lat);
    const t = Math.floor(byLat.length / 3);
    const south = median(byLat.slice(0, t).map((s) => springDoy(s.last50)));
    const north = median(byLat.slice(-t).map((s) => springDoy(s.last50)));
    const diff = Math.round(north - south);
    if (Math.abs(diff) >= 5) st.northSouth = { diff, northLat: byLat[byLat.length - t].lat, southLat: byLat[t - 1].lat };
  }
  return st;
}

// ---------- pages ----------
function statePage(code, list, meta) {
  const name = STATES[code];
  const st = stateStats(list);
  const path = `/frost-dates/${slug(name)}/`;
  const title = `${name} Frost Dates: Last and First Frost by Town`;
  let description = `Average last spring and first fall frost dates for ${plural(st.n, 'NOAA weather station')} in ${name} (1991–2020 normals). Look up your ZIP code for local dates.`;
  if (description.length > 160) description = `Last and first frost dates for ${plural(st.n, 'weather station')} in ${name} from NOAA 1991–2020 normals. Look up your ZIP code.`;

  let answer;
  const faqs = [];
  if (st.dated) {
    answer = `<p>Across ${name}'s ${plural(st.dated, 'NOAA station')} with regular frost, the median <strong>last spring frost is ${long(st.medLast)}</strong> and the median <strong>first fall frost is ${long(st.medFirst)}</strong>. Last frost dates range from ${long(st.earliest.last50)} at ${esc(st.earliest.name)} to ${long(st.latest.last50)} at ${esc(st.latest.name)}, so enter your ZIP code below for the station nearest you.</p>`;
    faqs.push([`When is the last frost in ${name}?`, `The median last spring frost (32°F) across ${name}'s NOAA weather stations is ${long(st.medLast)}, based on 1991–2020 climate normals. It ranges from ${long(st.earliest.last50)} at ${esc(st.earliest.name)} to ${long(st.latest.last50)} at ${esc(st.latest.name)}. For a safer planting date, use the 10%-risk date; the state median for that is ${long(st.medSafe)}.`]);
    faqs.push([`When is the first frost in ${name}?`, `The median first fall frost across ${name}'s stations is ${long(st.medFirst)}. The earliest median first frost is ${long(st.firstEarly.first50)} at ${esc(st.firstEarly.name)}, and the latest is ${long(st.firstLate.first50)} at ${esc(st.firstLate.name)}.`]);
    if (st.medSeason !== null) faqs.push([`How long is the growing season in ${name}?`, `The median frost-free season is ${plural(st.medSeason, 'day')} across ${name}'s stations, from ${plural(st.shortest.season50, 'day')} at ${esc(st.shortest.name)} to ${plural(st.longest.season50, 'day')} at ${esc(st.longest.name)}.`]);
    faqs.push([`When should I plant tomatoes in ${name}?`, `Plant tomatoes outdoors after your local last frost, ideally after the 10%-risk date when nights stay above 50°F. At a typical ${name} station that means starting seeds indoors 6–8 weeks before ${long(st.medLast)} and transplanting from about ${long(st.medSafe)}. Check your ZIP code, because dates vary by weeks across the state.`]);
  } else {
    answer = `<p>Frost is rare at most of ${name}'s ${plural(st.n, 'NOAA station')}: freezing nights happen too seldom in 1991–2020 records to compute an average date. Higher-elevation sites are the exception.</p>`;
  }
  if (st.rare) faqs.push([`Does it frost everywhere in ${name}?`, `No. At ${plural(st.rare, 'station')} in ${name}, 32°F nights were too rare in 1991–2020 to compute an average frost date, so those places are frost-free in most years.`]);
  if (st.all) faqs.push([`Can it frost in summer in ${name}?`, `Yes, at ${plural(st.all, 'station')} in ${name} a 32°F night is possible in any month, mostly at high elevation or far north. There is no reliable frost-free season there; use cold-hardy crops and row covers.`]);

  const insights = [];
  if (st.elevDays) insights.push(`<li><strong>Elevation matters:</strong> across ${name}'s stations, each 1,000 ft of elevation delays the median last frost by about ${plural(st.elevDays, 'day')}.</li>`);
  if (st.northSouth) insights.push(`<li><strong>North vs south:</strong> stations in the northern third of the state (north of ${st.northSouth.northLat.toFixed(1)}°N) reach their median last frost about ${plural(Math.abs(st.northSouth.diff), 'day')} ${st.northSouth.diff > 0 ? 'later' : 'earlier'} than the southern third (south of ${st.northSouth.southLat.toFixed(1)}°N).</li>`);
  if (st.dated) insights.push(`<li><strong>Safety margin:</strong> the median 10%-risk date (${long(st.medSafe)}) is about ${plural(springDoy(st.medSafe) - springDoy(st.medLast), 'day')} after the median last frost. Waiting until then cuts the chance of a killing frost on tender transplants from 1 in 2 to 1 in 10.</li>`);
  if (st.rare) insights.push(`<li><strong>Frost-free sites:</strong> ${plural(st.rare, 'station')} rarely see 32°F at all.</li>`);

  const major = list.filter((s) => s.id.startsWith('USW'));
  const rowsHtml = (rows) => rows.map((s) => `<tr><td>${esc(s.name)}</td><td data-v="${s.elevFt}">${fmtInt(s.elevFt)}</td><td data-v="${isDate(s.last50) ? springDoy(s.last50) : s.last50 === 'rare' ? -999 : 999}">${short(s.last50)}</td><td data-v="${isDate(s.last10) ? springDoy(s.last10) : 0}">${short(s.last10)}</td><td data-v="${isDate(s.first50) ? fallDoy(s.first50) : s.first50 === 'rare' ? 999 : -999}">${short(s.first50)}</td><td data-v="${s.season50 ?? -1}">${s.season50 === null ? '–' : fmtInt(s.season50)}</td></tr>`).join('');
  const table = (rows, id) => `<div class="hgt-table-wrap"><table class="hgt-table" id="${id}" data-sortable>
<thead><tr><th scope="col"><button type="button">Station</button></th><th scope="col"><button type="button">Elev. (ft)</button></th><th scope="col"><button type="button">Last frost</button></th><th scope="col"><button type="button">10% risk</button></th><th scope="col"><button type="button">First frost</button></th><th scope="col"><button type="button">Frost-free days</button></th></tr></thead>
<tbody>${rowsHtml(rows)}</tbody></table></div>`;

  const others = Object.entries(STATES).filter(([c]) => c !== code && meta.byState[c]).map(([, n]) => `<li><a href="/frost-dates/${slug(n)}/">${n}</a></li>`).join('');
  const body = `
<h1>${name} Frost Dates: Last and First Frost by Town</h1>
<p class="hgt-meta">${plural(st.n, 'NOAA weather station')} · 1991–2020 U.S. Climate Normals · Data updated ${meta.built}</p>
<div class="hgt-answer"><span class="hgt-answer__label">Quick answer</span>${answer}</div>
${frostWidget('hgt-zip')}
${insights.length ? `<section class="hgt-read"><h2>How frost dates vary across ${name}</h2><ul>${insights.join('')}</ul></section>` : ''}
${major.length >= 3 ? `<h2>Frost dates at ${name}'s major weather stations</h2><p class="hgt-read">These National Weather Service stations, mostly at airports, have the longest and most complete records in the state.</p>${table(major, 'hgt-major')}` : ''}
<h2>All ${plural(st.n, 'station')} in ${name}</h2>
<p class="hgt-read"><strong>Last frost</strong> and <strong>first frost</strong> are medians: a 50% chance of a 32°F night after (spring) or before (fall) that date. <strong>10% risk</strong> is the spring date with only a 1-in-10 chance of a later frost. Click a column to sort.</p>
<label class="hgt-frost__label" for="hgt-filter">Filter by station name</label>
<input class="hgt-filter" id="hgt-filter" type="search" placeholder="Type a town or airport…" data-filter="hgt-all">
${table(list, 'hgt-all')}
${faqs.length ? faqBlock(faqs) : ''}
<section class="hgt-read"><h2>How to use these dates</h2>
<p>Frost dates are 30-year averages from NOAA, not forecasts. Use them to plan seed starting and planting, then watch the 10-day forecast as the date approaches. Cold air settles in valleys and low spots, so a garden at the bottom of a slope can frost a week or more later in spring than the nearest station shows.</p>
<p>Ready to plan? The <a href="${PLAN_URL}">planting calendar by ZIP code</a> turns these dates into start-indoors, transplant and sowing dates for 30 crops.</p></section>
<section class="hgt-sources hgt-read"><h2>Sources and method</h2>
<p>Dates are the 32°F freeze probabilities published in the <a href="${NOAA_URL}" rel="nofollow">NOAA NCEI 1991–2020 U.S. Climate Normals</a> for each station. Station names are NOAA's, lightly expanded for readability. See the <a href="/about/">methodology</a> or <a href="/data/">download the full table</a>.</p></section>
<section><h2>Frost dates in other states</h2><ul class="hgt-states">${others}</ul></section>`;

  const schema = [
    { '@type': 'WebPage', '@id': `${SITE}${path}#webpage`, url: SITE + path, name: title, description, inLanguage: 'en-US', isPartOf: { '@id': `${SITE}/#website` }, dateModified: meta.built, about: { '@type': 'State', name } },
    datasetSchema(meta, { name: `${name} frost dates by weather station (1991–2020)`, url: SITE + path, spatialCoverage: { '@type': 'State', name }, description: `Median and 10%-risk last spring and first fall frost dates and frost-free days for ${plural(st.n, 'NOAA weather station')} in ${name}, from NOAA NCEI 1991–2020 U.S. Climate Normals.` }),
  ];
  if (faqs.length) schema.push(faqSchema(faqs));
  return {
    path, st,
    html: page({ path, title, description, body, active: '/frost-dates/#states', crumbs: [['/frost-dates/', 'Frost Dates'], [path, name]], schema, scripts: ['/assets/frost.js'] }),
  };
}

function frostIndex(states, meta) {
  const path = '/frost-dates/';
  const title = 'Frost Dates by ZIP Code: Last and First Frost (NOAA Data)';
  const description = `Find your average last spring and first fall frost dates by ZIP code, from ${fmtInt(meta.stations)} NOAA weather stations (1991–2020 normals). Free, no sign-up.`;
  const rows = states.filter((s) => s.st.dated).map((s) => `<tr><td><a href="${s.path}">${s.name}</a></td><td data-v="${springDoy(s.st.medLast)}">${short(s.st.medLast)}</td><td data-v="${springDoy(s.st.medSafe)}">${short(s.st.medSafe)}</td><td data-v="${fallDoy(s.st.medFirst)}">${short(s.st.medFirst)}</td><td data-v="${s.st.medSeason ?? -1}">${s.st.medSeason === null ? '–' : fmtInt(s.st.medSeason)}</td><td data-v="${s.st.n}">${fmtInt(s.st.n)}</td></tr>`).join('');
  const faqs = [
    ['What is a frost date?', 'A frost date is the average date of the last 32°F night in spring or the first 32°F night in fall at a location. Gardeners use them to time seed starting, transplanting and fall planting. They are long-term averages, not forecasts.'],
    ['What is the difference between the median and the 10%-risk frost date?', 'The median last frost date has a 50% chance of another frost after it, so planting tender crops on that day is a coin flip. The 10%-risk date has only a 1-in-10 chance of a later frost, which makes it a safer target for tomatoes, peppers and other warm-season transplants.'],
    ['Where do these frost dates come from?', `From the NOAA National Centers for Environmental Information 1991–2020 U.S. Climate Normals, which publish freeze-date probabilities for ${fmtInt(meta.stations)} weather stations used here. Your ZIP code is matched to the nearest stations by distance from the Census Bureau ZIP code centroid.`],
    ['Why is my frost date different from my neighbor\'s?', 'Frost depends on elevation, slope and distance from water. Cold air drains into valleys, cities hold heat, and coastal sites frost later in fall. Compare the three nearest stations shown in the results and lean toward the one most like your garden.'],
    ['Is a hard freeze different from a frost?', 'Yes. Frost dates here use 32°F, which kills tender plants such as tomatoes, basil and squash. A hard freeze is 28°F or lower and damages most cool-season crops too; it usually comes a week or more after the first fall frost.'],
  ];
  const stateLinks = states.map((s) => `<li><a href="${s.path}">${s.name}</a></li>`).join('');
  const body = `
<h1>Frost Dates by ZIP Code</h1>
<p class="hgt-lede">Your average last spring frost and first fall frost, from the nearest NOAA weather stations. Based on ${fmtInt(meta.stations)} stations and NOAA's official 1991–2020 climate normals.</p>
${frostWidget('hgt-zip')}
<div class="hgt-answer"><span class="hgt-answer__label">Quick answer</span><p>Enter your ZIP code to see your <strong>median last frost</strong> (50% chance of a later frost), a <strong>safer 10%-risk planting date</strong>, your <strong>first fall frost</strong> and the number of <strong>frost-free days</strong>. Plant tender crops like tomatoes after the 10%-risk date, and start seeds indoors 6–8 weeks before the last frost.</p></div>
<h2 id="states">Average frost dates by state</h2>
<p class="hgt-read">State medians across each state's NOAA stations. Dates within a state can differ by a month or more, so open your state for town-by-town tables.</p>
<div class="hgt-table-wrap"><table class="hgt-table" data-sortable>
<thead><tr><th scope="col"><button type="button">State</button></th><th scope="col"><button type="button">Last frost</button></th><th scope="col"><button type="button">10% risk</button></th><th scope="col"><button type="button">First frost</button></th><th scope="col"><button type="button">Frost-free days</button></th><th scope="col"><button type="button">Stations</button></th></tr></thead>
<tbody>${rows}</tbody></table></div>
<h2>Frost dates by state, town by town</h2>
<ul class="hgt-states">${stateLinks}</ul>
${faqBlock(faqs)}
<section class="hgt-sources hgt-read"><h2>Sources</h2><p><a href="${NOAA_URL}" rel="nofollow">NOAA NCEI U.S. Climate Normals, 1991–2020</a> (freeze-date probabilities by station); U.S. Census Bureau 2024 ZIP Code Tabulation Area gazetteer (ZIP locations). <a href="/about/">How we match ZIP codes to stations.</a></p></section>`;
  const schema = [
    { '@type': 'WebApplication', '@id': `${SITE}${path}#app`, name: 'Frost Dates by ZIP Code', url: SITE + path, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any (web browser)', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description, publisher: { '@id': ORG_ID }, isPartOf: { '@id': `${SITE}/#website` } },
    datasetSchema(meta),
    faqSchema(faqs),
  ];
  return page({ path, title, description, body, active: '/frost-dates/', crumbs: [[path, 'Frost Dates']], schema, scripts: ['/assets/frost.js'] });
}

function homePage(meta) {
  const path = '/';
  const title = 'Free Garden Tools and Calculators | Home Garden Lot';
  const description = `Free garden tools built on public data: frost dates for ${fmtInt(meta.zips)} ZIP codes from NOAA, a planting calendar, and mulch, soil, gravel and fertilizer calculators.`;
  const card = ([icon, name, url, text], tag = '') => `<a class="hgt-card hgt-tool" href="${url}"><span class="hgt-tool__icon" aria-hidden="true">${icon}</span><h3 class="hgt-tool__title">${name}${tag ? `<span class="hgt-tool__tag">${tag}</span>` : ''}</h3><p class="hgt-tool__text">${text}</p><span class="hgt-tool__go">Open tool →</span></a>`;
  const body = `
<h1>Free garden tools, built on real data</h1>
<p class="hgt-lede">Plan planting, order the right amount of material and skip the guesswork. Every tool here is free, works on your phone and uses public data from NOAA, the USDA and university extension services.</p>
${frostWidget('hgt-zip')}
<h2>Data tools</h2>
<div class="hgt-grid">
${card(['❄️', 'Frost Dates by ZIP Code', '/frost-dates/', `Median and safer 10%-risk frost dates and frost-free days from the nearest of ${fmtInt(meta.stations)} NOAA stations.`], 'New')}
${card(['🗺️', 'Frost Dates by State', '/frost-dates/#states', 'Town-by-town last and first frost tables for every state, with how elevation shifts the dates.'])}
${card(['📊', 'Free Frost Date Dataset', '/data/', 'Download every station\'s frost dates as CSV for your blog, class or research. Free with attribution.'])}
${card(['🧩', 'Embed the Frost Date Tool', '/embed/', 'Add the ZIP-code frost lookup to your own garden club or nursery website in one line.'])}
</div>
<h2>Garden calculators</h2>
<div class="hgt-grid">
${MAIN_TOOLS.map((t) => card(t)).join('\n')}
</div>
<section class="hgt-read"><h2>Why trust these tools?</h2>
<p>Each tool shows its source and method. Frost dates come straight from NOAA's 1991–2020 climate normals; calculators use standard volume formulas and coverage rates checked against university extension publications. Nothing here needs an account, and the tools don't track what you type. <a href="/about/">Read the methodology.</a></p></section>`;
  const schema = [
    { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: `${BRAND} Tools`, inLanguage: 'en-US', publisher: { '@id': ORG_ID } },
    orgRef,
    { '@type': 'CollectionPage', '@id': `${SITE}/#webpage`, url: `${SITE}/`, name: title, description, isPartOf: { '@id': `${SITE}/#website` },
      mainEntity: { '@type': 'ItemList', itemListElement: [['Frost Dates by ZIP Code', `${SITE}/frost-dates/`], ...MAIN_TOOLS.map((t) => [t[1], t[2]])].map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, url: u })) } },
  ];
  return page({ path, title, description, body, schema, scripts: ['/assets/frost.js'] });
}

function dataPage(meta) {
  const path = '/data/';
  const title = 'Free U.S. Frost Date Dataset (CSV, NOAA 1991–2020)';
  const description = `Download last and first frost dates for ${fmtInt(meta.stations)} U.S. weather stations as CSV. Derived from NOAA 1991–2020 climate normals. Free under CC BY 4.0.`;
  const fields = [
    ['station_id', 'NOAA GHCN-Daily station ID'], ['station_name', 'Station name (NOAA abbreviations expanded)'], ['state', 'Two-letter state code'],
    ['latitude, longitude', 'Station location (decimal degrees)'], ['elevation_ft', 'Station elevation in feet'],
    ['last_frost_32f_median', 'Spring date with a 50% chance of a later 32°F freeze (MM-DD)'],
    ['last_frost_32f_10pct_risk', 'Spring date with a 10% chance of a later 32°F freeze'],
    ['last_frost_32f_90pct_risk', 'Spring date with a 90% chance of a later 32°F freeze'],
    ['first_frost_32f_median', 'Fall date with a 50% chance of an earlier 32°F freeze'],
    ['first_frost_32f_10pct_risk / 90pct_risk', 'Fall dates with a 10% / 90% chance of an earlier 32°F freeze'],
    ['last_hard_freeze_28f_median, first_hard_freeze_28f_median', 'Median spring and fall 28°F dates'],
    ['frost_free_days_median', 'Median days between the last spring and first fall 32°F freeze'],
    ['years_of_data', 'Years of 1991–2020 data behind the statistic'],
  ];
  const citation = `${BRAND} (${meta.built.slice(0, 4)}). U.S. frost dates by weather station, 1991–2020. Derived from NOAA NCEI U.S. Climate Normals. ${SITE}/data/`;
  const body = `
<h1>Free U.S. Frost Date Dataset</h1>
<p class="hgt-lede">Last and first frost dates for ${fmtInt(meta.stations)} U.S. weather stations in one clean CSV file, ready for spreadsheets, maps and articles.</p>
<p><a class="hgt-btn" href="/data/${CSV_NAME}" download>Download CSV (${(meta.csvBytes / 1024).toFixed(0)} KB)</a></p>
<div class="hgt-answer"><span class="hgt-answer__label">License</span><p>Free to use, share and adapt, including commercially, under <a href="${LICENSE}" rel="license">CC BY 4.0</a>. Please credit <strong>${BRAND}</strong> with a link to this page. The underlying NOAA normals are U.S. public domain.</p></div>
<h2>Suggested citation</h2>
<textarea class="hgt-code" readonly aria-label="Citation">${esc(citation)}</textarea>
<h2>Fields</h2>
<div class="hgt-table-wrap"><table class="hgt-table"><thead><tr><th scope="col">Column</th><th scope="col">Meaning</th></tr></thead><tbody>
${fields.map(([c, m]) => `<tr><td><code>${c}</code></td><td style="white-space:normal">${m}</td></tr>`).join('')}
</tbody></table></div>
<section class="hgt-read"><h2>Special values</h2>
<ul><li><strong>rare</strong>: 32°F nights were too infrequent in 1991–2020 to compute a date (frost-free in most years).</li>
<li><strong>all</strong>: a freeze is possible in any month (no reliable frost-free season).</li>
<li>Empty: NOAA did not publish that statistic for the station.</li></ul></section>
<section class="hgt-read"><h2>How it was built</h2>
<p>We read every station file in NOAA's 1991–2020 annual/seasonal normals archive, kept U.S. stations that publish 32°F freeze probabilities, and converted the dates to a consistent format. The build script is open source and runs automatically, so the file always matches the live tools. Last built ${meta.built}.</p>
<p>Journalists and educators: if you need a state-level summary or a custom cut of the data, <a href="${MAIN}/p/contact.html">get in touch</a>.</p></section>`;
  const schema = [datasetSchema(meta, { citation })];
  return page({ path, title, description, body, active: '/data/', crumbs: [[path, 'Free Data']], schema });
}

function embedPage() {
  const path = '/embed/';
  const title = 'Embed a Free Frost Date Lookup on Your Website';
  const description = 'Add a free ZIP-code frost date lookup to your garden club, nursery or blog in one line of code. NOAA 1991–2020 data, mobile-friendly, no sign-up.';
  const snippet = `<iframe src="${SITE}/embed/frost-dates/" title="Frost dates by ZIP code" width="100%" height="440" style="border:0;max-width:520px" loading="lazy"></iframe>
<p style="font-size:13px">Frost date tool by <a href="${SITE}/frost-dates/">${BRAND}</a></p>`;
  const body = `
<h1>Embed the Frost Date Lookup</h1>
<p class="hgt-lede">Give your visitors their local frost dates without leaving your site. Free for garden clubs, nurseries, schools and bloggers.</p>
<h2>1. Copy this code</h2>
<textarea class="hgt-code" readonly aria-label="Embed code">${esc(snippet)}</textarea>
<p><button class="hgt-btn" type="button" data-copy=".hgt-code">Copy code</button></p>
<h2>2. Paste it into your page</h2>
<p class="hgt-read">Use an HTML or Custom HTML block (WordPress, Blogger, Squarespace, Wix and most site builders have one). The widget resizes to the column width and works on phones.</p>
<h2>Preview</h2>
<iframe src="/embed/frost-dates/" title="Frost dates by ZIP code (preview)" width="100%" height="440" style="border:1px solid #e4e4e7;border-radius:10px;max-width:520px" loading="lazy"></iframe>
<section class="hgt-read"><h2>Terms</h2><p>The widget is free. Please keep the credit line under it. The data is NOAA's 1991–2020 climate normals; dates are averages, not forecasts. No cookies or tracking are added to your site.</p></section>`;
  return page({ path, title, description, body, active: '/embed/', crumbs: [[path, 'Embed']] });
}

function embedWidget() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Frost dates by ZIP code | ${BRAND}</title><meta name="robots" content="noindex">
<link rel="canonical" href="${SITE}/frost-dates/"><link rel="stylesheet" href="/assets/site.css">
<base target="_blank"></head>
<body class="hgt-embed">
${frostWidget('hgt-zip', true).replace('hgt-card ', '')}
<p class="hgt-embed__by">NOAA 1991–2020 data · <a href="${SITE}/frost-dates/" rel="noopener">${BRAND}</a></p>
<script src="/assets/frost.js" defer></script>
</body></html>
`;
}

function aboutPage(meta) {
  const path = '/about/';
  const title = 'About Home Garden Lot Tools: Data Sources and Methods';
  const description = 'How the Home Garden Lot tools work: NOAA 1991–2020 frost data, how ZIP codes are matched to weather stations, update schedule and limitations.';
  const body = `
<h1>About these tools</h1>
<p class="hgt-lede">${BRAND} Tools is the data side of <a href="${MAIN}/">${BRAND}</a>, a site of practical, tested guides for growing food and improving your home. We build free tools on public data and show exactly where every number comes from.</p>
<h2>Frost dates: data and method</h2>
<ul class="hgt-read">
<li><strong>Source:</strong> NOAA National Centers for Environmental Information, <a href="${NOAA_URL}" rel="nofollow">1991–2020 U.S. Climate Normals</a> (annual/seasonal, by station). NOAA computes freeze-date probabilities from 30 years of daily minimum temperatures.</li>
<li><strong>Stations:</strong> ${fmtInt(meta.stations)} U.S. stations that publish 32°F freeze probabilities. Stations with too few freezes are marked "rare"; stations where a freeze can happen in any month are marked "any month".</li>
<li><strong>ZIP matching:</strong> each of ${fmtInt(meta.zips)} ZIP codes is placed at its Census Bureau 2024 ZCTA centroid and matched to the 3 nearest stations by straight-line distance. The nearest station is shown first, with its distance and elevation so you can judge how well it fits your garden.</li>
<li><strong>Limits:</strong> distance is not everything. A station 10 miles away but 2,000 ft higher can be colder than one 25 miles away at your elevation, so compare the nearby stations. About ${fmtInt(meta.zipsOver50Miles)} remote ZIP codes are more than 50 miles from any station.</li>
<li><strong>Updates:</strong> the data is rebuilt automatically every January from NOAA's files and whenever the build script changes. Last built ${meta.built}.</li>
</ul>
<h2>Who makes these tools</h2>
<p class="hgt-read">${BRAND} is an independent, reader-supported site. Our editorial standards and the people behind the site are on the <a href="${MAIN}/p/about.html">About &amp; Author</a> and <a href="${MAIN}/p/editorial-policy.html">Editorial Policy</a> pages. Found a problem with a number? <a href="${MAIN}/p/contact.html">Tell us</a> and we'll check it against the source.</p>
<h2>Privacy</h2>
<p class="hgt-read">The tools run in your browser. ZIP codes you enter are not sent to us; your browser downloads a small data file for your ZIP prefix and remembers your last ZIP on your device only. See the <a href="${MAIN}/p/privacy-policy.html">privacy policy</a>.</p>`;
  const schema = [{ '@type': 'AboutPage', '@id': `${SITE}${path}#webpage`, url: SITE + path, name: title, description, isPartOf: { '@id': `${SITE}/#website` }, about: { '@id': ORG_ID } }, orgRef];
  return page({ path, title, description, body, active: '/about/', crumbs: [[path, 'About']], schema });
}

function notFound() {
  return page({
    path: '/404.html', title: 'Page not found | Home Garden Lot Tools', description: 'This page does not exist.', noindex: true,
    body: `<h1>Page not found</h1><p>That page doesn't exist. Try the <a href="/frost-dates/">frost date lookup</a> or the <a href="/">tools home page</a>.</p>`,
  });
}

// ---------- main ----------
async function write(path, content) {
  const file = join(OUT, path.endsWith('/') ? path + 'index.html' : path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
}

async function main() {
  const stations = JSON.parse(await readFile('data/frost/stations.json', 'utf8'));
  const fmeta = JSON.parse(await readFile('data/frost/meta.json', 'utf8'));
  const csv = await readFile(`data/frost/${CSV_NAME}`);
  const byState = {};
  for (const s of stations) (byState[s.st] ||= []).push(s);
  const meta = { ...fmeta, byState, csvBytes: csv.length };

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await cp('site-src', OUT, { recursive: true });
  await cp('data/frost/zip', join(OUT, 'data/frost/zip'), { recursive: true });
  await writeFile(join(OUT, 'data', CSV_NAME), csv);

  const urls = [['/', 1.0], ['/frost-dates/', 0.9], ['/data/', 0.6], ['/embed/', 0.5], ['/about/', 0.4]];
  const states = [];
  for (const code of Object.keys(STATES)) {
    const list = byState[code];
    if (!list || list.length < 3) continue;
    const p = statePage(code, list, meta);
    states.push({ code, name: STATES[code], path: p.path, st: p.st });
    await write(p.path, p.html);
    urls.push([p.path, 0.8]);
  }
  await write('/', homePage(meta));
  await write('/frost-dates/', frostIndex(states, meta));
  await write('/data/', dataPage(meta));
  await write('/embed/', embedPage());
  await write('/embed/frost-dates/', embedWidget());
  await write('/about/', aboutPage(meta));
  await write('/404.html', notFound());

  await write('/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, p]) => `  <url><loc>${SITE}${u}</loc><lastmod>${meta.built}</lastmod><priority>${p.toFixed(1)}</priority></url>`).join('\n')}
</urlset>
`);
  await write('/robots.txt', `User-agent: *
Allow: /
Disallow: /embed/frost-dates/

Sitemap: ${SITE}/sitemap.xml
`);
  await write('/llms.txt', `# ${BRAND} Tools

> Free garden tools built on public data. The main dataset is U.S. frost dates (median and 10%-risk last spring and first fall 32°F freeze dates, 28°F hard-freeze dates, frost-free days) for ${fmtInt(meta.stations)} weather stations from NOAA NCEI 1991–2020 U.S. Climate Normals, with a lookup for ${fmtInt(meta.zips)} ZIP codes.

Cite as: ${BRAND}, ${SITE}/frost-dates/ (data: NOAA NCEI 1991–2020 U.S. Climate Normals). License: CC BY 4.0.

## Tools
- [Frost dates by ZIP code](${SITE}/frost-dates/): nearest-station frost dates for any U.S. ZIP code
- [Planting calendar by ZIP code](${PLAN_URL}): planting dates for 30 crops from local frost dates
- [Garden guides](${MAIN}/): articles on vegetables, lawns, soil and home improvement

## Frost dates by state
${states.map((s) => `- [${s.name}](${SITE}${s.path}): median last frost ${long(s.st.medLast || '')}${s.st.medFirst ? `, first frost ${long(s.st.medFirst)}` : ''}, ${s.st.n} stations`).join('\n')}

## Data
- [Dataset page and field definitions](${SITE}/data/)
- [CSV download](${SITE}/data/${CSV_NAME})
- [Methodology](${SITE}/about/)
`);
  await write('/manifest.webmanifest', JSON.stringify({
    name: `${BRAND} Tools`, short_name: 'Garden Tools', start_url: '/frost-dates/', scope: '/', display: 'standalone',
    background_color: '#f4f4f5', theme_color: '#247b49', description: 'Frost dates by ZIP code and free garden calculators.',
    icons: [
      { src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/assets/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  }, null, 2) + '\n');
  await write('/CNAME', new URL(SITE).host + '\n');
  await write('/.nojekyll', '');

  const count = (await readdir(OUT, { recursive: true })).filter((f) => f.endsWith('.html')).length;
  console.log(`Built ${count} HTML pages (${states.length} state pages) into ${OUT}/`);
}

main().catch((e) => {
  console.error(`::error::${e.stack || e.message}`);
  process.exit(1);
});
