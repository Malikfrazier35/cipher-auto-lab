// Vercel serverless function — fleet enquiry.
//
// A fleet enquiry is worth an order of magnitude more than a single detail, so
// the email is written to be acted on rather than filed: it carries the quoted
// figures already worked out, the capacity cost of saying yes, and the questions
// that decide whether the contract is any good.
//
// The GRID here must stay in step with GRID in fleet.js. The page shows a number;
// this is the number that reaches the owner. If they disagree, someone gets
// quoted something they were never shown.

const B = require('../lib/booking');

const OWNER_EMAIL = process.env.OWNER_EMAIL || 'hello@cipherautolab.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Cipher Auto Lab <bookings@cipherautolab.com>';
const PHONE = '(203) 592-9589';
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 4;

const GRID = {
  full: { '2-4': { weekly: 52, biweekly: 62, monthly: 76 },
          '5-9': { weekly: 48, biweekly: 57, monthly: 70 },
          '10+': { weekly: 44, biweekly: 53, monthly: 65 } },
  ext:  { '2-4': { weekly: 34, biweekly: 39, monthly: 46 },
          '5-9': { weekly: 31, biweekly: 36, monthly: 42 },
          '10+': { weekly: 30, biweekly: 33, monthly: 38 } },
};
const MID = { '2-4': 3, '5-9': 7, '10+': 12 };
const VISITS = { weekly: 4.33, biweekly: 2.17, monthly: 1 };
// Minutes on the vehicle, before travel and setup. Used to show the owner what a
// contract actually costs in capacity, which is the thing that decides whether
// recurring revenue is a good trade or a slow way to lose money.
const MINUTES = {
  full: { weekly: 35, biweekly: 45, monthly: 55 },
  ext:  { weekly: 25, biweekly: 30, monthly: 35 },
};
const SETUP_MIN = 35;
const MIN_VISIT = 180;
const BIG_UPLIFT = 10;

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  for (const [k, v] of hits) if (now - v.first > RATE_WINDOW_MS) hits.delete(k);
  const rec = hits.get(ip);
  if (!rec) { hits.set(ip, { first: now, n: 1 }); return false; }
  rec.n += 1;
  return rec.n > RATE_MAX;
}

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function sendEmail({ to, subject, html, text, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, text,
      ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

function quote({ service, count, frequency, type }) {
  const key = service === 'ext' ? 'ext' : 'full';
  const band = GRID[key][count] ? count : '5-9';
  const freq = VISITS[frequency] ? frequency : 'biweekly';
  let per = GRID[key][band][freq];
  const big = /van|pickup/i.test(type) && !/company|sedan|suv/i.test(type);
  if (big) per += BIG_UPLIFT;

  const n = MID[band];
  const visit = Math.max(MIN_VISIT, per * n);
  const month = visit * VISITS[freq];
  const onVehicle = MINUTES[key][freq] * n;
  const hours = (onVehicle + SETUP_MIN) / 60;

  return {
    per, band, freq, n, big,
    visit: Math.round(visit),
    month: Math.round(month),
    minApplied: per * n < MIN_VISIT,
    hours: Math.round(hours * 10) / 10,
    perHour: Math.round(visit / hours),
    monthlyHours: Math.round(hours * VISITS[freq] * 10) / 10,
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const ip = B.clean((req.headers['x-forwarded-for'] || '').split(',')[0] ||
    (req.socket && req.socket.remoteAddress) || 'unknown', 45);
  if (rateLimited(ip)) {
    return res.status(429).json({ error: `A few too many in a short while. Call ${PHONE}.` });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    const company = B.clean(body.company, 90);
    const name = B.clean(body.name, 80);
    const phone = B.clean(body.phone, 30);
    const email = B.clean(body.email, 120);
    const town = B.clean(body.town, 60);
    if (company.length < 2 || name.length < 2 || town.length < 2
        || phone.replace(/\D/g, '').length !== 10
        || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({
        error: 'Company, name, a 10-digit phone number, an email and a town are all needed to quote.',
      });
    }

    const count = B.clean(body.count, 10);
    const frequency = B.clean(body.frequency, 12);
    const service = B.clean(body.service, 10);
    const type = B.clean(body.type, 40);
    const note = B.clean(body.note, 600);
    const ref = 'CAL-F' + Date.now().toString(36).toUpperCase().slice(-5);

    const unsure = service === 'unsure' || frequency === 'unsure' || count === '1';
    const q = unsure ? null : quote({ service, count, frequency, type });

    const drive = B.TOWNS[town] ? B.etaMinutes(B.BASE, B.TOWNS[town]) : null;

    const rows = [
      ['Reference', ref], ['Company', company], ['Contact', `${name} · ${phone}`],
      ['Email', email], ['Where', town + ', CT'],
      ['Vehicles', count === '1' ? 'One, but often' : count],
      ['Type', type], ['Frequency', frequency], ['Service', service === 'ext' ? 'Exterior only' : service === 'full' ? 'Fleet Full' : 'Undecided'],
      drive ? ['Drive from base', `${drive.miles} mi · about ${drive.minutes} min each way`] : null,
    ].filter(Boolean);

    const quoteLines = q ? [
      '',
      'PUBLISHED RATE FOR WHAT THEY DESCRIBED',
      `  $${q.per} per vehicle${q.big ? ' (includes the +$10 van/pickup uplift)' : ''}`,
      `  $${q.visit} per visit at ${q.n} vehicles${q.minApplied ? `  <- the $${MIN_VISIT} minimum kicked in` : ''}`,
      `  about $${q.month} a month`,
      '',
      'WHAT IT COSTS YOU IN CAPACITY',
      `  about ${q.hours} hours per visit including travel and setup`,
      `  roughly $${q.perHour}/hour  ${q.perHour >= 63 ? '(at or above your consumer rate — worth taking)'
                                                       : '(BELOW your $63/hr floor — renegotiate or walk)'}`,
      `  about ${q.monthlyHours} hours a month committed`,
    ] : [
      '',
      'They did not pin down service or frequency, so no rate is quoted here.',
      count === '1' ? 'One vehicle on a schedule — check whether normal pricing beats a contract for them.' : '',
    ].filter(Boolean);

    const asks = [
      '',
      'BEFORE YOU QUOTE — the four that decide it',
      '  1. Are all the vehicles at one site, or spread across yards?',
      '     The whole discount assumes one stop. Two sites is two visits.',
      '  2. What time can you get in, and is there water runoff you can use?',
      '  3. Do they need a COI naming them additional insured? Get the exact wording.',
      '  4. Which van is the worst one? Go and look at that one, and price off it.',
    ];

    const text = rows.map(([k, v]) => `${k.padEnd(16)} ${v}`).join('\n')
      + '\n' + quoteLines.join('\n')
      + (note ? `\n\nTHEY SAID\n  ${note}` : '')
      + '\n' + asks.join('\n')
      + `\n\nCall them: ${phone}`;

    const tel = phone.replace(/\D/g, '');
    const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;color:#111814">
  <p style="margin:0 0 6px;font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;text-transform:uppercase;color:#2F6B21">Fleet enquiry</p>
  <h2 style="margin:0 0 4px;font-size:22px">${esc(company)}</h2>
  <p style="margin:0 0 18px;color:#6C776F;font-size:14px">${esc(town)}, CT · ${esc(count === '1' ? 'one vehicle' : count + ' vehicles')} · ${esc(type)}</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    ${rows.map(([k, v]) => `<tr>
      <td style="padding:7px 0;color:#6C776F;width:150px;border-bottom:1px solid #E6EBE1">${esc(k)}</td>
      <td style="padding:7px 0;font-weight:600;border-bottom:1px solid #E6EBE1">${esc(v)}</td></tr>`).join('')}
  </table>
  ${q ? `<div style="margin:20px 0 0;border:1px solid ${q.perHour >= 63 ? '#CFE3BE' : '#F0C9C2'};background:${q.perHour >= 63 ? '#F4FAEF' : '#FBEAE7'};border-radius:10px;padding:16px 18px">
    <p style="margin:0 0 10px;font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;text-transform:uppercase;color:#6C776F">The numbers</p>
    <p style="margin:0;font-size:15px;line-height:1.8">
      <b>$${q.per}</b> per vehicle · <b>$${q.visit}</b> a visit · <b>$${q.month}</b> a month<br>
      <span style="color:#6C776F;font-size:13.5px">${q.hours} hrs per visit with travel — <b style="color:${q.perHour >= 63 ? '#2F6B21' : '#B4392F'}">$${q.perHour}/hour</b>${q.perHour >= 63 ? ' — at or above your consumer rate' : ' — below your $63/hr floor'}<br>
      Commits about ${q.monthlyHours} hours a month${q.minApplied ? `<br>The $${MIN_VISIT} visit minimum applied` : ''}</span>
    </p>
  </div>` : `<p style="margin:20px 0 0;font-size:14px;color:#6C776F">They left service or frequency open, so there is no rate to quote yet.</p>`}
  ${note ? `<p style="margin:18px 0 0;font-size:14px;line-height:1.6"><b>They said:</b><br>${esc(note).replace(/\n/g, '<br>')}</p>` : ''}
  <div style="margin:20px 0 0;border:1px solid #E1E6DC;border-radius:10px;padding:16px 18px;background:#F7F9F5">
    <p style="margin:0 0 8px;font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;text-transform:uppercase;color:#6C776F">Ask before you quote</p>
    <ol style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.75;color:#3A453D">
      <li>All at one site, or spread across yards? The discount assumes one stop.</li>
      <li>What time can you get in, and is there anywhere for water to go?</li>
      <li>Do they need a COI naming them additional insured? Get the exact wording.</li>
      <li>Which van is the worst one? Go and look at that one, and price off it.</li>
    </ol>
  </div>
  <p style="margin:22px 0 0">
    <a href="tel:+1${tel}" style="display:inline-block;background:#A3E635;color:#08110A;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px">Call ${esc(phone)}</a>
    <a href="mailto:${esc(email)}" style="display:inline-block;margin-left:8px;border:1px solid #D9E0D3;color:#111814;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px">Email</a>
  </p>
</div>`;

    try {
      await sendEmail({
        to: OWNER_EMAIL, replyTo: email,
        subject: `FLEET · ${company} · ${count === '1' ? '1' : count} vehicles · ${town}`,
        html, text,
      });
    } catch (mailErr) {
      console.error('fleet email failed:', mailErr && mailErr.message);
      return res.status(502).json({
        error: `Our mail is down at the moment, so this didn't reach us. Call ${PHONE} and we'll take it down over the phone.`,
      });
    }

    return res.status(200).json({ ok: true, ref });
  } catch (err) {
    console.error('fleet enquiry failed:', err && err.message);
    return res.status(500).json({ error: `Something broke at our end. Call ${PHONE}.` });
  }
};
