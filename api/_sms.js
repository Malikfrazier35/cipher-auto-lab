// Texts to customers through Twilio, from the business's toll-free number. Off until these are set
// in Vercel (Settings > Environment Variables, mark the secret ones Sensitive):
//   TWILIO_ACCOUNT_SID   AC...                       (Twilio Console > Account info)
//   TWILIO_API_KEY       SK...  and                  (Console > API keys: a Standard key)
//   TWILIO_API_SECRET    the key's secret            (Sensitive)
//     or, instead of the API key pair, TWILIO_AUTH_TOKEN (Sensitive)
//   TWILIO_FROM          +18xx...                    (the verified toll-free number)
// Only booking texts go out: the customer typed their number into the booking form for this.
// Replies and calls belong on the main line, so every text points there. Twilio handles STOP.
// Files in /api whose names start with "_" are shared code, not endpoints.

export const MAIN_LINE = '(203) 560-3572';

/** Plain GSM-7 text (keeps a text at 160 characters a segment instead of 70). */
export function gsm(s) {
  return String(s || '')
    .replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/\s*·\s*/g, ', ').replace(/…/g, '...').replace(/°/g, '')
    .replace(/[^\x20-\x7E\n]/g, '').replace(/ {2,}/g, ' ').trim();
}

export function configured(env) {
  return !!(env && env.TWILIO_ACCOUNT_SID && env.TWILIO_FROM && (env.TWILIO_API_SECRET || env.TWILIO_AUTH_TOKEN));
}

/** Send one text. Resolves { sid } or { skipped }; throws on a Twilio error. 5 seconds at most. */
export async function sendSms(env, phone10, body, fetchImpl = fetch) {
  if (!configured(env)) return { skipped: 'not configured' };
  if (!/^\d{10}$/.test(String(phone10 || ''))) return { skipped: 'no number' };
  const sid = env.TWILIO_ACCOUNT_SID;
  const user = env.TWILIO_API_SECRET ? env.TWILIO_API_KEY : sid;
  const pass = env.TWILIO_API_SECRET || env.TWILIO_AUTH_TOKEN;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(`${user}:${pass}`), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: '+1' + phone10, From: env.TWILIO_FROM, Body: gsm(body) }).toString(),
      signal: ctl.signal,
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`twilio ${r.status} ${out.code || ''}`.trim());
    return { sid: out.sid || '' };
  } finally { clearTimeout(t); }
}

function dayOf(date) { const d = new Date(date || ''); return isNaN(d) ? (date || 'your day') : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); }

/** The day-before reminder (sent by the morning check, api/weather-watch.js). */
export function reminderText({ service, date, window }) {
  return gsm(`Cipher Auto Lab: reminder, your ${service} is tomorrow, ${dayOf(date)}, ${window}. We'll text your exact arrival time later today. ` +
    `Questions? Text or call ${MAIN_LINE}. Reply STOP to opt out.`);
}

/** The text a customer gets the moment their deposit lands. */
export function confirmationText({ first, service, date, window, ref, deposit }) {
  const day = dayOf(date);
  return gsm(`Cipher Auto Lab: you're booked${first ? ', ' + first : ''}! ${service}, ${day}, ${window}. Ref ${ref}. ` +
    `$${deposit} deposit received. We'll text your arrival time the day before. Questions? Text or call ${MAIN_LINE}. Reply STOP to opt out.`);
}
