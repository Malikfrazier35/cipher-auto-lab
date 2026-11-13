// GET /api/weather-watch  (run every morning by Vercel Cron, see vercel.json)
// Checks every confirmed booking in the next 3 days against the National Weather Service forecast
// for its window. When rain, snow or storms are a real chance, it sends a push to the owner's
// phone through ntfy (free app, no account), with one tap to text the customer about moving.
// Each booking alerts at most once a day, so a repeated run never repeats a push.
//
// Needs NTFY_TOPIC in Vercel (the private topic the ntfy app subscribes to). Optional CRON_SECRET:
// when set, only Vercel Cron (which sends it) can run the check, and
// /api/weather-watch?test=1 with  Authorization: Bearer <CRON_SECRET>  sends one test push.
import Stripe from 'stripe';
import { AREAS, forecast } from './_weather.js';
import { push as send } from './_notify.js';

const WINDOW_KEY = { Morning: 'morning', Midday: 'midday', Afternoon: 'afternoon' };
const WINDOW_TEXT = { morning: '8–11am', midday: '11am–2pm', afternoon: '2–5pm' };
const DAYS_AHEAD = 3;

export const deps = { fetch: (...a) => fetch(...a), now: () => new Date() };   // tests swap these

function etYmd(d) {           // calendar date in Connecticut
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function ymdOf(text) {        // "Tue Nov 17 2026" -> "2026-11-17"
  const d = new Date(text || '');
  if (isNaN(d)) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function risky(w) {
  return !!w && (((w.kind === 'rain' || w.kind === 'snow' || w.kind === 'storm') && w.pop >= 40) || w.pop >= 60);
}

function push(topic, msg) { return send(topic, msg, deps.fetch); }

export async function watch(request, stripe, env) {
  // With CRON_SECRET set, only Vercel Cron (which sends it) gets in. Without it, only requests that
  // look like Vercel Cron, and no test pushes: the check itself never repeats a push in a day.
  const auth = request.headers.get('authorization') || '', ua = request.headers.get('user-agent') || '';
  const trusted = env.CRON_SECRET ? auth === `Bearer ${env.CRON_SECRET}` : /vercel-cron/i.test(ua);
  if (!trusted) return Response.json({ error: 'Forbidden' }, { status: 403 });
  if (!env.NTFY_TOPIC) return Response.json({ error: 'NTFY_TOPIC is not set' }, { status: 503 });
  const url = new URL(request.url);

  if (url.searchParams.get('test') === '1' && env.CRON_SECRET) {
    await push(env.NTFY_TOPIC, { title: 'Cipher weather alerts are on', tags: 'white_check_mark',
      message: 'Every morning: any booking in the next 3 days with a real chance of rain or snow shows up here.' });
    return Response.json({ ok: true, test: true });
  }
  if (!stripe) return Response.json({ error: 'payments_off' }, { status: 503 });

  const today = etYmd(deps.now());
  const last = etYmd(new Date(deps.now().getTime() + DAYS_AHEAD * 864e5));

  // confirmed bookings (deposit paid), soonest first
  const bookings = [];
  let page = null;
  do {
    const res = await stripe.paymentIntents.search({ query: "metadata['booking_status']:'deposit_received'", limit: 100, ...(page ? { page } : {}) });
    for (const pi of res.data || []) {
      const md = pi.metadata || {}, ymd = ymdOf(md.date), win = WINDOW_KEY[String(md.window || '').split(' ')[0]];
      if (ymd && win && ymd >= today && ymd <= last) bookings.push({ pi, md, ymd, win, area: AREAS[md.area] ? md.area : 'hartford' });
    }
    page = res.has_more ? res.next_page : null;
  } while (page);

  const forecasts = {}, sent = [], clear = [];
  for (const b of bookings.sort((x, y) => x.ymd.localeCompare(y.ymd))) {
    if (!(b.area in forecasts)) forecasts[b.area] = await forecast(b.area, deps.fetch).catch(() => null);
    const w = forecasts[b.area] && forecasts[b.area].windows[b.ymd] && forecasts[b.area].windows[b.ymd][b.win];
    // rain doesn't stop a garage job or an interior detail; snow and storms still matter (the drive there)
    const sheltered = b.md.garage === 'yes' || b.md.package_key === 'interior';
    if (!risky(w) || (sheltered && w.kind !== 'snow' && w.kind !== 'storm')) { clear.push(b.md.booking_ref); continue; }
    if ((b.md.weather_alert_sent || '') === today) continue;          // already told you today

    const what = w.kind === 'snow' ? 'Snow' : w.kind === 'storm' ? 'Storms' : 'Rain';
    const day = new Date(b.md.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    const first = (b.md.customer_name || '').split(' ')[0] || 'there';
    const sms = `Hi ${first}, it's Cipher Auto Lab. The forecast shows a ${w.pop}% chance of ${what.toLowerCase()} for your detail on ${day} (${WINDOW_TEXT[b.win]}). ` +
      'Want to keep it, or move to a drier day? Moving is free.';
    const actions = [
      ...(b.md.phone ? [{ action: 'view', label: `Text ${first}`, url: `sms:+1${b.md.phone}?&body=${encodeURIComponent(sms)}` }] : []),
      { action: 'view', label: 'Open in Stripe', url: `https://dashboard.stripe.com/payments/${b.pi.id}` },
    ];
    await push(env.NTFY_TOPIC, {
      title: `${what} ${w.pop}% · ${day}, ${WINDOW_TEXT[b.win]}`,
      message: `${b.md.booking_ref || ''} · ${b.md.customer_name || ''} · ${b.md.town || ''}\n${w.lo === w.hi ? w.hi : w.lo + '–' + w.hi}°F, ${w.label}. ` +
        `${b.md.service || ''}`.trim(),
      priority: w.pop >= 70 ? 4 : 3,
      tags: w.kind === 'snow' ? 'snowflake' : w.kind === 'storm' ? 'zap' : 'umbrella',
      actions,
    });
    await stripe.paymentIntents.update(b.pi.id, { metadata: { weather_alert_sent: today, weather_alert: `${what} ${w.pop}% (${b.ymd} ${b.win})` } });
    sent.push(b.md.booking_ref);
  }
  return Response.json({ checked: bookings.length, alerted: sent, clear });
}

let client = null;
export default {
  fetch(request) {
    if (!client && process.env.STRIPE_SECRET_KEY) client = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
    return watch(request, client, process.env);
  },
};
