# Cipher Auto Lab — cipherautolab.com

Static marketing site for a mobile auto detailing service covering New Haven County,
the Naugatuck Valley and central Connecticut. No framework, no build step, no dependencies.

## Layout

```
index.html            the marketing site and the six-step booking form
app.js                booking flow — prices, add-ons, paint work, deposits
vehicles.js           makes, models, trims, model-year windows, service towns
photoquote.js         the photo quote funnel
config.js             your Stripe publishable key (external so the CSP can ban inline script)

fleet.html/.js        /fleet — the B2B contract page, its own page on purpose
job.html/.js          /job — the per-booking Job Card the customer gets a link to
otw.html/.js          /otw — owner only, "on my way"

agreement.html        the Service Agreement signed at booking
privacy.html          privacy policy
terms.html            terms of service
legal.css             shared styling for the legal pages

lib/booking.js        shared server code: tokens, towns, ETA, .ics, service contents
api/
  create-payment-intent.js   derives the deposit server-side, never trusts the browser
  stripe-webhook.js          fires on payment success, sends both emails
  photo-quote.js             the funnel — emails photos, stores nothing
  job.js                     the Job Card payload, the weather watch, the .ics
  job-change.js              reschedule and cancellation requests
  otw.js                     turns coordinates into one number of minutes
  fleet.js                   fleet enquiry, with the capacity check

img/                  job photos, WebP
sitemap.xml           five URLs, submit this to Google Search Console
robots.txt            allows everything except /api/, /job and /otw
vercel.json           security headers, CSP, cache policy
```

## Local preview

```bash
python3 -m http.server 8000    # then open http://localhost:8000
```

Open `index.html` directly and it still works, except `app.js` may be blocked by
`file://` CSP rules in some browsers. Use the server.

## The booking flow

Six steps in `app.js`, sequenced so the expensive work sits deep rather than by the door.
The reasoning is written up in "The Floor Plan"; the short version is that step one is
three choices and nothing else, so the first price a stranger sees is $109 and not $1,299.

1. **Service** — Exterior / Interior / Full. "From" prices only, plus the bundle arithmetic.
2. **Vehicle** — make, model, trim, year, then the four size tiers. **The price becomes
   exact here and never moves again.**
3. **Add to it** — ten add-ons filtered to the chosen service, then the paint room below a
   visual break: Gloss, Correction, Ceramic, Correction + Ceramic, Show Finish.
4. **When and where** — date, arrival window, town, street address.
5. **Confirm** — name and phone, itemised summary, Service Agreement, typed signature.
6. **Deposit** — Stripe Payment Element, amount derived server-side.

Three behaviours worth knowing about, all in `app.js`:

- `bundled()` / `DECON_BUNDLE` — ticking iron decon **and** clay collapses $138 to $119.
- `overlap()` — paint work already includes a wash and decon, so booking it alongside an
  exterior service credits the exterior price back rather than billing it twice.
- `syncSwap()` — Interior + paint work costs more than Full + the same paint work. The
  form notices and offers the cheaper one with a button.

### Pricing

Four tiers, because interior labour scales with seats and exterior labour scales with
panel area — different curves.

| Vehicle | Exterior | Interior | Full | Deposit |
|---|---|---|---|---|
| Sedan / coupe | $109 | $169 | $259 | $25 / $30 / $40 |
| SUV, 5 seat | $125 | $185 | $279 | $25 / $30 / $40 |
| SUV, 7 seat | $135 | $205 | $305 | $25 / $30 / $40 |
| Truck / van | $139 | $219 | $325 | $25 / $30 / $40 |

Paint work runs $349 (Gloss, sedan) to $1,549 (Correction + Ceramic, truck) on the same
four tiers, with deposits of $50–150. Where a booking has both, the **larger** deposit
applies — that rule is enforced in `api/create-payment-intent.js`, not in the browser.

**Four files carry prices and all four must agree:** the `SVC` and `PAINT` tables at the
top of `app.js`, the tier table and add-on menu in `index.html`, the deposit tables in
`api/create-payment-intent.js`, and the deposit table in `terms.html`. If they drift,
somebody gets charged something they were never shown.

### Deposit policy as implemented

Refunded in full for: 24h+ notice, any reschedule by us including weather, a declined
re-quote, or an unworkable site. Forfeited only for same-day cancellation or a no-show.
The deposit is credited against the total, not charged on top.

## The photo quote funnel

`#photoquote` in `index.html`, `photoquote.js`, `api/photo-quote.js`. It exists because
the booking form is the bottom of the funnel — it only catches people ready to commit
today. This catches everyone else.

The customer sends up to six photos plus name, phone and town. **Photos are downscaled in
the browser** (1600px long edge, JPEG q0.72) before being sent, for two reasons: a Vercel
function rejects a body over 4.5 MB, and a modern phone photo is 3–6 MB each. Four
unresized photos would fail every single time.

`api/photo-quote.js` emails the lead to `OWNER_EMAIL` with the photos as attachments and
**stores nothing** — no upload folder, no bucket, no database. Limits, all enforced
server-side:

- six photos max, 1.6 MB each, 4 MB total
- JPEG / PNG / WebP only, **checked against the file's magic bytes**, not its declared
  MIME type, which the browser controls. An SVG labelled `data:image/jpeg` is rejected.
- four submissions per IP per ten minutes, best-effort and per-instance
- a honeypot field, plus required-field validation repeated on the server

**If `RESEND_API_KEY` is missing this endpoint returns an error, unlike the booking flow.**
That is deliberate: a booking survives a missing mail key because Stripe notifies you
separately, but a lead has no second channel. Better a visible failure that tells the
customer to text than a green tick over a lead that went nowhere.

## Security posture## Security posture

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

### From a fresh clone

```bash
gh repo create cipher-auto-lab --private --source=. --push
# or: git remote add origin git@github.com:<you>/cipher-auto-lab.git && git push -u origin main
```

Then import the repo at vercel.com. No build command, no output directory — it is a
static site with serverless functions in `/api`, and Vercel picks that up on its own.
Pushes to `main` deploy automatically after that. Manual deploy: `npx vercel --prod`.

### The six environment variables

Nothing takes a payment or sends an email until these are set in
**Vercel → Settings → Environment Variables**. `.env.example` documents each one.

| | What breaks without it |
|---|---|
| `STRIPE_SECRET_KEY` | No deposits. The booking form says so plainly instead of failing silently. |
| `STRIPE_WEBHOOK_SECRET` | Payments work, but no confirmation emails — the webhook refuses every unsigned request, by design. |
| `RESEND_API_KEY` | No email at all. **The photo quote and fleet forms return an error rather than a false success** — a booking survives this because Stripe notifies you separately, a lead does not. |
| `OWNER_EMAIL` | Leads go to the default address. |
| `FROM_EMAIL` | Must be on a domain verified in Resend or sending fails. |
| `JOB_LINK_SECRET` | No Job Card and no "on my way" — both refuse rather than fall back to a guessable URL. Any long random string: `openssl rand -hex 32`. |

Then put your Stripe **publishable** key into `config.js` — it currently holds
`pk_test_REPLACE_ME`, and the deposit step tells the customer to call instead until
you change it.

### Tests

There is no test runner wired up; the suites were driven directly during development
and live outside the repo. What they cover, if you ever want them back: the price grid
at every tier, the photo-quote size and type limits, the HMAC token separation, the
weather thresholds, the `.ics` timezone maths, and every published fleet cell clearing
$60/hour.

## Known placeholders

- `hello@cipherautolab.com` — swap for the real inbox, and set `OWNER_EMAIL` to match
- Facebook and Google review URLs in the footer are placeholders
- `config.js` still holds `pk_test_REPLACE_ME` — Stripe is not live
- Ceramic prices for the two middle tiers are interpolated from the sedan and truck ends
- Photo gallery has room for more matched before/after pairs

## Next steps worth doing

1. **Put the five environment variables into Vercel.** `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `OWNER_EMAIL`, `FROM_EMAIL`. Until
   `RESEND_API_KEY` is set the photo quote form returns an error by design — see above.
2. Publishable key into `config.js` to switch deposits on.
3. Add structured data (`LocalBusiness`, `Service`, `Offer`) for local SEO. `sitemap.xml`
   is done — submit it at Google Search Console → Sitemaps.
4. Google Business Profile — still the highest-value marketing action outstanding.
5. A "text me instead" path off the photo quote for anyone whose HEIC won't convert.

---

# The Job Card — per-booking tracking

`job.html` + `job.js` (customer), `otw.html` + `otw.js` (owner),
`api/job.js`, `api/otw.js`, `lib/booking.js`.

One booking, one link. It answers the question a mobile customer actually has,
which for a weather-dependent business is **"is this still happening?"** far more
often than "where is he right now?".

## What the customer sees

- What they booked, itemised, with the deposit and the balance
- **The National Weather Service forecast for their town and their exact time
  window**, with a verdict: clear, worth watching, or could move this
- A countdown, and on the day, roughly how far away we are
- The prep checklist and how to change the booking

## The weather watch

`api.weather.gov` — US government data, public domain, no key, no commercial
restriction. **Open-Meteo was the obvious alternative and its free tier is
explicitly non-commercial**, which rules it out for a business site; its paid
plans start where the commercial licence begins.

Two hops: `/points/{lat},{lon}` gives the gridpoint URLs, then the hourly
forecast. Responses are cached per URL for 20 minutes, which is what the API asks
for — it explicitly requests honest HTTP caching over cache-busting, and asks for
a `User-Agent` with a contact address.

Town coordinates are in `lib/booking.js`, averaged from each town's standard ZIP
codes. Precise enough for two reasons: an NWS forecast cell is about 2.5 km, and
the ETA is rounded to five minutes. **The street address is never geocoded** — it
should not leave our systems to answer "is it going to rain".

Thresholds are set around what actually stops work, not what looks dramatic:

| Trigger | Verdict | Why |
|---|---|---|
| ≥55% rain in the window | risk | Nothing can be sealed or coated |
| 30–54% rain | watch | Still on unless we say otherwise |
| Max temp < 40°F | watch | Sealants and coatings will not cure |
| Wind ≥ 22 mph | watch | Grit lands back on wet paint |

Only hours **inside the booked window** are considered — a 4pm thunderstorm does
not spook an 8–11am booking. Beyond seven days the page says the forecast is not
worth trusting yet rather than showing a confident blank.

## Distance and ETA, not a live map

A deliberate choice. The owner works alone; a live dot on a link that can be
forwarded is a different thing from an ETA.

Coordinates reach `api/otw.js`, are turned into one number of minutes, and are
**discarded**. They are never stored and never sent to the customer. The customer
sees "about 15 minutes away" and nothing that could be used to follow anyone.

The ETA model scales speed with distance — a flat average was wrong at both ends,
making a four-mile hop look slow and putting Shelton to Hartford at 89 minutes
against a real hour. Short trips are junctions and lights; long ones pick up
Route 8 and I-84. It is not traffic-aware and the page says so.

## Security

There is no database. A booking is a Stripe PaymentIntent, found by reference
through Stripe's search API.

A reference alone is short enough to guess at, and the record behind it holds a
name, a town and a phone number. So every request carries an HMAC of the
reference, derived from `JOB_LINK_SECRET`:

- **customer token** — `HMAC('job:' + ref)`, 16 hex, opens the Job Card
- **owner token** — `HMAC('own:' + ref)`, 20 hex, the only thing that can post an
  arrival time

They are different derivations, so a customer holding their own valid link cannot
post arrival times for their own job. Comparison is constant-time. **With
`JOB_LINK_SECRET` unset, neither link exists and both endpoints refuse** — there
is no fallback to serving on the reference alone. Nothing is stored, so there is
nothing to leak: the tokens are recomputed on every request.

The API returns only what the page needs. **The street address and the customer's
phone number are never in the payload**, and only a first name is.

`/job` and `/otw` carry `noindex` and are disallowed in `robots.txt`.

## On-the-day state

`otw_status`, `otw_minutes` and `otw_at` are written to the PaymentIntent's
metadata, because that is already where the booking lives. No database and no
second service to keep running, at the cost of one Stripe write per update —
fine at one van. Updates are throttled to one per 20 seconds server-side and one
per 55 seconds in the browser. Anything older than two hours is treated as stale
and not shown.

`Permissions-Policy` previously read `geolocation=()`, which blocked the browser
geolocation API outright and would have made the owner page silently useless. It
is now `geolocation=(self)`.

## What makes it feel finished

Small things, but they are the difference between a status page and something a
customer is glad to have been sent.

- **Add to calendar.** `/api/job?...&format=ics` behind the same token. Stable
  `UID` plus `SEQUENCE`, so re-downloading after a change updates the existing
  entry instead of leaving two conflicting ones. Two alarms: the evening before
  (empty the car) and two hours out. Served `inline`, not `attachment` — an
  attachment lands in Files on iOS and costs a second tap before Calendar ever
  sees it, while no desktop browser can render `text/calendar` so they all
  download it anyway. Lines are folded to 75 octets per RFC 5545; an unfolded
  line is what makes Outlook silently drop a field.
- **DST is handled properly.** The offset comes from the ICU database via
  `Intl.DateTimeFormat`, not a constant — `-240` in August and `-300` in January
  is exactly the sort of thing that books someone an hour out twice a year.
- **Share the link.** `navigator.share` where it exists, clipboard otherwise. The
  person who booked is often not the person who will be home. A dismissed share
  sheet throws `AbortError`, which is not a failure and is not reported as one.
- **Reschedule and cancel in the page**, via `api/job-change.js`. It records a
  request and emails the owner; it does **not** move the booking. A one-van
  business cannot let a form take a slot, and a page that says "rescheduled"
  when nobody has looked at the calendar is worse than a phone call.
- **The deposit consequence is shown before the button, never after it.** Inside
  24 hours the cancel sheet turns into a warning box that says the deposit is
  forfeited and why. `hoursUntil` is computed server-side against Connecticut
  wall-clock time, so a device with the wrong timezone cannot talk someone into
  the wrong answer.
- **A progress rail** — booked, we confirm, on the way, here, finished — derived
  from the date and the status rather than stored, so it stays right even when an
  update never arrives.
- **Skeleton loading** shaped like what arrives. **Live countdown** that reticks
  every minute on the day. **`aria-live`** on the ETA. **Copy the reference** with
  one tap. **Focus returns** to the trigger when a sheet closes, and Escape shuts
  it.
- **What's included**, expandable, drawn from the same list the site publishes —
  so someone checking a week later sees exactly what they were sold.

## Where the links come from

- `api/create-payment-intent.js` returns `jobUrl`, so the confirmation screen can
  show it the moment the card clears rather than making the customer find an email
- `api/stripe-webhook.js` puts the customer link in the confirmation email and the
  owner link in the booking email, marked do-not-forward


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

Two tables. `DEPOSITS` covers the base service, `PAINT_DEPOSITS` covers the paint work,
and where a booking has both, **the larger applies** — never the sum.

| Base service | Price from | Deposit |
|---|---|---|
| Exterior Detail | $109 | $25 |
| Interior Detail | $169 | $30 |
| Full Detail | $259 | $40 |

| Paint work | Price from | Deposit |
|---|---|---|
| Gloss Enhancement | $349 | $50 |
| Paint Correction | $749 | $100 |
| Ceramic Coating | $949 | $100 |
| Correction + Ceramic | $1,249 | $150 |
| Show Finish | $1,299 | $150 |

Deposits do **not** vary with vehicle tier — a sedan and a truck hold the same slot for
the same number of hours of your day. Add-ons carry no deposit of their own.

The client copy in `app.js` is display only. This file is what actually gets charged, and
it derives the amount from the service keys — never from a price the browser sends.

## Restoration menu

Correction and coating pricing live in `index.html` under `#restoration`, kept as a
separate menu from the detailing packages — upkeep and restoration are different
purchases and mixing them makes the cheap tier look expensive. Each card deep-links
straight into **step 3** with that paint option pre-selected: deep by default, direct by
request. Someone who arrived wanting a correction is not made to shop for one.


## Menu logic — why the two menus don't overlap

Conflicts that existed at various points, all now resolved:

1. **Full Detail claimed a one-step machine polish**, which is exactly what Gloss
   Enhancement sells at $349 — so Full Detail undercut it while including more.
   Machine polishing is removed from every detailing package. **Detailing cleans,
   restoration corrects.** That is the dividing line and nothing crosses it.
2. **Ceramic was sold in one form only**, bundled with correction at $1,249, which left
   a competitor's $999 coating looking like the same product for less. It is now sold in
   two clearly different forms — Ceramic Coating at $949 over a single-stage polish, and
   Correction + Ceramic at $1,249 over a full two-stage — with what's underneath stated
   on the card. That turns the price gap into the thing we're best at.
3. **The restoration cards booked the wrong thing.** They linked to a flow that only knew
   the detailing packages, so "Book Correction" silently created a Full Detail booking at
   a Full Detail deposit. Paint work is now its own axis of the booking, with its own
   deposit, and every pricing card deep-links to its own option.
4. **Everything was bundled into the base price**, so a customer whose carpets were fine
   paid to shampoo somebody else's. Extraction, leather, decon, clay, sealant and engine
   bay are now priced add-ons at `#addons`, each with a duration.


## Rule: no inline script, ever

`vercel.json` sets `script-src 'self' https://js.stripe.com`. There is deliberately no
`'unsafe-inline'`, which is what makes the policy worth having — an injected `<script>`
cannot execute. The cost is that **your own** inline scripts cannot execute either.

So: any JavaScript belongs in a `.js` file served from this origin. Inline `<script>`
blocks and `onclick="..."` attributes will be silently blocked. If something stops
working after an edit, check the console for *"Refused to execute a script"* before
looking anywhere else.


---

# Fleet maintenance

`fleet.html` + `fleet.js` (its own page at `/fleet`, not a section of the homepage),
`api/fleet.js`.

## Why it is a separate page

Consumer detailing is an event: sold once, priced high, marketed on transformation.
Fleet work is a subscription: sold on predictability, priced per vehicle per month,
and bought by an office manager who does not care about paint. Those are different
products with different buyers, and putting the B2B pitch on a consumer homepage
weakens both. `/fleet` is also something to send a prospect directly.

The consumer booking flow is not reused. It asks about **one** car, takes a
deposit, and ends in a signed agreement — none of which fits a contract.

## The positioning trap, which is the important part

There are two markets and the naming confuses them:

| | Per unit | What it is |
|---|---|---|
| Fleet **washing**, crew + pressure rig | $18–25 | 30 trucks at a depot after hours, ~10 min each, nobody opens a door |
| Fleet **washing**, mobile detailer | $35–60 | Exterior only, interiors quoted as an extra |
| **This** | $28–76 | Hand work, one van, **cab included on the schedule** |

A one-van operator cannot win at $22/unit and should not try. So the offer is
built on the gap: **every operator sells exterior and treats interiors as an
occasional extra.** A trade van's cab is the part that gets genuinely bad, the
part a pressure washer physically cannot reach, and the part a customer sits in.
It is also the part that is pure labour, which is what a solo detailer has.

The page states the comparison outright and tells a genuine fleet-washing
prospect to go and buy fleet washing.

## Pricing

Two contracts — Fleet Exterior and Fleet Full — across three frequencies and
three bands of **vehicles at one site on one visit**.

The discount tracks vehicles-per-visit, not vehicles-owned. That is the honest
version: what volume saves is the drive and the ~35 minutes of setup, not the
labour, so that is what gets passed on. Somebody with 30 vans across four yards
is four visits, and the page says so.

| Fleet Full | Weekly | Biweekly | Monthly |
|---|---|---|---|
| 2–4 | $52 | $62 | $76 |
| 5–9 | $48 | $57 | $70 |
| 10+ | $44 | $53 | $65 |

| Fleet Exterior | Weekly | Biweekly | Monthly |
|---|---|---|---|
| 2–4 | $34 | $39 | $46 |
| 5–9 | $31 | $36 | $42 |
| 10+ | $30 | $33 | $38 |

Cargo vans and pickups +$10. **Minimum $180 per visit** — roughly 2.5 hours at
the consumer rate, which is what stops a two-van weekly stop from being a losing
trip. More frequent means less work per vehicle, which is why weekly is cheaper
per visit and not a discount.

**The grid lives in three files and all three must agree:** `GRID` in `fleet.js`
(the table and the live estimate), `GRID` in `api/fleet.js` (the figure that
reaches the owner's inbox), and the tables above. The test suite asserts the page
and the endpoint produce the same number.

## The capacity check

Recurring revenue is not automatically good. A fleet contract is a **commitment of
capacity**, and an hour sold to a fleet is an hour not sold to a $325 Full Detail.

So `api/fleet.js` does not just forward the enquiry — it works out what the job
pays per hour including travel and setup, and says plainly whether it clears the
$63/hr floor established for the consumer menu. If it does not, the email says
*renegotiate or walk* rather than leaving it to be discovered in month three.

A test asserts that **every published cell** clears $60/hr on realistic timings.
If a price is ever edited down, that test fails.

## The differentiator

A photographed condition report per vehicle, every visit. A fleet manager's real
problem is not dirty vans, it is not knowing which one picked up a dent. We are
already stood at every vehicle with a phone. It costs nothing and it is the thing
that gets a contract renewed.

## What the page refuses

Stated on the page, not discovered later: depots of 25+ heavy trucks, dealership
lot prep at lot-prep prices, sites with nowhere for water to go, and biohazard.
Turning down the wrong contract is cheaper than failing it.


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

---

# Vehicle and town pickers

`vehicles.js` holds two static lists loaded before `app.js`:

- **`window.VEHICLES`** — 49 makes, each with its common models. `window.EXOTICS` holds
  11 marques (Ferrari, Lamborghini, McLaren, Pagani, Koenigsegg, Bugatti, Rolls-Royce,
  Bentley, Aston Martin, Lotus, Ford GT/Shelby) and is merged in alphabetically at load. Year / Make / Model are
  three dependent selects; picking a make fills the model list. Choosing **Other** as the
  make, or **"Not listed — type it"** as the model, reveals a free-text box. Whatever gets
  chosen is written into the hidden `#bv` field, so everything downstream — the summary,
  the SMS fallback, the Stripe metadata — is unchanged.
- **`window.TOWNS`** — the same 34 towns as the Service Area section, grouped by region,
  plus a "My town is not listed" option that shows the phone number instead of silently
  accepting an out-of-area booking. `validStep4` rejects that value, so it cannot be
  submitted.

**Static on purpose.** No API call, no key, no rate limit, no third party in the CSP, and
nothing about the customer sent anywhere. Missing a model? Add it to the list — the
"Other" path means nobody is ever blocked in the meantime.

Keep `window.TOWNS` and the Service Area chips in `index.html` in step. If you start
covering a new town, it goes in both places.

## Why not Google Places autocomplete

It would need `maps.googleapis.com` back in the CSP, a Google Cloud billing account, and
a change to the privacy policy — which currently says Stripe and Vercel are the only third
parties, and is worth keeping true.

The town dropdown also does something Places cannot: it enforces the service area. Places
would happily autocomplete an address in Stamford.

If you do want it later, the honest cost is: billing account, one more script origin, one
more `connect-src` entry, and a new bullet in the privacy policy under "Who else sees it".


## Trim

`window.TRIMS` covers 21 makes. The Trim select only appears once a make **and** model are
chosen, and only for makes where the answer actually changes the work — exposed carbon,
Alcantara, ceramic brakes, factory PPF, wide-body aero. A Camry owner never sees the field,
because a Camry trim tells you nothing about detailing it.

Picking **"Something else"** opens the free-text box, and the typed value is appended to
the vehicle string. Switching to a make without trims clears and hides the field, so a
stale trim can never ride along on the wrong car.

Adding a make to `TRIMS` is all it takes to turn the field on for it.


## Year narrowing

Field order is **Make → Model → Trim → Year**, because the year list depends on the rest.

`window.MODEL_YEARS` holds production windows for 325 models and `window.TRIM_YEARS` for
47 trims. Both are keyed by make first, so McLaren's "GT" and Ford's "GT" never collide.
Every value is an **array of windows** — `[[1995,2001],[2023,null]]` — because the Integra,
the Bronco, the Camaro and the Demon all came, went and came back. `null` means still sold.

- The model window sets the year list; the trim window narrows it further.
- A trim narrows even when the model has no window of its own — a Corvette runs every year,
  a Corvette Z06 does not.
- If a trim window and a model window somehow don't overlap, **the model wins**. The list
  is never allowed to come out empty.
- Anything with no entry shows the full range, so a missing model is harmless.
- Selecting a year then narrowing past it clears the year rather than keeping a wrong one.
- Changing model clears the trim, so an STO can't follow you onto a Urus.

The note under the field describes the real windows, gaps included — *"Integra — sold
1995–2001 and 2023 to now"*. A plain min-to-max label would quietly claim it was sold
every year in between.

**Where a date was uncertain the window was widened, not narrowed.** Offering a year that
never existed is a shrug; blocking the year someone actually owns is a lost booking. If a
customer ever tells you their year is missing, fix that model's entry — it's one line.
