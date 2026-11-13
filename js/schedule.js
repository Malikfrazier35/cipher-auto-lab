/* The booking day, engineered around the job. Used by the Detail Menu booking (js/menu-book.js)
   and the booking page (app.js), after js/weather.js.

   How a day is worked out:
   - Job length is the package plus its add-ons (the same minutes /menu shows). Outside work
     (wash, decon, protection) comes first, then the interior.
   - Outdoors the job finishes by sunset that day (worked out for the county), and never after 6pm.
     A customer with a garage who is fine with a wash or rinseless wash inside keeps 6pm, rain or shine.
   - Each arrival window is cut down so the job still finishes in time; a window that can't, isn't offered.
     A job longer than the day becomes two visits.
   - Weather is read for the hours the car is actually being worked on outside, not just the arrival
     window. Interior-only jobs and garage jobs don't mind rain.
   - 35°F or colder outside: rinseless wash. Same shine, engineered to not need a water hose.
   - November to March, every exterior includes the salt neutralizer on wheels, wells and lower panels.

   CALSchedule.job(pkg, addOnKeys, paintKey) -> job
   CALSchedule.plan({ job, ymd, area, garage, data }) -> the day (see plan() below)
   CALSchedule.timeline(plan, windowKey) -> HTML for the day bar
   CALSchedule.notes(plan, windowKey) -> [{ kind, text }]                                        */
(function (root) {
  var LL = { fairfield: [41.27, -73.37], hartford: [41.80, -72.73], litchfield: [41.79, -73.25], middlesex: [41.43, -72.52],
    'new-haven': [41.41, -72.93], 'new-london': [41.47, -72.10], tolland: [41.86, -72.34], windham: [41.83, -71.99] };
  var START = 480, CLOSE = 1080, LONG = 600, COLD = 35;        // 8am first arrival, 6pm last finish, 10 hr cap
  var WINS = { morning: [480, 660], midday: [660, 840], afternoon: [840, 1020] };
  var NAMES = { morning: 'Morning', midday: 'Midday', afternoon: 'Afternoon' };
  var BASE = { exterior: [120, 0], interior: [0, 180], full: [120, 180] };     // [outside, inside] minutes
  var ADD = { shampoo: ['int', 60], extract: ['int', 60], leather: ['int', 45], stain: ['int', 60], pethair: ['int', 45],
    iron: ['ext', 45], clay: ['ext', 45], sealant: ['ext', 30], spray: ['ext', 45], cspray: ['ext', 45],
    engine: ['ext', 45], headlights: ['ext', 60], headlight: ['ext', 60] };
  var RANK = { storm: 6, snow: 5, rain: 4, fog: 3, cloudy: 2, partly: 1, clear: 0 };
  var LABEL = { storm: 'Thunderstorms', snow: 'Snow', rain: 'Rain', fog: 'Fog', partly: 'Partly cloudy', cloudy: 'Cloudy', clear: 'Sunny' };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function job(pkg, adds, paint) {
    var b = BASE[pkg] || BASE.full, ext = b[0], int = b[1];
    (adds || []).forEach(function (k) {
      var a = ADD[k]; if (!a) return;
      if (a[0] === 'int' && b[1]) int += a[1];
      if (a[0] === 'ext' && b[0]) ext += a[1];
    });
    return { ext: ext, int: int, mins: ext + int, paint: !!paint, outside: ext > 0 || !!paint };
  }
  function length(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h ? h + ' hr' + (h === 1 ? '' : 's') : '') + (m ? (h ? ' ' : '') + m + ' min' : '');
  }

  /* ------------------------------------------------------------ the sun */
  var FMT = null;
  function local(t) {           // a moment -> minutes after midnight in Connecticut
    if (!FMT) FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false });
    var h = 0, m = 0;
    FMT.formatToParts(new Date(t)).forEach(function (p) { if (p.type === 'hour') h = +p.value % 24; if (p.type === 'minute') m = +p.value; });
    return h * 60 + m;
  }
  // NOAA's sunrise/sunset equations, to within a couple of minutes
  function sunset(ymd, area) {
    var ll = LL[area] || LL.hartford, y = +ymd.slice(0, 4), mo = +ymd.slice(5, 7), d = +ymd.slice(8, 10);
    var n = Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
    var g = 2 * Math.PI / 365 * (n - 1 + (21 - 12) / 24);
    var eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    var dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) -
      0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    var lat = ll[0] * Math.PI / 180;
    var ha = Math.acos(Math.cos(90.833 * Math.PI / 180) / (Math.cos(lat) * Math.cos(dec)) - Math.tan(lat) * Math.tan(dec)) * 180 / Math.PI;
    return local(Date.UTC(y, mo - 1, d) + (720 - 4 * (ll[1] - ha) - eq) * 6e4);
  }

  /* ---------------------------------------------------------- the clock */
  function f15(x) { return Math.floor(x / 15) * 15; }
  function clock(min, noSuffix) {
    var h = Math.floor(min / 60), m = min % 60;
    return (h % 12 || 12) + (m ? ':' + (m < 10 ? '0' : '') + m : '') + (noSuffix ? '' : h >= 12 ? 'pm' : 'am');
  }
  function range(a, b) { return clock(a, (a < 720) === (b < 720)) + '–' + clock(b); }

  /* ------------------------------------------------- weather over a span */
  function wetOf(x) { return !!x && (x.kind === 'rain' || x.kind === 'snow' || x.kind === 'storm' || x.pop >= 50); }
  function over(series, a, b) {         // forecast hours overlapping [a, b) minutes
    var hs = (series || []).filter(function (h) { return h[0] * 60 < b && h[0] * 60 + 60 > a; });
    if (!hs.length) return null;
    var temps = hs.map(function (h) { return h[1]; }), pop = Math.max.apply(null, hs.map(function (h) { return h[3]; }));
    var counts = {};
    hs.forEach(function (h) { counts[h[2]] = (counts[h[2]] || 0) + 1; });
    var keys = Object.keys(counts);
    var kind = keys.sort(function (x, y) { return counts[y] - counts[x] || RANK[y] - RANK[x]; })[0];
    var wet = keys.filter(function (k) { return RANK[k] >= 4; }).sort(function (x, y) { return RANK[y] - RANK[x]; })[0];
    if (wet && pop >= 40) kind = wet;
    if ((kind === 'rain' || kind === 'snow' || kind === 'storm') && pop < 25) kind = 'cloudy';
    return { lo: Math.min.apply(null, temps), hi: Math.max.apply(null, temps), kind: kind, label: LABEL[kind], pop: Math.round(pop / 10) * 10 };
  }
  function hourWet(h) { return ((h[2] === 'rain' || h[2] === 'snow' || h[2] === 'storm') && h[3] >= 40) || h[3] >= 60; }
  function salty(ymd) { var m = +String(ymd).slice(5, 7); return m >= 11 || m <= 3; }

  /* -------------------------------------------------------------- the day
     { ymd, sunset, finish, why: 'garage'|'sunset'|'close', mins, two, garageHelps, garageOpens,
       wins: { morning: { ok, a, end, label, time, doneA, doneB, outA, outB, wx, wet, cold, why }, ... },
       level: 'hourly'|'day'|'typical'|'none', day, typical, station, series, salt, job, garage }       */
  function plan(o) {
    var J = o.job, ymd = o.ymd, data = o.data || null, garage = !!o.garage;
    var ss = sunset(ymd, o.area), finish = garage ? CLOSE : Math.min(CLOSE, f15(ss));
    var why = garage ? 'garage' : finish < CLOSE ? 'sunset' : 'close';
    var D = J.paint ? null : J.mins;
    var series = data && data.hourly && data.hourly[ymd];
    var day = data && data.days && data.days[ymd];
    var typ = data && data.typical && data.typical.days && data.typical.days[ymd];
    var level = series ? 'hourly' : day ? 'day' : typ ? 'typical' : 'none';
    var latest = D == null ? 0 : finish - D;
    var two = D != null && (latest < START || D > LONG);
    var wins = {};
    Object.keys(WINS).forEach(function (k) {
      var a = WINS[k][0], b = WINS[k][1], w = { key: k, name: NAMES[k], a: a, ok: false };
      if (J.paint) { w.ok = k === 'morning'; w.end = b; w.why = 'Paint work starts in the morning'; }
      else if (two) { w.ok = k === 'morning'; w.end = 540; w.two = true; w.why = 'A full day: we start in the morning'; }
      else {
        var end = Math.min(b, f15(latest));
        w.ok = k === 'morning' ? end >= a : end - a >= 30;
        w.end = end;
        w.why = why === 'sunset' ? 'Would run past sunset' : 'Would run past 6pm';
      }
      if (w.ok) {
        delete w.why;
        w.time = w.end === a ? clock(a) + ' sharp' : range(a, w.end);
        w.label = NAMES[k] + ' · ' + (w.end === a ? clock(a) : range(a, w.end)) + (w.two ? ' · 2 visits' : '');
        if (!J.paint && !two) { w.doneA = a + D; w.doneB = w.end + D; }
        // the hours the car is worked on outside (inside-only: the whole job, for information)
        w.outA = a;
        w.outB = J.paint || two ? finish : w.end + (J.ext || J.int);
        w.wx = series ? over(series, w.outA, w.outB) : null;
        w.wet = !!(w.wx && J.outside && !garage && wetOf(w.wx));
        w.cold = !!(w.wx && J.ext && !garage && w.wx.lo <= COLD);
        // rain moving in later: the latest arrival that still gets the outside work done before it
        if (w.wet && J.ext && !J.paint && !two) {
          var first = series.filter(function (h) { return h[0] * 60 + 60 > w.outA && h[0] * 60 < w.outB && hourWet(h); })[0];
          var by = first ? f15(Math.max(first[0] * 60, w.outA) - J.ext) : -1;
          if (first && by >= w.a) { w.wetAt = first[0] * 60; w.dryBy = Math.min(by, w.end); }
        }
      }
      wins[k] = w;
    });
    var p = { ymd: ymd, sunset: ss, finish: finish, why: why, mins: D, two: two, wins: wins, level: level, day: day || null,
      typical: typ || null, station: data && data.typical ? data.typical.station : '', series: series || null,
      salt: J.ext > 0 && salty(ymd), job: J, garage: garage, area: o.area };
    p.dayWet = !!(J.outside && !garage && (level === 'day' ? wetOf(day) : false));
    p.dayCold = !!(J.ext && !garage && ((level === 'day' && day.hi <= COLD) || (level === 'typical' && typ.hi <= COLD)));
    p.garageHelps = two && !garage && D <= LONG && CLOSE - D >= START;
    if (!garage && why === 'sunset' && !two && !J.paint) {
      var g = plan({ job: J, ymd: ymd, area: o.area, garage: true, data: null });
      p.garageOpens = count(g) > count(p) || g.wins[last(p)].end > p.wins[last(p)].end;
    }
    return p;
  }
  function count(p) { return Object.keys(p.wins).filter(function (k) { return p.wins[k].ok; }).length; }
  function last(p) { var ks = Object.keys(p.wins).filter(function (k) { return p.wins[k].ok; }); return ks[ks.length - 1] || 'morning'; }
  function best(p, wk) { return p.wins[wk] && p.wins[wk].ok ? wk : Object.keys(p.wins).filter(function (k) { return p.wins[k].ok; })[0] || 'morning'; }

  /* ------------------------------------------------------------- the words */
  function dateText(ymd) { return MON[+ymd.slice(5, 7) - 1] + ' ' + +ymd.slice(8, 10); }
  function notes(p, wk) {
    var w = p.wins[wk] || {}, out = [], J = p.job;
    if (p.two) {
      out.push({ kind: 'plan', text: 'This build runs about ' + length(p.mins) + ', longer than ' +
        (p.garage ? 'one working day' : 'the daylight on ' + dateText(p.ymd) + ' (sunset ' + clock(p.sunset) + ')') +
        '. We start at 8am and finish on a second visit, and we\'ll set that day with you.' +
        (p.garageHelps ? ' With a garage it fits in one day.' : '') });
    } else if (J.paint) {
      out.push({ kind: 'plan', text: 'Paint work fills the day, and correction or coating can run into a second. We start in the morning and confirm the timing with you' +
        (p.why === 'sunset' ? '. Daylight ends at ' + clock(p.sunset) + ' that day, so a garage helps a lot.' : '.') });
    } else if (w.ok) {
      out.push({ kind: 'plan', text: 'About ' + length(p.mins) + ' of work: arrive ' + w.time + ', done by about ' +
        (w.doneA === w.doneB ? clock(w.doneB) : range(w.doneA, w.doneB)) + '.' +
        (p.why === 'sunset' ? ' Outdoors we finish before sunset (' + clock(p.sunset) + ').' : p.garage ? ' In your garage we can work until 6pm.' : '') });
    }
    if (w.cold || p.dayCold) out.push({ kind: 'cold', text: (p.level === 'typical' ? 'Often 35°F or colder around then: likely' : '35°F or colder while we work outside:') +
      ' a rinseless wash. Same shine, engineered to not need a water hose.' });
    if (w.wet && w.dryBy != null) out.push({ kind: 'wet', text: (w.wx.kind === 'snow' ? 'Snow' : 'Rain') + ' could move in around ' + clock(w.wetAt) +
      ' (' + w.wx.pop + '%). Arriving by ' + clock(w.dryBy) + ' gets the outside work done before it, so we\'ll aim for early in your window. ' +
      'If it comes sooner, we move you to the next good slot, deposit and all.' });
    else if (w.wet) out.push({ kind: 'wet', text: (w.wx.kind === 'snow' ? 'Snow' : 'Rain') + ' is possible while we\'d be working outside (' + w.wx.pop +
      '%). Pick a drier day or window, or keep it: if the weather turns we move you to the next good slot, deposit and all.' });
    if (p.dayWet) out.push({ kind: 'wet', text: (p.day.kind === 'snow' ? 'Snow' : 'Rain') + ' is possible that day (' + p.day.pop +
      '%). If it holds, we move you to the next good slot, deposit and all.' });
    if (p.level === 'day') out.push({ kind: 'far', text: 'Day forecast for ' + dateText(p.ymd) + ': ' + p.day.text + ', high ' + p.day.hi + '°' +
      (p.day.pop ? ', ' + p.day.pop + '% chance of precipitation' : '') + '. Hour-by-hour reaches about 6 days out.' });
    if (p.level === 'typical') out.push({ kind: 'far', text: 'Too far out for a forecast. Typical for ' + dateText(p.ymd) + (p.station ? ' (' + p.station + ')' : '') +
      ': high ' + p.typical.hi + '°, low ' + p.typical.lo + '°, rain or snow on ' + odds(p.typical.pop) + '. We check the forecast every morning and text you if it turns wet.' });
    if (w.ok && w.wx && wetOf(w.wx) && (!J.outside || p.garage)) out.push({ kind: 'ok', text: p.garage ? 'In your garage, rain doesn\'t matter.' :
      'Rain doesn\'t stop an interior detail: we work inside the car.' });
    if (p.salt) out.push({ kind: 'salt', text: 'Winter salt neutralizer included on the wheels, wheel wells, rockers, lower doors and jambs, so road salt isn\'t left sitting on the metal.' });
    if (p.garageOpens) out.push({ kind: 'garage', text: 'Have a garage? Turn it on below and we can work later, until 6pm.' });
    return out;
  }
  function odds(pct) { return pct >= 45 ? 'about half of days' : pct >= 28 ? 'about 1 in 3 days' : pct >= 20 ? 'about 1 in 4 days' : 'about 1 in 5 days'; }

  /* ------------------------------------------------------- the day, drawn
     8am to 6pm: hour-by-hour sky and temperature when the forecast reaches, the arrival window,
     the work (outside part solid), the finish and sunset.                                       */
  var A = 480, Z = 1080;
  function pct(m) { return ((Math.max(A, Math.min(Z, m)) - A) / (Z - A) * 100).toFixed(2) + '%'; }
  function seg(cls, a, b, extra) { return '<i class="tl-' + cls + '" data-l="' + pct(a) + '" data-w="' + (((Math.min(Z, b) - Math.max(A, a)) / (Z - A)) * 100).toFixed(2) + '%"' + (extra || '') + '></i>'; }
  function timeline(p, wk) {
    var w = p.wins[wk]; if (!w || !w.ok) return '';
    var J = p.job, W = root.CALWeather, endAll = w.doneB || p.finish, h = '';
    h += '<div class="tl-track">';
    if (p.finish < Z) h += seg('dark', p.finish, Z);
    h += seg('arr', w.a, Math.max(w.end, w.a + 15));
    h += seg('job', w.a, endAll);
    if (J.ext && !J.paint && !p.two) h += seg('out', w.a, Math.min(w.outB, endAll));
    if (p.sunset < Z) h += '<i class="tl-sun" data-l="' + pct(p.sunset) + '"></i>';
    h += '</div>';
    if (p.series && W) {
      h += '<div class="tl-wx">';
      p.series.filter(function (x) { return x[0] >= 8 && x[0] < 18; }).forEach(function (x) {
        var outside = J.outside && x[0] * 60 < w.outB && x[0] * 60 + 60 > w.outA;
        var cls = (outside ? ' on' : '') + (x[3] >= 40 && x[2] !== 'clear' && x[2] !== 'partly' ? ' wet' : '') + (x[1] <= COLD ? ' cold' : '');
        h += '<span class="tl-h' + cls + '">' + W.icon(x[2]) + '<b>' + x[1] + '°</b></span>';
      });
      h += '</div>';
    }
    h += '<div class="tl-ax"><span>8a</span><span>10a</span><span>12p</span><span>2p</span><span>4p</span><span>6p</span></div>';
    h += '<p class="tl-key"><span class="k-arr">Arrive</span>' + (J.ext && !J.paint && !p.two ? '<span class="k-out">Outside</span><span class="k-in">Inside</span>' : '<span class="k-in">Working</span>') +
      '<span class="k-sun">Sunset ' + clock(p.sunset) + '</span></p>';
    return h;
  }
  // positions go on with CSSOM (no inline style attributes in the markup)
  function place(el) {
    Array.prototype.forEach.call(el.querySelectorAll('[data-l]'), function (i) {
      i.style.left = i.dataset.l; if (i.dataset.w) i.style.width = i.dataset.w;
    });
  }

  root.CALSchedule = { job: job, plan: plan, best: best, notes: notes, timeline: timeline, place: place,
    sunset: sunset, clock: clock, range: range, length: length, salty: salty, COLD: COLD };
})(typeof window !== 'undefined' ? window : globalThis);
