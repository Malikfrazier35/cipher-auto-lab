/* Photo quote, by text. The customer picks a town and says what the car is; the page writes
   the message and opens their own texts addressed to us, where they add the photos and send.
   Nothing is uploaded to this site. On a computer, the same message goes by email instead. */
(function () {
  var NUMBER = '+12035603572', MAIL = 'hello@cipherautolab.com';
  function $(id) { return document.getElementById(id); }
  var form = $('pqForm');
  if (!form) return;
  var town = $('pqTown'), done = $('pqDone'), err = $('pqErr');

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

  // ?pq=Window%20tint (or any option text) preselects what they're after
  var want = new URLSearchParams(location.search).get('pq');
  if (want) {
    [].slice.call($('pqSvc').options).forEach(function (o) {
      if (o.value.toLowerCase().indexOf(want.toLowerCase()) === 0) $('pqSvc').value = o.value;
    });
  }

  function message() {
    var name = $('pqName').value.trim(), car = $('pqCar').value.trim(), note = $('pqNote').value.trim();
    return [
      'Photo quote, Cipher Auto Lab',
      name ? 'Name: ' + name : null,
      'Town: ' + (town.value || '(not picked)') + ', CT',
      'Car: ' + (car || '(see photos)'),
      'Looking for: ' + $('pqSvc').value,
      note ? 'Note: ' + note : null,
      '',
      'Photos attached.'
    ].filter(function (l) { return l !== null; }).join('\n');
  }
  function sms(body) { return 'sms:' + NUMBER + '?&body=' + encodeURIComponent(body); }
  function mail(body) {
    return 'mailto:' + MAIL + '?subject=' + encodeURIComponent('Photo quote' + (town.value ? ', ' + town.value : '')) +
      '&body=' + encodeURIComponent(body.replace('Photos attached.', 'Photos attached to this email.'));
  }
  function refresh() { $('pqMail').href = mail(message()); }
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  refresh();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!town.value) {
      err.textContent = 'Pick your town so the price we text back includes any travel fee.';
      err.hidden = false;
      town.classList.add('bad');
      town.focus();
      return;
    }
    err.hidden = true;
    town.classList.remove('bad');
    var body = message();
    $('pqAgain').href = sms(body);
    $('pqMail2').href = mail(body);
    form.hidden = true;
    done.hidden = false;
    window.location.href = sms(body);
  });
})();
