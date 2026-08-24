// Shared booking helpers. Lives outside /api so Vercel never routes it.
//
// There is no database. A booking is a Stripe PaymentIntent and its metadata, and
// it is looked up by the reference through Stripe's search API. That keeps the
// number of services at one, and it means the record the customer sees and the
// record that took their money cannot drift apart.

const crypto = require('crypto');

// Town centroids, averaged from the standard ZIP codes in each town. Two facts
// make this precise enough: an NWS forecast grid cell is about 2.5 km, and the
// ETA is deliberately rounded to five minutes. We never geocode the street
// address — the customer's exact address should not leave our own systems to
// answer "is it going to rain".
const TOWNS = {
  'New Haven': [41.312, -72.9256],
  'Hamden': [41.3734, -72.9196],
  'Milford': [41.2257, -73.0648],
  'West Haven': [41.2701, -72.9638],
  'East Haven': [41.3082, -72.9282],
  'North Haven': [41.3822, -72.8585],
  'Branford': [41.28, -72.8106],
  'Guilford': [41.3154, -72.6968],
  'Orange': [41.2815, -73.0287],
  'Woodbridge': [41.3082, -72.9282],
  'Cheshire': [41.5055, -72.9081],
  'Wallingford': [41.46, -72.8222],
  'Meriden': [41.5367, -72.8093],
  'Shelton': [41.3047, -73.1294],
  'Ansonia': [41.3427, -73.0742],
  'Derby': [41.3229, -73.08],
  'Seymour': [41.3862, -73.0817],
  'Oxford': [41.4202, -73.1296],
  'Beacon Falls': [41.4369, -73.0597],
  'Naugatuck': [41.492, -73.0493],
  'Waterbury': [41.5565, -73.0371],
  'Hartford': [41.7683, -72.6859],
  'West Hartford': [41.7602, -72.7399],
  'New Britain': [41.6707, -72.7873],
  'Berlin': [41.6215, -72.7457],
  'Southington': [41.6052, -72.8727],
  'Plainville': [41.6727, -72.8644],
  'Newington': [41.686, -72.7296],
  'Wethersfield': [41.7013, -72.6763],
  'Rocky Hill': [41.6583, -72.6632],
  'Cromwell': [41.6105, -72.6663],
  'Middletown': [41.5569, -72.6652],
  'Farmington': [41.7284, -72.8415],
  'Glastonbury': [41.7073, -72.5727],
};

// Where the van starts from. Change this if the base moves.
const BASE = [41.3047, -73.1294];   // Shelton

const SECRET = process.env.JOB_LINK_SECRET || '';

// A reference alone is close enough to guessable that it must not be the only
// thing standing between a stranger and a customer's name, address and phone.
// The token is derived, not stored, so there is still nothing to keep.
function token(ref, kind) {
  if (!SECRET) return null;
  return crypto.createHmac('sha256', SECRET)
    .update(`${kind}:${String(ref).toUpperCase()}`)
    .digest('hex')
    .slice(0, kind === 'own' ? 20 : 16);
}

function checkToken(ref, kind, given) {
  const want = token(ref, kind);
  if (!want || !given) return false;
  const a = Buffer.from(want);
  const b = Buffer.from(String(given));
  // Constant-time: a length-leaking or early-exit compare invites a byte-by-byte
  // guess at the token, which is the whole point of having one.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function jobUrl(origin, ref) {
  const k = token(ref, 'job');
  return k ? `${origin}/job?r=${encodeURIComponent(ref)}&k=${k}` : null;
}
function otwUrl(origin, ref) {
  const k = token(ref, 'own');
  return k ? `${origin}/otw?r=${encodeURIComponent(ref)}&k=${k}` : null;
}

// Great-circle distance in miles.
function haversine([aLat, aLon], [bLat, bLon]) {
  const R = 3958.8, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Straight-line distance understates a real drive. 1.28 is a reasonable detour
// factor for this road network. Average speed has to scale with distance or the
// model is wrong at both ends: a flat 34 mph made a four-mile hop look slow and
// put Shelton to Hartford at 89 minutes against a real hour. Short trips are all
// junctions and lights; long ones pick up Route 8 and I-84.
//
// This is not traffic-aware and the page says so. A number presented as live
// when it isn't is worse than no number.
const ROAD_FACTOR = 1.28;
const MPH_LOCAL = 24;      // stop-start, in town
const MPH_GAIN = 22;       // extra once a trip is long enough to use a highway
const MPH_FULL_AT = 30;    // miles at which the highway average is reached

function etaMinutes(from, to) {
  const miles = haversine(from, to) * ROAD_FACTOR;
  const mph = MPH_LOCAL + MPH_GAIN * Math.min(1, miles / MPH_FULL_AT);
  return { miles: Math.round(miles * 10) / 10,
           minutes: Math.max(2, Math.round((miles / mph) * 60)) };
}

// Booking windows, in local hours.
const WINDOWS = {
  'Morning': [8, 11],
  'Midday': [11, 14],
  'Afternoon': [14, 17],
};
function windowHours(label) {
  const key = Object.keys(WINDOWS).find((k) => String(label || '').startsWith(k));
  return WINDOWS[key] || [8, 17];
}

// "Mon Aug 24 2026" -> "2026-08-24". Built from the parsed parts rather than
// toISOString(), which would shift the date across midnight for a UTC server.
function isoDate(dateStr) {
  const d = new Date(String(dateStr));
  if (isNaN(d)) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const clean = (v, max = 200) =>
  String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);

async function findBooking(stripe, ref) {
  const r = await stripe.paymentIntents.search({
    query: `metadata['reference']:'${String(ref).replace(/'/g, '')}'`,
    limit: 1,
  });
  return r.data[0] || null;
}

module.exports = {
  TOWNS, BASE, token, checkToken, jobUrl, otwUrl,
  haversine, etaMinutes, windowHours, isoDate, clean, findBooking,
};

/* ─────────────────────────────────────────────────────────────────────────────
   Calendar
   ───────────────────────────────────────────────────────────────────────────── */

// Offset of America/New_York from UTC, in minutes, for a given instant. Derived
// from the ICU database rather than hardcoded, because -240 in August and -300
// in January is exactly the kind of thing that silently books someone an hour
// out twice a year.
function etOffsetMinutes(date) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = f.formatToParts(date).reduce((a, x) => (a[x.type] = x.value, a), {});
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return (asUTC - date.getTime()) / 60000;
}

// A wall-clock time in Connecticut -> a real instant. Booking windows run 8am to
// 5pm, comfortably clear of the 2am DST transition, so one correction pass is
// exact rather than merely close.
function etToUTC(y, mo, d, h, mi = 0) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off = etOffsetMinutes(new Date(guess));
  return new Date(guess - off * 60000);
}

const icsStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// RFC 5545 wants CRLF, and lines folded at 75 octets. Long addresses and
// descriptions overflow that, and an unfolded line is what makes an .ics import
// silently drop a field in Outlook.
function icsFold(line) {
  const out = [];
  let buf = '';
  for (const ch of line) {
    if (Buffer.byteLength(buf + ch) > 73) { out.push(buf); buf = ' '; }
    buf += ch;
  }
  out.push(buf);
  return out.join('\r\n');
}
const icsEsc = (v) => String(v == null ? '' : v)
  .replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

function buildICS({ ref, service, dateStr, windowLabel, address, town, total, link, seq }) {
  const iso = isoDate(dateStr);
  if (!iso) return null;
  const [y, mo, d] = iso.split('-').map(Number);
  const [h0, h1] = windowHours(windowLabel);
  const start = etToUTC(y, mo, d, h0);
  const end = etToUTC(y, mo, d, h1);

  const where = [address, town, 'CT'].filter(Boolean).join(', ');
  const body = [
    `${service} — Cipher Auto Lab.`,
    total ? `Estimate ${total}.` : '',
    'We bring water, power and a canopy. Please empty the vehicle and leave about 15 feet of clear space around it.',
    link ? `Your booking page: ${link}` : '',
    'Questions or changes: (203) 592-9589',
  ].filter(Boolean).join('\\n\\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cipher Auto Lab//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // Stable UID + SEQUENCE: re-downloading after a change updates the existing
    // entry instead of leaving two conflicting ones in the customer's calendar.
    `UID:${ref}@cipherautolab.com`,
    `SEQUENCE:${Number(seq) || 0}`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    icsFold(`SUMMARY:${icsEsc(service)} — Cipher Auto Lab`),
    icsFold(`DESCRIPTION:${body}`),
    where ? icsFold(`LOCATION:${icsEsc(where)}`) : '',
    link ? icsFold(`URL:${icsEsc(link)}`) : '',
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    // Two reminders: one the evening before to empty the car, one on the morning.
    'BEGIN:VALARM',
    'TRIGGER:-PT16H',
    'ACTION:DISPLAY',
    icsFold('DESCRIPTION:Cipher Auto Lab tomorrow — empty the vehicle tonight and leave clear space around it.'),
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    icsFold('DESCRIPTION:Cipher Auto Lab arriving in your window today.'),
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n') + '\r\n';
}

/* ─────────────────────────────────────────────────────────────────────────────
   What each service actually includes — the same list the site publishes, so a
   customer checking the page after booking sees exactly what they were sold.
   ───────────────────────────────────────────────────────────────────────────── */
const INCLUDES = {
  'Exterior Detail': [
    'Two-bucket hand wash, top down',
    'Wheels, barrels, tires and wheel wells',
    'Door jambs and sills',
    'Spray protection and tire dressing',
    'Exterior glass, streak-free',
  ],
  'Interior Detail': [
    'Full vacuum — seats, carpets, out to the edges',
    'All surfaces cleaned and dressed',
    'Vents, crevices, cupholders, console',
    'Mats cleaned and refitted',
    'Interior glass',
  ],
  'Full Detail': [
    'Two-bucket hand wash, wheels, tires and wheel wells',
    'Door jambs, sills, spray protection, tire dressing',
    'Full vacuum — seats, carpets, trunk, out to the edges',
    'All interior surfaces cleaned and dressed',
    'Vents, crevices, cupholders, console, mats',
    'Glass inside and out',
    'Full walk-around with you before we leave',
  ],
};

module.exports.etOffsetMinutes = etOffsetMinutes;
module.exports.etToUTC = etToUTC;
module.exports.buildICS = buildICS;
module.exports.INCLUDES = INCLUDES;
