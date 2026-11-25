"""Make a tracked QR code for a printed piece or placement.

    python3 tools/make_qr.py door-enfield-elm-1118            # opens /menu, counts as that placement
    python3 tools/make_qr.py work-acme                         # Detail Day flyer for Acme
    python3 tools/make_qr.py fleet-ace-plumbing --page fleet   # opens /fleet
    python3 tools/make_qr.py fb --page gift                    # a link for a gift card post

The id is the channel: its type (door, magnet, card, dash, postcard, flyer, work, fleet, van, fb, ig,
google, gift, sms, email), then optionally where it went. Writes qr/<id>.svg and qr/<id>.png and
prints the link. Add the placement to REGISTRY in api/_channels.js to give it a name and a cost.
Needs:  pip install qrcode pillow
"""
import argparse, os, re, sys
import qrcode, qrcode.image.svg

TYPES = ['door', 'magnet', 'card', 'dash', 'postcard', 'flyer', 'work', 'fleet', 'van', 'fb', 'ig', 'google', 'gift', 'sms', 'email']
ap = argparse.ArgumentParser()
ap.add_argument('id'); ap.add_argument('--page', default='menu', choices=['menu', 'quote', 'gift', 'fleet', ''])
ap.add_argument('--out', default='qr')
a = ap.parse_args()
cid = a.id.lower()
if not re.fullmatch(r'[a-z]{2,8}(?:-[a-z0-9]{1,24}){0,4}', cid) or cid.split('-')[0] not in TYPES:
    sys.exit(f'Not a channel id: {a.id}. Start with one of {", ".join(TYPES)}, then words joined by "-" (letters and digits).')
url = f'https://cipherautolab.com/{a.page}?src={cid}'.replace('.com/?', '.com/?')
os.makedirs(a.out, exist_ok=True)
q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=2, box_size=20)
q.add_data(url); q.make(fit=True)
q.make_image(fill_color='#0B0E11', back_color='white').save(os.path.join(a.out, cid + '.png'))
q.make_image(image_factory=qrcode.image.svg.SvgPathImage).save(os.path.join(a.out, cid + '.svg'))
print(url)
