# MTG sealed tracker (Singapore)

Tracks prices and stock of Magic: The Gathering sealed products across Singapore shops, one set at a time
(it starts with **Star Trek**).

**Dashboard: https://cheokjiade.github.io/mtg-sealed-tracker/**
A GitHub Action scrapes every 6 hours and commits JSON to `docs/data/`. GitHub Pages serves the dashboard from `docs/`.

## Layout

| Path | What |
|---|---|
| `config.json` | Shops, sets (and where each shop lists them), product patterns. **This is the file you edit.** |
| `scraper/adapters.mjs` | One function per shop `type` |
| `scraper/core.mjs` | Title → product classification, and merging each run into stored data |
| `scraper/scrape.mjs` | Runs every shop × set and writes `docs/data/latest.json` and `history.json` |
| `scraper/test.mjs` | `npm test` |
| `scraper/probe.mjs` | `npm run probe -- <url>`: identifies a site's platform and the adapter type to use |
| `AGENTS.md`, `CLAUDE.md`, `.claude/skills/` | Rules and playbooks for the AI agents that maintain this repo |
| `docs/index.html` | Dashboard (static, Chart.js) |
| `.github/workflows/scrape.yml` | Scheduled scrape that commits the data |

## Adding a set

Add an entry to `sets` in `config.json`. `match` is a regex a listing title must satisfy to belong to the set. `sources` says
where each shop lists it, and is merged over that shop's entry in `shops`:

```json
{ "id": "eoe", "name": "Edge of Eternities", "match": "edge of eternities|\\bEOE\\b",
  "sources": {
    "greyogre": { "url": "https://greyogregames.com/collections/<that-set's-collection>" },
    "wargames": { "search": "edge of eternities" }
  } }
```

Product types (`products`) are shared by every set. The dashboard has a set picker, and links look like `#trk/play-box`.
Run one set with `npm run scrape -- eoe`.

## Adding a shop

Add an entry to `shops` in `config.json` (its `url` is the homepage), then add it to each set's `sources`. Pick the `type` that matches the site:

| type | Site | Needs |
|---|---|---|
| type | Site | Set source needs |
|---|---|---|
| `shopify` | Shopify store (`cdn.shopify.com` in the page source) | `url` of a collection page |
| `woocommerce` | WordPress + WooCommerce | `search` (the shop `url` is the site root) |
| `easystore` | EasyStore store (`cdn.store-assets.com`) | `url` of a collection page |
| `playwright` | Anything else, rendered in headless Chromium | `url` of a listing page, and `selectors` on the shop |

```json
{ "id": "myshop", "name": "My Shop", "type": "playwright", "url": "https://example.sg",
  "selectors": { "item": ".product", "title": ".name", "price": ".price", "link": "a",
                 "soldOut": ".sold-out", "stock": ".qty-left" },
  "shipping": { "cost": 8, "freeFrom": 150 } }
```

`soldOut` (its presence means out of stock) and `stock` (text such as "Only 3 left") are optional.
Pages are followed through the next-page link (`rel="next"` or `aria-label="Next"` by default; set `selectors.next` if a
site differs), up to 20 pages. Shopify and WooCommerce paginate through their APIs.
When a card shows a price range, the scraper opens the product page and reads each variant from its schema.org JSON-LD.
A site that fits none of these types gets a new function in `adapters.mjs`, named after its `type`.

Test one shop with `npm run scrape -- myshop`.

## Shipping

Give a shop `"shipping": { "cost": 8, "freeFrom": 150 }` (`freeFrom` is optional). The dashboard's
**Include shipping** toggle then adds the fee to items priced below the free-shipping threshold. Shops without
the field show `ship ?` and count as free.

## Products

`products` in `config.json` maps listing titles to products with case-insensitive regexes. **The first match wins**,
so specific entries (a set of 4 Commander decks) come before general ones (one Commander deck). Titles must also
match the set's `match`. Unmatched titles are printed as `skip` in the scrape log. Add a pattern when a real
product is being skipped.

## Data

- `docs/data/latest.json`: current listing per URL (set, product, price, inStock, stock, firstSeen, lastSeen) and shop status.
- `docs/data/history.json`: one row only when a listing's price or stock state changes, so it stays small.

A run only saves (and the Action only commits) when a listing, price, stock state or shop status changed, or once a
day as a heartbeat, so `updated` is never more than about a day old.

All prices are SGD. Shops geo-convert by visitor IP and GitHub's runners are in the US, so the scraper asks for the
Singapore market and **fails a shop rather than record prices in another currency**.

If a shop's scrape fails, its last known listings are kept. A listing that disappears from a shop is marked out of stock.

## Not covered

Shopee blocks headless browsers with a login / traffic-verification wall, so Shopee listings aren't scraped.

## Local

```
npm install
npx playwright install chromium
npm test
npm run scrape
python -m http.server -d docs 8000   # then open http://localhost:8000
```
