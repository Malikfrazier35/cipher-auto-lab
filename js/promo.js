/* Black Friday 2026 on the pages: Thanksgiving through Cyber Monday, Connecticut time.
   The same dates as api/_promo.js, which is what actually gives the bonus and the lock-in
   (tools/test_stripe_api.mjs checks the two copies agree).
   - [data-promo="bf"] is shown in the window and hidden outside it; [data-promo-off="bf"] the reverse.
   - ?preview=bf shows it early in this tab, with a "Preview" tag, so the owner can check the pages.
     The server still only gives bonus cards and the ceramic lock-in in the real window.
   CALPromo.on(), .live, .preview, .bonusFor(dollars), .bonusRange, .ceramic, .ceramicOn(paintKey),
   .inCeramic(ymd), .inBonus(ymd)                                                                  */
(function () {
  var BF = {
    start: '2026-11-26T00:00:00-05:00', end: '2026-12-01T00:00:00-05:00',
    bonusPct: 20, bonusFrom: '2027-01-01', bonusUntil: '2027-03-31',
    ceramicOff: 100, ceramicFrom: '2027-03-01', ceramicUntil: '2027-05-31', ceramicKeys: ['ceramic', 'corrceramic'],
  };
  var asked = /(^|[?&])preview=bf(&|$)/.test(location.search), preview = asked;
  try {
    if (asked) sessionStorage.setItem('cal_preview_bf', '1');
    preview = sessionStorage.getItem('cal_preview_bf') === '1';
  } catch (e) { /* private mode: only the page that asked */ }
  var now = Date.now(), live = now >= Date.parse(BF.start) && now < Date.parse(BF.end), on = live || preview;
  function within(ymd, a, b) { return !!ymd && ymd >= a && ymd <= b; }

  window.CALPromo = {
    on: function () { return on; },
    live: live,
    preview: on && !live,
    bonusFor: function (dollars) { return Math.round((dollars * BF.bonusPct) / 100 / 5) * 5; },
    bonusRange: 'Jan 1 to Mar 31, 2027',
    ceramic: { off: BF.ceramicOff, from: BF.ceramicFrom, until: BF.ceramicUntil, keys: BF.ceramicKeys, range: 'Mar 1 to May 31, 2027' },
    ceramicOn: function (paintKey) { return on && BF.ceramicKeys.indexOf(paintKey) > -1; },
    inCeramic: function (ymd) { return within(ymd, BF.ceramicFrom, BF.ceramicUntil); },
    inBonus: function (ymd) { return within(ymd, BF.bonusFrom, BF.bonusUntil); },
  };

  function apply() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-promo="bf"]'), function (el) { el.hidden = !on; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-promo-off="bf"]'), function (el) { el.hidden = on; });
    if (on) document.documentElement.setAttribute('data-promo', 'bf');
    if (on && !live) document.documentElement.setAttribute('data-promo-preview', 'bf');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
})();
