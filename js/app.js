/*
 * Application controller: state, inspector panels, scene list, readouts,
 * lens sweep and storyboard.
 */
(function () {
  'use strict';

  const O = window.Optics;
  const L = window.Lighting;
  const S = window.Store;
  const DEG = Math.PI / 180;

  const $ = (sel) => document.querySelector(sel);

  const loaded = S.load();
  const state = {
    scenes: loaded.scenes,
    activeId: loaded.activeId,
    units: loaded.units || 'm',
    selection: null,
    tab: 'camera',
    view: 'plan',
    opts: { showDof: true, thirds: false },
    sweepMatch: false,
  };
  if (!state.scenes.some((s) => s.id === state.activeId)) state.activeId = state.scenes[0].id;

  const scene = () => state.scenes.find((s) => s.id === state.activeId) || state.scenes[0];
  const fmt = (m, d) => S.formatDistance(m, state.units, d);
  const unitLabel = () => (state.units === 'ft' ? 'ft' : 'm');

  /* ============================================================
   * Element helper
   * ============================================================ */
  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'style') e.style.cssText = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else if (k in e && typeof v !== 'string') e[k] = v;
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return e;
  }

  /* ============================================================
   * Change handling & rendering
   * ============================================================ */
  let frame = 0;
  let slowTimer = 0;
  let saveTimer = 0;

  /** Call after mutating the active scene. */
  function changed(opts) {
    const o = opts || {};
    if (!o.live && !o.keepInspector) renderInspector();
    scheduleRender();
    clearTimeout(slowTimer);
    slowTimer = setTimeout(renderSlow, o.live ? 350 : 120);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => S.save(state), 400);
  }

  function scheduleRender() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      renderFast();
    });
  }

  function renderFast() {
    if (state.view !== 'plan') return;
    renderPreview();
    plan.render();
    DofChart.render($('#dofChart'), scene(), state.units);
    renderStats();
  }

  /** Thumbnails and the lens sweep are costlier; update them after a pause. */
  function renderSlow() {
    updateSceneThumb(scene());
    if (state.view === 'plan') renderSweep();
  }

  function sizeCanvasTo(canvas, cssWidth, aspect) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssWidth * aspect * dpr);
  }

  function renderPreview() {
    const sc = scene();
    const canvas = $('#preview');
    const wrap = $('#previewWrap');
    const aspect = Preview.aspectOf(sc);
    const w = wrap.clientWidth;
    sizeCanvasTo(canvas, w, aspect);
    canvas.style.height = w * aspect + 'px';
    const info = Preview.render(canvas, sc, { showDof: state.opts.showDof, thirds: state.opts.thirds });
    renderHud(sc, info);
  }

  function renderHud(sc, info) {
    const cam = sc.camera;
    const sensor = O.sensorOf(cam.sensor);
    const hud = $('#hud');
    const warn = info.warnings.length ? `⚠ ${info.warnings.length} fixture${info.warnings.length > 1 ? 's' : ''} in shot` : '';
    hud.replaceChildren(
      el('div', { class: 'tl' }, `${cam.focal}mm  f/${cam.aperture}`, el('br'), `⊙ ${fmt(cam.focus)}`),
      el('div', { class: 'tr' }, sensor.name, el('br'), cam.guide !== 'none' ? cam.guide : ''),
      el('div', { class: 'bl' }, warn)
    );
  }

  /* ============================================================
   * Derived numbers
   * ============================================================ */
  function primaryOf(sc) {
    return sc.subjects.find((s) => s.primary) || sc.subjects[0] || null;
  }

  function depthOf(sc, x, y) {
    const h = sc.camera.heading * DEG;
    return (x - sc.camera.x) * Math.cos(h) + (y - sc.camera.y) * Math.sin(h);
  }

  function metrics(sc) {
    const cam = sc.camera;
    const sensor = O.sensorOf(cam.sensor);
    const dof = O.depthOfField(cam.focal, cam.aperture, cam.focus, sensor);
    const hfov = O.angleOfView(cam.focal, sensor.w) / DEG;
    const vfov = O.angleOfView(cam.focal, sensor.h) / DEG;
    const primary = primaryOf(sc);
    const pz = primary ? depthOf(sc, primary.x, primary.y) : cam.focus;
    const frameAt = O.frameSizeAt(cam.focal, sensor, pz > 0 ? pz : cam.focus);
    const bgBlur = O.blurFraction(cam.focal, cam.aperture, cam.focus, sc.background.distance, sensor);
    const eq = O.equivalents(cam.focal, cam.aperture, sensor);
    const light = primary ? L.analyse(primary, cam, sc.lights, sc.ambient) : null;
    return { cam, sensor, dof, hfov, vfov, primary, pz, frameAt, bgBlur, eq, light };
  }

  function renderStats() {
    const sc = scene();
    const m = metrics(sc);
    const tile = (k, v, s, cls) => el('div', { class: 'stat ' + (cls || '') }, el('div', { class: 'k' }, k), el('div', { class: 'v' }, v), el('div', { class: 's' }, s || ''));
    const primarySharp = m.primary && m.pz >= m.dof.near && m.pz <= m.dof.far;
    const ratio = m.light ? m.light.ratio : 0;
    $('#stats').replaceChildren(
      tile('Near limit', fmt(m.dof.near), 'closest sharp point'),
      tile('Far limit', fmt(m.dof.far), m.dof.far === Infinity ? 'beyond hyperfocal' : 'furthest sharp point'),
      tile('Depth of field', fmt(m.dof.total), `${fmt(m.dof.front)} front · ${fmt(m.dof.back)} back`),
      tile('Hyperfocal', fmt(m.dof.hyperfocal), `focus here → ${fmt(m.dof.hyperfocal / 2)} to ∞`),
      tile('Field of view', `${m.hfov.toFixed(1)}°`, `${m.vfov.toFixed(1)}° vertical`),
      tile(
        'Frame at subject',
        `${fmt(m.frameAt.w, 2)}`,
        m.primary ? `× ${fmt(m.frameAt.h, 2)} · ${O.shotSize(m.frameAt.h, m.primary.height)}` : `× ${fmt(m.frameAt.h, 2)}`
      ),
      m.primary
        ? tile(m.primary.name, primarySharp ? 'In focus' : 'Soft', `${fmt(m.pz)} from camera`, primarySharp ? 'good' : 'warn')
        : tile('Subject', '—', 'add a subject'),
      tile('Backdrop blur', `${(m.bgBlur * 100).toFixed(2)}%`, `of frame width · ${blurWord(m.bgBlur, m.dof.coc / m.sensor.w)}`),
      tile('FF equivalent', `${Math.round(m.eq.focal)}mm f/${m.eq.fNumber.toFixed(1)}`, `crop ×${m.eq.crop.toFixed(2)}`),
      tile(
        'Lighting contrast',
        m.light && isFinite(ratio) ? `${ratio < 10 ? ratio.toFixed(1) : Math.round(ratio)}:1` : '—',
        m.light ? `${m.light.stops.toFixed(1)} stops · ${contrastWord(m.light.stops)}` : ''
      )
    );
  }

  function blurWord(frac, cocFrac) {
    if (frac <= cocFrac) return 'sharp';
    if (frac < 0.004) return 'slightly soft';
    if (frac < 0.012) return 'soft';
    if (frac < 0.03) return 'creamy';
    return 'very creamy';
  }

  function contrastWord(stops) {
    if (stops < 1) return 'flat';
    if (stops < 2) return 'soft, high-key';
    if (stops < 3) return 'moderate';
    if (stops < 4) return 'dramatic';
    return 'low-key / chiaroscuro';
  }

  /* ============================================================
   * Form controls
   * ============================================================ */
  function field(label, control, valueLabel) {
    return el('div', { class: 'field' }, el('div', { class: 'lab' }, el('span', null, label), valueLabel || null), control);
  }

  /**
   * Slider + number pair. `dist` values are stored in metres and shown in the
   * current unit. `log` maps the slider logarithmically.
   */
  function slider(o) {
    const conv = (v) => (o.dist ? S.toUnit(v, state.units) : v);
    const unconv = (v) => (o.dist ? S.fromUnit(v, state.units) : v);
    const lo = o.min, hi = o.max;
    const toPos = (v) => (o.log ? (Math.log(v / lo) / Math.log(hi / lo)) * 1000 : v);
    const fromPos = (p) => (o.log ? lo * Math.pow(hi / lo, p / 1000) : p);
    const range = el('input', {
      type: 'range',
      min: o.log ? 0 : lo,
      max: o.log ? 1000 : hi,
      step: o.log ? 1 : o.step || 'any',
    });
    const num = el('input', { type: 'number', step: o.numStep || 'any' });
    const round = o.round || ((v) => +v.toFixed(2));
    const sync = () => {
      const v = o.get();
      range.value = toPos(Math.min(Math.max(v, lo), hi));
      num.value = +conv(v).toFixed(o.dist ? 2 : 2);
    };
    range.addEventListener('input', () => {
      const v = round(fromPos(+range.value));
      o.set(v);
      num.value = +conv(v).toFixed(2);
      changed({ keepInspector: true });
    });
    num.addEventListener('change', () => {
      const raw = parseFloat(num.value);
      if (!isFinite(raw)) return sync();
      const v = Math.min(Math.max(unconv(raw), o.hardMin === undefined ? lo : o.hardMin), o.hardMax === undefined ? hi : o.hardMax);
      o.set(round(v));
      sync();
      changed({ keepInspector: true });
    });
    sync();
    const unit = o.unit === 'dist' || o.dist ? unitLabel() : o.unit || '';
    return field(o.label, el('div', { class: 'ctl' }, range, num, unit ? el('span', { class: 'muted' }, unit) : null));
  }

  function select(label, options, get, set, rebuild) {
    const s = el('select', null, ...Object.entries(options).map(([v, t]) => el('option', { value: v }, t)));
    s.value = get();
    s.addEventListener('change', () => {
      set(s.value);
      changed(rebuild ? {} : { keepInspector: true });
    });
    return field(label, s);
  }

  function textInput(label, get, set) {
    const i = el('input', { type: 'text', value: get() });
    i.addEventListener('input', () => {
      set(i.value);
      changed({ keepInspector: true });
    });
    return field(label, i);
  }

  function colorInput(label, get, set) {
    const i = el('input', { type: 'color', value: get() || '#ffffff' });
    i.addEventListener('input', () => {
      set(i.value);
      changed({ keepInspector: true });
    });
    return field(label, el('div', { class: 'ctl' }, i));
  }

  function checkbox(label, get, set) {
    const c = el('input', { type: 'checkbox' });
    c.checked = !!get();
    c.addEventListener('change', () => {
      set(c.checked);
      changed();
    });
    return el('label', { class: 'check' }, c, label);
  }

  function group(title, ...children) {
    return el('div', { class: 'group' }, title ? el('div', { class: 'group-title' }, ...[].concat(title)) : null, ...children);
  }

  /* ============================================================
   * Inspector
   * ============================================================ */
  function renderInspector() {
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
    const body = $('#inspector');
    const sc = scene();
    const panels = { camera: cameraPanel, subjects: subjectsPanel, lights: lightsPanel, scene: scenePanel };
    body.replaceChildren(...[].concat(panels[state.tab](sc)));
  }

  function cameraPanel(sc) {
    const cam = sc.camera;
    const sensors = Object.fromEntries(Object.entries(O.SENSORS).map(([k, s]) => [k, `${s.name} (${s.w}×${s.h} mm)`]));

    const focalChips = el(
      'div',
      { class: 'chips' },
      O.FOCAL_PRESETS.map((f) =>
        el('button', { class: 'chip' + (f === cam.focal ? ' active' : ''), onclick: () => { cam.focal = f; changed(); } }, `${f}`)
      )
    );

    const apIdx = () => {
      let best = 0;
      O.APERTURES.forEach((a, i) => { if (Math.abs(a - cam.aperture) < Math.abs(O.APERTURES[best] - cam.aperture)) best = i; });
      return best;
    };
    const apLabel = el('b', null, `f/${cam.aperture}`);
    const apRange = el('input', { type: 'range', min: 0, max: O.APERTURES.length - 1, step: 1 });
    apRange.value = apIdx();
    apRange.addEventListener('input', () => {
      cam.aperture = O.APERTURES[+apRange.value];
      apLabel.textContent = `f/${cam.aperture}`;
      changed({ keepInspector: true });
    });
    const apChips = el(
      'div',
      { class: 'chips' },
      [1.4, 2, 2.8, 4, 5.6, 8, 11, 16].map((a) =>
        el('button', { class: 'chip' + (a === cam.aperture ? ' active' : ''), onclick: () => { cam.aperture = a; changed(); } }, `f/${a}`)
      )
    );

    const primary = primaryOf(sc);
    const selSubj = state.selection && state.selection.kind === 'subject' ? sc.subjects.find((s) => s.id === state.selection.id) : null;
    const focusTarget = selSubj || primary;
    const m = metrics(sc);

    return [
      group(
        'Lens',
        slider({ label: 'Focal length', get: () => cam.focal, set: (v) => (cam.focal = v), min: 8, max: 600, log: true, unit: 'mm', round: (v) => Math.round(v) }),
        focalChips,
        field('Aperture', el('div', { class: 'ctl' }, apRange), apLabel),
        apChips
      ),
      group(
        'Focus',
        slider({ label: 'Focus distance', get: () => cam.focus, set: (v) => (cam.focus = v), min: 0.15, max: 100, log: true, dist: true, hardMax: 1000 }),
        el(
          'div',
          { class: 'btn-row' },
          focusTarget
            ? el('button', { class: 'btn small', onclick: () => { cam.focus = +Math.max(depthOf(sc, focusTarget.x, focusTarget.y), 0.15).toFixed(2); changed(); } }, `Focus on ${focusTarget.name}`)
            : null,
          el('button', { class: 'btn small', onclick: () => { cam.focus = +m.dof.hyperfocal.toFixed(2); changed(); } }, 'Hyperfocal'),
          el('button', { class: 'btn small', onclick: () => fitDofToSubjects(sc) }, 'Stop down to fit all')
        )
      ),
      group(
        'Body & placement',
        select('Sensor', sensors, () => cam.sensor, (v) => (cam.sensor = v)),
        el(
          'div',
          { class: 'row2' },
          slider({ label: 'Height', get: () => cam.height, set: (v) => (cam.height = v), min: 0.1, max: 6, dist: true }),
          slider({ label: 'Heading', get: () => cam.heading, set: (v) => (cam.heading = v), min: -180, max: 180, unit: '°', round: Math.round })
        ),
        select('Frame guide', Object.fromEntries(Object.keys(Preview.GUIDES).map((k) => [k, k === 'none' ? 'None (full sensor)' : k])), () => cam.guide, (v) => (cam.guide = v))
      ),
    ];
  }

  /** Find the widest aperture (no wider than the current one) that holds every subject within the DOF. */
  function fitDofToSubjects(sc) {
    const cam = sc.camera;
    const sensor = O.sensorOf(cam.sensor);
    const zs = sc.subjects.map((s) => depthOf(sc, s.x, s.y)).filter((z) => z > 0.1);
    if (!zs.length) return toast('No subjects in front of the camera');
    const near = Math.min(...zs);
    const far = Math.max(...zs);
    // Focus a third of the way in, then find the widest stop that covers both ends.
    const focus = zs.length === 1 ? near : (2 * near * far) / (near + far);
    // Only ever stop down from the current aperture.
    for (const a of O.APERTURES.filter((x) => x >= cam.aperture)) {
      const d = O.depthOfField(cam.focal, a, focus, sensor);
      if (d.near <= near && d.far >= far) {
        cam.aperture = a;
        cam.focus = +focus.toFixed(2);
        changed();
        return toast(`f/${a} focused at ${fmt(focus)} keeps everyone sharp`);
      }
    }
    cam.aperture = O.APERTURES[O.APERTURES.length - 1];
    cam.focus = +focus.toFixed(2);
    changed();
    toast('Even f/22 cannot hold all subjects — move them closer together');
  }

  function subjectsPanel(sc) {
    const sel = state.selection && state.selection.kind === 'subject' ? sc.subjects.find((s) => s.id === state.selection.id) : null;
    const m = metrics(sc);
    const list = el(
      'div',
      { class: 'item-list' },
      sc.subjects.length
        ? sc.subjects.map((s) => {
            const z = depthOf(sc, s.x, s.y);
            const sharp = z >= m.dof.near && z <= m.dof.far;
            return el(
              'div',
              { class: 'item' + (sel === s ? ' active' : ''), onclick: () => select_('subject', s.id) },
              el('span', { class: 'sw', style: `background:${s.color}` }),
              el('span', { class: 'nm' }, (s.primary ? '★ ' : '') + s.name),
              el('span', { class: 'tag', style: `color:var(${sharp ? '--sharp' : '--soft'})` }, `${fmt(z)} · ${sharp ? 'sharp' : 'soft'}`)
            );
          })
        : el('div', { class: 'empty' }, 'No subjects yet.')
    );
    const out = [
      group(
        ['Subjects', el('span', { class: 'btn-row' }, el('button', { class: 'btn small', onclick: () => addSubject('person') }, '+ Person'), el('button', { class: 'btn small', onclick: () => addSubject('object') }, '+ Object'))],
        list
      ),
    ];
    if (sel) {
      out.push(
        group(
          'Selected subject',
          textInput('Name', () => sel.name, (v) => (sel.name = v)),
          el('div', { class: 'row2' },
            select('Type', { person: 'Person', object: 'Object / prop' }, () => sel.kind, (v) => (sel.kind = v)),
            colorInput('Colour', () => sel.color, (v) => (sel.color = v))
          ),
          slider({ label: 'Height', get: () => sel.height, set: (v) => (sel.height = v), min: 0.1, max: 3, dist: true }),
          el('div', { class: 'row2' },
            slider({ label: 'X', get: () => sel.x, set: (v) => (sel.x = v), min: -30, max: 30, dist: true }),
            slider({ label: 'Y', get: () => sel.y, set: (v) => (sel.y = v), min: -30, max: 30, dist: true })
          ),
          checkbox('Primary subject (drives exposure & readouts)', () => sel.primary, (v) => {
            sc.subjects.forEach((s) => (s.primary = false));
            sel.primary = v;
          }),
          el('div', { class: 'btn-row' },
            el('button', { class: 'btn small', onclick: () => { sc.camera.focus = +Math.max(depthOf(sc, sel.x, sel.y), 0.15).toFixed(2); changed(); } }, 'Focus here'),
            el('button', { class: 'btn small', onclick: () => aimAllKeyAt(sc, sel) }, 'Aim lights here'),
            el('button', { class: 'btn small danger', onclick: () => removeSelected() }, 'Delete')
          )
        )
      );
    } else if (sc.subjects.length) {
      out.push(el('div', { class: 'empty' }, 'Select a subject here or in the floor plan to edit it.'));
    }
    return out;
  }

  function lightsPanel(sc) {
    const sel = state.selection && state.selection.kind === 'light' ? sc.lights.find((l) => l.id === state.selection.id) : null;
    const m = metrics(sc);
    const contrib = new Map((m.light ? m.light.contributions : []).map((c) => [c.id, c]));
    const list = el(
      'div',
      { class: 'item-list' },
      sc.lights.length
        ? sc.lights.map((l) => {
            const c = contrib.get(l.id);
            const stops = c && isFinite(c.stops) ? (c.stops === 0 ? 'brightest' : `${c.stops.toFixed(1)} st`) : l.on === false ? 'off' : 'misses';
            const pct = c && isFinite(c.stops) ? Math.max(4, 100 * Math.pow(2, c.stops)) : 0;
            const role = L.ROLES[l.role] || L.ROLES.key;
            return el(
              'div',
              { class: 'item' + (sel === l ? ' active' : ''), onclick: () => select_('light', l.id), style: l.on === false ? 'opacity:.55' : '' },
              el('span', { class: 'sw', style: `background:${L.rgbToCss(L.lightColor(l))};border-color:${role.color}` }),
              el('span', { class: 'nm' }, l.name, el('div', { class: 'bar', style: 'margin-top:4px' }, el('i', { style: `width:${pct}%;background:${role.color}` }))),
              el('span', { class: 'tag' }, stops)
            );
          })
        : el('div', { class: 'empty' }, 'No lights yet.')
    );
    const out = [
      group(
        ['Lights', el('button', { class: 'btn small', onclick: () => addLight() }, '+ Light')],
        m.primary ? el('div', { class: 'muted' }, `Level at ${m.primary.name}, relative to the brightest source.`) : null,
        list
      ),
    ];
    if (sel) {
      const mod = L.modifierOf(sel);
      const swatch = el('span', { class: 'sw', style: `display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:middle;background:${L.rgbToCss(L.lightColor(sel))}` });
      out.push(
        group(
          ['Selected light', checkbox('On', () => sel.on !== false, (v) => (sel.on = v))],
          textInput('Name', () => sel.name, (v) => (sel.name = v)),
          el('div', { class: 'row2' },
            select('Role', Object.fromEntries(Object.entries(L.ROLES).map(([k, r]) => [k, r.label])), () => sel.role, (v) => (sel.role = v), true),
            select('Modifier', Object.fromEntries(Object.entries(L.MODIFIERS).map(([k, r]) => [k, r.label])), () => sel.modifier, (v) => { sel.modifier = v; delete sel.beam; }, true)
          ),
          slider({ label: 'Power', get: () => sel.power, set: (v) => (sel.power = v), min: 0, max: 100, step: 1, unit: '%', round: Math.round }),
          el('div', null,
            slider({ label: 'Colour temperature', get: () => sel.kelvin, set: (v) => { sel.kelvin = v; swatch.style.background = L.rgbToCss(L.lightColor(sel)); }, min: 1900, max: 10000, step: 50, unit: 'K', round: (v) => Math.round(v / 50) * 50 }),
            el('div', { class: 'kelvin-strip', style: 'margin-top:4px' })
          ),
          el('div', { class: 'chips' },
            [['Candle', 1900], ['Tungsten', 3200], ['Golden hr', 4000], ['Daylight', 5600], ['Overcast', 6500], ['Shade', 8000]].map(([n, k]) =>
              el('button', { class: 'chip' + (sel.kelvin === k ? ' active' : ''), onclick: () => { sel.kelvin = k; changed(); } }, `${n} ${k}K`)
            )
          ),
          field('Gel', el('div', { class: 'ctl' },
            el('input', { type: 'color', value: sel.gel || '#ffffff', oninput: (e) => { sel.gel = e.target.value; swatch.style.background = L.rgbToCss(L.lightColor(sel)); changed({ keepInspector: true }); } }),
            el('button', { class: 'btn small', onclick: () => { sel.gel = ''; changed(); } }, 'No gel'),
            el('span', { class: 'muted' }, 'Result'), swatch
          )),
          mod.directional
            ? el('div', { class: 'row2' },
                slider({ label: 'Direction', get: () => sel.aim, set: (v) => (sel.aim = v), min: -180, max: 180, unit: '°', round: Math.round }),
                slider({ label: 'Elevation', get: () => (sel.elevation === undefined ? 35 : sel.elevation), set: (v) => (sel.elevation = v), min: 2, max: 90, unit: '°', round: Math.round })
              )
            : el('div', { class: 'row2' },
                slider({ label: 'Aim', get: () => sel.aim, set: (v) => (sel.aim = v), min: -180, max: 180, unit: '°', round: Math.round }),
                slider({ label: 'Beam', get: () => L.beamOf(sel), set: (v) => (sel.beam = v), min: 10, max: 360, unit: '°', round: Math.round })
              ),
          el('div', { class: 'row2' },
            slider({ label: 'X', get: () => sel.x, set: (v) => (sel.x = v), min: -30, max: 30, dist: true }),
            slider({ label: 'Y', get: () => sel.y, set: (v) => (sel.y = v), min: -30, max: 30, dist: true })
          ),
          slider({ label: 'Height', get: () => sel.height, set: (v) => (sel.height = v), min: 0.1, max: 8, dist: true }),
          el('div', { class: 'btn-row' },
            m.primary ? el('button', { class: 'btn small', onclick: () => { sel.aim = Math.round(S.aimAt(sel, m.primary)); changed(); } }, `Aim at ${m.primary.name}`) : null,
            el('button', { class: 'btn small', onclick: () => duplicateLight(sel) }, 'Duplicate'),
            el('button', { class: 'btn small danger', onclick: () => removeSelected() }, 'Delete')
          )
        )
      );
    } else if (sc.lights.length) {
      out.push(el('div', { class: 'empty' }, 'Select a light here or in the floor plan. Drag its blue handle to aim it.'));
    }
    out.push(
      group(
        'Presets',
        el('div', { class: 'btn-row' },
          el('button', { class: 'btn small', onclick: () => applyLightingPreset(sc, 'three') }, 'Three-point'),
          el('button', { class: 'btn small', onclick: () => applyLightingPreset(sc, 'rembrandt') }, 'Rembrandt'),
          el('button', { class: 'btn small', onclick: () => applyLightingPreset(sc, 'butterfly') }, 'Butterfly'),
          el('button', { class: 'btn small', onclick: () => applyLightingPreset(sc, 'split') }, 'Split'),
          el('button', { class: 'btn small', onclick: () => applyLightingPreset(sc, 'window') }, 'Window')
        ),
        el('div', { class: 'muted' }, 'Replaces this scene’s lights, arranged around the primary subject relative to the camera.')
      )
    );
    return out;
  }

  function scenePanel(sc) {
    const bg = sc.background;
    const notes = el('textarea', { placeholder: 'Blocking, dialogue cues, gear, reminders…' });
    notes.value = sc.notes || '';
    notes.addEventListener('input', () => {
      sc.notes = notes.value;
      changed({ keepInspector: true });
    });
    return [
      group('Scene', textInput('Name', () => sc.name, (v) => (sc.name = v)), field('Notes', notes)),
      group(
        'Backdrop',
        slider({ label: 'Distance from camera', get: () => bg.distance, set: (v) => (bg.distance = v), min: 0.5, max: 100, log: true, dist: true, hardMax: 1000 }),
        el('div', { class: 'row2' },
          colorInput('Colour', () => bg.color, (v) => (bg.color = v)),
          select('Texture', { lights: 'String lights (bokeh)', grid: 'Panels / windows', plain: 'Plain' }, () => bg.pattern, (v) => (bg.pattern = v))
        )
      ),
      group(
        'Ambient & exposure',
        slider({ label: 'Ambient level', get: () => sc.ambient.level * 100, set: (v) => (sc.ambient.level = v / 100), min: 0, max: 100, unit: '%', round: Math.round }),
        slider({ label: 'Ambient colour temp', get: () => sc.ambient.kelvin, set: (v) => (sc.ambient.kelvin = v), min: 1900, max: 12000, unit: 'K', round: (v) => Math.round(v / 50) * 50 }),
        slider({ label: 'Exposure compensation', get: () => sc.exposure || 0, set: (v) => (sc.exposure = v), min: -3, max: 3, step: 0.1, unit: 'EV', round: (v) => Math.round(v * 10) / 10 }),
        el('div', { class: 'muted' }, 'Preview auto-exposes for the primary subject; compensation shifts it.')
      ),
    ];
  }

  /* ============================================================
   * Mutations
   * ============================================================ */
  function select_(kind, id) {
    state.selection = kind ? { kind, id } : null;
    if (kind === 'subject') state.tab = 'subjects';
    else if (kind === 'light') state.tab = 'lights';
    else if (kind === 'camera') state.tab = 'camera';
    renderInspector();
    scheduleRender();
  }

  function spotInFront(sc, dist, lateral) {
    const h = sc.camera.heading * DEG;
    return {
      x: +(sc.camera.x + Math.cos(h) * dist + Math.sin(h) * lateral).toFixed(2),
      y: +(sc.camera.y + Math.sin(h) * dist - Math.cos(h) * lateral).toFixed(2),
    };
  }

  function addSubject(kind) {
    const sc = scene();
    const n = sc.subjects.length;
    const p = spotInFront(sc, Math.max(sc.camera.focus, 1) + n * 0.6, (n % 2 ? 1 : -1) * 0.6 * n);
    const s = S.subject({
      name: kind === 'object' ? `Prop ${n + 1}` : `Subject ${n + 1}`,
      kind,
      height: kind === 'object' ? 0.9 : 1.75,
      color: kind === 'object' ? '#7d7466' : ['#8a6f5c', '#4f6a8a', '#6a4f7a', '#4f7a63'][n % 4],
      primary: !sc.subjects.length,
      ...p,
    });
    sc.subjects.push(s);
    select_('subject', s.id);
    changed();
  }

  function addLight() {
    const sc = scene();
    const target = primaryOf(sc) || spotInFront(sc, sc.camera.focus, 0);
    const n = sc.lights.length;
    const side = n % 2 ? 1 : -1;
    const h = sc.camera.heading * DEG;
    const x = target.x + side * Math.sin(h) * 1.6 - Math.cos(h) * 0.6;
    const y = target.y - side * Math.cos(h) * 1.6 - Math.sin(h) * 0.6;
    const l = S.light({ name: `Light ${n + 1}`, role: n === 0 ? 'key' : n === 1 ? 'fill' : 'rim', x: +x.toFixed(2), y: +y.toFixed(2), power: n === 0 ? 60 : 30 }, target);
    sc.lights.push(l);
    select_('light', l.id);
    changed();
  }

  function duplicateLight(l) {
    const sc = scene();
    const copy = S.clone(l);
    copy.id = S.uid('lt');
    copy.name = l.name + ' copy';
    copy.x += 0.5;
    sc.lights.push(copy);
    select_('light', copy.id);
    changed();
  }

  function removeSelected() {
    const sc = scene();
    const sel = state.selection;
    if (!sel) return;
    if (sel.kind === 'subject') {
      const wasPrimary = (sc.subjects.find((s) => s.id === sel.id) || {}).primary;
      sc.subjects = sc.subjects.filter((s) => s.id !== sel.id);
      if (wasPrimary && sc.subjects[0]) sc.subjects[0].primary = true;
    } else if (sel.kind === 'light') {
      sc.lights = sc.lights.filter((l) => l.id !== sel.id);
    } else return;
    state.selection = null;
    changed();
  }

  function aimAllKeyAt(sc, target) {
    sc.lights.forEach((l) => {
      if (l.role !== 'background' && l.role !== 'practical' && !L.modifierOf(l).directional) l.aim = Math.round(S.aimAt(l, target));
    });
    changed();
    toast(`Aimed lights at ${target.name}`);
  }

  /** Place a classic lighting setup around the primary subject. */
  function applyLightingPreset(sc, kind) {
    const subj = primaryOf(sc);
    if (!subj) return toast('Add a subject first');
    const h = sc.camera.heading * DEG;
    // Offset relative to the subject in camera terms: `side` +right, `back` away from camera.
    const at = (side, back, height, props) => {
      const x = subj.x + Math.sin(h) * side + Math.cos(h) * back;
      const y = subj.y - Math.cos(h) * side + Math.sin(h) * back;
      return S.light(Object.assign({ x: +x.toFixed(2), y: +y.toFixed(2), height }, props), subj);
    };
    const presets = {
      three: () => [
        at(-1.3, -1.1, 2.1, { name: 'Key', role: 'key', modifier: 'softbox', power: 60 }),
        at(1.4, -1.3, 1.5, { name: 'Fill', role: 'fill', modifier: 'reflector', power: 20 }),
        at(1.1, 1.3, 2.4, { name: 'Rim', role: 'rim', modifier: 'fresnel', power: 40 }),
      ],
      rembrandt: () => [
        at(-1.2, -0.9, 2.4, { name: 'Key', role: 'key', modifier: 'softbox', power: 65 }),
        at(0.5, 1.0, 2.7, { name: 'Hair', role: 'hair', modifier: 'fresnel', power: 18 }),
      ],
      butterfly: () => [
        at(0, -1.4, 2.5, { name: 'Key (overhead)', role: 'key', modifier: 'softbox', power: 60 }),
        at(0, -1.0, 0.8, { name: 'Fill (below)', role: 'fill', modifier: 'reflector', power: 25 }),
      ],
      split: () => [
        at(-1.6, 0, 1.8, { name: 'Key (side)', role: 'key', modifier: 'fresnel', power: 60 }),
      ],
      window: () => [
        at(-2.2, -0.3, 1.8, { name: 'Window', role: 'key', modifier: 'softbox', power: 70, kelvin: 6000, beam: 120 }),
        at(1.2, -0.6, 1.4, { name: 'Bounce', role: 'fill', modifier: 'reflector', power: 15, kelvin: 6000 }),
      ],
    };
    sc.lights = presets[kind]();
    state.selection = null;
    changed();
    toast('Lighting preset applied');
  }

  /* ============================================================
   * Scene list
   * ============================================================ */
  function sceneMeta(sc) {
    return `${sc.camera.focal}mm · f/${sc.camera.aperture} · ${fmt(sc.camera.focus)} · ${sc.lights.length} light${sc.lights.length === 1 ? '' : 's'}`;
  }

  function renderThumb(canvas, sc, cssWidth) {
    sizeCanvasTo(canvas, cssWidth, Preview.aspectOf(sc));
    Preview.render(canvas, sc, { guides: true, warnings: false });
  }

  function renderSceneList() {
    const list = $('#sceneList');
    list.replaceChildren(
      ...state.scenes.map((sc, i) => {
        const canvas = el('canvas', { 'data-scene': sc.id });
        const act = (label, title, fn) => el('button', { class: 'icon-btn', title, onclick: (e) => { e.stopPropagation(); fn(); } }, label);
        const li = el(
          'li',
          { class: 'scene-item' + (sc.id === state.activeId ? ' active' : ''), onclick: () => openScene(sc.id) },
          canvas,
          el('div', { class: 'row' },
            el('span', { class: 'num' }, String(i + 1).padStart(2, '0')),
            el('span', { class: 'name', title: sc.name }, sc.name),
            el('span', { class: 'actions' },
              act('↑', 'Move up', () => moveScene(i, -1)),
              act('↓', 'Move down', () => moveScene(i, 1)),
              act('⧉', 'Duplicate', () => duplicateScene(sc)),
              act('✕', 'Delete', () => deleteScene(sc))
            )
          ),
          el('div', { class: 'meta' }, sceneMeta(sc))
        );
        return li;
      })
    );
    requestAnimationFrame(() => {
      state.scenes.forEach((sc) => {
        const c = list.querySelector(`canvas[data-scene="${sc.id}"]`);
        if (c) renderThumb(c, sc, c.clientWidth || 200);
      });
    });
  }

  function updateSceneThumb(sc) {
    const li = document.querySelector(`#sceneList canvas[data-scene="${sc.id}"]`);
    if (!li) return;
    renderThumb(li, sc, li.clientWidth || 200);
    const meta = li.parentElement.querySelector('.meta');
    if (meta) meta.textContent = sceneMeta(sc);
    const name = li.parentElement.querySelector('.name');
    if (name) name.textContent = sc.name;
  }

  function openScene(id) {
    state.activeId = id;
    state.selection = null;
    if (state.view === 'board') setView('plan');
    renderSceneList();
    changed();
  }

  function moveScene(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= state.scenes.length) return;
    const [s] = state.scenes.splice(i, 1);
    state.scenes.splice(j, 0, s);
    renderSceneList();
    changed();
  }

  function duplicateScene(sc) {
    const copy = S.duplicateScene(sc);
    state.scenes.splice(state.scenes.indexOf(sc) + 1, 0, copy);
    openScene(copy.id);
  }

  function deleteScene(sc) {
    if (state.scenes.length === 1) return toast('Keep at least one scene');
    if (!confirm(`Delete “${sc.name}”?`)) return;
    const i = state.scenes.indexOf(sc);
    state.scenes.splice(i, 1);
    if (state.activeId === sc.id) state.activeId = state.scenes[Math.max(0, i - 1)].id;
    renderSceneList();
    if (state.view === 'board') renderBoard();
    changed();
  }

  /* ============================================================
   * Lens sweep
   * ============================================================ */
  function sweepVariant(sc, focal) {
    const v = S.clone(sc);
    const cam = v.camera;
    if (state.sweepMatch) {
      const p = primaryOf(sc);
      const z0 = p ? depthOf(sc, p.x, p.y) : sc.camera.focus;
      if (z0 > 0.1) {
        const z1 = (z0 * focal) / sc.camera.focal;
        const delta = z1 - z0;
        const h = cam.heading * DEG;
        cam.x -= Math.cos(h) * delta;
        cam.y -= Math.sin(h) * delta;
        cam.focus = Math.max(cam.focus + delta, 0.15);
        v.background.distance = v.background.distance + delta;
      }
    }
    cam.focal = focal;
    return v;
  }

  function renderSweep() {
    const sc = scene();
    const focals = [16, 24, 35, 50, 85, 135, 200];
    const wrap = $('#sweep');
    const items = focals.map((f) => {
      const canvas = el('canvas');
      const v = sweepVariant(sc, f);
      const moved = state.sweepMatch ? Math.hypot(v.camera.x - sc.camera.x, v.camera.y - sc.camera.y) : 0;
      const behind = state.sweepMatch && f > sc.camera.focal;
      const btn = el(
        'button',
        {
          class: 'sweep-item' + (f === sc.camera.focal ? ' current' : ''),
          title: 'Apply this lens',
          onclick: () => {
            Object.assign(sc.camera, v.camera);
            sc.background.distance = v.background.distance;
            changed();
            toast(state.sweepMatch ? `Switched to ${f}mm and moved the camera to keep framing` : `Switched to ${f}mm`);
          },
        },
        canvas,
        el('div', { class: 'lbl' }, el('b', null, `${f}mm`), el('span', null, state.sweepMatch ? (moved < 0.01 ? 'current' : `${behind ? 'back' : 'in'} ${fmt(moved)}`) : `${(O.angleOfView(f, O.sensorOf(sc.camera.sensor).w) / DEG).toFixed(0)}°`))
      );
      return { btn, canvas, v };
    });
    wrap.replaceChildren(...items.map((i) => i.btn));
    requestAnimationFrame(() => items.forEach((i) => renderThumb(i.canvas, i.v, i.canvas.clientWidth || 160)));
  }

  /* ============================================================
   * Storyboard
   * ============================================================ */
  function renderBoard() {
    const grid = $('#boardGrid');
    const cards = state.scenes.map((sc, i) => {
      const m = metrics(sc);
      const canvas = el('canvas');
      const spec = (k, v) => el('div', null, el('span', null, k), v);
      const card = el(
        'article',
        { class: 'frame', onclick: () => openScene(sc.id) },
        canvas,
        el('div', { class: 'body' },
          el('div', { class: 'title' }, el('span', { class: 'n' }, String(i + 1).padStart(2, '0')), el('h3', null, sc.name)),
          el('div', { class: 'specs' },
            spec('Lens', `${sc.camera.focal}mm f/${sc.camera.aperture}`),
            spec('Sensor', m.sensor.name),
            spec('Focus', fmt(sc.camera.focus)),
            spec('DOF', `${fmt(m.dof.near)} – ${fmt(m.dof.far)}`),
            spec('Shot', m.primary ? O.shotSize(m.frameAt.h, m.primary.height) : '—'),
            spec('Contrast', m.light && isFinite(m.light.ratio) ? `${m.light.ratio.toFixed(1)}:1` : '—')
          ),
          el('div', { class: 'lights' },
            sc.lights.map((l) => {
              const role = L.ROLES[l.role] || L.ROLES.key;
              return el('span', { class: 'chip', style: `border-color:${role.color}` }, `${l.name} · ${l.kelvin}K`);
            })
          ),
          sc.notes ? el('div', { class: 'notes' }, sc.notes) : null
        )
      );
      return { card, canvas, sc };
    });
    grid.replaceChildren(...cards.map((c) => c.card));
    requestAnimationFrame(() => cards.forEach((c) => renderThumb(c.canvas, c.sc, c.canvas.clientWidth || 400)));
  }

  function setView(v) {
    state.view = v;
    document.querySelectorAll('#viewToggle button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    $('#workspace').hidden = v !== 'plan';
    $('#board').hidden = v !== 'board';
    if (v === 'board') renderBoard();
    else {
      plan.resize();
      renderFast();
      renderSweep();
    }
  }

  /* ============================================================
   * Misc UI
   * ============================================================ */
  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function setUnits(u) {
    state.units = u;
    document.querySelectorAll('#unitToggle button').forEach((b) => b.classList.toggle('active', b.dataset.units === u));
    renderSceneList();
    changed();
  }

  function exportJson() {
    const data = JSON.stringify({ app: 'frameplan', version: 1, scenes: state.scenes }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'frameplan-scenes.json' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const scenes = S.importScenes(reader.result);
        state.scenes.push(...scenes);
        openScene(scenes[0].id);
        toast(`Imported ${scenes.length} scene${scenes.length > 1 ? 's' : ''}`);
      } catch (e) {
        toast('Import failed: ' + e.message);
      }
    };
    reader.readAsText(file);
  }

  /* ============================================================
   * Wiring
   * ============================================================ */
  const plan = new PlanView($('#plan'), {
    getScene: scene,
    getSelection: () => state.selection,
    select: (kind, id) => select_(kind, id),
    changed: (o) => changed(o),
    units: () => state.units,
  });

  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.tab = b.dataset.tab;
    renderInspector();
  });
  $('#viewToggle').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setView(b.dataset.view);
  });
  $('#unitToggle').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setUnits(b.dataset.units);
  });
  $('#addScene').addEventListener('click', () => {
    const sc = S.blankScene(`Scene ${state.scenes.length + 1}`);
    state.scenes.push(sc);
    openScene(sc.id);
  });
  $('#exportBtn').addEventListener('click', exportJson);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', (e) => {
    if (e.target.files[0]) importJson(e.target.files[0]);
    e.target.value = '';
  });
  $('#printBtn').addEventListener('click', () => {
    if (state.view !== 'board') setView('board');
    setTimeout(() => window.print(), 300);
  });
  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('Replace all scenes with the sample set? Your scenes will be lost unless exported.')) return;
    state.scenes = S.sampleScenes();
    state.activeId = state.scenes[0].id;
    state.selection = null;
    renderSceneList();
    changed();
  });
  $('#optDof').addEventListener('change', (e) => {
    state.opts.showDof = e.target.checked;
    scheduleRender();
  });
  $('#optThirds').addEventListener('change', (e) => {
    state.opts.thirds = e.target.checked;
    scheduleRender();
  });
  $('#sweepMatch').addEventListener('change', (e) => {
    state.sweepMatch = e.target.checked;
    renderSweep();
  });
  $('#fitPlan').addEventListener('click', () => {
    plan.fit();
    plan.render();
  });
  $('#addSubjectQuick').addEventListener('click', () => addSubject('person'));
  $('#addLightQuick').addEventListener('click', () => addLight());

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const sc = scene();
    const sel = state.selection;
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
      e.preventDefault();
      removeSelected();
      return;
    }
    const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (nudge && sel) {
      const obj = sel.kind === 'subject' ? sc.subjects.find((s) => s.id === sel.id) : sel.kind === 'light' ? sc.lights.find((l) => l.id === sel.id) : sel.kind === 'camera' ? sc.camera : null;
      if (!obj) return;
      e.preventDefault();
      const step = e.shiftKey ? 0.5 : 0.1;
      obj.x = +(obj.x + nudge[0] * step).toFixed(2);
      obj.y = +(obj.y + nudge[1] * step).toFixed(2);
      changed();
    }
    if (e.key === 'Escape') select_(null);
  });

  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      plan.resize();
      renderFast();
      renderSceneList();
      if (state.view === 'board') renderBoard();
      else renderSweep();
    }, 120);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('pagehide', () => S.save(state));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') S.save(state);
  });
  if (window.ResizeObserver) new ResizeObserver(onResize).observe($('.plan-wrap'));

  // Initial paint.
  document.querySelectorAll('#unitToggle button').forEach((b) => b.classList.toggle('active', b.dataset.units === state.units));
  plan.resize();
  renderSceneList();
  renderInspector();
  renderFast();
  renderSweep();

  window.frameplan = { state, scene, changed, plan };
})();
