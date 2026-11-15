/* Seasonal blocks: data-season="winter" (road salt, the salt neutralizer) shows November to March,
   data-season="holiday" (gift cards) November and December. Without JavaScript a winter block stays
   visible; a holiday block starts hidden, so it never shows out of season.                       */
(function () {
  var m = new Date().getMonth() + 1, on = { winter: m >= 11 || m <= 3, holiday: m >= 11 };
  Array.prototype.forEach.call(document.querySelectorAll('[data-season]'), function (el) {
    var s = el.getAttribute('data-season');
    if (s in on) el.hidden = !on[s];
  });
})();
