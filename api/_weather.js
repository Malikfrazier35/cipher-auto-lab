// Forecasts for the booking screens and for confirmed bookings, from the National Weather Service
// (api.weather.gov): the official US forecast, free, no key, allowed for commercial use.
// Connecticut is split by county, which is close enough to choose an arrival window.
// Files in /api whose names start with "_" are shared code, not endpoints.
//
// How far each kind of answer reaches, most to least precise:
//   hourly  ~6 days   NWS hour-by-hour forecast: per arrival window and per hour of the job
//   day     day 7     NWS day forecast (12-hour periods): one line for the day
//   typical beyond    NOAA 1991-2020 normals for that date, labelled typical, never a forecast
import { NORMALS, STATION_FOR, STATION_NAME } from './_normals.js';

export const AREAS = {
  'fairfield':  { label: 'Fairfield County',  lat: 41.27, lon: -73.37 },
  'hartford':   { label: 'Hartford County',   lat: 41.80, lon: -72.73 },
  'litchfield': { label: 'Litchfield County', lat: 41.79, lon: -73.25 },
  'middlesex':  { label: 'Middlesex County',  lat: 41.43, lon: -72.52 },
  'new-haven':  { label: 'New Haven County',  lat: 41.41, lon: -72.93 },
  'new-london': { label: 'New London County', lat: 41.47, lon: -72.10 },
  'tolland':    { label: 'Tolland County',    lat: 41.86, lon: -72.34 },
  'windham':    { label: 'Windham County',    lat: 41.83, lon: -71.99 },
};

// The arrival windows offered at booking, by local start hour (last hour is exclusive).
export const WINDOWS = { morning: [8, 11], midday: [11, 14], afternoon: [14, 17] };

const UA = 'CipherAutoLab.com booking forecast (hello@cipherautolab.com)';

// Sky type from the forecast text, most serious first.
const KINDS = [
  ['storm', /thunder/i, 'Thunderstorms'],
  ['snow', /snow|sleet|flurr|ice|freezing|wintry/i, 'Snow'],
  ['rain', /rain|shower|drizzle/i, 'Rain'],
  ['fog', /fog|haze|smoke|mist/i, 'Fog'],
  ['partly', /partly/i, 'Partly cloudy'],            // before cloudy: "Partly Cloudy"
  ['cloudy', /cloudy|overcast/i, 'Cloudy'],
  ['clear', /sunny|clear|fair/i, 'Sunny'],           // incl. "Mostly Sunny", "Mostly Clear"
];
const RANK = { storm: 6, snow: 5, rain: 4, fog: 3, cloudy: 2, partly: 1, clear: 0 };
export function kindOf(text) {
  for (const [k, re] of KINDS) if (re.test(text || '')) return k;
  return 'cloudy';
}
const LABEL = Object.fromEntries(KINDS.map(([k, , l]) => [k, l]));

/** Sum up forecast hours: temperature range, the sky that matters most, the highest rain chance. */
export function summarise(hours) {
  if (!hours.length) return null;
  const temps = hours.map((h) => h.temperature);
  const pop = Math.max(...hours.map((h) => (h.probabilityOfPrecipitation && h.probabilityOfPrecipitation.value) || 0));
  // the commonest sky, unless rain, snow or storms are actually likely (>= 40%)
  const counts = {};
  hours.forEach((h) => { const k = kindOf(h.shortForecast); counts[k] = (counts[k] || 0) + 1; });
  let kind = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || RANK[b] - RANK[a])[0];
  const wet = Object.keys(counts).filter((k) => RANK[k] >= 4).sort((a, b) => RANK[b] - RANK[a])[0];
  if (wet && pop >= 40) kind = wet;
  if ((kind === 'rain' || kind === 'snow' || kind === 'storm') && pop < 25) kind = 'cloudy';
  return { lo: Math.min(...temps), hi: Math.max(...temps), kind, label: LABEL[kind], pop: Math.round(pop / 10) * 10 };
}

/** NWS hourly periods -> { days: {ymd: summary 8am-5pm}, windows: {ymd: {morning, midday, afternoon}} } */
export function shape(periods) {
  const byDay = {};
  for (const p of periods) {
    const ymd = String(p.startTime).slice(0, 10), hour = +String(p.startTime).slice(11, 13);
    (byDay[ymd] = byDay[ymd] || []).push({ ...p, hour });
  }
  const days = {}, windows = {}, hourly = {};
  for (const [ymd, hours] of Object.entries(byDay)) {
    // the hours a job can run in (6am-7pm), compact: [hour, temp, sky, rain chance]
    const span = hours.filter((h) => h.hour >= 6 && h.hour <= 19);
    if (span.length === 14) hourly[ymd] = span.map((h) => [h.hour, h.temperature, kindOf(h.shortForecast), (h.probabilityOfPrecipitation && h.probabilityOfPrecipitation.value) || 0]);
    const w = {};
    for (const [name, [a, b]] of Object.entries(WINDOWS)) {
      const hs = hours.filter((h) => h.hour >= a && h.hour < b);
      // only report a window the forecast fully covers
      if (hs.length === b - a) w[name] = summarise(hs);
    }
    if (Object.keys(w).length === 3) {
      windows[ymd] = w;
      days[ymd] = { ...summarise(hours.filter((h) => h.hour >= 8 && h.hour < 17)), level: 'hourly' };
    }
  }
  return { days, windows, hourly };
}

async function get(url, fetchImpl, tries = 2) {
  let last;
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    try {
      const r = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/geo+json' }, signal: ctl.signal });
      if (r.ok) return await r.json();
      last = new Error('NWS ' + r.status);
      if (r.status < 500) break;              // a 4xx won't get better on retry
    } catch (e) { last = e; } finally { clearTimeout(t); }
  }
  throw last;
}

/** NWS 12-hour periods -> day-level lines for dates the hourly forecast doesn't reach. */
export function dayPeriods(periods, have) {
  const out = {};
  for (const p of periods || []) {
    if (!p.isDaytime) continue;
    const ymd = String(p.startTime).slice(0, 10);
    if (have[ymd]) continue;
    const kind = kindOf(p.shortForecast), pop = Math.round(((p.probabilityOfPrecipitation && p.probabilityOfPrecipitation.value) || 0) / 10) * 10;
    out[ymd] = { lo: p.temperature, hi: p.temperature, kind: (kind === 'rain' || kind === 'snow' || kind === 'storm') && pop < 25 ? 'cloudy' : kind,
                 label: LABEL[kind], pop, level: 'day', text: p.shortForecast };
  }
  return out;
}

/** Typical weather for the next `n` days from the NOAA normals (by the area's nearest station). */
export function typical(area, from = new Date(), n = 35) {
  const st = STATION_FOR[area] || 'bradley', table = NORMALS[st], out = {};
  for (let i = 0; i < n; i++) {
    const d = new Date(from.getTime() + i * 864e5);
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    const row = table[ymd.slice(5)];
    if (row) out[ymd] = { hi: row[0], lo: row[1], pop: row[2], snow: row[3] };
  }
  return { station: STATION_NAME[st], days: out };
}

const gridUrl = new Map();     // area -> its hourly forecast URL (changes very rarely)
const dayUrl = new Map();      // area -> its 12-hour forecast URL
const lastGood = new Map();    // area -> { at, data }: served if NWS is briefly down

/** Forecast for one area. Uses the last good copy (up to 6 hours old) if NWS is unavailable. */
export async function forecast(area, fetchImpl = fetch) {
  const a = AREAS[area];
  if (!a) throw new Error('unknown area');
  try {
    let url = gridUrl.get(area);
    if (!url) {
      const pt = await get(`https://api.weather.gov/points/${a.lat},${a.lon}`, fetchImpl);
      url = pt.properties.forecastHourly;
      gridUrl.set(area, url);
      if (pt.properties.forecast) dayUrl.set(area, pt.properties.forecast);
    }
    const fc = await get(url, fetchImpl);
    const data = { area, label: a.label, source: 'National Weather Service', updated: fc.properties.updateTime || fc.properties.generatedAt || null,
                   ...shape(fc.properties.periods || []) };
    // day 7 (and any day the hourly misses) from the 12-hour forecast; never fatal
    if (dayUrl.get(area)) {
      try { Object.assign(data.days, dayPeriods((await get(dayUrl.get(area), fetchImpl, 1)).properties.periods, data.days)); } catch { /* hourly is enough */ }
    }
    data.typical = typical(area);
    lastGood.set(area, { at: Date.now(), data });
    return data;
  } catch (e) {
    const keep = lastGood.get(area);
    if (keep && Date.now() - keep.at < 6 * 3600 * 1000) return { ...keep.data, stale: true };
    throw e;
  }
}

/** One line for a booking: "Midday 11am-2pm: 45-48°F, Cloudy, 10% rain" or '' if not in range yet. */
export function windowLine(data, ymd, win) {
  const w = data && data.windows && data.windows[ymd] && data.windows[ymd][win];
  if (!w) return '';
  const name = { morning: 'Morning 8-11am', midday: 'Midday 11am-2pm', afternoon: 'Afternoon 2-5pm' }[win];
  return `${name}: ${w.lo === w.hi ? w.hi : w.lo + '-' + w.hi}°F, ${w.label}, ${w.pop}% chance of precipitation`;
}
