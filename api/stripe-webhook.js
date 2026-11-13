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
//   3. marks the payment "deposit_received" with the invoice ID, so a retried event is a no-op.
//
// Needs STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (the endpoint's signing secret) in Vercel. Events to send: checkout.session.completed, checkout.session.async_payment_succeeded,
// checkout.session.async_payment_failed.
import Stripe from 'stripe';
import { SVC, PAINT, TIER, invoiceLines, json } from './_booking.js';
import { AREAS, forecast, windowLine } from './_weather.js';
import { push, NUMBERS_LINE } from './_notify.js';

export async function handleEvent(event, stripe, topic) {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      if (session.payment_status === 'unpaid') return 'waiting'; // delayed methods settle later
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
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const item = l.product
      ? { price_data: { currency: 'usd', product: l.product, unit_amount: l.amount, tax_behavior: 'inclusive' } }
      : { currency: 'usd', amount: l.amount, tax_code: l.tax_code, tax_behavior: 'inclusive' };
    await stripe.invoiceItems.create({ customer, invoice: invoice.id, description: l.description, ...item },
      { idempotencyKey: `${key}-${i}` });
  }

  const fc = await bookingForecast(md);
  await stripe.paymentIntents.update(piId, {
    metadata: { booking_status: 'deposit_received', balance_invoice: invoice.id, forecast_at_booking: fc },
  });
  console.log('deposit received', ref, 'draft balance invoice', invoice.id);

  // a push to the owner's phone for every new booking; never holds up or fails the booking
  const total = lines.reduce((a, l) => a + l.amount, 0) / 100;
  await notifyBooking(topic, { md, ref, piId, invoiceId: invoice.id, deposit: (session.amount_total || 0) / 100, total, forecast: fc })
    .catch((e) => console.warn('booking push failed', e && e.message));
  return 'confirmed';
}

// The forecast for the booked day and window, as it stood when the deposit came in, so it is
// on the payment in the Stripe app. Never holds up or fails a booking: 4 seconds, then skip.
const WINDOW_KEY = { Morning: 'morning', Midday: 'midday', Afternoon: 'afternoon' };
export const deps = { fetch: (...a) => fetch(...a) };   // tests swap this out
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
  const hello = `Hi ${first}, it's Cipher Auto Lab. Your detail (${b.ref}) on ${md.date || 'the day you picked'} is booked and your deposit is in. ` +
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
    { action: 'view', label: 'Payment', url: `https://dashboard.stripe.com/payments/${b.piId}` },
    { action: 'view', label: 'Draft invoice', url: `https://dashboard.stripe.com/invoices/${b.invoiceId}` },
  ];
  return Promise.race([
    push(topic, {
      title: `New booking · ${md.service || 'Detail'}`,
      message: `${b.ref} · ${md.customer_name || ''} · ${md.town || ''}\n${when}\n$${b.deposit} deposit paid · est. $${b.total.toLocaleString('en-US')} total` +
        (md.vehicle ? `\n${md.vehicle}` : '') + (job ? `\n${job}` : '') + (b.forecast ? `\nForecast: ${b.forecast}` : '') +
        (md.booking_source === 'menu' ? '\nFrom the Detail Menu' : ''),
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
