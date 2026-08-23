/* Vanilla client-side behaviour for the TSRM staff packages document.
   No network access, no dependencies - the file must work from disk. */
(function () {
  "use strict";

  /* ---- image hydration -------------------------------------------------
     Every base64 payload appears exactly once in ASSETS; the markup carries
     only an asset id. Without this the file would repeat each room diagram
     on every session card.

     Assigning all 242 of them up front is the single most expensive thing this
     document does on open: measured on a phone-sized viewport it is about 250
     of the 870 ms before the page is interactive, because each assignment
     creates and decodes an image resource there and then. loading="lazy" does
     not help - it deferred a network fetch, and there is no network here; the
     cost is in the assignment itself.

     So the src is assigned as an image comes within reach of the viewport, and
     nothing above the fold waits on the rest. Everything about this is
     reversible: an engine without IntersectionObserver hydrates the lot
     immediately, exactly as before, and so does any path that leads to paper -
     see hydrateAll below, which is what beforeprint calls. A room diagram
     missing from a printed pack would be a far worse bug than a slow open. */
  var hydrateAll = null;

  function hydrateImages() {
    var assets = window.__TSRM_ASSETS__ || {};
    var nodes = document.querySelectorAll("img[data-asset]");
    var missing = 0;
    var pending = [];

    function hydrate(node) {
      var id = node.getAttribute("data-asset");
      if (!assets[id]) {
        missing++;
        return;
      }
      node.src = assets[id];
      // The id is left in place: it is what the markup is addressed by, and
      // the check below is what keeps an image from being assigned twice.
      node.setAttribute("data-hydrated", "1");
    }

    function done(node) {
      return node.getAttribute("data-hydrated") === "1";
    }

    var watcher = null;
    if (window.IntersectionObserver) {
      watcher = new window.IntersectionObserver(function (seen) {
        for (var i = 0; i < seen.length; i++) {
          if (!seen[i].isIntersecting) continue;
          var node = seen[i].target;
          watcher.unobserve(node);
          if (!done(node)) hydrate(node);
        }
      }, {
        // Far enough ahead that an image is ready by the time it is scrolled
        // to, on a fast flick as well as a slow one.
        rootMargin: "1200px 0px"
      });
    }

    hydrateAll = function () {
      for (var i = 0; i < pending.length; i++) {
        if (!done(pending[i])) hydrate(pending[i]);
      }
      if (watcher) watcher.disconnect();
      pending = [];
      if (missing) {
        console.warn("TSRM: " + missing + " image(s) had no asset payload");
        missing = 0;
      }
    };

    for (var i = 0; i < nodes.length; i++) {
      if (watcher) {
        pending.push(nodes[i]);
        watcher.observe(nodes[i]);
      } else {
        hydrate(nodes[i]);
      }
    }

    if (!watcher) {
      if (missing) console.warn("TSRM: " + missing + " image(s) had no asset payload");
      hydrateAll = function () {};
      return;
    }

    // Paper cannot scroll, so every path to it hydrates everything first.
    window.addEventListener("beforeprint", hydrateAll);
    if (window.matchMedia) {
      var toPrint = window.matchMedia("print");
      var onChange = function (event) {
        if (event.matches) hydrateAll();
      };
      if (toPrint.addEventListener) toPrint.addEventListener("change", onChange);
      else if (toPrint.addListener) toPrint.addListener(onChange);
    }
  }

  /* ---- the toolbar's real height ----------------------------------------
     The toolbar is position: sticky, so once the reader scrolls it covers the top
     of the viewport and an anchor has to land below it. Its height is not a
     constant: .toolbar-inner is a wrapping flex row, so the controls fall onto
     one, two or three rows as the screen narrows, and where they wrap depends on
     the engine's own font metrics. A height measured in one browser is therefore
     the wrong number in another - which is exactly how the constant this replaces
     came to overshoot on iOS Safari.

     Measuring it here makes the offset right in any engine by construction. The
     value is published as --toolbar-h on the root element, which both the
     stylesheet's scroll padding and initAnchorScroll() below read, so there is
     one measurement and no second copy of it to drift. The declarations in
     styles.css are only the fallback for a reader who never ran this. */
  function initToolbarMetrics() {
    var root = document.documentElement;
    var toolbar = document.querySelector(".toolbar");
    var measured = 0;

    function measure() {
      if (!toolbar) return;
      var height = toolbar.getBoundingClientRect().height;
      if (!isFinite(height) || height <= 0) return;
      // Whole pixels: a sub-pixel reflow should not rewrite the property, and a
      // pixel either way is invisible against the gap below the toolbar.
      height = Math.round(height);
      if (height === measured) return;
      measured = height;
      root.style.setProperty("--toolbar-h", height + "px");
    }

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    if (window.ResizeObserver && toolbar) {
      // Catches a rewrap the window size cannot tell us about: the count text
      // growing as the filter narrows, or a font finishing loading.
      new window.ResizeObserver(measure).observe(toolbar);
    }

    // Re-measure on read rather than trust the cache. A tap can arrive before any
    // of the listeners above has fired, and this costs one layout read.
    return function toolbarHeight() {
      measure();
      return measured;
    };
  }

  /* ---- in-document navigation, scrolled here rather than by the browser --
     The jump grid and the contents list are the primary way through this
     document on a phone. Leaving them to native fragment navigation makes them
     depend entirely on scroll padding, and how well an engine implements that
     property on a fragment navigation is the one thing this project cannot test:
     it has to be right in WebKit, and there is no WebKit to test against here.
     Scrolling from the measured toolbar height works whatever the engine does
     with the CSS property, which stays in place as the no-script fallback.

     Everything below is deliberately dull. No dependency on smooth scrolling
     being supported, no assumption about which element scrolls the document -
     engines have disagreed about the root element versus the body - and no
     ScrollToOptions object unless the engine certainly understands one, because
     Safari before 15.4 coerced that object to a number and scrolled to zero. */
  function initAnchorScroll(toolbarHeight) {
    var root = document.documentElement;

    // Both of these are capabilities rather than states, so they are read once.
    // The tie is deliberate: an engine with the CSS scroll-behavior property also
    // has the ScrollToOptions dictionary - they shipped together - and an engine
    // with neither ignores the smooth scrolling in the stylesheet too, so the
    // two-argument fallback below lands instantly and its result can be checked.
    var canUseOptions = "scrollBehavior" in root.style;
    var reduceMotion = !!(window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    // Focusing the target is half of what a fragment navigation does, and losing
    // it strands a keyboard or screen-reader user where they were. But focus
    // scrolls the element into view unless preventScroll is honoured, which would
    // undo the offset - so it is only done where the option is genuinely read.
    // Probing a detached element cannot scroll anything.
    var canPreventScroll = false;
    try {
      document.createElement("span").focus(
        Object.defineProperty({}, "preventScroll", {
          get: function () {
            canPreventScroll = true;
            return true;
          }
        })
      );
    } catch (err) {
      canPreventScroll = false;
    }

    function gap() {
      var raw = window.getComputedStyle
        ? window.getComputedStyle(root).getPropertyValue("--anchor-gap")
        : "";
      var value = parseFloat(raw);
      return isFinite(value) ? value : 8;
    }

    function currentY() {
      if (typeof window.pageYOffset === "number") return window.pageYOffset;
      var el = document.scrollingElement || root || document.body;
      return el ? el.scrollTop : 0;
    }

    // Asking for "auto" does not ask for an instant scroll. CSSOM-View defines it
    // as *defer to the element's own scroll-behavior*, and this document sets that
    // to smooth - so "auto" animates, which was measured: a correction slid 830px
    // over 360ms instead of snapping, and a reader who has asked for reduced motion
    // was getting the animation anyway. The enum value that does mean instant is
    // "instant", and it cannot be passed blind: an unknown enum member makes the
    // dictionary conversion throw, which would take the scroll with it. Overriding
    // the stylesheet inline says the same thing in a way every engine understands,
    // and it is restored immediately - an instant scroll finishes before the next
    // statement runs, which is the property the whole fallback chain below relies on.
    function withoutSmoothScrolling(fn) {
      var previous = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      try {
        fn();
      } finally {
        root.style.scrollBehavior = previous;
      }
    }

    function scrollDocumentTo(y, instant) {
      if (!(y > 0)) y = 0;
      var jump = !!(instant || reduceMotion);

      function perform() {
        if (canUseOptions) {
          window.scrollTo({
            top: y,
            left: 0,
            behavior: jump ? "auto" : "smooth"
          });
          return;
        }
        // Instant here, so whether the page moved is a fact we can act on. An engine
        // without ScrollToOptions has no scroll-behavior either, so the two-argument
        // form cannot be animated and "instant" needs nothing said about it.
        window.scrollTo(0, y);
        if (Math.abs(currentY() - y) <= 1) return;
        var el = document.scrollingElement || root;
        if (el) el.scrollTop = y;
        if (Math.abs(currentY() - y) <= 1) return;
        if (document.body) document.body.scrollTop = y;
      }

      if (jump) return withoutSmoothScrolling(perform);
      perform();
    }

    // Where the document has to be scrolled to for this target to sit just below
    // the toolbar, computed from where the target is *now*. Clamped at zero, which
    // is what makes Home land on the absolute top rather than 8px below a toolbar
    // that is not covering anything yet.
    function desiredY(target) {
      var y = target.getBoundingClientRect().top + currentY()
        - toolbarHeight() - gap();
      return y > 0 ? y : 0;
    }

    /* ---- the landing is checked again once the page has settled ------------
       A position measured at one instant is only true at that instant. The
       target's own place in the document depends on everything above it, and
       anything above it that changes size after we have scrolled - a lazily
       decoded image that reserved the wrong box, a re-decode under memory
       pressure - slides the target out from under the reader. Blink hides this
       class of fault behind scroll anchoring, which silently adjusts the scroll
       offset when content above the viewport resizes; **WebKit implements no
       scroll anchoring at all**, so on iOS nothing compensates and the heading
       ends up below the reader. That is the reported symptom.

       So the landing is verified rather than assumed, and deliberately verified
       by its *outcome*: is the document scrolled where this target needs it to
       be, recomputed from the target's current position? That question is right
       whatever went wrong - the target moving, the first scroll falling short,
       or an engine quirk this machine cannot see - which matters, because the
       browser this has to work in is the one that cannot be tested here.

       Everything about it is bounded and yielding, because a page that fights
       the reader is worse than a page that lands in the wrong place:

         - at most CHECKPOINTS looks, at fixed delays, the last of them 1.9s
           after the page stops moving. Not a loop, and not an observer left
           running.
         - at most MAX_CORRECTIONS re-scrolls, each instant rather than animated,
           so it reads as snapping into place rather than a second slide.
         - nothing is judged while the page is still moving, so the smooth scroll
           this document already performs is never cut short by its own check.
           The schedule is measured from the moment the page goes still rather
           than from the tap, and that is not a refinement - measured at phone
           speeds the animated scroll to the deepest person takes about 1.7s, so
           timing the window from the tap handed five of its six looks to the
           animation and left one. Gating on stillness rather than on a duration
           also keeps it engine-independent: how long a smooth scroll takes is
           another number this project cannot measure in the browser that
           matters. Only the waiting is capped, by MAX_STILL_POLLS.
         - abandoned on the first sign of the reader doing anything at all -
           touch, pointer, mouse, wheel or key - and abandoned for good.
         - a correction that cannot move the page (clamped at either end of the
           document) stops the watch rather than retrying.
         - a new tap supersedes the watch in progress, by token. */
    var CHECKPOINTS = [150, 350, 650, 1000, 1400, 1900];
    var MAX_CORRECTIONS = 3;
    var MAX_STILL_POLLS = 30;
    var STILL_POLL = 100;
    var TOLERANCE = 2;
    var watch = 0;

    function watchLanding(target) {
      var token = ++watch;
      var corrections = 0;
      var index = 0;
      var polls = 0;
      var timer = null;
      var listening = false;
      var lastY = currentY();
      var events = ["touchstart", "touchmove", "pointerdown", "mousedown",
                    "wheel", "keydown"];

      function stop() {
        if (timer !== null) {
          window.clearTimeout(timer);
          timer = null;
        }
        if (listening) {
          for (var i = 0; i < events.length; i++) {
            window.removeEventListener(events[i], abandon, true);
          }
          listening = false;
        }
      }

      function abandon() {
        // The reader has taken over. Nothing further is any of our business.
        if (token === watch) watch++;
        stop();
      }

      for (var i = 0; i < events.length; i++) {
        window.addEventListener(events[i], abandon, true);
      }
      listening = true;

      function next() {
        if (++index >= CHECKPOINTS.length) return stop();
        timer = window.setTimeout(look, CHECKPOINTS[index] - CHECKPOINTS[index - 1]);
      }

      function look() {
        timer = null;
        if (token !== watch) return stop();
        var before = currentY();
        // Still moving - our own smooth scroll, or the correction just made.
        // Judging now would cut the animation short, and spending a checkpoint on
        // it would hand the whole window to the animation. So wait without
        // advancing the schedule, and cap only the waiting.
        if (Math.abs(before - lastY) > 1) {
          lastY = before;
          if (++polls > MAX_STILL_POLLS) return stop();
          timer = window.setTimeout(look, STILL_POLL);
          return;
        }
        var want = desiredY(target);
        if (Math.abs(want - before) > TOLERANCE) {
          if (corrections >= MAX_CORRECTIONS) return stop();
          corrections++;
          scrollDocumentTo(want, true);
          // The correction is instant, so this is a fact rather than a hope: if
          // the page could not move, stop asking it to.
          lastY = currentY();
          if (Math.abs(lastY - before) < 1) return stop();
        }
        next();
      }

      timer = window.setTimeout(look, CHECKPOINTS[0]);
    }

    function scrollToTarget(target) {
      // Document coordinates from viewport coordinates, so this is correct
      // wherever the reader happens to be when they tap.
      scrollDocumentTo(desiredY(target));
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      if (canPreventScroll && target.focus) {
        target.focus({ preventScroll: true });
      }
      watchLanding(target);
    }

    function targetOf(href) {
      if (!href || href.charAt(0) !== "#" || href === "#") return null;
      var id = href.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch (err) {
        // A malformed escape: take the fragment exactly as it was written.
      }
      return document.getElementById(id);
    }

    document.addEventListener("click", function (event) {
      if (event.defaultPrevented) return;
      // Leave every deliberate open-somewhere-else gesture to the browser.
      if (event.button) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var link = event.target && event.target.closest
        ? event.target.closest('a[href^="#"]')
        : null;
      if (!link) return;
      if (link.target && link.target !== "_self") return;
      var href = link.getAttribute("href");
      var target = targetOf(href);
      if (!target) return;
      event.preventDefault();
      scrollToTarget(target);
      // Keep the address bar honest without handing the scroll back. Assigning
      // location.hash would start a native fragment navigation and fight the
      // scroll just performed; pushState does not.
      if (window.history && window.history.pushState) {
        try {
          window.history.pushState(null, "", href);
        } catch (err) {
          // Some engines refuse pushState on a file:// document. The scroll has
          // already happened; only the address bar is left behind.
        }
      }
    });

    // Back and forward, and any fragment change this handler did not perform,
    // land on the same measured offset rather than on the CSS fallback.
    function reland() {
      var target = targetOf(window.location.hash);
      if (target) scrollToTarget(target);
    }
    window.addEventListener("popstate", reland);
    window.addEventListener("hashchange", reland);
  }

  /* ---- search / filter -------------------------------------------------- */
  function initFilter() {
    var input = document.getElementById("q");
    var counter = document.getElementById("count");
    var clearBtn = document.getElementById("clear");
    var dayChips = Array.prototype.slice.call(
      document.querySelectorAll(".chip[data-day]")
    );
    var people = Array.prototype.slice.call(
      document.querySelectorAll(".person[data-person]")
    );
    var tocRows = Array.prototype.slice.call(
      document.querySelectorAll("[data-toc-person]")
    );
    var jumpLinks = Array.prototype.slice.call(
      document.querySelectorAll(".jumpgrid a[data-person-key]")
    );
    var noResults = document.querySelector(".no-results");
    var totalCards = document.querySelectorAll(".card[data-search]").length;
    var activeDay = "";

    function terms() {
      return (input.value || "")
        .toLowerCase()
        .split(/\s+/)
        .filter(function (t) {
          return t.length > 0;
        });
    }

    function apply() {
      var words = terms();
      var filtering = words.length > 0 || activeDay !== "";
      var visibleCards = 0;
      var visiblePeople = 0;
      var shownPeople = {};

      people.forEach(function (person) {
        var haystackPerson = person.getAttribute("data-search") || "";
        var cards = person.querySelectorAll(".card[data-search]");
        var shown = 0;

        for (var i = 0; i < cards.length; i++) {
          var card = cards[i];
          var hay = haystackPerson + " " + (card.getAttribute("data-search") || "");
          var dayOk = !activeDay || card.getAttribute("data-day") === activeDay;
          var textOk = words.every(function (w) {
            return hay.indexOf(w) !== -1;
          });
          var show = dayOk && textOk;
          card.hidden = !show;
          if (show) shown++;
        }

        // Day headings with no remaining cards should disappear too.
        var groups = person.querySelectorAll("[data-day-group]");
        for (var g = 0; g < groups.length; g++) {
          var group = groups[g];
          var live = group.querySelectorAll(".card[data-search]:not([hidden])").length;
          group.hidden = live === 0;
        }

        person.hidden = shown === 0;
        if (shown > 0) {
          visiblePeople++;
          shownPeople[person.getAttribute("data-person")] = shown;
          visibleCards += shown;
        }
      });

      tocRows.forEach(function (row) {
        var key = row.getAttribute("data-toc-person");
        row.hidden = !(key in shownPeople);
        var links = row.querySelectorAll("a[data-anchor]");
        for (var i = 0; i < links.length; i++) {
          var target = document.getElementById(links[i].getAttribute("data-anchor"));
          links[i].parentNode.hidden = !!(target && target.hidden);
        }
      });

      jumpLinks.forEach(function (link) {
        link.hidden = !(link.getAttribute("data-person-key") in shownPeople);
      });

      document.body.classList.toggle("filtering", filtering);
      if (noResults) noResults.classList.toggle("show", visibleCards === 0);

      counter.textContent = filtering
        ? visibleCards + " of " + totalCards + " assignments \u00b7 " + visiblePeople + " staff"
        : totalCards + " assignments \u00b7 " + people.length + " staff";
    }

    input.addEventListener("input", apply);
    input.addEventListener("search", apply);
    clearBtn.addEventListener("click", function () {
      input.value = "";
      activeDay = "";
      dayChips.forEach(function (c) {
        c.setAttribute("aria-pressed", "false");
      });
      apply();
      input.focus();
    });
    dayChips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        var day = chip.getAttribute("data-day");
        activeDay = activeDay === day ? "" : day;
        dayChips.forEach(function (c) {
          c.setAttribute(
            "aria-pressed",
            c.getAttribute("data-day") === activeDay ? "true" : "false"
          );
        });
        apply();
      });
    });

    apply();
  }

  /* ---- table of contents expand / collapse ------------------------------ */
  function initToc() {
    var toggle = document.getElementById("toc-toggle");
    if (!toggle) return;
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-pressed") !== "true";
      var items = document.querySelectorAll("details.toc-person");
      for (var i = 0; i < items.length; i++) {
        items[i].open = open;
      }
      toggle.setAttribute("aria-pressed", open ? "true" : "false");
      toggle.textContent = open ? "Collapse all" : "Expand all";
    });
  }

  /* ---- collapsible information sections ---------------------------------
     Important Links and Logistics ship as open details elements. Collapsing
     them here rather than in the markup is the whole print guarantee: with
     scripting unavailable, or in any print path that never ran this, the
     content is simply present. CSS cannot substitute - a closed details element
     hides its children inside the UA shadow tree, where no author stylesheet
     reaches.

     Reopened on beforeprint and closed again afterwards, so the reader gets the
     tidy collapsed page back once the dialog is gone. */
  function initFoldouts() {
    var folds = Array.prototype.slice.call(
      document.querySelectorAll("details.fold")
    );
    if (!folds.length) return;
    folds.forEach(function (fold) {
      fold.open = false;
    });

    function openFolds() {
      folds.forEach(function (fold) {
        if (!fold.open) {
          fold.setAttribute("data-reopened-for-print", "");
          fold.open = true;
        }
      });
    }

    function restoreFolds() {
      folds.forEach(function (fold) {
        if (fold.hasAttribute("data-reopened-for-print")) {
          fold.removeAttribute("data-reopened-for-print");
          fold.open = false;
        }
      });
    }

    window.addEventListener("beforeprint", openFolds);
    window.addEventListener("afterprint", restoreFolds);
    // Safari, and some Chrome print paths, only ever signal through the query.
    if (window.matchMedia) {
      var query = window.matchMedia("print");
      var onChange = function (event) {
        if (event.matches) {
          openFolds();
        } else {
          restoreFolds();
        }
      };
      if (query.addEventListener) {
        query.addEventListener("change", onChange);
      } else if (query.addListener) {
        query.addListener(onChange);
      }
    }
  }

  /* ---- lightbox for diagrams and maps -----------------------------------
     A venue map's whole value is the pin overlay, so zooming one used to throw
     away the only thing worth zooming in on: the old handler copied src into a
     bare <img>. A pinned map is cloned wrapper and all instead, which carries
     the pins with it. Diagrams and QR codes have no overlay and still take the
     plain path.

     The clone's box is sized here in JS rather than left to shrink-wrap. The
     lightbox is a flex container, and a flex item's display is blockified, so
     inline-block silently becomes block and the wrapper stretches wider than
     the image - which is exactly the drift that puts pins on the wrong door.
     Fitting the wrapper to the image's aspect ratio and filling it with the
     image at 100% makes the two coincident by construction instead. */
  function initLightbox() {
    var box = document.getElementById("lightbox");
    if (!box) return;
    var img = box.querySelector(".lb-img");
    var cap = box.querySelector(".lb-cap");
    var clone = null;

    /* An overlay that covers the document is a dialog, and a dialog that never
       takes focus leaves a keyboard or screen-reader user reading the page
       behind it while the page behind it is inert. Focus moves in on open and
       goes back to whatever opened it on close - losing it would strand the
       reader at the top of a document 19 packages long. */
    box.setAttribute("aria-modal", "true");
    box.setAttribute("tabindex", "-1");
    var opener = null;

    var dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "lb-close";
    dismiss.textContent = "Close";
    box.appendChild(dismiss);

    function close() {
      box.classList.remove("open");
      img.removeAttribute("src");
      img.hidden = false;
      if (clone) {
        clone.parentNode.removeChild(clone);
        clone = null;
      }
      if (opener && opener.focus) {
        try {
          opener.focus();
        } catch (err) {
          /* the element may be gone; the page is still usable without it */
        }
      }
      opener = null;
    }

    function overlayFor(target) {
      var wrap = target.closest ? target.closest(".map-wrap") : null;
      return wrap && wrap.querySelector(".pin") ? wrap : null;
    }

    function fit() {
      if (!clone) return;
      var inner = clone.querySelector("img");
      var nw = inner.naturalWidth || parseFloat(inner.getAttribute("width"));
      var nh = inner.naturalHeight || parseFloat(inner.getAttribute("height"));
      if (!nw || !nh) return;
      var style = window.getComputedStyle(box);
      var room = box.clientWidth
        - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      var tall = box.clientHeight
        - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      // Never enlarge past the file's own pixels; there is nothing there to show.
      var scale = Math.min(room / nw, tall / nh, 1);
      clone.style.width = nw * scale + "px";
      clone.style.height = nh * scale + "px";
    }

    function open(target) {
      var wrap = overlayFor(target);
      opener = target;
      cap.textContent = target.getAttribute("alt") || "";
      if (wrap) {
        clone = wrap.cloneNode(true);
        clone.className = "map-wrap lb-map";
        var inner = clone.querySelector("img");
        if (inner) {
          // Without this the enlarged copy is itself zoomable, so clicking it
          // reopens the lightbox instead of closing it.
          inner.removeAttribute("data-zoom");
          inner.removeAttribute("loading");
          inner.src = target.currentSrc || target.src;
        }
        box.insertBefore(clone, cap);
        img.hidden = true;
        box.classList.add("open");
        // clientWidth is only meaningful once the flex container is displayed.
        fit();
      } else {
        img.src = target.currentSrc || target.src;
        box.classList.add("open");
      }
      box.focus();
    }

    window.addEventListener("resize", fit);

    document.addEventListener("click", function (event) {
      var target = event.target;
      if (target && target.matches && target.matches("img[data-zoom]")) {
        if (box.classList.contains("open")) close();
        open(target);
      } else if (box.classList.contains("open")) {
        close();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (!box.classList.contains("open")) return;
      if (event.key === "Escape") {
        close();
      } else if (event.key === "Tab") {
        // The overlay holds one control, so the whole cycle is that control.
        // Without this, Tab walks off into the document underneath, which is
        // covered and cannot be seen.
        event.preventDefault();
        dismiss.focus();
      }
    });
  }

  /* ---- print one person's pack ------------------------------------------
     Marks one .person as the print target and lets the print stylesheet hide
     everything else. Nothing is moved in the DOM, so the room diagrams and
     venue maps print with exactly the rules a full print uses - including the
     inline-block map wrapper the pins depend on. */
  function initPersonPrint() {
    var sections = {};
    var people = document.querySelectorAll(".person[data-person]");
    for (var i = 0; i < people.length; i++) {
      sections[people[i].getAttribute("data-person")] = people[i];
    }
    var current = null;

    function clear() {
      document.body.classList.remove("printing-one");
      if (current) current.classList.remove("print-target");
      current = null;
    }

    document.addEventListener("click", function (event) {
      var button = event.target && event.target.closest
        ? event.target.closest("[data-print-person]")
        : null;
      if (!button) return;
      var section = sections[button.getAttribute("data-print-person")];
      if (!section) return;
      clear();
      current = section;
      section.classList.add("print-target");
      document.body.classList.add("printing-one");
      // Images are hydrated on approach, and a pack being printed has almost
      // certainly not been scrolled through. beforeprint would cover this in a
      // browser that fires it, which is exactly the assumption this file is
      // not allowed to make - Safari and older Chrome do not always.
      if (hydrateAll) hydrateAll();
      // Let the class land before the browser snapshots the page.
      window.setTimeout(function () {
        window.print();
      }, 0);
    });

    window.addEventListener("afterprint", clear);
    // Safari and older Chrome do not always fire afterprint; the class must not
    // outlive the dialog or the page looks broken afterwards.
    if (window.matchMedia) {
      var query = window.matchMedia("print");
      var onChange = function (event) {
        if (!event.matches) clear();
      };
      if (query.addEventListener) {
        query.addEventListener("change", onChange);
      } else if (query.addListener) {
        query.addListener(onChange);
      }
    }
  }

  /* ---- remembered preferences -------------------------------------------
     Three things are worth surviving a reload: which package is the reader's
     own, whether they asked for the dark theme, and nothing else. Storage is
     wrapped because it is not always there to be had - a file:// document has
     an opaque origin in some engines, and private browsing can make the getter
     itself throw rather than return null. A reader whose storage refuses is
     not an error case: they get the document with nothing remembered, which is
     what it did before any of this existed. */
  var PREF = "tsrm.";

  function readPref(name) {
    try {
      return window.localStorage.getItem(PREF + name);
    } catch (err) {
      return null;
    }
  }

  function writePref(name, value) {
    try {
      if (value === null) window.localStorage.removeItem(PREF + name);
      else window.localStorage.setItem(PREF + name, value);
    } catch (err) {
      /* nothing sticks this session; every caller works without it */
    }
  }

  /* ---- event time --------------------------------------------------------
     Every time printed in this document is Las Vegas wall clock. That is not
     the same as the reader's clock: staff fly in from everywhere and read this
     on the plane, and a phone that has not yet moved to Pacific would put
     every session an hour or three out - worse than useless for a "what am I
     on next" line, because it is confidently wrong.

     So the times are resolved through the event's own zone and compared as
     absolute instants. Intl carries the rules; the probe below refuses a
     formatter that quietly ignores the timeZone option rather than trusting
     one, because the failure mode of that is silent and wrong. Where there is
     no usable zone data the times are read as the device's own clock, which is
     exactly right for anyone actually standing in the venue. */
  var EVENT_ZONE = "America/Los_Angeles";

  var zoneClock = (function () {
    try {
      var format = new Intl.DateTimeFormat("en-US", {
        timeZone: EVENT_ZONE,
        hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit"
      });
      // 1 July 2026 12:00 UTC is 05:00 in Las Vegas. An engine that dropped the
      // timeZone option answers with the device's hour instead, and this is the
      // only way to tell the two apart.
      var parts = format.formatToParts(new Date(Date.UTC(2026, 6, 1, 12, 0, 0)));
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === "hour") return parts[i].value === "05" ? format : null;
      }
      return null;
    } catch (err) {
      return null;
    }
  })();

  /* The event zone's wall clock at an instant, as {y, mo, d, hh, mm, ss}. */
  function zoneParts(instant) {
    var parts = zoneClock.formatToParts(new Date(instant));
    var got = {};
    for (var i = 0; i < parts.length; i++) got[parts[i].type] = parts[i].value;
    return {
      y: +got.year, mo: +got.month, d: +got.day,
      // h23 still answers 24 for midnight in some engines.
      hh: +got.hour % 24, mm: +got.minute, ss: +got.second
    };
  }

  function zoneOffset(instant) {
    var w = zoneParts(instant);
    return Date.UTC(w.y, w.mo - 1, w.d, w.hh, w.mm, w.ss) - instant;
  }

  /* An event-zone wall clock reading, as an absolute instant. */
  function eventInstant(y, mo, d, hh, mm) {
    if (!zoneClock) return new Date(y, mo - 1, d, hh, mm, 0, 0).getTime();
    var wall = Date.UTC(y, mo - 1, d, hh, mm);
    // The offset that applies at the answer, not at the guess. One correction
    // settles it; the two differ only across a daylight-saving boundary, and
    // this event sits well inside one.
    return wall - zoneOffset(wall - zoneOffset(wall));
  }

  /* The event-zone calendar date at an instant, as YYYY-MM-DD. */
  function eventDay(instant) {
    var w = zoneClock ? zoneParts(instant) : null;
    var date = w
      ? [w.y, w.mo, w.d]
      : (function () {
          var local = new Date(instant);
          return [local.getFullYear(), local.getMonth() + 1, local.getDate()];
        })();
    return date[0] + "-" + pad2(date[1]) + "-" + pad2(date[2]);
  }

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  /* ---- the schedule, read back out of the rendered cards -----------------
     The times are in the markup only as printed text - "2:00 PM – 3:30 PM" in
     .card-when, alongside data-day. Reading them back rather than shipping a
     second machine-readable copy keeps one source of truth: if a card says a
     session runs to 3:30, everything here agrees with it by construction, and
     a regenerated document needs no parallel update.

     Every one of the 30 distinct time ranges in the document matches this
     pattern; a card that does not parse is counted and skipped, so an
     unreadable one costs its own scheduling features and nothing else. */
  var WHEN = /^(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–—-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

  function minutesOfDay(hour, minute, meridiem) {
    return ((hour % 12) + (/p/i.test(meridiem) ? 12 : 0)) * 60 + minute;
  }

  function text(node, selector) {
    var found = node.querySelector(selector);
    return found ? (found.textContent || "").trim() : "";
  }

  /* The value beside a label in a card's key/value grid, by label. */
  function detailOf(card, label) {
    var keys = card.querySelectorAll(".kv .k");
    for (var i = 0; i < keys.length; i++) {
      if ((keys[i].textContent || "").trim() === label) {
        var value = keys[i].parentNode.querySelector(".v");
        return value ? (value.textContent || "").trim() : "";
      }
    }
    return "";
  }

  /* When a card prints a time range, which range it is.

     Most cards print the session's own hours. Seven print the staffer's
     instead - "Your hours: 3:00 PM – 3:30 PM" against a session that runs from
     2:30 - because that person is only on for part of it, and the document is
     explicit that a coverage window is what it reasons about. Their hours are
     what a "what am I on next" line has to mean and what belongs in their
     calendar: telling someone they are on at 2:30 when they are on at 3:00
     is the same class of error as getting the timezone wrong. */
  function whenOf(card) {
    var printed = card.querySelector(".card-when");
    if (!printed) return null;
    var rostered = printed.querySelector(".when-time");
    return {
      range: ((rostered || printed).textContent || "").trim(),
      rostered: !!rostered
    };
  }

  function readSchedule() {
    var cards = document.querySelectorAll(".card[data-day]");
    var entries = [];
    var unreadable = 0;

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(card.getAttribute("data-day") || "");
      var printed = whenOf(card);
      var when = printed && WHEN.exec(printed.range);
      var person = card.closest ? card.closest(".person[data-person]") : null;
      if (!day || !when || !person) {
        unreadable++;
        continue;
      }

      var startMin = minutesOfDay(+when[1], +when[2], when[3]);
      var endMin = minutesOfDay(+when[4], +when[5], when[6]);
      if (endMin <= startMin) {
        // Would mean a session running past midnight. None does, and reading
        // one as same-day would file it in the past the moment it began.
        unreadable++;
        continue;
      }

      var y = +day[1], mo = +day[2], d = +day[3];
      entries.push({
        card: card,
        person: person,
        personKey: person.getAttribute("data-person"),
        personName: text(person, ".person-head h2"),
        day: day[0],
        start: eventInstant(y, mo, d, (startMin / 60) | 0, startMin % 60),
        end: eventInstant(y, mo, d, (endMin / 60) | 0, endMin % 60),
        id: card.id,
        gsxid: text(card, ".card-id"),
        title: text(card, ".card-title"),
        room: text(card, ".card-where"),
        when: printed.range,
        // True where the range above is this person's hours rather than the
        // session's, which the calendar export spells out.
        rostered: printed.rostered,
        sessionTime: detailOf(card, "Session time")
      });
    }

    if (unreadable) {
      console.warn("TSRM: " + unreadable + " card(s) had no readable time");
    }
    entries.sort(function (a, b) {
      return a.start - b.start;
    });
    return entries;
  }

  /* ---- how long until, in words a person reads at a glance --------------- */
  function relative(ms) {
    var minutes = Math.round(ms / 60000);
    if (minutes < 1) return "any moment";
    if (minutes < 60) return "in " + minutes + " min";
    var hours = Math.floor(minutes / 60);
    var rest = minutes % 60;
    if (hours < 12) return "in " + hours + " h" + (rest ? " " + rest + " min" : "");
    var days = Math.round(minutes / 1440);
    return days <= 1 ? "tomorrow" : "in " + days + " days";
  }

  function clockOf(entry, which) {
    // The printed range is already in the right zone and the right format.
    var halves = entry.when.split(/\s*[–—-]\s*/);
    return (which === "end" ? halves[1] : halves[0]) || entry.when;
  }

  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function dayLabel(entry) {
    var parts = entry.day.split("-");
    // Noon UTC, so the weekday cannot be dragged over a boundary by an offset.
    var at = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2], 12));
    return WEEKDAYS[at.getUTCDay()] + " " + (+parts[1]) + "/" + (+parts[2]);
  }

  /* ---- what the reader is on now, and what is next ----------------------
     The single question this document is opened to answer once the event has
     started, and the one thing the printed page cannot do. It is only shown
     while today is one of the event days: on any other day every session would
     resolve as finished, and a document read a week early would look broken
     rather than simply not yet relevant. */
  function initNow(schedule, whoami) {
    if (!schedule.length) return function () {};

    var days = {};
    for (var i = 0; i < schedule.length; i++) days[schedule[i].day] = true;

    var bar = document.createElement("section");
    bar.className = "nowbar";
    bar.id = "nowbar";
    bar.hidden = true;
    bar.setAttribute("aria-live", "polite");
    var anchor = document.getElementById("global-links");
    if (!anchor || !anchor.parentNode) return function () {};
    anchor.parentNode.insertBefore(bar, anchor);

    function line(kind, label, body, entry) {
      var row = document.createElement("p");
      row.className = "nowrow is-" + kind;
      var tag = document.createElement("span");
      tag.className = "nowtag";
      tag.textContent = label;
      row.appendChild(tag);
      var said = document.createElement("span");
      said.className = "nowbody";
      said.textContent = body;
      row.appendChild(said);
      if (entry) {
        var jump = document.createElement("a");
        jump.className = "nowjump";
        jump.href = "#" + entry.id;
        jump.textContent = "Open";
        row.appendChild(jump);
      }
      return row;
    }

    function paint(now) {
      var today = eventDay(now);
      // Keyed by session instance, not by card: one session staffed by three
      // people is three cards, and counting those would tell the reader the
      // event is three times busier than it is.
      var running = {};
      var runningCount = 0;
      var mine = { live: null, next: null };
      var me = whoami.key();

      for (var i = 0; i < schedule.length; i++) {
        var entry = schedule[i];
        var live = now >= entry.start && now < entry.end;
        var done = now >= entry.end;

        // The card's own state is a property of the session, so it is stamped
        // on every package - but only during the event, for the reason above.
        var inEvent = today in days;
        entry.card.classList.toggle("is-live", inEvent && live);
        entry.card.classList.toggle("is-done", inEvent && done);

        if (live && !(entry.gsxid in running)) {
          running[entry.gsxid] = true;
          runningCount++;
        }
        if (entry.personKey === me) {
          if (live && !mine.live) mine.live = entry;
          if (!done && !live && !mine.next) mine.next = entry;
        }
      }

      while (bar.firstChild) bar.removeChild(bar.firstChild);

      if (!(today in days)) {
        // Before or after the event. Say which, once, and stay out of the way.
        var first = schedule[0], last = schedule[schedule.length - 1];
        if (now < first.start) {
          bar.appendChild(line("soon", "Starts",
            dayLabel(first) + ", " + clockOf(first, "start") + " · " + relative(first.start - now)));
          bar.hidden = false;
        } else {
          // Between the event days, or after the last one: the card states are
          // already cleared above and there is nothing useful left to say.
          bar.hidden = true;
        }
        return;
      }

      if (mine.live) {
        bar.appendChild(line("live", "On now",
          mine.live.gsxid + " · " + mine.live.room + " · until " + clockOf(mine.live, "end"),
          mine.live));
      }
      if (mine.next) {
        bar.appendChild(line("next", mine.live ? "Then" : "Next",
          dayLabel(mine.next) + ", " + clockOf(mine.next, "start") + " · " + mine.next.room
            + " · " + relative(mine.next.start - now),
          mine.next));
      }
      if (me && !mine.live && !mine.next) {
        bar.appendChild(line("clear", "Done", "Nothing further on your schedule."));
      }
      if (!me) {
        bar.appendChild(line("who", "Now",
          (runningCount
            ? runningCount + (runningCount === 1 ? " session is" : " sessions are") + " running now."
            : "Nothing is running just now.")
            + " Mark your own package to see what you are on next."));
      }

      bar.hidden = !bar.firstChild;
    }

    return paint;
  }

  /* ---- whose package this is --------------------------------------------
     Nineteen people share one document, and each of them wants exactly one
     package out of it. Marked once, remembered after, and it is what makes the
     now/next line above answerable at all. */
  function initWhoami(onChange) {
    var sections = document.querySelectorAll(".person[data-person]");
    if (!sections.length) return null;

    var known = {};
    var buttons = [];
    var current = readPref("me");

    var jump = document.createElement("a");
    jump.className = "chip mychip";
    jump.id = "mychip";
    jump.hidden = true;

    var toolbar = document.querySelector(".toolbar-inner");
    var counter = document.getElementById("count");
    if (toolbar) toolbar.insertBefore(jump, counter || null);

    function render() {
      for (var i = 0; i < buttons.length; i++) {
        var button = buttons[i];
        var isMine = button.getAttribute("data-me") === current;
        button.setAttribute("aria-pressed", isMine ? "true" : "false");
        button.textContent = isMine ? "★ My pack" : "This is me";
      }
      for (var key in known) {
        if (Object.prototype.hasOwnProperty.call(known, key)) {
          known[key].classList.toggle("is-mine", key === current);
        }
      }
      if (current && known[current]) {
        jump.hidden = false;
        jump.href = "#person-" + current;
        jump.textContent = "★ " + text(known[current], ".person-head h2");
        jump.title = "Jump to your package";
      } else {
        jump.hidden = true;
      }
    }

    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      var key = section.getAttribute("data-person");
      known[key] = section;

      var button = document.createElement("button");
      button.type = "button";
      button.className = "mebtn";
      button.setAttribute("data-me", key);
      button.setAttribute("aria-pressed", "false");
      var head = section.querySelector(".person-head");
      var print = section.querySelector(".printbtn");
      if (head) head.insertBefore(button, print || null);
      buttons.push(button);
    }

    // A key left over from a document that no longer carries that person.
    if (current && !known[current]) {
      current = null;
      writePref("me", null);
    }

    document.addEventListener("click", function (event) {
      var button = event.target && event.target.closest
        ? event.target.closest("[data-me]")
        : null;
      if (!button) return;
      var key = button.getAttribute("data-me");
      current = current === key ? null : key;
      writePref("me", current);
      render();
      if (onChange) onChange();
    });

    render();
    return {
      key: function () {
        return current;
      }
    };
  }

  /* ---- calendar export ---------------------------------------------------
     A staffer's assignments belong in the phone they are already carrying, and
     re-keying six sessions by hand at a gate is how people end up in the wrong
     ballroom. The file is built here rather than shipped alongside because
     there is nothing to ship alongside: this document travels as one file.

     Times go out as UTC instants, which is why eventInstant's zone handling
     matters - it means no VTIMEZONE block has to be written or trusted, and
     every calendar client agrees on when the session is. */
  function icsEscape(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  function utcStamp(ms) {
    var at = new Date(ms);
    return at.getUTCFullYear() + pad2(at.getUTCMonth() + 1) + pad2(at.getUTCDate())
      + "T" + pad2(at.getUTCHours()) + pad2(at.getUTCMinutes()) + pad2(at.getUTCSeconds()) + "Z";
  }

  /* RFC 5545 folds content lines at 75 octets, and the limit is octets rather
     than characters - a session title carrying an en dash or a curly apostrophe
     spends three bytes on it, and folding by character length would both
     overshoot the limit and risk splitting a sequence in half. */
  function icsFold(line) {
    var out = "";
    var used = 0;
    for (var i = 0; i < line.length; i++) {
      var code = line.charCodeAt(i);
      var chunk = line.charAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < line.length) {
        chunk += line.charAt(++i);
        code = 0x10000;
      }
      var octets = code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
      // 74 plus the leading space of a continuation line keeps every line inside 75.
      if (used + octets > 74) {
        out += "\r\n ";
        used = 1;
      }
      out += chunk;
      used += octets;
    }
    return out;
  }

  function icsCalendar(entries, name) {
    var stamp = utcStamp(Date.now());
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//GSX TSRM//Tech Elevate FY27 staff packages//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:" + icsEscape("Tech Elevate GSX FY27 — " + name)
    ];

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var detail = [entry.title, "Room: " + entry.room, "Staffer: " + entry.personName];
      if (entry.rostered) {
        // The event is the hours they are on. Naming the session's own hours
        // beside them stops the shorter block reading like a mistake.
        detail.push("Your hours: " + entry.when);
        if (entry.sessionTime) detail.push("Session runs: " + entry.sessionTime);
      }
      var eurl = entry.card.querySelector(".eurl a");
      if (eurl) detail.push("Webex: " + (eurl.textContent || "").trim());
      var staffing = text(entry.card, ".staffing");
      if (staffing) detail.push(staffing);

      lines.push(
        "BEGIN:VEVENT",
        // Stable across exports, so re-importing updates rather than duplicates.
        "UID:" + entry.id + "@tsrm-gsx-fy27",
        "DTSTAMP:" + stamp,
        "DTSTART:" + utcStamp(entry.start),
        "DTEND:" + utcStamp(entry.end),
        "SUMMARY:" + icsEscape(entry.gsxid + " · " + entry.title),
        "LOCATION:" + icsEscape(entry.room),
        "DESCRIPTION:" + icsEscape(detail.join("\n")),
        "END:VEVENT"
      );
    }

    lines.push("END:VCALENDAR");
    var folded = [];
    for (var j = 0; j < lines.length; j++) folded.push(icsFold(lines[j]));
    // CRLF throughout, per the spec, and a trailing one so the last line is
    // terminated rather than merely present.
    return folded.join("\r\n") + "\r\n";
  }

  function offerDownload(filename, body, mime) {
    var url = null;
    try {
      if (window.Blob && window.URL && window.URL.createObjectURL) {
        url = window.URL.createObjectURL(new Blob([body], { type: mime }));
      }
    } catch (err) {
      url = null;
    }
    var link = document.createElement("a");
    // A data: URL is the fallback, not the default: it is capped in some
    // engines and shows as a wall of text in others, but it beats no export.
    link.href = url || "data:" + mime + ";charset=utf-8," + encodeURIComponent(body);
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (url) {
      // Long enough for the engine to have taken the bytes, short enough not
      // to hold several megabytes for the rest of the session.
      window.setTimeout(function () {
        window.URL.revokeObjectURL(url);
      }, 30000);
    }
  }

  function initCalendar(schedule) {
    if (!schedule.length) return;
    var byPerson = {};
    for (var i = 0; i < schedule.length; i++) {
      var entry = schedule[i];
      (byPerson[entry.personKey] || (byPerson[entry.personKey] = [])).push(entry);
    }

    var sections = document.querySelectorAll(".person[data-person]");
    for (var s = 0; s < sections.length; s++) {
      var section = sections[s];
      var key = section.getAttribute("data-person");
      if (!byPerson[key]) continue;
      var button = document.createElement("button");
      button.type = "button";
      button.className = "calbtn";
      button.setAttribute("data-calendar", key);
      button.textContent = "☷ Add to calendar";
      var head = section.querySelector(".person-head");
      var print = section.querySelector(".printbtn");
      if (head) head.insertBefore(button, print || null);
    }

    document.addEventListener("click", function (event) {
      var button = event.target && event.target.closest
        ? event.target.closest("[data-calendar]")
        : null;
      if (!button) return;
      var entries = byPerson[button.getAttribute("data-calendar")];
      if (!entries || !entries.length) return;
      var who = entries[0].personName;
      offerDownload(
        "tech-elevate-" + button.getAttribute("data-calendar") + ".ics",
        icsCalendar(entries, who),
        "text/calendar"
      );
    });
  }

  /* ---- theme -------------------------------------------------------------
     A ballroom during a session is dark, and this document is read in one on a
     phone at full brightness. The palette is a set of custom properties, so a
     dark one is a second set of the same names and nothing else changes.

     The effective theme is resolved here and stamped on the root element, so
     the stylesheet carries one dark block rather than one per way of asking
     for it. Without scripting the document stays exactly as it was: light, and
     the same as it prints. */
  function initTheme() {
    var root = document.documentElement;
    var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    var chosen = readPref("theme");
    if (chosen !== "dark" && chosen !== "light") chosen = null;

    var button = document.createElement("button");
    button.type = "button";
    button.className = "chip themebtn";
    button.id = "themebtn";

    function effective() {
      if (chosen) return chosen;
      return media && media.matches ? "dark" : "light";
    }

    function render() {
      var theme = effective();
      root.setAttribute("data-theme", theme);
      button.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
      button.textContent = theme === "dark" ? "☼ Light" : "☾ Dark";
      button.title = theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme";
    }

    button.addEventListener("click", function () {
      chosen = effective() === "dark" ? "light" : "dark";
      writePref("theme", chosen);
      render();
    });

    if (media) {
      var followSystem = function () {
        // Only while the reader has not overridden it themselves.
        if (!chosen) render();
      };
      if (media.addEventListener) media.addEventListener("change", followSystem);
      else if (media.addListener) media.addListener(followSystem);
    }

    var toolbar = document.querySelector(".toolbar-inner");
    if (toolbar) toolbar.insertBefore(button, document.getElementById("count") || null);
    render();
  }

  /* ---- keyboard and assistive access ------------------------------------
     Three gaps, all of them in things the mouse already reaches. The zoomable
     diagrams were bound on click alone, which left the lightbox - the only way
     to read a room plan at a usable size - unreachable without a pointer. The
     lightbox took focus nowhere and gave it back nowhere. And the result count
     changed silently, so a filter that just emptied the document announced
     nothing at all. */
  function initAccess() {
    var counter = document.getElementById("count");
    if (counter) {
      counter.setAttribute("role", "status");
      counter.setAttribute("aria-live", "polite");
    }

    var zoomable = document.querySelectorAll("img[data-zoom]");
    for (var i = 0; i < zoomable.length; i++) {
      var image = zoomable[i];
      image.setAttribute("tabindex", "0");
      image.setAttribute("role", "button");
      var label = image.getAttribute("alt");
      image.setAttribute("aria-label", label ? "Enlarge: " + label : "Enlarge image");
    }

    document.addEventListener("keydown", function (event) {
      var target = event.target;
      if (!target || !target.matches || !target.matches("img[data-zoom]")) return;
      if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
      // Space scrolls the page otherwise, which is the opposite of opening it.
      event.preventDefault();
      target.click();
    });

    var search = document.getElementById("q");
    document.addEventListener("keydown", function (event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      var target = event.target;
      var typing = target && target.matches
        && target.matches("input, textarea, select, [contenteditable]");
      if (event.key === "/" && !typing && search) {
        event.preventDefault();
        search.focus();
        search.select();
      } else if (event.key === "Escape" && target === search && search.value) {
        // Escape inside a type=search already clears in some engines and does
        // nothing in others; making it consistent costs one line.
        search.value = "";
        var fired = document.createEvent("Event");
        fired.initEvent("input", true, false);
        search.dispatchEvent(fired);
      }
    });
  }

  hydrateImages();
  initAnchorScroll(initToolbarMetrics());
  initFilter();
  initToc();
  initFoldouts();
  initLightbox();
  initPersonPrint();
  initTheme();
  initAccess();

  /* The scheduling features share one reading of the cards. whoami and the
     now/next line need each other - marking a package has to repaint the line
     at once - so the repainter is held in a variable the handler closes over
     rather than passed round in a circle. */
  var schedule = readSchedule();
  var repaint = function () {};
  var whoami = initWhoami(function () {
    repaint(Date.now());
  }) || { key: function () { return null; } };
  repaint = initNow(schedule, whoami);
  initCalendar(schedule);

  function tick() {
    repaint(Date.now());
  }

  tick();
  // Half a minute is finer than any countdown this shows, and costs nothing.
  window.setInterval(tick, 30000);
  // A phone that has been in a pocket has not been running the interval, and
  // comes back to a stale line unless waking is itself a reason to recompute.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) tick();
  });
  window.addEventListener("focus", tick);
})();

