// ─────────────────────────────────────────────────────────────
//  SINAPSIS · Lógica de la pantalla del anfitrión
// ─────────────────────────────────────────────────────────────
import { CONFIG } from './config.js';
import { createHost, detectMode } from './transport.js';
import { decryptBank, validateBank } from './crypto.js';
import { fingerprint, decodeResult, parseCodes, encodeKey } from './codes.js';
import { Network } from './network.js';
import { Sound } from './audio.js';
import { computeStats, questionStats, csvParticipants, csvQuestions, jsonExport, CONF_LABELS } from './stats.js';
import { radarSvg, questionBarsSvg, histogramSvg, calibrationHtml } from './charts.js';
import { $, $$, sleep, esc, shapeSvg, LETTERS, pct, countUp, download, randomAlias, nextFrame, clamp } from './util.js';

const net = new Network($('#net'));
const sound = new Sound();

// Escala el escenario de 1280×720 para que quepa completo en cualquier ventana
const STAGE_W = 1280;
const STAGE_H = 720;
function fitStage() {
  const s = Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H);
  $('#stage').style.setProperty('--s', String(s));
}
window.addEventListener('resize', fitStage);
fitStage();
const ANON = CONFIG.identity === 'anonimo';

const S = {
  mode: 'codigos', // 'red' | 'codigos'
  modeInfo: null,
  fp: 0,
  codes: new Set(),
  codeSeq: 0,
  bank: null,
  pendingPayload: null,
  transport: null,
  pin: null,
  screen: 'unlock',
  phase: 'unlock',
  q: -1,
  seq: 0,
  busy: false,
  closing: false,
  qStart: 0,
  qDur: 0,
  lastTick: -1,
  botTimers: [],
  seen: new Set(),
  lastAnswerCount: 0,
  stats: null,
  real: { players: {}, answers: {}, conf: {} },
  bots: { players: {}, answers: {}, conf: {} },
};

// ── Datos combinados (reales + ensayo) ───────────────────────
const players = () => ({ ...S.real.players, ...S.bots.players });
function merged(k) {
  const out = {};
  for (const src of [S.real[k], S.bots[k]]) {
    for (const [q, m] of Object.entries(src || {})) out[q] = { ...(out[q] || {}), ...(m || {}) };
  }
  return out;
}
const answers = () => merged('answers');
const confs = () => merged('conf');
const total = () => S.bank.questions.length;
const qKey = (i) => `q${i}`;
const pad2 = (n) => String(n).padStart(2, '0');
const domainLabel = (q) => S.bank.domains[q.domain]?.label || q.domain;

// ── Utilidades de interfaz ───────────────────────────────────
function showScreen(id) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === `s-${id}`));
  document.body.dataset.screen = id;
  S.screen = id;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

async function wipe(mid) {
  S.busy = true;
  const w = $('#wipe');
  sound.whoosh();
  w.classList.remove('out');
  await nextFrame();
  w.classList.add('in');
  await sleep(720);
  await mid?.();
  await nextFrame();
  w.classList.remove('in');
  w.classList.add('out');
  await sleep(760);
  w.classList.remove('out');
  S.busy = false;
}

function renderProgress() {
  const el = $('#hud-progress');
  if (!S.bank) return;
  el.innerHTML = S.bank.questions
    .map((_, i) => `<span class="pdot ${i < S.q ? 'done' : i === S.q ? 'now' : ''}"></span>`)
    .join('');
}

// ── Configuración inicial ────────────────────────────────────
const OFFLINE = () => S.mode === 'codigos';

async function initStatic() {
  document.title = `${CONFIG.appName} · Anfitrión`;
  $$('.app-name').forEach((e) => (e.textContent = CONFIG.appName));
  $('#hud-name').textContent = CONFIG.appName;
  $('#hud-org').textContent = CONFIG.org || '';
  $('#title-org').textContent = CONFIG.org || '';
  $('#title-sub').textContent = CONFIG.subtitle;
  // Título con la última letra en rojo
  const name = CONFIG.appName;
  $('#title-main').innerHTML = `${esc(name.slice(0, -1))}<span class="r">${esc(name.slice(-1))}</span>`;
  if (CONFIG.logoUrl) {
    const img = $('#org-logo');
    img.src = CONFIG.logoUrl;
    img.classList.remove('hidden');
  }
  net.start();
  net.setOpacity(0.55);
  net.addCore();
  net.bloom(26, 1600);
  $('#pass').focus();
  $('#mode-info').innerHTML = '<span class="led"></span>Detectando conexión…';
  const det = await detectMode();
  S.mode = det.mode;
  S.modeInfo = det.info;
  const mode = OFFLINE()
    ? '<span class="led"></span>Sin conexión · códigos'
    : '<span class="led on"></span>En vivo · red local';
  $('#mode-info').innerHTML = mode;
  $('#hud-mode').innerHTML = mode;
}

// ── Desbloqueo del banco ─────────────────────────────────────
$('#bank-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  const info = $('#bank-file-info');
  if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    if (obj.app === 'sinapsis' && obj.data) {
      S.pendingPayload = obj;
      S.bank = null;
      info.textContent = 'Banco cifrado cargado. Escribe su clave arriba.';
    } else {
      const problems = validateBank(obj);
      if (problems.length) throw new Error(problems[0]);
      S.bank = obj;
      S.pendingPayload = null;
      info.textContent = `Banco sin cifrar cargado: ${obj.questions.length} preguntas. No necesitas clave.`;
    }
  } catch (err) {
    info.textContent = `No se pudo leer el archivo: ${err.message}`;
  }
});

$('#unlock-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  sound.unlock();
  const btn = $('#btn-unlock');
  const errEl = $('#unlock-err');
  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Abriendo…';
  try {
    await ready;
    if (!S.bank) {
      const pass = $('#pass').value;
      if (!pass) throw new Error('Escribe la clave del banco.');
      let payload = S.pendingPayload || window.SINAPSIS_BANCO;
      if (!payload) {
        const res = await fetch(CONFIG.bankUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error(`No se encontró el banco cifrado (${CONFIG.bankUrl}).`);
        payload = await res.json();
      }
      S.bank = await decryptBank(payload, pass);
    }
    const problems = validateBank(S.bank);
    if (problems.length) throw new Error(problems[0]);
    $('#pass').value = '';
    await openRoom();
    if ($('#skip-intro').checked) enterLobby();
    else runPrologue();
  } catch (err) {
    errEl.textContent = friendlyError(err);
    btn.disabled = false;
    btn.textContent = 'Abrir sala';
  }
});

function friendlyError(err) {
  const m = String(err?.message || err);
  if (m === 'sin-servidor') return 'No se pudo conectar con el servidor local. Reinicia tools/servidor.mjs o usa el modo sin conexión.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'No se pudo leer un archivo de la app. Si abriste la página directamente desde el disco, usa los archivos de la carpeta dist/.';
  return m;
}

// ── Sala ─────────────────────────────────────────────────────
function pushState(state) {
  Promise.resolve(S.transport.setState(state)).catch((err) => toast(friendlyError(err)));
}

async function openRoom() {
  S.fp = fingerprint(S.bank.questions);
  S.transport = createHost(S.mode);
  S.pin = await S.transport.open();
  S.transport.onPlayers((p) => {
    S.real.players = p || {};
    onPlayersChanged();
  });
  S.transport.onAnswers((a) => {
    S.real.answers = a || {};
    onAnswersChanged();
  });
  S.transport.onConf((c) => {
    S.real.conf = c || {};
  });
  await S.transport.setState({ phase: 'lobby', appName: CONFIG.appName, total: total(), identity: CONFIG.identity, askConfidence: CONFIG.askConfidence });
  window.addEventListener('beforeunload', (e) => {
    if (S.phase !== 'unlock' && S.phase !== 'closed-room') {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  setupLobby();
}

function drawQr(el, text, size = 340) {
  el.innerHTML = '';
  if (!text || !window.QRCode) return false;
  new window.QRCode(el, { text, width: size, height: size, colorDark: '#1A1A1A', colorLight: '#FFFFFF', correctLevel: window.QRCode.CorrectLevel.M });
  return true;
}

// Dirección de la página del participante
function participantUrl() {
  if (OFFLINE()) {
    if (CONFIG.participantUrl) return new URL(CONFIG.participantUrl, location.href);
    if (location.protocol === 'file:') return null; // archivo compartido por chat
    // Versión autónoma publicada en una web: el participante está junto a este archivo
    return new URL(window.SINAPSIS_BANCO ? CONFIG.participantFile : 'play.html', location.href);
  }
  const url = new URL('play.html', location.href);
  // En localhost, mostrar la IP de la laptop para que otros dispositivos entren
  const ip = S.modeInfo?.ips?.[0];
  if (/^(localhost|127\.|\[::1\])/.test(location.hostname) && ip) url.host = `${ip}:${S.modeInfo.port}`;
  url.searchParams.set('pin', S.pin);
  return url;
}

function setupLobby() {
  const url = participantUrl();
  // En red local basta con la raíz (redirige al participante y encuentra la sala sola)
  const shown = !url ? CONFIG.participantFile : OFFLINE() ? `${url.host}${url.pathname}` : `http://${url.host}`;
  const identityStep = ANON ? 'Entra sin nombre (participación anónima)' : CONFIG.identity === 'nombre' ? 'Escribe tu nombre' : 'Elige tu alias';
  $('#hud-pin').textContent = S.pin || '—';
  $('#hud-pin-chip').classList.toggle('hidden', OFFLINE());
  const qr = $('#qr');
  $('#join-hint').textContent = shown;
  if (OFFLINE()) {
    $('#step-1').textContent = url ? 'Escanea el código o abre la dirección de la tarjeta' : 'Abre el archivo que compartimos en el chat';
    $('#step-2').textContent = `${identityStep} y toca «Comenzar»`;
    $('#step-3').textContent = 'Sigue esta pantalla y responde en tu dispositivo';
    $('#lobby-local').innerHTML = 'Modo sin conexión: al final, cada persona enviará un <strong>código de resultados</strong> por el chat y con él se genera el informe del equipo.';
    $('#lobby-local').classList.remove('hidden');
    $('#pin-label').textContent = url ? 'Página del participante' : 'Archivo del participante';
    $('#pin').textContent = '';
    $('#qr-card').classList.toggle('hidden', !url);
    $('#count-label').textContent = 'participantes de ensayo';
    $('#lobby-count').classList.add('hidden');
    if (url && !drawQr(qr, url.href)) qr.innerHTML = `<p class="qr-fallback">${esc(shown)}</p>`;
  } else {
    $('#step-1').textContent = 'Escanea el código con tu celular';
    $('#step-2').innerHTML = `O abre <strong class="mono">${esc(shown)}</strong> en tu laptop`;
    $('#step-3').textContent = `${identityStep} y espera el inicio`;
    $('#pin-label').textContent = 'PIN de la sala';
    $('#pin').textContent = S.pin;
    $('#lobby-local').innerHTML = 'En vivo por red local: los dispositivos deben estar en la misma red que esta laptop.';
    $('#lobby-local').classList.remove('hidden');
    if (!drawQr(qr, url.href)) qr.innerHTML = `<p class="qr-fallback">Entra a<br><strong>${esc(shown)}</strong></p>`;
  }
}

// Escena de la red según la pantalla: constelación con nombres en el lobby
function stageLobby() {
  const stage = $('.lobby-stage');
  const r = stage?.getBoundingClientRect();
  if (r && r.width > innerWidth * 0.3) net.setFocus((r.left + r.width / 2) / innerWidth, (r.top + r.height * 0.48) / innerHeight, r.width);
  else net.setFocus(0.5, 0.5);
  net.setLabels(!ANON);
  net.setRays(true);
}
function stageCenter({ rays = false } = {}) {
  net.setFocus(0.5, 0.5);
  net.setLabels(false);
  net.setRays(rays);
}

function onPlayersChanged() {
  const all = players();
  const ids = Object.keys(all);
  $('#player-count').textContent = ids.length;
  const chips = $('#chips');
  for (const id of ids) {
    if (S.seen.has(id)) continue;
    S.seen.add(id);
    const p = all[id];
    net.addPlayer(ANON ? '' : p.alias || '');
    if (S.screen === 'lobby' && !p.bot) sound.pop();
    const chip = document.createElement('span');
    chip.className = 'pchip' + (p.bot ? ' bot' : '');
    chip.textContent = ANON ? 'Participante' : p.alias || 'Participante';
    chips.prepend(chip);
  }
  while (chips.children.length > 40) chips.lastChild.remove();
  if (S.phase === 'question') onAnswersChanged();
}

// Un punto por participante que se llena al responder (o barra si son muchos)
function renderDots(n, m) {
  const box = $('#resp-dots');
  const many = m > 60;
  box.classList.toggle('hidden', many);
  $('.resp-bar').classList.toggle('hidden', !many);
  if (many) return;
  if (box.children.length !== m) box.innerHTML = '<i></i>'.repeat(m);
  [...box.children].forEach((d, k) => d.classList.toggle('on', k < n));
}

function onAnswersChanged() {
  if (S.phase !== 'question' || S.q < 0 || OFFLINE()) return;
  const A = answers()[qKey(S.q)] || {};
  const present = Object.keys(players());
  const n = present.filter((id) => A[id]).length;
  const m = present.length;
  $('#resp-count').textContent = `${n} / ${m} respuestas`;
  $('#resp-fill').style.width = m ? `${(n / m) * 100}%` : '0%';
  renderDots(n, m);
  for (let k = S.lastAnswerCount; k < n; k++) setTimeout(() => net.spark(), k * 60 - S.lastAnswerCount * 60);
  S.lastAnswerCount = n;
  if (m > 0 && n >= m && !S.closing && S.autoClose !== S.q) {
    const i = S.q;
    S.autoClose = i;
    $('#q-status').textContent = 'Todos respondieron';
    setTimeout(() => {
      if (S.q === i) closeQuestion();
    }, 900);
  }
}

// ── Participantes de ensayo ──────────────────────────────────
function addBots(n = 24) {
  for (let k = 0; k < n; k++) {
    const id = `bot${Date.now().toString(36)}${k}`;
    S.bots.players[id] = { alias: randomAlias(), joinedAt: Date.now(), bot: true, skill: 0.35 + Math.random() * 0.55 };
  }
  // Escalonar la llegada visual
  const ids = Object.keys(S.bots.players).filter((id) => !S.seen.has(id));
  ids.forEach((id, k) => setTimeout(() => onPlayersChanged(), k * 120));
  toast(`${n} participantes de ensayo agregados`);
}

function scheduleBots(i, dur) {
  cancelBots();
  const q = S.bank.questions[i];
  const wrong = [0, 1, 2, 3].filter((x) => x !== q.correct);
  const favorite = wrong[(i * 7) % 3];
  for (const [id, b] of Object.entries(S.bots.players)) {
    const diff = q.difficulty || 2;
    const p = clamp(b.skill - (diff - 1) * 0.12, 0.08, 0.95);
    const right = Math.random() < p;
    const c = right ? q.correct : Math.random() < 0.55 ? favorite : wrong[Math.floor(Math.random() * 3)];
    const delay = 1500 + Math.random() * dur * 0.7;
    S.botTimers.push(
      setTimeout(() => {
        if (S.phase !== 'question' || S.q !== i) return;
        (S.bots.answers[qKey(i)] ??= {})[id] = { c, t: Math.round(delay) };
        const r = Math.random();
        const level = right ? (r < 0.62 ? 0 : r < 0.88 ? 1 : 2) : r < 0.33 ? 0 : r < 0.72 ? 1 : 2;
        if (CONFIG.askConfidence) (S.bots.conf[qKey(i)] ??= {})[id] = level;
        onAnswersChanged();
      }, delay),
    );
  }
}

function cancelBots() {
  S.botTimers.forEach(clearTimeout);
  S.botTimers = [];
}

// ── Prólogo ──────────────────────────────────────────────────
function wordsHtml(text, { stagger = 70, accentWords = [] } = {}) {
  return text
    .split(' ')
    .map((w, k) => {
      if (w === '·') return `<span class="w"><span class="sep" style="--d:${k * stagger}ms">·</span></span> `;
      const cls = accentWords.includes(w.replace(/[.,¿?]/g, '')) ? 'accent' : '';
      return `<span class="w"><span class="${cls}" style="--d:${k * stagger}ms">${esc(w)}</span></span>`;
    })
    .join(' ');
}

async function proLine(alive, text, hold, opts = {}) {
  const el = $('#pro-line');
  el.className = 'pro-line' + (opts.wide ? ' wide' : '');
  el.innerHTML = wordsHtml(text, opts);
  await nextFrame();
  if (!alive()) return false;
  el.classList.add('in');
  await sleep(hold);
  if (!alive()) return false;
  el.classList.add('out');
  await sleep(900);
  return alive();
}

async function runPrologue() {
  const my = ++S.seq;
  const alive = () => my === S.seq;
  S.phase = 'prologue';
  showScreen('prologue');
  net.clear();
  net.setOpacity(1);
  net.setZoom(1);
  sound.swell();
  await sleep(700);
  if (!alive()) return;
  net.addCore();
  await sleep(1300);
  if (!alive()) return;
  net.bloom(Math.round(clamp((innerWidth * innerHeight) / 20000, 40, 110)), 3600);
  net.setZoom(1.12);
  if (!(await proLine(alive, 'Cada día trabajamos junto a una inteligencia artificial.', 3200, { accentWords: ['inteligencia', 'artificial'] }))) return;
  if (!(await proLine(alive, 'Modelos · Agentes · Workflows · Contexto', 2800, { stagger: 140, wide: true }))) return;
  if (!(await proLine(alive, '¿Cuánto la entendemos realmente?', 2800, { accentWords: ['realmente'] }))) return;
  await wipe(() => {
    $('#pro-line').innerHTML = '';
    $('#title-card').classList.add('in');
    net.setOpacity(0.5);
    net.setZoom(1);
    sound.impact();
    net.burst(16);
  });
  await sleep(4200);
  if (!alive()) return;
  enterLobby();
}

function enterLobby() {
  ++S.seq;
  S.phase = 'lobby';
  $('#title-card').classList.remove('in');
  if (!net.core) {
    net.clear();
    net.addCore();
    net.bloom(40, 1200);
  }
  net.setOpacity(0.85);
  net.setZoom(1);
  showScreen('lobby');
  stageLobby();
  sound.startPad();
  renderProgress();
}
window.addEventListener('resize', () => {
  if (S.screen === 'lobby') stageLobby();
});

// ── Capítulos y preguntas ────────────────────────────────────
async function startChapter(i) {
  if (S.busy) return;
  const my = ++S.seq;
  S.q = i;
  S.phase = 'chapter';
  const q = S.bank.questions[i];
  sound.stopPad();
  pushState({ phase: 'chapter', q: i, qKey: qKey(i), total: total(), domain: domainLabel(q), level: q.level || '' });
  await wipe(() => {
    $('#ch-big').textContent = pad2(i + 1);
    $('#ch-kicker').textContent = `Capítulo ${pad2(i + 1)} de ${pad2(total())}`;
    $('#ch-domain').textContent = domainLabel(q);
    $('#ch-level').textContent = q.level ? `Nivel ${q.level.toLowerCase()}` : '';
    $('#s-chapter').classList.remove('in');
    showScreen('chapter');
    renderProgress();
    stageCenter();
    net.setOpacity(0.5);
  });
  if (my !== S.seq) return;
  $('#s-chapter').classList.add('in');
  await sleep(2700);
  if (my !== S.seq) return;
  startQuestion(i);
}

function renderQuestion(i) {
  const q = S.bank.questions[i];
  const sec = $('#s-question');
  sec.classList.remove('enter', 'revealed', 'marked', 'closed');
  $('#q-kicker').textContent = `Capítulo ${pad2(i + 1)} · ${domainLabel(q)}`;
  $('#q-ghost').textContent = pad2(i + 1);
  $('#q-text').textContent = q.text;
  $('#resp-dots').innerHTML = '';
  $('#options').innerHTML = q.options
    .map(
      (o, k) => `<div class="opt" data-i="${k}" style="--d:${200 + k * 110}ms">
        <div class="opt-fill"></div>
        <div class="opt-badge"><span class="tile t${k}">${shapeSvg(k, 22)}${LETTERS[k]}</span></div>
        <div class="opt-text">${esc(o)}</div>
        <div class="opt-stat"><span class="opt-pct">0%</span><span class="opt-n">0</span></div>
      </div>`,
    )
    .join('');
  $('#debrief').classList.remove('show');
  $('#q-status').textContent = OFFLINE() ? '' : 'Responde desde tu dispositivo';
  $('#resp-fill').style.width = '0%';
  $('#timer').classList.remove('urgent');
  if (OFFLINE()) {
    $('#resp-count').textContent = `Responde la pregunta ${i + 1} en tu dispositivo`;
    $('.resp-bar').classList.add('hidden');
    $('#resp-dots').classList.add('hidden');
  }
}

async function startQuestion(i) {
  const my = ++S.seq;
  const q = S.bank.questions[i];
  S.q = i;
  S.phase = 'question';
  S.closing = false;
  S.lastAnswerCount = 0;
  S.lastTick = -1;
  renderQuestion(i);
  showScreen('question');
  await nextFrame();
  $('#s-question').classList.add('enter');
  S.qDur = CONFIG.questionSeconds * 1000;
  S.qStart = Date.now();
  pushState({
    phase: 'question', q: i, qKey: qKey(i), total: total(), domain: domainLabel(q), level: q.level || '',
    text: q.text, options: q.options, startedAt: S.qStart, duration: S.qDur, askConfidence: CONFIG.askConfidence,
  });
  net.setOpacity(0.3);
  sound.startPulse(S.qDur);
  scheduleBots(i, S.qDur);
  onAnswersChanged();
  const arc = $('#timer-arc');
  const C = 131.95;
  const frame = () => {
    if (my !== S.seq || S.phase !== 'question') return;
    const left = Math.max(0, S.qDur - (Date.now() - S.qStart));
    const f = left / S.qDur;
    arc.style.strokeDashoffset = String(C * (1 - f));
    $('#timebar-fill').style.transform = `scaleX(${f})`;
    const secs = Math.ceil(left / 1000);
    $('#timer-num').textContent = secs;
    if (secs <= 5 && secs !== S.lastTick && secs > 0) {
      S.lastTick = secs;
      $('#timer').classList.add('urgent');
      sound.tick(true);
    }
    if (left <= 0) {
      closeQuestion();
      return;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

async function closeQuestion() {
  if (S.phase !== 'question' || S.closing) return;
  S.closing = true;
  S.phase = 'closed';
  const i = S.q;
  cancelBots();
  sound.stopPulse();
  sound.close();
  pushState({ phase: 'closed', q: i, qKey: qKey(i), total: total() });
  $('#q-status').textContent = 'Respuestas cerradas';
  $('#s-question').classList.add('closed');
  $('#timebar-fill').style.transform = 'scaleX(0)';
  await sleep(1300);
  if (S.q === i) showReveal(i);
}

async function showReveal(i) {
  const my = ++S.seq;
  const q = S.bank.questions[i];
  S.phase = 'reveal';
  const st = questionStats(q, i, players(), answers(), confs());
  pushState({
    phase: 'reveal', q: i, qKey: qKey(i), total: total(), domain: domainLabel(q), text: q.text, options: q.options,
    correct: q.correct, explanation: q.explanation || '', dist: st.dist, n: st.n, pct: st.pct,
  });
  const sec = $('#s-question');
  sec.classList.add('revealed');
  const opts = $$('.opt', sec);
  opts.forEach((el, k) => {
    const share = st.n ? st.dist[k] / st.n : 0;
    if (!OFFLINE()) {
      setTimeout(() => {
        $('.opt-fill', el).style.width = `${share * 100}%`;
      }, k * 120);
      $('.opt-pct', el).textContent = pct(share);
      $('.opt-n', el).textContent = `${st.dist[k]} ${st.dist[k] === 1 ? 'persona' : 'personas'}`;
    } else {
      $('.opt-stat', el).classList.add('hidden');
    }
    if (k === q.correct) {
      el.classList.add('correct');
      $('.opt-badge', el).insertAdjacentHTML('beforeend', '<svg class="opt-check" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    }
  });
  await sleep(1500);
  if (my !== S.seq) return;
  sec.classList.add('marked');
  sound.reveal();
  net.burst(10);
  await sleep(800);
  if (my !== S.seq) return;
  const confTotal = st.confDist.reduce((a, b) => a + b, 0);
  const confText = confTotal
    ? ` · Confianza: ${CONF_LABELS.map((l, k) => `${l.toLowerCase()} ${pct(st.confDist[k] / confTotal)}`).join(', ')}`
    : '';
  $('#debrief-stat').innerHTML = OFFLINE()
    ? 'La distribución del equipo aparecerá en el informe final'
    : st.n
      ? `<b>${pct(st.pct)}</b> del equipo acertó${esc(confText)}`
      : 'Nadie respondió esta pregunta';
  $('#debrief-text').textContent = q.explanation || '';
  $('#debrief').classList.add('show');
}

function afterReveal() {
  if (S.q < total() - 1) startChapter(S.q + 1);
  else if (OFFLINE()) showSync();
  else startReport();
}

// ── Sincronización por códigos (modo sin conexión) ───────────
async function showSync() {
  if (S.busy) return;
  ++S.seq;
  S.phase = 'sync';
  S.q = total();
  await wipe(() => {
    renderSyncCount();
    showScreen('sync');
    renderProgress();
    net.setOpacity(0.75);
    stageCenter({ rays: true });
  });
  sound.startPad();
}

function renderSyncCount() {
  const real = Object.keys(S.real.players).length;
  $('#sync-count').textContent = real;
  const bots = Object.keys(S.bots.players).length;
  $('#sync-msg').textContent = bots ? `Además, ${bots} participantes de ensayo ya están incluidos.` : '';
}

function addCodes(text) {
  const found = parseCodes(text);
  let added = 0;
  let dup = 0;
  let bad = 0;
  let otherBank = 0;
  const T = total();
  for (const { code, alias } of found) {
    let r;
    try {
      r = decodeResult(code, T);
    } catch {
      bad++;
      continue;
    }
    if (r.fp !== S.fp) {
      otherBank++;
      continue;
    }
    const id = `c:${code.toUpperCase().replace(/[^0-9A-Z]/g, '')}`;
    if (S.codes.has(id)) {
      dup++;
      continue;
    }
    S.codes.add(id);
    added++;
    const name = ANON ? 'Participante' : alias || `Participante ${String(++S.codeSeq).padStart(2, '0')}`;
    S.real.players[id] = { alias: name, joinedAt: Date.now(), code: true };
    r.answers.forEach((c, i) => {
      if (c == null) return;
      (S.real.answers[qKey(i)] ??= {})[id] = { c };
      if (r.confs[i] != null) (S.real.conf[qKey(i)] ??= {})[id] = r.confs[i];
    });
    // Efecto visual: el nodo se une a la red
    setTimeout(() => {
      net.addPlayer(name);
      sound.pop();
      const chip = document.createElement('span');
      chip.className = 'pchip';
      chip.textContent = name;
      $('#sync-chips').prepend(chip);
    }, added * 140);
  }
  renderSyncCount();
  const parts = [`${added} ${added === 1 ? 'código nuevo' : 'códigos nuevos'}`];
  if (dup) parts.push(`${dup} repetido${dup === 1 ? '' : 's'}`);
  if (bad) parts.push(`${bad} con error de captura`);
  if (otherBank) parts.push(`${otherBank} de otro banco de preguntas`);
  if (!found.length) parts.splice(0, parts.length, 'No se encontraron códigos SNP-… en el texto');
  toast(parts.join(' · '));
  return added;
}

function openPasteDialog() {
  const dlg = $('#paste-dialog');
  $('#paste-text').value = '';
  dlg.showModal();
  setTimeout(() => $('#paste-text').focus(), 50);
}

$('#paste-form').addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'ok') return;
  const added = addCodes($('#paste-text').value);
  // Si se agregan códigos durante el informe, se recalcula
  if (added && (S.screen === 'report1' || S.screen === 'report2')) refreshReport();
});
$('#btn-paste').addEventListener('click', openPasteDialog);
$('#btn-add-codes').addEventListener('click', openPasteDialog);
$('#btn-report').addEventListener('click', () => startReport());

function refreshReport() {
  const stats = computeStats(S.bank, players(), answers(), confs());
  S.stats = stats;
  renderReport(stats);
  $('#team-index').textContent = stats.teamIndex;
  setGauge(stats.teamIndex);
}

// ── Informe ──────────────────────────────────────────────────
const GAUGE_LEN = 603.19;
function setGauge(v) {
  $('#g-arc').style.strokeDashoffset = String(GAUGE_LEN * (1 - clamp(v, 0, 100) / 100));
}

function renderReport(stats) {
  const top = stats.strongest;
  const low = stats.weakest;
  $('#index-sub').innerHTML = stats.participants
    ? `${stats.participants} participantes. Fortaleza: <b>${esc(top?.label || '—')}</b>. Mayor oportunidad: <b>${esc(low?.label || '—')}</b>.`
    : 'Aún no hay respuestas para analizar.';
  $('#mini-stats').innerHTML = [
    [pct(stats.responseRate), 'tasa de respuesta'],
    [stats.hardest ? `P${stats.hardest.i + 1}` : '—', `más difícil${stats.hardest ? ` (${pct(stats.hardest.pct)})` : ''}`],
    [stats.easiest ? `P${stats.easiest.i + 1}` : '—', `más sencilla${stats.easiest ? ` (${pct(stats.easiest.pct)})` : ''}`],
    [stats.calib.total ? pct(stats.calib.falsa / stats.calib.total) : '—', 'falsa confianza'],
  ]
    .map(([b, s]) => `<div class="mini"><b>${b}</b><span>${s}</span></div>`)
    .join('');
  $('#radar').innerHTML = radarSvg(stats.domains.map((d) => ({ label: d.label, value: d.mastery })));
  $('#calib').innerHTML = calibrationHtml(stats.calib);
  $('#qbars').innerHTML = questionBarsSvg(stats.qs);
  $('#histo').innerHTML = histogramSvg(stats.histogram);
  $('#miscon').innerHTML = stats.misconceptions.length
    ? `<ul class="mlist">${stats.misconceptions
        .map((m) => `<li><span class="share">${pct(m.share)}</span><span class="mtext"><span class="q">P${m.i + 1} · eligió ${m.letter}</span>${esc(m.text)}</span></li>`)
        .join('')}</ul>`
    : '<p class="empty">No hubo una opción incorrecta dominante. Buena señal.</p>';
  $('#recos').innerHTML = stats.recommendations.length
    ? `<ul class="rlist">${stats.recommendations
        .slice(0, 3)
        .map((d) => `<li><b>${esc(d.label)}<span>${pct(d.mastery)}</span></b>${esc(d.recommendation)}</li>`)
        .join('')}</ul>`
    : '<p class="empty">Todas las áreas superan la meta del 70%. Siguiente paso: profundizar con casos avanzados.</p>';
}

async function startReport() {
  if (S.busy) return;
  ++S.seq;
  S.phase = 'report';
  S.q = total();
  const stats = computeStats(S.bank, players(), answers(), confs());
  S.stats = stats;
  pushState({
    phase: 'report', total: total(), teamIndex: stats.teamIndex,
    key: S.bank.questions.map((q) => q.correct),
    qdomains: S.bank.questions.map((q) => domainLabel(q)),
    recos: stats.domains.map((d) => ({ label: d.label, text: d.recommendation })),
  });
  sound.finale();
  $('#btn-add-codes').classList.toggle('hidden', !OFFLINE());
  await wipe(() => {
    renderReport(stats);
    $$('.report').forEach((r) => r.classList.remove('in'));
    showScreen('report1');
    renderProgress();
    net.setOpacity(0.22);
    stageCenter();
    setGauge(0);
  });
  await nextFrame();
  $('#s-report1').classList.add('in');
  countUp($('#team-index'), stats.teamIndex, { duration: 2400 });
  setTimeout(() => setGauge(stats.teamIndex), 60);
  sound.startPad();
}

async function showReport2() {
  if (S.busy) return;
  S.phase = 'report2';
  await wipe(() => showScreen('report2'));
  await nextFrame();
  $('#s-report2').classList.add('in');
}

// ── Créditos ─────────────────────────────────────────────────
async function showCredits() {
  if (S.busy) return;
  const my = ++S.seq;
  S.phase = 'credits';
  const all = Object.values(players());
  const names = ANON ? [] : all.map((p) => p.alias).filter(Boolean);
  const roll = $('#credits-roll');
  roll.innerHTML = `
    <div class="c-title">${esc(CONFIG.appName)}</div>
    <div class="c-kicker">${esc(CONFIG.subtitle)}</div>
    <div class="c-rule"></div>
    <div class="c-kicker">Con la participación de</div>
    ${names.length ? names.map((n) => `<div class="c-name">${esc(n)}</div>`).join('') : `<div class="c-name">${all.length} ingenieras e ingenieros</div>`}
    <div class="c-rule"></div>
    <div class="c-kicker">Diez preguntas · Cinco dominios · Un equipo</div>
  `;
  $('#credits-end').classList.remove('in');
  // Clave del dossier (modo sin conexión): permite a cada quien ver su resultado
  const keyBox = $('#dossier-key');
  keyBox.classList.toggle('hidden', !OFFLINE());
  if (OFFLINE()) {
    const key = encodeKey(S.bank.questions.map((q) => q.correct));
    $('#key-text').textContent = key;
    const url = participantUrl();
    if (url) {
      url.hash = `k=${key.replace(/-/g, '')}`;
      drawQr($('#key-qr'), url.href, 240);
    }
  }
  roll.style.transition = 'none';
  roll.style.transform = 'translateY(0)';
  sound.stopPad();
  await wipe(() => {
    showScreen('credits');
    net.setOpacity(0.45);
    stageCenter({ rays: true });
  });
  await nextFrame();
  const dist = roll.offsetHeight + STAGE_H;
  const secs = clamp(dist / 70, 10, 60);
  roll.style.transition = `transform ${secs}s linear`;
  roll.style.transform = `translateY(-${dist}px)`;
  sound.finale();
  await sleep(secs * 1000 - 1500);
  if (my !== S.seq) return;
  $('#credits-end').classList.add('in');
  net.burst(20);
}

function skipCredits() {
  ++S.seq;
  const roll = $('#credits-roll');
  roll.style.transition = 'opacity .6s';
  roll.style.opacity = '0';
  $('#credits-end').classList.add('in');
}

// ── Navegación ───────────────────────────────────────────────
function next() {
  if (S.busy) return;
  switch (S.screen) {
    case 'prologue':
      enterLobby();
      break;
    case 'lobby':
      startChapter(0);
      break;
    case 'chapter':
      startQuestion(S.q);
      break;
    case 'question':
      if (S.phase === 'question') closeQuestion();
      else if (S.phase === 'reveal') afterReveal();
      break;
    case 'sync':
      startReport();
      break;
    case 'report1':
      showReport2();
      break;
    case 'report2':
      showCredits();
      break;
    case 'credits':
      skipCredits();
      break;
  }
}

$('#btn-start').addEventListener('click', () => {
  sound.unlock();
  startChapter(0);
});
$('#btn-bots').addEventListener('click', () => addBots(24));
$('#btn-mute').addEventListener('click', toggleMute);
$('#btn-fs').addEventListener('click', toggleFs);

function toggleMute() {
  sound.unlock();
  const m = sound.toggleMute();
  $('#btn-mute').classList.toggle('muted-on', m);
  toast(m ? 'Sonido desactivado' : 'Sonido activado');
}

function toggleFs() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

window.addEventListener('keydown', (e) => {
  if (e.target?.matches?.('input, textarea, select') || $('#paste-dialog').open) return;
  if (['Space', 'ArrowRight', 'PageDown'].includes(e.code)) {
    if (S.screen === 'unlock') return;
    e.preventDefault();
    sound.unlock();
    next();
  } else if (e.key === 'm' || e.key === 'M') toggleMute();
  else if (e.key === 'f' || e.key === 'F') toggleFs();
  else if ((e.key === 'b' || e.key === 'B') && S.screen === 'lobby') addBots(24);
});

// ── Exportación y cierre ─────────────────────────────────────
function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}
function currentStats() {
  S.stats = computeStats(S.bank, players(), answers(), confs());
  return S.stats;
}
$('#exp-people').addEventListener('click', () => {
  download(`sinapsis-participantes-${stamp()}.csv`, csvParticipants(S.bank, currentStats(), { anonymous: ANON }), 'text/csv');
});
$('#exp-questions').addEventListener('click', () => {
  download(`sinapsis-preguntas-${stamp()}.csv`, csvQuestions(S.bank, currentStats()), 'text/csv');
});
$('#exp-json').addEventListener('click', () => {
  const raw = ANON ? undefined : { answers: answers(), confianza: confs() };
  download(`sinapsis-resultados-${stamp()}.json`, jsonExport(S.bank, currentStats(), raw, { anonymous: ANON }), 'application/json');
});
$('#btn-close-room').addEventListener('click', async () => {
  if (!confirm('¿Cerrar la sala y borrar los datos en tiempo real?\n\nExporta antes los resultados: después no se podrán recuperar.')) return;
  try {
    await S.transport.close();
    S.phase = 'closed-room';
    toast('Sala cerrada y datos en tiempo real eliminados');
  } catch (err) {
    toast(friendlyError(err));
  }
});

// La pantalla del anfitrión nunca debe desplazarse (p. ej. al enfocar un botón)
document.body.addEventListener('scroll', () => {
  document.body.scrollLeft = 0;
  document.body.scrollTop = 0;
});

const ready = initStatic();
