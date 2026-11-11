// Utilidades compartidas
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const LETTERS = ['A', 'B', 'C', 'D'];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const pct = (v) => `${Math.round((v || 0) * 100)}%`;

// Formas de las opciones (A ▲, B ◆, C ●, D ■) — se distinguen por forma, no solo por color
export function shapeSvg(i, size = 24) {
  const s = size;
  const shapes = [
    `<polygon points="12,3 22,21 2,21" />`,
    `<polygon points="12,2 22,12 12,22 2,12" />`,
    `<circle cx="12" cy="12" r="9.5" />`,
    `<rect x="3" y="3" width="18" height="18" rx="1.5" />`,
  ];
  return `<svg class="shape shape-${i}" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">${shapes[i]}</svg>`;
}

export function genPin() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(100000 + (a[0] % 900000));
}

export function uid() {
  const a = new Uint8Array(10);
  crypto.getRandomValues(a);
  return 'u' + Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

const ALIAS_A = ['Nodo', 'Vector', 'Tensor', 'Kernel', 'Neurona', 'Token', 'Agente', 'Prompt', 'Sinapsis', 'Módulo', 'Cluster', 'Píxel'];
const ALIAS_B = ['Rojo', 'Ágil', 'Norte', 'Alfa', 'Delta', 'Sigma', 'Lúcido', 'Veloz', 'Sereno', 'Prisma', 'Cobalto', 'Austral'];
export function randomAlias() {
  const r = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return `${r(ALIAS_A)} ${r(ALIAS_B)} ${Math.floor(10 + Math.random() * 90)}`;
}

export function download(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Almacenamiento seguro (puede fallar en modo privado)
export const store = {
  get(key, fallback = null) {
    try {
      const v = sessionStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
  del(key) {
    try {
      sessionStorage.removeItem(key);
    } catch {}
  },
};

// Animación de conteo numérico
export function countUp(el, to, { duration = 1800, suffix = '' } = {}) {
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 4);
  return new Promise((resolve) => {
    function frame(now) {
      const t = clamp((now - start) / duration, 0, 1);
      el.textContent = Math.round(to * ease(t)) + suffix;
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

// Revela líneas de texto con máscara (requiere .mask > span)
export function maskText(text) {
  return `<span class="mask"><span>${esc(text)}</span></span>`;
}

export function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}
