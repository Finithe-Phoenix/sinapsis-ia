// ─────────────────────────────────────────────────────────────
//  Genera archivos HTML AUTÓNOMOS (un solo archivo cada uno) en dist/:
//    · dist/sinapsis-anfitrion.html    → consola del anfitrión (banco cifrado incluido)
//    · dist/sinapsis-participante.html → página del participante (sin respuestas)
//
//  Se abren con doble clic, sin servidor y sin internet (modo códigos).
//  Puedes compartir el del participante por chat o correo.
//
//  Uso: node tools/empaquetar.mjs
//  (Ejecútalo de nuevo cada vez que cambies config.js, el banco o el código.)
// ─────────────────────────────────────────────────────────────
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFile(resolve(root, p), 'utf8');

// Convierte un módulo ES en un bloque con su propio ámbito
function wrapModule(name, src) {
  const exported = [];
  let out = src.replace(/^import\s*\{([^}]+)\}\s*from\s*'\.\/([\w-]+)\.js';\s*$/gm, (_, names, mod) => {
    const list = names
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => n.replace(/\s+as\s+/, ': '));
    return `const { ${list.join(', ')} } = __m['${mod}'];`;
  });
  if (/^\s*import\s/m.test(out)) throw new Error(`Import no soportado en ${name}.js`);
  out = out.replace(/^export\s+(async\s+function|function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm, (_, kw, id) => {
    exported.push(id);
    return `${kw} ${id}`;
  });
  return `__m['${name}'] = (() => {\n${out}\nreturn { ${exported.join(', ')} };\n})();\n`;
}

async function bundle(modules) {
  let js = 'const __m = {};\n';
  for (const m of modules) js += wrapModule(m, await rd(`js/${m}.js`));
  return js.replace(/<\/script/gi, '<\\/script');
}

async function build(page, modules, globals, outName) {
  let html = await rd(page);
  // CSS en línea
  html = await replaceAsync(html, /<link rel="stylesheet" href="(css\/[\w-]+\.css)" \/>/g, async (_, href) => `<style>\n${await rd(href)}\n</style>`);
  // JS en línea
  const js = await bundle(modules);
  const data = Object.entries(globals)
    .map(([k, v]) => `window.${k} = ${JSON.stringify(v)};`)
    .join('\n');
  html = html.replace(/<script type="module" src="js\/[\w-]+\.js"><\/script>/, () => `<script>\n${data}\n(() => {\n${js}\n})();\n</script>`);
  await mkdir(resolve(root, 'dist'), { recursive: true });
  await writeFile(resolve(root, 'dist', outName), html, 'utf8');
  console.log(`✔ dist/${outName}  (${Math.round(html.length / 1024)} KB)`);
}

async function replaceAsync(str, re, fn) {
  const parts = [];
  let last = 0;
  for (const m of str.matchAll(re)) {
    parts.push(str.slice(last, m.index), await fn(...m));
    last = m.index + m[0].length;
  }
  parts.push(str.slice(last));
  return parts.join('');
}

const banco = JSON.parse(await rd('data/banco.enc.json'));
const publico = JSON.parse(await rd('data/publico.json'));

await build(
  'host.html',
  ['config', 'util', 'crypto', 'codes', 'stats', 'charts', 'network', 'audio', 'transport', 'host'],
  { SINAPSIS_BANCO: banco, SINAPSIS_PUBLICO: publico },
  'sinapsis-anfitrion.html',
);
await build('play.html', ['config', 'util', 'codes', 'transport', 'play'], { SINAPSIS_PUBLICO: publico }, 'sinapsis-participante.html');
console.log('\nListo. Comparte dist/sinapsis-participante.html por chat; abre dist/sinapsis-anfitrion.html en la laptop que proyecta.');
