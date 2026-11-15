/* Gift card codes at booking (both booking flows). Checks a code with /api/gift-check and words the
   answer. The booking itself checks the card again on the server, so nothing here decides money.
   CALGift.check(code) -> Promise<{ ok, code, balance, error }>
   CALGift.words(card, deposit) -> what the card does for this booking                          */
(function () {
  function clean(v) {
    var s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^GC/, '');
    return s.length === 8 ? 'GC-' + s.slice(0, 4) + '-' + s.slice(4) : '';
  }
  function money(n) { return '$' + (Math.round(n * 100) % 100 ? n.toFixed(2) : Math.round(n)); }
  window.CALGift = {
    clean: clean,
    check: function (code) {
      var c = clean(code);
      if (!c) return Promise.resolve({ ok: false, error: 'Gift card codes look like GC-7KQ2-MX9P.' });
      return fetch('/api/gift-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: c }) })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (d) { return d && d.ok ? d : { ok: false, error: (d && d.error) || "We couldn't check the card just now. Try again, or call (203) 560-3572." }; })
        .catch(function () { return { ok: false, error: "We couldn't check the card just now. Try again, or call (203) 560-3572." }; });
    },
    covers: function (card, deposit) { return !!card && card.balance >= deposit; },
    words: function (card, deposit) {
      return card.balance >= deposit
        ? money(card.balance) + ' on this card. It covers the ' + money(deposit) + ' deposit, so there is nothing to pay today, and it comes off your final bill.'
        : money(card.balance) + ' on this card. It comes off your final bill. The ' + money(deposit) + ' deposit is paid as usual.';
    },
    money: money,
  };
})();
