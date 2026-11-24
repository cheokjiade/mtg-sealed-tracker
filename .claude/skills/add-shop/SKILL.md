---
name: add-shop
description: Add a Singapore shop to the price tracker given its URL (collection page, category page or product page). Use when asked to track, add or monitor a new shop or store URL.
---

# Add a shop

1. **Probe:** `npm run probe -- <url>`. Use a collection or category listing URL if you have one. For a single product URL, find the shop's collection for the set first. On Shopify, `<origin>/search/suggest.json?q=<set name>&resources[type]=collection` lists collection handles.
2. **Pick the type** from the probe:
   - `shopify ✓`: type `shopify`. The source is `{ "url": "<origin>/collections/<handle>" }`. Prefer a *sealed* collection over a whole-set collection that includes singles.
   - `woocommerce ✓`: type `woocommerce`, shop `url` = site root. The source is `{ "search": "<set name>" }`.
   - `easystore ✓`: type `easystore`. The source is `{ "url": "<collection url>" }`.
   - Bot or login wall: stop. Add the shop to README "Not covered" and tell the user. Never bypass it.
   - Otherwise: type `playwright`. Open the page in a browser, find a CSS selector for one product card (`item`) and, inside it, `title`, `price` and `link`, plus optional `soldOut` and `stock`. Put `selectors` on the shop entry.
3. **Edit `config.json`:** append to `shops` (never reorder, because order sets dashboard colors): `{ "id", "name", "type", "url": "<homepage>" }`. Then add `"<id>": { ...source }` under each relevant set's `sources`.
4. **Shipping:** if the shop's shipping or FAQ page states a fee, add `"shipping": { "cost": N, "freeFrom": M }`. Never guess.
5. **Verify:** `npm test`, then `npm run scrape -- <id>`. Check the log:
   - The listing count looks right compared to the page.
   - `skip (no product match)` lines that are real sealed products: fix them as in the `triage-scrape` skill.
   - Spot-check two or three prices in `docs/data/latest.json` against the live site. A price that is far too low usually means a variant range (pack vs box). The browser adapters expand ranges from JSON-LD, so check that it happened.
6. Commit config and data together: `Add <shop name>`.
