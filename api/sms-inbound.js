// POST /api/sms-inbound   (Twilio calls this when a customer texts the toll-free number)
// Customers are told to text or call (203) 560-3572, but some will reply to the confirmation anyway.
// This passes every reply to the owner's phone as a push (ntfy), with the customer's name and booking
// when the number matches one, and one tap to text them back from your own phone. Twilio itself
// answers STOP, START and HELP; nothing is texted back from here.
//
// In Twilio: Messaging Service > Integration > Incoming messages > "Send a webhook",
//   Request URL  https://cipherautolab.com/api/sms-inbound   (HTTP POST)
// Needs TWILIO_AUTH_TOKEN in Vercel (Sensitive): it is how this checks a request really came from
// Twilio (the X-Twilio-Signature header). Without it every request is refused.
import { createHmac, timingSafeEqual } from 'node:crypto';
import Stripe from 'stripe';
import { push } from './_notify.js';

export const deps = { fetch: (...a) => fetch(...a) };   // tests swap this
const TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const xml = (status = 200) => new Response(status === 200 ? TWIML : '', { status, headers: { 'Content-Type': 'text/xml', 'Cache-Control': 'no-store' } });

/** Twilio's signature: HMAC-SHA1 over the URL plus every POST field (sorted, name then value), base64. */
export function signature(token, url, params) {
  const data = url + [...params.keys()].sort().map((k) => k + params.get(k)).join('');
  return createHmac('sha1', token).update(data, 'utf8').digest('base64');
}
function same(a, b) {
  const x = Buffer.from(a || ''), y = Buffer.from(b || '');
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function inbound(request, env, stripe) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  if (!env.TWILIO_AUTH_TOKEN) return xml(503);
  const raw = await request.text();
  const params = new URLSearchParams(raw);
  const given = request.headers.get('x-twilio-signature') || '';
  const u = new URL(request.url);
  // the URL exactly as Twilio called it (with or without www)
  const urls = [request.url, `https://cipherautolab.com${u.pathname}${u.search}`, `https://www.cipherautolab.com${u.pathname}${u.search}`];
  if (!urls.some((x) => same(signature(env.TWILIO_AUTH_TOKEN, x, params), given))) return xml(403);
  if (params.get('AccountSid') !== env.TWILIO_ACCOUNT_SID) return xml(403);

  const from = String(params.get('From') || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const body = String(params.get('Body') || '').slice(0, 600);
  const keyword = body.trim().toUpperCase();

  // whose number is it? the most recent booking with that phone, if any (3 seconds at most)
  let who = '';
  if (stripe && /^\d{10}$/.test(from)) {
    who = await Promise.race([
      stripe.paymentIntents.search({ query: `metadata['phone']:'${from}'`, limit: 5 })
        .then((r) => { const md = (r.data || [])[0]?.metadata; return md ? `${md.customer_name || ''} · ${md.booking_ref || ''} · ${md.date || ''}`.replace(/^ · | · $/g, '') : ''; }),
      new Promise((ok) => setTimeout(() => ok(''), 3000)),
    ]).catch(() => '');
  }
  const pretty = /^\d{10}$/.test(from) ? `(${from.slice(0, 3)}) ${from.slice(3, 6)}-${from.slice(6)}` : (params.get('From') || 'unknown');
  const note = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(keyword) ? '\nThey opted out of booking texts. Twilio has already confirmed it to them.'
    : keyword === 'HELP' ? '\nTwilio sent them the HELP reply.' : '';
  await push(env.NTFY_TOPIC, {
    title: `Text to the booking line from ${who ? who.split(' · ')[0] : pretty}`,
    message: `${who ? who + '\n' : ''}${pretty}: "${body}"${note}`,
    priority: note ? 3 : 4,
    tags: note ? 'no_bell' : 'speech_balloon',
    actions: /^\d{10}$/.test(from) ? [{ action: 'view', label: 'Text back', url: `sms:+1${from}` }, { action: 'view', label: 'Call', url: `tel:+1${from}` }] : [],
  }, deps.fetch).catch((e) => console.warn('reply push failed', e && e.message));
  return xml(200);
}

let client = null;
export default {
  fetch(request) {
    if (!client && process.env.STRIPE_SECRET_KEY) client = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 1 });
    return inbound(request, process.env, client);
  },
};
