// Vercel serverless function — reschedule and cancellation requests.
//
// This deliberately does NOT change the booking. It records a request and tells
// the owner. A one-van business cannot let a form move a slot without a human
// looking at the calendar, and a page that says "rescheduled" when nobody has
// confirmed is worse than a phone call. The wording on the page matches: it asks,
// it does not announce.
//
// SECURITY: the customer's job token is required. It only ever acts on the
// booking that token was derived from, so holding one link cannot touch another
// booking.

const Stripe = require('stripe');
const B = require('../lib/booking');

const OWNER_EMAIL = process.env.OWNER_EMAIL || 'hello@cipherautolab.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Cipher Auto Lab <bookings@cipherautolab.com>';
const PHONE = '(203) 592-9589';
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;

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

// Hours between now and the start of the booked window. Negative once it has
// started. This is what decides whether a cancellation costs the deposit, so it
// is computed here rather than trusted from the browser.
function hoursUntil(dateStr, windowLabel) {
  const iso = B.isoDate(dateStr);
  if (!iso) return null;
  const [y, mo, d] = iso.split('-').map(Number);
  const [h0] = B.windowHours(windowLabel);
  return (B.etToUTC(y, mo, d, h0).getTime() - Date.now()) / 3600000;
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
    return res.status(429).json({ error: `A few too many requests. Call ${PHONE} and we will sort it in a minute.` });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const ref = B.clean(body.ref, 24).toUpperCase();

  if (!process.env.JOB_LINK_SECRET) return res.status(503).json({ error: 'Not available yet.' });
  if (!ref || !B.checkToken(ref, 'job', body.k)) {
    return res.status(404).json({ error: 'That link is not valid.' });
  }
  const action = ['reschedule', 'cancel'].includes(body.action) ? body.action : null;
  if (!action) return res.status(400).json({ error: 'Unknown request.' });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(503).json({ error: 'Not configured.' });

  try {
    const stripe = Stripe(key);
    const pi = await B.findBooking(stripe, ref);
    if (!pi) return res.status(404).json({ error: 'We cannot find that booking.' });
    const m = pi.metadata || {};

    if (m.change_action) {
      return res.status(200).json({
        ok: true, already: true, action: m.change_action,
        message: `We already have that request and we are on it. If it is urgent, call ${PHONE}.`,
      });
    }

    const hrs = hoursUntil(m.date, m.window);
    const inside24 = hrs != null && hrs < 24;
    const wantDate = B.clean(body.date, 40);
    const wantWindow = B.clean(body.window, 40);
    const note = B.clean(body.note, 400);

    // The deposit consequence is stated on the page before they confirm and
    // repeated here, so the answer cannot come as a surprise afterwards.
    const depositLine = action === 'cancel'
      ? (inside24
        ? 'Inside 24 hours, so the deposit is forfeited under the terms they signed — unless we agree otherwise.'
        : 'More than 24 hours out, so the deposit is refunded in full.')
      : (inside24
        ? 'Inside 24 hours. Moving it is at your discretion; the deposit normally carries across.'
        : 'More than 24 hours out, so the deposit carries across to the new date.');

    await stripe.paymentIntents.update(pi.id, {
      metadata: {
        change_action: action,
        change_at: String(Date.now()),
        change_date: wantDate,
        change_window: wantWindow,
        change_note: note,
      },
    });

    const lines = [
      `Reference: ${ref}`,
      `Customer:  ${m.name || '-'}  ${m.phone || ''}`,
      `Booked:    ${[m.date, m.window].filter(Boolean).join(' · ') || '-'}`,
      `Where:     ${[m.address, m.town].filter(Boolean).join(', ') || '-'}`,
      '',
      action === 'cancel' ? 'THEY WANT TO CANCEL' : 'THEY WANT TO MOVE IT',
      action === 'reschedule' && (wantDate || wantWindow)
        ? `Preferred: ${[wantDate, wantWindow].filter(Boolean).join(' · ')}` : '',
      note ? `Note:      ${note}` : '',
      '',
      depositLine,
      '',
      `Call them: ${m.phone || PHONE}`,
    ].filter(Boolean).join('\n');

    const tel = String(m.phone || '').replace(/\D/g, '');
    try {
      await sendEmail({
        to: OWNER_EMAIL,
        replyTo: m.email || undefined,
        subject: `${action === 'cancel' ? 'CANCEL' : 'RESCHEDULE'} · ${ref} · ${m.name || '?'} · ${m.date || '?'}`,
        text: lines,
        html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:540px;color:#111814">
  <p style="margin:0 0 6px;font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;text-transform:uppercase;color:${action === 'cancel' ? '#B4392F' : '#2F6B21'}">${action === 'cancel' ? 'Cancellation request' : 'Reschedule request'}</p>
  <h2 style="margin:0 0 14px;font-size:20px">${esc(m.name || 'A customer')} — ${esc(ref)}</h2>
  <pre style="font:13px/1.7 ui-monospace,Menlo,monospace;background:#F4F6F2;border:1px solid #E1E6DC;border-radius:9px;padding:14px;white-space:pre-wrap;margin:0">${esc(lines)}</pre>
  ${tel ? `<p style="margin:18px 0 0"><a href="tel:+1${tel}" style="display:inline-block;background:#A3E635;color:#08110A;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:15px">Call ${esc(m.phone)}</a></p>` : ''}
  <p style="margin:16px 0 0;font-size:12.5px;color:#6B7783">Their booking page now says the request is with you. Nothing has been changed automatically.</p>
</div>`,
      });
    } catch (mailErr) {
      // The request is already recorded on the booking, so it is not lost — but
      // the customer must not be told it reached a person when it did not.
      console.error('change-request email failed:', mailErr && mailErr.message);
      return res.status(502).json({
        error: `Recorded, but our email is down so it hasn't reached us yet. Please call ${PHONE} to be sure.`,
      });
    }

    return res.status(200).json({
      ok: true,
      action,
      inside24,
      message: action === 'cancel'
        ? (inside24
          ? `That's with us. Inside 24 hours the deposit is normally forfeited — we'll call you back and talk it through rather than just applying the rule.`
          : `That's with us. You're more than 24 hours out, so your deposit is refunded in full. It goes back to the original card and usually lands within five to ten business days.`)
        : `That's with us. We'll call or text to confirm the new slot — usually within the hour on a working day. Your deposit carries across.`,
    });
  } catch (err) {
    console.error('job-change failed:', err && err.message);
    return res.status(500).json({ error: `Something broke at our end. Call ${PHONE}.` });
  }
};
