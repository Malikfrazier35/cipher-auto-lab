"""Serve a site folder the way Vercel will: cleanUrls (x.html -> 308 /x, /x serves x.html),
vercel.json rewrites and response headers. Test use only.
    python3 vercel_like_server2.py SITE_DIR PORT
"""
import json, re, sys, pathlib, http.server, functools

ROOT = pathlib.Path(sys.argv[1]).resolve(); PORT = int(sys.argv[2])
CFG = json.loads((ROOT / "vercel.json").read_text())
CLEAN = CFG.get("cleanUrls", False)


def to_regex(src):
    return re.compile("^" + src + "$")


REWRITES = [(to_regex(r["source"]), r["destination"]) for r in CFG.get("rewrites", [])]
HEADERS = [(to_regex(h["source"]), h["headers"]) for h in CFG.get("headers", [])]


class H(http.server.SimpleHTTPRequestHandler):
    def _clean(self):
        p = self.path.split("?", 1)[0]
        if not CLEAN:
            return None
        if p.endswith(".html"):
            target = p[:-5]
            if target.endswith("/index"):
                target = target[:-5]
            return target or "/"
        if p != "/" and p.endswith("/"):
            return p.rstrip("/")
        return None

    def do_GET(self):
        target = self._clean()
        if target is not None:
            self.send_response(308)
            self.send_header("Location", target)
            self.end_headers()
            return
        super().do_GET()

    def translate_path(self, path):
        p = path.split("?", 1)[0].split("#", 1)[0]
        for rx, dest in REWRITES:
            if rx.match(p):
                p = dest
                break
        fs = super().translate_path(p)
        if CLEAN and p != "/" and not pathlib.Path(fs).exists() and pathlib.Path(fs + ".html").exists():
            fs = fs + ".html"
        return fs

    def end_headers(self):
        p = self.path.split("?", 1)[0]
        for rx, hs in HEADERS:
            if rx.match(p):
                for h in hs:
                    self.send_header(h["key"], h["value"])
        super().end_headers()

    def log_message(self, *a):
        pass


http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(H, directory=str(ROOT))).serve_forever()
