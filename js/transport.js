// ─────────────────────────────────────────────────────────────
//  Conexión en tiempo real SIN plataformas externas
//
//  · 'red'     → la laptop del anfitrión ejecuta tools/servidor.mjs y los
//                dispositivos de la misma red se conectan a ella (SSE + POST).
//  · 'codigos' → sin conexión entre dispositivos: cada participante responde
//                en su dispositivo y al final envía un código por el chat.
// ─────────────────────────────────────────────────────────────
import { CONFIG } from './config.js';
import { genPin, uid as newUid, lstore } from './util.js';

const clean = (o) => JSON.parse(JSON.stringify(o ?? null));

// Detecta si la página la sirve el servidor local de SINAPSIS
export async function detectMode() {
  if (CONFIG.mode === 'red' || CONFIG.mode === 'codigos') return { mode: CONFIG.mode, info: null };
  if (location.protocol === 'file:') return { mode: 'codigos', info: null };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch('api/ping', { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const info = await r.json();
      if (info.app === 'sinapsis') return { mode: 'red', info };
    }
  } catch {}
  return { mode: 'codigos', info: null };
}

// Canal de mensajes a través del servidor local (Server-Sent Events + POST)
class RelayChannel {
  constructor(role) {
    this.role = role;
    this.onmessage = null;
    this.onreconnect = null;
    this.opened = false;
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('sin-servidor')), 5000);
      this.es = new EventSource(`api/stream?role=${role}`);
      this.es.onopen = () => {
        clearTimeout(timer);
        if (this.opened) this.onreconnect?.();
        this.opened = true;
        resolve();
      };
      this.es.onmessage = (e) => {
        try {
          this.onmessage?.({ data: JSON.parse(e.data) });
        } catch {}
      };
    });
  }
  async postMessage(m) {
    await this.ready;
    try {
      await fetch(`api/send?role=${this.role}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(m),
      });
    } catch {}
  }
}

// ── Anfitrión (modo red) ─────────────────────────────────────
class RelayHost {
  mode = 'red';
  constructor() {
    this.ch = new RelayChannel('host');
    this.data = { players: {}, answers: {}, conf: {} };
    this.state = null;
    this.cbs = { players: [], answers: [], conf: [] };
  }
  // pin: para reanudar una sesión guardada con el mismo código de sala
  async open(pin) {
    await this.ch.ready;
    this.pin = pin || genPin();
    this.ch.onmessage = (e) => this._on(e.data);
    return this.pin;
  }
  // Recupera participantes y respuestas de una sesión guardada
  restore(saved) {
    this.data = {
      players: clean(saved.players || {}),
      answers: clean(saved.answers || {}),
      conf: clean(saved.conf || {}),
    };
  }
  _emit(k) {
    const v = clean(this.data[k]);
    this.cbs[k].forEach((cb) => cb(v));
  }
  _post(m) {
    return this.ch.postMessage({ ...m, pin: this.pin });
  }
  _on(m) {
    // Un participante sin PIN pregunta qué sala está abierta
    if (m?.kind === 'discover' && m.nonce) {
      this._post({ kind: 'room', nonce: m.nonce, phase: this.state?.phase || 'lobby' });
      return;
    }
    if (!m || m.pin !== this.pin || !m.uid) return;
    const d = this.data;
    if (m.kind === 'join') {
      d.players[m.uid] = { alias: String(m.alias || '').slice(0, 32), joinedAt: d.players[m.uid]?.joinedAt || Date.now() };
      this._emit('players');
      this._post({ kind: 'joined', uid: m.uid, state: this.state });
    } else if (m.kind === 'hello') {
      if (d.players[m.uid]) this._post({ kind: 'state', to: m.uid, state: this.state });
    } else if (m.kind === 'answer') {
      const s = this.state;
      if (!s || s.phase !== 'question' || s.qKey !== m.qKey || !d.players[m.uid]) return;
      if (!(m.c >= 0 && m.c <= 3)) return;
      d.answers[m.qKey] ??= {};
      if (d.answers[m.qKey][m.uid]) return;
      d.answers[m.qKey][m.uid] = { c: m.c, t: m.t };
      this._emit('answers');
    } else if (m.kind === 'conf') {
      if (!d.answers[m.qKey]?.[m.uid] || !(m.level >= 0 && m.level <= 2)) return;
      d.conf[m.qKey] ??= {};
      if (d.conf[m.qKey][m.uid] != null) return;
      d.conf[m.qKey][m.uid] = m.level;
      this._emit('conf');
    }
  }
  setState(state) {
    this.state = clean(state);
    return this._post({ kind: 'state', state: this.state });
  }
  onPlayers(cb) { this.cbs.players.push(cb); cb(clean(this.data.players)); }
  onAnswers(cb) { this.cbs.answers.push(cb); cb(clean(this.data.answers)); }
  onConf(cb) { this.cbs.conf.push(cb); cb(clean(this.data.conf)); }
  async close() {
    await this.setState({ phase: 'ended' });
    this.data = { players: {}, answers: {}, conf: {} };
  }
}

// ── Anfitrión (modo códigos): no hay conexión, todo es local ──
class OfflineHost {
  mode = 'codigos';
  async open() { this.pin = ''; return ''; }
  restore() {}
  setState() {}
  onPlayers() {}
  onAnswers() {}
  onConf() {}
  async close() {}
}

// ── Participante (modo red) ──────────────────────────────────
class RelayPlayer {
  mode = 'red';
  constructor() {
    this.ch = new RelayChannel('player');
    this.stateCbs = [];
    this.ch.onmessage = (e) => this._on(e.data);
    this.ch.onreconnect = () => this.joinedOk && this._post({ kind: 'join', uid: this.myId, alias: this.alias });
  }
  _post(m) {
    return this.ch.postMessage({ ...m, pin: this.pin });
  }
  _on(m) {
    if (m?.kind === 'room' && this._discoverWait) return this._discoverWait(m);
    if (!m || m.pin !== this.pin) return;
    if (m.to && m.to !== this.myId) return;
    if (m.kind === 'joined') {
      if (m.uid !== this.myId) return;
      this._joinWait?.(m);
      if (m.state) this.stateCbs.forEach((cb) => cb(m.state));
    }
    if (m.kind === 'state') this.stateCbs.forEach((cb) => cb(m.state));
  }
  // Busca la sala abierta en la laptop del anfitrión (devuelve su PIN o null)
  async discover(timeout = 2500) {
    try {
      await this.ch.ready;
    } catch {
      return null;
    }
    const nonce = newUid();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._discoverWait = null;
        resolve(null);
      }, timeout);
      this._discoverWait = (m) => {
        if (m.nonce !== nonce) return;
        clearTimeout(timer);
        this._discoverWait = null;
        resolve(m.pin || null);
      };
      this.ch.postMessage({ kind: 'discover', nonce });
    });
  }

  async join(pin, alias) {
    this.pin = String(pin);
    this.alias = alias;
    // Mismo nombre en la misma sala = misma persona (recupera su lugar al volver)
    const key = `sinapsis:uid:${this.pin}:${String(alias).trim().toLowerCase()}`;
    this.myId = lstore.get(key) || newUid();
    lstore.set(key, this.myId);
    await this.ch.ready;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._joinWait = null;
        reject(new Error('no-room'));
      }, 3500);
      this._joinWait = () => {
        clearTimeout(timer);
        this._joinWait = null;
        this.joinedOk = true;
        resolve({ uid: this.myId });
      };
      this._post({ kind: 'join', uid: this.myId, alias });
    });
  }
  onState(cb) {
    this.stateCbs.push(cb);
    this._post({ kind: 'hello', uid: this.myId });
  }
  answer(qKey, c, t) { this._post({ kind: 'answer', uid: this.myId, qKey, c, t: Math.round(t) }); }
  confidence(qKey, level) { this._post({ kind: 'conf', uid: this.myId, qKey, level }); }
}

export function createHost(mode) {
  return mode === 'red' ? new RelayHost() : new OfflineHost();
}

export function createPlayer() {
  return new RelayPlayer();
}
