#!/usr/bin/env node
// Renders share images into site-src/assets/: og/<slug>.jpg (1200×630, used as og:image by build-site.mjs)
// and pins/<slug>.jpg (1000×1500 Pinterest pins with a reference chart). Run locally after adding a tool:
//   node scripts/build-site.mjs && node scripts/make-og.mjs && node scripts/build-site.mjs
// (needs Playwright with Chromium; the second build picks up the new images for og:image and the Pinterest feeds)
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

// Tool names, icons and pin charts come from _site/pins.json, written by build-site.mjs.
const PINS = JSON.parse(readFileSync('_site/pins.json', 'utf8'));
const TOOLS = PINS.map((p) => [p.slug, p.icon, p.name, p.text]);

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
  for (const p of PINS) {
    await page.setViewportSize({ width: 1000, height: 1500 });
    await page.setContent(pin(p.slug, [p.q, p.head, p.rows]));
    await page.screenshot({ path: `site-src/assets/pins/${p.slug}.jpg`, type: 'jpeg', quality: 85 });
  }
  await browser.close();
  console.log(`Wrote ${TOOLS.length} share images and ${PINS.length} pins`);
}

main().catch((e) => { console.error(e); process.exit(1); });
