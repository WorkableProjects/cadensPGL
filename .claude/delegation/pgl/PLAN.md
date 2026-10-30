# Caden's PGL — build plan

Goal: implement `/plan.md` (repo root) as a static site hosted on **GitHub Pages** (user decision: no server).

## Decisions (made by Opus, binding for all tasks)
- No build step. Plain HTML + ES modules + CSS. PapaParse 5.4.1 vendored at `vendor/papaparse.min.js` (classic script, sets `window.Papa`).
- Site root = repo root, served by GitHub Pages from `main`. `.nojekyll` present.
- Canonical data: `data/wishlist.csv` (GiftList format). Fetched live from `raw.githubusercontent.com/<owner>/<repo>/main/...` with cache-busting, same-site copy as fallback, localStorage last-known-good as offline fallback. See `assets/js/data-service.js`.
- Shared purchase status: `data/purchases.csv` (`gift_id,purchased_quantity,reserved_quantity,updated_at,archived`) on `main`. Visitors cannot write to GitHub, so:
  - Guest "Mark as purchased" → confirm → saved on that device (`assets/js/local-marks.js`), shown immediately, labelled "marked on this device", with optional contact link (`CONFIG.ownerContact`) and an undo.
  - Owner records it for everyone on `admin.html` (edits purchases.csv; commits with their own token or downloads the file).
- Admin publishing: owner pastes a fine-grained GitHub token (Contents: read/write on this repo) into admin.html; kept in sessionStorage only (`assets/js/github.js`). Fallback: download normalized CSV and commit manually.
- Images: GiftList export has relative `media/...` paths with no public host. Resolution order in `imageCandidates()`: absolute URL → `CONFIG.imageBaseUrl` (empty) → `images/wishlist/<gift_id>.{webp,jpg,png}` → placeholder. Admin can upload an image per item to `images/wishlist/<gift_id>.<ext>`.
- Text sizes: `<html data-text-size="normal|bigger|biggest">`, tokens in `assets/css/tokens.css`, persisted in localStorage key `pgl.textSize`.

## Shared contract (written by Opus, read-only for executors)
assets/js/config.js, csv.js, model.js, data-service.js, local-marks.js, github.js, assets/css/tokens.css, vendor/*.

## Waves
- Wave 1 (parallel): T01 guest UI (Sonnet), T02 admin (Sonnet), T03 unit tests (Haiku).
- Wave 2: Opus integration, README, Pages workflow, browser verification.
