/*
 * Lighting model: colour temperature, light modifiers, and a simple
 * cylinder shading model used both for readouts and the camera preview.
 * World units are metres; angles in degrees, counter-clockwise from +x.
 */
(function (root) {
  'use strict';

  const MODIFIERS = {
    softbox: { label: 'Softbox', beam: 90, soft: 0.6 },
    umbrella: { label: 'Umbrella', beam: 110, soft: 0.7 },
    ledpanel: { label: 'LED panel', beam: 60, soft: 0.4 },
    fresnel: { label: 'Fresnel (hard)', beam: 30, soft: 0.05 },
    reflector: { label: 'Bounce / reflector', beam: 100, soft: 0.8 },
    practical: { label: 'Practical (bare bulb)', beam: 360, soft: 0.5 },
    sun: { label: 'Sun / window (directional)', beam: 360, soft: 0.1, directional: true },
  };

  const ROLES = {
    key: { label: 'Key', color: '#f5b642' },
    fill: { label: 'Fill', color: '#6fb3ff' },
    rim: { label: 'Rim / back', color: '#e27dff' },
    hair: { label: 'Hair', color: '#ff8fb1' },
    background: { label: 'Background', color: '#57d6a4' },
    practical: { label: 'Practical', color: '#ffd27a' },
  };

  const DEG = Math.PI / 180;

  /** Colour temperature (K) to linear-ish RGB in 0..1 (Tanner Helland fit). */
  function kelvinToRgb(kelvin) {
    const t = Math.min(Math.max(kelvin, 1000), 40000) / 100;
    let r, g, b;
    if (t <= 66) {
      r = 255;
      g = 99.4708025861 * Math.log(t) - 161.1195681661;
      b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    } else {
      r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
      g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
      b = 255;
    }
    const clamp = (v) => Math.min(Math.max(v, 0), 255) / 255;
    return [clamp(r), clamp(g), clamp(b)];
  }

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return [1, 1, 1];
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function rgbToCss(rgb, alpha) {
    const c = rgb.map((v) => Math.round(Math.min(Math.max(v, 0), 1) * 255));
    return alpha === undefined
      ? `rgb(${c[0]},${c[1]},${c[2]})`
      : `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
  }

  /** Emitted colour of a light: colour temperature filtered by an optional gel. */
  function lightColor(light) {
    const k = kelvinToRgb(light.kelvin || 5600);
    if (!light.gel) return k;
    const g = hexToRgb(light.gel);
    return [k[0] * g[0], k[1] * g[1], k[2] * g[2]];
  }

  function modifierOf(light) {
    return MODIFIERS[light.modifier] || MODIFIERS.softbox;
  }

  function beamOf(light) {
    return light.beam || modifierOf(light).beam;
  }

  /**
   * Illumination of a point by one light.
   * Returns { amount, dir } where dir is the unit 3D vector from point to light
   * (for directional lights, opposite to the aim) and amount is the scalar
   * irradiance before the surface-orientation term.
   */
  function incident(light, px, py, pz) {
    if (light.on === false) return { amount: 0, dir: [0, 0, 1] };
    const mod = modifierOf(light);
    const power = (light.power === undefined ? 50 : light.power) / 100;
    const aim = (light.aim || 0) * DEG;
    const lh = light.height === undefined ? 2 : light.height;

    if (mod.directional) {
      // Sun rays travel along the aim direction, dropping at `elevation` degrees.
      const el = (light.elevation === undefined ? 35 : light.elevation) * DEG;
      const dir = [-Math.cos(aim) * Math.cos(el), -Math.sin(aim) * Math.cos(el), Math.sin(el)];
      return { amount: power * 1.5, dir };
    }

    const dx = light.x - px;
    const dy = light.y - py;
    const dz = lh - pz;
    const dist = Math.max(Math.hypot(dx, dy, dz), 0.3);
    const dir = [dx / dist, dy / dist, dz / dist];

    let cone = 1;
    const beam = beamOf(light);
    if (beam < 360) {
      // Angle between the light's aim and the direction light -> point (plan view).
      const toPoint = Math.atan2(-dy, -dx);
      let diff = Math.abs(toPoint - aim) % (2 * Math.PI);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      const half = (beam / 2) * DEG;
      const edge = half * 0.35 + 8 * DEG;
      if (diff > half) cone = Math.max(0, 1 - (diff - half) / edge);
    }
    // Inverse-square, normalised so 100% power at 2 m gives 1.0.
    const amount = (power * 4 * cone) / (dist * dist);
    return { amount, dir };
  }

  /**
   * Shade a vertical cylinder (a subject) as seen from the camera.
   * Returns `samples` colours across the visible silhouette from screen-left
   * (u=-1) to screen-right (u=+1), in unbounded linear units.
   */
  function shadeSubject(subject, camera, lights, ambient, samples) {
    const n = samples || 11;
    const pz = (subject.height || 1.7) * 0.85;
    let tx = camera.x - subject.x;
    let ty = camera.y - subject.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    // Screen-right as seen from the camera is the camera's right-hand side.
    const rx = -ty;
    const ry = tx;

    const amb = ambientColor(ambient);
    const inc = lights.map((l) => ({
      i: incident(l, subject.x, subject.y, pz),
      color: lightColor(l),
      wrap: modifierOf(l).soft * 0.5,
    }));

    const out = [];
    for (let k = 0; k < n; k++) {
      const u = n === 1 ? 0 : -1 + (2 * k) / (n - 1);
      const c = Math.sqrt(Math.max(0, 1 - u * u));
      const nx = tx * c + rx * u;
      const ny = ty * c + ry * u;
      const rgb = [amb[0], amb[1], amb[2]];
      for (const { i, color, wrap } of inc) {
        if (i.amount <= 0) continue;
        const ndl = nx * i.dir[0] + ny * i.dir[1];
        const lambert = Math.max(0, (ndl + wrap) / (1 + wrap));
        const e = i.amount * lambert;
        rgb[0] += e * color[0];
        rgb[1] += e * color[1];
        rgb[2] += e * color[2];
      }
      out.push({ u, rgb });
    }
    return out;
  }

  /** Light falling on a surface facing direction (nx, ny) at a point. */
  function shadePlane(px, py, pz, nx, ny, lights, ambient) {
    const amb = ambientColor(ambient);
    const rgb = [amb[0], amb[1], amb[2]];
    for (const l of lights) {
      const i = incident(l, px, py, pz);
      if (i.amount <= 0) continue;
      const ndl = Math.max(0, nx * i.dir[0] + ny * i.dir[1]);
      const col = lightColor(l);
      const e = i.amount * (0.25 + 0.75 * ndl);
      rgb[0] += e * col[0];
      rgb[1] += e * col[1];
      rgb[2] += e * col[2];
    }
    return rgb;
  }

  function ambientColor(ambient) {
    const a = ambient || { level: 0.1, kelvin: 6500 };
    const c = kelvinToRgb(a.kelvin || 6500);
    return [c[0] * a.level, c[1] * a.level, c[2] * a.level];
  }

  function luminance(rgb) {
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }

  /**
   * Readouts for one subject: per-light contribution in stops relative to the
   * brightest, and the lit/shadow side contrast ratio.
   */
  function analyse(subject, camera, lights, ambient) {
    const pz = (subject.height || 1.7) * 0.85;
    const per = lights
      .filter((l) => l.on !== false)
      .map((l) => ({ light: l, amount: incident(l, subject.x, subject.y, pz).amount }));
    const max = Math.max(0, ...per.map((p) => p.amount));
    const contributions = per.map((p) => ({
      id: p.light.id,
      name: p.light.name,
      role: p.light.role,
      amount: p.amount,
      stops: p.amount > 0 && max > 0 ? Math.log2(p.amount / max) : -Infinity,
    }));
    const shade = shadeSubject(subject, camera, lights, ambient, 11).filter(
      (s) => Math.abs(s.u) <= 0.8
    );
    const lums = shade.map((s) => luminance(s.rgb));
    const hi = Math.max(...lums);
    const lo = Math.max(Math.min(...lums), 1e-4);
    const ratio = hi / lo;
    return { contributions, ratio, stops: Math.log2(ratio), peak: hi };
  }

  /** Filmic-ish tone mapping of linear light into display 0..1. */
  function toneMap(rgb, exposure) {
    return rgb.map((v) => 1 - Math.exp(-2.2 * v * exposure));
  }

  const api = {
    MODIFIERS,
    ROLES,
    kelvinToRgb,
    hexToRgb,
    rgbToCss,
    lightColor,
    modifierOf,
    beamOf,
    incident,
    shadeSubject,
    shadePlane,
    ambientColor,
    luminance,
    analyse,
    toneMap,
  };

  root.Lighting = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
