// Thin wrapper around PapaParse (loaded as a classic script that sets
// globalThis.Papa). Keeps the rest of the code independent of the library.

function papa() {
  const P = globalThis.Papa;
  if (!P) throw new Error('CSV parser (PapaParse) is not loaded');
  return P;
}

/**
 * Parse CSV text into { headers, rows, errors }.
 * rows are plain objects keyed by trimmed, lower-cased header names.
 * Handles BOM, quoted commas, embedded newlines and Unicode.
 */
export function parseCsv(text) {
  const clean = String(text ?? '').replace(/^﻿/, '');
  const result = papa().parse(clean, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const errors = result.errors
    .filter((e) => e.code !== 'UndetectableDelimiter')
    .map((e) => ({ row: e.row == null ? null : e.row + 2, message: e.message }));
  return { headers: result.meta.fields || [], rows: result.data, errors };
}

/** Serialize an array of objects to CSV using the given column order. */
export function toCsv(rows, columns) {
  return papa().unparse({ fields: columns, data: rows.map((r) => columns.map((c) => r[c] ?? '')) }, {
    newline: '\n',
  }) + '\n';
}
