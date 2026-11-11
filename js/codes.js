// ─────────────────────────────────────────────────────────────
//  Códigos de resultados y clave del dossier (modo sin conexión)
//
//  · Código de resultados (participante → anfitrión): SNP-XXXX-XXXX-XXXX-XX
//    Contiene respuestas + confianza + huella del banco + número aleatorio.
//  · Clave del dossier (anfitrión → participantes): p. ej. DACB-CDBC-AB7
//    Son las respuestas correctas + dígito de control; se muestra al final.
// ─────────────────────────────────────────────────────────────
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford (sin I, L, O, U)
const LET = ['A', 'B', 'C', 'D'];

// Huella del banco (0–255): detecta códigos generados con otro banco
export function fingerprint(questions) {
  const s = JSON.stringify(questions.map((q) => [q.text, q.options, q.correct]));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h & 0xff;
}

function toB32(n) {
  let s = '';
  do {
    s = B32[Number(n % 32n)] + s;
    n /= 32n;
  } while (n > 0n);
  return s;
}

function fromB32(s) {
  let n = 0n;
  for (const ch of s) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error('caracter');
    n = n * 32n + BigInt(v);
  }
  return n;
}

function checkChar(s) {
  let a = 0;
  for (let i = 0; i < s.length; i++) a = (a + (i + 1) * B32.indexOf(s[i])) % 32;
  return B32[a];
}

const normalize = (s) =>
  String(s || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');

// answers[i]: 0–3 o null · confs[i]: 0–2 o null
export function encodeResult(answers, confs, fp, nonce = Math.floor(Math.random() * 1024)) {
  let n = 0n;
  for (let i = answers.length - 1; i >= 0; i--) {
    const a = answers[i] == null ? 4 : answers[i];
    const c = confs[i] == null ? 3 : confs[i];
    n = n * 20n + BigInt(a * 4 + c);
  }
  n = (n * 256n + BigInt(fp & 0xff)) * 1024n + BigInt(nonce & 1023);
  const body = toB32(n);
  const full = body + checkChar(body);
  return 'SNP-' + full.match(/.{1,4}/g).join('-');
}

export function decodeResult(code, total) {
  let s = normalize(code);
  if (s.startsWith('SNP')) s = s.slice(3);
  if (s.length < 3) throw new Error('Código incompleto');
  const body = s.slice(0, -1);
  if (checkChar(body) !== s.slice(-1)) throw new Error('Código con error de captura');
  let n = fromB32(body);
  const nonce = Number(n % 1024n);
  n /= 1024n;
  const fp = Number(n % 256n);
  n /= 256n;
  const answers = [];
  const confs = [];
  for (let i = 0; i < total; i++) {
    const v = Number(n % 20n);
    n /= 20n;
    const a = Math.floor(v / 4);
    const c = v % 4;
    answers.push(a === 4 ? null : a);
    confs.push(c === 3 ? null : c);
  }
  if (n !== 0n) throw new Error('El código no corresponde a este banco de preguntas');
  return { answers, confs, fp, nonce };
}

// Extrae códigos de un texto pegado del chat. Formato sugerido:
// "SINAPSIS · Nodo Prisma 42 · SNP-7K2Q-M9XA-3F0D-1A"
export function parseCodes(text) {
  const out = [];
  const re = /SNP(?:-?[0-9A-Za-z]){4,}/gi;
  for (const line of String(text || '').split(/\r?\n/)) {
    for (const m of line.matchAll(re)) {
      const code = m[0];
      const before = line.slice(0, m.index);
      const am = /SINAPSIS\s*[·•|:\-–]\s*(.{1,40}?)\s*[·•|:\-–]\s*$/i.exec(before);
      out.push({ code, alias: am ? am[1].trim() : null });
    }
  }
  return out;
}

// Clave del dossier
export function encodeKey(correct) {
  const letters = correct.map((c) => LET[c]).join('');
  const chk = correct.reduce((acc, c, i) => acc + (i + 1) * (c + 1), 0) % 10;
  const groups = letters.match(/.{1,4}/g).join('-');
  return `${groups}${chk}`;
}

export function decodeKey(str, total) {
  const s = normalize(str);
  const letters = s.slice(0, total);
  const chk = s.slice(total);
  if (letters.length !== total || !/^[A-D]+$/.test(letters) || !/^\d$/.test(chk)) throw new Error('Clave incompleta');
  const correct = [...letters].map((l) => LET.indexOf(l));
  const expect = correct.reduce((acc, c, i) => acc + (i + 1) * (c + 1), 0) % 10;
  if (String(expect) !== chk) throw new Error('Clave con error de captura');
  return correct;
}
