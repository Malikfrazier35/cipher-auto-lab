// GET /api/weather?area=hartford
// The booking screens' forecast (js/weather.js): each day and each arrival window, from the
// National Weather Service. Cached at Vercel's edge for 30 minutes per area, so NWS sees a
// handful of requests an hour however busy the site is, and a brief NWS outage serves the
// last good forecast instead of nothing.
import { AREAS, forecast } from './_weather.js';

export async function weather(request, fetchImpl = fetch) {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
  const area = new URL(request.url).searchParams.get('area') || 'hartford';
  if (!AREAS[area]) return new Response(JSON.stringify({ error: 'unknown area' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  try {
    const data = await forecast(area, fetchImpl);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'Vercel-CDN-Cache-Control': 'max-age=1800, stale-while-revalidate=7200',
      },
    });
  } catch (e) {
    console.error('weather failed', area, e && e.message);
    return new Response(JSON.stringify({ error: 'forecast unavailable' }), {
      status: 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
}

export default { fetch(request) { return weather(request); } };
