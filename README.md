# Tech Elevate @ GSX FY27 — TSRM Staff Packages

A per-staff session package for the Tech Elevate event at GSX FY27: 19 staff,
104 assignments across 72 session instances, with room diagrams, venue maps,
Webex QR codes, and a flagged list of every tight connection and overlap.

It ships as **one HTML file**. Staff open it from a download folder in a
convention centre, so it assumes no network, no server, no install and no
dependencies — the stylesheet, the script and all 66 images are folded into
the file itself.

```
python3 build.py            # -> dist/index.html   (4.8 MB, open it directly)
```

## What it does beyond printing

Everything below is built from `app.js` and `styles.css`. With scripting
unavailable the document falls back to exactly the published page — same
layout, same content, nothing missing.

- **Now / next.** Once the event is running, a strip at the top says what the
  reader is on and what comes next, and every card is marked *on now* or
  *finished*. It only appears on an event day; read a week early it stays out
  of the way and just says when things start.
- **"This is me."** Nineteen people share one document and each wants one
  package out of it. Marking yours is remembered, puts a jump chip in the
  toolbar, and is what makes the now/next line answerable.
- **Add to calendar.** Any package exports as an `.ics` a phone will take,
  built in the browser with no network — room as location, the Webex EURL in
  the body, and stable UIDs so a re-import updates rather than duplicates.
- **Dark theme.** Follows the system setting, with a toggle that sticks. Room
  plans and QR codes keep a white plate; a QR code on a dark ground will not
  scan.
- **Keyboard and screen reader.** `/` focuses the search. Diagrams open with
  Enter, the lightbox takes and returns focus, and the result count announces
  itself when a filter changes what is on screen.

Two details that are easy to get wrong and are checked:

- **Times are Las Vegas wall clock, not the reader's.** Staff read this on the
  plane. Every time is resolved through the event's own zone and compared as an
  absolute instant, so a phone still on Eastern is not told it has 3 hours when
  it has none.
- **Seven cards print the staffer's own hours, not the session's** — "Your
  hours: 3:00 PM – 3:30 PM" against a session that runs from 2:30. Those hours
  are what now/next and the calendar export both use, because they are when
  that person is actually on.

## Publishing it

`.github/workflows/pages.yml` builds the single file and deploys it to GitHub
Pages. It is **manual-trigger only** — Actions → Publish to GitHub Pages → Run
workflow — and will not run on a push.

That is not caution for its own sake. This is a staff pack: it names 19 people
and carries 88 Webex meeting passwords and 104 join links, each also encoded in
a QR code. **A Pages site is readable by anyone who has the URL even when the
repository behind it is private** — private Pages needs access control on
GitHub Enterprise Cloud. Making the repo private protects the git history, not
the published site.

So the workflow refuses to deploy while the built document still contains
meeting passwords, unless it is run with `publish_credentials: yes`. It also
checks the markup digest, so a document that has been edited away from the
published one does not go up.

Before it can run at all:

1. The workflow has to be on the default branch — `workflow_dispatch` only
   appears in the Actions UI for workflows on `main`.
2. Settings → Pages → Source: **GitHub Actions**.

## Working on it

`src/` is the same document with the parts kept as real files. It is what you
edit, and it runs as-is over any static server — no build step in the loop:

```
python3 -m http.server -d src 8000     # -> http://localhost:8000
```

Nothing in the markup differs between the two modes. `hydrateImages()` in
`app.js` assigns whatever `window.__TSRM_ASSETS__` holds for an asset id
to `img.src`, and a relative URL (development) works there exactly as a
`data:` URI does (bundle). `build.py` swaps one map for the other.

```
src/index.html          markup — generated, and deliberately never hand-edited
src/styles.css          stylesheet, including the print and dark sheets
src/app.js              search, filters, scheduling, calendar, theme, lightbox
src/assets/*.jpg|png    room diagrams, venue maps, session QR codes
src/assets/manifest.js  generated: asset id -> URL, for the development mode
build.py                bundles src/ into the single file
test_app.py             drives the result in a browser
```

`src/index.html` is held byte for byte as the pipeline emitted it, and a test
asserts its digest. That is what makes "the improvements changed the document,
not the data" checkable rather than merely claimed — and it means a regenerated
document drops straight in, because nothing in it is hand-edited. Everything is
read back out of the rendered markup instead: the schedule comes from each
card's `data-day` and its printed time range, so a card and the features built
on it cannot disagree.

A room diagram appears on every card for a session held in that room, so each
image is stored once under an id and the markup carries only the id. Inlining
the base64 at each of the 242 use sites would multiply the file several times
over.

Images are addressed by file name: `src/assets/qr-tedc24.png` is the asset id
`qr-tedc24`, which is what `data-asset="qr-tedc24"` in the markup refers to.
To add or replace one, drop the file in and run `python3 build.py --assets` to
regenerate the development map.

## Load time

Assigning all 242 image sources on open was about 250 ms of the ~900 ms before
the document was interactive, because each assignment decodes an image there
and then. They are now hydrated as they come within 1200 px of the viewport,
which measured **-27%** on a phone-sized viewport (905 ms → 658 ms, medians of
10 interleaved runs). Anything heading for paper hydrates everything first, and
an engine without `IntersectionObserver` hydrates eagerly as before.

Emitting the 4.3 MB asset payload as `JSON.parse("…")` rather than an object
literal — the usual advice — was tried and measured at 8 ms over 12 interleaved
runs each. That is noise, so it was reverted.

## Tests

```
pip install playwright && playwright install chromium
python3 test_app.py
```

It opens the built file over `file://` — the way staff actually open it — and
clicks through it: search by name and by GSXID, the day chips, the empty-search
state, anchor jumps landing clear of the sticky toolbar, images arriving as
they are scrolled to, the diagram lightbox, the calendar export, the dark
theme, the keyboard paths, and print expanding every foldout and hydrating
every image. Then it does the same over `http://` against `src/`, because the
two have to stay the same document.

The scheduling is driven by a frozen clock in `Europe/Berlin` — deliberately
not the event's zone — across five moments: mid-session, after the day's last
session, before the event, long after it, and the awkward one where a session
is already running but its staffer is not yet on. It also loads once with
scripting disabled, to check the document still holds all 19 packages and 104
assignments with nothing injected.

Needs playwright ≥ 1.45 for the clock control.

## Where the content comes from

The document is generated output. Session data, rooms, EURLs and QR codes come
from *CURSOR-TE Sessions Details.xlsx*; assignments, staffing notes and flags
from *CURSOR-TE TSRM Staff Assignment.xlsx*; diagrams and venue maps from
*CURSOR-Room Layouts with Numbers Tech Elevate GSX FY27.pptx*. Those workbooks
and the pipeline that reads them are not in this repository — `build.py` here
bundles `src/`, it does not re-derive the content from the sources.

Tight-connection threshold: under 45 minutes between the end of one assignment
and the start of the next, using each person's own coverage window.
