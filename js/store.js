/*
 * Scene data model, sample scenes, persistence and unit formatting.
 */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'frameplan.v1';
  const FT = 0.3048;

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9);
  }

  function aimAt(from, to) {
    return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  }

  function subject(props) {
    return Object.assign(
      { id: uid('sub'), name: 'Subject', kind: 'person', x: 0, y: 3, height: 1.75, color: '#8a6f5c', primary: false },
      props
    );
  }

  function light(props, target) {
    const l = Object.assign(
      {
        id: uid('lt'),
        name: 'Light',
        role: 'key',
        modifier: 'softbox',
        x: -1.5,
        y: 3,
        height: 2,
        aim: 0,
        power: 60,
        kelvin: 5600,
        gel: '',
        on: true,
      },
      props
    );
    if (target && props.aim === undefined) l.aim = Math.round(aimAt(l, target));
    return l;
  }

  function blankScene(name) {
    const s = subject({ name: 'Talent', x: 0, y: 3, primary: true });
    return {
      id: uid('scene'),
      name: name || 'New scene',
      notes: '',
      camera: { x: 0, y: 0, heading: 90, height: 1.5, sensor: 'ff', focal: 50, aperture: 2.8, focus: 3, guide: 'none' },
      background: { distance: 6, color: '#4a5263', pattern: 'lights' },
      ambient: { level: 0.08, kelvin: 6500 },
      exposure: 0,
      subjects: [s],
      lights: [light({ name: 'Key', role: 'key', x: -1.6, y: 4, height: 2.2, power: 60 }, s)],
    };
  }

  function sampleScenes() {
    const interviewee = subject({ name: 'Interviewee', x: 0, y: 2.6, primary: true, color: '#5b6f8c' });
    const interview = {
      id: uid('scene'),
      name: 'Interview — three-point',
      notes: 'Sit talent 2.5 m off the back wall so the string lights melt into bokeh. Keep eyeline just off-lens, toward camera left.',
      camera: { x: 0, y: 0, heading: 90, height: 1.55, sensor: 'ff', focal: 85, aperture: 2.8, focus: 2.6, guide: '16:9' },
      background: { distance: 6.5, color: '#3b3f4f', pattern: 'lights' },
      ambient: { level: 0.05, kelvin: 4300 },
      exposure: 0,
      subjects: [interviewee],
      lights: [
        light({ name: 'Key softbox', role: 'key', modifier: 'softbox', x: -1.4, y: 1.7, height: 2, power: 55, kelvin: 5600 }, interviewee),
        light({ name: 'Fill bounce', role: 'fill', modifier: 'reflector', x: 1.3, y: 1.8, height: 1.4, power: 16, kelvin: 5600 }, interviewee),
        light({ name: 'Rim', role: 'rim', modifier: 'fresnel', x: 1.3, y: 3.9, height: 2.3, power: 35, kelvin: 4300 }, interviewee),
        light({ name: 'BG wash', role: 'background', modifier: 'ledpanel', x: -2, y: 5.2, height: 1.2, power: 30, kelvin: 3200, gel: '#ffb36b' }, { x: 0.5, y: 6.5 }),
      ],
    };

    const lead = subject({ name: 'Lead', x: -0.4, y: 3.2, primary: true, color: '#7a4a3f' });
    const second = subject({ name: 'Second', x: 0.9, y: 5.4, color: '#3f5a4a', height: 1.68 });
    const twoShot = {
      id: uid('scene'),
      name: 'Walk & talk — two-shot',
      notes: 'Rack focus from Lead to Second on the line "over there". Second sits outside DOF at f/2 — pull to f/5.6 if both must be sharp.',
      camera: { x: 0, y: 0, heading: 90, height: 1.6, sensor: 's35', focal: 35, aperture: 2, focus: 3.2, guide: '2.39:1' },
      background: { distance: 11, color: '#51606b', pattern: 'grid' },
      ambient: { level: 0.25, kelvin: 7000 },
      exposure: 0,
      subjects: [lead, second],
      lights: [
        light({ name: 'Sun', role: 'key', modifier: 'sun', x: -4, y: 8, height: 6, aim: -40, elevation: 30, power: 45, kelvin: 5200 }),
        light({ name: 'Neg fill / bounce', role: 'fill', modifier: 'reflector', x: 1.6, y: 2.4, height: 1.4, power: 14, kelvin: 5200 }, lead),
      ],
    };

    const sitter = subject({ name: 'Sitter', x: 0, y: 3.4, primary: true, color: '#6b4d57', height: 1.7 });
    const portrait = {
      id: uid('scene'),
      name: 'Portrait — Rembrandt',
      notes: 'Key high and 45° to camera left for the triangle of light under the eye. No fill: aim for 8:1 or harder.',
      camera: { x: 0, y: 0, heading: 90, height: 1.55, sensor: 'ff', focal: 135, aperture: 1.8, focus: 3.4, guide: '4:5' },
      background: { distance: 5.5, color: '#2a2b33', pattern: 'plain' },
      ambient: { level: 0.02, kelvin: 5600 },
      exposure: 0,
      subjects: [sitter],
      lights: [
        light({ name: 'Key beauty dish', role: 'key', modifier: 'softbox', x: -1.25, y: 2.5, height: 2.4, power: 60, kelvin: 5400 }, sitter),
        light({ name: 'Hair light', role: 'hair', modifier: 'fresnel', x: 0.6, y: 4.6, height: 2.8, power: 20, kelvin: 5400 }, sitter),
      ],
    };

    const walker = subject({ name: 'Figure', x: 0.3, y: 4, primary: true, color: '#3c4658' });
    const night = {
      id: uid('scene'),
      name: 'Night exterior — practicals',
      notes: 'Wide and fast. Street practicals at 3200K against a cool 6500K ambient. Everything past 10 m should read as bokeh.',
      camera: { x: 0, y: 0, heading: 90, height: 1.1, sensor: 's35', focal: 24, aperture: 1.4, focus: 4, guide: '2.39:1' },
      background: { distance: 14, color: '#1d2433', pattern: 'lights' },
      ambient: { level: 0.06, kelvin: 9000 },
      exposure: 0.5,
      subjects: [walker, subject({ name: 'Bollard', kind: 'object', x: -1.6, y: 2.2, height: 0.9, color: '#6d6d6d' })],
      lights: [
        light({ name: 'Street lamp', role: 'practical', modifier: 'practical', x: 2.2, y: 7.5, height: 2.6, power: 70, kelvin: 3200 }),
        light({ name: 'Shop window', role: 'key', modifier: 'ledpanel', x: -3.2, y: 3.4, height: 1.6, power: 40, kelvin: 3000, gel: '#ffd9a8' }, walker),
      ],
    };

    return [interview, twoShot, portrait, night];
  }

  function load() {
    try {
      const raw = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.scenes) && data.scenes.length) return data;
      }
    } catch (e) {
      /* storage unavailable or corrupt: fall back to samples */
    }
    const scenes = sampleScenes();
    return { scenes, activeId: scenes[0].id, units: 'm' };
  }

  function save(state) {
    try {
      root.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ scenes: state.scenes, activeId: state.activeId, units: state.units })
      );
    } catch (e) {
      /* ignore quota / private-mode errors */
    }
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function duplicateScene(scene) {
    const copy = clone(scene);
    copy.id = uid('scene');
    copy.name = scene.name + ' (copy)';
    copy.subjects.forEach((s) => (s.id = uid('sub')));
    copy.lights.forEach((l) => (l.id = uid('lt')));
    return copy;
  }

  /** Validate and normalise imported JSON into a list of scenes. */
  function importScenes(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const list = Array.isArray(data) ? data : data && data.scenes;
    if (!Array.isArray(list) || !list.length) throw new Error('No scenes found in file');
    return list.map((raw) => {
      const base = blankScene(raw.name);
      const s = Object.assign(base, clone(raw));
      s.id = uid('scene');
      s.camera = Object.assign(blankScene().camera, raw.camera);
      s.background = Object.assign(blankScene().background, raw.background);
      s.ambient = Object.assign(blankScene().ambient, raw.ambient);
      s.subjects = (raw.subjects || []).map((x) => subject(Object.assign({}, x, { id: uid('sub') })));
      s.lights = (raw.lights || []).map((x) => light(Object.assign({}, x, { id: uid('lt') })));
      return s;
    });
  }

  function formatDistance(m, units, digits) {
    if (m === Infinity) return '∞';
    if (!isFinite(m)) return '—';
    if (units === 'ft') {
      const totalIn = Math.round(m / FT * 12);
      const ft = Math.floor(totalIn / 12);
      const inch = totalIn % 12;
      return ft ? `${ft}′ ${inch}″` : `${inch}″`;
    }
    const d = digits === undefined ? (m < 1 ? 2 : m < 10 ? 2 : 1) : digits;
    return `${m.toFixed(d)} m`;
  }

  function toUnit(m, units) {
    return units === 'ft' ? m / FT : m;
  }

  function fromUnit(v, units) {
    return units === 'ft' ? v * FT : v;
  }

  const api = {
    uid,
    aimAt,
    subject,
    light,
    blankScene,
    sampleScenes,
    load,
    save,
    clone,
    duplicateScene,
    importScenes,
    formatDistance,
    toUnit,
    fromUnit,
  };

  root.Store = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
