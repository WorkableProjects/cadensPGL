// Wishlist data model: turns raw CSV rows into normalized items, validates
// them, and computes purchase status. Pure functions only (no DOM, no fetch),
// so they can be unit-tested in Node.

import { CONFIG } from './config.js';

/** Column order of the canonical data/wishlist.csv (GiftList order first). */
export const CANONICAL_COLUMNS = [
  'title', 'url', 'price', 'currency', 'quantity', 'notes',
  'most_wanted', 'tags', 'image_url', 'gift_id', 'description', 'category',
];
export const REQUIRED_COLUMNS = ['title', 'gift_id'];
export const KNOWN_OPTIONAL_COLUMNS = ['purchased'];

export const PURCHASE_COLUMNS = ['gift_id', 'purchased_quantity', 'reserved_quantity', 'updated_at', 'archived'];

const str = (v) => (v == null ? '' : String(v).trim());

export function parseBool(v) {
  return ['true', 'yes', 'y', '1', 'x'].includes(str(v).toLowerCase());
}

/** Returns the URL string if it is an absolute http(s) URL, otherwise null. */
export function safeHttpUrl(v) {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

export function parsePrice(v) {
  const raw = str(v);
  if (!raw) return null;
  const s = raw.replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}\b)/g, '');
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

export function formatPrice(amount, currency) {
  if (amount == null || Number.isNaN(amount)) return '';
  const cur = str(currency).toUpperCase() || 'USD';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${cur}`;
  }
}

export function parseQuantity(v) {
  const n = Number.parseInt(str(v), 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function parseTags(v) {
  const seen = new Set();
  return str(v).split(',').map((t) => t.trim()).filter((t) => {
    const k = t.toLowerCase();
    if (!t || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Ordered list of image URLs to try for an item; the UI tries each in turn
 * and shows a placeholder when all fail.
 * - absolute http(s) image_url: used as-is
 * - relative image_url: resolved only against CONFIG.imageBaseUrl
 * - then the site's own images/wishlist/<gift_id>.<ext> files
 */
export function imageCandidates(rawImage, id, config = CONFIG) {
  const out = [];
  const raw = str(rawImage);
  const abs = safeHttpUrl(raw);
  if (abs) out.push(abs);
  else if (raw && raw.startsWith(`${config.imagesDir}/`)) out.push(raw);
  else if (raw && config.imageBaseUrl) {
    try { out.push(new URL(raw, config.imageBaseUrl).href); } catch { /* ignore */ }
  }
  if (id) {
    const safeId = encodeURIComponent(id);
    for (const ext of config.localImageExtensions) out.push(`${config.imagesDir}/${safeId}.${ext}`);
  }
  return [...new Set(out)];
}

/** True when image_url is set but cannot be resolved to a hosted URL. */
export function isUnresolvedImage(rawImage, config = CONFIG) {
  const raw = str(rawImage);
  if (!raw || safeHttpUrl(raw) || raw.startsWith(`${config.imagesDir}/`)) return false;
  return !config.imageBaseUrl;
}

/**
 * @typedef {Object} Item
 * @property {string} id            stable gift_id
 * @property {string} title
 * @property {string|null} url      validated purchase URL
 * @property {number|null} price
 * @property {string} currency
 * @property {string} priceText     formatted price or ''
 * @property {number} quantity      requested quantity (>=1)
 * @property {string} reason        "Why I want it" (notes)
 * @property {string} description
 * @property {boolean} mostWanted
 * @property {string[]} tags
 * @property {string} category
 * @property {string[]} images      candidate image URLs, best first
 * @property {boolean} csvPurchased optional `purchased` column was TRUE
 * @property {number} order         row position in the CSV
 */

/** Normalize one CSV row. Never invents text: blank stays blank. */
export function normalizeItem(row, index, config = CONFIG) {
  const id = str(row.gift_id);
  const price = parsePrice(row.price);
  const currency = str(row.currency).toUpperCase() || 'USD';
  return {
    id,
    title: str(row.title),
    url: safeHttpUrl(row.url),
    price: Number.isNaN(price) ? null : price,
    currency,
    priceText: Number.isNaN(price) ? '' : formatPrice(price, currency),
    quantity: parseQuantity(row.quantity),
    reason: str(row.notes),
    description: str(row.description),
    mostWanted: parseBool(row.most_wanted),
    tags: parseTags(row.tags),
    category: str(row.category),
    images: imageCandidates(row.image_url, id, config),
    csvPurchased: parseBool(row.purchased),
    order: index,
  };
}

/**
 * Validate parsed rows and build items.
 * Returns { items, issues, missingColumns, unknownColumns } where each issue is
 * { row (1-based CSV line incl. header), id, level: 'error'|'warning', message }.
 * Rows without a title are skipped; duplicate gift_ids keep the first row.
 */
export function buildWishlist(headers, rows, config = CONFIG) {
  const known = new Set([...CANONICAL_COLUMNS, ...KNOWN_OPTIONAL_COLUMNS]);
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  const unknownColumns = headers.filter((h) => h && !known.has(h));
  const issues = [];
  const items = [];
  const seen = new Set();

  rows.forEach((row, i) => {
    const line = i + 2;
    const item = normalizeItem(row, i, config);
    const label = item.title || `row ${line}`;
    if (!item.title) {
      issues.push({ row: line, id: item.id, level: 'error', message: 'Missing title; row skipped.' });
      return;
    }
    if (!item.id) {
      issues.push({ row: line, id: '', level: 'error', message: `"${label}" has no gift_id; row skipped.` });
      return;
    }
    if (seen.has(item.id)) {
      issues.push({ row: line, id: item.id, level: 'error', message: `Duplicate gift_id for "${label}"; row skipped.` });
      return;
    }
    seen.add(item.id);
    if (str(row.url) && !item.url) {
      issues.push({ row: line, id: item.id, level: 'warning', message: `"${label}" has an invalid purchase URL.` });
    }
    if (!str(row.url)) {
      issues.push({ row: line, id: item.id, level: 'warning', message: `"${label}" has no purchase URL.` });
    }
    if (Number.isNaN(parsePrice(row.price))) {
      issues.push({ row: line, id: item.id, level: 'warning', message: `"${label}" has an invalid price "${str(row.price)}".` });
    }
    if (!str(row.image_url)) {
      issues.push({ row: line, id: item.id, level: 'warning', message: `"${label}" has no image.` });
    } else if (isUnresolvedImage(row.image_url, config)) {
      issues.push({ row: line, id: item.id, level: 'warning',
        message: `"${label}" image is a relative path with no known host; add ${config.imagesDir}/${item.id}.webp or set imageBaseUrl.` });
    }
    items.push(item);
  });

  return { items, issues, missingColumns, unknownColumns };
}

/**
 * Rows for the canonical CSV: canonical columns first, then any unknown
 * columns so nothing from an import is silently dropped.
 * Booleans are normalized to TRUE/FALSE.
 */
export function canonicalize(headers, rows) {
  const extras = headers.filter((h) => h && !CANONICAL_COLUMNS.includes(h));
  const columns = [...CANONICAL_COLUMNS, ...extras];
  const out = rows.map((r) => {
    const o = {};
    for (const c of columns) o[c] = str(r[c]);
    o.most_wanted = parseBool(r.most_wanted) ? 'TRUE' : 'FALSE';
    if ('purchased' in o && o.purchased) o.purchased = parseBool(r.purchased) ? 'TRUE' : 'FALSE';
    return o;
  });
  return { columns, rows: out };
}

/** Parse purchases.csv rows into Map<gift_id, PurchaseRecord>. */
export function buildPurchases(rows) {
  const map = new Map();
  for (const r of rows) {
    const id = str(r.gift_id);
    if (!id) continue;
    map.set(id, {
      id,
      purchased: Math.max(0, Number.parseInt(str(r.purchased_quantity), 10) || 0),
      reserved: Math.max(0, Number.parseInt(str(r.reserved_quantity), 10) || 0),
      updatedAt: str(r.updated_at),
      archived: parseBool(r.archived),
    });
  }
  return map;
}

/**
 * Status of an item from the shared record plus marks made on this device.
 * The CSV's optional `purchased` column (TRUE) counts as fully purchased.
 * @returns {{requested:number, purchased:number, shared:number, local:number,
 *            remaining:number, state:'available'|'partial'|'purchased', label:string}}
 */
export function computeStatus(item, sharedRecord, localQty = 0) {
  const requested = item.quantity;
  const shared = item.csvPurchased ? requested : Math.min(requested, sharedRecord ? sharedRecord.purchased : 0);
  const local = Math.max(0, Math.min(requested - shared, localQty || 0));
  const purchased = shared + local;
  const remaining = requested - purchased;
  const state = purchased <= 0 ? 'available' : remaining <= 0 ? 'purchased' : 'partial';
  let label = 'Available';
  if (state === 'purchased') label = 'Purchased';
  else if (state === 'partial') label = `${purchased} of ${requested} purchased`;
  return { requested, purchased, shared, local, remaining, state, label };
}
