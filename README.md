# MTG sealed tracker (Singapore)

Tracks prices and stock of **Magic: The Gathering | Star Trek** sealed products across Singapore shops.
A GitHub Action scrapes every 6 hours and commits JSON to `docs/data/`. GitHub Pages serves the dashboard from `docs/`.

## Layout

| Path | What |
|---|---|
| `config.json` | Shops to scrape and product patterns. **This is the file you edit.** |
| `scraper/adapters.mjs` | One function per shop `type` |
| `scraper/core.mjs` | Title → product classification, and merging each run into stored data |
| `scraper/scrape.mjs` | Runs every shop and writes `docs/data/latest.json` and `history.json` |
| `scraper/test.mjs` | `npm test` |
| `docs/index.html` | Dashboard (static, Chart.js) |
| `.github/workflows/scrape.yml` | Scheduled scrape that commits the data |

## Adding a shop

Add an entry to `shops` in `config.json`. Pick the `type` that matches the site:

| type | Site | Needs |
|---|---|---|
| `shopify` | Shopify store (`cdn.shopify.com` in the page source) | `url` of a collection page |
| `woocommerce` | WordPress + WooCommerce | `url` (site root) and `search` |
| `easystore` | EasyStore store (`cdn.store-assets.com`) | `url` of a collection page |
| `playwright` | Anything else, rendered in headless Chromium | `url` and `selectors` (see below) |

```json
{ "id": "myshop", "name": "My Shop", "type": "playwright", "url": "https://example.sg/star-trek",
  "selectors": { "item": ".product", "title": ".name", "price": ".price", "link": "a",
                 "soldOut": ".sold-out", "stock": ".qty-left" },
  "shipping": { "cost": 8, "freeFrom": 150 } }
```

`soldOut` (its presence means out of stock) and `stock` (text such as "Only 3 left") are optional.
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
mention Star Trek / TRK / TRC. Unmatched titles are printed as `skip` in the scrape log. Add a pattern when a real
product is being skipped. To track another set, change `STAR_TREK` in `core.mjs` and the patterns.

## Data

- `docs/data/latest.json`: current listing per URL (price, inStock, stock, firstSeen, lastSeen) and shop status.
- `docs/data/history.json`: one row only when a listing's price or stock state changes, so it stays small.

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
