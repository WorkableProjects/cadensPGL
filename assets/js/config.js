// Site configuration. Change these values to point the site at a different
// repository, branch, or file without touching any rendering code.
export const CONFIG = Object.freeze({
  // Repository that holds the canonical data files.
  owner: 'WorkableProjects',
  repo: 'cadensPGL',
  branch: 'main',

  // Paths inside the repository (also used as same-site fallbacks when the
  // site itself is served from the repository root by GitHub Pages).
  wishlistPath: 'data/wishlist.csv',
  purchasesPath: 'data/purchases.csv',
  imagesDir: 'images/wishlist',

  // Base URL used to resolve relative image paths from a GiftList export
  // (e.g. "media/abc/gifts/x.webp"). Leave empty unless the real host is known;
  // the site never guesses it. Unresolved images fall back to
  // `${imagesDir}/<gift_id>.<ext>` and then to a placeholder.
  imageBaseUrl: '',
  localImageExtensions: ['webp', 'jpg', 'png'],

  // Copy shown on the home page.
  title: "Caden's Gift List",
  welcome: "Thanks for looking! Tap any gift to see why I want it and where to buy it.",

  // Optional contact link shown after someone marks a gift as bought, so the
  // list keeper can record it for everyone (e.g. "mailto:parent@example.com"
  // or "sms:+15555550123"). Leave empty to hide.
  ownerContact: '',
  ownerContactLabel: 'Let the list keeper know',

  // Background refresh while the page is open (ms). 0 disables it.
  refreshIntervalMs: 5 * 60 * 1000,
});

export function rawUrl(path) {
  const { owner, repo, branch } = CONFIG;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}
