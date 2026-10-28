#!/usr/bin/env node
// Builds data/zones/<first 3 ZIP digits>.json ({"10001":"7b",…}) from the USDA 2023
// Plant Hardiness Zone Map ZIP files published by the PRISM Climate Group (Oregon State University).
// The planting calendar loads only the one small file for the visitor's ZIP prefix.
//
// Usage: node scripts/build-zone-data.mjs            (downloads the official files)
//        node scripts/build-zone-data.mjs a.csv b.csv (local files, for testing)
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';

const SOURCES = [
  'https://prism.oregonstate.edu/phzm/data/2023/phzm_us_zipcode_2023.csv',
  'https://prism.oregonstate.edu/phzm/data/2023/phzm_ak_zipcode_2023.csv',
  'https://prism.oregonstate.edu/phzm/data/2023/phzm_hi_zipcode_2023.csv',
  'https://prism.oregonstate.edu/phzm/data/2023/phzm_pr_zipcode_2023.csv',
];
const OUT = 'data/zones';

async function load(src) {
  if (!/^https?:/.test(src)) return readFile(src, 'utf8');
  const res = await fetch(src, { headers: { 'User-Agent': 'homegardenlot-zone-builder' } });
  if (!res.ok) throw new Error(`${src} → HTTP ${res.status}`);
  return res.text();
}

function parse(csv, src) {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const head = lines.shift().split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));
  const zi = head.indexOf('zipcode');
  const zo = head.indexOf('zone');
  if (zi < 0 || zo < 0) throw new Error(`${src}: expected "zipcode" and "zone" columns, got ${head.join(', ')}`);
  const rows = [];
  for (const line of lines) {
    const cols = line.split(',').map((c) => c.trim().replace(/"/g, ''));
    const zip = cols[zi].padStart(5, '0');
    const zone = cols[zo];
    if (/^\d{5}$/.test(zip) && /^\d{1,2}[ab]$/.test(zone)) rows.push([zip, zone]);
  }
  if (!rows.length) throw new Error(`${src}: no valid rows`);
  return rows;
}

async function main() {
  const srcs = process.argv.slice(2).length ? process.argv.slice(2) : SOURCES;
  const groups = {};
  let total = 0;
  for (const src of srcs) {
    const rows = parse(await load(src), src);
    for (const [zip, zone] of rows) {
      (groups[zip.slice(0, 3)] ||= {})[zip] = zone;
      total++;
    }
    console.log(`${src}: ${rows.length} ZIPs`);
  }
  if (total < 1000 && srcs === SOURCES) throw new Error(`Only ${total} ZIPs parsed; refusing to overwrite the data`);

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  for (const [prefix, map] of Object.entries(groups)) {
    await writeFile(`${OUT}/${prefix}.json`, JSON.stringify(map));
  }
  await writeFile(`${OUT}/meta.json`, JSON.stringify({
    source: 'USDA Plant Hardiness Zone Map (2023), USDA-ARS and PRISM Climate Group, Oregon State University',
    url: 'https://prism.oregonstate.edu/phzm/',
    zips: total,
    files: Object.keys(groups).length,
    built: new Date().toISOString().slice(0, 10),
  }, null, 2) + '\n');
  console.log(`Wrote ${Object.keys(groups).length} files covering ${total} ZIP codes to ${OUT}/`);
}

main().catch((e) => {
  console.error(`::error::${e.message}`);
  process.exit(1);
});
