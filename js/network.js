// ─────────────────────────────────────────────────────────────
//  Red neuronal animada (Canvas 2D) — tema claro corporativo
//  · Nodos ambientales con profundidad (cerca/lejos)
//  · Núcleo rojo y constelación de participantes en órbitas elípticas
//  · Pulsos rojos viajando por las conexiones
// ─────────────────────────────────────────────────────────────
const RED = [219, 0, 17];
const INK = [26, 26, 26];
const GRAY = [140, 140, 140];
const TAU = Math.PI * 2;

export class Network {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nodes = [];
    this.players = [];
    this.pulses = [];
    this.opacity = 1;
    this.targetOpacity = 1;
    this.zoom = 1;
    this.targetZoom = 1;
    this.focus = { x: 0.5, y: 0.5 };
    this.target = { x: 0.5, y: 0.5 };
    this.labels = false; // nombres junto a los nodos de participantes
    this.rays = false; // líneas del núcleo a cada participante
    this.spin = 0;
    this.slot = 0;
    this.core = null;
    this.running = false;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { innerWidth: w, innerHeight: h } = window;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.linkDist = Math.max(120, Math.min(210, Math.hypot(w, h) / 9.5));
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(dt, now);
      this.draw(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }
  setOpacity(v) { this.targetOpacity = v; }
  setZoom(v) { this.targetZoom = v; }
  // Centro de la escena en fracciones de la pantalla (0–1) y ancho del escenario (px)
  setFocus(x, y, stageW = null) {
    this.target = { x, y };
    this.stageW = stageW;
  }
  setLabels(on) { this.labels = on; }
  setRays(on) { this.rays = on; }

  clear() {
    this.nodes = [];
    this.players = [];
    this.pulses = [];
    this.core = null;
    this.slot = 0;
  }

  addCore() {
    if (this.core) return this.core;
    this.core = { x: this.w * this.focus.x, y: this.h * this.focus.y, vx: 0, vy: 0, r: 7, z: 1, color: RED, born: performance.now(), core: true, alpha: 0, seed: 0 };
    this.nodes.push(this.core);
    return this.core;
  }

  // Nodo ambiental con profundidad
  addNode({ from = 'center', delay = 0 } = {}) {
    const z = 0.3 + Math.random() * 0.7;
    const fx = 0.03 + Math.random() * 0.94;
    const fy = 0.05 + Math.random() * 0.9;
    let x = this.w * fx;
    let y = this.h * fy;
    if (from === 'center') {
      x = this.w * this.focus.x;
      y = this.h * this.focus.y;
    }
    const node = { x, y, fx, fy, vx: 0, vy: 0, z, r: 1.3 + z * 1.8, color: GRAY, born: performance.now() + delay, alpha: 0, seed: Math.random() * 1000 };
    this.nodes.push(node);
    return node;
  }

  bloom(count = 70, spread = 2600) {
    for (let i = 0; i < count; i++) this.addNode({ from: 'center', delay: (i / count) * spread + Math.random() * 300 });
  }

  // Radio de cada órbita (elipse adaptada a 16:9)
  ringRadius(i) {
    const m = this.stageW ? Math.min(this.stageW * 0.86, this.h) : Math.min(this.w * 0.55, this.h);
    return m * 0.14 + i * m * 0.075;
  }

  // Un participante entra desde el borde y ocupa su lugar en la constelación
  addPlayer(label = '') {
    const k = this.slot++;
    let ring = 0;
    let start = 0;
    let cap = 6;
    for (;;) {
      const r = this.ringRadius(ring);
      cap = Math.max(6, Math.floor((TAU * r * 1.05) / 104));
      if (k < start + cap) break;
      start += cap;
      ring++;
    }
    const idx = k - start;
    const a0 = Math.random() * TAU;
    const edge = Math.max(this.w, this.h);
    const node = {
      x: this.w / 2 + Math.cos(a0) * edge,
      y: this.h / 2 + Math.sin(a0) * edge,
      vx: 0, vy: 0, z: 1, r: 3.6, color: INK, born: performance.now(), alpha: 0, seed: Math.random() * 1000,
      player: true, label: String(label || '').slice(0, 24),
      orbit: { ring, a: (idx / cap) * TAU + ring * 0.55 + (Math.random() - 0.5) * 0.12, jr: (Math.random() - 0.5) * 14 },
    };
    this.nodes.push(node);
    this.players.push(node);
    setTimeout(() => this.spark(node), 900);
    return node;
  }

  spark(fromNode) {
    const candidates = this.nodes.filter((n) => !n.core && performance.now() > n.born);
    const a = fromNode || candidates[Math.floor(Math.random() * candidates.length)];
    const b = this.core || candidates[Math.floor(Math.random() * candidates.length)];
    if (!a || !b || a === b) return;
    this.pulses.push({ a, b, t: 0, speed: 0.8 + Math.random() * 0.6 });
    if (this.core) this.core.flash = 1;
  }

  burst(n = 12) {
    for (let i = 0; i < n; i++) setTimeout(() => this.spark(), i * 70);
  }

  home(n, t) {
    const cx = this.w * this.focus.x;
    const cy = this.h * this.focus.y;
    if (n.core) return [cx, cy];
    if (n.orbit) {
      const r = this.ringRadius(n.orbit.ring) + n.orbit.jr;
      const a = n.orbit.a + this.spin * (n.orbit.ring % 2 ? -0.7 : 1);
      return [cx + Math.cos(a) * r * 1.25, cy + Math.sin(a) * r * 0.8];
    }
    const amp = 6 + n.z * 12;
    return [this.w * n.fx + Math.sin(t * 0.35 + n.seed) * amp, this.h * n.fy + Math.cos(t * 0.3 + n.seed * 1.3) * amp * 0.8];
  }

  step(dt, now) {
    const t = now / 1000;
    const k = Math.min(1, dt * 1.6);
    this.focus.x += (this.target.x - this.focus.x) * k;
    this.focus.y += (this.target.y - this.focus.y) * k;
    this.opacity += (this.targetOpacity - this.opacity) * Math.min(1, dt * 2.2);
    this.zoom += (this.targetZoom - this.zoom) * Math.min(1, dt * 0.6);
    this.spin += dt * 0.025;
    for (const n of this.nodes) {
      if (now < n.born) continue;
      n.alpha = Math.min(1, n.alpha + dt * 1.2);
      const [hx, hy] = this.home(n, t);
      const kk = n.core ? 2.5 : n.player ? 1.2 : 1.6;
      n.vx += (hx - n.x) * kk * dt;
      n.vy += (hy - n.y) * kk * dt;
      n.vx *= 0.9;
      n.vy *= 0.9;
      n.x += n.vx * dt * 60;
      n.y += n.vy * dt * 60;
      if (n.flash) n.flash = Math.max(0, n.flash - dt * 2);
    }
    for (const p of this.pulses) p.t += dt * p.speed;
    this.pulses = this.pulses.filter((p) => p.t < 1);
    if (this.nodes.length > 8 && Math.random() < dt * 0.9) this.spark();
  }

  draw(now) {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    if (this.opacity < 0.01) return;
    ctx.save();
    ctx.globalAlpha = this.opacity;
    const cx = w * this.focus.x;
    const cy = h * this.focus.y;
    ctx.translate(cx, cy);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-cx, -cy);

    const live = this.nodes.filter((n) => now >= n.born && n.alpha > 0);
    const D = this.linkDist;
    const D2 = D * D;

    // Halo suave del núcleo
    if (this.core && this.core.alpha > 0) {
      const g = ctx.createRadialGradient(this.core.x, this.core.y, 0, this.core.x, this.core.y, Math.min(w, h) * 0.32);
      g.addColorStop(0, `rgba(219,0,17,${0.07 * this.core.alpha})`);
      g.addColorStop(1, 'rgba(219,0,17,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // Rayos núcleo → participantes
    if (this.rays && this.core) {
      ctx.lineWidth = 0.8;
      for (const p of this.players) {
        if (p.alpha <= 0) continue;
        const grad = ctx.createLinearGradient(this.core.x, this.core.y, p.x, p.y);
        grad.addColorStop(0, `rgba(219,0,17,${0.28 * p.alpha})`);
        grad.addColorStop(1, `rgba(219,0,17,${0.04 * p.alpha})`);
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(this.core.x, this.core.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }

    // Conexiones por cercanía
    ctx.lineWidth = 0.8;
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > D2) continue;
        const f = 1 - Math.sqrt(d2) / D;
        const depth = Math.min(a.z, b.z);
        const al = f * 0.5 * depth * Math.min(a.alpha, b.alpha);
        const toCore = a.core || b.core;
        ctx.strokeStyle = toCore ? `rgba(219,0,17,${al * 0.8})` : `rgba(110,110,110,${al})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // Pulsos
    for (const p of this.pulses) {
      const e = p.t < 0.5 ? 2 * p.t * p.t : 1 - Math.pow(-2 * p.t + 2, 2) / 2;
      const x = p.a.x + (p.b.x - p.a.x) * e;
      const y = p.a.y + (p.b.y - p.a.y) * e;
      const e0 = Math.max(0, e - 0.14);
      ctx.strokeStyle = 'rgba(219,0,17,0.4)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p.a.x + (p.b.x - p.a.x) * e0, p.a.y + (p.b.y - p.a.y) * e0);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(219,0,17,0.95)';
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, TAU);
      ctx.fill();
    }

    // Nodos
    for (const n of live) {
      const [r, g, b] = n.color;
      if (n.core) {
        const pulse = 1 + Math.sin(now / 520) * 0.12 + (n.flash || 0) * 0.6;
        for (const [m, a] of [[4.2, 0.07], [2.6, 0.14], [1.7, 0.22]]) {
          ctx.fillStyle = `rgba(219,0,17,${a * n.alpha})`;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * m * pulse, 0, TAU);
          ctx.fill();
        }
      }
      const al = n.core || n.player ? n.alpha : n.alpha * (0.3 + 0.6 * n.z);
      ctx.fillStyle = `rgba(${r},${g},${b},${al})`;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, TAU);
      ctx.fill();
      if (n.player) {
        ctx.strokeStyle = `rgba(219,0,17,${0.55 * n.alpha})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 4, 0, TAU);
        ctx.stroke();
      }
    }

    // Nombres de la constelación
    if (this.labels) {
      ctx.font = '500 12.5px Inter, "Segoe UI", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const p of this.players) {
        if (!p.label || p.alpha <= 0) continue;
        const right = p.x >= (this.core ? this.core.x : cx);
        ctx.textAlign = right ? 'left' : 'right';
        const tx = p.x + (right ? 12 : -12);
        ctx.lineWidth = 4;
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * p.alpha})`;
        ctx.strokeText(p.label, tx, p.y);
        ctx.fillStyle = `rgba(26,26,26,${0.85 * p.alpha})`;
        ctx.fillText(p.label, tx, p.y);
      }
    }
    ctx.restore();
  }
}
