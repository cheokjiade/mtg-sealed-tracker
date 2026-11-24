---
name: triage-scrape
description: Diagnose and fix a failing or misbehaving scrape, such as a red scrape Action, a shop showing "failed" on the dashboard, wrong prices, missing products, or skip lines for real products. Use when the scheduled scrape breaks or the data looks wrong.
---

# Triage a scrape

1. **Find what broke.** Check the latest Action run (`gh run list -w scrape.yml`, then `gh run view <id> --log`), or `docs/data/latest.json` → `shops[].error`. Reproduce locally with `npm run scrape -- <shopId>`.
2. **Match the symptom:**

| Symptom | Likely cause | Fix |
|---|---|---|
| `HTTP 404` on a Shopify or EasyStore source | The shop renamed or removed the collection | Find the new collection (`/search/suggest.json?...resources[type]=collection` or the shop's menu) and update the source `url` |
| `HTTP 429` after retries | Rate limited | Rerun later. If it persists, check that nothing added extra requests. Never add proxies or rotation |
| `waitForSelector` timeout | Site redesign, or the collection is empty | `npm run probe -- <url>`. If the platform changed, switch `type`. If the markup changed, update `selectors` |
| Redirect to a verify, captcha or login page | Bot protection was added | Stop. Remove the shop's sources, note it in README "Not covered", and tell the user. Don't bypass it |
| `skip (no product match)` for a real sealed product | Title wording the regexes don't know | Add or adjust a `products` regex (specific above general) and add an `assert` with that exact title to `scraper/test.mjs` |
| Price far too low (a pack price on a box) | Variant price range not expanded | Check that the card's price element contains both ends of the range (see `EASYSTORE.price`) and that the product page has JSON-LD |
| Listing wrongly marked out of stock | It vanished from the collection page (delisted, or a source URL change) | Confirm on the live site. Fix the source if the collection moved |

3. **Verify:** `npm test`, then a real `npm run scrape -- <shopId>`. Spot-check prices against the live site.
4. Don't delete history to hide a bad run. If bad rows got committed, explain in the commit message. A reset (deleting `docs/data/`) needs the user's OK.
5. Commit the fix with the symptom in the message, for example `Fix hideout: collection moved`.
