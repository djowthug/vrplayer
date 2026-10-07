// Servidor Node.js para streaming local de vídeos VR para o iPhone
// Suporta HTTP Range Requests (obrigatório para iOS), CORS e HTTPS local via mkcert
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { detectFromName } from './js/detect.js';

const CERTS_DIR = path.resolve('certs');
const CERT_FILE = path.join(CERTS_DIR, 'cert.pem');
const KEY_FILE = path.join(CERTS_DIR, 'key.pem');
const CA_FILE = path.join(CERTS_DIR, 'rootCA.crt');

// Carrega configurações ou argumentos de linha de comando
let config = { videoDir: './videos', httpsPort: 8443, httpPort: 8080 };
if (fs.existsSync('config.json')) {
  try { config = { ...config, ...JSON.parse(fs.readFileSync('config.json', 'utf8')) }; } catch {}
}
if (process.argv[2]) {
  config.videoDir = process.argv[2];
}

const VIDEO_DIR = path.resolve(config.videoDir);
if (!fs.existsSync(VIDEO_DIR)) {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.crt': 'application/x-x509-ca-cert',
};

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv']);

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function scanVideos(dir, baseDir = dir) {
  let results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const fullPath = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        results = results.concat(scanVideos(fullPath, baseDir));
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (VIDEO_EXTS.has(ext)) {
          const stat = fs.statSync(fullPath);
          const rel = path.relative(baseDir, fullPath).replace(/\\/g, '/');
          const hint = detectFromName(ent.name);
          results.push({
            id: rel,
            name: ent.name,
            relPath: rel,
            size: formatSize(stat.size),
            sizeBytes: stat.size,
            formatHint: hint,
            url: `/stream/${encodeURIComponent(rel)}`,
          });
        }
      }
    }
  } catch (err) {
    console.error(`Erro ao ler pasta: ${dir}`, err.message);
  }
  return results;
}

function getLocalIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
}

// Manipulador central de requisições
function handleRequest(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  // 1. Download do Certificado Raiz para iPhone (/ca.crt)
  if (pathname === '/ca.crt' || pathname === '/install-cert') {
    if (fs.existsSync(CA_FILE)) {
      res.writeHead(200, {
        'Content-Type': 'application/x-x509-ca-cert',
        'Content-Disposition': 'attachment; filename="vrplayer-ca.crt"',
      });
      fs.createReadStream(CA_FILE).pipe(res);
      return;
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Certificado não encontrado. Execute: npm run cert');
      return;
    }
  }

  // 2. API: Lista de vídeos do computador (/api/videos)
  if (pathname === '/api/videos') {
    const list = scanVideos(VIDEO_DIR);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ folder: VIDEO_DIR, count: list.length, videos: list }));
    return;
  }

  // 3. Streaming de vídeo com suporte obrigatório a HTTP Range (/stream/...)
  if (pathname.startsWith('/stream/')) {
    const rel = pathname.slice('/stream/'.length);
    const safeRel = path.normalize(rel).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(VIDEO_DIR, safeRel);

    if (!fs.existsSync(fullPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Vídeo não encontrado');
      return;
    }

    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'video/mp4';

    const range = req.headers.range;
    if (range) {
      // Ex: Range: bytes=0-1024
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
        res.end();
        return;
      }

      const chunkLength = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkLength,
        'Content-Type': contentType,
      });

      fs.createReadStream(fullPath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType,
      });
      fs.createReadStream(fullPath).pipe(res);
    }
    return;
  }

  // 4. Arquivos estáticos do site (PWA)
  let filePath = path.join(process.cwd(), pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(process.cwd(), 'index.html');
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Arquivo não encontrado');
  }
}

// Inicia servidores HTTP e HTTPS
const hasCert = fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE);
const localIPs = getLocalIPs();
const primaryIP = localIPs[0] || 'localhost';

console.log('\n======================================================');
console.log('   VR Player — Servidor Local de Streaming');
console.log('======================================================');
console.log(`📁 Pasta de vídeos: ${VIDEO_DIR}`);

if (hasCert) {
  const options = {
    key: fs.readFileSync(KEY_FILE),
    cert: fs.readFileSync(CERT_FILE),
  };
  const httpsServer = https.createServer(options, handleRequest);
  httpsServer.listen(config.httpsPort, '0.0.0.0', () => {
    console.log(`\n🔒 HTTPS ATIVO! Abra no Safari do iPhone:`);
    for (const ip of localIPs) {
      console.log(`   👉 https://${ip}:${config.httpsPort}/`);
    }
  });

  // Servidor HTTP simples para redirecionar ou servir o certificado de instalação
  const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/ca.crt' || url.pathname === '/install-cert') {
      handleRequest(req, res);
    } else {
      const host = (req.headers.host || '').split(':')[0] || primaryIP;
      res.writeHead(301, { Location: `https://${host}:${config.httpsPort}${req.url}` });
      res.end();
    }
  });
  httpServer.listen(config.httpPort, '0.0.0.0', () => {
    console.log(`\n📲 Link rápido para instalar o Certificado no iPhone:`);
    console.log(`   👉 http://${primaryIP}:${config.httpPort}/install-cert`);
  });
} else {
  const httpServer = http.createServer(handleRequest);
  httpServer.listen(config.httpPort, '0.0.0.0', () => {
    console.log(`\n⚠️  Modo HTTP (sem giroscópio no iPhone por falta de HTTPS).`);
    console.log(`   Acesse: http://${primaryIP}:${config.httpPort}/`);
    console.log(`\n💡 Para ativar HTTPS e liberar o giroscópio no iPhone:`);
    console.log(`   Execute no terminal: npm run cert\n`);
  });
}
