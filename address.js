/* Address suggestions as you type, from Google Places, limited to Connecticut.
   Pick one and the street, town and ZIP fill themselves. Used on the Detail Menu booking and
   on the booking page. Needs window.GMAPS_KEY in config.js (a browser key restricted to
   cipherautolab.com); without one this does nothing and the browser's own autofill still works.

   CALAddress.attach({ input, onPick({ street, town, zip, label }) })                       */
(function () {
  var CT = { west: -73.73, south: 40.95, east: -71.78, north: 42.06 };
  var lib = null;

  function places() {
    if (lib) return lib;
    if (!window.GMAPS_KEY) return Promise.reject(new Error('no key'));
    lib = new Promise(function (ok, fail) {
      window.__calMapsReady = function () { ok(); };
      var s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(window.GMAPS_KEY) +
              '&v=weekly&loading=async&libraries=places&callback=__calMapsReady';
      s.async = true;
      s.onerror = function () { fail(new Error('maps did not load')); };
      document.head.appendChild(s);
    }).then(function () { return window.google.maps.importLibrary('places'); });
    lib.catch(function () { lib = null; });
    return lib;
  }

  function part(comps, type, short) {
    for (var i = 0; i < comps.length; i++) {
      if (comps[i].types.indexOf(type) > -1) return short ? comps[i].shortText : comps[i].longText;
    }
    return '';
  }

  // Connecticut addresses: Google's "locality" is often the post office village (Oakville,
  // Unionville); the town itself is administrative_area_level_3. Prefer the town.
  function townFrom(comps) {
    var known = [];
    var T = window.TOWNS || {};
    Object.keys(T).forEach(function (r) { known = known.concat(T[r]); });
    var cands = [part(comps, 'administrative_area_level_3'), part(comps, 'locality'), part(comps, 'sublocality'), part(comps, 'postal_town')];
    for (var i = 0; i < cands.length; i++) {
      var c = (cands[i] || '').replace(/^Town of /i, '').trim();
      if (c && (!known.length || known.indexOf(c) > -1)) return c;
    }
    return '';
  }

  function attach(o) {
    var input = o.input;
    if (!input || !window.GMAPS_KEY) return;
    var box = document.createElement('div');
    box.className = 'addr-sug';
    box.setAttribute('role', 'listbox');
    box.hidden = true;
    input.parentNode.appendChild(box);
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('autocomplete', 'street-address');

    var token = null, timer = null, seq = 0, items = [], active = -1;

    function close() { box.hidden = true; box.innerHTML = ''; items = []; active = -1; }
    function render(list) {
      box.innerHTML = ''; items = list; active = -1;
      if (!list.length) { box.hidden = true; return; }
      list.forEach(function (s, i) {
        var p = s.placePrediction, b = document.createElement('button');
        b.type = 'button'; b.setAttribute('role', 'option'); b.dataset.i = i;
        var main = document.createElement('b'); main.textContent = p.mainText ? p.mainText.toString() : p.text.toString();
        var sec = document.createElement('span'); sec.textContent = p.secondaryText ? p.secondaryText.toString() : '';
        b.appendChild(main); b.appendChild(sec);
        box.appendChild(b);
      });
      var by = document.createElement('p'); by.className = 'addr-by'; by.textContent = 'Powered by Google';
      box.appendChild(by);
      box.hidden = false;
    }

    function pick(i) {
      var s = items[i]; if (!s) return;
      close();
      var place = s.placePrediction.toPlace();
      place.fetchFields({ fields: ['addressComponents', 'formattedAddress'] }).then(function () {
        token = null;                                   // a pick ends the billing session
        var c = place.addressComponents || [];
        var street = [part(c, 'street_number'), part(c, 'route', true)].filter(Boolean).join(' ');
        if (!street) street = (place.formattedAddress || '').split(',')[0];
        var zip = part(c, 'postal_code');
        o.onPick({ street: street, town: townFrom(c), zip: /^06\d{3}$/.test(zip) ? zip : '', label: place.formattedAddress || '' });
      }).catch(function () {});
    }

    input.addEventListener('input', function () {
      var v = input.value.trim();
      clearTimeout(timer);
      if (v.length < 3) { close(); return; }
      timer = setTimeout(function () {
        var mine = ++seq;
        places().then(function (P) {
          token = token || new P.AutocompleteSessionToken();
          return P.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: v, sessionToken: token, includedRegionCodes: ['us'], locationRestriction: CT,
          });
        }).then(function (r) {
          if (mine !== seq || document.activeElement !== input) return;
          render(((r && r.suggestions) || []).filter(function (s) { return s.placePrediction; }).slice(0, 5));
        }).catch(function () { close(); });
      }, 180);
    });
    input.addEventListener('keydown', function (e) {
      if (box.hidden) return;
      var btns = box.querySelectorAll('button');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
        Array.prototype.forEach.call(btns, function (b, i) { b.classList.toggle('on', i === active); });
      } else if (e.key === 'Enter' && active > -1) { e.preventDefault(); pick(active); }
      else if (e.key === 'Escape') { close(); }
    });
    // mousedown so the pick lands before the input loses focus
    box.addEventListener('mousedown', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      e.preventDefault(); pick(+b.dataset.i);
    });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (b) pick(+b.dataset.i);
    });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
    // start loading as soon as someone heads for the box
    input.addEventListener('focus', function () { places().catch(function () {}); }, { once: true });
  }

  window.CALAddress = { attach: attach, enabled: function () { return !!window.GMAPS_KEY; } };
})();
