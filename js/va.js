/* Vercel Web Analytics: page view counts, no cookies (Vercel project > Analytics, turned on with Enable).
   Included on every page. Runs on cipherautolab.com only, so tests and preview links don't count.
   Before a view is sent, the address keeps only our QR channel (?src=) and campaign tags (utm_*):
   anything else in it, such as a checkout session_id, never leaves the browser.
   Vercel serves the script and takes the views at /_vercel/insights/* once Web Analytics is enabled. */
(function () {
  if (!/^(www\.)?cipherautolab\.com$/.test(location.hostname)) return;
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  window.va('beforeSend', function (event) {
    try {
      var u = new URL(event.url), keep = new URLSearchParams();
      u.searchParams.forEach(function (v, k) { if (k === 'src' || /^utm_[a-z]+$/.test(k)) keep.append(k, v); });
      u.search = keep.toString();
      u.hash = '';
      event.url = u.toString();
    } catch (e) { /* leave it */ }
    return event;
  });
  var s = document.createElement('script');
  s.defer = true;
  s.src = '/_vercel/insights/script.js';
  document.head.appendChild(s);
})();
