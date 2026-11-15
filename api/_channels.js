// Marketing channels: every printed QR code and link carries ?src=<channel id>.
// A channel id is its type, optionally followed by where it went:
//   door                      door hangers in general
//   door-enfield-elm-1118     the batch hung on Elm St, Enfield, on Nov 18
//   work-acme                 the Detail Day flyer at Acme's office
// Any id of a known type counts, listed here or not, so a new placement works the day you print it.
// List a placement in REGISTRY to give it a name, a print date, a quantity and what it cost:
// the channel report then works out cost per booking. tools/make_qr.py makes the QR code.
// Files in /api whose names start with "_" are shared code, not endpoints.

export const TYPES = {
  door: 'Door hanger', magnet: 'Magnet', card: 'Business card', dash: 'Dash card', postcard: 'Postcard',
  flyer: 'Flyer', work: 'Workplace flyer', fleet: 'Fleet leave-behind', fb: 'Facebook', ig: 'Instagram',
  google: 'Google profile', gift: 'Gift card page', sms: 'Text message', email: 'Email',
};

// What each printed offer promises, by type, for the owner's push (applied by hand with the travel fee)
export const OFFERS = {
  door: 'Neighbor offer: no travel fee if booked within 7 days of the date on the hanger',
  work: 'Workplace offer: no travel fee when 3+ cars book the same day at that workplace',
};

// Placements and print runs. cost in dollars, qty in pieces, printed as YYYY-MM-DD.
export const REGISTRY = {
  door:   { label: 'Door hangers', note: 'QR on the door hanger design (Nov 2026)' },
  work:   { label: 'Workplace Detail Day flyer' },
  fleet:  { label: 'Fleet leave-behind' },
  magnet: { label: 'Magnets' },
  card:   { label: 'Business cards' },
  dash:   { label: 'Dash cards' },
  postcard: { label: 'Postcards' },
  fb:     { label: 'Facebook posts' },
};

export const ID_RE = /^[a-z]{2,8}(?:-[a-z0-9]{1,24}){0,4}$/;

/** A channel id -> { id, type, typeLabel, label, ...registry } or null if it isn't one. */
export function channel(raw) {
  const id = String(raw || '').trim().toLowerCase();
  if (!ID_RE.test(id)) return null;
  const type = id.split('-')[0];
  if (!TYPES[type]) return null;
  const r = REGISTRY[id] || {};
  const where = id === type ? '' : id.slice(type.length + 1).replace(/-/g, ' ');
  return { id, type, typeLabel: TYPES[type], label: r.label || (where ? `${TYPES[type]} · ${where}` : TYPES[type]), ...r };
}
