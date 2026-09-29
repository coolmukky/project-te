/*
 * Top-down floor plan: camera, field of view, depth-of-field zone,
 * subjects and lights, all draggable.
 */
(function (root) {
  'use strict';

  const O = root.Optics;
  const L = root.Lighting;
  const DEG = Math.PI / 180;

  /** Text with a dark halo so labels stay legible over beams and grid. */
  function haloText(ctx, text, x, y) {
    ctx.save();
    ctx.strokeStyle = 'rgba(12, 14, 18, 0.85)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.restore();
    ctx.fillText(text, x, y);
  }

  class PlanView {
    constructor(canvas, hooks) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.hooks = hooks; // { getScene, getSelection, select, changed, units }
      this.view = { x: 0, y: 3, scale: 50 };
      this.drag = null;
      this.hover = null;
      this.fitted = null;
      this._bind();
    }

    /* ---------- coordinate transforms ---------- */
    toScreen(x, y) {
      const { W, H } = this.size();
      return [W / 2 + (x - this.view.x) * this.view.scale, H / 2 - (y - this.view.y) * this.view.scale];
    }

    toWorld(px, py) {
      const { W, H } = this.size();
      return [this.view.x + (px - W / 2) / this.view.scale, this.view.y - (py - H / 2) / this.view.scale];
    }

    size() {
      const dpr = this.dpr || 1;
      return { W: this.canvas.width / dpr, H: this.canvas.height / dpr };
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
      this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    }

    fit() {
      const scene = this.hooks.getScene();
      const cam = scene.camera;
      const pts = [[cam.x, cam.y]];
      const h = cam.heading * DEG;
      const D = scene.background.distance;
      const sensor = O.sensorOf(cam.sensor);
      const half = O.angleOfView(cam.focal, sensor.w) / 2;
      const reach = Math.min(D, 25);
      const spread = Math.min(reach * Math.tan(half), 12);
      const fx = Math.cos(h), fy = Math.sin(h), rx = Math.sin(h), ry = -Math.cos(h);
      pts.push([cam.x + fx * reach + rx * spread, cam.y + fy * reach + ry * spread]);
      pts.push([cam.x + fx * reach - rx * spread, cam.y + fy * reach - ry * spread]);
      scene.subjects.forEach((s) => pts.push([s.x, s.y]));
      scene.lights.forEach((l) => pts.push([l.x, l.y]));
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const minX = Math.min(...xs) - 1.2, maxX = Math.max(...xs) + 1.2;
      const minY = Math.min(...ys) - 2, maxY = Math.max(...ys) + 1.2;
      const { W, H } = this.size();
      this.view.x = (minX + maxX) / 2;
      this.view.y = (minY + maxY) / 2;
      this.view.scale = Math.max(8, Math.min(W / (maxX - minX), H / (maxY - minY), 160));
      this.fitted = scene.id;
    }

    /* ---------- hit testing ---------- */
    handles(scene) {
      const cam = scene.camera;
      const h = cam.heading * DEG;
      const fx = Math.cos(h), fy = Math.sin(h);
      const list = [];
      const rotR = 1.1;
      list.push({ type: 'rotate', x: cam.x + fx * rotR, y: cam.y + fy * rotR });
      // The focus handle sits at the right-hand end of the focus line so it
      // never covers a subject standing on the lens axis.
      const half = O.angleOfView(cam.focal, O.sensorOf(cam.sensor).w) / 2;
      const off = cam.focus * Math.tan(half);
      const rx = Math.sin(h), ry = -Math.cos(h);
      list.push({ type: 'focus', x: cam.x + fx * cam.focus + rx * off, y: cam.y + fy * cam.focus + ry * off });
      const D = scene.background.distance;
      list.push({ type: 'background', x: cam.x + fx * D, y: cam.y + fy * D });
      const sel = this.hooks.getSelection();
      if (sel && sel.kind === 'light') {
        const l = scene.lights.find((x) => x.id === sel.id);
        if (l) {
          const a = l.aim * DEG;
          list.push({ type: 'aim', id: l.id, x: l.x + Math.cos(a) * 0.9, y: l.y + Math.sin(a) * 0.9 });
        }
      }
      return list;
    }

    hitTest(px, py) {
      const scene = this.hooks.getScene();
      const near = (x, y, r) => {
        const [sx, sy] = this.toScreen(x, y);
        return Math.hypot(sx - px, sy - py) <= r;
      };
      for (const h of this.handles(scene)) if (near(h.x, h.y, 9)) return { kind: 'handle', handle: h };
      for (let i = scene.lights.length - 1; i >= 0; i--) {
        const l = scene.lights[i];
        if (near(l.x, l.y, 13)) return { kind: 'light', id: l.id, obj: l };
      }
      for (let i = scene.subjects.length - 1; i >= 0; i--) {
        const s = scene.subjects[i];
        if (near(s.x, s.y, Math.max(12, 0.3 * this.view.scale))) return { kind: 'subject', id: s.id, obj: s };
      }
      if (near(scene.camera.x, scene.camera.y, 15)) return { kind: 'camera', obj: scene.camera };
      return null;
    }

    /* ---------- interaction ---------- */
    _bind() {
      const c = this.canvas;
      const pos = (e) => {
        const r = c.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
      };

      c.addEventListener('pointerdown', (e) => {
        const [px, py] = pos(e);
        const hit = this.hitTest(px, py);
        const [wx, wy] = this.toWorld(px, py);
        c.setPointerCapture(e.pointerId);
        if (!hit) {
          this.drag = { type: 'pan', sx: px, sy: py, vx: this.view.x, vy: this.view.y, moved: false };
          return;
        }
        if (hit.kind === 'handle') {
          this.drag = { type: hit.handle.type, id: hit.handle.id };
        } else {
          this.hooks.select(hit.kind, hit.id);
          this.drag = { type: 'move', obj: hit.obj, dx: hit.obj.x - wx, dy: hit.obj.y - wy };
        }
      });

      c.addEventListener('pointermove', (e) => {
        const [px, py] = pos(e);
        if (!this.drag) {
          const hit = this.hitTest(px, py);
          c.style.cursor = hit ? (hit.kind === 'handle' ? 'crosshair' : 'grab') : 'default';
          return;
        }
        const scene = this.hooks.getScene();
        const cam = scene.camera;
        const [wx, wy] = this.toWorld(px, py);
        const snap = (v, step) => (e.shiftKey ? Math.round(v / step) * step : v);
        const d = this.drag;
        if (d.type === 'pan') {
          this.view.x = d.vx - (px - d.sx) / this.view.scale;
          this.view.y = d.vy + (py - d.sy) / this.view.scale;
          d.moved = true;
          this.render();
          return;
        }
        c.style.cursor = 'grabbing';
        if (d.type === 'move') {
          const ox = d.obj.x, oy = d.obj.y;
          d.obj.x = +snap(wx + d.dx, 0.25).toFixed(2);
          d.obj.y = +snap(wy + d.dy, 0.25).toFixed(2);
          if (d.obj === cam) {
            // The backdrop is stored relative to the camera; keep it fixed in the room.
            const h = cam.heading * DEG;
            const along = (d.obj.x - ox) * Math.cos(h) + (d.obj.y - oy) * Math.sin(h);
            scene.background.distance = +Math.max(scene.background.distance - along, 0.5).toFixed(2);
          }
        } else if (d.type === 'rotate') {
          cam.heading = Math.round(snap((Math.atan2(wy - cam.y, wx - cam.x) * 180) / Math.PI, 15));
        } else if (d.type === 'aim') {
          const l = scene.lights.find((x) => x.id === d.id);
          if (l) l.aim = Math.round(snap((Math.atan2(wy - l.y, wx - l.x) * 180) / Math.PI, 15));
        } else if (d.type === 'focus' || d.type === 'background') {
          const h = cam.heading * DEG;
          const along = (wx - cam.x) * Math.cos(h) + (wy - cam.y) * Math.sin(h);
          if (d.type === 'focus') {
            cam.focus = +Math.min(Math.max(along, 0.15), 200).toFixed(2);
          } else {
            scene.background.distance = +Math.min(Math.max(along, 0.5), 200).toFixed(2);
          }
        }
        this.hooks.changed({ live: true });
      });

      const end = (e) => {
        if (!this.drag) return;
        const d = this.drag;
        this.drag = null;
        c.style.cursor = 'default';
        if (d.type === 'pan') {
          if (!d.moved) this.hooks.select(null);
          return;
        }
        this.hooks.changed({ live: false });
      };
      c.addEventListener('pointerup', end);
      c.addEventListener('pointercancel', end);

      c.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          const [px, py] = pos(e);
          const [wx, wy] = this.toWorld(px, py);
          const factor = Math.exp(-e.deltaY * 0.0015);
          this.view.scale = Math.min(Math.max(this.view.scale * factor, 4), 400);
          const [wx2, wy2] = this.toWorld(px, py);
          this.view.x += wx - wx2;
          this.view.y += wy - wy2;
          this.render();
        },
        { passive: false }
      );
    }

    /* ---------- drawing ---------- */
    render() {
      const scene = this.hooks.getScene();
      if (!scene) return;
      if (this.fitted !== scene.id) this.fit();
      const ctx = this.ctx;
      const dpr = this.dpr || 1;
      const { W, H } = this.size();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const style = getComputedStyle(this.canvas);
      const colors = {
        bg: style.getPropertyValue('--plan-bg').trim() || '#14171d',
        grid: style.getPropertyValue('--plan-grid').trim() || 'rgba(255,255,255,0.05)',
        gridMajor: style.getPropertyValue('--plan-grid-major').trim() || 'rgba(255,255,255,0.1)',
        text: style.getPropertyValue('--text-dim').trim() || '#9aa3b2',
        fg: style.getPropertyValue('--text').trim() || '#e8ecf2',
      };
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, W, H);
      this.drawGrid(ctx, W, H, colors);
      this.drawLights(ctx, scene, 'beams');
      this.drawCamera(ctx, scene, colors);
      this.drawSubjects(ctx, scene, colors);
      this.drawLights(ctx, scene, 'icons', colors);
      this.drawHandles(ctx, scene);
      this.drawScale(ctx, W, H, colors);
    }

    drawGrid(ctx, W, H, colors) {
      const [x0, y1] = this.toWorld(0, 0);
      const [x1, y0] = this.toWorld(W, H);
      const step = this.view.scale > 30 ? 1 : this.view.scale > 10 ? 5 : 10;
      ctx.lineWidth = 1;
      for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
        const [sx] = this.toScreen(x, 0);
        ctx.strokeStyle = x % (step * 5) === 0 ? colors.gridMajor : colors.grid;
        ctx.beginPath();
        ctx.moveTo(Math.round(sx) + 0.5, 0);
        ctx.lineTo(Math.round(sx) + 0.5, H);
        ctx.stroke();
      }
      for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
        const [, sy] = this.toScreen(0, y);
        ctx.strokeStyle = y % (step * 5) === 0 ? colors.gridMajor : colors.grid;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(sy) + 0.5);
        ctx.lineTo(W, Math.round(sy) + 0.5);
        ctx.stroke();
      }
    }

    drawScale(ctx, W, H, colors) {
      const units = this.hooks.units();
      const unitM = units === 'ft' ? 0.3048 : 1;
      const candidates = [1, 2, 5, 10, 20, 50];
      let n = candidates.find((c) => c * unitM * this.view.scale > 60) || 50;
      const len = n * unitM * this.view.scale;
      const x = 14, y = H - 16;
      ctx.strokeStyle = colors.text;
      ctx.fillStyle = colors.text;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x, y);
      ctx.lineTo(x + len, y);
      ctx.lineTo(x + len, y - 4);
      ctx.stroke();
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(`${n} ${units === 'ft' ? 'ft' : 'm'}`, x + len + 6, y + 3);
    }

    drawCamera(ctx, scene, colors) {
      const cam = scene.camera;
      const sensor = O.sensorOf(cam.sensor);
      const h = cam.heading * DEG;
      const half = O.angleOfView(cam.focal, sensor.w) / 2;
      const fx = Math.cos(h), fy = Math.sin(h), rx = Math.sin(h), ry = -Math.cos(h);
      const D = scene.background.distance;
      const t = Math.tan(half);
      const at = (z, side) => this.toScreen(cam.x + fx * z + rx * z * t * side, cam.y + fy * z + ry * z * t * side);
      const [cx, cy] = this.toScreen(cam.x, cam.y);

      // Field of view cone to the backdrop.
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(...at(D, -1));
      ctx.lineTo(...at(D, 1));
      ctx.closePath();
      ctx.fillStyle = 'rgba(120, 160, 255, 0.07)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(140, 175, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Depth-of-field zone between the near and far limits.
      const dof = O.depthOfField(cam.focal, cam.aperture, cam.focus, sensor);
      const nz = Math.min(dof.near, D);
      const fz = Math.min(dof.far, D);
      if (fz > nz) {
        ctx.beginPath();
        ctx.moveTo(...at(nz, -1));
        ctx.lineTo(...at(fz, -1));
        ctx.lineTo(...at(fz, 1));
        ctx.lineTo(...at(nz, 1));
        ctx.closePath();
        ctx.fillStyle = 'rgba(70, 220, 140, 0.2)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(70, 220, 140, 0.5)';
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (cam.focus < D) {
        ctx.strokeStyle = 'rgba(110, 255, 170, 0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(...at(cam.focus, -1));
        ctx.lineTo(...at(cam.focus, 1));
        ctx.stroke();
      }

      // Backdrop.
      const spread = Math.max(D * t * 1.25, 1);
      const [b1x, b1y] = this.toScreen(cam.x + fx * D + rx * spread, cam.y + fy * D + ry * spread);
      const [b2x, b2y] = this.toScreen(cam.x + fx * D - rx * spread, cam.y + fy * D - ry * spread);
      ctx.strokeStyle = scene.background.color;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b1x, b1y);
      ctx.lineTo(b2x, b2y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = colors.text;
      ctx.font = '11px system-ui, sans-serif';
      haloText(ctx, 'backdrop', b1x + 6, b1y - 4);

      // Camera body.
      const sel = this.hooks.getSelection();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-h);
      ctx.fillStyle = sel && sel.kind === 'camera' ? '#8fb4ff' : '#c9d3e6';
      ctx.strokeStyle = '#0c0e12';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(-14, -10, 16, 20);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(2, -6);
      ctx.lineTo(12, -9);
      ctx.lineTo(12, 9);
      ctx.lineTo(2, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = colors.fg;
      ctx.font = '600 11px system-ui, sans-serif';
      haloText(ctx, `${cam.focal}mm f/${cam.aperture}`, cx + 16, cy + 22);
    }

    drawSubjects(ctx, scene, colors) {
      const cam = scene.camera;
      const sensor = O.sensorOf(cam.sensor);
      const dof = O.depthOfField(cam.focal, cam.aperture, cam.focus, sensor);
      const h = cam.heading * DEG;
      const sel = this.hooks.getSelection();
      for (const s of scene.subjects) {
        const [sx, sy] = this.toScreen(s.x, s.y);
        const z = (s.x - cam.x) * Math.cos(h) + (s.y - cam.y) * Math.sin(h);
        const sharp = z >= dof.near && z <= dof.far;
        const r = Math.max(8, (s.kind === 'object' ? 0.2 : 0.25) * this.view.scale);
        // Face the camera.
        const face = Math.atan2(cam.y - s.y, cam.x - s.x);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(-face);
        ctx.fillStyle = s.color;
        ctx.beginPath();
        if (s.kind === 'object') ctx.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6);
        else ctx.ellipse(0, 0, r * 0.55, r, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = sharp ? '#46dc8c' : '#f0a24a';
        ctx.stroke();
        if (s.kind !== 'object') {
          ctx.fillStyle = '#d7b39c';
          ctx.beginPath();
          ctx.arc(r * 0.05, 0, r * 0.38, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.beginPath();
          ctx.arc(r * 0.38, 0, r * 0.1, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        if (sel && sel.kind === 'subject' && sel.id === s.id) {
          ctx.strokeStyle = '#8fb4ff';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(sx, sy, r + 6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = colors.fg;
        ctx.font = '600 11px system-ui, sans-serif';
        const label = (s.primary ? '★ ' : '') + s.name;
        haloText(ctx, label, sx - ctx.measureText(label).width / 2, sy + r + 15);
        ctx.fillStyle = sharp ? '#46dc8c' : '#f0a24a';
        ctx.font = '10px system-ui, sans-serif';
        const tag = sharp ? 'in focus' : 'soft';
        haloText(ctx, tag, sx - ctx.measureText(tag).width / 2, sy + r + 27);
      }
    }

    drawLights(ctx, scene, pass, colors) {
      const sel = this.hooks.getSelection();
      for (const l of scene.lights) {
        const [lx, ly] = this.toScreen(l.x, l.y);
        const mod = L.modifierOf(l);
        const col = L.lightColor(l);
        const on = l.on !== false;
        const a = l.aim * DEG;
        if (pass === 'beams') {
          if (!on) continue;
          const reach = (1.5 + Math.sqrt((l.power || 50) / 100) * 3) * this.view.scale;
          if (mod.directional) {
            // Parallel rays across the view.
            const { W, H } = this.size();
            ctx.strokeStyle = L.rgbToCss(col, 0.22);
            ctx.lineWidth = 1;
            const dx = Math.cos(a), dy = -Math.sin(a);
            for (let i = -12; i <= 12; i++) {
              const ox = W / 2 + -dy * i * 40, oy = H / 2 + dx * i * 40;
              ctx.beginPath();
              ctx.moveTo(ox - dx * 2000, oy - dy * 2000);
              ctx.lineTo(ox + dx * 2000, oy + dy * 2000);
              ctx.stroke();
            }
            continue;
          }
          const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, reach);
          g.addColorStop(0, L.rgbToCss(col, 0.38));
          g.addColorStop(1, L.rgbToCss(col, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          const beam = L.beamOf(l);
          if (beam >= 360) {
            ctx.arc(lx, ly, reach, 0, Math.PI * 2);
          } else {
            const half = (beam / 2) * DEG;
            ctx.moveTo(lx, ly);
            ctx.arc(lx, ly, reach, -a - half, -a + half);
            ctx.closePath();
          }
          ctx.fill();
          continue;
        }

        // Fixture icon.
        const role = L.ROLES[l.role] || L.ROLES.key;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(-a);
        ctx.globalAlpha = on ? 1 : 0.45;
        ctx.fillStyle = L.rgbToCss(col);
        ctx.strokeStyle = role.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        if (mod.directional) {
          ctx.arc(0, 0, 10, 0, Math.PI * 2);
        } else if (l.modifier === 'practical') {
          ctx.arc(0, 0, 7, 0, Math.PI * 2);
        } else if (l.modifier === 'reflector') {
          ctx.rect(-2, -11, 5, 22);
        } else {
          ctx.moveTo(-9, -6);
          ctx.lineTo(4, -11);
          ctx.lineTo(4, 11);
          ctx.lineTo(-9, 6);
          ctx.closePath();
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        if (sel && sel.kind === 'light' && sel.id === l.id) {
          ctx.strokeStyle = '#8fb4ff';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(lx, ly, 17, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = colors.fg;
        ctx.font = '600 11px system-ui, sans-serif';
        haloText(ctx, l.name, lx + 15, ly - 8);
        ctx.fillStyle = role.color;
        ctx.font = '10px system-ui, sans-serif';
        haloText(ctx, `${role.label} · ${l.power}% · ${l.kelvin}K${on ? '' : ' · off'}`, lx + 15, ly + 5);
      }
    }

    drawHandles(ctx, scene) {
      for (const h of this.handles(scene)) {
        const [sx, sy] = this.toScreen(h.x, h.y);
        ctx.beginPath();
        ctx.arc(sx, sy, h.type === 'rotate' || h.type === 'aim' ? 5 : 6, 0, Math.PI * 2);
        if (h.type === 'focus') {
          ctx.fillStyle = '#6effaa';
        } else if (h.type === 'background') {
          ctx.fillStyle = '#c0c8d8';
        } else {
          ctx.fillStyle = '#8fb4ff';
        }
        ctx.fill();
        ctx.strokeStyle = '#0c0e12';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (h.type === 'focus') {
          ctx.fillStyle = '#6effaa';
          ctx.font = '600 10px system-ui, sans-serif';
          haloText(ctx, 'focus', sx + 9, sy - 7);
        }
      }
    }
  }

  root.PlanView = PlanView;
})(window);
