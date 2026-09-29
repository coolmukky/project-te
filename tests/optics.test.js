const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../js/optics.js');
const L = require('../js/lighting.js');
const S = require('../js/store.js');

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}±${tol}, got ${a}`);

test('circle of confusion and crop factor', () => {
  close(O.circleOfConfusion(O.SENSORS.ff), 0.0288, 0.0005);
  close(O.cropFactor(O.SENSORS.ff), 1, 1e-9);
  close(O.cropFactor(O.SENSORS.mft), 2.0, 0.05);
  close(O.cropFactor(O.SENSORS.apsc), 1.53, 0.02);
});

test('angle of view of a 50mm on full frame', () => {
  close(O.angleOfView(50, 36) * 180 / Math.PI, 39.6, 0.1);
  close(O.angleOfView(24, 36) * 180 / Math.PI, 73.7, 0.1);
});

test('depth of field matches reference values (50mm f/2.8 at 3 m, CoC 0.03)', () => {
  // Reference: standard DOF calculators give ~2.66 m to ~3.44 m, hyperfocal ~29.8 m.
  const d = O.depthOfField(50, 2.8, 3, O.SENSORS.ff, 0.03);
  close(d.hyperfocal, 29.81, 0.05);
  close(d.near, 2.73, 0.03);
  close(d.far, 3.33, 0.03);
  close(d.total, d.far - d.near, 1e-9);
  assert.ok(d.back > d.front, 'more DOF behind focus than in front');
});

test('focusing at hyperfocal gives infinite far limit and near ≈ H/2', () => {
  const H = O.depthOfField(35, 8, 5, O.SENSORS.ff).hyperfocal;
  const d = O.depthOfField(35, 8, H, O.SENSORS.ff);
  assert.equal(d.far, Infinity);
  close(d.near, H / 2, 0.05);
});

test('stopping down increases depth of field', () => {
  const wide = O.depthOfField(85, 1.8, 2.5, O.SENSORS.ff);
  const narrow = O.depthOfField(85, 8, 2.5, O.SENSORS.ff);
  assert.ok(narrow.total > wide.total);
});

test('blur disc is zero at focus, equals CoC at DOF limits, grows toward infinity', () => {
  const c = 0.03;
  const d = O.depthOfField(50, 2.8, 3, O.SENSORS.ff, c);
  close(O.blurDiscMm(50, 2.8, 3, 3), 0, 1e-9);
  close(O.blurDiscMm(50, 2.8, 3, d.near), c, 0.002);
  close(O.blurDiscMm(50, 2.8, 3, d.far), c, 0.002);
  assert.ok(O.blurDiscMm(50, 2.8, 3, Infinity) > O.blurDiscMm(50, 2.8, 3, 10));
});

test('focus closer than the focal length is clamped rather than producing NaN', () => {
  const d = O.depthOfField(600, 4, 0.1, O.SENSORS.ff);
  assert.ok(Number.isFinite(d.near) && d.near > 0);
  assert.ok(Number.isFinite(O.blurDiscMm(600, 4, 0.1, 5)));
});

test('frame size and shot size', () => {
  const f = O.frameSizeAt(50, O.SENSORS.ff, 5);
  close(f.w, 3.6, 1e-9);
  close(f.h, 2.4, 1e-9);
  assert.equal(O.shotSize(2.4, 1.75), 'Full shot');
  assert.equal(O.shotSize(0.3, 1.75), 'Close-up');
});

test('kelvin conversion: tungsten is warm, shade is cool', () => {
  const t = L.kelvinToRgb(3200);
  const sh = L.kelvinToRgb(9000);
  assert.ok(t[0] > t[2], 'tungsten has more red than blue');
  assert.ok(sh[2] > sh[0], 'shade has more blue than red');
});

test('inverse-square falloff and beam cone', () => {
  const light = { x: 0, y: 0, height: 1.5, aim: 0, power: 100, modifier: 'fresnel' };
  const near = L.incident(light, 1, 0, 1.5).amount;
  const far = L.incident(light, 2, 0, 1.5).amount;
  close(near / far, 4, 1e-6);
  assert.equal(L.incident(light, -2, 0, 1.5).amount, 0, 'behind a narrow light gets nothing');
  assert.equal(L.incident({ ...light, on: false }, 1, 0, 1.5).amount, 0);
});

test('subject shading: key from camera-left lights the screen-left side', () => {
  const camera = { x: 0, y: 0, heading: 90 };
  const subject = { x: 0, y: 3, height: 1.7 };
  const key = { x: -2, y: 3, height: 1.5, aim: 0, power: 80, modifier: 'fresnel', kelvin: 5600 };
  const samples = L.shadeSubject(subject, camera, [key], { level: 0.01, kelvin: 5600 }, 5);
  const left = L.luminance(samples[0].rgb);
  const right = L.luminance(samples[samples.length - 1].rgb);
  assert.ok(left > right * 5, `left ${left} should be much brighter than right ${right}`);
});

test('analyse reports a flat ratio for a frontal light and high ratio for a side light', () => {
  const camera = { x: 0, y: 0, heading: 90 };
  const subject = { x: 0, y: 3, height: 1.7 };
  const amb = { level: 0.02, kelvin: 5600 };
  const front = L.analyse(subject, camera, [{ x: 0, y: 1, height: 1.5, aim: 90, power: 60, modifier: 'softbox' }], amb);
  const side = L.analyse(subject, camera, [{ x: -2, y: 3, height: 1.5, aim: 0, power: 60, modifier: 'fresnel' }], amb);
  assert.ok(front.stops < 1.5, `front stops ${front.stops}`);
  assert.ok(side.stops > 3, `side stops ${side.stops}`);
});

test('store: sample scenes are well-formed and survive an export/import round trip', () => {
  const scenes = S.sampleScenes();
  assert.ok(scenes.length >= 3);
  for (const sc of scenes) {
    assert.ok(sc.camera.focal > 0 && sc.camera.aperture > 0);
    assert.ok(sc.subjects.some((s) => s.primary));
  }
  const imported = S.importScenes(JSON.stringify({ scenes }));
  assert.equal(imported.length, scenes.length);
  assert.equal(imported[0].camera.focal, scenes[0].camera.focal);
  assert.notEqual(imported[0].id, scenes[0].id, 'imported scenes get fresh ids');
  assert.throws(() => S.importScenes('{"scenes": []}'));
});

test('store: distance formatting in metres and feet', () => {
  assert.equal(S.formatDistance(2.5, 'm'), '2.50 m');
  assert.equal(S.formatDistance(Infinity, 'm'), '∞');
  assert.equal(S.formatDistance(0.3048 * 6 + 0.0254 * 3, 'ft'), '6′ 3″');
});
