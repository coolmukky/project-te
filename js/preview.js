/*
 * Simulated camera view: perspective projection of the scene through the
 * chosen lens, with each layer blurred by its circle of confusion.
 */
(function (root) {
  'use strict';

  const O = root.Optics;
  const L = root.Lighting;
  const DEG = Math.PI / 180;

  const GUIDES = {
    none: null,
    '16:9': 16 / 9,
    '2.39:1': 2.39,
    '1.85:1': 1.85,
    '4:3': 4 / 3,
    '4:5': 4 / 5,
    '1:1': 1,
    '9:16': 9 / 16,
  };

  const SKIN = [0.78, 0.6, 0.5];

  let filterSupported = null;
  function supportsFilter(ctx) {
    if (filterSupported === null) filterSupported = typeof ctx.filter === 'string';
    return filterSupported;
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  /** Draw an image with a Gaussian blur, falling back to down/up-sampling. */
  function drawBlurred(ctx, img, x, y, sigma) {
    if (sigma < 0.4) {
      ctx.drawImage(img, x, y);
      return;
    }
    if (supportsFilter(ctx)) {
      ctx.save();
      ctx.filter = `blur(${sigma.toFixed(2)}px)`;
      ctx.drawImage(img, x, y);
      ctx.restore();
      return;
    }
    const f = Math.min(Math.max(sigma / 1.5, 1), 32);
    const tmp = makeCanvas(img.width / f, img.height / f);
    const t = tmp.getContext('2d');
    t.imageSmoothingQuality = 'high';
    t.drawImage(img, 0, 0, tmp.width, tmp.height);
    ctx.save();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tmp, x, y, img.width, img.height);
    ctx.restore();
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Camera basis and projection helpers shared by the renderer. */
  function makeCamera(scene, W, H) {
    const cam = scene.camera;
    const sensor = O.sensorOf(cam.sensor);
    const h = cam.heading * DEG;
    const fwd = [Math.cos(h), Math.sin(h)];
    const right = [Math.sin(h), -Math.cos(h)];
    const k = W / sensor.w; // canvas px per mm on the sensor
    const f = cam.focal;
    return {
      cam,
      sensor,
      fwd,
      right,
      k,
      W,
      H,
      depth(x, y) {
        return (x - cam.x) * fwd[0] + (y - cam.y) * fwd[1];
      },
      lateral(x, y) {
        return (x - cam.x) * right[0] + (y - cam.y) * right[1];
      },
      project(x, y, z) {
        const Z = this.depth(x, y);
        if (Z <= 0.05) return null;
        const X = this.lateral(x, y);
        return { x: W / 2 + ((f * X) / Z) * k, y: H / 2 - ((f * (z - cam.height)) / Z) * k, Z, scale: (f / Z) * k };
      },
      floorY(Z) {
        return H / 2 + ((f * cam.height) / Z) * k;
      },
      /** Blur disc diameter in canvas pixels for something at depth Z. */
      blurPx(Z) {
        return O.blurDiscMm(f, cam.aperture, cam.focus, Z) * k;
      },
      /** World point on a plane at depth Z for a given screen x. */
      worldAt(px, Z) {
        const X = ((px - W / 2) / k) * (Z / f);
        return [cam.x + fwd[0] * Z + right[0] * X, cam.y + fwd[1] * Z + right[1] * X];
      },
    };
  }

  function sigmaFor(blurPx) {
    return Math.min(blurPx * 0.38, 80);
  }

  function exposureFor(scene, C) {
    const ev = Math.pow(2, scene.exposure || 0);
    const primary = scene.subjects.find((s) => s.primary) || scene.subjects[0];
    let peak = 0;
    if (primary && C.depth(primary.x, primary.y) > 0.1) {
      peak = L.analyse(primary, scene.camera, scene.lights, scene.ambient).peak;
    }
    if (!(peak > 0.02)) {
      const [wx, wy] = C.worldAt(C.W / 2, scene.background.distance);
      peak = Math.max(L.luminance(L.shadePlane(wx, wy, 1.5, -C.fwd[0], -C.fwd[1], scene.lights, scene.ambient)), 0.05);
    }
    return ev / peak;
  }

  function mulColor(a, b) {
    return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
  }

  function css(rgb, exposure, alpha) {
    return L.rgbToCss(L.toneMap(rgb, exposure), alpha);
  }

  function floorLight(scene, x, y) {
    const amb = L.ambientColor(scene.ambient);
    const rgb = [amb[0], amb[1], amb[2]];
    for (const l of scene.lights) {
      const i = L.incident(l, x, y, 0);
      if (i.amount <= 0) continue;
      const up = Math.max(0.15, i.dir[2]);
      const c = L.lightColor(l);
      rgb[0] += i.amount * up * c[0];
      rgb[1] += i.amount * up * c[1];
      rgb[2] += i.amount * up * c[2];
    }
    return rgb;
  }

  function drawFloor(ctx, scene, C, exposure, opts) {
    const D = scene.background.distance;
    const top = C.floorY(D);
    const zBottom = (scene.camera.focal * scene.camera.height * C.k) / (C.H / 2);
    const albedo = [0.32, 0.3, 0.29];
    const grad = ctx.createLinearGradient(0, top, 0, C.H);
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = top + (C.H - top) * t;
      const Z = Math.max((scene.camera.focal * scene.camera.height * C.k) / Math.max(y - C.H / 2, 0.5), 0.05);
      const [wx, wy] = C.worldAt(C.W / 2, Math.min(Z, D));
      grad.addColorStop(t, css(mulColor(albedo, floorLight(scene, wx, wy)), exposure));
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, top, C.W, C.H - top);

    // Distance lines on the floor, each blurred by its own circle of confusion.
    ctx.save();
    ctx.lineWidth = Math.max(1, C.W / 600);
    const lineCol = 'rgba(255,255,255,0.14)';
    const start = Math.max(Math.ceil(zBottom * 2) / 2, 0.5);
    for (let Z = start; Z < D; Z += Z < 6 ? 0.5 : 1) {
      const y = C.floorY(Z);
      const sigma = sigmaFor(C.blurPx(Z));
      if (supportsFilter(ctx)) ctx.filter = sigma > 0.4 ? `blur(${sigma.toFixed(2)}px)` : 'none';
      ctx.strokeStyle = lineCol;
      // Blurred lines spread their energy; fade them so near-camera lines don't band.
      ctx.globalAlpha = (Number.isInteger(Z) ? 1 : 0.5) / (1 + sigma / 4);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(C.W, y);
      ctx.stroke();
    }
    ctx.restore();

    if (opts.showDof) {
      const dof = O.depthOfField(scene.camera.focal, scene.camera.aperture, scene.camera.focus, C.sensor);
      const nearZ = Math.max(dof.near, zBottom);
      const farZ = Math.min(dof.far, D);
      if (farZ > nearZ) {
        const y0 = C.floorY(farZ);
        const y1 = Math.min(C.floorY(nearZ), C.H);
        ctx.fillStyle = 'rgba(80, 220, 140, 0.16)';
        ctx.fillRect(0, y0, C.W, y1 - y0);
        ctx.strokeStyle = 'rgba(80, 220, 140, 0.45)';
        ctx.lineWidth = Math.max(1, C.W / 700);
        ctx.setLineDash([6, 5]);
        for (const yy of [y0, y1]) {
          ctx.beginPath();
          ctx.moveTo(0, yy);
          ctx.lineTo(C.W, yy);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      const fz = scene.camera.focus;
      if (fz < D && fz > zBottom) {
        const fy = C.floorY(fz);
        ctx.strokeStyle = 'rgba(120, 255, 170, 0.9)';
        ctx.lineWidth = Math.max(1.5, C.W / 400);
        ctx.beginPath();
        ctx.moveTo(0, fy);
        ctx.lineTo(C.W, fy);
        ctx.stroke();
      }
    }
  }

  function drawWall(ctx, scene, C, exposure) {
    const bg = scene.background;
    const D = bg.distance;
    const bottom = C.floorY(D);
    const sigma = sigmaFor(C.blurPx(D));
    const pad = Math.ceil(sigma * 3);
    const sprite = makeCanvas(C.W + pad * 2, bottom + pad * 2);
    const s = sprite.getContext('2d');
    s.translate(pad, pad);

    const albedo = L.hexToRgb(bg.color);
    const grad = s.createLinearGradient(-pad, 0, C.W + pad, 0);
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const [wx, wy] = C.worldAt(-pad + (C.W + 2 * pad) * t, D);
      const lit = L.shadePlane(wx, wy, 1.4, -C.fwd[0], -C.fwd[1], scene.lights, scene.ambient);
      grad.addColorStop(t, css(mulColor(albedo, lit), exposure));
    }
    s.fillStyle = grad;
    s.fillRect(-pad, -pad, C.W + pad * 2, bottom + pad);

    if (bg.pattern === 'grid') {
      // Panels / windows every metre: shows how much detail survives the blur.
      const scale = (scene.camera.focal / D) * C.k;
      s.strokeStyle = 'rgba(0,0,0,0.35)';
      s.lineWidth = Math.max(1, scale * 0.04);
      const halfW = (C.W / 2 / scale) + 2;
      for (let X = -Math.ceil(halfW); X <= halfW; X += 1) {
        const x = C.W / 2 + X * scale;
        s.beginPath();
        s.moveTo(x, -pad);
        s.lineTo(x, bottom);
        s.stroke();
      }
      for (let z = 0; z < 12; z += 1) {
        const y = C.H / 2 - (z - scene.camera.height) * scale;
        if (y < -pad || y > bottom) continue;
        s.beginPath();
        s.moveTo(-pad, y);
        s.lineTo(C.W + pad, y);
        s.stroke();
      }
      s.fillStyle = 'rgba(255,255,255,0.08)';
      for (let X = -Math.ceil(halfW); X <= halfW; X += 2) {
        const x = C.W / 2 + (X + 0.2) * scale;
        const y = C.H / 2 - (2.4 - scene.camera.height) * scale;
        s.fillRect(x, y, scale * 0.6, scale * 1.2);
      }
    }
    drawBlurred(ctx, sprite, -pad, -pad, sigma);

    if (bg.pattern === 'lights') drawBokehLights(ctx, scene, C, D, exposure);
  }

  /** Point lights on the backdrop drawn as bokeh discs sized by the blur circle. */
  function drawBokehLights(ctx, scene, C, D, exposure) {
    const rand = mulberry32(1234);
    const blur = C.blurPx(D);
    const scale = (scene.camera.focal / D) * C.k;
    const dot = Math.max(scale * 0.035, 1.2);
    const diameter = Math.max(blur, dot);
    const energy = Math.min(1, Math.pow(dot / diameter, 2) * 6 + 0.12);
    const warm = [
      [1, 0.72, 0.38],
      [1, 0.85, 0.6],
      [0.95, 0.55, 0.3],
      [1, 0.93, 0.8],
    ];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 160; i++) {
      const X = (rand() - 0.5) * 30;
      const Z = 0.6 + rand() * 3.2 + Math.sin(X * 0.9) * 0.2;
      const x = C.W / 2 + X * scale;
      const y = C.H / 2 - (Z - scene.camera.height) * scale;
      if (x < -diameter || x > C.W + diameter || y < -diameter || y > C.floorY(D)) continue;
      const col = warm[i % warm.length];
      const b = 0.55 + rand() * 0.45;
      const r = diameter / 2;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const rgb = col.map((v) => v * b);
      const edge = blur > dot * 2 ? 0.85 : 0.2;
      g.addColorStop(0, L.rgbToCss(rgb, energy * 0.9));
      g.addColorStop(edge, L.rgbToCss(rgb, energy));
      g.addColorStop(1, L.rgbToCss(rgb, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function personPath(g, w, h) {
    // Origin at feet centre; y up is negative.
    const headR = h * 0.062;
    const headY = -h + headR * 1.15;
    const sh = w / 2;
    const hip = w * 0.36;
    g.beginPath();
    g.moveTo(-hip * 0.95, 0);
    g.lineTo(-hip, -h * 0.47);
    g.bezierCurveTo(-sh * 0.95, -h * 0.62, -sh, -h * 0.74, -sh * 0.92, -h * 0.8);
    g.bezierCurveTo(-sh * 0.8, -h * 0.83, -sh * 0.35, -h * 0.84, -headR * 0.55, -h * 0.855);
    g.lineTo(headR * 0.55, -h * 0.855);
    g.bezierCurveTo(sh * 0.35, -h * 0.84, sh * 0.8, -h * 0.83, sh * 0.92, -h * 0.8);
    g.bezierCurveTo(sh, -h * 0.74, sh * 0.95, -h * 0.62, hip, -h * 0.47);
    g.lineTo(hip * 0.95, 0);
    g.lineTo(hip * 0.12, 0);
    g.lineTo(0, -h * 0.44);
    g.lineTo(-hip * 0.12, 0);
    g.closePath();
    return { headR, headY };
  }

  function shadeGradient(g, x0, x1, samples, albedo, exposure) {
    const grad = g.createLinearGradient(x0, 0, x1, 0);
    for (const s of samples) {
      grad.addColorStop((s.u + 1) / 2, css(mulColor(albedo, s.rgb), exposure));
    }
    return grad;
  }

  function drawSubject(ctx, scene, C, subj, exposure) {
    const p = C.project(subj.x, subj.y, 0);
    if (!p || p.Z < 0.2) return;
    const person = subj.kind !== 'object';
    const hM = subj.height || 1.7;
    const wM = subj.width || (person ? hM * 0.27 : hM * 0.4);
    const w = wM * p.scale;
    const h = hM * p.scale;
    const sigma = sigmaFor(C.blurPx(p.Z));
    const pad = Math.ceil(sigma * 3 + 4);
    if (w + pad * 2 > 6000 || h + pad * 2 > 6000) return;
    const sprite = makeCanvas(w + pad * 2, h + pad * 2);
    const g = sprite.getContext('2d');
    g.translate(pad + w / 2, pad + h);

    const samples = L.shadeSubject(subj, scene.camera, scene.lights, scene.ambient, 13);
    const albedo = L.hexToRgb(subj.color);
    if (person) {
      const { headR, headY } = personPath(g, w, h);
      g.fillStyle = shadeGradient(g, -w / 2, w / 2, samples, albedo, exposure);
      g.fill();
      g.beginPath();
      g.ellipse(0, headY, headR * 0.86, headR * 1.1, 0, 0, Math.PI * 2);
      g.fillStyle = shadeGradient(g, -headR, headR, samples, SKIN, exposure);
      g.fill();
      g.beginPath();
      g.rect(-headR * 0.45, headY + headR * 0.9, headR * 0.9, headR * 0.6);
      g.fill();
    } else {
      const r = Math.min(w * 0.15, h * 0.1);
      g.beginPath();
      g.moveTo(-w / 2, 0);
      g.lineTo(-w / 2, -h + r);
      g.quadraticCurveTo(-w / 2, -h, -w / 2 + r, -h);
      g.lineTo(w / 2 - r, -h);
      g.quadraticCurveTo(w / 2, -h, w / 2, -h + r);
      g.lineTo(w / 2, 0);
      g.closePath();
      g.fillStyle = shadeGradient(g, -w / 2, w / 2, samples, albedo, exposure);
      g.fill();
    }

    // Soft contact shadow on the floor.
    ctx.save();
    const shadowSigma = Math.max(sigma, w * 0.08);
    if (supportsFilter(ctx)) ctx.filter = `blur(${shadowSigma.toFixed(1)}px)`;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, w * 0.6, Math.max(w * 0.08, 1), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawBlurred(ctx, sprite, p.x - w / 2 - pad, p.y - h - pad, sigma);
  }

  /** Practical lights in frame glow; other fixtures in frame get a warning box. */
  function drawFixtures(ctx, scene, C, exposure, showWarnings) {
    const warnings = [];
    for (const l of scene.lights) {
      const mod = L.modifierOf(l);
      if (mod.directional) continue;
      const p = C.project(l.x, l.y, l.height);
      if (!p || p.x < -40 || p.x > C.W + 40 || p.y < -40 || p.y > C.H + 40) continue;
      const blur = C.blurPx(p.Z);
      if (l.modifier === 'practical') {
        if (l.on === false) continue;
        const bulb = Math.max(0.08 * p.scale, 2);
        const d = Math.max(blur, bulb);
        const col = L.lightColor(l);
        const a = Math.min(1, Math.pow(bulb / d, 2) * 3 + 0.35) * Math.min(1, (l.power || 50) / 40);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, d * 3);
        halo.addColorStop(0, L.rgbToCss(col, 0.35 * a));
        halo.addColorStop(1, L.rgbToCss(col, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, d * 3, 0, Math.PI * 2);
        ctx.fill();
        const core = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, d / 2);
        core.addColorStop(0, L.rgbToCss([1, 1, 1], a));
        core.addColorStop(0.7, L.rgbToCss(col, a));
        core.addColorStop(1, L.rgbToCss(col, 0));
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(p.x, p.y, d / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (p.Z < scene.background.distance) {
        const s = Math.max(0.5 * p.scale, 6);
        warnings.push({ x: p.x, y: p.y, s, name: l.name });
      }
    }
    for (const wv of showWarnings ? warnings : []) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 170, 60, 0.95)';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = Math.max(1, C.W / 500);
      ctx.strokeRect(wv.x - wv.s / 2, wv.y - wv.s / 2, wv.s, wv.s);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255, 170, 60, 0.95)';
      ctx.font = `${Math.max(10, C.W / 60)}px system-ui, sans-serif`;
      ctx.fillText('⚠ ' + wv.name + ' in shot', wv.x - wv.s / 2, wv.y - wv.s / 2 - 4);
      ctx.restore();
    }
    return warnings;
  }

  function drawGuides(ctx, scene, C, opts) {
    const ratio = GUIDES[scene.camera.guide];
    let gx = 0;
    let gy = 0;
    let gw = C.W;
    let gh = C.H;
    if (ratio) {
      if (ratio > C.W / C.H) {
        gh = C.W / ratio;
        gy = (C.H - gh) / 2;
      } else {
        gw = C.H * ratio;
        gx = (C.W - gw) / 2;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, C.W, gy);
      ctx.fillRect(0, gy + gh, C.W, C.H - gy - gh);
      ctx.fillRect(0, gy, gx, gh);
      ctx.fillRect(gx + gw, gy, C.W - gx - gw, gh);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(gx + 0.5, gy + 0.5, gw - 1, gh - 1);
    }
    if (opts.thirds) {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 3; i++) {
        ctx.moveTo(gx + (gw * i) / 3, gy);
        ctx.lineTo(gx + (gw * i) / 3, gy + gh);
        ctx.moveTo(gx, gy + (gh * i) / 3);
        ctx.lineTo(gx + gw, gy + (gh * i) / 3);
      }
      ctx.stroke();
    }
  }

  function drawVignette(ctx, C) {
    const g = ctx.createRadialGradient(C.W / 2, C.H / 2, Math.min(C.W, C.H) * 0.35, C.W / 2, C.H / 2, Math.hypot(C.W, C.H) * 0.6);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, C.W, C.H);
  }

  /**
   * Render `scene` into `canvas` (its current pixel size). Returns info about
   * the render such as fixtures visible in frame.
   */
  function render(canvas, scene, opts) {
    const options = Object.assign({ showDof: false, thirds: false, guides: true, warnings: true }, opts);
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const C = makeCamera(scene, W, H);
    const exposure = exposureFor(scene, C);

    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    drawFloor(ctx, scene, C, exposure, options);
    drawWall(ctx, scene, C, exposure);

    const subjects = scene.subjects
      .map((s) => ({ s, Z: C.depth(s.x, s.y) }))
      .filter((o) => o.Z > 0.2 && o.Z < scene.background.distance)
      .sort((a, b) => b.Z - a.Z);
    for (const { s } of subjects) drawSubject(ctx, scene, C, s, exposure);

    const warnings = drawFixtures(ctx, scene, C, exposure, options.warnings);
    drawVignette(ctx, C);
    if (options.guides) drawGuides(ctx, scene, C, options);
    ctx.restore();
    return { warnings };
  }

  /** Canvas aspect (height / width) for a scene's sensor. */
  function aspectOf(scene) {
    const s = O.sensorOf(scene.camera.sensor);
    return s.h / s.w;
  }

  root.Preview = { render, aspectOf, GUIDES, makeCamera };
})(window);
