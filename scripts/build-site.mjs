#!/usr/bin/env node
// Builds the static site for tools.homegardenlot.com into _site/ from site-src/, data/frost/ and data/zones/.
// Frost numbers come from NOAA's 1991–2020 normals (data/frost/stations.json); hardiness zones from the
// USDA 2023 Plant Hardiness Zone Map ZIP files (data/zones/).
//
// Usage: node scripts/build-site.mjs
import { mkdir, readFile, writeFile, rm, cp, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
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
// Pinterest website claim: the code from Pinterest → Settings → Claimed accounts → Website (HTML tag), set as the PINTEREST_VERIFY repository variable.
const PINTEREST_VERIFY = /^[a-f0-9]{16,64}$/i.test((process.env.PINTEREST_VERIFY || '').trim()) ? process.env.PINTEREST_VERIFY.trim() : '';
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
${PINTEREST_VERIFY ? `<meta name="p:domain_verify" content="${PINTEREST_VERIFY}">` : ''}
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
  const description = `Free home and garden calculators: deck, fence, stairs, tile, drywall, gravel, pavers, pool, sod and grass seed, plus frost dates and hardiness zones by ZIP.`;
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
<h2>Roofing, framing, soil and lawn care</h2>
<div class="hgt-grid">
${[...BATCH5_TOOLS, ...BATCH5_VARIANTS].map((t) => card(t, 'New')).join('\n')}
</div>
<h2>Advanced planning tools</h2>
<div class="hgt-grid">
${[...BATCH4_TOOLS, ...BATCH4_VARIANTS].map((t) => card(t, 'New')).join('\n')}
</div>
<h2>Measuring and soil calculators</h2>
<div class="hgt-grid">
${[...BATCH3_TOOLS, ...BATCH3_VARIANTS].map((t) => card(t, 'New')).join('\n')}
</div>
<h2>Deck, fence, tile and drywall calculators</h2>
<div class="hgt-grid">
${[...BATCH2_TOOLS, ...BATCH2_VARIANTS].map((t) => card(t, 'New')).join('\n')}
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
      mainEntity: { '@type': 'ItemList', itemListElement: [['Frost Dates by ZIP Code', `${SITE}/frost-dates/`], ['Hardiness Zone by ZIP Code', `${SITE}${ZONE_IDX}`], ...BATCH1_TOOLS.map((t) => [t[1], SITE + t[2]]), ...BATCH1_VARIANTS.map((t) => [t[1], SITE + t[2]]), ...BATCH2_TOOLS.map((t) => [t[1], SITE + t[2]]), ...BATCH2_VARIANTS.map((t) => [t[1], SITE + t[2]]), ...BATCH3_TOOLS.map((t) => [t[1], SITE + t[2]]), ...BATCH3_VARIANTS.map((t) => [t[1], SITE + t[2]]), ...BATCH4_TOOLS.map((t) => [t[1], SITE + t[2]]), ...BATCH4_VARIANTS.map((t) => [t[1], SITE + t[2]]), ...BATCH5_TOOLS.map((t) => [t[1], SITE + t[2]]), ...BATCH5_VARIANTS.map((t) => [t[1], SITE + t[2]]), ...LAWN_TOOLS.map((t) => [t[1], SITE + t[2]]), ...CALC_TOOLS.map((t) => [t[1], SITE + t[2]]), ...MAIN_TOOLS.map((t) => [t[1], t[2]])].map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, url: u })) } },
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
<li>The acreage calculator's map loads only when you open it. It then fetches map software from cdnjs (Cloudflare), map images from the USGS National Map and OpenStreetMap, and, if you search an address, sends that search to OpenStreetMap's Nominatim service. Those services receive your IP address and the map area or search text, under their own privacy policies. The corners you draw stay in your browser.</li>
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
  ...BATCH1_TOOLS, ...BATCH1_VARIANTS, ...BATCH2_TOOLS, ...BATCH2_VARIANTS, ...BATCH3_TOOLS, ...BATCH3_VARIANTS, ...BATCH4_TOOLS, ...BATCH4_VARIANTS, ...BATCH5_TOOLS, ...BATCH5_VARIANTS, ...LAWN_TOOLS, ...CALC_TOOLS,
];
// Each tool page links to its siblings so link equity and visitors flow across the cluster.
const FAMILY = {
  '/stair-calculator/': 'stairs', '/stair-stringer-calculator/': 'stairs',
  '/gravel-calculator/': 'ground', '/pea-gravel-calculator/': 'ground', '/driveway-gravel-calculator/': 'ground', '/paver-calculator/': 'ground', '/paver-base-calculator/': 'ground',
  '/pool-volume-calculator/': 'pool', '/pool-salt-calculator/': 'pool', '/pool-shock-calculator/': 'pool',
  '/sod-calculator/': 'lawn', '/grass-seed-calculator/': 'lawn', '/concrete-block-calculator/': 'masonry', '/retaining-wall-calculator/': 'masonry',
  '/hardiness-zones/': 'climate', '/frost-dates/': 'climate',
  '/square-footage-calculator/': 'interior', '/countertop-square-footage-calculator/': 'interior', '/cubic-yard-calculator/': 'ground', '/cubic-yards-to-tons-calculator/': 'ground', '/board-foot-calculator/': 'stairs', '/log-board-foot-calculator/': 'stairs', '/potting-soil-calculator/': 'lawn', '/raised-bed-soil-calculator/': 'lawn',
  '/acreage-calculator/': 'climate', '/square-feet-to-acres-calculator/': 'climate', '/btu-calculator/': 'hvac', '/mini-split-size-calculator/': 'hvac', '/concrete-calculator/': 'masonry', '/concrete-slab-calculator/': 'masonry', '/concrete-bag-calculator/': 'masonry', '/deck-stain-calculator/': 'fence', '/fence-stain-calculator/': 'fence', '/exterior-paint-calculator/': 'interior',
  '/roof-pitch-calculator/': 'roof', '/roofing-calculator/': 'roof', '/shingle-calculator/': 'roof', '/deck-joist-span-calculator/': 'stairs', '/floor-joist-span-calculator/': 'roof', '/rafter-span-calculator/': 'roof',
  '/topsoil-calculator/': 'lawn', '/fertilizer-calculator/': 'lawn', '/sand-calculator/': 'ground', '/polymeric-sand-calculator/': 'ground',
  '/deck-calculator/': 'stairs', '/fence-calculator/': 'fence', '/fence-post-concrete-calculator/': 'fence', '/tile-calculator/': 'interior', '/shower-tile-calculator/': 'interior', '/drywall-calculator/': 'interior',
};
const NEAR = { roof: ['stairs', 'interior'], hvac: ['interior'], fence: ['stairs', 'ground'], interior: ['stairs', 'masonry'], stairs: ['roof', 'fence', 'masonry', 'ground'], ground: ['masonry', 'lawn'], pool: ['lawn', 'ground'], lawn: ['climate', 'ground'], masonry: ['ground', 'stairs'], climate: ['lawn'] };
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
  { id: 'fence', name: 'Fence calculator', tool: '/fence-calculator/', height: 860, card: () => fenceCard(true), script: '/assets/carpentry.js' },
  { id: 'fence-post', name: 'Fence post concrete calculator', tool: '/fence-post-concrete-calculator/', height: 700, card: () => postCard(true), script: '/assets/carpentry.js' },
  { id: 'deck', name: 'Deck calculator', tool: '/deck-calculator/', height: 900, card: () => deckCard(true), script: '/assets/carpentry.js' },
  { id: 'tile', name: 'Tile calculator', tool: '/tile-calculator/', height: 900, card: () => tileCard(true), script: '/assets/interior.js' },
  { id: 'shower-tile', name: 'Shower tile calculator', tool: '/shower-tile-calculator/', height: 900, card: () => showerCard(true), script: '/assets/interior.js' },
  { id: 'drywall', name: 'Drywall calculator', tool: '/drywall-calculator/', height: 900, card: () => drywallCard(true), script: '/assets/interior.js' },
  { id: 'square-footage', name: 'Square footage calculator', tool: '/square-footage-calculator/', height: 760, card: () => sqftCard(true), script: '/assets/measure.js' },
  { id: 'countertop', name: 'Countertop square footage calculator', tool: '/countertop-square-footage-calculator/', height: 700, card: () => counterCard(true), script: '/assets/measure.js' },
  { id: 'cubic-yard', name: 'Cubic yard calculator', tool: '/cubic-yard-calculator/', height: 760, card: () => cuydCard(true), script: '/assets/measure.js' },
  { id: 'yards-tons', name: 'Cubic yards to tons calculator', tool: '/cubic-yards-to-tons-calculator/', height: 560, card: () => tonsCard(true), script: '/assets/measure.js' },
  { id: 'board-foot', name: 'Board foot calculator', tool: '/board-foot-calculator/', height: 700, card: () => bfCard(true), script: '/assets/measure.js' },
  { id: 'log', name: 'Log board foot calculator', tool: '/log-board-foot-calculator/', height: 700, card: () => logCard(true), script: '/assets/measure.js' },
  { id: 'potting-soil', name: 'Potting soil calculator', tool: '/potting-soil-calculator/', height: 700, card: () => potCard(true), script: '/assets/measure.js' },
  { id: 'raised-bed', name: 'Raised bed soil calculator', tool: '/raised-bed-soil-calculator/', height: 820, card: () => bedCard(true), script: '/assets/measure.js' },
  { id: 'acreage', name: 'Acreage calculator', tool: '/acreage-calculator/', height: 1000, card: () => landCard(true), script: '/assets/land.js' },
  { id: 'sqft-acres', name: 'Square feet to acres calculator', tool: '/square-feet-to-acres-calculator/', height: 560, card: () => convertCard(true), script: '/assets/land.js' },
  { id: 'btu', name: 'BTU calculator', tool: '/btu-calculator/', height: 900, card: () => hvacCard('btu', true, { name: 'Living room', l: 20, w: 15 }), script: '/assets/hvac.js' },
  { id: 'mini-split', name: 'Mini split size calculator', tool: '/mini-split-size-calculator/', height: 900, card: () => hvacCard('split', true, { name: 'Living room', l: 20, w: 15 }), script: '/assets/hvac.js' },
  { id: 'concrete', name: 'Concrete calculator', tool: '/concrete-calculator/', height: 900, card: () => concreteCard(true), script: '/assets/concrete.js' },
  { id: 'deck-stain', name: 'Deck stain calculator', tool: '/deck-stain-calculator/', height: 860, card: () => coatCard('deck', true), script: '/assets/coating.js' },
  { id: 'fence-stain', name: 'Fence stain calculator', tool: '/fence-stain-calculator/', height: 760, card: () => coatCard('fence', true), script: '/assets/coating.js' },
  { id: 'exterior-paint', name: 'Exterior paint calculator', tool: '/exterior-paint-calculator/', height: 900, card: () => coatCard('house', true), script: '/assets/coating.js' },
  { id: 'roof-pitch', name: 'Roof pitch calculator', tool: '/roof-pitch-calculator/', height: 900, card: () => pitchCard(true), script: '/assets/roof.js' },
  { id: 'roofing', name: 'Roofing calculator', tool: '/roofing-calculator/', height: 1000, card: () => roofCard(true), script: '/assets/roof.js' },
  { id: 'shingles', name: 'Shingle calculator', tool: '/shingle-calculator/', height: 900, card: () => shingleCard(true), script: '/assets/roof.js' },
  { id: 'topsoil', name: 'Topsoil calculator', tool: '/topsoil-calculator/', height: 900, card: () => topsoilCard(true), script: '/assets/fill.js' },
  { id: 'sand', name: 'Sand calculator', tool: '/sand-calculator/', height: 900, card: () => sandCard(true), script: '/assets/fill.js' },
  { id: 'polymeric-sand', name: 'Polymeric sand calculator', tool: '/polymeric-sand-calculator/', height: 860, card: () => polyCard(true), script: '/assets/fill.js' },
  { id: 'deck-joist-span', name: 'Deck joist span calculator', tool: '/deck-joist-span-calculator/', height: 900, card: () => spanCard('deck', true), script: '/assets/span.js' },
  { id: 'floor-joist-span', name: 'Floor joist span calculator', tool: '/floor-joist-span-calculator/', height: 900, card: () => spanCard('floor', true), script: '/assets/span.js' },
  { id: 'rafter-span', name: 'Rafter span calculator', tool: '/rafter-span-calculator/', height: 900, card: () => spanCard('rafter', true), script: '/assets/span.js' },
  { id: 'fertilizer', name: 'Fertilizer calculator', tool: '/fertilizer-calculator/', height: 900, card: () => fertCard(true), script: '/assets/fert.js' },
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
const TOOLS_UPDATED = '2026-11-07';
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
function toolPage({ path, name, title, description, h1, lede, answer, card, sections, faqs, sources, script, embedId, updated = TOOLS_UPDATED }) {
  const body = `
<h1>${h1}</h1>
<p class="hgt-lede">${lede}</p>
<p class="hgt-meta">Free · No sign-up · Shows the math · Updated ${updated}</p>
<div class="hgt-answer"><span class="hgt-answer__label">Quick answer</span><p>${answer}</p></div>
${card}
${sections}
${faqBlock(faqs)}
${embedId ? embedCta(embedId) : ''}
${relatedTools(path)}
<section class="hgt-sources hgt-read"><h2>Sources and assumptions</h2><p>${sources}</p></section>`;
  const schema = [{ ...appSchema(path, name, description), dateModified: updated }, faqSchema(faqs)];
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

// ---------- batch 2: fence, deck, tile, drywall ----------
const CONCRETE_BAGS = [{ name: '50 lb fast-setting', yield: 0.375 }, { name: '80 lb concrete', yield: 0.6 }, { name: '60 lb concrete', yield: 0.45 }];
const FENCE = {
  styles: { privacy: { name: 'Wood privacy (pickets touching)', gap: 0 }, picket: { name: 'Spaced picket (2½ in gaps)', gap: 2.5 }, panels: { name: 'Pre-built 8 ft panels', gap: null, panel: 8 } },
  picketW: 5.5, waste: 0.05, minDepth: 24, postLengths: [8, 10, 12], holeDia: 10, postIn: 3.5, bags: CONCRETE_BAGS,
};
const POSTS = {
  posts: { '4x4': { name: '4×4 post', size: 3.5 }, '6x6': { name: '6×6 post', size: 5.5 }, round4: { name: '4 in round post', size: 4, round: true }, none: { name: 'Sonotube or footing (no post)', size: 0 } },
  bags: CONCRETE_BAGS, concreteWaste: 0.1,
};
const DECK = {
  boards: { comp: { name: 'composite (5½ in)', w: 5.5 }, wood54: { name: '5/4 × 6 wood', w: 5.5 }, wood26: { name: '2 × 6 wood', w: 5.5 } },
  gap: 0.1875, waste: 0.1, lumber: [8, 10, 12, 14, 16, 18, 20], footDia: 12, footDepth: 36, bags: CONCRETE_BAGS,
};
const TILE = {
  tiles: {
    '12x12': { name: '12 × 12 in', l: 12, w: 12 }, '12x24': { name: '12 × 24 in', l: 24, w: 12 }, '6x24': { name: '6 × 24 in plank', l: 24, w: 6 }, '3x6': { name: '3 × 6 in subway', l: 6, w: 3 },
    '4x4': { name: '4 × 4 in', l: 4, w: 4 }, '18x18': { name: '18 × 18 in', l: 18, w: 18 }, '24x24': { name: '24 × 24 in', l: 24, w: 24 }, '2x2': { name: '2 × 2 in mosaic', l: 2, w: 2 },
  },
  patterns: { straight: { name: 'Straight or stacked', waste: 0.1 }, offset: { name: 'Brick offset', waste: 0.1 }, diag: { name: 'Diagonal', waste: 0.15 }, herring: { name: 'Herringbone', waste: 0.15 } },
  trowels: [{ upTo: 8, name: '¼ × ¼ in square', cover: 95 }, { upTo: 15, name: '¼ × ⅜ in square', cover: 63 }, { upTo: 99, name: '½ × ½ in square', cover: 42 }],
  groutDensity: 0.07, groutWaste: 0.15, groutBag: 25, defaultRow: [10, 12], wallWaste: 0.15, floorWaste: 0.15,
};
const DRYWALL = {
  sheets: { '4x8': { name: '4 × 8 ft', sqft: 32 }, '4x10': { name: '4 × 10 ft', sqft: 40 }, '4x12': { name: '4 × 12 ft', sqft: 48 } },
  door: 21, window: 15, screwsPerSqft: 1, screwsPerLb: 300, mudLbPerSqft: 0.138, pailLb: 61.7, tapePerSqft: 0.37, defaultRow: [12, 12, 8],
};
const BATCH2_TOOLS = [
  ['🪵', 'Deck Calculator', '/deck-calculator/', 'Deck boards, joists, hangers, screws or clips and footing concrete.'],
  ['🚧', 'Fence Calculator', '/fence-calculator/', 'Posts, rails, pickets or panels and post concrete for any fence.'],
  ['🔲', 'Tile Calculator', '/tile-calculator/', 'Tiles, boxes, grout and thinset for floors and walls.'],
  ['🧰', 'Drywall Calculator', '/drywall-calculator/', 'Sheets, screws, joint compound and tape for any room.'],
];
const BATCH2_VARIANTS = [
  ['🕳️', 'Fence Post Concrete Calculator', '/fence-post-concrete-calculator/', 'Bags of concrete per post hole or Sonotube footing.'],
  ['🚿', 'Shower Tile Calculator', '/shower-tile-calculator/', 'Wall and floor tile, grout, thinset and waterproofing for a shower.'],
];

const priceGrid = (title, items) => `<details class="hgt-calc__prices"><summary>${title}</summary><div class="hgt-calc__grid">${items.map(([n, l, v]) => priceInput(n, l, v)).join('')}</div></details>`;
const fenceCard = (embed = false) => calcShell('data-hgt-carp="fence"', FENCE, `<div class="hgt-calc__grid">
${field('Total fence length (ft)', numIn('len', 100, '1'))}
${field('Fence height', selectIn('height', [[4, '4 ft'], [5, '5 ft'], [6, '6 ft'], [8, '8 ft']], 6))}
${field('Style', selectIn('style', Object.entries(FENCE.styles).map(([k, v]) => [k, v.name]), 'privacy'))}
${field('Post spacing', selectIn('spacing', [[6, '6 ft'], [8, '8 ft']], 8))}
${field('Separate runs (corners count as new runs)', numIn('runs', 1, '1'))}
${field('Gates', numIn('gates', 1, '1'))}
${field('Post hole depth (in, blank = auto)', numIn('depth', '', '1', ' placeholder="auto"'))}
</div>
${priceGrid('Prices (edit to match your store)', [['pPost', '4×4 post', 14], ['pRail', '2×4 rail, 8 ft', 5], ['pPicket', 'Picket', 3], ['pPanel', 'Panel, 8 ft', 75], ['pBag', 'Concrete bag', 7]])}`, embed);
const postCard = (embed = false) => calcShell('data-hgt-carp="post"', POSTS, `<div class="hgt-calc__grid">
${field('Number of holes', numIn('count', 10, '1'))}
${field('Post', selectIn('post', Object.entries(POSTS.posts).map(([k, v]) => [k, v.name]), '4x4'))}
${field('Hole or tube diameter', selectIn('dia', [6, 8, 10, 12, 14, 16, 18, 24].map((d) => [d, `${d} in`]), 10))}
${field('Hole depth (in)', numIn('depth', 30, '1'))}
</div>`, embed);
const deckCard = (embed = false) => calcShell('data-hgt-carp="deck"', DECK, `<div class="hgt-calc__grid">
${field('Deck width along the house (ft)', numIn('width', 16, '0.5'))}
${field('Deck depth out from the house (ft)', numIn('proj', 12, '0.5'))}
${field('Decking', selectIn('board', Object.entries(DECK.boards).map(([k, v]) => [k, v.name]), 'comp'))}
${field('Board length', selectIn('blen', [[12, '12 ft'], [16, '16 ft'], [20, '20 ft']], 16))}
${field('Joist spacing', selectIn('jspace', [[16, '16 in on center'], [12, '12 in (diagonal or some composites)']], 16))}
${field('Fasteners', selectIn('fasten', [['screws', 'Deck screws (face)'], ['clips', 'Hidden clips']], 'screws'))}
${field('Beam post spacing', selectIn('pspace', [[4, '4 ft'], [6, '6 ft'], [8, '8 ft']], 6))}
<label class="hgt-calc__check"><input type="checkbox" name="ledger" checked> Attached to the house (ledger)</label>
</div>
${priceGrid('Prices (edit to match your store)', [['pBoard', 'Deck board', 30], ['pJoist', 'Joist', 22], ['pBag', 'Concrete bag', 7]])}`, embed);
const tileSelect = (prefix, sel) => `${field(prefix === 'f' ? 'Floor tile' : prefix === 'w' ? 'Wall tile' : 'Tile size', selectIn(`${prefix}size`, [...Object.entries(TILE.tiles).map(([k, v]) => [k, v.name]), ['custom', 'Custom size…']], sel))}
<label class="hgt-calc__field" data-custom="${prefix}size" hidden><span>Tile length (in)</span>${numIn(`${prefix}l`, 8, '0.25')}</label>
<label class="hgt-calc__field" data-custom="${prefix}size" hidden><span>Tile width (in)</span>${numIn(`${prefix}w`, 8, '0.25')}</label>`;
const jointThick = () => `${field('Grout joint', selectIn('joint', [[0.0625, '1/16 in'], [0.125, '1/8 in'], [0.1875, '3/16 in'], [0.25, '1/4 in']], 0.125))}
${field('Tile thickness', selectIn('thick', [[0.25, '1/4 in'], [0.3125, '5/16 in'], [0.375, '3/8 in'], [0.5, '1/2 in']], 0.375))}`;
const rowSet = (legend) => `<fieldset class="hgt-calc__set"><legend>${legend}</legend><div data-rows></div>
<button type="button" class="hgt-btn hgt-btn--ghost hgt-calc__add" data-add>+ Add another</button></fieldset>`;
const tileCard = (embed = false) => calcShell('data-hgt-int="tile"', TILE, `${rowSet('Floor or wall area')}
<div class="hgt-calc__grid">
${tileSelect('', '12x24')}
${field('Pattern', selectIn('pattern', Object.entries(TILE.patterns).map(([k, v]) => [k, `${v.name} (+${Math.round(v.waste * 100)}%)`]), 'straight'))}
${jointThick()}
${field('Exclude (cabinets, tub) sq ft', numIn('sub', '', '1', ' placeholder="0"'))}
${field('Sq ft per box', numIn('box', 10, '0.1'))}
</div>
${priceGrid('Prices (edit to match your store)', [['pSqft', 'Tile per sq ft', 3], ['pGrout', 'Grout, 25 lb bag', 25], ['pThin', 'Thinset, 50 lb bag', 30]])}`, embed);
const showerCard = (embed = false) => calcShell('data-hgt-int="shower"', TILE, `<div class="hgt-calc__grid">
${field('Shower width, back wall (in)', numIn('width', 60, '1'))}
${field('Shower depth, side walls (in)', numIn('depth', 32, '1'))}
${field('Tile height on walls (in)', numIn('wallh', 96, '1'))}
${field('Niche or window to skip (sq ft)', numIn('niche', 0, '0.5'))}
${tileSelect('w', '3x6')}
${tileSelect('f', '2x2')}
${jointThick()}
<label class="hgt-calc__check"><input type="checkbox" name="floor" checked> Tile the shower floor</label>
</div>`, embed);
const drywallCard = (embed = false) => calcShell('data-hgt-int="drywall"', DRYWALL, `${rowSet('Rooms')}
<div class="hgt-calc__grid">
${field('Sheet size', selectIn('sheet', Object.entries(DRYWALL.sheets).map(([k, v]) => [k, v.name]), '4x8'))}
${field('Doors', numIn('doors', 1, '1'))}
${field('Windows', numIn('windows', 1, '1'))}
${field('Waste allowance (%)', numIn('waste', 10, '1'))}
<label class="hgt-calc__check"><input type="checkbox" name="ceiling" checked> Include ceilings</label>
</div>
${priceGrid('Prices (edit to match your store)', [['pSheet', 'Sheet', 16], ['pMud', 'Compound, 4.5 gal', 22], ['pTape', 'Tape, 250 ft roll', 5]])}`, embed);

const holeCuft = (dia, depth, post = 0, round = false) => Math.max(0, Math.PI * (dia / 2) ** 2 * depth - (post ? (round ? Math.PI * (post / 2) ** 2 : post * post) * depth : 0)) / 1728;
const fenceRow = (L, H = 6, gap = 0) => { const sections = Math.ceil(L / 8 - 1e-9); const posts = sections + 1; const pickets = Math.ceil(L * 12 / (5.5 + gap) * 1.05); const rails = sections * (H > 5 ? 3 : 2); const depth = Math.max(24, Math.ceil(H * 12 / 3)); const bags = Math.ceil(holeCuft(10, depth, 3.5) * posts / 0.375 - 1e-9); return { posts, pickets, rails, bags }; };
const deckRow = (W, D) => { const rows = Math.ceil(D * 12 / 5.6875 - 1e-9); const boards = Math.ceil(rows * W * 1.1 / 16 - 1e-9); const joists = Math.ceil(W * 12 / 16 - 1e-9) + 1; return { rows, boards, joists, screws: Math.ceil(rows * joists * 2 * 1.05) }; };
const tilePer = (t, j = 0.125) => 144 / ((t.l + j) * (t.w + j));
const drywallRow = (L, W, H = 8, sheet = 32) => { const a = 2 * (L + W) * H + L * W - 21 - 15; return { area: a, sheets: Math.ceil(a * 1.1 / sheet - 1e-9) }; };

function batch2Pages() {
  const pages = [];
  const f6 = fenceRow(100);
  pages.push(toolPage({
    path: '/fence-calculator/', name: 'Fence Calculator', script: '/assets/carpentry.js', embedId: 'fence',
    title: 'Fence Calculator: Posts, Rails, Pickets & Post Concrete',
    description: 'Free fence calculator: how many posts, rails, pickets or panels and bags of post concrete for a wood privacy or picket fence, with gates, corners and cost.',
    h1: 'Fence Calculator', lede: 'Everything to buy for a wood fence: posts and their length, rails, pickets or ready-made panels, and the concrete to set the posts, for any length, height, corners and gates.',
    answer: `<strong>Posts = fence length ÷ post spacing (8 ft), rounded up, + 1 per run + 1 per gate.</strong> A 6 ft privacy fence uses 3 rails per section and about 2.1 pickets (5½ in) per foot. <strong>100 ft of 6 ft privacy fence</strong> with one gate needs about ${f6.posts + 1} posts, ${f6.rails} rails, ${f6.pickets} pickets and ${Math.ceil(holeCuft(10, 24, 3.5) * (f6.posts + 1) / 0.375 - 1e-9)} bags of 50 lb fast-setting concrete.`,
    card: fenceCard(),
    sections: `<h2>Fence materials for common lengths (6 ft privacy, 8 ft spacing)</h2>${table(['Fence length', 'Posts', 'Rails', 'Pickets', 'Fast-set bags'], [50, 100, 150, 200, 300].map((L) => { const r = fenceRow(L); return [`${L} ft`, r.posts, r.rails, fmtInt(r.pickets), r.bags]; }))}
<p class="hgt-read">Add one post per gate and one per extra run or corner. Post holes 10 in wide, 24 in deep (deeper below your frost line), with 6 in of gravel underneath.</p>
<h2>Post length by fence height</h2>${table(['Fence height', 'In the ground', 'Post to buy'], [[4, 24], [5, 24], [6, 24], [8, 32]].map(([h, d]) => [`${h} ft`, `${d} in`, `${FENCE.postLengths.find((l) => l >= h + d / 12)} ft`]))}`,
    faqs: [
      ['How many fence posts do I need?', 'Divide the fence length by the post spacing (usually 8 ft, or 6 ft in windy areas), round up, then add one for the end post of each run and one extra for every gate. 100 ft at 8 ft spacing is 13 posts, plus gate posts.'],
      ['How many pickets do I need for a privacy fence?', `Pickets are 5½ in wide, so a solid privacy fence takes about 2.2 per foot: 12 in ÷ 5.5 in. For 100 ft that is ${Math.ceil(1200 / 5.5)} pickets, plus 5% for splits and cuts.`],
      ['How deep should fence posts be?', 'At least 2 ft, or about one-third of the post\'s length, and below the frost line in cold climates. A 6 ft fence usually uses 8 ft posts with 2 ft in the ground; an 8 ft fence needs 10–11 ft posts.'],
      ['How many bags of concrete per fence post?', 'For a 4×4 post in a 10 in hole 24 in deep, about 1.9 cu ft of hole minus the post, roughly 2 to 3 bags of 50 lb fast-setting concrete or 2 bags of 80 lb mix. Use the fence post concrete calculator for other sizes.'],
      ['How many rails does a fence need?', 'Two rails per section for fences up to 5 ft, three for 6 ft and taller, so pickets don\'t warp in the middle.'],
    ],
    sources: `Spacing, depth and rail counts follow common residential fence practice; check local codes, HOA rules and property lines before digging, and call 811 to mark utilities. Concrete yields from 50 lb fast-setting (0.375 cu ft), 80 lb (0.6 cu ft) and 60 lb (0.45 cu ft) bag labels. Prices are placeholders to edit.`,
  }));
  pages.push(toolPage({
    path: '/fence-post-concrete-calculator/', name: 'Fence Post Concrete Calculator', script: '/assets/carpentry.js', embedId: 'fence-post',
    title: 'Fence Post Concrete Calculator: Bags per Hole & Sonotube',
    description: 'Free post hole concrete calculator: bags of 50 lb fast-setting, 60 lb or 80 lb concrete per fence post hole or Sonotube footing, for any hole size and depth.',
    h1: 'Fence Post Concrete Calculator', lede: 'How many bags of concrete to set fence posts, deck posts or mailbox posts, or to fill a Sonotube footing, for any hole diameter and depth.',
    answer: `<strong>Concrete = π × (hole diameter ÷ 2)² × depth − the post's volume.</strong> A 4×4 post in a 10 in hole, 24 in deep, takes about ${holeCuft(10, 24, 3.5).toFixed(2)} cu ft: <strong>${Math.ceil(holeCuft(10, 24, 3.5) / 0.375 - 1e-9)} bags of 50 lb fast-setting</strong> or ${Math.ceil(holeCuft(10, 24, 3.5) / 0.6 - 1e-9)} of 80 lb concrete per post. A 12 in Sonotube 48 in deep takes ${holeCuft(12, 48).toFixed(1)} cu ft (${Math.ceil(holeCuft(12, 48) / 0.6 - 1e-9)} × 80 lb bags).`,
    card: postCard(),
    sections: `<h2>Bags per hole for a 4×4 post</h2>${table(['Hole', '24 in deep', '30 in deep', '36 in deep'], [8, 10, 12].map((d) => [`${d} in wide`, ...[24, 30, 36].map((h) => { const c = holeCuft(d, h, 3.5); return `${Math.ceil(c / 0.375 - 1e-9)} × 50 lb fast-set or ${Math.ceil(c / 0.6 - 1e-9)} × 80 lb`; })]))}
<h2>Sonotube footings (no post)</h2>${table(['Tube', '36 in deep', '48 in deep'], [8, 10, 12, 16, 18].map((d) => [`${d} in`, ...[36, 48].map((h) => { const c = holeCuft(d, h); return `${c.toFixed(2)} cu ft · ${Math.ceil(c / 0.6 - 1e-9)} × 80 lb`; })]))}`,
    faqs: [
      ['How many bags of concrete do I need per fence post?', 'For a 4×4 post in a 10 in hole 24 in deep, about 2 bags of 80 lb concrete or 3 bags of 50 lb fast-setting concrete. A 6×6 post in a 12 in hole 36 in deep takes about 3 bags of 80 lb.'],
      ['How big should a fence post hole be?', 'About three times the post\'s width: 10–12 in across for a 4×4 and 12–14 in for a 6×6, and at least 24 in deep, or below the frost line.'],
      ['How many bags of concrete for a Sonotube?', `A 12 in tube 48 in deep holds about ${holeCuft(12, 48).toFixed(1)} cu ft, which is ${Math.ceil(holeCuft(12, 48) / 0.6 - 1e-9)} bags of 80 lb or ${Math.ceil(holeCuft(12, 48) / 0.45 - 1e-9)} bags of 60 lb concrete. Multiply diameter² × depth × 0.000454 for cubic feet.`],
      ['Is fast-setting concrete good for fence posts?', 'Yes. You pour the dry mix into the hole and add water, and it sets in 20–40 minutes, so posts can be braced and the fence built the same day. Use regular mix for structural deck footings.'],
      ['Should I put gravel at the bottom of a post hole?', 'A few inches of gravel under the post helps water drain away from the end grain, which slows rot. Include it in your hole depth.'],
    ],
    sources: `Hole volume is a cylinder (π r² h) minus the post; 4×4 posts are 3½ in square and 6×6 posts 5½ in. Bag yields: 50 lb fast-setting 0.375 cu ft, 60 lb 0.45 cu ft and 80 lb 0.6 cu ft, per common bag labels, with ${Math.round(POSTS.concreteWaste * 100)}% added for spills. Footings for decks and structures must follow your local code.`,
  }));
  const d12 = deckRow(16, 12);
  pages.push(toolPage({
    path: '/deck-calculator/', name: 'Deck Calculator', script: '/assets/carpentry.js', embedId: 'deck',
    title: 'Deck Calculator: Boards, Joists, Screws & Footings',
    description: 'Free deck calculator: how many deck boards, joists, joist hangers, screws or hidden clips and footing concrete for any deck size, composite or wood.',
    h1: 'Deck Calculator', lede: 'The materials list for a deck: deck boards by length, joists, rim and ledger, hangers, screws or hidden clips, beam posts and footing concrete, for composite or wood decking.',
    answer: `<strong>Rows of boards = deck depth (in) ÷ (5½ in board + 3/16 in gap); boards = rows × deck width × 1.1 ÷ board length. Joists = width (in) ÷ 16 + 1.</strong> A 16 × 12 ft deck needs ${d12.rows} rows, about <strong>${d12.boards} boards of 16 ft</strong>, ${d12.joists} joists and about ${fmtInt(d12.screws)} deck screws.`,
    card: deckCard(),
    sections: `<h2>Boards and joists for common deck sizes</h2><p class="hgt-read">16 ft boards with 10% extra, joists 16 in on center.</p>${table(['Deck', 'Square feet', 'Deck boards', 'Joists', 'Screws'], [[10, 10], [12, 12], [16, 12], [20, 12], [16, 16], [20, 20]].map(([w, d]) => { const r = deckRow(w, d); return [`${w} × ${d} ft`, w * d, r.boards, r.joists, fmtInt(r.screws)]; }))}
<section class="hgt-read"><h2>Before you buy framing</h2><ul><li>Joist and beam sizes depend on span, species and load. Size them from the span tables in the American Wood Council's DCA 6 deck guide or your local code.</li><li>Composite boards often require 12 in joist spacing for diagonal decking or stairs; check the maker's installation guide.</li><li>Footings must reach below the frost line, and ledgers need through-bolts or structural screws into the house rim joist, never nails.</li><li>Building stairs off the deck? Use the <a href="/stair-calculator/">stair calculator</a>.</li></ul></section>`,
    faqs: [
      ['How many deck boards do I need?', 'Divide the deck depth in inches by the board width plus gap (5½ in + 3/16 in for most boards) to get the number of rows, multiply by the deck width in feet for linear feet, add 10% and divide by the board length.'],
      ['How many joists do I need for a deck?', 'Deck width in inches ÷ joist spacing (usually 16 in), plus one. A 16 ft wide deck needs 13 joists at 16 in on center, or 17 at 12 in.'],
      ['How many screws do I need for a deck?', 'Two screws per board at every joist. For a 16 × 12 ft deck with 26 rows and 13 joists, that is about 680 screws plus a few extra. A 5 lb box of 2½ in deck screws usually holds around 350–400.'],
      ['What is the gap between deck boards?', 'About 3/16 in for most wood and composite boards, enough for water to drain. Composite makers specify their own gaps for end-to-end joints and temperature; follow the installation guide.'],
      ['How deep should deck footings be?', 'Below your local frost line and at least 12 in deep in warm climates. Footing size depends on the load each post carries; the AWC DCA 6 guide and local code give the minimums.'],
    ],
    sources: `Board layout assumes 5½ in wide boards with a 3/16 in gap and 10% waste. Joist spacing, ledger, footing and framing guidance points to the <a href="${DCA6_URL}" rel="nofollow">American Wood Council DCA 6 deck guide</a>; this calculator does not size joists or beams. Footings are ${DECK.footDia} in × ${DECK.footDepth} in by default. Prices are placeholders to edit.`,
  }));
  const T = TILE.tiles;
  pages.push(toolPage({
    path: '/tile-calculator/', name: 'Tile Calculator', script: '/assets/interior.js', embedId: 'tile',
    title: 'Tile Calculator: Tiles, Boxes, Grout & Thinset Needed',
    description: 'Free tile calculator: how many tiles and boxes for a floor or wall, by tile size, pattern and grout joint, plus grout and thinset mortar bags and cost.',
    h1: 'Tile Calculator', lede: 'How many tiles and boxes to buy for a floor, wall or backsplash, with the right waste for your pattern, plus grout pounds and bags of thinset by trowel size.',
    answer: `<strong>Tiles = area (sq ft) × 144 ÷ ((tile length + joint) × (tile width + joint)), plus 10% (15% for diagonal or herringbone).</strong> With ⅛ in joints, 12 × 24 in tiles need ${tilePer(T['12x24']).toFixed(2)} per sq ft and 12 × 12 in need ${tilePer(T['12x12']).toFixed(2)}. A 10 × 12 ft floor in 12 × 24 in tile takes about <strong>${Math.ceil(120 * tilePer(T['12x24']) * 1.1)} tiles</strong>.`,
    card: tileCard(),
    sections: `<h2>Tiles per square foot by size (⅛ in joints)</h2>${table(['Tile', 'Per sq ft', 'Per 100 sq ft (+10%)', 'Trowel'], Object.values(T).map((t) => [t.name, tilePer(t).toFixed(2), fmtInt(Math.ceil(100 * tilePer(t) * 1.1)), (TILE.trowels.find((x) => Math.max(t.l, t.w) <= x.upTo) || TILE.trowels[2]).name]))}
<h2>Waste by pattern</h2>${table(['Pattern', 'Extra to order'], Object.values(TILE.patterns).map((p) => [p.name, `${p.waste * 100}%`]))}
<p class="hgt-read">Buy all boxes from the same lot (shade) number and keep a few spare tiles for repairs.</p>`,
    faqs: [
      ['How do I calculate how many tiles I need?', 'Find the area in square feet (length × width), divide by the area of one tile including its grout joint, and add 10% for cuts, or 15% for diagonal and herringbone layouts. Then divide by the square feet per box.'],
      ['How many 12 × 24 tiles do I need for 100 sq ft?', `About ${Math.ceil(100 * tilePer(T['12x24']))} tiles before waste, or ${Math.ceil(100 * tilePer(T['12x24']) * 1.1)} with 10% extra. Each 12 × 24 tile covers 2 sq ft.`],
      ['How much grout do I need?', 'It depends on tile size, joint width and tile thickness: small tiles and wide joints use far more. 100 sq ft of 12 × 12 tile with ⅛ in joints takes about 8–10 lb; the same area of 2 × 2 mosaic takes several times that.'],
      ['How much thinset do I need?', 'A 50 lb bag covers about 90–100 sq ft with a ¼ × ¼ in trowel, 60–65 sq ft with ¼ × ⅜ in, and 40–45 sq ft with ½ × ½ in. Larger tiles need the bigger notch.'],
      ['Should I use sanded or unsanded grout?', 'Unsanded for joints narrower than ⅛ in and for polished stone or glass that sand could scratch; sanded for joints ⅛ in and wider.'],
    ],
    sources: `Tile counts include the grout joint in each tile's footprint. Grout volume = (tile length + width) × joint × depth ÷ (length × width) per unit area, at about ${TILE.groutDensity} lb per cubic inch plus ${Math.round(TILE.groutWaste * 100)}%. Thinset coverage per 50 lb bag reflects typical manufacturer data for each trowel notch; check your bag. Prices are placeholders to edit.`,
  }));
  const sh = (w, d, h = 96) => ({ wall: (w + 2 * d) * h / 144, floor: w * d / 144 });
  pages.push(toolPage({
    path: '/shower-tile-calculator/', name: 'Shower Tile Calculator', script: '/assets/interior.js', embedId: 'shower-tile',
    title: 'Shower Tile Calculator: Wall & Floor Tile, Grout, Membrane',
    description: 'Free shower tile calculator: wall and floor tile for a 3-wall shower by tile size, plus grout, thinset and waterproofing membrane, with niche cut-outs.',
    h1: 'Shower Tile Calculator', lede: 'Tile for the three walls and floor of an alcove shower, in different tile sizes for walls and floor, plus grout, thinset and waterproofing membrane.',
    answer: `<strong>Wall area = (back wall width + 2 × side wall depth) × tile height ÷ 144</strong> (all in inches). A 60 × 32 in shower tiled 96 in high has about <strong>${sh(60, 32).wall.toFixed(0)} sq ft of wall</strong> and ${sh(60, 32).floor.toFixed(1)} sq ft of floor: about ${Math.ceil(sh(60, 32).wall * tilePer(T['3x6']) * 1.15)} subway tiles (3 × 6 in) with 15% extra.`,
    card: showerCard(),
    sections: `<h2>Tile area for common shower sizes (96 in high)</h2>${table(['Shower', 'Wall sq ft', 'Floor sq ft', '3 × 6 subway (+15%)', '12 × 24 (+15%)'], [[36, 36], [48, 36], [60, 32], [60, 36], [72, 36]].map(([w, d]) => { const a = sh(w, d); return [`${w} × ${d} in`, a.wall.toFixed(0), a.floor.toFixed(1), fmtInt(Math.ceil(a.wall * tilePer(T['3x6']) * 1.15)), fmtInt(Math.ceil(a.wall * tilePer(T['12x24']) * 1.15))]; }))}
<section class="hgt-read"><h2>Shower tile tips</h2><ul><li>Waterproof first: a sheet or liquid membrane over cement board or foam board, including the curb and niche.</li><li>Floor tiles of 2 × 2 in mosaic follow the slope to the drain; large floor tiles need a linear drain.</li><li>Order 15% extra for showers: niches, valve cut-outs and the curb eat tile.</li></ul></section>`,
    faqs: [
      ['How much tile do I need for a shower?', `Add the back wall width and twice the side wall depth, multiply by the tile height, and divide by 144 for square feet. For a 60 × 32 in shower tiled to 96 in, that is about ${sh(60, 32).wall.toFixed(0)} sq ft of wall plus ${sh(60, 32).floor.toFixed(1)} sq ft of floor. Order 15% extra.`],
      ['How high should shower tile go?', 'At least 6 in above the shower head, and many people tile to the ceiling (often 96 in) for a cleaner look and easier cleaning.'],
      ['How many subway tiles for a shower?', `A 3 × 6 in subway tile with ⅛ in joints covers about 0.13 sq ft, so roughly ${tilePer(T['3x6']).toFixed(1)} tiles per sq ft. An ${sh(60, 32).wall.toFixed(0)} sq ft shower surround takes about ${Math.ceil(sh(60, 32).wall * tilePer(T['3x6']) * 1.15)} with 15% extra.`],
      ['What size tile is best for a shower floor?', 'Small tiles such as 2 × 2 in mosaics bend to the slope toward a center drain and give better grip. Large-format tile on a shower floor needs a linear drain and a single-plane slope.'],
      ['Do I need to waterproof before tiling a shower?', 'Yes. Grout and tile are not waterproof. Use a waterproofing membrane over the backer board on walls, floor, curb and niche, and follow the system\'s instructions for seams and corners.'],
    ],
    sources: `Areas are calculated in inches for an alcove (three-wall) shower. Tile counts use the same method as the tile calculator with 15% waste; thinset by trowel size and grout by joint volume. Membrane adds 10% for overlaps. Follow your waterproofing system's instructions.`,
  }));
  const r12 = drywallRow(12, 12);
  pages.push(toolPage({
    path: '/drywall-calculator/', name: 'Drywall Calculator', script: '/assets/interior.js', embedId: 'drywall',
    title: 'Drywall Calculator: Sheets, Screws, Mud & Tape for Any Room',
    description: 'Free drywall calculator: how many 4×8, 4×10 or 4×12 sheets, screws, joint compound and tape for walls and ceilings, minus doors and windows, with cost.',
    h1: 'Drywall Calculator', lede: 'How many sheets of drywall to buy for one room or a whole house, walls and ceilings, minus doors and windows, plus screws, joint compound and tape.',
    answer: `<strong>Wall area = 2 × (length + width) × height; add ceiling (length × width); subtract about 21 sq ft per door and 15 per window; add 10%; divide by 32 for 4 × 8 sheets.</strong> A 12 × 12 ft room with 8 ft walls, a ceiling, one door and one window has ${r12.area} sq ft and needs <strong>${r12.sheets} sheets of 4 × 8</strong>.`,
    card: drywallCard(),
    sections: `<h2>Drywall sheets for common rooms (8 ft walls, ceiling, 1 door, 1 window)</h2>${table(['Room', 'Sq ft of board', '4 × 8 sheets', '4 × 12 sheets'], [[10, 10], [10, 12], [12, 12], [12, 14], [14, 16], [16, 20]].map(([l, w]) => { const a = drywallRow(l, w), b = drywallRow(l, w, 8, 48); return [`${l} × ${w} ft`, a.area, a.sheets, b.sheets]; }))}
<section class="hgt-read"><h2>Which sheet size?</h2><ul><li><strong>4 × 8</strong>: easiest to carry and the only size many trucks and stairs allow.</li><li><strong>4 × 12</strong>: fewer butt joints on long walls and ceilings, so less taping, but two people to hang.</li><li><strong>½ in</strong> for walls, <strong>⅝ in</strong> or sag-resistant ½ in for ceilings, moisture-resistant board in bathrooms.</li></ul></section>`,
    faqs: [
      ['How do I calculate how much drywall I need?', 'Add up wall areas (perimeter × height) and ceiling areas (length × width), subtract doors (about 21 sq ft each) and windows (about 15 sq ft each), add 10% for waste, and divide by the sheet area: 32 sq ft for 4 × 8, 48 for 4 × 12.'],
      ['How many sheets of drywall for a 12 × 12 room?', `About ${r12.sheets} sheets of 4 × 8 for walls and ceiling with 8 ft walls, one door and one window, or ${drywallRow(12, 12, 8, 48).sheets} sheets of 4 × 12.`],
      ['How many drywall screws do I need?', 'Roughly one screw per square foot of board: about 32 per 4 × 8 sheet with studs 16 in on center. A 1 lb box of 1¼ in screws holds roughly 300.'],
      ['How much joint compound do I need?', 'About 0.14 lb of ready-mixed compound per square foot for taping and three coats, so one 4.5 gallon pail (about 62 lb) covers roughly 450 sq ft of board.'],
      ['How much drywall tape do I need?', 'About 0.37 ft of tape per square foot of board, roughly 370 ft per 1,000 sq ft. A 250 ft roll covers about 675 sq ft.'],
    ],
    sources: `Openings use typical sizes: 3 × 7 ft doors (21 sq ft) and 3 × 5 ft windows (15 sq ft). Screws, compound and tape use common estimating figures (about 1 screw, ${DRYWALL.mudLbPerSqft} lb of ready-mixed compound and ${DRYWALL.tapePerSqft} ft of tape per sq ft of board). Use thicker or special board where your code requires it (garages, ceilings, fire separations). Prices are placeholders to edit.`,
  }));
  return pages;
}

// ---------- batch 3: square footage, cubic yards, board feet, soil ----------
const ftIn = (k, label, v, vi) => [{ k, label: `${label} (ft)`, v }, { k: `${k}i`, label: '+ in', v: vi }];
const MATERIALS = {
  ...Object.fromEntries(Object.entries(GRAVEL.materials).map(([k, m]) => [k, { short: m.short, name: m.name, tpy: m.tpy }])),
  topsoil: { short: 'topsoil', name: 'Topsoil (dry)', tpy: 1.1 },
  fill: { short: 'fill dirt', name: 'Fill dirt', tpy: 1.2 },
  compost: { short: 'compost', name: 'Compost', tpy: 0.5 },
  mulch: { short: 'mulch', name: 'Wood mulch', tpy: 0.3 },
  concrete: { short: 'concrete', name: 'Concrete (wet)', tpy: 2 },
};
const SQFT = { rows: { label: 'Area', shapes: {
  r: { name: 'Rectangle', cols: [...ftIn('a', 'Length', 12, 0), ...ftIn('b', 'Width', 10, 0), { k: 'q', label: 'Qty', v: 1 }] },
  c: { name: 'Circle', cols: [...ftIn('a', 'Diameter', 10, 0), { k: 'q', label: 'Qty', v: 1 }] },
  t: { name: 'Triangle', cols: [...ftIn('a', 'Base', 10, 0), ...ftIn('b', 'Height', 8, 0), { k: 'q', label: 'Qty', v: 1 }] },
} } };
const COUNTER = { rows: { label: 'Section', cols: [{ k: 'a', label: 'Length (in)', v: 96 }, { k: 'b', label: 'Depth (in)', v: 25.5 }, { k: 'q', label: 'Qty', v: 1 }] } };
const CUYD = { materials: MATERIALS, rows: { label: 'Area', shapes: {
  r: { name: 'Rectangle', cols: [{ k: 'a', label: 'Length (ft)', v: 10 }, { k: 'b', label: 'Width (ft)', v: 10 }, { k: 'c', label: 'Depth (in)', v: 4 }, { k: 'q', label: 'Qty', v: 1 }] },
  c: { name: 'Circle', cols: [{ k: 'a', label: 'Diameter (ft)', v: 10 }, { k: 'c', label: 'Depth (in)', v: 4 }, { k: 'q', label: 'Qty', v: 1 }] },
  t: { name: 'Triangle', cols: [{ k: 'a', label: 'Base (ft)', v: 10 }, { k: 'b', label: 'Height (ft)', v: 8 }, { k: 'c', label: 'Depth (in)', v: 4 }, { k: 'q', label: 'Qty', v: 1 }] },
} } };
const TONS = { materials: MATERIALS };
const BF = { rows: { label: 'Lumber', cols: [{ k: 'a', label: 'Thickness (in)', v: 1 }, { k: 'b', label: 'Width (in)', v: 6 }, { k: 'c', label: 'Length (ft)', v: 8 }, { k: 'q', label: 'Pieces', v: 10 }] } };
const LOG_RULES = { doyle: 'Doyle', scribner: 'Scribner', intl: 'International ¼ in' };
const LOG = { rules: LOG_RULES, rows: { label: 'Logs', cols: [{ k: 'a', label: 'Small-end diameter (in)', v: 16 }, { k: 'c', label: 'Length (ft)', v: 16 }, { k: 'q', label: 'Logs', v: 1 }] } };
const POT = { rows: { label: 'Container', shapes: {
  p: { name: 'Round pot', cols: [{ k: 'a', label: 'Top diameter (in)', v: 12 }, { k: 'c', label: 'Height (in)', v: 11 }, { k: 'q', label: 'Qty', v: 4 }] },
  b: { name: 'Planter box', cols: [{ k: 'a', label: 'Length (in)', v: 36 }, { k: 'b', label: 'Width (in)', v: 10 }, { k: 'c', label: 'Depth (in)', v: 10 }, { k: 'q', label: 'Qty', v: 1 }] },
  g: { name: 'Grow bag', cols: [{ k: 'a', label: 'Gallons', v: 5 }, { k: 'q', label: 'Qty', v: 1 }] },
} } };
const BED = {
  settle: 0.1,
  mixes: {
    topsoil: { name: 'Topsoil-based 60/30/10', parts: [{ name: 'Topsoil or garden soil', share: 0.6, bag: 0.75 }, { name: 'Compost', share: 0.3, bag: 1 }, { name: 'Perlite or fine pine bark', share: 0.1, bag: 2 }] },
    mel: { name: 'Square-foot "Mel\'s Mix" (⅓ each)', parts: [{ name: 'Blended compost', share: 1 / 3, bag: 1 }, { name: 'Peat moss or coco coir', share: 1 / 3, bag: 3 }, { name: 'Coarse vermiculite', share: 1 / 3, bag: 4 }] },
    bagged: { name: 'Bagged raised bed mix only', parts: [{ name: 'Raised bed soil', share: 1, bag: 1.5 }] },
  },
  rows: { label: 'Bed', shapes: {
    r: { name: 'Rectangle', cols: [{ k: 'a', label: 'Length (ft)', v: 8 }, { k: 'b', label: 'Width (ft)', v: 4 }, { k: 'c', label: 'Depth (in)', v: 12 }, { k: 'q', label: 'Qty', v: 1 }] },
    c: { name: 'Round', cols: [{ k: 'a', label: 'Diameter (ft)', v: 4 }, { k: 'c', label: 'Depth (in)', v: 12 }, { k: 'q', label: 'Qty', v: 1 }] },
  } },
};
const BATCH3_TOOLS = [
  ['📐', 'Square Footage Calculator', '/square-footage-calculator/', 'Square feet for any shape in feet and inches, plus sq yd, m², acres and cost.'],
  ['📦', 'Cubic Yard Calculator', '/cubic-yard-calculator/', 'Cubic yards, tons and bags for soil, gravel, mulch, sand or concrete.'],
  ['🪓', 'Board Foot Calculator', '/board-foot-calculator/', 'Board feet, linear feet and cost for a lumber list.'],
  ['🛏️', 'Raised Bed Soil Calculator', '/raised-bed-soil-calculator/', 'Soil and mix ingredients for raised beds, in cu ft, yards and bags.'],
];
const BATCH3_VARIANTS = [
  ['🍳', 'Countertop Square Footage Calculator', '/countertop-square-footage-calculator/', 'Countertop and backsplash square feet and cost from inches.'],
  ['⚖️', 'Cubic Yards to Tons Calculator', '/cubic-yards-to-tons-calculator/', 'Convert yards and tons for gravel, soil, sand, mulch and concrete.'],
  ['🌲', 'Log Board Foot Calculator', '/log-board-foot-calculator/', 'Board feet in logs by Doyle, Scribner and International ¼ in.'],
  ['🪴', 'Potting Soil Calculator', '/potting-soil-calculator/', 'Quarts and bags of potting mix for pots, planters and grow bags.'],
];

const rowsSet = (legend) => `<fieldset class="hgt-calc__set"><legend>${legend}</legend><div data-rows></div>
<button type="button" class="hgt-btn hgt-btn--ghost hgt-calc__add" data-add>+ Add another</button></fieldset>`;
const priceOnly = (label, v) => `<details class="hgt-calc__prices"><summary>Price (optional)</summary><div class="hgt-calc__grid">${priceInput('price', label, v)}</div></details>`;
const matSelect = (sel) => field('Material', selectIn('mat', Object.entries(MATERIALS).map(([k, m]) => [k, `${m.name} · ${m.tpy} t/yd`]), sel));
const mShell = (kind, cfg, inner, embed) => calcShell(`data-hgt-measure="${kind}"`, cfg, inner, embed);
const sqftCard = (embed = false) => mShell('sqft', SQFT, `${rowsSet('Areas (add rooms or parts of an L-shape)')}
<div class="hgt-calc__grid">${field('Exclude (sq ft)', numIn('sub', '', '1', ' placeholder="0"'))}</div>
${priceOnly('Price per sq ft', 0)}`, embed);
const counterCard = (embed = false) => mShell('counter', COUNTER, `${rowsSet('Countertop sections (inches)')}
<div class="hgt-calc__grid">
<label class="hgt-calc__check"><input type="checkbox" name="splash" checked> Add backsplash</label>
${field('Backsplash height (in)', numIn('splashh', 4, '0.5'))}
</div>
${priceOnly('Installed price per sq ft', 60)}`, embed);
const cuydCard = (embed = false) => mShell('cuyd', CUYD, `${rowsSet('Areas')}
<div class="hgt-calc__grid">${matSelect('topsoil')}${field('Priced per', selectIn('unit', [['yd', 'cubic yard'], ['ton', 'ton']], 'yd'))}</div>
${priceOnly('Price', 0)}`, embed);
const tonsCard = (embed = false) => mShell('tons', TONS, `<div class="hgt-calc__grid">
${field('Convert', selectIn('dir', [['tons', 'Tons → cubic yards'], ['yd', 'Cubic yards → tons']], 'tons'))}
${field('Amount', numIn('amount', 10, '0.1'))}
${matSelect('57')}
</div>`, embed);
const bfCard = (embed = false) => mShell('bf', BF, `${rowsSet('Lumber list')}
${priceOnly('Price per board foot', 0)}`, embed);
const logCard = (embed = false) => mShell('log', LOG, `${rowsSet('Logs')}
<div class="hgt-calc__grid">${field('Log rule', selectIn('rule', Object.entries(LOG_RULES), 'doyle'))}</div>
${priceOnly('Price per board foot', 0)}`, embed);
const potCard = (embed = false) => mShell('pot', POT, rowsSet('Containers'), embed);
const bedCard = (embed = false) => mShell('bed', BED, `${rowsSet('Raised beds')}
<div class="hgt-calc__grid">
${field('Soil mix', selectIn('mix', Object.entries(BED.mixes).map(([k, m]) => [k, m.name]), 'topsoil'))}
${field('Filler at the bottom', selectIn('fill', [[0, 'None (all soil)'], [4, '4 in of logs or branches'], [6, '6 in'], [12, '12 in (deep beds)']], 0))}
</div>`, embed);

// Same formulas as measure.js, for the reference tables.
const potCuIn = (d, h) => { const R = d / 2, rb = R * 0.8, hh = Math.max(0, h - 1); return Math.PI * hh / 3 * (R * R + R * rb + rb * rb); };
const logBf = (rule, d, L) => {
  if (rule === 'doyle') return Math.max(0, (d - 4) ** 2 * L / 16);
  if (rule === 'scribner') return Math.max(0, (0.79 * d * d - 2 * d - 4) * L / 16);
  let bf = 0; const full = Math.floor(L / 4), rest = L - full * 4;
  for (let i = 0; i < full; i++) { const di = d + 0.5 * i; bf += 0.22 * di * di - 0.71 * di; }
  if (rest) { const dr = d + 0.5 * full; bf += (0.22 * dr * dr - 0.71 * dr) * rest / 4; }
  return Math.max(0, bf * 0.905);
};
const bedCuft = (l, w, d) => l * w * d / 12 * (1 + BED.settle);

function batch3Pages() {
  const pages = [];
  pages.push(toolPage({
    path: '/square-footage-calculator/', name: 'Square Footage Calculator', script: '/assets/measure.js', embedId: 'square-footage',
    title: 'Square Footage Calculator: Feet & Inches, Any Shape, Cost',
    description: 'Free square footage calculator: area in sq ft for rooms, L-shapes, circles and triangles in feet and inches, converted to sq yd, m² and acres, with cost.',
    h1: 'Square Footage Calculator', lede: 'Square feet for a room, a whole house, a yard or an odd shape. Enter feet and inches, add as many areas as you need, and get square yards, square meters, acres and cost at once.',
    answer: '<strong>Square feet = length × width</strong> (in feet). Convert inches by dividing by 12: a room 12 ft 6 in × 10 ft 3 in is 12.5 × 10.25 = <strong>128.1 sq ft</strong>. For an L-shape, split it into rectangles and add them. Circles: π × (diameter ÷ 2)². Divide by 9 for square yards, or by 43,560 for acres.',
    card: sqftCard(),
    sections: `<h2>Square footage of common room sizes</h2>${table(['Room', 'Square feet', 'Square yards', 'Square meters'], [[10, 10], [10, 12], [12, 12], [12, 14], [14, 16], [16, 20], [20, 20]].map(([a, b]) => [`${a} × ${b} ft`, a * b, (a * b / 9).toFixed(1), (a * b * 0.09290304).toFixed(1)]))}
<h2>Area conversions</h2>${table(['From', 'To', 'Multiply by'], [['Square feet', 'Square yards', '÷ 9'], ['Square feet', 'Square meters', '× 0.0929'], ['Square feet', 'Acres', '÷ 43,560'], ['Square inches', 'Square feet', '÷ 144'], ['Square meters', 'Square feet', '× 10.764'], ['Acres', 'Square feet', '× 43,560']])}`,
    faqs: [
      ['How do I calculate square footage?', 'Measure the length and width in feet and multiply them. For measurements in feet and inches, turn the inches into a decimal of a foot (divide by 12) first. For irregular rooms, split the space into rectangles, triangles or circles, find each area and add them up.'],
      ['How do I calculate the square footage of an L-shaped room?', 'Split the L into two rectangles, measure each one, multiply length × width for each, and add the two results. Add each part as a separate area in the calculator.'],
      ['How many square feet is a 12 × 12 room?', '144 square feet, which is 16 square yards or about 13.4 square meters.'],
      ['How do I convert square feet to square yards?', 'Divide by 9, because a square yard is 3 ft × 3 ft. 270 sq ft ÷ 9 = 30 sq yd. Carpet and some sod are sold by the square yard.'],
      ['How many square feet are in an acre?', '43,560 square feet. A half acre is 21,780 sq ft and a quarter acre is 10,890 sq ft.'],
    ],
    sources: 'Standard geometry: rectangles length × width, triangles base × height ÷ 2, circles π × radius². Conversions: 1 sq yd = 9 sq ft, 1 sq ft = 0.09290304 m² (exact), 1 acre = 43,560 sq ft.',
  }));
  pages.push(toolPage({
    path: '/countertop-square-footage-calculator/', name: 'Countertop Square Footage Calculator', script: '/assets/measure.js', embedId: 'countertop',
    title: 'Countertop Square Footage Calculator (with Backsplash)',
    description: 'Free countertop square footage calculator: measure each section in inches, add islands and a backsplash, and get the square feet and cost for quartz, granite or laminate.',
    h1: 'Countertop Square Footage Calculator', lede: 'Square feet of countertop for quotes and slab orders: measure each section in inches, add the island and backsplash, and see the cost at your installed price per square foot.',
    answer: '<strong>Countertop sq ft = length (in) × depth (in) ÷ 144</strong> for each section. A standard counter is <strong>25½ in deep</strong>, so every 10 ft (120 in) run is 21.25 sq ft; a 4 in backsplash adds 3.3 sq ft per 10 ft. Measure L-shapes as two sections with the corner counted once.',
    card: counterCard(),
    sections: `<h2>Square feet for common countertop runs (25½ in deep)</h2>${table(['Run length', 'Counter', '+ 4 in backsplash'], [60, 72, 96, 120, 144, 180].map((l) => [`${l} in (${(l / 12).toFixed(1).replace('.0', '')} ft)`, `${(l * 25.5 / 144).toFixed(1)} sq ft`, `${(l * 29.5 / 144).toFixed(1)} sq ft`]))}
<h2>Common island sizes</h2>${table(['Island', 'Square feet'], [[48, 36], [72, 36], [84, 42], [96, 42], [108, 48]].map(([l, d]) => [`${l} × ${d} in`, (l * d / 144).toFixed(1)]))}`,
    faqs: [
      ['How do you measure countertops for square footage?', 'Measure each straight section\'s length and depth in inches along the back wall, multiply length × depth and divide by 144. For an L or U shape, measure one leg to the wall and the other leg from the edge of the first, so the corner isn\'t counted twice.'],
      ['What is the standard countertop depth?', 'About 25½ in for base cabinets (24 in cabinets plus a 1½ in overhang). Islands are often 36–42 in deep, or more with seating.'],
      ['Do you include the sink cut-out in square footage?', 'No. Fabricators price the full slab area including sink and cooktop cut-outs, and often charge extra for each cut-out.'],
      ['How much backsplash square footage do I need?', 'Multiply the length of counter against the wall by the backsplash height. A standard 4 in backsplash adds 1 sq ft for every 36 in of wall; a full-height tile backsplash is usually 18 in high.'],
      ['How many square feet is a kitchen countertop?', 'Most kitchens have 30–50 sq ft of countertop, plus 10–30 sq ft for an island.'],
    ],
    sources: 'Area = length × depth ÷ 144 (square inches per square foot). Standard depths reflect common U.S. base cabinet dimensions. Installed prices vary widely by material, edge and region; enter quotes from your fabricator.',
  }));
  const M = MATERIALS;
  pages.push(toolPage({
    path: '/cubic-yard-calculator/', name: 'Cubic Yard Calculator', script: '/assets/measure.js', embedId: 'cubic-yard',
    title: 'Cubic Yard Calculator: Yards, Tons & Bags for Any Material',
    description: 'Free cubic yard calculator: cubic yards, tons and bags of soil, gravel, mulch, sand or concrete for any shape and depth, with the math shown and cost.',
    h1: 'Cubic Yard Calculator', lede: 'Cubic yards for any landscaping or concrete job, from length, width and depth, plus the weight in tons and how many bags that is, for soil, gravel, mulch, sand, compost or concrete.',
    answer: '<strong>Cubic yards = length (ft) × width (ft) × depth (in) ÷ 324.</strong> Or multiply all three dimensions in feet and divide by 27. A 10 × 10 ft area 4 in deep is <strong>1.23 cubic yards</strong>. One cubic yard covers 324 sq ft at 1 in, 108 sq ft at 3 in and 81 sq ft at 4 in.',
    card: cuydCard(),
    sections: `<h2>Cubic yards for common areas</h2>${table(['Area', '2 in deep', '3 in deep', '4 in deep', '6 in deep'], [[10, 10], [10, 20], [20, 20], [12, 24], [20, 50]].map(([a, b]) => [`${a} × ${b} ft`, ...[2, 3, 4, 6].map((d) => (a * b * d / 324).toFixed(2))]))}
<h2>What a cubic yard weighs</h2>${table(['Material', 'Tons per cu yd', 'Pounds'], Object.values(M).map((m) => [m.name, m.tpy, fmtInt(m.tpy * 2000)]))}
<p class="hgt-read">Weights are typical dry figures; wet soil, sand and mulch weigh more. A cubic yard is 27 cubic feet, or about 13 bags of 2 cu ft.</p>`,
    faqs: [
      ['How do I calculate cubic yards?', 'Multiply length × width × depth, all in feet, and divide by 27. If depth is in inches, multiply length × width in feet by the depth in inches and divide by 324. 20 × 10 ft at 3 in: 20 × 10 × 3 ÷ 324 = 1.85 cubic yards.'],
      ['How many square feet does a cubic yard cover?', '324 sq ft at 1 in deep, 162 sq ft at 2 in, 108 sq ft at 3 in, 81 sq ft at 4 in and 54 sq ft at 6 in.'],
      ['How many bags are in a cubic yard?', '27 cubic feet make a yard: 13.5 bags of 2 cu ft, 18 bags of 1.5 cu ft or 54 bags of 0.5 cu ft.'],
      ['How many tons is a cubic yard?', 'It depends on the material: about 1.4 tons for gravel, 1.1 tons for dry topsoil, 0.3 tons for wood mulch and 2 tons for wet concrete.'],
      ['How much does a cubic yard of dirt weigh?', 'About 2,200 lb (1.1 tons) for dry topsoil, and up to around 3,000 lb when wet or full of clay.'],
    ],
    sources: 'Volume: 1 cubic yard = 27 cubic feet = 0.7646 m³. Material weights are typical supplier figures and vary with moisture and grade; ask your yard for theirs when ordering by the ton. Concrete is about 4,000 lb per cubic yard when fresh.',
  }));
  pages.push(toolPage({
    path: '/cubic-yards-to-tons-calculator/', name: 'Cubic Yards to Tons Calculator', script: '/assets/measure.js', embedId: 'yards-tons',
    title: 'Cubic Yards to Tons Calculator (and Tons to Yards)',
    description: 'Free converter for cubic yards to tons and tons to cubic yards for gravel, crushed stone, sand, topsoil, fill dirt, mulch, compost and concrete.',
    h1: 'Cubic Yards to Tons Calculator', lede: 'Suppliers sell by the ton or the yard. Convert between them for the exact material you are buying, with typical weights for gravel, stone, sand, soil, mulch and concrete.',
    answer: `<strong>Tons = cubic yards × density; cubic yards = tons ÷ density.</strong> Gravel and crushed stone weigh about <strong>1.4 tons per cubic yard</strong>, so 10 tons of #57 stone is about 7.1 cubic yards. Topsoil is about 1.1 tons per yard and wood mulch about 0.3.`,
    card: tonsCard(),
    sections: `<h2>Conversion chart</h2>${table(['Material', '1 cu yd =', '1 ton =', '10 tons ='], Object.values(M).map((m) => [m.name, `${m.tpy} tons`, `${(1 / m.tpy).toFixed(2)} cu yd`, `${(10 / m.tpy).toFixed(1)} cu yd`]))}`,
    faqs: [
      ['How many tons are in a cubic yard of gravel?', 'About 1.4 tons (2,800 lb) for most gravel and crushed stone, and about 1.5 tons for crusher run with fines.'],
      ['How many cubic yards are in a ton of gravel?', 'About 0.71 cubic yards. 10 tons of gravel is about 7 cubic yards.'],
      ['How many cubic yards in a ton of topsoil?', 'About 0.9 cubic yards of dry topsoil per ton. Wet soil is heavier, so a ton covers less.'],
      ['How many tons is a cubic yard of sand?', 'About 1.35 tons dry; wet sand can weigh 1.5 tons or more per yard.'],
      ['Why do suppliers sell by the ton?', 'Their trucks are weighed on a scale, so tons are easier to measure than volume. Convert your volume to tons with the density for that material and order a little extra.'],
    ],
    sources: 'Densities are typical dry figures used by landscape and aggregate suppliers; your supplier\'s scale tickets and density take priority.',
  }));
  const bfRows = [[1, 4, 8], [1, 6, 8], [1, 8, 8], [1, 12, 8], [2, 4, 8], [2, 6, 8], [2, 8, 12], [2, 10, 12], [2, 12, 16], [4, 4, 8], [6, 6, 8]].map(([t, w, l]) => [`${t} × ${w} × ${l} ft`, (t * w * l / 12).toFixed(2)]);
  pages.push(toolPage({
    path: '/board-foot-calculator/', name: 'Board Foot Calculator', script: '/assets/measure.js', embedId: 'board-foot',
    title: 'Board Foot Calculator: Lumber Board Feet, Linear Feet & Cost',
    description: 'Free board foot calculator: board feet for a whole lumber list from thickness, width and length, plus linear feet, cubic feet and cost per board foot.',
    h1: 'Board Foot Calculator', lede: 'Board feet for one board or a whole cut list: thickness and width in inches, length in feet, with linear feet, cubic feet and cost when you buy hardwood by the board foot.',
    answer: '<strong>Board feet = thickness (in) × width (in) × length (ft) ÷ 12.</strong> One board foot is 1 in × 12 in × 1 ft (144 cubic inches). A 1 × 6 that is 8 ft long is <strong>4 board feet</strong>; a 2 × 4 × 8 is 5.33. Hardwood uses quarters: 4/4 = 1 in, 8/4 = 2 in.',
    card: bfCard(),
    sections: `<h2>Board feet in common lumber sizes</h2><p class="hgt-read">Nominal sizes, as lumber yards calculate board feet.</p>${table(['Board', 'Board feet'], bfRows)}
<h2>Hardwood thickness (quarter system)</h2>${table(['Quarters', 'Rough thickness', 'Typical surfaced'], [['4/4', '1 in', '¾–13/16 in'], ['5/4', '1¼ in', '1–1 1/16 in'], ['6/4', '1½ in', '1¼ in'], ['8/4', '2 in', '1¾ in'], ['12/4', '3 in', '2¾ in']])}`,
    faqs: [
      ['How do you calculate board feet?', 'Multiply thickness in inches × width in inches × length in feet, then divide by 12. If the length is in inches, divide by 144 instead. Multiply by the number of boards for a total.'],
      ['How many board feet is a 2 × 4 × 8?', '5.33 board feet: 2 × 4 × 8 ÷ 12. Board feet use nominal dimensions for softwood lumber, even though a 2 × 4 actually measures 1½ × 3½ in.'],
      ['What is a board foot?', 'A volume of wood equal to a board 1 in thick, 12 in wide and 1 ft long (144 cubic inches). 12 board feet equal one cubic foot.'],
      ['What is the difference between board feet and linear feet?', 'Linear feet measure length only; board feet measure volume. A 1 × 6 board 10 ft long is 10 linear feet but 5 board feet.'],
      ['How do I price hardwood by the board foot?', 'Hardwood yards price rough lumber per board foot by species and grade. Add up the board feet of your cut list, add 20–30% for defects and milling waste, and multiply by the price.'],
    ],
    sources: 'Board foot definition: 144 cubic inches (1 in × 12 in × 12 in). Softwood dimension lumber is calculated on nominal size; hardwood on rough quarter thickness. Surfaced thicknesses are typical for S2S hardwood.',
  }));
  const logRows = [10, 12, 14, 16, 18, 20, 24, 28].map((d) => [`${d} in`, ...['doyle', 'scribner', 'intl'].map((r) => fmtInt(Math.round(logBf(r, d, 16))))]);
  pages.push(toolPage({
    path: '/log-board-foot-calculator/', name: 'Log Board Foot Calculator', script: '/assets/measure.js', embedId: 'log',
    title: 'Log Board Foot Calculator: Doyle, Scribner & International',
    description: 'Free log scale calculator: board feet in a log or a load of logs from small-end diameter and length, by the Doyle, Scribner and International ¼ in log rules.',
    h1: 'Log Board Foot Calculator', lede: 'How many board feet of lumber a log will scale, from its small-end diameter and length, by all three common U.S. log rules side by side, for timber sales, sawmilling and firewood logs.',
    answer: `<strong>Doyle: (diameter − 4)² × length ÷ 16.</strong> Scribner and International ¼ in rules give more for small logs. A 16 in × 16 ft log scales <strong>${Math.round(logBf('doyle', 16, 16))} bd ft (Doyle)</strong>, ${Math.round(logBf('scribner', 16, 16))} (Scribner) and ${Math.round(logBf('intl', 16, 16))} (International ¼ in). Measure the diameter inside the bark at the small end.`,
    card: logCard(),
    sections: `<h2>Board feet in a 16 ft log</h2>${table(['Small-end diameter', 'Doyle', 'Scribner', 'International ¼ in'], logRows)}
<section class="hgt-read"><h2>Which log rule?</h2><ul><li><strong>Doyle</strong>: common in the South and East; underestimates small logs, so sellers of small timber get less.</li><li><strong>Scribner</strong>: common in the West; closer to actual sawn yield for mid-size logs.</li><li><strong>International ¼ in</strong>: the most accurate for real mill yield and the standard for many state and federal timber sales.</li></ul><p>Ask which rule a buyer uses before comparing offers.</p></section>`,
    faqs: [
      ['How do you calculate board feet in a log?', 'Measure the diameter inside the bark at the small end in inches and the length in feet, then apply a log rule. With Doyle: (diameter − 4)² × length ÷ 16. A 20 in × 12 ft log is (16)² × 12 ÷ 16 = 192 bd ft.'],
      ['Why do log rules give different answers?', 'Each rule makes different assumptions about saw kerf, slabs and taper. Doyle subtracts a large allowance, so small logs scale low; International ¼ in models sawing more closely.'],
      ['How many board feet in a 16 inch log?', `A 16 in log 16 ft long scales about ${Math.round(logBf('doyle', 16, 16))} bd ft by Doyle, ${Math.round(logBf('scribner', 16, 16))} by Scribner and ${Math.round(logBf('intl', 16, 16))} by International ¼ in.`],
      ['Where do I measure log diameter?', 'At the small end, inside the bark, across the average diameter. Lengths usually include 3–6 in of trim allowance that isn\'t scaled.'],
      ['How many board feet in a tree?', 'Scale each log from the tree separately (usually 8–16 ft lengths up to a merchantable top diameter) and add them up. Foresters use volume tables based on diameter at breast height and merchantable height.'],
    ],
    sources: 'Doyle rule: (D − 4)² × L ÷ 16. Scribner: the common formula approximation (0.79D² − 2D − 4) × L ÷ 16. International ¼ in: 0.22D² − 0.71D per 4 ft section, diameter increasing ½ in per section for taper, × 0.905 for a ¼ in saw kerf. These are standard forestry formulas; official scaling follows your state\'s rules.',
  }));
  const pots = [6, 8, 10, 12, 14, 16, 20].map((d) => { const h = Math.round(d * 0.9); const ci = potCuIn(d, h); return [`${d} in round (≈${h} in tall)`, (ci / 1728 * 25.714).toFixed(1), (ci / 231).toFixed(2), (ci / 1728).toFixed(2)]; });
  pages.push(toolPage({
    path: '/potting-soil-calculator/', name: 'Potting Soil Calculator', script: '/assets/measure.js', embedId: 'potting-soil',
    title: 'Potting Soil Calculator: Quarts & Bags for Pots and Planters',
    description: 'Free potting soil calculator: quarts, gallons and bags of potting mix for round pots, planter boxes and grow bags, with tapered pots and a 1 in rim allowance.',
    h1: 'Potting Soil Calculator', lede: 'How much potting mix to buy for a set of pots, window boxes, planters or fabric grow bags, in quarts, gallons and the bag sizes stores sell.',
    answer: `<strong>A 12 in pot holds about ${Math.round(potCuIn(12, 11) / 1728 * 25.714)} quarts of potting mix; a 5 gallon grow bag about ${Math.round(5 * 231 * 0.9 / 1728 * 25.714)} quarts.</strong> One cubic foot of potting mix is about 25.7 dry quarts. For a planter box: length × width × depth (in) ÷ 1,728 = cubic feet. Leave about 1 in below the rim for watering.`,
    card: potCard(),
    sections: `<h2>Potting mix for common pot sizes</h2>${table(['Pot', 'Quarts', 'Gallons', 'Cubic feet'], pots)}
<h2>Grow bags</h2>${table(['Grow bag', 'Quarts (filled to 90%)', 'Cubic feet'], [1, 3, 5, 7, 10, 15, 20, 25].map((g) => [`${g} gal`, (g * 231 * 0.9 / 1728 * 25.714).toFixed(1), (g * 231 * 0.9 / 1728).toFixed(2)]))}
<p class="hgt-read">Nursery "gallon" pots hold less than a true gallon (a #1 pot is roughly ¾ gal), so measure the pot instead of trusting the label.</p>`,
    faqs: [
      ['How much potting soil do I need for a 12 inch pot?', `About ${Math.round(potCuIn(12, 11) / 1728 * 25.714)} quarts (${(potCuIn(12, 11) / 1728).toFixed(2)} cu ft) for a typical tapered 12 in pot about 11 in tall, filled to 1 in below the rim. Straight-sided or deeper pots need more.`],
      ['How many quarts are in a cubic foot of potting soil?', 'About 25.7 dry quarts. A 2 cu ft bag holds about 51 quarts, and a 1.5 cu ft bag about 39 quarts.'],
      ['How much soil for a 5 gallon grow bag?', 'About 15 quarts (0.6 cu ft) when filled to about 90%, which leaves room for watering and settling.'],
      ['How do I calculate soil for a planter box?', 'Multiply length × width × soil depth in inches and divide by 1,728 for cubic feet, then multiply by 25.7 for quarts. A 36 × 10 × 9 in box needs about 1.9 cu ft, or 48 quarts.'],
      ['Can I use garden soil in pots?', 'Not on its own: it compacts and drains poorly in containers. Use a peat- or coir-based potting mix, and add perlite for drainage-hungry plants such as succulents and herbs.'],
    ],
    sources: 'Round pots are treated as tapered (base 80% of the rim diameter) and filled to 1 in below the rim; planters to 1 in below the top; grow bags to 90%. 1 cu ft = 1,728 cu in = 25.714 U.S. dry quarts; 1 gallon = 231 cu in.',
  }));
  pages.push(toolPage({
    path: '/raised-bed-soil-calculator/', name: 'Raised Bed Soil Calculator', script: '/assets/measure.js', embedId: 'raised-bed',
    title: 'Raised Bed Soil Calculator: Cubic Feet, Yards, Bags & Mix',
    description: 'Free raised bed soil calculator: cubic feet, cubic yards and bags of soil for one or many beds, split into a topsoil/compost mix or Mel\'s Mix, with filler and settling.',
    h1: 'Raised Bed Soil Calculator', lede: 'How much soil to fill your raised beds, and how much of each ingredient for the mix you choose, in bags or bulk yards, with an option to save soil with logs or branches at the bottom.',
    answer: `<strong>Soil (cu ft) = length (ft) × width (ft) × depth (in) ÷ 12, plus about 10% for settling.</strong> A <strong>4 × 8 ft bed 12 in deep needs about ${bedCuft(8, 4, 12).toFixed(0)} cu ft</strong> (${(bedCuft(8, 4, 12) / 27).toFixed(1)} cu yd), or ${Math.ceil(bedCuft(8, 4, 12) / 1.5)} bags of 1.5 cu ft. Several beds? Bulk delivery is usually cheaper above about 1 cubic yard.`,
    card: bedCard(),
    sections: `<h2>Soil for common raised bed sizes (+10% settling)</h2>${table(['Bed', 'Depth', 'Cubic feet', 'Cubic yards', '1.5 cu ft bags'], [[4, 4, 6], [4, 4, 12], [3, 6, 12], [4, 8, 6], [4, 8, 12], [4, 8, 18], [2, 8, 12]].map(([w, l, d]) => { const v = bedCuft(l, w, d); return [`${w} × ${l} ft`, `${d} in`, v.toFixed(1), (v / 27).toFixed(2), Math.ceil(v / 1.5)]; }))}
<h2>Raised bed soil mixes</h2>${table(['Mix', 'Recipe', 'Good for'], [['Topsoil-based', '60% topsoil, 30% compost, 10% perlite or fine bark', 'Deep beds and budgets; holds moisture'], ['Mel\'s Mix', '⅓ compost (blended), ⅓ peat or coir, ⅓ coarse vermiculite', 'Square-foot gardens 6 in deep'], ['Bagged raised bed mix', 'Ready to use', 'Small beds and convenience']])}`,
    faqs: [
      ['How much soil do I need for a 4 × 8 raised bed?', `About ${bedCuft(8, 4, 12).toFixed(0)} cubic feet for a bed 12 in deep, including 10% for settling: that is ${(bedCuft(8, 4, 12) / 27).toFixed(1)} cubic yards or ${Math.ceil(bedCuft(8, 4, 12) / 1.5)} bags of 1.5 cu ft. At 6 in deep it takes about ${bedCuft(8, 4, 6).toFixed(0)} cu ft.`],
      ['How deep should a raised bed be?', '6 in works for lettuce, herbs and shallow-rooted crops over loosened ground; 10–12 in suits most vegetables; 18–24 in helps carrots, potatoes and beds on hard or paved ground.'],
      ['What is the best soil mix for raised beds?', 'A blend of about 60% screened topsoil, 30% compost and 10% perlite or fine pine bark drains well and holds nutrients. Square-foot gardeners use Mel\'s Mix: equal parts compost, peat or coir, and coarse vermiculite.'],
      ['Can I put logs or branches in the bottom of a raised bed?', 'Yes, in deep beds. Logs, branches and leaves at the bottom (a hugelkultur-style base) save soil and hold moisture as they break down. Expect the surface to sink a little each year and top it up with compost.'],
      ['Is it cheaper to buy soil in bags or bulk?', 'Bags win for one small bed. Above about 1 cubic yard (27 cu ft), bulk delivery from a landscape supplier usually costs much less per cubic foot, even with a delivery fee.'],
    ],
    sources: `Volume = length × width × depth; ${Math.round(BED.settle * 100)}% is added because fresh soil settles. Mix ratios are common gardening recipes; Mel's Mix is from the Square Foot Gardening method. Bag sizes reflect typical retail sizes (topsoil 0.75 cu ft, compost 1 cu ft, raised bed mix 1.5 cu ft).`,
  }));
  return pages;
}

// ---------- batch 4 (advanced): acreage map, BTU / mini-split, concrete project, stain & paint ----------
const ENERGY_STAR_URL = 'https://www.energystar.gov/products/room_air_conditioners';
const USGS_MAP_URL = 'https://www.usgs.gov/programs/national-geospatial-program/national-map';
const HVAC = {
  chart: [[150, 5000], [250, 6000], [300, 7000], [350, 8000], [400, 9000], [450, 10000], [550, 12000], [700, 14000], [1000, 18000], [1200, 21000], [1400, 23000], [1500, 24000], [2000, 30000], [2500, 34000]],
  overPerSqft: 14, perPerson: 600, kitchen: 4000,
  climates: {
    hot: { name: 'Hot (climate zones 1–2)', perSqft: 30 }, warm: { name: 'Warm (zone 3)', perSqft: 35 }, mixed: { name: 'Mixed (zone 4)', perSqft: 45 },
    cold: { name: 'Cold (zone 5)', perSqft: 50 }, vcold: { name: 'Very cold (zones 6–7)', perSqft: 60 },
  },
  insulation: { poor: { name: 'Poor', factor: 1.25 }, average: { name: 'Average', factor: 1 }, good: { name: 'Good', factor: 0.85 } },
  roomAc: [5000, 6000, 8000, 10000, 12000, 14000, 18000, 24000], central: [1.5, 2, 2.5, 3, 3.5, 4, 5],
  heads: [6000, 9000, 12000, 15000, 18000, 24000], outdoor: [9000, 12000, 18000, 24000, 30000, 36000, 42000, 48000], maxRatio: 1.3,
};
const CONCRETE = {
  types: {
    slab: { name: 'Slab', cols: [{ k: 'a', label: 'Length (ft)', v: 10 }, { k: 'b', label: 'Width (ft)', v: 10 }, { k: 'c', label: 'Thickness (in)', v: 4 }, { k: 'q', label: 'Qty', v: 1 }] },
    footing: { name: 'Footing (continuous)', cols: [{ k: 'a', label: 'Length (ft)', v: 40 }, { k: 'b', label: 'Width (in)', v: 16 }, { k: 'c', label: 'Depth (in)', v: 8 }, { k: 'q', label: 'Qty', v: 1 }] },
    column: { name: 'Round column / Sonotube', cols: [{ k: 'a', label: 'Diameter (in)', v: 12 }, { k: 'c', label: 'Depth (in)', v: 48 }, { k: 'q', label: 'Qty', v: 4 }] },
    steps: { name: 'Steps', cols: [{ k: 'a', label: 'Width (ft)', v: 4 }, { k: 'b', label: 'Run (in)', v: 11 }, { k: 'c', label: 'Rise (in)', v: 7 }, { k: 'q', label: 'Steps', v: 3 }] },
  },
  bags: [{ name: '80 lb', yield: 0.6 }, { name: '60 lb', yield: 0.45 }, { name: '40 lb', yield: 0.3 }],
  truckYd: 10, lbPerYd: 4050, baseCompact: 0.2, meshSheet: 50, lapIn: 18, stickFt: 20, bagLimitYd: 1, shortLoad: 3, minOrder: 1, firstType: 'slab',
};
const COAT = {
  products: {
    semi: { name: 'Semi-transparent stain', smooth: 250, rough: 150, second: 0.5 },
    solid: { name: 'Solid stain', smooth: 300, rough: 200, second: 1 },
    clear: { name: 'Clear sealer or toner', smooth: 300, rough: 200, second: 0.5 },
    paint: { name: 'Exterior paint', smooth: 350, rough: 250, second: 1 },
  },
  edges: 0.1, railFactor: 1, stepSqftPerFt: 2,
  styles: { privacy: { name: 'Solid privacy', factor: 1.15 }, shadow: { name: 'Shadowbox or board-on-board', factor: 1.4 }, picket: { name: 'Spaced picket', factor: 0.75 }, ranch: { name: 'Split rail or ranch', factor: 0.35 } },
  door: 21, window: 15, garage: 112, trimShare: 0.1,
};
const BATCH4_TOOLS = [
  ['🗺️', 'Acreage Calculator', '/acreage-calculator/', 'Draw your lot on a satellite map, or enter sides, for acres and square feet.'],
  ['❄️', 'BTU Calculator', '/btu-calculator/', 'AC and heating BTU for each room with ENERGY STAR adjustments.'],
  ['🏗️', 'Concrete Calculator', '/concrete-calculator/', 'Slabs, footings, columns and steps: yards, bags, trucks, rebar and base.'],
  ['🎨', 'Deck Stain Calculator', '/deck-stain-calculator/', 'Gallons of stain or sealer for deck floor, railings and stairs.'],
];
const BATCH4_VARIANTS = [
  ['🔁', 'Square Feet to Acres Calculator', '/square-feet-to-acres-calculator/', 'Convert sq ft, acres, hectares, m², sq yd and sq mi.'],
  ['🌬️', 'Mini Split Size Calculator', '/mini-split-size-calculator/', 'Indoor head sizes per room and the outdoor unit for a multi-zone system.'],
  ['⬜', 'Concrete Slab Calculator', '/concrete-slab-calculator/', 'Yards, bags, rebar or mesh and gravel base for a slab.'],
  ['🧱', 'Concrete Bag Calculator', '/concrete-bag-calculator/', 'How many 40, 60 or 80 lb bags of concrete for a small pour.'],
  ['🖌️', 'Fence Stain Calculator', '/fence-stain-calculator/', 'Gallons of stain for one or both sides of any fence style.'],
  ['🏠', 'Exterior Paint Calculator', '/exterior-paint-calculator/', 'Gallons of siding and trim paint for a house, minus doors and windows.'],
];

const landCard = (embed = false) => `<div class="hgt-card hgt-calc" data-hgt-land="acreage"${embed ? ' data-embed' : ''}>
<h2 class="hgt-calc__h">Option 1: draw your lot on the map</h2>
<p class="hgt-calc__hint">Search an address, switch to satellite view, and tap each corner of the property in order. Drag corners to fine-tune.</p>
<button type="button" class="hgt-btn" data-map-start>Open the map</button>
<div data-map-ui hidden>
<form class="hgt-calc__search" data-map-search><label class="hgt-frost__label" for="hgt-q">Address or place</label><div class="hgt-calc__pair"><input id="hgt-q" name="q" type="search" placeholder="123 Main St, Springfield, IL" autocomplete="street-address"><button class="hgt-btn" type="submit">Go</button></div><p class="hgt-frost__status" data-map-msg role="status"></p></form>
<div class="hgt-frost__actions"><button type="button" class="hgt-btn hgt-btn--ghost" data-map-locate>Use my location</button><button type="button" class="hgt-btn hgt-btn--ghost" data-map-undo>Undo corner</button><button type="button" class="hgt-btn hgt-btn--ghost" data-map-clear>Clear</button></div>
</div>
<div class="hgt-map" data-map hidden></div>
<div class="hgt-frost__out" data-map-out></div>
<h2 class="hgt-calc__h">Option 2: enter the measurements</h2>
<form novalidate data-shapes>
<div class="hgt-calc__grid">
${field('Lot shape', selectIn('shape', [['rect', 'Rectangle'], ['tri', 'Triangle (3 sides)'], ['quad', '4 sides + a diagonal'], ['circle', 'Circle'], ['known', 'I know the area']], 'rect'))}
${field('Units', selectIn('unit', [['ft', 'Feet'], ['m', 'Meters']], 'ft'))}
<label class="hgt-calc__field" data-for="rect tri quad circle"><span>Side A (or length / diameter)</span>${numIn('a', 208.7, '0.1')}</label>
<label class="hgt-calc__field" data-for="rect tri quad"><span>Side B (or width)</span>${numIn('b', 208.7, '0.1')}</label>
<label class="hgt-calc__field" data-for="tri quad" hidden><span>Side C</span>${numIn('c', 150, '0.1')}</label>
<label class="hgt-calc__field" data-for="quad" hidden><span>Side D</span>${numIn('d', 180, '0.1')}</label>
<label class="hgt-calc__field" data-for="quad" hidden><span>Diagonal from the D–A corner to the B–C corner</span>${numIn('diag', 280, '0.1')}</label>
<label class="hgt-calc__field" data-for="known" hidden><span>Area</span>${numIn('known', 1, '0.01')}</label>
<label class="hgt-calc__field" data-for="known" hidden><span>Area units</span>${selectIn('kunit', [['acre', 'acres'], ['sqft', 'square feet'], ['sqm', 'square meters'], ['ha', 'hectares']], 'acre')}</label>
</div>
</form>
<div class="hgt-frost__out" data-shape-out hidden></div>
</div>`;
const convertCard = (embed = false) => `<div class="hgt-card hgt-calc" data-hgt-land="convert"${embed ? ' data-embed' : ''}>
<form novalidate><div class="hgt-calc__grid">
${field('Area', numIn('value', 10000, 'any'))}
${field('From', selectIn('from', [['sqft', 'square feet'], ['acre', 'acres'], ['sqm', 'square meters'], ['ha', 'hectares'], ['sqyd', 'square yards'], ['sqmi', 'square miles']], 'sqft'))}
</div></form>
<div class="hgt-frost__out" data-out hidden></div>
</div>`;
const hvacCard = (kind, embed = false, first = {}) => calcShell(`data-hgt-hvac="${kind}"`, { ...HVAC, firstRoom: first }, `<fieldset class="hgt-calc__set"><legend>Rooms</legend><div data-rows></div>
<button type="button" class="hgt-btn hgt-btn--ghost hgt-calc__add" data-add>+ Add a room</button></fieldset>
<div class="hgt-calc__grid">
${field('Climate', selectIn('climate', Object.entries(HVAC.climates).map(([k, v]) => [k, v.name]), 'mixed'))}
${field('Insulation and windows', selectIn('insul', Object.entries(HVAC.insulation).map(([k, v]) => [k, v.name]), 'average'))}
${kind === 'split' ? field('Size heads for', selectIn('mode', [['cool', 'Cooling only'], ['heat', 'Cooling and heating (heat pump)']], 'heat')) : ''}
</div>`, embed);
const concreteCard = (embed = false, first = 'slab', over = {}) => {
  const cfg = JSON.parse(JSON.stringify(CONCRETE));
  cfg.firstType = first;
  Object.entries(over).forEach(([k, v]) => { const c = cfg.types[first].cols.find((x) => x.k === k); if (c) c.v = v; });
  return calcShell('data-hgt-concrete', cfg, `<fieldset class="hgt-calc__set"><legend>Parts of the pour</legend><div data-rows></div>
<button type="button" class="hgt-btn hgt-btn--ghost hgt-calc__add" data-add>+ Add a slab, footing, column or steps</button></fieldset>
<div class="hgt-calc__grid">
${field('Extra for spillage and uneven ground', selectIn('waste', [[5, '5%'], [10, '10%'], [15, '15%']], 10))}
${field('Slab reinforcement', selectIn('reinf', [['none', 'None / fiber mix'], ['18', 'Rebar grid, 18 in'], ['12', 'Rebar grid, 12 in'], ['mesh', 'Welded wire mesh']], 'none'))}
${field('Rebar size', selectIn('bar', [[3, '#3 (⅜ in)'], [4, '#4 (½ in)']], 3))}
${field('Gravel base under slabs', selectIn('base', [[0, 'None'], [4, '4 in'], [6, '6 in']], 4))}
</div>
${priceGrid('Prices (edit to match your area)', [['pBag', '80 lb bag', 6.5], ['pReady', 'Ready-mix per cu yd', 175], ['pShort', 'Short-load fee', 100]])}`, embed);
};
const coatCard = (kind, embed = false) => {
  const prod = (sel, keys) => field('Product', selectIn('product', keys.map((k) => [k, COAT.products[k].name]), sel));
  const common = `${field('Surface', selectIn('surface', [['rough', 'Rough, weathered or new rough-sawn'], ['smooth', 'Smooth, previously coated']], 'rough'))}
${field('Coats', selectIn('coats', [[1, '1 coat'], [2, '2 coats']], 2))}
${field('Price per gallon', `<span class="hgt-calc__money">${numIn('price', 45, '0.01')}</span>`)}`;
  let inner = '';
  if (kind === 'deck') inner = `${field('Deck length (ft)', numIn('len', 16, '0.5'))}${field('Deck width (ft)', numIn('wid', 12, '0.5'))}${field('Railing length (ft)', numIn('rail', 40, '1'))}${field('Railing height (in)', numIn('railh', 36, '1'))}${field('Stair steps', numIn('steps', 4, '1'))}${field('Stair width (ft)', numIn('stepw', 4, '0.5'))}${prod('semi', ['semi', 'solid', 'clear', 'paint'])}${common}`;
  if (kind === 'fence') inner = `${field('Fence length (ft)', numIn('len', 150, '1'))}${field('Fence height (ft)', numIn('height', 6, '0.5'))}${field('Sides', selectIn('sides', [[1, 'One side'], [2, 'Both sides']], 2))}${field('Fence style', selectIn('style', Object.entries(COAT.styles).map(([k, v]) => [k, v.name]), 'privacy'))}${prod('semi', ['semi', 'solid', 'clear', 'paint'])}${common}`;
  if (kind === 'house') inner = `${field('House length (ft)', numIn('len', 50, '0.5'))}${field('House width (ft)', numIn('wid', 30, '0.5'))}${field('Wall height to eaves (ft)', numIn('wallh', 18, '0.5'))}${field('Gable ends', numIn('gables', 2, '1'))}${field('Gable width (ft)', numIn('gw', 30, '0.5'))}${field('Gable height (ft)', numIn('gr', 8, '0.5'))}${field('Doors', numIn('doors', 2, '1'))}${field('Windows', numIn('windows', 12, '1'))}${field('Garage doors (double)', numIn('garage', 1, '1'))}${prod('paint', ['paint', 'solid'])}${common}<label class="hgt-calc__check"><input type="checkbox" name="trim" checked> Add trim paint</label>`;
  return calcShell(`data-hgt-coat="${kind}"`, COAT, `<div class="hgt-calc__grid">${inner}</div>`, embed);
};

const esRow = (sq) => { const b = HVAC.chart.find((x) => sq <= x[0]) || HVAC.chart[HVAC.chart.length - 1]; return b[1]; };
const concreteYd = (l, w, t) => l * w * t / 12 / 27;
function batch4Pages() {
  const pages = [];
  pages.push(toolPage({
    path: '/acreage-calculator/', name: 'Acreage Calculator', script: '/assets/land.js', embedId: 'acreage',
    title: 'Acreage Calculator: Draw Your Lot on a Map or Enter Sides',
    description: 'Free acreage calculator: outline your property on a satellite map to get acres, square feet and perimeter, or enter a rectangle, triangle or 4-sided lot.',
    h1: 'Acreage Calculator', lede: 'Find the acreage of a lot, field or yard two ways: outline it on a satellite map, or enter its sides, including irregular triangles and four-sided lots.',
    answer: '<strong>Acres = square feet ÷ 43,560.</strong> A rectangle 208.7 ft on each side is almost exactly <strong>1 acre</strong>. For a lot with uneven sides, split it into triangles with a diagonal and use Heron\'s formula for each, or outline it on the map above. A quarter acre is 10,890 sq ft and a half acre is 21,780 sq ft.',
    card: landCard(),
    sections: `<h2>Common lot sizes</h2>${table(['Acres', 'Square feet', 'Square yards', 'Example square lot'], [0.1, 0.25, 0.5, 1, 2, 5, 10].map((a) => [String(a), fmtInt(a * 43560), fmtInt(a * 4840), `${Math.sqrt(a * 43560).toFixed(1)} × ${Math.sqrt(a * 43560).toFixed(1)} ft`]))}
<section class="hgt-read"><h2>Getting an accurate number</h2><ul><li><strong>Map outlines</strong> are only as good as the imagery and your clicks; expect a few percent of error. They are perfect for planning a garden, fence or seeding job.</li><li><strong>Four-sided lots</strong> need a diagonal: four sides alone do not fix the shape, which is why "average the opposite sides" shortcuts can be badly off.</li><li><strong>Legal acreage</strong> comes from your deed, plat or a licensed surveyor; county GIS parcel viewers often show it too.</li></ul></section>`,
    faqs: [
      ['How do I calculate acreage?', 'Find the area in square feet and divide by 43,560. For a rectangle, multiply length × width in feet. For an irregular lot, split it into triangles, find each triangle\'s area and add them, or outline the lot on a map tool.'],
      ['How many square feet are in an acre?', '43,560 square feet, or 4,840 square yards. A square acre is about 208.7 ft on each side.'],
      ['How do I find the acreage of an irregular lot?', 'Measure all the sides and one diagonal, which splits the lot into two triangles. Heron\'s formula gives each triangle\'s area from its three sides. Add them and divide by 43,560. Or outline the lot on the satellite map.'],
      ['Can I measure acreage with Google Maps?', 'Google Maps measures distance but not area on its own. This tool lets you outline an area on satellite imagery and calculates the area of the shape using the curvature of the Earth.'],
      ['How big is a quarter acre?', '10,890 square feet, about 104 × 104 ft, or a typical suburban lot of about 70 × 155 ft.'],
    ],
    sources: `Map area uses the geodesic polygon formula on the WGS84 sphere (the same method as Leaflet.draw). Satellite imagery: <a href="${USGS_MAP_URL}" rel="nofollow">USGS National Map</a> (public domain); street map © OpenStreetMap contributors; address search by OpenStreetMap Nominatim. Triangles use Heron's formula. 1 acre = 43,560 sq ft = 0.404686 ha.`,
  }));
  pages.push(toolPage({
    path: '/square-feet-to-acres-calculator/', name: 'Square Feet to Acres Calculator', script: '/assets/land.js', embedId: 'sqft-acres',
    title: 'Square Feet to Acres Calculator (and Acres to Sq Ft)',
    description: 'Free converter between square feet, acres, hectares, square meters, square yards and square miles, with a conversion chart for common lot sizes.',
    h1: 'Square Feet to Acres Calculator', lede: 'Convert square feet to acres and back, plus hectares, square meters, square yards and square miles, in one step.',
    answer: '<strong>Acres = square feet ÷ 43,560; square feet = acres × 43,560.</strong> 10,000 sq ft is 0.23 acres, 20,000 sq ft is 0.46 acres and 1 hectare is 2.47 acres.',
    card: convertCard(),
    sections: `<h2>Square feet to acres chart</h2>${table(['Square feet', 'Acres'], [1000, 2500, 5000, 7500, 10000, 15000, 20000, 43560, 50000, 100000].map((s) => [fmtInt(s), (s / 43560).toFixed(3)]))}`,
    faqs: [
      ['How do I convert square feet to acres?', 'Divide square feet by 43,560. For example, 15,000 sq ft ÷ 43,560 = 0.344 acres.'],
      ['How many acres is 10,000 square feet?', 'About 0.23 acres.'],
      ['How do I convert acres to square feet?', 'Multiply acres by 43,560. 2.5 acres × 43,560 = 108,900 sq ft.'],
      ['How many acres are in a hectare?', 'About 2.471 acres; one acre is about 0.405 hectares.'],
      ['How many acres in a square mile?', '640 acres.'],
    ],
    sources: '1 acre = 43,560 sq ft; 1 hectare = 10,000 m² = 107,639 sq ft; 1 sq mi = 640 acres; 1 m² = 10.7639 sq ft.',
  }));
  pages.push(toolPage({
    path: '/btu-calculator/', name: 'BTU Calculator', script: '/assets/hvac.js', embedId: 'btu',
    title: 'BTU Calculator: AC & Heating BTU by Room (ENERGY STAR)',
    description: 'Free BTU calculator: cooling and heating BTU for one room or a whole house, using the ENERGY STAR sizing chart with sun, people, kitchen and ceiling adjustments.',
    h1: 'BTU Calculator', lede: 'How many BTUs you need to cool and heat each room, adjusted for sun, people, kitchens and high ceilings, with the right window AC size or central AC tonnage.',
    answer: `<strong>Cooling: about 20 BTU per square foot</strong> (ENERGY STAR chart): a 300 sq ft room needs 7,000 BTU, 500 sq ft needs 12,000. Add 10% for a very sunny room, subtract 10% if heavily shaded, add 600 BTU per person beyond two and 4,000 BTU for a kitchen. <strong>Heating: about 30–60 BTU per square foot</strong> depending on climate.`,
    card: hvacCard('btu', false, { name: 'Living room', l: 20, w: 15 }),
    sections: `<h2>ENERGY STAR room AC sizing chart</h2>${table(['Room area', 'Cooling capacity'], HVAC.chart.map((b, i) => [`${i ? HVAC.chart[i - 1][0] : 100}–${fmtInt(b[0])} sq ft`, `${fmtInt(b[1])} BTU/h`]))}
<h2>Heating BTU per square foot by climate</h2>${table(['Climate', 'BTU per sq ft', '1,500 sq ft home'], Object.values(HVAC.climates).map((c) => [c.name, c.perSqft, `${fmtInt(c.perSqft * 1500)} BTU/h`]))}
<p class="hgt-read">For a whole-house system, ask your contractor for an ACCA Manual J load calculation; it accounts for insulation levels, windows, air leakage and duct losses room by room.</p>`,
    faqs: [
      ['How many BTU do I need per square foot?', 'About 20 BTU per square foot for cooling in a typical room, per the ENERGY STAR chart, and about 30–60 BTU per square foot for heating depending on how cold your winters are and how well insulated the house is.'],
      ['What size AC do I need for a 12 × 12 room?', '144 sq ft falls in the 100–150 sq ft band, so 5,000 BTU. Go up 10% if the room gets strong afternoon sun.'],
      ['How many BTU for a 500 square foot room?', '12,000 BTU (one ton) by the ENERGY STAR chart, before adjusting for sun, extra people or a kitchen.'],
      ['How many BTU is a ton of air conditioning?', '12,000 BTU per hour. A 3-ton central AC delivers about 36,000 BTU/h.'],
      ['Is a bigger air conditioner better?', 'No. An oversized AC cools the room quickly and shuts off before it removes humidity, leaving it clammy, and it wears out sooner. Pick the size that matches the load.'],
    ],
    sources: `Cooling sizes and adjustments (−10% shade, +10% sun, +600 BTU per person over two, +4,000 BTU for kitchens) follow the <a href="${ENERGY_STAR_URL}" rel="nofollow">ENERGY STAR room air conditioner sizing guide</a>; ceilings over 8 ft scale by room volume (our addition). Heating uses common BTU-per-square-foot rules by IECC climate zone with an insulation factor. These are estimates; a Manual J calculation is the standard for equipment sizing.`,
  }));
  pages.push(toolPage({
    path: '/mini-split-size-calculator/', name: 'Mini Split Size Calculator', script: '/assets/hvac.js', embedId: 'mini-split',
    title: 'Mini Split Size Calculator: Head Sizes & Multi-Zone Outdoor Unit',
    description: 'Free mini split sizing calculator: BTU and head size for each room, and the outdoor unit size for a single- or multi-zone ductless heat pump system.',
    h1: 'Mini Split Size Calculator', lede: 'Size a ductless mini split room by room: each indoor head\'s BTU, the total load and the multi-zone outdoor unit, for cooling or year-round heat pump heating.',
    answer: '<strong>Size each indoor head for its room</strong> (about 20 BTU per sq ft for cooling, more where heating is the bigger load), using standard 6k, 9k, 12k, 18k and 24k BTU heads. Then pick an outdoor unit at least as big as the total load: a living room (12k) plus two bedrooms (9k each) usually needs a 24,000–30,000 BTU multi-zone unit.',
    card: hvacCard('split', false, { name: 'Living room', l: 20, w: 15 }),
    sections: `<h2>Mini split head size by room area (cooling, average conditions)</h2>${table(['Room', 'Load', 'Head size'], [[150, 'Small bedroom'], [250, 'Bedroom'], [350, 'Large bedroom'], [450, 'Living room'], [550, 'Open living area'], [700, 'Great room']].map(([sq, n]) => { const btu = esRow(sq); return [`${n} (${sq} sq ft)`, `${fmtInt(btu)} BTU`, `${fmtInt(HVAC.heads.find((h) => h >= btu) || 24000)} BTU`]; }))}
<section class="hgt-read"><h2>Multi-zone tips</h2><ul><li>Each room gets its own head; open-plan spaces can share one.</li><li>Most multi-zone outdoor units let connected heads add up to about 130% of the outdoor capacity, because rooms rarely peak at once.</li><li>In cold climates, choose a cold-climate (hyper-heat) model and check its heating capacity at your winter design temperature, not just its rating.</li></ul></section>`,
    faqs: [
      ['What size mini split do I need?', 'Match each indoor head to its room\'s load: roughly 6,000–9,000 BTU for bedrooms, 12,000 for a living room and 18,000–24,000 for large open areas, adjusted for sun, ceilings and climate.'],
      ['How many square feet does a 12,000 BTU mini split cool?', 'About 450–550 sq ft in average conditions, less with lots of sun or high ceilings.'],
      ['Can I put a 12k head on a 24k outdoor unit with two 9k heads?', 'Yes. 12k + 9k + 9k is 30k connected on a 24k outdoor unit, a 125% ratio, which most multi-zone systems allow. Check the manufacturer\'s combination table.'],
      ['Should I size a mini split for heating or cooling?', 'For a heat pump that heats the house, size for whichever load is larger. In cold climates that is usually heating.'],
      ['Is one big mini split better than several small heads?', 'One head can only condition the space it can blow into. Closed rooms need their own heads, or they will stay hot or cold.'],
    ],
    sources: `Room cooling loads use the <a href="${ENERGY_STAR_URL}" rel="nofollow">ENERGY STAR sizing chart</a> and adjustments; heating uses BTU-per-square-foot rules by climate zone. Head and outdoor sizes are common nominal capacities. Combination limits vary by manufacturer; this is a planning estimate, not a Manual J or Manual S selection.`,
  }));
  const slabRows = [[10, 10, 4], [10, 12, 4], [12, 12, 4], [20, 20, 4], [12, 24, 5], [20, 24, 6]].map(([l, w, t]) => { const yd = concreteYd(l, w, t) * 1.1; return [`${l} × ${w} ft × ${t} in`, yd.toFixed(2), fmtInt(Math.ceil(yd * 27 / 0.6)), fmtInt(Math.ceil(yd * 27 / 0.45))]; });
  const cSrc = 'Volumes: slabs and footings length × width × depth; columns π r² h; steps width × run × rise × n(n+1) ÷ 2. Bag yields from premixed concrete labels (80 lb 0.6 cu ft, 60 lb 0.45, 40 lb 0.30). Fresh concrete weighs about 4,050 lb per cu yd. Typical thickness: 4 in for patios and walks, 5–6 in for driveways and heavier loads. Rebar laps of about 18 in; welded wire 5 × 10 ft sheets. Structural work must follow your local code.';
  pages.push(toolPage({
    path: '/concrete-calculator/', name: 'Concrete Calculator', script: '/assets/concrete.js', embedId: 'concrete',
    title: 'Concrete Calculator: Slabs, Footings, Columns & Steps (Bags/Yards)',
    description: 'Free concrete calculator for a whole project: slabs, footings, Sonotube columns and steps in one list, with cubic yards, bags, ready-mix trucks, rebar or mesh and base gravel.',
    h1: 'Concrete Calculator', lede: 'Add every part of the pour (slabs, footings, round columns and steps) and get the total cubic yards, bags or ready-mix trucks, rebar or wire mesh, gravel base and which option is cheaper.',
    answer: '<strong>Cubic yards = length (ft) × width (ft) × thickness (in) ÷ 324</strong>, plus 5–10% extra. A 10 × 10 ft slab 4 in thick is 1.23 cu yd, or about 1.36 cu yd with 10% extra: <strong>62 bags of 80 lb</strong> or 1½ yards of ready-mix. Above roughly 1 cubic yard, ready-mix is usually easier and often cheaper than bags.',
    card: concreteCard(),
    sections: `<h2>Concrete for common slabs (+10%)</h2>${table(['Slab', 'Cubic yards', '80 lb bags', '60 lb bags'], slabRows)}
<h2>How thick should concrete be?</h2>${table(['Use', 'Thickness'], [['Walkways, patios, shed floors', '4 in'], ['Driveways (cars)', '5–6 in'], ['Hot tub pads, RV parking', '6 in'], ['Garage floors', '4–6 in, per local code']])}`,
    faqs: [
      ['How do I calculate how much concrete I need?', 'Multiply length × width × thickness in feet for cubic feet and divide by 27 for cubic yards. With thickness in inches, multiply length × width in feet by the thickness in inches and divide by 324. Add 5–10% for spillage and uneven ground.'],
      ['How many bags of concrete are in a yard?', 'About 45 bags of 80 lb (0.6 cu ft each), 60 bags of 60 lb or 90 bags of 40 lb make one cubic yard.'],
      ['When should I order ready-mix instead of bags?', 'Above about 1 cubic yard, mixing 45+ bags by hand is hard work and ready-mix is often cheaper. Below 2–4 yards, many suppliers add a short-load fee; enter it to compare.'],
      ['How much concrete does a truck hold?', 'Most ready-mix trucks carry up to about 9–11 cubic yards. Bigger pours need several trucks scheduled back to back.'],
      ['Do I need rebar in a concrete slab?', 'Many 4 in patio slabs use welded wire mesh or fiber-reinforced mix; driveways and structural slabs often use #3 or #4 rebar at 12–18 in on center. Follow your local code and engineer for structural work.'],
    ],
    sources: cSrc,
  }));
  pages.push(toolPage({
    path: '/concrete-slab-calculator/', name: 'Concrete Slab Calculator', script: '/assets/concrete.js', embedId: 'concrete',
    title: 'Concrete Slab Calculator: Yards, Bags, Rebar & Gravel Base',
    description: 'Free concrete slab calculator: cubic yards, 80 or 60 lb bags, ready-mix trucks, rebar grid or wire mesh and gravel base for any slab size and thickness.',
    h1: 'Concrete Slab Calculator', lede: 'Everything to order for a concrete slab: concrete in yards or bags, rebar grid or welded wire mesh, chairs, and the compacted gravel base underneath.',
    answer: `A <strong>12 × 12 ft slab 4 in thick</strong> needs ${concreteYd(12, 12, 4).toFixed(2)} cu yd, about <strong>${(concreteYd(12, 12, 4) * 1.1).toFixed(1)} cu yd with 10% extra</strong> (${Math.ceil(concreteYd(12, 12, 4) * 1.1 * 27 / 0.6)} bags of 80 lb). A #3 rebar grid at 18 in needs about ${Math.ceil(((Math.floor(12 / 1.5) + 1) * 12 * 2) * (1 + 1.5 / 20) / 20)} sticks of 20 ft, and a 4 in gravel base about ${(144 * 4 / 12 / 27 * 1.2).toFixed(1)} cu yd.`,
    card: concreteCard(false, 'slab', { a: 12, b: 12 }),
    sections: `<h2>Concrete for common slabs (+10%)</h2>${table(['Slab', 'Cubic yards', '80 lb bags', '60 lb bags'], slabRows)}`,
    faqs: [
      ['How much concrete do I need for a 12 × 12 slab?', `At 4 in thick, ${concreteYd(12, 12, 4).toFixed(2)} cubic yards, or about ${(concreteYd(12, 12, 4) * 1.1).toFixed(1)} with 10% extra: ${Math.ceil(concreteYd(12, 12, 4) * 1.1 * 27 / 0.6)} bags of 80 lb concrete.`],
      ['How much concrete for a 20 × 20 slab?', `At 4 in thick, ${concreteYd(20, 20, 4).toFixed(2)} cubic yards, about ${(concreteYd(20, 20, 4) * 1.1).toFixed(1)} with 10% extra. That is a ready-mix job.`],
      ['How thick should a concrete slab be?', '4 in for patios, walkways and shed floors; 5–6 in for driveways, hot tub pads and anywhere vehicles park.'],
      ['How much gravel goes under a concrete slab?', 'Usually 4 in of compacted crushed stone, more on clay or wet ground. About 1.5 cu yd covers a 100 sq ft slab area at 4 in once compaction is allowed for.'],
      ['How far apart should rebar be in a slab?', 'Commonly 12–18 in on center each way for #3 or #4 bar, set on chairs so it sits in the middle third of the slab.'],
    ],
    sources: cSrc,
  }));
  pages.push(toolPage({
    path: '/concrete-bag-calculator/', name: 'Concrete Bag Calculator', script: '/assets/concrete.js', embedId: 'concrete',
    title: 'Concrete Bag Calculator: How Many 80, 60 or 40 lb Bags?',
    description: 'Free concrete bag calculator: how many 80 lb, 60 lb or 40 lb bags of concrete for a small slab, pad, footing, post holes or steps, with cost.',
    h1: 'Concrete Bag Calculator', lede: 'How many bags of premixed concrete to buy for a small pour (pads, steps, footings or post holes) in 80, 60 and 40 lb sizes.',
    answer: '<strong>Bags = cubic feet ÷ bag yield</strong>: 0.6 cu ft for an 80 lb bag, 0.45 for 60 lb and 0.30 for 40 lb. One cubic yard takes 45 bags of 80 lb. A 4 × 4 ft pad 4 in thick is 5.3 cu ft: <strong>9 bags of 80 lb</strong> or 12 of 60 lb, plus a bag spare.',
    card: concreteCard(false, 'slab', { a: 4, b: 4 }),
    sections: `<h2>Bags per cubic foot and yard</h2>${table(['Bag', 'Yield', 'Bags per cu yd', 'Bags for a 4 × 4 ft pad, 4 in'], CONCRETE.bags.map((b) => [b.name, `${b.yield} cu ft`, String(Math.ceil(27 / b.yield)), String(Math.ceil(16 * 4 / 12 / b.yield))]))}`,
    faqs: [
      ['How many bags of concrete do I need?', 'Work out the volume in cubic feet (length × width × thickness in feet), add 10%, and divide by the bag yield: 0.6 cu ft per 80 lb bag, 0.45 per 60 lb and 0.30 per 40 lb.'],
      ['How many 80 lb bags of concrete make a yard?', 'About 45 bags (27 cu ft ÷ 0.6 cu ft per bag).'],
      ['How many 60 lb bags of concrete make a yard?', 'About 60 bags.'],
      ['How much area does an 80 lb bag of concrete cover?', 'About 1.8 sq ft at 4 in thick, or 3.6 sq ft at 2 in.'],
      ['Should I buy 60 or 80 lb bags?', 'The concrete is the same; 80 lb bags are cheaper per cubic foot but heavier to lift. 60 lb bags are easier to carry and mix.'],
    ],
    sources: cSrc,
  }));
  const cs = COAT.products;
  pages.push(toolPage({
    path: '/deck-stain-calculator/', name: 'Deck Stain Calculator', script: '/assets/coating.js', embedId: 'deck-stain',
    title: 'Deck Stain Calculator: Gallons for Floor, Railings & Stairs',
    description: 'Free deck stain calculator: gallons of semi-transparent or solid stain, sealer or paint for the deck floor, railings and stairs, by surface condition and coats.',
    h1: 'Deck Stain Calculator', lede: 'How much stain or sealer your deck needs, counting the floor, both sides of the railings and the stairs, for rough or smooth wood and one or two coats.',
    answer: `<strong>Gallons = square feet ÷ coverage.</strong> Semi-transparent stain covers about <strong>${cs.semi.rough}–${cs.semi.smooth} sq ft per gallon</strong> (less on rough, weathered wood); solid stain ${cs.solid.rough}–${cs.solid.smooth}. A 16 × 12 ft deck with 40 ft of railing and four steps is about 365 sq ft: about <strong>3–4 gallons</strong> for two coats of semi-transparent stain on weathered wood.`,
    card: coatCard('deck'),
    sections: `<h2>Stain coverage per gallon</h2>${table(['Product', 'Rough or weathered', 'Smooth', 'Second coat'], Object.values(cs).map((p) => [p.name, `${p.rough} sq ft`, `${p.smooth} sq ft`, p.second < 1 ? `~${Math.round(p.second * 100)}% (wet-on-wet)` : 'Same as first']))}
<section class="hgt-read"><h2>Stain like a pro</h2><ul><li>Clean and brighten, then let the wood dry for 24–48 hours.</li><li>Do a water test: if drops soak in, the wood is ready for stain.</li><li>Stain two or three boards at a time along their full length to avoid lap marks.</li></ul></section>`,
    faqs: [
      ['How much stain do I need for my deck?', 'Measure the floor (length × width), add both sides of the railings (length × height) and the stairs, then divide by the stain\'s coverage: about 150–250 sq ft per gallon for semi-transparent on weathered wood. Multiply for the number of coats.'],
      ['How many gallons of stain for a 12 × 12 deck?', 'The floor alone is about 160 sq ft with board edges, so roughly 1–1.5 gallons per coat of semi-transparent stain on weathered wood, more with railings and stairs.'],
      ['How many coats of deck stain do I need?', 'Most semi-transparent stains go on in one or two thin coats, the second applied wet-on-wet; solid stains usually need two full coats. Follow the label.'],
      ['Why does rough wood use more stain?', 'Rough-sawn and weathered wood is porous and soaks up more stain, so a gallon covers less area than on smooth or previously stained wood.'],
      ['Should I stain the deck railings too?', 'Yes, usually with the same stain. Railings with balusters have a lot of surface: count about their length × height for both sides.'],
    ],
    sources: 'Coverage ranges reflect typical manufacturer label figures for each product type; your can\'s label takes priority. Board edges add 10% to the floor; railings count length × height for both sides of rails and balusters; stairs about 2 sq ft per foot of width per step. Penetrating stains\' second coat is estimated at half the first.',
  }));
  pages.push(toolPage({
    path: '/fence-stain-calculator/', name: 'Fence Stain Calculator', script: '/assets/coating.js', embedId: 'fence-stain',
    title: 'Fence Stain Calculator: Gallons for One or Both Sides',
    description: 'Free fence stain calculator: gallons of stain or paint for privacy, shadowbox, picket or ranch fences, one or both sides, by surface and coats, with cost.',
    h1: 'Fence Stain Calculator', lede: 'How much stain a fence takes, for one side or both, by fence style (solid privacy, shadowbox, picket or split rail), rough or smooth wood, and coats.',
    answer: `<strong>Fence area = length × height × sides</strong>, plus about 15% on a privacy fence for posts and rails. A 150 ft privacy fence 6 ft high, stained on both sides, is about 2,070 sq ft: roughly <strong>${Math.ceil(2070 / cs.semi.rough)} gallons</strong> for one coat of semi-transparent stain on rough wood.`,
    card: coatCard('fence'),
    sections: `<h2>Stain for common fences (6 ft, both sides, semi-transparent, rough wood)</h2>${table(['Fence length', 'Area', 'One coat', 'Two coats'], [50, 100, 150, 200, 300].map((L) => { const a = L * 6 * 2 * 1.15, g = a / cs.semi.rough; return [`${L} ft`, `${fmtInt(a)} sq ft`, `${Math.ceil(g)} gal`, `${Math.ceil(g * 1.5)} gal`]; }))}`,
    faqs: [
      ['How much stain do I need for my fence?', 'Multiply length × height × the number of sides you are staining, add about 15% for posts and rails on a privacy fence, and divide by the coverage: about 150 sq ft per gallon for semi-transparent stain on rough new wood.'],
      ['How many gallons of stain for a 100 ft fence?', 'A 6 ft privacy fence 100 ft long, both sides, is about 1,380 sq ft, roughly 9–10 gallons for one coat on rough wood, or 5–6 gallons on smooth wood.'],
      ['Should I spray or brush fence stain?', 'Spraying is fastest; back-brushing right after spraying works the stain into the wood and evens it out. Protect plants and neighbors from overspray.'],
      ['How long should a new fence dry before staining?', 'Pressure-treated wood is often wet from the plant and may need weeks to dry; do a water test. Cedar can usually be stained sooner.'],
      ['Does a picket fence use less stain?', 'Yes, the gaps mean less surface per foot. Count about 75% of the length × height for a spaced picket fence, but both faces and edges still take stain.'],
    ],
    sources: 'Coverage ranges reflect typical manufacturer label figures; style factors: privacy 1.15 (posts and rails), shadowbox 1.4 (overlapping boards), spaced picket 0.75, split rail 0.35. Your stain\'s label takes priority.',
  }));
  pages.push(toolPage({
    path: '/exterior-paint-calculator/', name: 'Exterior Paint Calculator', script: '/assets/coating.js', embedId: 'exterior-paint',
    title: 'Exterior Paint Calculator: Gallons to Paint a House',
    description: 'Free exterior paint calculator: gallons of siding and trim paint for a house from its size, wall height and gables, minus doors, windows and garage doors.',
    h1: 'Exterior Paint Calculator', lede: 'How much paint the outside of your house needs: walls and gable ends, minus doors, windows and garage doors, for smooth or rough siding, plus trim.',
    answer: `<strong>Wall area = perimeter × wall height + gable triangles − openings.</strong> Exterior paint covers about <strong>${cs.paint.smooth} sq ft per gallon</strong> on smooth siding and ${cs.paint.rough} on rough siding or stucco. A 50 × 30 ft house with 18 ft walls and two gables has about 2,800 sq ft of siding after openings: roughly <strong>${Math.ceil(2786 / cs.paint.rough * 2)} gallons</strong> for two coats on rough siding.`,
    card: coatCard('house'),
    sections: `<h2>Paint for common house sizes (two coats, smooth siding)</h2>${table(['House footprint', 'Wall height', 'Siding area', 'Gallons'], [[40, 30, 9], [50, 30, 9], [50, 30, 18], [60, 40, 18]].map(([l, w, h]) => { const a = 2 * (l + w) * h + w * 8 - 2 * 21 - 12 * 15 - 112; return [`${l} × ${w} ft`, `${h} ft`, `${fmtInt(a)} sq ft`, String(Math.ceil(a / cs.paint.smooth * 2))]; }))}`,
    faqs: [
      ['How much paint do I need for the exterior of my house?', 'Add the house\'s perimeter, multiply by the wall height, add the gable triangles (width × height ÷ 2 each), subtract doors and windows, and divide by about 350 sq ft per gallon (250 on rough siding). Double it for two coats.'],
      ['How many gallons to paint a 2,000 sq ft house?', 'A two-story house with about 2,000 sq ft of living space often has 2,500–3,500 sq ft of siding, so 8–10 gallons per coat on smooth siding, 10–14 on rough siding.'],
      ['How much trim paint do I need?', 'Plan on about 10% of the body paint for trim, fascia and doors, or a gallon or two for a typical house.'],
      ['Does stucco need more paint?', 'Yes. Rough, porous stucco can take 30–50% more paint than smooth siding, especially on the first coat.'],
      ['Should I buy 5 gallon buckets?', '5 gallon pails cost less per gallon and keep the color consistent across walls. The calculator suggests pails plus single gallons.'],
    ],
    sources: 'Coverage reflects typical exterior paint label figures (about 350–400 sq ft per gallon on smooth surfaces, less on rough). Openings use typical sizes: doors 21 sq ft, windows 15 sq ft, double garage doors 112 sq ft. Trim estimated at 10% of body paint.',
  }));
  return pages;
}

// ---------- batch 5: roofing, topsoil & sand, joist and rafter spans, lawn fertilizer ----------
const B5_UPDATED = '2026-11-08';
const ARMA_URL = 'https://www.asphaltroofing.org/';
const NDS_URL = 'https://awc.org/publications/2018-nds/';
const AWC_SPANS_URL = 'https://awc.org/publications/span-tables-for-joists-and-rafters/';
const IRC_FLOOR_URL = 'https://codes.iccsafe.org/content/IRC2021P2/chapter-5-floors';
const IRC_ROOF_URL = 'https://codes.iccsafe.org/content/IRC2021P2/chapter-8-roof-ceiling-construction';
const PURDUE_TURF_URL = 'https://turf.purdue.edu/';
const NCSU_TURF_URL = 'https://www.turffiles.ncsu.edu/';
const ROOF = {
  walk: [[4, 'Walkable', 'Low slope; easy to walk on'], [7, 'Walkable with care', 'Typical pitch; soft-soled shoes'], [9, 'Steep', 'Roof jacks and a harness advised'], [99, 'Very steep', 'Needs professional staging']],
  minPitch: [[0.25, 99, 'standing-seam metal (from about ¼/12)'], [2, 4, 'asphalt shingles with double underlayment or full ice-and-water shield'], [3, 99, 'exposed-fastener metal panels (typically 3/12 and up)'], [4, 99, 'asphalt shingles with standard underlayment'], [4, 99, 'clay or concrete tile, slate and wood shakes (about 4/12 and up; check the maker)']],
  waste: { gable: 0.1, hip: 0.15, shed: 0.05 },
  materials: { arch: { name: 'Architectural shingles', bundles: 3 }, '3tab': { name: '3-tab shingles', bundles: 3 }, heavy: { name: 'Designer / luxury shingles', bundles: 4 }, metal: { name: 'Metal panels' } },
  planes: [{ a: 40, b: 40, s: 17 }, { a: 40, b: 40, s: 17 }],
  starterLf: 105, ridgeLf: 25, nailsPerSq: { 4: 320, 6: 480 }, nailsPerLb: 140, underRoll: 1000, underLap: 0.1, iceLf: 65, dripLf: 9.5, panelIn: 36, screwsPerSq: 80,
};
const FILL_SOIL = {
  defaultL: 20, defaultW: 10, extra: 15, pickupLb: 1500, pYd: 35, pDel: 75, pBag: 4,
  uses: {
    top: { name: 'Top dressing a lawn (½ in)', depth: 0.5, tip: 'Spread no more than ¼–½ in at a time and rake it into the grass so the blades stay visible; repeat after the lawn grows through.' },
    level: { name: 'Filling low spots (1 in)', depth: 1, tip: 'For dips deeper than about 1 in, fill in stages a few weeks apart, or lift the sod, fill underneath and lay it back.' },
    lawn: { name: 'New lawn or sod (4 in)', depth: 4, tip: 'Sod and seed root best in 4–6 in of loose topsoil. Till it into the top few inches of native soil so water and roots move through both layers.' },
    lawn6: { name: 'New lawn on poor soil (6 in)', depth: 6 },
    bed: { name: 'Flower or shrub bed (8 in)', depth: 8 },
    veg: { name: 'In-ground vegetable garden (12 in)', depth: 12, tip: 'For raised beds, use the raised bed soil calculator; it adds compost and settling for each bed.' },
    custom: { name: 'Custom depth' },
  },
  materials: {
    topsoil: { short: 'topsoil', name: 'Screened topsoil', tpy: 1.1, note: 'dry, screened' },
    blend: { short: 'topsoil blend', name: 'Topsoil and compost blend', tpy: 0.95, note: 'typical blend' },
    garden: { short: 'garden soil', name: 'Garden soil mix', tpy: 0.8, note: 'with organic matter' },
    fill: { short: 'fill dirt', name: 'Fill dirt (unscreened)', tpy: 1.2, note: 'dry fill' },
    compost: { short: 'compost', name: 'Compost', tpy: 0.5, note: 'finished compost' },
  },
  bags: [[0.75, '0.75 cu ft bags (about 40 lb of topsoil)'], [1, '1 cu ft bags'], [1.5, '1.5 cu ft bags'], [2, '2 cu ft bags']],
};
const FILL_SAND = {
  defaultL: 8, defaultW: 8, extra: 0, pickupLb: 1500, pYd: 45, pDel: 75, pBag: 6,
  uses: {
    sandbox: { name: 'Sandbox (12 in)', depth: 12, tip: 'Use washed play sand sold for sandboxes. A layer of landscape fabric underneath keeps soil out and still drains.' },
    pool: { name: 'Above-ground pool base (2 in)', depth: 2, tip: 'Make the sand pad about 1 ft wider than the pool on every side (add 2 ft to the diameter), and level the ground first; sand only smooths it.' },
    paver: { name: 'Paver bedding layer (1 in)', depth: 1, tip: 'Screed bedding sand to 1 in over a compacted base. A thicker sand bed lets pavers settle unevenly.' },
    lawn: { name: 'Leveling a lawn (¼ in)', depth: 0.25, tip: 'Sand levels warm-season lawns and golf greens; on clay soil, a topsoil or compost mix is usually a better top dressing.' },
    pipe: { name: 'Pipe or trench bedding (6 in)', depth: 6 },
    arena: { name: 'Horse arena footing (3 in)', depth: 3, tip: 'Arena footing is usually 2–4 in of washed sand over a firm, compacted base.' },
    custom: { name: 'Custom depth' },
  },
  materials: {
    play: { short: 'play sand', name: 'Play sand (washed)', tpy: 1.35, note: 'dry' },
    mason: { short: 'mason sand', name: 'Mason / all-purpose sand', tpy: 1.35, note: 'dry' },
    concrete: { short: 'concrete sand', name: 'Concrete sand (coarse)', tpy: 1.4, note: 'dry' },
    fill: { short: 'fill sand', name: 'Fill sand', tpy: 1.4, note: 'dry' },
    damp: { short: 'damp sand', name: 'Damp sand (as delivered)', tpy: 1.6, note: 'moist' },
  },
  bags: [[0.5, '50 lb bags (about 0.5 cu ft)']],
};
const POLY = {
  defaultL: 12, defaultW: 12, density: 100, waste: 0.1, wideJoint: 0.5,
  pavers: {
    brick: { name: '4 × 8 in (brick / holland)', l: 8, w: 4 }, '6x6': { name: '6 × 6 in', l: 6, w: 6 }, '6x9': { name: '6 × 9 in', l: 9, w: 6 }, '6x12': { name: '6 × 12 in', l: 12, w: 6 },
    '12x12': { name: '12 × 12 in', l: 12, w: 12 }, '16x16': { name: '16 × 16 in', l: 16, w: 16 }, '12x24': { name: '12 × 24 in', l: 24, w: 12 }, '24x24': { name: '24 × 24 in', l: 24, w: 24 },
    flag: { name: 'Flagstone, about 18 × 18 in', l: 18, w: 18 },
  },
  joints: [[0.0625, '1/16 in'], [0.125, '1/8 in'], [0.1875, '3/16 in'], [0.25, '1/4 in'], [0.375, '3/8 in'], [0.5, '1/2 in'], [0.75, '3/4 in'], [1, '1 in']],
};
const SPAN = {
  species: {
    syp: { name: 'Southern pine No. 2', fb: { '2x4': 1100, '2x6': 1000, '2x8': 925, '2x10': 800, '2x12': 750 }, fv: 175, e: 1400000 },
    dfl: { name: 'Douglas fir-larch No. 2', fb: 900, fv: 180, e: 1600000 },
    hf: { name: 'Hem-fir No. 2', fb: 850, fv: 150, e: 1300000 },
    spf: { name: 'Spruce-pine-fir No. 2', fb: 875, fv: 135, e: 1400000 },
    wc: { name: 'Western cedars No. 2', fb: 700, fv: 155, e: 1000000 },
  },
  depth: { '2x4': 3.5, '2x6': 5.5, '2x8': 7.25, '2x10': 9.25, '2x12': 11.25 },
  cf: { '2x4': 1.5, '2x6': 1.3, '2x8': 1.2, '2x10': 1.1, '2x12': 1.0 },
  cr: 1.15, wetFbLimit: 1150, wet: { fb: 0.85, e: 0.9, fv: 0.97 }, incised: { fb: 0.8, e: 0.95, fv: 0.8 },
  sizes: { deck: ['2x6', '2x8', '2x10', '2x12'], floor: ['2x6', '2x8', '2x10', '2x12'], rafter: ['2x4', '2x6', '2x8', '2x10', '2x12'] },
  spacings: [12, 16, 24], deckDead: 10, deckCap: 18,
  uses: { living: { name: 'Living areas (40 psf live)', live: 40, dead: 10 }, sleeping: { name: 'Bedrooms only (30 psf live)', live: 30, dead: 10 }, heavy: { name: 'Living areas with tile or stone (40 + 20 psf dead)', live: 40, dead: 20 } },
  roofLoads: { live20: { name: '20 psf roof live load (no snow)', live: 20, cd: 1.25 }, snow30: { name: '30 psf ground snow', live: 30, cd: 1.15 }, snow50: { name: '50 psf ground snow', live: 50, cd: 1.15 }, snow70: { name: '70 psf ground snow', live: 70, cd: 1.15 } },
};
const FERT = {
  grasses: {
    kbg: { name: 'Kentucky bluegrass', lo: 2, hi: 4, season: 'cool' }, tf: { name: 'Tall fescue', lo: 2, hi: 4, season: 'cool' }, prg: { name: 'Perennial ryegrass', lo: 2, hi: 4, season: 'cool' }, ff: { name: 'Fine fescue', lo: 1, hi: 2, season: 'cool' },
    berm: { name: 'Bermudagrass', lo: 2, hi: 5, season: 'warm' }, zoy: { name: 'Zoysiagrass', lo: 1, hi: 3, season: 'warm' }, sta: { name: 'St. Augustinegrass', lo: 2, hi: 4, season: 'warm' }, cent: { name: 'Centipedegrass', lo: 1, hi: 2, season: 'warm' }, buf: { name: 'Buffalograss', lo: 1, hi: 2, season: 'warm' },
  },
  timing: {
    cool: 'put most of the year\'s nitrogen down in early fall (September) and late fall (October–November), with a light feeding in late spring if needed. Skip midsummer.',
    warm: 'start after the lawn fully greens up in late spring, then feed every 6–8 weeks through summer. Stop about 6–8 weeks before your first fall frost.',
  },
  maxQuickN: 1,
  products: [['24-0-6', '24-0-6 (typical lawn food)'], ['32-0-4', '32-0-4'], ['29-0-4', '29-0-4'], ['16-4-8', '16-4-8'], ['10-10-10', '10-10-10 (balanced)'], ['15-0-15', '15-0-15'], ['46-0-0', '46-0-0 (urea)'], ['21-0-0', '21-0-0 (ammonium sulfate)'], ['5-3-2', '5-3-2 (organic)'], ['28-0-0', '28-0-0 (liquid UAN)']],
};
const BATCH5_TOOLS = [
  ['📐', 'Roof Pitch Calculator', '/roof-pitch-calculator/', 'Pitch, angle, slope factor, rafter length and ridge height from rise and run, width or degrees.'],
  ['🏚️', 'Roofing Calculator', '/roofing-calculator/', 'Squares, shingle bundles, underlayment, starter, ridge cap and drip edge from the house size and pitch.'],
  ['🟫', 'Topsoil Calculator', '/topsoil-calculator/', 'Cubic yards, tons, bags and truckloads of topsoil for lawns, beds and gardens.'],
  ['🪵', 'Deck Joist Span Calculator', '/deck-joist-span-calculator/', 'Maximum joist span by species, size and spacing (DCA 6 method), with a span check.'],
  ['🌱', 'Fertilizer Calculator', '/fertilizer-calculator/', 'Pounds or ounces of any N-P-K fertilizer per 1,000 sq ft and for your whole lawn.'],
];
const BATCH5_VARIANTS = [
  ['🧮', 'Shingle Calculator', '/shingle-calculator/', 'Bundles of shingles from measured roof planes, plus starter and ridge cap.'],
  ['⏳', 'Sand Calculator', '/sand-calculator/', 'Cubic yards, tons and 50 lb bags of play, mason, concrete or fill sand.'],
  ['🧱', 'Polymeric Sand Calculator', '/polymeric-sand-calculator/', 'Bags of polymeric sand from paver size, joint width and depth.'],
  ['📏', 'Floor Joist Span Calculator', '/floor-joist-span-calculator/', 'Floor joist span chart and checker for 30 and 40 psf floors.'],
  ['🏠', 'Rafter Span Calculator', '/rafter-span-calculator/', 'Maximum rafter span for roof live load or snow, with or without a ceiling.'],
];

// The same span checks as span.js (bending, live-load deflection, shear), so the page tables match the calculator.
function spanInches(sp, size, oc, o) {
  const s = SPAN.species[sp], b = 1.5, d = SPAN.depth[size], S = b * d * d / 6, I = b * d ** 3 / 12, A = b * d;
  const fb = typeof s.fb === 'object' ? s.fb[size] : s.fb * SPAN.cf[size];
  const inc = o.incised ? SPAN.incised : { fb: 1, e: 1, fv: 1 };
  const fbp = fb * (o.cd || 1) * SPAN.cr * (o.wet && fb > SPAN.wetFbLimit ? SPAN.wet.fb : 1) * inc.fb;
  const ep = s.e * (o.wet ? SPAN.wet.e : 1) * inc.e, fvp = s.fv * (o.cd || 1) * (o.wet ? SPAN.wet.fv : 1) * inc.fv;
  const w = (o.live + o.dead) * oc / 144, wl = o.live * oc / 144;
  const L = Math.min(Math.sqrt(8 * fbp * S / w), Math.cbrt(384 * ep * I / (5 * o.defl * wl)), 4 / 3 * fvp * A / w, o.cap ? o.cap * 12 : Infinity);
  return Math.round(L);
}
const ftInS = (inch) => `${Math.floor(inch / 12)}′${inch % 12}″`;
const DECK_LOAD = (sp) => ({ live: 40, dead: SPAN.deckDead, defl: 360, wet: true, incised: sp !== 'syp' && sp !== 'wc', cap: SPAN.deckCap });
const FLOOR_LOAD = (live = 40, dead = 10, defl = 360) => ({ live, dead, defl });
const RAFTER_LOAD = (key, dead = 10, defl = 240) => ({ live: SPAN.roofLoads[key].live, dead, defl, cd: SPAN.roofLoads[key].cd });
const roofSF = (p) => Math.sqrt(1 + p * p / 144);
const gableSquares = (L, W, p, oh = 1, waste = 0.1) => (L + 2 * oh) * (W + 2 * oh) * roofSF(p) * (1 + waste) / 100;
const polyCover = (l, w, j, d = 2.25, bag = 50) => { const cell = (l + j) * (w + j); return bag / ((cell - l * w) / cell * 144 * d / 1728 * POLY.density); };

const pitchCard = (embed = false) => calcShell('data-hgt-roof="pitch"', ROOF, `<div class="hgt-calc__grid">
${field('I know the', selectIn('mode', [['rr', 'Rise and run (inches)'], ['rs', 'Ridge height and building width'], ['ang', 'Roof angle in degrees'], ['p', 'Pitch (x in 12)']], 'rr'))}
<label class="hgt-calc__field" data-show="rr"><span>Rise (in)</span>${numIn('rise', 6)}</label>
<label class="hgt-calc__field" data-show="rr"><span>Run (in)</span>${numIn('run', 12)}</label>
<label class="hgt-calc__field" data-show="rs" hidden><span>Ridge height above the walls (ft)</span>${numIn('riseft', 6)}</label>
<label class="hgt-calc__field" data-show="ang" hidden><span>Roof angle (degrees)</span>${numIn('deg', 26.57)}</label>
<label class="hgt-calc__field" data-show="p" hidden><span>Pitch</span>${selectIn('px', Array.from({ length: 24 }, (_, i) => [i + 1, `${i + 1}/12`]), 6)}</label>
${field('Building width, wall to wall (ft)', numIn('width', 24))}
${field('Eave overhang, measured level (in)', numIn('oh', 12, '1'))}
</div>`, embed);
const roofCard = (embed = false) => calcShell('data-hgt-roof="roof"', ROOF, `<div class="hgt-calc__grid">
${field('House length (ft)', numIn('len', 40, '0.5'))}
${field('House width (ft)', numIn('wid', 30, '0.5'))}
${field('Eave overhang (in)', numIn('oh', 12, '1'))}
${field('Roof style', selectIn('style', [['gable', 'Gable (two slopes)'], ['hip', 'Hip (four slopes)'], ['shed', 'Shed (one slope)']], 'gable'))}
${field('Pitch', selectIn('pitch', Array.from({ length: 18 }, (_, i) => [i + 1, `${i + 1}/12`]), 6))}
${field('Roofing', selectIn('mat', Object.entries(ROOF.materials).map(([k, v]) => [k, v.name]), 'arch'))}
${field('Waste', selectIn('waste', [['auto', 'Auto (gable 10%, hip 15%, shed 5%)'], [5, '5%'], [10, '10%'], [15, '15%'], [20, '20%']], 'auto'))}
${field('Ice and water shield at eaves', selectIn('ice', [[0, 'None'], [1, '1 row (3 ft)'], [2, '2 rows (6 ft, cold climates)']], 1))}
${field('Nails per shingle', selectIn('nails', [[4, '4 (standard)'], [6, '6 (high wind)']], 4))}
</div>
${priceGrid('Prices (edit to match your supplier)', [['pBundle', 'Shingle bundle', 38], ['pStarter', 'Starter bundle', 55], ['pRidge', 'Ridge cap bundle', 65], ['pUnder', 'Underlayment roll', 110], ['pIce', 'Ice and water roll', 120], ['pDrip', 'Drip edge, 10 ft', 12], ['pMetal', 'Metal panel per sq ft', 4]])}`, embed);
const shingleCard = (embed = false) => calcShell('data-hgt-roof="shingle"', ROOF, `<fieldset class="hgt-calc__set"><legend>Roof planes (measured on the roof)</legend>
<p class="hgt-calc__hint">Rectangle: top edge = eave length. Hip end (triangle): top edge 0. Hip side (trapezoid): top edge = ridge length. Slope length runs from eave to ridge.</p><div data-rows></div>
<button type="button" class="hgt-btn hgt-btn--ghost hgt-calc__add" data-add>+ Add a roof plane</button></fieldset>
<div class="hgt-calc__grid">
${field('Shingles', selectIn('mat', Object.entries(ROOF.materials).filter(([k]) => k !== 'metal').map(([k, v]) => [k, `${v.name} (${v.bundles} bundles per square)`]), 'arch'))}
${field('Waste', selectIn('waste', [[5, '5% (simple gable)'], [10, '10% (typical)'], [15, '15% (hips, valleys, dormers)'], [20, '20% (complex roof)']], 10))}
${field('Eaves + rakes for starter (ft, optional)', numIn('starter', '', '1'))}
${field('Ridges + hips for ridge cap (ft, optional)', numIn('ridge', '', '1'))}
</div>
${priceGrid('Prices (optional)', [['pBundle', 'Shingle bundle', 38], ['pStarter', 'Starter bundle', 55], ['pRidge', 'Ridge cap bundle', 65]])}`, embed);
const fillRows = (legend) => `<fieldset class="hgt-calc__set"><legend>${legend}</legend><div data-rows></div>
<button type="button" class="hgt-btn hgt-btn--ghost hgt-calc__add" data-add>+ Add another area</button></fieldset>`;
const bulkCard = (kind, cfg, first, embed = false) => calcShell(`data-hgt-fill="${kind}"`, cfg, `${fillRows('Areas to cover')}
<div class="hgt-calc__grid">
${field('Project', selectIn('use', Object.entries(cfg.uses).map(([k, v]) => [k, v.name]), first))}
${field('Depth (in)', numIn('depth', cfg.uses[first].depth))}
${field('Material', selectIn('mat', Object.entries(cfg.materials).map(([k, v]) => [k, `${v.name} · ${v.tpy} t/yd`]), Object.keys(cfg.materials)[0]))}
${field('Extra for settling', selectIn('extra', [[0, 'None'], [10, '10%'], [15, '15%'], [20, '20%'], [25, '25%']], cfg.extra))}
${field('Bag size', selectIn('bag', [...cfg.bags, [0, 'Bulk only']], cfg.bags[0][0]))}
</div>
${priceGrid('Prices (edit to match your supplier)', [['pYd', 'Bulk per cu yd', cfg.pYd], ['pDel', 'Delivery fee', cfg.pDel], ['pBag', 'Per bag', cfg.pBag]])}`, embed);
const topsoilCard = (embed = false) => bulkCard('topsoil', FILL_SOIL, 'lawn', embed);
const sandCard = (embed = false) => bulkCard('sand', FILL_SAND, 'sandbox', embed);
const polyCard = (embed = false) => calcShell('data-hgt-fill="poly"', POLY, `${fillRows('Patio or walkway area')}
<div class="hgt-calc__grid">
${field('Paver size', selectIn('pv', [...Object.entries(POLY.pavers).map(([k, v]) => [k, v.name]), ['custom', 'Custom size…']], 'brick'))}
${field('Paver length (in)', numIn('pl', 8))}
${field('Paver width (in)', numIn('pw', 4))}
${field('Joint width', selectIn('joint', POLY.joints, 0.125))}
${field('Joint depth to fill (in)', numIn('jd', 2.25))}
${field('Bag size', selectIn('bag', [[40, '40 lb'], [50, '50 lb'], [55, '55 lb']], 50))}
</div>
${priceGrid('Price (optional)', [['pBag', 'Per bag', 32]])}`, embed);
const spanCard = (kind, embed = false) => {
  const cfg = { ...SPAN };
  const span = `<label class="hgt-calc__field"><span>Your span to check (optional)</span><span class="hgt-calc__pair">${numIn('ft', '', '1', ' placeholder="ft" aria-label="Span, feet"')}${numIn('in', '', '1', ' placeholder="in" max="11" aria-label="Span, inches"')}</span></label>`;
  const common = `${field('Wood species and grade', selectIn('species', Object.entries(SPAN.species).map(([k, v]) => [k, v.name]), kind === 'deck' ? 'syp' : 'dfl'))}
${field(kind === 'rafter' ? 'Rafter size' : 'Joist size', selectIn('size', SPAN.sizes[kind].map((z) => [z, z.replace('x', '×')]), '2x8'))}
${field('Spacing', selectIn('oc', [[12, '12 in on center'], [16, '16 in on center'], [19.2, '19.2 in on center'], [24, '24 in on center']], 16))}`;
  let extra = '';
  if (kind === 'deck') extra = `${field('Live load', selectIn('live', [[40, '40 psf (code minimum for decks)'], [50, '50 psf'], [60, '60 psf']], 40))}<label class="hgt-calc__check"><input type="checkbox" name="incised"> Incised lumber (small slits; usual on treated Douglas fir, hem-fir and SPF)</label>`;
  if (kind === 'floor') extra = `${field('Floor use', selectIn('use', Object.entries(SPAN.uses).map(([k, v]) => [k, v.name]), 'living'))}${field('Stiffness', selectIn('defl', [[360, 'L/360 (code minimum)'], [480, 'L/480 (stiffer, for tile or stone)']], 360))}`;
  if (kind === 'rafter') extra = `${field('Roof load', selectIn('roof', Object.entries(SPAN.roofLoads).map(([k, v]) => [k, v.name]), 'snow30'))}${field('Dead load', selectIn('dead', [[10, '10 psf (asphalt shingles)'], [15, '15 psf (heavier roofing)'], [20, '20 psf (tile or slate)']], 10))}${field('Ceiling', selectIn('defl', [[240, 'Ceiling attached (L/240)'], [180, 'No ceiling (L/180)']], 240))}`;
  return calcShell(`data-hgt-span="${kind}"`, cfg, `<div class="hgt-calc__grid">${common}${extra}${span}</div>`, embed);
};
const fertCard = (embed = false) => calcShell('data-hgt-fert', FERT, `<div class="hgt-calc__grid">
${field('Lawn area (sq ft)', numIn('area', 5000, '1'))}
${field('Grass type', selectIn('grass', Object.entries(FERT.grasses).map(([k, v]) => [k, v.name]), 'tf'))}
${field('Common products', selectIn('npk', [['', 'Pick one, or type N-P-K below'], ...FERT.products], ''))}
<label class="hgt-calc__field"><span>N-P-K on the bag (%)</span><span class="hgt-calc__pair">${numIn('n', 24, 'any', ' aria-label="Nitrogen percent"')}${numIn('p', 0, 'any', ' aria-label="Phosphate percent"')}${numIn('k', 6, 'any', ' aria-label="Potash percent"')}</span></label>
${field('Feed by', selectIn('by', [['n', 'Nitrogen (N)'], ['p', 'Phosphate (P₂O₅), from a soil test'], ['k', 'Potash (K₂O), from a soil test']], 'n'))}
${field('Rate (lb of that nutrient per 1,000 sq ft)', selectIn('rate', [[0.25, '0.25'], [0.5, '0.5'], [0.75, '0.75'], [1, '1 (typical)'], [1.5, '1.5 (slow-release only)']], 1))}
${field('Form', selectIn('form', [['gran', 'Granular'], ['liquid', 'Liquid']], 'gran'))}
<label class="hgt-calc__field" data-show="gran"><span>Bag size (lb)</span>${numIn('bag', 50)}</label>
<label class="hgt-calc__field" data-show="liquid" hidden><span>Liquid weight (lb per gallon)</span>${numIn('dens', 10)}</label>
</div>
${priceGrid('Prices (optional)', [['pBag', 'Per bag', 35], ['pGal', 'Per gallon (liquid)', 25]])}`, embed);

function batch5Pages() {
  const pages = [];
  const u = B5_UPDATED;
  // ---- roof pitch ----
  const pitchRows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18].map((p) => [`${p}/12`, `${(Math.atan(p / 12) * 180 / Math.PI).toFixed(2)}°`, `${(p / 12 * 100).toFixed(1)}%`, roofSF(p).toFixed(3), fmtInt(1000 * roofSF(p))]);
  pages.push(toolPage({
    path: '/roof-pitch-calculator/', name: 'Roof Pitch Calculator', script: '/assets/roof.js', embedId: 'roof-pitch', updated: u,
    title: 'Roof Pitch Calculator: Pitch, Angle, Rafter Length & Chart',
    description: 'Free roof pitch calculator: pitch (x/12), angle, slope factor, rafter length and ridge height from rise and run, building width or degrees, plus a pitch chart.',
    h1: 'Roof Pitch Calculator', lede: 'Enter the rise and run, the ridge height and building width, or the angle, and get the pitch, degrees, slope factor, rafter length, ridge height and which roofing materials suit it.',
    answer: '<strong>Roof pitch = rise ÷ run × 12</strong>, written as inches of rise per 12 in of run. A roof that rises 6 in over 12 in is a <strong>6/12 pitch = 26.57°</strong>. Common pitches: 4/12 = 18.43°, 8/12 = 33.69°, 12/12 = 45°. Roof area = footprint × the slope factor √(1 + (pitch/12)²), which is 1.118 for 6/12.',
    card: pitchCard(),
    sections: `<h2>Roof pitch chart</h2>${table(['Pitch', 'Angle', 'Grade', 'Slope factor', 'Roof sq ft per 1,000 sq ft of footprint'], pitchRows)}
<section class="hgt-read"><h2>How to measure roof pitch</h2><ul><li><strong>From the roof:</strong> hold a level horizontally against the roof, mark 12 in along it and measure straight down to the roof surface. That measurement is the pitch.</li><li><strong>From the attic:</strong> do the same against the underside of a rafter.</li><li><strong>From the ground:</strong> measure the ridge height above the top of the walls and the building width, then pick "Ridge height and building width" above.</li><li><strong>From a photo:</strong> measure the roof angle with a protractor app and enter the degrees.</li></ul></section>`,
    faqs: [
      ['How do you calculate roof pitch?', 'Measure how many inches the roof rises over 12 inches of horizontal run. Pitch = rise ÷ run × 12. A rise of 8 in over 24 in of run is 8 ÷ 24 × 12 = 4/12.'],
      ['What is a 6/12 roof pitch in degrees?', '26.57°. The angle is arctan(6 ÷ 12). A 4/12 pitch is 18.43° and a 12/12 pitch is 45°.'],
      ['What is the most common roof pitch?', 'Most houses fall between 4/12 and 9/12, with 6/12 one of the most common. Below 4/12 is considered low slope for shingles; above 9/12 is steep.'],
      ['What is the minimum pitch for shingles?', 'Asphalt shingle makers allow 2/12 with special underlayment (two layers or full ice-and-water shield); standard installation starts at 4/12. Flatter roofs need a membrane.'],
      ['How do I convert pitch to a slope factor?', 'Slope factor = √(1 + (pitch ÷ 12)²). Multiply the roof\'s footprint by it to get the roof area: 1.054 for 4/12, 1.118 for 6/12, 1.202 for 8/12 and 1.414 for 12/12.'],
    ],
    sources: `Pitch, angle and slope factor are standard trigonometry; hip and valley rafters run 16.97 in per foot of common run. Minimum slopes follow typical manufacturer requirements summarized by the <a href="${ARMA_URL}" rel="nofollow">Asphalt Roofing Manufacturers Association</a>; always follow the installation instructions for your product.`,
  }));
  // ---- roofing ----
  const rq = (L, W, p) => gableSquares(L, W, p);
  const ans = rq(40, 30, 6);
  pages.push(toolPage({
    path: '/roofing-calculator/', name: 'Roofing Calculator', script: '/assets/roof.js', embedId: 'roofing', updated: u,
    title: 'Roofing Calculator: Squares, Shingle Bundles & Materials List',
    description: 'Free roofing calculator: roof area and squares from house size, pitch and style, with shingle bundles, underlayment, starter, ridge cap, drip edge and cost.',
    h1: 'Roofing Calculator', lede: 'Get the roof area and a full materials list from the house\'s length, width, overhang, pitch and roof style: squares, bundles or metal panels, underlayment, starter strip, ridge cap, ice and water shield, drip edge and nails.',
    answer: `<strong>Roof area = footprint with overhangs × slope factor</strong>, and a roofing square is 100 sq ft. A 40 × 30 ft house with 1 ft overhangs and a 6/12 gable roof: 42 × 32 × 1.118 = ${fmtInt(42 * 32 * roofSF(6))} sq ft. With 10% waste that is <strong>${ans.toFixed(1)} squares, or ${Math.ceil(ans * 3)} bundles</strong> of architectural shingles (3 per square).`,
    card: roofCard(),
    sections: `<h2>Roofing squares by house size and pitch</h2><p class="hgt-read">Gable roof, 1 ft overhangs, 10% waste.</p>${table(['House', '4/12', '6/12', '8/12', '12/12'], [[30, 20], [40, 30], [50, 30], [60, 40]].map(([L, W]) => [`${L} × ${W} ft`, ...[4, 6, 8, 12].map((p) => rq(L, W, p).toFixed(1))]))}
<section class="hgt-read"><h2>What goes on a shingle roof</h2><ul><li><strong>Underlayment</strong> over the whole deck (synthetic rolls cover about 10 squares).</li><li><strong>Ice and water shield</strong> along the eaves, in valleys and around chimneys, and at least 24 in inside the warm wall in cold climates.</li><li><strong>Drip edge</strong> on eaves and rakes, <strong>starter strip</strong> along the eaves (and rakes for most brands), then the shingles.</li><li><strong>Ridge cap</strong> over ridges and hips, plus ridge vents, pipe boots and step flashing, which this list leaves to you.</li></ul></section>`,
    faqs: [
      ['How do I calculate how much roofing I need?', 'Multiply the house\'s length and width including the overhangs, then multiply by the slope factor for your pitch (1.118 for 6/12). Divide by 100 for squares and add 10–15% for waste.'],
      ['How many bundles of shingles are in a square?', 'Three for most 3-tab and architectural shingles; some heavy designer shingles take four or five. One square covers 100 sq ft of roof.'],
      ['How many squares is a 2,000 sq ft house roof?', 'A 2,000 sq ft single-story house with a 6/12 roof and overhangs has about 24–26 squares of roof including waste. A two-story house with the same living area has a smaller footprint and about half the roof.'],
      ['Does a hip roof need more shingles than a gable roof?', 'For the same footprint and pitch the area is the same, but a hip roof has more cutting and ridge cap, so plan on about 15% waste instead of 10%.'],
      ['How much does a new roof cost?', 'Materials for an architectural shingle roof often run $150–$250 per square; installed prices are usually several times that, depending on tear-off, pitch and region. Enter your prices for a materials estimate.'],
    ],
    sources: `Roof area uses the slope factor √(1 + (pitch/12)²), exact for roofs whose planes share one pitch. Coverage: 3 bundles per square (4 for heavy shingles), starter about ${ROOF.starterLf} ft per bundle, ridge cap about ${ROOF.ridgeLf} ft per bundle (brands range 20–33 ft), synthetic underlayment ${ROOF.underRoll} sq ft per roll, ice and water shield about ${ROOF.iceLf} ft per 3 ft roll, drip edge 10 ft pieces lapped 2 in, 320 nails per square for 4 nails per shingle. Low-slope limits per the <a href="${ARMA_URL}" rel="nofollow">Asphalt Roofing Manufacturers Association</a>. Check your product's installation instructions and local code.`,
  }));
  // ---- shingles ----
  pages.push(toolPage({
    path: '/shingle-calculator/', name: 'Shingle Calculator', script: '/assets/roof.js', embedId: 'shingles', updated: u,
    title: 'Shingle Calculator: How Many Bundles of Shingles Do I Need?',
    description: 'Free shingle calculator: bundles and squares of shingles from measured roof planes, including hip ends, with waste, starter strip, ridge cap and nails.',
    h1: 'Shingle Calculator', lede: 'Measure each roof plane, add the waste for your roof\'s shape and get the bundles of shingles, starter strip and ridge cap to buy.',
    answer: '<strong>Bundles = roof area ÷ 100 × 3</strong>, plus 10–15% waste. One bundle of standard shingles covers about 33⅓ sq ft, so a 2,000 sq ft roof needs <strong>66 bundles</strong> with 10% waste. Measure each roof plane: a rectangle is eave length × slope length; a triangular hip end is half that; a hip side is (eave + ridge) ÷ 2 × slope length.',
    card: shingleCard(),
    sections: `<h2>Shingle bundles by roof area</h2>${table(['Roof area', 'Squares (+10%)', 'Bundles', 'Bundles (+15%)'], [1000, 1500, 2000, 2500, 3000].map((a) => [`${fmtInt(a)} sq ft`, (a * 1.1 / 100).toFixed(1), String(Math.ceil(a * 1.1 / 100 * 3 - 1e-9)), String(Math.ceil(a * 1.15 / 100 * 3 - 1e-9))]))}`,
    faqs: [
      ['How many square feet does a bundle of shingles cover?', 'About 33⅓ sq ft for standard 3-tab and architectural shingles (3 bundles per 100 sq ft square). Check the wrapper: heavier shingles can cover 25 sq ft or less.'],
      ['How much waste should I add for shingles?', 'About 10% for a simple gable roof and 15% for hips, valleys and dormers. Complex roofs with many cuts can need 20%.'],
      ['How do I measure a roof for shingles?', 'Measure each plane\'s eave length and slope length (eave to ridge). Rectangles are length × slope; triangles are half of that; trapezoids are the average of the eave and ridge lengths × slope. Or use the roofing calculator from the house\'s footprint and pitch.'],
      ['Do I need starter shingles?', 'Yes. Starter strip goes along the eaves (and the rakes for most brands) so the first course is sealed and the joints are covered. Plan on about one bundle per 100–120 ft.'],
      ['How many nails per bundle of shingles?', 'About 100 nails per bundle at 4 nails per shingle, or 160 at 6 nails for high-wind areas.'],
    ],
    sources: `Plane area: (eave + top edge) ÷ 2 × slope length, which covers rectangles, triangles and trapezoids. 3 bundles per square for standard shingles (4 for heavy designer shingles); starter about ${ROOF.starterLf} ft and ridge cap about ${ROOF.ridgeLf} ft per bundle (brands vary). See the shingle wrapper and the <a href="${ARMA_URL}" rel="nofollow">ARMA</a> installation guidance.`,
  }));
  // ---- topsoil ----
  const tsRows = [0.5, 1, 2, 3, 4, 6, 8, 12].map((d) => [`${d} in`, `${fmtInt(324 / d)} sq ft`, `${(FILL_SOIL.materials.topsoil.tpy).toFixed(1)} tons`]);
  pages.push(toolPage({
    path: '/topsoil-calculator/', name: 'Topsoil Calculator', script: '/assets/fill.js', embedId: 'topsoil', updated: u,
    title: 'Topsoil Calculator: Cubic Yards, Tons & Bags of Topsoil',
    description: 'Free topsoil calculator: cubic yards, tons, bags and truckloads of topsoil for new lawns, top dressing, beds and gardens, with settling and cost.',
    h1: 'Topsoil Calculator', lede: 'Add each area, pick the project or depth and get the cubic yards, tons, bags and truckloads of topsoil, with extra for settling and bulk versus bagged cost.',
    answer: `<strong>Cubic yards = length × width (ft) × depth (in) ÷ 324.</strong> 1,000 sq ft at 4 in deep is ${(1000 * 4 / 324).toFixed(1)} cu yd, or about <strong>${(1000 * 4 / 324 * 1.15).toFixed(1)} cu yd with 15% for settling</strong> (roughly ${(1000 * 4 / 324 * 1.15 * 1.1).toFixed(1)} tons). One cubic yard covers 81 sq ft at 4 in, 162 sq ft at 2 in and 324 sq ft at 1 in.`,
    card: topsoilCard(),
    sections: `<h2>How far a cubic yard of topsoil goes</h2>${table(['Depth', 'One cu yd covers', 'Weight per cu yd'], tsRows)}
<h2>Topsoil depth by project</h2>${table(['Project', 'Depth'], Object.values(FILL_SOIL.uses).filter((x) => x.depth).map((x) => [x.name.replace(/ \(.*\)$/, ''), `${x.depth} in`]))}`,
    faqs: [
      ['How do I calculate how much topsoil I need?', 'Multiply length × width in feet to get square feet, multiply by the depth in inches and divide by 324 for cubic yards. Add 10–20% because loose topsoil settles.'],
      ['How much does a yard of topsoil weigh?', 'About 2,000–2,200 lb (1–1.1 tons) when dry, and up to 3,000 lb when wet. Compost-rich blends weigh less.'],
      ['How much topsoil do I need for a new lawn?', '4–6 in. For 1,000 sq ft at 4 in, that is about 12.3 cu yd, or about 14 cu yd with settling.'],
      ['How many bags of topsoil are in a yard?', 'A cubic yard is 27 cu ft, so 36 bags of 0.75 cu ft, 27 bags of 1 cu ft or 18 bags of 1.5 cu ft.'],
      ['Is bulk topsoil cheaper than bags?', 'Usually, once you need more than 1–2 cubic yards, even with a delivery fee. Bags make sense for small beds and top dressing.'],
    ],
    sources: 'Volume = area × depth ÷ 12 ÷ 27 for cubic yards. Bulk densities are typical dry values (screened topsoil about 1.1 tons per cu yd, blends 0.8–0.95, fill dirt 1.2, compost 0.5); moisture can add 20–40%. A half-ton pickup is limited to roughly 1,500 lb of payload. Supplier yards sell in ½ or 1 yd steps.',
  }));
  // ---- sand ----
  const poolRows = [12, 15, 18, 21, 24, 27, 30].map((d) => { const yd = Math.PI * ((d + 2) / 2) ** 2 * 2 / 12 / 27; return [`${d} ft round`, `${d + 2} ft pad`, yd.toFixed(2), (yd * 1.35).toFixed(2), String(Math.ceil(yd * 27 / 0.5 - 1e-9))]; });
  pages.push(toolPage({
    path: '/sand-calculator/', name: 'Sand Calculator', script: '/assets/fill.js', embedId: 'sand', updated: u,
    title: 'Sand Calculator: Cubic Yards, Tons & Bags (Play, Paver, Pool)',
    description: 'Free sand calculator: cubic yards, tons and 50 lb bags of play, mason, concrete or fill sand for sandboxes, paver bedding, above-ground pool bases and leveling.',
    h1: 'Sand Calculator', lede: 'How much sand you need for a sandbox, paver bed, above-ground pool base, lawn leveling or trench, in cubic yards, tons and 50 lb bags, for rectangles and circles.',
    answer: `<strong>Cubic yards = length × width (ft) × depth (in) ÷ 324; tons ≈ cubic yards × 1.35</strong> for dry sand. A 10 × 10 ft area 2 in deep needs ${(100 * 2 / 324).toFixed(2)} cu yd (${(100 * 2 / 324 * 1.35).toFixed(2)} tons), or <strong>${Math.ceil(100 * 2 / 12 / 0.5 - 1e-9)} bags of 50 lb</strong>. A 24 ft above-ground pool needs a 26 ft pad: about ${(Math.PI * 13 * 13 * 2 / 12 / 27).toFixed(1)} cu yd at 2 in.`,
    card: sandCard(),
    sections: `<h2>Sand for an above-ground pool base (2 in deep)</h2>${table(['Pool', 'Sand pad', 'Cu yd', 'Tons', '50 lb bags'], poolRows)}
<h2>Sand depth by project</h2>${table(['Project', 'Depth', 'Per 100 sq ft'], Object.values(FILL_SAND.uses).filter((x) => x.depth).map((x) => [x.name.replace(/ \(.*\)$/, ''), `${x.depth} in`, `${(100 * x.depth / 324).toFixed(2)} cu yd`]))}`,
    faqs: [
      ['How do I calculate how much sand I need?', 'Multiply length × width in feet by the depth in inches and divide by 324 for cubic yards. For a circle, use 3.1416 × radius² as the area. Multiply cubic yards by about 1.35 for tons of dry sand.'],
      ['How much does a yard of sand weigh?', 'About 2,600–2,800 lb (1.3–1.4 tons) dry and 3,000–3,300 lb damp, which is how bulk sand is usually delivered.'],
      ['How much sand do I need for an above-ground pool?', 'A 2 in layer over a pad 2 ft wider than the pool. For a 24 ft round pool that is about 2.0 cu yd, roughly 2.8 tons or 80 bags of 50 lb.'],
      ['How many bags of sand are in a yard?', 'About 54 bags of 50 lb (0.5 cu ft each).'],
      ['What sand goes under pavers?', 'Coarse concrete sand (ASTM C33) screeded 1 in thick over the compacted base. Fine play sand and mason sand hold water and shift.'],
    ],
    sources: 'Volume = area × depth ÷ 12 ÷ 27. Dry sand weighs about 100 lb per cu ft (1.35 tons per cu yd); coarse concrete and fill sand about 1.4; damp sand about 1.6. Bagged play sand is sold as 50 lb, about 0.5 cu ft. Pool pad guidance follows common above-ground pool installation instructions; check yours.',
  }));
  // ---- polymeric sand ----
  const pc = (k, j) => fmtInt(polyCover(POLY.pavers[k].l, POLY.pavers[k].w, j));
  pages.push(toolPage({
    path: '/polymeric-sand-calculator/', name: 'Polymeric Sand Calculator', script: '/assets/fill.js', embedId: 'polymeric-sand', updated: u,
    title: 'Polymeric Sand Calculator: Bags by Paver Size & Joint Width',
    description: 'Free polymeric sand calculator: bags of polymeric sand for pavers or flagstone from the area, paver size, joint width and joint depth, with coverage per bag.',
    h1: 'Polymeric Sand Calculator', lede: 'Polymeric sand coverage depends on the joints, not just the area. Enter the paver size, joint width and depth to get the bags you need and the real coverage per bag.',
    answer: `<strong>Coverage depends on paver size and joint width.</strong> A 50 lb bag covers about <strong>${pc('brick', 0.125)} sq ft of 4 × 8 in pavers with ⅛ in joints</strong> 2¼ in deep, but only about ${pc('brick', 0.25)} sq ft with ¼ in joints. Large 24 × 24 in slabs with ⅛ in joints go about ${pc('24x24', 0.125)} sq ft per bag. Joint volume = the joint share of each paver cell × the depth.`,
    card: polyCard(),
    sections: `<h2>Square feet per 50 lb bag (2¼ in deep joints)</h2>${table(['Paver', '⅛ in joints', '¼ in joints', '½ in joints'], ['brick', '6x6', '6x9', '12x12', '16x16', '24x24', 'flag'].map((k) => [POLY.pavers[k].name, pc(k, 0.125), pc(k, 0.25), pc(k, 0.5)]))}
<section class="hgt-read"><h2>Getting polymeric sand right</h2><ul><li>Install on a dry day with no rain forecast for 24 hours, and make sure the pavers are completely dry.</li><li>Fill joints to about ⅛ in below the paver top (the chamfer), compact with a plate compactor fitted with a pad, and top up.</li><li>Blow every grain off the paver surface before misting; leftover dust leaves a haze.</li></ul></section>`,
    faqs: [
      ['How much polymeric sand do I need?', 'Find the joint volume: for each paver, (length + joint) × (width + joint) − length × width is the joint area, times the depth. Divide by the paver cell area for the share of surface that is joint, then multiply by the patio area, depth and about 100 lb per cu ft. Or use the calculator above.'],
      ['How many square feet does a bag of polymeric sand cover?', 'From about 30 sq ft (small pavers, wide joints) to well over 100 sq ft (large slabs, tight joints) per 50 lb bag. The table above shows typical cases.'],
      ['How deep should polymeric sand be?', 'At least 1½ in, and ideally the full joint depth to about ⅛ in below the top of the paver, so it can bind and resist washout.'],
      ['Can you use polymeric sand on wide joints?', 'Standard products handle joints up to about ½ in; wider flagstone joints need a wide-joint polymeric sand or stone dust product.'],
      ['Is polymeric sand better than regular sand?', 'It binds when wetted, which resists weeds, ants and washout far better than loose joint sand, but it must be installed dry and in the right weather.'],
    ],
    sources: `Joint share = ((L + j)(W + j) − L·W) ÷ ((L + j)(W + j)) for a grid of pavers; volume = share × area × depth. Settled polymeric sand weighs about ${POLY.density} lb per cu ft; ${Math.round(POLY.waste * 100)}% added for spillage and top-ups. Bag coverage tables from the manufacturers vary by product; follow the bag's joint-width and depth limits.`,
  }));
  // ---- spans ----
  const deckSp = ['syp', 'dfl', 'hf', 'spf', 'wc'];
  const sizes4 = ['2x6', '2x8', '2x10', '2x12'];
  const deckRows = sizes4.flatMap((z) => SPAN.spacings.map((oc) => [`${z.replace('x', '×')} at ${oc} in`, ...deckSp.map((sp) => ftInS(spanInches(sp, z, oc, DECK_LOAD(sp))))]));
  const sypD = (z) => ftInS(spanInches('syp', z, 16, DECK_LOAD('syp')));
  pages.push(toolPage({
    path: '/deck-joist-span-calculator/', name: 'Deck Joist Span Calculator', script: '/assets/span.js', embedId: 'deck-joist-span', updated: u,
    title: 'Deck Joist Span Calculator & Span Chart (DCA 6 Method)',
    description: 'Free deck joist span calculator: max span for southern pine, Douglas fir, hem-fir, SPF and cedar joists at 12, 16 or 24 in on center (DCA 6 method), with a chart.',
    h1: 'Deck Joist Span Calculator', lede: 'Find how far your deck joists can span for their species, size and spacing, check a planned span, and see the full span chart, using the same checks as the AWC DCA 6 deck guide.',
    answer: `<strong>Southern pine No. 2 deck joists at 16 in on center span about: 2×6 ${sypD('2x6')}, 2×8 ${sypD('2x8')}, 2×10 ${sypD('2x10')} and 2×12 ${sypD('2x12')}</strong> (40 psf live + 10 psf dead load, L/360, wet service). Treated Douglas fir, hem-fir and SPF are usually incised, which shortens their spans. Joists may cantilever about ¼ of their span past the beam.`,
    card: spanCard('deck'),
    sections: `<h2>Deck joist span chart</h2><p class="hgt-read">No. 2 grade, 40 psf live + 10 psf dead load, L/360, wet service; Douglas fir, hem-fir and SPF incised. Spans capped at ${SPAN.deckCap} ft as in DCA 6.</p>${table(['Joist', 'Southern pine', 'Douglas fir-larch', 'Hem-fir', 'Spruce-pine-fir', 'Western cedars'], deckRows)}
<section class="hgt-read"><h2>Deck framing tips</h2><ul><li>Spans are measured between the ledger or beam supports, not end to end.</li><li>16 in on center is standard; composite decking often needs 12 in, and diagonal decking 12 in.</li><li>Hot tubs, heavy planters and privacy walls add point loads; those need an engineered design.</li></ul></section>`,
    faqs: [
      ['How far can a 2×8 deck joist span?', `About ${sypD('2x8')} for southern pine No. 2 at 16 in on center, and less for incised hem-fir or SPF. At 12 in spacing it spans further; at 24 in, less.`],
      ['How far can a 2×10 deck joist span?', `About ${sypD('2x10')} for southern pine No. 2 at 16 in on center (40 psf live load).`],
      ['How far can a 2×6 deck joist span?', `About ${sypD('2x6')} for southern pine No. 2 at 16 in on center. 2×6 joists suit low, small decks.`],
      ['How far can a deck joist cantilever?', 'Up to about one-quarter of the joist\'s back span, and DCA 6 caps it further for some sizes. A 12 ft joist span allows about a 3 ft cantilever.'],
      ['Why are treated hem-fir and SPF spans shorter?', 'These species are incised (slit) so the preservative can penetrate, and incising lowers their strength and stiffness. Southern pine takes treatment without incising.'],
    ],
    sources: `Allowable span is the smallest of the bending, deflection (L/360 under live load) and shear limits using <a href="${NDS_URL}" rel="nofollow">NDS 2018</a> design values for No. 2 lumber, the repetitive-member factor 1.15, wet-service factors (bending 0.85 where F<sub>b</sub>C<sub>F</sub> > 1,150 psi, E 0.9, shear 0.97) and incising factors (0.8, 0.95, 0.8), as in <a href="${DCA6_URL}" rel="nofollow">AWC DCA 6</a>; results match DCA 6 Table 2 within an inch. Your local code and inspector have the final say.`,
  }));
  const floorSp = ['dfl', 'syp', 'hf', 'spf'];
  const floorRows = (live) => sizes4.flatMap((z) => SPAN.spacings.map((oc) => [`${z.replace('x', '×')} at ${oc} in`, ...floorSp.map((sp) => ftInS(spanInches(sp, z, oc, FLOOR_LOAD(live))))]));
  const dfF = (z) => ftInS(spanInches('dfl', z, 16, FLOOR_LOAD()));
  pages.push(toolPage({
    path: '/floor-joist-span-calculator/', name: 'Floor Joist Span Calculator', script: '/assets/span.js', embedId: 'floor-joist-span', updated: u,
    title: 'Floor Joist Span Calculator & Span Chart (2×6 to 2×12)',
    description: 'Free floor joist span calculator and chart: max spans for 2×6 to 2×12 joists in Douglas fir, southern pine, hem-fir and SPF for 30 and 40 psf floors.',
    h1: 'Floor Joist Span Calculator', lede: 'Check how far a floor joist can span for its species, size, spacing and floor use, and see span charts for 40 psf living areas and 30 psf bedrooms.',
    answer: `<strong>Douglas fir-larch No. 2 floor joists at 16 in on center (40 psf live, 10 psf dead, L/360) span about: 2×6 ${dfF('2x6')}, 2×8 ${dfF('2x8')}, 2×10 ${dfF('2x10')} and 2×12 ${dfF('2x12')}.</strong> Bedrooms (30 psf) allow longer spans; tile floors are best designed to L/480 or stiffer.`,
    card: spanCard('floor'),
    sections: `<h2>Floor joist span chart: living areas (40 psf live, 10 psf dead, L/360)</h2>${table(['Joist', 'Douglas fir-larch', 'Southern pine', 'Hem-fir', 'Spruce-pine-fir'], floorRows(40))}
<h2>Floor joist span chart: bedrooms (30 psf live, 10 psf dead, L/360)</h2>${table(['Joist', 'Douglas fir-larch', 'Southern pine', 'Hem-fir', 'Spruce-pine-fir'], floorRows(30))}`,
    faqs: [
      ['How far can a 2×8 floor joist span?', `About ${dfF('2x8')} for Douglas fir-larch No. 2 at 16 in on center under a 40 psf living-area load. Southern pine and SPF are similar; hem-fir is a little shorter.`],
      ['How far can a 2×10 floor joist span?', `About ${dfF('2x10')} for Douglas fir-larch No. 2 at 16 in on center (40 psf live load).`],
      ['How far can a 2×12 floor joist span?', `About ${dfF('2x12')} for Douglas fir-larch No. 2 at 16 in on center (40 psf live load).`],
      ['How far can a 2×6 floor joist span?', `About ${dfF('2x6')} for Douglas fir-larch No. 2 at 16 in on center; 2×6 floors are mostly used for sheds and small additions.`],
      ['What is L/360?', 'The floor may bend no more than its span divided by 360 under the full live load: about ½ in for a 15 ft joist. Tile and stone floors are usually designed to L/480 or stiffer to avoid cracking.'],
    ],
    sources: `Spans are the smallest of the bending, live-load deflection and shear limits using <a href="${NDS_URL}" rel="nofollow">NDS 2018</a> design values for No. 2 dimension lumber with the repetitive-member factor 1.15, dry service, the method behind the <a href="${AWC_SPANS_URL}" rel="nofollow">AWC span tables</a> and <a href="${IRC_FLOOR_URL}" rel="nofollow">IRC</a> Table R502.3.1. Values may differ slightly from your code book's table. Engineered I-joists and LVL use the maker's tables.`,
  }));
  const rafterRows = ['2x4', '2x6', '2x8', '2x10', '2x12'].flatMap((z) => SPAN.spacings.map((oc) => [`${z.replace('x', '×')} at ${oc} in`, ...['live20', 'snow30', 'snow50', 'snow70'].map((k) => ftInS(spanInches('dfl', z, oc, RAFTER_LOAD(k)))) ]));
  const dfR = (z) => ftInS(spanInches('dfl', z, 16, RAFTER_LOAD('snow30')));
  pages.push(toolPage({
    path: '/rafter-span-calculator/', name: 'Rafter Span Calculator', script: '/assets/span.js', embedId: 'rafter-span', updated: u,
    title: 'Rafter Span Calculator & Rafter Span Chart',
    description: 'Free rafter span calculator: max horizontal span for 2×4 to 2×12 rafters by species, spacing, snow or roof load and ceiling, with a rafter span chart.',
    h1: 'Rafter Span Calculator', lede: 'Find the maximum horizontal span of a rafter for your species, size, spacing, roof load and ceiling, and check a planned span.',
    answer: `<strong>Douglas fir-larch No. 2 rafters at 16 in on center, 30 psf ground snow, 10 psf dead load and an attached ceiling (L/240) span about: 2×6 ${dfR('2x6')}, 2×8 ${dfR('2x8')}, 2×10 ${dfR('2x10')} and 2×12 ${dfR('2x12')}</strong>, measured horizontally. Heavier snow or roofing shortens the span.`,
    card: spanCard('rafter'),
    sections: `<h2>Rafter span chart: Douglas fir-larch No. 2, 10 psf dead load, ceiling attached (L/240)</h2>${table(['Rafter', '20 psf roof live', '30 psf snow', '50 psf snow', '70 psf snow'], rafterRows)}
<p class="hgt-read">Spans are horizontal projections. To get the rafter's length along the slope, multiply by the slope factor from the <a href="/roof-pitch-calculator/">roof pitch calculator</a>.</p>`,
    faqs: [
      ['How far can a 2×6 rafter span?', `About ${dfR('2x6')} horizontally for Douglas fir-larch No. 2 at 16 in on center with 30 psf snow, a 10 psf roof and an attached ceiling.`],
      ['How far can a 2×8 rafter span?', `About ${dfR('2x8')} horizontally under the same loads.`],
      ['Is rafter span measured horizontally?', 'Yes. Code span tables use the horizontal distance between supports, not the length along the slope.'],
      ['What snow load should I use?', 'Use your local ground snow load from the building department; it ranges from 0 in the South to 70 psf or more in mountain areas.'],
      ['What does "ceiling attached" change?', 'A ceiling (drywall) attached to the rafters must not crack, so the rafter must be stiffer: L/240 instead of L/180.'],
    ],
    sources: `Bending, deflection and shear checks with <a href="${NDS_URL}" rel="nofollow">NDS 2018</a> No. 2 design values, repetitive-member factor 1.15 and load-duration factors 1.15 (snow) and 1.25 (roof live load), applying the snow or live load to the horizontal projection, as in <a href="${IRC_ROOF_URL}" rel="nofollow">IRC</a> rafter tables. Values may differ slightly from your code book's table. Rafter thrust, ceiling-joist ties and heel heights are not checked; follow your local code.`,
  }));
  // ---- fertilizer ----
  const fertRows = FERT.products.map(([v, n]) => { const [N] = v.split('-').map(Number); const per = 1 / (N / 100); return [n.replace(/ \(.*\)$/, ''), `${per.toFixed(1)} lb`, N ? `${fmtInt(50 / per * 1000)} sq ft` : '–']; });
  pages.push(toolPage({
    path: '/fertilizer-calculator/', name: 'Fertilizer Calculator', script: '/assets/fert.js', embedId: 'fertilizer', updated: u,
    title: 'Lawn Fertilizer Calculator: How Much Per 1,000 Sq Ft (N-P-K)',
    description: 'Free lawn fertilizer calculator: how much of any N-P-K fertilizer per 1,000 sq ft and for your whole lawn, granular or liquid, with feeding times by grass.',
    h1: 'Fertilizer Calculator', lede: 'Turn the N-P-K numbers on any bag into how much to spread per 1,000 sq ft and for your whole lawn, by nitrogen or by a soil test\'s phosphate or potash, with feeding times for your grass.',
    answer: '<strong>Pounds of fertilizer per 1,000 sq ft = pounds of nutrient wanted ÷ (percent on the bag ÷ 100).</strong> For 1 lb of nitrogen with 24-0-6: 1 ÷ 0.24 = <strong>4.2 lb per 1,000 sq ft</strong>, or 20.8 lb for a 5,000 sq ft lawn. With 10-10-10 it takes 10 lb per 1,000 sq ft. Most lawns need 1–4 lb of nitrogen per 1,000 sq ft a year, split into feedings of about 1 lb.',
    card: fertCard(),
    sections: `<h2>Fertilizer for 1 lb of nitrogen per 1,000 sq ft</h2>${table(['Product (N-P-K)', 'Per 1,000 sq ft', '50 lb bag covers'], fertRows)}
<h2>Yearly nitrogen by grass type</h2>${table(['Grass', 'Season', 'Lb N per 1,000 sq ft per year'], Object.values(FERT.grasses).map((g) => [g.name, g.season === 'cool' ? 'Cool-season' : 'Warm-season', `${g.lo}–${g.hi}`]))}`,
    faqs: [
      ['How do I calculate how much fertilizer to use?', 'Decide how much nitrogen you want per 1,000 sq ft (usually 0.5–1 lb), divide by the first number on the bag as a decimal, and multiply by your lawn area in thousands of square feet. 1 lb N with 32-0-4 is 1 ÷ 0.32 = 3.1 lb per 1,000 sq ft.'],
      ['What do the three numbers on fertilizer mean?', 'They are the percent by weight of nitrogen (N), phosphate (P₂O₅) and potash (K₂O). A 50 lb bag of 10-10-10 contains 5 lb of each.'],
      ['How much 10-10-10 per 1,000 square feet?', '10 lb per 1,000 sq ft for 1 lb of nitrogen, or 5 lb for a half-rate feeding.'],
      ['How often should I fertilize my lawn?', 'Cool-season grasses mostly in fall (2–3 feedings), warm-season grasses every 6–8 weeks from green-up through summer. Your grass type sets the yearly total.'],
      ['Can I put down too much fertilizer?', 'Yes. More than about 1 lb of quick-release nitrogen per 1,000 sq ft at once can burn the lawn, and excess nutrients wash into waterways. Split heavy rates and follow the label.'],
    ],
    sources: `Product rate = nutrient rate ÷ (grade % ÷ 100); N-P-K grades are percent by weight of N, P₂O₅ and K₂O. Yearly nitrogen ranges reflect university extension guidance such as <a href="${PURDUE_TURF_URL}" rel="nofollow">Purdue Turfgrass Science</a> and <a href="${NCSU_TURF_URL}" rel="nofollow">NC State TurfFiles</a>; your state's extension service and a soil test give the best numbers for your lawn. Liquid rates use the product's weight per gallon from its label.`,
  }));
  return pages;
}

// ---------- Pinterest: one pin per tool, one RSS feed per board ----------
// Pinterest's "auto-publish from RSS" maps each feed to one board (up to 5 feeds per account),
// so tools are grouped into 5 boards and each feed item carries its pin image.
const PIN_BOARDS = [
  { id: 'lawn-garden', name: 'Lawn & Garden Calculators', desc: 'Free calculators and charts for lawns and gardens: grass seed, sod, raised bed and potting soil, frost dates and hardiness zones by ZIP code.', tools: ['/topsoil-calculator/', '/fertilizer-calculator/', '/grass-seed-calculator/', '/sod-calculator/', '/raised-bed-soil-calculator/', '/potting-soil-calculator/', '/acreage-calculator/', '/square-feet-to-acres-calculator/', '/hardiness-zones/', '/frost-dates/'] },
  { id: 'patio-gravel', name: 'Patio, Paver & Gravel Projects', desc: 'How much gravel, pavers, base and retaining wall block to buy for patios, paths and driveways, with free calculators.', tools: ['/gravel-calculator/', '/pea-gravel-calculator/', '/driveway-gravel-calculator/', '/paver-calculator/', '/paver-base-calculator/', '/retaining-wall-calculator/', '/cubic-yard-calculator/', '/cubic-yards-to-tons-calculator/', '/sand-calculator/', '/polymeric-sand-calculator/'] },
  { id: 'pool-care', name: 'Pool Care Calculators', desc: 'Pool volume, salt and shock doses made simple, with free calculators and charts for every pool size.', tools: ['/pool-volume-calculator/', '/pool-salt-calculator/', '/pool-shock-calculator/'] },
  { id: 'diy-building', name: 'DIY Deck, Fence & Stair Building', desc: 'Material lists and span charts for decks, fences, stairs, roofs and block walls: free calculators, charts and code tips for DIY builders.', tools: ['/deck-joist-span-calculator/', '/floor-joist-span-calculator/', '/rafter-span-calculator/', '/roof-pitch-calculator/', '/roofing-calculator/', '/shingle-calculator/', '/deck-calculator/', '/fence-calculator/', '/fence-post-concrete-calculator/', '/stair-calculator/', '/stair-stringer-calculator/', '/concrete-block-calculator/', '/board-foot-calculator/', '/log-board-foot-calculator/', '/concrete-calculator/', '/concrete-slab-calculator/', '/concrete-bag-calculator/', '/deck-stain-calculator/', '/fence-stain-calculator/'] },
  { id: 'diy-interior', name: 'DIY Tile & Drywall Projects', desc: 'How much tile, grout, thinset, drywall and paint to buy, room square footage, and AC and mini split sizing, with free calculators.', tools: ['/tile-calculator/', '/shower-tile-calculator/', '/drywall-calculator/', '/square-footage-calculator/', '/countertop-square-footage-calculator/', '/btu-calculator/', '/mini-split-size-calculator/', '/exterior-paint-calculator/'] },
];
// Each pin: a question people search on Pinterest, a small chart from the same formulas as the page, and a description.
function pinData() {
  const T = TILE.tiles, G = GRAVEL.materials;
  const yd = (sq, d) => sq * d / 324;
  const P = {
    '/stair-calculator/': ['How many stairs do I need?', ['Total rise', 'Risers', 'Riser'], [36, 48, 72, 96, 108, 120].map((h) => { const s = stairRow(h); return [`${h} in`, String(s.n), inchFrac(s.r)]; })],
    '/stair-stringer-calculator/': ['How long is a stair stringer?', ['Total rise', 'Treads', 'Stringer'], [24, 36, 48, 72, 96].map((h) => { const s = stairRow(h, 11); return [`${h} in`, String(s.n - 1), `${(s.len / 12).toFixed(1)} ft`]; })],
    '/gravel-calculator/': ['How far does a yard of gravel go?', ['Depth', 'Covers', 'Weighs'], [2, 3, 4, 6].map((d) => [`${d} in`, `${Math.round(324 / d)} sq ft`, '1.4 tons'])],
    '/pea-gravel-calculator/': ['How much pea gravel do I need?', ['Area (3 in deep)', 'Cu yd', 'Bags'], [[10, 10], [10, 20], [20, 20], [4, 50]].map(([a, b]) => [`${a} × ${b} ft`, (Math.ceil(yd(a * b, 3) * 10) / 10).toFixed(1), String(Math.ceil(yd(a * b, 3) * 54))])],
    '/driveway-gravel-calculator/': ['How much gravel for a driveway?', ['Driveway', 'Tons', 'Layers'], [[10, 30], [10, 50], [12, 50], [12, 100]].map(([w, l]) => { let t = 0; [[3, 4], [57, 4], ['crusher', 3]].forEach(([m, d]) => { const mm = G[m]; t += w * l * d / 12 * (1 + (mm.compact || 0)) / 27 * mm.tpy; }); return [`${w} × ${l} ft`, t.toFixed(0), '4 + 4 + 3 in']; })],
    '/pool-volume-calculator/': ['How many gallons is my pool?', ['Pool', 'Depth', 'Gallons'], [['16 × 32 ft', 32, 16, 4.5], ['18 × 36 ft', 36, 18, 4.5], ['20 × 40 ft', 40, 20, 4.5]].map(([n, l, w, d]) => [n, `${d} ft avg`, fmtInt(Math.round(l * w * d * 7.48 / 100) * 100)]).concat([18, 24].map((d) => [`${d} ft round`, '4 ft', fmtInt(Math.round(d * d * 4 * POOL.round / 100) * 100)]))],
    '/pool-salt-calculator/': ['How much salt for my pool?', ['Gallons', 'Salt (lb)', '40 lb bags'], [10000, 15000, 20000, 25000, 30000].map((g) => { const lb = g * 8.34 * POOL.saltTarget / 1e6; return [fmtInt(g), fmtInt(Math.round(lb)), String(Math.ceil(lb / 40))]; })],
    '/pool-shock-calculator/': ['How much shock per 10,000 gal?', ['Product', 'For +10 ppm'], Object.values(POOL.products).slice(0, 5).map((p) => [p.name.replace(' shock', ''), p.liquid ? `${(10 / p.strength).toFixed(2)} gal` : `${(83.4 / p.strength).toFixed(2)} lb`])],
    '/paver-calculator/': ['How many pavers per square foot?', ['Paver', 'Per sq ft', 'Per 100 sq ft'], Object.values(PAVER.pavers).slice(0, 5).map((p) => [p.name.replace(/ \(.*$/, ''), (144 / (p.l * p.w)).toFixed(2), fmtInt(Math.ceil(14400 / (p.l * p.w) * 1.05))])],
    '/paver-base-calculator/': ['How much base under pavers?', ['Use', 'Base', 'Sand'], [['Walkway', '4 in', '1 in'], ['Patio', '4–6 in', '1 in'], ['Patio on clay', '6 in', '1 in'], ['Driveway', '8–12 in', '1 in']]],
    '/sod-calculator/': ['How much sod do I need?', ['Lawn', 'Pallets', 'Slabs'], [500, 1000, 2000, 5000].map((a) => [`${fmtInt(a)} sq ft`, (a * 1.05 / SOD.pallet).toFixed(1), fmtInt(Math.ceil(a * 1.05 / 2.67))])],
    '/grass-seed-calculator/': ['How much grass seed per 1,000 sq ft?', ['Grass', 'New lawn', 'Overseed'], Object.values(SEED.grasses).map((g) => [g.name.replace(/ \(.*$/, ''), `${g.rate} lb`, `${g.over} lb`])],
    '/concrete-block-calculator/': ['How many concrete blocks do I need?', ['Wall', '4 ft high', '8 ft high'], [10, 20, 30, 40].map((l) => [`${l} ft long`, String(cmuCount(l, 4, CMU.sizes[8])), String(cmuCount(l, 8, CMU.sizes[8]))])],
    '/retaining-wall-calculator/': ['Retaining wall blocks per 10 ft', ['Height', '6×16 blocks', 'Stone'], [1, 2, 3].map((h) => { const b = SRW.blocks.standard, exp = h * 12, bc = Math.max(1, Math.ceil(exp * SRW.buryRatio / b.h - 1e-9)), c = bc + Math.ceil(exp / b.h - 1e-9); const st = (10 * ((b.d + SRW.baseExtra) / 12) * (SRW.baseIn / 12) + 10 * (SRW.drainIn / 12) * (c * b.h / 12)) / 27; return [`${h} ft`, String(Math.ceil(120 / b.l) * c), `${st.toFixed(1)} cu yd`]; })],
    '/hardiness-zones/': ['What do hardiness zones mean?', ['Zone', 'Coldest winter night'], ['4a', '5b', '6a', '7b', '8a', '9b'].map((z) => [z, zoneRange(z)])],
    '/frost-dates/': ['When is the last frost?', ['Region', 'Typical last frost'], [['Gulf Coast & Florida', 'Feb–March'], ['Mid-South', 'Late March–April'], ['Midwest & Northeast', 'April–May'], ['Northern states', 'May–June']]],
    '/deck-calculator/': ['How many deck boards do I need?', ['Deck', 'Boards (16 ft)', 'Joists'], [[12, 12], [16, 12], [20, 12], [16, 16]].map(([w, d]) => { const r = deckRow(w, d); return [`${w} × ${d} ft`, String(r.boards), String(r.joists)]; })],
    '/fence-calculator/': ['How many fence pickets do I need?', ['Fence', 'Posts', 'Pickets'], [50, 100, 150, 200].map((L) => { const r = fenceRow(L); return [`${L} ft`, String(r.posts), fmtInt(r.pickets)]; })],
    '/fence-post-concrete-calculator/': ['Concrete bags per fence post', ['Hole', '50 lb fast-set', '80 lb'], [[8, 24], [10, 24], [10, 30], [12, 36]].map(([d, h]) => { const c = holeCuft(d, h, 3.5); return [`${d} × ${h} in`, String(Math.ceil(c / 0.375 - 1e-9)), String(Math.ceil(c / 0.6 - 1e-9))]; })],
    '/tile-calculator/': ['How many tiles per square foot?', ['Tile', 'Per sq ft', 'Per 100 sq ft'], ['12x12', '12x24', '6x24', '3x6', '24x24'].map((k) => [T[k].name.replace(/ (plank|subway)$/, ''), tilePer(T[k]).toFixed(2), fmtInt(Math.ceil(100 * tilePer(T[k]) * 1.1))])],
    '/shower-tile-calculator/': ['How much tile for a shower?', ['Shower', 'Wall sq ft', 'Floor sq ft'], [[36, 36], [48, 36], [60, 32], [60, 36]].map(([w, d]) => [`${w} × ${d} in`, ((w + 2 * d) * 96 / 144).toFixed(0), (w * d / 144).toFixed(1)])],
    '/square-footage-calculator/': ['How many square feet is my room?', ['Room', 'Sq ft', 'Sq yd'], [[10, 10], [10, 12], [12, 12], [12, 14], [14, 16]].map(([a, c]) => [`${a} × ${c} ft`, String(a * c), (a * c / 9).toFixed(1)])],
    '/countertop-square-footage-calculator/': ['Countertop square feet (25½ in deep)', ['Run', 'Counter', '+ backsplash'], [72, 96, 120, 144].map((l) => [`${l / 12} ft`, `${(l * 25.5 / 144).toFixed(1)} sq ft`, `${(l * 29.5 / 144).toFixed(1)} sq ft`])],
    '/cubic-yard-calculator/': ['How many cubic yards do I need?', ['Area', '3 in deep', '4 in deep'], [[10, 10], [10, 20], [20, 20], [12, 24]].map(([a, c]) => [`${a} × ${c} ft`, (a * c * 3 / 324).toFixed(2), (a * c * 4 / 324).toFixed(2)])],
    '/cubic-yards-to-tons-calculator/': ['How many tons in a cubic yard?', ['Material', 'Tons per yd'], ['57', 'crusher', 'sand', 'topsoil', 'mulch', 'concrete'].map((k) => [MATERIALS[k].name.replace(/ \(.*$/, ''), String(MATERIALS[k].tpy)])],
    '/board-foot-calculator/': ['How many board feet?', ['Lumber', 'Board feet'], [[1, 6, 8], [2, 4, 8], [2, 6, 8], [2, 8, 12], [2, 10, 12], [4, 4, 8]].map(([t, w, l]) => [`${t} × ${w} × ${l} ft`, (t * w * l / 12).toFixed(2)])],
    '/log-board-foot-calculator/': ['Board feet in a 16 ft log', ['Diameter', 'Doyle', 'Int ¼'], [12, 16, 20, 24, 28].map((d) => [`${d} in`, String(Math.round(logBf('doyle', d, 16))), String(Math.round(logBf('intl', d, 16)))])],
    '/potting-soil-calculator/': ['How much potting soil per pot?', ['Pot', 'Quarts'], [8, 10, 12, 14, 16].map((d) => [`${d} in round`, String(Math.round(potCuIn(d, Math.round(d * 0.9)) / 1728 * 25.714))]).concat([[5, 'gal grow bag'], [10, 'gal grow bag']].map(([g, n]) => [`${g} ${n}`, String(Math.round(g * 231 * 0.9 / 1728 * 25.714))]))],
    '/raised-bed-soil-calculator/': ['How much soil for a raised bed?', ['Bed', 'Cu ft', 'Bags 1.5'], [[4, 4, 12], [3, 6, 12], [4, 8, 6], [4, 8, 12], [4, 8, 18]].map(([w, l, d]) => [`${w}×${l} ft, ${d} in`, bedCuft(l, w, d).toFixed(0), String(Math.ceil(bedCuft(l, w, d) / 1.5))])],
    '/acreage-calculator/': ['How big is an acre?', ['Acres', 'Square feet', 'Square lot'], [0.25, 0.5, 1, 2, 5].map((a) => [String(a), fmtInt(a * 43560), `${Math.round(Math.sqrt(a * 43560))} ft sq`])],
    '/square-feet-to-acres-calculator/': ['Square feet to acres', ['Sq ft', 'Acres'], [5000, 10000, 20000, 43560, 100000].map((x) => [fmtInt(x), (x / 43560).toFixed(3)])],
    '/btu-calculator/': ['What size AC do I need?', ['Room', 'BTU'], [[150, '10×15'], [250, '12×20'], [400, '20×20'], [550, '22×25'], [1000, '25×40']].map(([sq, d]) => [`${sq} sq ft (${d} ft)`, fmtInt(esRow(sq))])],
    '/mini-split-size-calculator/': ['Mini split head size by room', ['Room', 'Head'], [[150, 'Small bedroom'], [250, 'Bedroom'], [450, 'Living room'], [700, 'Great room']].map(([sq, n]) => [`${n}, ${sq} sq ft`, `${fmtInt(HVAC.heads.find((h) => h >= esRow(sq)) || 24000)} BTU`])],
    '/concrete-calculator/': ['How many bags of concrete?', ['Slab, 4 in thick', 'Cu yd', '80 lb bags'], [[4, 4], [8, 8], [10, 10], [12, 12]].map(([l, w]) => [`${l} × ${w} ft`, (concreteYd(l, w, 4) * 1.1).toFixed(2), String(Math.ceil(concreteYd(l, w, 4) * 1.1 * 27 / 0.6))])],
    '/concrete-slab-calculator/': ['Concrete for a slab', ['Slab', 'Thick', 'Cu yd (+10%)'], [[10, 10, 4], [12, 12, 4], [20, 20, 4], [12, 24, 6]].map(([l, w, t]) => [`${l} × ${w} ft`, `${t} in`, (concreteYd(l, w, t) * 1.1).toFixed(2)])],
    '/concrete-bag-calculator/': ['Concrete bags per yard', ['Bag', 'Per cu yd'], CONCRETE.bags.map((x) => [x.name, String(Math.ceil(27 / x.yield))])],
    '/deck-stain-calculator/': ['How much deck stain?', ['Product', 'Rough wood', 'Smooth'], Object.values(COAT.products).map((x) => [x.name.replace(' or toner', ''), `${x.rough} sq ft/gal`, `${x.smooth}`])],
    '/fence-stain-calculator/': ['Fence stain (6 ft, both sides)', ['Fence', 'Gallons, 1 coat'], [50, 100, 150, 200].map((L) => [`${L} ft privacy`, String(Math.ceil(L * 6 * 2 * 1.15 / COAT.products.semi.rough))])],
    '/exterior-paint-calculator/': ['How much exterior paint?', ['House', 'Gallons, 2 coats'], [[40, 30, 9], [50, 30, 9], [50, 30, 18], [60, 40, 18]].map(([l, w, h]) => { const a = 2 * (l + w) * h + w * 8 - 334; return [`${l}×${w} ft, ${h} ft walls`, String(Math.ceil(a / COAT.products.paint.smooth * 2))]; })],
    '/roof-pitch-calculator/': ['Roof pitch to degrees', ['Pitch', 'Angle', 'Slope factor'], [3, 4, 6, 8, 10, 12].map((p) => [`${p}/12`, `${(Math.atan(p / 12) * 180 / Math.PI).toFixed(1)}°`, roofSF(p).toFixed(3)])],
    '/roofing-calculator/': ['How many squares is my roof?', ['House (6/12 gable)', 'Squares', 'Bundles'], [[30, 20], [40, 30], [50, 30], [60, 40]].map(([L, W]) => { const q = gableSquares(L, W, 6); return [`${L} × ${W} ft`, q.toFixed(1), String(Math.ceil(q * 3 - 1e-9))]; })],
    '/shingle-calculator/': ['How many bundles of shingles?', ['Roof area', 'Bundles (+10%)'], [1000, 1500, 2000, 2500, 3000].map((a) => [`${fmtInt(a)} sq ft`, String(Math.ceil(a * 1.1 / 100 * 3 - 1e-9))])],
    '/topsoil-calculator/': ['How far does a yard of topsoil go?', ['Depth', 'Covers', 'Weighs'], [1, 2, 3, 4, 6].map((d) => [`${d} in`, `${fmtInt(324 / d)} sq ft`, '1.1 tons'])],
    '/sand-calculator/': ['Sand for an above-ground pool', ['Pool', 'Cu yd (2 in)', '50 lb bags'], [15, 18, 21, 24, 27].map((d) => { const yd = Math.PI * ((d + 2) / 2) ** 2 * 2 / 324; return [`${d} ft round`, yd.toFixed(1), String(Math.ceil(yd * 54 - 1e-9))]; })],
    '/polymeric-sand-calculator/': ['Polymeric sand: sq ft per bag', ['Paver', '⅛ in joint', '¼ in joint'], ['brick', '6x9', '12x12', '24x24'].map((k) => [POLY.pavers[k].name.replace(/ \(.*$/, ''), fmtInt(polyCover(POLY.pavers[k].l, POLY.pavers[k].w, 0.125)), fmtInt(polyCover(POLY.pavers[k].l, POLY.pavers[k].w, 0.25))])],
    '/deck-joist-span-calculator/': ['How far can a deck joist span?', ['Joist (16 in o.c.)', 'Southern pine', 'Hem-fir'], ['2x6', '2x8', '2x10', '2x12'].map((z) => [z.replace('x', '×'), ftInS(spanInches('syp', z, 16, DECK_LOAD('syp'))), ftInS(spanInches('hf', z, 16, DECK_LOAD('hf')))])],
    '/floor-joist-span-calculator/': ['Floor joist span chart', ['Joist (16 in o.c.)', 'Doug fir', 'SPF'], ['2x6', '2x8', '2x10', '2x12'].map((z) => [z.replace('x', '×'), ftInS(spanInches('dfl', z, 16, FLOOR_LOAD())), ftInS(spanInches('spf', z, 16, FLOOR_LOAD()))])],
    '/rafter-span-calculator/': ['How far can a rafter span?', ['Rafter (16 in)', '30 psf snow', '50 psf snow'], ['2x6', '2x8', '2x10', '2x12'].map((z) => [z.replace('x', '×'), ftInS(spanInches('dfl', z, 16, RAFTER_LOAD('snow30'))), ftInS(spanInches('dfl', z, 16, RAFTER_LOAD('snow50')))])],
    '/fertilizer-calculator/': ['How much fertilizer per 1,000 sq ft?', ['N-P-K', 'For 1 lb N'], ['10-10-10', '16-4-8', '24-0-6', '29-0-4', '32-0-4', '46-0-0'].map((v) => [v, `${(100 / Number(v.split('-')[0])).toFixed(1)} lb`])],
    '/drywall-calculator/': ['How many sheets of drywall?', ['Room', '4×8 sheets', '4×12'], [[10, 10], [12, 12], [12, 14], [14, 16]].map(([l, w]) => [`${l} × ${w} ft`, String(drywallRow(l, w).sheets), String(drywallRow(l, w, 8, 48).sheets)])],
  };
  const tools = ALL_TOOLS();
  return PIN_BOARDS.flatMap((b) => b.tools.map((path) => {
    const t = tools.find((x) => x[2] === path);
    const [q, head, rows] = P[path];
    const updated = [...BATCH5_TOOLS, ...BATCH5_VARIANTS].some((x) => x[2] === path) ? B5_UPDATED : TOOLS_UPDATED;
    return { slug: path.replace(/\//g, ''), path, board: b.id, icon: t[0], name: t[1], text: t[3], q, head, rows, updated };
  }));
}

function pinterestFeed(board, pins, meta) {
  const items = pins.filter((p) => p.board === board.id);
  const x = (s) => esc(s);
  const day = (d) => new Date(`${d}T12:00:00Z`).toUTCString();
  const pub = day(items.reduce((m, p) => (p.updated > m ? p.updated : m), TOOLS_UPDATED));
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${x(board.name)} | ${BRAND}</title>
<link>${SITE}/</link>
<atom:link href="${SITE}/feeds/pinterest-${board.id}.xml" rel="self" type="application/rss+xml"/>
<description>${x(board.desc)}</description>
<language>en-us</language>
<lastBuildDate>${pub}</lastBuildDate>
${items.map((p) => `<item>
<title>${x(`${p.q} Free ${p.name}`)}</title>
<link>${SITE}${p.path}?utm_source=pinterest&amp;utm_medium=social&amp;utm_campaign=${board.id}</link>
<guid isPermaLink="false">${SITE}${p.path}#pin-${p.updated}</guid>
<pubDate>${day(p.updated)}</pubDate>
<description>${x(`${p.q} ${p.text} Free ${p.name.toLowerCase()} from ${BRAND}: no sign-up, shows the math, works on your phone.`)}</description>
<enclosure url="${SITE}/assets/pins/${p.slug}.jpg" type="image/jpeg" length="${meta.pinBytes[p.slug] || 0}"/>
<media:content url="${SITE}/assets/pins/${p.slug}.jpg" medium="image" type="image/jpeg" width="1000" height="1500"/>
</item>`).join('\n')}
</channel>
</rss>
`;
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
  for (const p of [...batch5Pages(), ...batch4Pages(), ...batch3Pages(), ...batch2Pages(), ...stairPages(), ...gravelPages(), ...poolPages(), ...paverPages(), sodCalcPage(), seedCalcPage(), blockCalcPage(), retainingCalcPage()]) {
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
${[...BATCH1_TOOLS, ...BATCH1_VARIANTS, ...BATCH2_TOOLS, ...BATCH2_VARIANTS, ...BATCH3_TOOLS, ...BATCH3_VARIANTS, ...BATCH4_TOOLS, ...BATCH4_VARIANTS, ...BATCH5_TOOLS, ...BATCH5_VARIANTS].map((t) => `- [${t[1]}](${SITE}${t[2]}): ${t[3]}`).join('\n')}
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
  // Pinterest: pin data for scripts/make-og.mjs, and one RSS feed per board (Settings → Bulk create Pins → Auto-publish).
  const pins = pinData();
  await write('/pins.json', JSON.stringify(pins));
  const pinBytes = {};
  for (const p of pins) { try { pinBytes[p.slug] = (await readFile(`site-src/assets/pins/${p.slug}.jpg`)).length; } catch { /* run scripts/make-og.mjs */ } }
  for (const board of PIN_BOARDS) await write(`/feeds/pinterest-${board.id}.xml`, pinterestFeed(board, pins.filter((p) => pinBytes[p.slug]), { pinBytes }));
  // IndexNow key file: lets the deploy workflow tell Bing (which feeds ChatGPT search and Copilot) about changed pages.
  await write(`/${INDEXNOW_KEY}.txt`, INDEXNOW_KEY);
  await write('/CNAME', new URL(SITE).host + '\n');
  await write('/.nojekyll', '');

  // Content hash per indexable page, so the deploy can tell IndexNow about changed pages only.
  const hashes = {};
  for (const f of (await readdir(OUT, { recursive: true })).filter((x) => x.endsWith('.html')).sort()) {
    const path = '/' + f.replace(/\\/g, '/').replace(/(^|\/)index\.html$/, '$1');
    if (path === '/404.html' || path.startsWith('/embed/') && path !== '/embed/') continue;
    hashes[path] = createHash('sha1').update(await readFile(join(OUT, f))).digest('hex').slice(0, 16);
  }
  await write('/page-hashes.json', JSON.stringify(hashes));

  const count = (await readdir(OUT, { recursive: true })).filter((f) => f.endsWith('.html')).length;
  console.log(`Built ${count} HTML pages (${states.length} frost state pages, ${zones.length} zone state pages) into ${OUT}/`);
}

main().catch((e) => {
  console.error(`::error::${e.stack || e.message}`);
  process.exit(1);
});
