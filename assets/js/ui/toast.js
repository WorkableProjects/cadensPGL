import { h } from './dom.js';

const AUTO_MS = 5000;
let bodyRegion = null;
const extraHosts = [];

export function initToasts(region) { bodyRegion = region; }

/** Dialogs register their own live region so toasts stay clickable above a modal. */
export function registerDialogRegion(dialog, region) { extraHosts.push({ dialog, region }); }

function activeRegion() {
  for (let i = extraHosts.length - 1; i >= 0; i--) {
    if (extraHosts[i].dialog.open && !extraHosts[i].dialog.classList.contains('closing')) return extraHosts[i].region;
  }
  return bodyRegion;
}

/** @param {string} message @param {{href?:string,label?:string}} [link] */
export function showToast(message, link) {
  const region = activeRegion();
  if (!region) return;
  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 220);
  };
  const toast = h('div', { class: 'toast' },
    h('span', { class: 'toast-msg' }, message),
    link && link.href ? h('a', { class: 'toast-link', href: link.href }, link.label || 'Contact') : null,
    h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: dismiss }, 'Dismiss'));
  region.append(toast);
  timer = setTimeout(dismiss, AUTO_MS);
}
