/* Photo quote — the top of the funnel.
 *
 * Photos are downscaled in the browser before they are sent. Two reasons that
 * matters: a Vercel function will not accept a 4.5 MB request body, and a modern
 * phone photo is 3-6 MB each, so an unresized set of four would fail every time.
 * 1600px on the long edge is more than enough to see swirls and stains.
 *
 * Nothing here is inline — the site runs a CSP with no 'unsafe-inline'.
 */
(function(){
  var form=document.getElementById('pqForm');
  if(!form) return;

  var MAX_FILES=6, MAX_EDGE=1600, JPEG_Q=0.72, MAX_BYTES=3400000; // total, after resize

  var $=function(id){return document.getElementById(id)};
  var input=$('pqFiles'), drop=$('pqDrop'), thumbs=$('pqThumbs'), err=$('pqErr'),
      send=$('pqSend'), lead=$('pqDropLead');
  var shots=[];   // [{name, dataUrl, bytes}]

  function fail(msg){ err.textContent=msg; err.hidden=false }
  function clearFail(){ err.hidden=true }
  function kb(n){ return n<1024000 ? Math.round(n/1024)+' KB' : (n/1048576).toFixed(1)+' MB' }
  function totalBytes(){ return shots.reduce(function(a,s){return a+s.bytes},0) }

  /* ---------------------------------------------------------------- resizing */
  // createImageBitmap honours the EXIF orientation flag, which matters a lot:
  // without it, every photo taken in portrait arrives at us lying on its side.
  function loadBitmap(file){
    if(window.createImageBitmap){
      try{ return createImageBitmap(file,{imageOrientation:'from-image'}) }catch(e){}
    }
    return new Promise(function(res,rej){
      var url=URL.createObjectURL(file), img=new Image();
      img.onload=function(){ URL.revokeObjectURL(url); res(img) };
      img.onerror=function(){ URL.revokeObjectURL(url); rej(new Error('unreadable')) };
      img.src=url;
    });
  }

  async function shrink(file){
    var bmp=await loadBitmap(file);
    var w=bmp.width, h=bmp.height, scale=Math.min(1, MAX_EDGE/Math.max(w,h));
    var cw=Math.max(1,Math.round(w*scale)), ch=Math.max(1,Math.round(h*scale));
    var c=document.createElement('canvas'); c.width=cw; c.height=ch;
    c.getContext('2d').drawImage(bmp,0,0,cw,ch);
    if(bmp.close) bmp.close();
    var url=c.toDataURL('image/jpeg',JPEG_Q);
    return {dataUrl:url, bytes:Math.round((url.length-url.indexOf(',')-1)*0.75)};
  }

  /* ------------------------------------------------------------------ thumbs */
  function render(){
    thumbs.innerHTML='';
    shots.forEach(function(s,i){
      var d=document.createElement('div'); d.className='pqth';
      var img=document.createElement('img'); img.src=s.dataUrl; img.alt=s.name;
      var b=document.createElement('button');
      b.type='button'; b.textContent='×';
      b.setAttribute('aria-label','Remove '+s.name);
      b.addEventListener('click',function(){ shots.splice(i,1); render() });
      var z=document.createElement('span'); z.className='sz'; z.textContent=kb(s.bytes);
      d.appendChild(img); d.appendChild(b); d.appendChild(z); thumbs.appendChild(d);
    });
    var n=shots.length;
    drop.classList.toggle('full', n>0);
    lead.textContent = n===0 ? 'Tap to add photos'
      : n>=MAX_FILES ? 'That’s the lot — six is plenty'
      : 'Add another ('+n+' of '+MAX_FILES+')';
    if(n) clearFail();
  }

  async function accept(files){
    clearFail();
    var list=Array.prototype.slice.call(files);
    if(!list.length) return;
    if(shots.length+list.length>MAX_FILES){
      fail('Six photos is the limit — pick the six that show the most.');
      list=list.slice(0, Math.max(0, MAX_FILES-shots.length));
      if(!list.length) return;
    }
    lead.textContent='Shrinking…';
    for(var i=0;i<list.length;i++){
      var f=list[i];
      if(!/^image\//.test(f.type||'')){ fail('“'+f.name+'” isn’t an image — skipped.'); continue }
      try{
        var out=await shrink(f);
        shots.push({name:(f.name||'photo.jpg').slice(0,60), dataUrl:out.dataUrl, bytes:out.bytes});
      }catch(e){
        fail('Couldn’t read “'+f.name+'”. If it’s a HEIC from an iPhone, try texting it '
            +'to (203) 592-9589 instead — that always works.');
      }
    }
    // Belt and braces: if six large photos still overshoot, drop the last ones
    // rather than letting the request bounce off the server.
    while(shots.length>1 && totalBytes()>MAX_BYTES){
      shots.pop();
      fail('That was more than we can send in one go, so the last photo was dropped. '
          +'Send it by text if it matters.');
    }
    render();
  }

  input.addEventListener('change',function(){ accept(this.files); this.value='' });
  ['dragenter','dragover'].forEach(function(ev){
    drop.addEventListener(ev,function(e){ e.preventDefault(); drop.classList.add('over') });
  });
  ['dragleave','drop'].forEach(function(ev){
    drop.addEventListener(ev,function(e){ e.preventDefault(); drop.classList.remove('over') });
  });
  drop.addEventListener('drop',function(e){
    if(e.dataTransfer && e.dataTransfer.files) accept(e.dataTransfer.files);
  });

  /* -------------------------------------------------------------------- town */
  (function(){
    var T=window.TOWNS||{}, sel=document.getElementById('pqTown'); if(!sel) return;
    Object.keys(T).forEach(function(region){
      var g=document.createElement('optgroup'); g.label=region;
      T[region].forEach(function(t){
        var o=document.createElement('option'); o.value=t; o.textContent=t; g.appendChild(o);
      });
      sel.appendChild(g);
    });
    var g2=document.createElement('optgroup'); g2.label='Not on the list';
    var o2=document.createElement('option'); o2.value='Somewhere else';
    o2.textContent='Somewhere else — ask me'; g2.appendChild(o2); sel.appendChild(g2);
  })();

  /* ------------------------------------------------------------------ submit */
  function digits(v){ return String(v).replace(/\D/g,'') }
  function mark(el,ok){ el.classList.toggle('bad',!ok); return ok }

  form.addEventListener('submit', async function(ev){
    ev.preventDefault();
    if($('pqHp').value) return;                 // honeypot: a bot filled the hidden field
    clearFail();

    var ok=true;
    ok = mark($('pqName'), $('pqName').value.trim().length>1) && ok;
    ok = mark($('pqPhone'), digits($('pqPhone').value).length===10) && ok;
    ok = mark($('pqTown'), !!$('pqTown').value) && ok;
    if(!ok){ fail('Name, a 10-digit phone number and a town — that’s all we need to reply.'); return }
    if(!shots.length){
      fail('Add at least one photo. One decent shot of the whole car beats none, and we’d '
          +'rather quote off something real than guess.');
      return;
    }

    var ref='CAL-P'+Date.now().toString(36).toUpperCase().slice(-5);
    send.disabled=true; send.textContent='Sending…';
    try{
      var r=await fetch('/api/photo-quote',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          ref:ref,
          name:$('pqName').value, phone:$('pqPhone').value, town:$('pqTown').value,
          service:$('pqSvc').value, note:$('pqNote').value,
          photos: shots.map(function(s){ return {name:s.name, dataUrl:s.dataUrl} })
        })
      });
      var data={};
      try{ data=await r.json() }catch(e){}
      if(!r.ok) throw new Error(data.error||'Something went wrong at our end.');
      $('pqRef').textContent=data.ref||ref;
      form.hidden=true;
      $('pqDone').hidden=false;
      $('pqDone').scrollIntoView({behavior:'smooth',block:'center'});
    }catch(e){
      fail((e && e.message ? e.message+' ' : '')
          +'Nothing was lost — text the same photos to (203) 592-9589 and we’ll quote from there.');
      send.disabled=false; send.textContent='Send for a price';
    }
  });
})();
