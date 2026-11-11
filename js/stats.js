// ─────────────────────────────────────────────────────────────
//  Estadísticas del equipo (sin ranking)
// ─────────────────────────────────────────────────────────────
import { LETTERS } from './util.js';

export const CONF_LABELS = ['Seguro', 'Dudando', 'Adiviné'];
export const MASTERY_GOAL = 0.7;

// Estadística de una sola pregunta (para la revelación en vivo)
export function questionStats(q, i, players, answers, conf) {
  const A = answers[`q${i}`] || {};
  const C = conf[`q${i}`] || {};
  const dist = [0, 0, 0, 0];
  const confDist = [0, 0, 0];
  let n = 0;
  for (const pid of Object.keys(players)) {
    const a = A[pid];
    if (!a || !(a.c >= 0 && a.c <= 3)) continue;
    n++;
    dist[a.c]++;
    if (C[pid] != null) confDist[C[pid]]++;
  }
  const correct = dist[q.correct];
  return { n, dist, confDist, correct, pct: n ? correct / n : 0 };
}

export function computeStats(bank, players, answers, conf) {
  const Q = bank.questions;
  const total = Q.length;
  const domainKeys = Object.keys(bank.domains).filter((d) => Q.some((q) => q.domain === d));
  const pids = Object.keys(players);

  const people = pids.map((pid) => ({
    id: pid,
    alias: players[pid]?.alias || 'Participante',
    bot: !!players[pid]?.bot,
    score: 0,
    answered: 0,
    picks: Array(total).fill(null),
    confs: Array(total).fill(null),
    byDomain: Object.fromEntries(domainKeys.map((d) => [d, { c: 0, t: 0 }])),
  }));
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));

  const qs = Q.map((q, i) => ({ i, domain: q.domain, n: 0, correct: 0, dist: [0, 0, 0, 0], confDist: [0, 0, 0], times: [] }));
  const calib = { dominio: 0, falsa: 0, fragil: 0, brecha: 0, total: 0 };

  Q.forEach((q, i) => {
    const key = `q${i}`;
    const A = answers[key] || {};
    const C = conf[key] || {};
    for (const p of people) {
      p.byDomain[q.domain].t++;
      const a = A[p.id];
      if (!a || !(a.c >= 0 && a.c <= 3)) continue;
      const ok = a.c === q.correct;
      const s = qs[i];
      s.n++;
      s.dist[a.c]++;
      if (typeof a.t === 'number') s.times.push(a.t);
      p.answered++;
      p.picks[i] = a.c;
      if (ok) {
        s.correct++;
        p.score++;
        p.byDomain[q.domain].c++;
      }
      const lvl = C[p.id];
      if (lvl === 0 || lvl === 1 || lvl === 2) {
        p.confs[i] = lvl;
        s.confDist[lvl]++;
        calib.total++;
        const sure = lvl === 0;
        if (sure && ok) calib.dominio++;
        else if (sure && !ok) calib.falsa++;
        else if (!sure && ok) calib.fragil++;
        else calib.brecha++;
      }
    }
  });

  const active = people.filter((p) => p.answered > 0);
  const nA = active.length;
  qs.forEach((s) => {
    s.pct = s.n ? s.correct / s.n : null;
    s.avgTime = s.times.length ? s.times.reduce((a, b) => a + b, 0) / s.times.length : null;
  });

  const teamIndex = nA ? Math.round((active.reduce((acc, p) => acc + p.score / total, 0) / nA) * 100) : 0;

  const domains = domainKeys.map((d) => {
    const qIdx = Q.map((q, i) => (q.domain === d ? i : -1)).filter((i) => i >= 0);
    const correct = qIdx.reduce((acc, i) => acc + qs[i].correct, 0);
    const possible = nA * qIdx.length;
    return {
      key: d,
      label: bank.domains[d].label || d,
      recommendation: bank.domains[d].recommendation || '',
      questions: qIdx.length,
      mastery: possible ? correct / possible : 0,
    };
  });

  const histogram = Array(total + 1).fill(0);
  active.forEach((p) => histogram[p.score]++);

  const misconceptions = [];
  qs.forEach((s, i) => {
    if (!s.n) return;
    s.dist.forEach((count, opt) => {
      if (opt === Q[i].correct || !count) return;
      const share = count / s.n;
      if (share >= 0.2) misconceptions.push({ i, opt, letter: LETTERS[opt], text: Q[i].options[opt], share, count });
    });
  });
  misconceptions.sort((a, b) => b.share - a.share);

  const recommendations = domains
    .filter((d) => d.mastery < MASTERY_GOAL)
    .sort((a, b) => a.mastery - b.mastery);

  const answeredQs = qs.filter((s) => s.n > 0);
  const hardest = answeredQs.length ? answeredQs.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;
  const easiest = answeredQs.length ? answeredQs.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  const responses = qs.reduce((acc, s) => acc + s.n, 0);
  const responseRate = nA ? responses / (nA * total) : 0;
  const strongest = domains.length ? domains.reduce((a, b) => (b.mastery > a.mastery ? b : a)) : null;
  const weakest = domains.length ? domains.reduce((a, b) => (b.mastery < a.mastery ? b : a)) : null;

  return {
    total, people, active, participants: nA, teamIndex, qs, domains, histogram, calib,
    misconceptions: misconceptions.slice(0, 3), recommendations, hardest, easiest, responseRate,
    strongest, weakest, generatedAt: new Date().toISOString(),
  };
}

// ── Exportación ──────────────────────────────────────────────
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(rows) {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function csvParticipants(bank, stats, { anonymous = false } = {}) {
  const Q = bank.questions;
  const head = ['participante', 'puntaje', 'porcentaje', 'respondidas'];
  stats.domains.forEach((d) => head.push(`% ${d.label}`));
  Q.forEach((_, i) => head.push(`P${i + 1} respuesta`, `P${i + 1} correcta`, `P${i + 1} confianza`));
  head.push('seguro_y_correcto', 'seguro_e_incorrecto');
  const rows = [head];
  stats.people.forEach((p, k) => {
    const name = anonymous ? `Participante ${String(k + 1).padStart(2, '0')}` : p.alias + (p.bot ? ' (ensayo)' : '');
    const row = [name, p.score, Math.round((p.score / stats.total) * 100), p.answered];
    stats.domains.forEach((d) => {
      const b = p.byDomain[d.key];
      row.push(b.t ? Math.round((b.c / b.t) * 100) : '');
    });
    let sureOk = 0;
    let sureBad = 0;
    Q.forEach((q, i) => {
      const c = p.picks[i];
      const lvl = p.confs[i];
      row.push(c == null ? '' : LETTERS[c], c == null ? '' : c === q.correct ? 'sí' : 'no', lvl == null ? '' : CONF_LABELS[lvl]);
      if (lvl === 0 && c != null) c === q.correct ? sureOk++ : sureBad++;
    });
    row.push(sureOk, sureBad);
    rows.push(row);
  });
  return toCsv(rows);
}

export function csvQuestions(bank, stats) {
  const rows = [['pregunta', 'dominio', 'texto', 'respuestas', '% acierto', 'A', 'B', 'C', 'D', 'correcta', 'seguro', 'dudando', 'adiviné', 'tiempo promedio (s)']];
  stats.qs.forEach((s, i) => {
    const q = bank.questions[i];
    rows.push([
      `P${i + 1}`, bank.domains[q.domain]?.label || q.domain, q.text, s.n,
      s.pct == null ? '' : Math.round(s.pct * 100), ...s.dist, LETTERS[q.correct], ...s.confDist,
      s.avgTime == null ? '' : (s.avgTime / 1000).toFixed(1),
    ]);
  });
  return toCsv(rows);
}

export function jsonExport(bank, stats, raw, { anonymous = false } = {}) {
  const people = stats.people.map((p, k) => ({
    participante: anonymous ? `Participante ${String(k + 1).padStart(2, '0')}` : p.alias,
    ensayo: p.bot || undefined,
    puntaje: p.score,
    respondidas: p.answered,
    respuestas: p.picks.map((c) => (c == null ? null : LETTERS[c])),
    confianza: p.confs.map((l) => (l == null ? null : CONF_LABELS[l])),
  }));
  return JSON.stringify(
    {
      app: 'SINAPSIS',
      banco: bank.title,
      version: bank.version,
      generado: stats.generatedAt,
      indiceEquipo: stats.teamIndex,
      participantes: stats.participants,
      dominios: stats.domains.map((d) => ({ dominio: d.label, dominio_pct: Math.round(d.mastery * 100) })),
      calibracion: stats.calib,
      preguntas: stats.qs.map((s, i) => ({
        pregunta: i + 1,
        texto: bank.questions[i].text,
        respuestas: s.n,
        acierto_pct: s.pct == null ? null : Math.round(s.pct * 100),
        distribucion: Object.fromEntries(LETTERS.map((l, k) => [l, s.dist[k]])),
        correcta: LETTERS[bank.questions[i].correct],
      })),
      personas: people,
      sesion: raw,
    },
    null,
    2,
  );
}
