# App download site

A small site that lists Android apps and links to their APK files. Plain HTML/CSS/JS front end,
Netlify Functions for the API, Netlify Blobs for storage. You manage everything from `/admin-panel/`;
changes appear on the public site within about 30 seconds, with no redeploy.

## What you need
- A Netlify account and this folder in a Git repository (recommended), or the Netlify CLI.
  *Functions with dependencies need a Git-connected or CLI deploy; a plain drag-and-drop of the
  folder is not recommended. Check Netlify's current docs for your plan.*
- Your APK files and images hosted somewhere with **direct `https://` links** (your own server,
  cloud storage, GitHub Releases, etc.). This site does not host files.

## Deploy
1. Push this folder to a Git repository and create a Netlify site from it. Build settings come
   from `netlify.toml` (no build command; `publish = "."`; functions in `netlify/functions`).
   Netlify installs `@netlify/blobs` itself.
2. In Netlify: **Site configuration → Environment variables**, add:

   | Variable | Value |
   |---|---|
   | `ADMIN_PASSWORD` | A long, unique password (16+ characters). No default: login stays disabled without it. |
   | `SESSION_SECRET` | A random string of 32+ characters, e.g. `openssl rand -base64 48`. |

   Make them available to Functions, then **redeploy** (environment changes only apply to new deploys).
3. Open `https://YOUR-SITE/admin-panel/`, sign in, then: **Settings** (site name, contact email),
   **Categories**, **Apps → Add app**. New apps start as Drafts until you tick *Published*.
4. Run the **post-deploy checklist** below.

## Post-deploy checklist
Replace `SITE` with your address. Everything here was only tested locally, so please confirm it on the live site.
```
curl -sI https://SITE/ | grep -iE "content-security|x-frame|x-content-type|strict-transport"   # all four present
for p in netlify.toml package.json README.md SECURITY-REVIEW.md netlify/functions/auth.mjs test/run.mjs dev/server.mjs; do
  printf "%s " $p; curl -s -o /dev/null -w "%{http_code}\n" https://SITE/$p; done                # every line must say 404
curl -s https://SITE/api/apps                      # JSON with "apps" and "categories"; no "apkUrl" anywhere
curl -s -o /dev/null -w "%{http_code}\n" https://SITE/api/admin/apps   # 401
curl -s https://SITE/robots.txt                    # shows Disallow: /admin-panel/ and your own Sitemap URL
```
Then in the browser: sign in (cookie should be `HttpOnly`, `Secure`, `SameSite=Strict` in DevTools → Application),
publish a test app, tap Download, and in Chrome DevTools → Application confirm the service worker is active and the
site loads with the network set to Offline. If any file in the 404 list is reachable, move the public files into a
`public/` folder and set `publish = "public"` in `netlify.toml`.

## Day-to-day
- **Add or edit apps:** `/admin-panel/`. Links must be direct `https://` links; the form warns about Google Drive / Dropbox preview links.
- **Back up:** *Backup → Download backup* regularly and before big changes. Restoring replaces everything.
- **Change the password:** edit `ADMIN_PASSWORD`, redeploy. **Sign everyone out now:** change `SESSION_SECRET`, redeploy.
- **After changing CSS/JS/HTML:** bump `VERSION` in `sw.js` (e.g. `v1` → `v2`) so visitors don't keep old copies.
- **Install name:** `manifest.webmanifest` is static. Edit `name` and `short_name` if you rename the site.
- **Download counts** are approximate and can be inflated; don't rely on them.

## Limits
500 apps, 50 categories, 10 screenshots per app, 5,000-character descriptions, 3 MB backup file.
Public changes take up to ~30 s to appear (CDN cache). App pages open behind a `#`, so search engines index the
home page and static pages but not individual apps.

## Troubleshooting
| Symptom | Cause |
|---|---|
| Login says it is disabled (503) | `ADMIN_PASSWORD` or `SESSION_SECRET` missing, or the secret is under 32 characters, or you did not redeploy. |
| "Too many failed attempts" | 5 wrong passwords from your IP in 15 minutes. Wait it out. |
| Icon shows a letter instead of an image | The link is dead, not `https://`, or the host blocks hotlinking. Screenshots that fail are hidden. |
| Download opens a web page, not a file | The link is a share/preview page, not the file itself. |
| Saving says "category must be one of…" | Create the category first (Categories tab). |
| Site looks stale after a deploy | Bump `VERSION` in `sw.js`, redeploy, reload twice. |
| Admin edits "disappear" | Two tabs saved at once (last save wins). Restore from a backup. |

## Project layout
```
index.html about.html privacy.html disclaimer.html contact.html 404.html offline.html
admin-panel/        admin UI (index.html, admin.js, admin.css)
assets/             css, js, icons
sw.js manifest.webmanifest
netlify.toml package.json
netlify/functions/  apps settings media download auth seo admin-apps admin-meta admin-backup, plus _lib/
dev/server.mjs      local server running the real functions on fake storage (never deployed to users)
test/               automated tests
```

## Testing locally
- `npm install` then `npm test`: static safety checks plus function tests on an in-memory stand-in for Blobs. Needs Node 20+.
- Browser tests (optional; need Python + Playwright with Chromium). Start `node --import ./test/register.mjs dev/server.mjs`
  in one terminal, then run `python3 test/browser.py`, `test/browser-links.py` or `test/browser-pwa.py` (restart the server
  between runs for clean data). `browser-pwa.py` stops and restarts the server itself to test offline mode.
  The dev server sign-in password is `test-pass`. Never use it anywhere real.
- Commit the `package-lock.json` that `npm install` creates, and run `npm audit` now and then.

## Not tested on real Netlify
Live Blobs behaviour (including consistency and the exact `@netlify/blobs` version), Netlify's header/redirect merging,
CDN caching timing, client IP detection for the rate limit, and installation on a real phone.
`SECURITY-REVIEW.md` lists what was reviewed and which risks are accepted.

## Legal
The privacy and disclaimer pages are plain templates, not legal advice. Have them reviewed for your country and
make sure you have the right to distribute every app you list.
