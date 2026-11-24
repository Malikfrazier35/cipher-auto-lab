/* /gift: buy a gift card. Pick the card, say who it's from and for, pay (Apple Pay / Google Pay
   first, then card: js/deposit.js), then show the card with its code, to print or forward.
   The amount and the code are made on the server (api/create-gift-session.js); the code is also on
   the Stripe receipt. Back from a payment app that left the page: /gift?paid=1&session_id=...   */
(function () {
  var form = document.getElementById('giftForm');
  if (!form) return;
  function $(id) { return document.getElementById(id); }
  var AMT = { g50: 50, g100: 100, g150: 150, full: 259 };
  var payUI = null, sessionId = '', paying = false, buyerEmail = '';

  function pick() { var r = form.querySelector('input[name="gift"]:checked'); return r ? r.value : 'g100'; }
  function err(id, m) { var e = $(id); e.textContent = m || ''; e.hidden = !m; }
  form.addEventListener('change', function (e) {
    if (e.target.name === 'gift') { $('gAmt').textContent = '$' + AMT[pick()]; resetPay(); }
  });
  ['gFrom', 'gEmail', 'gTo', 'gNote'].forEach(function (id) { $(id).addEventListener('input', resetPay); });

  function resetPay() {        // anything changed after payment was set up: set it up again
    if (!payUI) return;
    payUI = null; sessionId = '';
    $('gExpress').innerHTML = ''; $('gPayment').innerHTML = ''; $('gSep').hidden = true;
    $('gPay').hidden = true; $('gNext').hidden = false; $('gPayBtn').disabled = true;
  }

  function check() {
    var from = $('gFrom').value.trim(), email = $('gEmail').value.trim(), to = $('gTo').value.trim();
    if (from.length < 2) return ['gFrom', 'Add your name, so they know who it is from.'];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return ['gEmail', 'Add your email: the receipt with the gift code goes there.'];
    if (to.length < 2) return ['gTo', 'Add the name of the person it is for.'];
    return null;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var bad = check();
    if (bad) { err('gErr', bad[1]); $(bad[0]).focus(); return; }
    err('gErr', '');
    start();
  });

  function start() {
    if (!window.STRIPE_PK || !window.Stripe || !window.CALDeposit) {
      err('gErr', 'Card payments are paused right now. Call or text (203) 560-3572 and we will set up the gift card with you.');
      return;
    }
    $('gNext').hidden = true; $('gPay').hidden = false; $('gWait').style.display = 'flex'; err('gPayErr', '');
    $('gAmt').textContent = '$' + AMT[pick()];
    buyerEmail = $('gEmail').value.trim();
    fetch('/api/create-gift-session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gift: pick(), fromName: $('gFrom').value, email: buyerEmail, toName: $('gTo').value, message: $('gNote').value,
        campaign: window.CALSource ? window.CALSource.get() : '' }),
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return [r, d]; }); })
      .then(function (x) {
        if (!x[0].ok || !x[1].clientSecret) throw new Error(x[1].error || 'Payment could not start. Call or text (203) 560-3572.');
        sessionId = x[1].sessionId;
        // Black Friday: the server says whether this purchase comes with a bonus card (api/_promo.js)
        $('gBonusRow').hidden = !x[1].bonus; if (x[1].bonus) $('gBonusAmt').textContent = '+$' + x[1].bonus;
        try { sessionStorage.setItem('cal_gift_email', buyerEmail); } catch (e) { /* private mode */ }
        payUI = window.CALDeposit.mount({
          clientSecret: x[1].clientSecret, express: '#gExpress', payment: '#gPayment', theme: 'dark', buttonType: 'buy',
          onAmount: function (t) { $('gAmt').textContent = t; },
          onCanPay: function (ok) { $('gPayBtn').disabled = !ok; },
          onWallets: function (any) { $('gSep').hidden = !any; },
          onPaid: function () { showCard(sessionId); },
          onError: function (m) { err('gPayErr', m || 'The payment did not go through, so nothing was charged. Try again.'); },
        });
        return payUI.ready;
      })
      .then(function () { $('gWait').style.display = 'none'; })
      .catch(function (e) { $('gWait').style.display = 'none'; err('gPayErr', e && e.message); });
  }

  $('gPayBtn').addEventListener('click', function () {
    if (paying || !payUI) return;
    var btn = this; paying = true; btn.textContent = 'Processing…'; err('gPayErr', '');
    payUI.pay().then(function () { paying = false; btn.textContent = 'Pay and get the code'; });
  });

  // the paid card, from the server (so the code shown is the one that works)
  function showCard(id, tries) {
    tries = tries || 0;
    fetch('/api/checkout-status?session_id=' + encodeURIComponent(id))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.gift) {
          if (tries < 5) { setTimeout(function () { showCard(id, tries + 1); }, 1200); return; }
          throw new Error('no gift');
        }
        var g = d.gift;
        $('cAmt').textContent = g.kind === 'full' ? 'Full Detail' : '$' + g.amount;
        $('cTo').textContent = g.to; $('cFrom').textContent = g.from;
        $('cMsg').hidden = !g.message; $('cMsg').textContent = g.message ? '“' + g.message + '”' : '';
        $('cCode').textContent = g.code;
        if (g.bonus) {
          var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          var day = function (ymd) { var p = String(ymd).split('-'); return M[+p[1] - 1] + ' ' + (+p[2]); };
          $('bAmt').textContent = '$' + g.bonus.amount; $('bCode').textContent = g.bonus.code;
          $('bRange').textContent = day(g.bonus.from) + ' to ' + day(g.bonus.until) + ', ' + String(g.bonus.until).slice(0, 4);
          $('gBonus').hidden = false;
        }
        var email = buyerEmail; try { email = email || sessionStorage.getItem('cal_gift_email') || ''; } catch (e) { /* private mode */ }
        $('gDoneTxt').textContent = 'Print it, save it as a PDF, or forward the code. ' + (email ? 'It is also in the receipt we emailed to ' + email + '.' : 'It is also in your receipt email.');
        document.querySelector('.g-hero').hidden = true; $('buy').hidden = true; $('done').hidden = false;
        $('done').scrollIntoView({ block: 'start' });
      })
      .catch(function () {
        err('gPayErr', 'Your payment went through. The gift code is in your receipt email; if it has not arrived in a few minutes, call or text (203) 560-3572.');
      });
  }

  $('gPrint').addEventListener('click', function () { window.print(); });
  $('gCopy').addEventListener('click', function () {
    var code = $('cCode').textContent, done = function () { $('gCopied').hidden = false; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, function () { select(); });
    else select();
    function select() { var r = document.createRange(); r.selectNodeContents($('cCode')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  });

  // back from a payment app
  (function returning() {
    var q = new URLSearchParams(location.search), id = q.get('session_id');
    if (q.get('paid') !== '1' || !id) return;
    history.replaceState(null, '', location.pathname);
    showCard(id);
  })();
})();
