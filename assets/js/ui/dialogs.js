// Detail dialog + "did you buy it?" confirmation dialog (native <dialog>).
import { h, uid } from './dom.js';
import { buildMedia, buildBadges, buildTags, buildReason, buildBuy, buildMarkBtn, buildLocalNote } from './card.js';
import { registerDialogRegion } from './toast.js';

/** Plays the CSS "closing" animation, then closes the dialog. */
export function animatedClose(dialog, after) {
  if (!dialog.open || dialog.classList.contains('closing')) return;
  dialog.classList.add('closing');
  let done = false;
  const fin = () => {
    if (done) return;
    done = true;
    dialog.removeEventListener('animationend', onEnd);
    dialog.classList.remove('closing');
    dialog.close();
    if (after) after();
  };
  const onEnd = (e) => { if (e.target === dialog && e.animationName === 'dlg-out') fin(); };
  dialog.addEventListener('animationend', onEnd);
  setTimeout(fin, 450);
}

function wireDialog(dialog, onClosed) {
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); animatedClose(dialog); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) animatedClose(dialog); });
  dialog.addEventListener('close', () => onClosed && onClosed());
  const region = h('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
  dialog.append(region);
  registerDialogRegion(dialog, region);
}

export function createDetailDialog({ handlers, onClosed }) {
  const titleId = uid('dt');
  const body = h('div', { class: 'sheet-body' });
  const closeBtn = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => animatedClose(dialog) },
    h('span', { 'aria-hidden': 'true' }, '✕ '), 'Close');
  const dialog = h('dialog', { class: 'sheet', 'aria-labelledby': titleId },
    h('div', { class: 'sheet-bar' }, closeBtn), body);
  wireDialog(dialog, onClosed);
  let currentId = null;

  function fill(item, status) {
    const meta = [];
    if (item.priceText) meta.push(h('span', { class: 'price' }, item.priceText));
    if (item.quantity > 1) meta.push(h('span', { class: 'qty' }, `Quantity wanted: ${item.quantity}`));
    const title = h('h2', { id: titleId, class: 'sheet-title', tabindex: '-1' }, item.title);
    const frag = [
      buildMedia(item, { eager: true }),
      buildBadges(item, status),
      title,
      meta.length ? h('p', { class: 'meta' }, meta) : null,
      status.requested > 1 || status.state === 'partial'
        ? h('p', { class: 'status-line' }, `Status: ${status.label}`) : null,
      item.description ? h('p', { class: 'desc' }, item.description) : null,
      buildReason(item, 'h3'),
      buildTags(item),
      buildLocalNote(item, status, handlers.onUndo),
      h('div', { class: 'actions' }, buildBuy(item, status), buildMarkBtn(item, status, handlers.onMark)),
    ];
    body.replaceChildren(...frag.filter(Boolean));
    if (status.state === 'purchased') body.querySelector('.media').append(h('span', { class: 'check-overlay', 'aria-hidden': 'true' }, '✓'));
    return title;
  }

  return {
    el: dialog,
    get isOpen() { return dialog.open; },
    get currentId() { return currentId; },
    open(item, status) {
      currentId = item.id;
      fill(item, status);
      body.scrollTop = 0;
      if (!dialog.open) dialog.showModal();
      closeBtn.focus({ preventScroll: true });
    },
    /** Re-render in place after state changes; keeps scroll and focus sane. */
    update(item, status) {
      if (!dialog.open || currentId !== item.id) return;
      const top = body.scrollTop;
      const hadFocus = dialog.contains(document.activeElement);
      const title = fill(item, status);
      body.scrollTop = top;
      if (hadFocus && !dialog.contains(document.activeElement)) title.focus({ preventScroll: true });
    },
    close() { animatedClose(dialog); },
  };
}

export function createConfirmDialog({ onClosed }) {
  const titleId = uid('ct');
  const form = h('div', { class: 'sheet-body confirm-body' });
  const dialog = h('dialog', { class: 'sheet confirm', 'aria-labelledby': titleId }, form);
  wireDialog(dialog, onClosed);

  return {
    el: dialog,
    get isOpen() { return dialog.open; },
    /**
     * @param item   Item
     * @param status current status
     * @param onConfirm (qty) => boolean|string  return true to close, or an error string to show
     */
    open(item, status, onConfirm) {
      const maxQty = Math.max(1, status.remaining);
      const errBox = h('p', { class: 'error-msg', role: 'alert' });
      let qtyInput = null;
      let qtyField = null;
      if (maxQty > 1) {
        const qid = uid('q');
        qtyInput = h('input', { id: qid, class: 'input', type: 'number', min: '1', max: String(maxQty), step: '1', value: '1', inputmode: 'numeric' });
        qtyField = h('div', { class: 'field' },
          h('label', { for: qid }, 'How many did you buy?'),
          qtyInput, h('span', { class: 'hint' }, `Up to ${maxQty} still wanted.`));
      }
      const yes = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => {
        let qty = 1;
        if (qtyInput) {
          qty = Number.parseInt(qtyInput.value, 10);
          if (!Number.isInteger(qty) || qty < 1 || qty > maxQty) {
            errBox.textContent = `Please enter a number from 1 to ${maxQty}.`;
            qtyInput.focus();
            return;
          }
        }
        const res = onConfirm(qty);
        if (res === true) animatedClose(dialog);
        else errBox.textContent = typeof res === 'string' ? res : 'Something went wrong. Please try again.';
      } }, 'Yes, I bought it');
      const cancel = h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => animatedClose(dialog) }, 'Cancel');
      form.replaceChildren(
        h('h2', { id: titleId, class: 'sheet-title' }, `Did you buy “${item.title}”?`),
        h('p', { class: 'confirm-text' }, 'This marks it as bought on this device right away. So everyone else sees it too, please let the list keeper know.'),
        ...[qtyField, errBox].filter(Boolean),
        h('div', { class: 'actions confirm-actions' }, yes, cancel));
      if (!dialog.open) dialog.showModal();
      (qtyInput || yes).focus({ preventScroll: true });
    },
    close() { animatedClose(dialog); },
  };
}
