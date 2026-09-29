/*
 * Optics math: sensor formats, field of view, depth of field and blur.
 * Distances in metres unless noted; focal lengths and sensor sizes in mm.
 */
(function (root) {
  'use strict';

  const SENSORS = {
    ff: { name: 'Full Frame', w: 36, h: 24 },
    s35: { name: 'Super 35', w: 24.89, h: 18.66 },
    apsc: { name: 'APS-C', w: 23.6, h: 15.6 },
    apscCanon: { name: 'APS-C (Canon)', w: 22.3, h: 14.9 },
    mft: { name: 'Micro Four Thirds', w: 17.3, h: 13 },
    oneInch: { name: '1-inch', w: 13.2, h: 8.8 },
    mf: { name: 'Medium Format 44×33', w: 44, h: 33 },
  };

  const FF_DIAG = Math.hypot(36, 24);

  const APERTURES = [
    0.95, 1.2, 1.4, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8,
    9, 10, 11, 13, 14, 16, 18, 20, 22,
  ];

  const FOCAL_PRESETS = [14, 18, 24, 28, 35, 50, 85, 105, 135, 200];

  function sensorOf(key) {
    return SENSORS[key] || SENSORS.ff;
  }

  function diagonal(sensor) {
    return Math.hypot(sensor.w, sensor.h);
  }

  /** Circle of confusion (mm) using the common diagonal / 1500 rule. */
  function circleOfConfusion(sensor) {
    return diagonal(sensor) / 1500;
  }

  function cropFactor(sensor) {
    return FF_DIAG / diagonal(sensor);
  }

  /** Angle of view (radians) across a sensor dimension in mm. */
  function angleOfView(focalMm, sizeMm) {
    return 2 * Math.atan(sizeMm / (2 * focalMm));
  }

  function hyperfocalMm(focalMm, fNumber, cocMm) {
    return (focalMm * focalMm) / (fNumber * cocMm) + focalMm;
  }

  /** Focus distance must be beyond the focal length to form an image. */
  function clampFocusMm(focalMm, focusM) {
    return Math.max(focusM * 1000, focalMm * 1.05);
  }

  /**
   * Depth of field for a thin lens.
   * Returns near/far limits (m, far may be Infinity), total, hyperfocal and CoC.
   */
  function depthOfField(focalMm, fNumber, focusM, sensor, cocOverrideMm) {
    const c = cocOverrideMm || circleOfConfusion(sensor);
    const s = clampFocusMm(focalMm, focusM);
    const f = focalMm;
    const H = hyperfocalMm(f, fNumber, c);
    const near = (s * (H - f)) / (H + s - 2 * f);
    const far = s >= H ? Infinity : (s * (H - f)) / (H - s);
    return {
      near: near / 1000,
      far: far === Infinity ? Infinity : far / 1000,
      total: far === Infinity ? Infinity : (far - near) / 1000,
      hyperfocal: H / 1000,
      coc: c,
      front: (s - near) / 1000,
      back: far === Infinity ? Infinity : (far - s) / 1000,
    };
  }

  /**
   * Diameter (mm, on the sensor) of the blur disc for a point at distance dM
   * when the lens is focused at focusM. dM may be Infinity.
   */
  function blurDiscMm(focalMm, fNumber, focusM, dM) {
    const f = focalMm;
    const s = clampFocusMm(f, focusM);
    const k = (f * f) / (fNumber * (s - f));
    if (dM === Infinity) return k;
    const d = Math.max(dM * 1000, f * 1.01);
    return (k * Math.abs(d - s)) / d;
  }

  /** Blur disc as a fraction of the frame width. */
  function blurFraction(focalMm, fNumber, focusM, dM, sensor) {
    return blurDiscMm(focalMm, fNumber, focusM, dM) / sensor.w;
  }

  function magnification(focalMm, focusM) {
    const s = clampFocusMm(focalMm, focusM);
    return focalMm / (s - focalMm);
  }

  /** Width x height (m) of the frame at a given distance along the lens axis. */
  function frameSizeAt(focalMm, sensor, dM) {
    return { w: (sensor.w * dM) / focalMm, h: (sensor.h * dM) / focalMm };
  }

  /** Full-frame equivalent focal length and aperture (for DOF). */
  function equivalents(focalMm, fNumber, sensor) {
    const cf = cropFactor(sensor);
    return { focal: focalMm * cf, fNumber: fNumber * cf, crop: cf };
  }

  /** Shot size name from the frame height at the subject, relative to subject height. */
  function shotSize(frameHeightM, subjectHeightM) {
    const r = frameHeightM / (subjectHeightM || 1.75);
    if (r < 0.12) return 'Extreme close-up';
    if (r < 0.22) return 'Close-up';
    if (r < 0.38) return 'Medium close-up';
    if (r < 0.62) return 'Medium shot';
    if (r < 0.85) return 'Cowboy / ¾ shot';
    if (r < 1.6) return 'Full shot';
    if (r < 3.5) return 'Wide shot';
    return 'Extreme wide shot';
  }

  const api = {
    SENSORS,
    APERTURES,
    FOCAL_PRESETS,
    sensorOf,
    diagonal,
    circleOfConfusion,
    cropFactor,
    angleOfView,
    hyperfocalMm,
    depthOfField,
    blurDiscMm,
    blurFraction,
    magnification,
    frameSizeAt,
    equivalents,
    shotSize,
  };

  root.Optics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
