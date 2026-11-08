// GET /api/checkout-status?session_id=cs_...
// Used when a payment method sends the customer away and back (return_url), so the booking
// page can say whether the deposit went through. Display only: the booking itself is
// confirmed by the webhook (api/stripe-webhook.js), not by this page.
import Stripe from 'stripe';
import { json } from './_booking.js';

export async function checkoutStatus(request, stripe) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
  if (!stripe) return json({ error: 'payments_off' }, 503);
  const id = new URL(request.url).searchParams.get('session_id') || '';
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(id)) return json({ error: 'Bad request' }, 400);
  try {
    const s = await stripe.checkout.sessions.retrieve(id);
    return json({
      status: s.status,
      payment_status: s.payment_status,
      ref: s.client_reference_id || '',
      amount: typeof s.amount_total === 'number' ? s.amount_total / 100 : null,
    });
  } catch (e) {
    console.error('checkout status failed', e && e.type, e && e.code);
    return json({ error: 'Not found' }, 404);
  }
}

let client = null;
export default {
  fetch(request) {
    if (!client && process.env.STRIPE_SECRET_KEY) client = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
    return checkoutStatus(request, client);
  },
};
