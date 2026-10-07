# Security

How cipherautolab.com is protected, what's still open, and what to do when something
goes wrong. Written for a one-person business, using the same playbook the large
security teams use — scaled down to what one owner can actually keep up with.

To report a vulnerability, email **hello@cipherautolab.com** (also published at
`/.well-known/security.txt`).

---

## The strategy, in seven rules

These are the ideas the best security programs share, translated for this site.

1. **Have less to attack.** The site is static HTML. The only code that runs in a
   visitor's browser is ours and Stripe's. Stripe's own guidance is that every
   third-party script makes your security depend on theirs, so nothing else gets added
   without a reason.
2. **Never touch card numbers.** Payments go through Stripe's Payment Element, which
   collects card data inside Stripe's own iframe. Card numbers never reach our code or
   our logs, which keeps the business on Stripe's lightest PCI paperwork. Stripe shows
   which questionnaire applies in the Dashboard under Settings → Compliance.
3. **Layers, not a wall.** Security headers, a Content Security Policy, CI guardrails
   and locked-down accounts each catch what the others miss.
4. **Watch before you enforce.** The strict Content Security Policy ships in
   report-only mode first — the same rollout large sites use — so it can't break the
   booking form on day one. Promote it once it runs clean (steps below).
5. **Protect the logins, not just the site.** Most small-business breaches start with a
   stolen password, not a clever exploit. Every account that can change the site,
   the money or the domain gets phishing-resistant two-factor.
6. **Make the safe way the default.** CI fails any commit that adds inline scripts,
   inline styles, inline event handlers or a Stripe secret key. Nobody has to remember.
7. **Assume something will go wrong.** Keep logs, keep one-click rollback, and have
   the first hour of an incident written down before you need it.

---

## Threat model

What realistically happens to a site like this, most likely first.

| # | Threat | What it looks like | Main defence |
|---|---|---|---|
| 1 | Account takeover | Phished Google, GitHub, Vercel, Stripe or registrar login | Passkeys or security keys on every account |
| 2 | Card testing | Bots run stolen cards through the booking deposit | Stripe Radar, rate limits, server-side pricing |
| 3 | Form and upload abuse | Spam quotes, huge or malicious uploads | Honeypot, rate limits, upload rules below |
| 4 | Poisoned script | A script the site loads gets swapped for a card skimmer | CSP allowlist, minimal third-party JS |
| 5 | Impersonation | Fake invoices "from" cipherautolab.com | SPF, DKIM and DMARC on the domain |
| 6 | Customer data exposure | Addresses, photos with GPS data, signatures leak | Private storage, EXIF stripping, retention limits |
| 7 | Domain hijack | Registrar account taken, DNS pointed elsewhere | Registrar lock, 2FA, DNSSEC |

---

## Already done in this repo

| Control | Where | What it stops |
|---|---|---|
| HTTPS forced for two years, subdomains included | `vercel.json` HSTS | Downgrade and interception on public Wi-Fi |
| No MIME sniffing | `X-Content-Type-Options` | Uploaded files being run as scripts |
| No framing, anywhere | `X-Frame-Options: DENY`, `frame-ancestors 'none'` | Clickjacking the booking form |
| Plugins, `<base>` hijacks blocked | Enforced CSP: `object-src 'none'; base-uri 'self'` | Two classic injection routes |
| Full script/style allowlist | Report-only CSP, Stripe's documented directives | Injected scripts and skimmers, once enforced |
| Device features off unless needed | `Permissions-Policy` | Hostile iframes using camera, mic, USB, sensors |
| Referrer trimmed | `Referrer-Policy` | Leaking page URLs to other sites |
| Popup isolation | `Cross-Origin-Opener-Policy: same-origin-allow-popups` | Cross-window attacks, while keeping Stripe popups working |
| Zero inline code | `tools/harden.py`, CI | Lets script-src and style-src run without `'unsafe-inline'` |
| Safe `?svc=` handling | `js/preselect.js` | A crafted link auto-clicking something other than a service |
| Docs never deployed | `.vercelignore` | README and this file being readable on the live site |
| Secret scanning | `.github/workflows/guardrails.yml` (gitleaks) | A Stripe key committed by accident |
| CSP regressions blocked | Same workflow | Someone re-adding inline code later |
| Least-privilege CI token | `permissions: contents: read` | A compromised action writing to the repo |
| Vulnerability contact | `/.well-known/security.txt` (RFC 9116) | Researchers having no way to tell you |

Cross-origin isolation (`COEP`) is deliberately **not** set: Stripe states it doesn't
support cross-origin isolated sites yet.

---

## To do outside the repo

Ordered by the NIST Cybersecurity Framework 2.0 functions. The top block is the part
that matters most.

### Protect — do these first

- [ ] **Passkeys or a hardware security key** on: the email account that receives
      password resets, GitHub, Vercel, Stripe, the domain registrar, Google Business
      Profile, Facebook. Text-message codes only where nothing better is offered.
- [ ] A password manager, with a unique password on every one of those accounts.
- [ ] **Registrar lock** (transfer lock) on cipherautolab.com, and DNSSEC if the
      registrar offers it.
- [ ] GitHub: repo **private**, branch protection on `main` (no force-push, no deletion).
- [ ] Stripe: **restricted API keys** scoped to only what the server needs; the full
      secret key never leaves Stripe's dashboard and Vercel's environment variables.
- [ ] Stripe Radar: block when CVC fails, and review rules for many cards from one IP.
- [ ] Email authentication for cipherautolab.com: SPF, DKIM, then DMARC starting at
      `p=none`, moving to `p=quarantine` once reports look clean.

### Detect

- [ ] Stripe email alerts for disputes, failed-payment spikes and new API keys.
- [ ] Vercel: turn on the Firewall, and add a rate-limit rule on the booking and quote
      API routes.
- [ ] Watch the browser console for `Content-Security-Policy-Report-Only` warnings
      while clicking through every page and the full booking flow. For ongoing
      reports, add a `report-to` endpoint (report-uri.com has a free tier).
- [ ] An uptime monitor on the homepage and `quote.html`.

### Respond and recover

- [ ] Know where Vercel's **Instant Rollback** button is before you need it.
- [ ] Export bookings from wherever they live, on a schedule. Stripe is already the
      record for payments.

---

## Rules for the code this repo doesn't contain

`app.js`, `photoquote.js` and whatever API they call handle money, photos and personal
details. They haven't been reviewed yet. Hold them to these rules:

**Payments**
- The server decides the price from the service key. Never accept an amount from the
  browser.
- Verify every webhook's Stripe signature with the endpoint's signing secret before
  acting on it, and reject anything that fails.
- Use idempotency keys when creating PaymentIntents so a double-click can't double-charge.

**Photo uploads**
- Cap file size and count; check file type by content, not by extension.
- **Strip EXIF data.** Phone photos carry GPS coordinates — a customer's driveway photo
  can reveal where they live.
- Store in private storage served through short-lived signed URLs, never a public
  bucket, and delete after a set period (90 days is reasonable) unless it became a job.

**Forms**
- Keep the honeypot; add rate limiting per IP; add Cloudflare Turnstile only if spam
  gets through.
- Validate every field on the server. The browser's checks are for convenience.

**Personal data**
- Don't write full addresses, phone numbers or signatures into logs.
- The service agreement records name, time and IP address — store it with the booking,
  access-controlled, and say so in the privacy policy.

---

## OWASP Top 10:2025 — where each risk lives here

| Risk | Applies to | Status |
|---|---|---|
| A01 Broken Access Control | Booking and upload API, stored photos | Server review needed |
| A02 Security Misconfiguration | Headers, hosting, storage buckets | Headers done; storage to check |
| A03 Software Supply Chain Failures | Stripe.js, GitHub Actions | CSP allowlist done; pin Actions to commit SHAs |
| A04 Cryptographic Failures | TLS, stored personal data | HSTS done; storage to check |
| A05 Injection | Anything rendered from user input | Pages clean; `app.js` to review |
| A06 Insecure Design | Pricing trusted from the client | Server rule above |
| A07 Authentication Failures | Owner accounts | Passkeys checklist above |
| A08 Software or Data Integrity Failures | Webhooks, deploy pipeline | Signature rule above; CI guardrails done |
| A09 Security Logging & Alerting Failures | Stripe, Vercel | Alerts checklist above |
| A10 Mishandling of Exceptional Conditions | Payment and upload errors | Fail closed: never confirm a booking a failed payment |

---

## Promoting the strict CSP

1. Deploy as-is. The strict policy is in `Content-Security-Policy-Report-Only`.
2. Open every page with DevTools → Console open. Book a test detail in Stripe test
   mode, submit a photo quote, open the agreement.
3. Each warning names a blocked source. If it's legitimate (say an upload host used by
   `photoquote.js`), add that origin to the right directive. If it's an inline style or
   script inside `app.js`, fix it there rather than loosening the policy.
4. When a full run shows no warnings, rename the header key in `vercel.json` from
   `Content-Security-Policy-Report-Only` to `Content-Security-Policy`, replacing the
   short baseline policy.

---

## First hour of an incident

1. **Stop the damage.** Roll back to the last good deployment in Vercel. If payments
   look wrong, pause the booking page.
2. **Take the keys back.** Change the password and sign out all sessions on the
   affected account. Roll the Stripe secret key and webhook secret, and update them in
   Vercel's environment variables.
3. **Look.** Stripe → Developers → Logs and Events; Vercel → Logs; GitHub → Security
   log. Write down what you find and when.
4. **Tell people who need to know.** Customers whose data was exposed, and Stripe if
   payments were involved. Connecticut has breach-notification rules for personal
   information — call an attorney before sending anything.
5. **Fix the cause**, then add whatever check would have caught it.

---

## Maintaining this

- `python3 tools/harden.py` converts any new inline styles into classes and moves inline
  scripts out. CI will tell you when it's needed.
- Review this file and `security.txt`'s `Expires` date every September.
