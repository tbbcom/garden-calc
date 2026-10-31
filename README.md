# garden-calc
This space is created for Garden Calculator on website homegardenlot.com

## Tools

| Tool | File | Live page |
|---|---|---|
| Advanced Mulch Calculator v2 | `mulch-calculator/mulch-calculator.html` | https://www.homegardenlot.com/p/mulch-calculator.html |
| Planting Calendar by ZIP Code | `planting-calendar/planting-calendar.html` | https://www.homegardenlot.com/p/planting-calendar.html |

Each tool file is a self-contained block (scoped CSS + vanilla JS + JSON-LD + article).
To update a live page: Blogger → Pages → open the page → **HTML view** → replace everything with the file's contents → Update. Keep the same page so its URL and rankings are preserved.

### Planting calendar data
`data/zones/<first 3 ZIP digits>.json` maps each ZIP to its 2023 USDA hardiness zone (USDA-ARS / PRISM Climate Group, Oregon State University). It's built by `scripts/build-zone-data.mjs` in the **Build zone data** GitHub Action (runs automatically when the builder changes, yearly on 2 January, or manually) and served to the page through jsDelivr, with raw.githubusercontent.com as a fallback. If both are unavailable, visitors pick their zone from the list instead.

## tools.homegardenlot.com (GitHub Pages)

A static companion site for data-driven tools, built by `scripts/build-site.mjs` from `site-src/` and `data/frost/` and deployed by the **Deploy tool site** workflow.

| Page | What it is |
|---|---|
| `/frost-dates/` | Frost dates by ZIP code (nearest of ~7,200 NOAA stations) |
| `/frost-dates/<state>/` | Town-by-town frost tables for 50 states, with data-derived insights |
| `/hardiness-zones/` | USDA 2023 hardiness zone by ZIP code, with the zone's temperature range and local frost dates |
| `/hardiness-zones/<state>/` | Zone share by ZIP code, zones and frost dates by town, and same-zone frost-date spread for 50 states, D.C. and Puerto Rico |
| `/concrete-block-calculator/` | CMU blocks course by course, mortar bags, core grout, rebar, ladder wire and footing concrete for several walls, with cost, diagram, shareable link and print list |
| `/retaining-wall-calculator/` | Segmental wall and cap blocks with buried courses, base gravel, drainage stone, drain pipe and fabric, with height warnings |
| `/data/` | Free CSV download (CC BY 4.0) for journalists, bloggers and teachers |
| `/embed/` | One-line embeddable frost-date widget with a credit link |
| `/about/` | Sources, method and limits |
| `/contact/`, `/privacy/`, `/terms/` | Tool-site trust pages, linked to the main site's full policies |

**Zones:** the zone pages read `data/zones/` (see *Planting calendar data* above). ZIP codes are grouped into states by USPS prefix (`scripts/zip-state.mjs`); each NOAA station gets the zone of the nearest ZIP code within 8 miles. A **Build zone data** run redeploys the site.

**Data:** `data/frost/` is built by `scripts/build-frost-data.mjs` in the **Build frost data** workflow from NOAA NCEI 1991–2020 U.S. Climate Normals and Census 2024 ZCTA centroids. It runs when the builder changes, every 3 January, or on demand; each run redeploys the site. The Blogger planting calendar reads the same ZIP files through jsDelivr, so both sites show identical dates.

**One-time setup**
1. DNS at your domain registrar: add a `CNAME` record, host `tools`, value `tbbcom.github.io`.
2. GitHub → this repo → Settings → Pages → Source: **GitHub Actions**. Custom domain: `tools.homegardenlot.com` → Save → tick **Enforce HTTPS** once the certificate is issued (up to 24 h).
3. Recommended: GitHub → your profile/organization Settings → Pages → **Add a verified domain** → `homegardenlot.com` (prevents subdomain takeover).
4. Google Search Console: add a **Domain** property for `homegardenlot.com` (covers the subdomain), then submit `https://tools.homegardenlot.com/sitemap.xml`.

**Google Tag Manager (optional):** repo Settings → Secrets and variables → Actions → **Variables** → New variable `GTM_ID` = `GTM-XXXXXXX`, then re-run **Deploy tool site**. The build adds Consent Mode v2 defaults (denied in the EEA/UK/CH until consent), loads GTM after the page is idle so it doesn't hurt LCP/INP, and switches the privacy notice to describe analytics. Custom events pushed to the dataLayer: `frost_lookup` (with `frost_state`, never the ZIP) and `embed_code_copy`.

**Local preview:** `node scripts/build-site.mjs && cd _site && python3 -m http.server`
