#!/usr/bin/env node
// Builds data/frost/ from NOAA's 1991–2020 U.S. Climate Normals (annual/seasonal, by station)
// and the Census Bureau's ZIP Code Tabulation Area centroids.
//
// Outputs
//   data/frost/stations.json        every US station with usable freeze statistics (site builder input)
//   data/frost/frost-dates-1991-2020.csv   the same table as a public download
//   data/frost/zip/<prefix>.json    ZIP -> 3 nearest stations, with those stations' records inlined
//   data/frost/meta.json
//
// Usage: node scripts/build-frost-data.mjs                         (downloads the official files)
//        node scripts/build-frost-data.mjs <normalsDir> <zcta.txt>  (local copies, for testing)
import { mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NORMALS_TGZ = 'https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020/archive/us-climate-normals_1991-2020_v1.0.1_annualseasonal_multivariate_by-station_c20230404.tar.gz';
const ZCTA_ZIP = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_zcta_national.zip';
const OUT = 'data/frost';
const NEAREST = 3;

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

// Words NOAA abbreviates in station names.
const WORDS = {
  AP: 'Airport', INTL: 'Intl', RGNL: 'Regional', MUNI: 'Municipal', CNTRL: 'Central', PK: 'Park', TWR: 'Tower',
  EXP: 'Experiment', STN: 'Station', FLD: 'Field', MTN: 'Mountain', MT: 'Mount', FT: 'Fort', ST: 'St',
  STE: 'Ste', CO: 'County', CTY: 'City', HTS: 'Heights', SPGS: 'Springs', SPRS: 'Springs', LK: 'Lake',
  RVR: 'River', RES: 'Reservoir', NWS: 'NWS', WSO: 'WSO', WFO: 'WFO', NWSFO: 'NWSFO', AFB: 'AFB', NAS: 'NAS',
  CRK: 'Creek', VLY: 'Valley', JCT: 'Junction', ISL: 'Island', BCH: 'Beach', PT: 'Point', UNIV: 'University',
  AG: 'Agricultural', CAA: 'CAA', WB: 'WB', DAM: 'Dam', RS: 'Ranger Station', HQ: 'HQ', USFS: 'USFS',
  NWR: 'NWR', IS: 'Island', CTR: 'Center', SCI: 'Science', FCST: 'Forecast', OFC: 'Office', MEM: 'Memorial', CNTY: 'County', RNGR: 'Ranger', NP: 'National Park', NM: 'National Monument', SP: 'State Park', TV: 'TV', ARPT: 'Airport',
};
const DIR = /^(\d+(\.\d+)?)?(N|S|E|W|NE|NW|SE|SW|NNE|NNW|ENE|ESE|SSE|SSW|WNW|WSW)$/;

function prettyName(raw) {
  return raw.split(/\s+/).filter(Boolean).map((w) => {
    if (DIR.test(w) || /^\d/.test(w)) return w;
    if (WORDS[w]) return WORDS[w];
    return w.charAt(0) + w.slice(1).toLowerCase();
  }).join(' ').replace(/\bMc([a-z])/g, (_, c) => 'Mc' + c.toUpperCase());
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': 'homegardenlot-frost-builder' } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

// Minimal CSV line parser for NOAA's quoted, comma-separated rows.
function splitCsv(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// NOAA freeze dates are "MM/DD"; -9999 with flag V = freeze possible all year,
// with flag Y = too few freezes to compute (frost-free in most years).
function freeze(row, key) {
  const v = (row[key] || '').trim();
  const flag = (row['meas_flag_' + key] || '').trim();
  if (/^\d\d\/\d\d$/.test(v)) return v.replace('/', '-');
  if (flag === 'V') return 'all';
  if (flag === 'Y') return 'rare';
  return null;
}
const num = (row, key) => {
  const v = parseFloat(row[key]);
  return Number.isFinite(v) && v > -9000 ? v : null;
};

function parseStation(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const head = splitCsv(lines[0]).map((h) => h.trim());
  const vals = splitCsv(lines[1]);
  const row = {};
  head.forEach((h, i) => { row[h] = vals[i] ?? ''; });
  const m = /^(.*),\s*([A-Z]{2})\s+US\s*$/.exec((row.NAME || '').trim());
  if (!m || !STATES[m[2]]) return null;
  const s = {
    id: row.STATION.trim(),
    name: prettyName(m[1].trim()),
    st: m[2],
    lat: +parseFloat(row.LATITUDE).toFixed(4),
    lon: +parseFloat(row.LONGITUDE).toFixed(4),
    elevFt: Math.round(parseFloat(row.ELEVATION) * 3.28084),
    last50: freeze(row, 'ANN-TMIN-PRBLST-T32FP50'),
    last10: freeze(row, 'ANN-TMIN-PRBLST-T32FP10'),
    last90: freeze(row, 'ANN-TMIN-PRBLST-T32FP90'),
    first50: freeze(row, 'ANN-TMIN-PRBFST-T32FP50'),
    first10: freeze(row, 'ANN-TMIN-PRBFST-T32FP10'),
    first90: freeze(row, 'ANN-TMIN-PRBFST-T32FP90'),
    hard50: freeze(row, 'ANN-TMIN-PRBLST-T28FP50'),
    hardFirst50: freeze(row, 'ANN-TMIN-PRBFST-T28FP50'),
    season50: num(row, 'ANN-TMIN-PRBGSL-T32FP50'),
    years: parseInt(row['years_ANN-TMIN-PRBLST-T32FP50'], 10) || null,
    comp: (row['comp_flag_ANN-TMIN-PRBLST-T32FP50'] || '').trim() || null,
  };
  // Y ("rare") is only trustworthy when the growing season really is year-round.
  if (s.last50 === 'rare' && s.season50 !== null && s.season50 < 365) return null;
  if (!s.last50 || !s.first50) return null;
  if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) return null;
  return s;
}

function parseZcta(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const head = lines.shift().split('\t').map((h) => h.trim().toUpperCase());
  const zi = head.indexOf('GEOID');
  const la = head.indexOf('INTPTLAT');
  const lo = head.indexOf('INTPTLONG');
  if (zi < 0 || la < 0 || lo < 0) throw new Error(`ZCTA file: unexpected columns ${head.join(', ')}`);
  return lines.map((l) => {
    const c = l.split('\t');
    return { zip: c[zi].trim(), lat: parseFloat(c[la]), lon: parseFloat(c[lo]) };
  }).filter((z) => /^\d{5}$/.test(z.zip) && Number.isFinite(z.lat) && Number.isFinite(z.lon));
}

const RAD = Math.PI / 180;
function miles(aLat, aLon, bLat, bLon) {
  const dLat = (bLat - aLat) * RAD;
  const dLon = (bLon - aLon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

// Brute force over all stations with a cheap planar distance, then exact miles for the winners.
function nearestFinder(stations) {
  const lat = Float64Array.from(stations, (s) => s.lat);
  const lon = Float64Array.from(stations, (s) => s.lon);
  return (zLat, zLon) => {
    const k = Math.cos(zLat * RAD) ** 2;
    const best = [];
    for (let i = 0; i < lat.length; i++) {
      const dy = lat[i] - zLat;
      let dx = Math.abs(lon[i] - zLon);
      if (dx > 180) dx = 360 - dx;
      const d = dy * dy + dx * dx * k;
      if (best.length < NEAREST || d < best[best.length - 1][1]) {
        best.push([i, d]);
        best.sort((x, y) => x[1] - y[1]);
        if (best.length > NEAREST) best.pop();
      }
    }
    return best.map(([i]) => [i, miles(zLat, zLon, lat[i], lon[i])]).sort((x, y) => x[1] - y[1]);
  };
}

const CSV_COLS = [
  ['station_id', 'id'], ['station_name', 'name'], ['state', 'st'], ['latitude', 'lat'], ['longitude', 'lon'],
  ['elevation_ft', 'elevFt'], ['last_frost_32f_median', 'last50'], ['last_frost_32f_10pct_risk', 'last10'],
  ['last_frost_32f_90pct_risk', 'last90'], ['first_frost_32f_median', 'first50'],
  ['first_frost_32f_10pct_risk', 'first10'], ['first_frost_32f_90pct_risk', 'first90'],
  ['last_hard_freeze_28f_median', 'hard50'], ['first_hard_freeze_28f_median', 'hardFirst50'],
  ['frost_free_days_median', 'season50'], ['years_of_data', 'years'],
];
const csvCell = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

async function main() {
  const [localNormals, localZcta] = process.argv.slice(2);
  const work = join(tmpdir(), 'hgl-frost');
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });

  let normalsDir = localNormals;
  if (!normalsDir) {
    console.log('Downloading NOAA normals archive…');
    await download(NORMALS_TGZ, join(work, 'normals.tgz'));
    normalsDir = join(work, 'normals');
    await mkdir(normalsDir);
    execFileSync('tar', ['-xzf', join(work, 'normals.tgz'), '-C', normalsDir]);
  }
  let zctaText;
  if (localZcta) zctaText = await readFile(localZcta, 'utf8');
  else {
    console.log('Downloading Census ZCTA centroids…');
    await download(ZCTA_ZIP, join(work, 'zcta.zip'));
    zctaText = execFileSync('unzip', ['-p', join(work, 'zcta.zip')], { maxBuffer: 64 << 20 }).toString('utf8');
  }

  const files = (await readdir(normalsDir, { recursive: true })).filter((f) => f.toLowerCase().endsWith('.csv'));
  const stations = [];
  for (const f of files) {
    const s = parseStation(await readFile(join(normalsDir, f), 'utf8'));
    if (s) stations.push(s);
  }
  stations.sort((a, b) => a.st.localeCompare(b.st) || a.name.localeCompare(b.name));
  console.log(`${files.length} station files → ${stations.length} US stations with freeze dates`);
  if (!localNormals && stations.length < 3000) throw new Error(`Only ${stations.length} stations parsed; refusing to overwrite the data`);

  const zctas = parseZcta(zctaText);
  console.log(`${zctas.length} ZIP code centroids`);
  if (!localZcta && zctas.length < 30000) throw new Error(`Only ${zctas.length} ZIPs parsed; refusing to overwrite the data`);

  const nearest = nearestFinder(stations);
  const groups = {};
  let far = 0;
  for (const z of zctas) {
    const near = nearest(z.lat, z.lon);
    if (!near.length) continue;
    if (near[0][1] > 50) far++;
    const g = (groups[z.zip.slice(0, 3)] ||= { s: {}, z: {} });
    g.z[z.zip] = near.map(([i, d]) => {
      const s = stations[i];
      g.s[s.id] ||= [s.name, s.st, s.lat, s.lon, s.elevFt, s.last50, s.last10, s.first50, s.first10, s.season50, s.hard50, s.hardFirst50];
      return [s.id, Math.round(d * 10) / 10];
    });
  }

  await rm(OUT, { recursive: true, force: true });
  await mkdir(join(OUT, 'zip'), { recursive: true });
  for (const [prefix, g] of Object.entries(groups)) await writeFile(join(OUT, 'zip', `${prefix}.json`), JSON.stringify(g));
  await writeFile(join(OUT, 'stations.json'), JSON.stringify(stations));
  await writeFile(join(OUT, 'frost-dates-1991-2020.csv'),
    CSV_COLS.map((c) => c[0]).join(',') + '\n' + stations.map((s) => CSV_COLS.map((c) => csvCell(s[c[1]])).join(',')).join('\n') + '\n');
  await writeFile(join(OUT, 'meta.json'), JSON.stringify({
    source: 'NOAA NCEI U.S. Climate Normals 1991–2020 (annual/seasonal, by station); U.S. Census Bureau 2024 ZCTA Gazetteer',
    normals: NORMALS_TGZ,
    zcta: ZCTA_ZIP,
    stations: stations.length,
    zips: zctas.length,
    zipsOver50Miles: far,
    files: Object.keys(groups).length,
    built: new Date().toISOString().slice(0, 10),
    fields: {
      last50: 'date with a 50% chance of a 32°F freeze on or after it (median last spring frost)',
      last10: 'date with a 10% chance of a 32°F freeze on or after it',
      first50: 'date with a 50% chance of a 32°F freeze on or before it (median first fall frost)',
      first10: 'date with a 10% chance of a 32°F freeze on or before it',
      season50: 'median 32°F freeze-free days',
      special: '"rare" = freezes too infrequent to compute (frost-free in most years); "all" = freeze possible in any month',
    },
  }, null, 2) + '\n');
  console.log(`Wrote ${Object.keys(groups).length} ZIP files; ${far} ZIPs are more than 50 miles from a station`);
}

main().catch((e) => {
  console.error(`::error::${e.message}`);
  process.exit(1);
});
