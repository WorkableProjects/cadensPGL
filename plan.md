# Giftlist App — Development Plan

## 1. Project Overview

Build a polished, family-friendly wishlist experience that makes it effortless for relatives to understand what the list owner wants and why, view the item, and open the correct place to buy it.

The experience should feel more thoughtful and enjoyable than a basic wishlist: attractive item cards, clear descriptions, expressive but restrained animations, large accessible controls, and reliable shared purchase tracking so family members can avoid buying the same gift.

**Primary audience:** Family members viewing the list, including people who may prefer larger text or a very simple interface.

**Primary goal:** A visitor should be able to open the list, understand an item at a glance, read why it is wanted, and reach the purchase page in one or two clear actions.

## 2. Core Product Principles

- **Simple for guests:** The public wishlist should not require an account, app installation, or technical knowledge.
- **Clear context:** Every item should communicate what it is, why it is wanted, and where to buy it.
- **Accessible by design:** Provide three explicit text-size modes and keep all controls usable at every size.
- **Live from `main`:** The hosted site must treat the CSV committed to the repository's `main` branch as the source of truth for wishlist content.
- **Dynamic, not hardcoded:** The interface must adapt automatically as items are added, removed, edited, or marked as purchased.
- **Honest purchase status:** Clicking a retailer link must never automatically mark an item as bought.
- **Fast and responsive:** The page should remain smooth on phones, tablets, laptops, and larger displays, even as the list grows.

## 3. Main Guest Experience

### 3.1 Wishlist Home

Create a welcoming landing page with:

- A clear wishlist title and optional short welcome message.
- A simple explanation that family members can open an item to learn more and use its purchase link.
- A live item count, plus counts for available and purchased items.
- A clear visual distinction between available items and purchased items.
- An optional filter to show **All**, **Available**, or **Purchased** items.
- A search field that filters by item title, description, notes, or tags.
- A visible text-size control with **Normal**, **Bigger**, and **Biggest** options.
- A refresh action and a small “Last updated” indicator showing when the latest CSV was successfully loaded.

Do not make the page feel like an administration dashboard. The default guest view should be warm, inviting, and immediately understandable.

### 3.2 Item Cards

Render every CSV item as a responsive card. Each card should support:

- Product image with a consistent aspect ratio and an attractive fallback when no image is available.
- Item title.
- Price when supplied; omit the price row when the CSV has no price.
- Short description when supplied.
- A clearly labeled **Why I want it** section using the item's notes/reason field.
- Optional tags or category labels.
- A **Most wanted** marker when `most_wanted` is true.
- A visible **Available** or **Purchased** status.
- A prominent **View item / Buy this gift** action when a valid purchase URL exists.
- A separate **Mark as purchased** or **Reserve this gift** action, depending on the purchase-tracking design.

Cards must not rely on color alone to communicate status. Include status text and an icon or other visual cue. Purchased cards should remain visible by default, but appear clearly completed and have their buy action disabled or replaced with a purchased state. Allow guests to filter purchased items out.

### 3.3 Item Details

Selecting a card should open a detail panel, modal, or dedicated item page with:

- A larger image.
- Full title and description.
- The full “Why I want it” text.
- Price and quantity, when present.
- Tags and most-wanted status, when present.
- Purchase link, if available.
- Current purchase status.

The detail view should be easy to close, support keyboard navigation, and work well on narrow screens. Do not truncate the reason text in the expanded view.

### 3.4 Purchase Actions

- The purchase link opens the CSV's `url` in a new tab/window and uses safe external-link attributes.
- If no URL is provided, show a clear “Purchase link not available” state rather than rendering a broken button.
- Opening a retailer link does not change purchase status.
- A family member can explicitly mark an item as purchased or reserve it, with a confirmation step to prevent accidental taps.
- After a successful status update, update the card, filters, counters, and detail view immediately.
- Avoid exposing the buyer's identity on the public page by default. The list owner may have a private management view if needed.

For items with `quantity` greater than one, track how many have been purchased/reserved. An item becomes fully purchased only when the purchased quantity reaches the requested quantity. Show a simple quantity indicator such as “1 of 2 purchased” where appropriate.

## 4. Accessibility and Text-Size Modes

Provide three persistent, easy-to-find modes:

| Mode | Intended use | Behavior |
|---|---|---|
| **Normal** | Default experience | Standard readable type and compact card spacing |
| **Bigger** | Users who prefer larger text | Increase body, labels, controls, and spacing proportionally |
| **Biggest** | Maximum readability | Use the largest type scale, taller controls, and more generous spacing; allow cards to stack vertically when needed |

Requirements:

- Implement text sizing with design tokens or CSS variables rather than scattered one-off overrides.
- Scale all important text, buttons, item details, form controls, and status labels—not just headings.
- Prevent clipped text, overlapping controls, and horizontal page scrolling at all three sizes.
- Persist the selected mode on the current device/browser so the visitor does not need to set it every time.
- Make the active mode obvious to screen readers and visually clear.
- Keep browser zoom and operating-system accessibility settings functional; the three modes supplement, not replace, native zoom.
- Meet WCAG AA contrast expectations, provide visible keyboard focus, use semantic headings/labels, and give meaningful alt text to product images.
- Respect `prefers-reduced-motion` and provide an appropriately reduced-animation experience.

## 5. Visual Design, Animation, and Interaction

Use a polished, modern design with a friendly family-oriented personality. Prioritize clarity over visual clutter.

### Visual direction

- Clean page layout with comfortable whitespace and a strong visual hierarchy.
- Rounded item cards, subtle borders/shadows, and consistent image treatment.
- A restrained color palette with clear contrast between the page, cards, buttons, and status states.
- Strong, readable typography at all viewport widths.
- Responsive grid: multiple columns on wide screens, fewer columns on tablets, and a single-column layout on small phones or when the Biggest text mode needs more room.

### Animation and feedback

Add purposeful, smooth animations for:

- Page and section entrance.
- Item-card hover/focus states.
- Opening and closing item details.
- Changing filters and search results.
- Marking an item purchased/reserved.
- Loading, refreshing, and empty/error states.
- Text-size mode changes.

Animations should feel responsive and polished, not slow or distracting. Use short transitions, avoid large layout shifts, and never make an animation the only way to understand an action. Honor reduced-motion preferences.

### Button quality

Every button must have a real action and clear feedback:

- Distinct default, hover, focus, pressed, disabled, loading, and success states.
- Large enough touch targets for family members using phones or tablets.
- Clear action labels rather than ambiguous icon-only controls.
- No decorative controls that appear interactive but do nothing.
- Confirmation or undo for important purchase-status changes where practical.

## 6. CSV as the Source of Truth

### 6.1 Canonical file in the repository

Store the active wishlist CSV at a predictable path in the repository, for example:

`/public/data/wishlist.csv`

The exact path can be finalized during implementation, but it must be stable and documented.

The hosted app must fetch this file from the repository's **`main` branch**. Do not bundle a copied, hardcoded item array into the frontend and do not treat a previously imported browser copy as the authoritative list.

Recommended source URL pattern:

`https://raw.githubusercontent.com/<owner>/<repository>/main/public/data/wishlist.csv`

Keep the repository owner, repository name, and CSV path in a small configuration file or environment configuration so they can be changed without editing item-rendering code.

### 6.2 Live loading behavior

- Fetch the CSV whenever the hosted wishlist is opened.
- Provide a manual **Refresh list** action.
- Optionally refresh periodically while the page remains open, using a reasonable interval and avoiding disruptive reloads while a visitor is interacting with the page.
- Use a cache-busting/version strategy or appropriate fetch cache settings so a committed change is not hidden by a stale browser cache.
- Parse and validate the newly fetched CSV before replacing the currently displayed list.
- Show a loading state while the initial list is being fetched.
- Show the last successful version and a friendly error if GitHub is temporarily unavailable.
- A last-known-good cached copy may be used as an offline fallback, but it must never be treated as newer than `main` or written back over the repository's data.
- Never silently show an empty wishlist when loading fails; distinguish a real empty list from a network or parsing error.

### 6.3 Dynamic list sizing

The list must be generated from the CSV rows at runtime:

- No fixed number of cards or hardcoded item positions.
- Adding a row to the CSV on `main` automatically adds a card after the next successful refresh.
- Editing a row updates its displayed details and image after refresh.
- Removing a row removes it from the active wishlist after refresh.
- New items default to **Available / not purchased** unless a matching purchase record already exists.
- Grid columns and card widths adapt to the available screen space and selected text-size mode.
- Counts, filters, and search results recalculate from the actual loaded rows.

## 7. GiftList CSV Import

Build an import workflow for CSV files exported from GiftList.

### 7.1 Expected input fields

The uploaded GiftList export currently contains these columns:

- `title`
- `url`
- `price`
- `currency`
- `quantity`
- `notes`
- `most_wanted`
- `tags`
- `image_url`
- `gift_id`

The importer should support these fields and tolerate optional blank values. It should also accept optional future fields such as `description`, `category`, or `purchased` without breaking older exports.

### 7.2 Field mapping

- `title` → item title.
- `url` → purchase destination.
- `price` + `currency` → formatted price, when both/one are valid.
- `quantity` → requested quantity; default to 1 when missing or invalid.
- `notes` → **Why I want it** text.
- `description` (when present) → item description.
- `most_wanted` → featured/most-wanted marker.
- `tags` → optional labels or category metadata.
- `image_url` → item image source.
- `gift_id` → stable item identifier used to preserve purchase status across CSV updates.

Do not invent descriptions or reasons when the CSV does not contain them. Hide empty optional sections instead of showing blank labels.

### 7.3 Import validation and preview

Before the import is accepted:

- Validate required headers and identify missing or unrecognized columns.
- Preview the number of items to be imported.
- Flag rows without titles, invalid URLs, invalid prices, duplicate IDs, or missing images.
- Allow an administrator to review the preview and confirm the import.
- Preserve supported fields and values; do not silently discard notes, tags, quantities, or IDs.
- Normalize boolean values such as `TRUE`, `FALSE`, `true`, and `false`.
- Escape/sanitize displayed text so CSV content cannot inject HTML or scripts.
- Handle commas, quotation marks, line breaks, Unicode, and empty cells correctly.

### 7.4 Making imported data available on `main`

The import must ultimately update the canonical CSV file on the repository's `main` branch, because that is what the hosted site reads.

Recommended implementation:

1. Provide a protected owner/admin import page or development-only import command.
2. Parse and validate the GiftList CSV and show the preview.
3. Normalize the content into the canonical CSV format.
4. Submit the approved file to a server-side function that commits the CSV to the configured repository path on `main`.
5. Keep any GitHub App credentials or access tokens on the server as environment secrets—never in frontend JavaScript or the public repository.
6. After the commit succeeds, the hosted app refreshes the CSV from `main` and displays the new list.

If a secure server-side commit integration is not included in the first implementation, provide a clear fallback workflow: generate a normalized CSV for download and document that it must be committed to the canonical file path on `main`. Do not pretend a browser-only import has updated the live repository.

### 7.5 Image handling — important constraint

A CSV stores image references, not the actual image files. In the supplied export, `image_url` values are relative paths such as `media/...webp?...`, not complete `https://` URLs. Those paths cannot be reliably loaded by the new hosted app unless their original asset host is known and accessible.

The importer must therefore:

- Use an absolute image URL when the CSV provides one.
- Resolve a relative image path only when the correct source base URL is explicitly configured or supplied during import; never guess the host.
- Prefer copying/importing image assets into the app's own hosted assets directory (for example, `/public/images/wishlist/`) and rewriting `image_url` to that stable path when the original images can be obtained.
- Support an accompanying image archive or image upload if the CSV export does not contain accessible image files.
- Show a graceful image placeholder and an admin warning when an image cannot be resolved.
- Use lazy loading, fixed image containers, and appropriate `alt` text to keep the page fast and prevent layout shifts.

This is essential for making the imported list portable and reliable after the app is hosted.

## 8. Shared Purchased / Not-Purchased Tracking

The current GiftList CSV export does **not** include a purchased-status column. The app must not assume that a missing field means an item has been bought or not bought based on its title or URL.

Use a shared status store separate from the read-only wishlist CSV, keyed by `gift_id`:

- `gift_id`
- `purchased_quantity` (or a simple purchased boolean for quantity-one items)
- Optional `reserved_quantity` if reservations are supported
- `updated_at`

A small hosted database or server-side key/value store can provide shared state across family members and devices. For example, use a hosted database with a narrowly scoped server endpoint; do not allow unrestricted public database writes.

Behavior:

- Every item starts as not purchased unless the shared status store has a matching record.
- When a family member marks an item purchased, update the shared status for that `gift_id`.
- The update appears for other visitors after the next data refresh and should update immediately for the person who made it.
- The public page should not reveal who purchased an item unless the owner explicitly enables that feature.
- Provide a protected owner/admin action to correct accidental status changes or reset an item.
- Preserve statuses when the CSV is reordered or item details are edited, because the status is associated with `gift_id`, not row position or title.
- If an item is removed from the CSV, archive its status rather than assigning it to a different item. If it is later re-added with the same `gift_id`, its status can be restored.
- For quantities above one, calculate the remaining quantity and mark the item fully purchased only when the requested quantity is met.

**Important separation:** The CSV on `main` is the source of truth for what is on the wishlist; the shared status store is the source of truth for whether/how many have been purchased. This avoids exposing a GitHub write token to every visitor and prevents purchase clicks from changing the wishlist file.

## 9. Owner / Admin Tools

Keep management tools separate from the public family-facing view. At minimum, support:

- Import a new GiftList CSV.
- Preview and validate the imported list.
- Publish the normalized CSV to `main` through a protected server-side action, or download it for a manual commit.
- View data-loading errors and unresolved image paths.
- Correct or reset purchase statuses.
- Optionally add/edit descriptions and “Why I want it” notes by updating the canonical CSV.

Do not require family members to sign in just to view the wishlist or open purchase links.

## 10. Technical Architecture

The implementation may use the project's existing framework and hosting setup. Keep the following responsibilities separate:

1. **CSV data service:** Fetches the canonical CSV from `main`, parses it, validates rows, and exposes normalized wishlist items.
2. **Purchase-status service:** Reads and updates shared purchase state keyed by `gift_id`.
3. **Wishlist UI:** Renders cards, detail views, search, filters, counts, and text-size modes from live data.
4. **Import/admin service:** Validates GiftList exports and safely publishes normalized data to the repository.
5. **Image service/path resolver:** Resolves stable image paths and fallbacks.

Recommended implementation details:

- Use a maintained CSV parser rather than splitting lines manually.
- Keep CSV parsing, data normalization, purchase status, and UI rendering in separate modules.
- Validate external purchase URLs and image URLs before rendering them.
- Do not execute or inject content from CSV fields as HTML.
- Never place GitHub credentials or database service-role keys in client-side code.
- Handle loading, empty, offline, malformed CSV, unavailable image, and failed purchase-status update states explicitly.
- Include basic logging for import and data-fetch errors without logging secrets or unnecessary personal information.

## 11. Suggested Development Phases

### Phase 1 — Foundation and Data Pipeline

- Set up the project structure and responsive design system.
- Add the canonical wishlist CSV under the repository's `main` branch.
- Implement CSV fetching, parsing, normalization, validation, and refresh behavior.
- Confirm that the initial GiftList export renders correctly.
- Resolve the relative image-path issue or implement the image asset import process.

### Phase 2 — Guest Wishlist Experience

- Build the home page and responsive item-card grid.
- Add item detail views.
- Display title, description, “Why I want it,” price, tags, quantity, image, and purchase link as available.
- Add search, filters, live counts, and most-wanted styling.
- Add clear empty, missing-link, and missing-image states.

### Phase 3 — Accessibility and Interaction Polish

- Implement Normal, Bigger, and Biggest text modes.
- Verify all card layouts and controls at all three modes.
- Add polished transitions, loading feedback, focus states, and button feedback.
- Add keyboard and screen-reader support and reduced-motion behavior.
- Test touch target sizes and contrast.

### Phase 4 — Shared Purchase Tracking

- Implement the shared status store keyed by `gift_id`.
- Add mark-purchased/reserve confirmation and owner correction tools.
- Add quantity-aware purchased tracking.
- Synchronize status across devices and visitors.
- Verify that CSV updates do not reset existing statuses.

### Phase 5 — GiftList Import and Publishing

- Build CSV upload, validation, and preview.
- Add field mapping and normalization for GiftList exports.
- Implement secure publishing to the canonical CSV on `main`, or the documented manual-commit fallback.
- Handle image assets and rewrite image paths when necessary.
- Verify that a successful import becomes visible on the hosted site after refresh.

### Phase 6 — Testing, Performance, and Release

- Test with small, medium, and large CSV files.
- Test new rows, edits, deletions, duplicate IDs, blank fields, and malformed rows.
- Test purchased and partially purchased items across multiple devices.
- Test mobile, tablet, desktop, and all text-size modes.
- Test slow network, offline fallback, stale cache, failed image loads, and failed status updates.
- Check performance and accessibility before publishing.

## 12. Acceptance Criteria

The first release is complete when all of the following are true:

- [ ] A family member can open the site without creating an account.
- [ ] Each item clearly shows its image, title, description when available, and why the list owner wants it.
- [ ] A valid purchase button opens the correct external URL.
- [ ] Missing purchase links and missing images have graceful, understandable fallbacks.
- [ ] Normal, Bigger, and Biggest modes work across the entire interface and persist on the visitor's device.
- [ ] The UI has polished animations and useful feedback without sacrificing accessibility or performance.
- [ ] The hosted app loads wishlist content from the canonical CSV on the repository's `main` branch.
- [ ] Adding a CSV row to `main` automatically adds an item after refresh; the UI is not limited to the initial 13 items.
- [ ] Editing or removing CSV rows is reflected after refresh.
- [ ] New items default to not purchased unless a matching `gift_id` status already exists.
- [ ] Purchased status is shared across visitors and devices, and is preserved when item rows are reordered or edited.
- [ ] Quantity-based purchase tracking works for items with more than one requested unit.
- [ ] A GiftList CSV can be imported, validated, previewed, and published to the canonical file on `main` through a secure workflow.
- [ ] The importer handles the supplied GiftList column format and does not silently discard notes, tags, quantities, IDs, or valid URLs.
- [ ] Relative image paths are resolved only with a known source base or converted to stable hosted assets; unresolved images show a fallback.
- [ ] GitHub and database credentials are never exposed in frontend code.
- [ ] Loading failures never masquerade as a genuinely empty wishlist.

## 13. Key Implementation Notes

1. **Do not hardcode the current 13 items.** They are only the initial dataset; the CSV can grow at any time.
2. **Keep `gift_id` stable.** It is the link between the CSV item and its shared purchased status.
3. **Treat `main` as authoritative for item content.** A local cache is only a fallback when the source cannot be reached.
4. **Keep purchase state separate from the CSV.** The provided GiftList export has no purchased field, and a static hosted page cannot safely commit changes to GitHub directly from a visitor's browser.
5. **Do not assume image files are embedded in the CSV.** The supplied `image_url` values are relative paths, so image hosting/resolution must be addressed as part of import.
6. **Do not mark an item purchased merely because someone clicked “Buy.”** The visitor must explicitly confirm the status.

The finished product should feel effortless for family members while remaining straightforward to update: maintain the CSV on `main`, let the hosted app load it dynamically, and let shared purchase tracking keep everyone informed about what is still available.
