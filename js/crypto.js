// Cifrado del banco de preguntas (AES-GCM 256 + PBKDF2-SHA256)
// Funciona en el navegador (Web Crypto) y en Node 18+ (globalThis.crypto).
const ITERATIONS = 250000;
const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function fromB64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase, salt, iterations) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Este navegador no permite cifrado aquí. Abre la página con https:// o desde localhost.');
  const base = await subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptBank(bank, passphrase) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const data = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(bank)));
  return {
    v: 1,
    app: 'sinapsis',
    alg: 'AES-GCM-256',
    kdf: 'PBKDF2-SHA256',
    iter: ITERATIONS,
    salt: toB64(salt),
    iv: toB64(iv),
    data: toB64(new Uint8Array(data)),
  };
}

export async function decryptBank(payload, passphrase) {
  if (!payload || payload.app !== 'sinapsis' || !payload.data) throw new Error('El archivo no es un banco cifrado de SINAPSIS.');
  const key = await deriveKey(passphrase, fromB64(payload.salt), payload.iter || ITERATIONS);
  try {
    const plain = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(payload.iv) }, key, fromB64(payload.data));
    return JSON.parse(dec.decode(plain));
  } catch {
    throw new Error('Clave incorrecta.');
  }
}

// Valida la estructura del banco y devuelve una lista de problemas (vacía = OK)
export function validateBank(bank) {
  const problems = [];
  if (!bank || typeof bank !== 'object') return ['El banco no es un objeto JSON.'];
  if (!bank.domains || typeof bank.domains !== 'object') problems.push('Falta "domains".');
  if (!Array.isArray(bank.questions) || bank.questions.length === 0) problems.push('Falta la lista "questions".');
  (bank.questions || []).forEach((q, i) => {
    const n = i + 1;
    if (!q.text) problems.push(`Pregunta ${n}: falta "text".`);
    if (!Array.isArray(q.options) || q.options.length !== 4) problems.push(`Pregunta ${n}: "options" debe tener 4 opciones.`);
    if (!(Number.isInteger(q.correct) && q.correct >= 0 && q.correct <= 3)) problems.push(`Pregunta ${n}: "correct" debe ser 0, 1, 2 o 3.`);
    if (!bank.domains?.[q.domain]) problems.push(`Pregunta ${n}: el dominio "${q.domain}" no existe en "domains".`);
  });
  return problems;
}
