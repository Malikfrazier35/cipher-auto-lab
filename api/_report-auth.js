// Sign-in for the channel report page: a passcode screen instead of a key in the link.
//   REPORT_PASSCODE  what you type (Vercel, Sensitive, 6+ characters). Unset or shorter: REPORT_KEY is the passcode.
//   REPORT_KEY       signs the "signed in" cookie, and still works as ?key= or a Bearer header for scripts.
// Signing in sets an HttpOnly cookie for this page only, for 30 days ("keep me signed in") or until the
// browser closes. Changing either variable in Vercel signs every device out.
// Wrong passcodes: 5 from one connection, or 20 from anywhere, lock the screen for 15 minutes / an hour
// (counted in Upstash Redis when connected, otherwise per server instance) and push a warning to the phone.
// Connections are kept only as a keyed hash, for the length of the lockout.
// Files in /api whose names start with "_" are shared code, not endpoints.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { pipeline, metricsOn } from './_metrics.js';
import { push } from './_notify.js';

export const COOKIE = 'cal_report';
const PATH = '/api/channel-report';
const DAY = 864e5;
export const LIMITS = { ip: 5, ipSecs: 900, all: 20, allSecs: 3600 };

const sha = (s) => createHash('sha256').update(String(s ?? '')).digest();
/** Constant-time comparison of two secrets of any length. */
export const sameSecret = (a, b) => timingSafeEqual(sha(a), sha(b));

/** What the screen accepts: REPORT_PASSCODE when it is 6+ characters, otherwise REPORT_KEY. */
export function passcodeOf(env) {
  const p = String(env.REPORT_PASSCODE || '').trim();
  return p.length >= 6 ? p : String(env.REPORT_KEY || '').trim();
}
function sig(env, exp) {
  return createHmac('sha256', String(env.REPORT_KEY)).update(exp + '|' + sha(passcodeOf(env)).toString('hex').slice(0, 16)).digest('base64url');
}
/** Set-Cookie value after a right passcode. */
export function sessionCookie(env, { remember = true, now = Date.now() } = {}) {
  const exp = (now + (remember ? 30 * DAY : DAY / 2)).toString(36);
  return `${COOKIE}=${exp}.${sig(env, exp)}; Path=${PATH}; ${remember ? `Max-Age=${30 * 86400}; ` : ''}HttpOnly; Secure; SameSite=Lax`;
}
export const signOutCookie = `${COOKIE}=; Path=${PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/** True when the request carries an unexpired cookie signed with the current key and passcode. */
export function signedIn(env, cookieHeader, now = Date.now()) {
  const m = String(cookieHeader || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([0-9a-z]{1,12})\\.([A-Za-z0-9_-]{43})(?:;|$)`));
  if (!m || !(parseInt(m[1], 36) > now)) return false;
  return sameSecret(m[2], sig(env, m[1]));
}

// ---- wrong-passcode limits ----
const mem = new Map();   // fallback when Redis is not connected: per running instance only
function memCount(key, secs, add) {
  const now = Date.now(), e = mem.get(key);
  const cur = e && e.until > now ? e : { n: 0, until: now + secs * 1000 };
  if (add) { cur.n += 1; cur.until = now + secs * 1000; mem.set(key, cur); }
  if (mem.size > 5000) mem.clear();
  return cur.n;
}
const who = (env, ip) => 'cal:pass:ip:' + createHmac('sha256', String(env.REPORT_KEY)).update('ip|' + ip).digest('hex').slice(0, 24);

/** Is the screen locked for this connection (or for everyone)? */
export async function locked(env, ip, fetchImpl) {
  const k = who(env, ip);
  if (metricsOn(env)) {
    try {
      const [a, b] = await pipeline(env, [['GET', k], ['GET', 'cal:pass:all']], fetchImpl);
      return (+a.result || 0) >= LIMITS.ip || (+b.result || 0) >= LIMITS.all;
    } catch { /* fall back to memory */ }
  }
  return memCount(k, LIMITS.ipSecs, false) >= LIMITS.ip || memCount('all', LIMITS.allSecs, false) >= LIMITS.all;
}

/** Count a wrong passcode; warns the owner's phone when a limit is reached. Never throws. */
export async function wrongPasscode(env, ip, place, fetchImpl) {
  const k = who(env, ip);
  let nIp = 0, nAll = 0;
  try {
    if (!metricsOn(env)) throw new Error('memory');
    const r = await pipeline(env, [['INCR', k], ['EXPIRE', k, LIMITS.ipSecs], ['INCR', 'cal:pass:all'], ['EXPIRE', 'cal:pass:all', LIMITS.allSecs]], fetchImpl);
    nIp = +r[0].result || 0; nAll = +r[2].result || 0;
  } catch {
    nIp = memCount(k, LIMITS.ipSecs, true); nAll = memCount('all', LIMITS.allSecs, true);
  }
  if (nIp === LIMITS.ip || nAll === LIMITS.all) {
    await push(env.NTFY_TOPIC, {
      title: 'Report passcode: too many wrong tries', tags: 'warning', priority: 4,
      message: `${nAll === LIMITS.all ? `${nAll} wrong passcodes in the last hour; the report screen is locked for an hour.` : `${nIp} wrong passcodes from one connection${place ? ' near ' + place : ''}; locked for 15 minutes.`} If this wasn't you, change REPORT_PASSCODE in Vercel.`,
    }, fetchImpl).catch(() => {});
  }
  return { nIp, nAll };
}
/** A right passcode clears that connection's count. */
export async function rightPasscode(env, ip, fetchImpl) {
  const k = who(env, ip);
  mem.delete(k);
  if (metricsOn(env)) await pipeline(env, [['DEL', k]], fetchImpl).catch(() => {});
}
export const _resetMemory = () => mem.clear();   // tests

// ---- the passcode screen (no scripts; styles in /report.css) ----
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function loginPage({ action, message = '' }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="same-origin">
<title>Channel report · Cipher Auto Lab</title><link rel="stylesheet" href="/report.css"></head>
<body><main class="r r-login">
<form class="r-card" method="post" action="${esc(action)}">
<p class="r-eyebrow">Cipher Auto Lab · Channel report</p>
<h1>Enter your passcode</h1>
${message ? `<p class="r-msg" role="alert">${esc(message)}</p>` : ''}
<input type="text" name="username" value="Cipher channel report" autocomplete="username" hidden>
<label for="pc">Passcode</label>
<input id="pc" name="passcode" type="password" autocomplete="current-password" required autofocus maxlength="200">
<label class="r-check"><input type="checkbox" name="remember" value="1" checked> Keep me signed in on this device for 30 days</label>
<button type="submit">Open report</button>
</form>
</main></body></html>`;
}
