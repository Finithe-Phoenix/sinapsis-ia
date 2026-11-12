// ─────────────────────────────────────────────────────────────
//  Servidor local de SINAPSIS (sin dependencias, sin internet)
//
//  Sirve la app, retransmite los mensajes en tiempo real entre la
//  pantalla del anfitrión y los dispositivos de la misma red, y guarda
//  la sesión y los resultados en la carpeta resultados/.
//
//  Uso:   node tools/servidor.mjs          (puerto 8080)
//         node tools/servidor.mjs 3000     (otro puerto)
// ─────────────────────────────────────────────────────────────
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile, rename, readdir } from 'node:fs/promises';
import { networkInterfaces, hostname } from 'node:os';
import { extname, join, normalize, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// IPs de la laptop en la red local, priorizando Wi-Fi/Ethernet sobre adaptadores virtuales
const VIRTUAL = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|Docker|Loopback|vbox|virbr|Npcap|ZeroTier|Tailscale/i;
const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2);
const lanIps = () => {
  const all = Object.entries(networkInterfaces()).flatMap(([name, list]) =>
    (list || []).filter((i) => i.family === 'IPv4' && !i.internal).map((i) => ({ name, ip: i.address })),
  );
  const real = all.filter((x) => !VIRTUAL.test(x.name));
  return (real.length ? real : all).map((x) => x.ip).sort((a, b) => rank(a) - rank(b));
};

// ── Guardado en disco (resultados/) ──────────────────────────
const resultsDir = join(root, 'resultados');
const sessionFiles = new Map(); // PIN → nombre base del archivo de la sesión
const pad = (n) => String(n).padStart(2, '0');
function stamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
function baseFor(pin) {
  if (!sessionFiles.has(pin)) sessionFiles.set(pin, `sesion-${stamp()}-${pin}`);
  return sessionFiles.get(pin);
}
// Escritura atómica: primero a un temporal y luego se renombra
async function writeSafe(file, text) {
  await mkdir(resultsDir, { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, file);
}
// Sesión más reciente que no se haya cerrado (para reanudar)
async function latestOpenSession() {
  let files = [];
  try {
    files = (await readdir(resultsDir)).filter((f) => /^sesion-\d{8}-\d{4}-\d{6}\.json$/.test(f));
  } catch {
    return null;
  }
  let best = null;
  for (const f of files) {
    const info = await stat(join(resultsDir, f));
    if (!best || info.mtimeMs > best.mtime) best = { f, mtime: info.mtimeMs };
  }
  if (!best || Date.now() - best.mtime > 24 * 3600 * 1000) return null;
  const data = JSON.parse(await readFile(join(resultsDir, best.f), 'utf8'));
  if (data.phase === 'ended') return null;
  sessionFiles.set(data.pin, best.f.replace(/\.json$/, ''));
  return data;
}

// ── Retransmisión en tiempo real (Server-Sent Events) ────────
const clients = new Set();
const send = (c, text) => c.res.write(`data: ${text}\n\n`);
setInterval(() => {
  for (const c of clients) c.res.write(': ping\n\n');
}, 20000);

function readBody(req, limit = 32 * 1024) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (ch) => {
      size += ch.length;
      if (size > limit) {
        reject(new Error('too-big'));
        req.destroy();
      } else chunks.push(ch);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function api(req, res, url) {
  const role = url.searchParams.get('role') === 'host' ? 'host' : 'player';
  if (url.pathname === '/api/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ app: 'sinapsis', ips: lanIps(), host: hostname(), port }));
    return;
  }
  if (url.pathname === '/api/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    const c = { res, role };
    clients.add(c);
    req.on('close', () => clients.delete(c));
    return;
  }
  if (url.pathname === '/api/send' && req.method === 'POST') {
    try {
      const msg = JSON.parse(await readBody(req));
      const text = JSON.stringify(msg);
      // Anfitrión → todos · Participante → solo anfitriones
      for (const c of clients) if (role === 'host' || c.role === 'host') send(c, text);
      res.writeHead(204).end();
    } catch {
      res.writeHead(400).end();
    }
    return;
  }

  // ── Guardado: solo desde esta laptop (la consola del anfitrión) ──
  if (['/api/save', '/api/session', '/api/export'].includes(url.pathname)) {
    const ip = req.socket.remoteAddress || '';
    if (!/^(127\.|::1$|::ffff:127\.)/.test(ip)) {
      res.writeHead(403).end();
      return;
    }
  }
  if (url.pathname === '/api/session' && req.method === 'GET') {
    try {
      const data = await latestOpenSession();
      if (!data) return res.writeHead(204).end();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    } catch {
      res.writeHead(204).end();
    }
    return;
  }
  if (url.pathname === '/api/save' && req.method === 'POST') {
    try {
      const data = JSON.parse(await readBody(req, 2 * 1024 * 1024));
      if (!/^\d{6}$/.test(String(data.pin))) throw new Error('pin');
      data.savedAt = new Date().toISOString();
      await writeSafe(join(resultsDir, `${baseFor(data.pin)}.json`), JSON.stringify(data, null, 2));
      res.writeHead(204).end();
    } catch {
      res.writeHead(400).end();
    }
    return;
  }
  if (url.pathname === '/api/export' && req.method === 'POST') {
    try {
      const { pin, kind, content } = JSON.parse(await readBody(req, 4 * 1024 * 1024));
      const names = { participantes: 'participantes.csv', preguntas: 'preguntas.csv', resultados: 'resultados.json' };
      if (!/^\d{6}$/.test(String(pin)) || !names[kind] || typeof content !== 'string') throw new Error('bad');
      await writeSafe(join(resultsDir, `${baseFor(pin)}-${names[kind]}`), content);
      res.writeHead(204).end();
    } catch {
      res.writeHead(400).end();
    }
    return;
  }
  res.writeHead(404).end();
}

// ── Archivos estáticos ───────────────────────────────────────
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return api(req, res, url);
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    // Bloquea salir de la carpeta, las carpetas privada y de resultados, y archivos ocultos
    if (
      !file.startsWith(root + sep) ||
      file.startsWith(join(root, 'privado') + sep) ||
      file.startsWith(resultsDir + sep) ||
      file.includes(`${sep}.`)
    ) {
      res.writeHead(403).end('Prohibido');
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) throw new Error('no-file');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch {
    if (!res.headersSent) res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
  }
});

server.listen(port, () => {
  const ips = lanIps();
  console.log(`\n  SINAPSIS listo · modo en vivo por red local\n`);
  console.log(`  1) Abre la consola del anfitrión:   http://localhost:${port}/host.html`);
  console.log(`  2) Comparte este link con tu equipo: http://${ips[0] || hostname()}:${port}`);
  if (ips.length > 1) console.log(`     (otras direcciones de esta laptop: ${ips.slice(1).map((ip) => `http://${ip}:${port}`).join('  ')})`);
  console.log(`     También puede funcionar: http://${hostname()}:${port}`);
  console.log(`\n  La sesión y los resultados se guardan solos en: ${resultsDir}`);
  console.log('  Si la consola se recarga o se cierra, al volver a entrar podrás continuar la sesión.');
  console.log('\n  Si Windows pregunta por el firewall, permite el acceso a Node.js en redes privadas o de dominio.');
  console.log('  Si tus compañeros no logran abrir el link, usa el modo sin conexión (códigos).');
  console.log('  Ctrl + C para detener.\n');
});
