# Tech Elevate @ GSX FY27 — TSRM Staff Packages

A per-staff session package for the Tech Elevate event at GSX FY27: 19 staff,
104 assignments across 72 session instances, with room diagrams, venue maps,
Webex QR codes, and a flagged list of every tight connection and overlap.

It ships as **one HTML file**. Staff open it from a download folder in a
convention centre, so it assumes no network, no server, no install and no
dependencies — the stylesheet, the script and all 66 images are folded into
the file itself.

```
python3 build.py            # -> dist/index.html   (4.7 MB, open it directly)
```

## Working on it

`src/` is the same document with the parts kept as real files. It is what you
edit, and it runs as-is over any static server — no build step in the loop:

```
python3 -m http.server -d src 8000     # -> http://localhost:8000
```

Nothing in the markup differs between the two modes. `hydrateImages()` in
`app.js` assigns whatever `window.__TSRM_ASSETS__` holds for an asset id
straight to `img.src`, and a relative URL (development) works there exactly as
a `data:` URI does (bundle). `build.py` swaps one map for the other.

```
src/index.html          markup
src/styles.css          stylesheet, including the print sheet
src/app.js              search, filters, anchor scrolling, lightbox, print
src/assets/*.jpg|png    room diagrams, venue maps, session QR codes
src/assets/manifest.js  generated: asset id -> URL, for the development mode
build.py                bundles src/ into the single file
test_app.py             drives the result in a browser
```

A room diagram appears on every card for a session held in that room, so each
image is stored once under an id and the markup carries only the id. Inlining
the base64 at each of the 242 use sites would multiply the file several times
over.

Images are addressed by file name: `src/assets/qr-tedc24.png` is the asset id
`qr-tedc24`, which is what `data-asset="qr-tedc24"` in the markup refers to.
To add or replace one, drop the file in and run `python3 build.py --assets` to
regenerate the development map.

## Tests

```
pip install playwright && playwright install chromium
python3 test_app.py
```

It opens the built file over `file://` — the way staff actually open it — and
clicks through it: search by name and by GSXID, the day chips, the empty-search
state, anchor jumps landing clear of the sticky toolbar, the diagram lightbox,
and print expanding every foldout. Then it does the same over `http://` against
`src/`, because the two have to stay the same document.

It also checks that `build.py` reproduces the published 20 August 2026 document
**byte for byte**, against a SHA-256 recorded in `test_app.py`. Any deliberate
change to the document will trip that check; update the digest in the same
commit.

## Where the content comes from

The document is generated output. Session data, rooms, EURLs and QR codes come
from *CURSOR-TE Sessions Details.xlsx*; assignments, staffing notes and flags
from *CURSOR-TE TSRM Staff Assignment.xlsx*; diagrams and venue maps from
*CURSOR-Room Layouts with Numbers Tech Elevate GSX FY27.pptx*. Those workbooks
and the pipeline that reads them are not in this repository — `build.py` here
bundles `src/`, it does not re-derive the content from the sources. Edits to
session content made in `src/index.html` will not survive a regeneration
upstream.

Tight-connection threshold: under 45 minutes between the end of one assignment
and the start of the next, using each person's own coverage window rather than
the full session time.
