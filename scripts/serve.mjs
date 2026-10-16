// Serves plugin/ for `npm run preview`, with Node's standard library only.
// It answers only when the Host header is this server's own name (DNS rebinding guard), serves files under
// plugin/ and nothing else, and never lists a folder. Usage: node scripts/serve.mjs [port]   (default 8766)
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = await realpath(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2] ?? 8766);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`serve.mjs: not a port: ${process.argv[2]}`);
  process.exit(1);
}
const HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8',
};

const inside = (path) => path === ROOT || path.startsWith(ROOT + sep);

function send(res, status, body = '', type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

// Returns { status: 200, file } for a file, otherwise the status to send. A folder means its index.html.
async function locate(requested) {
  let info;
  try {
    info = await stat(requested);
    if (info.isDirectory()) {
      requested = join(requested, 'index.html');
      info = await stat(requested);
    }
  } catch {
    return { status: 404 };
  }
  if (!info.isFile()) return { status: 404 };
  // A symlink inside plugin/ must not lead out of it.
  const file = await realpath(requested);
  return inside(file) ? { status: 200, file } : { status: 403 };
}

const server = createServer(async (req, res) => {
  try {
    if (!HOSTS.has(req.headers.host)) return send(res, 403, 'Forbidden');
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed');
    let target;
    try {
      target = decodeURIComponent((req.url ?? '/').split('?')[0]);
    } catch {
      return send(res, 400, 'Bad Request');
    }
    // resolve() on the raw path, not URL's normalised one, so `/../x` is refused rather than becoming `/x`.
    const requested = resolve(ROOT, `.${target}`);
    if (!inside(requested)) return send(res, 403, 'Forbidden');
    const found = await locate(requested);
    if (found.status !== 200) return send(res, found.status, found.status === 403 ? 'Forbidden' : 'Not Found');
    // ponytail: reads each file whole into memory; the preview's files are a few MB at most.
    const body = await readFile(found.file);
    send(res, 200, body, TYPES[extname(found.file)] ?? 'application/octet-stream');
  } catch (error) {
    console.error(error);
    if (!res.headersSent) send(res, 500, 'Internal Server Error');
  }
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${PORT} is already in use.` : error.message);
  process.exit(1);
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Serving plugin/ at http://127.0.0.1:${PORT}/preview/ (Ctrl+C to stop)`);
});
