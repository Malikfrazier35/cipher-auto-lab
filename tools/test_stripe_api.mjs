// Tests for the three Stripe functions in /api, run against a fake Stripe client (no network,
// no keys). Webhook signatures are generated and checked with the real Stripe library.
//   node tools/test_stripe_api.mjs   (needs `npm i` for the stripe package)
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { createCheckout } from '../api/create-checkout-session.js';
import { checkoutStatus } from '../api/checkout-status.js';
import { webhook, deps, bookingForecast } from '../api/stripe-webhook.js';
import { shape, kindOf, forecast, dayPeriods, typical } from '../api/_weather.js';
import { watch, deps as watchDeps, risky } from '../api/weather-watch.js';
import { invoiceLines, depositFor, parseBooking, bookingMetadata, jobMinutes, saltSeason } from '../api/_booking.js';
import { notifyBooking } from '../api/stripe-webhook.js';
import { joinWaitlist, parseSignup } from '../api/merch-waitlist.js';

const real = new Stripe('sk_test_' + 'x'.repeat(24));
function fake() {
  const calls = [];
  const rec = (name, ret) => async (...args) => { calls.push([name, ...args]); return typeof ret === 'function' ? ret(...args) : ret; };
  return {
    calls,
    webhooks: real.webhooks,
    checkout: { sessions: {
      create: rec('sessions.create', { id: 'cs_test_abc', client_secret: 'cs_test_abc_secret_xyz' }),
      retrieve: rec('sessions.retrieve', { status: 'complete', payment_status: 'paid', client_reference_id: 'CAL-AB12CD', amount_total: 4000 }),
    } },
    paymentIntents: {
      retrieve: rec('pi.retrieve', { id: 'pi_1', metadata: {} }),
      update: rec('pi.update', {}),
      search: rec('pi.search', { data: [], has_more: false }),
    },
    customers: { update: rec('customers.update', {}), createBalanceTransaction: rec('customers.credit', {}),
                 search: rec('customers.search', { data: [] }), create: rec('customers.create', { id: 'cus_new' }) },
    invoices: { create: rec('invoices.create', { id: 'in_1' }), update: rec('invoices.update', {}), search: rec('invoices.search', { data: [], has_more: false }) },
    invoiceItems: { create: rec('invoiceItems.create', {}) },
  };
}
const booking = {
  packageKey: 'full', paintKey: 'ceramic', tier: 'suv5', addons: 'iron,clay,extract,bogus', ref: 'CAL-AB12CD',
  name: 'Malik Test', phone: '+1 (203) 555-0100', email: 'test@example.com', vehicle: '2019 Honda CR-V',
  size: 'SUV · 5 seat', date: 'Tue Nov 10 2026', window: 'Morning', address: '12 Main St', town: 'Enfield',
  zip: '06082', notes: 'dog hair', agreementVersion: '1.0', signature: 'Malik Test', signedAt: '2026-11-08T00:00:00Z', photoConsent: 'yes',
  amount: 1, deposit: 1, // ignored: the server decides
};
const req = (body, origin = 'https://cipherautolab.com', method = 'POST') =>
  new Request('https://cipherautolab.com/api/create-checkout-session', {
    method, headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': '1.2.3.' + Math.random() },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });

// ---- pricing mirrors app.js
assert.equal(depositFor(parseBooking(booking).booking), 100);
const lines = invoiceLines(parseBooking(booking).booking);
const total = lines.reduce((a, l) => a + l.amount, 0) / 100;
// full suv5 279 + ceramic suv5 1049 - exterior suv5 125 + iron 69 + clay 69 + extract 99 - bundle 19 = 1421
assert.equal(total, 1421, 'balance invoice lines add up like app.js');

// ---- create session
let s = fake();
let r = await createCheckout(req(booking), s);
assert.equal(r.status, 200);
const out = await r.json();
assert.equal(out.clientSecret, 'cs_test_abc_secret_xyz');
const [, params, opts] = s.calls[0];
assert.equal(params.ui_mode, 'elements', 'custom checkout inside our page, not the hosted page');
assert.equal(params.mode, 'payment');
assert.equal(params.line_items[0].price_data.unit_amount, 10000, 'deposit decided on the server');
assert.ok(!('payment_method_types' in params), 'dynamic payment methods');
assert.equal(params.customer_email, 'test@example.com');
assert.equal(params.client_reference_id, 'CAL-AB12CD');
assert.equal(params.metadata.addons, 'iron,clay,extract', 'unknown add-ons dropped');
assert.equal(params.metadata.phone, '2035550100');
assert.match(params.return_url, /^https:\/\/cipherautolab\.com\/quote\?paid=1&session_id=\{CHECKOUT_SESSION_ID\}$/);
assert.match(params.integration_identifier, /_[a-z]{8}$/);
assert.equal(opts.idempotencyKey, 'deposit-CAL-AB12CD');
assert.deepEqual(params.excluded_payment_method_types, ['klarna', 'amazon_pay', 'pay_by_bank'], 'only methods that settle on the spot');
assert.equal(params.metadata.booking_source, 'site');
// a booking from the Detail Menu comes back to /menu and is tagged as such
const fromMenu = fake();
await createCheckout(req({ ...booking, ref: 'CAL-MENU01', source: 'menu' }), fromMenu);
assert.match(fromMenu.calls[0][1].return_url, /^https:\/\/cipherautolab\.com\/menu\?paid=1&session_id=\{CHECKOUT_SESSION_ID\}$/);
assert.equal(fromMenu.calls[0][1].metadata.booking_source, 'menu');
const odd = fake();
await createCheckout(req({ ...booking, ref: 'CAL-ODD001', source: '../evil' }), odd);
assert.match(odd.calls[0][1].return_url, /\/quote\?paid=1/, 'unknown sources fall back to the site flow');

// refusals
assert.equal((await createCheckout(req(booking, 'https://evil.example'), fake())).status, 403);
assert.equal((await createCheckout(req(booking), null)).status, 503, 'no key yet: page falls back to text');
assert.equal((await createCheckout(req({ ...booking, email: '' }), fake())).status, 400);
assert.equal((await createCheckout(req({ ...booking, packageKey: 'free' }), fake())).status, 400);
assert.equal((await createCheckout(req({ ...booking, website: 'x' }), fake())).status, 400);
assert.equal((await createCheckout(req(booking, 'https://cipherautolab.com', 'GET'), fake())).status, 405);
const ext = fake();
await createCheckout(req({ ...booking, packageKey: 'exterior', paintKey: '', addons: 'extract,engine' }), ext);
assert.equal(ext.calls[0][1].line_items[0].price_data.unit_amount, 2500);
assert.equal(ext.calls[0][1].metadata.addons, 'engine', 'interior add-on not allowed on an exterior detail');

// ---- status
s = fake();
r = await checkoutStatus(new Request('https://cipherautolab.com/api/checkout-status?session_id=cs_live_a1b2c3d4e5f6g7'), s);
assert.deepEqual(await r.json(), { status: 'complete', payment_status: 'paid', ref: 'CAL-AB12CD', amount: 40 });
assert.equal((await checkoutStatus(new Request('https://x/api/checkout-status?session_id=nope'), fake())).status, 400);

// ---- webhook
// canned NWS replies: Tue Nov 10 2026, 8am-5pm, rain arriving after noon
const hoursFor = (ymd) => Array.from({ length: 24 }, (_, h) => ({
  startTime: `${ymd}T${String(h).padStart(2, '0')}:00:00-05:00`, temperature: 40 + Math.min(h, 14) - 8,
  probabilityOfPrecipitation: { value: h >= 12 ? 70 : 10 }, shortForecast: h >= 12 ? 'Chance Light Rain' : 'Partly Sunny' }));
const fakeNws = async (url) => ({ ok: true, status: 200, json: async () => url.includes('/points/')
  ? { properties: { forecastHourly: 'https://api.weather.gov/gridpoints/BOX/1,1/forecast/hourly' } }
  : { properties: { updateTime: '2026-11-09T12:00:00+00:00', periods: hoursFor('2026-11-10') } } });
deps.fetch = fakeNws;
const secret = 'whsec_' + 'test'.repeat(8);
const md = (await (async () => { const f = fake(); await createCheckout(req(booking), f); return f.calls[0][1].metadata; })());
const event = { id: 'evt_1', type: 'checkout.session.completed', data: { object: {
  id: 'cs_test_abc', payment_status: 'paid', payment_intent: 'pi_1', customer: 'cus_1', amount_total: 10000,
  client_reference_id: 'CAL-AB12CD', metadata: md } } };
const payload = JSON.stringify(event);
const header = real.webhooks.generateTestHeaderString({ payload, secret });
const hook = (p, h) => new Request('https://cipherautolab.com/api/stripe-webhook', { method: 'POST', headers: { 'stripe-signature': h }, body: p });

s = fake();
assert.equal((await webhook(hook(payload, 'bad'), s, secret)).status, 400, 'unsigned events rejected');
r = await webhook(hook(payload, header), s, secret);
assert.equal(r.status, 200);
assert.equal((await r.json()).result, 'confirmed');
const names = s.calls.map((c) => c[0]);
assert.deepEqual(names.slice(0, 4), ['pi.retrieve', 'customers.update', 'customers.credit', 'invoices.create']);
const cust = s.calls.find((c) => c[0] === 'customers.update')[2];
assert.deepEqual(cust.address, { line1: '12 Main St', city: 'Enfield', state: 'CT', postal_code: '06082', country: 'US' });
const credit = s.calls.find((c) => c[0] === 'customers.credit');
assert.equal(credit[1], 'cus_1'); assert.equal(credit[2].amount, -10000, 'deposit credited to the customer');
const inv = s.calls.find((c) => c[0] === 'invoices.create');
assert.equal(inv[1].auto_advance, false, 'draft only, nothing is sent');
assert.equal(inv[1].collection_method, 'send_invoice');
assert.deepEqual(inv[1].automatic_tax, { enabled: true }, 'CT tax on the invoice');
const items = s.calls.filter((c) => c[0] === 'invoiceItems.create').map((c) => c[1]);
const amt = (i) => (i.price_data ? i.price_data.unit_amount : i.amount);
assert.equal(items.reduce((a, i) => a + amt(i), 0), 142100, 'invoice lines = the whole job, tax included');
assert.deepEqual(items.filter((i) => i.price_data).map((i) => i.price_data.product),
  ['cal_full_suv5', 'cal_ceramic_suv5', 'cal_addon_extract', 'cal_addon_decon_bundle'], 'lines use catalog products');
assert.ok(items.every((i) => (i.price_data ? i.price_data.tax_behavior : i.tax_behavior) === 'inclusive'));
assert.equal(items.find((i) => !i.price_data).tax_code, 'txcd_20010001', 'credit carries a tax category');
assert.deepEqual(s.calls.at(-1)[2].metadata, { booking_status: 'deposit_received', balance_invoice: 'in_1',
  forecast_at_booking: 'Morning 8-11am: 40-42°F, Partly cloudy, 10% chance of precipitation' });

// ---- weather
assert.equal(kindOf('Partly Cloudy'), 'partly');
assert.equal(kindOf('Mostly Sunny'), 'clear');
assert.equal(kindOf('Mostly Cloudy'), 'cloudy');
assert.equal(kindOf('Rain And Snow Likely'), 'snow');
assert.equal(kindOf('Slight Chance Rain Showers'), 'rain');
const wx = shape(hoursFor('2026-11-10'));
assert.deepEqual(wx.windows['2026-11-10'].morning, { lo: 40, hi: 42, kind: 'partly', label: 'Partly cloudy', pop: 10 });
assert.deepEqual(wx.windows['2026-11-10'].midday, { lo: 43, hi: 45, kind: 'rain', label: 'Rain', pop: 70 }, 'rain shows once it is likely');
assert.equal(wx.windows['2026-11-10'].afternoon.kind, 'rain');
assert.equal(wx.days['2026-11-10'].pop, 70);
assert.equal(wx.days['2026-11-10'].level, 'hourly');
assert.equal(wx.hourly['2026-11-10'].length, 14, 'hour by hour, 6am-7pm');
assert.deepEqual(wx.hourly['2026-11-10'][0], [6, 38, 'partly', 10]);
assert.deepEqual(wx.hourly['2026-11-10'][7], [13, 45, 'rain', 70]);
// day 7: 12-hour periods fill only the days the hourly forecast doesn't have
const d7 = dayPeriods([
  { startTime: '2026-11-10T06:00:00-05:00', isDaytime: true, temperature: 45, shortForecast: 'Sunny', probabilityOfPrecipitation: { value: 0 } },
  { startTime: '2026-11-16T06:00:00-05:00', isDaytime: true, temperature: 38, shortForecast: 'Rain Likely', probabilityOfPrecipitation: { value: 64 } },
  { startTime: '2026-11-16T18:00:00-05:00', isDaytime: false, temperature: 30, shortForecast: 'Snow', probabilityOfPrecipitation: { value: 90 } },
  { startTime: '2026-11-17T06:00:00-05:00', isDaytime: true, temperature: 41, shortForecast: 'Slight Chance Rain', probabilityOfPrecipitation: { value: 20 } }], wx.days);
assert.deepEqual(Object.keys(d7), ['2026-11-16', '2026-11-17']);
assert.deepEqual(d7['2026-11-16'], { lo: 38, hi: 38, kind: 'rain', label: 'Rain', pop: 60, level: 'day', text: 'Rain Likely' });
assert.equal(d7['2026-11-17'].kind, 'cloudy', 'a slight chance is not shown as rain');
// beyond: NOAA normals, by the nearest station
const ty = typical('fairfield', new Date('2026-11-20T15:00:00Z'), 3);
assert.equal(ty.station, 'Bridgeport');
assert.deepEqual(Object.keys(ty.days), ['2026-11-20', '2026-11-21', '2026-11-22']);
assert.ok(ty.days['2026-11-20'].hi > ty.days['2026-11-20'].lo && ty.days['2026-11-20'].pop > 0);
assert.deepEqual(typical('hartford', new Date('2026-11-20T15:00:00Z'), 1).days['2026-11-20'], { hi: 50, lo: 32, pop: 34, snow: 5 });
assert.equal(typical('new-london', new Date('2026-11-20T15:00:00Z'), 1).days['2026-11-20'].snow, null, 'Groton keeps no snow normals');
assert.equal(await bookingForecast({ area: 'hartford', date: 'Tue Nov 10 2026', window: 'Midday · 11am–2pm' }, fakeNws),
  'Midday 11am-2pm: 43-45°F, Rain, 70% chance of precipitation');
assert.equal(await bookingForecast({ area: 'hartford', date: 'Tue Dec 01 2026', window: 'Midday · 11am–2pm' }, fakeNws),
  'More than 6 days out at booking: no forecast yet');
assert.equal(await bookingForecast({ area: 'hartford', date: 'Tue Nov 10 2026', window: 'Midday' }, async () => { throw new Error('down'); }),
  'Midday 11am-2pm: 43-45°F, Rain, 70% chance of precipitation', 'NWS down: the last good forecast is used');


// the owner's push for a new booking
const bookingPushes = [];
deps.fetch = async (url, opts) => {
  if (String(url).startsWith('https://ntfy.sh')) { bookingPushes.push(JSON.parse(opts.body)); return { ok: true, status: 200 }; }
  return fakeNws(url);
};
s = fake();
r = await webhook(hook(payload, real.webhooks.generateTestHeaderString({ payload, secret })), s, secret, 'owner-topic');
assert.equal((await r.json()).result, 'confirmed');
assert.equal(bookingPushes.length, 1);
assert.equal(bookingPushes[0].topic, 'owner-topic');
assert.equal(bookingPushes[0].title, 'New booking · Full Detail + Ceramic Coating (5-seat SUV)');
assert.match(bookingPushes[0].message, /^CAL-AB12CD · Malik Test · Enfield\nTue Nov 10 2026, Morning\n\$100 deposit paid · est\. \$1,421 total\n2019 Honda CR-V\nSalt neutralizer included\nForecast: Morning 8-11am/);
assert.deepEqual(bookingPushes[0].actions.map((a) => a.label), ['Text Malik', 'Payment', 'Draft invoice']);
assert.match(decodeURIComponent(bookingPushes[0].actions[0].url), /Texts may come from \(888\) 297-9548, \(203\) 592-9589 or \(203\) 560-3572, all are us\.$/);
// ntfy down: the booking still confirms
deps.fetch = async (url) => (String(url).startsWith('https://ntfy.sh') ? { ok: false, status: 500 } : fakeNws(url));
r = await webhook(hook(payload, real.webhooks.generateTestHeaderString({ payload, secret })), fake(), secret, 'owner-topic');
assert.equal((await r.json()).result, 'confirmed', 'a failed push never fails a booking');
deps.fetch = fakeNws;

// retried event: nothing created twice
s = fake();
s.paymentIntents.retrieve = async () => ({ id: 'pi_1', metadata: { balance_invoice: 'in_1' } });
r = await webhook(hook(payload, real.webhooks.generateTestHeaderString({ payload, secret })), s, secret);
assert.equal((await r.json()).result, 'already-done');
assert.equal(s.calls.length, 0);

// unpaid (delayed method) waits for async_payment_succeeded
const unpaid = JSON.stringify({ ...event, data: { object: { ...event.data.object, payment_status: 'unpaid' } } });
r = await webhook(hook(unpaid, real.webhooks.generateTestHeaderString({ payload: unpaid, secret })), fake(), secret);
assert.equal((await r.json()).result, 'waiting');

// ---- merch waitlist
const wl = (body, origin = 'https://cipherautolab.com') => new Request('https://cipherautolab.com/api/merch-waitlist', {
  method: 'POST', headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': '9.9.9.' + Math.random() }, body: JSON.stringify(body) });
const signup = { name: 'Ana Ruiz', email: 'Ana@Example.com', phone: '', items: 'tee-black,hoodie-salt,snapback', size: 'L' };
assert.deepEqual(parseSignup(signup).entry.items, ['tee-black', 'hoodie-salt'], 'the snapback is clients-only, not on the list');
assert.equal(parseSignup({ ...signup, email: '', phone: '' }).error, 'Add an email or a mobile number so we can tell you.');
assert.equal(parseSignup({ ...signup, size: 'XXXL' }).error, 'Pick a size.');
assert.equal(parseSignup({ ...signup, email: "x'@y.com" }).error, 'That email doesn\u2019t look right.');
s = fake();
r = await joinWaitlist(wl(signup), s);
assert.equal(r.status, 200);
assert.equal(s.calls[0][0], 'customers.search');
assert.equal(s.calls[0][1].query, "email:'ana@example.com'");
const made = s.calls.find((c) => c[0] === 'customers.create');
assert.equal(made[1].email, 'ana@example.com');
assert.equal(made[1].metadata.merch_waitlist, 'yes');
assert.equal(made[1].metadata.merch_items, 'tee-black,hoodie-salt');
assert.equal(made[1].metadata.merch_size, 'L');
// already a customer (booked a detail): tagged, items merged, nothing new created
s = fake();
s.customers.search = async (q) => { s.calls.push(['customers.search', q]); return { data: [{ id: 'cus_old', name: 'Ana Ruiz', phone: null, metadata: { merch_items: 'tee-lime', merch_joined: '2026-11-01' } }] }; };
r = await joinWaitlist(wl({ ...signup, phone: '203 555 0100' }), s);
const upd = s.calls.find((c) => c[0] === 'customers.update');
assert.equal(upd[1], 'cus_old');
assert.equal(upd[2].metadata.merch_items, 'tee-lime,tee-black,hoodie-salt');
assert.equal(upd[2].metadata.merch_joined, '2026-11-01');
assert.equal(upd[2].phone, '+12035550100');
assert.ok(!s.calls.some((c) => c[0] === 'customers.create'));
// phone only
s = fake();
await joinWaitlist(wl({ ...signup, email: '', phone: '+1 (203) 555-0100' }), s);
assert.equal(s.calls[0][1].query, "phone:'+12035550100'");
assert.equal((await joinWaitlist(wl(signup, 'https://evil.example'), fake())).status, 403);
assert.equal((await joinWaitlist(wl(signup), null)).status, 503);

// ---- morning weather check
watchDeps.now = () => new Date('2026-11-09T12:00:00Z');                  // 7am in CT, Mon Nov 9
const pushes = [];
watchDeps.fetch = async (url, opts) => {
  if (String(url).startsWith('https://ntfy.sh')) { pushes.push(JSON.parse(opts.body)); return { ok: true, status: 200 }; }
  return fakeNws(url);
};
const pis = [
  { id: 'pi_rain', metadata: { booking_status: 'deposit_received', booking_ref: 'CAL-RAIN01', customer_name: 'Ana Ruiz', phone: '2035550100', town: 'Enfield', area: 'hartford', date: 'Tue Nov 10 2026', window: 'Midday · 11am–2pm', service: 'Full Detail (5-seat SUV)' } },
  { id: 'pi_dry', metadata: { booking_status: 'deposit_received', booking_ref: 'CAL-DRY001', area: 'hartford', date: 'Tue Nov 10 2026', window: 'Morning · 8–11am' } },
  { id: 'pi_told', metadata: { booking_status: 'deposit_received', booking_ref: 'CAL-TOLD01', area: 'hartford', date: 'Tue Nov 10 2026', window: 'Afternoon · 2–5pm', weather_alert_sent: '2026-11-09' } },
  { id: 'pi_garage', metadata: { booking_status: 'deposit_received', booking_ref: 'CAL-GAR001', area: 'hartford', date: 'Tue Nov 10 2026', window: 'Midday · 11am–1pm', garage: 'yes' } },
  { id: 'pi_inside', metadata: { booking_status: 'deposit_received', booking_ref: 'CAL-INT001', area: 'hartford', date: 'Tue Nov 10 2026', window: 'Midday · 11am–2pm', package_key: 'interior' } },
  { id: 'pi_far', metadata: { booking_status: 'deposit_received', booking_ref: 'CAL-FAR001', area: 'hartford', date: 'Mon Nov 30 2026', window: 'Midday · 11am–2pm' } },
];
s = fake();
s.paymentIntents.search = async (q) => { s.calls.push(['pi.search', q]); return { data: pis, has_more: false }; };
const env = { NTFY_TOPIC: 'cipher-test-topic', CRON_SECRET: 'cron-test' };
const cron = (q = '', auth = 'Bearer cron-test') => new Request('https://cipherautolab.com/api/weather-watch' + q, { headers: { authorization: auth } });
assert.equal((await watch(cron('', 'Bearer nope'), s, env)).status, 403, 'only Vercel Cron when CRON_SECRET is set');
r = await watch(cron(), s, env);
const out2 = await r.json();
assert.equal(out2.checked, 5, 'the Nov 30 booking is outside the next 3 days');
assert.deepEqual(out2.alerted, ['CAL-RAIN01'], 'one push: dry window skipped, already-told skipped');
assert.deepEqual(out2.clear, ['CAL-DRY001', 'CAL-GAR001', 'CAL-INT001'], 'rain does not stop a garage job or an interior detail');
assert.equal(pushes.length, 1);
assert.equal(pushes[0].topic, 'cipher-test-topic');
assert.equal(pushes[0].title, 'Rain 70% · Tue, Nov 10, 11am–2pm');
assert.match(pushes[0].message, /CAL-RAIN01 · Ana Ruiz · Enfield/);
assert.equal(pushes[0].priority, 4);
assert.equal(pushes[0].actions[0].label, 'Text Ana');
assert.match(decodeURIComponent(pushes[0].actions[0].url), /^sms:\+12035550100\?&body=Hi Ana, it's Cipher Auto Lab\. The forecast shows a 70% chance of rain/);
assert.deepEqual(s.calls.find((c) => c[0] === 'pi.update').slice(1), ['pi_rain', { metadata: { weather_alert_sent: '2026-11-09', weather_alert: 'Rain 70% (2026-11-10 midday)' } }]);
assert.equal((await watch(cron('?test=1'), s, env)).status, 200);
assert.equal(pushes.at(-1).title, 'Cipher weather alerts are on');
assert.equal((await watch(cron(), s, { CRON_SECRET: 'cron-test' })).status, 503, 'no topic yet');
const noSecret = (ua) => new Request('https://cipherautolab.com/api/weather-watch?test=1', { headers: { 'user-agent': ua } });
assert.equal((await watch(noSecret('Mozilla/5.0'), s, { NTFY_TOPIC: 't' })).status, 403, 'without a secret only Vercel Cron runs it');
const before = pushes.length;
assert.equal((await watch(noSecret('vercel-cron/1.0'), s, { NTFY_TOPIC: 't' })).status, 200);
assert.ok(pushes.every((p, i) => i < before || p.title !== 'Cipher weather alerts are on'), 'no test pushes without a secret');
assert.ok(!risky({ kind: 'cloudy', pop: 20 }) && risky({ kind: 'rain', pop: 40 }) && risky({ kind: 'snow', pop: 50 }) && risky({ kind: 'cloudy', pop: 60 }));

console.log('all Stripe function tests passed');

// ---- the engineered day, server side
const bk2 = parseBooking({ ...booking, paintKey: '', packageKey: 'full', addons: 'extract,leather,iron', garage: 'yes', date: 'Fri Dec 04 2026' }).booking;
assert.equal(bk2.garage, 'yes');
assert.equal(parseBooking({ ...booking, garage: 'maybe' }).booking.garage, 'no');
assert.equal(jobMinutes(bk2), 300 + 60 + 45 + 45);
assert.equal(jobMinutes(parseBooking(booking).booking), 0, 'paint work is a full day, not a minute count');
assert.ok(saltSeason('Fri Dec 04 2026') && saltSeason('Tue Mar 30 2027') && !saltSeason('Thu Apr 01 2027') && !saltSeason('Sat Oct 31 2026'));
let m2 = bookingMetadata(bk2);
assert.equal(m2.garage, 'yes'); assert.equal(m2.job_minutes, '450'); assert.equal(m2.salt_neutralizer, 'included');
assert.equal(bookingMetadata(parseBooking({ ...booking, paintKey: '', packageKey: 'interior', date: 'Fri Dec 04 2026' }).booking).salt_neutralizer, '', 'no exterior, no salt line');
assert.ok(Object.keys(m2).length <= 40, 'room left under Stripe\'s 50 metadata keys');
const sent = [];
deps.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: true, status: 200 }; };
await notifyBooking('t', { md: { ...m2, garage: 'no' }, ref: 'CAL-X', piId: 'pi_x', invoiceId: 'in_x', deposit: 40, total: 483,
  forecast: 'Morning 8-11am: 31-35°F, Sunny, 0% chance of precipitation' });
assert.match(sent[0].message, /\n~7h30 job · Rinseless day \(35°F or colder\) · Salt neutralizer included\nForecast:/);
await notifyBooking('t', { md: m2, ref: 'CAL-X', piId: 'pi_x', invoiceId: 'in_x', deposit: 40, total: 483, forecast: '' });
assert.match(sent[1].message, /~7h30 job · Garage OK \(wash or rinseless inside, can run to 6pm\) · Salt neutralizer included/);
deps.fetch = fakeNws;
console.log('engineered-day server tests passed');

// ---- the engineered day, in the browser (js/schedule.js)
await import('../js/schedule.js');
const SC = globalThis.CALSchedule;
assert.equal(SC.clock(SC.sunset('2026-11-20', 'hartford')), '4:27pm', 'NOAA sunset, within a couple of minutes of the almanac (4:25)');
assert.equal(SC.clock(SC.sunset('2027-06-21', 'hartford')), '8:28pm');
const day = (pkg, adds, o = {}) => SC.plan({ job: SC.job(pkg, adds), ymd: '2026-11-20', area: 'hartford', ...o });
const ws = (p) => Object.values(p.wins).map((w) => (w.ok ? w.label : '-')).join(' | ');
assert.equal(ws(day('full', [])), 'Morning · 8–11am | - | -', '5 hrs in November: morning only');
assert.equal(ws(day('full', ['shampoo', 'leather'])), 'Morning · 8–9:30am | - | -', 'arrival cut so it finishes before sunset');
assert.equal(ws(day('full', ['shampoo', 'leather'], { garage: true })), 'Morning · 8–11am | - | -');
assert.equal(ws(day('exterior', [], { garage: true })), 'Morning · 8–11am | Midday · 11am–2pm | Afternoon · 2–4pm', 'garage keeps 6pm');
assert.equal(ws(day('exterior', ['iron', 'clay', 'sealant'])), 'Morning · 8–11am | Midday · 11am–12:15pm | -');
assert.deepEqual(SC.job('interior', ['iron']), { ext: 0, int: 180, mins: 180, paint: false, outside: false }, 'outside add-ons need the exterior');
const big = day('full', ['shampoo', 'leather', 'stain', 'pethair', 'iron', 'clay', 'spray']);
assert.ok(big.two && big.wins.morning.label === 'Morning · 8–9am · 2 visits');
assert.equal(ws(SC.plan({ job: SC.job('full', [], 'ceramic'), ymd: '2026-11-20', area: 'hartford' })), 'Morning · 8–11am | - | -', 'paint work starts in the morning');
// weather for the hours outside: cold means rinseless, rain after the outside work doesn't count
const hrs = Array.from({ length: 14 }, (_, i) => [6 + i, 30 + i, i >= 7 ? 'rain' : 'clear', i >= 7 ? 70 : 0]);   // rain from 1pm
const wxd = { hourly: { '2026-11-20': hrs }, days: {}, typical: { station: 'Hartford-Bradley', days: {} } };
let pl = day('full', [], { data: wxd });
assert.ok(pl.wins.morning.cold, 'rinseless: 35°F or colder while outside');
assert.ok(!pl.wins.morning.wet, 'inside by 1pm: the rain is not our problem');
assert.ok(SC.notes(pl, 'morning').some((n) => n.kind === 'cold' && /engineered to not need a water hose/.test(n.text)));
assert.ok(SC.notes(pl, 'morning').some((n) => n.kind === 'salt'), 'November: salt neutralizer included');
pl = day('exterior', ['iron'], { data: wxd });
assert.ok(pl.wins.morning.wet && pl.wins.morning.dryBy === 615 && pl.wins.morning.wetAt === 780, 'arrive by 10:15 to beat 1pm rain');
assert.ok(!day('interior', [], { data: wxd }).wins.midday.wet, 'interior: rain is fine');
assert.ok(!day('exterior', [], { data: wxd, garage: true }).wins.afternoon.wet, 'garage: rain is fine');
pl = SC.plan({ job: SC.job('full', []), ymd: '2026-12-12', area: 'hartford', data: { hourly: {}, days: {}, typical: { station: 'Hartford-Bradley', days: { '2026-12-12': { hi: 42, lo: 26, pop: 33, snow: 9 } } } } });
assert.equal(pl.level, 'typical');
assert.match(SC.notes(pl, 'morning').find((n) => n.kind === 'far').text, /^Too far out for a forecast\. Typical for Dec 12 \(Hartford-Bradley\): high 42°, low 26°, rain or snow on about 1 in 3 days/);
assert.ok(!SC.plan({ job: SC.job('exterior', []), ymd: '2027-05-01', area: 'hartford' }).salt, 'no salt line in May');
console.log('schedule tests passed');

// ---- confirmation texts (Twilio, toll-free)
const sms = await import('../api/_sms.js');
assert.equal(sms.gsm('Midday · 11am–1:30pm “ok” 35°F'), 'Midday, 11am-1:30pm "ok" 35F');
const ctext = sms.confirmationText({ first: 'Ana', service: 'Full Detail', date: 'Tue Nov 17 2026', window: 'Morning · 8–9:30am', ref: 'CAL-AB12CD', deposit: 40 });
assert.equal(ctext, "Cipher Auto Lab: you're booked, Ana! Full Detail, Tue, Nov 17, Morning, 8-9:30am. Ref CAL-AB12CD. $40 deposit received. " +
  "We'll text your arrival time the day before. Questions? Text or call (203) 560-3572. Reply STOP to opt out.");
assert.ok(/^[\x20-\x7E]+$/.test(ctext) && ctext.length <= 306, 'plain GSM text, two segments at most');
assert.deepEqual(await sms.sendSms({}, '2035550100', 'hi'), { skipped: 'not configured' });
const tw = { TWILIO_ACCOUNT_SID: 'AC123', TWILIO_API_KEY: 'SK456', TWILIO_API_SECRET: 'sec', TWILIO_FROM: '+18885550100' };
let twCall;
const twFetch = async (url, o) => { twCall = { url, o }; return { ok: true, status: 201, json: async () => ({ sid: 'SM1' }) }; };
assert.deepEqual(await sms.sendSms(tw, '2035550100', 'Hi · there', twFetch), { sid: 'SM1' });
assert.equal(twCall.url, 'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
assert.equal(twCall.o.headers.Authorization, 'Basic ' + btoa('SK456:sec'), 'API key pair, not the auth token');
assert.equal(new URLSearchParams(twCall.o.body).toString(), 'To=%2B12035550100&From=%2B18885550100&Body=Hi%2C+there');
assert.deepEqual(await sms.sendSms(tw, '555', 'x', twFetch), { skipped: 'no number' });
await assert.rejects(sms.sendSms(tw, '2035550100', 'x', async () => ({ ok: false, status: 400, json: async () => ({ code: 21610 }) })), /twilio 400 21610/);
// in the webhook: texted, and the owner's push says so; a Twilio failure never fails the booking
for (const [twOk, line] of [[true, 'Confirmation texted to the customer'], [false, 'Confirmation text FAILED: text them yourself']]) {
  const pushed = [], texts = [];
  deps.env = tw;
  deps.fetch = async (url, o) => {
    if (String(url).startsWith('https://api.twilio.com')) { texts.push(new URLSearchParams(o.body).get('Body')); return twOk ? { ok: true, status: 201, json: async () => ({ sid: 'SM9' }) } : { ok: false, status: 500, json: async () => ({}) }; }
    if (String(url).startsWith('https://ntfy.sh')) { pushed.push(JSON.parse(o.body)); return { ok: true, status: 200 }; }
    return fakeNws(url);
  };
  s = fake();
  const ev = { ...event, id: 'evt_sms', data: { object: { ...event.data.object, metadata: { ...md, sms_opt_in: 'yes' } } } }, pl = JSON.stringify(ev);
  r = await webhook(hook(pl, real.webhooks.generateTestHeaderString({ payload: pl, secret })), s, secret, 'topic-x');
  assert.equal((await r.json()).result, 'confirmed');
  assert.equal(texts.length, 1);
  assert.match(texts[0], /^Cipher Auto Lab: you're booked, Malik! Full Detail \+ Ceramic Coating, Tue, Nov 10, Morning\. Ref CAL-AB12CD\. \$100 deposit received\./);
  assert.ok(pushed[0].message.endsWith(line));
}
// no tick in the texting box: no text, and the push says so
{
  const pushed = [], texts = [];
  deps.env = tw;
  deps.fetch = async (url, o) => {
    if (String(url).startsWith('https://api.twilio.com')) { texts.push(1); return { ok: true, status: 201, json: async () => ({ sid: 'SM9' }) }; }
    if (String(url).startsWith('https://ntfy.sh')) { pushed.push(JSON.parse(o.body)); return { ok: true, status: 200 }; }
    return fakeNws(url);
  };
  assert.equal(md.sms_opt_in, 'no', 'the box is never pre-ticked');
  const pl = JSON.stringify({ ...event, id: 'evt_nosms' });
  r = await webhook(hook(pl, real.webhooks.generateTestHeaderString({ payload: pl, secret })), fake(), secret, 'topic-x');
  assert.equal((await r.json()).result, 'confirmed');
  assert.equal(texts.length, 0);
  assert.ok(pushed[0].message.endsWith("No auto-texts: they didn't tick the texting box"));
}
assert.equal(parseBooking({ ...booking, smsOptIn: 'yes' }).booking.smsOptIn, 'yes');
assert.equal(bookingMetadata(parseBooking({ ...booking, smsOptIn: 'yes' }).booking).sms_opt_in, 'yes');
// the day-before reminder from the morning check: opted in, tomorrow, once
{
  const texts = [];
  watchDeps.now = () => new Date('2026-11-09T12:00:00Z');
  watchDeps.fetch = async (url, o) => {
    if (String(url).startsWith('https://api.twilio.com')) { texts.push(new URLSearchParams(o.body)); return { ok: true, status: 201, json: async () => ({ sid: 'SM7' }) }; }
    if (String(url).startsWith('https://ntfy.sh')) return { ok: true, status: 200 };
    return fakeNws(url);
  };
  const base = { booking_status: 'deposit_received', area: 'hartford', date: 'Tue Nov 10 2026', window: 'Morning · 8–11am', phone: '2035550100', package_key: 'full', paint_key: '' };
  const list = [
    { id: 'pi_r1', metadata: { ...base, booking_ref: 'CAL-REM001', sms_opt_in: 'yes' } },
    { id: 'pi_r2', metadata: { ...base, booking_ref: 'CAL-REM002', sms_opt_in: 'no' } },
    { id: 'pi_r3', metadata: { ...base, booking_ref: 'CAL-REM003', sms_opt_in: 'yes', reminder_sent: '2026-11-08' } },
    { id: 'pi_r4', metadata: { ...base, booking_ref: 'CAL-REM004', sms_opt_in: 'yes', date: 'Wed Nov 11 2026' } },
  ];
  s = fake();
  s.paymentIntents.search = async () => ({ data: list, has_more: false });
  const out = await (await watch(cron(), s, { ...env, ...tw })).json();
  assert.deepEqual(out.reminded, ['CAL-REM001'], 'opted in, tomorrow, not reminded yet');
  assert.equal(texts.length, 1);
  assert.equal(texts[0].get('To'), '+12035550100');
  assert.equal(texts[0].get('Body'), "Cipher Auto Lab: reminder, your Full Detail is tomorrow, Tue, Nov 10, Morning, 8-11am. " +
    "We'll text your exact arrival time later today. Questions? Text or call (203) 560-3572. Reply STOP to opt out.");
  assert.deepEqual(s.calls.filter((c) => c[0] === 'pi.update').map((c) => c.slice(1)).find((c) => c[0] === 'pi_r1'), ['pi_r1', { metadata: { reminder_sent: '2026-11-09' } }]);
}
deps.env = {}; deps.fetch = fakeNws;
console.log('sms tests passed');

// ---- replies to the booking line (Twilio inbound webhook)
const ib = await import('../api/sms-inbound.js');
// Twilio's documented example: signature for a known URL, token and body
assert.equal(ib.signature('12345', 'https://mycompany.com/myapp.php?foo=1&bar=2',
  new URLSearchParams({ CallSid: 'CA1234567890ABCDE', Caller: '+12349013030', Digits: '1234', From: '+12349013030', To: '+18005551212' })),
  '0/KCTR6DLpKmkAf8muzZqo1nDgQ=');
{
  const ienv = { TWILIO_AUTH_TOKEN: 'tok', TWILIO_ACCOUNT_SID: 'AC123', NTFY_TOPIC: 'topic-x' };
  const pushed = [];
  ib.deps.fetch = async (url, o) => { pushed.push(JSON.parse(o.body)); return { ok: true, status: 200 }; };
  const post = (fields, sig, url = 'https://cipherautolab.com/api/sms-inbound') => {
    const p = new URLSearchParams(fields);
    return new Request(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig ?? ib.signature('tok', 'https://cipherautolab.com/api/sms-inbound', p) }, body: p.toString() });
  };
  const fields = { AccountSid: 'AC123', From: '+12035550100', To: '+18885550100', Body: 'Can you come at 10 instead?' };
  const st = fake();
  st.paymentIntents.search = async (q) => { st.calls.push(['pi.search', q]); return { data: [{ metadata: { customer_name: 'Ana Ruiz', booking_ref: 'CAL-AB12CD', date: 'Tue Nov 17 2026' } }] }; };
  r = await ib.inbound(post(fields), ienv, st);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 'nothing is texted back');
  assert.equal(st.calls[0][1].query, "metadata['phone']:'2035550100'");
  assert.equal(pushed[0].title, 'Text to the booking line from Ana Ruiz');
  assert.equal(pushed[0].message, 'Ana Ruiz · CAL-AB12CD · Tue Nov 17 2026\n(203) 555-0100: "Can you come at 10 instead?"');
  assert.deepEqual(pushed[0].actions.map((a) => a.url), ['sms:+12035550100', 'tel:+12035550100']);
  assert.equal((await ib.inbound(post(fields, 'forged'), ienv, st)).status, 403, 'forged requests refused');
  assert.equal((await ib.inbound(post({ ...fields, AccountSid: 'ACother' }), ienv, st)).status, 403, 'other Twilio accounts refused');
  assert.equal((await ib.inbound(post(fields), { ...ienv, TWILIO_AUTH_TOKEN: '' }, st)).status, 503, 'refused until the token is set');
  r = await ib.inbound(post({ ...fields, Body: 'stop' }), ienv, null);
  assert.match(pushed.at(-1).message, /opted out of booking texts/);
  assert.equal(pushed.at(-1).title, 'Text to the booking line from (203) 555-0100');
  assert.equal((await ib.inbound(new Request('https://cipherautolab.com/api/sms-inbound'), ienv, st)).status, 405);
}
console.log('inbound sms tests passed');


// ---- gift cards
const giftMod = await import('../api/_gift.js');
const { createGift, parseGift } = await import('../api/create-gift-session.js');
const { giftCheck } = await import('../api/gift-check.js');
const cc = await import('../api/create-checkout-session.js');
assert.match(giftMod.newCode(), /^GC-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
assert.equal(giftMod.cleanCode(' gc 7kq2 mx9p '), 'GC-7KQ2-MX9P');
assert.equal(giftMod.cleanCode('GC-7KQ2-MX9'), '');
// buying one
const greq = (body, origin = 'https://cipherautolab.com') => new Request('https://cipherautolab.com/api/create-gift-session',
  { method: 'POST', headers: { origin, 'x-forwarded-for': '9.9.9.' + Math.random() }, body: JSON.stringify(body) });
const buy = { gift: 'g100', fromName: 'Malik', toName: 'Ana Ruiz', email: 'buyer@example.com', message: 'Happy holidays', amount: 1 };
s = fake();
r = await createGift(greq(buy), s, () => 'GC-TEST-0001');
assert.equal(r.status, 200);
const gs = s.calls[0][1];
assert.equal(gs.line_items[0].price_data.unit_amount, 10000, 'the amount comes from the server');
assert.match(gs.line_items[0].price_data.product_data.name, /\$100 gift card: code GC-TEST-0001$/);
assert.match(gs.line_items[0].price_data.product_data.description, /Never expires, no fees\.$/);
assert.deepEqual(gs.payment_intent_data.metadata, { kind: 'gift', gift_code: 'GC-TEST-0001', gift_kind: 'g100', gift_amount: '10000', gift_balance: '10000',
  gift_to: 'Ana Ruiz', gift_from: 'Malik', gift_message: 'Happy holidays', gift_status: 'active', campaign: '' });
assert.equal(gs.return_url, 'https://cipherautolab.com/gift?paid=1&session_id={CHECKOUT_SESSION_ID}');
assert.equal((await createGift(greq({ ...buy, gift: 'g999' }), fake())).status, 400);
assert.equal((await createGift(greq(buy, 'https://evil.example'), fake())).status, 403);
assert.match(parseGift({ ...buy, email: 'nope' }).error, /receipt with the gift code/);
assert.equal(GIFTS_full(), 25900);
function GIFTS_full() { return giftMod.GIFTS.full.amount * 100; }
// the paid card's details for the printable card
s = fake();
s.checkout.sessions.retrieve = async () => ({ status: 'complete', payment_status: 'paid', client_reference_id: 'GC-TEST-0001', amount_total: 10000, metadata: gs.metadata });
r = await checkoutStatus(new Request('https://x/api/checkout-status?session_id=cs_live_abcdefghijkl'), s);
assert.deepEqual((await r.json()).gift, { code: 'GC-TEST-0001', amount: 100, kind: 'g100', to: 'Ana Ruiz', from: 'Malik', message: 'Happy holidays' });
// a card in Stripe
const giftPI = (bal, extra = {}) => ({ id: 'pi_gift', status: 'succeeded', metadata: { kind: 'gift', gift_code: 'GC-TEST-0001', gift_amount: '10000', gift_balance: String(bal), gift_to: 'Ana', ...extra } });
const withGift = (bal, extra) => { const f = fake(); f.paymentIntents.search = async (q) => { f.calls.push(['pi.search', q]); return { data: [giftPI(bal, extra)] }; }; return f; };
const chk = (code) => new Request('https://cipherautolab.com/api/gift-check', { method: 'POST', headers: { origin: 'https://cipherautolab.com', 'x-forwarded-for': '7.7.7.' + Math.random() }, body: JSON.stringify({ code }) });
s = withGift(10000);
r = await giftCheck(chk('gc-test-0001'), s);
assert.deepEqual(await r.json(), { ok: true, code: 'GC-TEST-0001', balance: 100 });
assert.equal(s.calls[0][1].query, "metadata['gift_code']:'GC-TEST-0001'");
assert.equal((await (await giftCheck(chk('GC-TEST-0001'), withGift(0))).json()).error, 'That gift card has been used up.');
assert.equal((await giftCheck(chk('GC-TEST-0001'), fake())).status, 404);
assert.equal((await giftCheck(chk('hello'), fake())).status, 400);
{ const f = withGift(10000); f.paymentIntents.search = async () => ({ data: [{ ...giftPI(10000), status: 'requires_payment_method' }] });
  assert.equal((await giftCheck(chk('GC-TEST-0001'), f)).status, 404, 'an unpaid card is no card'); }

// booking with a card that covers the deposit: no payment, the booking is on its draft invoice
const gpush = [];
deps.env = {};
deps.fetch = async (url, o) => { if (String(url).startsWith('https://ntfy.sh')) { gpush.push(JSON.parse(o.body)); return { ok: true, status: 200 }; } return fakeNws(url); };
cc.deps.topic = () => 'topic-g';
const giftBooking = { ...booking, paintKey: '', packageKey: 'full', tier: 'sedan', addons: 'extract', giftCode: 'GC-TEST-0001', campaign: 'door', ref: 'CAL-GIFT01' };
s = withGift(10000);
r = await cc.createCheckout(req(giftBooking), s);
const gb = await r.json();
assert.deepEqual(gb, { booked: true, ref: 'CAL-GIFT01', giftApplied: 100, giftLeft: 0 });
assert.ok(!s.calls.some((c) => c[0] === 'sessions.create'), 'nothing to pay');
const gcred = s.calls.find((c) => c[0] === 'customers.credit');
assert.equal(gcred[1], 'cus_new'); assert.equal(gcred[2].amount, -10000, 'the card is credit, used after tax like a deposit');
const ginv = s.calls.find((c) => c[0] === 'invoices.create')[1];
assert.equal(ginv.metadata.booking_status, 'deposit_received');
assert.equal(ginv.metadata.paid_with, 'gift card');
assert.equal(ginv.metadata.campaign, 'door');
assert.equal(ginv.metadata.gift_code, 'GC-TEST-0001');
assert.equal(s.calls.filter((c) => c[0] === 'invoiceItems.create').length, 2);
assert.deepEqual(s.calls.find((c) => c[0] === 'pi.update').slice(1), ['pi_gift', { metadata: { gift_balance: '0', gift_used: 'CAL-GIFT01:10000' } }]);
assert.match(gpush[0].message, /No deposit: gift card · est\. \$358 total/);
assert.match(gpush[0].message, /Gift card GC-TEST-0001: \$100 applied, \$0 left on it/);
assert.match(gpush[0].message, /QR: Door hangers\nNeighbor offer: no travel fee if booked within 7 days/);
assert.ok(!gpush[0].actions.some((a) => a.label === 'Payment'));
// a bigger card on a cheaper job keeps the rest
s = withGift(50000);
await cc.createCheckout(req({ ...giftBooking, packageKey: 'exterior', addons: '', ref: 'CAL-GIFT02' }), s);
assert.equal(s.calls.find((c) => c[0] === 'customers.credit')[2].amount, -10900);
assert.equal(s.calls.find((c) => c[0] === 'pi.update')[2].metadata.gift_balance, '39100');
// used twice for the same booking (a double tap): spent once
s = withGift(39100, { gift_used: 'CAL-GIFT02:10900' });
await cc.createCheckout(req({ ...giftBooking, packageKey: 'exterior', addons: '', ref: 'CAL-GIFT02' }), s);
assert.equal(s.calls.find((c) => c[0] === 'customers.credit')[2].amount, -10900, 'same credit, same idempotency key');
assert.ok(!s.calls.some((c) => c[0] === 'pi.update'), 'balance not taken twice');
// a card that is used up, or unknown
assert.equal((await cc.createCheckout(req(giftBooking), withGift(0))).status, 400);
// a card smaller than the deposit: the deposit is taken, the card comes off when it lands
s = withGift(5000);
r = await cc.createCheckout(req({ ...giftBooking, paintKey: 'ceramic', ref: 'CAL-GIFT03' }), s);
assert.ok((await r.json()).clientSecret);
const gmd = s.calls.find((c) => c[0] === 'sessions.create')[1].metadata;
assert.equal(gmd.gift_code, 'GC-TEST-0001');
s = withGift(5000);
s.paymentIntents.retrieve = async () => ({ id: 'pi_dep', metadata: {} });
const gev = { id: 'evt_g', type: 'checkout.session.completed', data: { object: { id: 'cs_g', payment_status: 'paid', payment_intent: 'pi_dep', customer: 'cus_1', amount_total: 10000, client_reference_id: 'CAL-GIFT03', metadata: gmd } } };
const gpl = JSON.stringify(gev);
r = await webhook(hook(gpl, real.webhooks.generateTestHeaderString({ payload: gpl, secret })), s, secret, 'topic-g');
assert.equal((await r.json()).result, 'confirmed');
const credits = s.calls.filter((c) => c[0] === 'customers.credit').map((c) => c[2].amount);
assert.deepEqual(credits, [-10000, -5000], 'deposit, then the gift card');
assert.match(gpush.at(-1).message, /Gift card GC-TEST-0001: \$50 applied, \$0 left on it/);
// a gift card sale tells the owner
s = fake();
const sold = { id: 'evt_s', type: 'checkout.session.completed', data: { object: { id: 'cs_s', payment_status: 'paid', payment_intent: 'pi_s', amount_total: 25900, metadata: { ...gs.metadata, gift_kind: 'full', gift_amount: '25900' } } } };
const spl = JSON.stringify(sold);
r = await webhook(hook(spl, real.webhooks.generateTestHeaderString({ payload: spl, secret })), s, secret, 'topic-g');
assert.equal((await r.json()).result, 'gift');
assert.ok(!s.calls.some((c) => c[0] === 'invoices.create'), 'not a booking');
assert.equal(gpush.at(-1).title, 'Gift card sold · $259');
assert.match(gpush.at(-1).message, /^GC-TEST-0001 · Full Detail gift card\nFor Ana Ruiz, from Malik\n"Happy holidays"$/);
// the morning check sees gift card bookings too (they live on the draft invoice)
{
  watchDeps.now = () => new Date('2026-11-09T12:00:00Z');
  const sent = [];
  watchDeps.fetch = async (url, o) => { if (String(url).startsWith('https://ntfy.sh')) { sent.push(JSON.parse(o.body)); return { ok: true, status: 200 }; } return fakeNws(url); };
  s = fake();
  s.invoices.search = async (q) => { s.calls.push(['invoices.search', q]); return { data: [{ id: 'in_g', metadata: { booking_status: 'deposit_received', booking_ref: 'CAL-GIFT01', area: 'hartford', date: 'Tue Nov 10 2026', window: 'Afternoon · 2–4pm', customer_name: 'Ana Ruiz', phone: '2035550100' } }], has_more: false }; };
  const out = await (await watch(new Request('https://cipherautolab.com/api/weather-watch', { headers: { authorization: 'Bearer cron-test' } }), s, { NTFY_TOPIC: 't', CRON_SECRET: 'cron-test' })).json();
  assert.deepEqual(out.alerted, ['CAL-GIFT01']);
  assert.deepEqual(s.calls.find((c) => c[0] === 'invoices.update').slice(1, 2), ['in_g'], 'the alert is noted on the invoice');
  assert.equal(sent[0].actions.at(-1).url, 'https://dashboard.stripe.com/invoices/in_g');
}
deps.fetch = fakeNws;
console.log('gift card tests passed');

// ---- channels: the data engine
const chm = await import('../api/_channels.js');
const met = await import('../api/_metrics.js');
const trk = await import('../api/track.js');
const rep = await import('../api/channel-report.js');
assert.equal(chm.channel('door').label, 'Door hangers');
assert.deepEqual([chm.channel('Door-Enfield-Elm-1118').id, chm.channel('door-enfield-elm-1118').type, chm.channel('door-enfield-elm-1118').label],
  ['door-enfield-elm-1118', 'door', 'Door hanger · enfield elm 1118']);
assert.equal(chm.channel('evil'), null); assert.equal(chm.channel('door hanger'), null); assert.equal(chm.channel('door-' + 'x'.repeat(30)), null);
{
  const b = parseBooking({ ...booking, campaign: 'door-enfield-elm-1118', firstCampaign: 'magnet', firstSeen: '2026-11-10', area: 'hartford' }).booking;
  const m = bookingMetadata(b);
  assert.deepEqual([m.campaign, m.campaign_type, m.first_campaign, m.first_seen, m.county], ['door-enfield-elm-1118', 'door', 'magnet', '2026-11-10', 'Hartford County']);
  assert.equal(m.est_value, '142100', 'what the job is worth, tax included, in cents');
  assert.equal(bookingMetadata(parseBooking({ ...booking, campaign: 'evil', firstSeen: 'yesterday' }).booking).campaign, '');
  assert.ok(Object.keys(m).length <= 42, 'room left under Stripe\'s 50 metadata keys for what the webhook adds');
}
// counting: Upstash pipeline, counts only
{
  const sent = [];
  const kv = { KV_REST_API_URL: 'https://kv.example/', KV_REST_API_TOKEN: 'tok' };
  const kfetch = async (url, o) => { sent.push({ url, auth: o.headers.Authorization, cmds: JSON.parse(o.body) }); return { ok: true, status: 200, json: async () => [{ result: 1 }] }; };
  assert.equal(await met.bump({}, { e: 'scan', ch: 'door' }, kfetch), false, 'off without Redis');
  assert.equal(await met.bump(kv, { e: 'scan', ch: 'door', place: 'Enfield, CT', day: '2026-11-18' }, kfetch), true);
  assert.deepEqual(sent[0], { url: 'https://kv.example/pipeline', auth: 'Bearer tok', cmds: [['HINCRBY', 'cal:d:2026-11-18', 'scan|door', 1], ['HINCRBY', 'cal:g:2026-11-18', 'scan|door|Enfield, CT', 1]] });
  assert.equal(await met.bump(kv, { e: 'scan', ch: 'door' }, async () => { throw new Error('down'); }), false, 'a failed count never throws');
  const rd = await met.readDays(kv, ['2026-11-18'], async () => ({ ok: true, json: async () => [{ result: ['scan|door', '3', 'start|door', '1'] }, { result: ['scan|door|Enfield, CT', '3'] }] }));
  assert.deepEqual(rd, { '2026-11-18': { totals: { 'scan|door': 3, 'start|door': 1 }, places: { 'scan|door|Enfield, CT': 3 } } });
  const H = (o) => ({ get: (k) => o[k] ?? null });
  assert.equal(met.placeOf(H({ 'x-vercel-ip-country': 'US', 'x-vercel-ip-country-region': 'CT', 'x-vercel-ip-city': 'Windsor%20Locks' })), 'Windsor Locks, CT');
  assert.equal(met.placeOf(H({ 'x-vercel-ip-country': 'CA' })), 'CA');
  // the beacon endpoint
  sent.length = 0; trk.deps.fetch = kfetch;
  const beacon = (body, h = {}) => new Request('https://cipherautolab.com/api/track', { method: 'POST',
    headers: { origin: 'https://cipherautolab.com', 'user-agent': 'Mozilla/5.0 (iPhone)', 'x-forwarded-for': '5.5.5.' + Math.random(),
      'x-vercel-ip-country': 'US', 'x-vercel-ip-country-region': 'CT', 'x-vercel-ip-city': 'Enfield', ...h }, body: JSON.stringify(body) });
  assert.equal((await trk.track(beacon({ e: 'scan', ch: 'door-enfield-elm-1118' }), kv)).status, 204);
  assert.deepEqual(sent[0].cmds[1], ['HINCRBY', `cal:g:${met.etDay()}`, 'scan|door-enfield-elm-1118|Enfield, CT', 1]);
  assert.equal((await trk.track(beacon({ e: 'scan', ch: 'evil' }), kv)).status, 400);
  assert.equal((await trk.track(beacon({ e: 'scan', ch: 'door' }, { origin: 'https://evil.example' }), kv)).status, 403);
  const before = sent.length;
  assert.equal((await trk.track(beacon({ e: 'scan', ch: 'door' }, { 'user-agent': 'facebookexternalhit/1.1' }), kv)).status, 204);
  assert.equal(sent.length, before, 'link previews are not scans');
  assert.equal((await trk.track(beacon({ e: 'start', ch: '' }), kv)).status, 204);
  assert.deepEqual(sent.at(-1).cmds[0], ['HINCRBY', `cal:d:${met.etDay()}`, 'start|direct', 1]);
}
// the report: channels, towns, places, bookings, daily
{
  const ts = (d) => Math.floor(Date.parse(d + 'T15:00:00Z') / 1000);
  const pi = (ref, day, md, amt = 4000) => ({ id: 'pi_' + ref, created: ts(day), amount: amt, amount_received: amt, metadata: { booking_ref: ref, booking_status: 'deposit_received', ...md } });
  const payments = [
    pi('A', '2026-11-18', { campaign: 'door-enfield-elm-1118', first_campaign: 'door-enfield-elm-1118', first_seen: '2026-11-18', town: 'Enfield', zip: '06082', county: 'Hartford County', est_value: '25900', date: 'Sat Nov 21 2026', package_key: 'full', tier: 'sedan', window: 'Morning · 8–11am' }),
    pi('B', '2026-11-19', { campaign: 'door-enfield-elm-1118', first_campaign: 'magnet', first_seen: '2026-11-12', town: 'Enfield', zip: '06082', county: 'Hartford County', est_value: '10900', date: 'Mon Nov 23 2026' }, 2500),
    pi('C', '2026-11-19', { town: 'Milford', zip: '06460', county: 'New Haven County', est_value: '16900', date: 'Tue Nov 24 2026' }, 3000),
    pi('OLD', '2026-09-01', { campaign: 'door', town: 'Enfield', est_value: '10900', date: 'Sat Sep 05 2026' }),
  ];
  const giftBookings = [{ id: 'in_G', created: ts('2026-11-20'), metadata: { booking_ref: 'G', campaign: 'work-acme', town: 'Hartford', county: 'Hartford County', est_value: '25900', date: 'Fri Nov 27 2026' } }];
  const giftSales = [{ id: 'pi_gs', created: ts('2026-11-20'), amount: 10000, amount_received: 10000, metadata: { kind: 'gift', campaign: 'fb' } }];
  const counts = { '2026-11-18': { totals: { 'scan|door-enfield-elm-1118': 9, 'start|door-enfield-elm-1118': 3 }, places: { 'scan|door-enfield-elm-1118|Enfield, CT': 8, 'scan|door-enfield-elm-1118|Suffield, CT': 1 } },
                   '2026-11-19': { totals: { 'scan|door-enfield-elm-1118': 1, 'scan|work-acme': 4, 'start|work-acme': 2 }, places: {} } };
  const rb = rep.buildReport({ since: '2026-11-15', until: '2026-11-20', counts, payments, giftBookings, giftSales });
  const door = rb.channels.find((c) => c.channel === 'door-enfield-elm-1118');
  assert.deepEqual([door.scans, door.starts, door.bookings, door.first_touch_bookings, door.booked_value, door.deposits, door.scan_to_book_pct, door.label],
    [10, 3, 2, 1, 368, 65, 20, 'Door hanger · enfield elm 1118']);
  assert.equal(door.avg_days_to_book, 3.5, 'scan on the 18th booked same day; magnet on the 12th booked on the 19th');
  assert.equal(rb.channels.find((c) => c.channel === 'work-acme').bookings, 1, 'gift card bookings count for their channel');
  assert.equal(rb.channels.find((c) => c.channel === 'direct').bookings, 1);
  assert.equal(rb.channels.find((c) => c.channel === 'fb').gift_value, 100);
  assert.ok(!rb.bookings.some((b) => b.ref === 'OLD'), 'outside the range');
  assert.ok(!Object.keys(rb.bookings[0]).some((k) => /name|phone|address|email/.test(k)), 'no personal details in the engine');
  assert.deepEqual(rb.towns[0], { town: 'Enfield', county: 'Hartford County', zips: '06082', bookings: 2, booked_value: 368, channels: 'Door hanger · enfield elm 1118 (2)' });
  assert.deepEqual(rb.places[0], { channel: 'door-enfield-elm-1118', channel_label: 'Door hanger · enfield elm 1118', place: 'Enfield, CT', scans: 8, starts: 0 });
  assert.deepEqual(rb.daily.find((d) => d.day === '2026-11-19'), { day: '2026-11-19', scans: 5, starts: 2, bookings: 2, booked_value: 278, gift_cards: 0 });
  assert.equal(rb.bookings[0].lead_days, 3);
  // the endpoint: key, CSV
  s = fake();
  s.paymentIntents.search = async (q) => ({ data: q.query.includes("'gift'") ? giftSales : payments, has_more: false });
  s.invoices.search = async () => ({ data: giftBookings, has_more: false });
  const rq = (q) => new Request('https://cipherautolab.com/api/channel-report' + q);
  assert.equal((await rep.report(rq(''), s, {})).status, 503, 'needs REPORT_KEY');
  assert.equal((await rep.report(rq('?key=nope'), s, { REPORT_KEY: 'rk-test-1234' })).status, 403);
  r = await rep.report(rq('?key=rk-test-1234&since=2026-11-15&until=2026-11-20'), s, { REPORT_KEY: 'rk-test-1234' });
  const jr = await r.json();
  assert.equal(jr.scans_counted, false); assert.equal(jr.bookings.length, 4);
  r = await rep.report(rq('?key=rk-test-1234&since=2026-11-15&until=2026-11-20&format=csv&table=towns'), s, { REPORT_KEY: 'rk-test-1234' });
  assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.match(await r.text(), /^town,county,zips,bookings,booked_value,channels\nEnfield,Hartford County,06082,2,368,Door hanger · enfield elm 1118 \(2\)\n/);
  // forgiving table names and formats (a hand-typed link must not dead-end)
  for (const [raw, want] of [['channels', 'channels'], ['Channels', 'channels'], ['channel', 'channels'], ['channels.', 'channels'], [' towns ', 'towns'],
    ['Town', 'towns'], ['place', 'places'], ['booking', 'bookings'], ['day', 'daily'], ['Daily', 'daily'], ['', 'channels'], ['zzz', 'channels'], [null, 'channels']]) {
    assert.equal(rep.pickTable(raw), want, `table ${raw}`);
  }
  assert.equal(rep.pickFormat('CSV', ''), 'csv'); assert.equal(rep.pickFormat('', 'text/html,application/xhtml+xml'), 'html');
  assert.equal(rep.pickFormat('', '*/*'), 'json'); assert.equal(rep.pickFormat('json', 'text/html'), 'json');
  r = await rep.report(rq('?key=rk-test-1234&since=2026-11-15&until=2026-11-20&format=csv&table=Channel'), s, { REPORT_KEY: 'rk-test-1234' });
  assert.equal(r.status, 200); assert.match(await r.text(), /^channel,type,type_label,label,/);
  // in a browser: a passcode screen, then a signed-in cookie; the key never sits in the page or its links
  const auth = await import('../api/_report-auth.js');
  rep.deps.sleep = async () => {};
  const KEY = 'rk-test&<1234>-long-random', ENV = { REPORT_KEY: KEY, REPORT_PASSCODE: '482915', NTFY_TOPIC: 'topic-x' };
  const hq = (q, h = {}) => new Request('https://cipherautolab.com/api/channel-report' + q, { headers: { accept: 'text/html', ...h } });
  const post = (q, body, h = {}) => new Request('https://cipherautolab.com/api/channel-report' + q, { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://cipherautolab.com', 'x-real-ip': '198.51.100.7', ...h }, body: new URLSearchParams(body).toString() });
  const ck = (res) => (res.headers.get('set-cookie') || '').split(';')[0];
  // not signed in: the screen, not the data
  r = await rep.report(hq('?days=30'), s, ENV);
  assert.equal(r.status, 401); let html = await r.text();
  assert.ok(html.includes('Enter your passcode') && html.includes('action="/api/channel-report?days=30"') && html.includes('autocomplete="current-password"'));
  assert.ok(!html.includes('Door hanger') && !/<script/i.test(html) && !/\sstyle=/.test(html) && !/\son[a-z]+=/.test(html), 'no data, CSP-clean');
  assert.equal((await rep.report(rq('?format=csv'), s, ENV)).status, 403, 'scripts without the key get nothing');
  // wrong passcode: the screen again, a count, and no cookie
  auth._resetMemory();
  r = await rep.report(post('?days=30', { passcode: '000000', remember: '1' }), s, ENV);
  assert.equal(r.status, 401); assert.match(await r.text(), /didn&#39;t match/); assert.equal(r.headers.get('set-cookie'), null);
  // a form from another site is refused
  assert.equal((await rep.report(post('', { passcode: '482915' }, { origin: 'https://evil.example' }), s, ENV)).status, 403);
  assert.equal((await rep.report(post('', { passcode: '482915' }, { origin: 'null', 'sec-fetch-site': 'cross-site' }), s, ENV)).status, 403);
  assert.equal((await rep.report(post('', { passcode: '482915' }, { origin: 'null', 'sec-fetch-site': 'same-origin' }), s, ENV)).status, 303, 'a browser that hides the origin but says same-origin');
  // right passcode: back to the same dates, signed in for 30 days
  r = await rep.report(post('?days=30', { passcode: '482916', remember: '1' }), s, ENV);
  assert.equal(r.status, 401, 'one digit off');
  assert.equal((await rep.report(post('', { passcode: ' 482915 ' }), s, ENV)).status, 303, 'spaces around it are ignored');
  r = await rep.report(post('?days=30', { passcode: '482915', remember: '1' }), s, ENV);
  assert.equal(r.status, 303); assert.equal(r.headers.get('location'), '/api/channel-report?days=30');
  const sc = r.headers.get('set-cookie');
  assert.match(sc, /^cal_report=[0-9a-z]+\.[A-Za-z0-9_-]{43}; Path=\/api\/channel-report; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/);
  const cookie = ck(r);
  r = await rep.report(hq('?since=2026-11-15&until=2026-11-20', { cookie: 'other=1; ' + cookie }), s, ENV);
  assert.equal(r.status, 200); assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow');
  const page = await r.text();
  assert.ok(!/<script/i.test(page) && !/\sstyle=/.test(page) && !/\son[a-z]+=/.test(page), 'CSP-clean page');
  assert.ok(page.includes('href="/api/channel-report?days=30"') && !page.includes('key='), 'links hold no key');
  assert.ok(page.includes('name="signout"'));
  assert.ok(page.includes('Door hanger · enfield elm 1118') && page.includes('Enfield') && page.includes('first saw magnet, 7 days before'));
  assert.ok(page.includes('Full Detail') && page.includes('sedan or coupe'), 'service names, not codes');
  assert.ok(page.includes('QR opens are not being counted'), 'says when Upstash is not connected');
  assert.ok(!/Business cards</.test(page) && /Magnets</.test(page), 'channels with nothing in the dates are left off the page; first-touch-only ones stay');
  assert.ok(!/test@|Malik|203555/.test(page));
  r = await rep.report(hq('?days=30', { cookie }), s, ENV);
  assert.match(await r.text(), /days=30" aria-current="page"/, 'days=30 is the last 30 days');
  r = await rep.report(new Request('https://cipherautolab.com/api/channel-report?format=csv&table=towns', { headers: { cookie } }), s, ENV);
  assert.equal(r.status, 200, 'spreadsheet downloads ride on the cookie');
  // "keep me signed in" off: a browser-session cookie
  r = await rep.report(post('', { passcode: '482915' }), s, ENV);
  assert.ok(!/Max-Age/.test(r.headers.get('set-cookie')));
  // forged, expired, or from before a passcode change: signed out
  const [, exp, sig] = cookie.match(/=([0-9a-z]+)\.(.+)$/);
  assert.equal(auth.signedIn(ENV, `cal_report=${(parseInt(exp, 36) + 9e9).toString(36)}.${sig}`), false, 'a longer date breaks the signature');
  assert.equal(auth.signedIn(ENV, `cal_report=${exp}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`), false, 'a changed signature');
  assert.equal(auth.signedIn(ENV, cookie, Date.now() + 31 * 864e5), false, 'expires');
  assert.equal(auth.signedIn({ ...ENV, REPORT_PASSCODE: '771204' }, cookie), false, 'changing the passcode signs everyone out');
  assert.equal(auth.signedIn({ ...ENV, REPORT_KEY: 'another-key' }, cookie), false);
  assert.equal(auth.signedIn(ENV, cookie), true);
  // a passcode shorter than 6 is ignored: the key is the passcode until it is fixed
  assert.equal(auth.passcodeOf({ REPORT_KEY: KEY, REPORT_PASSCODE: '1234' }), KEY);
  assert.equal(auth.passcodeOf({ REPORT_KEY: KEY }), KEY);
  // an old link with the key: signs in and drops the key from the address bar
  r = await rep.report(hq('?key=' + encodeURIComponent(KEY) + '&days=7'), s, ENV);
  assert.equal(r.status, 303); assert.equal(r.headers.get('location'), '/api/channel-report?days=7'); assert.match(r.headers.get('set-cookie'), /^cal_report=/);
  r = await rep.report(hq('?key=wrong'), s, ENV); assert.equal(r.status, 401, 'a wrong key gets the passcode screen');
  // scripts can still use the key
  r = await rep.report(new Request('https://cipherautolab.com/api/channel-report?format=csv', { headers: { authorization: 'Bearer ' + KEY } }), s, ENV);
  assert.equal(r.status, 200);
  // sign out
  r = await rep.report(post('?days=30', { signout: '1' }, { cookie }), s, ENV);
  assert.equal(r.status, 303); assert.match(r.headers.get('set-cookie'), /^cal_report=; Path=\/api\/channel-report; Max-Age=0/);
  // lockout: 5 wrong from one connection -> locked, the owner's phone is warned once; others still get in
  auth._resetMemory();
  const pushes = []; rep.deps.fetch = async (u, o) => { if (String(u).includes('ntfy')) pushes.push(JSON.parse(o.body)); return new Response('{}'); };
  for (let i = 0; i < 5; i++) assert.equal((await rep.report(post('', { passcode: 'guess' + i }), s, ENV)).status, 401);
  r = await rep.report(post('', { passcode: '482915' }), s, ENV);
  assert.equal(r.status, 429, 'locked even with the right passcode'); assert.match(await r.text(), /Too many wrong tries/);
  assert.equal(pushes.length, 1); assert.match(pushes[0].message, /5 wrong passcodes from one connection/); assert.equal(pushes[0].topic, 'topic-x');
  assert.equal((await rep.report(post('', { passcode: '482915' }, { 'x-real-ip': '203.0.113.9' }), s, ENV)).status, 303, 'another connection is not locked');
  // 20 wrong from anywhere -> locked for everyone
  auth._resetMemory();
  for (let i = 0; i < 20; i++) await rep.report(post('', { passcode: 'g' + i }, { 'x-real-ip': '10.0.0.' + i }), s, ENV);
  assert.equal((await rep.report(post('', { passcode: '482915' }, { 'x-real-ip': '10.9.9.9' }), s, ENV)).status, 429);
  assert.ok(pushes.some((p) => /20 wrong passcodes in the last hour/.test(p.message)));
  // with Upstash connected the counts live in Redis (shared by every server), keyed by a hash, not the address
  auth._resetMemory(); const db = new Map(), seen = [];
  rep.deps.fetch = async (u, o) => {
    if (String(u).includes('ntfy')) return new Response('{}');
    const out = JSON.parse(o.body).map(([c, k]) => { seen.push(k); if (c === 'INCR') { db.set(k, (db.get(k) || 0) + 1); return { result: db.get(k) }; }
      if (c === 'GET') return { result: db.has(k) ? String(db.get(k)) : null }; if (c === 'DEL') { db.delete(k); return { result: 1 }; } return { result: 1 }; });
    return Response.json(out);
  };
  const RENV = { ...ENV, KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 't' };
  for (let i = 0; i < 5; i++) await rep.report(post('', { passcode: 'x' + i }), s, RENV);
  assert.equal((await rep.report(post('', { passcode: '482915' }), s, RENV)).status, 429);
  assert.ok(seen.every((k) => !String(k).includes('198.51.100.7')), 'no raw address stored');
  assert.ok([...db.keys()].some((k) => /^cal:pass:ip:[0-9a-f]{24}$/.test(k)));
  rep.deps.fetch = (...a) => fetch(...a);
}
console.log('channel engine tests passed');

// ---- Black Friday 2026 (api/_promo.js): bonus cards on gift sales, bonus redemption, spring ceramic lock-in
{
  const promo = await import('../api/_promo.js');
  const gsMod = await import('../api/create-gift-session.js');
  const T = (iso) => () => Date.parse(iso);
  deps.env = {};
  deps.fetch = async (url, o) => { if (String(url).startsWith('https://ntfy.sh')) { gpush.push(JSON.parse(o.body)); return { ok: true, status: 200 }; } return fakeNws(url); };
  // the window: Thanksgiving midnight to the end of Cyber Monday, Connecticut time
  assert.equal(promo.bfOn(Date.parse('2026-11-26T04:59:59Z')), false, 'Wednesday 11:59pm ET');
  assert.equal(promo.bfOn(Date.parse('2026-11-26T05:00:00Z')), true, 'Thanksgiving midnight ET');
  assert.equal(promo.bfOn(Date.parse('2026-12-01T04:59:59Z')), true, 'Cyber Monday 11:59pm ET');
  assert.equal(promo.bfOn(Date.parse('2026-12-01T05:00:00Z')), false);
  assert.deepEqual([50, 100, 150, 259].map(promo.bonusFor), [10, 20, 30, 50]);
  // the page's copy of the dates matches the server's
  const fs = await import('node:fs');
  const pageJs = fs.readFileSync(new URL('../js/promo.js', import.meta.url), 'utf8');
  for (const k of ['start', 'end', 'bonusFrom', 'bonusUntil', 'ceramicFrom', 'ceramicUntil']) assert.ok(pageJs.includes(`'${promo.BF[k]}'`), `js/promo.js has ${k} ${promo.BF[k]}`);
  assert.ok(pageJs.includes(`ceramicOff: ${promo.BF.ceramicOff}`) && pageJs.includes(`bonusPct: ${promo.BF.bonusPct}`));
  // codes
  assert.match(giftMod.newCode('BF'), /^BF-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(giftMod.cleanCode('bf 7kq2 mx9p'), 'BF-7KQ2-MX9P');
  assert.equal(giftMod.cleanCode('GC-BF7K-Q2MX'), 'GC-BF7K-Q2MX', 'a gift code whose letters start BF stays a gift code');
  assert.equal(giftMod.cardName('BF-7KQ2-MX9P'), 'Bonus card'); assert.equal(giftMod.cardName('GC-7KQ2-MX9P'), 'Gift card');

  // buying a gift card in the window: a bonus code on the same payment and receipt; outside it, none
  const mk = (p) => (p === 'BF' ? 'BF-BONU-S001' : 'GC-TEST-0002');
  gsMod.deps.now = T('2026-11-27T15:00:00Z');
  s = fake();
  r = await createGift(greq({ ...buy, gift: 'full', campaign: 'fb-bf' }), s, mk);
  assert.deepEqual(Object.fromEntries(Object.entries(await r.json()).filter(([k]) => k !== 'clientSecret' && k !== 'sessionId')), { amount: 259, bonus: 50 });
  const bfs = s.calls[0][1];
  assert.deepEqual(Object.fromEntries(['promo', 'bonus_code', 'bonus_amount', 'bonus_balance', 'bonus_from', 'bonus_until', 'campaign'].map((k) => [k, bfs.payment_intent_data.metadata[k]])),
    { promo: 'bf2026', bonus_code: 'BF-BONU-S001', bonus_amount: '5000', bonus_balance: '5000', bonus_from: '2027-01-01', bonus_until: '2027-03-31', campaign: 'fb-bf' });
  assert.match(bfs.line_items[0].price_data.product_data.description, /Never expires, no fees\. Black Friday bonus for you: card BF-BONU-S001, worth \$50, good on any detail done Jan 1 to Mar 31, 2027\.$/);
  assert.equal(bfs.line_items[0].price_data.unit_amount, 25900, 'the gift card is full price');
  gsMod.deps.now = T('2026-12-01T05:00:01Z');
  s = fake(); r = await createGift(greq(buy), s, mk);
  assert.equal((await r.json()).bonus, undefined); assert.equal(s.calls[0][1].metadata.bonus_code, undefined, 'after Cyber Monday: no bonus');
  gsMod.deps.now = () => Date.now();
  // the success page gets the bonus card once paid
  s = fake();
  s.checkout.sessions.retrieve = async () => ({ status: 'complete', payment_status: 'paid', client_reference_id: 'GC-TEST-0002', amount_total: 25900, metadata: bfs.metadata });
  r = await checkoutStatus(new Request('https://x/api/checkout-status?session_id=cs_live_abcdefghijkl'), s);
  assert.deepEqual((await r.json()).gift.bonus, { code: 'BF-BONU-S001', amount: 50, from: '2027-01-01', until: '2027-03-31' });
  // the owner's push names the bonus
  s = fake();
  const bsold = { id: 'evt_bs', type: 'checkout.session.completed', data: { object: { id: 'cs_bs', payment_status: 'paid', payment_intent: 'pi_bs', amount_total: 25900, metadata: bfs.metadata } } };
  const bspl = JSON.stringify(bsold);
  r = await webhook(hook(bspl, real.webhooks.generateTestHeaderString({ payload: bspl, secret })), s, secret, 'topic-g');
  assert.match(gpush.at(-1).message, /\nBlack Friday bonus for the buyer: BF-BONU-S001 \(\$50, 2027-01-01 to 2027-03-31\)$/);

  // a bonus card in Stripe: found by its own code, spent from its own balance, only on Jan 1 - Mar 31 details
  const bonusPI = (bal, extra = {}) => ({ id: 'pi_gift2', status: 'succeeded', metadata: { kind: 'gift', gift_code: 'GC-TEST-0002', gift_amount: '25900', gift_balance: '25900', gift_from: 'Malik',
    bonus_code: 'BF-BONU-S001', bonus_amount: '5000', bonus_balance: String(bal), bonus_from: '2027-01-01', bonus_until: '2027-03-31', ...extra } });
  const withBonus = (bal, extra) => { const f = fake(); f.paymentIntents.search = async (q) => { f.calls.push(['pi.search', q]); return { data: [bonusPI(bal, extra)] }; }; return f; };
  s = withBonus(5000);
  r = await giftCheck(chk('bf-bonu-s001'), s);
  assert.deepEqual(await r.json(), { ok: true, code: 'BF-BONU-S001', balance: 50, bonus: true, from: '2027-01-01', until: '2027-03-31', range: 'Jan 1 to Mar 31, 2027' });
  assert.equal(s.calls[0][1].query, "metadata['bonus_code']:'BF-BONU-S001'");
  assert.equal((await (await giftCheck(chk('BF-BONU-S001'), withBonus(0))).json()).error, 'That bonus card has been used up.');
  { const f = fake(); f.paymentIntents.search = async () => ({ data: [bonusPI(5000, { bonus_code: 'BF-OTHE-R001' })] });
    assert.equal((await giftCheck(chk('BF-BONU-S001'), f)).status, 404, 'the code must match exactly'); }
  const bonusBooking = { ...booking, paintKey: '', packageKey: 'exterior', tier: 'sedan', addons: '', giftCode: 'BF-BONU-S001', ref: 'CAL-BONUS1' };
  // a December day: refused, nothing booked or charged
  s = withBonus(5000);
  r = await cc.createCheckout(req({ ...bonusBooking, date: 'Sat Dec 12 2026' }), s);
  assert.equal(r.status, 400); assert.match((await r.json()).error, /bonus card: it works on details done Jan 1 to Mar 31, 2027/);
  assert.ok(!s.calls.some((c) => ['sessions.create', 'invoices.create', 'customers.create'].includes(c[0])));
  r = await cc.createCheckout(req({ ...bonusBooking, date: 'Thu Apr 01 2027' }), withBonus(5000));
  assert.equal(r.status, 400, 'April 1 is past the end');
  // January: $50 covers the $25 deposit, so it books with no payment; the bonus balance is what's spent
  s = withBonus(5000);
  r = await cc.createCheckout(req({ ...bonusBooking, date: 'Sat Jan 16 2027' }), s);
  assert.deepEqual(await r.json(), { booked: true, ref: 'CAL-BONUS1', giftApplied: 50, giftLeft: 0 });
  assert.deepEqual(s.calls.find((c) => c[0] === 'pi.update').slice(1), ['pi_gift2', { metadata: { bonus_balance: '0', bonus_used: 'CAL-BONUS1:5000' } }]);
  assert.equal(s.calls.find((c) => c[0] === 'customers.credit')[2].description, 'Bonus card BF-BONU-S001 (CAL-BONUS1)');
  assert.match(s.calls.find((c) => c[0] === 'invoices.create')[1].description, /Bonus card BF-BONU-S001 is credited/);
  assert.match(gpush.at(-1).message, /Bonus card BF-BONU-S001: \$50 applied, \$0 left on it/);
  // a $10 bonus doesn't cover a deposit: the deposit is taken, the bonus comes off when it lands
  s = withBonus(1000);
  r = await cc.createCheckout(req({ ...bonusBooking, date: 'Sat Mar 27 2027', ref: 'CAL-BONUS2' }), s);
  assert.ok((await r.json()).clientSecret);
  assert.equal(s.calls.find((c) => c[0] === 'sessions.create')[1].metadata.gift_code, 'BF-BONU-S001');
  // the gift card itself works any day, Black Friday or not
  assert.ok((await (await cc.createCheckout(req({ ...giftBooking, giftCode: 'GC-TEST-0001', date: 'Sat Dec 12 2026', ref: 'CAL-GIFT09' }), withGift(10000))).json()).booked);

  // spring ceramic lock-in: booked in the window for Mar 1 - May 31: $100 off on the invoice
  const cer = { ...booking, packageKey: 'exterior', paintKey: 'ceramic', tier: 'sedan', addons: '', giftCode: '', ref: 'CAL-CERA01', date: 'Sat Apr 10 2027' };
  cc.deps.now = T('2026-11-28T16:00:00Z');
  s = fake(); r = await cc.createCheckout(req(cer), s);
  const cmd = s.calls.find((c) => c[0] === 'sessions.create')[1].metadata;
  assert.equal(cmd.promo, 'bf2026-ceramic');
  assert.equal(cmd.est_value, String(94900 - 10000), 'ceramic $949 (exterior wash folded in), less $100');
  assert.equal(s.calls.find((c) => c[0] === 'sessions.create')[1].line_items[0].price_data.unit_amount, 10000, 'the $100 deposit is unchanged');
  const lines = invoiceLines({ ...parseBooking(cer).booking, promo: 'bf2026-ceramic' });
  assert.deepEqual(lines.at(-1), { tax_code: 'txcd_20080003', description: 'Black Friday ceramic lock-in (spring install)', amount: -10000 });
  for (const [why, b, now] of [['a December day', { ...cer, date: 'Sat Dec 12 2026' }, '2026-11-28T16:00:00Z'], ['June', { ...cer, date: 'Tue Jun 01 2027' }, '2026-11-28T16:00:00Z'],
    ['not ceramic', { ...cer, paintKey: 'gloss' }, '2026-11-28T16:00:00Z'], ['booked after Cyber Monday', cer, '2026-12-01T06:00:00Z'], ['booked before Thanksgiving', cer, '2026-11-25T12:00:00Z']]) {
    cc.deps.now = T(now); s = fake(); await cc.createCheckout(req({ ...b, ref: 'CAL-CERA0' + why.length }), s);
    assert.equal(s.calls.find((c) => c[0] === 'sessions.create')[1].metadata.promo, '', `no lock-in: ${why}`);
  }
  assert.equal(parseBooking({ ...cer, promo: 'bf2026-ceramic' }).booking.promo, '', 'the page cannot claim it');
  // when the deposit lands, the invoice carries the credit and the push says so
  cc.deps.now = T('2026-11-28T16:00:00Z');
  s = fake(); await cc.createCheckout(req(cer), s);
  const cmeta = s.calls.find((c) => c[0] === 'sessions.create')[1].metadata;
  s = fake(); s.paymentIntents.retrieve = async () => ({ id: 'pi_cer', metadata: {} });
  const cev = { id: 'evt_c', type: 'checkout.session.completed', data: { object: { id: 'cs_c', payment_status: 'paid', payment_intent: 'pi_cer', customer: 'cus_1', amount_total: 10000, client_reference_id: 'CAL-CERA01', metadata: cmeta } } };
  const cpl = JSON.stringify(cev);
  r = await webhook(hook(cpl, real.webhooks.generateTestHeaderString({ payload: cpl, secret })), s, secret, 'topic-g');
  assert.equal((await r.json()).result, 'confirmed');
  const items = s.calls.filter((c) => c[0] === 'invoiceItems.create').map((c) => c[1]);
  assert.deepEqual(items.at(-1), { customer: 'cus_1', invoice: items.at(-1).invoice, description: 'Black Friday ceramic lock-in (spring install)', currency: 'usd', amount: -10000, tax_code: 'txcd_20080003', tax_behavior: 'inclusive' });
  assert.match(gpush.at(-1).message, /\nBlack Friday ceramic lock-in: \$100 off \(on the invoice\)/);
  cc.deps.now = () => Date.now();
}
{ const ch = await import('../api/_channels.js');
  assert.equal(ch.channel('van').label, 'Van rear window sign', 'the Odyssey rear window QR');
  assert.equal(ch.channel('van-odyssey').typeLabel, 'Van sign'); }
console.log('black friday tests passed');
