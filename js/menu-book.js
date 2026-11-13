/* Detail Menu booking: the screens behind "Book" on /menu, the page every QR code opens.
   0 the pass (what you built, at menu price) · 1 day · 2 where · 3 you · 4 terms · 5 deposit · 6 booked.
   Prices come from the menu's own inputs; the server re-prices everything before Stripe charges
   (api/_booking.js), so nothing typed here can change the amount. Phone Back steps back one
   screen. Without JavaScript the Book buttons keep their link to the regular booking page.   */
(function () {
  var qb = document.getElementById('qb');
  if (!qb || !window.history || !window.fetch) return;

  function $(id) { return document.getElementById(id); }
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function checked(name) { return document.querySelector('input[name="' + name + '"]:checked'); }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

  var NUMBER = '+12035603572', AGREEMENT_VERSION = '1.0';
  var SIZES = { sedan: ['Sedan or coupe', 'sedan'], suv: ['SUV, 5 seats', 'suv5'], suv3: ['3-row SUV or minivan', 'suv7'], truck: ['Truck or van', 'truck'] };
  var DEPOSIT = { exterior: 25, interior: 30, full: 40 };            // same as api/_booking.js
  var SERVER_ADD = { shampoo: 'extract', spray: 'cspray', headlights: 'headlight' };
  var STEP_CTA = ['Pick a day', 'Next: where', 'Next: you', 'Next: terms', 'Agree & continue', '', ''];

  var B = { step: 0, date: '', win: 'Morning · 8–11am', ref: '', paid: false, depth: 0 };
  var payUI = null, paying = false, assets = null;

  /* ------------------------------------------------------------ the build */
  function build() {
    var sizeKey = (checked('size') || {}).value || 'sedan';
    var pkg = checked('pkg');
    var size = SIZES[sizeKey] || SIZES.sedan;
    var adds = all('input[name="add"]:checked').filter(function (a) { return !a.disabled; });
    var keys = adds.map(function (a) { return a.value; });
    var bundle = keys.indexOf('iron') > -1 && keys.indexOf('clay') > -1;
    var base = pkg ? +pkg.dataset[sizeKey] : 0, total = base, mins = pkg ? +pkg.dataset.mins : 0, plus = false;
    var lines = [];
    adds.forEach(function (a) {
      mins += +a.dataset.mins;
      if (a.dataset.plus) plus = true;
      if (bundle && (a.value === 'iron' || a.value === 'clay')) return;
      total += +a.dataset.price;
      lines.push({ name: a.dataset.name, price: +a.dataset.price, plus: !!a.dataset.plus });
    });
    if (bundle) { total += 119; lines.push({ name: 'Iron decon + clay bar', price: 119, note: 'Together for $119' }); }
    var pkgKey = pkg ? pkg.value : 'full';
    var dep = DEPOSIT[pkgKey] || 40;
    var h = Math.floor(mins / 60), m = mins % 60;
    return {
      pkgKey: pkgKey, pkgName: pkg ? pkg.dataset.name : 'Full Detail', base: base, sizeKey: sizeKey,
      sizeLabel: size[0], tier: size[1], lines: lines, total: total, plus: plus, dep: dep,
      time: 'about ' + h + ' hr' + (h === 1 ? '' : 's') + (m ? ' ' + m + ' min' : ''),
      serverAdds: keys.map(function (k) { return SERVER_ADD[k] || k; }),
      job: window.CALSchedule ? window.CALSchedule.job(pkgKey, keys, '') : null,
      salt: !!(window.CALSchedule && pkgKey !== 'interior' && window.CALSchedule.salty(todayYmd())),
      names: adds.map(function (a) { return a.dataset.name; }),
    };
  }

  function todayYmd() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function paintPass(b) {
    $('qbPkg').textContent = b.pkgName;
    $('qbPkgP').textContent = money(b.base);
    $('qbSize').textContent = b.sizeLabel + ' · ' + b.time;
    var ul = $('qbAdds'); ul.innerHTML = '';
    b.lines.forEach(function (l) {
      var li = document.createElement('li'), t = document.createElement('div'), p = document.createElement('span');
      t.textContent = l.name;
      if (l.note || l.plus) { var sm = document.createElement('small'); sm.textContent = l.note || 'Heavy cases quoted on sight'; t.appendChild(sm); }
      p.textContent = '+' + money(l.price) + (l.plus ? '+' : '');
      li.appendChild(t); li.appendChild(p); ul.appendChild(li);
    });
    if (b.salt) {          // November to March, every exterior: shown on the pass, at no charge
      var li = document.createElement('li'), t = document.createElement('div'), p = document.createElement('span'), sm = document.createElement('small');
      li.className = 'qb-salt'; t.textContent = 'Winter salt neutralizer';
      sm.textContent = 'Wheels, wells, rockers, lower doors, jambs'; t.appendChild(sm);
      p.textContent = 'Included'; li.appendChild(t); li.appendChild(p); ul.appendChild(li);
    }
    $('qbTotal').textContent = money(b.total) + (b.plus ? '+' : '');
    $('qbDep').textContent = money(b.dep);
    $('qbBarWhat').textContent = b.pkgName + ' · ' + b.sizeLabel + (b.names.length ? ' + ' + b.names.length + ' add-on' + (b.names.length > 1 ? 's' : '') : '');
    $('qbBarTotal').textContent = money(b.total) + (b.plus ? '+' : '');
    $('qbBarDep').textContent = money(b.dep) + ' deposit';
    $('qbPayAmt').textContent = money(b.dep);
    $('qbPayBal').textContent = money(Math.max(0, b.total - b.dep));
  }

  /* --------------------------------------------- scripts only this flow needs */
  function load(src) {
    return new Promise(function (ok, fail) {
      var s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = ok; s.onerror = function () { fail(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadAssets() {
    if (!assets) {
      assets = Promise.all([
        window.TOWNS ? null : load('vehicles.js').then(fillTowns),
        window.STRIPE_PK !== undefined ? null : load('config.js'),
        window.Stripe ? null : load('https://js.stripe.com/endive/stripe.js'),
      ]).then(function () {
        return Promise.all([window.CALDeposit ? null : load('js/deposit.js'), window.CALAddress ? null : load('js/address.js')]);
      }).then(wirePickers);
      assets.catch(function () { assets = null; });
    }
    return assets;
  }
  function fillTowns() {
    var sel = $('qbTown'), T = window.TOWNS || {};
    if (!sel || sel.options.length > 2) return;
    Object.keys(T).forEach(function (region) {
      var g = document.createElement('optgroup'); g.label = region;
      T[region].forEach(function (t) { var o = document.createElement('option'); o.value = t; o.textContent = t; g.appendChild(o); });
      sel.appendChild(g);
    });
    var g2 = document.createElement('optgroup'); g2.label = 'Not on the list';
    var o2 = document.createElement('option'); o2.value = '__ask'; o2.textContent = 'My town is not listed'; g2.appendChild(o2); sel.appendChild(g2);
  }

  /* ------------------------------------------------------------- screens */
  function show(n, focus) {
    B.step = n;
    all('.qb-s', qb).forEach(function (s) { s.classList.toggle('on', +s.dataset.s === n); });
    var prog = qb.querySelector('.qb-prog');
    prog.classList.toggle('pass', n === 0 || n === 6);
    all('i', prog).forEach(function (i, k) { i.classList.toggle('on', n === 6 || k < n); });
    var next = $('qbNext');
    next.hidden = !STEP_CTA[n];
    next.textContent = STEP_CTA[n] || '';
    $('qbBar').hidden = n === 6;
    $('qbRef').hidden = !B.ref || n < 5;
    $('qbRef').textContent = B.ref;
    qb.querySelector('.qb-body').scrollTop = 0;
    if (focus !== false) { var h = qb.querySelector('.qb-s.on .qb-h'); if (h) h.focus({ preventScroll: true }); }
    if (n < 5 && !B.paid && payUI) {     // stepping back from the deposit: start a fresh payment next time
      payUI = null; $('qbExpress').innerHTML = ''; $('qbPayment').innerHTML = ''; $('qbSep').hidden = true;
    }
    if (n === 1 || n === 2) paintDay();
    if (n === 4) offerSign();
    if (n === 2 && !wired) {             // car list didn't load (offline?): let them type it
      Promise.resolve(loadAssets()).catch(function () {}).then(function () { if (!wired) typeCar(''); });
    }
    if (n === 5) startDeposit();
  }
  function offerSign() {
    var nm = $('qbName').value.trim().replace(/\s+/g, ' ');
    var ok = nm.length >= 3 && /\s/.test(nm) && /^[A-Za-z][A-Za-z .'’-]*[A-Za-z.]$/.test(nm);
    $('qbSignAs').hidden = !ok;
    if (ok) {
      $('qbSignName').textContent = nm;
      $('qbSignAs').classList.toggle('done', $('qbSig').value.trim() === nm);
      $('qbSigLbl').textContent = 'Or type your full name to sign';
    }
  }
  $('qbSignAs').addEventListener('click', function () {
    $('qbSig').value = $('qbSignName').textContent; this.classList.add('done');
    $('qbSig').classList.remove('bad'); recheck();
  });

  function go(n) {                     // forward: a history entry per screen, so Back steps back
    history.pushState({ qb: n }, '', '#book');
    B.depth++;
    show(n);
  }

  function open() {
    if (!checked('pkg')) return false;
    var b = build();
    paintPass(b);
    B.job = b.job;
    B.paid = false; B.ref = ''; payUI = null;
    qb.hidden = false;
    document.documentElement.classList.add('qb-open');
    history.pushState({ qb: 0 }, '', '#book');
    B.depth = 1;
    show(0);
    loadAssets();
    return true;
  }

  function close() {
    qb.hidden = true;
    document.documentElement.classList.remove('qb-open');
    B.depth = 0;
    if (location.hash === '#book') history.replaceState(null, '', location.pathname);
    var book = document.querySelector('.m-bar [data-book]'); if (book) book.focus({ preventScroll: true });
  }

  function closeViaHistory() {
    if (B.depth > 0) history.go(-B.depth); else close();
  }

  window.addEventListener('popstate', function (e) {
    var st = e.state && typeof e.state.qb === 'number' ? e.state.qb : null;
    if (st === null || B.paid) { if (!qb.hidden) close(); return; }
    if (qb.hidden) return;
    B.depth = Math.max(1, B.depth - 1);
    show(Math.min(st, B.step));
  });

  if (location.hash === '#book' && !/[?&]paid=1/.test(location.search)) history.replaceState(null, '', location.pathname + location.search);

  /* "Book" on the menu opens the screens instead of leaving the page */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-book]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (open()) e.preventDefault();
  });
  qb.addEventListener('click', function (e) {
    if (e.target.closest('[data-qb-close]')) closeViaHistory();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !qb.hidden && B.step < 5) closeViaHistory();
  });

  /* ------------------------------------------------------------ 1 · when */
  (function dates() {
    var box = $('qbDates'), d = new Date(), made = 0;
    var DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 2);
    while (made < 24) {
      if (d.getDay() !== 0) {
        var b = document.createElement('button');
        b.type = 'button'; b.dataset.iso = d.toDateString(); b.dataset.label = DAY[d.getDay()] + ' ' + MON[d.getMonth()] + ' ' + d.getDate();
        b.dataset.ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        b.innerHTML = '<em>' + DAY[d.getDay()] + '</em><b>' + d.getDate() + '</b><i>' + MON[d.getMonth()] + '</i>';
        if (made >= 12) b.hidden = true;
        box.appendChild(b); made++;
      }
      d.setDate(d.getDate() + 1);
    }
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      all('button', box).forEach(function (x) { x.classList.remove('sel'); });
      b.classList.add('sel'); B.date = b.dataset.iso; B.dateLabel = b.dataset.label; B.ymd = b.dataset.ymd;
      box.classList.remove('bad'); $('qbE1').hidden = true; paintDay();
    });
    $('qbMore').addEventListener('click', function () {
      all('button[hidden]', box).forEach(function (x) { x.hidden = false; }); this.hidden = true;
    });
    $('qbWins').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return;
      B.wk = b.dataset.wk; paintDay();
    });
    $('qbGarage').addEventListener('click', function () {
      B.garage = !B.garage;
      this.setAttribute('aria-pressed', String(B.garage));
      var spot = document.querySelector('#qbSpots [data-note="Garage"]');   // and on the "where" screen
      if (spot) spot.classList.toggle('sel', B.garage);
      paintDay();
    });
  })();

  /* ------------------------- the day, engineered around the job (js/schedule.js) and its forecast
     Windows are cut so the detail finishes before sunset (6pm with a garage), the weather is read for
     the hours we'd be working outside, and a cold day says rinseless before anyone has to ask.     */
  B.wk = 'morning'; B.garage = false;
  function wxArea() { var t = $('qbTown').value; return t && t !== '__ask' && window.CALWeather ? window.CALWeather.areaFor(t) : 'hartford'; }
  function firstYmd() { var b = $('qbDates').querySelector('button'); return b ? b.dataset.ymd : todayYmd(); }
  var lastData = {};
  function paintDay() {
    var W = window.CALWeather;
    if (!window.CALSchedule || !B.job) return;
    var area = wxArea();
    draw(lastData[area] || null, area);
    if (W) W.get(area).then(function (data) { if (data) { lastData[area] = data; draw(data, area); } });
  }
  function draw(data, area) {
    var W = window.CALWeather, S = window.CALSchedule, town = $('qbTown').value;
    if (wxArea() !== area) return;
    if (data && W) all('#qbDates button').forEach(function (b) {
      var d = data.days[b.dataset.ymd], t = data.typical && data.typical.days[b.dataset.ymd], el = b.querySelector('.qb-dwx');
      if (!d && !t) { if (el) el.remove(); b.classList.remove('wet', 'typ'); return; }
      if (!el) { el = document.createElement('span'); el.className = 'qb-dwx'; b.appendChild(el); }
      el.innerHTML = d ? W.dayHTML(d) : W.typHTML(t);
      b.classList.toggle('wet', !!d && W.wet(d) && B.job.outside && !B.garage);
      b.classList.toggle('typ', !d);
      b.setAttribute('aria-label', b.dataset.label + (d ? ', ' + d.label.toLowerCase() + ', high ' + d.hi + ' degrees' + (d.pop ? ', ' + d.pop + '% chance of rain' : '')
        : ', typically a high of ' + t.hi + ' degrees'));
    });
    var p = S.plan({ job: B.job, ymd: B.ymd || firstYmd(), area: area, garage: B.garage, data: data });
    B.wk = S.best(p, B.wk);
    B.plan = p;
    all('#qbWins button').forEach(function (b) {
      var w = p.wins[b.dataset.wk], el = b.querySelector('.qb-wx'), time = b.querySelector('span');
      b.disabled = !w.ok; b.classList.toggle('off', !w.ok); b.classList.toggle('sel', w.ok && b.dataset.wk === B.wk);
      b.classList.toggle('wet', !!w.wet); b.classList.toggle('cold', !!w.cold);
      time.textContent = w.ok ? w.time : 'Not this day';
      if (!w.ok) { el.hidden = false; el.innerHTML = '<em>' + w.why + '</em>'; return; }
      var bits = (w.wx && W ? W.winHTML(w.wx) : '') + (w.cold ? '<small class="qb-rl">Rinseless</small>' : '') +
        (w.doneB ? '<small class="qb-done">Done by ' + S.clock(w.doneB) + '</small>' : w.two ? '<small class="qb-done">2 visits</small>' : '');
      el.hidden = !bits; el.innerHTML = bits;
    });
    var w = p.wins[B.wk];
    B.win = w.label;
    var tl = $('qbTl');
    tl.hidden = !B.ymd;
    if (B.ymd) {
      tl.innerHTML = '<p class="tl-head"><b>' + (B.dateLabel || '') + '</b><span>' + w.name + ' arrival</span></p>' + S.timeline(p, B.wk);
      S.place(tl);
    }
    var box = $('qbPlan'); box.innerHTML = '';
    if (B.ymd) S.notes(p, B.wk).forEach(function (n) {
      var el = document.createElement('p'); el.className = 'qb-pn n-' + n.kind; el.textContent = n.text; box.appendChild(el);
    });
    var src = $('qbWxSrc');
    src.hidden = !data;
    if (data) src.textContent = (town && town !== '__ask' ? 'Forecast for ' + data.label : 'Forecast for central Connecticut until you choose your town') +
      ' · National Weather Service' + (p.level === 'typical' ? ' · typical weather: NOAA 1991–2020 normals' : '');
    var where = $('qbWxWhere');
    if (where) {
      var sel = w.ok && w.wx;
      where.hidden = !(sel && town && town !== '__ask');
      if (!where.hidden) where.textContent = 'Forecast for ' + (B.dateLabel || '') + ' while we work outside, ' + data.label + ': ' + W.label(sel) + '.';
    }
  }

  /* ------------------------------------------- 2 · the car, picked with taps */
  var POPULAR = [['Toyota'], ['Honda'], ['Ford'], ['Chevrolet', 'Chevy'], ['Nissan'], ['Hyundai'], ['Jeep'], ['Subaru'],
                 ['Kia'], ['Tesla'], ['BMW'], ['Mercedes-Benz', 'Mercedes']];
  var CAR = { make: '', model: '', year: '' };
  var wired = false;

  function chip(label, data) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    Object.keys(data || {}).forEach(function (k) { b.dataset[k] = data[k]; });
    return b;
  }
  function models(make) { return ((window.VEHICLES || {})[make]) || ((window.EXOTICS || {})[make]) || []; }
  function years(make, model) {
    var now = new Date().getFullYear() + 1, w = ((window.MODEL_YEARS || {})[make] || {})[model], out = [];
    for (var y = now; y >= 1990; y--) {
      if (!w || w.some(function (r) { return y >= r[0] && y <= (r[1] || now); })) out.push(y);
    }
    return out;
  }
  function carText() {
    if (!$('qbCarType').hidden) return $('qbCar').value.trim();
    return [CAR.year, CAR.make, CAR.model].filter(Boolean).join(' ');
  }
  function syncCar() { if ($('qbCarType').hidden) $('qbCar').value = carText(); }
  function typeCar(prefill) {
    $('qbCarPick').hidden = true; $('qbCarSel').hidden = true; $('qbCarType').hidden = false;
    $('qbCar').value = prefill || ''; $('qbCar').focus();
  }
  function pickMake(make) {
    CAR.make = make; CAR.model = ''; CAR.year = '';
    all('button', $('qbMakes')).forEach(function (b) { b.classList.toggle('sel', b.dataset.make === make); });
    var box = $('qbModels'); box.innerHTML = '';
    models(make).forEach(function (m) { box.appendChild(chip(m, { model: m })); });
    box.appendChild(chip('Not listed', { model: '__type' }));
    box.hidden = false; $('qbModelsLbl').hidden = false;
    $('qbModelsLbl').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function pickModel(model) {
    if (model === '__type') { typeCar(CAR.make === 'Other' ? '' : CAR.make + ' '); return; }
    CAR.model = model;
    $('qbCarName').textContent = CAR.make + ' ' + model;
    var ys = $('qbYear'); ys.innerHTML = '<option value="">Year</option>';
    years(CAR.make, model).forEach(function (y) { var o = document.createElement('option'); o.value = o.textContent = y; ys.appendChild(o); });
    $('qbCarPick').hidden = true; $('qbCarSel').hidden = false;
    syncCar(); recheck();
  }

  function wirePickers() {
    if (wired) return; wired = true;
    var mk = $('qbMakes');
    POPULAR.forEach(function (p) { if (models(p[0]).length) mk.appendChild(chip(p[1] || p[0], { make: p[0] })); });
    mk.appendChild(chip('Other make', { make: '__more' }));
    var allMakes = Object.keys(window.VEHICLES || {}).concat(Object.keys(window.EXOTICS || {}))
      .filter(function (m, i, a) { return m !== 'Other' && a.indexOf(m) === i; }).sort();
    allMakes.forEach(function (m) { var o = document.createElement('option'); o.value = o.textContent = m; $('qbMakeAll').appendChild(o); });
    var o2 = document.createElement('option'); o2.value = '__type'; o2.textContent = 'Not listed: type it'; $('qbMakeAll').appendChild(o2);

    if (window.CALAddress && window.CALAddress.enabled()) {
      $('qbStreet').placeholder = 'Start typing, then tap your address';
      window.CALAddress.attach({ input: $('qbStreet'), onPick: function (a) {
        $('qbStreet').value = a.street;
        if (a.town && $('qbTown').querySelector('option[value="' + a.town.replace(/"/g, '') + '"]')) {
          $('qbTown').value = a.town; $('qbTown').dispatchEvent(new Event('change'));
        }
        if (a.zip) $('qbZip').value = a.zip;
        recheck();
      } });
    }
  }
  $('qbMakes').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.make === '__more') {
      all('button', this).forEach(function (x) { x.classList.toggle('sel', x === b); });
      $('qbMakeAll').hidden = false; $('qbModels').hidden = true; $('qbModelsLbl').hidden = true;
      $('qbMakeAll').focus();
      return;
    }
    $('qbMakeAll').hidden = true;
    pickMake(b.dataset.make);
  });
  $('qbMakeAll').addEventListener('change', function () {
    if (this.value === '__type') { typeCar(''); return; }
    if (this.value) pickMake(this.value);
  });
  $('qbModels').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) pickModel(b.dataset.model); });
  $('qbYear').addEventListener('change', function () { CAR.year = this.value; syncCar(); });
  $('qbCarChange').addEventListener('click', function () {
    CAR.model = ''; CAR.year = ''; $('qbCar').value = '';
    $('qbCarSel').hidden = true; $('qbCarPick').hidden = false;
  });

  /* parking: taps, with an optional typed note */
  $('qbSpots').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) b.classList.toggle('sel'); });
  $('qbNoteAdd').addEventListener('click', function () { this.hidden = true; $('qbNoteWrap').hidden = false; $('qbNotes').focus(); });
  function notes() {
    return all('#qbSpots button.sel').map(function (b) { return b.dataset.note; })
      .concat($('qbNotes').value.trim() ? [$('qbNotes').value.trim()] : []).join('. ');
  }

  /* ------------------------------------------------------- 2 · where, 3 · you */
  $('qbTown').addEventListener('change', function () {
    paintDay();
    var n = $('qbTownNote'), v = this.value;
    n.hidden = !v; n.innerHTML = '';
    if (v === '__ask') { n.textContent = 'Call or text (203) 560-3572 and we will tell you straight away whether we can reach you.'; return; }
    if (!v) return;
    var b = document.createElement('b'); b.textContent = 'We come to ' + v + '. ';
    n.appendChild(b);
    n.appendChild(document.createTextNode('If a travel fee applies there, we text it to you before your slot is confirmed. It is never added afterwards.'));
  });
  $('qbZip').addEventListener('input', function () { var v = this.value.replace(/\D/g, '').slice(0, 5); if (v !== this.value) this.value = v; });

  function phone10(v) { var d = String(v || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d; }
  function mark(el, ok) { el.classList.toggle('bad', !ok); return ok; }
  function fail(errId, msg, el) {
    var e = $(errId); e.textContent = msg; e.hidden = false;
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (el.focus && el.tagName !== 'DIV') el.focus({ preventScroll: true }); }
    return false;
  }
  function list(parts) { return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0]; }

  var CHECKS = {
    1: function () {
      if (!B.date) { $('qbDates').classList.add('bad'); return fail('qbE1', 'Pick a day to continue.', $('qbDates')); }
      return true;
    },
    2: function () {
      var gaps = [], first = null;
      function need(el, ok, say) { mark(el, ok); if (!ok) { gaps.push(say); first = first || el; } }
      syncCar();
      var carOk = $('qbCar').value.trim().length > 2 && ($('qbCarType').hidden ? !!CAR.model : true);
      mark($('qbCarSel').hidden && $('qbCarType').hidden ? $('qbMakes') : $('qbCar'), carOk);
      if (!carOk) { gaps.push('pick your car'); first = first || ($('qbCarType').hidden ? $('qbMakes') : $('qbCar')); }
      need($('qbStreet'), $('qbStreet').value.trim().length > 3, 'add the street address');
      var t = $('qbTown').value;
      need($('qbTown'), t.length > 1 && t !== '__ask', t === '__ask' ? 'call us about your town' : 'choose your town');
      var z = $('qbZip').value.trim();
      need($('qbZip'), /^06\d{3}$/.test(z), z ? 'check the ZIP (Connecticut ZIPs start 06)' : 'add the ZIP');
      return gaps.length ? fail('qbE2', 'To continue, ' + list(gaps) + '.', first) : true;
    },
    3: function () {
      var gaps = [], first = null;
      function need(el, ok, say) { mark(el, ok); if (!ok) { gaps.push(say); first = first || el; } }
      need($('qbName'), $('qbName').value.trim().length > 1, 'add your name');
      need($('qbPhone'), phone10($('qbPhone').value).length === 10, 'add a 10-digit mobile number');
      need($('qbEmail'), /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test($('qbEmail').value.trim()), 'add an email for your receipt');
      return gaps.length ? fail('qbE3', 'To continue, ' + list(gaps) + '.', first) : true;
    },
    4: function () {
      var sig = $('qbSig').value.trim(), okSig = sig.length >= 3 && /\s/.test(sig) && /^[A-Za-z][A-Za-z .'’-]*[A-Za-z.]$/.test(sig);
      var okAgree = $('qbAgree').checked;
      $('qbAgreeBox').classList.toggle('bad', !okAgree); mark($('qbSig'), okSig);
      if (!okAgree || !okSig) {
        return fail('qbE4', !okAgree && !okSig ? 'Tick the box to agree, and type your full name to sign.'
          : !okAgree ? 'Tick the box to agree to the Service Agreement.' : 'Type your first and last name to sign.',
          okAgree ? $('qbSig') : $('qbAgreeBox'));
      }
      return true;
    },
  };
  function recheck() {
    var s = B.step; if (!CHECKS[s]) return;
    var e = $('qbE' + s); if (!e.hidden && CHECKS[s]()) e.hidden = true;
  }
  // errors clear as each field is fixed
  ['qbCar', 'qbStreet', 'qbTown', 'qbZip', 'qbName', 'qbPhone', 'qbEmail', 'qbSig'].forEach(function (id) {
    $(id).addEventListener(id === 'qbTown' ? 'change' : 'input', function () {
      var s = B.step; if (!CHECKS[s]) return;
      var e = $('qbE' + s); if (e.hidden) { this.classList.remove('bad'); return; }
      if (CHECKS[s]()) e.hidden = true;
    });
  });
  $('qbAgree').addEventListener('change', function () { if (this.checked) $('qbAgreeBox').classList.remove('bad'); recheck(); });
  $('qbSig').addEventListener('input', function () { $('qbSignAs').classList.toggle('done', this.value.trim() === $('qbSignName').textContent); });

  $('qbNext').addEventListener('click', function () {
    var n = B.step;
    if (CHECKS[n] && !CHECKS[n]()) return;
    var e = $('qbE' + n); if (e) e.hidden = true;
    // a new reference each time the terms are signed, so a changed booking is a new payment
    if (n === 4) { B.ref = makeRef(); B.signedAt = new Date().toISOString(); }
    if (n < 5) go(n + 1);
  });

  /* ---------------------------------------------------------- 5 · deposit */
  function makeRef() {
    var t = Date.now().toString(36).toUpperCase().slice(-5), r = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', x = '';
    for (var i = 0; i < 2; i++) x += r[Math.floor(Math.random() * r.length)];
    return 'CAL-' + t + x;
  }
  function where() { return $('qbStreet').value.trim() + ', ' + $('qbTown').value + ', CT ' + $('qbZip').value.trim(); }
  function smsBody(b) {
    return 'Hi Cipher Auto Lab, booking ' + B.ref + ' from the Detail Menu: ' + b.pkgName + ' for my ' + b.sizeLabel.toLowerCase() +
      (b.names.length ? ', plus ' + b.names.join(', ') : '') + '. ' + $('qbCar').value.trim() + '. ' +
      (B.dateLabel || B.date) + ', ' + B.win + '. ' + where() + '. Menu total ' + money(b.total) + (b.plus ? '+' : '') +
      ' before any travel fee. ' + $('qbName').value.trim() + ', ' + $('qbPhone').value.trim() + '.';
  }

  function payError(m) {
    var e = $('qbE5'); e.textContent = m || 'The payment did not go through, so nothing was charged. Try again, or call (203) 560-3572.'; e.hidden = false;
  }
  function textToHold(b) {
    $('qbPayCard').hidden = true;
    $('qbTextHold').hidden = false;
    $('qbSms').href = 'sms:' + NUMBER + '?&body=' + encodeURIComponent(smsBody(b));
  }

  function startDeposit() {
    if (payUI || B.paid) return;
    var b = build();
    $('qbE5').hidden = true; $('qbPayWait').hidden = false; $('qbPayBtn').disabled = true;
    $('qbPayCard').hidden = false; $('qbTextHold').hidden = true;
    payUI = { pending: true };
    var body = {
      source: 'menu', area: wxArea(), packageKey: b.pkgKey, paintKey: '', tier: b.tier, addons: b.serverAdds.join(','), ref: B.ref,
      name: $('qbName').value, phone: $('qbPhone').value, email: $('qbEmail').value.trim(),
      vehicle: $('qbCar').value, size: b.sizeLabel, condition: '', parked: B.garage ? 'Garage' : '', garage: B.garage ? 'yes' : 'no', smsOptIn: $('qbSmsOk').checked ? 'yes' : 'no',
      date: B.date, window: B.win, address: $('qbStreet').value, town: $('qbTown').value, zip: $('qbZip').value,
      notes: notes(), estTotal: money(b.total) + (b.plus ? '+' : ''),
      agreementVersion: AGREEMENT_VERSION, signature: $('qbSig').value.trim(), signedAt: B.signedAt,
      photoConsent: $('qbPhoto').checked ? 'yes' : 'no',
    };
    remember(b);
    Promise.resolve(loadAssets()).then(function () {
      if (!window.STRIPE_PK || !window.Stripe || !window.CALDeposit) { textToHold(b); return null; }
      return fetch('/api/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (data) {
            if (r.status === 503) { textToHold(b); return null; }
            if (!r.ok || !data.clientSecret) throw new Error(data.error || 'Payment could not start.');
            payUI = window.CALDeposit.mount({
              clientSecret: data.clientSecret, express: '#qbExpress', payment: '#qbPayment', theme: 'light',
              onAmount: function (t) { $('qbPayAmt').textContent = t; },
              onCanPay: function (ok) { $('qbPayBtn').disabled = !ok; },
              onWallets: function (any) { $('qbSep').hidden = !any; },
              onPaid: function () { booked(b); },
              onError: payError,
            });
            return payUI.ready;
          });
        });
    }).then(function () { $('qbPayWait').hidden = true; })
      .catch(function (err) { $('qbPayWait').hidden = true; payUI = null; payError(err && err.message); });
  }

  $('qbPayBtn').addEventListener('click', function () {
    if (paying || !payUI || !payUI.pay) return;
    var btn = this; paying = true; btn.textContent = 'Processing…'; $('qbE5').hidden = true;
    payUI.pay().then(function () { paying = false; btn.textContent = 'Pay deposit & book'; });
  });

  /* ----------------------------------------------------------- 6 · booked */
  function remember(b) {
    try {
      sessionStorage.setItem('cal_menu_booking', JSON.stringify({
        ref: B.ref, what: b.pkgName + ' · ' + b.sizeLabel, day: B.dateLabel || B.date, win: B.win, where: where(), sms: smsBody(b),
      }));
    } catch (e) { /* private mode: the confirmation still shows from the server */ }
  }
  function fillDone(d) {
    $('qbDoneRef').textContent = d.ref || '';
    $('qbDoneWhat').textContent = d.what || '';
    $('qbDoneDay').textContent = d.day || '';
    $('qbDoneWin').textContent = d.win || '';
    $('qbDoneDep').textContent = d.paid || '';
    $('qbDoneWhere').textContent = d.where || '';
    if (d.sms) $('qbDoneSms').href = 'sms:' + NUMBER + '?&body=' + encodeURIComponent(d.sms);
  }
  function booked(b) {
    B.paid = true;
    fillDone({ ref: B.ref, what: b.pkgName + ' · ' + b.sizeLabel, day: B.dateLabel || B.date, win: B.win,
               paid: $('qbPayAmt').textContent.replace(/\.00$/, '') + ' paid', where: where(), sms: smsBody(b) });
    history.replaceState({ qb: 6 }, '', '#book');
    show(6);
  }

  // back from a payment app that had to leave the page (/menu?paid=1&session_id=...)
  (function returning() {
    var q = new URLSearchParams(location.search), id = q.get('session_id');
    if (q.get('paid') !== '1' || !id) return;
    var saved = {}; try { saved = JSON.parse(sessionStorage.getItem('cal_menu_booking') || '{}'); } catch (e) {}
    history.replaceState(null, '', location.pathname);
    fetch('/api/checkout-status?session_id=' + encodeURIComponent(id)).then(function (r) { return r.json().then(function (d) { return [r, d]; }); })
      .then(function (x) {
        var r = x[0], d = x[1];
        if (!(r.ok && d.status === 'complete')) return;
        B.paid = true; B.ref = d.ref || saved.ref || '';
        fillDone({ ref: B.ref, what: saved.what, day: saved.day, win: saved.win, where: saved.where, sms: saved.sms,
                   paid: d.amount ? '$' + d.amount + ' paid' : 'Paid' });
        qb.hidden = false; document.documentElement.classList.add('qb-open');
        history.pushState({ qb: 6 }, '', '#book'); B.depth = 1;
        show(6);
      }).catch(function () {});
  })();
})();
