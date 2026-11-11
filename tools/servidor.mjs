// ─────────────────────────────────────────────────────────────
//  Servidor local de SINAPSIS (sin dependencias, sin internet)
//
//  Sirve la app y retransmite los mensajes en tiempo real entre la
//  pantalla del anfitrión y los dispositivos de la misma red.
//
//  Uso:   node tools/servidor.mjs          (puerto 8080)
//         node tools/servidor.mjs 3000     (otro puerto)
// ─────────────────────────────────────────────────────────────
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
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
    // Bloquea salir de la carpeta, la carpeta privada y archivos ocultos
    if (!file.startsWith(root + sep) || file.startsWith(join(root, 'privado') + sep) || file.includes(`${sep}.`)) {
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
  console.log('\n  Si Windows pregunta por el firewall, permite el acceso a Node.js en redes privadas o de dominio.');
  console.log('  Si tus compañeros no logran abrir el link, usa el modo sin conexión (códigos).');
  console.log('  Ctrl + C para detener.\n');
});
