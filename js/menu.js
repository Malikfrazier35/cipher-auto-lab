/* /menu: live total for the chosen size, package and add-ons, and a ready-to-send text.
   Nothing is sent anywhere by this page: "Text it" just opens the phone's messages app
   with the order typed out. Without JavaScript the page is a plain price menu. */
(function () {
  var root = document.documentElement;
  root.classList.add('js');

  var NUMBER = '+12035603572';
  // [word on the price, label in the bar, words in the text message]
  var SIZE = { sedan: ['sedan', 'Sedan', 'sedan'], suv: ['SUV', 'SUV (5 seats)', 'SUV (5 seats)'],
               suv3: ['3-row', '3-row SUV / minivan', '3-row SUV / minivan'], truck: ['truck/van', 'Truck or van', 'truck or van'] };
  var BUNDLE = { keys: ['iron', 'clay'], price: 119 };        // iron decon + clay bar together
  // inside jobs need the interior in the package, outside jobs the exterior (same rule as the booking)
  var INSIDE = ['shampoo', 'leather', 'stain', 'pethair'];
  var COVERS = { full: { int: true, ext: true }, exterior: { int: false, ext: true }, interior: { int: true, ext: false } };

  var bar = document.querySelector('.m-bar');
  var what = document.querySelector('[data-sum-what]');
  var total = document.querySelector('[data-sum-total]');
  var time = document.querySelector('[data-sum-time]');

  function checked(name) { return document.querySelector('input[name="' + name + '"]:checked'); }
  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function hrs(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    return 'about ' + h + ' hr' + (h === 1 ? '' : 's') + (m ? ' ' + m + ' min' : '');
  }

  function smsHref(body) {
    // "?&body=" is read by both iPhone and Android messages apps
    return 'sms:' + NUMBER + '?&body=' + encodeURIComponent(body);
  }

  function update() {
    var size = (checked('size') || {}).value || 'sedan';
    var pkg = checked('pkg');

    // package prices follow the chosen size
    all('input[name="pkg"]').forEach(function (p) {
      var card = p.parentNode;
      var price = card.querySelector('[data-pkg-price]');
      var word = card.querySelector('[data-size-word]');
      if (price && p.dataset[size]) price.firstChild.nodeValue = '$' + p.dataset[size];
      if (word) word.textContent = SIZE[size][0];
    });

    // grey out add-ons the chosen package can't take, so the total always matches the booking
    var cover = COVERS[pkg ? pkg.value : 'full'] || COVERS.full;
    all('input[name="add"]').forEach(function (a) {
      var inside = INSIDE.indexOf(a.value) > -1, ok = inside ? cover.int : cover.ext;
      var row = a.closest('.m-add');
      a.disabled = !ok;
      if (!ok) a.checked = false;
      if (row) {
        row.classList.toggle('off', !ok);
        var t = row.querySelector('.m-add-t'), note = row.querySelector('.m-only');
        if (t && !note) { note = document.createElement('span'); note.className = 'm-only'; t.appendChild(note); }
        if (note) note.textContent = inside ? 'With Interior or Full Detail' : 'With Exterior or Full Detail';
      }
    });

    var adds = all('input[name="add"]:checked');
    var sum = pkg ? +pkg.dataset[size] : 0;
    var mins = pkg ? +pkg.dataset.mins : 0;
    var plus = false, names = [];
    var keys = adds.map(function (a) { return a.value; });
    var bundled = BUNDLE.keys.every(function (k) { return keys.indexOf(k) > -1; });

    adds.forEach(function (a) {
      if (!(bundled && BUNDLE.keys.indexOf(a.value) > -1)) sum += +a.dataset.price;
      mins += +a.dataset.mins;
      if (a.dataset.plus) plus = true;
      names.push(a.dataset.name);
    });
    if (bundled) sum += BUNDLE.price;

    var label = (pkg ? pkg.dataset.name : 'No package') + ' · ' + SIZE[size][1] +
                (adds.length ? ' + ' + adds.length + ' add-on' + (adds.length > 1 ? 's' : '') : '');
    var money = '$' + sum.toLocaleString('en-US') + (plus ? '+' : '');
    what.textContent = label;
    total.textContent = money;
    time.textContent = hrs(mins);

    var item = pkg ? pkg.dataset.name : 'detail';
    var body = 'Hi Cipher Auto Lab, I’d like to book ' + (/^[AEIOU]/i.test(item) ? 'an ' : 'a ') + item +
               ' for my ' + SIZE[size][2] +
               (names.length ? ', plus ' + names.join(', ') : '') +
               '. Menu total ' + money + ' before any travel fee, ' + hrs(mins) + '. My town: ';
    all('[data-sms]').forEach(function (a) { a.href = smsHref(body); });
    // the booking form picks these up (js/preselect.js) and opens at the vehicle step
    var q = pkg ? '?svc=' + encodeURIComponent(pkg.value) + '&size=' + encodeURIComponent(size) +
            (keys.length ? '&adds=' + keys.map(encodeURIComponent).join(',') : '') + '&from=menu' : '';
    all('[data-book]').forEach(function (a) { a.href = '/quote' + q + '#quote'; });
  }

  document.addEventListener('change', function (e) {
    if (e.target.matches('input[name="size"], input[name="pkg"], input[name="add"]')) update();
  });
  if (bar) bar.hidden = false;
  update();
})();
