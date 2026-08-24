(function(){
  // Bump AGREEMENT_VERSION whenever agreement.html changes materially. It is stored on
  // every booking so you can always prove which wording the customer actually signed.
  var AGREEMENT_VERSION='1.0';

  /* ------------------------------------------------------------------ prices
     Four tiers, because interior labour scales with seats and exterior labour
     scales with panel area — different curves. These must stay in step with the
     table in index.html, the deposits in api/create-payment-intent.js and the
     figures printed in terms.html. If they drift, someone gets charged something
     they were never shown, and that is the one promise this whole site is built on. */
  var SVC={
    exterior:{name:'Exterior Detail',dep:25,ext:true, int:false,hrs:'~2 hrs',
              p:{sedan:109,suv5:125,suv7:135,truck:139}},
    interior:{name:'Interior Detail',dep:30,ext:false,int:true, hrs:'~3 hrs',
              p:{sedan:169,suv5:185,suv7:205,truck:219}},
    full:    {name:'Full Detail',    dep:40,ext:true, int:true, hrs:'~5 hrs',
              p:{sedan:259,suv5:279,suv7:305,truck:325}}
  };
  // Paint work always includes its own wash and decontamination, so booking it
  // alongside an exterior service credits the exterior back rather than billing
  // the same hour twice. See overlap() below.
  var PAINT={
    gloss:      {name:'Gloss Enhancement',    dep:50, p:{sedan:349, suv5:399, suv7:429, truck:449}},
    correction: {name:'Paint Correction',     dep:100,p:{sedan:749, suv5:849, suv7:899, truck:949}},
    ceramic:    {name:'Ceramic Coating',      dep:100,p:{sedan:949, suv5:1049,suv7:1099,truck:1149}},
    corrceramic:{name:'Correction + Ceramic', dep:150,p:{sedan:1249,suv5:1399,suv7:1449,truck:1549}},
    show:       {name:'Show Finish',          dep:150,p:{sedan:1299,suv5:1449,suv7:1549,truck:1649},quote:true}
  };
  var TIERNAME={sedan:'sedan',suv5:'5-seat SUV',suv7:'7-seat SUV',truck:'truck or van'};
  var DECON_BUNDLE=119;   // iron ($69) + clay ($69) taken together

  var S={key:'full',tier:'sedan',size:'Sedan / coupe',paint:'',adds:{},jobUrl:'',
         date:null,win:'Morning · 8–11am',ref:'',sig:'',signedAt:'',photoOk:false};

  var $=function(id){return document.getElementById(id)};
  var $$=function(sel){return Array.prototype.slice.call(document.querySelectorAll(sel))};
  // strip control characters so nothing odd can ride along into an sms:/mailto: payload
  var esc=function(v){return String(v==null?'':v).replace(/[\u0000-\u001F\u007F]/g,' ').slice(0,300)};
  var money=function(n){return '$'+Math.round(n).toLocaleString()};

  /* ------------------------------------------------------------------ maths */
  function svc(){ return SVC[S.key] }
  function addRows(){ return $$('.addrow') }
  function addPrice(k){ var b=document.querySelector('.addrow[data-add="'+k+'"]'); return b?+b.dataset.price:0 }
  function addLabel(k){ var b=document.querySelector('.addrow[data-add="'+k+'"]'); return b?b.dataset.lbl:k }

  function activeAdds(){
    // only count add-ons whose section is actually on screen for this service
    var out=[];
    addRows().forEach(function(b){
      var k=b.dataset.add;
      if(S.adds[k] && !b.closest('#addInt,#addExt').hidden) out.push(k);
    });
    return out;
  }
  function bundled(list){ return list.indexOf('iron')>-1 && list.indexOf('clay')>-1 }

  function addTotal(){
    var list=activeAdds(), sum=0;
    list.forEach(function(k){ sum+=addPrice(k) });
    if(bundled(list)) sum -= (addPrice('iron')+addPrice('clay')-DECON_BUNDLE);
    return sum;
  }
  function paintPrice(){ return S.paint ? PAINT[S.paint].p[S.tier] : 0 }
  // Paint work covers the wash and decon an exterior service would have done.
  function overlap(){ return (S.paint && svc().ext) ? SVC.exterior.p[S.tier] : 0 }
  function total(){ return svc().p[S.tier] + paintPrice() - overlap() + addTotal() }
  function deposit(){ return Math.max(svc().dep, S.paint?PAINT[S.paint].dep:0) }
  function bal(){ return Math.max(0, total()-deposit()) }
  function isQuote(){ return !!(S.paint && PAINT[S.paint].quote) }
  function totalText(){ return (isQuote()?'from ':'')+money(total()) }

  /* ---------------------------------------------------------------- painting */
  function setText(id,v){ var e=$(id); if(e) e.textContent=v }

  function itemLines(){
    var out=['<span>'+svc().name+' · '+TIERNAME[S.tier]+'<i>'+money(svc().p[S.tier])+'</i></span>'];
    var list=activeAdds(), bun=bundled(list);
    list.forEach(function(k){
      if(bun && (k==='iron'||k==='clay')) return;
      out.push('<span>'+addLabel(k)+'<i>+'+money(addPrice(k))+'</i></span>');
    });
    if(bun) out.push('<span>Iron decon + clay, bundled<i>+'+money(DECON_BUNDLE)+'</i></span>');
    if(S.paint){
      out.push('<span>'+PAINT[S.paint].name+'<i>+'+money(paintPrice())+'</i></span>');
      if(overlap()) out.push('<span>Exterior wash already in the paint work<i>&minus;'
        +money(overlap())+'</i></span>');
    }
    return out.join('');
  }

  function paint(){
    var t=totalText();
    setText('pv2',t); setText('pv3',t);
    setText('pvSvc',svc().name); setText('pvSize',TIERNAME[S.tier]);
    setText('pdep3','$'+deposit());
    setText('depVal','$'+deposit());
    setText('balVal',money(bal()));
    var it=$('pitems3'); if(it) it.innerHTML=itemLines();
    // the two singles exist to sell the bundle — show the arithmetic, not the word "value"
    var bl=$('bundleLine');
    if(bl){
      var e=SVC.exterior.p[S.tier], i=SVC.interior.p[S.tier], f=SVC.full.p[S.tier];
      bl.innerHTML='Exterior <b>$'+e+'</b> plus Interior <b>$'+i+'</b> is <b>$'+(e+i)
        +'</b>. Together it’s <b>$'+f+'</b> — you keep <b>$'+(e+i-f)+'</b>.';
    }
    $$('[data-pp]').forEach(function(el){
      var k=el.dataset.pp, P=PAINT[k];
      el.textContent=(P.quote?'from ':'+')+'$'+P.p[S.tier].toLocaleString();
    });
    syncAddSections();
    syncSwap();
  }

  /* --------------------------------------------------- step 1: the three doors */
  $('svc').addEventListener('click',function(ev){
    var b=ev.target.closest('.door'); if(!b) return;
    $$('#svc .door').forEach(function(o){o.classList.remove('sel')});
    b.classList.add('sel'); S.key=b.dataset.key; paint();
  });

  /* --------------------------------------------------- step 2: size tiers */
  $('size').addEventListener('click',function(ev){
    var b=ev.target.closest('.opt'); if(!b) return;
    $$('#size .opt').forEach(function(o){o.classList.remove('sel')});
    b.classList.add('sel'); S.tier=b.dataset.tier; S.size=b.dataset.size; paint();
  });

  /* --------------------------------------------------- step 3: add-ons */
  // An exterior booking should not be offered carpet extraction. Hiding the
  // section also drops anything ticked inside it out of the total.
  function syncAddSections(){
    var i=$('addInt'), e=$('addExt');
    if(i) i.hidden=!svc().int;
    if(e) e.hidden=!svc().ext;
    var list=activeAdds();
    var bh=$('bundleHint'); if(bh) bh.hidden=!bundled(list);
  }
  addRows().forEach(function(b){
    b.addEventListener('click',function(){
      var k=this.dataset.add;
      S.adds[k]=!S.adds[k];
      this.classList.toggle('sel',!!S.adds[k]);
      paint();
    });
  });

  /* --------------------------------------------------- step 3: the paint room */
  $('paint').addEventListener('click',function(ev){
    var b=ev.target.closest('.pcard'); if(!b) return;
    $$('#paint .pcard').forEach(function(o){o.classList.remove('sel')});
    b.classList.add('sel'); S.paint=b.dataset.paint||'';
    var ln=$('leadnote');
    if(ln) ln.textContent = (S.paint==='show'||S.paint==='corrceramic')
      ? 'This one runs over two days — pick the first and we will confirm the second with you.'
      : 'Mon–Sat, from two days out. Sundays by request only.';
    paint();
  });

  // If someone books Interior plus paint work, Full Detail is cheaper, because the
  // paint work already covers the exterior. Say so rather than take the extra money.
  function syncSwap(){
    var n=$('swapNote'); if(!n) return;
    if(S.key!=='interior' || !S.paint){ n.hidden=true; return }
    var mine=SVC.interior.p[S.tier]+paintPrice();
    var full=SVC.full.p[S.tier]+paintPrice()-SVC.exterior.p[S.tier];
    if(full>=mine){ n.hidden=true; return }
    n.hidden=false;
    $('swapTxt').innerHTML='The paint work already includes a full exterior wash and decon, so '
      +'<b>Full Detail</b> with '+PAINT[S.paint].name+' comes to <b>'+money(full+addTotal())
      +'</b> — <b>$'+(mine-full)+' less</b> than Interior with it, and you get the outside done too.';
  }
  $('swapBtn').addEventListener('click',function(){
    var d=document.querySelector('#svc .door[data-key="full"]'); if(d) d.click();
  });

  /* ------------------------------------------------- vehicle + town pickers */
  function opt(parent, value, label){
    var o=document.createElement('option'); o.value=value; o.textContent=label||value;
    parent.appendChild(o); return o;
  }
  function vehicleText(){
    var free = esc($('vOther').value).trim();
    if($('vmk').value==='Other' || $('vmd').value==='__other'){
      return free ? ($('vyr').value ? $('vyr').value+' '+free : free) : '';
    }
    if(!$('vTrimWrap').hidden && $('vtr').value==='__other'){
      return [$('vyr').value,$('vmk').value,$('vmd').value,free].filter(Boolean).join(' ');
    }
    var trim = $('vtr') && !$('vTrimWrap').hidden ? $('vtr').value : '';
    return [$('vyr').value, $('vmk').value, $('vmd').value, trim].filter(Boolean).join(' ');
  }
  // Trim only appears for makes where the answer changes the job — exposed carbon,
  // Alcantara, ceramic brakes, factory PPF. Asking a Camry owner for a trim is noise.
  function syncTrim(){
    var mk=$('vmk').value, md=$('vmd').value;
    var T=(window.TRIMS||{})[mk], sel=$('vtr'), wrap=$('vTrimWrap');
    if(!sel||!wrap) return;
    var show = !!(T && T.length && md && md!=='__other');
    // Rebuild on a change of make OR model — an STO must not follow you to a Urus.
    if(show && (sel.dataset.make!==mk || sel.dataset.model!==md)){
      sel.innerHTML=''; opt(sel,'','Not sure / standard');
      T.forEach(function(t){ opt(sel,t) });
      opt(sel,'__other','Something else — tell us below');
      sel.dataset.make=mk; sel.dataset.model=md; sel.value='';
    }
    wrap.hidden = !show;
    if(!show){ sel.value=''; sel.dataset.make=''; sel.dataset.model='' }
  }
  function syncVehicle(){
    syncTrim();
    syncYears();
    var other = ($('vmk').value==='Other' || $('vmd').value==='__other'
                 || (!$('vTrimWrap').hidden && $('vtr').value==='__other'));
    $('vOtherWrap').hidden = !other;
    if(!other) $('vOther').value='';
    $('bv').value = vehicleText();
  }
  var YR_MIN=1995, YR_MAX=new Date().getFullYear()+1;

  // Turn [[2015,2024],[2026,null]] into the set of years it covers.
  function yearsFrom(windows){
    var out={};
    (windows||[]).forEach(function(w){
      var a=Math.max(w[0], YR_MIN), b=Math.min(w[1]==null?YR_MAX:w[1], YR_MAX);
      for(var y=a; y<=b; y++) out[y]=1;
    });
    return out;
  }
  function allYears(){ var o={}; for(var y=YR_MIN;y<=YR_MAX;y++) o[y]=1; return o }

  // "1995–2001 and 2023 to now" — describe the real windows, gaps included.
  // A min-to-max label would quietly claim the Integra was sold every year since 1995.
  function describeRuns(ys){
    var runs=[], i=0;
    while(i<ys.length){
      var a=ys[i], b=a;
      while(i+1<ys.length && ys[i+1]===b+1){ b=ys[++i] }
      runs.push([a,b]); i++;
    }
    var parts=runs.map(function(r){
      if(r[1]>=YR_MAX) return r[0]+' to now';
      return r[0]===r[1] ? String(r[0]) : r[0]+'–'+r[1];
    });
    return parts.length<3
      ? parts.join(' and ')
      : parts.slice(0,-1).join(', ')+' and '+parts[parts.length-1];
  }

  /* Which years this exact car was sold. Model narrows it; trim narrows it further.
     If a trim window somehow misses the model window entirely, the model wins —
     better a year too many than blocking the car someone actually owns. */
  function allowedYears(){
    var mk=$('vmk').value, md=$('vmd').value, tr=$('vtr')?$('vtr').value:'';
    if(!mk || !md || md==='__other') return {set:allYears(), label:''};

    var mw=((window.MODEL_YEARS||{})[mk]||{})[md];
    var set = mw ? yearsFrom(mw) : allYears();

    // A trim can narrow a model that has no window of its own — a Corvette runs
    // every year, a Corvette Z06 does not.
    if(tr && tr!=='__other'){
      var tw=((window.TRIM_YEARS||{})[mk]||{})[tr];
      if(tw){
        var t=yearsFrom(tw), both={}, n=0;
        Object.keys(set).forEach(function(y){ if(t[y]){ both[y]=1; n++ } });
        if(n) set=both;   // empty intersection => keep the model window, never nothing
      }
    }
    var ys=Object.keys(set).map(Number).sort(function(a,b){return a-b});
    if(!ys.length) return {set:allYears(), label:''};
    if(ys.length >= (YR_MAX-YR_MIN+1)) return {set:set, label:''};
    var name=[md, (tr && tr!=='__other') ? tr : ''].filter(Boolean).join(' ');
    return {set:set, label:name+' — sold '+describeRuns(ys)};
  }

  function syncYears(){
    var yr=$('vyr'); if(!yr) return;
    var keep=yr.value, a=allowedYears();
    var ys=Object.keys(a.set).map(Number).sort(function(x,y){return y-x});
    var ready=!!($('vmk').value && $('vmd').value);
    yr.innerHTML=''; yr.disabled=!ready;
    if(!ready){ opt(yr,'','Pick a model first'); }
    else{
      opt(yr,'','Year');
      ys.forEach(function(y){ opt(yr,String(y)) });
      if(keep && a.set[keep]) yr.value=keep;
    }
    var n=$('yrNote');
    if(n){ n.hidden=!(ready && a.label); n.textContent=a.label; }
  }

  (function initVehicle(){
    var V=window.VEHICLES||{}, yr=$('vyr'), mk=$('vmk'), md=$('vmd');
    if(!yr||!mk||!md) return;
    Object.keys(V).forEach(function(m){ opt(mk, m) });

    mk.addEventListener('change', function(){
      md.innerHTML='';
      var list=V[mk.value]||[];
      if(!mk.value){ opt(md,'','Pick a make first'); md.disabled=true; syncVehicle(); return }
      md.disabled=false;
      opt(md,'', list.length?'Model':'Type it below');
      list.forEach(function(x){ opt(md,x) });
      if(list.length) opt(md,'__other','Not listed — type it');
      syncVehicle();
    });
    [yr,md,$('vtr')].forEach(function(el){ if(el) el.addEventListener('change', syncVehicle) });
    $('vOther').addEventListener('input', syncVehicle);
    syncYears();
  })();

  (function initTowns(){
    var T=window.TOWNS||{}, sel=$('btw'); if(!sel) return;
    Object.keys(T).forEach(function(region){
      var g=document.createElement('optgroup'); g.label=region;
      T[region].forEach(function(t){
        var o=document.createElement('option'); o.value=t; o.textContent=t; g.appendChild(o);
      });
      sel.appendChild(g);
    });
    var g2=document.createElement('optgroup'); g2.label='Not on the list';
    var o2=document.createElement('option'); o2.value='__ask';
    o2.textContent='My town is not listed'; g2.appendChild(o2); sel.appendChild(g2);

    sel.addEventListener('change', function(){
      var n=$('areaNote'), edge=(sel.value==='__ask');
      n.hidden=!edge; n.classList.toggle('warn', edge);
      if(edge) n.textContent='Not a problem — call (203) 592-9589 and we will tell you '
        + 'straight away whether we can reach you. Close to the edge usually works.';
    });
  })();

  /* --------------------------------- deep links from the marketing sections */
  document.addEventListener('click',function(ev){
    var a=ev.target.closest('[data-pre]'); if(!a) return;
    var k=a.dataset.pre;
    if(SVC[k]){
      var d=document.querySelector('#svc .door[data-key="'+k+'"]');
      if(d){ d.click(); show(1) }
      return;
    }
    if(PAINT[k]){
      // Paint work lives at step 3. Someone arriving from the restoration menu
      // has already made the decision, so take them straight to it.
      var full=document.querySelector('#svc .door[data-key="full"]'); if(full) full.click();
      var c=document.querySelector('#paint .pcard[data-paint="'+k+'"]'); if(c){ c.click(); show(3) }
    }
  });

  /* ------------------------------------------------------- step 4: when */
  $('win').addEventListener('click',function(ev){
    var b=ev.target.closest('.opt'); if(!b) return;
    $$('#win .opt').forEach(function(o){o.classList.remove('sel')});
    b.classList.add('sel'); S.win=b.dataset.win;
  });

  var DAY=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  (function(){
    var box=$('dates'); if(!box) return;
    var d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+2);
    var made=0;
    while(made<24){
      if(d.getDay()!==0){
        var b=document.createElement('button');
        b.type='button'; b.className='dt'; b.dataset.iso=d.toDateString();
        b.innerHTML='<em>'+DAY[d.getDay()]+'</em><b>'+d.getDate()+'</b><i>'+MON[d.getMonth()]+'</i>';
        box.appendChild(b); made++;
      }
      d.setDate(d.getDate()+1);
    }
    box.addEventListener('click',function(ev){
      var b=ev.target.closest('.dt'); if(!b) return;
      box.querySelectorAll('.dt').forEach(function(o){o.classList.remove('sel')});
      b.classList.add('sel'); S.date=b.dataset.iso; $('e3').style.display='none';
    });
  })();

  /* -------------------------------------------------------------- navigation */
  function show(n){
    $$('.pane').forEach(function(p){p.classList.toggle('on',p.dataset.p==String(n))});
    $$('.sb').forEach(function(x){
      var i=+x.dataset.sb; x.classList.toggle('on',i===n); x.classList.toggle('done',i<n);
    });
    document.querySelector('.bk').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function where(){ return esc($('bad').value)+', '+esc($('btw').value)+', CT' }

  function addsText(){
    var list=activeAdds();
    if(!list.length) return '';
    if(bundled(list)){
      list=list.filter(function(k){return k!=='iron'&&k!=='clay'});
      list.push('__bundle');
    }
    return list.map(function(k){
      return k==='__bundle' ? 'Iron decon + clay' : addLabel(k);
    }).join(', ');
  }
  function svcLabel(){
    return svc().name + (S.paint ? ' + '+PAINT[S.paint].name : '');
  }
  function fill(sfx){
    var when = S.date ? S.date+' · '+S.win : '—';
    var v = S.size + ($('bv').value ? ' · '+esc($('bv').value) : '');
    var adds = addsText();
    var m={'1':svcLabel(),'2':v,'3':when,'4':totalText(),'5':where(),
           '6':'$'+deposit()+' refundable','7':adds||'Nothing added'};
    for(var k in m){ var el=$(sfx+k); if(el) el.textContent=m[k] }
    var row=$(sfx+'7row'); if(row) row.style.display = adds ? '' : 'none';
    if($(sfx+'0')) $(sfx+'0').textContent=S.ref;
  }

  function digits(v){ return String(v).replace(/\D/g,'') }
  function bad(el,ok){ el.style.borderColor = ok ? '' : '#F87171'; return ok }

  function validWhere(){
    var ok=!!S.date;
    ok = bad($('btw'), $('btw').value.trim().length>1 && $('btw').value!=='__ask') && ok;
    ok = bad($('bad'), $('bad').value.trim().length>3) && ok;
    return ok;
  }
  function validWho(){
    var ok=true;
    ok = bad($('bnm'), $('bnm').value.trim().length>1) && ok;
    ok = bad($('bph'), digits($('bph').value).length===10) && ok;
    var em=$('bem'), ev=em.value.trim();
    ok = bad(em, !ev || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ev)) && ok;
    return ok;
  }

  document.addEventListener('click',function(ev){
    var b=ev.target.closest('[data-go]'); if(!b) return;
    var n=+b.dataset.go;
    if(n===5){
      if(!validWhere()){ $('e3').style.display='block'; return }
      $('e3').style.display='none'; paint(); fill('s'); fill('b');
    }
    if(n===1){ S.date=null; $$('.dt').forEach(function(o){o.classList.remove('sel')}) }
    show(n);
  });

  /* ------------------------------------------------------------- submission */
  function makeRef(){
    var t=Date.now().toString(36).toUpperCase().slice(-5);
    var r='ABCDEFGHJKLMNPQRSTUVWXYZ23456789', x='';
    for(var i=0;i<2;i++) x+=r[Math.floor(Math.random()*r.length)];
    return 'CAL-'+t+x;
  }
  function summary(){
    var NL='\n', adds=addsText();
    return 'BOOKING REQUEST — Cipher Auto Lab'+NL
      +'Reference: '+S.ref+NL+NL
      +'Service: '+svc().name+' ('+TIERNAME[S.tier]+') — '+money(svc().p[S.tier])+NL
      +(adds ? 'Add-ons: '+adds+' — +'+money(addTotal())+NL : '')
      +(S.paint ? 'Paint work: '+PAINT[S.paint].name+' — +'+money(paintPrice())
                  +(overlap()?' (less '+money(overlap())+' exterior already included)':'')+NL : '')
      +'Vehicle: '+S.size+($('bv').value?' — '+esc($('bv').value):'')+NL
      +'Condition: '+$('bc').value+NL
      +'Parked: '+$('bk2').value+NL
      +'Requested: '+S.date+' · '+S.win+NL+NL
      +'Estimated total: '+totalText()+NL
      +'Deposit PAID: $'+deposit()+' (refundable, comes off total)'+NL
      +'Balance after walk-around: '+money(bal())+NL+NL
      +'Name: '+esc($('bnm').value)+NL
      +'Phone: '+esc($('bph').value)+NL
      +'Email: '+esc($('bem').value)+NL
      +'Address: '+where()+NL+NL
      +'Notes: '+esc($('bn').value)+NL+NL
      +'TERMS ACCEPTED BY CUSTOMER:'+NL
      +'- Deposit refunded in full with 24h notice, on our reschedule, or if a re-quote is declined.'+NL
      +'- Deposit forfeited only for same-day cancellation or no-show.'+NL
      +'- Price changes only with customer approval, before work starts.'+NL
      +NL+'SIGNED: '+S.sig+' — Service Agreement v'+AGREEMENT_VERSION+' — '+S.signedAt+NL
      +'Photo consent: '+(S.photoOk?'yes':'no')+NL;
  }

  var stripe=null, elements=null, paying=false;

  function payFail(msg){
    var e=$('e6'); e.textContent = msg || 'Payment could not be completed. Nothing has been charged — try again or call us.';
    e.style.display='block';
  }

  async function startPayment(){
    $('payAmt').textContent='$'+deposit();
    $('payBal').textContent=money(bal());
    $('e6').style.display='none';
    $('payLoading').style.display='flex';

    if(!window.Stripe || !window.STRIPE_PK || /REPLACE_ME/.test(window.STRIPE_PK)){
      $('payLoading').style.display='none';
      payFail('Card payments are not switched on yet. Call or text (203) 592-9589 and we will hold the slot.');
      return;
    }
    try{
      var r = await fetch('/api/create-payment-intent',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          packageKey:S.key, paintKey:S.paint, tier:S.tier, addons:activeAdds().join(','),
          ref:S.ref,
          name:$('bnm').value, phone:$('bph').value, email:$('bem').value,
          vehicle:$('bv').value, size:S.size, condition:$('bc').value, parked:$('bk2').value,
          date:S.date, window:S.win, address:$('bad').value, town:$('btw').value,
          notes:$('bn').value, estTotal:totalText(),
          agreementVersion:AGREEMENT_VERSION, signature:S.sig, signedAt:S.signedAt,
          photoConsent:S.photoOk?'yes':'no'
        })
      });
      var data = await r.json();
      if(!r.ok || !data.clientSecret){ throw new Error(data.error||'setup failed') }
      // The Job Card link is derived from the reference server-side, so it comes
      // back with the payment setup and can be shown the moment the card clears.
      S.jobUrl = data.jobUrl || '';

      stripe = Stripe(window.STRIPE_PK);
      elements = stripe.elements({
        clientSecret: data.clientSecret,
        appearance: { theme:'night', variables:{
          colorPrimary:'#A3E635', colorBackground:'#0B0E12', colorText:'#F0F4F8',
          colorDanger:'#F87171', fontFamily:'system-ui, sans-serif', borderRadius:'7px'
        }}
      });
      elements.create('payment',{layout:'tabs'}).mount('#payment-element');
      $('payLoading').style.display='none';
    }catch(err){
      $('payLoading').style.display='none';
      payFail(err && err.message ? 'Could not start payment: '+err.message : null);
    }
  }

  $('payBtn').addEventListener('click', async function(){
    if(paying || !elements) return;
    paying=true; this.textContent='Processing…'; $('e6').style.display='none';
    try{
      // redirect:'if_required' keeps card payments entirely on this page
      var res = await stripe.confirmPayment({ elements, redirect:'if_required' });
      if(res.error){ throw new Error(res.error.message) }
      var pi = res.paymentIntent;
      if(pi && (pi.status==='succeeded' || pi.status==='processing')){
        fill('f');
        var box=$('jobBox');
        if(box && S.jobUrl){
          $('jobLink').href=S.jobUrl;
          $('jobTown').textContent=esc($('btw').value)||'your town';
          box.hidden=false;
        }
        show(7);
      } else {
        throw new Error('Payment did not complete.');
      }
    }catch(err){
      payFail(err && err.message);
    }finally{
      paying=false; this.textContent='Pay deposit & book';
    }
  });

  $('submitBk').addEventListener('click',function(){
    if($('hp').value){ return }
    if(!validWho()){ $('e4').style.display='block'; return }
    $('e4').style.display='none';
    if(!validWhere()){ show(4); $('e3').style.display='block'; return }
    var sigEl=$('sig'), sigVal=(sigEl&&sigEl.value||'').trim();
    var okAgree=$('agree').checked;
    // a signature has to look like a name, not a keyboard mash or a single initial
    var okSig=sigVal.length>=3 && /^[A-Za-z][A-Za-z .'’-]*[A-Za-z.]$/.test(sigVal) && /\s/.test(sigVal);
    if(!okAgree || !okSig){
      $('e5').style.display='block';
      $('agreeBox').classList.toggle('bad', !okAgree);
      if(sigEl) sigEl.classList.toggle('bad', !okSig);
      (okAgree && sigEl ? sigEl : $('agreeBox')).focus();
      return;
    }
    $('e5').style.display='none'; $('agreeBox').classList.remove('bad'); sigEl.classList.remove('bad');
    S.sig=esc(sigVal).slice(0,80);
    S.signedAt=new Date().toISOString();
    S.photoOk=!!($('photoOk')&&$('photoOk').checked);
    S.ref=makeRef();
    var body=summary();
    $('refCode').textContent=S.ref;
    $('sendSms').href='sms:+12035929589?&body='+encodeURIComponent(body);
    $('sendMail').href='mailto:hello@cipherautolab.com?subject='
      +encodeURIComponent('Booking '+S.ref+' — '+svcLabel()+' — '+S.date)+'&body='+encodeURIComponent(body);
    show(6);
    startPayment();
  });
  $('agree').addEventListener('change',function(){
    if(this.checked){ $('agreeBox').classList.remove('bad'); if($('sig').value.trim()) $('e5').style.display='none' }
  });
  $('sig').addEventListener('input',function(){
    if(this.value.trim().length>=3){ this.classList.remove('bad'); if($('agree').checked) $('e5').style.display='none' }
  });
  paint();
})();
