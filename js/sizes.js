/* Home page: switch the package prices between vehicle sizes.
   Without JavaScript the page simply shows sedan prices and points to the menu. */
(function () {
  var group = document.querySelector('.c-sizes');
  if (!group) return;
  var LABEL = { sedan: 'sedan', suv: 'SUV', suv3: '3-row SUV', truck: 'truck or van' };
  var buttons = group.querySelectorAll('button[data-size]');
  var prices = document.querySelectorAll('[data-price]');
  var labels = document.querySelectorAll('[data-size-label]');
  var note = document.querySelector('[data-size-note]');

  function pick(size) {
    if (!LABEL[size]) return;
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.size === size)); });
    prices.forEach(function (p) { var v = p.dataset[size]; if (v) p.textContent = '$' + v; });
    labels.forEach(function (l) { l.textContent = LABEL[size]; });
  }

  buttons.forEach(function (b) { b.addEventListener('click', function () { pick(b.dataset.size); }); });
  group.hidden = false;
  if (note) note.textContent = 'Priced by vehicle size. The price, not a starting point.';
})();
