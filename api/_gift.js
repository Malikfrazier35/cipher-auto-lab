// Gift cards, kept in Stripe: each one is the payment that bought it, with its code and what is
// left on it in that payment's details (metadata). No other database.
// Connecticut: gift cards sold here never expire and carry no fees, and a balance under $5 is paid
// back in cash on request (the gift page and terms say so).
// Black Friday bonus cards (api/_promo.js) live on the same payment: bonus_code, bonus_balance,
// bonus_used, and the days they can be used (bonus_from / bonus_until). Their codes start BF-.
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
export function newCode(prefix = 'GC') {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${s.slice(0, 4)}-${s.slice(4)}`;
}
/** "gc 7kq2-mx9p" -> "GC-7KQ2-MX9P", "bf 7kq2 mx9p" -> "BF-7KQ2-MX9P", or '' if it can't be a code. */
export function cleanCode(v) {
  const s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const bonus = /^BF[A-Z0-9]{8}$/.test(s);
  const body = bonus ? s.slice(2) : s.replace(/^GC/, '');
  if (!/^[A-Z0-9]{8}$/.test(body)) return '';
  return `${bonus ? 'BF' : 'GC'}-${body.slice(0, 4)}-${body.slice(4)}`;
}
export const isBonusCode = (code) => /^BF-/.test(String(code || ''));
/** "Gift card" or "Bonus card", for invoices, texts and pushes. */
export const cardName = (code) => (isBonusCode(code) ? 'Bonus card' : 'Gift card');

/** The card behind a code: { pi, code, bonus, balance (cents), amount (cents), to, from?, until? } or null.
 *  Only paid gift cards count, and a bonus card only exists on a paid gift card. */
export async function findGift(stripe, code) {
  const c = cleanCode(code);
  if (!c) return null;
  const bonus = isBonusCode(c), field = bonus ? 'bonus_code' : 'gift_code';
  const res = await stripe.paymentIntents.search({ query: `metadata['${field}']:'${c}'`, limit: 5 });
  const pi = (res.data || []).find((p) => p.status === 'succeeded' && p.metadata && p.metadata.kind === 'gift' && p.metadata.gift_status !== 'void' && p.metadata[field] === c);
  if (!pi) return null;
  const md = pi.metadata;
  if (bonus) {
    return { pi, code: c, bonus: true, balance: Math.max(0, parseInt(md.bonus_balance, 10) || 0), amount: parseInt(md.bonus_amount, 10) || 0,
      to: md.gift_from || '', from: md.bonus_from || '', until: md.bonus_until || '' };
  }
  return { pi, code: c, bonus: false, balance: Math.max(0, parseInt(md.gift_balance, 10) || 0), amount: parseInt(md.gift_amount, 10) || 0, to: md.gift_to || '' };
}

/** Which bookings a card has already paid for: "CAL-XXXX:2500,CAL-YYYY:1000". */
export const usedOf = (gift) => gift.pi.metadata[gift.bonus ? 'bonus_used' : 'gift_used'] || '';

/** Take `cents` off a card and note the booking it went to. Returns the new balance. */
export async function spendGift(stripe, gift, cents, ref) {
  const left = Math.max(0, gift.balance - cents);
  const used = [usedOf(gift), `${ref}:${cents}`].filter(Boolean).join(',').slice(-480);
  const metadata = gift.bonus ? { bonus_balance: String(left), bonus_used: used } : { gift_balance: String(left), gift_used: used };
  await stripe.paymentIntents.update(gift.pi.id, { metadata });
  return left;
}

export const dollars = (cents) => '$' + (cents / 100).toFixed(cents % 100 ? 2 : 0);
