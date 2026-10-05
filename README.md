# H&N Packaging — PWA

Installable web app (PWA) for the H&N Packaging website. Works offline after the first visit.

## Publish on GitHub Pages

1. On github.com, create a new **public** repository (for example `hn-packaging`).
2. Click **uploading an existing file**, then drag in *everything inside this folder* (not the folder itself) and commit.
   `index.html` must sit at the top level of the repository.
3. Go to **Settings → Pages**, set **Source** to *Deploy from a branch*, choose **main** and **/ (root)**, then save.
4. After a minute or two the site is live at `https://YOUR-USERNAME.github.io/hn-packaging/`.

## Install it

- **Android / Chrome / Edge**: open the address, then menu → *Install app* (or *Add to Home screen*).
- **iPhone / iPad (Safari)**: Share button → *Add to Home Screen*.

## Updating the site

After changing any file, open `sw.js` and change `VERSION = 'v1'` to `'v2'` (and so on).
That tells installed phones to download the new files.

## Files

- `index.html` — the page
- `manifest.webmanifest` — app name, colours, icons
- `sw.js` — service worker (offline cache)
- `icons/` — app icons made from the logo
- `assets/`, `vendor/`, `support.js` — images and the scripts that render the page
- `.nojekyll` — tells GitHub Pages to serve the files as they are
