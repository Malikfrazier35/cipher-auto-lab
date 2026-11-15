// POST /api/track   {e: "scan"|"start", ch: "<channel id>"}
// Counts a QR code being opened, or the booking screens being opened, for the channel report.
// Sent by js/source.js with navigator.sendBeacon. Counts only (api/_metrics.js): no IP, no device.
import { channel } from './_channels.js';
import { bump, placeOf } from './_metrics.js';

export const deps = { fetch: (...a) => fetch(...a) };   // tests swap this
const OURS = /^https:\/\/(www\.)?cipherautolab\.com(\/|$)|^https:\/\/cipher-auto-lab[a-z0-9-]*\.vercel\.app(\/|$)/;
const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse|monitor/i;

// a brake on someone inflating the counts (memory only, per running instance)
const hits = new Map();
function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < 600000);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 20;
}

export async function track(request, env) {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  const from = request.headers.get('origin') || request.headers.get('referer') || '';
  if (!OURS.test(from)) return new Response(null, { status: 403 });
  if (BOTS.test(request.headers.get('user-agent') || '')) return new Response(null, { status: 204 });
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return new Response(null, { status: 204 });
  let body = {};
  try { body = JSON.parse((await request.text()).slice(0, 500)); } catch { return new Response(null, { status: 400 }); }
  const ch = channel(body.ch), e = body.e === 'start' ? 'start' : body.e === 'scan' ? 'scan' : '';
  if (!e || (!ch && body.ch)) return new Response(null, { status: 400 });
  await bump(env, { e, ch: ch ? ch.id : 'direct', place: placeOf(request.headers) }, deps.fetch);
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export default {
  fetch(request) { return track(request, process.env); },
};
