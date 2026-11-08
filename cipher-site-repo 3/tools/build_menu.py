"""Build /menu (menu.html): the page every QR code on the magnets, postcard and card opens.

Campaign look: black page, white "Detail menu" cards with the lime band from the magnet panel.
Pick a vehicle size, a package and add-ons; js/menu.js keeps a live total and builds a text
message to send. Without JavaScript everything still reads as a plain price menu.
Prices mirror detailing.html. Change them here and rerun:  python3 build_menu.py
"""
import pathlib, re

R = pathlib.Path(__file__).resolve().parent.parent      # repo root
TEL, SMS, NUM = "tel:+12035603572", "sms:+12035603572", "(203) 560-3572"

SIZES = [("sedan", "Sedan or coupe", "Sedan"), ("suv", "SUV, 5 seats", "SUV"),
         ("suv3", "3-row SUV or minivan", "3-row"), ("truck", "Truck or van", "Truck")]
# key, name, minutes, prices (sedan, suv, suv3, truck), includes, featured
PACKAGES = [
    ("full", "Full Detail", 300, (259, 279, 305, 325),
     ["Everything in Exterior and Interior", "Trunk and cargo area", "Walk-around with you before we leave"], True),
    ("exterior", "Exterior Detail", 120, (109, 125, 135, 139),
     ["Two-bucket hand wash, top down", "Wheels, barrels, tires and wells", "Door jambs and sills",
      "Spray protection, tire dressing", "Streak-free exterior glass"], False),
    ("interior", "Interior Detail", 180, (169, 185, 205, 219),
     ["Full vacuum, seats and carpets", "Every surface cleaned and dressed", "Vents, crevices, cupholders, console",
      "Mats cleaned and refitted", "Interior glass"], False),
]
# key, name, note, minutes, price, plus (price can go up on sight)
ADDONS = [
    ("shampoo", "Shampoo & hot-water extraction", "Carpets and cloth seats", 60, 99, False),
    ("leather", "Leather clean & condition", "Slows the cracking on the bolsters", 45, 79, False),
    ("stain", "Stain removal", "Targeted marks; we say up front if one won't lift", 60, 79, False),
    ("pethair", "Pet hair removal", "Heavy cases quoted on sight", 45, 69, True),
    ("iron", "Iron decontamination", "Pulls embedded iron out of the clear coat", 45, 69, False),
    ("clay", "Clay bar", "With iron decon, both for $119", 45, 69, False),
    ("sealant", "6-month paint sealant", "Machine-applied", 30, 69, False),
    ("spray", "Ceramic spray coating", "6–12 months of slickness", 45, 89, False),
    ("engine", "Engine bay", "Degreased, rinsed carefully, dressed", 45, 69, False),
    ("headlights", "Headlight restoration", "Both lenses, with any detail", 60, 89, False),
]
PAINT = [  # name, note, sedan, suv, truck
    ("Gloss enhancement", "1-step machine polish, 6-month sealant", "$349", "$399–429", "$449"),
    ("Paint correction", "2-step, 80–90% of swirls out", "$749", "$849–899", "$949"),
    ("Ceramic coating", "5-year coating on paint in good shape", "$949", "$1,049–1,099", "$1,149"),
    ("Correction + ceramic", "The one to buy if the paint has swirls", "$1,249", "$1,399–1,449", "$1,549"),
    ("Show finish", "3+ stages, quoted after inspection", "from $1,299", "by quote", "by quote"),
    ("Headlights, own visit", "Per pair; ceramic topper $189", "$139", "$139", "$139"),
]


def hm(mins):
    h, m = divmod(mins, 60)
    if not h:
        return f"{m} min"
    return f"{h} hr{'s' if h != 1 else ''}" + (f" {m} min" if m else "")


def logo_defs():
    src = (R / "index.html").read_text()
    return re.search(r"<!-- ===== LOGO SYMBOL ===== -->.*?</defs></svg>", src, re.S).group(0)


def sizes_html():
    return "\n".join(
        f'        <label class="m-size"><input type="radio" name="size" value="{k}"{" checked" if k == "sedan" else ""}>'
        f'<span>{long}</span></label>' for k, long, short in SIZES)


def packages_html():
    out = []
    for key, name, mins, prices, inc, feat in PACKAGES:
        data = " ".join(f'data-{k}="{p}"' for (k, _, _), p in zip(SIZES, prices))
        alt = " · ".join(f"{short} ${p}" for (k, _, short), p in zip(SIZES[1:], prices[1:]))
        lis = "".join(f"<li>{i}</li>" for i in inc)
        out.append(f"""      <label class="m-pkg{' feat' if feat else ''}">
        <input type="radio" name="pkg" value="{key}" data-name="{name}" data-mins="{mins}" {data}{' checked' if feat else ''}>
        <span class="m-pkg-in">
          {'<span class="m-tag">MOST BOOKED</span>' if feat else ''}
          <span class="m-pkg-top"><b>{name}</b><span class="m-time">ABOUT {hm(mins).upper()}</span></span>
          <span class="m-price" data-pkg-price>${prices[0]}<small data-size-word>sedan</small></span>
          <span class="m-alt">{alt}</span>
          <span class="m-inc"><ul>{lis}</ul></span>
          <span class="m-pick" aria-hidden="true"></span>
        </span>
      </label>""")
    return "\n".join(out)


def addons_html():
    out = []
    for key, name, note, mins, price, plus in ADDONS:
        out.append(f"""        <label class="m-add">
          <input type="checkbox" name="add" value="{key}" data-name="{name}" data-mins="{mins}" data-price="{price}"{' data-plus="1"' if plus else ''}>
          <span class="m-box" aria-hidden="true"></span>
          <span class="m-add-t"><b>{name}</b><small>{note} · {hm(mins)}</small></span>
          <span class="m-add-p">${price}{'+' if plus else ''}</span>
        </label>""")
    return "\n".join(out)


def paint_html():
    rows = "".join(f'<tr><th>{n}<small>{note}</small></th><td data-label="Sedan">{a}</td>'
                   f'<td data-label="SUV">{b}</td><td data-label="Truck / van">{c}</td></tr>'
                   for n, note, a, b, c in PAINT)
    return f"""<table class="m-paint">
        <thead><tr><th>Service</th><th>Sedan</th><th>SUV</th><th>Truck / van</th></tr></thead>
        <tbody>{rows}</tbody>
      </table>"""


def page():
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Detail Menu — Mobile Detailing Prices Across CT | Cipher Auto Lab</title>
<meta name="description" content="Cipher Auto Lab detail menu: mobile detailing by vehicle size. Exterior $109, interior $169, full detail $259 for a sedan, plus SUV, 3-row and truck prices, add-ons and ceramic coating. Build your detail and text it to {NUM}.">
<link rel="canonical" href="https://cipherautolab.com/menu">
<meta name="theme-color" content="#08090B">
<link rel="preload" href="fonts/inter-latin-900-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="menu.css">
</head>
<body>
{logo_defs()}

<header class="m-head">
  <div class="m-wrap">
    <a class="m-brand" href="index.html" aria-label="Cipher Auto Lab home">
      <svg aria-hidden="true"><use href="#bead"/></svg>
      <span><b>CIPHER</b><small>AUTO&nbsp;LAB</small></span>
    </a>
    <a class="m-headcall" href="{TEL}">{NUM}</a>
  </div>
</header>

<main class="m-wrap">
  <div class="m-form" id="menu">

  <section class="m-card m-hero">
    <div class="m-band">DETAIL MENU</div>
    <div class="m-in">
      <p class="m-kick"><span class="m-dot"></span>Mobile across CT · Home or work</p>
      <h1>Pick a size. Pick a detail. <em>Text it to us.</em></h1>
      <p class="m-lede">Every price, by vehicle size, and it's the price, not a starting point. Build your detail below and send it as a text. We reply with a time.</p>
      <fieldset class="m-sizes">
        <legend>Your vehicle</legend>
{sizes_html()}
      </fieldset>
    </div>
  </section>

  <section class="m-sec" aria-labelledby="h-pkg">
    <h2 id="h-pkg"><span class="m-step">01</span> Choose a package</h2>
    <fieldset class="m-pkgs">
      <legend class="m-sr">Package</legend>
{packages_html()}
    </fieldset>
  </section>

  <section class="m-sec" aria-labelledby="h-add">
    <h2 id="h-add"><span class="m-step">02</span> Add what your car needs <span class="m-hint">tap to add</span></h2>
    <fieldset class="m-card m-adds">
      <legend class="m-sr">Add-ons</legend>
{addons_html()}
    </fieldset>
    <p class="m-fine">Clay bar and iron decontamination together are $119. Add-ons are the same price on every vehicle.</p>
  </section>

  <section class="m-sec" aria-labelledby="h-paint">
    <h2 id="h-paint"><span class="m-step">+</span> Paint &amp; protection</h2>
    <div class="m-card m-tablewrap">
      {paint_html()}
    </div>
    <p class="m-fine">Every correction starts with a test panel we photograph and show you before quoting. Text us a photo of the paint for a price on your car.</p>
  </section>

  <section class="m-card m-promise">
    <b>The price doesn't move.</b>
    <p>A car in unusual condition (heavy pet hair, smoke, years of neglect) is re-quoted when we arrive, before anything is touched, and you're free to say no. The number never changes after the work is done.</p>
  </section>

  <section class="m-go" aria-label="Book">
    <a class="m-btn lime" data-sms href="{SMS}">Text it to us</a>
    <a class="m-btn" data-book href="quote.html#quote">Book online</a>
    <a class="m-btn ghost" href="quote.html#photoquote">Get a photo quote</a>
    <a class="m-btn ghost" href="{TEL}">Call {NUM}</a>
  </section>
  </div>
</main>

<div class="m-bar" hidden>
  <div class="m-bar-in">
    <div class="m-sum"><b data-sum-what>Full Detail · Sedan</b><span><b data-sum-total>$259</b> · <span data-sum-time>about 5 hrs</span></span></div>
    <a class="m-btn lime" data-sms href="{SMS}">Text it</a>
    <a class="m-btn" data-book href="quote.html#quote">Book</a>
  </div>
</div>

<footer class="m-foot">
  <div class="m-wrap">
    <p><b>Cipher Auto Lab LLC</b> · Mobile detailing &amp; ceramic coating across CT · Insured</p>
    <p><a href="mailto:hello@cipherautolab.com">hello@cipherautolab.com</a> · <a href="index.html">cipherautolab.com</a> · <a href="detailing.html">Full detailing page</a></p>
  </div>
</footer>
<script src="js/menu.js" defer></script>
</body>
</html>
"""


if __name__ == "__main__":
    (R / "menu.html").write_text(page())
    print("menu.html written")
