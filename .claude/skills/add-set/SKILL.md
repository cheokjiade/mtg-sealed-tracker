---
name: add-set
description: Start tracking a new MTG set (for example a newly announced release) across the existing shops. Use when asked to add, track or monitor another set or expansion.
---

# Add a set

1. **Identify the set:** its official name, set code(s) (main set, commander, and so on) and its sealed product line. Check Wizards' product page or buyer's guide.
2. **Set entry:** append to `sets` in `config.json`:
   `{ "id": "<code lowercase>", "name": "<name>", "match": "<regex>", "sources": {} }`.
   `match` must catch how shops actually title it (name, `\b<CODE>\b`, commander code) without catching other sets. A name that is also a common word needs the code or the word "MTG".
3. **Sources:** for each shop in `shops`, find where it lists this set:
   - Shopify: `<origin>/search/suggest.json?q=<name>&resources[type]=collection`. Pick the sealed collection.
   - WooCommerce: `{ "search": "<name>" }`.
   - EasyStore and others: browse the shop's menu for the set's collection URL.
   - A shop that doesn't stock the set yet gets no entry. Add it later.
4. **Products:** if the set brings new sealed product types (for example a new bundle name), add `products` entries above the general ones and add `assert` lines to `scraper/test.mjs` for the real titles.
5. **Verify:** `npm test`, then `npm run scrape -- <set id>`. Read every `skip` line and decide whether it is a product (fix the regex) or noise (fine). Load the dashboard and switch to the set.
6. Commit: `Track <set name>`.
