// GET /api/channel-report?key=<REPORT_KEY>[&since=YYYY-MM-DD][&until=YYYY-MM-DD][&format=csv&table=channels|towns|places|bookings|daily]
// The data engine's read side: every marketing channel (printed QR codes, links) with what it brought,
// joined from the scan counts (api/_metrics.js) and the bookings and gift cards in Stripe.
//   channels  one row per channel: scans, booking starts, bookings, booked value, deposits, gift cards,
//             conversion at each step, and cost per booking for channels with a cost in api/_channels.js
//   towns     bookings by town and county (where the work is)
//   places    QR opens and booking starts by channel and the approximate place they were opened
//   bookings  one row per booking, without names, phones or addresses: channel, first channel, town,
//             ZIP, county, service, value, lead time, days from first scan to booking
//   daily     the funnel day by day
// JSON by default (all tables), CSV for one table. Needs REPORT_KEY in Vercel (Sensitive), sent as
// ?key= or "Authorization: Bearer". Scan counts need Upstash Redis connected; bookings work without it.
import Stripe from 'stripe';
import { timingSafeEqual } from 'node:crypto';
import { channel, REGISTRY, TYPES } from './_channels.js';
import { readDays, etDay, metricsOn } from './_metrics.js';

export const deps = { fetch: (...a) => fetch(...a) };   // tests swap this

const DAY = 864e5;
const isDay = (s) => /^20\d\d-\d\d-\d\d$/.test(String(s || ''));
function same(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); }
function daysBetween(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DAY); }
function dayList(since, until) { const out = []; for (let t = Date.parse(since + 'T12:00:00Z'); t <= Date.parse(until + 'T12:00:00Z'); t += DAY) out.push(new Date(t).toISOString().slice(0, 10)); return out; }
function ymdOf(text) { const d = new Date(text || ''); return isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const dollars = (c) => Math.round(+c || 0) / 100;
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

async function searchAll(stripe, where, query) {
  const out = []; let page = null;
  do {
    const res = await stripe[where].search({ query, limit: 100, ...(page ? { page } : {}) });
    out.push(...(res.data || []));
    page = res.has_more ? res.next_page : null;
  } while (page && out.length < 5000);
  return out;
}

/** Build every table for [since, until]. Pure apart from the reads it is handed. */
export function buildReport({ since, until, counts, payments, giftBookings, giftSales }) {
  const inRange = (d) => d && d >= since && d <= until;
  const label = (id) => (id === 'direct' ? 'Direct (no QR code or link)' : (channel(id) || { label: id }).label);
  const type = (id) => (id === 'direct' ? 'direct' : (channel(id) || { type: '' }).type);

  // one row per booking, without personal details
  const bookings = [...payments.map((o) => ({ o, paid: 'Deposit' })), ...giftBookings.map((o) => ({ o, paid: 'Gift card' }))]
    .map(({ o, paid }) => {
      const m = o.metadata || {}, booked = etDay(new Date((o.created || 0) * 1000)), job = ymdOf(m.date);
      const ch = channel(m.campaign) ? m.campaign : 'direct';
      return {
        ref: m.booking_ref || o.id, booked_day: booked, job_day: job, channel: ch, channel_type: type(ch), channel_label: label(ch),
        first_channel: channel(m.first_campaign) ? m.first_campaign : ch, first_seen: isDay(m.first_seen) ? m.first_seen : '',
        days_to_book: isDay(m.first_seen) ? daysBetween(m.first_seen, booked) : '', lead_days: job ? daysBetween(booked, job) : '',
        town: m.town || '', zip: m.zip || '', county: m.county || '', area: m.area || '',
        service: m.package_key || '', paint: m.paint_key || '', size: m.tier || '', addons: (m.addons || '').split(',').filter(Boolean).length,
        window: String(m.window || '').split(' ')[0], garage: m.garage === 'yes' ? 'yes' : 'no', texts: m.sms_opt_in === 'yes' ? 'yes' : 'no',
        booked_from: m.booking_source === 'menu' ? 'Detail Menu' : 'Website', paid_with: paid,
        est_value: dollars(m.est_value), deposit: paid === 'Deposit' ? dollars(o.amount_received || o.amount) : 0,
      };
    })
    .filter((b) => inRange(b.booked_day))
    .sort((a, b) => a.booked_day.localeCompare(b.booked_day));

  const gifts = giftSales.map((p) => ({ day: etDay(new Date((p.created || 0) * 1000)), ch: channel((p.metadata || {}).campaign) ? p.metadata.campaign : 'direct', amount: dollars(p.amount_received || p.amount) }))
    .filter((g) => inRange(g.day));

  // counters
  const days = dayList(since, until), funnel = {}, places = {};
  for (const d of days) {
    const c = counts[d] || { totals: {}, places: {} };
    for (const [f, n] of Object.entries(c.totals)) { const [e, ch] = f.split('|'); ((funnel[ch] = funnel[ch] || {})[e] = (funnel[ch][e] || 0) + n); }
    for (const [f, n] of Object.entries(c.places)) {
      const [e, ch, place] = f.split('|'); if (e !== 'scan' && e !== 'start') continue;
      const k = ch + '|' + place; const p = (places[k] = places[k] || { channel: ch, channel_label: label(ch), place, scans: 0, starts: 0 });
      p[e === 'scan' ? 'scans' : 'starts'] += n;
    }
  }

  // channels
  const ids = new Set([...Object.keys(funnel), ...bookings.map((b) => b.channel), ...gifts.map((g) => g.ch), ...Object.keys(REGISTRY)]);
  const channels = [...ids].map((id) => {
    const bs = bookings.filter((b) => b.channel === id), gs = gifts.filter((g) => g.ch === id), f = funnel[id] || {};
    const reg = REGISTRY[id] || {}, value = bs.reduce((a, b) => a + b.est_value, 0);
    const cost = typeof reg.cost === 'number' ? reg.cost : null;
    return {
      channel: id, type: type(id), type_label: id === 'direct' ? 'Direct' : TYPES[type(id)] || '', label: label(id),
      printed: reg.printed || '', qty: reg.qty ?? '', cost: cost ?? '',
      scans: f.scan || 0, starts: f.start || 0, bookings: bs.length, first_touch_bookings: bookings.filter((b) => b.first_channel === id).length,
      booked_value: Math.round(value * 100) / 100, deposits: Math.round(bs.reduce((a, b) => a + b.deposit, 0) * 100) / 100,
      gift_cards: gs.length, gift_value: Math.round(gs.reduce((a, g) => a + g.amount, 0) * 100) / 100,
      scan_to_start_pct: pct(f.start || 0, f.scan || 0), start_to_book_pct: pct(bs.length, f.start || 0), scan_to_book_pct: pct(bs.length, f.scan || 0),
      cost_per_booking: cost !== null && bs.length ? Math.round((cost / bs.length) * 100) / 100 : '',
      avg_days_to_book: bs.filter((b) => b.days_to_book !== '').length ? Math.round(bs.reduce((a, b) => a + (+b.days_to_book || 0), 0) / bs.filter((b) => b.days_to_book !== '').length * 10) / 10 : '',
    };
  }).sort((a, b) => b.bookings - a.bookings || b.scans - a.scans || a.channel.localeCompare(b.channel));

  // towns (where the work is)
  const townMap = {};
  for (const b of bookings) {
    const k = b.town || '(no town)';
    const t = (townMap[k] = townMap[k] || { town: k, county: b.county, zips: new Set(), bookings: 0, booked_value: 0, channels: {} });
    t.bookings++; t.booked_value += b.est_value; if (b.zip) t.zips.add(b.zip); t.channels[b.channel_label] = (t.channels[b.channel_label] || 0) + 1;
  }
  const towns = Object.values(townMap).map((t) => ({ town: t.town, county: t.county, zips: [...t.zips].join(' '), bookings: t.bookings,
    booked_value: Math.round(t.booked_value * 100) / 100, channels: Object.entries(t.channels).map(([k, v]) => `${k} (${v})`).join('; ') }))
    .sort((a, b) => b.bookings - a.bookings || a.town.localeCompare(b.town));

  const daily = days.map((d) => {
    const c = (counts[d] || { totals: {} }).totals, sum = (e) => Object.entries(c).filter(([f]) => f.startsWith(e + '|')).reduce((a, [, n]) => a + n, 0);
    const bs = bookings.filter((b) => b.booked_day === d);
    return { day: d, scans: sum('scan'), starts: sum('start'), bookings: bs.length, booked_value: Math.round(bs.reduce((a, b) => a + b.est_value, 0) * 100) / 100,
      gift_cards: gifts.filter((g) => g.day === d).length };
  });

  return { channels, towns, places: Object.values(places).sort((a, b) => b.scans - a.scans), bookings, daily };
}

function csv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}

export async function report(request, stripe, env) {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
  if (!env.REPORT_KEY) return Response.json({ error: 'REPORT_KEY is not set' }, { status: 503 });
  const url = new URL(request.url);
  const given = url.searchParams.get('key') || (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!same(given, env.REPORT_KEY)) return Response.json({ error: 'Forbidden' }, { status: 403 });
  if (!stripe) return Response.json({ error: 'payments_off' }, { status: 503 });

  const today = etDay();
  const until = isDay(url.searchParams.get('until')) ? url.searchParams.get('until') : today;
  let since = isDay(url.searchParams.get('since')) ? url.searchParams.get('since') : etDay(new Date(Date.now() - 89 * DAY));
  if (daysBetween(since, until) > 365) since = etDay(new Date(Date.parse(until + 'T12:00:00Z') - 365 * DAY));
  if (since > until) return Response.json({ error: 'since is after until' }, { status: 400 });

  const q = "metadata['booking_status']:'deposit_received'";
  const [counts, payments, giftBookings, giftSales] = await Promise.all([
    readDays(env, dayList(since, until), deps.fetch).catch(() => ({})),
    searchAll(stripe, 'paymentIntents', q),
    searchAll(stripe, 'invoices', q),
    searchAll(stripe, 'paymentIntents', "metadata['kind']:'gift' AND status:'succeeded'"),
  ]);
  const tables = buildReport({ since, until, counts, payments, giftBookings, giftSales });
  const headers = { 'Cache-Control': 'no-store' };
  const table = url.searchParams.get('table') || 'channels';
  if (url.searchParams.get('format') === 'csv') {
    if (!tables[table]) return Response.json({ error: 'table is one of ' + Object.keys(tables).join(', ') }, { status: 400 });
    return new Response(csv(tables[table]), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="cipher-${table}-${since}-to-${until}.csv"` } });
  }
  return Response.json({ since, until, scans_counted: metricsOn(env), generated: new Date().toISOString(), ...tables }, { headers });
}

let client = null;
export default {
  fetch(request) {
    if (!client && process.env.STRIPE_SECRET_KEY) client = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
    return report(request, client, process.env);
  },
};
