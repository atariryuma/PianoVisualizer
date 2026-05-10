import { createServer } from 'node:https';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { appendFile, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootArg = process.argv[2];
const port = Number(process.env.PORT || process.argv[3] || 8443);
const serverRoot = path.resolve(rootArg || path.join(scriptDir, 'packages/web/dist'));
const certPath = path.join(scriptDir, 'cert.pfx');
const certPass = process.env.PIANO_CERT_PASS || 'piano123';
const logPath = path.join(scriptDir, 'server.log');
const blockedFiles = new Set([
  'cert.pfx',
  'https_server.ps1',
  'https_server.mjs',
  'gen_cert.ps1',
  'server.log',
]);

const mimeMap = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.ico', 'image/x-icon'],
  ['.cer', 'application/pkix-cert'],
  ['.crt', 'application/pkix-cert'],
]);

function clientTag(req) {
  const ua = req.headers['user-agent'] || '';
  if (ua.includes('iPad')) return 'iPad';
  if (ua.includes('iPhone')) return 'iPhone';
  if (ua.includes('Android')) return 'Android';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Windows')) return 'Windows';
  return 'Web';
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}

async function writeLog(message) {
  try {
    await appendFile(logPath, `${timestamp()} ${message}\n`, 'utf8');
  } catch {
    // Debug-only log: never fail the request path because of a file lock.
  }
}

function sendText(res, statusCode, body) {
  res.writeHead(statusCode, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    connection: 'close',
  });
  res.end(body);
}

function resolveRequestPath(url) {
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(url || '/', 'https://localhost').pathname);
  } catch {
    pathname = '/';
  }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = path.resolve(serverRoot, relative);
  if (candidate !== serverRoot && !candidate.startsWith(serverRoot + path.sep)) return null;
  return candidate;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function handleRequest(req, res) {
  if (req.method === 'POST' && req.url === '/log') {
    const body = await readBody(req);
    await writeLog(`[${clientTag(req)}] ${body}`);
    sendText(res, 200, 'OK');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method Not Allowed');
    return;
  }

  const candidate = resolveRequestPath(req.url);
  if (!candidate) {
    sendText(res, 403, 'Forbidden');
    return;
  }
  if (blockedFiles.has(path.basename(candidate))) {
    sendText(res, 403, 'Forbidden');
    return;
  }
  if (!existsSync(candidate) || !statSync(candidate).isFile()) {
    sendText(res, 404, 'Not Found');
    return;
  }

  const ext = path.extname(candidate).toLowerCase();
  const contentType = mimeMap.get(ext) || 'application/octet-stream';
  const size = statSync(candidate).size;
  res.writeHead(200, {
    'content-type': contentType,
    'content-length': size,
    connection: 'close',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(candidate).pipe(res);
}

if (!existsSync(certPath)) {
  throw new Error(`Certificate file not found: ${certPath}`);
}

await writeFile(
  logPath,
  `Server started on port ${port}\n${timestamp()} Serving files from ${serverRoot} (node https)\n`,
  'utf8'
);

const server = createServer({ pfx: readFileSync(certPath), passphrase: certPass }, (req, res) => {
  handleRequest(req, res).catch((err) => {
    writeLog(`Worker error: ${err?.message || err}`).catch(() => {});
    if (!res.headersSent) sendText(res, 500, 'Internal Server Error');
    else res.destroy();
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`HTTPS server listening on port ${port} (root: ${serverRoot})`);
});

setInterval(() => {}, 1 << 30);
