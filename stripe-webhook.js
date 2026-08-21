// Vercel serverless function — fires when a deposit actually succeeds.
//
// Stripe calls this, not the browser. That matters: if the customer pays and then
// immediately closes the tab, this still runs. Anything wired to the front end would
// silently lose the booking.
//
// SECURITY: every request is signature-verified against STRIPE_WEBHOOK_SECRET. Without
// that check this URL is a public endpoint anyone can POST fake bookings to.

const Stripe = require('stripe');

// Vercel's Node runtime parses JSON bodies by default. Stripe's signature is computed
// over the RAW bytes, so a parsed-and-restringified body will not verify. Turn it off.
module.exports.config = { api: { bodyParser: false } };

const OWNER_EMAIL = process.env.OWNER_EMAIL || 'hello@cipherautolab.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Cipher Auto Lab <bookings@cipherautolab.com>';
const PHONE = '(203) 592-9589';

function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(typeof c === 'string' ? Buffer.from(c) : c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const esc = (v) =>
  String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (cents) => '$' + (cents / 100).toFixed(2).replace(/\.00$/, '');

async function sendEmail({ to, subject, html, text, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('RESEND_API_KEY not set — skipping email to', to);
    return { skipped: true };
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL, to: [to], subject, html, text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!r.ok) {
    console.error('Resend failed', r.status, await r.text().catch(() => ''));
    return { ok: false };
  }
  return { ok: true };
}

function shell(title, bodyHtml) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F4F7F9;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7F9;padding:28px 12px">
   <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden;
                  border:1px solid #E2E8EE">
      <tr><td style="background:#0B0F12;padding:22px 26px">
        <div style="font-size:17px;font-weight:800;letter-spacing:.14em;color:#FFFFFF">CIPHER</div>
        <div style="font-size:9px;letter-spacing:.36em;color:#8B96A4;margin-top:4px">AUTO LAB</div>
      </td></tr>
      <tr><td style="height:4px;background:#A3E635"></td></tr>
      <tr><td style="padding:28px 26px">
        <h1 style="margin:0 0 6px;font-size:21px;color:#0E1418">${esc(title)}</h1>
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:18px 26px 26px;border-top:1px solid #EDF1F5">
        <p style="margin:0;font-size:13px;color:#6B7783">
          Cipher Auto Lab LLC · Connecticut<br>
          <a href="tel:+12035929589" style="color:#0E1418;text-decoration:none">${PHONE}</a> ·
          <a href="https://cipherautolab.com" style="color:#0E1418">cipherautolab.com</a>
        </p>
      </td></tr>
    </table>
   </td></tr></table></body></html>`;
}

function row(label, value) {
  if (!value) return '';
  return `<tr>
    <td style="padding:8px 0;font-size:13px;color:#6B7783;width:130px;vertical-align:top">${esc(label)}</td>
    <td style="padding:8px 0;font-size:14px;color:#0E1418;font-weight:600">${esc(value)}</td></tr>`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !whsec) {
    console.error('Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  const stripe = Stripe(key);
  let event;
  try {
    const buf = await rawBody(req);
    event = stripe.webhooks.constructEvent(buf, req.headers['stripe-signature'], whsec);
  } catch (err) {
    // A bad signature means it did not come from Stripe. Say no and stop.
    console.error('Signature verification failed:', err && err.message);
    return res.status(400).send(`Webhook Error: ${err && err.message}`);
  }

  if (event.type !== 'payment_intent.succeeded') {
    return res.status(200).json({ received: true, ignored: event.type });
  }

  const pi = event.data.object;
  const m = pi.metadata || {};

  try {
    const details =
      row('Reference', m.reference) +
      row('Service', m.package) +
      row('Vehicle', [m.vehicle, m.size].filter(Boolean).join(' · ')) +
      row('Condition', m.condition) +
      row('When', [m.date, m.window].filter(Boolean).join(' · ')) +
      row('Where', [m.address, m.town].filter(Boolean).join(', ')) +
      row('Parked', m.parked) +
      row('Estimate', m.est_total) +
      row('Deposit paid', money(pi.amount_received || pi.amount)) +
      row('Signed by', m.signed_by) +
      row('Agreement', m.agreement ? `${m.agreement} · ${m.signed_at || ''}`.trim() : '');

    const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:18px 0;border-top:1px solid #EDF1F5">${details}</table>`;

    // ---- to the customer ----
    if (m.email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m.email)) {
      const balance = m.est_total
        ? `<p style="margin:14px 0;font-size:14px;color:#3D4A56">Your estimate is
           <b>${esc(m.est_total)}</b>, and the deposit above comes off that — it is not an
           extra charge. The balance is due when the work is done, after you have looked
           over the vehicle with us.</p>` : '';

      await sendEmail({
        to: m.email,
        replyTo: OWNER_EMAIL,
        subject: `Booking confirmed — ${m.package || 'Cipher Auto Lab'} · ${m.reference || ''}`.trim(),
        text:
`Your booking is confirmed.

Reference: ${m.reference || '-'}
Service:   ${m.package || '-'}
Vehicle:   ${[m.vehicle, m.size].filter(Boolean).join(' · ') || '-'}
When:      ${[m.date, m.window].filter(Boolean).join(' · ') || '-'}
Where:     ${[m.address, m.town].filter(Boolean).join(', ') || '-'}
Estimate:  ${m.est_total || '-'}
Deposit:   ${money(pi.amount_received || pi.amount)} (comes off the total)

Before we arrive: empty the vehicle of personal items and child seats, and leave
about 15 feet of clear space around it. We bring our own water and power.

Cancelling: full refund with 24 hours notice, if we reschedule for any reason
including weather, or if we re-quote on arrival and you would rather not go ahead.

Questions: ${PHONE}
cipherautolab.com`,
        html: shell('Your booking is confirmed', `
          <p style="margin:0 0 4px;font-size:15px;color:#3D4A56">Thanks${m.name ? ', ' + esc(String(m.name).split(' ')[0]) : ''} — you're on the books. Here's what we have:</p>
          ${table}
          ${balance}
          <div style="background:#F6FAF2;border:1px solid #E0EFCB;border-radius:10px;padding:16px 18px;margin:20px 0">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#0E1418">Before we arrive</p>
            <p style="margin:0;font-size:13.5px;color:#3D4A56;line-height:1.6">
              Empty the vehicle of personal items and child seats, and leave roughly 15 feet
              of clear space around it. We bring our own water and power, so you don't need
              to supply either.</p>
          </div>
          <p style="margin:16px 0 0;font-size:13px;color:#6B7783;line-height:1.6">
            <b style="color:#0E1418">Need to change it?</b> Full refund with 24 hours notice,
            if we reschedule for any reason including weather, or if we re-quote on arrival
            and you'd rather not go ahead. Just call ${PHONE}.<br>
            <a href="https://cipherautolab.com/agreement" style="color:#3D7A2E">Service Agreement</a> ·
            <a href="https://cipherautolab.com/terms" style="color:#3D7A2E">Full terms</a> ·
            <a href="https://cipherautolab.com/privacy" style="color:#3D7A2E">Privacy</a>
          </p>
          <p style="margin:14px 0 0;padding-top:14px;border-top:1px solid #EDF1F5;font-size:12px;color:#8A96A2;line-height:1.6">
            <b style="color:#3D4A56">Your signed copy.</b> You signed Service Agreement
            ${esc(m.agreement || 'v1.0')} as <b style="color:#3D4A56">${esc(m.signed_by || '')}</b>
            on ${esc(m.signed_at || '')}. Photo consent: ${esc(m.photo_consent || 'no')}.
            Keep this email — it's your record.</p>`),
      });
    }

    // ---- to you ----
    await sendEmail({
      to: OWNER_EMAIL,
      replyTo: m.email || undefined,
      subject: `NEW BOOKING · ${m.package || '?'} · ${m.date || '?'} · ${m.town || '?'}`,
      text:
`NEW BOOKING

${m.reference || '-'}
${m.package || '-'}   deposit ${money(pi.amount_received || pi.amount)}

WHEN   ${[m.date, m.window].filter(Boolean).join(' · ') || '-'}
WHERE  ${[m.address, m.town].filter(Boolean).join(', ') || '-'}
PARKED ${m.parked || '-'}

CAR    ${[m.vehicle, m.size, m.condition].filter(Boolean).join(' · ') || '-'}
QUOTE  ${m.est_total || '-'}

${m.name || '-'}
${m.phone || '-'}
${m.email || '-'}

NOTES: ${m.notes || '(none)'}

SIGNED  ${m.signed_by || '-'}  ${m.agreement || ''}  ${m.signed_at || ''}
IP      ${m.signed_ip || '-'}
PHOTOS  ${m.photo_consent === 'yes' ? 'CONSENTED' : 'no consent — do not post'}

Stripe: https://dashboard.stripe.com/payments/${pi.id}`,
      html: shell('New booking', `
        <p style="margin:0;font-size:15px;color:#3D4A56">Deposit cleared. Put it in the calendar.</p>
        ${table}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="border-top:1px solid #EDF1F5">
          ${row('Name', m.name)}
          ${row('Phone', m.phone)}
          ${row('Email', m.email)}
          ${row('Notes', m.notes || '(none)')}
          ${row('Signed IP', m.signed_ip)}
          ${row('Photo consent', m.photo_consent === 'yes' ? 'YES — ok to post' : 'NO — do not post')}
        </table>
        <p style="margin:20px 0 0">
          <a href="tel:${esc(String(m.phone || '').replace(/\D/g, ''))}"
             style="display:inline-block;background:#A3E635;color:#14300A;text-decoration:none;
                    font-weight:700;font-size:14px;padding:11px 20px;border-radius:8px">Call the customer</a>
          <a href="https://dashboard.stripe.com/payments/${esc(pi.id)}"
             style="display:inline-block;margin-left:8px;font-size:13px;color:#6B7783">View in Stripe</a>
        </p>`),
    });
  } catch (err) {
    // Never 500 on an email problem — Stripe would retry and the customer could get
    // duplicates. Log it and acknowledge; the payment itself is already safe.
    console.error('Notification failed for', pi.id, err && err.message);
  }

  return res.status(200).json({ received: true });
};
