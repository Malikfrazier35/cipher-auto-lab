// POST /api/create-gift-session
// Starts the purchase of a gift card on /gift: a Stripe Checkout Session (ui_mode "elements", the
// same Apple Pay / Google Pay / card form as the booking deposit). The amount comes from GIFTS, never
// from the browser. The code is made here and printed on the Stripe receipt, and it only works once
// the payment has gone through (api/_gift.js checks that).
import Stripe from 'stripe';
import { json } from './_booking.js';
import { GIFTS, newCode } from './_gift.js';
import { channel } from './_channels.js';

const ALLOWED_ORIGINS = ['https://cipherautolab.com', 'https://www.cipherautolab.com'];
const allowedOrigin = (o) => ALLOWED_ORIGINS.includes(o) || /^https:\/\/cipher-auto-lab[a-z0-9-]*\.vercel\.app$/.test(o);
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);

const hits = new Map();
function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < 600000);
  list.push(now); hits.set(ip, list);
  return list.length > 6;
}

export function parseGift(b) {
  if (!b || typeof b !== 'object') return { error: 'Missing gift details.' };
  const kind = GIFTS[b.gift] ? b.gift : '';
  if (!kind) return { error: 'Pick a gift card.' };
  const from = clean(b.fromName, 60), to = clean(b.toName, 60), email = clean(b.email, 120);
  if (from.length < 2) return { error: 'Add your name, so they know who it is from.' };
  if (to.length < 2) return { error: 'Add the name of the person it is for.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'Add your email: the receipt with the gift code goes there.' };
  return { gift: { kind, from, to, email, message: clean(b.message, 160), campaign: (channel(b.campaign) || {}).id || '' } };
}

export async function createGift(request, stripe, makeCode = newCode) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
  const origin = request.headers.get('origin') || '';
  if (!allowedOrigin(origin)) return json({ error: 'Forbidden' }, 403);
  if (!stripe) return json({ error: 'payments_off' }, 503);
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return json({ error: 'Too many tries in a short while. Call or text (203) 560-3572.' }, 429);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const { gift, error } = parseGift(body);
  if (error) return json({ error }, 400);

  const g = GIFTS[gift.kind], code = makeCode(), cents = g.amount * 100;
  const metadata = {
    kind: 'gift', gift_code: code, gift_kind: gift.kind, gift_amount: String(cents), gift_balance: String(cents),
    gift_to: gift.to, gift_from: gift.from, gift_message: gift.message, gift_status: 'active', campaign: gift.campaign,
  };
  try {
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'elements',
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: cents,
          product_data: {
            name: `Cipher Auto Lab ${g.name}: code ${code}`,
            description: `For ${gift.to}, from ${gift.from}. Use code ${code} when booking at cipherautolab.com. ` +
              `${g.note ? g.note + ' ' : ''}Never expires, no fees.`,
          },
        },
      }],
      customer_email: gift.email,
      customer_creation: 'always',
      client_reference_id: code,
      metadata,
      payment_intent_data: { description: `Gift card ${code} (${g.name}) for ${gift.to}`, metadata },
      excluded_payment_method_types: ['klarna', 'amazon_pay', 'pay_by_bank', 'afterpay_clearpay'],
      return_url: `${origin}/gift?paid=1&session_id={CHECKOUT_SESSION_ID}`,
    });
    return json({ clientSecret: session.client_secret, sessionId: session.id, amount: g.amount });
  } catch (e) {
    console.error('gift session failed', e && e.type, e && e.code, e && e.requestId);
    return json({ error: 'Card payments are having a moment. Call or text (203) 560-3572.' }, 502);
  }
}

let client = null;
export default {
  fetch(request) {
    if (!client && process.env.STRIPE_SECRET_KEY) client = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
    return createGift(request, client);
  },
};
