# cipherautolab.com

Static marketing site for **Cipher Auto Lab** — window tint and ceramic coating at the
Windsor Locks shop, plus mobile auto detailing across Hartford County, Connecticut.

No framework, no build step. Four HTML pages and one stylesheet.

## Pages

| File | URL | What's on it |
| --- | --- | --- |
| `index.html` | `/` | Hero, the three services, recent work, how it works, service area, fleet |
| `tint.html` | `/tint.html` | Window tint: carbon vs ceramic, full pricing, partials, the appointment, CT law, warranty, aftercare |
| `detailing.html` | `/detailing.html` | Detail packages, add-on menu, restoration, ceramic coating, headlights |
| `quote.html` | `/quote.html` | Free photo quote, tint appointment, detailing booking form, FAQ |
| `styles.css` | — | Every style for every page (~39 KB, cached across pages) |

Also in the repo:

| Path | Purpose |
| --- | --- |
| `js/preselect.js` | Carries a service choice from `detailing.html` into the booking form |
| `vercel.json` | Security headers, Content Security Policy, caching |
| `.well-known/security.txt` | Where to report a vulnerability |
| `.github/workflows/guardrails.yml` | CI: secret scanning, blocks inline code that would break the CSP |
| `tools/harden.py` | Moves inline styles and scripts out of the HTML |
| `SECURITY.md` | Threat model, what's protected, owner checklist, incident steps |

## Security

Read [`SECURITY.md`](SECURITY.md). Short version: no inline code in the HTML (CI enforces
it), the strict CSP starts in report-only mode, and the most important protections are
passkeys on every account that can touch the site, the money or the domain.

## Files this repo does NOT contain

The booking widget on `quote.html` is driven by scripts that live in the existing
deployment. Copy them into the project root before deploying or the form will not work:

```
config.js        site config — prices, towns, Stripe publishable key
vehicles.js      vehicle make/model/trim data for the booking picker
app.js           booking widget: service picker, pricing, dates, payment
photoquote.js    the four-photo upload quote flow
img/             photography, including img/sonata-canopy.webp (hero)
```

Keep `/fleet`, `/agreement`, `/terms` and `/privacy` as they already are — the footer
links to them and they are not part of this bundle.

**Do not commit secrets.** `config.js` should hold only the *publishable* Stripe key.
Anything secret belongs in the hosting provider's environment variables.

## Run it locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

The pages render fine straight from the filesystem too, but the booking form needs a
server for uploads and payment.

## Deploy

Static hosting; the repo root is the web root.

On Vercel, importing this repo is enough — `vercel.json` sets long cache headers for
`styles.css` and a few security headers. Links are written with the `.html` extension,
so `cleanUrls` is left off deliberately; turning it on adds a redirect hop to every
internal link unless the links are rewritten too.

## Editing

- **Prices** appear in the HTML as plain text. Tint prices are in `tint.html`
  (whole-car table and partials table) and repeated in the "what we do" card on
  `index.html`. Detailing and coating prices are in `detailing.html`. Change both
  places or they will drift.
- **Structured data** for Google lives in one `<script type="application/ld+json">`
  block at the top of `index.html` — address, phone, hours, service prices. Keep it
  identical to the Google Business Profile.
- **The logo** is an inline `<symbol id="bead">` near the top of each page's `<body>`.

## Open items

- [ ] Add window tint to the booking widget as a fourth service (`app.js`)
- [ ] Replace the New Haven County town list in the booking form (`config.js`)
- [ ] Confirm the service buttons on `detailing.html` preselect correctly — they pass
      `?svc=<key>` to `quote.html`, where a small script clicks the matching option
- [ ] Decide whether the street address stays published before the special use permit
      is granted; it currently appears on `index.html`, `quote.html` and in the
      structured data
- [ ] Swap the placeholder shop hours once they are set

© Cipher Auto Lab LLC. All rights reserved. Not open source — published for version
control and deployment.
