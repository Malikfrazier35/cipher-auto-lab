// Counters for the channel report: how often each QR code is opened, how often a booking is started,
// and how many bookings and gift cards each channel brings, by day and by place. Kept in Upstash Redis
// (Vercel Marketplace, free plan): Vercel adds KV_REST_API_URL and KV_REST_API_TOKEN when it is
// connected to the project. Without them nothing is counted and nothing else changes.
//
// Only counts are kept: no IP address, no device, nothing that identifies a person.
//   cal:d:<YYYY-MM-DD>   field "<event>|<channel>"          -> count
//   cal:g:<YYYY-MM-DD>   field "<event>|<channel>|<place>"  -> count   (place: "Enfield, CT")
// events: scan (a QR link opened), start (booking screens opened), booked, gift (a gift card sold)
// Files in /api whose names start with "_" are shared code, not endpoints.

export const EVENTS = ['scan', 'start', 'booked', 'gift'];

function creds(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}
export const metricsOn = (env) => !!creds(env || {});

/** Connecticut calendar date, YYYY-MM-DD. */
export function etDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
const clean = (s, n = 40) => String(s || '').replace(/[|\u0000-\u001F]/g, ' ').trim().slice(0, n);

/** Run Redis commands in one round trip: [[cmd, ...args], ...] -> [{result}|{error}, ...], or null when not connected. */
export async function pipeline(env, cmds, fetchImpl = fetch) {
  const c = creds(env);
  if (!c || !cmds.length) return null;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 3000);
  try {
    const r = await fetchImpl(`${c.url}/pipeline`, {
      method: 'POST', headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds), signal: ctl.signal,
    });
    if (!r.ok) throw new Error('redis ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/** Count one event. Never throws: counting must not get in the way of a booking. */
export async function bump(env, { e, ch, place = '', day = etDay() }, fetchImpl) {
  if (!metricsOn(env) || !EVENTS.includes(e)) return false;
  const c = clean(ch || 'direct', 60), p = clean(place, 50);
  const cmds = [['HINCRBY', `cal:d:${day}`, `${e}|${c}`, 1]];
  if (p) cmds.push(['HINCRBY', `cal:g:${day}`, `${e}|${c}|${p}`, 1]);
  try { await pipeline(env, cmds, fetchImpl); return true; } catch (err) { console.warn('count failed', err && err.message); return false; }
}

/** The counts for a list of days: { day: { totals: {field: n}, places: {field: n} } }. */
export async function readDays(env, days, fetchImpl) {
  if (!metricsOn(env) || !days.length) return {};
  const cmds = days.flatMap((d) => [['HGETALL', `cal:d:${d}`], ['HGETALL', `cal:g:${d}`]]);
  const res = await pipeline(env, cmds, fetchImpl);
  const flat = (x) => { const o = {}, a = (x && x.result) || []; for (let i = 0; i < a.length; i += 2) o[a[i]] = +a[i + 1] || 0; return o; };
  const out = {};
  days.forEach((d, i) => { out[d] = { totals: flat(res[i * 2]), places: flat(res[i * 2 + 1]) }; });
  return out;
}

/** Where a visit came from, roughly, from Vercel's own location headers (never stored with anything else). */
export function placeOf(headers) {
  const h = (k) => { try { return decodeURIComponent(headers.get(k) || ''); } catch { return ''; } };
  const country = h('x-vercel-ip-country'), region = h('x-vercel-ip-country-region'), city = h('x-vercel-ip-city');
  if (country && country !== 'US') return country;
  return city ? `${city}${region ? ', ' + region : ''}` : region;
}
