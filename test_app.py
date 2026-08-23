#!/usr/bin/env python3
"""Drive the built document in a real browser and check it works.

There is no framework here on purpose. The thing being tested is one HTML file
that has to behave when it is opened from a download folder with no server and
no network, so the test opens it exactly that way - over file:// - and clicks
through it. It then does the same over http:// against src/, because the two
have to stay the same document; a difference between them means the build or
the development asset map has drifted.

  python3 test_app.py            both modes
  python3 test_app.py --bundle   the file:// bundle only
  python3 test_app.py --dev      the http:// source tree only
  python3 test_app.py --shots DIR  also save a screenshot of each mode

Needs playwright (pip install playwright) and a Chromium. Exits 2, saying so,
if either is missing - that is not a test failure.
"""

import argparse
import contextlib
import functools
import hashlib
import http.server
import json
import os
import pathlib
import socketserver
import sys
import tempfile
import threading

import build

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"

# The document this project was reconstructed from, byte for byte. build.py
# rebuilds it exactly, so any change to src/ that is not meant to alter the
# published document will trip this - and any change that IS meant to will
# trip it too, at which point you update the digest in the same commit.
REFERENCE_SHA256 = "bb6286dc36c8ce402cc39670ff3330106fea4f870e02d1bb434495beb26e240a"

CHROMIUM_CANDIDATES = [
    "/opt/pw-browsers/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
]


class Result:
    def __init__(self, label):
        self.label = label
        self.failed = []

    def check(self, name, ok, detail=""):
        print(("  ok   " if ok else "  FAIL ") + name + (("  " + detail) if detail and not ok else ""))
        if not ok:
            self.failed.append(name)

    def note(self, text):
        print("       " + text)


@contextlib.contextmanager
def serving(directory):
    """A static server over src/, on whatever port the OS hands out."""
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass  # one line per asset is 60 lines of noise around the checks

    handler = functools.partial(Quiet, directory=str(directory))
    with socketserver.TCPServer(("127.0.0.1", 0), handler) as httpd:
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            yield "http://127.0.0.1:%d/index.html" % httpd.server_address[1]
        finally:
            httpd.shutdown()


def exercise(page, result, shot=None):
    """Everything a reader does with this document, in order."""
    console = []

    def on_console(msg):
        if msg.type == "error":
            console.append(msg.text + "  <" + (msg.location or {}).get("url", "") + ">")

    page.on("console", on_console)
    page.on("pageerror", lambda err: console.append("pageerror: " + str(err)))

    people = page.locator("section.person").count()
    result.check("every staff package is present", people == 19, "found %d, expected 19" % people)

    images = page.evaluate("""() => {
      const imgs = [...document.querySelectorAll('img[data-asset]')];
      return { tags: imgs.length,
               ids: new Set(imgs.map(i => i.dataset.asset)).size,
               blank: imgs.filter(i => !i.getAttribute('src')).length };
    }""")
    result.check("every image was hydrated from the asset map",
                 images["tags"] > 0 and images["blank"] == 0, json.dumps(images))
    result.note("%d img tags drawing on %d distinct assets" % (images["tags"], images["ids"]))

    # Hydration only sets an attribute. Decoding one proves the payload behind
    # it is a real image, which is what the base64 round trip is riding on.
    decodes = page.evaluate("""async () => {
      const el = document.querySelector('img[data-asset^="qr-"]');
      if (!el) return false;
      const probe = new Image();
      probe.src = el.getAttribute('src');
      try { await probe.decode(); } catch (e) { return false; }
      return probe.naturalWidth > 0;
    }""")
    result.check("a QR payload decodes to an image", decodes)

    toolbar_h = page.evaluate(
        "getComputedStyle(document.documentElement).getPropertyValue('--toolbar-h')").strip()
    result.check("the toolbar measured itself at runtime",
                 toolbar_h.endswith("px") and float(toolbar_h[:-2]) > 0, repr(toolbar_h))

    # A name matches the person and anyone paired with them - a partner's card
    # names them, and surfacing that pairing is the point of the search.
    page.fill("#q", "Arun Boddu")
    page.wait_for_timeout(400)
    by_name = page.evaluate("""() => {
      const vis = [...document.querySelectorAll('section.person')].filter(s => s.offsetParent !== null);
      return { n: vis.length, ids: vis.map(s => s.dataset.person),
               count: document.getElementById('count').textContent };
    }""")
    result.check("a name search finds the person and their pairings",
                 "arun-boddu" in by_name["ids"] and 1 <= by_name["n"] < 19, json.dumps(by_name))
    result.note("%s -> %s" % (by_name["count"], ", ".join(by_name["ids"])))

    # A GSXID is the sharp lookup: nothing without that session should survive.
    page.fill("#q", "TEDC24")
    page.wait_for_timeout(400)
    by_id = page.evaluate("""() => {
      const cards = [...document.querySelectorAll('.card[data-search]')].filter(c => c.offsetParent !== null);
      const people = [...document.querySelectorAll('section.person')].filter(s => s.offsetParent !== null);
      return { cards: cards.length, people: people.length,
               offTarget: cards.filter(c => !(c.dataset.search || '').includes('tedc24')).length };
    }""")
    result.check("a GSXID search keeps only that session's cards",
                 by_id["cards"] > 0 and by_id["offTarget"] == 0 and by_id["people"] < 19,
                 json.dumps(by_id))

    page.fill("#q", "zzzznotathing")
    page.wait_for_timeout(400)
    result.check("a search with no hits explains itself", page.evaluate(
        "(() => { const e = document.querySelector('.no-results'); return !!e && e.offsetParent !== null; })()"))

    page.click("#clear")
    page.wait_for_timeout(300)
    restored = page.evaluate(
        "[...document.querySelectorAll('section.person')].filter(s => s.offsetParent !== null).length")
    result.check("Clear restores the whole document", restored == 19, str(restored))

    page.click(".chip[data-day='2026-08-27']")
    page.wait_for_timeout(400)
    by_day = page.evaluate("""() => {
      const cards = [...document.querySelectorAll('.card[data-search]')].filter(c => c.offsetParent !== null);
      return { cards: cards.length, offTarget: cards.filter(c => c.dataset.day !== '2026-08-27').length };
    }""")
    result.check("a day chip keeps only that day",
                 by_day["cards"] > 0 and by_day["offTarget"] == 0, json.dumps(by_day))
    page.click("#clear")
    page.wait_for_timeout(300)

    # The reason initAnchorScroll exists: the toolbar is sticky, so a jump that
    # lands at the element's own top puts the heading underneath it.
    page.evaluate("window.scrollTo(0, 0)")
    page.click("a[data-person-key='arun-boddu']")
    page.wait_for_timeout(1200)
    landing = page.evaluate("""() => {
      const el = document.getElementById('person-arun-boddu');
      const bar = document.querySelector('.toolbar');
      return { heading: el.getBoundingClientRect().top, toolbar: bar.getBoundingClientRect().bottom };
    }""")
    result.check("a jump lands clear of the sticky toolbar",
                 landing["toolbar"] - 1 <= landing["heading"] < landing["toolbar"] + 80,
                 json.dumps(landing))

    page.evaluate("window.scrollTo(0, 0)")
    opened = page.evaluate("""() => {
      const img = document.querySelector('img[data-zoom]');
      if (!img) return 'no zoomable image in the document';
      img.click();
      return document.getElementById('lightbox').classList.contains('open') || 'lightbox stayed shut';
    }""")
    result.check("a room diagram opens in the lightbox", opened is True, str(opened))
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    result.check("Escape closes the lightbox",
                 page.evaluate("!document.getElementById('lightbox').classList.contains('open')"))

    # Print opens every foldout; the reader is holding paper and cannot expand one.
    page.emulate_media(media="print")
    page.wait_for_timeout(400)
    folded = page.evaluate(
        "[...document.querySelectorAll('details.fold')].filter(d => !d.open).length")
    result.check("printing expands every foldout", folded == 0, "%d still closed" % folded)
    page.emulate_media(media="screen")
    page.wait_for_timeout(300)

    if shot:
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(300)
        page.screenshot(path=str(shot))
        result.note("screenshot: %s" % shot)

    # The browser asks for /favicon.ico on its own when something is serving over
    # HTTP. The document never requests it, so a 404 there is not a page fault.
    console = [line for line in console if "favicon.ico" not in line]
    result.check("no console errors", not console, "; ".join(console[:3]))


def run(url, label, browser, shot=None):
    print(label)
    result = Result(label)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    try:
        page.goto(url, wait_until="load")
        page.wait_for_timeout(1200)
        exercise(page, result, shot)
    finally:
        page.close()
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--bundle", action="store_true", help="test the file:// bundle only")
    parser.add_argument("--dev", action="store_true", help="test the http:// source tree only")
    parser.add_argument("--shots", type=pathlib.Path, help="save a screenshot per mode into DIR")
    args = parser.parse_args(argv)
    both = not (args.bundle or args.dev)

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright is not installed - pip install playwright", file=sys.stderr)
        return 2
    chromium = next((c for c in CHROMIUM_CANDIDATES if os.path.exists(c)), None)

    if args.shots:
        args.shots.mkdir(parents=True, exist_ok=True)

    html = build.bundle()
    digest = hashlib.sha256(html.encode("utf-8")).hexdigest()
    print("bundle")
    top = Result("bundle")
    top.check("rebuilds the reference document byte for byte", digest == REFERENCE_SHA256,
              "sha256 %s, expected %s" % (digest, REFERENCE_SHA256))
    top.note("%.1f MB" % (len(html.encode("utf-8")) / 1024 / 1024))
    results = [top]

    with tempfile.TemporaryDirectory() as tmp:
        bundle_path = pathlib.Path(tmp) / "index.html"
        build.write(bundle_path, html)
        with sync_playwright() as pw:
            try:
                browser = pw.chromium.launch(executable_path=chromium)
            except Exception as err:
                print("could not start Chromium: %s" % err, file=sys.stderr)
                return 2
            try:
                if both or args.bundle:
                    results.append(run(bundle_path.as_uri(), "bundle, opened from disk (file://)",
                                       browser, args.shots and args.shots / "bundle.png"))
                if both or args.dev:
                    with serving(SRC) as url:
                        results.append(run(url, "source tree, over a static server (http://)",
                                           browser, args.shots and args.shots / "dev.png"))
            finally:
                browser.close()

    print()
    failed = [name for r in results for name in r.failed]
    for r in results:
        print("%-45s %s" % (r.label, "PASS" if not r.failed else "FAIL: " + ", ".join(r.failed)))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
