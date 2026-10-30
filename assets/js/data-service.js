// Loads the canonical wishlist and purchase-status CSVs from the repository's
// main branch, validates them, and keeps a last-known-good copy as an offline
// fallback. The cache is only ever a fallback: a successful fetch always wins.

import { CONFIG, rawUrl } from './config.js';
import { parseCsv } from './csv.js';
import { buildWishlist, buildPurchases } from './model.js';

const CACHE_KEY = 'pgl.lastGood.v1';

async function fetchText(url, signal) {
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}t=${Date.now()}`, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** Try raw.githubusercontent.com on main first, then the same-site copy. */
async function fetchFromMain(path, signal) {
  try {
    return { text: await fetchText(rawUrl(path), signal), source: 'main' };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { text: await fetchText(path, signal), source: 'site' };
  }
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(wishlistText, purchasesText, loadedAt) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ wishlistText, purchasesText, loadedAt }));
  } catch { /* storage full or blocked: ignore */ }
}

function build(wishlistText, purchasesText) {
  const parsed = parseCsv(wishlistText);
  const wl = buildWishlist(parsed.headers, parsed.rows);
  if (wl.missingColumns.length) {
    throw new Error(`Wishlist file is missing required column(s): ${wl.missingColumns.join(', ')}`);
  }
  const purchases = purchasesText ? buildPurchases(parseCsv(purchasesText).rows) : new Map();
  return {
    items: wl.items,
    purchases,
    issues: [...parsed.errors.map((e) => ({ row: e.row, id: '', level: 'error', message: e.message })), ...wl.issues],
    unknownColumns: wl.unknownColumns,
  };
}

/**
 * @typedef {Object} LoadResult
 * @property {'ok'|'cached'|'error'} status
 *   ok: fresh data from main (or same-site copy); cached: fetch failed, showing
 *   last-known-good copy; error: fetch failed and nothing is cached.
 * @property {import('./model.js').Item[]} items
 * @property {Map<string, Object>} purchases
 * @property {Array} issues          validation issues (for admin views)
 * @property {string[]} unknownColumns
 * @property {string|null} loadedAt  ISO time of the data shown
 * @property {'main'|'site'|'cache'|null} source
 * @property {string|null} error     user-facing error message when not ok
 * @property {boolean} purchasesUnavailable  status file failed to load
 */

/** @returns {Promise<LoadResult>} */
export async function loadWishlist({ signal } = {}) {
  try {
    const wl = await fetchFromMain(CONFIG.wishlistPath, signal);
    let purchasesText = '';
    let purchasesUnavailable = false;
    try {
      purchasesText = (await fetchFromMain(CONFIG.purchasesPath, signal)).text;
    } catch (err) {
      if (signal?.aborted) throw err;
      purchasesUnavailable = true;
    }
    const data = build(wl.text, purchasesText);
    const loadedAt = new Date().toISOString();
    writeCache(wl.text, purchasesText, loadedAt);
    return { status: 'ok', ...data, loadedAt, source: wl.source, error: null, purchasesUnavailable };
  } catch (err) {
    if (signal?.aborted) throw err;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[wishlist] load failed:', message);
    const cached = readCache();
    if (cached) {
      try {
        const data = build(cached.wishlistText, cached.purchasesText);
        return { status: 'cached', ...data, loadedAt: cached.loadedAt, source: 'cache',
          error: "Couldn't reach the latest list, so you're seeing the last saved copy.", purchasesUnavailable: false };
      } catch { /* corrupt cache: fall through */ }
    }
    return { status: 'error', items: [], purchases: new Map(), issues: [], unknownColumns: [],
      loadedAt: null, source: null, error: "Couldn't load the gift list. Please check your connection and try again.",
      purchasesUnavailable: true };
  }
}
