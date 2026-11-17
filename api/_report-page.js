// The channel report as a page to read in a browser (api/channel-report.js, when opened from a link).
// Plain HTML with no scripts; styles in /report.css. Owner-only: served only after the passcode screen
// (api/_report-auth.js) or with the key.
// Files in /api whose names start with "_" are shared code, not endpoints.
import { SVC, PAINT, TIER } from './_booking.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (v) => '$' + Math.round(+v || 0).toLocaleString('en-US');
const num = (v) => (+v || 0).toLocaleString('en-US');
const pctTxt = (v) => (v === null || v === '' || v === undefined ? '–' : v + '%');
function nice(day) {
  const d = new Date(day + 'T12:00:00Z');
  return isNaN(d) ? day : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
const service = (b) => [SVC[b.service] && SVC[b.service].name, PAINT[b.paint] && PAINT[b.paint].name].filter(Boolean).join(' + ') || b.service || b.paint || '';
const short = (day) => (day ? nice(day).replace(/, \d{4}$/, '') : '');

function table(cols, rows) {
  const head = cols.map((c) => `<th${c.n ? ' class="n"' : ''}>${esc(c.h)}</th>`).join('');
  const body = rows.map((r) => '<tr>' + cols.map((c) => `<td${c.n ? ' class="n"' : ''}>${c.v(r)}</td>`).join('') + '</tr>').join('');
  return `<div class="r-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/** The whole page. `link(params)` builds a report URL that keeps the key. */
export function reportPage({ since, until, days, tables, scansOn, link }) {
  const { channels, towns, places, bookings, daily } = tables;
  const sum = (rows, f) => rows.reduce((a, r) => a + (+r[f] || 0), 0);
  const active = channels.filter((c) => c.scans || c.starts || c.bookings || c.first_touch_bookings || c.gift_cards);
  const giftValue = sum(channels, 'gift_value');
  const section = (id, title, sub, inner, csv = true) => `<section id="${id}"><div class="r-h"><h2>${esc(title)}</h2>${csv ? `<a href="${esc(link({ since, until, format: 'csv', table: id }))}">Download for a spreadsheet</a>` : ''}</div>${sub ? `<p class="r-sub">${sub}</p>` : ''}${inner}</section>`;
  const empty = (txt) => `<p class="r-empty">${esc(txt)}</p>`;
  const tabs = [7, 30, 90, 365].map((n) => `<a href="${esc(link({ days: n }))}"${days === n ? ' aria-current="page"' : ''}>${n === 365 ? 'Last year' : `Last ${n} days`}</a>`).join('');

  const chTable = active.length ? table([
    { h: 'Channel', v: (c) => `${esc(c.label)}<small>${esc(c.channel === 'direct' ? 'Website, Google, word of mouth' : c.channel)}${c.printed ? ' · printed ' + esc(short(c.printed)) : ''}${c.qty ? ' · ' + esc(num(c.qty)) + ' pieces' : ''}</small>` },
    { h: 'QR opens', n: 1, v: (c) => num(c.scans) },
    { h: 'Started booking', n: 1, v: (c) => num(c.starts) },
    { h: 'Booked', n: 1, v: (c) => num(c.bookings) },
    { h: 'First touch', n: 1, v: (c) => num(c.first_touch_bookings) },
    { h: 'Booked value', n: 1, v: (c) => money(c.booked_value) },
    { h: 'Open → booked', n: 1, v: (c) => pctTxt(c.scan_to_book_pct) },
    { h: 'Cost per booking', n: 1, v: (c) => (c.cost_per_booking === '' ? '–' : money(c.cost_per_booking)) },
    { h: 'Gift cards', n: 1, v: (c) => (c.gift_cards ? `${num(c.gift_cards)}<small>${money(c.gift_value)}</small>` : '0') },
  ], active) : empty('Nothing yet in these dates. Each QR code shows up here the first time it is opened.');

  const townTable = towns.length ? table([
    { h: 'Town', v: (t) => `${esc(t.town)}<small>${esc(t.county)}</small>` },
    { h: 'ZIP', v: (t) => esc(t.zips) },
    { h: 'Bookings', n: 1, v: (t) => num(t.bookings) },
    { h: 'Booked value', n: 1, v: (t) => money(t.booked_value) },
    { h: 'Came from', v: (t) => esc(t.channels) },
  ], towns) : empty('No bookings in these dates yet.');

  const placeRows = places.slice(0, 60);
  const placeTable = placeRows.length ? table([
    { h: 'Channel', v: (p) => esc(p.channel_label) },
    { h: 'Opened near', v: (p) => esc(p.place || 'Unknown') },
    { h: 'QR opens', n: 1, v: (p) => num(p.scans) },
    { h: 'Started booking', n: 1, v: (p) => num(p.starts) },
  ], placeRows) : empty(scansOn ? 'No QR codes opened in these dates yet.' : 'Scan counts are off.');

  const recent = bookings.slice().reverse();
  const bookTable = recent.length ? table([
    { h: 'Booking', v: (b) => `${esc(b.ref)}<small>booked ${esc(short(b.booked_day))}</small>` },
    { h: 'Job day', v: (b) => esc(short(b.job_day)) + (b.lead_days !== '' ? `<small>${esc(b.lead_days)} days ahead</small>` : '') },
    { h: 'Channel', v: (b) => esc(b.channel_label) + (b.first_channel !== b.channel ? `<small>first saw ${esc(b.first_channel)}${b.days_to_book !== '' ? ', ' + esc(b.days_to_book) + ' days before' : ''}</small>` : '') },
    { h: 'Town', v: (b) => `${esc(b.town)}<small>${esc(b.zip)}</small>` },
    { h: 'Service', v: (b) => `${esc(service(b))}<small>${esc([TIER[b.size] || b.size, b.addons ? b.addons + (b.addons === 1 ? ' add-on' : ' add-ons') : ''].filter(Boolean).join(' · '))}</small>` },
    { h: 'Paid with', v: (b) => esc(b.paid_with) },
    { h: 'Est. value', n: 1, v: (b) => money(b.est_value) },
  ], recent) : empty('No bookings in these dates yet.');

  const busy = daily.filter((d) => d.scans || d.starts || d.bookings || d.gift_cards).reverse();
  const dayTable = busy.length ? table([
    { h: 'Day', v: (d) => esc(nice(d.day)) },
    { h: 'QR opens', n: 1, v: (d) => num(d.scans) },
    { h: 'Started booking', n: 1, v: (d) => num(d.starts) },
    { h: 'Booked', n: 1, v: (d) => num(d.bookings) },
    { h: 'Booked value', n: 1, v: (d) => money(d.booked_value) },
    { h: 'Gift cards', n: 1, v: (d) => num(d.gift_cards) },
  ], busy) : empty('Nothing yet in these dates.');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="same-origin">
<title>Channel report · Cipher Auto Lab</title><link rel="stylesheet" href="/report.css"></head>
<body><main class="r">
<div class="r-top"><div><p class="r-eyebrow">Cipher Auto Lab · Channel report</p><h1>Where bookings come from</h1>
<p class="r-range">${esc(nice(since))} to ${esc(nice(until))}</p></div><nav class="r-tabs" aria-label="Dates">${tabs}</nav></div>
${scansOn ? '' : '<p class="r-note">QR opens are not being counted: Upstash for Redis is not connected to this project. Bookings below still come straight from Stripe.</p>'}
<div class="r-tiles">
<div class="r-tile"><b>${num(sum(daily, 'scans'))}</b><span>QR opens</span></div>
<div class="r-tile"><b>${num(sum(daily, 'starts'))}</b><span>Started booking</span></div>
<div class="r-tile"><b>${num(bookings.length)}</b><span>Bookings</span></div>
<div class="r-tile"><b>${money(sum(bookings, 'est_value'))}</b><span>Booked value (est.)</span></div>
<div class="r-tile"><b>${num(sum(channels, 'gift_cards'))}</b><span>Gift cards · ${money(giftValue)}</span></div>
</div>
${section('channels', 'By QR code or link', '"First touch" counts bookings whose first scan was that code, even if they booked through a different one later. Codes with no activity in these dates are left out here and kept in the download.', chTable)}
${section('towns', 'By town (where the work is)', '', townTable)}
${section('places', 'Where QR codes were opened', 'Approximate, from the phone\'s internet connection: a nearby town, not an address.', placeTable)}
${section('bookings', 'Each booking', 'No names, phone numbers or addresses. Those stay in Stripe and on your bookings board.', bookTable)}
${section('daily', 'Day by day', 'Days with no activity are left out here and kept in the download.', dayTable)}
<div class="r-foot"><p>Booked value is the estimate at booking (package, size and add-ons), before travel fees and anything found on site. Bookings come from Stripe; QR opens are counted once per visit.</p>
<form method="post" action="/api/channel-report"><button class="r-out" type="submit" name="signout" value="1">Sign out of this device</button></form></div>
</main></body></html>`;
}
