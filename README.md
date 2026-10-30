# Caden's Gift List (PGL)

A family-friendly wishlist site. It reads the gift list live from `data/wishlist.csv` on the `main` branch, so changing that file changes the site — no code edits needed.

- **Gift list:** `index.html` — what family members see. No sign-in.
- **List keeper tools:** `admin.html` — import a GiftList export, record purchases, upload images.

## Welcome screen and looks

On each new visit (per browser tab session), visitors first pick a **look** — Declaration of Independence, Apple, or Anthropic — and a **text size** (Normal, Bigger, Biggest). Choices preview live, are remembered on that device, and can be changed later from the toolbar. Entering plays a short intro animation for the chosen look (click or press any key to skip; skipped automatically with reduced motion). Looks live in `assets/css/themes.css`; the welcome screen and intros in `assets/css/gate.css` and `assets/js/ui/gate.js`.

## Hosting (GitHub Pages)

1. Repository **Settings → Pages → Build and deployment**: Source **Deploy from a branch**, Branch **main**, folder **/ (root)**.
2. The site appears at `https://<owner>.github.io/<repo>/`.

The site fetches data from `https://raw.githubusercontent.com/<owner>/<repo>/main/...`, so a commit to `main` shows up on the next refresh even before Pages redeploys. That requires the repository to be **public**; otherwise the site falls back to its own deployed copy of the files.

Repository owner/name, branch, file paths, page title, and welcome text live in `assets/js/config.js`.

## Data files

| File | Purpose |
|---|---|
| `data/wishlist.csv` | What's on the list. GiftList export columns: `title,url,price,currency,quantity,notes,most_wanted,tags,image_url,gift_id` (optional extras: `description`, `category`, `purchased`; any other columns are kept). |
| `data/purchases.csv` | Shared purchase status, keyed by `gift_id`: `gift_id,purchased_quantity,reserved_quantity,updated_at,archived`. |
| `images/wishlist/<gift_id>.webp` (or `.jpg`/`.png`) | Item pictures. |

`notes` is shown as **Why I want it**. `gift_id` must stay stable — it links an item to its purchase status.

## Updating the list

Either:
- **Admin page:** open `admin.html`, choose the GiftList CSV, review the preview, then **Publish to main** (needs a token, below) or **Download** and commit the file to `data/wishlist.csv`.
- **Directly:** edit `data/wishlist.csv` on GitHub and commit to `main`.

Items removed from the list keep their purchase record (marked archived) in case they come back.

## How "purchased" works

GitHub Pages has no server, so visitors can't write to the repository:

1. A family member taps **Mark as purchased** and confirms. It's saved on *their* device straight away (they can undo it).
2. They let the list keeper know (set `ownerContact` in `config.js` to show a mailto/sms link).
3. The list keeper records it in **admin.html → Purchase status**, which updates `data/purchases.csv` for everyone.

Clicking **Buy this gift** never marks anything as purchased.

## Images

GiftList exports store images as relative paths (`media/...webp`) with no public host, so they can't be loaded directly. For each item, upload a picture on the admin page (or commit it as `images/wishlist/<gift_id>.webp`). Items without an image show a placeholder. If you ever know a real base URL for the exported paths, set `imageBaseUrl` in `config.js`.

## GitHub token for publishing

Create a **fine-grained personal access token** at <https://github.com/settings/personal-access-tokens/new>:
- Repository access: only this repository
- Permissions: **Contents → Read and write**

Paste it into the admin page. It's kept in that browser tab only (sessionStorage) and is never stored in the site or the repository.

## Development

```bash
python3 -m http.server 8080
```

```bash
npm test
```

No build step. CSV parsing uses PapaParse 5.4.1, vendored in `vendor/`.
