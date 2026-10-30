// Purchase marks made on this device. GitHub Pages has no server, so a
// visitor's "I bought this" is saved here immediately and the list keeper
// records it in data/purchases.csv for everyone else (via the admin page).

const KEY = 'pgl.localMarks.v1';

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function write(marks) {
  try {
    localStorage.setItem(KEY, JSON.stringify(marks));
    return true;
  } catch {
    return false;
  }
}

/** @returns {Record<string, {qty:number, at:string}>} */
export function getLocalMarks() {
  return read();
}

export function getLocalQty(id) {
  return read()[id]?.qty || 0;
}

/** Record `qty` more units bought on this device. Returns false if storage failed. */
export function addLocalMark(id, qty = 1) {
  const marks = read();
  marks[id] = { qty: (marks[id]?.qty || 0) + qty, at: new Date().toISOString() };
  return write(marks);
}

/** Undo this device's marks for an item. */
export function clearLocalMark(id) {
  const marks = read();
  delete marks[id];
  return write(marks);
}
