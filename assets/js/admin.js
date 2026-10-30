// List keeper (admin) page controller.
import { CONFIG } from './config.js';
import { parseCsv, toCsv } from './csv.js';
import {
  buildWishlist, canonicalize, buildPurchases, computeStatus, PURCHASE_COLUMNS, isUnresolvedImage, safeHttpUrl,
} from './model.js';
import { loadWishlist } from './data-service.js';
import { getToken, setToken, verifyToken, commitFile, blobToBase64 } from './github.js';
import { el, setStatus, withBusy, confirmDialog, downloadFile, fmtDate, makeThumb } from './admin/ui.js';

const $ = (id) => document.getElementById(id);
const repoName = `${CONFIG.owner}/${CONFIG.repo}`;

const state = {
  live: null,            // LoadResult from loadWishlist()
  connectedAs: '',       // repo full_name when a token is verified
  edits: new Map(),      // gift_id -> new purchased quantity
  deletes: new Set(),    // archived gift_ids to delete
  imp: null,             // current import preview
  uploads: new Map(),    // gift_id -> { file, ext, previewUrl }
};

const connected = () => !!state.connectedAs && !!getToken();
const nowIso = () => new Date().toISOString();
const bool = (v) => (v ? 'TRUE' : 'FALSE');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------------ */
/* 1. GitHub connection                                                */
/* ------------------------------------------------------------------ */
function renderConnect() {
  const body = $('connect-body');
  body.replaceChildren();
  const status = el('div', { class: 'msg', role: 'status' });

  if (connected()) {
    body.append(
      el('p', {}, 'Connected to ', el('strong', { text: state.connectedAs }), '. You can publish changes directly.'),
      el('button', {
        type: 'button', class: 'btn secondary', text: 'Disconnect',
        onclick: () => { setToken(''); state.connectedAs = ''; renderAll(); },
      }),
    );
    return;
  }

  const input = el('input', {
    type: 'password', id: 'token-input', autocomplete: 'off', spellcheck: 'false',
    'aria-label': 'GitHub token', placeholder: 'Paste token here',
  });
  const btn = el('button', { type: 'button', class: 'btn', text: 'Connect' });
  const connect = () => {
    const t = input.value.trim();
    if (!t) { setStatus(status, 'err', 'Paste a token first.'); return; }
    withBusy(btn, async () => {
      try {
        const name = await verifyToken(t);
        setToken(t);
        state.connectedAs = name;
        input.value = '';
        renderAll();
      } catch (err) {
        setStatus(status, 'err', err instanceof Error ? err.message : String(err));
      }
    });
  };
  btn.addEventListener('click', connect);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });

  body.append(
    el('p', {},
      'To publish changes directly, paste a fine-grained GitHub token with ',
      el('strong', { text: 'Contents: Read and write' }), ' access to ', el('code', { text: repoName }),
      '. It stays in this browser tab only and is forgotten when you close it. ',
      el('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener', text: 'Create a token on GitHub' }),
      '.'),
    el('div', { class: 'row' }, input, btn),
    status,
    el('p', { class: 'muted', text: `Not connected: you can still download each file below and commit it to the main branch of ${repoName} yourself.` }),
  );
}

async function restoreConnection() {
  const t = getToken();
  if (!t) return;
  try { state.connectedAs = await verifyToken(t); } catch { setToken(''); state.connectedAs = ''; }
}

/* ------------------------------------------------------------------ */
/* 2. Health                                                           */
/* ------------------------------------------------------------------ */
const SOURCE_LABEL = { main: 'main branch (live)', site: 'site copy', cache: 'cached copy on this device' };

function issueList(issues) {
  return el('ul', { class: 'issues' }, issues.map((i) => el('li', { class: i.level },
    el('span', { class: 'ico', 'aria-hidden': 'true', text: i.level === 'error' ? '⛔' : '⚠️' }),
    el('span', { class: 'visually-hidden', text: i.level === 'error' ? 'Error: ' : 'Warning: ' }),
    el('span', {}, i.row ? `Line ${i.row}: ` : '', i.message))));
}

const imageIssues = (issues) => issues.filter((i) => i.level === 'warning' && /\bimage\b/.test(i.message));

function renderHealth() {
  const body = $('health-body');
  const live = state.live;
  body.replaceChildren();
  if (!live) { body.append(el('p', { class: 'muted', text: 'Loading…' })); return; }

  if (live.status === 'error') {
    body.append(el('div', { class: 'msg err', role: 'alert', text: live.error }));
    return;
  }
  if (live.status === 'cached') body.append(el('div', { class: 'msg warn', role: 'status', text: live.error }));
  if (live.purchasesUnavailable) {
    body.append(el('div', { class: 'msg warn', role: 'status', text: 'Purchase status file could not be loaded. Saving purchase status is disabled until it loads.' }));
  }
  const errs = live.issues.filter((i) => i.level === 'error').length;
  const warns = live.issues.filter((i) => i.level === 'warning').length;
  const imgs = imageIssues(live.issues);
  const stat = (k, v) => el('div', {}, el('dt', { text: k }), el('dd', { text: v }));
  body.append(el('dl', { class: 'stats' },
    stat('Source', SOURCE_LABEL[live.source] || '—'),
    stat('Loaded', fmtDate(live.loadedAt) || '—'),
    stat('Items', String(live.items.length)),
    stat('Errors', String(errs)),
    stat('Warnings', String(warns)),
    stat('Images needing a picture', String(imgs.length)),
  ));
  if (imgs.length) {
    body.append(el('p', { class: 'msg warn', text: `${plural(imgs.length, 'item')} ha${imgs.length === 1 ? 's' : 've'} no usable image yet. Use section 5 to upload pictures.` }));
  }
  if (live.unknownColumns.length) {
    body.append(el('p', { class: 'muted', text: `Extra columns in the live file: ${live.unknownColumns.join(', ')}` }));
  }
  if (live.issues.length) body.append(el('h3', { text: 'Problems found' }), issueList(live.issues));
  else body.append(el('p', { class: 'msg ok', text: 'No problems found in the live list.' }));
}

async function reload() {
  state.live = null;
  renderHealth();
  state.live = await loadWishlist();
  state.edits.clear();
  state.deletes.clear();
  renderHealth();
  renderImportBody();
  renderPurchases();
  renderImages();
}

/* ------------------------------------------------------------------ */
/* Purchases CSV helpers                                               */
/* ------------------------------------------------------------------ */
function serializePurchases(map) {
  const rows = [];
  for (const r of map.values()) {
    if (!r.purchased && !r.reserved && !r.archived) continue;
    rows.push({
      gift_id: r.id,
      purchased_quantity: String(r.purchased),
      reserved_quantity: String(r.reserved),
      updated_at: r.updatedAt || '',
      archived: bool(r.archived),
    });
  }
  return toCsv(rows, PURCHASE_COLUMNS);
}

/** Records after applying the in-page edits to the loaded purchases. */
function buildPurchasesAfterEdits() {
  const live = state.live;
  const base = live.purchases;
  const itemIds = new Set(live.items.map((i) => i.id));
  const out = new Map();
  const now = nowIso();
  for (const item of live.items) {
    const rec = base.get(item.id) || { id: item.id, purchased: 0, reserved: 0, updatedAt: '', archived: false };
    const edited = state.edits.has(item.id);
    out.set(item.id, {
      ...rec,
      purchased: edited ? state.edits.get(item.id) : rec.purchased,
      archived: false,
      updatedAt: edited ? now : rec.updatedAt,
    });
  }
  for (const rec of base.values()) {
    if (itemIds.has(rec.id) || state.deletes.has(rec.id)) continue;
    out.set(rec.id, { ...rec, archived: true });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 3. Import                                                           */
/* ------------------------------------------------------------------ */
function itemSig(it) {
  return { title: it.title, url: it.url || '', price: it.price == null ? '' : String(it.price), notes: it.reason, image: it.images.join('|') };
}

function diffAgainstLive(items) {
  const live = state.live;
  if (!live || live.status === 'error') return null;
  const cur = new Map(live.items.map((i) => [i.id, i]));
  const next = new Map(items.map((i) => [i.id, i]));
  const added = items.filter((i) => !cur.has(i.id));
  const removed = live.items.filter((i) => !next.has(i.id));
  const changed = [];
  for (const it of items) {
    const old = cur.get(it.id);
    if (!old) continue;
    const a = itemSig(old);
    const b = itemSig(it);
    const fields = Object.keys(a).filter((k) => a[k] !== b[k]);
    if (fields.length) changed.push({ title: it.title, fields });
  }
  return { added, removed, changed };
}

function expandable(label, names) {
  if (!names.length) return el('p', { class: 'muted', text: `${label}: 0` });
  return el('details', {}, el('summary', { text: `${label}: ${names.length}` }), el('ul', {}, names.map((n) => el('li', { text: n }))));
}

async function handleImportFile(file) {
  $('dz-file').textContent = file ? file.name : 'No file chosen';
  if (!file) { state.imp = null; renderImportBody(); return; }
  try {
    const text = await file.text();
    const parsed = parseCsv(text);
    const wl = buildWishlist(parsed.headers, parsed.rows);
    const canon = canonicalize(parsed.headers, parsed.rows);
    const csv = toCsv(canon.rows, canon.columns);
    state.imp = { fileName: file.name, parsed, wl, canon, csv };
  } catch (err) {
    state.imp = { fileName: file.name, error: err instanceof Error ? err.message : String(err) };
  }
  renderImportBody();
}

function imageStatus(raw) {
  const r = (raw || '').trim();
  if (!r) return ['None', 'warn'];
  if (safeHttpUrl(r)) return ['Web link', 'ok'];
  if (r.startsWith(`${CONFIG.imagesDir}/`)) return ['Site file', 'ok'];
  return isUnresolvedImage(r) ? ['Needs upload', 'warn'] : ['Web link', 'ok'];
}

function renderImportBody() {
  const body = $('import-body');
  body.replaceChildren();
  const imp = state.imp;
  if (!imp) return;
  if (imp.error) { body.append(el('div', { class: 'msg err', role: 'alert', text: `Could not read the file: ${imp.error}` })); return; }

  const { parsed, wl, canon } = imp;
  const blocked = wl.missingColumns.length > 0 || wl.items.length === 0;
  const skipped = parsed.rows.length - wl.items.length;
  const mostWanted = wl.items.filter((i) => i.mostWanted).length;

  if (wl.missingColumns.length) {
    body.append(el('div', { class: 'msg err', role: 'alert', text: `This file is missing required column(s): ${wl.missingColumns.join(', ')}. It cannot be published.` }));
  } else if (!wl.items.length) {
    body.append(el('div', { class: 'msg err', role: 'alert', text: 'No valid items were found in this file.' }));
  }
  if (wl.unknownColumns.length) {
    body.append(el('div', { class: 'msg info', text: `These extra columns will be kept: ${wl.unknownColumns.join(', ')}` }));
  }

  body.append(el('h3', { text: `${plural(wl.items.length, 'item')} ready to import (${mostWanted} most wanted)` }));
  if (skipped > 0) body.append(el('p', { class: 'msg warn', text: `${plural(skipped, 'row')} will be skipped by the gift list because of the problems below.` }));

  const allIssues = [
    ...parsed.errors.map((e) => ({ row: e.row, level: 'error', message: e.message })),
    ...wl.issues,
  ];
  if (allIssues.length) {
    body.append(el('details', { open: allIssues.length <= 8 }, el('summary', { text: `Problems found: ${allIssues.length}` }), issueList(allIssues)));
  }

  const diff = diffAgainstLive(wl.items);
  if (diff) {
    body.append(el('h3', { text: 'Compared with the current live list' }),
      expandable('Added', diff.added.map((i) => i.title)),
      expandable('Removed', diff.removed.map((i) => i.title)),
      expandable('Changed (title, link, price, notes or image)', diff.changed.map((c) => `${c.title} — ${c.fields.join(', ')}`)));
    if (diff.removed.length) body.append(el('p', { class: 'muted', text: 'Their purchase records will be archived, not deleted.' }));
  } else {
    body.append(el('p', { class: 'muted', text: 'The current live list could not be loaded, so no comparison is available.' }));
  }

  // Preview table
  const rawById = new Map(canon.rows.map((r) => [r.gift_id, r]));
  const rows = wl.items.map((it) => {
    const [imgLabel, imgKind] = imageStatus(rawById.get(it.id)?.image_url);
    return el('tr', {},
      el('td', { class: 'title-cell', 'data-label': 'Title', text: it.title }),
      el('td', { 'data-label': 'Price', text: it.priceText || '—' }),
      el('td', { 'data-label': 'Qty', text: String(it.quantity) }),
      el('td', { 'data-label': 'Most wanted' }, it.mostWanted ? el('span', { class: 'badge gold', text: 'Most wanted' }) : '—'),
      el('td', { 'data-label': 'Tags', text: it.tags.join(', ') || '—' }),
      el('td', { 'data-label': 'Link', text: it.url ? 'Yes' : 'No' }),
      el('td', { 'data-label': 'Image' }, el('span', { class: `badge ${imgKind}`, text: imgLabel })));
  });
  body.append(el('div', { class: 'table-wrap' }, el('table', { class: 'stackable' },
    el('thead', {}, el('tr', {}, ['Title', 'Price', 'Qty', 'Most wanted', 'Tags', 'Link', 'Image'].map((h) => el('th', { scope: 'col', text: h })))),
    el('tbody', {}, rows))));

  // Actions
  const status = el('div', { class: 'msg', role: 'status' });
  const dl = el('button', { type: 'button', class: 'btn secondary', id: 'dl-wishlist', text: 'Download wishlist.csv', disabled: blocked,
    onclick: () => { downloadFile('wishlist.csv', imp.csv); setStatus(status, 'info', `Downloaded wishlist.csv. Commit it to ${CONFIG.wishlistPath} on the main branch.`); } });
  const pub = el('button', { type: 'button', class: 'btn', id: 'publish-wishlist', text: 'Publish to main', disabled: blocked || !connected() });
  pub.addEventListener('click', async () => {
    const n = wl.items.length;
    if (!(await confirmDialog('Publish to main?', `Replace ${CONFIG.wishlistPath} on main with ${plural(n, 'item')}?`, 'Publish'))) return;
    withBusy(pub, () => publishWishlist(imp, status));
  });
  body.append(el('div', { class: 'row' }, pub, dl), status);
  if (!connected()) {
    body.append(el('p', { class: 'muted', text: `Not connected to GitHub. Download the file and commit it to ${CONFIG.wishlistPath} on the main branch.` }));
  }
}

async function publishWishlist(imp, status) {
  const token = getToken();
  const n = imp.wl.items.length;
  try {
    setStatus(status, 'info', 'Publishing the wishlist…');
    const url = await commitFile({ token, path: CONFIG.wishlistPath, text: imp.csv, message: `Update wishlist from GiftList import (${n} items)` });
    let purchasesUrl = '';
    let archivedNote = '';
    const live = state.live;
    if (live && live.status === 'ok' && !live.purchasesUnavailable) {
      const ids = new Set(imp.wl.items.map((i) => i.id));
      const next = new Map();
      const now = nowIso();
      let changed = 0;
      for (const rec of live.purchases.values()) {
        const archived = !ids.has(rec.id);
        if (archived !== rec.archived) { changed += 1; next.set(rec.id, { ...rec, archived, updatedAt: now }); } else next.set(rec.id, { ...rec });
      }
      if (changed) {
        purchasesUrl = await commitFile({ token, path: CONFIG.purchasesPath, text: serializePurchases(next), message: `Update wishlist from GiftList import (${n} items)` });
        live.purchases = next;
        archivedNote = ` Purchase records updated for ${plural(changed, 'item')}.`;
      }
    } else {
      archivedNote = ' Purchase records were not touched because the current status file is not loaded; check section 4.';
    }
    if (live) {
      live.items = imp.wl.items;
      state.edits.clear();
      state.deletes.clear();
    }
    setStatus(status, 'ok', `Published ${plural(n, 'item')}.${archivedNote} It can take a few minutes to appear on the gift list.`, url || purchasesUrl);
    renderPurchases();
    renderImages();
  } catch (err) {
    setStatus(status, 'err', `Publishing failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/* ------------------------------------------------------------------ */
/* 4. Purchase status                                                  */
/* ------------------------------------------------------------------ */
function renderPurchases() {
  const body = $('purchases-body');
  body.replaceChildren();
  const live = state.live;
  if (!live) { body.append(el('p', { class: 'muted', text: 'Loading…' })); return; }
  if (live.status === 'error') { body.append(el('div', { class: 'msg err', role: 'alert', text: 'The list could not be loaded, so purchase status cannot be edited.' })); return; }

  const canPublish = connected() && live.status === 'ok' && !live.purchasesUnavailable;
  if (live.status !== 'ok' || live.purchasesUnavailable) {
    body.append(el('div', { class: 'msg warn', role: 'status', text: 'The latest purchase file was not loaded, so publishing is disabled to avoid overwriting newer data. Reload and try again.' }));
  }

  const items = [...live.items].sort((a, b) => (Number(b.mostWanted) - Number(a.mostWanted)) || (a.order - b.order));
  const dirtyBadge = el('span', { class: 'badge gold', id: 'dirty-count' });
  const saveBtn = el('button', { type: 'button', class: 'btn', id: 'save-purchases', text: 'Save purchase status' });
  const dlBtn = el('button', { type: 'button', class: 'btn secondary', id: 'dl-purchases', text: 'Download purchases.csv' });
  const resetBtn = el('button', { type: 'button', class: 'btn secondary', id: 'reset-purchases', text: 'Reset changes' });
  const status = el('div', { class: 'msg', role: 'status' });

  const refreshDirty = () => {
    const n = state.edits.size + state.deletes.size;
    dirtyBadge.textContent = n ? `${plural(n, 'unsaved change')}` : '';
    dirtyBadge.hidden = !n;
    saveBtn.disabled = !canPublish || !n;
    dlBtn.disabled = false;
    resetBtn.disabled = !n;
  };

  const rows = items.map((it) => {
    const rec = live.purchases.get(it.id);
    const base = rec ? Math.min(it.quantity, rec.purchased) : 0;
    const input = el('input', { type: 'number', min: '0', max: String(it.quantity), step: '1', value: String(state.edits.has(it.id) ? state.edits.get(it.id) : base), 'aria-label': `Purchased quantity for ${it.title}` });
    const stateCell = el('td', { 'data-label': 'Status' });
    const tr = el('tr', {}, el('td', { class: 'title-cell', 'data-label': 'Gift' }, it.title, it.mostWanted ? [' ', el('span', { class: 'badge gold', text: 'Most wanted' })] : ''),
      el('td', { 'data-label': 'Wanted', text: String(it.quantity) }),
      el('td', { 'data-label': 'Purchased' }, input),
      stateCell,
      el('td', { 'data-label': 'Last updated', text: fmtDate(rec?.updatedAt) || '—' }));
    const paint = (qty) => {
      stateCell.textContent = computeStatus(it, { purchased: qty }, 0).label;
      tr.classList.toggle('dirty', state.edits.has(it.id));
    };
    paint(state.edits.has(it.id) ? state.edits.get(it.id) : base);
    input.addEventListener('input', () => {
      let v = Number.parseInt(input.value, 10);
      if (!Number.isFinite(v)) return;
      v = Math.max(0, Math.min(it.quantity, v));
      if (v === base) state.edits.delete(it.id); else state.edits.set(it.id, v);
      paint(v);
      refreshDirty();
    });
    input.addEventListener('change', () => { input.value = String(state.edits.has(it.id) ? state.edits.get(it.id) : base); });
    return tr;
  });

  body.append(el('div', { class: 'table-wrap' }, el('table', { class: 'stackable' },
    el('thead', {}, el('tr', {}, ['Gift', 'Wanted', 'Purchased', 'Status', 'Last updated'].map((h) => el('th', { scope: 'col', text: h })))),
    el('tbody', {}, rows))));

  // Archived records
  const itemIds = new Set(live.items.map((i) => i.id));
  const archived = [...live.purchases.values()].filter((r) => !itemIds.has(r.id) && !state.deletes.has(r.id));
  if (archived.length) {
    const list = archived.map((r) => {
      const del = el('button', { type: 'button', class: 'btn danger', text: 'Delete record', 'aria-label': `Delete archived record ${r.id}`,
        onclick: () => { state.deletes.add(r.id); renderPurchases(); } });
      return el('tr', {}, el('td', { class: 'title-cell', 'data-label': 'Gift ID', text: r.id }),
        el('td', { 'data-label': 'Purchased', text: String(r.purchased) }),
        el('td', { 'data-label': 'Last updated', text: fmtDate(r.updatedAt) || '—' }),
        el('td', { 'data-label': '' }, del));
    });
    body.append(el('details', {}, el('summary', { text: `Archived (removed from list): ${archived.length}` }),
      el('div', { class: 'table-wrap' }, el('table', { class: 'stackable' },
        el('thead', {}, el('tr', {}, ['Gift ID', 'Purchased', 'Last updated', ''].map((h) => el('th', { scope: 'col', text: h })))),
        el('tbody', {}, list)))));
  }

  const text = () => serializePurchases(buildPurchasesAfterEdits());
  dlBtn.addEventListener('click', () => {
    downloadFile('purchases.csv', text());
    setStatus(status, 'info', `Downloaded purchases.csv. Commit it to ${CONFIG.purchasesPath} on the main branch.`);
  });
  resetBtn.addEventListener('click', () => { state.edits.clear(); state.deletes.clear(); renderPurchases(); });
  saveBtn.addEventListener('click', async () => {
    if (!(await confirmDialog('Save purchase status?', `Replace ${CONFIG.purchasesPath} on main with these changes? Everyone will see them.`, 'Save'))) return;
    withBusy(saveBtn, async () => {
      try {
        const next = buildPurchasesAfterEdits();
        const url = await commitFile({ token: getToken(), path: CONFIG.purchasesPath, text: serializePurchases(next), message: 'Update purchase status' });
        live.purchases = next;
        state.edits.clear();
        state.deletes.clear();
        renderPurchases();
        const s = $('purchases-body').querySelector('.msg.after');
        if (s) setStatus(s, 'ok', 'Purchase status saved. It can take a few minutes to appear on the gift list.', url);
      } catch (err) {
        setStatus(status, 'err', `Saving failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  });

  body.append(el('div', { class: 'row' }, saveBtn, dlBtn, resetBtn, dirtyBadge), status, el('div', { class: 'msg after', role: 'status' }));
  if (!connected()) body.append(el('p', { class: 'muted', text: `Not connected to GitHub. Download the file and commit it to ${CONFIG.purchasesPath} on the main branch.` }));
  refreshDirty();
}

/* ------------------------------------------------------------------ */
/* 5. Images                                                           */
/* ------------------------------------------------------------------ */
const MIME_EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function renderImages() {
  const body = $('images-body');
  body.replaceChildren();
  const live = state.live;
  if (!live) { body.append(el('p', { class: 'muted', text: 'Loading…' })); return; }
  if (!live.items.length) { body.append(el('p', { class: 'muted', text: 'No items loaded.' })); return; }

  const list = el('div', { class: 'img-list' });
  for (const it of live.items) {
    const up = state.uploads.get(it.id);
    const thumbHolder = el('div', {}, up?.done ? thumbFromUrl(up.previewUrl, it.title) : makeThumb(it.images, ''));
    const status = el('div', { class: 'msg', role: 'status' });
    const preview = el('div', {});
    const actions = el('div', { class: 'img-actions' });
    const target = (ext) => `${CONFIG.imagesDir}/${it.id}.${ext}`;

    const fileInput = el('input', { type: 'file', accept: 'image/webp,image/jpeg,image/png', 'aria-label': `Choose an image for ${it.title}` });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      preview.replaceChildren();
      actions.querySelectorAll('[data-act]').forEach((n) => n.remove());
      setStatus(status, '', '');
      if (!f) { state.uploads.delete(it.id); return; }
      const ext = MIME_EXT[f.type];
      if (!ext) { setStatus(status, 'err', 'Please choose a WebP, JPEG or PNG image.'); fileInput.value = ''; return; }
      if (f.size > MAX_IMAGE_BYTES) { setStatus(status, 'err', `That file is ${(f.size / 1048576).toFixed(1)} MB. The limit is 2 MB.`); fileInput.value = ''; return; }
      const previewUrl = URL.createObjectURL(f);
      state.uploads.set(it.id, { file: f, ext, previewUrl });
      preview.replaceChildren(thumbFromUrl(previewUrl, `Preview for ${it.title}`));
      const path = target(ext);
      if (connected()) {
        const btn = el('button', { type: 'button', class: 'btn', 'data-act': '1', text: 'Upload' });
        btn.addEventListener('click', () => withBusy(btn, async () => {
          try {
            const base64 = await blobToBase64(f);
            const url = await commitFile({ token: getToken(), path, base64, message: `Add image for ${it.title}` });
            state.uploads.set(it.id, { file: f, ext, previewUrl, done: true });
            thumbHolder.replaceChildren(thumbFromUrl(previewUrl, it.title));
            setStatus(status, 'ok', `Uploaded to ${path}. It can take a few minutes to appear on the site.`, url);
          } catch (err) {
            setStatus(status, 'err', `Upload failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }));
        actions.append(btn);
      }
      const dl = el('button', { type: 'button', class: connected() ? 'btn secondary' : 'btn', 'data-act': '1', text: `Download as ${it.id}.${ext}`,
        onclick: () => downloadFile(`${it.id}.${ext}`, f, f.type) });
      actions.append(dl);
      if (!connected()) setStatus(status, 'info', `Not connected. Commit the downloaded file to ${path} on the main branch.`);
    });
    actions.append(fileInput);

    list.append(el('div', { class: 'img-row' },
      thumbHolder,
      el('div', {},
        el('h3', { text: it.title }),
        el('div', { class: 'path', text: `Upload target: ${CONFIG.imagesDir}/${it.id}.webp / .jpg / .png` }),
        actions, preview, status)));
  }
  body.append(list);
}

function thumbFromUrl(url, alt) {
  const box = el('div', { class: 'thumb' });
  box.append(el('img', { src: url, alt }));
  return box;
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */
function renderAll() {
  renderConnect();
  renderImportBody();
  renderPurchases();
  renderImages();
}

function wireImport() {
  const input = $('import-file');
  const zone = $('dropzone');
  input.addEventListener('change', () => handleImportFile(input.files && input.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('drag'); }));
  zone.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleImportFile(f);
  });
}

async function init() {
  wireImport();
  renderConnect();
  $('reload-btn').addEventListener('click', async (e) => {
    if (state.edits.size || state.deletes.size) {
      if (!(await confirmDialog('Reload and discard changes?', 'You have unsaved purchase changes. Reloading will discard them.', 'Reload'))) return;
    }
    withBusy(e.currentTarget, reload);
  });
  renderHealth();
  renderImportBody();
  renderPurchases();
  renderImages();
  await restoreConnection();
  renderConnect();
  state.live = await loadWishlist();
  renderAll();
  renderHealth();
}

init();
