// Small DOM helpers for the admin page. Never uses innerHTML: all text goes
// through textContent / createTextNode so CSV data cannot inject markup.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** Fill a status element. kind: ok | err | warn | info. */
export function setStatus(node, kind, text, link) {
  node.className = `msg ${kind || ''}`.trim();
  node.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  node.replaceChildren();
  if (!text) return;
  node.append(document.createTextNode(text));
  if (link) {
    node.append(' ', el('a', { href: link, target: '_blank', rel: 'noopener', text: 'View the commit' }));
  }
}

/** Run an async action with a spinner and aria-busy on the button. */
export async function withBusy(btn, fn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.replaceChildren(el('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Working…');
  try {
    return await fn();
  } finally {
    btn.removeAttribute('aria-busy');
    btn.textContent = label;
    btn.disabled = false;
  }
}

/** Modal confirmation using <dialog>. Resolves true when confirmed. */
export function confirmDialog(title, text, okLabel = 'Yes, continue') {
  return new Promise((resolve) => {
    const dlg = el('dialog', { 'aria-labelledby': 'dlg-title' });
    let result = false;
    const ok = el('button', { type: 'button', class: 'btn', text: okLabel, onclick: () => { result = true; dlg.close(); } });
    const cancel = el('button', { type: 'button', class: 'btn secondary', text: 'Cancel', onclick: () => dlg.close() });
    dlg.append(el('h2', { id: 'dlg-title', text: title }), el('p', { text }), el('div', { class: 'row end' }, cancel, ok));
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    document.body.append(dlg);
    dlg.showModal();
    cancel.focus();
  });
}

/** Save text or a Blob as a file via a temporary link. */
export function downloadFile(name, content, type = 'text/csv;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

/** Thumbnail that tries each candidate URL in order, then shows a placeholder. */
export function makeThumb(candidates, alt = '') {
  const box = el('div', { class: 'thumb' });
  const list = [...candidates];
  const showNone = () => box.replaceChildren(document.createTextNode('No image'));
  if (!list.length) { showNone(); return box; }
  const img = el('img', { alt, loading: 'lazy', referrerpolicy: 'no-referrer' });
  let i = 0;
  img.addEventListener('error', () => {
    i += 1;
    if (i < list.length) img.src = list[i];
    else showNone();
  });
  img.src = list[0];
  box.append(img);
  return box;
}
