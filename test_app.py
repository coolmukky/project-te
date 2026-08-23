#!/usr/bin/env python3
"""Drive the built document in a real browser and check it works.

There is no framework here on purpose. The thing being tested is one HTML file
that has to behave when it is opened from a download folder with no server and
no network, so the test opens it exactly that way - over file:// - and clicks
through it. It then does the same over http:// against src/, because the two
have to stay the same document; a difference between them means the build or
the development asset map has drifted.

The scheduling features are checked against a frozen clock in a timezone that
is deliberately not the event's, because "what am I on next" is the one answer
that is worse than useless when it is confidently wrong.

  python3 test_app.py            everything
  python3 test_app.py --bundle   the file:// bundle only
  python3 test_app.py --dev      the http:// source tree only
  python3 test_app.py --shots DIR  also save a screenshot of each mode

Needs playwright >= 1.45 (for the clock control) and a Chromium. Exits 2,
saying so, if either is missing - that is not a test failure.
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

# The markup carries the staffing itself - who is on what, where and when. Every
# improvement is built from app.js and styles.css so that this file stays exactly
# as the pipeline emitted it, which is what makes "we changed the document, not
# the data" checkable rather than merely claimed. It is also why a regenerated
# document drops in: nothing here is hand-edited. Changing it deliberately means
# updating this digest in the same commit.
MARKUP_SHA256 = "271d564f03e677ec195eda9ca3a626dae04b09f05f97a3e31e2ce6a8cfeedbca"

EVENT_TZ_PROOF = "Europe/Berlin"          # anything but the event's own zone
DURING = "2026-08-24T21:30:00Z"           # Mon 24 Aug, 2:30 PM in Las Vegas
EVENING = "2026-08-25T01:00:00Z"          # Mon 24 Aug, 6:00 PM
BEFORE = "2026-08-20T17:00:00Z"           # four days out
AFTER = "2026-09-10T17:00:00Z"            # a fortnight later
COVERAGE = "2026-08-26T21:45:00Z"         # Wed 26 Aug, 2:45 PM

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


def watch_console(page, sink):
    def on_console(msg):
        if msg.type == "error":
            sink.append(msg.text + "  <" + (msg.location or {}).get("url", "") + ">")

    page.on("console", on_console)
    page.on("pageerror", lambda err: sink.append("pageerror: " + str(err)))


def console_faults(sink):
    # The browser asks for /favicon.ico on its own when something is serving over
    # HTTP. The document never requests it, so a 404 there is not a page fault.
    return [line for line in sink if "favicon.ico" not in line]


def exercise(page, result, shot=None):
    """Everything a reader does with this document, in order."""
    console = []
    watch_console(page, console)

    people = page.locator("section.person").count()
    result.check("every staff package is present", people == 19, "found %d, expected 19" % people)

    images = page.evaluate("""() => {
      const imgs = [...document.querySelectorAll('img[data-asset]')];
      return { tags: imgs.length,
               ids: new Set(imgs.map(i => i.dataset.asset)).size,
               hydrated: imgs.filter(i => i.getAttribute('src')).length };
    }""")
    # Nothing is in the first screenful of this document but the hero, the
    # toolbar and two collapsed sections, so on open there is nothing to
    # hydrate - and the other 242 are not paid for either. If this ever
    # regresses to hydrating everything up front, this is what notices.
    result.check("the document does not hydrate every image up front",
                 images["hydrated"] < images["tags"], json.dumps(images))
    result.note("%d img tags over %d distinct assets; %d hydrated on open"
                % (images["tags"], images["ids"], images["hydrated"]))

    # The contract is that an image is there by the time it is scrolled to.
    arrived = page.evaluate("""async () => {
      const map = document.querySelector('#person-mimi-stewart img[data-asset^="venuemap"]');
      const qr = document.querySelector('#person-mimi-stewart img[data-asset^="qr-"]');
      const before = !!(map && map.getAttribute('src'));
      map.scrollIntoView();
      await new Promise(r => setTimeout(r, 800));
      const mapOk = !!map.getAttribute('src');
      qr.scrollIntoView();
      await new Promise(r => setTimeout(r, 800));
      return { before: before, map: mapOk, qr: !!qr.getAttribute('src') };
    }""")
    result.check("an image arrives by the time it is scrolled to",
                 arrived["map"] and arrived["qr"], json.dumps(arrived))

    # Hydration only sets an attribute. Decoding one proves the payload behind
    # it is a real image, which is what the base64 round trip is riding on.
    decodes = page.evaluate("""async () => {
      const el = document.querySelector('#person-mimi-stewart img[data-asset^="qr-"]');
      if (!el || !el.getAttribute('src')) return false;
      const probe = new Image();
      probe.src = el.getAttribute('src');
      try { await probe.decode(); } catch (e) { return false; }
      return probe.naturalWidth > 0;
    }""")
    result.check("a QR payload decodes to a real image", decodes)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(300)

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

    exercise_access(page, result)
    exercise_theme(page, result)
    exercise_print_pack(page, result)

    # Print opens every foldout; the reader is holding paper and cannot expand one.
    page.emulate_media(media="print")
    page.wait_for_timeout(400)
    printed = page.evaluate("""() => {
      const shut = [...document.querySelectorAll('details.fold')].filter(d => !d.open).length;
      const dry = [...document.querySelectorAll('img[data-asset]')].filter(i => !i.getAttribute('src')).length;
      const chrome = ['.nowbar', '.mebtn', '.calbtn', '.toolbar']
        .map(sel => document.querySelector(sel))
        .filter(el => el && getComputedStyle(el).display !== 'none').length;
      const pill = getComputedStyle(document.querySelector('.card-when'), '::after').content;
      return { shut, chrome, pill, dry, ink: getComputedStyle(document.documentElement)
                 .getPropertyValue('--ink').trim() };
    }""")
    result.check("printing expands every foldout", printed["shut"] == 0,
                 "%d still closed" % printed["shut"])
    # Paper cannot scroll, so an image hydrated on approach has to be forced in
    # before the snapshot. A pack printed with holes where the room plans go is
    # a worse failure than any load time this buys back.
    result.check("printing hydrates every image first", printed["dry"] == 0,
                 "%d images still empty on paper" % printed["dry"])
    result.check("screen-only chrome is not printed", printed["chrome"] == 0, json.dumps(printed))
    result.check("no live state pill reaches paper", printed["pill"] in ("none", '""'), printed["pill"])
    # The dark tokens live inside @media screen, so paper stays paper even when
    # the reader is on the dark theme - which they are, exercise_theme left it on.
    result.check("the dark theme does not reach paper", printed["ink"] == "#14181f", printed["ink"])
    page.emulate_media(media="screen")
    page.wait_for_timeout(300)

    if shot:
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(300)
        page.screenshot(path=str(shot))
        result.note("screenshot: %s" % shot)

    result.check("no console errors", not console_faults(console), "; ".join(console_faults(console)[:3]))


def exercise_access(page, result):
    """The keyboard and screen-reader paths, which the mouse never exercises."""
    live = page.evaluate("""() => {
      const c = document.getElementById('count');
      return { role: c.getAttribute('role'), live: c.getAttribute('aria-live') };
    }""")
    result.check("the result count announces itself",
                 live["role"] == "status" and live["live"] == "polite", json.dumps(live))

    labelled = page.evaluate("""() => {
      const imgs = [...document.querySelectorAll('img[data-zoom]')];
      return { n: imgs.length,
               unreachable: imgs.filter(i => i.getAttribute('tabindex') !== '0').length,
               unlabelled: imgs.filter(i => !i.getAttribute('aria-label')).length };
    }""")
    result.check("every zoomable diagram is reachable by keyboard",
                 labelled["n"] > 0 and labelled["unreachable"] == 0 and labelled["unlabelled"] == 0,
                 json.dumps(labelled))

    # Open the lightbox from the keyboard and make sure focus goes in and comes back.
    page.evaluate("window.scrollTo(0, 0)")
    page.evaluate("document.querySelector('img[data-zoom]').focus()")
    page.keyboard.press("Enter")
    page.wait_for_timeout(300)
    inside = page.evaluate("""() => {
      const box = document.getElementById('lightbox');
      return { open: box.classList.contains('open'),
               modal: box.getAttribute('aria-modal'),
               focusInside: box.contains(document.activeElement) };
    }""")
    result.check("Enter on a diagram opens the lightbox and takes focus",
                 inside["open"] and inside["focusInside"] and inside["modal"] == "true",
                 json.dumps(inside))

    page.keyboard.press("Tab")
    page.wait_for_timeout(150)
    result.check("Tab stays inside the open lightbox", page.evaluate(
        "document.getElementById('lightbox').contains(document.activeElement)"))

    page.keyboard.press("Escape")
    page.wait_for_timeout(250)
    back = page.evaluate("""() => ({
      open: document.getElementById('lightbox').classList.contains('open'),
      restored: !!document.activeElement && document.activeElement.matches('img[data-zoom]')
    })""")
    result.check("closing gives focus back to the diagram",
                 not back["open"] and back["restored"], json.dumps(back))

    # "/" is the search shortcut everywhere else; it should be here too.
    page.evaluate("document.body.focus()")
    page.keyboard.press("/")
    page.wait_for_timeout(200)
    result.check("slash focuses the search box",
                 page.evaluate("document.activeElement === document.getElementById('q')"))
    page.fill("#q", "lagoon")
    page.wait_for_timeout(300)
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    result.check("Escape clears the search box", page.evaluate(
        "document.getElementById('q').value === '' && "
        "[...document.querySelectorAll('section.person')].filter(s => s.offsetParent !== null).length === 19"))


def exercise_theme(page, result):
    """The dark theme, and that it is remembered."""
    start = page.evaluate("document.documentElement.getAttribute('data-theme')")
    result.check("a theme is resolved and stamped on load", start in ("light", "dark"), repr(start))

    page.click("#themebtn")
    page.wait_for_timeout(300)
    dark = page.evaluate("""() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      stored: (() => { try { return localStorage.getItem('tsrm.theme'); } catch (e) { return 'unavailable'; } })(),
      canvas: getComputedStyle(document.body).backgroundColor,
      ink: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()
    })""")
    result.check("the toggle switches to the dark theme and remembers it",
                 dark["theme"] == "dark" and dark["stored"] in ("dark", "unavailable"),
                 json.dumps(dark))

    # A QR code on a dark ground will not scan, so the plate has to survive.
    plates = page.evaluate("""() => {
      const qr = document.querySelector('.qr img');
      const diagram = document.querySelector('.diagram-wrap');
      return { qr: qr && getComputedStyle(qr).backgroundColor,
               diagram: diagram && getComputedStyle(diagram).backgroundColor };
    }""")
    result.check("codes and plans keep their white plate in the dark",
                 plates["qr"] == "rgb(255, 255, 255)" and plates["diagram"] == "rgb(255, 255, 255)",
                 json.dumps(plates))

    # Headings must not be dark ink on a dark panel.
    contrast = page.evaluate("""() => {
      const h = document.querySelector('.section-title');
      const lum = (c) => {
        const [r, g, b] = c.match(/\\d+/g).map(Number).map(v => {
          v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ink = lum(getComputedStyle(h).color);
      const paper = lum(getComputedStyle(document.body).backgroundColor);
      const [hi, lo] = ink > paper ? [ink, paper] : [paper, ink];
      return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
    }""")
    result.check("section headings stay legible on the dark ground", contrast >= 4.5,
                 "contrast ratio %s" % contrast)
    result.note("section heading contrast on dark: %s:1" % contrast)


def exercise_schedule(page, result, expect):
    """The now/next line, the card states, who the reader is, and the export.

    Driven by a frozen clock in a foreign timezone, because every time in this
    document is Las Vegas wall clock and a reader's phone very often is not.
    """
    console = []
    watch_console(page, console)

    zone = page.evaluate("Intl.DateTimeFormat().resolvedOptions().timeZone")
    result.check("the device is deliberately not on event time",
                 zone == EVENT_TZ_PROOF, repr(zone))

    state = page.evaluate("""() => ({
      live: document.querySelectorAll('.card.is-live').length,
      done: document.querySelectorAll('.card.is-done').length,
      bar: document.getElementById('nowbar').innerText.replace(/\\n+/g, ' | '),
      hidden: document.getElementById('nowbar').hidden
    })""")
    result.check("sessions running now are marked as running",
                 state["live"] == expect["live"], "live=%d, expected %d" % (state["live"], expect["live"]))
    result.check("sessions already over are marked finished",
                 state["done"] == expect["done"], "done=%d, expected %d" % (state["done"], expect["done"]))

    page.evaluate("document.querySelector('[data-me=\\'arun-boddu\\']').click()")
    page.wait_for_timeout(300)
    mine = page.evaluate("""() => ({
      bar: document.getElementById('nowbar').innerText.replace(/\\n+/g, ' | '),
      hidden: document.getElementById('nowbar').hidden,
      marked: document.querySelectorAll('.person.is-mine').length,
      chip: document.getElementById('mychip').hidden ? null
            : document.getElementById('mychip').textContent
    })""")
    result.check("marking a package marks exactly one",
                 mine["marked"] == 1 and mine["chip"] and "Arun Boddu" in mine["chip"],
                 json.dumps(mine))
    result.check("the now/next line says what it should",
                 (expect["says"] in mine["bar"]) and mine["hidden"] == expect["hidden"],
                 "expected %r in %r (hidden=%s)" % (expect["says"], mine["bar"], mine["hidden"]))
    result.note(mine["bar"] or "(nothing shown)")

    result.check("no console errors", not console_faults(console), "; ".join(console_faults(console)[:3]))


def exercise_print_pack(page, result):
    """Printing one pack must not depend on beforeprint firing.

    The button calls window.print() itself, and Safari and older Chrome do not
    reliably fire beforeprint - the same reason initPersonPrint already watches
    a print media query to undo itself. A pack printed straight from a document
    nobody scrolled through would otherwise come out with holes where the room
    plans should be.
    """
    state = page.evaluate("""async () => {
      const printed = [];
      const real = window.print;
      window.print = function () { printed.push(true); };
      const person = document.getElementById('person-lawrence-chase');
      const imgs = [...person.querySelectorAll('img[data-asset]')];
      const before = imgs.filter(i => i.getAttribute('src')).length;
      person.querySelector('[data-print-person]').click();
      const after = imgs.filter(i => i.getAttribute('src')).length;
      const dry = [...document.querySelectorAll('img[data-asset]')]
        .filter(i => !i.getAttribute('src')).length;
      // the handler defers window.print() by a tick so the class can land
      await new Promise(r => setTimeout(r, 80));
      window.print = real;
      document.body.classList.remove('printing-one');
      person.classList.remove('print-target');
      return { before, after, total: imgs.length, dry, target: printed.length };
    }""")
    result.check("printing one pack hydrates the whole document first",
                 state["target"] == 1 and state["dry"] == 0 and state["after"] == state["total"],
                 json.dumps(state))
    result.note("%d of this pack's %d images were hydrated before the click"
                % (state["before"], state["total"]))


def exercise_coverage(page, result):
    """Seven cards print the staffer's own hours, not the session's.

    TEBOF34 runs 2:30-3:30 PM on the Wednesday and Arun Boddu is on it from
    3:00. At 2:45 the session is under way and he is not, and the card has to
    say so - reading the session's hours here would send a staffer to a room
    fifteen minutes before anyone expects them, and would have told them the
    wrong thing about when they were free.
    """
    state = page.evaluate("""() => {
      const card = document.getElementById('s-arun-boddu-tebof34-46260');
      const session = [...card.querySelectorAll('.kv .k')]
        .filter(k => k.textContent.trim() === 'Session time')
        .map(k => k.parentNode.querySelector('.v').textContent.trim())[0];
      return { hours: card.querySelector('.card-when').textContent.trim(),
               session: session, live: card.classList.contains('is-live') };
    }""")
    result.check("the card is read as the staffer's hours, not the session's",
                 state["hours"].startswith("Your hours:")
                 and state["session"] == "2:30 PM \u2013 3:30 PM",
                 json.dumps(state))
    result.check("a session already running does not mark its staffer as on",
                 state["live"] is False, json.dumps(state))
    result.note("%s (session runs %s) - not on yet at 2:45 PM"
                % (state["hours"], state["session"]))


def exercise_memory(page, result, reopen):
    """The mark has to survive closing the file, or it is not worth making."""
    page.evaluate("document.querySelector('[data-me=\\'mimi-stewart\\']').click()")
    page.wait_for_timeout(300)
    stored = page.evaluate(
        "(() => { try { return localStorage.getItem('tsrm.me'); } catch (e) { return null; } })()")
    result.check("the mark is written down", stored == "mimi-stewart", repr(stored))

    reopen()
    page.wait_for_timeout(1200)
    again = page.evaluate("""() => ({
      marked: [...document.querySelectorAll('.person.is-mine')].map(s => s.dataset.person),
      chip: document.getElementById('mychip').hidden ? null : document.getElementById('mychip').href
    })""")
    result.check("and is still there when the document is reopened",
                 again["marked"] == ["mimi-stewart"] and (again["chip"] or "").endswith("#person-mimi-stewart"),
                 json.dumps(again))


def exercise_calendar(page, result):
    """The .ics a staffer hands to the phone in their pocket."""
    cards = page.evaluate(
        "document.querySelectorAll('#person-arun-boddu .card[data-day]').length")
    with page.expect_download() as caught:
        page.evaluate("document.querySelector('[data-calendar=\\'arun-boddu\\']').click()")
    download = caught.value
    # Bytes, not read_text: universal newlines would rewrite every CRLF the
    # format requires into LF, and the fold checks below would test nothing.
    body = pathlib.Path(download.path()).read_bytes().decode("utf-8")

    result.check("the file is named for the person",
                 download.suggested_filename == "tech-elevate-arun-boddu.ics",
                 download.suggested_filename)
    result.check("it is a calendar, with one event per assignment",
                 body.startswith("BEGIN:VCALENDAR")
                 and body.rstrip().endswith("END:VCALENDAR")
                 and body.count("BEGIN:VEVENT") == cards,
                 "%d events for %d cards" % (body.count("BEGIN:VEVENT"), cards))

    lines = body.split("\r\n")
    result.check("every line is CRLF-terminated", body.endswith("\r\n") and "\n" not in body.replace("\r\n", ""))
    longest = max(len(line.encode("utf-8")) for line in lines)
    result.check("no content line exceeds the 75-octet fold", longest <= 75, "longest %d octets" % longest)

    # The whole point of resolving the event zone: 2:00 PM in Las Vegas is
    # 21:00 UTC, whatever the reader's own clock says.
    result.check("times are exported as the right absolute instant",
                 "DTSTART:20260824T210000Z" in body and "DTEND:20260824T223000Z" in body,
                 "\n".join(l for l in lines if l.startswith("DT"))[:200])
    result.check("text is escaped for the format",
                 "\\," in body or "\;" in body or "\\n" in body)
    result.check("each event has a stable identity",
                 body.count("UID:") == body.count("BEGIN:VEVENT")
                 and "@tsrm-gsx-fy27" in body)
    result.note("%d events, longest line %d octets" % (body.count("BEGIN:VEVENT"), longest))


def exercise_degraded(page, result):
    """With scripting unavailable the reader still gets the whole document."""
    shape = page.evaluate("""() => ({
      people: document.querySelectorAll('section.person').length,
      cards: document.querySelectorAll('.card[data-day]').length,
      injected: document.querySelectorAll('.nowbar, .mebtn, .calbtn, #themebtn, #mychip').length,
      theme: document.documentElement.getAttribute('data-theme'),
      foldsOpen: [...document.querySelectorAll('details.fold')].every(d => d.open)
    })""")
    result.check("all 19 packages and 104 assignments are still there",
                 shape["people"] == 19 and shape["cards"] == 104, json.dumps(shape))
    result.check("nothing was injected and no theme was forced",
                 shape["injected"] == 0 and shape["theme"] is None, json.dumps(shape))
    result.check("the collapsible sections are open, so nothing is buried",
                 shape["foldsOpen"], json.dumps(shape))


def run(browser, url, label, shot=None):
    print(label)
    result = Result(label)
    context = browser.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
    page = context.new_page()
    try:
        page.goto(url, wait_until="load")
        page.wait_for_timeout(1200)
        exercise(page, result, shot)
        exercise_calendar(page, result)
        exercise_memory(page, result, lambda: page.reload(wait_until="load"))
    finally:
        context.close()
    return result


def run_clock(browser, url, when, label, expect):
    print(label)
    result = Result(label)
    context = browser.new_context(viewport={"width": 420, "height": 900},
                                  timezone_id=EVENT_TZ_PROOF)
    page = context.new_page()
    try:
        page.clock.install(time=when)
        page.goto(url, wait_until="load")
        page.wait_for_timeout(1200)
        exercise_schedule(page, result, expect)
        if when == COVERAGE:
            exercise_coverage(page, result)
    finally:
        context.close()
    return result


def run_degraded(browser, url, label):
    print(label)
    result = Result(label)
    context = browser.new_context(java_script_enabled=False,
                                  viewport={"width": 1280, "height": 900})
    page = context.new_page()
    try:
        page.goto(url, wait_until="load")
        page.wait_for_timeout(600)
        exercise_degraded(page, result)
    finally:
        context.close()
    return result


CLOCKS = [
    (DURING, "during a session",
     {"live": 19, "done": 0, "hidden": False, "says": "ON NOW"}),
    (EVENING, "after the day's last session",
     {"live": 0, "done": 24, "hidden": False, "says": "NEXT"}),
    (BEFORE, "four days before the event",
     {"live": 0, "done": 0, "hidden": False, "says": "STARTS"}),
    (AFTER, "a fortnight after the event",
     {"live": 0, "done": 0, "hidden": True, "says": ""}),
    # Wednesday 2:45 PM. TEBOF34 has been under way since 2:30, but Arun is on
    # TEDC10-1 until 3:00 and only then picks it up - so the line has to read
    # "then 3:00", his hours, rather than "on now since 2:30", the session's.
    (COVERAGE, "a session running before its staffer is on",
     {"live": 19, "done": 60, "hidden": False, "says": "THEN | Wed 8/26, 3:00 PM"}),
]


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

    print("source")
    top = Result("source")
    markup = hashlib.sha256((SRC / "index.html").read_bytes()).hexdigest()
    top.check("the markup is byte for byte the published document", markup == MARKUP_SHA256,
              "sha256 %s, expected %s" % (markup, MARKUP_SHA256))
    top.note("every improvement lives in app.js and styles.css; the staffing data is untouched")

    html = build.bundle()
    top.note("bundle %.1f MB" % (len(html.encode("utf-8")) / 1024 / 1024))
    results = [top]

    with tempfile.TemporaryDirectory() as tmp:
        bundle_path = pathlib.Path(tmp) / "index.html"
        build.write(bundle_path, html)
        bundle_url = bundle_path.as_uri()
        with sync_playwright() as pw:
            try:
                browser = pw.chromium.launch(executable_path=chromium)
            except Exception as err:
                print("could not start Chromium: %s" % err, file=sys.stderr)
                return 2
            try:
                if both or args.bundle:
                    results.append(run(browser, bundle_url, "bundle, opened from disk (file://)",
                                       args.shots and args.shots / "bundle.png"))
                    results.append(run_degraded(browser, bundle_url, "bundle, with scripting off"))
                    if not hasattr(browser.new_context().new_page(), "clock"):
                        print("playwright has no clock control - skipping the scheduling checks",
                              file=sys.stderr)
                    else:
                        for when, label, expect in CLOCKS:
                            results.append(run_clock(browser, bundle_url, when,
                                                     "bundle, clock set to " + label, expect))
                if both or args.dev:
                    with serving(SRC) as url:
                        results.append(run(browser, url, "source tree, over a static server (http://)",
                                           args.shots and args.shots / "dev.png"))
            finally:
                browser.close()

    print()
    failed = [name for r in results for name in r.failed]
    for r in results:
        print("%-46s %s" % (r.label, "PASS" if not r.failed else "FAIL: " + ", ".join(r.failed)))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
