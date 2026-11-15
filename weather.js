/* Forecast on the booking screens: each day button and each arrival window show the National
   Weather Service forecast (via /api/weather, by county), so a customer can pick a dry slot.
   Used by the booking page (app.js) and the Detail Menu booking (js/menu-book.js).

   CALWeather.areaFor(town) -> area slug ('hartford' when the town isn't known yet)
   CALWeather.get(area)     -> Promise<forecast | null>  (null: nothing to show, never an error)
   CALWeather.dayHTML(d), CALWeather.winHTML(w), CALWeather.icon(kind)                       */
(function () {
  var SLUG = { 'Fairfield County': 'fairfield', 'Hartford County': 'hartford', 'Litchfield County': 'litchfield',
    'Middlesex County': 'middlesex', 'New Haven County': 'new-haven', 'New London County': 'new-london',
    'Tolland County': 'tolland', 'Windham County': 'windham' };

  var SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>';
  var CLOUD = '<path d="M7 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 10.1 4.2 4.2 0 0 0 7 18.5z"/>';
  var ICONS = {
    clear: SUN,
    partly: '<circle cx="8.5" cy="8.5" r="3"/><path d="M8.5 2.5v1.3M3.9 4.4l.9.9M2.5 8.5h1.3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 .5-6.96A4.8 4.8 0 0 0 9 11.4 3.8 3.8 0 0 0 9 19z"/>',
    cloudy: CLOUD,
    fog: '<path d="M4 9h16M3 13h18M5 17h14"/>',
    rain: '<path d="M7 14.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 6.1 4.2 4.2 0 0 0 7 14.5z"/><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5"/>',
    snow: '<path d="M7 14.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 6.1 4.2 4.2 0 0 0 7 14.5z"/><path d="M8 18.5h.01M12 20h.01M16 18.5h.01M10 21.5h.01M14 21.5h.01" stroke-width="2.6"/>',
    storm: '<path d="M7 14.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 6.1 4.2 4.2 0 0 0 7 14.5z"/><path d="M12.5 15.5l-2 3.5h3l-2 3.5"/>',
  };
  function icon(kind) {
    return '<svg class="wx-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[kind] || CLOUD) + '</svg>';
  }
  function wet(x) { return x && (x.kind === 'rain' || x.kind === 'snow' || x.kind === 'storm' || x.pop >= 50); }
  function range(x) { return x.lo === x.hi ? x.hi + '°' : x.lo + '–' + x.hi + '°'; }

  var cache = {};
  function get(area) {
    if (!window.fetch) return Promise.resolve(null);
    if (!cache[area]) {
      cache[area] = fetch('/api/weather?area=' + encodeURIComponent(area))
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
      cache[area].then(function (d) { if (!d) delete cache[area]; });   // try again next time
    }
    return cache[area];
  }
  function areaFor(town) {
    var T = window.TOWNS || {};
    for (var region in T) if (T[region].indexOf(town) > -1) return SLUG[region] || 'hartford';
    return 'hartford';
  }
  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  window.CALWeather = {
    get: get, areaFor: areaFor, ymd: ymd, icon: icon, wet: wet,
    // on a day button: sky icon and the high, plus the rain chance when it matters
    dayHTML: function (d) {
      return icon(d.kind) + '<span>' + d.hi + '°' + (d.pop >= 30 ? ' · ' + d.pop + '%' : '') + '</span>';
    },
    // past the forecast: the typical high for that date (NOAA normals), clearly not a forecast
    typHTML: function (t) { return '<span class="typ">~' + t.hi + '°</span>'; },
    // under an arrival window: temperatures, sky, rain chance
    winHTML: function (w) {
      return icon(w.kind) + '<span>' + range(w) + ' · ' + w.label + '</span><em>' +
        (w.pop ? w.pop + '% chance of ' + (w.kind === 'snow' ? 'snow' : 'rain') : 'Dry') + '</em>';
    },
    label: function (w) { return range(w) + ', ' + w.label.toLowerCase() + ', ' + (w.pop ? w.pop + '% chance of rain' : 'dry'); },
  };
})();
