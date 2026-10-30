// Welcome screen (pick a look + text size) and the per-look intro animation.
import { h } from './dom.js';

export const SKINS = ['declaration', 'apple', 'anthropic'];
export const SIZES = ['normal', 'bigger', 'biggest'];

const INTRO_MS = { declaration: 3300, apple: 2900, anthropic: 3000 };
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function initialsOf(title) {
  const m = title.match(/[A-Za-z]/);
  return m ? m[0].toUpperCase() : '★';
}

function buildIntro(skin, title) {
  if (skin === 'declaration') {
    return h('div', { class: 'decl-scroll' },
      h('span', { class: 'decl-rod top' }), h('span', { class: 'decl-rod bottom' }),
      h('div', { class: 'decl-stage' },
        h('p', { class: 'decl-kicker' }, 'Hear ye, hear ye'),
        h('p', { class: 'decl-title' }, title),
        h('div', { class: 'decl-rule' }),
        h('span', { class: 'decl-seal' }, initialsOf(title))));
  }
  if (skin === 'anthropic') {
    const ring = svgEl('svg', { class: 'anth-ring', viewBox: '0 0 100 100' });
    ring.append(svgEl('circle', { cx: '50', cy: '50', r: '48' }), svgEl('circle', { class: 'dot', cx: '50', cy: '50', r: '9' }));
    return h('div', { class: 'anth-stage' },
      ring,
      h('p', { class: 'anth-title' }, title.split(/\s+/).map((w, i) => [h('span', { class: 'w', style: `--wi:${i}` }, w), ' '])),
      h('div', { class: 'anth-rule' }),
      h('p', { class: 'anth-sub' }, 'Thoughtfully chosen.'));
  }
  return h('div', { class: 'apple-stage' },
    h('p', { class: 'apple-title' }, title),
    h('p', { class: 'apple-sub' }, 'Wish. Shop. Wrap.'));
}

/** Plays the intro for `skin`; resolves when it has faded out. Click, tap or any key skips. */
export function playIntro(host, skin, title) {
  const root = document.documentElement;
  return new Promise((resolve) => {
    if (reducedMotion()) { resolve(); return; }
    const skip = h('button', { type: 'button', class: 'btn btn-ghost btn-sm intro-skip' }, 'Skip intro');
    host.className = `intro intro-${skin}`;
    host.replaceChildren(buildIntro(skin, title), skip);
    host.removeAttribute('aria-hidden');
    root.classList.add('intro-playing');
    skip.focus({ preventScroll: true });

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      host.removeEventListener('click', finish);
      document.removeEventListener('keydown', finish);
      host.classList.add('done');
      resolve();
      setTimeout(() => {
        root.classList.remove('intro-playing');
        host.className = 'intro';
        host.replaceChildren();
        host.setAttribute('aria-hidden', 'true');
      }, 620);
    };
    const timer = setTimeout(finish, INTRO_MS[skin] || 3000);
    host.addEventListener('click', finish);
    document.addEventListener('keydown', finish);
  });
}

/**
 * Shows the welcome screen. Choices preview live (via onSkin/onSize) and the
 * returned promise resolves with { skin, size } when the visitor enters.
 */
export function runGate({ form, skin, size, onSkin, onSize }) {
  const gate = form.closest('.gate');
  const pick = (name, value) => {
    const input = form.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  };
  pick('skin', skin);
  pick('size', size);

  form.addEventListener('change', (e) => {
    if (e.target.name === 'skin') onSkin(e.target.value);
    if (e.target.name === 'size') onSize(e.target.value);
  });

  const first = form.querySelector('input[name="skin"]:checked') || form.querySelector('input');
  if (first) first.focus({ preventScroll: true });

  return new Promise((resolve) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const chosen = { skin: data.get('skin') || skin, size: data.get('size') || size };
      if (reducedMotion()) { resolve(chosen); return; }
      gate.classList.add('leaving');
      setTimeout(() => { gate.classList.remove('leaving'); resolve(chosen); }, 360);
    }, { once: true });
  });
}
