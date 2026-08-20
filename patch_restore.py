h=open('index.html').read()

css = '''.rest{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.rcard{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:26px 24px;position:relative}
.rcard.feat{border-color:rgba(163,230,53,.42);background:linear-gradient(180deg,#101A14,#0D1210)}
.rsize{margin-top:14px;padding-top:13px;border-top:1px solid var(--line);
  display:flex;justify-content:space-between;font-size:12.5px;color:var(--mute);gap:10px;flex-wrap:wrap}
.rsize b{color:var(--ink);font-family:ui-monospace,Menlo,monospace}
.addon{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1px;
  background:var(--line);border:1px solid var(--line);border-radius:9px;overflow:hidden;margin-top:16px}
.ao{background:var(--panel);padding:18px 20px}
.ao b{display:block;font-size:15px;margin-bottom:3px}
.ao .p{font-size:20px;font-weight:800;color:var(--acc);letter-spacing:-.02em;margin:6px 0 4px}
.ao span{font-size:12.5px;color:var(--mute);line-height:1.45;display:block}
.nope{border-color:rgba(248,113,113,.24)}
.nope .p{color:#F87171;font-size:16px}
/* ---------- STEPS ---------- */'''
h=h.replace('/* ---------- STEPS ---------- */', css, 1)

sec = '''<!-- ===== RESTORATION ===== -->
<section id="restoration">
  <div class="wrap">
    <div class="shead">
      <div class="eyebrow mono">Restoration menu</div>
      <h2>When cleaning isn't enough.</h2>
      <p class="lede">Detailing makes a car clean. Correction makes the paint <em>right</em> — it removes the swirls and haze that washing can't touch. Different job, different menu. Every correction starts with a test panel we photograph and show you before quoting.</p>
    </div>

    <div class="rest">
      <div class="rcard">
        <div class="pname mono">Gloss Enhancement</div>
        <div class="price">$349<small> &nbsp;from</small></div>
        <p class="pfor">One machine step. For paint that looks dull rather than damaged.</p>
        <ul class="feats">
          <li>Wash, iron decon, clay</li>
          <li>Single-stage machine polish</li>
          <li>Removes 50–60% of swirls</li>
          <li>6-month sealant included</li>
          <li>Roughly 4 hours</li>
        </ul>
        <div class="rsize"><span>SUV <b>$399</b></span><span>Truck / 3-row <b>$449</b></span></div>
        <a class="btn btn-o" href="#quote">Book Gloss</a>
      </div>

      <div class="rcard feat">
        <div class="flag">Best value</div>
        <div class="pname mono">Paint Correction</div>
        <div class="price">$749<small> &nbsp;from</small></div>
        <p class="pfor">Two stages — compound then refine. Removes most of what you can actually see.</p>
        <ul class="feats">
          <li>Everything in Gloss Enhancement</li>
          <li>Compound + polish stages</li>
          <li>80–90% defect removal</li>
          <li>Paint depth measured and recorded</li>
          <li>6–8 hours</li>
        </ul>
        <div class="rsize"><span>SUV <b>$849</b></span><span>Truck / 3-row <b>$949</b></span></div>
        <a class="btn btn-p" href="#quote">Book Correction</a>
      </div>

      <div class="rcard">
        <div class="pname mono">Show Finish</div>
        <div class="price">$1,299<small> &nbsp;from</small></div>
        <p class="pfor">Three or more stages. Quoted per vehicle after inspection — never sold sight-unseen.</p>
        <ul class="feats">
          <li>Multi-stage cut and refine</li>
          <li>95%+ correction</li>
          <li>Documented test panel</li>
          <li>Two days</li>
        </ul>
        <div class="rsize"><span>By quote only</span></div>
        <a class="btn btn-o" href="#quote">Request a quote</a>
      </div>
    </div>

    <div class="shead" style="margin-top:56px;margin-bottom:20px">
      <div class="eyebrow mono">Protection</div>
      <h2 style="font-size:clamp(21px,3vw,27px)">Coatings, priced separately.</h2>
      <p class="lede">A coating locks in whatever is underneath it. We won't put one on uncorrected paint — you'd be sealing the swirls in for five years.</p>
    </div>
    <div class="addon">
      <div class="ao"><b>6-month sealant</b><div class="p">Included</div>
        <span>Baseline protection on every correction.</span></div>
      <div class="ao"><b>1–2 year coating</b><div class="p">+$349</div>
        <span>The sensible step up once the paint is right.</span></div>
      <div class="ao"><b>3–5 year ceramic</b><div class="p">+$599</div>
        <span>Correction + ceramic bundled: <b style="color:#A3E635">$1,249</b>.</span></div>
    </div>

    <div class="shead" style="margin-top:56px;margin-bottom:20px">
      <div class="eyebrow mono">Headlights</div>
      <h2 style="font-size:clamp(21px,3vw,27px)">Yellow to clear, in about an hour.</h2>
      <p class="lede">Wet-sanded through the grits, polished back to clarity, then sealed. The sealing is the part that matters — it's the difference between a fix and a delay.</p>
    </div>
    <div class="addon">
      <div class="ao"><b>Headlight Restoration</b><div class="p">$139 / pair</div>
        <span>Wet sand, polish, UV sealant. <b style="color:#E4EAF0">12-month clarity warranty.</b><br>Single lens $89 · with any detail <b style="color:#A3E635">$99</b></span></div>
      <div class="ao"><b>+ Ceramic topper</b><div class="p">$189 / pair</div>
        <span>Ceramic UV layer instead of sealant. <b style="color:#E4EAF0">24-month warranty.</b><br>With any detail <b style="color:#A3E635">$149</b></span></div>
      <div class="ao nope"><b>Polish only</b><div class="p">Not offered</div>
        <span>Without a UV seal it hazes back within months. We'd rather lose the sale than sell you that.</span></div>
    </div>
  </div>
</section>

'''
anchor = '<!-- ===== HOW ===== -->'
assert anchor in h
h=h.replace(anchor, sec+anchor, 1)
h=h.replace('<a class="navlink" href="#packages">Packages</a>',
            '<a class="navlink" href="#packages">Packages</a>\n      <a class="navlink" href="#restoration">Restoration</a>')
open('index.html','w').write(h); print('restoration menu added')
