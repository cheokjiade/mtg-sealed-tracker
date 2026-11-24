// One function per shop "type" in config.json. Each returns [{ title, price, inStock, stock, url }].
// New site that fits neither? Add a function here and use its name as the shop's "type".

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Shops geo-convert prices by visitor IP, and GitHub's runners are in the US.
// These cookies ask Shopify for its Singapore market; checkCurrency() verifies that it complied.
const SG_COOKIES = 'localization=SG; cart_currency=SGD';
export const CURRENCY = 'SGD';

async function getJson(url, tries = 4) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json', cookie: SG_COOKIES } });
    if (r.ok) return r.json();
    // Shopify answers 429 when hit too often; back off 5s, 10s, 20s...
    if ((r.status !== 429 && r.status < 500) || i >= tries) throw new Error(`HTTP ${r.status} ${url}`);
    await sleep(5000 * 2 ** i);
  }
}

// Shopify stores: "url" is a collection page; its /products.json lists every product with variants.
async function shopify(shop) {
  const { origin } = new URL(shop.url);
  // products.json carries no currency field; the cart reports the currency this session is priced in.
  const { currency } = await getJson(`${origin}/cart.js`);
  if (currency !== CURRENCY) throw new Error(`prices served in ${currency}, not ${CURRENCY}; refusing to record them`);
  const items = [];
  for (let page = 1; ; page++) {
    const { products } = await getJson(`${shop.url}/products.json?limit=250&page=${page}`);
    for (const p of products) for (const v of p.variants) items.push({
      title: v.title === 'Default Title' ? p.title : `${p.title} - ${v.title}`,
      price: Number(v.price),
      inStock: v.available,
      stock: null, // the public endpoint doesn't expose quantities
      url: `${origin}/products/${p.handle}${p.variants.length > 1 ? `?variant=${v.id}` : ''}`,
    });
    if (products.length < 250) return items;
  }
}

// WooCommerce stores: "url" is the site root, "search" the query. Uses the public Store API.
// ponytail: variable products report their lowest price only; fetch variations if a shop uses them.
async function woocommerce(shop) {
  const items = [];
  for (let page = 1; ; page++) {
    const products = await getJson(`${shop.url}/wp-json/wc/store/products?search=${encodeURIComponent(shop.search)}&per_page=100&page=${page}`);
    for (const p of products) items.push({
      title: decodeEntities(p.name),
      ...assertCurrency(p.prices.currency_code),
      price: Number(p.prices.price) / 10 ** p.prices.currency_minor_unit,
      inStock: p.is_in_stock,
      stock: p.low_stock_remaining ?? null,
      url: p.permalink,
    });
    if (products.length < 100) return items;
  }
}

// A shop with "currency": "USD" (Amazon.com: US servers always see USD) has bare "$" prices converted at the
// European Central Bank's daily rate. Every other shop is SGD-only and fails on a foreign price.
let usdSgdRate;
async function usdToSgd() {
  usdSgdRate ??= (await getJson('https://api.frankfurter.app/latest?from=USD&to=SGD')).rates.SGD;
  if (!(usdSgdRate > 0.5 && usdSgdRate < 3)) throw new Error(`implausible USD→SGD rate ${usdSgdRate}`);
  return usdSgdRate;
}

const assertCurrency = code => {
  if (code && code !== CURRENCY) throw new Error(`prices served in ${code}, not ${CURRENCY}; refusing to record them`);
  return {};
};
// Price text like "US$ 459" or "RM 300" means the page was geo-converted.
const FOREIGN_MONEY = /US\$|USD|A\$|AUD|RM|MYR|€|£|¥|₩/;

const decodeEntities = s => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(n))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'");

// Any rendered HTML listing page, driven by CSS selectors in config.json:
//   item (one per product card), title, price, link, optional soldOut (present = out of stock),
//   optional stock (element whose text holds a quantity, e.g. "Only 3 left").
//   optional inStock (present = buyable, for sites that mark availability rather than sold-out),
//   optional next (the next-page link; default covers rel="next" and aria-label="Next").
// Shop/source options: maxPages (default 20), cookies ("a=1; b=2"), currency ("USD" to accept and convert USD prices).
const NEXT = 'a[rel="next"], link[rel="next"], a[aria-label="Next" i], a[aria-label="Next page" i]';
const BOT_WALL = /captcha|robot check|verify\/traffic|are you a human|access denied|login required|characters you see|not a robot|automated access|sorry! something went wrong/i;
async function playwright(shop, browser) {
  const page = await browser.newPage({ userAgent: UA, locale: 'en-SG' });
  const { hostname } = new URL(shop.url);
  if (shop.cookies) await page.context().addCookies(shop.cookies.split(/;\s*/).map(c => {
    const [name, ...v] = c.split('=');
    return { name, value: v.join('='), domain: '.' + hostname.replace(/^www\./, ''), path: '/' };
  }));
  const maxPages = shop.maxPages ?? 20;
  try {
    const raw = [];
    const visited = new Set();
    let url = shop.url;
    while (url && !visited.has(url) && visited.size < maxPages) {
      visited.add(url);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      // Never try to get past bot protection: fail the shop so its last good data is kept.
      const head = page.url() + ' ' + await page.title() + ' ' + (await page.innerText('body').catch(() => '')).slice(0, 1500);
      if (BOT_WALL.test(head)) throw new Error(`bot protection at ${page.url()}`);
      await page.waitForSelector(shop.selectors.item, { timeout: 30_000 }).catch(() => {
        throw new Error(`no "${shop.selectors.item}" at ${page.url()} | page: ${head.replace(/\s+/g, ' ').slice(0, 300)}`);
      });
      raw.push(...await page.$$eval(shop.selectors.item, (els, s) => els.map(el => {
        const q = sel => sel && el.querySelector(sel);
        return {
          title: q(s.title)?.textContent.trim().replace(/\s+/g, ' '),
          price: q(s.price)?.textContent,
          url: q(s.link)?.href ?? el.closest('a')?.href,
          soldOut: s.inStock ? !q(s.inStock) : !!q(s.soldOut),
          stock: q(s.stock)?.textContent ?? null,
        };
      }), shop.selectors));
      url = await page.$eval(shop.selectors.next ?? NEXT, a => a.href).catch(() => null);
    }
    if (url && visited.size === maxPages && !shop.maxPages) console.warn(`  ${shop.id}: stopped at ${maxPages} pages`);
    const items = [];
    for (const r of raw.filter(r => r.title && r.price)) {
      r.url = canonicalUrl(r.url);
      const usd = shop.currency === 'USD' && !/S\$|SGD/.test(r.price);
      const foreign = r.price.match(FOREIGN_MONEY)?.[0];
      if (foreign && !(usd && /US/.test(foreign))) assertCurrency(foreign);
      // "S$ 7.00 - S$ 200.00" means variants (pack vs box): read each from the product page.
      if (!usd && moneyCount(r.price) > 1) { items.push(...await jsonLdVariants(page, r.url)); continue; }
      const amount = parseMoney(r.price);
      items.push({
        title: r.title,
        price: usd ? Math.round(amount * await usdToSgd() * 100) / 100 : amount,
        ...(usd && { origPrice: amount, origCurrency: 'USD' }),
        inStock: !r.soldOut,
        stock: r.stock ? Number(r.stock.match(/\d+/)?.[0]) || null : null,
        url: r.url,
      });
    }
    return items;
  } finally {
    await page.close();
  }
}

// schema.org Product / ProductGroup JSON-LD: a standard most shop platforms emit for Google.
async function jsonLdVariants(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const blocks = await page.$$eval('script[type="application/ld+json"]', s => s.map(x => x.textContent));
  const nodes = blocks.flatMap(b => { try { return [JSON.parse(b)].flat(); } catch { return []; } });
  const group = nodes.find(n => n['@type'] === 'ProductGroup' || n['@type'] === 'Product');
  if (!group) throw new Error(`no product JSON-LD at ${url}`);
  return (group.hasVariant ?? [group]).map(v => {
    const offer = [v.offers].flat()[0];
    assertCurrency(offer.priceCurrency);
    return {
      title: v.name,
      price: Number(offer.price),
      inStock: /InStock|PreOrder|LimitedAvailability|OnlineOnly/.test(offer.availability ?? ''),
      stock: null,
      url: offer.url ?? url,
    };
  });
}

// Listings are keyed by URL, so strip per-visit tracking. Amazon (incl. sponsored redirect links, and the
// amazon.sg links it serves to Singapore IPs) → amazon.com/dp/<ASIN>, so local and CI runs agree.
export function canonicalUrl(u) {
  const asin = /amazon\./.test(u) && decodeURIComponent(u).match(/\/dp\/([A-Z0-9]{10})/);
  if (asin) return `https://www.amazon.com/dp/${asin[1]}`;
  return u;
}

const moneyCount = s => s.match(/\d[\d,]*(\.\d+)?/g)?.length ?? 0;

export const parseMoney = s => Number(s.replace(/,/g, '').match(/\d+(\.\d+)?/)?.[0]);

// EasyStore shops (cdn.store-assets.com) share one theme, so they only need a "url" in config.json.
const EASYSTORE = {
  item: '.product-card-wrapper',
  title: '.card-information__text',
  price: '.price-item--sale', // whole element, so a "S$ 7 - S$ 200" range is detected
  link: 'a',
  soldOut: "[data-product-available='0']",
  stock: '.low-inventory-notice',
};
const easystore = (shop, browser) => playwright({ ...shop, selectors: { ...EASYSTORE, ...shop.selectors } }, browser);

export const adapters = { shopify, woocommerce, playwright, easystore };
