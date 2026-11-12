// POST /api/merch-waitlist
// The Cipher Merch waitlist (merch.html). Each sign-up is kept in Stripe as a customer tagged
// merch_waitlist = yes, with the items and size they want, so the list lives with the rest of
// the customers: Stripe > Customers, search  metadata["merch_waitlist"]:"yes"  , export to CSV.
// Someone who has already booked a detail is the same customer: the tag is added to them.
//
// Uses the same STRIPE_SECRET_KEY as the deposit (a restricted key with Customers write).
import Stripe from 'stripe';
import { json } from './_booking.js';

export const ITEMS = {
  'tee-black': 'Staple tee, black',
  'tee-lime': 'Staple tee, lime',
  'hoodie-salt': 'Salt Season 26/27 hoodie',
};
export const SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];

const ALLOWED_ORIGINS = ['https://cipherautolab.com', 'https://www.cipherautolab.com'];
const allowedOrigin = (o) =>
  ALLOWED_ORIGINS.includes(o) || /^https:\/\/cipher-auto-lab[a-z0-9-]*\.vercel\.app$/.test(o);

const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter((t) => now - t < win);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);

/** Validate a sign-up. Returns { entry } or { error }. */
export function parseSignup(b) {
  if (!b || typeof b !== 'object') return { error: 'Missing details.' };
  const items = [...new Set(String(b.items || '').split(',').map((s) => s.trim()))].filter((k) => ITEMS[k]);
  if (!items.length) return { error: 'Pick at least one item.' };
  const size = SIZES.includes(b.size) ? b.size : '';
  if (!size) return { error: 'Pick a size.' };
  const email = clean(b.email, 120).toLowerCase();
  if (email && !/^[^\s@'"\\]+@[^\s@'"\\]+\.[^\s@'"\\]{2,}$/.test(email)) return { error: 'That email doesn\u2019t look right.' };
  let phone = String(b.phone || '').replace(/\D/g, '');
  if (phone.length === 11 && phone[0] === '1') phone = phone.slice(1);
  if (phone && phone.length !== 10) return { error: 'Enter a 10-digit mobile number.' };
  if (!email && !phone) return { error: 'Add an email or a mobile number so we can tell you.' };
  const source = /^[a-z0-9-]{1,32}$/.test(String(b.source || '')) ? String(b.source) : 'merch-page';
  return { entry: { name: clean(b.name, 80), email, phone, items, size, source } };
}

export async function joinWaitlist(request, stripe) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
  if (!allowedOrigin(request.headers.get('origin') || '')) return json({ error: 'Forbidden' }, 403);
  if (!stripe) return json({ error: 'list_off' }, 503);

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return json({ error: 'Too many tries in a short while. Try again in a few minutes.' }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const { entry, error } = parseSignup(body);
  if (error) return json({ error }, 400);

  const metadata = {
    merch_waitlist: 'yes',
    merch_items: entry.items.join(','),
    merch_size: entry.size,
    merch_joined: new Date().toISOString().slice(0, 10),
    merch_source: entry.source,
  };
  try {
    // one person, one customer: find them by email, else by phone
    const query = entry.email ? `email:'${entry.email}'` : `phone:'+1${entry.phone}'`;
    const found = await stripe.customers.search({ query, limit: 1 });
    const existing = found && found.data && found.data[0];
    if (existing) {
      // joining again adds to what they asked for before
      const before = ((existing.metadata || {}).merch_items || '').split(',').filter((k) => ITEMS[k]);
      metadata.merch_items = [...new Set(before.concat(entry.items))].join(',');
      if ((existing.metadata || {}).merch_joined) metadata.merch_joined = existing.metadata.merch_joined;
      await stripe.customers.update(existing.id, {
        metadata,
        ...(entry.name && !existing.name ? { name: entry.name } : {}),
        ...(entry.phone && !existing.phone ? { phone: '+1' + entry.phone } : {}),
      });
    } else {
      await stripe.customers.create({
        email: entry.email || undefined,
        phone: entry.phone ? '+1' + entry.phone : undefined,
        name: entry.name || undefined,
        description: 'Merch waitlist',
        metadata,
      }, { idempotencyKey: `merch-${entry.email || entry.phone}-${metadata.merch_items}-${entry.size}` });
    }
    return json({ ok: true });
  } catch (e) {
    console.error('merch waitlist failed', e && e.type, e && e.code);
    return json({ error: 'The list is having a moment. Text MERCH to (203) 560-3572 instead.' }, 502);
  }
}

let client = null;
export default {
  fetch(request) {
    if (!client && process.env.STRIPE_SECRET_KEY) client = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
    return joinWaitlist(request, client);
  },
};
