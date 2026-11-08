// POST /api/create-checkout-session
// Creates a Stripe Checkout Session (ui_mode "elements") for the booking deposit and returns
// its client secret. The page then shows Stripe's Payment Element inside the booking form.
// The deposit amount is decided here from the service, never taken from the browser.
//
// Needs STRIPE_SECRET_KEY in Vercel: a restricted Stripe key, stored as a Sensitive
// environment variable, never in this repo. Without it this answers 503 and the page falls back to
// "text us your booking", so the site keeps working before payments are switched on.
import Stripe from 'stripe';
import { parseBooking, depositFor, serviceLabel, bookingMetadata, json } from './_booking.js';

// A fixed label so these sessions can be told apart in the Stripe Dashboard.
const INTEGRATION_ID = 'cipher_booking_deposit_qhxwmtzr';

// A deposit should settle on the spot. Apple Pay and Google Pay (shown first on the page), card and
// Cash App Pay do; these either settle days later or split a $25-150 deposit into instalments.
const EXCLUDED_METHODS = ['klarna', 'amazon_pay', 'pay_by_bank'];

const ALLOWED_ORIGINS = ['https://cipherautolab.com', 'https://www.cipherautolab.com'];
const allowedOrigin = (o) =>
  ALLOWED_ORIGINS.includes(o) || /^https:\/\/cipher-auto-lab[a-z0-9-]*\.vercel\.app$/.test(o);

// Best-effort brake on card-testing bots (Stripe Radar does the real work).
const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter((t) => now - t < win);
  list.push(now);
  hits.set(ip, list);
  return list.length > 6;
}

export async function createCheckout(request, stripe) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
  const origin = request.headers.get('origin') || '';
  if (!allowedOrigin(origin)) return json({ error: 'Forbidden' }, 403);
  if (!stripe) return json({ error: 'payments_off' }, 503);

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return json({ error: 'Too many tries in a short while. Call or text (203) 560-3572.' }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  if (body && body.website) return json({ error: 'Bad request' }, 400); // honeypot
  const { booking, error } = parseBooking(body);
  if (error) return json({ error }, 400);

  const deposit = depositFor(booking);
  const metadata = bookingMetadata(booking);
  try {
    const session = await stripe.checkout.sessions.create(
      {
        ui_mode: 'elements',
        mode: 'payment',
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: deposit * 100,
            product_data: {
              name: `Booking deposit: ${serviceLabel(booking)}`,
              description: `Ref ${booking.ref}. Comes off your total. Refunded in full with 24 hours notice.`,
            },
          },
        }],
        customer_email: booking.email,
        customer_creation: 'always',
        client_reference_id: booking.ref,
        metadata,
        payment_intent_data: {
          description: `Deposit ${booking.ref}: ${serviceLabel(booking)}`,
          metadata,
        },
        excluded_payment_method_types: EXCLUDED_METHODS,
        // payment apps that leave the page come back to the flow they started in
        return_url: `${origin}/${booking.source === 'menu' ? 'menu' : 'quote'}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
        integration_identifier: INTEGRATION_ID,
      },
      { idempotencyKey: `deposit-${booking.ref}` },
    );
    return json({ clientSecret: session.client_secret, deposit });
  } catch (e) {
    console.error('checkout session failed', e && e.type, e && e.code, e && e.requestId);
    return json({ error: 'Card payments are having a moment. Call or text (203) 560-3572 and we will hold the slot.' }, 502);
  }
}

let client = null;
function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
  return client;
}

export default {
  fetch(request) {
    return createCheckout(request, stripeClient());
  },
};
