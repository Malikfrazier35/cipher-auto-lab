/* Carry choices into the booking form, so nobody has to pick the same thing twice.
   Links arrive as /quote?svc=full&size=suv&adds=pethair,iron#quote from the detail menu,
   the home page cards and detailing.html. This selects the service, the vehicle size and the
   add-ons, shows a one-line summary with a "Change" button, and opens the booking at step 2
   (the vehicle) instead of step 1.
   Everything here comes from the URL, so it is treated as untrusted: only keys on the fixed
   lists below are accepted, so nothing from the URL ever reaches a selector directly. */
(function () {
  var SVC = ['exterior', 'interior', 'full'];
  var SIZE = { sedan: 'sedan', suv: 'suv5', suv5: 'suv5', suv3: 'suv7', suv7: 'suv7', truck: 'truck' };
  var ADD = { shampoo: 'extract', extract: 'extract', leather: 'leather', stain: 'stain', pethair: 'pethair',
              iron: 'iron', clay: 'clay', sealant: 'sealant', spray: 'cspray', cspray: 'cspray',
              engine: 'engine', headlights: 'headlight', headlight: 'headlight' };

  var q = new URLSearchParams(location.search);
  var svc = q.get('svc');
  if (SVC.indexOf(svc) < 0) return;
  var tier = SIZE[q.get('size')] || '';
  var adds = (q.get('adds') || '').split(',').map(function (k) { return ADD[k]; })
    .filter(function (k, i, a) { return k && a.indexOf(k) === i; });

  function pick(sel) { var el = document.querySelector(sel); if (el) el.click(); return el; }

  window.addEventListener('load', function () {
    setTimeout(function () {
      try {
        var door = pick('#svc .door[data-key="' + svc + '"]');
        if (!door) return;
        var size = tier ? pick('#size .opt[data-tier="' + tier + '"]') : document.querySelector('#size .opt.sel');
        var names = [];
        adds.forEach(function (k) {
          var row = document.querySelector('.addrow[data-add="' + k + '"]');
          if (!row || row.closest('#addInt,#addExt').hidden) return; // not offered with this service
          if (!row.classList.contains('sel')) row.click();
          names.push(row.dataset.lbl);
        });

        // the summary, at the top of the vehicle step
        var pane = document.querySelector('.pane[data-p="2"]');
        if (pane && !document.getElementById('carry')) {
          var box = document.createElement('div');
          box.id = 'carry';
          box.className = 'carry';
          var t = document.createElement('div');
          var k = document.createElement('span');
          k.className = 'k';
          k.textContent = q.get('from') === 'menu' ? 'From your detail menu' : 'Your detail';
          var b = document.createElement('b');
          var title = door.querySelector('.dnm');
          b.textContent = [title ? title.textContent.trim() : '', size ? size.dataset.size : '']
            .filter(Boolean).join(' · ');
          var s = document.createElement('span');
          s.textContent = names.length ? '+ ' + names.join(', ') : 'Add-ons come up at step 3.';
          t.appendChild(k); t.appendChild(b); t.appendChild(s);
          var change = document.createElement('button');
          change.type = 'button';
          change.className = 'btn btn-o btn-sm';
          change.setAttribute('data-go', '1');
          change.textContent = 'Change';
          box.appendChild(t); box.appendChild(change);
          pane.insertBefore(box, pane.firstChild);
        }
        pick('.pane[data-p="1"] [data-go="2"]'); // straight to the vehicle
      } catch (e) { /* booking form not on this page; do nothing */ }
    }, 250);
  });
})();
