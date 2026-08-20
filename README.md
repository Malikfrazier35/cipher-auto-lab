# Cipher Auto Lab — cipherautolab.com

Static marketing site for a mobile auto detailing service covering New Haven County,
the Naugatuck Valley and central Connecticut. No framework, no build step, no dependencies.

## Layout

```
index.html      the whole site — markup and styles
app.js          booking flow logic (kept external so CSP can ban inline script)
img/            job photos, WebP
vercel.json     security headers + cache policy
```

## Local preview

```bash
python3 -m http.server 8000    # then open http://localhost:8000
```

Open `index.html` directly and it still works, except `app.js` may be blocked by
`file://` CSP rules in some browsers. Use the server.

## The booking flow

Five steps in `app.js`, all client-side:

1. **Service + vehicle size** — live estimate, `base × size multiplier`, rounded to $5
2. **Vehicle details** — model, condition, where it's parked
3. **Date + window** — next 24 working days, Sundays excluded, two-day minimum lead
4. **Contact** — validated: 10-digit phone, real email format if supplied, address required
5. **Confirm** — deposit, cancellation terms, price-change terms, explicit consent checkbox

On submit it generates a reference (`CAL-XXXXXXX`) and hands a formatted summary to the
customer's SMS or email client. **Nothing is transmitted to a server.**

### Pricing

| Package | Base | Deposit |
|---|---|---|
| Refresh | $149 | $25 |
| Full Detail | $279 | $40 |
| Ceramic | $749 | $75 |

Size multipliers: sedan `1.0`, SUV/crossover `1.2`, truck/3-row `1.4`.

All of it lives at the top of `app.js` and in the `data-base` / `data-dep` / `data-mult`
attributes in `index.html`. Change both if you change prices.

### Deposit policy as implemented

Refunded in full for: 24h+ notice, any reschedule by us including weather, a declined
re-quote, or an unworkable site. Forfeited only for same-day cancellation or a no-show.
The deposit is credited against the total, not charged on top.

## Security posture

- **No secrets, no backend, no database.** There is nothing to breach.
- **No card details are collected.** The deposit is taken via a payment link sent after
  the slot is confirmed. Never add a card field to this page — use a hosted checkout.
- **CSP forbids inline and third-party script** (`script-src 'self'`). This is why `app.js`
  is a separate file. If you re-inline it, the script stops running.
- `frame-ancestors 'none'` and `X-Frame-Options: DENY` block clickjacking of the booking flow.
- `form-action 'none'` — nothing can POST anywhere.
- Honeypot field (`#hp`) silently drops bot submissions.
- All user input is stripped of control characters and length-capped before it reaches
  the `sms:` / `mailto:` payload.
- HSTS is preloadable. Only submit to the preload list once you're sure about HTTPS-only.

Remaining weak spot: `style-src` still allows `'unsafe-inline'` because the CSS lives in
the document head. Lower risk than script, but if you want it gone, move the `<style>`
block to `style.css` and drop `'unsafe-inline'` from that directive.

## Deploying

Connected to Vercel. Pushes to the default branch deploy automatically once the repo
is linked. Manual deploy:

```bash
npx vercel --prod
```

## Known placeholders

- `hello@cipherautolab.com` — swap for the real inbox
- Prices are researched market rates, not confirmed by the owner
- Photo gallery has room for more matched before/after pairs

## Next steps worth doing

1. Wire the booking request to a real endpoint (Formspree, Netlify Forms, or a Vercel
   serverless function) so requests can't be lost to a broken mail client.
2. Square Appointments or Stripe Checkout for the deposit, so slots lock automatically.
3. Add `sitemap.xml` and structured data (`LocalBusiness`, `Service`) for local SEO.
4. Google Business Profile — the highest-value marketing action still outstanding.

---

# Stripe deposits — embedded, no redirect

## How it works

`api/create-payment-intent.js` is a Vercel serverless function. The browser posts the
booking details, the function creates a Stripe PaymentIntent and returns only the
`client_secret`. The front end mounts Stripe's **Payment Element** directly in the page
and confirms with `redirect: 'if_required'`, so card payments never leave the site.

**The amount is calculated on the server**, from the package key. The browser never
sends a price. Without that, anyone could open devtools and pay $1 to hold a slot.

Card data goes from the customer's browser straight to Stripe. It never touches the
serverless function or the repo, which keeps you in the simplest PCI bracket (SAQ A).

There is no database. Every booking detail is written into the PaymentIntent's
**metadata**, so the Stripe dashboard *is* the booking record — searchable by the
`CAL-` reference.

## Setup — about ten minutes

1. Create a Stripe account and get both keys from the Developers → API keys page.
2. In Vercel → Settings → Environment Variables, add:
   `STRIPE_SECRET_KEY` = `sk_live_...` (or `sk_test_...` while testing)
3. In `index.html`, replace `pk_test_REPLACE_ME` with your **publishable** key.
   That key is safe in client code — the secret one never is.
4. Redeploy.

Until a real publishable key is in place, the deposit step degrades gracefully: it tells
the customer card payment isn't switched on and gives them the phone number, rather than
showing a broken form.

## Testing

Use `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP while in test mode.
`4000 0000 0000 9995` simulates a decline so you can check the error path.

## CSP

`vercel.json` allows exactly what Stripe needs and nothing more:
`script-src` js.stripe.com · `frame-src` js.stripe.com + hooks.stripe.com ·
`connect-src` api.stripe.com. Stripe.js must be loaded from Stripe's domain — self-hosting
it breaks PCI compliance and Stripe will reject it.

## Deposits (server-side, in `api/create-payment-intent.js`)

| Package | Deposit |
|---|---|
| Refresh | $25 |
| Full Detail | $40 |
| Ceramic | $75 |
| Gloss Enhancement | $50 |
| Paint Correction | $100 |
| Show Finish | $150 |
| Headlight Restoration | $25 |

Change them in `DEPOSITS` in the API file. The copy in `app.js` is display only.

## Restoration menu

Correction and headlight pricing live in `index.html` under `#restoration`, kept as a
separate menu from the maintenance packages — upkeep and restoration are different
purchases and mixing them makes the cheap tier look expensive.
