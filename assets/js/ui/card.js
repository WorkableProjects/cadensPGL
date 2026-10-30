// Card + shared item parts (also used by the detail dialog).
import { h, sr, uid, giftIcon, initials } from './dom.js';

/** Image area with candidate fallback and a decorative placeholder. */
export function buildMedia(item, { eager = false } = {}) {
  const wrap = h('div', { class: 'media' });
  const placeholder = () => h('div', { class: 'placeholder', 'aria-hidden': 'true' },
    giftIcon(), h('span', { class: 'placeholder-letters' }, initials(item.title)));
  if (!item.images.length) {
    wrap.append(placeholder());
    return wrap;
  }
  let i = 0;
  const img = h('img', { alt: item.title, loading: eager ? 'eager' : 'lazy', decoding: 'async' });
  img.addEventListener('error', () => {
    i += 1;
    if (i < item.images.length) img.src = item.images[i];
    else { img.remove(); wrap.append(placeholder()); }
  });
  img.src = item.images[0];
  wrap.append(img);
  return wrap;
}

export function buildBadges(item, status) {
  const badges = [];
  if (item.mostWanted) {
    badges.push(h('span', { class: 'badge badge-gold' }, h('span', { 'aria-hidden': 'true' }, '★'), 'Most wanted'));
  }
  if (status.state === 'purchased') {
    badges.push(h('span', { class: 'badge badge-success' }, h('span', { 'aria-hidden': 'true' }, '✓'), 'Purchased'));
  } else if (status.state === 'partial') {
    badges.push(h('span', { class: 'badge badge-warning' }, h('span', { 'aria-hidden': 'true' }, '◐'), status.label));
  } else {
    badges.push(h('span', { class: 'badge badge-brand' }, h('span', { 'aria-hidden': 'true' }, '○'), 'Available'));
  }
  return h('div', { class: 'badges' }, badges);
}

export function buildTags(item) {
  if (!item.tags.length) return null;
  return h('ul', { class: 'tags', 'aria-label': 'Tags' }, item.tags.map((t) => h('li', { class: 'tag' }, t)));
}

export function buildReason(item, headingTag = 'h3') {
  if (!item.reason) return null;
  return h('section', { class: 'reason' },
    h(headingTag, { class: 'reason-h' }, 'Why I want it'),
    h('p', { class: 'reason-p' }, item.reason));
}

/** Primary buy link (or its fallback), per spec rules. */
export function buildBuy(item, status) {
  if (status.state === 'purchased') return h('p', { class: 'note note-done' }, h('span', { 'aria-hidden': 'true' }, '✓'), 'Already purchased');
  if (!item.url) return h('p', { class: 'note note-none' }, 'Purchase link not available');
  return h('a', { class: 'btn btn-primary', href: item.url, target: '_blank', rel: 'noopener noreferrer' },
    'Buy this gift', sr(' (opens in a new tab)'));
}

export function buildMarkBtn(item, status, onMark) {
  if (status.state === 'purchased') return null;
  return h('button', { type: 'button', class: 'btn btn-secondary js-mark', onclick: (e) => onMark(item.id, e.currentTarget) },
    'Mark as purchased', sr(` for ${item.title}`));
}

export function buildLocalNote(item, status, onUndo) {
  if (!(status.local > 0)) return null;
  return h('div', { class: 'local-note' },
    h('span', null, 'You marked this on this device'),
    h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => onUndo(item.id) }, 'Undo', sr(` marking ${item.title}`)));
}

/**
 * @param {import('../../js/model.js').Item} item
 * @param {ReturnType<import('../model.js').computeStatus>} status
 * @param {{onOpen:Function,onMark:Function,onUndo:Function}} handlers
 */
export function createCard(item, status, handlers, { enterIndex = -1 } = {}) {
  const titleId = uid('t');
  const classes = ['card', `state-${status.state}`];
  if (item.mostWanted) classes.push('most-wanted');

  const openFrom = (cls) => (e) => handlers.onOpen(item.id, e.currentTarget.closest('.card').querySelector(`.${cls}`));
  const media = buildMedia(item);
  media.classList.add('media-click');
  media.addEventListener('click', () => handlers.onOpen(item.id, null));
  if (status.state === 'purchased') media.append(h('span', { class: 'check-overlay', 'aria-hidden': 'true' }, '✓'));

  const meta = [];
  if (item.priceText) meta.push(h('span', { class: 'price' }, item.priceText));
  if (item.quantity > 1) meta.push(h('span', { class: 'qty' }, `Qty: ${item.quantity}`));

  const article = h('article', { class: classes.join(' '), 'aria-labelledby': titleId },
    media,
    h('div', { class: 'card-body' },
      buildBadges(item, status),
      h('div', { class: 'card-head' },
        h('h2', { class: 'card-title', id: titleId },
          h('button', { type: 'button', class: 'title-btn js-title', onclick: openFrom('js-title') }, h('span', { class: 'clamp-3' }, item.title))),
        meta.length ? h('p', { class: 'meta' }, meta) : null),
      item.description ? h('p', { class: 'desc clamp-3' }, item.description) : null,
      buildReason(item, 'h3'),
      buildTags(item),
      buildLocalNote(item, status, handlers.onUndo),
      h('div', { class: 'actions' },
        buildBuy(item, status),
        buildMarkBtn(item, status, handlers.onMark),
        h('button', { type: 'button', class: 'btn btn-ghost js-details', onclick: openFrom('js-details') },
          'Details', sr(` for ${item.title}`)))));

  const li = h('li', { class: 'card-li', dataset: { id: item.id } }, article);
  if (enterIndex >= 0) {
    li.classList.add('enter');
    li.style.setProperty('--i', String(Math.min(enterIndex, 10)));
  }
  return li;
}

export function createSkeletons(n = 6) {
  return Array.from({ length: n }, () => h('li', { class: 'card-li skeleton', 'aria-hidden': 'true' },
    h('div', { class: 'card' },
      h('div', { class: 'media sk-block' }),
      h('div', { class: 'card-body' },
        h('div', { class: 'sk-line sk-short' }), h('div', { class: 'sk-line' }), h('div', { class: 'sk-line' }), h('div', { class: 'sk-line sk-short' })))));
}
