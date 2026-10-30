// Tiny DOM helpers. Text is only ever set via text nodes / textContent, so
// CSV-derived strings can never be interpreted as HTML.

let counter = 0;
export const uid = (prefix = 'id') => `${prefix}-${++counter}`;

/** h('div', {class:'x', onclick: fn, 'aria-label':'y'}, 'text', childNode, [more]) */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.append(c);
    else el.append(document.createTextNode(String(c)));
  }
  return el;
}

export const sr = (text) => h('span', { class: 'visually-hidden' }, text);

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  kids.forEach((k) => el.append(k));
  return el;
}

/** Decorative gift-box icon. */
export function giftIcon() {
  return svg('svg', { viewBox: '0 0 64 64', width: '64', height: '64', 'aria-hidden': 'true', focusable: 'false', class: 'gift-svg' },
    svg('rect', { x: '8', y: '24', width: '48', height: '12', rx: '3', fill: 'currentColor', opacity: '.9' }),
    svg('rect', { x: '12', y: '36', width: '40', height: '22', rx: '3', fill: 'currentColor', opacity: '.7' }),
    svg('rect', { x: '29', y: '24', width: '6', height: '34', fill: 'var(--surface)', opacity: '.85' }),
    svg('path', { d: 'M32 24c-4-9-14-11-14-5 0 4 7 5 14 5zm0 0c4-9 14-11 14-5 0 4-7 5-14 5z', fill: 'none', stroke: 'currentColor', 'stroke-width': '3.5', 'stroke-linejoin': 'round' }));
}

/** Warm "something went wrong" illustration. */
export function errorIcon() {
  return svg('svg', { viewBox: '0 0 64 64', width: '72', height: '72', 'aria-hidden': 'true', focusable: 'false', class: 'gift-svg' },
    svg('circle', { cx: '32', cy: '32', r: '26', fill: 'none', stroke: 'currentColor', 'stroke-width': '4' }),
    svg('path', { d: 'M32 18v18', stroke: 'currentColor', 'stroke-width': '5', 'stroke-linecap': 'round' }),
    svg('circle', { cx: '32', cy: '45', r: '3.2', fill: 'currentColor' }));
}

export function initials(title) {
  const words = String(title).split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  if (!words.length) return '?';
  const letters = words.length === 1 ? words[0].slice(0, 1) : words[0][0] + words[1][0];
  return letters.toUpperCase();
}
