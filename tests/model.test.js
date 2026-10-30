import './setup.js';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const {
  parseBool, safeHttpUrl, parsePrice, parseQuantity, parseTags,
  imageCandidates, isUnresolvedImage, normalizeItem, buildWishlist,
  canonicalize, buildPurchases, computeStatus,
} = await import('../assets/js/model.js');
const { parseCsv, toCsv } = await import('../assets/js/csv.js');

const WISHLIST = fileURLToPath(new URL('../data/wishlist.csv', import.meta.url));
const real = parseCsv(readFileSync(WISHLIST, 'utf8'));
const CFG = { imagesDir: 'images/wishlist', imageBaseUrl: '', localImageExtensions: ['webp', 'jpg', 'png'] };
const CFG_CDN = { ...CFG, imageBaseUrl: 'https://cdn.example.com/' };

describe('parseBool', () => {
  test('truthy values', () => {
    for (const v of ['TRUE', 'true', 'yes', '1']) assert.equal(parseBool(v), true, v);
  });
  test('falsy values', () => {
    for (const v of ['FALSE', 'false', '', undefined]) assert.equal(parseBool(v), false, String(v));
  });
});

describe('safeHttpUrl', () => {
  test('accepts http and https URLs', () => {
    assert.equal(safeHttpUrl('https://example.com/a'), 'https://example.com/a');
    assert.equal(safeHttpUrl('http://example.com'), 'http://example.com/');
  });
  test('rejects other schemes, non-URLs and empty input', () => {
    assert.equal(safeHttpUrl('javascript:alert(1)'), null);
    assert.equal(safeHttpUrl('ftp://x'), null);
    assert.equal(safeHttpUrl('not a url'), null);
    assert.equal(safeHttpUrl(''), null);
  });
});

describe('parsePrice', () => {
  test('parses plain, empty and thousands-separated prices', () => {
    assert.equal(parsePrice('179.99'), 179.99);
    assert.equal(parsePrice(''), null);
    assert.equal(parsePrice('1,299.00'), 1299);
  });
  test('non-numeric text is not a price', () => {
    assert.ok(Number.isNaN(parsePrice('abc')));
  });
});

describe('parseQuantity', () => {
  test('positive integers are kept; everything else becomes 1', () => {
    assert.equal(parseQuantity('2'), 2);
    for (const v of ['', '0', '-1', 'x']) assert.equal(parseQuantity(v), 1, v);
  });
});

describe('parseTags', () => {
  test('splits, trims and de-duplicates case-insensitively', () => {
    assert.deepEqual(parseTags('APPLE, BESTBUY, AMAZON, apple'), ['APPLE', 'BESTBUY', 'AMAZON']);
  });
  test('empty input gives an empty list', () => {
    assert.deepEqual(parseTags(''), []);
  });
});

describe('imageCandidates', () => {
  test('absolute https URL comes first, then local files', () => {
    const out = imageCandidates('https://img.example.com/x.webp', 'abc', CFG);
    assert.equal(out[0], 'https://img.example.com/x.webp');
    assert.deepEqual(out.slice(1), ['images/wishlist/abc.webp', 'images/wishlist/abc.jpg', 'images/wishlist/abc.png']);
  });
  test('relative path with empty base gives only local candidates', () => {
    assert.deepEqual(imageCandidates('media/x.webp', 'abc', CFG), [
      'images/wishlist/abc.webp', 'images/wishlist/abc.jpg', 'images/wishlist/abc.png',
    ]);
  });
  test('relative path is resolved against imageBaseUrl first', () => {
    const out = imageCandidates('media/x.webp', 'abc', CFG_CDN);
    assert.equal(out[0], 'https://cdn.example.com/media/x.webp');
    assert.deepEqual(out.slice(1), [
      'images/wishlist/abc.webp', 'images/wishlist/abc.jpg', 'images/wishlist/abc.png',
    ]);
  });
});

describe('isUnresolvedImage', () => {
  test('relative path with no base is unresolved', () => {
    assert.equal(isUnresolvedImage('media/x.webp', CFG), true);
  });
  test('absolute URL, empty value and relative path with a base are not unresolved', () => {
    assert.equal(isUnresolvedImage('https://example.com/x.webp', CFG), false);
    assert.equal(isUnresolvedImage('', CFG), false);
    assert.equal(isUnresolvedImage('media/x.webp', CFG_CDN), false);
  });
});

describe('normalizeItem', () => {
  test('real row 3 (Airpods Max 2, Midnight) is normalized faithfully', () => {
    const item = normalizeItem(real.rows[2], 2, CFG);
    assert.equal(item.title, 'Airpods Max 2 (Midnight Color & no AppleCare+)');
    assert.equal(item.mostWanted, true);
    assert.equal(item.price, null);
    assert.equal(item.priceText, '');
    assert.equal(item.tags.length, 4);
    assert.deepEqual(item.tags, ['APPLE', 'BESTBUY', 'AMAZON', 'WALMART']);
    assert.equal(item.reason, 'I WANT THESE AS EARLY AS POSSIBLE / THIS IS MY #1 WANT ITEM');
    assert.equal(item.description, '');
    assert.equal(item.id, '78387a3d-b52b-488f-9995-84aac96c7040');
    assert.equal(item.order, 2);
  });
});

describe('buildWishlist', () => {
  test('real file: 13 items, no missing or unknown columns', () => {
    const res = buildWishlist(real.headers, real.rows, CFG);
    assert.equal(res.items.length, 13);
    assert.deepEqual(res.missingColumns, []);
    assert.deepEqual(res.unknownColumns, []);
  });
  test('real file: warns about the missing purchase URL for Grant Theft Auto VI', () => {
    const { issues } = buildWishlist(real.headers, real.rows, CFG);
    assert.ok(issues.some((i) => i.level === 'warning' && i.message.includes('Grant Theft Auto VI')
      && i.message.includes('no purchase URL')));
  });
  test('real file: one unresolved-image warning per row when there is no image base', () => {
    const { issues } = buildWishlist(real.headers, real.rows, CFG);
    assert.equal(issues.filter((i) => i.message.includes('image is a relative path')).length, 13);
  });
  test('row without a title is skipped with an error', () => {
    const { items, issues } = buildWishlist(['title', 'gift_id'], [{ title: '', gift_id: 'g1' }], CFG);
    assert.equal(items.length, 0);
    assert.ok(issues.some((i) => i.level === 'error' && i.row === 2));
  });
  test('duplicate gift_id keeps the first row and reports an error for the second', () => {
    const rows = [{ title: 'First', gift_id: 'dup' }, { title: 'Second', gift_id: 'dup' }];
    const { items, issues } = buildWishlist(['title', 'gift_id'], rows, CFG);
    assert.deepEqual(items.map((i) => i.title), ['First']);
    assert.ok(issues.some((i) => i.level === 'error' && i.row === 3 && /Duplicate gift_id/.test(i.message)));
  });
  test('missing gift_id column is reported in missingColumns', () => {
    const { missingColumns } = buildWishlist(['title', 'url'], [{ title: 'A', url: '' }], CFG);
    assert.ok(missingColumns.includes('gift_id'));
  });
  test('invalid URL gives a warning and item.url of null', () => {
    const { items, issues } = buildWishlist(['title', 'url', 'gift_id'],
      [{ title: 'A', url: 'not a url', gift_id: '1' }], CFG);
    assert.equal(items[0].url, null);
    assert.ok(issues.some((i) => i.level === 'warning' && /invalid purchase URL/.test(i.message)));
  });
  test('unknown column is listed in unknownColumns', () => {
    const { unknownColumns } = buildWishlist(['title', 'gift_id', 'foo'], [{ title: 'A', gift_id: '1', foo: 'x' }], CFG);
    assert.deepEqual(unknownColumns, ['foo']);
  });
  test('adding a row to the real CSV gives 14 items', () => {
    const appended = `${readFileSync(WISHLIST, 'utf8').replace(/\s+$/, '')}\r\nNew Gift,https://example.com/p,5,USD,1,,FALSE,,,new-id-1\r\n`;
    const parsed = parseCsv(appended);
    const { items } = buildWishlist(parsed.headers, parsed.rows, CFG);
    assert.equal(items.length, 14);
    assert.equal(items[13].title, 'New Gift');
  });
});

describe('canonicalize', () => {
  test('keeps extra columns after the canonical ones and normalizes most_wanted', () => {
    const headers = ['title', 'gift_id', 'most_wanted', 'notes', 'tags', 'foo'];
    const rows = [{ title: 'A', gift_id: 'g1', most_wanted: 'yes', notes: 'why, "really"', tags: 'X, Y', foo: 'bar' }];
    const { columns, rows: out } = canonicalize(headers, rows);
    assert.deepEqual(columns.slice(-1), ['foo']);
    assert.equal(columns.indexOf('foo'), columns.length - 1);
    assert.equal(out[0].most_wanted, 'TRUE');
    assert.equal(out[0].notes, 'why, "really"');
    assert.equal(out[0].tags, 'X, Y');
    assert.equal(out[0].gift_id, 'g1');
    assert.equal(out[0].foo, 'bar');
    const csv = toCsv(out, columns);
    assert.equal(parseCsv(csv).rows[0].most_wanted, 'TRUE');
  });
  test('most_wanted false-like values become FALSE', () => {
    const { rows } = canonicalize(['title', 'gift_id', 'most_wanted'], [{ title: 'A', gift_id: '1', most_wanted: '' }]);
    assert.equal(rows[0].most_wanted, 'FALSE');
  });
});

describe('buildPurchases', () => {
  test('parses integers, ignores blank gift_id, reads archived and clamps negatives', () => {
    const map = buildPurchases([
      { gift_id: 'a', purchased_quantity: '2', reserved_quantity: '1', updated_at: '2026-01-01', archived: 'TRUE' },
      { gift_id: '', purchased_quantity: '5', reserved_quantity: '0', updated_at: '', archived: '' },
      { gift_id: 'b', purchased_quantity: '-3', reserved_quantity: '-1', updated_at: '', archived: 'FALSE' },
    ]);
    assert.equal(map.size, 2);
    assert.deepEqual(map.get('a'), { id: 'a', purchased: 2, reserved: 1, updatedAt: '2026-01-01', archived: true });
    assert.deepEqual(map.get('b'), { id: 'b', purchased: 0, reserved: 0, updatedAt: '', archived: false });
  });
});

describe('computeStatus', () => {
  const item = (quantity, csvPurchased = false) =>
    normalizeItem({ title: 'T', gift_id: 'g', quantity: String(quantity), purchased: csvPurchased ? 'TRUE' : '' }, 0, CFG);

  test('quantity 1, no record: available', () => {
    const s = computeStatus(item(1), undefined);
    assert.equal(s.state, 'available');
    assert.equal(s.label, 'Available');
    assert.equal(s.remaining, 1);
  });
  test('quantity 1, one purchased: purchased', () => {
    const s = computeStatus(item(1), { purchased: 1 });
    assert.equal(s.state, 'purchased');
    assert.equal(s.label, 'Purchased');
    assert.equal(s.remaining, 0);
  });
  test('quantity 2, one purchased: partial with count label', () => {
    const s = computeStatus(item(2), { purchased: 1 });
    assert.equal(s.state, 'partial');
    assert.equal(s.label, '1 of 2 purchased');
    assert.equal(s.remaining, 1);
  });
  test('local marks add on top of shared but are capped at the requested quantity', () => {
    const s = computeStatus(item(2), { purchased: 0 }, 5);
    assert.equal(s.local, 2);
    assert.equal(s.purchased, 2);
    assert.equal(s.state, 'purchased');
    const p = computeStatus(item(3), { purchased: 1 }, 1);
    assert.equal(p.purchased, 2);
    assert.equal(p.label, '2 of 3 purchased');
  });
  test('shared count above the requested quantity is capped', () => {
    const s = computeStatus(item(1), { purchased: 5 });
    assert.equal(s.shared, 1);
    assert.equal(s.purchased, 1);
    assert.equal(s.state, 'purchased');
  });
  test('CSV purchased column marks the item fully purchased', () => {
    const s = computeStatus(item(2, true), undefined);
    assert.equal(s.state, 'purchased');
    assert.equal(s.purchased, 2);
  });
});
