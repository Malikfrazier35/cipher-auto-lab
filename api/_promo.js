// Black Friday 2026: Thanksgiving (Thu Nov 26) through Cyber Monday (Mon Nov 30), Connecticut time.
//
//  Give one, get one for yourself
//    A gift card bought in the window comes with a bonus card for the buyer: 20% of the gift card,
//    rounded to $5 ($50 -> $10, $100 -> $20, $150 -> $30, Full Detail $259 -> $50). The bonus is a
//    promotional card, not a purchased gift card: it is good on any detail done Jan 1 - Mar 31, 2027,
//    as the gift page, the receipt and the terms (section 16) say. The gift card itself never expires.
//    Bonus codes look like BF-XXXX-XXXX and live on the gift card's own payment in Stripe (api/_gift.js).
//
//  Spring ceramic lock-in
//    Ceramic coating (alone or with paint correction) booked in the window for a day Mar 1 - May 31,
//    2027 is $100 off: a credit line on the balance invoice. Spring because coatings need warm, dry
//    days to cure, and those are what this business doesn't have in December.
//
// js/promo.js carries the same dates for the pages; tools/test_stripe_api.mjs checks the two agree.
// Files in /api whose names start with "_" are shared code, not endpoints.

export const BF = {
  id: 'bf2026',
  start: '2026-11-26T00:00:00-05:00',   // Thanksgiving, midnight
  end: '2026-12-01T00:00:00-05:00',     // the moment Cyber Monday ends
  bonusPct: 20,
  bonusFrom: '2027-01-01',
  bonusUntil: '2027-03-31',
  ceramicOff: 100,
  ceramicFrom: '2027-03-01',
  ceramicUntil: '2027-05-31',
  ceramicKeys: ['ceramic', 'corrceramic'],
};
export const BONUS_RANGE = 'Jan 1 to Mar 31, 2027';
export const CERAMIC_RANGE = 'Mar 1 to May 31, 2027';

/** Is the Black Friday window open? */
export const bfOn = (now = Date.now()) => now >= Date.parse(BF.start) && now < Date.parse(BF.end);

/** The bonus card for a gift card of `dollars`: 20%, rounded to $5. */
export const bonusFor = (dollars) => Math.round((dollars * BF.bonusPct) / 100 / 5) * 5;

/** "Sat Apr 10 2027" (the booking's date text) -> "2027-04-10", or '' if it isn't a date. */
export function ymdOf(text) {
  const d = new Date(text || '');
  return isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const within = (ymd, from, until) => !!ymd && ymd >= from && ymd <= until;

/** Can a bonus card from `gift` (api/_gift.js findGift) pay for a detail on this date? */
export function bonusUsableOn(gift, dateText) {
  return within(ymdOf(dateText), gift.from || BF.bonusFrom, gift.until || BF.bonusUntil);
}

/** Does this booking get the spring ceramic lock-in, booked at `now`? */
export function ceramicLockIn(bk, now = Date.now()) {
  return bfOn(now) && BF.ceramicKeys.includes(bk.paintKey) && within(ymdOf(bk.date), BF.ceramicFrom, BF.ceramicUntil);
}
export const CERAMIC_PROMO = BF.id + '-ceramic';
