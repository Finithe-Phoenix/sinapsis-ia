// ─────────────────────────────────────────────────────────────
//  SINAPSIS · Lógica del participante (celular o laptop)
//  · Modo 'red': conectado en vivo a la laptop del anfitrión.
//  · Modo 'codigos': responde siguiendo la pantalla y al final envía un código.
// ─────────────────────────────────────────────────────────────
import { CONFIG } from './config.js';
import { createPlayer, detectMode } from './transport.js';
import { encodeResult, decodeKey } from './codes.js';
import { $, $$, esc, shapeSvg, LETTERS, pct, randomAlias, store } from './util.js';

const ANON = CONFIG.identity === 'anonimo';
const params = new URLSearchParams(location.search);
const hashKey = new URLSearchParams(location.hash.slice(1)).get('k');
const P = {
  mode: 'codigos',
  transport: null,
  pin: null,
  me: null, // modo red: { alias, answers:{}, conf:{}, reveals:{} }
  off: null, // modo códigos: { fp, total, alias, answers:[], confs:[], st:[], cur, code }
  pub: null, // datos públicos del banco (sin respuestas)
  view: '',
  stateKey: '',
  state: null,
  timer: null,
  sawState: false,
};

// Almacenamiento persistente (sobrevive a cerrar la pestaña) para el modo códigos
const lstore = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem(k));
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {}
  },
};

const vibrate = (ms) => {
  try {
    navigator.vibrate?.(ms);
  } catch {}
};
const meKey = (pin) => `sinapsis:me:${pin}`;
const offKey = () => `sinapsis:off:${P.pub.fp}`;
const save = () => (P.mode === 'red' ? store.set(meKey(P.pin), P.me) : lstore.set(offKey(), P.off));

function show(id) {
  if (P.view === id) return;
  P.view = id;
  $$('.p-screen').forEach((s) => s.classList.toggle('active', s.id === `p-${id}`));
  window.scrollTo(0, 0);
}

function setMeChip(alias) {
  const chip = $('#me-chip');
  chip.textContent = ANON ? 'Participación anónima' : alias;
  chip.classList.remove('hidden');
}

// ── Inicio ───────────────────────────────────────────────────
async function init() {
  document.title = `${CONFIG.appName} · Participante`;
  $$('.app-name').forEach((e) => (e.textContent = CONFIG.appName));
  const pinInput = $('#pin');
  const aliasInput = $('#alias');
  if (ANON) {
    $('#alias-field').classList.add('hidden');
  } else if (CONFIG.identity === 'nombre') {
    $('#alias-label').textContent = 'Tu nombre';
    aliasInput.placeholder = 'Nombre';
    $('#dice').classList.add('hidden');
    $('#alias-hint').textContent = 'Solo tu nombre de pila. No escribas tu número de empleado ni tu correo.';
  } else {
    aliasInput.value = randomAlias();
  }
  $('#dice').addEventListener('click', () => {
    aliasInput.value = randomAlias();
    vibrate(10);
  });
  pinInput.addEventListener('input', () => {
    pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 6);
    $('#join-err').textContent = '';
  });

  const btn = $('#btn-join');
  btn.disabled = true;
  const det = await detectMode();
  P.mode = det.mode;
  btn.disabled = false;

  if (P.mode === 'red') {
    if (params.get('pin')) pinInput.value = params.get('pin').replace(/\D/g, '').slice(0, 6);
    P.transport = createPlayer();
    // Sin PIN en el link: se busca la sala abierta automáticamente
    if (pinInput.value.length !== 6) {
      $('#pin-field').classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'Buscando la sala…';
      const found = await P.transport.discover();
      btn.disabled = false;
      btn.textContent = 'Entrar';
      if (found) pinInput.value = found;
      else {
        $('#pin-field').classList.remove('hidden');
        $('#join-err').textContent = 'La sala aún no está abierta. Recarga la página en un momento o escribe el PIN de la pantalla principal.';
      }
    } else {
      $('#pin-field').classList.add('hidden');
    }
    ($('#pin-field').classList.contains('hidden') ? aliasInput : pinInput).focus();
    const pin = pinInput.value;
    const saved = pin.length === 6 ? store.get(meKey(pin)) : null;
    if (saved?.alias) joinRed(pin, saved.alias, { silent: true });
  } else {
    $('#pin-field').classList.add('hidden');
    btn.textContent = 'Comenzar';
    try {
      P.pub = await loadPublic();
    } catch {
      $('#join-err').textContent = 'No se encontraron los datos de la evaluación. Pide al anfitrión el archivo o la dirección correcta.';
      btn.disabled = true;
      return;
    }
    P.off = lstore.get(offKey());
    if (P.off?.alias) resumeOffline();
  }

  $('#join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const alias = ANON ? 'Participante' : aliasInput.value.trim();
    if (!validAlias(alias)) return;
    if (P.mode === 'red') joinRed(pinInput.value, alias);
    else startOffline(alias);
  });
}

async function loadPublic() {
  if (window.SINAPSIS_PUBLICO) return window.SINAPSIS_PUBLICO;
  const r = await fetch(CONFIG.publicUrl, { cache: 'no-store' });
  if (!r.ok) throw new Error('no-public');
  const data = await r.json();
  if (data.app !== 'sinapsis') throw new Error('no-public');
  return data;
}

function validAlias(alias) {
  const err = $('#join-err');
  err.textContent = '';
  if (!alias) {
    err.textContent = CONFIG.identity === 'nombre' ? 'Escribe tu nombre.' : 'Escribe un alias.';
    return false;
  }
  if (/@|\d{5,}/.test(alias)) {
    err.textContent = 'Por privacidad, no uses correos ni números largos en tu alias.';
    return false;
  }
  return true;
}

// ═════════════════════════════════════════════════════════════
//  MODO RED (en vivo)
// ═════════════════════════════════════════════════════════════
async function joinRed(pin, alias, { silent = false } = {}) {
  const err = $('#join-err');
  const btn = $('#btn-join');
  if (!/^\d{6}$/.test(pin)) {
    err.textContent = 'El PIN tiene 6 dígitos.';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Conectando…';
  try {
    P.transport = P.transport || createPlayer();
    await P.transport.join(pin, alias);
    P.pin = pin;
    P.me = store.get(meKey(pin)) || { alias, answers: {}, conf: {}, reveals: {} };
    P.me.alias = alias;
    save();
    setMeChip(alias);
    $('#wait-title').textContent = ANON ? 'Bienvenido a la red' : `Bienvenido, ${alias}`;
    show('wait');
    vibrate(30);
    P.transport.onState(onState);
  } catch (e) {
    const m = String(e?.message || e);
    err.textContent =
      m === 'no-room'
        ? 'No encontramos esa sala. Revisa el PIN que aparece en la pantalla principal.'
        : 'No se pudo conectar con la laptop del anfitrión. Revisa que estés en la misma red.';
    if (silent) store.del(meKey(pin));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}

function onState(s) {
  if (!s) {
    if (P.sawState) show('ended');
    return;
  }
  P.sawState = true;
  P.state = s;
  const key = `${s.phase}:${s.qKey ?? ''}`;
  const changed = key !== P.stateKey;
  P.stateKey = key;
  if (!changed && ['lobby', 'chapter', 'reveal', 'report', 'ended'].includes(s.phase)) return;
  switch (s.phase) {
    case 'lobby':
      show('wait');
      break;
    case 'chapter':
      $('#pc-kicker').textContent = `Capítulo ${String(s.q + 1).padStart(2, '0')} de ${String(s.total).padStart(2, '0')}`;
      $('#pc-domain').textContent = s.domain || '';
      show('chapter');
      vibrate(15);
      break;
    case 'question':
      onQuestion(s, changed);
      break;
    case 'closed':
      stopTimer();
      if (P.me.answers[s.qKey] != null) {
        if (P.view === 'conf') break; // aún puede indicar su confianza
        sentScreen('Respuestas cerradas', 'Revelando la respuesta…');
      } else {
        $('#sent-badge').innerHTML = '';
        sentScreen('Se acabó el tiempo', 'Mira la pantalla principal');
      }
      break;
    case 'reveal':
      stopTimer();
      onReveal(s);
      break;
    case 'report':
      stopTimer();
      onReportRed(s);
      break;
    case 'ended':
      stopTimer();
      show('ended');
      break;
  }
}

function onQuestion(s, changed) {
  const answered = P.me.answers[s.qKey];
  if (answered != null) {
    if (s.askConfidence !== false && P.me.conf[s.qKey] == null) confScreen(answered);
    else sentScreen('Respuesta registrada', 'Esperando al resto del equipo', answered);
    return;
  }
  if (!changed && P.view === 'question') return;
  $('#pq-count').textContent = `Pregunta ${s.q + 1} / ${s.total}`;
  $('#pq-segs').innerHTML = Array.from({ length: s.total }, (_, k) => `<i class="${k < s.q ? 'done' : k === s.q ? 'now' : ''}"></i>`).join('');
  $('#pq-text').textContent = s.text || '';
  const box = $('#pq-options');
  box.classList.remove('locked');
  box.innerHTML = (s.options || [])
    .map((o, k) => `<button class="pq-opt o${k}" data-c="${k}"><span class="lt">${shapeSvg(k, 20)}${LETTERS[k]}</span><span>${esc(o)}</span></button>`)
    .join('');
  $$('.pq-opt', box).forEach((b) => b.addEventListener('click', () => answerRed(s, Number(b.dataset.c))));
  show('question');
  vibrate([20, 40, 20]);
  startTimer(s);
}

function startTimer(s) {
  stopTimer();
  const dur = s.duration || CONFIG.questionSeconds * 1000;
  let start = s.startedAt || Date.now();
  const skew = Date.now() - start;
  if (skew < -2000 || skew > dur + 2000) start = Date.now(); // relojes desfasados
  P.qStart = start;
  const el = $('#pq-timer');
  const fill = $('#pq-bar-fill');
  const tick = () => {
    const left = Math.max(0, dur - (Date.now() - start));
    el.textContent = Math.ceil(left / 1000);
    el.classList.toggle('urgent', left < 5500);
    fill.style.transform = `scaleX(${left / dur})`;
  };
  tick();
  P.timer = setInterval(tick, 200);
}

function stopTimer() {
  clearInterval(P.timer);
  P.timer = null;
}

function answerRed(s, c) {
  if (P.me.answers[s.qKey] != null) return;
  $('#pq-options').classList.add('locked');
  vibrate(35);
  P.me.answers[s.qKey] = c;
  save();
  P.transport.answer(s.qKey, c, Date.now() - (P.qStart || Date.now()));
  stopTimer();
  if (s.askConfidence !== false) confScreen(c);
  else sentScreen('Respuesta registrada', 'Esperando al resto del equipo', c);
}

const badge = (c) => `${shapeSvg(c, 22)}<span>Elegiste ${LETTERS[c]}</span>`;

function confScreen(c) {
  $('#conf-badge').innerHTML = badge(c);
  $$('.conf').forEach((b) => b.classList.remove('picked'));
  P.view = '';
  show('conf');
}

$$('.conf').forEach((b) =>
  b.addEventListener('click', () => {
    const level = Number(b.dataset.level);
    b.classList.add('picked');
    vibrate(20);
    if (P.mode === 'codigos') return confOffline(level);
    const s = P.state;
    if (!s?.qKey || P.me.conf[s.qKey] != null) return;
    P.me.conf[s.qKey] = level;
    save();
    P.transport.confidence(s.qKey, level);
    const c = P.me.answers[s.qKey];
    if (s.phase === 'question') sentScreen('Respuesta registrada', 'Esperando al resto del equipo', c);
    else sentScreen('Respuestas cerradas', 'Revelando la respuesta…', c);
  }),
);

function sentScreen(kicker, title, c) {
  if (c != null) $('#sent-badge').innerHTML = badge(c);
  $('#sent-kicker').textContent = kicker;
  $('#sent-title').textContent = title;
  P.view = '';
  show('sent');
}

const CHECK = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const DASH = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

function onReveal(s) {
  P.me.reveals[s.qKey] = { correct: s.correct, domain: s.domain };
  save();
  const mine = P.me.answers[s.qKey];
  const ok = mine === s.correct;
  $('#pr-card').classList.toggle('ok', ok);
  $('#pr-icon').innerHTML = ok ? CHECK : DASH;
  const right = `<b>${LETTERS[s.correct]} · ${esc(s.options?.[s.correct] || '')}</b>`;
  if (mine == null) {
    $('#pr-title').textContent = 'Sin respuesta';
    $('#pr-answer').innerHTML = `La respuesta correcta era ${right}`;
  } else if (ok) {
    $('#pr-title').textContent = 'Correcto';
    $('#pr-answer').innerHTML = `Elegiste ${right}`;
  } else {
    $('#pr-title').textContent = 'No esta vez';
    $('#pr-answer').innerHTML = `Elegiste ${LETTERS[mine]}. La respuesta correcta era ${right}`;
  }
  $('#pr-expl').textContent = s.explanation || '';
  $('#pr-team').textContent = s.n ? `El ${pct(s.pct)} del equipo acertó` : '';
  P.view = '';
  show('reveal');
  vibrate(ok ? [30, 60, 30] : 40);
}

function onReportRed(s) {
  const total = s.total || 10;
  const answers = [];
  const confs = [];
  const key = [];
  const qd = [];
  for (let i = 0; i < total; i++) {
    const k = `q${i}`;
    answers.push(P.me.answers[k] ?? null);
    confs.push(P.me.conf[k] ?? null);
    key.push(s.key?.[i] ?? P.me.reveals[k]?.correct ?? null);
    qd.push(s.qdomains?.[i] || P.me.reveals[k]?.domain || 'General');
  }
  renderDossier({ total, key, qdomains: qd, recos: s.recos || [], answers, confs });
}

// ═════════════════════════════════════════════════════════════
//  MODO CÓDIGOS (sin conexión)
// ═════════════════════════════════════════════════════════════
function startOffline(alias) {
  const T = P.pub.total;
  P.off = { fp: P.pub.fp, total: T, alias, answers: Array(T).fill(null), confs: Array(T).fill(null), st: Array(T).fill(''), cur: 0, code: null };
  save();
  setMeChip(alias);
  vibrate(30);
  showOfflineQuestion(0);
}

function resumeOffline() {
  setMeChip(P.off.alias);
  if (P.off.code) {
    showCode();
    if (hashKey) unlockOffline(hashKey);
    return;
  }
  const i = P.off.st[P.off.cur] ? nextPending(P.off.cur) : P.off.cur;
  if (i == null) finishOffline();
  else showOfflineQuestion(i);
}

function tilesHtml(cur) {
  const o = P.off;
  return o.st
    .map((st, i) => `<button class="tile ${st === 'a' ? 'a' : st === 's' ? 's' : ''} ${i === cur ? 'cur' : ''}" data-i="${i}" aria-label="Pregunta ${i + 1}">${i + 1}</button>`)
    .join('');
}

function bindTiles(container) {
  container.style.gridTemplateColumns = `repeat(${Math.min(P.off.total, 10)}, 1fr)`;
  $$('.tile', container).forEach((t) =>
    t.addEventListener('click', () => {
      const i = Number(t.dataset.i);
      if (!P.off.st[i]) showOfflineQuestion(i);
    }),
  );
}

function showOfflineQuestion(i) {
  const o = P.off;
  o.cur = i;
  save();
  $('#oq-count').textContent = `Pregunta ${i + 1} / ${o.total}`;
  const tiles = $('#oq-tiles');
  tiles.innerHTML = tilesHtml(i);
  bindTiles(tiles);
  const box = $('#oq-options');
  box.innerHTML = LETTERS.map((l, k) => `<button class="pq-opt o${k}" data-c="${k}"><span class="lt">${shapeSvg(k, 26)}${l}</span><span></span></button>`).join('');
  $$('.pq-opt', box).forEach((b) => b.addEventListener('click', () => answerOffline(Number(b.dataset.c))));
  P.view = '';
  show('oq');
  vibrate(15);
}

function answerOffline(c) {
  const o = P.off;
  if (o.st[o.cur]) return;
  o.answers[o.cur] = c;
  o.st[o.cur] = 'a';
  save();
  vibrate(35);
  if (CONFIG.askConfidence) confScreen(c);
  else afterOfflineAnswer(c);
}

function confOffline(level) {
  const o = P.off;
  if (o.st[o.cur] !== 'a' || o.confs[o.cur] != null) return;
  o.confs[o.cur] = level;
  save();
  afterOfflineAnswer(o.answers[o.cur]);
}

$('#oq-skip').addEventListener('click', () => {
  const o = P.off;
  if (o.st[o.cur]) return;
  o.st[o.cur] = 's';
  save();
  afterOfflineAnswer(null);
});

function nextPending(from) {
  const o = P.off;
  for (let k = 1; k <= o.total; k++) {
    const i = (from + k) % o.total;
    if (!o.st[i]) return i;
  }
  return null;
}

function afterOfflineAnswer(c) {
  const o = P.off;
  const n = nextPending(o.cur);
  if (n == null) return finishOffline();
  $('#onext-badge').innerHTML = c == null ? '' : badge(c);
  $('#onext-kicker').textContent = c == null ? 'Pregunta omitida' : 'Respuesta guardada';
  $('#onext-title').textContent = `Espera la pregunta ${n + 1}`;
  $('#onext-go').textContent = `Ir a la pregunta ${n + 1}`;
  $('#onext-go').onclick = () => showOfflineQuestion(n);
  const tiles = $('#onext-tiles');
  tiles.innerHTML = tilesHtml(n);
  bindTiles(tiles);
  P.view = '';
  show('onext');
}

function finishOffline() {
  const o = P.off;
  if (!o.code) {
    o.code = encodeResult(o.answers, o.confs, o.fp);
    save();
  }
  vibrate([40, 80, 40]);
  showCode();
}

function chatMessage() {
  const o = P.off;
  return ANON ? `SINAPSIS · ${o.code}` : `SINAPSIS · ${o.alias} · ${o.code}`;
}

function showCode() {
  $('#code-text').textContent = P.off.code;
  if (hashKey) $('#key-input').value = hashKey;
  P.view = '';
  show('code');
}

$('#btn-copy').addEventListener('click', async () => {
  const msg = chatMessage();
  const out = $('#copy-msg');
  try {
    await navigator.clipboard.writeText(msg);
    out.textContent = 'Copiado. Pégalo en el chat de la reunión.';
  } catch {
    const area = $('#copy-area');
    area.value = msg;
    area.classList.remove('hidden');
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {}
    out.textContent = ok ? 'Copiado. Pégalo en el chat de la reunión.' : 'Selecciona el texto de arriba y cópialo manualmente.';
  }
  vibrate(20);
});

$('#btn-key').addEventListener('click', () => unlockOffline($('#key-input').value));
$('#key-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') unlockOffline($('#key-input').value);
});
$('#key-input').addEventListener('input', () => ($('#key-err').textContent = ''));

function unlockOffline(raw) {
  const o = P.off;
  let key;
  try {
    key = decodeKey(raw, o.total);
  } catch (e) {
    $('#key-err').textContent = `${e.message}. Revísala en la pantalla principal.`;
    return;
  }
  renderDossier({ total: o.total, key, qdomains: P.pub.qdomains, recos: P.pub.recos, answers: o.answers, confs: o.confs });
  $('#d-back').classList.remove('hidden');
}

$('#d-back').addEventListener('click', showCode);
$('#btn-reset').addEventListener('click', () => {
  if (!confirm('¿Borrar tus respuestas de este dispositivo y empezar de nuevo?\n\nSi ya enviaste tu código, no hace falta.')) return;
  lstore.del(offKey());
  location.hash = '';
  location.reload();
});

// ═════════════════════════════════════════════════════════════
//  Dossier personal (ambos modos)
// ═════════════════════════════════════════════════════════════
function renderDossier({ total, key, qdomains, recos, answers, confs }) {
  let score = 0;
  let sureWrong = 0;
  let sureRight = 0;
  let answered = 0;
  const dom = {};
  for (let i = 0; i < total; i++) {
    const d = qdomains[i] || 'General';
    dom[d] ??= { c: 0, t: 0 };
    dom[d].t++;
    const mine = answers[i];
    const correct = key[i];
    if (mine == null || correct == null) continue;
    answered++;
    const ok = mine === correct;
    if (ok) {
      score++;
      dom[d].c++;
    }
    if (confs[i] === 0) ok ? sureRight++ : sureWrong++;
  }
  $('#d-score').textContent = score;
  $('#d-total').textContent = `/ ${total}`;
  $('#d-sub').textContent = `Respondiste ${answered} de ${total} preguntas.`;
  $('#d-domains').innerHTML = Object.entries(dom)
    .map(([d, v]) => {
      const f = v.t ? v.c / v.t : 0;
      return `<div class="d-dom ${f < 0.7 ? 'low' : ''}"><span>${esc(d)}</span><span class="v">${v.c}/${v.t}</span><div class="bar-bg"><div class="bar-fg" data-w="${f * 100}"></div></div></div>`;
    })
    .join('');
  requestAnimationFrame(() => requestAnimationFrame(() => $$('.bar-fg').forEach((b) => (b.style.width = b.dataset.w + '%'))));
  let calib;
  if (sureWrong >= 2) calib = `Ojo: en ${sureWrong} respuestas estabas seguro y no acertaste. Son los temas que más vale la pena repasar.`;
  else if (sureWrong === 1) calib = 'En una respuesta estabas seguro y no acertaste. Revisa ese tema con calma.';
  else if (sureRight > 0) calib = 'Tu confianza está bien calibrada: cuando estabas seguro, acertaste.';
  else calib = 'Indicaste dudas en tus respuestas; el debrief de cada pregunta es un buen punto de partida.';
  $('#d-calib').textContent = calib;
  const list = (recos || []).filter((r) => {
    const v = dom[r.label];
    return v && v.t && v.c / v.t < 0.7;
  });
  $('#d-recos-wrap').classList.toggle('hidden', !list.length);
  $('#d-recos').innerHTML = list.map((r) => `<li><b>${esc(r.label)}:</b> ${esc(r.text)}</li>`).join('');
  P.view = '';
  show('dossier');
  vibrate([40, 80, 40]);
}

init();
