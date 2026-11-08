(function(){
  // Bump AGREEMENT_VERSION whenever agreement.html changes materially. It is stored on
  // every booking so you can always prove which wording the customer actually signed.
  var AGREEMENT_VERSION='1.0';

  /* ------------------------------------------------------------------ prices
     Four tiers, because interior labour scales with seats and exterior labour
     scales with panel area — different curves. These must stay in step with the
     table in index.html, the server copy in api/_booking.js and the
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
      var n=$('areaNote'), v=sel.value, edge=(v==='__ask');
      n.hidden=!v; n.classList.toggle('warn', edge);
      if(edge){
        n.textContent='Not a problem. Call or text (203) 560-3572 and we will tell you '
          + 'straight away whether we can reach you. Close to the edge usually works.';
      } else if(v){
        n.innerHTML='';
        var b=document.createElement('b'); b.textContent='We come to '+v+'. ';
        n.appendChild(b);
        n.appendChild(document.createTextNode('If a travel fee applies there, we text it to you '
          + 'before your slot is confirmed. It is never added afterwards.'));
      }
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
        if(made>=12) b.hidden=true;
        b.innerHTML='<em>'+DAY[d.getDay()]+'</em><b>'+d.getDate()+'</b><i>'+MON[d.getMonth()]+'</i>';
        box.appendChild(b); made++;
      }
      d.setDate(d.getDate()+1);
    }
    var more=$('moreDates');
    if(more){
      more.hidden=false;
      more.addEventListener('click',function(){
        box.querySelectorAll('.dt[hidden]').forEach(function(o){ o.hidden=false });
        more.hidden=true;
      });
    }
    box.addEventListener('click',function(ev){
      var b=ev.target.closest('.dt'); if(!b) return;
      box.querySelectorAll('.dt').forEach(function(o){o.classList.remove('sel')});
      b.classList.add('sel'); S.date=b.dataset.iso; box.classList.remove('bad'); recheckWhere();
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
  function where(){ return esc($('bad').value)+', '+esc($('btw').value)+', CT '+esc($('bzip').value) }

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
  function phone10(v){ var d=digits(v); return d.length===11 && d.charAt(0)==='1' ? d.slice(1) : d }
  function bad(el,ok){ el.style.borderColor = ok ? '' : '#F87171'; return ok }
  function firstGap(){
    var el = !S.date ? $('dates') : ['bad','btw','bzip'].map($).filter(function(x){ return x.style.borderColor })[0];
    if(!el) return;
    el.scrollIntoView({behavior:'smooth',block:'center'});
    if(el.focus && el.id!=='dates') el.focus({preventScroll:true});
  }

  function whereGaps(){
    var gaps=[];
    if(!S.date) gaps.push('pick a day');
    if($('bad').value.trim().length<=3) gaps.push('add the street address');
    var t=$('btw').value;
    if(t==='__ask') gaps.push('call us about your town');
    else if(t.trim().length<=1) gaps.push('choose your town');
    var z=$('bzip').value.trim();
    if(!/^06\d{3}$/.test(z)) gaps.push(z ? 'check the ZIP (Connecticut ZIPs start 06)' : 'add the ZIP');
    return gaps;
  }
  function validWhere(){
    var ok=!!S.date;
    var dbox=$('dates'); if(dbox) dbox.classList.toggle('bad', !S.date);
    ok = bad($('btw'), $('btw').value.trim().length>1 && $('btw').value!=='__ask') && ok;
    ok = bad($('bad'), $('bad').value.trim().length>3) && ok;
    ok = bad($('bzip'), /^06\d{3}$/.test($('bzip').value.trim())) && ok;
    var e3=$('e3'), gaps=whereGaps();
    if(e3 && gaps.length){
      var m=gaps.join(', '); e3.textContent='To continue, '+m.replace(/, ([^,]*)$/,' and $1')+'.';
    }
    return ok;
  }
  // once an error is showing, it updates as each field is fixed
  function recheckWhere(){
    var e3=$('e3'); if(!e3 || e3.style.display!=='block') return;
    if(validWhere()) e3.style.display='none';
  }
  ['bad','btw','bzip'].forEach(function(id){
    var el=$(id); if(!el) return;
    el.addEventListener(id==='btw'?'change':'input', recheckWhere);
  });
  (function(){
    var z=$('bzip'); if(!z) return;
    z.addEventListener('input',function(){
      var v=z.value.replace(/\D/g,'').slice(0,5); if(v!==z.value) z.value=v;
    });
  })();
  function validWho(){
    var ok=true;
    ok = bad($('bnm'), $('bnm').value.trim().length>1) && ok;
    ok = bad($('bph'), phone10($('bph').value).length===10) && ok;
    var em=$('bem'), ev=em.value.trim();
    ok = bad(em, (!ev && !cardsOn()) || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ev)) && ok;
    return ok;
  }
  function whoMessage(){
    var n=$('bnm').value.trim().length>1, p=phone10($('bph').value).length===10;
    var ev=$('bem').value.trim(), e=(!ev && !cardsOn()) || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ev);
    if(!n && !p) return 'Enter your name and a 10-digit phone number.';
    if(!n) return 'Enter your name.';
    if(!p) return 'That phone number needs 10 digits, like (203) 555-0100.';
    if(!e) return cardsOn() ? (ev ? 'That email doesn\u2019t look right.' : 'Add your email so the deposit receipt reaches you.')
                            : 'That email doesn\u2019t look right. It\u2019s optional, so you can also leave it blank.';
    return '';
  }
  // fix-as-you-type: the error and red borders clear as soon as the fields are right
  ['bnm','bph','bem'].forEach(function(id){
    var el=$(id); if(!el) return;
    ['input','change'].forEach(function(ev){ el.addEventListener(ev, function(){
      if($('e4').style.display!=='block') return;
      if(validWho()){ $('e4').style.display='none'; if(/^Check your details/.test($('e5').textContent)) $('e5').style.display='none' } else { $('e4').textContent=whoMessage() }
    }) });
  });

  document.addEventListener('click',function(ev){
    var b=ev.target.closest('[data-go]'); if(!b) return;
    var n=+b.dataset.go;
    if(n===5){
      if(!validWhere()){ $('e3').style.display='block'; firstGap(); return }
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
  function cardsOn(){ return !!(window.Stripe && window.STRIPE_PK && !/REPLACE_ME/.test(window.STRIPE_PK)); }

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
      +'Travel fee: by town, confirmed by text before the slot is held'+NL
      +(cardsOn() ? 'Deposit PAID: $'+deposit()+' (refundable, comes off total)'
                  : 'Deposit: none taken online — please hold the slot by text')+NL
      +(cardsOn() ? 'Balance after walk-around: '+money(bal())+NL+NL : NL)
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

  var paying=false;

  // Until online card deposits are switched on, the last step sends the booking by text
  // (already written out in the sendSms link) and nothing is charged.
  function textToHold(){
    var wrap=$('payWrap'), safe=document.querySelector('.paysafe'), btn=$('payBtn'), sms=$('sendSms');
    var head=document.querySelector('.payhead');
    if(wrap) wrap.hidden=true;
    if(safe) safe.hidden=true;
    if(head) head.hidden=true;
    var note=$('payNote');
    if(!note){
      note=document.createElement('p'); note.id='payNote'; note.className='paynote';
      wrap.parentNode.insertBefore(note, wrap);
    }
    var sub=wrap.parentNode.querySelector('.qs');
    if(sub) sub.textContent='No deposit online yet. We hold your slot by text.';
    note.textContent='Your booking is already typed out. Send it and we reply with your arrival '
      + 'window. Nothing is charged today.';
    if(btn && sms){
      btn.textContent='Text my booking';
      btn.addEventListener('click', function(){ window.location.href = sms.href; });
    }
  }

  function payFail(msg){
    var e=$('e6'); e.textContent = msg || 'Payment could not be completed. Nothing has been charged — try again or call us.';
    e.style.display='block';
  }

  // Card deposits: a Stripe Checkout Session in "elements" mode, mounted by js/deposit.js
  // inside our own deposit step; card details go to Stripe only.
  var payUI=null;

  function remember(){
    // kept for this tab only, so the page can show the booking again if a payment app sends
    // the customer away and back
    try{ sessionStorage.setItem('cal_booking', JSON.stringify({
      ref:S.ref, sms:$('sendSms').href, mail:$('sendMail').href,
      f:['1','2','3','4','5','6','7'].map(function(k){ var el=$('f'+k); return el?el.textContent:'' })
    })) }catch(e){}
  }

  function booked(){
    fill('f');
    var f6=$('f6'); if(f6) f6.textContent='$'+deposit()+' paid';
    show(7);
  }

  async function startPayment(){
    $('payAmt').textContent='$'+deposit();
    $('payBal').textContent=money(bal());
    $('e6').style.display='none';
    $('payLoading').style.display='flex';

    if(!cardsOn()){
      $('payLoading').style.display='none';
      textToHold();
      return;
    }
    try{
      var r = await fetch('/api/create-checkout-session',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          packageKey:S.key, paintKey:S.paint, tier:S.tier, addons:activeAdds().join(','),
          ref:S.ref,
          name:$('bnm').value, phone:$('bph').value, email:$('bem').value,
          vehicle:$('bv').value, size:S.size, condition:$('bc').value, parked:$('bk2').value,
          date:S.date, window:S.win, address:$('bad').value, town:$('btw').value, zip:$('bzip').value,
          notes:$('bn').value, estTotal:totalText(),
          agreementVersion:AGREEMENT_VERSION, signature:S.sig, signedAt:S.signedAt,
          photoConsent:S.photoOk?'yes':'no'
        })
      });
      var data = {};
      try{ data = await r.json() }catch(e){}
      if(r.status===503){ $('payLoading').style.display='none'; textToHold(); return; }
      if(!r.ok || !data.clientSecret){ throw new Error(data.error||'setup failed') }

      fill('f'); remember();
      // Apple Pay / Google Pay first, card and Cash App Pay below (js/deposit.js)
      payUI = window.CALDeposit.mount({
        clientSecret:data.clientSecret, express:'#express-checkout', payment:'#payment-element', theme:'dark',
        onAmount:function(t){ $('payAmt').textContent=t },
        onCanPay:function(ok){ $('payBtn').disabled=!ok },
        onWallets:function(any){ var sep=$('paySep'); if(sep) sep.hidden=!any },
        onPaid:booked,
        onError:function(m){ payFail(m) }
      });
      await payUI.ready;
      $('payLoading').style.display='none';
    }catch(err){
      $('payLoading').style.display='none';
      payFail(err && err.message ? 'Could not start payment: '+err.message : null);
    }
  }

  $('payBtn').addEventListener('click', async function(){
    if(paying || !payUI) return;
    var btn=this;
    paying=true; btn.textContent='Processing…'; $('e6').style.display='none';
    // stays on this page for cards; only payment apps that need to leave come back to /quote?paid=1
    try{ await payUI.pay() }finally{ paying=false; btn.textContent='Pay deposit & book' }
  });

  // back from a payment app: ask the server whether the deposit went through
  (async function returning(){
    var q=new URLSearchParams(location.search), id=q.get('session_id');
    if(q.get('paid')!=='1' || !id) return;
    var saved={}; try{ saved=JSON.parse(sessionStorage.getItem('cal_booking')||'{}') }catch(e){}
    try{
      var r=await fetch('/api/checkout-status?session_id='+encodeURIComponent(id));
      var d=await r.json();
      if(r.ok && d.status==='complete'){
        $('refCode').textContent=d.ref||saved.ref||'';
        if(saved.sms) $('sendSms').href=saved.sms;
        if(saved.mail) $('sendMail').href=saved.mail;
        (saved.f||[]).forEach(function(v,i){ var el=$('f'+(i+1)); if(el && v) el.textContent=v });
        if($('f0')) $('f0').textContent=d.ref||saved.ref||'';
        if($('f6') && d.amount) $('f6').textContent='$'+d.amount+' paid';
        show(7);
      } else {
        var p1=document.querySelector('.pane[data-p="1"]'), n=document.createElement('p');
        n.className='paynote';
        n.textContent='That payment didn’t go through, so nothing was charged. Start the booking again, or call or text (203) 560-3572.';
        if(p1) p1.insertBefore(n, p1.firstChild);
        show(1);
      }
    }catch(e){}
    history.replaceState(null,'',location.pathname+'#quote');
  })();

  $('submitBk').addEventListener('click',function(){
    if(!validWho()){
      var e4=$('e4'); e4.textContent=whoMessage(); e4.style.display='block';
      $('e5').textContent='Check your details at the top of this step: '+whoMessage().replace(/^./,function(c){return c.toLowerCase()});
      $('e5').style.display='block';
      var first=['bnm','bph','bem'].map($).filter(function(el){ return el.style.borderColor })[0] || $('bnm');
      first.scrollIntoView({behavior:'smooth',block:'center'}); first.focus({preventScroll:true});
      return;
    }
    $('e4').style.display='none';
    if(!validWhere()){ show(4); $('e3').style.display='block'; setTimeout(firstGap,350); return }
    var sigEl=$('sig'), sigVal=(sigEl&&sigEl.value||'').trim();
    var okAgree=$('agree').checked;
    // a signature has to look like a name, not a keyboard mash or a single initial
    var okSig=sigVal.length>=3 && /^[A-Za-z][A-Za-z .'’-]*[A-Za-z.]$/.test(sigVal) && /\s/.test(sigVal);
    if(!okAgree || !okSig){
      $('e5').textContent = !okAgree && !okSig ? 'Tick the box to agree, and type your full name to sign.'
        : !okAgree ? 'Tick the box to agree to the Service Agreement.'
        : 'Type your first and last name to sign.';
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
    // whatever happens while writing the summary, the customer still moves on to the deposit
    try{
      var body=summary();
      $('refCode').textContent=S.ref;
      $('sendSms').href='sms:+12035603572?&body='+encodeURIComponent(body);
      $('sendMail').href='mailto:hello@cipherautolab.com?subject='
        +encodeURIComponent('Booking '+S.ref+' — '+svcLabel()+' — '+S.date)+'&body='+encodeURIComponent(body);
    }catch(err){ if(window.console) console.error('booking summary', err) }
    show(6);
    startPayment();
  });
  $('agree').addEventListener('change',function(){
    if(this.checked){ $('agreeBox').classList.remove('bad'); if($('sig').value.trim()) $('e5').style.display='none' }
  });
  $('sig').addEventListener('input',function(){
    if(this.value.trim().length>=3){ this.classList.remove('bad'); if($('agree').checked) $('e5').style.display='none' }
  });
  if(cardsOn()){ var lb=document.querySelector('label[for="bem"]'); if(lb) lb.textContent='Email (for your receipt)'; }
  else if($('lockNote')){ $('lockNote').textContent='Nothing is charged online. Next you send us the booking by text and we confirm your slot.'; }
  paint();
})();
