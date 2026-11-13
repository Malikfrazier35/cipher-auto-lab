# cipherautolab.com

Static marketing site for **Cipher Auto Lab** — mobile auto detailing and ceramic coating
across Connecticut, with window tint by appointment at the Windsor Locks shop as the
secondary service.

The site follows the print campaign (door magnet, postcard, business card): black and lime,
Inter + JetBrains Mono, "Mobile detailing + ceramic coating", "We come to you · home or work",
"Mobile across CT", and the phone number as big as the page allows.

No framework, no build step. Five HTML pages, a shared stylesheet and a campaign layer.

## Pages

| File | URL | What's on it |
| --- | --- | --- |
| `index.html` | `/` | Campaign home: Mobile Detailing + Ceramic Coating hero with the Detail menu card (QR on desktop, button on phones), call-or-text band, Pick your detail with a vehicle-size price switch, how it works, recent work, across CT, fleet, and window tint as a small secondary strip |
| `tint.html` | `/tint.html` | Window tint: carbon vs ceramic, full pricing, partials, the appointment, CT law, warranty, aftercare |
| `detailing.html` | `/detailing.html` | Detail packages, add-on menu, restoration, ceramic coating, headlights |
| `quote.html` | `/quote.html` | Free photo quote, detailing booking form, then the tint appointment, FAQ |
| `menu.html` | `/menu` | The Detail Menu every QR code opens (magnets, postcard, business card). Pick a vehicle size, a package and add-ons; `js/menu.js` keeps a live total and time and builds a ready-to-send text. Works as a plain price list without JavaScript. **Never delete or rename `/menu`** |
| `styles.css` | — | Every style for every page (~39 KB, cached across pages) |
| `menu.css` | — | Styles for the menu page only |
| `campaign.css` | — | Campaign layer loaded after `styles.css` on every page: fonts, header lockup, the new home page |

Also in the repo:

| Path | Purpose |
| --- | --- |
| `js/preselect.js` | Carries a service choice from `detailing.html` into the booking form |
| `js/sizes.js` | Home page vehicle-size switch for the package prices (sedan prices show without it) |
| `fonts/` | Inter and JetBrains Mono, self-hosted (SIL Open Font License, copies included) |
| `vercel.json` | Security headers, Content Security Policy, caching |
| `.well-known/security.txt` | Where to report a vulnerability |
| `.github/workflows/guardrails.yml` | CI: secret scanning, blocks inline code that would break the CSP |
| `tools/harden.py` | Moves inline styles and scripts out of the HTML |
| `tools/build_menu.py` | Regenerates `menu.html` from one price list: `python3 tools/build_menu.py` |
| `SECURITY.md` | Threat model, what's protected, owner checklist, incident steps |

## Security

Read [`SECURITY.md`](SECURITY.md). Short version: no inline code in the HTML (CI enforces
it), the strict CSP starts in report-only mode, and the most important protections are
passkeys on every account that can touch the site, the money or the domain.

## Everything is in this repo

The whole site lives here now, including the booking scripts (`config.js`, `vehicles.js`,
`app.js`, `photoquote.js`), the fleet page and its script (`fleet.html`, `fleet.js`), the
legal pages (`agreement.html`, `terms.html`, `privacy.html`, `legal.css`) and the photos in
`img/`. Upload the repo's **contents** to the root of the GitHub repo, never the folder itself,
or Vercel serves it under a sub-path and the home page stays old.

## Payments (Stripe)

The booking deposit is a custom checkout inside the booking form: a Stripe Checkout Session in
`elements` mode with Stripe's Payment Element, styled to the site. Three Vercel functions in
`api/` do the server side:

| File | What it does |
|---|---|
| `api/create-checkout-session.js` | Works out the deposit from the service (never from the browser) and creates the session |
| `api/checkout-status.js` | Tells the page whether a deposit went through when a payment app sends the customer back |
| `api/stripe-webhook.js` | On a paid deposit: credits it to the customer, saves their address for tax, and creates a **draft** balance invoice from the catalog products (`cal_*`). Nothing is sent until you send it |
| `api/_booking.js` | Prices, deposits and invoice lines, in step with `app.js` |

Vercel environment variables (Production, marked **Sensitive**), never in this repo:

- `STRIPE_SECRET_KEY`: a restricted key with write access to Checkout Sessions, Customers,
  Invoices, PaymentIntents, Products and Prices.
- `STRIPE_WEBHOOK_SECRET`: the signing secret of the webhook destination
  `https://cipherautolab.com/api/stripe-webhook`, sending `checkout.session.completed`,
  `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`.

Until `STRIPE_SECRET_KEY` is set, the deposit step falls back to "text us your booking" and
nothing is charged. Prices include Connecticut sales tax (Stripe Tax, tax-inclusive prices).
Tests: `npm i && node tools/test_stripe_api.mjs`.

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

## The /menu address

The car magnet's QR code encodes `https://cipherautolab.com/menu`. A rewrite in `vercel.json`
serves `menu.html` there. If the menu ever moves, change the rewrite's destination and keep
`/menu` working, or every printed magnet stops working.

## Editing

- **Prices** appear in the HTML as plain text. Detailing prices are in `detailing.html` and
  `menu.html`; keep them identical. Tint prices are in `tint.html`
  (whole-car table and partials table) and repeated in the "what we do" card on
  `index.html`. Detailing and coating prices are in `detailing.html`. Change both
  places or they will drift.
- **Structured data** for Google lives in one `<script type="application/ld+json">`
  block at the top of `index.html` — address, phone, hours, service prices. Keep it
  identical to the Google Business Profile.
- **The logo** is an inline `<symbol id="bead">` near the top of each page's `<body>`.

## Open items

- [ ] Add window tint to the booking widget as a fourth service (`app.js`)
- [ ] Replace the New Haven County town list in the booking form (`config.js`) — the
      campaign now says mobile across CT
- [ ] Confirm where ceramic coating happens. The campaign says "Mobile detailing + ceramic
      coating · we come to you"; `detailing.html` still describes coating at the shop
- [ ] Prices live in `detailing.html`, `menu.html` and the home page cards (`index.html`,
      `data-sedan` / `data-suv` / `data-suv3` / `data-truck`). On the menu they sit on the package
      radio buttons, the add-on checkboxes (`data-price`) and the paint table. Change them together
- [ ] Confirm the service buttons on `detailing.html` preselect correctly — they pass
      `?svc=<key>` to `quote.html`, where a small script clicks the matching option
- [ ] Decide whether the street address stays published before the special use permit
      is granted; it is off the home page, tint page and footer now, but still on
      `quote.html` and in the structured data
- [ ] Swap the placeholder shop hours once they are set

© Cipher Auto Lab LLC. All rights reserved. Not open source — published for version
control and deployment.
