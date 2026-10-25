# Security review

Scope: everything in this repository as of Phase 7. Method: reading all code, the automated
tests (`npm test`, plus the browser tests in `test/`), and targeted abuse cases.
**Not covered:** the live Netlify and Blobs platform (nothing here was run on Netlify), a
dependency audit (no network access when this was written: run `npm audit` yourself), and an
independent third-party penetration test.

## Fixed during this review
| Finding | Fix |
|---|---|
| `PATCH /api/admin/apps/:id` with a body of `null` caused a 500 instead of a 400. | Body type is checked first; covered by a test. |
| HSTS used `includeSubDomains`, which can affect unrelated sibling subdomains of your domain. | Removed. Add it back only if every subdomain is HTTPS-only. |
| `netlify.toml` and the docs were reachable as static files because the site publishes from the repo root. | 404 rules added; a static check fails if they are removed. |
| Privacy page did not mention that icons/screenshots load from other sites. | Added. |

## Controls in place (and how each is tested)
- **Login:** password compared by constant-time hash comparison; disabled unless `ADMIN_PASSWORD` and a 32+ character `SESSION_SECRET` are set; 5 failures per 15 minutes per IP, then 429. *(function tests)*
- **Session:** HMAC-SHA256 signed token, 8-hour expiry, `HttpOnly; Secure; SameSite=Strict`. Tampered, truncated, expired and malformed tokens rejected. *(function tests)*
- **Every admin endpoint** calls `requireAdmin` first; a static check enforces this for each admin function, and a test confirms 401 without a cookie.
- **CSRF:** SameSite=Strict, a same-origin check on every write, and JSON-only bodies (forces a CORS preflight). *(function tests)*
- **Input validation:** length limits, https-only URLs, no embedded credentials, dates, package names, category membership, list sizes, body size limits. Server-controlled fields (id, dates, download counts) cannot be set by the client. *(function tests)*
- **XSS:** data is stored as plain text and shown with `textContent`/`setAttribute` only; a static check bans `innerHTML`, `eval` and similar. A hostile app name renders as literal text. *(browser test)*
- **CSP:** `script-src 'self'`, `style-src 'self'`, no `unsafe-inline`/`unsafe-eval`; static check bans inline scripts, handlers and styles in HTML. Framing denied.
- **Data exposure:** the public API never returns APK URLs or unpublished apps. *(function tests)*
- **Storage failures:** a Blobs read error returns 500 and never causes an empty catalog to be written. *(function tests)*
- **Service worker:** never handles admin, auth or download requests and never caches them. *(browser test)*
- **Dependencies:** one (`@netlify/blobs`).

## Accepted risks and limitations
| Risk | Why accepted / mitigation |
|---|---|
| **Sessions cannot be revoked individually.** Logout only clears the browser's cookie; a stolen cookie works until it expires (8 h). | Single-admin site. To sign everyone out immediately, change `SESSION_SECRET` and redeploy. |
| **Download counts can be inflated** by anyone who requests `/api/download/:id` repeatedly, and can lose counts under simultaneous traffic. | Labelled approximate. Do not use for anything that matters. Repeated hits also cause Blobs writes; if you see abuse, add Netlify's rate limiting rules for `/api/download/*`. |
| **Login rate limit is per IP.** An attacker with many IPs (e.g. IPv6 ranges) can try more passwords. | Use a long random `ADMIN_PASSWORD` (16+ characters). |
| **Admin edits are last-write-wins.** Two admin tabs saving at once can overwrite each other. | Single-admin site. Export a backup before big changes. |
| **The admin can set any https redirect target for downloads.** | The admin is trusted. Anyone who can sign in can send visitors to any https file, so protect the password. |
| **Hosting from the repo root** relies on 404 rules to hide source files. | Verify after deploy with the checklist in `README.md`. If you want it airtight, move the public files into a `public/` folder and set `publish = "public"`. |
| **External images** reveal visitors' IP addresses to those hosts. | Disclosed in the privacy page. Referrer is withheld. |
| **No 2FA, no audit log.** | Out of scope for a single-admin site. |
