/*
 * Side-on chart: blur circle size versus distance from the camera, with the
 * acceptable-sharpness band, focus plane, subjects and backdrop marked.
 */
(function (root) {
  'use strict';

  const O = root.Optics;

  function render(canvas, scene, units) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width;
    const H = rect.height;
    const style = getComputedStyle(canvas);
    const text = style.getPropertyValue('--text-dim').trim() || '#9aa3b2';
    const fg = style.getPropertyValue('--text').trim() || '#e8ecf2';
    const gridCol = style.getPropertyValue('--plan-grid-major').trim() || 'rgba(255,255,255,0.1)';
    ctx.clearRect(0, 0, W, H);

    const cam = scene.camera;
    const sensor = O.sensorOf(cam.sensor);
    const dof = O.depthOfField(cam.focal, cam.aperture, cam.focus, sensor);
    const D = scene.background.distance;
    const hd = Math.PI / 180 * cam.heading;
    const subjects = scene.subjects
      .map((s) => ({ s, z: (s.x - cam.x) * Math.cos(hd) + (s.y - cam.y) * Math.sin(hd) }))
      .filter((o) => o.z > 0);
    const maxZ = Math.max(D * 1.08, cam.focus * 1.6, ...subjects.map((o) => o.z * 1.1), 1);

    const padL = 44, padR = 14, padT = 14, padB = 26;
    const pw = W - padL - padR;
    const ph = H - padT - padB;
    const xOf = (z) => padL + (z / maxZ) * pw;

    // Blur as % of frame width; y range capped so the in-focus dip stays readable.
    const blurAt = (z) => O.blurFraction(cam.focal, cam.aperture, cam.focus, z, sensor) * 100;
    const cocPct = (dof.coc / sensor.w) * 100;
    const yMax = Math.max(Math.min(Math.max(blurAt(D), blurAt(maxZ)) * 1.15, 12), cocPct * 4);
    const yOf = (v) => padT + ph - (Math.min(v, yMax) / yMax) * ph;

    // Axes & grid.
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = text;
    ctx.strokeStyle = gridCol;
    ctx.lineWidth = 1;
    const unitM = units === 'ft' ? 0.3048 : 1;
    const spanU = maxZ / unitM;
    const step = [0.5, 1, 2, 5, 10, 20, 50, 100].find((s) => spanU / s <= 10) || 100;
    for (let u = 0; u <= spanU; u += step) {
      const x = xOf(u * unitM);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, padT);
      ctx.lineTo(x + 0.5, padT + ph);
      ctx.stroke();
      ctx.fillText(`${+u.toFixed(1)}${units === 'ft' ? '′' : 'm'}`, x - 6, H - 8);
    }
    for (let i = 0; i <= 4; i++) {
      const v = (yMax * i) / 4;
      const y = yOf(v);
      ctx.beginPath();
      ctx.moveTo(padL, y + 0.5);
      ctx.lineTo(padL + pw, y + 0.5);
      ctx.stroke();
      ctx.fillText(`${v.toFixed(v < 1 ? 2 : 1)}%`, 4, y + 3);
    }

    // Acceptable sharpness band (x between near and far).
    const nx = xOf(Math.min(dof.near, maxZ));
    const fx = xOf(Math.min(dof.far, maxZ));
    ctx.fillStyle = 'rgba(70, 220, 140, 0.14)';
    ctx.fillRect(nx, padT, fx - nx, ph);

    // Blur curve.
    ctx.beginPath();
    const N = 240;
    for (let i = 0; i <= N; i++) {
      const z = Math.max((maxZ * i) / N, cam.focal / 1000 * 1.2);
      const x = xOf(z);
      const y = yOf(blurAt(z));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#8fb4ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineTo(xOf(maxZ), padT + ph);
    ctx.lineTo(padL, padT + ph);
    ctx.closePath();
    ctx.fillStyle = 'rgba(143, 180, 255, 0.1)';
    ctx.fill();

    // Circle of confusion threshold.
    const cy = yOf(cocPct);
    ctx.strokeStyle = 'rgba(70, 220, 140, 0.8)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, cy);
    ctx.lineTo(padL + pw, cy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(70, 220, 140, 0.95)';
    ctx.fillText('CoC limit', padL + pw - 50, cy - 4);

    // Focus plane.
    const fxp = xOf(cam.focus);
    ctx.strokeStyle = '#6effaa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fxp, padT);
    ctx.lineTo(fxp, padT + ph);
    ctx.stroke();

    // Backdrop.
    const bx = xOf(D);
    ctx.fillStyle = scene.background.color;
    ctx.fillRect(bx - 3, padT, 6, ph);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.strokeRect(bx - 3 + 0.5, padT + 0.5, 5, ph - 1);

    // Subjects.
    ctx.font = '600 10px system-ui, sans-serif';
    subjects.forEach((o, i) => {
      const x = xOf(o.z);
      const sharp = o.z >= dof.near && o.z <= dof.far;
      const y = yOf(blurAt(o.z));
      ctx.fillStyle = sharp ? '#46dc8c' : '#f0a24a';
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = fg;
      const label = o.s.name;
      const ly = padT + 12 + (i % 3) * 12;
      ctx.fillText(label, Math.min(x + 6, padL + pw - ctx.measureText(label).width), ly);
    });

    // Camera marker.
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(padL, padT + ph);
    ctx.lineTo(padL + 8, padT + ph - 5);
    ctx.lineTo(padL + 8, padT + ph + 5);
    ctx.closePath();
    ctx.fill();
  }

  root.DofChart = { render };
})(window);
