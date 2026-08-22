import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, normalize, extname } from 'path';

const ROOT = new URL('.', import.meta.url).pathname;
const PORT = process.env.PORT || 3000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const handler = async (req, res) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch (e) {
    res.writeHead(404); res.end('Not found');
  }
};

const primary = createServer(handler);
primary.on('error', () => {
  console.log(`PORT ${PORT} busy — retrying every 5s`);
  setInterval(() => {
    const retry = createServer(handler);
    retry.once('error', () => retry.close());
    retry.listen(PORT, '0.0.0.0', () => {
      console.log(`DESERT STRIKE CAPTURED port ${PORT}`);
      clearInterval(retryHandle);
    });
  }, 5000);
});
let retryHandle = null;
primary.listen(PORT, '0.0.0.0', () => console.log(`DESERT STRIKE listening on http://localhost:${PORT}`));

const FALLBACK = Number(process.env.FALLBACK_PORT || 8099);
if (FALLBACK !== PORT) {
  const fb = createServer(handler);
  fb.on('error', e => console.error('FALLBACK_ERROR', e.code));
  fb.listen(FALLBACK, '0.0.0.0', () => console.log(`DESERT STRIKE listening on http://localhost:${FALLBACK}`));
}

process.on('uncaughtException', e => console.error('UNCAUGHT', e && e.message));
setInterval(() => {}, 1 << 30);
