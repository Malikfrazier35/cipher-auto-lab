/* Gift card codes at booking (both booking flows). Checks a code with /api/gift-check and words the
   answer. The booking itself checks the card again on the server, so nothing here decides money.
   Black Friday bonus cards (BF-...) only pay for details on their dates (Jan 1 - Mar 31, 2027).
   CALGift.check(code) -> Promise<{ ok, code, balance, bonus?, from?, until?, range?, error }>
   CALGift.card(answer) -> what the page keeps about a card that checked out
   CALGift.usable(card, ymd) -> can this card pay for a detail on that day
   CALGift.covers(card, deposit, ymd) -> does it pay the whole deposit
   CALGift.words(card, deposit, ymd) -> what the card does for this booking                       */
(function () {
  function clean(v) {
    var s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    var bonus = /^BF[A-Z0-9]{8}$/.test(s), body = bonus ? s.slice(2) : s.replace(/^GC/, '');
    return body.length === 8 ? (bonus ? 'BF-' : 'GC-') + body.slice(0, 4) + '-' + body.slice(4) : '';
  }
  function money(n) { return '$' + (Math.round(n * 100) % 100 ? n.toFixed(2) : Math.round(n)); }
  function usable(card, ymd) { return !!card && (!card.bonus || (!!ymd && ymd >= card.from && ymd <= card.until)); }
  window.CALGift = {
    clean: clean,
    check: function (code) {
      var c = clean(code);
      if (!c) return Promise.resolve({ ok: false, error: 'Gift card codes look like GC-7KQ2-MX9P (bonus cards BF-7KQ2-MX9P).' });
      return fetch('/api/gift-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: c }) })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (d) { return d && d.ok ? d : { ok: false, error: (d && d.error) || "We couldn't check the card just now. Try again, or call (203) 560-3572." }; })
        .catch(function () { return { ok: false, error: "We couldn't check the card just now. Try again, or call (203) 560-3572." }; });
    },
    card: function (d) { return { code: d.code, balance: d.balance, bonus: !!d.bonus, from: d.from || '', until: d.until || '', range: d.range || '' }; },
    usable: usable,
    covers: function (card, deposit, ymd) { return !!card && usable(card, ymd) && card.balance >= deposit; },
    words: function (card, deposit, ymd) {
      var what = card.bonus ? 'Black Friday bonus card: ' + money(card.balance) + ' on it. ' : money(card.balance) + ' on this card. ';
      if (card.bonus && !ymd) return what + 'It works on details done ' + card.range + '.';
      if (!usable(card, ymd)) return what + 'It works on details done ' + card.range + ', so pick a day in that range to use it. On this day the deposit is paid as usual.';
      return card.balance >= deposit
        ? what + 'It covers the ' + money(deposit) + ' deposit, so there is nothing to pay today, and it comes off your final bill.'
        : what + 'It comes off your final bill. The ' + money(deposit) + ' deposit is paid as usual.';
    },
    money: money,
  };
})();
