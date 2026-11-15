/* Cipher Merch waitlist (merch.html). Taps on the product cards and the chips in the form are
   one selection. Sign-ups go to /api/merch-waitlist, which keeps them as tagged Stripe
   customers; if that is unavailable the page offers a pre-written text instead.          */
(function () {
  var form = document.getElementById('mxForm');
  if (!form) return;
  function $(id) { return document.getElementById(id); }
  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  var NAMES = { 'tee-black': 'Staple tee, black', 'tee-lime': 'Staple tee, lime', 'hoodie-salt': 'Salt Season hoodie' };
  var picked = {}, size = '';
  var src = (new URLSearchParams(location.search).get('src') || '').toLowerCase();
  if (!/^[a-z0-9-]{1,32}$/.test(src)) src = 'merch-page';

  function paint() {
    all('[data-item]').forEach(function (b) { b.setAttribute('aria-pressed', picked[b.dataset.item] ? 'true' : 'false'); });
    all('#mxSizes [data-size]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.size === size ? 'true' : 'false'); });
  }
  function items() { return Object.keys(picked).filter(function (k) { return picked[k]; }); }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-item]');
    if (b) { picked[b.dataset.item] = !picked[b.dataset.item]; paint(); $('mxItems').classList.remove('bad'); recheck(); return; }
    var s = e.target.closest('#mxSizes [data-size]');
    if (s) { size = s.dataset.size; paint(); $('mxSizes').classList.remove('bad'); recheck(); }
  });

  function phone10(v) { var d = String(v || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d; }
  function gaps() {
    var g = [], email = $('mxEmail').value.trim(), ph = phone10($('mxPhone').value);
    if (!items().length) g.push(['mxItems', 'pick at least one piece']);
    if (!size) g.push(['mxSizes', 'pick a size']);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) g.push(['mxEmail', 'check the email']);
    if ($('mxPhone').value.trim() && ph.length !== 10) g.push(['mxPhone', 'check the mobile number (10 digits)']);
    if (!email && !ph) g.push(['mxEmail', 'add an email or a mobile number']);
    return g;
  }
  function show(g) {
    ['mxItems', 'mxSizes', 'mxEmail', 'mxPhone'].forEach(function (id) { $(id).classList.remove('bad'); });
    g.forEach(function (x) { $(x[0]).classList.add('bad'); });
    var err = $('mxErr');
    if (!g.length) { err.hidden = true; return; }
    var parts = g.map(function (x) { return x[1]; });
    err.textContent = 'To join, ' + (parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0]) + '.';
    err.hidden = false;
  }
  function recheck() { if (!$('mxErr').hidden && !$('mxErr').dataset.server) show(gaps()); }
  ['mxEmail', 'mxPhone'].forEach(function (id) { $(id).addEventListener('input', recheck); });

  function smsFallback(msg) {
    var body = 'MERCH waitlist: ' + items().map(function (k) { return NAMES[k]; }).join(', ') + ', size ' + size +
      ($('mxName').value.trim() ? '. ' + $('mxName').value.trim() : '') + ($('mxEmail').value.trim() ? ', ' + $('mxEmail').value.trim() : '');
    var err = $('mxErr'); err.dataset.server = '1';
    err.textContent = (msg || 'The list is having a moment.') + ' ';
    var a = document.createElement('a'); a.href = 'sms:+12035603572?&body=' + encodeURIComponent(body); a.textContent = 'Text it to us instead';
    err.appendChild(a); err.hidden = false;
  }

  var busy = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    delete $('mxErr').dataset.server;
    var g = gaps(); show(g);
    if (g.length) { var first = $(g[0][0]); first.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (first.tagName === 'INPUT') first.focus({ preventScroll: true }); return; }
    busy = true; var btn = $('mxSubmit'); btn.textContent = 'Adding you…'; btn.disabled = true;
    fetch('/api/merch-waitlist', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: $('mxName').value, email: $('mxEmail').value.trim(), phone: $('mxPhone').value, items: items().join(','), size: size, source: src }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.ok && d.ok) {
          $('mxDoneText').textContent = 'We’ll ' + ($('mxEmail').value.trim() ? 'email' : 'text') + ' you first when Drop 01 opens: ' +
            items().map(function (k) { return NAMES[k]; }).join(', ') + ', size ' + size + '.';
          $('mxDone').hidden = false; $('mxDone').focus();
          return;
        }
        if (r.status === 400 && d.error) { var err = $('mxErr'); err.dataset.server = '1'; err.textContent = d.error; err.hidden = false; return; }
        smsFallback(d.error && r.status !== 503 ? d.error.replace(/Text MERCH.*$/, '') : null);
      });
    }).catch(function () { smsFallback(); })
      .then(function () { busy = false; btn.textContent = 'Join the waitlist'; btn.disabled = false; });
  });
})();
