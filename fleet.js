/* /fleet: the published price table, a rough figure while the form is filled in, and the
   enquiry sent as a ready-typed text message. Nothing is sent anywhere by this page itself:
   "Send it over" opens the phone's messages app with the enquiry written out.
   The rates mirror the fleet price grid; change them here and in the page copy together. */
(function () {
  var NUMBER = '+12035603572';
  var GRID = {
    full: { '2-4': { weekly: 52, biweekly: 62, monthly: 76 },
            '5-9': { weekly: 48, biweekly: 57, monthly: 70 },
            '10+': { weekly: 44, biweekly: 53, monthly: 65 } },
    ext:  { '2-4': { weekly: 34, biweekly: 39, monthly: 46 },
            '5-9': { weekly: 31, biweekly: 36, monthly: 42 },
            '10+': { weekly: 30, biweekly: 33, monthly: 38 } }
  };
  var MID = { '2-4': 3, '5-9': 7, '10+': 12 };
  var VISITS = { weekly: 4.33, biweekly: 2.17, monthly: 1 };
  var BAND = { '2-4': '2 to 4', '5-9': '5 to 9', '10+': '10 or more' };
  var FREQ = { weekly: 'weekly', biweekly: 'every 2 weeks', monthly: 'monthly', unsure: 'not sure yet' };
  var BIG_UPLIFT = 10, MIN_VISIT = 180;

  function $(id) { return document.getElementById(id); }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

  /* price table with the Full / Exterior tabs */
  function table(key) {
    var body = $('priceBody');
    if (!body) return;
    body.textContent = '';
    Object.keys(GRID[key]).forEach(function (band) {
      var tr = document.createElement('tr');
      var first = document.createElement('td');
      first.textContent = BAND[band];
      tr.appendChild(first);
      ['weekly', 'biweekly', 'monthly'].forEach(function (f) {
        var td = document.createElement('td');
        td.textContent = '$' + GRID[key][band][f];
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }
  function tab(on, off, key) {
    on.classList.add('on'); on.setAttribute('aria-selected', 'true');
    off.classList.remove('on'); off.setAttribute('aria-selected', 'false');
    table(key);
  }
  var tFull = $('tabFull'), tExt = $('tabExt');
  if (tFull && tExt) {
    tFull.addEventListener('click', function () { tab(tFull, tExt, 'full'); });
    tExt.addEventListener('click', function () { tab(tExt, tFull, 'ext'); });
  }
  table('full');

  /* towns */
  var town = $('flTown');
  if (town && window.TOWNS) {
    Object.keys(window.TOWNS).forEach(function (region) {
      var g = document.createElement('optgroup');
      g.label = region;
      window.TOWNS[region].forEach(function (t) {
        var o = document.createElement('option');
        o.value = t; o.textContent = t; g.appendChild(o);
      });
      town.appendChild(g);
    });
  }

  /* rough figure */
  function quote() {
    var svc = $('flSvc').value, count = $('flCount').value, freq = $('flFreq').value, type = $('flType').value;
    if (svc === 'unsure' || freq === 'unsure' || count === '1') return null;
    var key = svc === 'ext' ? 'ext' : 'full';
    var per = GRID[key][count][freq];
    var big = /van|pickup/i.test(type) && !/company|sedan|suv/i.test(type);
    if (big) per += BIG_UPLIFT;
    var visit = Math.max(MIN_VISIT, per * MID[count]);
    return { per: per, visit: visit, month: visit * VISITS[freq], min: per * MID[count] < MIN_VISIT, n: MID[count] };
  }
  function estimate() {
    var q = quote(), val = $('estVal'), note = $('estNote');
    if (!val || !note) return q;
    if (!q) {
      val.textContent = '—';
      note.textContent = 'We will work out the right size and frequency with you and quote it properly.';
      return q;
    }
    val.textContent = money(q.per) + ' per vehicle';
    note.textContent = 'About ' + money(q.visit) + ' a visit for ' + q.n + ' vehicles, roughly ' +
      money(q.month) + ' a month.' + (q.min ? ' That includes the $180 visit minimum.' : '');
    return q;
  }
  ['flSvc', 'flCount', 'flFreq', 'flType'].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener('change', estimate);
  });
  if ($('flSvc')) estimate();

  /* enquiry, sent as a text */
  var form = $('flForm');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('flErr');
    var co = $('flCo').value.trim(), name = $('flName').value.trim(), phone = $('flPhone').value.trim(),
        email = $('flEmail').value.trim(), where = town ? town.value : '';
    var ok = co.length > 1 && name.length > 1 && where && phone.replace(/\D/g, '').length === 10 &&
             /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    if (!ok) {
      err.textContent = 'Company, name, a 10-digit phone number, an email and a town are all we need to quote.';
      err.hidden = false;
      return;
    }
    err.hidden = true;
    var q = quote();
    var ref = 'CAL-F' + Date.now().toString(36).toUpperCase().slice(-5);
    var svc = $('flSvc').value;
    var lines = [
      'Fleet enquiry ' + ref,
      co + ' · ' + name + ' · ' + phone + ' · ' + email,
      'Kept in ' + where + ', CT',
      'Vehicles: ' + ($('flCount').value === '1' ? 'one, but often' : BAND[$('flCount').value]) + ', mostly ' + $('flType').value.toLowerCase(),
      'How often: ' + FREQ[$('flFreq').value],
      'Service: ' + (svc === 'ext' ? 'Fleet Exterior' : svc === 'full' ? 'Fleet Full' : 'not sure yet'),
      q ? 'Published rate: ' + money(q.per) + ' per vehicle, about ' + money(q.visit) + ' a visit' : null,
      $('flNote').value.trim() ? 'Note: ' + $('flNote').value.trim() : null
    ].filter(Boolean);
    $('flRef').textContent = ref;
    form.hidden = true;
    $('flDone').hidden = false;
    window.location.href = 'sms:' + NUMBER + '?&body=' + encodeURIComponent(lines.join('\n'));
  });
})();
