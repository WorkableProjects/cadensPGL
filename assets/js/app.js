// Guest wishlist page: loads the CSV, renders cards, handles search/filter,
// the detail dialog, the mark-as-purchased flow, refresh, look and text size,
// plus the welcome screen + intro shown once per visit.

import { CONFIG } from './config.js';
import { loadWishlist } from './data-service.js';
import { computeStatus } from './model.js';
import { getLocalQty, addLocalMark, clearLocalMark } from './local-marks.js';
import { h, errorIcon, giftIcon } from './ui/dom.js';
import { createCard, createSkeletons } from './ui/card.js';
import { createDetailDialog, createConfirmDialog } from './ui/dialogs.js';
import { initToasts, showToast } from './ui/toast.js';
import { runGate, playIntro, SKINS, SIZES } from './ui/gate.js';

const $ = (id) => document.getElementById(id);
const el = {
  title: $('page-title'), welcome: $('welcome'), search: $('search'), grid: $('grid'), stateArea: $('state-area'),
  stats: $('stats'), banners: $('banners'), refresh: $('refresh'), refreshLabel: $('refresh-label'),
  updated: $('updated'), sr: $('sr-status'), toasts: $('toasts'), gateForm: $('gate-form'), gateTitle: $('gate-title'), intro: $('intro'),
};

const state = {
  items: [], purchases: new Map(), loadedAt: null, loadStatus: 'loading', loadError: null,
  purchasesUnavailable: false, filter: 'all', query: '', hasData: false, lastLoadMs: 0,
};
let controller = null;
let renderedIds = new Set();
let openerSel = null; // { id, cls } for focus return

// ---------- storage helpers ----------
function safeGet(store, key) { try { return window[store].getItem(key); } catch { return null; } }
function safeSet(store, key, val) { try { window[store].setItem(key, val); } catch { /* ignore */ } }

// ---------- status helpers ----------
function entries() {
  return state.items.map((item) => ({ item, status: computeStatus(item, state.purchases.get(item.id), getLocalQty(item.id)) }));
}
const entryFor = (id) => entries().find((e) => e.item.id === id);

function matches(item, q) {
  if (!q) return true;
  const hay = [item.title, item.description, item.reason, item.category, ...item.tags].join('\n').toLowerCase();
  return hay.includes(q);
}

function visibleEntries(all) {
  const q = state.query.trim().toLowerCase();
  const list = all.filter(({ item, status }) => {
    if (state.filter === 'available' && status.state === 'purchased') return false;
    if (state.filter === 'purchased' && status.state !== 'purchased') return false;
    return matches(item, q);
  });
  return list.sort((a, b) => {
    const pa = a.status.state === 'purchased' ? 1 : 0;
    const pb = b.status.state === 'purchased' ? 1 : 0;
    if (pa !== pb) return pa - pb;
    if (a.item.mostWanted !== b.item.mostWanted) return a.item.mostWanted ? -1 : 1;
    return a.item.order - b.item.order;
  });
}

// ---------- rendering ----------
const handlers = {
  onOpen(id, opener) { openDetail(id, opener); },
  onMark(id) { startMark(id); },
  onUndo(id) { clearLocalMark(id); renderAll(); showToast('Undone.'); },
};

function renderStats(all) {
  const purchased = all.filter((e) => e.status.state === 'purchased').length;
  const total = all.length;
  el.stats.textContent = state.hasData
    ? `${total} ${total === 1 ? 'gift' : 'gifts'} · ${total - purchased} available · ${purchased} purchased` : '';
  const counts = { all: total, available: total - purchased, purchased };
  const labels = { all: 'All', available: 'Available', purchased: 'Purchased' };
  document.querySelectorAll('#filter-seg .seg-btn').forEach((b) => {
    const f = b.dataset.filter;
    b.textContent = `${labels[f]} (${state.hasData ? counts[f] : 0})`;
    b.setAttribute('aria-pressed', String(state.filter === f));
  });
}

function renderBanners() {
  const nodes = [];
  if (state.loadStatus === 'cached' || (state.loadError && state.hasData)) {
    nodes.push(h('div', { class: 'banner banner-warning' },
      h('span', { class: 'banner-msg' }, h('span', { 'aria-hidden': 'true' }, '⚠ '), state.loadError),
      h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => load({ manual: true }) }, 'Try again')));
  }
  if (state.purchasesUnavailable && state.loadStatus === 'ok') {
    nodes.push(h('div', { class: 'banner banner-info' },
      h('span', { class: 'banner-msg' }, h('span', { 'aria-hidden': 'true' }, 'ⓘ '),
        "Purchase status couldn't be loaded; some gifts may already be bought.")));
  }
  el.banners.replaceChildren(...nodes);
}

function renderUpdated() {
  if (!state.loadedAt) { el.updated.textContent = '…'; el.updated.setAttribute('datetime', ''); return; }
  const d = new Date(state.loadedAt);
  el.updated.setAttribute('datetime', d.toISOString());
  el.updated.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function emptyState({ icon, title, text, button }) {
  return h('div', { class: 'empty' }, icon, h('h2', { class: 'empty-title' }, title), text ? h('p', null, text) : null, button);
}

/** @param {'all'|'new'|'none'} animate */
function renderGrid(all, animate) {
  const list = visibleEntries(all);
  el.stateArea.replaceChildren();
  if (state.loadStatus === 'error' && !state.hasData) {
    el.grid.replaceChildren();
    el.stateArea.append(emptyState({ icon: errorIcon(), title: "We couldn't load the list", text: state.loadError,
      button: h('button', { type: 'button', class: 'btn btn-primary', onclick: () => load({ manual: true }) }, 'Try again') }));
    renderedIds = new Set();
    return;
  }
  if (!list.length && state.hasData) {
    const q = state.query.trim();
    if (!all.length) {
      el.stateArea.append(emptyState({ icon: giftIcon(), title: 'The list is empty right now.', text: 'Check back soon!' }));
    } else if (q) {
      el.stateArea.append(emptyState({ icon: giftIcon(), title: `No gifts match “${q}”.`, text: 'Try a different word, or clear the search.',
        button: h('button', { type: 'button', class: 'btn btn-secondary', onclick: clearSearch }, 'Clear search') }));
    } else {
      el.stateArea.append(emptyState({ icon: giftIcon(), title: state.filter === 'purchased' ? 'Nothing has been purchased yet.' : 'Everything has been purchased!',
        button: h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => setFilter('all') }, 'Show all gifts') }));
    }
  }
  let n = 0;
  const prev = renderedIds;
  const cards = list.map(({ item, status }) => {
    const isNew = animate === 'all' || (animate === 'new' && !prev.has(item.id));
    return createCard(item, status, handlers, { enterIndex: isNew ? n++ : -1 });
  });
  el.grid.replaceChildren(...cards);
  renderedIds = new Set(list.map((e) => e.item.id));
}

function renderAll(animate = 'none') {
  const all = entries();
  renderStats(all);
  renderBanners();
  renderUpdated();
  renderGrid(all, animate);
  if (detail.isOpen) {
    const cur = all.find((e) => e.item.id === detail.currentId);
    if (cur) detail.update(cur.item, cur.status);
  }
}

function showSkeletons() {
  el.stateArea.replaceChildren();
  el.grid.replaceChildren(...createSkeletons(6));
  el.grid.setAttribute('aria-busy', 'true');
  el.sr.textContent = 'Loading gifts…';
}

// ---------- search / filter ----------
let searchTimer = 0;
function setFilter(f) {
  state.filter = f;
  safeSet('sessionStorage', 'pgl.filter', f);
  renderAll('all');
}
function clearSearch() {
  el.search.value = '';
  state.query = '';
  renderAll('all');
  el.search.focus();
}

// ---------- dialogs & mark flow ----------
function focusOpener() {
  if (!openerSel) return;
  const li = el.grid.querySelector(`[data-id="${CSS.escape(openerSel.id)}"]`);
  const target = li && (li.querySelector(`.${openerSel.cls}`) || li.querySelector('.js-title'));
  if (target) target.focus();
  else el.grid.closest('main').focus({ preventScroll: true });
}

const detail = createDetailDialog({ handlers, onClosed: () => { if (!confirmDlg.isOpen) focusOpener(); } });
const confirmDlg = createConfirmDialog({
  onClosed: () => {
    if (detail.isOpen) {
      const btn = detail.el.querySelector('.js-mark') || detail.el.querySelector('.sheet-title');
      if (btn) btn.focus({ preventScroll: true });
    } else focusOpener();
  },
});
document.body.append(detail.el, confirmDlg.el);

function openDetail(id, opener) {
  const e = entryFor(id);
  if (!e) return;
  const cls = opener && opener.classList.contains('js-details') ? 'js-details' : 'js-title';
  openerSel = { id, cls };
  detail.open(e.item, e.status);
}

function startMark(id) {
  const e = entryFor(id);
  if (!e || e.status.state === 'purchased') return;
  if (!detail.isOpen) openerSel = { id, cls: 'js-mark' };
  confirmDlg.open(e.item, e.status, (qty) => {
    if (!addLocalMark(id, qty)) return "Couldn't save on this device. Your browser may be blocking storage, so please tell the list keeper directly.";
    setTimeout(() => afterMark(id), 0);
    return true;
  });
}

function afterMark(id) {
  renderAll('none');
  celebrate(id);
  const link = CONFIG.ownerContact ? { href: CONFIG.ownerContact, label: CONFIG.ownerContactLabel } : null;
  // Wait a tick so the confirm dialog's close animation hands the toast to the right host.
  setTimeout(() => showToast('Marked as purchased. Thank you!', link), 260);
}

function celebrate(id) {
  const li = el.grid.querySelector(`[data-id="${CSS.escape(id)}"]`);
  const targets = [li && li.querySelector('.media'), detail.isOpen && detail.currentId === id ? detail.el.querySelector('.media') : null].filter(Boolean);
  for (const media of targets) {
    media.classList.add('pop');
    const burst = h('span', { class: 'confetti', 'aria-hidden': 'true' },
      Array.from({ length: 10 }, (_, i) => h('i', { style: `--a:${i * 36}deg;--d:${i % 2 ? 46 : 64}px;--c:${i % 3}` })));
    media.append(burst);
    setTimeout(() => { burst.remove(); media.classList.remove('pop'); }, 1100);
  }
}

// ---------- loading ----------
function setRefreshState(mode) {
  const busy = mode === 'loading';
  el.refresh.disabled = busy;
  el.refresh.toggleAttribute('aria-busy', busy);
  if (busy) el.refresh.setAttribute('aria-busy', 'true'); else el.refresh.removeAttribute('aria-busy');
  el.refresh.classList.toggle('is-loading', busy);
  el.refresh.classList.toggle('is-success', mode === 'success');
  el.refreshLabel.textContent = busy ? 'Refreshing…' : mode === 'success' ? '✓ Updated' : 'Refresh list';
}

async function load({ silent = false, manual = false } = {}) {
  if (controller) controller.abort();
  controller = new AbortController();
  const mine = controller;
  if (!silent) setRefreshState('loading');
  if (!state.hasData && !silent) showSkeletons();
  let result;
  try {
    result = await loadWishlist({ signal: mine.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    result = { status: 'error', items: [], purchases: new Map(), loadedAt: null, error: "Couldn't load the gift list. Please try again.", purchasesUnavailable: true };
  }
  if (mine !== controller) return;
  controller = null;
  state.lastLoadMs = Date.now();
  el.grid.removeAttribute('aria-busy');

  const firstLoad = !state.hasData;
  if (result.status === 'ok' || (result.status === 'cached' && !state.hasData)) {
    state.items = result.items;
    state.purchases = result.purchases;
    state.loadedAt = result.loadedAt;
    state.hasData = true;
    state.loadStatus = result.status;
    state.loadError = result.status === 'cached' ? result.error : null;
    state.purchasesUnavailable = result.purchasesUnavailable;
  } else {
    // Failure after we already have a list: keep showing it, surface the error.
    state.loadError = result.error;
    if (!state.hasData) state.loadStatus = 'error';
  }
  el.sr.textContent = state.hasData ? `${state.items.length} gifts loaded.` : 'Could not load gifts.';
  renderAll(firstLoad ? 'all' : 'new');

  if (!silent) {
    const ok = result.status === 'ok';
    setRefreshState(ok ? 'success' : 'idle');
    if (ok) setTimeout(() => { if (!el.refresh.disabled) setRefreshState('idle'); }, 1500);
  }
  return manual;
}

function anyDialogOpen() { return detail.isOpen || confirmDlg.isOpen; }

function startBackground() {
  if (CONFIG.refreshIntervalMs > 0) {
    setInterval(() => {
      if (document.visibilityState === 'visible' && !anyDialogOpen()) load({ silent: true });
    }, CONFIG.refreshIntervalMs);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !anyDialogOpen() && Date.now() - state.lastLoadMs > 60000) load({ silent: true });
  });
}

// ---------- text size ----------
function applyTextSize(size, { save = true, animate = false } = {}) {
  document.documentElement.dataset.textSize = size;
  if (save) safeSet('localStorage', 'pgl.textSize', size);
  document.querySelectorAll('#size-seg .seg-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.size === size)));
  if (animate) {
    el.grid.classList.remove('size-fade');
    void el.grid.offsetWidth;
    el.grid.classList.add('size-fade');
    setTimeout(() => el.grid.classList.remove('size-fade'), 400);
  }
}

// ---------- look ----------
function applySkin(skin, { save = true, animate = false } = {}) {
  document.documentElement.dataset.skin = skin;
  if (save) safeSet('localStorage', 'pgl.skin', skin);
  document.querySelectorAll('#skin-seg .seg-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.skin === skin)));
  if (animate) {
    document.body.classList.remove('skin-fade');
    void document.body.offsetWidth;
    document.body.classList.add('skin-fade');
    setTimeout(() => document.body.classList.remove('skin-fade'), 500);
  }
}

// ---------- welcome screen + intro ----------
async function enterSite() {
  const root = document.documentElement;
  el.gateTitle.textContent = CONFIG.title;
  const chosen = await runGate({
    form: el.gateForm,
    skin: root.dataset.skin,
    size: root.dataset.textSize,
    onSkin: (k) => applySkin(k, { save: false }),
    onSize: (z) => applyTextSize(z, { save: false }),
  });
  applySkin(chosen.skin);
  applyTextSize(chosen.size);
  safeSet('sessionStorage', 'pgl.entered', '1');
  root.classList.remove('gate-open');
  await playIntro(el.intro, chosen.skin, CONFIG.title);
  root.classList.add('site-enter');
  setTimeout(() => root.classList.remove('site-enter'), 1200);
  if (state.hasData) renderAll('all');
}

// ---------- init ----------
function init() {
  document.title = CONFIG.title;
  el.title.textContent = CONFIG.title;
  el.welcome.textContent = CONFIG.welcome;
  initToasts(el.toasts);

  const savedSize = safeGet('localStorage', 'pgl.textSize');
  applyTextSize(SIZES.includes(savedSize) ? savedSize : 'normal', { save: false });
  const savedSkin = safeGet('localStorage', 'pgl.skin');
  applySkin(SKINS.includes(savedSkin) ? savedSkin : 'apple', { save: false });
  const savedFilter = safeGet('sessionStorage', 'pgl.filter');
  if (['all', 'available', 'purchased'].includes(savedFilter)) state.filter = savedFilter;

  document.querySelectorAll('#size-seg .seg-btn').forEach((b) => b.addEventListener('click', () => applyTextSize(b.dataset.size, { animate: true })));
  document.querySelectorAll('#skin-seg .seg-btn').forEach((b) => b.addEventListener('click', () => applySkin(b.dataset.skin, { animate: true })));
  document.querySelectorAll('#filter-seg .seg-btn').forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.filter)));
  el.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = el.search.value; renderAll('all'); }, 150);
  });
  el.search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && el.search.value) { e.preventDefault(); clearSearch(); } });
  el.refresh.addEventListener('click', () => load({ manual: true }));
  renderStats([]);
  load();
  startBackground();
  if (document.documentElement.classList.contains('gate-open')) enterSite();
}

init();
