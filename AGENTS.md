# Agent guide: mtg-sealed-tracker

This repo tracks prices and stock of MTG sealed products in Singapore shops. AI agents maintain it.
Read README.md for the full layout. This file covers the rules for changing it.

## How it runs

- `.github/workflows/scrape.yml` runs every 6 hours. It runs `npm test`, then `npm run scrape`, then commits `docs/data/`.
- GitHub Pages serves `docs/` at https://cheokjiade.github.io/mtg-sealed-tracker/. There is no build step.
- Everything is driven by `config.json`: `shops` (platform and shipping), `sets` (title regex plus where each shop lists the set), `products` (title regex to product type, first match wins).

## Commands

| Command | Use |
|---|---|
| `npm test` | Classification, merge and config sanity checks. **Run after every change.** |
| `npm run scrape -- <shopId or setId>` | Scrape one shop or one set and update `docs/data/` |
| `npm run probe -- <url>` | Identify a site's platform and pick an adapter type |
| `python -m http.server -d docs 8000` | View the dashboard locally |

First time: `npm install && npx playwright install chromium`.

## Rules

1. **Prefer config over code.** A new shop or set is normally a `config.json` edit only. Add an adapter function to `scraper/adapters.mjs` only when no existing type fits, and keep it to one function named after the new `type`.
2. **Never bypass bot protection.** If a site shows a captcha, login wall or traffic verification (Shopee does), do not add stealth plugins, rotate user agents, use proxies or solve captchas. Record the shop as unsupported in README's "Not covered" section.
3. **Be polite to shops.** Keep the 6-hour schedule or slower. Don't add per-product page fetches unless a listing shows a price range. Shopify returns HTTP 429 when hit repeatedly; `getJson` already backs off.
4. **Never hand-edit `docs/data/*.json`** except to delete them for a deliberate reset (say so in the commit message). `history.json` is append-only history, and listings are keyed by URL.
5. **Product classification:** when a scrape logs `skip (no product match)` for a real sealed product, add or adjust a regex in `products`. Put specific patterns above general ones, and add an `assert` for that title to `scraper/test.mjs`. Singles, accessories and other sets are meant to be skipped.
6. **Shipping** values come from the shop's own shipping or FAQ page. Never guess. Leave `shipping` unset if unknown (the dashboard shows "ship ?").
7. **The dashboard** (`docs/index.html`) is a single static file using Chart.js from a CDN. Each shop's color comes from its index in `config.json`, so append new shops at the end and don't reorder them. Escape every scraped string with `esc()` and every link with `safeUrl()`.
8. Before committing: `npm test` passes and a real `npm run scrape -- <what you changed>` succeeds. Commit config, code and data together.

## Skills

Task playbooks live in `.claude/skills/`: `add-shop`, `add-set`, `triage-scrape`.
Agents that don't load skills can read those `SKILL.md` files directly.
