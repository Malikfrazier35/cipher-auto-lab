// POST /api/gift-check   {code}
// Tells the booking form what is left on a gift card, so it can say whether the card covers the
// deposit. Display only: the booking itself checks the card again on the server.
import Stripe from 'stripe';
import { json } from './_booking.js';
import { cleanCode, findGift } from './_gift.js';

const ALLOWED_ORIGINS = ['https://cipherautolab.com', 'https://www.cipherautolab.com'];
const allowedOrigin = (o) => ALLOWED_ORIGINS.includes(o) || /^https:\/\/cipher-auto-lab[a-z0-9-]*\.vercel\.app$/.test(o);

// a slow brake on guessing codes (there are about 850 billion of them)
const hits = new Map();
function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < 600000);
  list.push(now); hits.set(ip, list);
  return list.length > 10;
}

export async function giftCheck(request, stripe) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
  if (!allowedOrigin(request.headers.get('origin') || '')) return json({ error: 'Forbidden' }, 403);
  if (!stripe) return json({ error: 'payments_off' }, 503);
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return json({ ok: false, error: 'Too many tries. Call or text (203) 560-3572 and we will check the card for you.' }, 429);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const code = cleanCode(body && body.code);
  if (!code) return json({ ok: false, error: 'Gift card codes look like GC-7KQ2-MX9P.' }, 400);
  try {
    const g = await findGift(stripe, code);
    if (!g) return json({ ok: false, error: "We couldn't find that gift card. Check the code, or call (203) 560-3572." }, 404);
    if (!g.balance) return json({ ok: false, code, balance: 0, error: 'That gift card has been used up.' }, 200);
    return json({ ok: true, code, balance: g.balance / 100 });
  } catch (e) {
    console.error('gift check failed', e && e.type, e && e.code);
    return json({ ok: false, error: "We couldn't check the card just now. Try again, or call (203) 560-3572." }, 502);
  }
}

let client = null;
export default {
  fetch(request) {
    if (!client && process.env.STRIPE_SECRET_KEY) client = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
    return giftCheck(request, client);
  },
};
