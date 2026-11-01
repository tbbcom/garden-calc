#!/usr/bin/env node
// Builds the static site for tools.homegardenlot.com into _site/ from site-src/, data/frost/ and data/zones/.
// Frost numbers come from NOAA's 1991–2020 normals (data/frost/stations.json); hardiness zones from the
// USDA 2023 Plant Hardiness Zone Map ZIP files (data/zones/).
//
// Usage: node scripts/build-site.mjs
import { mkdir, readFile, writeFile, rm, cp, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { zipState, ZIP_RANGES } from './zip-state.mjs';

const SITE = 'https://tools.homegardenlot.com';
const MAIN = 'https://www.homegardenlot.com';
const BRAND = 'Home Garden Lot';
const ORG_ID = `${MAIN}/#organization`;
const LOGO = 'https://blogger.googleusercontent.com/img/a/AVvXsEjoJpzMbdp1wYSHq9FW-psCak7EAnomwXHFP0PLmjO9oj7qYViGtHMvMQaROVdxWLXHulSUqRJ0PGqg8Kj82uquNfFDDssLYe8ZIQdMgD_004eTkwwXpuU5h0T2k5MOgQ1J6aDfIwToU3XmkKTSIw2ASFhZ-sJhzeYnzqMQdiNcLXZFZ1B2vg2o1--ECfdrY=s150';
const PLAN_URL = `${MAIN}/p/planting-calendar.html`;
const OUT = '_site';
const CSV_NAME = 'frost-dates-1991-2020.csv';
const NOAA_URL = 'https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals';
const LICENSE = 'https://creativecommons.org/licenses/by/4.0/';
const INDEXNOW_KEY = 'f6b36fd77837445fcaa6cfad74c7ace4';
const USDA_URL = 'https://planthardiness.ars.usda.gov/';
const PRISM_URL = 'https://prism.oregonstate.edu/phzm/';
// Analytics ID from the GTM_ID repository variable or secret: a Tag Manager container (GTM-XXXXXXX)
// or a Google Analytics 4 measurement ID (G-XXXXXXXXXX), which loads gtag.js directly.
// Accepts the ID from a repository variable or secret, ignoring stray spaces and letter case.
const GTM_RAW = (process.env.GTM_ID || '').trim().toUpperCase();
const GTM_ID = /^GTM-[A-Z0-9]{4,12}$/.test(GTM_RAW) ? GTM_RAW : '';
const GA4_ID = /^G-[A-Z0-9]{6,14}$/.test(GTM_RAW) ? GTM_RAW : '';
if (GTM_RAW && !GTM_ID && !GA4_ID) console.warn(`::warning::GTM_ID "${GTM_RAW}" is neither GTM-XXXXXXX nor G-XXXXXXXXXX, so no analytics was added`);
console.log(GTM_ID ? `Google Tag Manager: ${GTM_ID}` : GA4_ID ? `Google Analytics 4 (direct): ${GA4_ID}` : 'Analytics: not configured');
const EFFECTIVE = 'October 29, 2026';
// EEA, UK and Switzerland: analytics and ad storage stay denied until the visitor consents (Consent Mode v2).
const CONSENT_REGIONS = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH'];
let CSS = '';
// Per-page share images made by scripts/make-og.mjs (filled in main() from site-src/assets/og/).
const OG_IMAGES = {};

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
  ['/hardiness-zones/', 'Hardiness Zones'],
  ['/#calculators', 'Calculators'],
  ['/data/', 'Free Data'],
  ['/about/', 'About'],
];

// Consent defaults run first; GTM itself loads after the page is idle so it never competes with LCP or input.
function gtmHead() {
  if (!GTM_ID && !GA4_ID) return '';
  const src = GTM_ID ? `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}` : `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
  const boot = GTM_ID ? `dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});` : `window.hgtGA4=1;gtag('js',new Date());gtag('config','${GA4_ID}');`;
  return `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',region:${JSON.stringify(CONSENT_REGIONS)},wait_for_update:500});
gtag('consent','default',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});
gtag('set','ads_data_redaction',true);gtag('set','url_passthrough',true);
${boot}
(function(){function l(){var s=document.createElement('script');s.async=true;s.src='${src}';document.head.appendChild(s);}
function q(){'requestIdleCallback' in window?requestIdleCallback(l,{timeout:2500}):setTimeout(l,200);}
document.readyState==='complete'?q():addEventListener('load',q);})();</script>
<link rel="preconnect" href="https://www.googletagmanager.com">`;
}

function page({ path, title, description, body, crumbs = [], schema = [], scripts = [], noindex = false, active, og = OG_IMAGES[path] || '/assets/og.png' }) {
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
<meta property="og:image" content="${SITE}${og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#247b49">
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/icon-192.png">
<link rel="manifest" href="/manifest.webmanifest">
<style>${CSS}</style>
${gtmHead()}
${graph.length ? jsonLd({ '@context': 'https://schema.org', '@graph': graph }) : ''}
</head>
<body>
${GTM_ID ? `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GTM_ID}" height="0" width="0" style="display:none;visibility:hidden" title="Google Tag Manager"></iframe></noscript>` : ''}
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
        <li><a href="/hardiness-zones/">Hardiness zone by ZIP</a></li>
        <li><a href="/hardiness-zones/#states">Hardiness zones by state</a></li>
        <li><a href="/data/">Download the data</a></li>
        <li><a href="/embed/">Embed on your site</a></li>
      </ul>
    </div>
    <div>
      <p class="hgt-footer__title">Calculators</p>
      <ul class="hgt-footer__list">
        ${[...BATCH1_TOOLS, ...LAWN_TOOLS, ...CALC_TOOLS].map(([, n, u]) => `<li><a href="${u}">${n}</a></li>`).join('\n        ')}
      </ul>
    </div>
    <div>
      <p class="hgt-footer__title">About &amp; trust</p>
      <ul class="hgt-footer__list">
        <li><a href="/about/">About these tools</a></li>
        <li><a href="${MAIN}/p/about.html">About ${BRAND}</a></li>
        <li><a href="${MAIN}/p/editorial-policy.html">Editorial policy</a></li>
        <li><a href="/contact/">Contact</a></li>
        <li><a href="/privacy/">Privacy</a></li>
        <li><a href="/terms/">Terms of use</a></li>
      </ul>
    </div>
  </div>
  <div class="hgt-footer__bar">© ${new Date().getUTCFullYear()} ${BRAND} · <a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a> · <a href="${MAIN}/p/disclaimer.html">Disclaimer</a> · <a href="/contact/">Contact</a><br>Frost data: NOAA NCEI 1991–2020 U.S. Climate Normals. Dates are long-term averages, not forecasts. Hardiness zones: USDA 2023 Plant Hardiness Zone Map (USDA-ARS, PRISM Climate Group, Oregon State University).</div>
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
  // A "state median" means little when most stations are frost-free (Hawaii, south Florida-like states).
  const mostlyFrostFree = st.dated < 5 || st.dated < st.n / 2;
  if (!mostlyFrostFree) {
    answer = `<p>Across ${name}'s ${plural(st.dated, 'NOAA station')} with regular frost, the median <strong>last spring frost is ${long(st.medLast)}</strong> and the median <strong>first fall frost is ${long(st.medFirst)}</strong>. Last frost dates range from ${long(st.earliest.last50)} at ${esc(st.earliest.name)} to ${long(st.latest.last50)} at ${esc(st.latest.name)}, so enter your ZIP code below for the station nearest you.</p>`;
    faqs.push([`When is the last frost in ${name}?`, `The median last spring frost (32°F) across ${name}'s NOAA weather stations is ${long(st.medLast)}, based on 1991–2020 climate normals. It ranges from ${long(st.earliest.last50)} at ${esc(st.earliest.name)} to ${long(st.latest.last50)} at ${esc(st.latest.name)}. For a safer planting date, use the 10%-risk date; the state median for that is ${long(st.medSafe)}.`]);
    faqs.push([`When is the first frost in ${name}?`, `The median first fall frost across ${name}'s stations is ${long(st.medFirst)}. The earliest median first frost is ${long(st.firstEarly.first50)} at ${esc(st.firstEarly.name)}, and the latest is ${long(st.firstLate.first50)} at ${esc(st.firstLate.name)}.`]);
    if (st.medSeason !== null) faqs.push([`How long is the growing season in ${name}?`, `The median frost-free season is ${plural(st.medSeason, 'day')} across ${name}'s stations, from ${plural(st.shortest.season50, 'day')} at ${esc(st.shortest.name)} to ${plural(st.longest.season50, 'day')} at ${esc(st.longest.name)}.`]);
    faqs.push([`When should I plant tomatoes in ${name}?`, `Plant tomatoes outdoors after your local last frost, ideally after the 10%-risk date when nights stay above 50°F. At a typical ${name} station that means starting seeds indoors 6–8 weeks before ${long(st.medLast)} and transplanting from about ${long(st.medSafe)}. Check your ZIP code, because dates vary by weeks across the state.`]);
  } else {
    const cold = list.filter((s) => isDate(s.last50)).sort((x, y) => y.elevFt - x.elevFt).slice(0, 3);
    answer = `<p>Frost is rare in most of ${name}: at ${st.rare} of its ${plural(st.n, 'NOAA station')}, 32°F nights happen too seldom in 1991–2020 records to compute an average date.${cold.length ? ` Regular frost is limited to ${plural(st.dated, 'station')}, mostly at high elevation${cold.length === st.dated ? ':' : ', such as'} ${cold.map((s) => `${esc(s.name)} (${fmtInt(s.elevFt)} ft, last frost ${long(s.last50)})`).join(', ')}.` : ''} Enter your ZIP code below to check your area.</p>`;
    if (cold.length) faqs.push([`Where does it frost in ${name}?`, `Only at ${plural(st.dated, 'NOAA station')} out of ${st.n}, mostly at high elevation. ${cold.map((s) => `${esc(s.name)} (${fmtInt(s.elevFt)} ft) has a median last frost of ${long(s.last50)} and first frost of ${long(s.first50)}`).join('; ')}.`]);
  }
  if (st.rare) faqs.push([`Does it frost everywhere in ${name}?`, `No. At ${plural(st.rare, 'station')} in ${name}, 32°F nights were too rare in 1991–2020 to compute an average frost date, so those places are frost-free in most years.`]);
  if (st.all) faqs.push([`Can it frost in summer in ${name}?`, `Yes, at ${plural(st.all, 'station')} in ${name} a 32°F night is possible in any month, mostly at high elevation or far north. There is no reliable frost-free season there; use cold-hardy crops and row covers.`]);

  const insights = [];
  if (st.elevDays && !mostlyFrostFree) insights.push(`<li><strong>Elevation matters:</strong> across ${name}'s stations, each 1,000 ft of elevation delays the median last frost by about ${plural(st.elevDays, 'day')}.</li>`);
  if (st.northSouth && !mostlyFrostFree) insights.push(`<li><strong>North vs south:</strong> stations in the northern third of the state (north of ${st.northSouth.northLat.toFixed(1)}°N) reach their median last frost about ${plural(Math.abs(st.northSouth.diff), 'day')} ${st.northSouth.diff > 0 ? 'later' : 'earlier'} than the southern third (south of ${st.northSouth.southLat.toFixed(1)}°N).</li>`);
  if (!mostlyFrostFree) insights.push(`<li><strong>Safety margin:</strong> the median 10%-risk date (${long(st.medSafe)}) is about ${plural(springDoy(st.medSafe) - springDoy(st.medLast), 'day')} after the median last frost. Waiting until then cuts the chance of a killing frost on tender transplants from 1 in 2 to 1 in 10.</li>`);
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
<p>Ready to plan? The <a href="${PLAN_URL}">planting calendar by ZIP code</a> turns these dates into start-indoors, transplant and sowing dates for 30 crops.${meta.zoneStates[code] ? ` Choosing perennials? See <a href="${zonePath(name)}">${name} hardiness zones by town</a>.` : ''}</p></section>
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
  const rows = states.filter((s) => s.st.dated >= 5 && s.st.dated >= s.st.n / 2).map((s) => `<tr><td><a href="${s.path}">${s.name}</a></td><td data-v="${springDoy(s.st.medLast)}">${short(s.st.medLast)}</td><td data-v="${springDoy(s.st.medSafe)}">${short(s.st.medSafe)}</td><td data-v="${fallDoy(s.st.medFirst)}">${short(s.st.medFirst)}</td><td data-v="${s.st.medSeason ?? -1}">${s.st.medSeason === null ? '–' : fmtInt(s.st.medSeason)}</td><td data-v="${s.st.n}">${fmtInt(s.st.n)}</td></tr>`).join('');
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
${embedCta('frost-dates')}
${relatedTools(path)}
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
  const description = `Free home and garden calculators: stairs, gravel, pavers, pool volume, salt and shock, sod, grass seed, concrete block, plus frost dates and hardiness zones by ZIP.`;
  const card = ([icon, name, url, text], tag = '') => `<a class="hgt-card hgt-tool" href="${url}"><span class="hgt-tool__icon" aria-hidden="true">${icon}</span><h3 class="hgt-tool__title">${name}${tag ? `<span class="hgt-tool__tag">${tag}</span>` : ''}</h3><p class="hgt-tool__text">${text}</p><span class="hgt-tool__go">Open tool →</span></a>`;
  const body = `
<h1>Free garden tools, built on real data</h1>
<p class="hgt-lede">Plan planting, order the right amount of material and skip the guesswork. Every tool here is free, works on your phone and uses public data from NOAA, the USDA and university extension services.</p>
${frostWidget('hgt-zip')}
<h2>Data tools</h2>
<div class="hgt-grid">
${card(['❄️', 'Frost Dates by ZIP Code', '/frost-dates/', `Median and safer 10%-risk frost dates and frost-free days from the nearest of ${fmtInt(meta.stations)} NOAA stations.`], 'New')}
${card(['🌡️', 'Hardiness Zone by ZIP Code', ZONE_IDX, `Your USDA 2023 plant hardiness zone, its coldest-night temperature and your frost dates in one lookup.`], 'New')}
${card(['🗺️', 'Frost Dates by State', '/frost-dates/#states', 'Town-by-town last and first frost tables for every state, with how elevation shifts the dates.'])}
${card(['📊', 'Free Frost Date Dataset', '/data/', 'Download every station\'s frost dates as CSV for your blog, class or research. Free with attribution.'])}
${card(['🧩', 'Embed Our Tools', '/embed/', 'Add the frost lookup or any calculator to your garden club, nursery or landscaping site in one line.'])}
</div>
<h2 id="calculators">Most-used calculators</h2>
<div class="hgt-grid">
${BATCH1_TOOLS.map((t) => card(t, 'New')).join('\n')}
</div>
<h2>More hardscape and pool calculators</h2>
<div class="hgt-grid">
${BATCH1_VARIANTS.map((t) => card(t)).join('\n')}
</div>
<h2>Lawn calculators</h2>
<div class="hgt-grid">
${LAWN_TOOLS.map((t) => card(t, 'New')).join('\n')}
</div>
<h2>Home and hardscape calculators</h2>
<div class="hgt-grid">
${CALC_TOOLS.map((t) => card(t, 'New')).join('\n')}
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
      mainEntity: { '@type': 'ItemList', itemListElement: [['Frost Dates by ZIP Code', `${SITE}/frost-dates/`], ['Hardiness Zone by ZIP Code', `${SITE}${ZONE_IDX}`], ...BATCH1_TOOLS.map((t) => [t[1], SITE + t[2]]), ...BATCH1_VARIANTS.map((t) => [t[1], SITE + t[2]]), ...LAWN_TOOLS.map((t) => [t[1], SITE + t[2]]), ...CALC_TOOLS.map((t) => [t[1], SITE + t[2]]), ...MAIN_TOOLS.map((t) => [t[1], t[2]])].map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, url: u })) } },
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
  const title = 'Free Garden & Home Calculators to Embed on Your Website';
  const description = 'Add free frost date, concrete block, retaining wall, sod and grass seed calculators to your garden club, nursery, landscaping or blog site in one line of code.';
  const body = `
<h1>Embed Our Free Tools on Your Site</h1>
<p class="hgt-lede">Give your visitors a working calculator without building one. Free for garden clubs, nurseries, landscapers, hardscape contractors, schools and bloggers. Mobile-friendly, no sign-up, no ads, no tracking.</p>
<div class="hgt-answer"><span class="hgt-answer__label">How it works</span><p>Copy the code for a tool, paste it into an <strong>HTML</strong> or <strong>Custom HTML</strong> block (WordPress, Blogger, Squarespace, Wix and most builders have one), and publish. Please keep the one-line credit under the tool.</p></div>
<ul class="hgt-states">${EMBEDS.map((e) => `<li><a href="#${e.id}">${e.name}</a></li>`).join('')}</ul>
${EMBEDS.map((e) => `<section id="${e.id}"><h2>${e.name}</h2>
<textarea class="hgt-code" id="code-${e.id}" readonly aria-label="${e.name} embed code">${esc(embedSnippet(e))}</textarea>
<p><button class="hgt-btn" type="button" data-copy="#code-${e.id}">Copy code</button> <a class="hgt-btn hgt-btn--ghost" href="${e.tool}">See the full tool</a></p>
<details><summary>Preview</summary><iframe src="/embed/${e.id}/" title="${e.name} (preview)" width="100%" height="${e.height}" style="border:1px solid #e4e4e7;border-radius:10px;max-width:640px" loading="lazy"></iframe></details></section>`).join('\n')}
<section class="hgt-read"><h2>Terms</h2><p>The tools are free to embed on any lawful site. Please keep the credit line visible; you may add <code>rel="nofollow"</code> to it if your site policy requires. We may update or retire a tool at any time. Frost dates are NOAA 1991–2020 averages, not forecasts; calculator results are estimates. No cookies or tracking are added to your site.</p></section>`;
  return page({ path, title, description, body, crumbs: [[path, 'Embed']] });
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
<h2>Hardiness zones: data and method</h2>
<ul class="hgt-read">
<li><strong>Source:</strong> the <a href="${USDA_URL}" rel="nofollow">USDA 2023 Plant Hardiness Zone Map</a>, using the ZIP-code files published by the <a href="${PRISM_URL}" rel="nofollow">PRISM Climate Group at Oregon State University</a>, which produced the map with USDA-ARS. Zones are based on the average annual extreme minimum temperature for 1991–2020.</li>
<li><strong>Coverage:</strong> ${fmtInt(meta.zoneMeta.zips)} ZIP codes in the 50 states, D.C. and Puerto Rico. ZIP codes are grouped into states by their USPS three-digit prefix.</li>
<li><strong>Towns:</strong> each NOAA weather station on the state pages shows the zone of the nearest ZIP code within 8 miles, so you can see zones and frost dates side by side.</li>
<li><strong>Limits:</strong> a ZIP code can cover several microclimates; hilltops, valleys and city centers can differ by half a zone or more. This is an independent tool, not an official USDA site. Updated every January; last built ${meta.zoneMeta.built}.</li>
</ul>
<h2>Who makes these tools</h2>
<p class="hgt-read">${BRAND} is an independent, reader-supported site. The people behind the site are on the <a href="${MAIN}/p/about.html">About</a> page, and how we research, use AI tools and correct errors is in our <a href="${MAIN}/p/editorial-policy.html">Editorial Policy</a>. Found a problem with a number? <a href="${MAIN}/p/contact.html">Tell us</a> and we'll check it against the source.</p>
<h2>Privacy</h2>
<p class="hgt-read">The tools run in your browser. ZIP codes you enter are not sent to us; your browser downloads small data files for your ZIP prefix and remembers your last ZIP on your device only. See the <a href="/privacy/">privacy notice</a>.</p>`;
  const schema = [{ '@type': 'AboutPage', '@id': `${SITE}${path}#webpage`, url: SITE + path, name: title, description, isPartOf: { '@id': `${SITE}/#website` }, about: { '@id': ORG_ID } }, orgRef];
  return page({ path, title, description, body, active: '/about/', crumbs: [[path, 'About']], schema });
}

function legalPage({ path, name, title, description, body, type = 'WebPage' }) {
  const schema = [{ '@type': type, '@id': `${SITE}${path}#webpage`, url: SITE + path, name: title, description, inLanguage: 'en-US', isPartOf: { '@id': `${SITE}/#website` }, publisher: { '@id': ORG_ID }, dateModified: '2026-10-29' }];
  if (type === 'ContactPage') schema[0].mainEntity = { '@type': 'Organization', '@id': ORG_ID, name: BRAND, contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', url: `${MAIN}/p/contact.html`, availableLanguage: ['en'] } };
  return page({ path, title, description, body, crumbs: [[path, name]], schema });
}

function privacyPage() {
  const analytics = GTM_ID || GA4_ID
    ? `<p>We use <strong>Google Analytics 4</strong>${GTM_ID ? ' (loaded through <strong>Google Tag Manager</strong>)' : ''}, which counts visits and shows how the tools are used (for example, that a frost lookup happened and in which state, never your ZIP code). Visitors in the EEA, UK and Switzerland are asked for consent first; until then Google Consent Mode keeps these tags in a cookieless, non-identifying mode. You can opt out anytime with the <a href="https://tools.google.com/dlpage/gaoptout" rel="noopener">Google Analytics opt-out add-on</a>.</p>`
    : '<p>This site does not currently use analytics or advertising cookies. If we add Google Analytics or ads, this notice will be updated first.</p>';
  return legalPage({
    path: '/privacy/', name: 'Privacy', title: 'Privacy Notice | Home Garden Lot Tools',
    description: 'How tools.homegardenlot.com handles your data: tools run in your browser, ZIP codes are not sent to us, plus cookies, analytics and your privacy choices.',
    body: `
<h1>Privacy notice</h1>
<p class="hgt-meta">Effective ${EFFECTIVE} · Applies to tools.homegardenlot.com</p>
<div class="hgt-answer"><span class="hgt-answer__label">Summary</span><p>Our tools run <strong>in your browser</strong>. The ZIP codes and measurements you enter are <strong>not sent to us</strong> or stored on any server, and you never need an account. This notice covers what this tool site does; the <a href="${MAIN}/p/privacy-policy.html">full ${BRAND} Privacy Policy</a> covers both sites in detail, including advertising and your legal rights.</p></div>
<section class="hgt-read">
<h2>What happens when you use a tool</h2>
<ul>
<li>When you enter a ZIP code, your browser downloads small public data files (frost dates and hardiness zones) for the first three digits (for example <code>100.json</code>) and finds your ZIP inside them on your device.</li>
<li>Your last ZIP code is saved in your browser's local storage so the tool is ready next time. Clear it anytime in your browser settings.</li>
<li>Pages can work offline thanks to a service worker that caches pages and data files on your device.</li>
</ul>
<h2>Information collected automatically</h2>
<p>The site is hosted on <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" rel="noopener">GitHub Pages</a>, which logs visitor IP addresses for security and to operate the service. We don't receive or use these logs.</p>
<h2>Analytics and cookies</h2>
${analytics}
<h2>Advertising</h2>
<p>If we show Google ads here in future, Google and its partners will use cookies to serve ads based on your visits to this and other sites. You'll be able to opt out of personalized ads at <a href="https://adssettings.google.com/" rel="noopener">Google Ads Settings</a> or <a href="https://www.aboutads.info/choices/" rel="noopener">aboutads.info</a>, and details will be added to this notice and the <a href="${MAIN}/p/privacy-policy.html#advertising">full policy</a> before ads appear.</p>
<h2>Embedded widget</h2>
<p>Sites that embed our frost-date widget load it from this domain; the same rules apply inside the widget. No tracking is added to the host site.</p>
<h2>Your rights and contact</h2>
<p>You can ask us to access or delete information you've sent us, and you have rights under GDPR and U.S. state privacy laws described in the <a href="${MAIN}/p/privacy-policy.html#rights">full policy</a>. To make a request, use our <a href="/contact/">contact page</a>.</p>
</section>` });
}

function termsPage() {
  return legalPage({
    path: '/terms/', name: 'Terms of use', title: 'Terms of Use | Home Garden Lot Tools',
    description: 'Terms for using tools.homegardenlot.com: free personal use, the CC BY 4.0 frost-date dataset, embedding the widget, and the limits of estimates and averages.',
    body: `
<h1>Terms of use</h1>
<p class="hgt-meta">Effective ${EFFECTIVE} · Applies to tools.homegardenlot.com</p>
<div class="hgt-answer"><span class="hgt-answer__label">Summary</span><p>The tools are free to use. Frost dates are <strong>30-year averages, not forecasts</strong>, and calculator results are estimates, so check them before you plant or buy. The frost-date data is free to reuse with credit. These terms add to the main <a href="${MAIN}/p/terms.html">${BRAND} Terms of Use</a>, which also apply here.</p></div>
<section class="hgt-read">
<h2>Using the tools</h2>
<p>You may use the tools for personal and professional planning at no cost. Please don't overload the site with automated requests; download the <a href="/data/">dataset</a> instead.</p>
<h2>Frost dates and estimates</h2>
<p>Frost dates come from NOAA's 1991–2020 U.S. Climate Normals for the nearest weather stations. A frost after the median last frost date happens in about half of all years, and conditions at your garden can differ from the station because of elevation, slope and nearby water. Use the 10%-risk date for tender plants and watch your local forecast. We're not liable for crop, plant or material losses from relying on these averages.</p>
<h2>Reusing our data</h2>
<p>The <a href="/data/">frost-date dataset</a> is licensed under <a href="${LICENSE}" rel="license noopener">CC BY 4.0</a>: you may share and adapt it, including commercially, if you credit ${BRAND} with a link to <a href="/data/">${SITE}/data/</a>. The underlying NOAA data is U.S. public domain. Page text, design and code remain © ${BRAND}.</p>
<h2>Embedding the widget</h2>
<p>You may embed the frost-date widget with the code on our <a href="/embed/">embed page</a> on any lawful site, provided the credit line stays visible. We may change or stop the widget at any time.</p>
<h2>Everything else</h2>
<p>Disclaimers, limitation of liability, governing law and changes are covered by the main <a href="${MAIN}/p/terms.html">Terms of Use</a> and <a href="${MAIN}/p/disclaimer.html">Disclaimer</a>. Questions: <a href="/contact/">contact us</a>.</p>
</section>` });
}

function contactPage() {
  return legalPage({
    path: '/contact/', name: 'Contact', type: 'ContactPage', title: 'Contact Home Garden Lot Tools: Report Data or Ask a Question',
    description: 'Report a frost-date or calculator issue, ask about reusing our NOAA frost data or embedding the widget, or send a question to the Home Garden Lot team.',
    body: `
<h1>Contact us</h1>
<div class="hgt-answer"><span class="hgt-answer__label">How to reach us</span><p>Send us a message through the <a href="${MAIN}/p/contact.html">${BRAND} contact form</a>. It reaches the same team that builds these tools, and we usually reply within 3 business days.</p></div>
<p><a class="hgt-btn" href="${MAIN}/p/contact.html">Open the contact form</a></p>
<section class="hgt-read">
<h2>Reporting a data problem</h2>
<p>If a frost date looks wrong for your area, tell us the ZIP code, the station the tool showed and what you expected. We'll check it against NOAA's published normals. Often the nearest station sits at a different elevation; in that case the "Compare nearby stations" list in the results usually helps.</p>
<h2>Press, teachers and bloggers</h2>
<p>You're welcome to use our <a href="/data/">free frost-date dataset</a> or <a href="/embed/">embed the frost-date tool</a>. For a state summary, a chart or a custom cut of the data, ask through the form.</p>
<h2>What we don't do</h2>
<p>We don't sell links, sponsored posts or data about our visitors.</p>
</section>` });
}

function notFound() {
  return page({
    path: '/404.html', title: 'Page not found | Home Garden Lot Tools', description: 'This page does not exist.', noindex: true,
    body: `<h1>Page not found</h1><p>That page doesn't exist. Try the <a href="/frost-dates/">frost date lookup</a> or the <a href="/">tools home page</a>.</p>`,
  });
}

// ---------- hardiness zones ----------
const zoneKey = (z) => parseInt(z, 10) * 2 + (z.endsWith('b') ? 1 : 0);
// USDA zones are 10°F bands of average annual extreme minimum temperature, split into 5°F halves; 1a starts at -60°F.
const zoneLow = (z) => -60 + (parseInt(z, 10) - 1) * 10 + (z.endsWith('b') ? 5 : 0);
const fToC = (f) => Math.round(((f - 32) * 5) / 9);
const fmtF = (f) => `${f < 0 ? '−' : ''}${Math.abs(f)}°F`;
const fmtC = (c) => `${c < 0 ? '−' : ''}${Math.abs(c)}°C`;
const zoneRange = (z) => `${fmtF(zoneLow(z))} to ${fmtF(zoneLow(z) + 5)}`;
const zoneRangeC = (z) => `${fmtC(fToC(zoneLow(z)))} to ${fmtC(fToC(zoneLow(z) + 5))}`;
// Cold zones blue, warm zones orange; the label carries the meaning, the colour is a visual aid only.
const zoneHue = (z) => Math.round(225 - ((zoneKey(z) - 2) / 25) * 205);
const zoneBadge = (z) => `<span class="hgt-zone" style="--hgt-zone-h:${zoneHue(z)}">${esc(z)}</span>`;
const pct = (n, d) => { const p = (n / d) * 100; return p >= 1 ? `${Math.round(p)}%` : '<1%'; };
const zoneSpan = (zs) => (zs.length === 1 ? zs[0] : `${zs[0]}–${zs[zs.length - 1]}`);
const ZONE_IDX = '/hardiness-zones/';
const zonePath = (name) => `${ZONE_IDX}${slug(name)}/`;
// The client maps a ZIP prefix to its state page with the same ranges the build uses.
const zoneWidget = (id) => `<div class="hgt-card hgt-frost" data-hgt-zone data-plan-url="${PLAN_URL}" data-states='${esc(JSON.stringify(ZIP_RANGES.filter(([, , st]) => STATES[st]).map(([a, b, st]) => [a, b, st, slug(STATES[st]), STATES[st]])))}'>
  <form class="hgt-frost__form" novalidate>
    <div>
      <label class="hgt-frost__label" for="${id}">Your ZIP code</label>
      <input class="hgt-frost__input" id="${id}" inputmode="numeric" autocomplete="postal-code" maxlength="5" pattern="[0-9]{5}" placeholder="e.g. 60601">
    </div>
    <button class="hgt-btn" type="submit">Find my zone</button>
  </form>
  <p class="hgt-frost__status" role="status" aria-live="polite"></p>
  <div class="hgt-frost__out" hidden></div>
</div>`;

function zoneSummary(counts) {
  const zones = Object.keys(counts).sort((a, b) => zoneKey(a) - zoneKey(b));
  const total = zones.reduce((a, z) => a + counts[z], 0);
  const ranked = [...zones].sort((a, b) => counts[b] - counts[a] || zoneKey(a) - zoneKey(b));
  return { zones, total, mode: ranked[0], ranked };
}

const zoneBars = (counts, sum) => `<div class="hgt-bars">${sum.zones.map((z) => `<div class="hgt-bars__row"><span class="hgt-bars__label">Zone ${esc(z)}</span><span class="hgt-bars__track"><span class="hgt-bars__fill" style="width:${Math.max(1, Math.round((counts[z] / counts[sum.mode]) * 100))}%;--hgt-zone-h:${zoneHue(z)}"></span></span><span class="hgt-bars__value">${pct(counts[z], sum.total)}<span class="hgt-bars__n"> · ${plural(counts[z], 'ZIP')}</span></span></div>`).join('')}</div>`;

function zoneStatePage(code, zd, meta) {
  const name = STATES[code];
  const path = zonePath(name);
  const { counts, towns } = zd;
  const sum = zoneSummary(counts);
  const span = zoneSpan(sum.zones);
  const [z1, z2] = sum.ranked;
  const title = `What Hardiness Zone Is ${name}? USDA 2023 Zones by ZIP`;
  let description = `${name} spans USDA hardiness zones ${span} on the 2023 map; zone ${sum.mode} covers the most ZIP codes. Look up your ZIP and see zones and frost dates by town.`;
  if (description.length > 160) description = `${name} spans USDA hardiness zones ${span} (2023 map), mostly zone ${sum.mode}. Look up your ZIP code and see zones by town.`;

  const share2 = z2 && counts[z2] / sum.total >= 0.1 ? `, followed by zone ${z2} (${pct(counts[z2], sum.total)})` : '';
  const answer = `<p>${sum.zones.length === 1 ? `All of ${name} is in <strong>USDA hardiness zone ${sum.mode}</strong>` : `${name} spans <strong>USDA hardiness zones ${span}</strong>`} on the 2023 Plant Hardiness Zone Map. The most common zone is <strong>${sum.mode}</strong>, covering ${pct(counts[sum.mode], sum.total)} of ${name}'s ZIP codes${share2}. Zone ${sum.mode} means the coldest night of an average winter reaches ${zoneRange(sum.mode)} (${zoneRangeC(sum.mode)}). Enter your ZIP code for your exact zone.</p>`;

  const dated = towns.filter((t) => isDate(t.last50));
  const byZone = [...towns].sort((a, b) => zoneKey(a.zone) - zoneKey(b.zone) || b.elevFt - a.elevFt);
  const coldest = byZone[0];
  const warmest = byZone[byZone.length - 1];
  const insights = [];
  if (coldest && warmest && coldest.zone !== warmest.zone) {
    insights.push(`<li><strong>Coldest and warmest towns:</strong> among towns with NOAA weather stations, ${esc(coldest.name)} (${fmtInt(coldest.elevFt)} ft) is in zone ${coldest.zone}, while ${esc(warmest.name)} (${fmtInt(warmest.elevFt)} ft) is in zone ${warmest.zone}. That is a difference of about ${fmtInt((zoneKey(warmest.zone) - zoneKey(coldest.zone)) * 5)}°F in the coldest night of a typical winter.</li>`);
  }
  // Zones measure winter cold, not season length: show how much frost dates still vary inside the main zone.
  const same = dated.filter((t) => t.zone === sum.mode).sort((a, b) => springDoy(a.last50) - springDoy(b.last50));
  let sameZone = null;
  if (same.length >= 4) {
    const a = same[0], b = same[same.length - 1];
    const gap = springDoy(b.last50) - springDoy(a.last50);
    if (gap >= 7) {
      sameZone = { a, b, gap };
      insights.push(`<li><strong>Same zone, different frost dates:</strong> within zone ${sum.mode}, the median last spring frost ranges from ${long(a.last50)} at ${esc(a.name)} to ${long(b.last50)} at ${esc(b.name)}, ${plural(gap, 'day')} apart. Your zone tells you which perennials survive winter; your <a href="/frost-dates/${slug(name)}/">frost dates</a> tell you when to plant.</li>`);
    }
  }
  const zoneFrost = sum.zones.map((z) => {
    const d = dated.filter((t) => t.zone === z);
    return d.length >= 3 ? [z, springFromDoy(median(d.map((t) => springDoy(t.last50)))), fallFromDoy(median(d.map((t) => fallDoy(t.first50)))), d.length] : null;
  }).filter(Boolean);

  const faqs = [
    [`What hardiness zone is ${name}?`, `${name} is in USDA hardiness zone${sum.zones.length > 1 ? `s ${span}` : ` ${span}`} on the 2023 USDA Plant Hardiness Zone Map. Zone ${sum.mode} is the most common, covering ${pct(counts[sum.mode], sum.total)} of ${name}'s ZIP codes${z2 ? `, and zone ${z2} covers ${pct(counts[z2], sum.total)}` : ''}. Enter your ZIP code for your exact zone.`],
    [`What does zone ${sum.mode} mean?`, `Zone ${sum.mode} means the average annual extreme minimum temperature, the coldest night of a typical winter, is ${zoneRange(sum.mode)} (${zoneRangeC(sum.mode)}). Perennials, shrubs and trees rated for zone ${sum.mode} or colder should survive winter there.`],
  ];
  if (coldest && warmest && coldest.zone !== warmest.zone) faqs.push([`What is the coldest hardiness zone in ${name}?`, `Zone ${sum.zones[0]} is the coldest zone mapped in ${name}${coldest.zone === sum.zones[0] ? `, found around ${esc(coldest.name)}` : ''}, and zone ${sum.zones[sum.zones.length - 1]} is the warmest${warmest.zone === sum.zones[sum.zones.length - 1] ? `, found around ${esc(warmest.name)}` : ''}.`]);
  faqs.push([`Did ${name}'s hardiness zones change in 2023?`, `The USDA released a new Plant Hardiness Zone Map in November 2023, based on 1991–2020 temperatures instead of 1976–2005. About half of the United States shifted half a zone warmer. Check your ZIP code here, because plant tags and older books may still list your 2012 zone.`]);
  faqs.push([`When should I plant in zone ${sum.mode}?`, `Hardiness zones don't set planting dates; frost dates do. ${sameZone ? `Inside zone ${sum.mode} in ${name}, the median last spring frost varies from ${long(sameZone.a.last50)} to ${long(sameZone.b.last50)}. ` : ''}Look up your local frost dates and plant tender crops such as tomatoes after the 10%-risk last-frost date.`]);

  const rows = (list) => list.map((t) => `<tr><td>${esc(t.name)}</td><td data-v="${zoneKey(t.zone)}">${zoneBadge(t.zone)}</td><td data-v="${zoneLow(t.zone)}">${fmtF(zoneLow(t.zone))} to ${fmtF(zoneLow(t.zone) + 5)}</td><td data-v="${t.elevFt}">${fmtInt(t.elevFt)}</td><td data-v="${isDate(t.last50) ? springDoy(t.last50) : t.last50 === 'rare' ? -999 : 999}">${short(t.last50)}</td><td data-v="${isDate(t.first50) ? fallDoy(t.first50) : t.first50 === 'rare' ? 999 : -999}">${short(t.first50)}</td></tr>`).join('');
  const table = (list, id) => `<div class="hgt-table-wrap"><table class="hgt-table" id="${id}" data-sortable>
<thead><tr><th scope="col"><button type="button">Town / station</button></th><th scope="col"><button type="button">Zone</button></th><th scope="col"><button type="button">Coldest night</button></th><th scope="col"><button type="button">Elev. (ft)</button></th><th scope="col"><button type="button">Last frost</button></th><th scope="col"><button type="button">First frost</button></th></tr></thead>
<tbody>${rows(list)}</tbody></table></div>`;
  const major = towns.filter((t) => t.id.startsWith('USW'));
  const others = Object.entries(STATES).filter(([c]) => c !== code && meta.zoneStates[c]).map(([, n]) => `<li><a href="${zonePath(n)}">${n}</a></li>`).join('');
  const frostLink = meta.byState[code] && meta.byState[code].length >= 3 ? `/frost-dates/${slug(name)}/` : null;

  const body = `
<h1>What Hardiness Zone Is ${name}?</h1>
<p class="hgt-meta">USDA 2023 Plant Hardiness Zone Map · ${plural(sum.total, 'ZIP code')} · Data updated ${meta.zoneMeta.built}</p>
<div class="hgt-answer"><span class="hgt-answer__label">Quick answer</span>${answer}</div>
${zoneWidget('hgt-zip')}
<h2>${name} hardiness zones by share of ZIP codes</h2>
${zoneBars(counts, sum)}
${insights.length ? `<section class="hgt-read"><h2>What the zones mean for ${name} gardeners</h2><ul>${insights.join('')}</ul></section>` : ''}
${zoneFrost.length >= 2 ? `<h2>Typical frost dates in each ${name} zone</h2><p class="hgt-read">Medians across NOAA weather stations in each zone. Colder zones usually have later spring frosts, but local terrain can shift the dates by weeks.</p><div class="hgt-table-wrap"><table class="hgt-table"><thead><tr><th scope="col">Zone</th><th scope="col">Last spring frost</th><th scope="col">First fall frost</th><th scope="col">Stations</th></tr></thead><tbody>${zoneFrost.map(([z, l, f, n]) => `<tr><td>${zoneBadge(z)}</td><td>${long(l)}</td><td>${long(f)}</td><td>${n}</td></tr>`).join('')}</tbody></table></div>` : ''}
${major.length >= 3 ? `<h2>Hardiness zones for ${name} cities</h2><p class="hgt-read">Zones at the National Weather Service stations, mostly city airports, with their median frost dates.</p>${table(major, 'hgt-major')}` : ''}
${towns.length ? `<h2>Hardiness zones for ${plural(towns.length, 'town')} in ${name}</h2>
<p class="hgt-read">Each NOAA weather station is shown with the USDA zone of the nearest ZIP code (within 8 miles). <strong>Coldest night</strong> is the zone's range for the average annual extreme minimum temperature. Click a column to sort.</p>
<label class="hgt-frost__label" for="hgt-filter">Filter by town</label>
<input class="hgt-filter" id="hgt-filter" type="search" placeholder="Type a town or airport…" data-filter="hgt-all">
${table(towns, 'hgt-all')}` : ''}
${faqBlock(faqs)}
<section class="hgt-read"><h2>Zone and frost dates: use both</h2>
<p>Your hardiness zone answers one question: will this plant survive the winter here? Choose perennials, shrubs, trees and bulbs rated for your zone or a colder one. For vegetables and annuals, what matters is the length of the frost-free season.${frostLink ? ` See <a href="${frostLink}">${name} frost dates by town</a>, or` : ''} get a <a href="${PLAN_URL}">planting calendar for your ZIP code</a> with start-indoors, transplant and sowing dates for 30 crops.</p></section>
<section class="hgt-sources hgt-read"><h2>Sources and method</h2>
<p>Zones are from the <a href="${USDA_URL}" rel="nofollow">USDA 2023 Plant Hardiness Zone Map</a> ZIP-code files published by the <a href="${PRISM_URL}" rel="nofollow">PRISM Climate Group, Oregon State University</a>, based on 1991–2020 minimum temperatures. ZIP codes are assigned to states by USPS prefix. Town zones use the ZIP code nearest each <a href="${NOAA_URL}" rel="nofollow">NOAA 1991–2020 Climate Normals</a> station. This is an independent tool, not an official USDA site. <a href="/about/">Full methodology.</a></p></section>
<section><h2>Hardiness zones in other states</h2><ul class="hgt-states">${others}</ul></section>`;

  const schema = [
    { '@type': 'WebPage', '@id': `${SITE}${path}#webpage`, url: SITE + path, name: title, description, inLanguage: 'en-US', isPartOf: { '@id': `${SITE}/#website` }, dateModified: meta.zoneMeta.built, about: { '@type': 'State', name } },
    faqSchema(faqs),
  ];
  return {
    path, sum,
    html: page({ path, title, description, body, active: ZONE_IDX, crumbs: [[ZONE_IDX, 'Hardiness Zones'], [path, name]], schema, scripts: ['/assets/zone.js'] }),
  };
}

function zoneIndex(states, usCounts, meta) {
  const path = ZONE_IDX;
  const title = 'Hardiness Zone by ZIP Code: USDA 2023 Zone Finder';
  const sum = zoneSummary(usCounts);
  const description = `Find your USDA plant hardiness zone by ZIP code from the 2023 map, with the coldest winter temperature and your local frost dates. ${fmtInt(meta.zoneMeta.zips)} ZIP codes, free.`;
  const allZones = [];
  for (let n = 1; n <= 13; n++) for (const h of ['a', 'b']) allZones.push(`${n}${h}`);
  const faqs = [
    ['What is a plant hardiness zone?', 'A USDA plant hardiness zone is based on the average annual extreme minimum temperature: the coldest night of a typical winter. Each zone is a 10°F band split into "a" (colder) and "b" (warmer) halves of 5°F. Plants labeled for your zone or a lower number should survive your winters.'],
    ['How do I find my hardiness zone?', `Enter your 5-digit ZIP code in the zone finder above. It looks up your zone in the official USDA 2023 ZIP code files and shows the temperature range, the zone in degrees Celsius and your local frost dates.`],
    ['Did the hardiness zone map change in 2023?', 'Yes. The USDA released a new map in November 2023 based on 1991–2020 temperatures. About half of the country moved half a zone warmer than on the 2012 map, so plant tags and older books may show an outdated zone for you.'],
    ['Is my hardiness zone the same as my planting zone?', 'People often use the terms interchangeably, but hardiness zones only measure winter cold. They don\'t tell you when to plant vegetables. For that, use your average last spring and first fall frost dates.'],
    ['What is the difference between zone 6a and 6b?', 'Zone 6b is 5°F warmer than zone 6a. In 6a the coldest winter night averages −10°F to −5°F; in 6b it averages −5°F to 0°F. The same rule applies to every "a" and "b" pair.'],
  ];
  const stateRows = states.map((s) => `<tr><td><a href="${s.path}">${s.name}</a></td><td data-v="${zoneKey(s.sum.zones[0])}">${zoneSpan(s.sum.zones)}</td><td data-v="${zoneKey(s.sum.mode)}">${zoneBadge(s.sum.mode)}</td><td data-v="${s.sum.total}">${fmtInt(s.sum.total)}</td></tr>`).join('');
  const body = `
<h1>Hardiness Zone by ZIP Code</h1>
<p class="hgt-lede">Find your USDA plant hardiness zone from the official 2023 map, plus your local frost dates, in one lookup. Covers ${fmtInt(meta.zoneMeta.zips)} ZIP codes in all 50 states and Puerto Rico.</p>
${zoneWidget('hgt-zip')}
<div class="hgt-answer"><span class="hgt-answer__label">Quick answer</span><p>Your hardiness zone is set by the <strong>coldest night of an average winter</strong> where you live. The 2023 USDA map runs from zone 1a (below −55°F, interior Alaska) to 13b (above 65°F, Puerto Rico). Zone <strong>${sum.mode}</strong> covers the most U.S. ZIP codes (${pct(usCounts[sum.mode], sum.total)}). Choose perennials rated for your zone or colder, and use frost dates, not zones, to time vegetable planting.</p></div>
<h2>USDA hardiness zone temperature chart</h2>
<p class="hgt-read">Average annual extreme minimum temperature for each zone, with how many U.S. ZIP codes fall in it on the 2023 map.</p>
<div class="hgt-table-wrap"><table class="hgt-table"><thead><tr><th scope="col">Zone</th><th scope="col">Coldest night (°F)</th><th scope="col">Coldest night (°C)</th><th scope="col">U.S. ZIP codes</th></tr></thead><tbody>
${allZones.map((z) => `<tr><td>${zoneBadge(z)}</td><td>${zoneRange(z)}</td><td>${zoneRangeC(z)}</td><td>${usCounts[z] ? `${fmtInt(usCounts[z])} (${pct(usCounts[z], sum.total)})` : '–'}</td></tr>`).join('\n')}
</tbody></table></div>
<h2 id="states">Hardiness zones by state</h2>
<p class="hgt-read">The range of zones in each state and the zone that covers the most ZIP codes. Open a state for town-by-town zones and frost dates.</p>
<div class="hgt-table-wrap"><table class="hgt-table" data-sortable>
<thead><tr><th scope="col"><button type="button">State</button></th><th scope="col"><button type="button">Zones</button></th><th scope="col"><button type="button">Most common</button></th><th scope="col"><button type="button">ZIP codes</button></th></tr></thead>
<tbody>${stateRows}</tbody></table></div>
<ul class="hgt-states">${states.map((s) => `<li><a href="${s.path}">${s.name}</a></li>`).join('')}</ul>
${faqBlock(faqs)}
${relatedTools(path)}
<section class="hgt-sources hgt-read"><h2>Sources</h2><p><a href="${USDA_URL}" rel="nofollow">USDA Agricultural Research Service, 2023 Plant Hardiness Zone Map</a>; ZIP code zone files from the <a href="${PRISM_URL}" rel="nofollow">PRISM Climate Group, Oregon State University</a>. Frost dates: <a href="${NOAA_URL}" rel="nofollow">NOAA NCEI 1991–2020 U.S. Climate Normals</a>. This is an independent tool, not an official USDA site. <a href="/about/">How the lookup works.</a></p></section>`;
  const schema = [
    { '@type': 'WebApplication', '@id': `${SITE}${path}#app`, name: 'Hardiness Zone by ZIP Code', url: SITE + path, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any (web browser)', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description, publisher: { '@id': ORG_ID }, isPartOf: { '@id': `${SITE}/#website` }, isBasedOn: USDA_URL },
    faqSchema(faqs),
  ];
  return page({ path, title, description, body, active: ZONE_IDX, crumbs: [[path, 'Hardiness Zones']], schema, scripts: ['/assets/zone.js'] });
}

async function loadZones(stations) {
  const zoneMeta = JSON.parse(await readFile('data/zones/meta.json', 'utf8'));
  const byCode = {};
  const usCounts = {};
  const nearest = {};
  for (const f of await readdir('data/zones')) {
    if (!/^\d{3}\.json$/.test(f)) continue;
    const zones = JSON.parse(await readFile(join('data/zones', f), 'utf8'));
    let frost = null;
    try { frost = JSON.parse(await readFile(join('data/frost/zip', f), 'utf8')); } catch { /* no frost file for this prefix */ }
    for (const [zip, zone] of Object.entries(zones)) {
      usCounts[zone] = (usCounts[zone] || 0) + 1;
      const st = zipState(zip);
      if (st && STATES[st]) { const c = (byCode[st] ||= {}); c[zone] = (c[zone] || 0) + 1; }
      const n = frost && frost.z[zip] && frost.z[zip][0];
      if (n && n[1] <= 8 && (!nearest[n[0]] || n[1] < nearest[n[0]].d)) nearest[n[0]] = { d: n[1], zone };
    }
  }
  const towns = {};
  for (const s of stations) if (nearest[s.id]) (towns[s.st] ||= []).push({ ...s, zone: nearest[s.id].zone });
  const zoneStates = {};
  for (const [code, counts] of Object.entries(byCode)) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total >= 20) zoneStates[code] = { counts, towns: (towns[code] || []).sort((a, b) => a.name.localeCompare(b.name)) };
  }
  return { zoneMeta, zoneStates, usCounts };
}

// ---------- masonry calculators ----------
// Coverage rates: block face incl. ⅜ in joints (ASTM C90 nominal sizes); mortar yield from Quikrete's
// 80 lb Type N / Type S bag labels (12–13 standard blocks; 12 used); grout = fully grouted fill of
// 0.93 / 1.12 / 1.65 cu yd per 100 sq ft for 6, 8 and 12 in walls, expressed per block.
const CMU = {
  sizes: {
    4: { short: '4 × 8 × 16', label: '4 × 8 × 16 in (partition / veneer)', h: 8, l: 16, w: 4, grout: 0 },
    6: { short: '6 × 8 × 16', label: '6 × 8 × 16 in', h: 8, l: 16, w: 6, grout: 0.223 },
    8: { short: '8 × 8 × 16', label: '8 × 8 × 16 in (standard)', h: 8, l: 16, w: 8, grout: 0.269 },
    '8h': { short: '8 × 4 × 16', label: '8 × 4 × 16 in (half-high)', h: 4, l: 16, w: 8, grout: 0.135 },
    12: { short: '12 × 8 × 16', label: '12 × 8 × 16 in', h: 8, l: 16, w: 12, grout: 0.396 },
  },
  blocksPerBag: 12, groutWaste: 0.1, bagYield: 0.6, dowelFt: 2, minFooting: 8, defaultL: 20, defaultH: 4,
};
const SRW = {
  blocks: {
    small: { short: '4 × 12 in', label: 'Small garden wall block, 4 × 12 × 7 in (about 20 lb)', h: 4, l: 12, d: 7, lb: 20 },
    standard: { short: '6 × 16 in', label: 'Standard wall block, 6 × 16 × 12 in (about 50 lb)', h: 6, l: 16, d: 12, lb: 50 },
    large: { short: '8 × 18 in', label: 'Large wall block, 8 × 18 × 12 in (about 75 lb)', h: 8, l: 18, d: 12, lb: 75 },
  },
  buryRatio: 0.1, baseIn: 6, baseExtra: 12, drainIn: 12, tonsPerYd: 1.4, fabricRoll: 150, gridFt: 3, permitFt: 4, defaultL: 20, defaultH: 2,
};
const QUIKRETE_URL = 'https://www.quikrete.com/productlines/masonmix.asp';
const CMHA_URL = 'https://www.cmha.org/resource/srw-tec-004/';
const CALC_TOOLS = [
  ['🧱', 'Concrete Block Calculator', '/concrete-block-calculator/', 'CMU blocks, mortar bags, core grout, rebar and footing concrete for one wall or several, with cost.'],
  ['🪨', 'Retaining Wall Calculator', '/retaining-wall-calculator/', 'Wall and cap blocks, base gravel, drainage stone, drain pipe and fabric for a segmental block wall.'],
];
const cmuCount = (lFt, hFt, size) => Math.ceil((lFt * 12) / size.l - 1e-9) * Math.ceil((hFt * 12) / size.h - 1e-9);
const priceInput = (name, label, value) => `<label class="hgt-calc__field"><span>${label}</span><span class="hgt-calc__money"><input type="number" inputmode="decimal" min="0" step="0.01" name="${name}" value="${value}"></span></label>`;
const wallRows = () => `<fieldset class="hgt-calc__set"><legend>Wall size</legend><div data-rows></div>
<button type="button" class="hgt-btn hgt-btn--ghost hgt-calc__add" data-add>+ Add another wall</button></fieldset>`;

const cmuCard = (embed = false) => `<div class="hgt-card hgt-calc" data-hgt-calc="cmu"${embed ? ' data-embed' : ''} data-config='${esc(JSON.stringify(CMU))}'>
<form novalidate>
${wallRows()}
<div class="hgt-calc__grid">
<label class="hgt-calc__field"><span>Block size (W × H × L)</span><select name="size">${Object.entries(CMU.sizes).map(([k, v]) => `<option value="${k}"${k === '8' ? ' selected' : ''}>${v.label}</option>`).join('')}</select></label>
<label class="hgt-calc__field"><span>Doors and windows (sq ft)</span><input type="number" inputmode="decimal" min="0" step="1" name="openings" placeholder="0"></label>
<label class="hgt-calc__field"><span>Fill cores with grout</span><select name="grout"><option value="none">No grout</option><option value="rebar" selected>Only cores with rebar</option><option value="full">All cores (fully grouted)</option></select></label>
<label class="hgt-calc__field"><span>Vertical rebar spacing</span><select name="rebar"><option value="0">No rebar</option><option value="16">16 in</option><option value="24">24 in</option><option value="32">32 in</option><option value="48" selected>48 in</option></select></label>
<label class="hgt-calc__field"><span>Waste allowance (%)</span><input type="number" inputmode="numeric" min="0" max="30" step="1" name="waste" value="5"></label>
<label class="hgt-calc__check"><input type="checkbox" name="footing" checked> Include a concrete footing</label>
</div>
<details class="hgt-calc__prices"><summary>Prices (edit to match your store)</summary><div class="hgt-calc__grid">
${priceInput('pBlock', 'Per block', 2.5)}${priceInput('pMortar', 'Mortar, 80 lb bag', 10)}${priceInput('pBag', 'Concrete, 80 lb bag', 6.5)}${priceInput('pReady', 'Ready-mix, per cu yd', 180)}${priceInput('pRebar', '#4 rebar, 20 ft', 12)}${priceInput('pWire', 'Ladder wire, 10 ft', 4)}
</div></details>
</form>
<div class="hgt-frost__out" data-out hidden></div>
</div>`;

const srwCard = (embed = false) => `<div class="hgt-card hgt-calc" data-hgt-calc="srw"${embed ? ' data-embed' : ''} data-config='${esc(JSON.stringify(SRW))}'>
<form novalidate>
<p class="hgt-calc__hint">Enter the <strong>exposed</strong> height, above finished ground. Buried courses are added for you.</p>
${wallRows()}
<div class="hgt-calc__grid">
<label class="hgt-calc__field"><span>Wall block</span><select name="block">${Object.entries(SRW.blocks).map(([k, v]) => `<option value="${k}"${k === 'standard' ? ' selected' : ''}>${v.label}</option>`).join('')}<option value="custom">Custom size…</option></select></label>
<label class="hgt-calc__field"><span>Waste allowance (%)</span><input type="number" inputmode="numeric" min="0" max="30" step="1" name="waste" value="5"></label>
<label class="hgt-calc__check"><input type="checkbox" name="cap" checked> Cap blocks, <input class="hgt-calc__inline" type="number" min="4" max="36" step="1" name="capl" value="12" aria-label="Cap block length in inches"> in long</label>
<label class="hgt-calc__check"><input type="checkbox" name="pipe" checked> Perforated drain pipe</label>
</div>
<div class="hgt-calc__grid" data-custom hidden>
<label class="hgt-calc__field"><span>Block height (in)</span><input type="number" inputmode="decimal" min="1" step="0.25" name="bh" value="6"></label>
<label class="hgt-calc__field"><span>Block face length (in)</span><input type="number" inputmode="decimal" min="1" step="0.25" name="bl" value="16"></label>
<label class="hgt-calc__field"><span>Block depth (in)</span><input type="number" inputmode="decimal" min="1" step="0.25" name="bd" value="12"></label>
<label class="hgt-calc__field"><span>Weight per block (lb)</span><input type="number" inputmode="decimal" min="0" step="1" name="bw" value="50"></label>
</div>
<details class="hgt-calc__prices"><summary>Prices (edit to match your store)</summary><div class="hgt-calc__grid">
${priceInput('pBlock', 'Per wall block', 4)}${priceInput('pCap', 'Per cap block', 5)}${priceInput('pStone', 'Gravel, per cu yd', 55)}${priceInput('pPipe', 'Drain pipe, 10 ft', 12)}${priceInput('pFabric', 'Fabric, 3 × 50 ft roll', 25)}
</div></details>
</form>
<div class="hgt-frost__out" data-out hidden></div>
</div>`;

function blockCalcPage() {
  const path = '/concrete-block-calculator/';
  const title = 'Concrete Block Calculator: CMU Blocks, Mortar & Grout';
  const description = 'Free concrete block calculator: how many CMU blocks, 80 lb mortar bags, core grout, rebar and footing concrete your wall needs, with cost and a printable list.';
  const s8 = CMU.sizes[8];
  const perSq = 144 / (s8.h * s8.l);
  const ex = cmuCount(10, 8, s8);
  const card = cmuCard();

  const lengths = [8, 10, 12, 16, 20, 24, 30, 40, 50];
  const heights = [2, 3, 4, 6, 8];
  const refTable = `<div class="hgt-table-wrap"><table class="hgt-table"><thead><tr><th scope="col">Wall length</th>${heights.map((h) => `<th scope="col">${h} ft high</th>`).join('')}</tr></thead><tbody>
${lengths.map((l) => `<tr><td>${l} ft</td>${heights.map((h) => `<td>${fmtInt(cmuCount(l, h, s8))}</td>`).join('')}</tr>`).join('\n')}
</tbody></table></div>`;
  const per100 = `<div class="hgt-table-wrap"><table class="hgt-table"><thead><tr><th scope="col">Block size</th><th scope="col">Blocks per 100 sq ft</th><th scope="col">Mortar (80 lb bags)</th><th scope="col">Grout, fully grouted</th></tr></thead><tbody>
${Object.values(CMU.sizes).map((v) => { const n = 14400 / (v.h * v.l); return `<tr><td>${v.label}</td><td>${fmtInt(n)}</td><td>${Math.ceil(n / CMU.blocksPerBag)}</td><td>${v.grout ? `${(n * v.grout / 27).toFixed(2)} cu yd` : 'Not usually grouted'}</td></tr>`; }).join('\n')}
</tbody></table></div>`;

  const faqs = [
    ['How many concrete blocks do I need per square foot?', `A standard 8 × 8 × 16 in block covers 16 × 8 in of wall including the ⅜ in mortar joint, which is 0.89 sq ft. That works out to ${perSq.toFixed(3)} blocks per square foot, or about ${fmtInt(perSq * 100)} blocks per 100 sq ft, before waste.`],
    ['How many blocks are in a 10 × 8 ft wall?', `A 10 ft long, 8 ft high wall of standard 8 × 8 × 16 blocks is 8 blocks per course (120 in ÷ 16 in, rounded up to a whole block) times 12 courses (96 in ÷ 8 in), which is ${ex} blocks. Order about ${Math.ceil(ex * 1.05)} with 5% extra for cuts and breakage.`],
    ['How many blocks does an 80 lb bag of mortar lay?', `Quikrete's 80 lb Mason Mix and Mortar Mix labels give about 12 to 13 standard 8 × 8 × 16 blocks per bag. This calculator uses ${CMU.blocksPerBag} per bag so you don't run short; your rate depends on joint thickness and waste.`],
    ['How much grout do I need to fill concrete block?', 'A fully grouted 8 in block wall takes about 1.12 cubic yards of grout per 100 sq ft (about 0.27 cu ft per block). A 6 in wall takes about 0.93 and a 12 in wall about 1.65 cu yd per 100 sq ft. Most garden and garage walls only grout the cores that hold rebar.'],
    ['Should I use Type S or Type N mortar for block?', 'Use Type S for walls below grade, retaining walls, foundations and anything structural, because it is stronger in compression and bending. Type N suits above-grade, non-load-bearing walls and is easier to work. Check your local building code for structural walls.'],
    ['How big should a concrete block wall footing be?', 'A common rule of thumb is a footing twice as wide as the wall and as deep as the wall is thick, so 16 in wide and 8 in deep for an 8 in block wall, placed below your frost line. Local code, soil and wall height can require more, so confirm with your building department.'],
  ];
  const body = `
<h1>Concrete Block Calculator</h1>
<p class="hgt-lede">How many CMU blocks, bags of mortar, grout, rebar and footing concrete you need for a block wall, worked out course by course so the count matches what you actually lay.</p>
<div class="hgt-answer"><span class="hgt-answer__label">Quick answer</span><p>A standard <strong>8 × 8 × 16 in concrete block covers 0.89 sq ft</strong>, so you need <strong>${perSq.toFixed(3)} blocks per square foot (about ${fmtInt(perSq * 100)} per 100 sq ft)</strong>. Multiply your wall's length × height in feet by ${perSq.toFixed(3)}, add 5% for cuts, and plan on one 80 lb bag of mortar for every ${CMU.blocksPerBag} blocks.</p></div>
${card}
<h2>How many blocks for common wall sizes</h2>
<p class="hgt-read">Standard 8 × 8 × 16 in blocks, counted course by course with cut blocks counted as whole. Add 5–10% for waste.</p>
${refTable}
<h2>Blocks, mortar and grout per 100 sq ft</h2>
${per100}
<section class="hgt-read"><h2>How to estimate a block wall</h2>
<ol>
<li><strong>Measure each wall</strong> in feet. Use the outside length; at corners, count the corner block once on one wall only.</li>
<li><strong>Count courses:</strong> wall height in inches ÷ 8 (÷ 4 for half-high blocks), rounded up.</li>
<li><strong>Count blocks per course:</strong> wall length in inches ÷ 16, rounded up. End blocks you cut still use a whole block.</li>
<li><strong>Subtract openings</strong> for doors and windows at ${perSq.toFixed(3)} blocks per square foot, then add 5% for breakage, or 10% if you have many corners and cuts.</li>
<li><strong>Add mortar, grout and steel:</strong> one 80 lb mortar bag per ${CMU.blocksPerBag} blocks; grout every core that holds rebar (or all cores for a structural wall); ladder wire every second course.</li>
</ol>
<p>Building a garden or landscape wall that holds back soil? Mortared block needs a structural design for that. Dry-stacked segmental blocks are usually easier; use the <a href="/retaining-wall-calculator/">retaining wall calculator</a>.</p></section>
${faqBlock(faqs)}
${embedCta('concrete-block')}
${relatedTools(path)}
<section class="hgt-sources hgt-read"><h2>Sources and assumptions</h2>
<p>Block sizes are ASTM C90 nominal sizes (actual faces are ⅜ in smaller to leave room for the joint). Mortar yield is from the 80 lb <a href="${QUIKRETE_URL}" rel="nofollow">Quikrete Mason Mix</a> and Mortar Mix bag labels (12–13 standard blocks per bag). Grout rates are the commonly published fill volumes for fully grouted 6, 8 and 12 in walls, plus 10% waste. Concrete bags are 80 lb at 0.6 cu ft yield. Rebar lengths add 2 ft per bar to lap into the footing. Results are estimates for planning and ordering; structural walls need a design that meets your local building code.</p></section>`;
  const schema = [
    { '@type': 'WebApplication', '@id': `${SITE}${path}#app`, name: 'Concrete Block Calculator', url: SITE + path, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any (web browser)', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description, publisher: { '@id': ORG_ID }, isPartOf: { '@id': `${SITE}/#website` } },
    faqSchema(faqs),
  ];
  return { path, html: page({ path, title, description, body, active: '/#calculators', crumbs: [['/#calculators', 'Calculators'], [path, 'Concrete Block Calculator']], schema, scripts: ['/assets/masonry.js'] }) };
}

function retainingCalcPage() {
  const path = '/retaining-wall-calculator/';
  const title = 'Retaining Wall Calculator: Blocks, Caps, Gravel & Drainage';
  const description = 'Free retaining wall block calculator: wall and cap blocks, base gravel, drainage stone, drain pipe and fabric for a segmental block wall, with buried courses and cost.';
  const card = srwCard();

  // Per 10 ft of wall, using the same rules as the calculator.
  const per10 = (b, hFt) => {
    const exp = hFt * 12, bc = Math.max(1, Math.ceil((exp * SRW.buryRatio) / b.h - 1e-9)), c = bc + Math.ceil(exp / b.h - 1e-9);
    const blocks = Math.ceil(120 / b.l - 1e-9) * c;
    const hTot = (c * b.h) / 12;
    const stone = (10 * ((b.d + SRW.baseExtra) / 12) * (SRW.baseIn / 12) + 10 * (SRW.drainIn / 12) * hTot) / 27;
    return { blocks, stone };
  };
  const hs = [1, 2, 3];
  const ref = `<div class="hgt-table-wrap"><table class="hgt-table"><thead><tr><th scope="col">Block</th>${hs.map((h) => `<th scope="col">${h} ft exposed</th>`).join('')}</tr></thead><tbody>
${Object.values(SRW.blocks).map((b) => `<tr><td>${b.label.replace(/ \(.*$/, '')}</td>${hs.map((h) => { const r = per10(b, h); return `<td>${r.blocks} blocks · ${r.stone.toFixed(2)} cu yd stone</td>`; }).join('')}</tr>`).join('\n')}
</tbody></table></div>`;
  const std = SRW.blocks.standard;
  const ex = per10(std, 2);
  const faqs = [
    ['How many retaining wall blocks do I need?', `Divide the wall length in inches by the block's face length to get blocks per course, then multiply by the number of courses: the exposed height divided by the block height, plus at least one buried course. For a 10 ft wall, 2 ft high, with 6 × 16 in blocks that is 8 blocks × 5 courses = ${ex.blocks} blocks, plus 5% for cuts.`],
    ['How deep should the gravel base be for a retaining wall?', `Most block makers call for at least ${SRW.baseIn} in of compacted crushed gravel in a trench about ${SRW.baseExtra} in wider than the block is deep, with the first course buried. Bury at least one full course, or one-tenth of the exposed height if that is more.`],
    ['How much gravel goes behind a retaining wall?', `Fill a zone about ${SRW.drainIn} in wide behind the blocks with clean ¾ in drainage stone for the full height of the wall. For each 10 ft of a 2 ft high wall built with 6 × 16 in blocks, base and drainage stone together come to about ${ex.stone.toFixed(1)} cu yd (about ${(ex.stone * SRW.tonsPerYd).toFixed(1)} tons).`],
    ['How tall can a block retaining wall be without reinforcement?', `It depends on the block, soil and what sits above the wall, so check the manufacturer's design chart. Many segmental blocks need geogrid above about ${SRW.gridFt} ft. The International Residential Code (R404.4) requires a designed wall when it retains more than ${SRW.permitFt} ft of unbalanced soil, and many towns also require a permit at that height.`],
    ['Do I need a drain pipe behind a retaining wall?', 'Water pressure is the main reason block walls fail. A 4 in perforated pipe at the base of the drainage stone, sloped to daylight at one end, is recommended for walls over about 2 ft, in clay soil, or where downspouts or slopes send water toward the wall.'],
  ];
  const body = `
<h1>Retaining Wall Calculator</h1>
<p class="hgt-lede">Wall blocks, caps, base gravel, drainage stone, drain pipe and filter fabric for a dry-stacked segmental block wall, including the buried course most quick calculators forget.</p>
<div class="hgt-answer"><span class="hgt-answer__label">Quick answer</span><p><strong>Blocks = (wall length in inches ÷ block length) × (courses above ground + buried courses).</strong> Bury at least one course. Under the wall, lay ${SRW.baseIn} in of compacted gravel; behind it, ${SRW.drainIn} in of clean drainage stone the full height. A 10 ft long, 2 ft high wall of 6 × 16 in blocks needs about ${ex.blocks} blocks and ${ex.stone.toFixed(1)} cu yd of stone.</p></div>
${card}
<h2>Blocks and stone per 10 ft of wall</h2>
<p class="hgt-read">Includes one or more buried courses and the gravel base and drainage zone described above. Multiply by your length in feet ÷ 10, and add 5% for blocks.</p>
${ref}
<section class="hgt-read"><h2>How to build it so it lasts</h2>
<ol>
<li><strong>Dig the trench</strong> about ${SRW.baseExtra} in wider than the block depth and deep enough for ${SRW.baseIn} in of base plus the buried course.</li>
<li><strong>Compact the base</strong> in 2–3 in lifts with a plate compactor and level it carefully. The first course decides how straight the whole wall is.</li>
<li><strong>Lay the first course</strong> level both ways, then backfill in front of it.</li>
<li><strong>Stack and drain as you go:</strong> lay each course with the joints staggered, fill the cores and the ${SRW.drainIn} in zone behind with drainage stone, and compact the soil behind that every course or two.</li>
<li><strong>Cap and finish:</strong> glue caps with landscape block adhesive and top the drainage stone with fabric and a few inches of soil so surface water runs off.</li>
</ol>
<p>Building a mortared wall instead? Use the <a href="/concrete-block-calculator/">concrete block calculator</a>.</p></section>
${faqBlock(faqs)}
${embedCta('retaining-wall')}
${relatedTools(path)}
<section class="hgt-sources hgt-read"><h2>Sources and assumptions</h2>
<p>Base, buried-course and drainage-zone dimensions follow common segmental retaining wall practice described by the <a href="${CMHA_URL}" rel="nofollow">Concrete Masonry and Hardscapes Association</a> and block makers' installation guides; your block's own guide takes priority. Stone is converted at ${SRW.tonsPerYd} tons per cubic yard; filter fabric adds 1 ft per wall for overlap. Block sizes and weights are typical of each class; enter your exact block under "Custom size". The height limit cites International Residential Code section R404.4. Results are estimates for planning and ordering, not an engineered design.</p></section>`;
  const schema = [
    { '@type': 'WebApplication', '@id': `${SITE}${path}#app`, name: 'Retaining Wall Calculator', url: SITE + path, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any (web browser)', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description, publisher: { '@id': ORG_ID }, isPartOf: { '@id': `${SITE}/#website` } },
    faqSchema(faqs),
  ];
  return { path, html: page({ path, title, description, body, active: '/#calculators', crumbs: [['/#calculators', 'Calculators'], [path, 'Retaining Wall Calculator']], schema, scripts: ['/assets/masonry.js'] }) };
}

// ---------- lawn calculators ----------
// Seeding rates (lb per 1,000 sq ft, new lawn) use the University of Tennessee Extension W160-B ranges;
// the calculator uses one value inside each range, and overseeding uses about half the new-lawn rate.
const UT_SEED_URL = 'https://uthort.tennessee.edu/wp-content/uploads/sites/228/2023/11/W160-B.pdf';
const UC_SEED_URL = 'https://ipm.ucanr.edu/TOOLS/TURF/SITEPREP/sdtimert.html';
const SOD_URL = 'https://sodsolutions.com/sod-university/square-feet-per-pallet/';
const COOL = { season: 'Late summer to early fall', soil: 'Sprouts best in 50–65°F soil' };
const WARM = { season: 'Late spring to early summer', soil: 'Needs soil above 65°F to sprout' };
const SEED = {
  grasses: {
    tf: { name: 'Tall fescue', range: '5–8', rate: 7, over: 3.5, days: '7–14', ...COOL },
    kbg: { name: 'Kentucky bluegrass', range: '1.5–2', rate: 2, over: 1, days: '14–30', ...COOL, note: 'Kentucky bluegrass is slow to sprout (2–4 weeks). Keep the surface moist the whole time, or mix in perennial ryegrass for quick cover.' },
    prg: { name: 'Perennial ryegrass', range: '4–6', rate: 5, over: 2.5, days: '5–10', ...COOL },
    berm: { name: 'Bermudagrass (hulled)', range: '0.5–1', rate: 1, over: 0.5, days: '7–14', ...WARM },
    zoy: { name: 'Zoysiagrass (japonica)', range: '0.5–3', rate: 2, over: 1, days: '14–21', ...WARM, note: 'Zoysia from seed is slow and can take a full season to fill in; many lawns use sod or plugs instead.' },
  },
  bags: [50, 20, 7, 3], strawSqft: 1000, defaultL: 50, defaultW: 30,
};
const SOD = {
  pieces: {
    slab: { name: 'Slabs', plural: 'slabs', size: '16 × 24 in', sqft: 2.67 },
    roll: { name: 'Rolls', plural: 'rolls', size: '2 × 5 ft', sqft: 10 },
  },
  pallet: 450, defaultL: 50, defaultW: 30,
};
const LAWN_TOOLS = [
  ['🌾', 'Sod Calculator', '/sod-calculator/', 'Square feet, pallets, slabs or rolls, topsoil and cost for any lawn shape.'],
  ['🌱', 'Grass Seed Calculator', '/grass-seed-calculator/', 'Pounds of seed and the bags to buy by grass type, for a new lawn or overseeding.'],
];

const areaRows = () => `<fieldset class="hgt-calc__set"><legend>Lawn area</legend><div data-rows></div>
<button type="button" class="hgt-btn hgt-btn--ghost hgt-calc__add" data-add>+ Add another area</button></fieldset>`;
const subField = () => `<label class="hgt-calc__field"><span>Exclude (beds, patio) sq ft</span><input type="number" inputmode="decimal" min="0" step="1" name="sub" placeholder="0"></label>`;

const sodCard = (embed = false) => `<div class="hgt-card hgt-calc" data-hgt-lawn="sod"${embed ? ' data-embed' : ''} data-config='${esc(JSON.stringify(SOD))}'>
<form novalidate>
${areaRows()}
<div class="hgt-calc__grid">
${subField()}
<label class="hgt-calc__field"><span>Extra for cuts (%)</span><input type="number" inputmode="numeric" min="0" max="30" step="1" name="waste" value="5"></label>
<label class="hgt-calc__field"><span>Sod comes as</span><select name="piece">${Object.entries(SOD.pieces).map(([k, v]) => `<option value="${k}">${v.name} (${v.size})</option>`).join('')}</select></label>
<label class="hgt-calc__field"><span>Sq ft per pallet</span><input type="number" inputmode="numeric" min="100" step="10" name="pallet" value="${SOD.pallet}"></label>
<label class="hgt-calc__field"><span>Topsoil under sod</span><select name="soil"><option value="0">None</option><option value="1">1 in</option><option value="2">2 in</option><option value="4">4 in</option><option value="6">6 in</option></select></label>
</div>
<details class="hgt-calc__prices"><summary>Prices (edit to match your supplier)</summary><div class="hgt-calc__grid">
${priceInput('pSqft', 'Sod per sq ft', 0.5)}${priceInput('pDelivery', 'Delivery fee', 75)}${priceInput('pSoil', 'Topsoil per cu yd', 40)}
</div></details>
</form>
<div class="hgt-frost__out" data-out hidden></div>
</div>`;

const seedCard = (embed = false) => `<div class="hgt-card hgt-calc" data-hgt-lawn="seed"${embed ? ' data-embed' : ''} data-config='${esc(JSON.stringify(SEED))}'>
<form novalidate>
${areaRows()}
<div class="hgt-calc__grid">
<label class="hgt-calc__field"><span>Grass type</span><select name="grass">${Object.entries(SEED.grasses).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}<option value="custom">Rate from my seed bag…</option></select></label>
<label class="hgt-calc__field"><span>Job</span><select name="job"><option value="new">New lawn or bare soil</option><option value="over">Overseeding a thin lawn</option></select></label>
${subField()}
<label class="hgt-calc__field" data-custom hidden><span>Bag rate (lb per 1,000 sq ft)</span><input type="number" inputmode="decimal" min="0" step="0.1" name="custom" value="5"></label>
<label class="hgt-calc__check"><input type="checkbox" name="straw"> Add straw mulch</label>
</div>
<details class="hgt-calc__prices"><summary>Prices (edit to match your store)</summary><div class="hgt-calc__grid">
${priceInput('pLb', 'Seed per lb', 4)}${priceInput('pStraw', 'Straw per bale', 10)}
</div></details>
</form>
<div class="hgt-frost__out" data-out hidden></div>
</div>`;

const ALL_TOOLS = () => [
  ['🌡️', 'Hardiness Zone by ZIP', ZONE_IDX, 'Your USDA 2023 zone and local frost dates.'],
  ['❄️', 'Frost Dates by ZIP', '/frost-dates/', 'Last and first frost from the nearest NOAA station.'],
  ...BATCH1_TOOLS, ...BATCH1_VARIANTS, ...LAWN_TOOLS, ...CALC_TOOLS,
];
// Each tool page links to its siblings so link equity and visitors flow across the cluster.
const FAMILY = {
  '/stair-calculator/': 'stairs', '/stair-stringer-calculator/': 'stairs',
  '/gravel-calculator/': 'ground', '/pea-gravel-calculator/': 'ground', '/driveway-gravel-calculator/': 'ground', '/paver-calculator/': 'ground', '/paver-base-calculator/': 'ground',
  '/pool-volume-calculator/': 'pool', '/pool-salt-calculator/': 'pool', '/pool-shock-calculator/': 'pool',
  '/sod-calculator/': 'lawn', '/grass-seed-calculator/': 'lawn', '/concrete-block-calculator/': 'masonry', '/retaining-wall-calculator/': 'masonry',
  '/hardiness-zones/': 'climate', '/frost-dates/': 'climate',
};
const NEAR = { stairs: ['masonry', 'ground'], ground: ['masonry', 'lawn'], pool: ['lawn', 'ground'], lawn: ['climate', 'ground'], masonry: ['ground', 'stairs'], climate: ['lawn'] };
const rank = (path) => (t) => { const a = FAMILY[path], b = FAMILY[t[2]]; return a === b ? 0 : (NEAR[a] || []).indexOf(b) >= 0 ? 1 + (NEAR[a] || []).indexOf(b) : 9; };
const relatedTools = (path) => `<section><h2>Related free tools</h2><div class="hgt-grid">${ALL_TOOLS().filter((t) => t[2] !== path).sort((x, y) => rank(path)(x) - rank(path)(y)).slice(0, 4).map(([icon, name, url, text]) => `<a class="hgt-card hgt-tool" href="${url}"><span class="hgt-tool__icon" aria-hidden="true">${icon}</span><h3 class="hgt-tool__title">${name}</h3><p class="hgt-tool__text">${text}</p><span class="hgt-tool__go">Open tool →</span></a>`).join('')}</div></section>`;
const embedCta = (slugName) => `<p class="hgt-read hgt-sources">Run a garden club, nursery or landscaping site? <a href="/embed/#${slugName}">Embed this calculator free</a> with one line of code.</p>`;
const appSchema = (path, name, description) => ({ '@type': 'WebApplication', '@id': `${SITE}${path}#app`, name, url: SITE + path, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any (web browser)', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description, publisher: { '@id': ORG_ID }, isPartOf: { '@id': `${SITE}/#website` } });

function sodCalcPage() {
  const path = '/sod-calculator/';
  const title = 'Sod Calculator: Square Feet, Pallets, Rolls & Cost';
  const description = 'Free sod calculator: how many square feet, pallets, slabs or rolls of sod you need for any lawn shape, plus topsoil and cost. Shows the math, prints a list.';
  const areas = [200, 500, 1000, 1500, 2000, 2500, 3000, 5000, 10000];
  const rows = areas.map((a) => { const need = a * 1.05; return `<tr><td>${fmtInt(a)} sq ft</td><td>${fmtInt(Math.ceil(need))}</td><td>${(need / SOD.pallet).toFixed(1)}</td><td>${fmtInt(Math.ceil(need / SOD.pieces.slab.sqft))}</td><td>${fmtInt(Math.ceil(need / SOD.pieces.roll.sqft))}</td></tr>`; }).join('\n');
  const faqs = [
    ['How much sod do I need?', 'Measure the lawn in feet, multiply length by width for each rectangle (or use the circle and triangle options for curves), add the areas together and subtract beds and patios. Add 5% for straight edges or 10% for curves and lots of cutting. That total, in square feet, is what to order.'],
    ['How many square feet are in a pallet of sod?', `Most sod farms load about 450 to 500 sq ft per pallet, but some use 400 sq ft or large rolls of 500 to 700 sq ft. This calculator uses ${SOD.pallet} sq ft; enter your supplier's number for an exact pallet count.`],
    ['How many pieces of sod are on a pallet?', `A standard 16 × 24 in slab covers 2.67 sq ft, so a ${SOD.pallet} sq ft pallet holds about ${Math.round(SOD.pallet / SOD.pieces.slab.sqft)} slabs. Rolls of 2 × 5 ft cover 10 sq ft each, about ${SOD.pallet / SOD.pieces.roll.sqft} per pallet.`],
    ['How much sod do I need for 1,000 square feet?', `About 1,050 sq ft with 5% extra: ${(1050 / SOD.pallet).toFixed(1)} pallets of ${SOD.pallet} sq ft, ${Math.ceil(1050 / SOD.pieces.slab.sqft)} slabs of 16 × 24 in, or ${Math.ceil(1050 / 10)} rolls of 2 × 5 ft.`],
    ['Should I put topsoil down before sod?', 'Sod roots best into loose, level soil. Where the existing soil is compacted, rocky or low, spread 1 to 2 inches of screened topsoil (or more to fill dips), rake it level and roll it lightly before laying sod. Use the topsoil option to estimate cubic yards.'],
    ['How soon can you walk or mow on new sod?', 'Water daily for the first one to two weeks so the soil underneath stays moist, and keep foot traffic off. Most sod roots in two to three weeks; mow for the first time once it no longer lifts when you tug a corner.'],
  ];
  const body = `
<h1>Sod Calculator</h1>
<p class="hgt-lede">How much sod to order for any lawn shape, in square feet, pallets, slabs or rolls, with topsoil and cost. Add as many rectangles, circles and triangles as your yard needs.</p>
<div class="hgt-answer"><span class="hgt-answer__label">Quick answer</span><p>Multiply <strong>length × width</strong> of each lawn area in feet, add them up, and order <strong>5–10% extra</strong> for cuts. One <strong>pallet covers about ${SOD.pallet} sq ft</strong> (check with your farm: 400–500 is typical), a 16 × 24 in slab covers 2.67 sq ft and a 2 × 5 ft roll covers 10 sq ft. A 1,000 sq ft lawn needs about 1,050 sq ft, or ${(1050 / SOD.pallet).toFixed(1)} pallets.</p></div>
${sodCard()}
<h2>Sod needed for common lawn sizes</h2>
<p class="hgt-read">Including 5% extra, with ${SOD.pallet} sq ft pallets.</p>
<div class="hgt-table-wrap"><table class="hgt-table"><thead><tr><th scope="col">Lawn area</th><th scope="col">Order (sq ft)</th><th scope="col">Pallets</th><th scope="col">Slabs 16 × 24 in</th><th scope="col">Rolls 2 × 5 ft</th></tr></thead><tbody>
${rows}
</tbody></table></div>
<section class="hgt-read"><h2>How to measure and order sod</h2>
<ol>
<li><strong>Split the yard into simple shapes:</strong> rectangles, circles (measure across) and triangles. Measure in feet.</li>
<li><strong>Subtract</strong> flower beds, patios and paths inside those shapes.</li>
<li><strong>Add 5–10%:</strong> 5% for straight runs, 10% for curves, slopes and lots of trimming around beds.</li>
<li><strong>Order for one day:</strong> sod is cut to order and should be laid within 24 hours, so have the soil graded, raked and moist before it arrives.</li>
<li><strong>Lay in a brick pattern</strong> with tight seams, roll it, and water until the soil 3–4 inches down is wet.</li>
</ol>
<p>Prefer to seed instead? Seed costs far less per square foot but takes a season to fill in; compare with the <a href="/grass-seed-calculator/">grass seed calculator</a>.</p></section>
${faqBlock(faqs)}
${embedCta('sod')}
${relatedTools(path)}
<section class="hgt-sources hgt-read"><h2>Sources and assumptions</h2><p>Pallet coverage of 450–500 sq ft and standard 16 × 24 in slab size, per <a href="${SOD_URL}" rel="nofollow">Sod Solutions</a> and typical U.S. sod farm listings; your supplier's figures take priority. Circle areas use π × diameter² ÷ 4. Topsoil volume is area × depth ÷ 12 ÷ 27. Prices are placeholders to edit.</p></section>`;
  return { path, html: page({ path, title, description, body, active: '/#calculators', crumbs: [['/#calculators', 'Calculators'], [path, 'Sod Calculator']], schema: [appSchema(path, 'Sod Calculator', description), faqSchema(faqs)], scripts: ['/assets/lawn.js'] }) };
}

function seedCalcPage() {
  const path = '/grass-seed-calculator/';
  const title = 'Grass Seed Calculator: How Much Grass Seed Do I Need?';
  const description = 'Free grass seed calculator: pounds of seed and the bags to buy for a new lawn or overseeding, by grass type, per 1,000 sq ft or per acre, using extension seeding rates.';
  const G = SEED.grasses;
  const rows = Object.values(G).map((g) => `<tr><td>${g.name}</td><td>${g.range} lb</td><td>${g.rate} lb</td><td>${g.over} lb</td><td>${fmtInt(g.rate * 43.56)} lb</td><td>${g.days} days</td></tr>`).join('\n');
  const faqs = [
    ['How much grass seed do I need?', `Multiply your lawn area in square feet by the seeding rate per 1,000 sq ft for your grass, then divide by 1,000. For a 5,000 sq ft new lawn of tall fescue at ${G.tf.rate} lb per 1,000 sq ft, that is ${G.tf.rate * 5} lb. Overseeding a thin lawn takes about half as much.`],
    ['How much grass seed per square foot?', `Very little: tall fescue at ${G.tf.rate} lb per 1,000 sq ft is ${(G.tf.rate / 1000).toFixed(3)} lb (about ${((G.tf.rate / 1000) * 16).toFixed(2)} oz) per square foot, and Kentucky bluegrass at ${G.kbg.rate} lb per 1,000 sq ft is ${(G.kbg.rate / 1000).toFixed(3)} lb per square foot. That is why rates are given per 1,000 sq ft.`],
    ['How much grass seed per acre?', `An acre is 43,560 sq ft, so multiply the per-1,000 rate by 43.56: about ${fmtInt(G.tf.rate * 43.56)} lb of tall fescue, ${fmtInt(G.prg.rate * 43.56)} lb of perennial ryegrass, ${fmtInt(G.kbg.rate * 43.56)} lb of Kentucky bluegrass or ${fmtInt(G.berm.rate * 43.56)} lb of hulled bermudagrass for a new lawn.`],
    ['How much grass seed for overseeding?', `Use about half the new-lawn rate: roughly ${G.tf.over} lb of tall fescue, ${G.prg.over} lb of perennial ryegrass or ${G.kbg.over} lb of Kentucky bluegrass per 1,000 sq ft. Mow short and core-aerate or dethatch first so the seed reaches the soil.`],
    ['Can you put down too much grass seed?', 'Yes. Seeding far above the recommended rate makes seedlings crowd each other, so they grow thin and weak and are more prone to disease. Extra seed does not make a thicker lawn; good seed-to-soil contact and steady moisture do.'],
    ['When is the best time to plant grass seed?', 'Sow cool-season grasses (tall fescue, Kentucky bluegrass, perennial ryegrass) in late summer to early fall when soil is 50–65°F, or in spring as a second choice. Sow warm-season grasses (bermudagrass, zoysia) in late spring to early summer once soil is above 65°F. Check your local frost dates to plan.'],
  ];
  const body = `
<h1>Grass Seed Calculator</h1>
<p class="hgt-lede">How many pounds of grass seed to buy, and which bag sizes, for a new lawn or for overseeding, by grass type. Works for any lawn shape, from a few bare patches to several acres.</p>
<div class="hgt-answer"><span class="hgt-answer__label">Quick answer</span><p><strong>Seed needed = lawn area (sq ft) ÷ 1,000 × seeding rate.</strong> For a new lawn use about <strong>${G.tf.rate} lb of tall fescue</strong>, ${G.prg.rate} lb of perennial ryegrass or ${G.kbg.rate} lb of Kentucky bluegrass per 1,000 sq ft; for overseeding use about half. A 5,000 sq ft tall fescue lawn needs ${G.tf.rate * 5} lb new or ${G.tf.over * 5} lb to overseed.</p></div>
${seedCard()}
<h2>Grass seeding rates by type</h2>
<p class="hgt-read">Pounds of seed per 1,000 sq ft. The extension range is the University of Tennessee recommendation; the calculator uses the value shown. Your seed bag's label rate takes priority for blends and coated seed.</p>
<div class="hgt-table-wrap"><table class="hgt-table"><thead><tr><th scope="col">Grass</th><th scope="col">Extension range</th><th scope="col">New lawn</th><th scope="col">Overseeding</th><th scope="col">Per acre (new)</th><th scope="col">Days to sprout</th></tr></thead><tbody>
${rows}
</tbody></table></div>
<section class="hgt-read"><h2>How to seed a lawn so it fills in</h2>
<ol>
<li><strong>Time it right:</strong> late summer to early fall for cool-season grass; late spring for warm-season grass.</li>
<li><strong>Prepare the soil:</strong> for a new lawn, loosen the top 2–4 inches and rake it smooth. For overseeding, mow short and core-aerate or dethatch so seed touches soil.</li>
<li><strong>Spread in two passes</strong> at right angles, each with half the seed, for even cover without stripes.</li>
<li><strong>Rake lightly and roll</strong> so seed sits about ¼ inch deep. A thin layer of straw (about one bale per 1,000 sq ft) holds moisture on bare soil.</li>
<li><strong>Keep the surface moist</strong> with light watering once or twice a day until seedlings are 2 inches tall, then water deeper and less often.</li>
</ol>
<p>Need instant grass on a slope or for a deadline? Price it with the <a href="/sod-calculator/">sod calculator</a>.</p></section>
${faqBlock(faqs)}
${embedCta('grass-seed')}
${relatedTools(path)}
<section class="hgt-sources hgt-read"><h2>Sources and assumptions</h2><p>Seeding-rate ranges are from <a href="${UT_SEED_URL}" rel="nofollow">University of Tennessee Extension, W160-B</a>; <a href="${UC_SEED_URL}" rel="nofollow">UC IPM</a> lists somewhat higher rates for tall fescue (8–10 lb) and perennial ryegrass (6–9 lb), so the values here sit in the middle to upper part of the Tennessee ranges. Overseeding at about half the new-lawn rate is common practice for thin turf. Days to sprout are typical in good conditions. Bag sizes reflect common retail sizes. Prices are placeholders to edit.</p></section>`;
  return { path, html: page({ path, title, description, body, active: '/#calculators', crumbs: [['/#calculators', 'Calculators'], [path, 'Grass Seed Calculator']], schema: [appSchema(path, 'Grass Seed Calculator', description), faqSchema(faqs)], scripts: ['/assets/lawn.js'] }) };
}

// Embeddable versions: noindex pages whose canonical points at the full tool. The credit link sits in the
// host page's own HTML (outside the iframe), uses the brand as anchor text and is easy to keep visible.
const EMBEDS = [
  { id: 'frost-dates', name: 'Frost date lookup', tool: '/frost-dates/', height: 440, card: () => frostWidget('hgt-zip', true).replace('hgt-card ', ''), script: '/assets/frost.js' },
  { id: 'concrete-block', name: 'Concrete block calculator', tool: '/concrete-block-calculator/', height: 900, card: () => cmuCard(true), script: '/assets/masonry.js' },
  { id: 'retaining-wall', name: 'Retaining wall calculator', tool: '/retaining-wall-calculator/', height: 900, card: () => srwCard(true), script: '/assets/masonry.js' },
  { id: 'sod', name: 'Sod calculator', tool: '/sod-calculator/', height: 820, card: () => sodCard(true), script: '/assets/lawn.js' },
  { id: 'grass-seed', name: 'Grass seed calculator', tool: '/grass-seed-calculator/', height: 820, card: () => seedCard(true), script: '/assets/lawn.js' },
  { id: 'stairs', name: 'Stair calculator', tool: '/stair-calculator/', height: 900, card: () => stairCard(true), script: '/assets/stairs.js' },
  { id: 'gravel', name: 'Gravel calculator', tool: '/gravel-calculator/', height: 760, card: () => gravelCard(true), script: '/assets/hardscape.js' },
  { id: 'driveway', name: 'Driveway gravel calculator', tool: '/driveway-gravel-calculator/', height: 900, card: () => drivewayCard(true), script: '/assets/hardscape.js' },
  { id: 'paver', name: 'Paver calculator', tool: '/paver-calculator/', height: 900, card: () => paverCard(true), script: '/assets/hardscape.js' },
  { id: 'pool-volume', name: 'Pool volume calculator', tool: '/pool-volume-calculator/', height: 760, card: () => poolCard('volume', true), script: '/assets/pool.js' },
  { id: 'pool-salt', name: 'Pool salt calculator', tool: '/pool-salt-calculator/', height: 760, card: () => poolCard('salt', true), script: '/assets/pool.js' },
  { id: 'pool-shock', name: 'Pool shock calculator', tool: '/pool-shock-calculator/', height: 820, card: () => poolCard('shock', true), script: '/assets/pool.js' },
];
const embedSnippet = (e) => `<iframe src="${SITE}/embed/${e.id}/" title="${e.name}" width="100%" height="${e.height}" style="border:0;max-width:640px" loading="lazy"></iframe>
<p style="font-size:13px">Free ${e.name.toLowerCase()} by <a href="${SITE}${e.tool}">${BRAND}</a></p>`;
const embedFrame = (e) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(e.name)} | ${BRAND}</title><meta name="robots" content="noindex">
<link rel="canonical" href="${SITE}${e.tool}"><style>${CSS}</style>
<base target="_blank"></head>
<body class="hgt-embed">
${e.card()}
<p class="hgt-embed__by">${esc(e.name)} · <a href="${SITE}${e.tool}" rel="noopener">${BRAND}</a></p>
<script src="${e.script}" defer></script>
</body></html>
`;

// ---------- batch 1: stairs, gravel, pool, pavers ----------
const TOOLS_UPDATED = '2026-11-01';
const IRC_STAIR_URL = 'https://codes.iccsafe.org/content/IRC2021P2/chapter-3-building-planning#IRC2021P2_Pt03_Ch03_SecR311.7';
const DCA6_URL = 'https://awc.org/publications/dca/dca6/';
const HAYWARD_URL = 'https://hayward.com/aquarite';
const TFP_URL = 'https://www.troublefreepool.com/';
const CMHA_HOME = 'https://www.cmha.org/';

const STAIRS = { maxRiser: 7.75, minTread: 10, minWidth: 36, maxFlight: 151, maxSpacing: 18, minThroat: 5, boards: { '2×12': 11.25, '2×10': 9.25 }, lengths: [8, 10, 12, 14, 16, 18, 20] };
const GRAVEL = {
  materials: {
    pea: { short: 'pea gravel', name: 'Pea gravel (⅜ in)', tpy: 1.4 },
    57: { short: '#57 stone', name: '#57 crushed stone (¾–1 in)', tpy: 1.4 },
    3: { short: '#3 stone', name: '#3 stone (1–2 in)', tpy: 1.4 },
    crusher: { short: 'crusher run', name: 'Crusher run / #411 (with fines)', tpy: 1.5, compact: 0.15 },
    river: { short: 'river rock', name: 'River rock (1–3 in)', tpy: 1.35 },
    sand: { short: 'sand', name: 'Sand', tpy: 1.35 },
  },
  bagCuft: 0.5, defaultL: 20, defaultW: 10,
};
const DRIVEWAY = { ...GRAVEL, defaultL: 50, defaultW: 10 };
const PAVER = {
  pavers: {
    brick: { name: '4 × 8 in (holland / brick)', l: 8, w: 4 }, '6x6': { name: '6 × 6 in', l: 6, w: 6 }, '6x9': { name: '6 × 9 in', l: 9, w: 6 },
    '12x12': { name: '12 × 12 in', l: 12, w: 12 }, '16x16': { name: '16 × 16 in', l: 16, w: 16 }, '24x24': { name: '24 × 24 in', l: 24, w: 24 },
  },
  patterns: { stack: { name: 'Running bond or stack', waste: 0.05 }, herring: { name: 'Herringbone', waste: 0.1 }, diag: { name: 'Diagonal (45°)', waste: 0.15 } },
  baseIn: 4, baseOverhang: 6, compact: 0.2, baseTpy: 1.5, sandIn: 1, bagCuft: 0.5, polyMin: 30, polyMax: 80, restraintFt: 8, defaultL: 12, defaultW: 12,
};
const POOL = {
  galPerCuft: 7.48, round: 5.9, kidney: 3.38, litersPerGal: 3.785, hoseGpm: 9, saltTarget: 3200, slamRatio: 0.4,
  products: {
    cal65: { name: 'Cal-hypo shock 65%', strength: 65, bagLb: 1, ca: 0.7 },
    cal73: { name: 'Cal-hypo shock 73%', strength: 73, bagLb: 1, ca: 0.7 },
    dichlor: { name: 'Dichlor shock 56%', strength: 56, bagLb: 1, cya: 0.9 },
    liq125: { name: 'Liquid chlorine 12.5%', strength: 12.5, liquid: true, jugGal: 1 },
    liq10: { name: 'Liquid chlorine 10%', strength: 10, liquid: true, jugGal: 1 },
    bleach: { name: 'Plain bleach 8.25%', strength: 8.25, liquid: true, jugGal: 0.95 },
  },
};
const BATCH1_TOOLS = [
  ['🪜', 'Stair Calculator', '/stair-calculator/', 'Risers, treads, stringer length and code checks for any total rise.'],
  ['🪨', 'Gravel Calculator', '/gravel-calculator/', 'Cubic yards, tons and bags of gravel by stone type and depth.'],
  ['🏊', 'Pool Volume Calculator', '/pool-volume-calculator/', 'Gallons for rectangle, round, oval and kidney pools, plus fill time.'],
  ['🧱', 'Paver Calculator', '/paver-calculator/', 'Pavers, base gravel, bedding sand, polymeric sand and edging.'],
];
const BATCH1_VARIANTS = [
  ['🪚', 'Stair Stringer Calculator', '/stair-stringer-calculator/', 'Cut layout, stringer length, throat depth and how many stringers.'],
  ['⚪', 'Pea Gravel Calculator', '/pea-gravel-calculator/', 'Pea gravel for paths, patios and play areas in yards, tons and bags.'],
  ['🚗', 'Driveway Gravel Calculator', '/driveway-gravel-calculator/', 'Tons of stone for each driveway layer: base, middle and top.'],
  ['🧂', 'Pool Salt Calculator', '/pool-salt-calculator/', 'Pounds and bags of salt for a saltwater pool, or how much to drain.'],
  ['⚗️', 'Pool Shock Calculator', '/pool-shock-calculator/', 'Shock dose for cal-hypo, dichlor or liquid chlorine, including SLAM.'],
  ['⛏️', 'Paver Base Calculator', '/paver-base-calculator/', 'Tons of base gravel and bedding sand under a patio or driveway.'],
];

const field = (label, input) => `<label class="hgt-calc__field"><span>${label}</span>${input}</label>`;
const numIn = (name, value, step = 'any', extra = '') => `<input type="number" inputmode="decimal" min="0" step="${step}" name="${name}" value="${value}"${extra}>`;
const selectIn = (name, opts, sel) => `<select name="${name}">${opts.map(([v, t]) => `<option value="${v}"${String(v) === String(sel) ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
const calcShell = (attr, cfg, inner, embed) => `<div class="hgt-card hgt-calc" ${attr}${embed ? ' data-embed' : ''} data-config='${esc(JSON.stringify(cfg))}'>
<form novalidate>
${inner}
</form>
<div class="hgt-frost__out" data-out hidden></div>
</div>`;

const stairCard = (embed = false, p = {}) => calcShell('data-hgt-stairs', STAIRS, `<div class="hgt-calc__grid">
${field('Total rise (floor to floor or deck to ground)', `<span class="hgt-calc__pair">${numIn('rise', p.rise || 108, '0.125')}${selectIn('unit', [['in', 'inches'], ['ft', 'feet']], 'in')}</span>`)}
${field('Max riser height (in)', numIn('maxr', 7.75, '0.125'))}
${field('Tread depth, run (in)', numIn('tread', p.tread || 10.5, '0.125'))}
${field('Tread thickness (in)', numIn('thick', p.thick ?? 1, '0.125'))}
${field('Stair width (in)', numIn('width', 36, '1'))}
${field('Stringer board', selectIn('board', Object.keys(STAIRS.boards).map((k) => [k, `${k} (${STAIRS.boards[k]} in deep)`]), '2×12'))}
</div>`, embed);

const gravelPrice = () => `<details class="hgt-calc__prices"><summary>Price (edit to match your supplier)</summary><div class="hgt-calc__grid">
${field('Price', `<span class="hgt-calc__money">${numIn('price', 45, '0.01')}</span>`)}${field('Priced per', selectIn('unit', [['ton', 'ton'], ['yd', 'cubic yard']], 'ton'))}
</div></details>`;
const areaSet = (legend) => `<fieldset class="hgt-calc__set"><legend>${legend}</legend><div data-rows></div>
<button type="button" class="hgt-btn hgt-btn--ghost hgt-calc__add" data-add>+ Add another area</button></fieldset>`;
const matOpts = () => Object.entries(GRAVEL.materials).map(([k, v]) => [k, v.name]);
const gravelCard = (embed = false, p = {}) => calcShell('data-hgt-hard="gravel"', GRAVEL, `${areaSet('Area to cover')}
<div class="hgt-calc__grid">
${field('Material', selectIn('mat', matOpts(), p.mat || '57'))}
${field('Depth (in)', numIn('depth', p.depth || 3, '0.5'))}
</div>
${gravelPrice()}`, embed);
const drivewayCard = (embed = false) => calcShell('data-hgt-hard="driveway"', DRIVEWAY, `${areaSet('Driveway area')}
<div class="hgt-calc__grid">
${[[1, '3', 4, 'Base layer'], [2, '57', 4, 'Middle layer'], [3, 'crusher', 3, 'Top layer']].map(([i, m, d, l]) => `${field(`${l} stone`, selectIn(`m${i}`, matOpts(), m))}${field(`${l} depth (in)`, numIn(`d${i}`, d, '0.5'))}`).join('\n')}
</div>
${gravelPrice()}`, embed);

const paverCard = (embed = false, p = {}) => calcShell('data-hgt-hard="paver"', PAVER, `${areaSet('Patio or path area')}
<div class="hgt-calc__grid">
${field('Paver size', selectIn('size', [...Object.entries(PAVER.pavers).map(([k, v]) => [k, v.name]), ['custom', 'Custom size…']], p.size || '6x9'))}
${field('Laying pattern', selectIn('pattern', Object.entries(PAVER.patterns).map(([k, v]) => [k, `${v.name} (+${Math.round(v.waste * 100)}%)`]), 'stack'))}
${field('Compacted base depth', selectIn('base', [[4, '4 in: patio or path, firm soil'], [6, '6 in: patio on clay or in frost areas'], [8, '8 in: driveway'], [12, '12 in: driveway on poor soil']], p.base || 4))}
${field('Edge length (ft, blank = estimate)', numIn('per', '', '1', ' placeholder="auto"'))}
</div>
<div class="hgt-calc__grid" data-custom hidden>${field('Paver length (in)', numIn('pl', 8, '0.25'))}${field('Paver width (in)', numIn('pw', 4, '0.25'))}</div>
<details class="hgt-calc__prices"><summary>Prices (edit to match your store)</summary><div class="hgt-calc__grid">
${priceInput('pPaver', 'Per paver', 1.2)}${priceInput('pBase', 'Base gravel, per ton', 45)}${priceInput('pSand', 'Sand, 0.5 cu ft bag', 6)}${priceInput('pPoly', 'Polymeric sand, 50 lb', 35)}${priceInput('pEdge', 'Edge restraint, 8 ft', 12)}
</div></details>`, embed);

const poolVolumeFields = (p = {}) => `<div class="hgt-calc__grid">
${field('Pool shape', selectIn('shape', [['rect', 'Rectangle'], ['round', 'Round'], ['oval', 'Oval'], ['kidney', 'Kidney / freeform'], ['known', 'I know my gallons']], p.shape || 'rect'))}
<label class="hgt-calc__field" data-for="rect oval kidney"><span>Length (ft)</span>${numIn('len', p.len || 32, '0.5')}</label>
<label class="hgt-calc__field" data-for="rect oval"><span>Width (ft)</span>${numIn('wid', p.wid || 16, '0.5')}</label>
<label class="hgt-calc__field" data-for="round" hidden><span>Diameter (ft)</span>${numIn('dia', 24, '0.5')}</label>
<label class="hgt-calc__field" data-for="kidney" hidden><span>Widest end A (ft)</span>${numIn('ka', 16, '0.5')}</label>
<label class="hgt-calc__field" data-for="kidney" hidden><span>Narrow end B (ft)</span>${numIn('kb', 12, '0.5')}</label>
<label class="hgt-calc__field" data-for="rect round oval kidney"><span>Shallow-end water depth (ft)</span>${numIn('shallow', p.shallow || 3.5, '0.25')}</label>
<label class="hgt-calc__field" data-for="rect round oval kidney"><span>Deep-end water depth (ft)</span>${numIn('deep', p.deep || 6, '0.25')}</label>
<label class="hgt-calc__field" data-for="known" hidden><span>Pool gallons</span>${numIn('known', 20000, '100')}</label>
</div>`;
const poolCard = (kind, embed = false) => {
  let extra = '';
  if (kind === 'volume') extra = `<div class="hgt-calc__grid">${field('Hose flow (gal per min)', numIn('gpm', POOL.hoseGpm, '0.5'))}</div>`;
  if (kind === 'salt') extra = `<div class="hgt-calc__grid">${field('Current salt (ppm)', numIn('cur', 0, '50'))}${field('Target salt (ppm)', numIn('target', POOL.saltTarget, '50'))}${field('Bag size (lb)', selectIn('bag', [[40, '40 lb'], [50, '50 lb'], [25, '25 lb']], 40))}</div>`;
  if (kind === 'shock') extra = `<div class="hgt-calc__grid">
${field('Product', selectIn('product', Object.entries(POOL.products).map(([k, v]) => [k, v.name]), 'liq125'))}
${field('Goal', selectIn('mode', [['raise', 'Routine shock: raise chlorine'], ['slam', 'Algae / SLAM: shock level for my CYA']], 'raise'))}
<label class="hgt-calc__field" data-mode="raise"><span>Raise free chlorine by (ppm)</span>${numIn('raise', 10, '0.5')}</label>
<label class="hgt-calc__field" data-mode="slam" hidden><span>Current free chlorine (ppm)</span>${numIn('fc', 2, '0.5')}</label>
<label class="hgt-calc__field" data-mode="slam" hidden><span>Cyanuric acid, CYA (ppm)</span>${numIn('cya', 40, '5')}</label>
</div>`;
  return calcShell(`data-hgt-pool="${kind}"`, POOL, poolVolumeFields(kind === 'volume' ? {} : { shape: 'known' }) + extra, embed);
};

// One layout for every tool page in this batch: answer → tool → unique reference content → FAQ → links → sources.
function toolPage({ path, name, title, description, h1, lede, answer, card, sections, faqs, sources, script, embedId }) {
  const body = `
<h1>${h1}</h1>
<p class="hgt-lede">${lede}</p>
<p class="hgt-meta">Free · No sign-up · Shows the math · Updated ${TOOLS_UPDATED}</p>
<div class="hgt-answer"><span class="hgt-answer__label">Quick answer</span><p>${answer}</p></div>
${card}
${sections}
${faqBlock(faqs)}
${embedId ? embedCta(embedId) : ''}
${relatedTools(path)}
<section class="hgt-sources hgt-read"><h2>Sources and assumptions</h2><p>${sources}</p></section>`;
  const schema = [{ ...appSchema(path, name, description), dateModified: TOOLS_UPDATED }, faqSchema(faqs)];
  return { path, html: page({ path, title, description, body, active: '/#calculators', crumbs: [['/#calculators', 'Calculators'], [path, name]], schema, scripts: [script] }) };
}
const table = (head, rows) => `<div class="hgt-table-wrap"><table class="hgt-table"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>
${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n')}
</tbody></table></div>`;
const inchFrac = (x) => { const s = Math.round(x * 16); const w = Math.floor(s / 16); let r = s % 16, d = 16; while (r && r % 2 === 0) { r /= 2; d /= 2; } return `${w || ''}${r ? `${w ? ' ' : ''}${r}/${d}` : w ? '' : '0'} in`; };
const stairRow = (rise, tread = 10.5) => { const n = Math.ceil(rise / STAIRS.maxRiser - 1e-9), r = rise / n, run = (n - 1) * tread, len = Math.hypot(rise, run) + Math.hypot(r, tread); return { n, r, run, len }; };

function stairPages() {
  const ex = stairRow(108);
  const rows = [24, 30, 36, 48, 60, 72, 84, 96, 108, 120, 132, 144].map((h) => { const s = stairRow(h); return [`${h} in (${(h / 12).toFixed(1).replace('.0', '')} ft)`, s.n, inchFrac(s.r), s.n - 1, `${(s.run / 12).toFixed(1)} ft`, `${(s.len / 12).toFixed(1)} ft`]; });
  const ref = `<h2>Stair dimensions for common heights</h2><p class="hgt-read">Using the ${STAIRS.maxRiser} in maximum riser and ${10.5} in treads. Treads are one fewer than risers because the top step is the floor or deck.</p>${table(['Total rise', 'Risers', 'Riser height', 'Treads', 'Total run', 'Stringer length'], rows)}`;
  const code = `<section class="hgt-read"><h2>Residential stair code at a glance (IRC R311.7)</h2>${table(['Rule', 'Limit'], [['Riser height', `${STAIRS.maxRiser} in maximum`], ['Tread depth', `${STAIRS.minTread} in minimum (plus a ¾–1¼ in nosing when under 11 in)`], ['Riser and tread variation', 'No more than ⅜ in between the largest and smallest in a flight'], ['Stair width', `${STAIRS.minWidth} in minimum`], ['Headroom', '6 ft 8 in minimum'], ['Rise of one flight', `${STAIRS.maxFlight} in (12 ft 7 in) maximum, then a landing`], ['Handrail', 'Required with 4 or more risers, 34–38 in above the nosings']])}<p>Local codes can be stricter, and decks follow the deck guide (AWC DCA 6) for stringers. Comfort rule of thumb: <strong>2 × riser + tread ≈ 24–25 in</strong>.</p></section>`;
  const faqsMain = [
    ['How do I calculate the number of stairs I need?', `Measure the total rise from the finished lower floor (or ground) to the finished upper floor (or deck surface) in inches. Divide by ${STAIRS.maxRiser} in and round up: that is the number of risers. Divide the total rise by that number for the exact riser height. You need one fewer tread than risers. For 108 in of rise: 108 ÷ 7.75 = 13.9, so 14 risers of ${inchFrac(108 / 14)} and 13 treads.`],
    ['What is the standard stair rise and run?', `U.S. residential code (IRC) allows risers up to ${STAIRS.maxRiser} in and treads at least ${STAIRS.minTread} in deep. Most comfortable stairs land around a 7 to 7 ½ in riser with a 10 ½ to 11 in tread, which follows the rule 2 × riser + tread = 24 to 25 in.`],
    ['How long is the total run of a staircase?', 'Total run = number of treads × tread depth. With 13 treads of 10 ½ in, the stairs run 136.5 in, about 11 ft 4 in, measured horizontally from the top nosing to the bottom riser.'],
    ['How many stringers do I need?', `Space cut stringers no more than ${STAIRS.maxSpacing} in apart for decks (AWC DCA 6), so a 36 in wide stair needs 3 stringers and a 48 in stair needs 4. Interior stairs with thick treads may allow wider spacing; check your code.`],
    ['When do stairs need a landing?', `When one flight would rise more than ${STAIRS.maxFlight} in (12 ft 7 in), or where a door swings over the stairs. Landings must be at least as wide as the stairs and 36 in deep in the direction of travel.`],
  ];
  const faqsStringer = [
    ['How do you calculate a stair stringer?', 'Find the riser height (total rise ÷ number of risers) and pick a tread depth. The stringer length is the hypotenuse: √(total rise² + total run²), plus one more step diagonal so the bottom bears fully on the ground or pad. Lay out each step with a framing square set to the riser and tread.'],
    ['What length board do I need for stair stringers?', `Round the stringer length up to the next stock length (8, 10, 12, 14 or 16 ft). For a 108 in rise with 10 ½ in treads the stringer is about ${(ex.len / 12).toFixed(1)} ft, so buy ${STAIRS.lengths.find((l) => l * 12 >= ex.len)} ft 2×12s.`],
    ['Why do you cut the bottom of a stair stringer shorter?', 'So every step is the same height once treads are on. The treads add their thickness to each step, so the bottom riser on the stringer is cut shorter by one tread thickness. The calculator shows this "bottom cut" for you.'],
    ['How much wood should remain under a stringer cut?', `Keep at least ${STAIRS.minThroat} in of solid wood (the "throat") between the bottom edge and the inside corner of each cut, as the AWC deck guide requires for cut stringers. A 2×12 usually leaves 5 to 6 in; a 2×10 often does not.`],
    ['Can I use 2×10 for stair stringers?', `Only if the throat stays at least ${STAIRS.minThroat} in, which with typical risers and treads it does not. 2×12 is the standard choice for cut stringers.`],
  ];
  const src = `Code limits from the <a href="${IRC_STAIR_URL}" rel="nofollow">2021 International Residential Code, section R311.7</a>; stringer spacing (${STAIRS.maxSpacing} in) and minimum throat (${STAIRS.minThroat} in) from the <a href="${DCA6_URL}" rel="nofollow">American Wood Council DCA 6 deck guide</a>. Board depths are actual sizes (2×12 = 11 ¼ in). Your local code and inspector have the final say.`;
  const main = toolPage({
    path: '/stair-calculator/', name: 'Stair Calculator', script: '/assets/stairs.js', embedId: 'stairs',
    title: 'Stair Calculator: Rise, Run, Risers & Stringer Length',
    description: 'Free stair calculator: number of risers and treads, riser height, total run, stringer length and angle, checked against the IRC stair code. Shows the math.',
    h1: 'Stair Calculator', lede: 'Enter your total rise to get the number of steps, exact riser height, total run, stringer length and how many stringers to cut, with every result checked against the residential stair code.',
    answer: `<strong>Risers = total rise ÷ ${STAIRS.maxRiser} in, rounded up. Riser height = total rise ÷ risers. Treads = risers − 1.</strong> A 9 ft (108 in) rise needs <strong>14 risers of ${inchFrac(108 / 14)} and 13 treads</strong>; with 10 ½ in treads the stairs run ${(ex.run / 12).toFixed(1)} ft and each stringer is about ${(ex.len / 12).toFixed(1)} ft long.`,
    card: stairCard(), sections: ref + code, faqs: faqsMain, sources: src,
  });
  const stringer = toolPage({
    path: '/stair-stringer-calculator/', name: 'Stair Stringer Calculator', script: '/assets/stairs.js', embedId: 'stairs',
    title: 'Stair Stringer Calculator: Layout, Length & Cut List',
    description: 'Free stair stringer calculator with layout diagram: riser and tread cuts, stringer length and board size, bottom cut, throat depth and number of stringers.',
    h1: 'Stair Stringer Calculator', lede: 'Lay out and cut stair stringers right the first time: riser and tread marks, the bottom cut for tread thickness, board length to buy, wood left under the cuts and how many stringers you need.',
    answer: `Set a framing square to the <strong>riser height</strong> and <strong>tread depth</strong> and step it along a 2×12 once per tread. <strong>Stringer length ≈ √(rise² + run²)</strong> plus one step. For a 36 in deck rise: 5 risers of 7 ³⁄₁₆ in, 4 treads of 11 in, a stringer about ${(stairRow(36, 11).len / 12).toFixed(1)} ft long, and 3 stringers for a 36 in wide stair.`,
    card: stairCard(false, { rise: 36, tread: 11, thick: 1 }),
    sections: `<section class="hgt-read"><h2>How to lay out and cut a stringer</h2><ol>
<li><strong>Clamp stair gauges</strong> to a framing square: one at the riser height on the tongue, one at the tread depth on the blade.</li>
<li><strong>Mark each step</strong> along the crown edge of a straight 2×12, sliding the square so the gauges touch the edge each time.</li>
<li><strong>Cut the bottom short</strong> by one tread thickness (the "bottom cut" above) so the first step isn't taller than the rest.</li>
<li><strong>Cut with a circular saw, finish with a handsaw</strong> so you don't over-cut the inside corners and weaken the throat.</li>
<li><strong>Use the first stringer as a template</strong> for the others, then check it on site before cutting the rest.</li>
</ol></section>${ref}`, faqs: faqsStringer, sources: src,
  });
  return [main, stringer];
}

function gravelPages() {
  const M = GRAVEL.materials;
  const cov = (d) => Math.round(324 / d);
  const depthRows = [[2, 'Pea gravel on paths over fabric'], [3, 'Paths, patios, play areas, decorative beds'], [4, 'Light-use parking pads, drainage trenches'], [6, 'Driveway base on firm soil'], [12, 'Full three-layer driveway']].map(([d, use]) => [`${d} in`, `${cov(d)} sq ft`, '1.4 tons', use]);
  const matRows = Object.values(M).map((m) => [m.name, `${m.tpy} tons`, `${fmtInt(m.tpy * 2000)} lb`, `${Math.round(m.tpy * 2000 / 27 * GRAVEL.bagCuft)} lb`]);
  const src = (extra = '') => `Densities are typical supplier figures for dry material (1.35–1.5 tons per cubic yard); wet, washed or very coarse stone can differ, so check your yard's number. Crusher run adds 15% for compaction. Bags are ${GRAVEL.bagCuft} cu ft. ${extra}Prices are placeholders to edit.`;
  const sizeRows = (mat, depth) => [[10, 10], [10, 20], [20, 20], [10, 50], [12, 100]].map(([w, l]) => { const yd = w * l * depth / 12 / 27; return [`${w} × ${l} ft`, `${(Math.ceil(yd * 10) / 10).toFixed(1)} cu yd`, `${(Math.ceil(yd * M[mat].tpy * 10) / 10).toFixed(1)} tons`, fmtInt(Math.ceil(yd * 27 / GRAVEL.bagCuft))]; });

  const main = toolPage({
    path: '/gravel-calculator/', name: 'Gravel Calculator', script: '/assets/hardscape.js', embedId: 'gravel',
    title: 'Gravel Calculator: Cubic Yards, Tons & Bags by Stone Type',
    description: 'Free gravel calculator: how many cubic yards, tons or bags of gravel you need for any shape and depth, by stone type (pea gravel, #57, crusher run, river rock).',
    h1: 'Gravel Calculator', lede: 'How much gravel to order, in cubic yards, tons and bags, for any shape and depth. Pick the stone, because pea gravel, #57, crusher run and river rock weigh differently.',
    answer: `<strong>Cubic yards = length × width (ft) × depth (in) ÷ 324.</strong> <strong>Tons = cubic yards × about 1.4</strong> for most gravel (1.5 for crusher run). One cubic yard covers <strong>108 sq ft at 3 in deep</strong>, 81 sq ft at 4 in. A 10 × 20 ft area at 3 in needs 1.9 cu yd, about 2.6 tons.`,
    card: gravelCard(),
    sections: `<h2>How far a cubic yard of gravel goes</h2>${table(['Depth', 'Coverage per cu yd', 'Weight per cu yd', 'Typical use'], depthRows)}
<h2>Gravel weight by type</h2>${table(['Stone', 'Tons per cu yd', 'Pounds per cu yd', 'Per ½ cu ft bag'], matRows)}
<h2>Gravel for common sizes (3 in deep, #57 stone)</h2>${table(['Area', 'Cubic yards', 'Tons', 'Bags'], sizeRows('57', 3))}`,
    faqs: [
      ['How do I calculate how much gravel I need?', 'Multiply length × width in feet to get square feet, multiply by the depth in inches, and divide by 324 to get cubic yards. Multiply cubic yards by the stone\'s density (about 1.4 tons per yard) to get tons. Add 5–10% if the ground is uneven.'],
      ['How many tons of gravel are in a cubic yard?', 'About 1.4 tons (2,800 lb) for most crushed stone and pea gravel, about 1.5 tons for crusher run with fines, and 1.35 tons for river rock. Suppliers sell by the ton or the yard, so ask which.'],
      ['How much area does a ton of gravel cover?', 'At 3 in deep, a ton of crushed stone (≈ 0.71 cu yd) covers about 77 sq ft; at 2 in it covers about 116 sq ft.'],
      ['How many bags of gravel equal a yard?', `54 bags of ${GRAVEL.bagCuft} cu ft make one cubic yard. Bags are convenient under about 1 cu yd; beyond that, bulk delivery is usually far cheaper per ton.`],
      ['How deep should gravel be?', '2–3 in for walkways and decorative beds, 3–4 in for patios and play areas, and 4–6 in or more in layers for driveways. Use landscape fabric underneath to keep gravel from sinking into soil.'],
    ],
    sources: src(),
  });

  const pea = toolPage({
    path: '/pea-gravel-calculator/', name: 'Pea Gravel Calculator', script: '/assets/hardscape.js', embedId: 'gravel',
    title: 'Pea Gravel Calculator: Yards, Tons & Bags for Any Area',
    description: 'Free pea gravel calculator for paths, patios, dog runs and play areas: cubic yards, tons and 0.5 cu ft bags for any shape, with depth guidance and cost.',
    h1: 'Pea Gravel Calculator', lede: 'How much pea gravel you need for a path, patio, dog run, fire pit area or playground, in cubic yards, tons and bags, with the right depth for each use.',
    answer: `<strong>Pea gravel (cu yd) = sq ft × depth (in) ÷ 324</strong>, and it weighs about <strong>1.4 tons per cubic yard</strong>. Use 2–3 in for paths and patios and 3 in or more for play areas. A 10 × 10 ft patio at 3 in needs 0.9 cu yd (1.3 tons, or 50 bags of 0.5 cu ft).`,
    card: gravelCard(false, { mat: 'pea', depth: 3 }),
    sections: `<h2>Pea gravel depth by use</h2>${table(['Use', 'Depth', 'Coverage per cu yd', 'Tip'], [['Garden path', '2–3 in', '108–162 sq ft', 'Edge it so stones stay put'], ['Patio or fire pit area', '3 in', '108 sq ft', 'Use a stabilizer grid for chairs'], ['Dog run', '3 in', '108 sq ft', 'Rounded stone is easy on paws'], ['Playground', 'Check CPSC guidance', 'n/a', 'Fall zones need loose fill rated for the play structure height'], ['Drainage around foundations', '3–4 in', '81–108 sq ft', 'Over fabric, sloped away from the house']])}
<h2>Pea gravel for common sizes (3 in deep)</h2>${table(['Area', 'Cubic yards', 'Tons', 'Bags (0.5 cu ft)'], sizeRows('pea', 3))}`,
    faqs: [
      ['How much pea gravel do I need?', 'Multiply the area in square feet by the depth in inches and divide by 324 for cubic yards. A 100 sq ft patio at 3 in needs 0.93 cu yd. Pea gravel weighs about 1.4 tons per cubic yard, so that is about 1.3 tons.'],
      ['How many bags of pea gravel per square foot?', 'At 2 in deep, one 0.5 cu ft bag covers 3 sq ft; at 3 in it covers 2 sq ft. That is why areas over about 50 sq ft are cheaper with bulk delivery.'],
      ['How deep should pea gravel be for a patio?', 'About 3 in over compacted base and landscape fabric. Deeper pea gravel shifts underfoot; for chairs and tables, a plastic stabilizer grid under 1–2 in of pea gravel stays flatter.'],
      ['How much does a cubic yard of pea gravel weigh?', 'About 2,800 lb (1.4 tons) dry. Wet or washed pea gravel can weigh a little more.'],
      ['Is pea gravel good for a dog run?', 'Yes. Rounded pea gravel is comfortable for paws, drains quickly and is easy to rinse. Lay about 3 in over fabric and edge it so it doesn\'t migrate.'],
    ],
    sources: src('Playground depths should follow the U.S. Consumer Product Safety Commission Public Playground Safety Handbook for the fall height of your equipment. '),
  });

  const drive = toolPage({
    path: '/driveway-gravel-calculator/', name: 'Driveway Gravel Calculator', script: '/assets/hardscape.js', embedId: 'driveway',
    title: 'Driveway Gravel Calculator: Tons per Layer (Base, Middle, Top)',
    description: 'Free gravel driveway calculator: tons and cubic yards of stone for each layer (#3 base, #57 middle, crusher run top), plus fabric and cost, for any driveway size.',
    h1: 'Driveway Gravel Calculator', lede: 'A gravel driveway is built in layers, and each layer is a different stone. Get the tons and cubic yards for the base, middle and top layers in one go.',
    answer: `A typical gravel driveway is <strong>about 11–12 in of stone in three layers</strong>: 4 in of large #3 stone, 4 in of #57, and 3–4 in of crusher run on top. A 10 × 50 ft driveway with 4 + 4 + 3 in needs roughly <strong>${(() => { let t = 0; [[3, 4], [57, 4], ['crusher', 3]].forEach(([m, d]) => { const mm = M[m]; t += 500 * d / 12 * (1 + (mm.compact || 0)) / 27 * mm.tpy; }); return t.toFixed(0); })()} tons</strong> of stone in total.`,
    card: drivewayCard(),
    sections: `<h2>Driveway layers explained</h2>${table(['Layer', 'Stone', 'Depth', 'Job'], [['Base', '#3 stone (1–2 in)', '4–6 in', 'Spreads the load and lets water drain'], ['Middle', '#57 stone (¾–1 in)', '4 in', 'Locks into the base and fills gaps'], ['Top', 'Crusher run / #411 with fines', '2–4 in', 'Packs into a smooth, hard driving surface']])}
<h2>Total stone for common driveway sizes (4 + 4 + 3 in)</h2>${table(['Driveway', 'Tons', 'Cubic yards'], [[10, 30], [10, 50], [12, 50], [12, 100], [20, 40]].map(([w, l]) => { let t = 0, y = 0; [[3, 4], [57, 4], ['crusher', 3]].forEach(([m, d]) => { const mm = M[m]; const yd = w * l * d / 12 * (1 + (mm.compact || 0)) / 27; y += yd; t += yd * mm.tpy; }); return [`${w} × ${l} ft`, t.toFixed(1), y.toFixed(1)]; }))}
<p class="hgt-read">Ordering more than about 13 tons? That is usually more than one tandem dump-truck load; ask your supplier about delivery minimums and split loads.</p>`,
    faqs: [
      ['How much gravel do I need for a driveway?', 'Multiply length × width in feet by the depth of each layer in inches, divide by 324 for cubic yards, and multiply by about 1.4 tons per yard (1.5 for crusher run). Add the layers. A 10 × 50 ft driveway at 11 in total needs roughly 23–25 tons.'],
      ['What is the best gravel for a driveway?', 'Angular crushed stone, not rounded pea gravel or river rock, because angular stones lock together. Use large #3 stone at the bottom, #57 in the middle and crusher run (#411) with fines on top.'],
      ['How deep should a gravel driveway be?', 'About 8–12 in of stone in total over compacted subgrade and woven geotextile fabric. Soft or clay soils need the deeper end; a refresh of an existing driveway may only need 2–3 in on top.'],
      ['How many tons of gravel does a dump truck hold?', 'A tandem-axle dump truck typically carries about 10–15 tons, and a single-axle truck about 5–7 tons. Your supplier will tell you their load sizes and minimums.'],
      ['Do I need fabric under a gravel driveway?', 'It is strongly recommended. Woven geotextile keeps the base stone from sinking into soft soil, so the driveway needs far less topping up over the years.'],
    ],
    sources: src(),
  });
  return [main, pea, drive];
}

function poolPages() {
  const g = (l, w, d) => l * w * d * POOL.galPerCuft;
  const rectRows = [[12, 24], [14, 28], [16, 32], [18, 36], [20, 40]].map(([w, l]) => [`${w} × ${l} ft`, fmtInt(Math.round(g(l, w, 4.5) / 100) * 100), fmtInt(Math.round(g(l, w, 4.5) * POOL.litersPerGal / 100) * 100)]);
  const roundRows = [12, 15, 18, 21, 24, 27, 30].map((d) => [`${d} ft round`, fmtInt(Math.round(d * d * 4 * POOL.round / 100) * 100), fmtInt(Math.round(d * d * 4.5 * POOL.round / 100) * 100)]);
  const saltRows = [5000, 10000, 15000, 20000, 25000, 30000, 40000].map((gal) => { const lb = gal * 8.34 * POOL.saltTarget / 1e6; return [fmtInt(gal), fmtInt(Math.round(lb)), Math.ceil(lb / 40)]; });
  const shockRows = Object.values(POOL.products).map((p) => { const a = p.liquid ? 10000 * 10 / (p.strength * 10000) : 10000 * 8.34 * 10 / (1e6 * p.strength / 100); return [p.name, p.liquid ? `${a.toFixed(2)} gal` : `${a.toFixed(2)} lb`, p.cya ? `+${(10 * p.cya).toFixed(0)} ppm CYA` : p.ca ? `+${(10 * p.ca).toFixed(0)} ppm calcium` : 'Adds a little salt only']; });
  const volSrc = `Volume formulas use 7.48 gallons per cubic foot; round and oval pools use π/4 × 7.48 ≈ ${POOL.round}; kidney pools use the industry approximation (A + B) × length × depth × ${POOL.kidney}. Real pools with steps, benches and sloped floors vary by a few percent.`;

  const vol = toolPage({
    path: '/pool-volume-calculator/', name: 'Pool Volume Calculator', script: '/assets/pool.js', embedId: 'pool-volume',
    title: 'Pool Volume Calculator: How Many Gallons Is My Pool?',
    description: 'Free pool volume calculator: gallons and liters for rectangle, round, oval and kidney pools with shallow and deep ends, plus fill time, salt and shock doses.',
    h1: 'Pool Volume Calculator', lede: 'How many gallons your pool holds, for rectangle, round, oval and kidney shapes with a shallow and deep end, plus how long it takes to fill and the salt and shock doses that go with it.',
    answer: `<strong>Rectangle: length × width × average depth × 7.48. Round: diameter² × average depth × ${POOL.round}. Oval: length × width × average depth × ${POOL.round}.</strong> Average depth = (shallow + deep) ÷ 2. A 16 × 32 ft pool, 3.5 to 6 ft deep, holds about <strong>${fmtInt(Math.round(g(32, 16, 4.75) / 100) * 100)} gallons</strong>; a 24 ft round above-ground pool with 4 ft of water holds about ${fmtInt(Math.round(24 * 24 * 4 * POOL.round / 100) * 100)}.`,
    card: poolCard('volume'),
    sections: `<h2>Gallons in common in-ground pools (4.5 ft average depth)</h2>${table(['Size', 'Gallons', 'Liters'], rectRows)}
<h2>Gallons in round above-ground pools</h2>${table(['Pool', '48 in water depth', '54 in water depth'], roundRows)}`,
    faqs: [
      ['How do I calculate how many gallons are in my pool?', `Measure length, width and the water depth at the shallow and deep ends in feet. Average the depths, then multiply length × width × average depth × 7.48 for a rectangle, or diameter² × depth × ${POOL.round} for a round pool.`],
      ['How many gallons is a 24 ft round pool?', `With 4 ft of water, about ${fmtInt(Math.round(24 * 24 * 4 * POOL.round / 100) * 100)} gallons; with 4.5 ft, about ${fmtInt(Math.round(24 * 24 * 4.5 * POOL.round / 100) * 100)} gallons.`],
      ['How many gallons is a 16 × 32 pool?', `About ${fmtInt(Math.round(g(32, 16, 4.75) / 100) * 100)} gallons with a 3.5 ft shallow end and 6 ft deep end (4.75 ft average), or about ${fmtInt(Math.round(g(32, 16, 4.5) / 100) * 100)} at a 4.5 ft average.`],
      ['How long does it take to fill a pool with a garden hose?', `A garden hose delivers roughly ${POOL.hoseGpm} gallons per minute, about 540 gallons an hour, so a 20,000 gallon pool takes around 37 hours. Time a 5 gallon bucket to measure your hose's real flow.`],
      ['Why does pool volume matter?', 'Every chemical dose, from chlorine and shock to salt, pH and alkalinity adjusters, is calculated per gallon. Getting the volume right is the first step to balanced water.'],
    ],
    sources: volSrc,
  });

  const salt = toolPage({
    path: '/pool-salt-calculator/', name: 'Pool Salt Calculator', script: '/assets/pool.js', embedId: 'pool-salt',
    title: 'Pool Salt Calculator: How Much Salt to Add (lb & Bags)',
    description: 'Free pool salt calculator: pounds and 40 lb bags of salt to reach your salt chlorine generator\'s target ppm, or how much water to drain if salt is too high.',
    h1: 'Pool Salt Calculator', lede: 'How many pounds and bags of salt to add to reach your chlorine generator\'s target, from a fresh fill or a low test reading, and how much water to replace if the salt is too high.',
    answer: `<strong>Salt (lb) = gallons × 8.34 × (target ppm − current ppm) ÷ 1,000,000.</strong> Raising 10,000 gallons by 100 ppm takes about 8.3 lb. Starting a 20,000 gallon pool from 0 to ${fmtInt(POOL.saltTarget)} ppm takes about <strong>${fmtInt(Math.round(20000 * 8.34 * POOL.saltTarget / 1e6))} lb (${Math.ceil(20000 * 8.34 * POOL.saltTarget / 1e6 / 40)} bags of 40 lb)</strong>.`,
    card: poolCard('salt'),
    sections: `<h2>Salt needed for a new salt pool (0 → ${fmtInt(POOL.saltTarget)} ppm)</h2>${table(['Pool gallons', 'Salt (lb)', '40 lb bags'], saltRows)}
<section class="hgt-read"><h2>How to add salt</h2><ol><li>Test salt with strips or a meter; generator readouts drift.</li><li>Turn the generator off, run the pump, and pour salt around the deep end.</li><li>Brush undissolved salt toward the drain; wait 24 hours, then retest.</li><li>Add the last quarter only after the retest, because salt is easy to add and hard to remove.</li></ol></section>`,
    faqs: [
      ['How much salt do I need for my pool?', `Multiply gallons × 8.34 × the ppm you need to add, then divide by 1,000,000. Most chlorine generators want about 2,700–3,400 ppm, with ${fmtInt(POOL.saltTarget)} a common ideal. A new 15,000 gallon pool needs about ${fmtInt(Math.round(15000 * 8.34 * POOL.saltTarget / 1e6))} lb.`],
      ['How many bags of salt for a 20,000 gallon pool?', `About ${Math.ceil(20000 * 8.34 * POOL.saltTarget / 1e6 / 40)} bags of 40 lb to go from 0 to ${fmtInt(POOL.saltTarget)} ppm. To raise it by 500 ppm, about 83 lb, or 3 bags.`],
      ['What happens if there is too much salt in the pool?', 'Very high salt can trigger a generator\'s high-salt shutdown and taste noticeably salty. Salt does not evaporate, so the only fix is to drain part of the water and refill; the calculator shows what percentage to replace.'],
      ['What kind of salt should I use?', 'At least 99% pure sodium chloride sold for pools, without anti-caking agents or iodine. Pool salt dissolves quickly and doesn\'t stain.'],
      ['How often do you add salt to a pool?', 'Only when testing shows it is low, typically after heavy rain, backwashing or splash-out. Salt isn\'t used up by chlorination, so a well-kept pool may need only a few bags a season.'],
    ],
    sources: `Formula: 1 gallon of water weighs 8.34 lb, and ppm is parts per million by weight. Target ranges follow salt chlorine generator manuals, such as <a href="${HAYWARD_URL}" rel="nofollow">Hayward AquaRite</a> (2,700–3,400 ppm, ideal ${fmtInt(POOL.saltTarget)}); always use your generator's range. ${volSrc}`,
  });

  const shock = toolPage({
    path: '/pool-shock-calculator/', name: 'Pool Shock Calculator', script: '/assets/pool.js', embedId: 'pool-shock',
    title: 'Pool Shock Calculator: Cal-Hypo, Dichlor & Liquid Chlorine',
    description: 'Free pool shock calculator: how much cal-hypo, dichlor, liquid chlorine or bleach to raise free chlorine, including the SLAM shock level for your CYA.',
    h1: 'Pool Shock Calculator', lede: 'How much shock to add for your pool size and product, for a routine boost or to clear algae at the right shock level for your stabilizer (CYA), with what each product adds to your water.',
    answer: `To raise free chlorine by 10 ppm in 10,000 gallons you need about <strong>1.3 lb of 65% cal-hypo, 1.5 lb of dichlor, or 0.8 gal of 12.5% liquid chlorine</strong>. For algae, hold free chlorine at about <strong>40% of your CYA</strong> (16 ppm at 40 ppm CYA) until the water clears.`,
    card: poolCard('shock'),
    sections: `<h2>Shock dose per 10,000 gallons (+10 ppm free chlorine)</h2>${table(['Product', 'Amount', 'Side effect'], shockRows)}
<section class="hgt-read"><h2>Choosing a shock</h2><ul><li><strong>Liquid chlorine</strong> adds no stabilizer or calcium, so it's the cleanest choice for regular shocking.</li><li><strong>Cal-hypo</strong> stores well but raises calcium hardness; avoid it in hard-water areas.</li><li><strong>Dichlor</strong> dissolves fast but raises CYA by about 0.9 ppm for every 1 ppm of chlorine, which makes later shocks weaker.</li><li>Shock at dusk, with the pump running, and keep swimmers out until free chlorine falls below about 10 ppm.</li></ul></section>`,
    faqs: [
      ['How much shock do I need for my pool?', 'For a routine shock, raise free chlorine by about 10 ppm. In 10,000 gallons that takes about 1.3 lb of 65% cal-hypo or 0.8 gallon of 12.5% liquid chlorine. Scale it to your volume: twice the water, twice the shock.'],
      ['How much liquid chlorine to shock a pool?', 'About 0.8 gallon of 12.5% liquid chlorine per 10,000 gallons raises free chlorine by 10 ppm. For a 20,000 gallon pool that is about 1.6 gallons.'],
      ['What is the SLAM method?', 'SLAM (Shock Level And Maintain) means raising free chlorine to a shock level tied to your stabilizer, about 40% of CYA, and holding it there with repeated doses until the water is clear, chlorine holds overnight and the water tests clear for combined chlorine. It is popularized by the Trouble Free Pool community.'],
      ['How many bags of shock per gallon of water?', 'One 1 lb bag of 65% cal-hypo raises 10,000 gallons by about 7.8 ppm. Product labels often say "1 bag per 10,000 gallons", which is a light shock; algae needs more.'],
      ['How long after shocking can you swim?', 'When free chlorine is back below about 10 ppm, typically the next day for a routine shock. During SLAM, stay out while chlorine is held at shock level.'],
    ],
    sources: `Doses use available chlorine by weight for dry products and trade percentage (weight per volume) for liquids: 12.5% liquid supplies 125,000 mg/L. CYA and calcium side effects and the FC/CYA shock ratio follow <a href="${TFP_URL}" rel="nofollow">Trouble Free Pool</a> guidance. Always read the product label and add chemicals separately, never mixed. ${volSrc}`,
  });
  return [vol, salt, shock];
}

function paverPages() {
  const P = PAVER;
  const perSq = Object.values(P.pavers).map((p) => [p.name, (144 / (p.l * p.w)).toFixed(2), fmtInt(Math.ceil(100 * 144 / (p.l * p.w) * 1.05))]);
  const baseRows = [[100, 4], [144, 4], [200, 4], [300, 6], [400, 6], [500, 8]].map(([a, d]) => { const per = 4 * Math.sqrt(a); const yd = (a + per * 0.5) * d / 12 * 1.2 / 27; const sand = Math.ceil(a / 12 / 0.5); return [`${a} sq ft`, `${d} in`, `${(yd * P.baseTpy).toFixed(1)} tons`, `${sand} bags`]; });
  const src = `Base and sand depths follow interlocking concrete paver practice published by the <a href="${CMHA_HOME}" rel="nofollow">Concrete Masonry and Hardscapes Association</a> (formerly ICPI): 4–6 in of compacted aggregate for patios and walkways, 8–12 in for driveways, 1 in of screeded bedding sand. The base extends ${P.baseOverhang} in past the edges and adds ${P.compact * 100}% for compaction; base gravel is ${P.baseTpy} tons per cu yd. Polymeric sand coverage varies with joint width and paver shape; read your bag. Prices are placeholders to edit.`;
  const main = toolPage({
    path: '/paver-calculator/', name: 'Paver Calculator', script: '/assets/hardscape.js', embedId: 'paver',
    title: 'Paver Calculator: Pavers, Base Gravel, Sand & Edging',
    description: 'Free paver calculator: how many pavers for your patio or walkway by size and pattern, plus base gravel, bedding sand, polymeric sand, edge restraint and cost.',
    h1: 'Paver Calculator', lede: 'Everything to order for a paver patio, walkway or driveway: pavers by size and pattern, compacted base gravel, bedding sand, polymeric joint sand and edge restraint, for any shape.',
    answer: `<strong>Pavers = area (sq ft) ÷ one paver's area (sq ft), plus 5% (10–15% for herringbone or diagonal).</strong> 4 × 8 in pavers need 4.5 per sq ft; 6 × 9 in need 2.67; 12 × 12 in need 1. A 12 × 12 ft patio takes ${Math.ceil(144 / (54 / 144) * 1.05)} pavers of 6 × 9 in, about ${((144 + 48 * 0.5) * 4 / 12 * 1.2 / 27 * P.baseTpy).toFixed(1)} tons of base at 4 in and ${Math.ceil(144 / 12 / 0.5)} bags of bedding sand.`,
    card: paverCard(),
    sections: `<h2>Pavers per square foot by size</h2>${table(['Paver', 'Per sq ft', 'Per 100 sq ft (+5%)'], perSq)}
<h2>Waste allowance by pattern</h2>${table(['Pattern', 'Extra to order', 'Why'], Object.values(P.patterns).map((p) => [p.name, `${p.waste * 100}%`, p.waste > 0.1 ? 'Every edge paver is cut at an angle' : p.waste > 0.05 ? 'More cuts along the borders' : 'Cuts only at the ends of rows']))}`,
    faqs: [
      ['How many pavers do I need?', 'Divide your patio area in square feet by the area of one paver in square feet (length × width in inches ÷ 144), then add 5% for cuts, or 10–15% for herringbone or diagonal patterns.'],
      ['How many pavers per square foot?', '4.5 for 4 × 8 in brick pavers, 4 for 6 × 6 in, 2.67 for 6 × 9 in, 1 for 12 × 12 in, 0.56 for 16 × 16 in and 0.25 for 24 × 24 in.'],
      ['How much base do I need under pavers?', 'About 4 in of compacted crushed stone for patios and walkways on firm soil, 6 in on clay or in cold climates, and 8–12 in for driveways, with 1 in of sand on top. See the paver base calculator for tons.'],
      ['How much polymeric sand do I need?', 'A 50 lb bag typically fills the joints of about 30–80 sq ft, depending on joint width and paver size: narrow joints between large pavers use far less than wide joints between tumbled bricks.'],
      ['How much do pavers cost for a 12 × 12 patio?', 'Enter your local paver and material prices in the calculator. Materials for 144 sq ft are usually a few hundred dollars; professional installation adds labor for excavation, base compaction and cutting.'],
    ],
    sources: src,
  });
  const base = toolPage({
    path: '/paver-base-calculator/', name: 'Paver Base Calculator', script: '/assets/hardscape.js', embedId: 'paver',
    title: 'Paver Base Calculator: Gravel & Sand Under Pavers (Tons)',
    description: 'Free paver base calculator: tons of compacted base gravel and bags of bedding sand under a patio, walkway or driveway, with the right depth for your soil and use.',
    h1: 'Paver Base Calculator', lede: 'How much base gravel and bedding sand to put under pavers, with the right depth for patios, walkways and driveways, compaction included, plus the pavers themselves if you need them.',
    answer: `Use <strong>4 in of compacted base for patios and walkways</strong> (6 in on clay or in frost areas), <strong>8–12 in for driveways</strong>, and <strong>1 in of bedding sand</strong>. Base tons ≈ (area + 6 in beyond the edges) × depth ÷ 12 × 1.2 for compaction ÷ 27 × ${P.baseTpy}. A 12 × 12 ft patio at 4 in needs about ${((144 + 48 * 0.5) * 4 / 12 * 1.2 / 27 * P.baseTpy).toFixed(1)} tons of base and ${Math.ceil(144 / 12 / 0.5)} bags of sand.`,
    card: paverCard(false, { base: 4 }),
    sections: `<h2>Base and sand for common patio sizes</h2>${table(['Area', 'Base depth', 'Base gravel', 'Bedding sand (0.5 cu ft)'], baseRows)}
<section class="hgt-read"><h2>Building a base that won't sink</h2><ol><li>Dig out the base depth + 1 in of sand + the paver thickness, and extend the dig 6 in past the edges.</li><li>Compact the soil, lay geotextile fabric on soft or clay soils.</li><li>Spread base in 2–3 in lifts and compact each with a plate compactor, sloping ⅛–¼ in per foot away from the house.</li><li>Screed 1 in of concrete sand over pipes; don't compact it before laying pavers.</li></ol></section>`,
    faqs: [
      ['How much base do I need for pavers?', `Multiply the area (plus 6 in past the edges) by the base depth in feet and add about 20% for compaction. For a 12 × 12 ft patio at 4 in that is about ${((144 + 24) * 4 / 12 * 1.2 / 27).toFixed(1)} cu yd, roughly ${((144 + 24) * 4 / 12 * 1.2 / 27 * PAVER.baseTpy).toFixed(1)} tons of crushed stone.`],
      ['How thick should paver base be?', '4 in compacted for walkways and patios on stable soil, 6 in on clay or where the ground freezes hard, and 8–12 in for driveways.'],
      ['How much sand goes under pavers?', 'A consistent 1 in screeded layer of coarse concrete sand. More than that lets pavers rock and rut. One 0.5 cu ft bag covers about 6 sq ft at 1 in.'],
      ['What is the best base material for pavers?', 'Crushed angular stone with fines (sold as paver base, ¾ in minus, crusher run or road base), which compacts hard. Avoid pea gravel or round stone under pavers.'],
      ['Can I put pavers directly on dirt?', 'Not for a lasting patio. Without a compacted base, pavers settle unevenly and heave with frost. Small stepping stones in a garden are the exception.'],
    ],
    sources: src,
  });
  return [main, base];
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
  // Inlined into every page: one less render-blocking request on the first (usually only) page view.
  CSS = (await readFile('site-src/assets/site.css', 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '').replace(/\s*([{};,>])\s*/g, '$1');
  const byState = {};
  for (const s of stations) (byState[s.st] ||= []).push(s);
  for (const f of await readdir('site-src/assets/og').catch(() => [])) {
    if (f.endsWith('.jpg')) OG_IMAGES[`/${f.replace(/\.jpg$/, '')}/`] = `/assets/og/${f}`;
  }
  const { zoneMeta, zoneStates, usCounts } = await loadZones(stations);
  const meta = { ...fmeta, byState, csvBytes: csv.length, zoneMeta, zoneStates };

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await cp('site-src', OUT, { recursive: true });
  await cp('data/frost/zip', join(OUT, 'data/frost/zip'), { recursive: true });
  await cp('data/zones', join(OUT, 'data/zones'), { recursive: true, filter: (f) => !f.endsWith('meta.json') });
  await writeFile(join(OUT, 'data', CSV_NAME), csv);

  const urls = [['/', 1.0], ['/frost-dates/', 0.9], [ZONE_IDX, 0.9], ['/data/', 0.6], ['/embed/', 0.5], ['/about/', 0.4], ['/contact/', 0.3], ['/privacy/', 0.2], ['/terms/', 0.2]];
  const states = [];
  for (const code of Object.keys(STATES)) {
    const list = byState[code];
    if (!list || list.length < 3) continue;
    const p = statePage(code, list, meta);
    states.push({ code, name: STATES[code], path: p.path, st: p.st });
    await write(p.path, p.html);
    urls.push([p.path, 0.8]);
  }
  const zones = [];
  for (const code of Object.keys(STATES)) {
    if (!zoneStates[code]) continue;
    const p = zoneStatePage(code, zoneStates[code], meta);
    zones.push({ code, name: STATES[code], path: p.path, sum: p.sum });
    await write(p.path, p.html);
    urls.push([p.path, 0.8]);
  }
  await write(ZONE_IDX, zoneIndex(zones, usCounts, meta));
  for (const p of [...stairPages(), ...gravelPages(), ...poolPages(), ...paverPages(), sodCalcPage(), seedCalcPage(), blockCalcPage(), retainingCalcPage()]) {
    await write(p.path, p.html);
    urls.push([p.path, 0.9]);
  }
  await write('/', homePage(meta));
  await write('/frost-dates/', frostIndex(states, meta));
  await write('/data/', dataPage(meta));
  await write('/embed/', embedPage());
  for (const e of EMBEDS) await write(`/embed/${e.id}/`, embedFrame(e));
  await write('/about/', aboutPage(meta));
  await write('/privacy/', privacyPage());
  await write('/terms/', termsPage());
  await write('/contact/', contactPage());
  await write('/404.html', notFound());

  await write('/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, p]) => `  <url><loc>${SITE}${u}</loc><lastmod>${meta.built}</lastmod><priority>${p.toFixed(1)}</priority></url>`).join('\n')}
</urlset>
`);
  await write('/robots.txt', `User-agent: *
Allow: /
Disallow: /embed/*/

Sitemap: ${SITE}/sitemap.xml
`);
  await write('/llms.txt', `# ${BRAND} Tools

> Free garden tools built on public data. The main dataset is U.S. frost dates (median and 10%-risk last spring and first fall 32°F freeze dates, 28°F hard-freeze dates, frost-free days) for ${fmtInt(meta.stations)} weather stations from NOAA NCEI 1991–2020 U.S. Climate Normals, with a lookup for ${fmtInt(meta.zips)} ZIP codes.

Cite as: ${BRAND}, ${SITE}/frost-dates/ (data: NOAA NCEI 1991–2020 U.S. Climate Normals). License: CC BY 4.0.

## Tools
- [Frost dates by ZIP code](${SITE}/frost-dates/): nearest-station frost dates for any U.S. ZIP code
- [Hardiness zone by ZIP code](${SITE}${ZONE_IDX}): USDA 2023 plant hardiness zone for ${fmtInt(zoneMeta.zips)} ZIP codes, with frost dates
${[...BATCH1_TOOLS, ...BATCH1_VARIANTS].map((t) => `- [${t[1]}](${SITE}${t[2]}): ${t[3]}`).join('\n')}
- [Sod calculator](${SITE}/sod-calculator/): square feet, pallets (about 450 sq ft each), 16x24 in slabs or 2x5 ft rolls, topsoil and cost
- [Grass seed calculator](${SITE}/grass-seed-calculator/): pounds of seed and bag sizes by grass type for new lawns or overseeding, from University of Tennessee Extension rates
- [Concrete block calculator](${SITE}/concrete-block-calculator/): CMU blocks (1.125 per sq ft for 8x8x16), mortar bags, core grout, rebar and footing concrete
- [Retaining wall calculator](${SITE}/retaining-wall-calculator/): segmental wall and cap blocks with buried courses, base gravel, drainage stone, drain pipe and fabric
- [Planting calendar by ZIP code](${PLAN_URL}): planting dates for 30 crops from local frost dates
- [Garden guides](${MAIN}/): articles on vegetables, lawns, soil and home improvement

## Frost dates by state
${states.map((s) => `- [${s.name}](${SITE}${s.path}): ${s.st.dated >= 5 && s.st.dated >= s.st.n / 2 ? `median last frost ${long(s.st.medLast)}, first frost ${long(s.st.medFirst)}` : 'frost is rare at most stations'}, ${s.st.n} stations`).join('\n')}

## Hardiness zones by state (USDA 2023 map)
${zones.map((z) => `- [${z.name}](${SITE}${z.path}): zones ${zoneSpan(z.sum.zones)}, most common ${z.sum.mode}`).join('\n')}

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
  // IndexNow key file: lets the deploy workflow tell Bing (which feeds ChatGPT search and Copilot) about changed pages.
  await write(`/${INDEXNOW_KEY}.txt`, INDEXNOW_KEY);
  await write('/CNAME', new URL(SITE).host + '\n');
  await write('/.nojekyll', '');

  const count = (await readdir(OUT, { recursive: true })).filter((f) => f.endsWith('.html')).length;
  console.log(`Built ${count} HTML pages (${states.length} frost state pages, ${zones.length} zone state pages) into ${OUT}/`);
}

main().catch((e) => {
  console.error(`::error::${e.stack || e.message}`);
  process.exit(1);
});
