h=open('index.html').read()

# ---------- 1. STRIPE JS + PUBLISHABLE KEY ----------
h=h.replace('<script src="app.js" defer></script>',
 '''<script src="https://js.stripe.com/v3/"></script>
<script>window.STRIPE_PK="pk_test_REPLACE_ME";</script>
<script src="app.js" defer></script>''')

# ---------- 2. CSS for the payment step ----------
h=h.replace('/* ---------- FORM ---------- */','''.payhead{display:flex;justify-content:space-between;align-items:baseline;gap:14px;flex-wrap:wrap;
  padding:18px 20px;background:linear-gradient(180deg,#101A14,#0D1210);
  border:1px solid rgba(163,230,53,.3);border-radius:10px;margin-bottom:18px}
.payhead .pl{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--mute)}
.payhead .pv{font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1.1}
.payhead .pn{font-size:12.5px;color:var(--mute);text-align:right;max-width:30ch}
#payment-element{background:#0B0E12;border:1px solid #242C36;border-radius:9px;padding:18px;min-height:220px}
.paywait{display:flex;align-items:center;gap:10px;font-size:13.5px;color:var(--mute);padding:24px 4px}
.spin{width:15px;height:15px;border:2px solid #2A333D;border-top-color:var(--acc);border-radius:50%;
  animation:sp .7s linear infinite;flex:none}
@keyframes sp{to{transform:rotate(360deg)}}
.paysafe{display:flex;align-items:flex-start;gap:8px;font-size:11.5px;color:var(--mute);margin-top:14px;line-height:1.5}
.paysafe svg{width:13px;height:13px;color:var(--acc);flex:none;margin-top:2px}
/* ---------- FORM ---------- */''')

# ---------- 3. package keys on the existing service buttons ----------
h=h.replace('data-svc="Refresh" data-base="149" data-dep="25"','data-svc="Refresh" data-base="149" data-dep="25" data-key="refresh"')
h=h.replace('data-svc="Full Detail" data-base="279" data-dep="40"','data-svc="Full Detail" data-base="279" data-dep="40" data-key="full-detail"')
h=h.replace('data-svc="Ceramic" data-base="749" data-dep="75"','data-svc="Ceramic" data-base="749" data-dep="75" data-key="ceramic"')

# ---------- 4. step bar gains a Pay step ----------
h=h.replace('<div class="sb" data-sb="5"><i>05</i>Confirm</div>',
            '<div class="sb" data-sb="5"><i>05</i>Confirm</div>\n        <div class="sb" data-sb="6"><i>06</i>Deposit</div>')

# ---------- 5. confirm button now goes to payment ----------
h=h.replace('<button type="button" class="btn btn-p btn-lg" id="submitBk">Agree &amp; request slot</button>',
            '<button type="button" class="btn btn-p btn-lg" id="submitBk">Agree &amp; continue to deposit</button>')

# ---------- 6. insert the payment pane before the done pane ----------
done_marker = '<!-- DONE -->'
pay_pane = '''<!-- STEP 6 — DEPOSIT -->
        <div class="pane" data-p="6">
          <div class="qh">Hold the slot.</div>
          <div class="qs">Paid here on this page — you are not sent anywhere else. Refundable under the terms you just agreed.</div>

          <div class="payhead">
            <div><div class="pl mono">Refundable deposit</div><div class="pv" id="payAmt">$40</div></div>
            <div class="pn">Comes off your total. Balance of <b id="payBal" style="color:#E4EAF0">$239</b> due after the walk-around.</div>
          </div>

          <div id="payWrap">
            <div class="paywait" id="payLoading"><span class="spin"></span> Setting up secure payment…</div>
            <div id="payment-element"></div>
          </div>
          <div class="err" id="e6">Payment could not be completed. Nothing has been charged — try again or call us.</div>

          <div class="paysafe">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            <span>Card details go straight to Stripe and never touch our servers. We only ever see the last four digits.</span>
          </div>

          <div class="navrow">
            <button type="button" class="btn ghost btn-lg" data-go="5">Back</button>
            <button type="button" class="btn btn-p btn-lg" id="payBtn">Pay deposit &amp; book</button>
          </div>
        </div>

        '''
h=h.replace(done_marker, pay_pane + done_marker, 1)

# ---------- 7. done pane becomes step 7 ----------
h=h.replace('<div class="pane" data-p="6">\n          <div class="confirm">','<div class="pane" data-p="7">\n          <div class="confirm">')
h=h.replace('<h3>Slot requested.</h3>','<h3>Booked.</h3>')
h=h.replace('''<p style="margin-top:14px">Send it over using whichever is easier. We'll reply to confirm the window and include a secure link for the deposit — usually within the hour during business hours.</p>
            <p style="color:var(--mute);font-size:13px">Your slot isn't held until the deposit clears. Nothing has been charged yet, and the summary below travels with your message so you keep a copy of exactly what was agreed.</p>''',
'''<p style="margin-top:14px">Deposit received and your slot is held. We'll confirm the arrival window by text the day before.</p>
            <p style="color:var(--mute);font-size:13px">A Stripe receipt is on its way to your email. Send us the summary below too if you'd like it on record — and text photos of the vehicle any time, they help us come prepared.</p>''')
h=h.replace('<a class="btn btn-p btn-lg" id="sendSms" href="#">Send by text</a>','<a class="btn btn-p btn-lg" id="sendSms" href="#">Text us the details</a>')
h=h.replace('<a class="btn btn-o btn-lg" id="sendMail" href="#">Send by email</a>','<a class="btn btn-o btn-lg" id="sendMail" href="#">Email us the details</a>')
h=h.replace('<div class="sumrow"><span>Deposit</span><b id="f6">—</b></div>','<div class="sumrow"><span>Deposit paid</span><b id="f6">—</b></div>')

open('index.html','w').write(h); print('payment pane installed')
