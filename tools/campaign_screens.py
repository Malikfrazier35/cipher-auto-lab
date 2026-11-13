"""Make every page on cipherautolab.com open and close like the print campaign
(magnet, postcard, business card), and bring the copy in line with how the business runs:

  * fully mobile: no shop, no street address, tint comes to the customer too
  * across CT, with a travel fee by town that is quoted before booking
  * photo quotes go by text (the old upload form had no server behind it)

Each page gets a campaign "screen" at the top (mono kicker, heavy uppercase headline,
lime "+" line, WE COME TO YOU · HOME OR WORK, lime rule, white card with the lime band)
and the CALL OR TEXT band above the footer. Fleet and the legal pages move onto the
shared header, footer and stylesheets. Run once on the repo:  python3 campaign_screens.py
"""
import re, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import build_site as bs

R = pathlib.Path("/mnt/user-data/outputs/cipher-site-repo")
TEL, SMS, NUM = bs.TEL, bs.SMS, bs.NUM
TRAVEL = "Travel fee by town, quoted before you book."


def read(n): return (R / n).read_text()
def write(n, s): (R / n).write_text(s)


def sub1(s, old, new, name=""):
    assert s.count(old) == 1, (name, s.count(old), old[:80])
    return s.replace(old, new)


INDEX = read("index.html")
LOGO = bs.logo_defs(INDEX)
QR_CARD = re.search(r'<a class="c-menu".*?</a>\n', INDEX, re.S).group(0)

FOOTER = f"""<!-- ===== FOOTER ===== -->
<footer>
  <div class="wrap fgrid">
    <div>
      <a class="brand" href="index.html" aria-label="Cipher Auto Lab home">
        <svg><use href="#bead"/></svg>
        <div><div class="bn">CIPHER</div><div class="bs mono">AUTO&nbsp;LAB</div></div>
      </a>
      <p class="fnote">Mobile detailing, ceramic coating and window tint across Connecticut. We come to you, home or work. {TRAVEL} Owner-operated.</p>
      <p class="fnote u-12">Mon–Sat 8am–6pm · Sunday by request · Appointments only</p>
      <p class="c-fline">Mobile across CT · Insured · Connecticut LLC</p>
    </div>
    <div class="fmeta">
      <p class="fcall">Call or text</p>
      <p><a class="fnum" href="{TEL}">{NUM}</a></p>
      <p><a class="u-14" href="mailto:hello@cipherautolab.com">hello@cipherautolab.com</a></p>
      <div class="socrow">
        <!-- EDIT THESE TWO URLS. Delete the Google line entirely until the listing is live. -->
        <a class="soc" href="https://www.facebook.com/cipherautolab" target="_blank" rel="noopener me">
          <svg><use href="#ic-fb"/></svg><span>Facebook</span></a>
        <a class="soc" href="https://g.page/cipher-auto-lab" target="_blank" rel="noopener me">
          <svg><use href="#ic-star"/></svg><span>Review us on Google</span></a>
      </div>
      <p class="u-15">Cipher Auto Lab LLC · Connecticut</p><p>© 2026 · Licensed &amp; insured</p>
      <p class="flegal"><a href="/fleet">Fleet</a> · <a href="/agreement">Service Agreement</a> · <a href="/terms">Terms of Service</a> · <a href="/privacy">Privacy Policy</a></p>
    </div>
  </div>
</footer>

<div class="stickybar">
  <a class="btn btn-o" href="{TEL}">Call</a>
  <a class="btn btn-o" href="{SMS}">Text</a>
  <a class="btn btn-p" href="quote.html#quote">Book</a>
</div>"""

CALL = f"""<!-- ===== CALL OR TEXT ===== -->
<section class="c-call" aria-label="Call or text">
  <div class="wrap">
    <div class="c-kicker">Call or text</div>
    <a class="c-num" href="{TEL}">{NUM}</a>
    <div class="alt"><a href="quote.html#photoquote">Text a photo of your car</a><span>Mobile across CT</span><span>Travel fee by town</span></div>
  </div>
</section>

"""


def screen(kicker, l1, l2, plus, lede, ctas, panel="", small=False):
    plus_html = f'<span class="plus">{plus}</span>' if plus else ""
    return f"""<!-- ===== SCREEN ===== -->
<section class="c-hero c-screen{' sm' if small else ''}">
  <div class="wrap{'' if panel else ' solo'}">
    <div>
      <div class="c-eyebrow"><span class="dot"></span>{kicker}</div>
      <h1 class="c-h1"><span class="l">{l1}</span><span class="l">{l2}</span>{plus_html}</h1>
      <p class="c-tagline">We come to you · Home or work</p>
      <span class="c-rule" aria-hidden="true"></span>
      <p class="c-sub">{lede}</p>
      {f'<div class="c-cta">{ctas}</div>' if ctas else ''}
    </div>
{panel}  </div>
</section>

"""


def panel(band, rows, foot, href, kicker="Call or text", big=NUM, label=""):
    lis = "".join(f"<li><span>{a}</span><b>{b}</b></li>" for a, b in rows)
    return f"""    <a class="c-panel" href="{href}"{f' aria-label="{label}"' if label else ''}>
      <div class="band">{band}</div>
      <div class="pb">
        <span class="k">{kicker}</span>
        <b class="big">{big}</b>
        <ul>{lis}</ul>
        <span class="foot">{foot}</span>
      </div>
    </a>
"""


def chrome(s, current, call=True):
    """shared header, CALL OR TEXT band and footer"""
    s = re.sub(r"<!-- ===== HEADER ===== -->.*?</header>", lambda m: bs.header(current), s, count=1, flags=re.S)
    s = re.sub(r"(<!-- ===== CALL OR TEXT ===== -->\s*<section class=\"c-call\"(?:(?!</section>).)*</section>\s*)?<!-- ===== FOOTER ===== -->.*?</footer>\s*<div class=\"stickybar\">.*?</div>",
               lambda m: (CALL if call else "") + FOOTER, s, count=1, flags=re.S)
    return s


def head(title, desc, canonical, extra_css=""):
    css = "".join(f'\n<link rel="stylesheet" href="{c}">' for c in ["styles.css", "campaign.css"] + ([extra_css] if extra_css else []))
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{canonical}">
<meta name="theme-color" content="#08090B">
<link rel="preload" href="fonts/inter-latin-900-normal.woff2" as="font" type="font/woff2" crossorigin>{css}
</head>
<body>
{LOGO}

"""


# ---------------------------------------------------------------- home
def do_index():
    s = INDEX
    s = s.replace("We come to you, home or work. Window tint by appointment in Windsor Locks.",
                  "We come to you, home or work. Window tint too. " + TRAVEL)
    s = re.sub(r'  "address": \{.*?\},\n', '  "address": { "@type": "PostalAddress", "addressRegion": "CT", "addressCountry": "US" },\n',
               s, count=1, flags=re.S)
    s = sub1(s, '<a class="btn btn-o btn-lg" href="sms:+12035603572">Text a photo</a>',
             '<a class="btn btn-o btn-lg" href="quote.html#photoquote">Text a photo</a>', "index")
    s = sub1(s, '<div class="alt"><a href="sms:+12035603572">Text a photo of your car</a><span>Mobile across CT</span><a href="mailto:hello@cipherautolab.com">hello@cipherautolab.com</a></div>',
             '<div class="alt"><a href="quote.html#photoquote">Text a photo of your car</a><span>Mobile across CT</span><span>Travel fee by town</span></div>', "index")
    s = sub1(s, "Sedan prices shown. SUV and truck prices are on the <a href=\"menu.html\">detail menu</a>.",
             "Sedan prices shown. SUV and truck prices are on the <a href=\"menu.html\">detail menu</a>. " + TRAVEL, "index")
    s = sub1(s, "Text us your town and a couple of days that suit you, and we'll confirm when we're in your area.",
             "Text us your town and a couple of days that suit you, and we'll confirm when we're in your area. "
             "Depending on the town there may be a travel fee, and it's always in the price before you book.", "index")
    s = sub1(s, "<b>Window tint, by appointment</b>", "<b>Window tint, at your place</b>", "index")
    s = sub1(s, "Carbon and ceramic film, cut and fitted indoors at our Windsor Locks shop.",
             "Carbon and ceramic film, fitted where the car lives.", "index")
    s = chrome(s, None, call=False)
    write("index.html", s)


# ---------------------------------------------------------------- detailing
def do_detailing():
    s = read("detailing.html")
    hero = screen("Every price · By vehicle size", "Detailing", "Prices", "+ Ceramic coating",
                  "Exterior $109, interior $169, full detail $259 for a sedan, and every other size on the table below. " + TRAVEL,
                  '<a class="btn btn-p btn-lg" href="quote.html#quote">Book a detail</a>'
                  '<a class="btn btn-o btn-lg" href="menu.html">Open the detail menu</a>',
                  panel="    " + QR_CARD)
    s = sub1(s, "<!-- ===== PACKAGES ===== -->", hero + "<!-- ===== PACKAGES ===== -->", "detailing")
    s = sub1(s, "These are the prices, not starting points to be negotiated upward.",
             "These are the prices, not starting points to be negotiated upward. A travel fee may apply depending on your town; it's quoted with the price, before you book.", "detailing")
    s = chrome(s, "detailing.html")
    write("detailing.html", s)


# ---------------------------------------------------------------- tint
def do_tint():
    s = read("tint.html")
    s = sub1(s, "<title>Window Tint in Windsor Locks, CT — Carbon &amp; Ceramic | Cipher Auto Lab</title>",
             "<title>Mobile Window Tint Across CT — Carbon &amp; Ceramic | Cipher Auto Lab</title>", "tint")
    s = re.sub(r'<meta name="description" content="[^"]*">',
               '<meta name="description" content="Mobile window tint across Connecticut: carbon from $169 and ceramic from $269 for the whole car, legal 35% fronts and a lifetime film warranty. We come to you. Text (203) 560-3572.">',
               s, count=1)
    tint_sms = "sms:+12035603572?&amp;body=" + "Tint%20quote%3A%20(car)%2C%20(town)%2C%20(which%20windows).%20Photos%20attached."
    hero = screen("Window tint · Mobile across CT", "Window", "Tint", "+ Carbon or ceramic",
                  "Carbon or ceramic film, cut to your glass and fitted at your place. Legal 35% fronts and a lifetime film warranty in your name. " + TRAVEL,
                  f'<a class="btn btn-p btn-lg" href="{tint_sms}">Text a photo for tint</a>'
                  '<a class="btn btn-o btn-lg" href="#tint">See tint prices</a>',
                  panel=panel("Window tint", [("Carbon, whole car", "from $169"), ("Ceramic, whole car", "from $269"),
                                             ("Front two windows", "from $99"), ("Film warranty", "Lifetime")],
                              "Text a photo for a firm price", tint_sms, label="Text us a photo for a window tint price"))
    s = sub1(s, "<!-- ===== TINT ===== -->", hero + "<!-- ===== TINT ===== -->", "tint")
    s = sub1(s, '<div class="eyebrow mono">Window tint · Windsor Locks · by appointment</div>',
             '<div class="eyebrow mono">Carbon or ceramic</div>', "tint")
    s = re.sub(r"<p class=\"lede\">This is what the shop is for\..*?it's the price you pay\.</p>",
               "<p class=\"lede\">Film is cut to your glass and fitted where the car lives, in United Auto Film. "
               "Every price below is the whole car, and it's the price you pay, plus a travel fee by town that we quote up front.</p>",
               s, count=1, flags=re.S)
    s = sub1(s, "<p>Appointment only, one car in the bay at a time. Most cars are in and out the same day.</p>",
             "<p>Appointment only, at your home or work. Tell us where the car will be and we'll confirm the spot works. Most cars are done the same day.</p>", "tint")
    s = sub1(s, "<h3>Film goes on indoors</h3>", "<h3>Film goes on at your place</h3>", "tint")
    s = sub1(s, "Glass cleaned and decontaminated, film cut to your windows and fitted.",
             "Glass cleaned and decontaminated, film cut to your windows and fitted out of the wind and dust.", "tint")
    s = chrome(s, "tint.html")
    write("tint.html", s)


# ---------------------------------------------------------------- quote + photo quote
SHOTS = None


def photo_quote(old):
    shots = re.search(r'<div class="pqshots">.*?</div>\n        <p class="pqtip">.*?</p>', old, re.S).group(0)
    shots = shots.replace("<b>Daylight, not a garage.</b>", "<b>Daylight beats a garage.</b>")
    opts = ["Not sure, tell me what it needs", "Exterior Detail", "Interior Detail", "Full Detail",
            "Paint correction or ceramic coating", "Headlight restoration", "Window tint"]
    options = "".join(f'<option value="{o}">{o}</option>' for o in opts)
    return f"""<!-- ===== PHOTO QUOTE ===== -->
<section id="photoquote">
  <div class="wrap">
    <div class="shead">
      <div class="eyebrow mono">Free photo quote</div>
      <h2>Text a photo. Get a real price.</h2>
      <p class="lede">Not a range, not "starting from". The actual price for your car, travel fee included,
        usually within the hour on a working day. It goes by text straight to our phone: no app, no account, no upload.</p>
    </div>
    <div class="pq-grid">
      <div class="pq-guide">
        <div class="pq-k"><span>01</span>Shoot these four</div>
        {shots}
      </div>
      <div class="pq-card">
        <form id="pqForm" novalidate>
          <div class="pq-k"><span>02</span>Tell us what it is</div>
          <div class="pqrow">
            <div class="fld"><label for="pqName">Your name</label>
              <input id="pqName" autocomplete="given-name" placeholder="First name is fine"></div>
            <div class="fld"><label for="pqTown">Town</label>
              <select id="pqTown" required><option value="">Choose your town</option></select></div>
          </div>
          <div class="fld"><label for="pqCar">The car</label>
            <input id="pqCar" autocomplete="off" placeholder="e.g. 2017 Honda CR-V"></div>
          <div class="fld"><label for="pqSvc">What you're after</label>
            <select id="pqSvc">{options}</select></div>
          <div class="fld"><label for="pqNote">Anything else (optional)</label>
            <textarea id="pqNote" rows="3" placeholder="Pet hair, a coffee spill, swirls on the hood, when suits you."></textarea></div>
          <div class="pq-k"><span>03</span>Send it with your photos</div>
          <p class="pq-err" id="pqErr" hidden></p>
          <button type="submit" class="btn btn-p btn-lg pq-go" id="pqSend">Open my texts</button>
          <p class="pq-how">Your message opens with all of this typed out. Tap <b>+</b>, add your photos, send.</p>
          <p class="pq-alt">On a computer? <a id="pqMail" href="mailto:hello@cipherautolab.com">Email it instead</a> and attach the photos.</p>
        </form>
        <div class="pq-done" id="pqDone" hidden>
          <div class="pq-tick"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg></div>
          <h3>Now add your photos.</h3>
          <p>Your text to {NUM} is written. Attach the four shots and send it, and we'll reply with a real number,
            usually within the hour Monday to Saturday.</p>
          <div class="pq-again"><a class="btn btn-p" id="pqAgain" href="{SMS}">Open my texts again</a>
            <a class="btn btn-o" id="pqMail2" href="mailto:hello@cipherautolab.com">Email instead</a></div>
          <p class="pq-fine">Didn't open? Text the photos to <a href="{SMS}">{NUM}</a> with your town and the car.</p>
        </div>
      </div>
    </div>
    <p class="pq-fine">Your photos are only used for your quote. If we'd ever like to show one on the site, we ask first.
      <a href="/privacy">Privacy policy</a></p>
  </div>
</section>

"""


def do_quote():
    s = read("quote.html")
    s = re.sub(r'<meta name="description" content="[^"]*">',
               '<meta name="description" content="Book mobile detailing across Connecticut, or text four photos and get a real price back, usually within the hour. We come to you, home or work. Travel fee by town, quoted before you book.">',
               s, count=1)
    old_pq = re.search(r"<!-- ===== PHOTO QUOTE ===== -->\n<section id=\"photoquote\">.*?\n</section>\n", s, re.S).group(0)
    pq_sms = "#photoquote"
    hero = screen("Book online · Or text a photo", "Book a", "Detail", "+ Or text a photo",
                  "Pick a package, a day and a window below, or text us four photos and get a real price back. "
                  "Anywhere in Connecticut. " + TRAVEL,
                  '<a class="btn btn-p btn-lg" href="#quote">Book a slot</a>'
                  '<a class="btn btn-o btn-lg" href="#photoquote">Text a photo</a>',
                  panel=panel("Text a photo", [("Send", "4 photos"), ("Get back", "A real price"), ("Usually", "Within the hour")],
                              "Mon–Sat · 8am–6pm", pq_sms, label="Get a photo quote by text"))
    s = s.replace(old_pq, hero + photo_quote(old_pq), 1)
    s = re.sub(r'<div><b>The shop</b><span>.*?</span></div>',
               '<div><b>Travel</b><span>Anywhere in Connecticut. Depending on your town a travel fee may apply, and it\'s confirmed by text before your slot is held.</span></div>',
               s, count=1, flags=re.S)
    s = s.replace("The form below books mobile detailing.", "The booking form above is for detailing.")
    s = re.sub(r"<details><summary>Where does the tint get installed\?</summary>.*?</details>",
               "<details><summary>Do you come to me for tint too?</summary>\n"
               "        <p>Yes. Tint is mobile like everything else. Film needs still air and as little dust as possible, "
               "so when you text us we'll ask where the car will be and confirm the spot works before you book. "
               "Most cars are done the same day.</p></details>",
               s, count=1, flags=re.S)
    s = sub1(s, "<details><summary>Do I need to be home?</summary>",
             "<details><summary>Do you charge for travel?</summary>\n"
             "        <p>Sometimes. We cover all of Connecticut, and depending on how far your town is, a travel fee may apply. "
             "It's always part of the price you agree to before you book, never added afterwards.</p></details>\n"
             "      <details><summary>Do I need to be home?</summary>", "quote")
    s = chrome(s, None)
    write("quote.html", s)


# ---------------------------------------------------------------- fleet
BASE_DROP = re.compile(r"^(\*|html|body|\.mono|\.wrap|\.narrow|a|a:hover|h1,h2,h3|h1|h2|h3|:focus-visible|p|strong|"
                       r"header.*|\.brand.*|\.hnav.*|\.hbtn|\.eyebrow.*|\.lede|\.shead.*|\.hero.*|\.btn.*|footer.*|\[hidden\])$")


def scope_css(css, scope):
    out, i = [], 0
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)

    def rules(block):
        res = []
        for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", block):
            sel, body = m.group(1).strip(), m.group(2).strip()
            if sel == ":root":
                res.append(f"{scope}{{{body}}}")
                continue
            parts = [p.strip() for p in sel.split(",")]
            if all(BASE_DROP.match(p) for p in parts):
                continue
            parts = [p for p in parts if not BASE_DROP.match(p)]
            res.append(",".join(f"{scope} {p}" for p in parts) + "{" + body + "}")
        return res

    pos = 0
    for m in re.finditer(r"@media[^{]+\{((?:[^{}]*\{[^{}]*\})*)\s*\}", css):
        out += rules(css[pos:m.start()])
        inner = rules(m.group(1))
        if inner:
            out.append(m.group(0)[:m.group(0).index("{")].strip() + "{" + "".join(inner) + "}")
        pos = m.end()
    out += rules(css[pos:])
    text = "\n".join(out)
    return text.replace("ui-monospace,Menlo,monospace", "JBM,ui-monospace,Menlo,monospace") \
               .replace("ui-monospace,SFMono-Regular,Menlo,monospace", "JBM,ui-monospace,Menlo,monospace")


def do_fleet():
    s = read("fleet.html")
    css = re.search(r"<style>(.*?)</style>", s, re.S).group(1)
    fleet_css = ("/* Fleet page components, scoped so they sit on top of styles.css + campaign.css. */\n"
                 + scope_css(css, "main.fleet") + "\n"
                 "main.fleet form{background:none;border:0;padding:0;border-radius:0}\n"
                 "main.fleet .fld{margin-bottom:0}\n"
                 "main.fleet .err{display:block}\n"
                 "main.fleet [hidden]{display:none!important}\n"
                 "main.fleet .btn-block{width:100%;margin-top:18px}\n"
                 "main.fleet .card h3{font-weight:800}\n").replace("main.fleet section{", "main.fleet section:not(.c-hero){")
    write("fleet.css", fleet_css)
    body = re.search(r"<main>\s*<section class=\"hero\">.*?</section>\s*(.*?)</main>", s, re.S).group(1)
    body = body.replace('class="btn p" id="flSend" style="width:100%;margin-top:18px"', 'class="btn btn-p btn-lg btn-block" id="flSend"')
    body = body.replace('class="btn p"', 'class="btn btn-p btn-lg"').replace('class="btn"', 'class="btn btn-o btn-lg"')
    body = body.replace("box trucks and anything over 10,000 lb by quote.",
                        "box trucks and anything over 10,000 lb by quote. Travel fee by town, built into the contract price.")
    title = "Fleet Detailing for Vans, Trucks &amp; Company Cars — Across CT | Cipher Auto Lab"
    desc = re.search(r'<meta name="description" content="([^"]*)">', s).group(1)
    hero = screen("For businesses · Mobile across CT", "Fleet", "Detailing", "+ Vans, trucks &amp; cars",
                  "Scheduled interior and exterior maintenance on your lot. A named day, one invoice a month, "
                  "and a photographed condition report on every vehicle.",
                  '<a class="btn btn-p btn-lg" href="#enquire">Get a fleet quote</a>'
                  '<a class="btn btn-o btn-lg" href="#prices">See fleet prices</a>',
                  panel=panel("Fleet", [("Vehicles to start", "2+"), ("Invoicing", "Net 15"),
                                        ("Insurance", "COI on request"), ("Every visit", "Photo report")],
                              "Get a fleet quote", "#enquire", kicker="One invoice a month", big="On your lot"))
    page = (head(title, desc, "https://cipherautolab.com/fleet", "fleet.css") + bs.header("/fleet") + "\n\n<main class=\"fleet\">\n"
            + hero + body + "</main>\n\n" + CALL + FOOTER +
            '\n<script src="vehicles.js"></script>\n<script src="fleet.js" defer></script>\n</body>\n</html>\n')
    write("fleet.html", page)


# ---------------------------------------------------------------- legal pages
def do_legal(name, l1, l2, title):
    s = read(f"{name}.html")
    m = re.search(r'<main class="wrap">\s*<div class="eyebrow mono">([^<]*)</div>\s*<h1>[^<]*</h1>\s*'
                  r'<p class="updated mono">([^<]*)</p>\s*<p class="lede">(.*?)</p>(.*?)</main>', s, re.S)
    eyebrow, updated, lede, rest = m.groups()
    desc = re.search(r'<meta name="description" content="([^"]*)">', s).group(1)
    hero = screen(f"{eyebrow.title()} · {updated}", l1, l2, "", lede, "", small=True)
    page = (head(title, desc, f"https://cipherautolab.com/{name}", "legal.css") + bs.header(None)
            + "\n\n<main>\n" + hero + '<section class="legal">\n  <div class="wrap">' + rest.rstrip() + "\n  </div>\n</section>\n</main>\n\n"
            + CALL + FOOTER + "\n</body>\n</html>\n")
    write(f"{name}.html", page)


LEGAL_CSS = """/* Legal pages: reading layout inside the campaign site (styles.css + campaign.css load first). */
.legal{padding:clamp(36px,5vw,56px) 0 clamp(48px,6vw,72px)}
.legal .wrap{max-width:820px}
.legal .toc{background:var(--card);border:1px solid var(--card-line);border-radius:14px;padding:20px 22px;margin:0 0 8px}
.legal .toc p{font-family:JBM,ui-monospace,monospace;font-size:11px;letter-spacing:.24em;color:var(--acc);font-weight:700;margin-bottom:12px}
.legal .toc ol{margin:0;padding-left:20px}
.legal .toc li{font-size:14.5px;margin:5px 0}
.legal .toc a{color:var(--ink);text-decoration:none}
.legal .toc a:hover{color:var(--acc)}
.legal h2{font-size:clamp(20px,2.4vw,24px);font-weight:900;letter-spacing:-.02em;margin:46px 0 12px;scroll-margin-top:96px}
.legal h2 span{color:var(--acc);font-weight:700;font-size:.72em;letter-spacing:.12em;margin-right:12px}
.legal h3{font-size:16px;font-weight:800;margin:24px 0 8px;color:var(--ink)}
.legal p{margin:12px 0;font-size:15.5px;line-height:1.7;color:var(--soft)}
.legal ul,.legal ol.body{margin:12px 0 12px 22px}
.legal li{font-size:15.5px;line-height:1.65;color:var(--soft);margin:7px 0}
.legal strong,.legal b{color:var(--ink)}
.legal em{font-style:normal;color:var(--ink)}
.legal a{color:var(--acc)}
.legal .card{background:var(--card);border:1px solid var(--card-line);border-radius:14px;padding:20px 22px;margin:20px 0}
.legal .card.warn{border-color:#3A3520;background:#14140C}
.legal .card p:first-child{margin-top:0}
.legal .card p:last-child{margin-bottom:0}
.legal table{width:100%;border-collapse:collapse;margin:18px 0;font-size:14.5px}
.legal th,.legal td{text-align:left;padding:11px 12px;border-bottom:1px solid var(--line);color:var(--soft)}
.legal th{font-family:JBM,ui-monospace,monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--mute);font-weight:700}
.legal td b{color:var(--ink)}
.legal .tw{overflow-x:auto}
"""


def do_terms_copy():
    s = read("terms.html")
    s = sub1(s, 'The estimate on the booking form is exactly that — an estimate.</p>',
             'The estimate on the booking form is exactly that — an estimate.</p>\n'
             '  <p><strong>Travel.</strong> We work anywhere in Connecticut. Depending on your town a travel fee may apply; '
             'it is quoted with the price, before you book, and shown on its own line.</p>', "terms")
    write("terms.html", s)


def strip_light_room():
    css = read("styles.css")
    a = css.index("/* ============ PHOTO QUOTE — the light room ============")
    b = css.index("/* the Job Card handoff on the confirmation screen */")
    write("styles.css", css[:a] + css[b:])


def main():
    do_index()
    do_detailing()
    do_tint()
    do_quote()
    do_fleet()
    do_terms_copy()
    for name, l1, l2, title in [("terms", "Terms of", "Service", "Terms of Service — Cipher Auto Lab"),
                                ("privacy", "Privacy", "Policy", "Privacy Policy — Cipher Auto Lab"),
                                ("agreement", "Service", "Agreement", "Service Agreement — Cipher Auto Lab")]:
        do_legal(name, l1, l2, title)
    write("legal.css", LEGAL_CSS)
    strip_light_room()
    print("screens built")


if __name__ == "__main__":
    main()
