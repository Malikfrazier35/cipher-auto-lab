# Cipher Auto Lab — cipherautolab.com

Static marketing site for a mobile auto detailing service covering New Haven County,
the Naugatuck Valley and central Connecticut. No framework, no build step, no dependencies.

## Layout

```
index.html      the whole site — markup and styles
privacy.html    privacy policy
terms.html      terms of service
legal.css       shared styling for the two legal pages
sitemap.xml     three URLs, submit this to Google Search Console
robots.txt      allows everything except /api/, points at the sitemap
config.js       your Stripe publishable key (external so the CSP can ban inline script)
app.js          booking flow logic (kept external for the same reason)
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
3. Add structured data (`LocalBusiness`, `Service`) for local SEO. `sitemap.xml` is done —
   submit it at Google Search Console -> Sitemaps.
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
3. In **`config.js`**, replace `pk_test_REPLACE_ME` with your **publishable** key.
   That key is safe in client code — the secret one never is.

   It lives in its own file, not inline in `index.html`, because the CSP sets
   `script-src 'self'` and silently blocks every inline `<script>` block. Put the
   key inline and it will never run — the browser console shows
   *"Refused to execute a script…"* and Stripe never initialises.
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

| Package | Price from | Deposit |
|---|---|---|
| Refresh | $149 | $25 |
| Interior Reset | $199 | $30 |
| Full Detail | $279 | $40 |
| Gloss Enhancement | $349 | $50 |
| Paint Correction | $749 | $100 |
| Show Finish | $1,299 | $150 |
| Headlight Restoration | $139 | $25 |

Headlights booked alongside anything else are $99 and handled as a flat add-on —
not multiplied by vehicle size, because an hour is an hour regardless of the car.

Change them in `DEPOSITS` in the API file. The copy in `app.js` is display only.

## Restoration menu

Correction and headlight pricing live in `index.html` under `#restoration`, kept as a
separate menu from the maintenance packages — upkeep and restoration are different
purchases and mixing them makes the cheap tier look expensive.


## Menu logic — why the two menus don't overlap

Three conflicts existed when the restoration menu was first added, all now resolved:

1. **Full Detail claimed a one-step machine polish**, which is exactly what Gloss
   Enhancement sells at $349 — so Full Detail undercut it by $70 while including more.
   Machine polishing is now removed from every maintenance package. **Maintenance cleans,
   restoration corrects.** That is the dividing line, and nothing crosses it.
2. **Ceramic sat in the maintenance menu at $749**, the same price as a two-step Paint
   Correction, while claiming to include multi-stage correction *and* a coating. Nobody
   would ever have bought from the restoration menu. Ceramic is gone from maintenance and
   now exists in exactly one place: correction + ceramic bundled at $1,249.
3. **The restoration cards booked the wrong thing.** They linked to a flow that only knew
   the three maintenance packages, so "Book Correction" silently created a Full Detail
   booking at a Full Detail deposit. Step 1 now carries both menus, and every pricing card
   deep-links to its own service.

The replacement third maintenance card is **Interior Reset ($199)** — interior-only, which
is a real and common request, and it keeps the ladder at three cards without inventing an
overlap.


## Rule: no inline script, ever

`vercel.json` sets `script-src 'self' https://js.stripe.com`. There is deliberately no
`'unsafe-inline'`, which is what makes the policy worth having — an injected `<script>`
cannot execute. The cost is that **your own** inline scripts cannot execute either.

So: any JavaScript belongs in a `.js` file served from this origin. Inline `<script>`
blocks and `onclick="..."` attributes will be silently blocked. If something stops
working after an edit, check the console for *"Refused to execute a script"* before
looking anywhere else.


---

# Legal pages

`privacy.html` and `terms.html`, both linked from the footer, both reachable at `/privacy`
and `/terms` because `cleanUrls` is on in `vercel.json`.

They describe **what the site actually does**, which is the only way a policy is worth
anything:

- No analytics, no ad pixels, no cookies set by us. The privacy page says so explicitly.
  If you ever add Google Analytics or a Meta pixel, that section becomes false — update it
  the same day.
- The only third parties named are Stripe and Vercel, because they are the only two.
- The deposit table in `terms.html` is copied from `DEPOSITS` in
  `api/create-payment-intent.js`. **Three places now state deposit amounts** — the API, the
  FAQ in `index.html`, and the terms table. Change one, change all three.
- Cancellation wording matches `app.js` exactly: full refund at 24h+ notice, on our
  reschedule, on a declined re-quote, or an unworkable site; forfeited only for a same-day
  cancellation or a no-show.

Neither page is legal advice and neither was written by a lawyer. They are honest and
specific, which covers most of what a small service business needs, but if you start
handling volume worth suing over, have an attorney read them.

## Sitemap

Three URLs. Update `lastmod` on a real content change, not for typos. Submit once at
Google Search Console; Google re-reads it on its own after that.

---

# Managing appointments

There is still no database and no calendar. What there now is: **you find out the moment a
deposit clears, and the customer gets a real confirmation.**

## How a booking reaches you

1. Customer signs the Service Agreement and pays the deposit.
2. Stripe charges the card and fires `payment_intent.succeeded`.
3. `api/stripe-webhook.js` verifies the signature, then sends two emails:
   - **to the customer** — confirmation, reference, what to do before you arrive,
     cancellation terms, and their signed copy of the agreement
   - **to you** — every booking field, a "Call the customer" button, a link to the
     payment in Stripe, and whether they consented to photos

The webhook fires from Stripe's servers, not the browser. If the customer pays and
immediately closes the tab, you still get the email. Anything wired to the front end
would have silently lost that booking.

## Also do this (two minutes, no code)

Install the **Stripe mobile app** and turn on payment notifications. It buzzes your phone
the second money lands. Free, and it does not depend on this webhook working.

## Setup

1. **Resend** — sign up at resend.com, add `cipherautolab.com`, add the DNS records it
   gives you, then create an API key. Put it in Vercel as `RESEND_API_KEY`.
   Without a verified domain, `FROM_EMAIL` must stay on `onboarding@resend.dev`.
2. **Stripe webhook** — Developers → Webhooks → Add endpoint:
   - URL: `https://cipherautolab.com/api/stripe-webhook`
   - Event: `payment_intent.succeeded` only
   - Copy the signing secret into Vercel as `STRIPE_WEBHOOK_SECRET`
3. Add `OWNER_EMAIL` and `FROM_EMAIL`. Redeploy.
4. Test with card `4242 4242 4242 4242`. Stripe's webhook page shows the delivery and the
   response — a 400 means the signing secret is wrong.

**Emails are best-effort.** If Resend fails the webhook still returns 200, because a 500
would make Stripe retry and the customer could get duplicate confirmations. The payment is
never at risk. Check the Vercel function logs if an email goes missing.

## What this still does NOT do

- **Nothing prevents double-booking.** Two people can pick the same Saturday morning.
  With one van and a handful of jobs a week you will notice; when you stop noticing, that
  is the signal to move to real availability (Square Appointments, or Supabase behind
  the flow).
- No reminder the day before. Send those by text for now.
- No calendar entry. Put it in your own calendar when the email arrives.

---

# The Service Agreement

`agreement.html` at `/agreement`, version **1.0**. This is the document that actually
protects you, and it is signed on every booking.

## How signing works

Step 5 of the booking flow shows a scrollable summary of the clauses that matter, a
checkbox, an optional photo-consent checkbox, and a field where the customer types their
full legal name.

Recorded on the PaymentIntent, and therefore permanent:

| Metadata key | What it proves |
|---|---|
| `agreement` | which version they signed |
| `signed_by` | the name they typed |
| `signed_at` | ISO timestamp from the browser |
| `signed_ip` | the IP the signature came from |
| `photo_consent` | `yes` / `no` — check before posting any photo |

**The server enforces it, not just the browser.** `api/create-payment-intent.js` refuses
to create a PaymentIntent without a signature containing at least two words. Disabling the
JavaScript check in devtools gets you a 400, not a booking.

## When you change the agreement

1. Edit `agreement.html`.
2. Bump `AGREEMENT_VERSION` at the top of `app.js`.
3. Update the summary text inside `.sigblock` in `index.html` so the short version still
   matches the long one.

Old bookings keep pointing at the version they signed, which is the whole point.

## Photo consent

Off by default. Before posting any customer vehicle, look up the booking in Stripe and
check `photo_consent`. The privacy policy promises this, so it has to be real.

---

# Social links

Two links, in the header and the footer of `index.html`:

- **Facebook** — currently `https://www.facebook.com/cipherautolab`. **Check this URL.**
  It is a guess, and a dead link in the header is worse than no link.
- **Google** — currently `https://g.page/cipher-auto-lab`. **Delete this line entirely
  until the listing is actually live**, then paste the real short link from your Google
  Business Profile.

Both are marked with an HTML comment in the footer so they are easy to find. There is no
Facebook Page plugin and no Meta pixel: embedding either would mean loosening the CSP and
adding Meta tracking to the site, which would make the privacy policy untrue.
