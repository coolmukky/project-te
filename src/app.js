/* Vanilla client-side behaviour for the TSRM staff packages document.
   No network access, no dependencies - the file must work from disk. */
(function () {
  "use strict";

  /* ---- image hydration -------------------------------------------------
     Every base64 payload appears exactly once in ASSETS; the markup carries
     only an asset id. Without this the file would repeat each room diagram
     on every session card. */
  function hydrateImages() {
    var assets = window.__TSRM_ASSETS__ || {};
    var nodes = document.querySelectorAll("img[data-asset]");
    var missing = 0;
    for (var i = 0; i < nodes.length; i++) {
      var id = nodes[i].getAttribute("data-asset");
      if (assets[id]) {
        nodes[i].src = assets[id];
      } else {
        missing++;
      }
    }
    if (missing) {
      console.warn("TSRM: " + missing + " image(s) had no asset payload");
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

    function close() {
      box.classList.remove("open");
      img.removeAttribute("src");
      img.hidden = false;
      if (clone) {
        clone.parentNode.removeChild(clone);
        clone = null;
      }
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
      if (event.key === "Escape" && box.classList.contains("open")) close();
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

  hydrateImages();
  initAnchorScroll(initToolbarMetrics());
  initFilter();
  initToc();
  initFoldouts();
  initLightbox();
  initPersonPrint();
})();

