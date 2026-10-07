/* Service buttons live on detailing.html. They arrive here as quote.html?svc=<key>;
   this selects the matching option once the booking widget has bound its handlers.
   The key comes from the URL, so it is treated as untrusted: only a short lowercase
   word is accepted, it is escaped before it touches a selector, and the lookup is
   confined to the service picker so a crafted link can't click anything else. */
(function () {
  var k = new URLSearchParams(location.search).get('svc');
  if (!k || !/^[a-z]{2,20}$/.test(k)) return;
  window.addEventListener('load', function () {
    setTimeout(function () {
      try {
        var el = document.querySelector('#svc .door[data-key="' + CSS.escape(k) + '"]');
        if (el) { el.click(); el.scrollIntoView({ block: 'center' }); }
      } catch (e) { /* widget not present; do nothing */ }
    }, 250);
  });
})();
