import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { adapters } from './adapters.mjs';
import { classify, merge, shouldSave } from './core.mjs';

const root = new URL('../', import.meta.url);
const dataDir = new URL('docs/data/', root);
const readJson = async (url, fallback) => JSON.parse(await readFile(url, 'utf8').catch(() => JSON.stringify(fallback)));

const config = await readJson(new URL('config.json', root));
const shopById = Object.fromEntries(config.shops.map(s => [s.id, s]));
const only = process.argv[2]; // optional: `npm run scrape -- mgw` (a shop) or `-- trk` (a set)

// One job per shop × set: the set's source entry (collection url, search term...) overrides the shop's defaults.
const jobs = config.sets.flatMap(set => Object.entries(set.sources).map(([shopId, source]) => {
  if (!shopById[shopId]) throw new Error(`set ${set.id}: unknown shop "${shopId}"`);
  return { set, shop: { ...shopById[shopId], ...source } };
}));
const run = jobs.filter(j => !only || j.shop.id === only || j.set.id === only);
if (!run.length) throw new Error(`nothing matches "${only}"`);

let browser;
const results = [];
for (const { set, shop } of jobs) {
  const r = { shop: shop.id, set: set.id, ok: false };
  results.push(r);
  if (!run.some(j => j.set === set && j.shop.id === shop.id)) continue; // not run: keep old data
  const label = `${shop.id}/${set.id}`;
  try {
    if (['playwright', 'easystore'].includes(shop.type)) browser ??= await chromium.launch();
    const raw = await adapters[shop.type](shop, browser);
    r.listings = [];
    const exclude = shop.exclude && new RegExp(shop.exclude, 'i'); // e.g. other languages, multi-pack lots
    for (const item of raw) {
      if (exclude?.test(item.title)) { console.log(`  skip (excluded): ${item.title}`); continue; }
      const product = classify(item.title, set, config.products);
      if (product) r.listings.push({ ...item, product });
      else console.log(`  skip (no product match): ${item.title}`);
    }
    r.ok = true;
    console.log(`${label}: ${r.listings.length} listings (${raw.length} scraped)`);
  } catch (e) {
    r.error = e.message;
    r.ran = true;
    console.error(`${label}: FAILED ${e.message}`);
  }
}
await browser?.close();

const now = new Date().toISOString();
const latest = await readJson(new URL('latest.json', dataDir), { listings: [] });
const history = await readJson(new URL('history.json', dataDir), []);
const merged = merge(latest, results, now);

const prevStatus = Object.fromEntries((latest.shops ?? []).map(s => [s.id, s]));
const out = {
  updated: now,
  sets: config.sets.map(({ id, name }) => ({ id, name })),
  products: config.products.map(({ id, name }) => ({ id, name })),
  shops: config.shops.map(({ id, name, url, shipping = null, benchmark = false }) => {
    const prev = prevStatus[id] ?? {};
    const mine = results.filter(r => r.shop === id && (r.ok || r.ran));
    if (!mine.length) return { ...prev, id, name, url, shipping, benchmark }; // not run this time
    const errors = mine.filter(r => !r.ok).map(r => `${r.set}: ${r.error}`);
    return { id, name, url, shipping, benchmark, ok: !errors.length, error: errors.join('; ') || null, lastOk: errors.length ? prev.lastOk ?? null : now };
  }),
  listings: merged.listings,
};

if (!shouldSave(latest, out, now)) {
  console.log('no changes since last save, and heartbeat not due: data left untouched');
  process.exit(results.some(r => r.ok) ? 0 : 1);
}

await mkdir(dataDir, { recursive: true });
await writeFile(new URL('latest.json', dataDir), JSON.stringify(out, null, 1));
await writeFile(new URL('history.json', dataDir), JSON.stringify([...history, ...merged.history], null, 0).replace(/},{/g, '},\n{'));
console.log(`${merged.history.length} price/stock changes recorded`);

if (!results.some(r => r.ok)) process.exit(1); // everything failed: make the Action go red
