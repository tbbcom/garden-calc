# garden-calc
This space is created for Garden Calculator on website homegardenlot.com

## Tools

| Tool | File | Live page |
|---|---|---|
| Advanced Mulch Calculator v2 | `mulch-calculator/mulch-calculator.html` | https://www.homegardenlot.com/p/mulch-calculator.html |
| Planting Calendar by ZIP Code | `planting-calendar/planting-calendar.html` | https://www.homegardenlot.com/p/planting-calendar.html (new page) |

Each tool file is a self-contained block (scoped CSS + vanilla JS + JSON-LD + article).
To update a live page: Blogger → Pages → open the page → **HTML view** → replace everything with the file's contents → Update. Keep the same page so its URL and rankings are preserved.

### Planting calendar data
`data/zones/<first 3 ZIP digits>.json` maps each ZIP to its 2023 USDA hardiness zone (USDA-ARS / PRISM Climate Group, Oregon State University). It's built by `scripts/build-zone-data.mjs` in the **Build zone data** GitHub Action (runs automatically when the builder changes, yearly on 2 January, or manually) and served to the page through jsDelivr, with raw.githubusercontent.com as a fallback. If both are unavailable, visitors pick their zone from the list instead.
