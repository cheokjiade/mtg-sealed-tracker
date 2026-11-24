import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { adapters } from './adapters.mjs';
import { classify, merge } from './core.mjs';

const root = new URL('../', import.meta.url);
const dataDir = new URL('docs/data/', root);
const readJson = async (url, fallback) => JSON.parse(await readFile(url, 'utf8').catch(() => JSON.stringify(fallback)));

const config = await readJson(new URL('config.json', root));
const only = process.argv[2]; // optional: `npm run scrape -- mgw` to run one shop
const shops = config.shops.filter(s => !only || s.id === only);

let browser;
const results = [];
for (const shop of shops) {
  try {
    if (['playwright', 'easystore'].includes(shop.type)) browser ??= await chromium.launch();
    const raw = await adapters[shop.type](shop, browser);
    const listings = [];
    for (const item of raw) {
      const product = classify(item.title, config.products);
      if (product) listings.push({ ...item, product });
      else console.log(`  skip (no product match): ${item.title}`);
    }
    console.log(`${shop.id}: ${listings.length} listings (${raw.length} scraped)`);
    results.push({ shop: shop.id, ok: true, listings });
  } catch (e) {
    console.error(`${shop.id}: FAILED ${e.message}`);
    results.push({ shop: shop.id, ok: false, error: e.message });
  }
}
await browser?.close();

const now = new Date().toISOString();
const latest = await readJson(new URL('latest.json', dataDir), { listings: [] });
const history = await readJson(new URL('history.json', dataDir), []);
if (only) results.push(...config.shops.filter(s => s.id !== only).map(s => ({ shop: s.id, ok: false })));

const merged = merge(latest, results, now);
const prevStatus = Object.fromEntries((latest.shops ?? []).map(s => [s.id, s]));
const out = {
  updated: now,
  products: config.products.map(({ id, name }) => ({ id, name })),
  shops: config.shops.map(({ id, name, url, shipping = null }) => {
    const prev = prevStatus[id] ?? {};
    if (!shops.some(s => s.id === id)) return { ...prev, id, name, url, shipping }; // not run this time
    const r = results.find(x => x.shop === id);
    return { id, name, url, shipping, ok: r.ok, error: r.error ?? null, lastOk: r.ok ? now : prev.lastOk ?? null };
  }),
  listings: merged.listings,
};

await mkdir(dataDir, { recursive: true });
await writeFile(new URL('latest.json', dataDir), JSON.stringify(out, null, 1));
await writeFile(new URL('history.json', dataDir), JSON.stringify([...history, ...merged.history], null, 0).replace(/},{/g, '},\n{'));
console.log(`${merged.history.length} price/stock changes recorded`);

if (results.filter(r => shops.some(s => s.id === r.shop)).every(r => !r.ok)) process.exit(1);
