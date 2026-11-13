// Booking prices, checked on the server. The browser shows these numbers too (app.js),
// but the amount a card is charged and the balance invoice are worked out here, so a
// changed number in someone's browser can never change what Stripe charges.
// Keep in step with app.js, detailing.html, menu.html and the deposit table in terms.html.
// Files in /api whose names start with "_" are shared code, not endpoints.

export const SVC = {
  exterior: { name: 'Exterior Detail', dep: 25, ext: true,  int: false, p: { sedan: 109, suv5: 125, suv7: 135, truck: 139 } },
  interior: { name: 'Interior Detail', dep: 30, ext: false, int: true,  p: { sedan: 169, suv5: 185, suv7: 205, truck: 219 } },
  full:     { name: 'Full Detail',     dep: 40, ext: true,  int: true,  p: { sedan: 259, suv5: 279, suv7: 305, truck: 325 } },
};

export const PAINT = {
  gloss:       { name: 'Gloss Enhancement',    dep: 50,  p: { sedan: 349,  suv5: 399,  suv7: 429,  truck: 449 } },
  correction:  { name: 'Paint Correction',     dep: 100, p: { sedan: 749,  suv5: 849,  suv7: 899,  truck: 949 } },
  ceramic:     { name: 'Ceramic Coating',      dep: 100, p: { sedan: 949,  suv5: 1049, suv7: 1099, truck: 1149 } },
  corrceramic: { name: 'Correction + Ceramic', dep: 150, p: { sedan: 1249, suv5: 1399, suv7: 1449, truck: 1549 } },
  show:        { name: 'Show Finish',          dep: 150, p: { sedan: 1299, suv5: 1449, suv7: 1549, truck: 1649 }, quote: true },
};

// interior add-ons only apply when the service includes the interior, exterior ones likewise
export const ADDONS = {
  extract:   { name: 'Shampoo & extraction',        price: 99, side: 'int' },
  leather:   { name: 'Leather clean & condition',   price: 79, side: 'int' },
  stain:     { name: 'Stain removal',               price: 79, side: 'int' },
  pethair:   { name: 'Pet hair removal',            price: 69, side: 'int' },
  iron:      { name: 'Iron decontamination',        price: 69, side: 'ext' },
  clay:      { name: 'Clay bar',                    price: 69, side: 'ext' },
  sealant:   { name: '6-month paint sealant',       price: 69, side: 'ext' },
  cspray:    { name: 'Ceramic spray coating',       price: 89, side: 'ext' },
  engine:    { name: 'Engine bay',                  price: 69, side: 'ext' },
  headlight: { name: 'Headlight restoration',       price: 89, side: 'ext' },
};
export const DECON_BUNDLE = 119; // iron + clay together

// Minutes on the job, as on /menu and in js/schedule.js (paint work is a full day, quoted separately)
export const MINS = { exterior: 120, interior: 180, full: 300,
  extract: 60, leather: 45, stain: 60, pethair: 45, iron: 45, clay: 45, sealant: 30, cspray: 45, engine: 45, headlight: 60 };
export function jobMinutes(bk) { return bk.paintKey ? 0 : bk.adds.reduce((m, k) => m + (MINS[k] || 0), MINS[bk.packageKey] || 0); }
// November to March every exterior gets the salt neutralizer on wheels, wells and lower panels
export function saltSeason(dateText) { const d = new Date(dateText || ''); const m = isNaN(d) ? 0 : d.getMonth() + 1; return m >= 11 || (m >= 1 && m <= 3); }

export const TIER = { sedan: 'sedan or coupe', suv5: '5-seat SUV', suv7: '7-seat SUV', truck: 'truck or van' };

const clean = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
const digits = (v) => String(v ?? '').replace(/\D/g, '');

/** Validate a booking request body. Returns { booking } or { error }. */
export function parseBooking(b) {
  if (!b || typeof b !== 'object') return { error: 'Missing booking details.' };
  const svc = SVC[b.packageKey];
  if (!svc) return { error: 'Unknown service.' };
  const paint = b.paintKey ? PAINT[b.paintKey] : null;
  if (b.paintKey && !paint) return { error: 'Unknown paint service.' };
  if (!TIER[b.tier]) return { error: 'Unknown vehicle size.' };

  const ref = clean(b.ref, 24);
  if (!/^CAL-[A-Z0-9]{4,16}$/.test(ref)) return { error: 'Missing booking reference.' };
  const name = clean(b.name, 80);
  if (name.length < 2) return { error: 'Enter your name.' };
  let phone = digits(b.phone);
  if (phone.length === 11 && phone[0] === '1') phone = phone.slice(1);
  if (phone.length !== 10) return { error: 'Enter a 10-digit phone number.' };
  const email = clean(b.email, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'Enter an email for your receipt.' };

  const adds = [...new Set(clean(b.addons, 200).split(',').map((s) => s.trim()).filter(Boolean))]
    .filter((k) => ADDONS[k] && (ADDONS[k].side === 'int' ? svc.int : svc.ext));

  return {
    booking: {
      ref, name, phone, email, adds,
      packageKey: b.packageKey, paintKey: paint ? b.paintKey : '', tier: b.tier,
      vehicle: clean(b.vehicle, 120), size: clean(b.size, 40), condition: clean(b.condition, 80),
      parked: clean(b.parked, 80), date: clean(b.date, 40), window: clean(b.window, 40),
      address: clean(b.address, 160), town: clean(b.town, 60), notes: clean(b.notes, 450),
      zip: /^06\d{3}$/.test(clean(b.zip, 5)) ? clean(b.zip, 5) : '',
      agreementVersion: clean(b.agreementVersion, 10), signature: clean(b.signature, 80),
      signedAt: clean(b.signedAt, 40), photoConsent: b.photoConsent === 'yes' ? 'yes' : 'no',
      // which booking flow it came from: the Detail Menu (QR codes, magnets, postcards) or the site
      source: b.source === 'menu' ? 'menu' : 'site',
      // forecast area (county) the page used, so the confirmed booking can carry its forecast
      area: /^[a-z-]{4,20}$/.test(String(b.area || '')) ? String(b.area) : '',
      // the customer has a garage and is fine with a wash or rinseless wash inside it (lets the job run to 6pm)
      garage: b.garage === 'yes' || b.garage === true ? 'yes' : 'no',
    },
  };
}

/** Deposit in whole dollars: the larger of the service and paint deposits. */
export function depositFor(bk) {
  return Math.max(SVC[bk.packageKey].dep, bk.paintKey ? PAINT[bk.paintKey].dep : 0);
}

export function serviceLabel(bk) {
  const s = SVC[bk.packageKey].name + (bk.paintKey ? ' + ' + PAINT[bk.paintKey].name : '');
  return `${s} (${TIER[bk.tier]})`;
}

// Stripe Tax categories, as set on the products in the Stripe catalog (prices include tax).
export const TAX = { wash: 'txcd_20010001', repair: 'txcd_20080003' };

/** Itemised job, in cents, for the draft balance invoice. Mirrors total() in app.js.
 *  Lines with `product` point at the catalog products (cal_<service>_<tier>, cal_addon_<key>),
 *  so each line carries that product's tax category. Credits carry their own. */
export function invoiceLines(bk) {
  const svc = SVC[bk.packageKey], lines = [];
  lines.push({ product: `cal_${bk.packageKey}_${bk.tier}`, description: `${svc.name} — ${TIER[bk.tier]}`, amount: svc.p[bk.tier] * 100 });
  if (bk.paintKey) {
    const p = PAINT[bk.paintKey];
    lines.push({
      product: p.quote ? 'cal_show_finish' : `cal_${bk.paintKey}_${bk.tier}`,
      description: `${p.name} — ${TIER[bk.tier]}${p.quote ? ' (confirmed after inspection)' : ''}`,
      amount: p.p[bk.tier] * 100,
    });
    if (svc.ext) lines.push({ tax_code: TAX.wash, description: 'Exterior wash already included in the paint work', amount: -SVC.exterior.p[bk.tier] * 100 });
  }
  const both = bk.adds.includes('iron') && bk.adds.includes('clay');
  for (const k of bk.adds) {
    if (both && (k === 'iron' || k === 'clay')) continue;
    lines.push({ product: `cal_addon_${k}`, description: ADDONS[k].name, amount: ADDONS[k].price * 100 });
  }
  if (both) lines.push({ product: 'cal_addon_decon_bundle', description: 'Iron decon + clay bar together', amount: DECON_BUNDLE * 100 });
  return lines;
}

/** Stripe metadata: string values, 500 characters at most each. */
export function bookingMetadata(bk) {
  const m = {
    booking_ref: bk.ref, service: serviceLabel(bk), package_key: bk.packageKey, paint_key: bk.paintKey,
    tier: bk.tier, addons: bk.adds.join(','), customer_name: bk.name, phone: bk.phone,
    vehicle: bk.vehicle, condition: bk.condition, parked: bk.parked, date: bk.date, window: bk.window,
    address: bk.address, town: bk.town, zip: bk.zip, notes: bk.notes, agreement_version: bk.agreementVersion,
    signed_name: bk.signature, signed_at: bk.signedAt, photo_consent: bk.photoConsent,
    booking_source: bk.source || 'site', area: bk.area || '', garage: bk.garage || 'no',
    job_minutes: jobMinutes(bk) || '', salt_neutralizer: SVC[bk.packageKey].ext && saltSeason(bk.date) ? 'included' : '',
  };
  for (const k of Object.keys(m)) m[k] = String(m[k] ?? '').slice(0, 500);
  return m;
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}
