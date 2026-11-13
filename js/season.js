/* Seasonal blocks: anything marked data-season="winter" (road salt, the salt neutralizer) shows
   November to March and hides the rest of the year. Without JavaScript it simply stays visible. */
(function () {
  var m = new Date().getMonth() + 1, winter = m >= 11 || m <= 3;
  Array.prototype.forEach.call(document.querySelectorAll('[data-season="winter"]'), function (el) { el.hidden = !winter; });
})();
