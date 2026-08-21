(function(){
  var S={svc:'Full Detail',key:'full-detail',base:279,dep:40,addon:0,size:'Sedan / coupe',mult:1,date:null,win:'Morning · 8–11am',ref:''};
  var $=function(id){return document.getElementById(id)};
  // strip control characters so nothing odd can ride along into an sms:/mailto: payload
  var esc=function(v){return String(v==null?'':v).replace(/[\u0000-\u001F\u007F]/g,' ').slice(0,300)};
  var money=function(n){return '$'+(Math.round(n/5)*5).toLocaleString()};
  function total(){ return Math.round(S.base*S.mult/5)*5 + (S.addon||0) }
  function bal(){ return Math.max(0, total()-S.dep) }

  function paint(){
    $('est').textContent=money(total());
    if($('depInline')) $('depInline').textContent='$'+S.dep;
    if($('depVal')){ $('depVal').textContent='$'+S.dep; $('balVal').textContent=money(bal()) }
  }
  function pick(wrap, fn){
    var box=$(wrap); if(!box) return;
    box.addEventListener('click',function(ev){
      var b=ev.target.closest('.opt'); if(!b) return;
      box.querySelectorAll('.opt').forEach(function(o){o.classList.remove('sel')});
      b.classList.add('sel'); fn(b); paint();
    });
  }
  function clearAllSvc(){
    ['svc','svc2'].forEach(function(id){
      var box=$(id); if(box) box.querySelectorAll('.opt').forEach(function(o){o.classList.remove('sel')});
    });
  }
  function bindSvc(id){
    var box=$(id); if(!box) return;
    box.addEventListener('click',function(ev){
      var b=ev.target.closest('.opt'); if(!b) return;
      clearAllSvc(); b.classList.add('sel');
      S.svc=b.dataset.svc; S.base=+b.dataset.base; S.dep=+b.dataset.dep; S.key=b.dataset.key;
      $('leadnote').textContent = (S.key==='show')
        ? 'Show Finish runs over two days — pick the first and we will confirm the second.'
        : 'Mon–Sat, from two days out. Sundays by request only.';
      paint();
    });
  }
  bindSvc('svc'); bindSvc('svc2');

  var hl=$('hlToggle');
  if(hl) hl.addEventListener('click',function(){
    this.classList.toggle('sel');
    S.addon = this.classList.contains('sel') ? +this.dataset.addon : 0;
    paint();
  });

  document.addEventListener('click',function(ev){
    var a=ev.target.closest('[data-pre]'); if(!a) return;
    var btn=document.querySelector('.opt[data-key="'+a.dataset.pre+'"]');
    if(btn){ btn.click(); show(1) }
  });

  pick('size',function(b){ S.size=b.dataset.size; S.mult=+b.dataset.mult });
  pick('win', function(b){ S.win=b.dataset.win });

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

  function show(n){
    document.querySelectorAll('.pane').forEach(function(p){p.classList.toggle('on',p.dataset.p==String(n))});
    document.querySelectorAll('.sb').forEach(function(x){
      var i=+x.dataset.sb; x.classList.toggle('on',i===n); x.classList.toggle('done',i<n);
    });
    document.querySelector('.bk').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function where(){ return esc($('bad').value)+', '+esc($('btw').value)+', CT' }
  function fill(sfx){
    var when = S.date ? S.date+' · '+S.win : '—';
    var v = S.size + ($('bv').value ? ' · '+esc($('bv').value) : '');
    var svcLabel = S.svc + (S.addon ? ' + headlights' : '');
    var m={'1':svcLabel,'2':v,'3':when,'4':money(total())+' estimated','5':where(),'6':'$'+S.dep+' refundable'};
    for(var k in m){ var el=$(sfx+k); if(el) el.textContent=m[k] }
    if($(sfx+'0')) $(sfx+'0').textContent=S.ref;
  }

  function digits(v){ return String(v).replace(/\D/g,'') }
  function validStep4(){
    var ok=true;
    var checks=[['bnm',function(v){return v.trim().length>1}],
                ['bph',function(v){return digits(v).length===10}],
                ['btw',function(v){return v.trim().length>1}],
                ['bad',function(v){return v.trim().length>3}]];
    checks.forEach(function(p){
      var el=$(p[0]);
      if(!p[1](el.value)){ el.style.borderColor='#F87171'; ok=false } else { el.style.borderColor='' }
    });
    var em=$('bem');
    if(em.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em.value.trim())){ em.style.borderColor='#F87171'; ok=false }
    else { em.style.borderColor='' }
    return ok;
  }

  document.addEventListener('click',function(ev){
    var b=ev.target.closest('[data-go]'); if(!b) return;
    var n=+b.dataset.go;
    if(n===4 && !S.date){ $('e3').style.display='block'; return }
    if(n===5){
      if(!validStep4()){ $('e4').style.display='block'; return }
      $('e4').style.display='none'; paint(); fill('s'); fill('b');
    }
    if(n===1){ S.date=null; document.querySelectorAll('.dt').forEach(function(o){o.classList.remove('sel')}) }
    show(n);
  });

  function makeRef(){
    var t=Date.now().toString(36).toUpperCase().slice(-5);
    var r='ABCDEFGHJKLMNPQRSTUVWXYZ23456789', x='';
    for(var i=0;i<2;i++) x+=r[Math.floor(Math.random()*r.length)];
    return 'CAL-'+t+x;
  }
  function summary(){
    var NL='\n';
    return 'BOOKING REQUEST — Cipher Auto Lab'+NL
      +'Reference: '+S.ref+NL+NL
      +'Service: '+S.svc+(S.addon?' + headlight restoration (+$'+S.addon+')':'')+NL
      +'Vehicle: '+S.size+($('bv').value?' — '+esc($('bv').value):'')+NL
      +'Condition: '+$('bc').value+NL
      +'Parked: '+$('bk2').value+NL
      +'Requested: '+S.date+' · '+S.win+NL+NL
      +'Estimated total: '+money(total())+NL
      +'Deposit PAID: $'+S.dep+' (refundable, comes off total)'+NL
      +'Balance after walk-around: '+money(bal())+NL+NL
      +'Name: '+esc($('bnm').value)+NL
      +'Phone: '+esc($('bph').value)+NL
      +'Email: '+esc($('bem').value)+NL
      +'Address: '+where()+NL+NL
      +'Notes: '+esc($('bn').value)+NL+NL
      +'TERMS ACCEPTED BY CUSTOMER:'+NL
      +'- Deposit refunded in full with 24h notice, on our reschedule, or if a re-quote is declined.'+NL
      +'- Deposit forfeited only for same-day cancellation or no-show.'+NL
      +'- Price changes only with customer approval, before work starts.'+NL;
  }

  var stripe=null, elements=null, paying=false;

  function payFail(msg){
    var e=$('e6'); e.textContent = msg || 'Payment could not be completed. Nothing has been charged — try again or call us.';
    e.style.display='block';
  }

  async function startPayment(){
    $('payAmt').textContent='$'+S.dep;
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
          packageKey:S.key, addon:(S.addon?1:0), ref:S.ref,
          name:$('bnm').value, phone:$('bph').value, email:$('bem').value,
          vehicle:$('bv').value, size:S.size, condition:$('bc').value, parked:$('bk2').value,
          date:S.date, window:S.win, address:$('bad').value, town:$('btw').value,
          notes:$('bn').value, estTotal:money(total())
        })
      });
      var data = await r.json();
      if(!r.ok || !data.clientSecret){ throw new Error(data.error||'setup failed') }

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
        fill('f'); show(7);
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
    if(!validStep4()){ show(4); $('e4').style.display='block'; return }
    if(!$('agree').checked){ $('e5').style.display='block'; $('agreeBox').classList.add('bad'); return }
    $('e5').style.display='none'; $('agreeBox').classList.remove('bad');
    S.ref=makeRef();
    var body=summary();
    $('refCode').textContent=S.ref;
    $('sendSms').href='sms:+12035929589?&body='+encodeURIComponent(body);
    $('sendMail').href='mailto:hello@cipherautolab.com?subject='
      +encodeURIComponent('Booking '+S.ref+' — '+S.svc+' — '+S.date)+'&body='+encodeURIComponent(body);
    show(6);
    startPayment();
  });
  $('agree').addEventListener('change',function(){
    if(this.checked){ $('e5').style.display='none'; $('agreeBox').classList.remove('bad') }
  });
  paint();
})();
