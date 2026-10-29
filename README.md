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

## tool.homegardenlot.com (GitHub Pages)

A static companion site for data-driven tools, built by `scripts/build-site.mjs` from `site-src/` and `data/frost/` and deployed by the **Deploy tool site** workflow.

| Page | What it is |
|---|---|
| `/frost-dates/` | Frost dates by ZIP code (nearest of ~7,200 NOAA stations) |
| `/frost-dates/<state>/` | Town-by-town frost tables for 50 states, with data-derived insights |
| `/data/` | Free CSV download (CC BY 4.0) for journalists, bloggers and teachers |
| `/embed/` | One-line embeddable frost-date widget with a credit link |
| `/about/` | Sources, method and limits |

**Data:** `data/frost/` is built by `scripts/build-frost-data.mjs` in the **Build frost data** workflow from NOAA NCEI 1991–2020 U.S. Climate Normals and Census 2024 ZCTA centroids. It runs when the builder changes, every 3 January, or on demand; each run redeploys the site. The Blogger planting calendar reads the same ZIP files through jsDelivr, so both sites show identical dates.

**One-time setup**
1. DNS at your domain registrar: add a `CNAME` record, host `tool`, value `tbbcom.github.io`.
2. GitHub → this repo → Settings → Pages → Source: **GitHub Actions**. Custom domain: `tool.homegardenlot.com` → Save → tick **Enforce HTTPS** once the certificate is issued (up to 24 h).
3. Recommended: GitHub → your profile/organization Settings → Pages → **Add a verified domain** → `homegardenlot.com` (prevents subdomain takeover).
4. Google Search Console: add a **Domain** property for `homegardenlot.com` (covers the subdomain), then submit `https://tool.homegardenlot.com/sitemap.xml`.

**Local preview:** `node scripts/build-site.mjs && cd _site && python3 -m http.server`
