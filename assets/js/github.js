// Commits files to the configured repository with the GitHub REST API, using a
// token the list owner pastes into the admin page at runtime. The token is kept
// in sessionStorage only (cleared when the tab closes) and is never part of the
// site's code or repository.

import { CONFIG } from './config.js';

const TOKEN_KEY = 'pgl.ghToken';
const API = 'https://api.github.com';

export function getToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export function setToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token.trim());
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

function headers(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function contentsUrl(path) {
  const { owner, repo } = CONFIG;
  return `${API}/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
}

async function apiError(res) {
  let detail = '';
  try { detail = (await res.json()).message || ''; } catch { /* ignore */ }
  if (res.status === 401) return new Error('GitHub rejected the token (401). Check that it is valid.');
  if (res.status === 403 || res.status === 404) {
    return new Error(`GitHub denied access (${res.status}). The token needs "Contents: Read and write" on ${CONFIG.owner}/${CONFIG.repo}. ${detail}`);
  }
  return new Error(`GitHub error ${res.status}: ${detail}`);
}

/** Checks the token can write to the repository. Resolves to the repo's full name. */
export async function verifyToken(token) {
  const { owner, repo } = CONFIG;
  const res = await fetch(`${API}/repos/${owner}/${repo}`, { headers: headers(token) });
  if (!res.ok) throw await apiError(res);
  const info = await res.json();
  if (!info.permissions?.push) {
    throw new Error(`This token can read ${info.full_name} but cannot write to it.`);
  }
  return info.full_name;
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Read a file's ArrayBuffer/Blob as base64. */
export async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Create or update one file on the configured branch.
 * Pass `text` for UTF-8 content or `base64` for binary content.
 * Resolves to the commit's html_url.
 */
export async function commitFile({ token, path, text, base64, message }) {
  const { branch } = CONFIG;
  const url = contentsUrl(path);
  let sha;
  const existing = await fetch(`${url}?ref=${encodeURIComponent(branch)}&t=${Date.now()}`, { headers: headers(token), cache: 'no-store' });
  if (existing.ok) sha = (await existing.json()).sha;
  else if (existing.status !== 404) throw await apiError(existing);

  const body = { message, branch, content: base64 ?? utf8ToBase64(text) };
  if (sha) body.sha = sha;
  const res = await fetch(url, { method: 'PUT', headers: headers(token), body: JSON.stringify(body) });
  if (!res.ok) throw await apiError(res);
  return (await res.json()).commit?.html_url || '';
}
