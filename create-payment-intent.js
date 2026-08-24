// Vercel serverless function — creates the deposit PaymentIntent.
//
// SECURITY: the amount is derived HERE from the package key. Never trust a price
// sent by the browser, or anyone can open devtools and pay $1 to hold a slot.

const Stripe = require('stripe');
const B = require('../lib/booking');

// Single source of truth for deposits. Keep in sync with SVC/PAINT in app.js
// (the client copy is display-only; this one is what actually gets charged).
//
// Deposits scale with the commitment, not with the vehicle tier — a sedan and a
// truck hold the same slot. Where a booking has both a base service and paint
// work, the LARGER of the two deposits applies, because the paint work is the
// part that costs real money to have nobody show up for.
const DEPOSITS = {
  'exterior': { cents: 2500, label: 'Exterior Detail' },
  'interior': { cents: 3000, label: 'Interior Detail' },
  'full':     { cents: 4000, label: 'Full Detail' },
};
const PAINT_DEPOSITS = {
  'gloss':       { cents: 5000,  label: 'Gloss Enhancement' },
  'correction':  { cents: 10000, label: 'Paint Correction' },
  'ceramic':     { cents: 10000, label: 'Ceramic Coating' },
  'corrceramic': { cents: 15000, label: 'Correction + Ceramic' },
  'show':        { cents: 15000, label: 'Show Finish' },
};
const TIERS = {
  sedan: 'Sedan / coupe', suv5: 'SUV · 5 seat',
  suv7:  'SUV · 7 seat',  truck: 'Truck / van',
};

const clean = (v, max = 200) =>
  String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: 'Payments are not configured yet.' });

  try {
    const stripe = Stripe(key);
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    const pkg = DEPOSITS[body.packageKey];
    if (!pkg) return res.status(400).json({ error: 'Unknown package.' });

    // Paint work is optional; an unrecognised key is treated as none rather than
    // as an error, so a stale browser tab can still book the base service.
    const paint = PAINT_DEPOSITS[body.paintKey] || null;
    const tier  = TIERS[body.tier] || '';

    // The larger of the two deposits is what gets charged.
    const cents = paint ? Math.max(pkg.cents, paint.cents) : pkg.cents;
    const label = paint ? `${pkg.label} + ${paint.label}` : pkg.label;

    // Basic sanity on the contact fields before we create anything in Stripe.
    const name  = clean(body.name, 80);
    const phone = clean(body.phone, 30);
    if (name.length < 2 || phone.replace(/\D/g, '').length !== 10) {
      return res.status(400).json({ error: 'Name and a 10-digit phone number are required.' });
    }

    // No signature, no PaymentIntent. Checking this here and not only in the browser is
    // the point — the client-side check is a convenience, this one is the actual gate.
    const signature = clean(body.signature, 80);
    if (signature.length < 3 || !/\s/.test(signature)) {
      return res.status(400).json({ error: 'The Service Agreement must be signed with your full name.' });
    }

    const intent = await stripe.paymentIntents.create({
      amount: cents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      description: `Cipher Auto Lab deposit — ${label} — ${clean(body.ref, 20)}`,
      receipt_email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean(body.email, 120))
        ? clean(body.email, 120) : undefined,
      // The Stripe dashboard becomes the booking record — no database needed.
      metadata: {
        reference:  clean(body.ref, 20),
        package:    pkg.label,
        paint_work: paint ? paint.label : 'none',
        tier:       tier || clean(body.size, 40),
        addons:     clean(body.addons, 200) || 'none',
        vehicle:    clean(body.vehicle, 120),
        size:       clean(body.size, 40),
        condition:  clean(body.condition, 60),
        parked:     clean(body.parked, 40),
        date:       clean(body.date, 40),
        window:     clean(body.window, 40),
        name,
        phone,
        email:      clean(body.email, 120),
        address:    clean(body.address, 160),
        town:       clean(body.town, 60),
        notes:      clean(body.notes, 400),
        est_total:  clean(body.estTotal, 20),

        // --- signed Service Agreement: the evidence that they agreed, and to what ---
        agreement:  'v' + clean(body.agreementVersion, 10),
        signed_by:  signature,
        signed_at:  clean(body.signedAt, 40) || new Date().toISOString(),
        signed_ip:  clean(
                      (req.headers['x-forwarded-for'] || '').split(',')[0] ||
                      (req.socket && req.socket.remoteAddress) || '', 45),
        photo_consent: clean(body.photoConsent, 3) === 'yes' ? 'yes' : 'no',
        terms:      'accepted: 24h refund, no-show forfeit, price change requires approval',
      },
    });

    // The Job Card link is derived from the reference, so it exists before the
    // payment does. Returning it here means the confirmation screen can show it
    // straight away rather than making the customer go and find the email.
    const SITE = process.env.SITE_ORIGIN || `https://${req.headers.host || 'cipherautolab.com'}`;
    return res.status(200).json({
      clientSecret: intent.client_secret,
      amount: cents,
      label,
      jobUrl: B.jobUrl(SITE, clean(body.ref, 20)),
    });
  } catch (err) {
    console.error('create-payment-intent failed:', err && err.message);
    return res.status(500).json({ error: 'Could not start the payment. Please call us.' });
  }
};
