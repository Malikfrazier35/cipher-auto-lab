/* Where a visit came from. Every printed QR code and shared link carries ?src=<channel>: its type,
   optionally followed by where it went (door, door-enfield-elm-1118, work-acme, magnet, fb...).
   - Opening a QR link is counted once per visit (POST /api/track: counts only, no personal data).
   - The channel is kept on this device: the first one for 30 days, the latest for 7, and both go
     with a booking or a gift card, so a booking made days after a scan still counts for that code.
   - A printed offer for that channel's type ([data-offer="door"] etc.) is shown on the page.
   CALSource.get() -> latest channel, .first() -> {src, day}, .type() -> its type, .mark('start')  */
(function () {
  var TYPES = ['door', 'magnet', 'card', 'dash', 'postcard', 'flyer', 'work', 'fleet', 'fb', 'ig', 'google', 'gift', 'sms', 'email'];
  var RE = /^[a-z]{2,8}(?:-[a-z0-9]{1,24}){0,4}$/;
  var KEY = 'cal_src2', LAST_DAYS = 7, FIRST_DAYS = 30;
  function valid(s) { return RE.test(s || '') && TYPES.indexOf(s.split('-')[0]) > -1; }
  function today() {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } }
  function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  function once(name) {          // true the first time in this browser tab session
    try { if (sessionStorage.getItem(name)) return false; sessionStorage.setItem(name, '1'); } catch (e) { /* private mode */ }
    return true;
  }
  function beacon(e, ch) {
    var body = JSON.stringify({ e: e, ch: ch || '' });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon('/api/track', new Blob([body], { type: 'text/plain' }))) return;
    } catch (x) { /* fall through */ }
    try { fetch('/api/track', { method: 'POST', body: body, keepalive: true }); } catch (x) { /* counting never matters to the visitor */ }
  }

  var q = '';
  try { q = (new URLSearchParams(location.search).get('src') || '').toLowerCase(); } catch (e) { q = ''; }
  var now = Date.now(), v = load();
  if (!v.last || !valid(v.last.src) || now - v.last.at > LAST_DAYS * 864e5) v.last = null;
  if (!v.first || !valid(v.first.src) || now - v.first.at > FIRST_DAYS * 864e5) v.first = null;
  if (valid(q)) {
    v.last = { src: q, at: now, day: today() };
    if (!v.first) v.first = v.last;
    save(v);
    if (once('cal_scan_' + q)) beacon('scan', q);
  }
  var src = v.last ? v.last.src : '';

  window.CALSource = {
    get: function () { return src; },
    first: function () { return v.first ? { src: v.first.src, day: v.first.day || '' } : { src: '', day: '' }; },
    type: function () { return src ? src.split('-')[0] : ''; },
    mark: function (e) { if (once('cal_' + e + '_' + (src || 'direct'))) beacon(e, src); },
  };
  var type = src ? src.split('-')[0] : '';
  Array.prototype.forEach.call(document.querySelectorAll('[data-offer]'), function (el) {
    el.hidden = el.getAttribute('data-offer') !== type;
  });
})();
