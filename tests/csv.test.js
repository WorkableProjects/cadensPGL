import './setup.js';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { parseCsv, toCsv } = await import('../assets/js/csv.js');

const WISHLIST = fileURLToPath(new URL('../data/wishlist.csv', import.meta.url));
const HEADERS = ['title', 'url', 'price', 'currency', 'quantity', 'notes', 'most_wanted', 'tags', 'image_url', 'gift_id'];

describe('parseCsv', () => {
  test('parses the real wishlist export (BOM stripped, 13 rows, no errors)', () => {
    const { headers, rows, errors } = parseCsv(readFileSync(WISHLIST, 'utf8'));
    assert.deepEqual(headers, HEADERS);
    assert.equal(rows.length, 13);
    assert.deepEqual(errors, []);
    assert.equal(rows[0].gift_id, '635a2ae3-f406-4e95-94e8-6b7fecd6ce03');
  });

  test('keeps a quoted comma inside one field', () => {
    const text = 'title,price\n"12 Ct, Multicolor Sharpies (Permanent)",8.99\n';
    const { rows } = parseCsv(text);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, '12 Ct, Multicolor Sharpies (Permanent)');
    assert.equal(rows[0].price, '8.99');
  });

  test('handles embedded newlines and escaped double quotes', () => {
    const text = 'title,notes\n"Line one\nLine two","He said ""hi"", twice"\n';
    const { rows, errors } = parseCsv(text);
    assert.deepEqual(errors, []);
    assert.deepEqual(rows, [{ title: 'Line one\nLine two', notes: 'He said "hi", twice' }]);
  });

  test('preserves Unicode characters', () => {
    const text = 'title,notes\nElgato Stream Deck™,"No, this isn’t for streaming"\n';
    const { rows } = parseCsv(text);
    assert.equal(rows[0].title, 'Elgato Stream Deck™');
    assert.equal(rows[0].notes, 'No, this isn’t for streaming');
  });

  test('trims and lower-cases headers', () => {
    const { headers, rows } = parseCsv(' Title , URL \nA,https://example.com\n');
    assert.deepEqual(headers, ['title', 'url']);
    assert.equal(rows[0].title, 'A');
    assert.equal(rows[0].url, 'https://example.com');
  });

  test('strips a leading BOM from in-memory text', () => {
    const { headers } = parseCsv('﻿title,gift_id\nA,1\n');
    assert.deepEqual(headers, ['title', 'gift_id']);
  });
});

describe('toCsv', () => {
  test('round-trips commas, quotes and newlines through parseCsv', () => {
    const columns = ['title', 'notes', 'gift_id'];
    const rows = [
      { title: '12 Ct, Multicolor Sharpies', notes: 'said "wow"', gift_id: 'a1' },
      { title: 'Two\nlines', notes: 'comma, quote " and newline\n', gift_id: 'b2' },
      { title: 'Plain', notes: 'isn’t ™', gift_id: 'c3' },
    ];
    const text = toCsv(rows, columns);
    const { headers, rows: parsed, errors } = parseCsv(text);
    assert.deepEqual(errors, []);
    assert.deepEqual(headers, columns);
    assert.deepEqual(parsed, rows);
  });
});
