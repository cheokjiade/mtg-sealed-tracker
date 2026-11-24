import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classify, merge } from './core.mjs';
import { parseMoney } from './adapters.mjs';

const { products, sets, shops } = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const trk = sets.find(s => s.id === 'trk');
const c = t => classify(t, trk, products);

// classify: specific products must win over general ones
assert.equal(c('[TRK] Star Trek Collector Booster Box'), 'collector-box');
assert.equal(c('Star Trek - Collector Booster Display'), 'collector-box');
assert.equal(c('Star Trek Collector Booster Pack'), 'collector-pack');
assert.equal(c('Star Trek TRK Play Booster Box'), 'play-box');
assert.equal(c('Star Trek Play Booster'), 'play-pack');
assert.equal(c('[TRC] Star Trek Commander Decks - Klingon Fury'), 'commander');
assert.equal(c("[TRC] Star Trek Collector's Edition Commander Decks"), 'collector-commander');
assert.equal(c('(Ready Stocks) Magic The Gathering MTG Star Trek English Collector Commander Deck Set of 4'), 'collector-commander-set');
assert.equal(c("Star Trek TRK Commander Deck - Collector's Editions - Klingon Fury"), 'collector-commander');
assert.equal(c("Star Trek TRK Commander Deck - Collector's Editions - Set of 4"), 'collector-commander-set');
assert.equal(c('Star Trek TRK Commander Deck - Set of 4'), 'commander-set');
assert.equal(c('Star Trek - Play Booster Box (EN) - Booster Pack'), 'play-pack');
assert.equal(c('Star Trek - Play Booster Box (EN) - Booster Box'), 'play-box');
assert.equal(c('Star Trek - Play Booster Case: 6 Boxes (EN)'), 'play-case');
assert.equal(c('Star Trek TRK Scene Boxes - Set of 2'), 'scene-box-set');
assert.equal(c('Star Trek - Beam Me Up Bundle'), 'beam-me-up');
assert.equal(c('Star Trek Bundle'), 'bundle');
assert.equal(c('Star Trek TRK Scene Boxes'), 'scene-box');
assert.equal(c('Star Trek Draft Night Box'), 'draft-night');
assert.equal(c('Star Trek - Booster Fleet Bundle | Collector Booster Box + 2 x Play Booster Boxes (EN)'), 'combo');
assert.equal(c('Captain Pike, Fullness of Time [Star Trek]'), null); // single card
assert.equal(c('Bloomburrow Play Booster Box'), null); // other set

// config sanity
const ids = products.map(p => p.id);
assert.equal(new Set(ids).size, ids.length, 'product ids must be unique');
for (const s of sets) for (const shop of Object.keys(s.sources)) assert.ok(shops.some(x => x.id === shop), `set ${s.id}: unknown shop ${shop}`);

assert.equal(parseMoney('S$ 1,620.50'), 1620.5);

// merge: change-only history, failed shop keeps data, delisted -> out of stock, sets kept apart
const L = (url, price, inStock) => ({ url, price, inStock, title: url, product: 'play-box' });
const a = merge({ listings: [] }, [{ shop: 's', set: 'x', ok: true, listings: [L('u1', 100, true), L('u2', 50, true)] }], 't1');
assert.equal(a.history.length, 2);
const b = merge(a, [{ shop: 's', set: 'x', ok: true, listings: [L('u1', 100, true)] }], 't2');
assert.deepEqual(b.history, [{ t: 't2', shop: 's', url: 'u2', price: 50, inStock: false }]);
assert.equal(b.listings.find(l => l.url === 'u1').firstSeen, 't1');
const d = merge(b, [{ shop: 's', set: 'x', ok: false }, { shop: 's', set: 'y', ok: true, listings: [L('u3', 10, true)] }], 't3');
assert.deepEqual(d.history.map(h => h.url), ['u3']); // set y's success doesn't delist set x's listings
assert.equal(d.listings.length, 3);
assert.equal(d.listings.find(l => l.url === 'u3').set, 'y');
const e = merge(d, [{ shop: 's', set: 'x', ok: true, listings: [L('u1', 90, true), L('u2', 50, false)] }, { shop: 's', set: 'y', ok: false }], 't4');
assert.deepEqual(e.history.map(h => [h.url, h.price]), [['u1', 90]]);

console.log('all checks passed');
