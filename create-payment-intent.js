// Vercel serverless function — creates the deposit PaymentIntent.
//
// SECURITY: the amount is derived HERE from the package key. Never trust a price
// sent by the browser, or anyone can open devtools and pay $1 to hold a slot.

const Stripe = require('stripe');

// Single source of truth for deposits. Keep in sync with DEPOSITS in app.js
// (the client copy is display-only; this one is what actually gets charged).
const DEPOSITS = {
  'refresh':      { cents: 2500, label: 'Refresh' },
  'interior':     { cents: 3000, label: 'Interior Reset' },
  'full-detail':  { cents: 4000, label: 'Full Detail' },
  'gloss':        { cents: 5000, label: 'Gloss Enhancement' },
  'correction':   { cents: 10000, label: 'Paint Correction' },
  'show':         { cents: 15000, label: 'Show Finish' },
  'headlights':   { cents: 2500, label: 'Headlight Restoration' },
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
      amount: pkg.cents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      description: `Cipher Auto Lab deposit — ${pkg.label} — ${clean(body.ref, 20)}`,
      receipt_email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean(body.email, 120))
        ? clean(body.email, 120) : undefined,
      // The Stripe dashboard becomes the booking record — no database needed.
      metadata: {
        reference:  clean(body.ref, 20),
        package:    pkg.label,
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

    return res.status(200).json({
      clientSecret: intent.client_secret,
      amount: pkg.cents,
      label: pkg.label,
    });
  } catch (err) {
    console.error('create-payment-intent failed:', err && err.message);
    return res.status(500).json({ error: 'Could not start the payment. Please call us.' });
  }
};
