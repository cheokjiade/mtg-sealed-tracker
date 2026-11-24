// Pure logic (no network) so it can be tested: classifying titles and merging a run into stored data.

// The title must match the set's pattern; then the first matching product pattern wins,
// so config.json lists specific products before general ones.
export function classify(title, set, products) {
  if (!new RegExp(set.match, 'i').test(title)) return null;
  return products.find(p => new RegExp(p.match, 'i').test(title))?.id ?? null;
}

// latest:  { listings: [...] } from the previous run (or empty)
// results: [{ shop, set, ok, listings }] from this run, one per shop × set source
// History only gets a row when a listing's price or stock state changes, keeping the file small.
export function merge(latest, results, now) {
  const prev = new Map(latest.listings.map(l => [l.url, l]));
  const listings = [];
  const history = [];
  const record = l => history.push({ t: now, shop: l.shop, url: l.url, price: l.price, inStock: l.inStock });

  for (const r of results) {
    const old = latest.listings.filter(l => l.shop === r.shop && l.set === r.set);
    if (!r.ok) { listings.push(...old); continue; } // scrape failed: keep last known data
    const seen = new Set();
    for (const l of r.listings) {
      if (seen.has(l.url)) continue;
      seen.add(l.url);
      const p = prev.get(l.url);
      const cur = { ...l, shop: r.shop, set: r.set, firstSeen: p?.firstSeen ?? now, lastSeen: now };
      if (!p || p.price !== cur.price || p.inStock !== cur.inStock) record(cur);
      listings.push(cur);
    }
    for (const p of old) if (!seen.has(p.url)) {
      // Delisted: shops often pull sold-out items, so treat as out of stock.
      const gone = { ...p, inStock: false };
      if (p.inStock) record(gone);
      listings.push(gone);
    }
  }
  return { listings, history };
}
