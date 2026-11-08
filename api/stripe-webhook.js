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

export async function handleEvent(event, stripe) {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      if (session.payment_status === 'unpaid') return 'waiting'; // delayed methods settle later
      return confirmBooking(session, stripe);
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

export async function confirmBooking(session, stripe) {
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

  await stripe.paymentIntents.update(piId, {
    metadata: { booking_status: 'deposit_received', balance_invoice: invoice.id },
  });
  console.log('deposit received', ref, 'draft balance invoice', invoice.id);
  return 'confirmed';
}

export async function webhook(request, stripe, secret) {
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
    const result = await handleEvent(event, stripe);
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
    return webhook(request, client, process.env.STRIPE_WEBHOOK_SECRET);
  },
};
