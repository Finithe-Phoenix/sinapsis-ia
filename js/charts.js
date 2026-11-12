// ─────────────────────────────────────────────────────────────
//  Gráficas SVG del informe (tema claro corporativo)
// ─────────────────────────────────────────────────────────────
import { esc } from './util.js';

const RED = '#DB0011';
const INK = '#1A1A1A';
const GRAY = '#575757';
const LINE = '#D7D8D6';
const LINE2 = '#E9E9E9';
const BAR = '#BDBDBD';

// Radar por dominio: items = [{label, value 0..1}]
export function radarSvg(items) {
  const W = 560;
  const H = 480;
  const cx = W / 2;
  const cy = H / 2 + 14;
  const R = 168;
  const n = Math.max(items.length, 3);
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, r) => [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r];
  let g = '';
  [0.25, 0.5, 0.75, 1].forEach((f) => {
    const pts = items.map((_, i) => pt(i, R * f).map((v) => v.toFixed(1)).join(',')).join(' ');
    g += `<polygon points="${pts}" fill="none" stroke="${f === 1 ? LINE : LINE2}" stroke-width="1"/>`;
  });
  // Meta 70%
  const goal = items.map((_, i) => pt(i, R * 0.7).map((v) => v.toFixed(1)).join(',')).join(' ');
  g += `<polygon points="${goal}" fill="none" stroke="${GRAY}" stroke-width="1" stroke-dasharray="3 4" opacity="0.6"/>`;
  items.forEach((_, i) => {
    const [x, y] = pt(i, R);
    g += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${LINE2}"/>`;
  });
  const shape = items.map((it, i) => pt(i, R * Math.max(0.02, it.value)).map((v) => v.toFixed(1)).join(',')).join(' ');
  let shapeG = `<polygon points="${shape}" fill="rgba(219,0,17,0.12)" stroke="${RED}" stroke-width="2.5" stroke-linejoin="round"/>`;
  items.forEach((it, i) => {
    const [x, y] = pt(i, R * Math.max(0.02, it.value));
    shapeG += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#fff" stroke="${RED}" stroke-width="2.5"/>`;
  });
  let labels = '';
  // Etiquetas largas en dos líneas
  const split = (s) => {
    if (s.length <= 10 || !s.includes(' ')) return [s];
    const mid = s.length / 2;
    let best = -1;
    for (let k = 0; k < s.length; k++) if (s[k] === ' ' && (best < 0 || Math.abs(k - mid) < Math.abs(best - mid))) best = k;
    return [s.slice(0, best), s.slice(best + 1)];
  };
  items.forEach((it, i) => {
    const [x, y] = pt(i, R + 22);
    const cos = Math.cos(ang(i));
    const sin = Math.sin(ang(i));
    const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
    const lines = split(it.label);
    const blockH = lines.length * 21 + 24;
    const top = sin < -0.5 ? y - blockH + 14 : sin > 0.5 ? y + 6 : y - blockH / 2 + 14;
    lines.forEach((ln, k) => {
      labels += `<text x="${x.toFixed(1)}" y="${(top + k * 21).toFixed(1)}" text-anchor="${anchor}" font-size="18" fill="${INK}" font-weight="600" font-family="Inter Tight, Inter, sans-serif">${esc(ln)}</text>`;
    });
    labels += `<text x="${x.toFixed(1)}" y="${(top + lines.length * 21 + 4).toFixed(1)}" text-anchor="${anchor}" font-size="19" font-weight="700" fill="${it.value < 0.7 ? RED : INK}" font-family="Inter Tight, Inter, sans-serif">${Math.round(it.value * 100)}%</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Dominio por área">${g}<g class="radar-shape">${shapeG}</g>${labels}</svg>`;
}

// Barras verticales de % de acierto por pregunta
export function questionBarsSvg(qs, { goal = 0.7 } = {}) {
  const W = 900;
  const H = 215;
  const pl = 44;
  const pr = 10;
  const pt = 30;
  const pb = 34;
  const iw = W - pl - pr;
  const ih = H - pt - pb;
  const n = qs.length;
  const slot = iw / n;
  const bw = Math.min(56, slot * 0.58);
  const answered = qs.filter((q) => q.pct != null);
  const minPct = answered.length ? Math.min(...answered.map((q) => q.pct)) : null;
  let g = '';
  [0, 0.5, 1].forEach((f) => {
    const y = pt + ih * (1 - f);
    g += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="${LINE2}"/>`;
    g += `<text x="${pl - 10}" y="${y + 4}" text-anchor="end" font-size="15" fill="${GRAY}" font-family="JetBrains Mono, monospace">${Math.round(f * 100)}</text>`;
  });
  const gy = pt + ih * (1 - goal);
  qs.forEach((q, i) => {
    const x = pl + slot * i + (slot - bw) / 2;
    const v = q.pct ?? 0;
    const h = Math.max(2, ih * v);
    const y = pt + ih - h;
    const hardest = q.pct != null && q.pct === minPct;
    const fill = hardest ? RED : v >= goal ? INK : BAR;
    g += `<rect class="bar" style="transition-delay:${i * 70}ms" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}"/>`;
    g += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="middle" font-size="18" font-weight="700" fill="${hardest ? RED : INK}" font-family="Inter Tight, Inter, sans-serif">${q.pct == null ? '—' : Math.round(v * 100) + '%'}</text>`;
    g += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="16" fill="${GRAY}">P${i + 1}</text>`;
  });
  g += `<line x1="${pl}" x2="${W - pr}" y1="${gy}" y2="${gy}" stroke="${RED}" stroke-width="1.2" stroke-dasharray="5 5" opacity="0.7"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Acierto por pregunta">${g}</svg>`;
}

// Histograma de puntajes (0..total)
export function histogramSvg(hist) {
  const W = 420;
  const H = 260;
  const pl = 14;
  const pr = 14;
  const pt = 30;
  const pb = 34;
  const iw = W - pl - pr;
  const ih = H - pt - pb;
  const n = hist.length;
  const slot = iw / n;
  const bw = slot * 0.7;
  const max = Math.max(1, ...hist);
  const mode = hist.indexOf(Math.max(...hist));
  let g = `<line x1="${pl}" x2="${W - pr}" y1="${pt + ih}" y2="${pt + ih}" stroke="${LINE}"/>`;
  hist.forEach((c, i) => {
    const x = pl + slot * i + (slot - bw) / 2;
    const h = c ? Math.max(3, (ih * c) / max) : 0;
    const y = pt + ih - h;
    const isMode = c > 0 && i === mode;
    if (h) g += `<rect class="bar" style="transition-delay:${i * 50}ms" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${isMode ? RED : BAR}"/>`;
    if (c) g += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 7).toFixed(1)}" text-anchor="middle" font-size="17" font-weight="700" fill="${isMode ? RED : INK}" font-family="Inter Tight, Inter, sans-serif">${c}</text>`;
    g += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="15" fill="${GRAY}">${i}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Distribución de puntajes">${g}</svg>`;
}

// Matriz de calibración (HTML)
export function calibrationHtml(c) {
  if (!c.total) return '<p class="empty">Sin datos de confianza todavía.</p>';
  const p = (v) => Math.round((v / c.total) * 100);
  const tile = (cls, title, val, desc) =>
    `<div class="ctile ${cls}"><span class="t">${title}</span><b>${p(val)}%</b><span class="d">${desc} (${val})</span></div>`;
  return `<div class="calib">
    <span></span><span class="ax">Correcto</span><span class="ax">Incorrecto</span>
    <span class="ax row">Seguro</span>
    ${tile('good', 'Seguros y correctos', c.dominio, 'Conocimiento sólido')}
    ${tile('alert', 'Seguros e incorrectos', c.falsa, 'Requiere atención')}
    <span class="ax row">Con dudas</span>
    ${tile('', 'Con dudas y correctos', c.fragil, 'Por afianzar')}
    ${tile('', 'Con dudas e incorrectos', c.brecha, 'Por reforzar')}
  </div>`;
}
