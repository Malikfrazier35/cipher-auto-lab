// Vercel serverless function — the Job Card.
//
// Everything the customer needs about one booking, at one link: what they booked,
// what it costs, whether the weather is going to hold, and on the day, roughly
// how far away we are.
//
// SECURITY: the reference is short enough to guess at, and the record behind it
// has a name, an address and a phone number in it. Every request must carry an
// HMAC of the reference. Without JOB_LINK_SECRET set there is no valid token and
// this endpoint serves nothing — it does not fall back to serving on the
// reference alone.
//
// Weather comes from api.weather.gov: US government data, public domain, no key,
// no commercial restriction. Open-Meteo was the obvious alternative and its free
// tier is explicitly non-commercial, which rules it out for a business site.

const Stripe = require('stripe');
const B = require('../lib/booking');

const UA = 'CipherAutoLab/1.0 (cipherautolab.com; hello@cipherautolab.com)';
const NWS_TTL = 20 * 60 * 1000;

// Per-instance, best effort. api.weather.gov asks for honest HTTP caching rather
// than a request cap, and explicitly asks callers not to cache-bust.
const wxCache = new Map();

async function nws(url) {
  const hit = wxCache.get(url);
  if (hit && Date.now() - hit.at < NWS_TTL) return hit.body;
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/geo+json' } });
  if (!r.ok) throw new Error(`weather.gov ${r.status}`);
  const body = await r.json();
  wxCache.set(url, { at: Date.now(), body });
  return body;
}

// The forecast only reaches about seven days out. Bookings run further than that,
// and saying so is better than showing a confident blank.
const FORECAST_DAYS = 7;

async function forecast(town, dateStr, windowLabel) {
  const coords = B.TOWNS[town];
  const iso = B.isoDate(dateStr);
  if (!coords || !iso) return { state: 'unknown', why: 'No town or date on this booking yet.' };

  const days = Math.floor((new Date(iso + 'T12:00:00Z') - new Date()) / 86400000);
  if (days > FORECAST_DAYS) {
    return {
      state: 'early',
      why: `Too far out for a forecast worth trusting. We start watching ${FORECAST_DAYS} days before, `
         + `and you'll hear from us the moment it looks doubtful.`,
    };
  }
  if (days < -1) return { state: 'past', why: 'This booking has been and gone.' };

  const [h0, h1] = B.windowHours(windowLabel);
  const pts = await nws(`https://api.weather.gov/points/${coords[0]},${coords[1]}`);
  const hourly = await nws(pts.properties.forecastHourly);

  const periods = (hourly.properties.periods || []).filter((p) => {
    if (!String(p.startTime).startsWith(iso)) return false;
    const h = Number(String(p.startTime).slice(11, 13));
    return h >= h0 && h < h1;
  });
  if (!periods.length) {
    return { state: 'unknown', why: 'The forecast has not reached that hour yet. We will keep looking.' };
  }

  const pop = Math.max(...periods.map((p) => p?.probabilityOfPrecipitation?.value ?? 0));
  const temps = periods.map((p) => p.temperature);
  const tMin = Math.min(...temps), tMax = Math.max(...temps);
  const wind = Math.max(...periods.map((p) => parseInt(String(p.windSpeed).match(/\d+/g)?.pop() || '0', 10)));
  const words = periods.map((p) => p.shortForecast).filter(Boolean);
  const summary = words.sort((a, b) =>
    words.filter((w) => w === b).length - words.filter((w) => w === a).length)[0];

  // Thresholds chosen around what actually stops the work, not around what looks
  // dramatic. Detailing needs a dry panel to seal; products do not cure cold; and
  // wind carries grit onto wet paint, which is worse than not washing it at all.
  const flags = [];
  let state = 'clear';
  if (pop >= 55) { state = 'risk'; flags.push(`${pop}% chance of rain in your window`); }
  else if (pop >= 30) { state = 'watch'; flags.push(`${pop}% chance of rain in your window`); }
  if (tMax < 40) {
    state = state === 'risk' ? 'risk' : 'watch';
    flags.push(`only ${tMax}°F — sealants and coatings will not cure properly below 40`);
  }
  if (wind >= 22) {
    state = state === 'risk' ? 'risk' : 'watch';
    flags.push(`${wind} mph wind — that puts grit back on wet paint and makes the canopy a problem`);
  }

  const why = {
    clear: `${summary}, ${tMin}–${tMax}°F. Nothing in the way.`,
    watch: `${summary}, ${tMin}–${tMax}°F. ${flags.join('. ')}. Still on unless we tell you otherwise.`,
    risk: `${summary}, ${tMin}–${tMax}°F. ${flags.join('. ')}.`,
  }[state];

  return { state, why, pop, tMin, tMax, wind, summary, source: 'National Weather Service' };
}

// Hours until the window opens. The page uses it to decide whether to warn about
// the deposit before someone taps cancel, so it is computed server-side against
// real Connecticut wall-clock time rather than the visitor's device clock.
function hoursUntil(dateStr, windowLabel) {
  const iso = B.isoDate(dateStr);
  if (!iso) return null;
  const [y, mo, d] = iso.split('-').map(Number);
  const [h0] = B.windowHours(windowLabel);
  return Math.round(((B.etToUTC(y, mo, d, h0).getTime() - Date.now()) / 3600000) * 10) / 10;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const ref = B.clean(req.query.r, 24).toUpperCase();
  if (!ref) return res.status(400).json({ error: 'No booking reference.' });
  if (!process.env.JOB_LINK_SECRET) {
    return res.status(503).json({ error: 'Job tracking is not switched on yet. Call (203) 592-9589.' });
  }
  if (!B.checkToken(ref, 'job', req.query.k)) {
    return res.status(404).json({ error: 'That link is not valid. Check the one in your confirmation email, or call (203) 592-9589.' });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(503).json({ error: 'Not configured.' });

  try {
    const pi = await B.findBooking(Stripe(key), ref);
    if (!pi) return res.status(404).json({ error: 'We cannot find that booking. Call (203) 592-9589 and we will sort it.' });
    const m = pi.metadata || {};

    // Add to calendar. Served from here rather than generated in the browser so
    // it carries a real Content-Type — a data: URL download is blocked by this
    // site's CSP and is unreliable on iOS regardless.
    if (req.query.format === 'ics') {
      const origin = process.env.SITE_ORIGIN || `https://${req.headers.host || 'cipherautolab.com'}`;
      const ics = B.buildICS({
        ref, service: [m.package, m.paint_work !== 'none' ? m.paint_work : ''].filter(Boolean).join(' + '),
        dateStr: m.date, windowLabel: m.window,
        address: m.address, town: m.town, total: m.est_total,
        link: B.jobUrl(origin, ref), seq: Number(m.change_at ? 1 : 0),
      });
      if (!ics) return res.status(409).json({ error: 'This booking has no date on it yet.' });
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      // inline, not attachment: on iOS an attachment lands in Files and needs a
      // second tap to reach Calendar, whereas inline text/calendar is handed to
      // Calendar directly. No desktop browser can render it, so they all still
      // download it.
      res.setHeader('Content-Disposition', `inline; filename="cipher-auto-lab-${ref}.ics"`);
      return res.status(200).send(ics);
    }

    let wx = { state: 'unknown', why: 'Could not reach the forecast just now.' };
    try { wx = await forecast(m.town, m.date, m.window); }
    catch (e) { console.warn('forecast failed:', e && e.message); }

    // "On my way" state, written by the owner from api/otw.js. Anything older
    // than two hours is stale — show nothing rather than a number from this
    // morning about a job that finished at noon.
    let otw = null;
    if (m.otw_at && Date.now() - Number(m.otw_at) < 2 * 3600 * 1000) {
      otw = {
        status: m.otw_status || 'driving',
        minutes: m.otw_minutes ? Number(m.otw_minutes) : null,
        at: Number(m.otw_at),
      };
    }

    return res.status(200).json({
      ref,
      service: m.package || '—',
      paint: m.paint_work && m.paint_work !== 'none' ? m.paint_work : null,
      addons: m.addons && m.addons !== 'none' ? m.addons : null,
      vehicle: m.vehicle || m.size || '',
      tier: m.tier || m.size || '',
      date: m.date || '',
      window: m.window || '',
      town: m.town || '',
      total: m.est_total || '',
      deposit: '$' + ((pi.amount_received || pi.amount) / 100).toFixed(0),
      name: (m.name || '').split(' ')[0],
      signed: m.agreement || '',
      weather: wx,
      otw,
      // A pending reschedule or cancellation the customer has already asked for.
      change: m.change_action ? {
        action: m.change_action,
        at: Number(m.change_at) || null,
        date: m.change_date || '',
        window: m.change_window || '',
      } : null,
      includes: B.INCLUDES[m.package] || [],
      hoursUntil: hoursUntil(m.date, m.window),
      phone: '(203) 592-9589',
    });
  } catch (err) {
    console.error('job lookup failed:', err && err.message);
    return res.status(500).json({ error: 'Something broke at our end. Call (203) 592-9589.' });
  }
};
