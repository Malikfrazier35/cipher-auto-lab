// Gift cards, kept in Stripe: each one is the payment that bought it, with its code and what is
// left on it in that payment's details (metadata). No other database.
// Connecticut: gift cards sold here never expire and carry no fees, and a balance under $5 is paid
// back in cash on request (the gift page and terms say so).
// Files in /api whose names start with "_" are shared code, not endpoints.
import { randomInt } from 'node:crypto';

// What can be bought. Amounts in dollars. "full" is a Full Detail at the sedan price.
export const GIFTS = {
  g50:  { amount: 50,  name: '$50 gift card' },
  g100: { amount: 100, name: '$100 gift card' },
  g150: { amount: 150, name: '$150 gift card' },
  full: { amount: 259, name: 'Full Detail gift card', note: 'A Full Detail on a sedan or coupe. Bigger vehicles pay the difference.' },
};

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L
export function newCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `GC-${s.slice(0, 4)}-${s.slice(4)}`;
}
/** "gc 7kq2-mx9p" -> "GC-7KQ2-MX9P", or '' if it can't be a code. */
export function cleanCode(v) {
  const s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^GC/, '');
  if (!/^[A-Z0-9]{8}$/.test(s)) return '';
  return `GC-${s.slice(0, 4)}-${s.slice(4)}`;
}

/** The gift card behind a code: { pi, code, balance (cents), amount (cents), to } or null. Only paid ones count. */
export async function findGift(stripe, code) {
  const c = cleanCode(code);
  if (!c) return null;
  const res = await stripe.paymentIntents.search({ query: `metadata['gift_code']:'${c}'`, limit: 5 });
  const pi = (res.data || []).find((p) => p.status === 'succeeded' && p.metadata && p.metadata.kind === 'gift' && p.metadata.gift_status !== 'void');
  if (!pi) return null;
  const md = pi.metadata;
  return { pi, code: c, balance: Math.max(0, parseInt(md.gift_balance, 10) || 0), amount: parseInt(md.gift_amount, 10) || 0, to: md.gift_to || '' };
}

/** Take `cents` off a gift card and note the booking it went to. Returns the new balance. */
export async function spendGift(stripe, gift, cents, ref) {
  const left = Math.max(0, gift.balance - cents);
  const used = [gift.pi.metadata.gift_used || '', `${ref}:${cents}`].filter(Boolean).join(',').slice(-480);
  await stripe.paymentIntents.update(gift.pi.id, { metadata: { gift_balance: String(left), gift_used: used } });
  return left;
}

export const dollars = (cents) => '$' + (cents / 100).toFixed(cents % 100 ? 2 : 0);
