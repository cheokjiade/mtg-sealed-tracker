// Identify a shop's platform and which adapter type fits: `npm run probe -- <listing page url>`
import { chromium } from 'playwright';

const url = process.argv[2];
if (!url) { console.error('usage: npm run probe -- <url>'); process.exit(2); }
const { origin } = new URL(url);
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const tryJson = async u => {
  try { const r = await fetch(u, { headers: { 'user-agent': UA } }); return r.ok ? await r.json() : `HTTP ${r.status}`; }
  catch (e) { return e.message; }
};

const shopify = await tryJson(`${url.replace(/\/$/, '')}/products.json?limit=5`);
if (shopify?.products) console.log(`shopify ✓  ${shopify.products.length} products, e.g. "${shopify.products[0]?.title}"`);
else console.log(`shopify ✗  (${typeof shopify === 'string' ? shopify : 'no products key'})`);

const woo = await tryJson(`${origin}/wp-json/wc/store/products?per_page=3`);
if (Array.isArray(woo)) console.log(`woocommerce ✓  e.g. "${woo[0]?.name}"`);
else console.log(`woocommerce ✗  (${typeof woo === 'string' ? woo : 'not an array'})`);

const browser = await chromium.launch();
const page = await browser.newPage({ userAgent: UA });
try {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(3000);
  const html = await page.content();
  const text = (await page.innerText('body')).slice(0, 300).replace(/\s+/g, ' ');
  console.log(`browser: HTTP ${res?.status()} → ${page.url()}`);
  console.log(`  title: ${await page.title()}`);
  if (/verify|captcha|login required|access denied/i.test(page.url() + text))
    console.log('  ⚠ looks like bot protection or a login wall: do NOT try to bypass it; report the shop as unsupported');
  console.log(`  easystore: ${/cdn\.store-assets\.com/.test(html) ? '✓ (use type "easystore")' : '✗'}`);
  console.log(`  shopify assets: ${/cdn\.shopify\.com/.test(html) ? '✓' : '✗'}`);
  const ld = await page.$$eval('script[type="application/ld+json"]', s => s.map(x => x.textContent));
  console.log(`  JSON-LD blocks: ${ld.length} (${ld.map(b => b.match(/"@type"\s*:\s*"(\w+)"/)?.[1]).join(', ')})`);
  console.log(`  text: ${text}`);
} finally {
  await browser.close();
}
