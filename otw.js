// Vercel serverless function — "on my way".
//
// The owner opens a private link on his phone, taps once, and the customer's Job
// Card starts showing roughly how far away he is.
//
// PRIVACY, deliberately: coordinates arrive here, get turned into a single
// number of minutes, and are thrown away. They are never stored and never sent
// to the customer. The customer sees "about 15 minutes away" and nothing that
// could be used to follow anyone. That was a decision, not an omission — one
// person works alone in this business, and a live dot on a forwardable link is a
// different thing from an ETA.
//
// State lives in the PaymentIntent's metadata because that is already where the
// booking lives. It means no database and no second service to keep running, at
// the cost of a Stripe API write per update — which is fine at one van and a
// handful of updates per job.

const Stripe = require('stripe');
const B = require('../lib/booking');

const MIN_INTERVAL_MS = 20 * 1000;   // don't hammer Stripe on a shaky connection

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const ref = B.clean(body.ref, 24).toUpperCase();

  if (!process.env.JOB_LINK_SECRET) return res.status(503).json({ error: 'Not configured.' });
  // The owner token is a different derivation from the customer's, so a customer
  // holding their own valid job link cannot post their own arrival times.
  if (!ref || !B.checkToken(ref, 'own', body.k)) {
    return res.status(404).json({ error: 'Not a valid link.' });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(503).json({ error: 'Not configured.' });

  const status = ['driving', 'arrived', 'working', 'done', 'off'].includes(body.status)
    ? body.status : 'driving';

  try {
    const stripe = Stripe(key);
    const pi = await B.findBooking(stripe, ref);
    if (!pi) return res.status(404).json({ error: 'Booking not found.' });
    const m = pi.metadata || {};

    const last = Number(m.otw_at || 0);
    if (status === 'driving' && last && Date.now() - last < MIN_INTERVAL_MS) {
      return res.status(200).json({ ok: true, throttled: true, minutes: Number(m.otw_minutes) || null });
    }

    let minutes = null, miles = null;
    if (status === 'driving') {
      const lat = Number(body.lat), lon = Number(body.lon);
      const dest = B.TOWNS[m.town];
      // Reject anything outside Connecticut and its immediate borders: a bad GPS
      // fix or a spoofed payload should not produce a confident wrong ETA.
      const sane = Number.isFinite(lat) && Number.isFinite(lon)
        && lat > 40.5 && lat < 42.6 && lon > -74.5 && lon < -71.2;
      if (dest && sane) {
        const e = B.etaMinutes([lat, lon], dest);
        minutes = e.minutes; miles = e.miles;
      } else if (dest && Number.isFinite(Number(body.manualMinutes))) {
        minutes = Math.max(1, Math.min(240, Math.round(Number(body.manualMinutes))));
      }
    }

    const patch = {
      otw_status: status,
      otw_at: String(Date.now()),
      otw_minutes: minutes == null ? '' : String(minutes),
    };
    if (status === 'off') { patch.otw_status = ''; patch.otw_at = ''; patch.otw_minutes = ''; }

    await stripe.paymentIntents.update(pi.id, { metadata: patch });
    return res.status(200).json({ ok: true, status, minutes, miles });
  } catch (err) {
    console.error('otw failed:', err && err.message);
    return res.status(500).json({ error: 'Could not update. Try again, or just call them.' });
  }
};
