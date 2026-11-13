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
    },
    customers: { update: rec('customers.update', {}), createBalanceTransaction: rec('customers.credit', {}),
                 search: rec('customers.search', { data: [] }), create: rec('customers.create', { id: 'cus_new' }) },
    invoices: { create: rec('invoices.create', { id: 'in_1' }) },
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
assert.match(decodeURIComponent(bookingPushes[0].actions[0].url), /Texts may come from \(203\) 592-9589 or \(203\) 560-3572, both are us\.$/);
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
