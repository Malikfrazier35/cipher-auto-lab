// Vercel serverless function — receives a photo quote request and emails it over.
//
// This is a public, unauthenticated endpoint that accepts image data, so it is the
// most abusable surface on the site. Everything below is a limit:
//   - hard caps on photo count, per-photo size and total payload
//   - a strict allow-list of image types, checked against the real magic bytes
//     rather than the declared MIME type, which the client controls
//   - a per-IP rate limit
//   - a honeypot checked in the browser and a required-fields check here
// There is no database and no storage bucket. The photos ride out as email
// attachments and this function keeps nothing.

const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 1_600_000;
const MAX_TOTAL_BYTES = 4_000_000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 4;

const OWNER_EMAIL = process.env.OWNER_EMAIL || 'hello@cipherautolab.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Cipher Auto Lab <bookings@cipherautolab.com>';
const PHONE = '(203) 592-9589';

// Best-effort, per-instance. Vercel may run several instances, so this thins a
// flood rather than stopping a determined one — which is the right trade here,
// because a false positive costs a real customer a real quote.
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  for (const [k, v] of hits) if (now - v.first > RATE_WINDOW_MS) hits.delete(k);
  const rec = hits.get(ip);
  if (!rec) { hits.set(ip, { first: now, n: 1 }); return false; }
  rec.n += 1;
  return rec.n > RATE_MAX;
}

const clean = (v, max = 200) =>
  String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);

const esc = (v) =>
  String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Trust the bytes, not the label. A "data:image/jpeg" prefix costs an attacker
// nothing to type; the file header is what the file actually is.
const MAGIC = [
  { ext: 'jpg',  mime: 'image/jpeg', test: (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { ext: 'png',  mime: 'image/png',  test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
  { ext: 'webp', mime: 'image/webp', test: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
];

function decodePhoto(entry, i) {
  const url = typeof entry === 'string' ? entry : (entry && entry.dataUrl);
  if (typeof url !== 'string') return null;
  const comma = url.indexOf(',');
  if (!url.startsWith('data:image/') || comma < 0) return null;

  const b64 = url.slice(comma + 1);
  if (b64.length > MAX_PHOTO_BYTES * 1.4) return null;
  let buf;
  try { buf = Buffer.from(b64, 'base64'); } catch { return null; }
  if (!buf.length || buf.length > MAX_PHOTO_BYTES) return null;

  const kind = MAGIC.find((m) => m.test(buf));
  if (!kind) return null;

  return {
    filename: `photo-${i + 1}.${kind.ext}`,
    content: buf.toString('base64'),
    bytes: buf.length,
  };
}

async function sendEmail({ to, subject, html, text, replyTo, attachments }) {
  const key = process.env.RESEND_API_KEY;
  // A booking can survive a missing mail key because Stripe notifies separately.
  // A lead cannot — email is the only channel it has. Failing loudly and pointing
  // the customer at the phone beats a green tick over a lead that went nowhere.
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL, to: [to], subject, html, text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(attachments && attachments.length ? { attachments } : {}),
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = clean(
    (req.headers['x-forwarded-for'] || '').split(',')[0] ||
    (req.socket && req.socket.remoteAddress) || 'unknown', 45);

  if (rateLimited(ip)) {
    return res.status(429).json({
      error: `That's a few requests in a short while. Text the photos to ${PHONE} instead.`,
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    const name  = clean(body.name, 80);
    const phone = clean(body.phone, 30);
    const town  = clean(body.town, 60);
    if (name.length < 2 || phone.replace(/\D/g, '').length !== 10 || town.length < 2) {
      return res.status(400).json({ error: 'A name, a 10-digit phone number and a town are required.' });
    }

    const raw = Array.isArray(body.photos) ? body.photos.slice(0, MAX_PHOTOS) : [];
    const attachments = [];
    let total = 0;
    for (let i = 0; i < raw.length; i++) {
      const p = decodePhoto(raw[i], i);
      if (!p) continue;
      total += p.bytes;
      if (total > MAX_TOTAL_BYTES) break;
      attachments.push({ filename: p.filename, content: p.content });
    }
    if (!attachments.length) {
      return res.status(400).json({
        error: `No readable photo came through. Text them to ${PHONE} and we'll quote from there.`,
      });
    }

    const ref     = clean(body.ref, 20) || 'CAL-P' + Date.now().toString(36).toUpperCase().slice(-5);
    const service = clean(body.service, 60) || 'Not specified';
    const note    = clean(body.note, 600);
    const when    = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const tel     = phone.replace(/\D/g, '');

    const rows = [
      ['Reference', ref], ['Name', name], ['Phone', phone], ['Town', town],
      ['Asking about', service], ['Photos', `${attachments.length} attached`],
      ['Received', when + ' ET'],
    ];

    const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;color:#111814">
  <p style="font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;text-transform:uppercase;color:#2F6B21;margin:0 0 6px">Photo quote request</p>
  <h2 style="margin:0 0 4px;font-size:21px">${esc(name)} — ${esc(town)}</h2>
  <p style="margin:0 0 18px;color:#6C776F;font-size:14px">Reply fast. A quote inside the hour lands while they are still thinking about the car.</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    ${rows.map(([k, v]) => `<tr>
      <td style="padding:7px 0;color:#6C776F;width:130px;border-bottom:1px solid #E6EBE1">${esc(k)}</td>
      <td style="padding:7px 0;font-weight:600;border-bottom:1px solid #E6EBE1">${esc(v)}</td></tr>`).join('')}
  </table>
  ${note ? `<p style="margin:18px 0 0;font-size:14px;line-height:1.6"><b>They said:</b><br>${esc(note).replace(/\n/g, '<br>')}</p>` : ''}
  <p style="margin:22px 0 0">
    <a href="tel:+1${tel}" style="display:inline-block;background:#A3E635;color:#08110A;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:15px">Call ${esc(phone)}</a>
    <a href="sms:+1${tel}" style="display:inline-block;margin-left:8px;border:1px solid #D9E0D3;color:#111814;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:15px">Text them</a>
  </p>
  <p style="margin:20px 0 0;font-size:12px;color:#9AA69D">Photos are attached to this email. Nothing is stored on the site.</p>
</div>`;

    const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n')
      + (note ? `\n\nThey said:\n${note}` : '')
      + `\n\nCall or text: ${phone}`;

    try {
      await sendEmail({
        to: OWNER_EMAIL,
        subject: `PHOTO QUOTE — ${name}, ${town} — ${service}`,
        html, text, replyTo: OWNER_EMAIL, attachments,
      });
    } catch (mailErr) {
      // The customer should not be told to try again when the photos are fine and
      // it is our mail provider that is down — but we must not pretend it arrived.
      console.error('photo-quote email failed:', mailErr && mailErr.message);
      return res.status(502).json({
        error: `Our mail is down at the moment, so this didn't reach us. Text the photos to ${PHONE}.`,
      });
    }

    return res.status(200).json({ ok: true, ref, photos: attachments.length });
  } catch (err) {
    console.error('photo-quote failed:', err && err.message);
    return res.status(500).json({
      error: `Something broke at our end. Text the photos to ${PHONE} and we'll sort it.`,
    });
  }
};
