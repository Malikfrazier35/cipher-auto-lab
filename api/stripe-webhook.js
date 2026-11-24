// POST /api/stripe-webhook
// Stripe calls this when a deposit is paid. This, not the thank-you screen, is what confirms a
// booking, because a customer can pay and close the tab before the page loads.
//
// On a paid deposit it:
//   1. puts the customer's name and phone on their Stripe customer record,
//   2. credits the deposit to the customer and creates a DRAFT invoice for the job (service,
//      paint work, add-ons, using the catalog products, Connecticut tax included). Nothing is
//      sent: after the walk-around you open it in the Stripe app, add the travel fee or any
//      re-quote, and send it; the deposit credit comes off automatically,
//   3. marks the payment "deposit_received" with the invoice ID, so a retried event is a no-op,
//   4. texts the customer a confirmation from the toll-free number (api/_sms.js, once Twilio is set
//      up) and pushes the booking to the owner's phone (api/_notify.js). Neither can fail a booking.
//
// Needs STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (the endpoint's signing secret) in Vercel. Events to send: checkout.session.completed, checkout.session.async_payment_succeeded,
// checkout.session.async_payment_failed.
import Stripe from 'stripe';
import { SVC, PAINT, TIER, OFFERS, invoiceLines, bookingMetadata, json } from './_booking.js';
import { channel } from './_channels.js';
import { bump } from './_metrics.js';
import { findGift, spendGift, usedOf, cardName, dollars, GIFTS } from './_gift.js';
import { BF, CERAMIC_PROMO } from './_promo.js';
import { AREAS, forecast, windowLine } from './_weather.js';
import { push, NUMBERS_LINE } from './_notify.js';
import { sendSms, confirmationText, configured as smsOn } from './_sms.js';

export async function handleEvent(event, stripe, topic) {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      if (session.payment_status === 'unpaid') return 'waiting'; // delayed methods settle later
      if (session.metadata && session.metadata.kind === 'gift') return giftSold(session, topic);
      return confirmBooking(session, stripe, topic);
    }
    case 'checkout.session.async_payment_failed': {
      const s = event.data.object;
      console.warn('deposit failed', s.client_reference_id, s.id);
      return 'failed';
    }
    default:
      return 'ignored';
  }
}

export async function confirmBooking(session, stripe, topic) {
  const md = session.metadata || {};
  const ref = session.client_reference_id || md.booking_ref || '';
  const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  const customer = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (!piId || !customer) { console.error('deposit without payment or customer', session.id); return 'skipped'; }

  const pi = await stripe.paymentIntents.retrieve(piId);
  if (pi.metadata && pi.metadata.balance_invoice) return 'already-done';

  // the metadata was written by our own server when the session was created
  const bk = {
    packageKey: md.package_key, paintKey: md.paint_key || '', tier: md.tier,
    adds: (md.addons || '').split(',').filter(Boolean),
    promo: md.promo || '',   // set by our server at booking (api/_promo.js), e.g. the spring ceramic lock-in
  };
  if (!SVC[bk.packageKey] || !TIER[bk.tier] || (bk.paintKey && !PAINT[bk.paintKey])) {
    console.error('deposit with unreadable booking', ref, session.id);
    return 'skipped';
  }

  const zip = /^06\d{3}$/.test(md.zip || '') ? md.zip : '';
  await stripe.customers.update(customer, {
    name: md.customer_name || undefined,
    phone: md.phone ? '+1' + md.phone : undefined,
    // where the work happens: Stripe Tax needs it for Connecticut sales tax on the invoice
    address: md.address ? { line1: md.address, city: md.town || undefined, state: 'CT', postal_code: zip || undefined, country: 'US' } : undefined,
    metadata: { last_booking: ref },
  });

  // the deposit becomes credit on the customer, applied to the balance invoice after tax,
  // so tax is worked out on the whole job rather than on the job minus the deposit
  const key = `balance-${session.id}`;
  await stripe.customers.createBalanceTransaction(customer, {
    amount: -(session.amount_total || 0),
    currency: 'usd',
    description: `Deposit paid online (${ref})`,
    metadata: { booking_ref: ref, checkout_session: session.id },
  }, { idempotencyKey: `${key}-credit` });

  const invoice = await stripe.invoices.create({
    customer,
    collection_method: 'send_invoice',
    days_until_due: 7,
    auto_advance: false,
    pending_invoice_items_behavior: 'exclude',
    automatic_tax: { enabled: !!zip },
    description: `Balance for booking ${ref} on ${md.date || 'the booked day'}${md.town ? ' in ' + md.town : ''}. ` +
      'Your online deposit is credited against this invoice. The final amount is confirmed at the walk-around; ' +
      'any travel fee for your town is added before this is sent. Prices include Connecticut sales tax.',
    metadata: { booking_ref: ref, checkout_session: session.id },
  }, { idempotencyKey: key });

  const lines = invoiceLines(bk);
  await addLines(stripe, customer, invoice.id, lines, key);

  // a gift card typed at booking that didn't cover the deposit: what is left on it comes off now
  const total = lines.reduce((a, l) => a + l.amount, 0) / 100;
  let gift = null;
  if (md.gift_code) {
    gift = await applyGift(stripe, customer, md.gift_code, ref, Math.round(total * 100) - (session.amount_total || 0), `${key}-gift`)
      .catch((e) => { console.warn('gift card not applied', ref, e && e.message); return { code: md.gift_code, failed: true }; });
  }

  const fc = await bookingForecast(md);
  await stripe.paymentIntents.update(piId, {
    metadata: { booking_status: 'deposit_received', balance_invoice: invoice.id, forecast_at_booking: fc },
  });
  console.log('deposit received', ref, 'draft balance invoice', invoice.id);

  // the customer's confirmation text, then a push to the owner's phone; neither fails the booking
  const deposit = (session.amount_total || 0) / 100;
  let texted = '';
  if (smsOn(deps.env) && md.sms_opt_in !== 'yes') texted = 'not opted in';
  else if (smsOn(deps.env)) {
    texted = await sendSms(deps.env, md.phone, confirmationText({
      first: (md.customer_name || '').split(' ')[0], ref, deposit, date: md.date, window: md.window,
      service: SVC[bk.packageKey].name + (bk.paintKey ? ' + ' + PAINT[bk.paintKey].name : ''),
    }), deps.fetch).then((r) => (r.sid ? 'sent' : r.skipped), (e) => { console.warn('confirmation text failed', e && e.message); return 'failed'; });
  }
  await notifyBooking(topic, { md, ref, piId, invoiceId: invoice.id, deposit, total, forecast: fc, texted, gift })
    .catch((e) => console.warn('booking push failed', e && e.message));
  await bump(deps.env, { e: 'booked', ch: md.campaign || 'direct', place: md.town ? `${md.town}, CT` : '' }, deps.fetch);
  return 'confirmed';
}

async function addLines(stripe, customer, invoiceId, lines, key) {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const item = l.product
      ? { price_data: { currency: 'usd', product: l.product, unit_amount: l.amount, tax_behavior: 'inclusive' } }
      : { currency: 'usd', amount: l.amount, tax_code: l.tax_code, tax_behavior: 'inclusive' };
    await stripe.invoiceItems.create({ customer, invoice: invoiceId, description: l.description, ...item },
      { idempotencyKey: `${key}-${i}` });
  }
}

// A gift card pays like the deposit does: as credit on the customer, which the balance invoice uses
// after tax. Takes no more than `maxCents` (what is still owed) and no more than the card holds.
async function applyGift(stripe, customer, code, ref, maxCents, key) {
  const g = await findGift(stripe, code);
  if (!g) return { code, failed: true };
  const already = usedOf(g).split(',').find((u) => u.startsWith(ref + ':'));
  const cents = already ? +already.split(':')[1] : Math.max(0, Math.min(g.balance, maxCents));
  if (cents > 0) {
    await stripe.customers.createBalanceTransaction(customer, {
      amount: -cents, currency: 'usd', description: `${cardName(g.code)} ${g.code} (${ref})`, metadata: { booking_ref: ref, gift_code: g.code },
    }, { idempotencyKey: key });
  }
  const left = already ? g.balance : await spendGift(stripe, g, cents, ref);
  return { code: g.code, applied: cents, left };
}

/** A booking whose deposit a gift card covers: no payment at all, the booking lives on its draft invoice. */
export async function bookWithGift(bk, gift, stripe, topic) {
  const md = bookingMetadata(bk), ref = bk.ref, key = `giftbook-${ref}`;
  const zip = /^06\d{3}$/.test(bk.zip || '') ? bk.zip : '';
  const customer = (await stripe.customers.create({
    email: bk.email, name: bk.name, phone: '+1' + bk.phone,
    address: bk.address ? { line1: bk.address, city: bk.town || undefined, state: 'CT', postal_code: zip || undefined, country: 'US' } : undefined,
    metadata: { last_booking: ref },
  }, { idempotencyKey: `${key}-customer` })).id;
  const lines = invoiceLines(bk);
  const totalCents = lines.reduce((a, l) => a + l.amount, 0);
  const fc = await bookingForecast(md);
  const invoice = await stripe.invoices.create({
    customer,
    collection_method: 'send_invoice',
    days_until_due: 7,
    auto_advance: false,
    pending_invoice_items_behavior: 'exclude',
    automatic_tax: { enabled: !!zip },
    description: `Balance for booking ${ref} on ${md.date || 'the booked day'}${md.town ? ' in ' + md.town : ''}. ` +
      `${cardName(gift.code)} ${gift.code} is credited against this invoice. The final amount is confirmed at the walk-around; ` +
      'any travel fee for your town is added before this is sent. Prices include Connecticut sales tax.',
    metadata: { ...md, booking_status: 'deposit_received', paid_with: 'gift card', forecast_at_booking: fc },
  }, { idempotencyKey: key });
  await addLines(stripe, customer, invoice.id, lines, key);
  const g = await applyGift(stripe, customer, gift.code, ref, totalCents, `${key}-gift`);
  await stripe.invoices.update(invoice.id, { metadata: { gift_applied: String(g.applied), balance_invoice: invoice.id } });
  console.log('gift booking', ref, 'draft balance invoice', invoice.id);

  let texted = '';
  if (smsOn(deps.env) && md.sms_opt_in !== 'yes') texted = 'not opted in';
  else if (smsOn(deps.env)) {
    texted = await sendSms(deps.env, md.phone, confirmationText({
      first: (md.customer_name || '').split(' ')[0], ref, date: md.date, window: md.window, giftCode: g.code,
      service: SVC[bk.packageKey].name + (bk.paintKey ? ' + ' + PAINT[bk.paintKey].name : ''),
    }), deps.fetch).then((r) => (r.sid ? 'sent' : r.skipped), (e) => { console.warn('confirmation text failed', e && e.message); return 'failed'; });
  }
  await notifyBooking(topic, { md, ref, invoiceId: invoice.id, deposit: 0, total: totalCents / 100, forecast: fc, texted, gift: g })
    .catch((e) => console.warn('booking push failed', e && e.message));
  await bump(deps.env, { e: 'booked', ch: md.campaign || 'direct', place: md.town ? `${md.town}, CT` : '' }, deps.fetch);
  return { ref, invoiceId: invoice.id, applied: g.applied, left: g.left };
}

/** A gift card was bought: tell the owner. The card works from the moment the payment succeeded. */
async function giftSold(session, topic) {
  const md = session.metadata || {};
  console.log('gift card sold', md.gift_code);
  await bump(deps.env, { e: 'gift', ch: md.campaign || 'direct' }, deps.fetch);
  if (topic) {
    await push(topic, {
      title: `Gift card sold · ${dollars(parseInt(md.gift_amount, 10) || 0)}`,
      message: `${md.gift_code} · ${(GIFTS[md.gift_kind] || {}).name || 'Gift card'}
For ${md.gift_to || '?'}, from ${md.gift_from || '?'}` +
        (md.gift_message ? `
"${md.gift_message}"` : '') +
        (md.bonus_code ? `
Black Friday bonus for the buyer: ${md.bonus_code} (${dollars(parseInt(md.bonus_amount, 10) || 0)}, ${md.bonus_from} to ${md.bonus_until})` : ''),
      priority: 3, tags: 'gift',
      actions: [{ action: 'view', label: 'Payment', url: `https://dashboard.stripe.com/payments/${session.payment_intent}` }],
    }, deps.fetch).catch((e) => console.warn('gift push failed', e && e.message));
  }
  return 'gift';
}

// The forecast for the booked day and window, as it stood when the deposit came in, so it is
// on the payment in the Stripe app. Never holds up or fails a booking: 4 seconds, then skip.
const WINDOW_KEY = { Morning: 'morning', Midday: 'midday', Afternoon: 'afternoon' };
export const deps = { fetch: (...a) => fetch(...a), env: process.env };   // tests swap these out
export async function bookingForecast(md, fetchImpl = deps.fetch) {
  try {
    const area = AREAS[md.area] ? md.area : 'hartford';
    const day = new Date(md.date || '');
    if (isNaN(day)) return '';
    const ymd = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
    const win = WINDOW_KEY[String(md.window || '').split(' ')[0]];
    if (!win) return '';
    const data = await Promise.race([forecast(area, fetchImpl), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000))]);
    const line = windowLine(data, ymd, win);
    if (line) return line;
    const last = Object.keys(data.windows || {}).sort().pop();
    return last && ymd > last ? 'More than 6 days out at booking: no forecast yet' : '';
  } catch {
    return '';
  }
}

export async function notifyBooking(topic, b) {
  if (!topic) return false;
  const md = b.md, first = (md.customer_name || '').split(' ')[0] || 'there';
  const when = `${md.date || ''}, ${md.window || ''}`.replace(/^, |, $/g, '');
  const hello = b.texted === 'sent'
    ? `Hi ${first}, it's Cipher Auto Lab about your detail (${b.ref}) on ${md.date || 'the day you picked'}. `
    : `Hi ${first}, it's Cipher Auto Lab. Your detail (${b.ref}) on ${md.date || 'the day you picked'} is booked and your deposit is in. ` +
      `We'll text your arrival time the day before. ${NUMBERS_LINE}`;
  const rain = /Rain|Snow|Thunder/.test(b.forecast || '') && /([4-9]\d|100)% chance/.test(b.forecast || '');
  const mins = +md.job_minutes || 0, lo = /: (-?\d+)(?:-\d+)?°F/.exec(b.forecast || '');
  const job = [
    mins ? `~${Math.floor(mins / 60)}h${mins % 60 ? String(mins % 60).padStart(2, '0') : ''} job` : '',
    md.garage === 'yes' ? 'Garage OK (wash or rinseless inside, can run to 6pm)' : '',
    lo && +lo[1] <= 35 && md.garage !== 'yes' && md.package_key !== 'interior' ? 'Rinseless day (35°F or colder)' : '',
    md.salt_neutralizer === 'included' ? 'Salt neutralizer included' : '',
  ].filter(Boolean).join(' · ');
  const actions = [
    ...(md.phone ? [{ action: 'view', label: `Text ${first}`, url: `sms:+1${md.phone}?&body=${encodeURIComponent(hello)}` }] : []),
    ...(b.piId ? [{ action: 'view', label: 'Payment', url: `https://dashboard.stripe.com/payments/${b.piId}` }] : []),
    { action: 'view', label: 'Draft invoice', url: `https://dashboard.stripe.com/invoices/${b.invoiceId}` },
  ];
  return Promise.race([
    push(topic, {
      title: `New booking · ${md.service || 'Detail'}`,
      message: `${b.ref} · ${md.customer_name || ''} · ${md.town || ''}\n${when}\n` +
        (b.deposit ? `$${b.deposit} deposit paid` : 'No deposit: gift card') + ` · est. $${b.total.toLocaleString('en-US')} total` +
        (b.gift ? (b.gift.failed ? `\n${cardName(b.gift.code)} ${b.gift.code} NOT applied: check it in Stripe` : `\n${cardName(b.gift.code)} ${b.gift.code}: ${dollars(b.gift.applied)} applied, ${dollars(b.gift.left)} left on it`) : '') +
        (md.promo === CERAMIC_PROMO ? `\nBlack Friday ceramic lock-in: $${BF.ceramicOff} off (on the invoice)` : '') +
        (md.vehicle ? `\n${md.vehicle}` : '') + (job ? `\n${job}` : '') + (b.forecast ? `\nForecast: ${b.forecast}` : '') +
        (md.booking_source === 'menu' ? '\nFrom the Detail Menu' : '') +
        (channel(md.campaign) ? `\nQR: ${channel(md.campaign).label}` : '') +
        (channel(md.campaign) && OFFERS[channel(md.campaign).type] ? `\n${OFFERS[channel(md.campaign).type]}` : '') +
        (b.texted === 'sent' ? '\nConfirmation texted to the customer' : b.texted === 'failed' ? '\nConfirmation text FAILED: text them yourself' :
          b.texted === 'not opted in' ? '\nNo auto-texts: they didn\'t tick the texting box' : ''),
      priority: 4,
      tags: rain ? 'umbrella' : 'calendar',
      actions,
    }, deps.fetch),
    new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000)),
  ]);
}

export async function webhook(request, stripe, secret, topic) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
  if (!stripe || !secret) return json({ error: 'not configured' }, 503);
  const raw = await request.text();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, request.headers.get('stripe-signature') || '', secret);
  } catch {
    return json({ error: 'bad signature' }, 400);
  }
  try {
    const result = await handleEvent(event, stripe, topic);
    return json({ received: true, result });
  } catch (e) {
    // a 500 makes Stripe retry later; the idempotency keys keep retries from duplicating anything
    console.error('webhook handling failed', event.type, e && e.type, e && e.code);
    return json({ error: 'handler failed' }, 500);
  }
}

let client = null;
export default {
  fetch(request) {
    if (!client && process.env.STRIPE_SECRET_KEY) client = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
    return webhook(request, client, process.env.STRIPE_WEBHOOK_SECRET, process.env.NTFY_TOPIC);
  },
};
