#!/usr/bin/env node
// Renders share images into site-src/assets/: og/<slug>.jpg (1200×630, used as og:image by build-site.mjs)
// and pins/<slug>.jpg (1000×1500 Pinterest pins with a reference chart). Run locally after adding a tool:
//   node scripts/make-og.mjs        (needs Playwright with Chromium installed)
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const TOOLS = [
  ['stair-calculator', '🪜', 'Stair Calculator', 'Risers = rise ÷ 7¾ in, rounded up'],
  ['stair-stringer-calculator', '🪚', 'Stair Stringer Calculator', 'Layout, length, bottom cut & throat'],
  ['gravel-calculator', '🪨', 'Gravel Calculator', 'Cu yd = sq ft × depth (in) ÷ 324'],
  ['pea-gravel-calculator', '⚪', 'Pea Gravel Calculator', '1 cu yd covers 108 sq ft at 3 in'],
  ['driveway-gravel-calculator', '🚗', 'Driveway Gravel Calculator', 'Tons for base, middle & top layers'],
  ['pool-volume-calculator', '🏊', 'Pool Volume Calculator', 'Gallons = L × W × avg depth × 7.48'],
  ['pool-salt-calculator', '🧂', 'Pool Salt Calculator', 'lb = gal × 8.34 × ppm ÷ 1,000,000'],
  ['pool-shock-calculator', '⚗️', 'Pool Shock Calculator', 'Cal-hypo, dichlor, liquid & SLAM'],
  ['paver-calculator', '🧱', 'Paver Calculator', 'Pavers, base, sand & edging'],
  ['paver-base-calculator', '⛏️', 'Paver Base Calculator', '4 in patio · 8–12 in driveway'],
  ['sod-calculator', '🌾', 'Sod Calculator', 'Pallets, slabs, rolls & cost'],
  ['grass-seed-calculator', '🌱', 'Grass Seed Calculator', 'lb per 1,000 sq ft by grass type'],
  ['concrete-block-calculator', '🧱', 'Concrete Block Calculator', '1.125 blocks per sq ft (8×8×16)'],
  ['retaining-wall-calculator', '🪨', 'Retaining Wall Calculator', 'Blocks, caps, base & drainage'],
  ['hardiness-zones', '🌡️', 'Hardiness Zone by ZIP', 'USDA 2023 map + your frost dates'],
  ['frost-dates', '❄️', 'Frost Dates by ZIP', 'NOAA 1991–2020 normals'],
];
const PINS = {
  'stair-calculator': ['How many stairs do I need?', ['Total rise', 'Risers', 'Riser'], [['36 in', '5', '7 3/16 in'], ['48 in', '7', '6 7/8 in'], ['72 in', '10', '7 3/16 in'], ['96 in', '13', '7 3/8 in'], ['108 in', '14', '7 11/16 in'], ['120 in', '16', '7 1/2 in']]],
  'gravel-calculator': ['How far does a yard of gravel go?', ['Depth', 'Covers', 'Weighs'], [['2 in', '162 sq ft', '1.4 tons'], ['3 in', '108 sq ft', '1.4 tons'], ['4 in', '81 sq ft', '1.4 tons'], ['6 in', '54 sq ft', '1.4 tons']]],
  'pool-volume-calculator': ['How many gallons is my pool?', ['Pool', 'Depth', 'Gallons'], [['16 × 32 ft', '4.5 ft avg', '17,200'], ['18 × 36 ft', '4.5 ft avg', '21,800'], ['20 × 40 ft', '4.5 ft avg', '26,900'], ['18 ft round', '4 ft', '7,600'], ['24 ft round', '4 ft', '13,600']]],
  'paver-calculator': ['How many pavers per square foot?', ['Paver', 'Per sq ft', 'Per 100 sq ft'], [['4 × 8 in', '4.50', '473'], ['6 × 6 in', '4.00', '420'], ['6 × 9 in', '2.67', '280'], ['12 × 12 in', '1.00', '105'], ['16 × 16 in', '0.56', '60']]],
};

const css = `*{box-sizing:border-box;margin:0}body{font-family:Inter,system-ui,"Segoe UI",Roboto,Arial,sans-serif;background:#142c1e;color:#fff}
.card{position:relative;overflow:hidden;background:linear-gradient(135deg,#1b5e37 0%,#142c1e 70%)}
.brand{display:flex;align-items:center;gap:14px;font-weight:800;font-size:30px;letter-spacing:-.01em}.brand b{color:#86efac;font-weight:700}
.leaf{width:48px;height:48px}.icon{font-size:120px;line-height:1}
h1{font-size:76px;line-height:1.05;letter-spacing:-.03em;font-weight:800}
.sub{font-size:36px;color:#d4ecdb;font-weight:600}.pill{display:inline-block;background:#86efac;color:#14532d;font-weight:800;border-radius:999px;padding:10px 24px;font-size:28px}
.url{font-size:26px;color:#a7c4b0}table{border-collapse:collapse;width:100%;font-size:38px}
th{text-align:left;color:#86efac;font-size:28px;text-transform:uppercase;letter-spacing:.05em;padding:14px 18px;border-bottom:3px solid #86efac}
td{padding:20px 18px;border-bottom:2px solid rgba(255,255,255,.15);font-weight:600}`;
const leaf = '<svg class="leaf" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#86efac"/><path d="M9 23c0-8 5-13 14-14-1 9-6 14-14 14Zm0 0 7-7" fill="none" stroke="#14532d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const brand = `<div class="brand">${leaf}<span>Home Garden Lot <b>Tools</b></span></div>`;

const og = ([slug, icon, name, sub]) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}
.card{width:1200px;height:630px;padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between}
.row{display:flex;align-items:center;gap:40px}</style></head><body><div class="card">${brand}
<div class="row"><div class="icon">${icon}</div><div><h1>${name}</h1><p class="sub" style="margin-top:18px">${sub}</p></div></div>
<div class="row" style="justify-content:space-between"><span class="pill">Free · Shows the math</span><span class="url">tools.homegardenlot.com/${slug}/</span></div></div></body></html>`;

const pin = (slug, [q, head, rows]) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}
.card{width:1000px;height:1500px;padding:72px 64px;display:flex;flex-direction:column;gap:48px}
h1{font-size:84px}</style></head><body><div class="card">${brand}<h1>${q}</h1>
<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>
<div style="margin-top:auto"><p class="sub">Your exact numbers, free:</p><p class="pill" style="margin-top:16px;font-size:27px">tools.homegardenlot.com/${slug}/</p></div></div></body></html>`;

async function main() {
  await mkdir('site-src/assets/og', { recursive: true });
  await mkdir('site-src/assets/pins', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const t of TOOLS) {
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.setContent(og(t));
    await page.screenshot({ path: `site-src/assets/og/${t[0]}.jpg`, type: 'jpeg', quality: 82 });
  }
  for (const [slug, data] of Object.entries(PINS)) {
    await page.setViewportSize({ width: 1000, height: 1500 });
    await page.setContent(pin(slug, data));
    await page.screenshot({ path: `site-src/assets/pins/${slug}.jpg`, type: 'jpeg', quality: 85 });
  }
  await browser.close();
  console.log(`Wrote ${TOOLS.length} share images and ${Object.keys(PINS).length} pins`);
}

main().catch((e) => { console.error(e); process.exit(1); });
