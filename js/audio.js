// ─────────────────────────────────────────────────────────────
//  Diseño sonoro sintetizado (Web Audio) — sobrio y corporativo.
//  Sin archivos de audio: no hay música con derechos de autor.
// ─────────────────────────────────────────────────────────────
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.pulseTimer = null;
    this.pad = null;
  }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        const comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp);
        comp.connect(this.ctx.destination);
        this.noiseBuf = this._makeNoise();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {}
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  get ok() {
    return !!this.ctx;
  }

  _makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  tone({ freq = 440, to, type = 'sine', dur = 0.4, gain = 0.15, attack = 0.01, when = 0, dest } = {}) {
    if (!this.ok) return;
    const c = this.ctx;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest || this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.6, gain = 0.1, type = 'bandpass', from = 400, to = 3000, q = 0.8, when = 0, attack = 0.05 } = {}) {
    if (!this.ok) return;
    const c = this.ctx;
    const t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // Apertura: drone grave que crece
  swell() {
    this.tone({ freq: 55, type: 'sine', dur: 6, gain: 0.22, attack: 2.6 });
    this.tone({ freq: 82.4, type: 'triangle', dur: 6, gain: 0.06, attack: 3 });
    this.tone({ freq: 110, type: 'sine', dur: 5, gain: 0.05, attack: 3.2, when: 0.6 });
    this.noise({ dur: 5, gain: 0.04, type: 'lowpass', from: 200, to: 1800, attack: 3 });
  }

  // Impacto de título
  impact() {
    this.tone({ freq: 70, to: 38, type: 'sine', dur: 1.8, gain: 0.45, attack: 0.005 });
    this.noise({ dur: 1.2, gain: 0.14, type: 'lowpass', from: 2400, to: 120, attack: 0.005 });
    [523.25, 783.99, 1046.5].forEach((f, i) => this.tone({ freq: f, type: 'sine', dur: 2.6, gain: 0.035, attack: 0.02, when: 0.05 + i * 0.04 }));
  }

  whoosh() {
    this.noise({ dur: 0.7, gain: 0.12, from: 300, to: 4200, q: 1.2, attack: 0.25 });
  }

  pop() {
    this.tone({ freq: 880, to: 1320, type: 'sine', dur: 0.18, gain: 0.07 });
  }

  tick(urgent = false) {
    this.tone({ freq: urgent ? 1400 : 1000, type: 'square', dur: 0.05, gain: urgent ? 0.035 : 0.02, attack: 0.002 });
  }

  // Cierre de respuestas
  close() {
    this.tone({ freq: 196, type: 'triangle', dur: 0.5, gain: 0.12 });
    this.tone({ freq: 147, type: 'triangle', dur: 0.7, gain: 0.1, when: 0.12 });
  }

  // Revelación: acorde ascendente
  reveal() {
    [392, 523.25, 659.25, 783.99].forEach((f, i) => this.tone({ freq: f, type: 'sine', dur: 1.4, gain: 0.07, when: i * 0.09 }));
    this.tone({ freq: 65.4, type: 'sine', dur: 1.2, gain: 0.18, attack: 0.01 });
  }

  // Final: acorde amplio
  finale() {
    [130.81, 196, 261.63, 329.63, 392, 523.25].forEach((f, i) => this.tone({ freq: f, type: i < 2 ? 'triangle' : 'sine', dur: 4.5, gain: 0.06, attack: 0.4, when: i * 0.12 }));
  }

  // Pulso de tensión durante la pregunta (se acelera al final)
  startPulse(durationMs) {
    this.stopPulse();
    if (!this.ok) return;
    const start = performance.now();
    const beat = () => {
      const elapsed = performance.now() - start;
      const left = Math.max(0, durationMs - elapsed);
      if (left <= 0) return;
      const urgency = 1 - left / durationMs;
      this.tone({ freq: 58, to: 44, type: 'sine', dur: 0.32, gain: 0.12 + urgency * 0.12, attack: 0.005 });
      const interval = left < 10000 ? 520 : 1000 - urgency * 300;
      this.pulseTimer = setTimeout(beat, interval);
    };
    beat();
  }

  stopPulse() {
    clearTimeout(this.pulseTimer);
    this.pulseTimer = null;
  }

  // Ambiente suave para lobby e informe
  startPad() {
    if (!this.ok || this.pad) return;
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 3);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 350;
    lfo.connect(lfoGain);
    lfoGain.connect(f.frequency);
    const oscs = [130.81, 196, 246.94, 329.63].map((fr, i) => {
      const o = c.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = fr;
      o.detune.value = (i - 1.5) * 6;
      o.connect(f);
      o.start();
      return o;
    });
    f.connect(g);
    g.connect(this.master);
    lfo.start();
    this.pad = { g, oscs, lfo };
  }

  stopPad() {
    if (!this.pad) return;
    const { g, oscs, lfo } = this.pad;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    oscs.forEach((o) => o.stop(t + 1.6));
    lfo.stop(t + 1.6);
    this.pad = null;
  }
}
