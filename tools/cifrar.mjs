// Cifra el banco de preguntas para publicarlo sin exponer las respuestas.
//
// Uso:
//   node tools/cifrar.mjs                       → cifra privado/banco.json en data/banco.enc.json
//   node tools/cifrar.mjs entrada.json salida.json
//
// La clave se toma, en este orden, de:
//   1) la variable de entorno SINAPSIS_CLAVE
//   2) el archivo privado/clave.txt
//   3) si no existe ninguna, se genera una nueva y se guarda en privado/clave.txt
//
// La carpeta privado/ está en .gitignore: nunca se sube a GitHub.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encryptBank, decryptBank, validateBank } from '../js/crypto.js';
import { fingerprint } from '../js/codes.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = resolve(root, process.argv[2] || 'privado/banco.json');
const output = resolve(root, process.argv[3] || 'data/banco.enc.json');
const keyFile = resolve(root, 'privado/clave.txt');

const WORDS = ['neurona', 'vector', 'tensor', 'kernel', 'prisma', 'cobalto', 'austral', 'sinapsis', 'delta', 'sigma', 'lumen', 'orbita', 'cuarzo', 'nodo', 'pulso', 'faro'];
function newPassphrase() {
  const r = new Uint32Array(5);
  globalThis.crypto.getRandomValues(r);
  const w = Array.from(r.slice(0, 4), (n) => WORDS[n % WORDS.length]);
  return `${w.join('-')}-${10 + (r[4] % 90)}`;
}

export function publicData(bank) {
  const used = [...new Set(bank.questions.map((q) => q.domain))];
  return {
    app: 'sinapsis',
    title: bank.title || 'SINAPSIS',
    fp: fingerprint(bank.questions),
    total: bank.questions.length,
    qdomains: bank.questions.map((q) => bank.domains[q.domain]?.label || q.domain),
    recos: used.map((d) => ({ label: bank.domains[d]?.label || d, text: bank.domains[d]?.recommendation || '' })),
  };
}

let pass = process.env.SINAPSIS_CLAVE;
let created = false;
if (!pass && existsSync(keyFile)) pass = (await readFile(keyFile, 'utf8')).trim();
if (!pass) {
  pass = newPassphrase();
  await mkdir(dirname(keyFile), { recursive: true });
  await writeFile(keyFile, pass + '\n', 'utf8');
  created = true;
}

const bank = JSON.parse(await readFile(input, 'utf8'));
const problems = validateBank(bank);
if (problems.length) {
  console.error('El banco tiene problemas:\n - ' + problems.join('\n - '));
  process.exit(1);
}

const payload = await encryptBank(bank, pass);
// Comprobación de ida y vuelta
const back = await decryptBank(payload, pass);
if (back.questions.length !== bank.questions.length) throw new Error('Falló la verificación del cifrado.');

await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(payload, null, 2) + '\n', 'utf8');

// Datos públicos (SIN respuestas) para el dossier del participante en modo sin conexión
const publico = publicData(bank);
const publicFile = resolve(dirname(output), 'publico.json');
await writeFile(publicFile, JSON.stringify(publico, null, 2) + '\n', 'utf8');

console.log(`✔ Banco cifrado: ${bank.questions.length} preguntas → ${output}`);
console.log(`✔ Datos públicos (sin respuestas) → ${publicFile}`);
console.log(created ? `✔ Clave nueva guardada en ${keyFile}` : `✔ Clave tomada de ${process.env.SINAPSIS_CLAVE ? 'SINAPSIS_CLAVE' : keyFile}`);
