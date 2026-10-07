// Script para instalar o mkcert e gerar certificados HTTPS válidos para a rede local
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CERTS_DIR = path.resolve('certs');
if (!fs.existsSync(CERTS_DIR)) {
  fs.mkdirSync(CERTS_DIR, { recursive: true });
}

function getLocalIPs() {
  const nets = os.networkInterfaces();
  const ips = ['localhost', '127.0.0.1'];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
        ips.push(net.address);
      }
    }
  }
  return [...new Set(ips)];
}

function findMkcert() {
  try {
    const out = execSync('where mkcert', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (out) return 'mkcert';
  } catch {}

  const localAppData = process.env.LOCALAPPDATA || '';
  const candidates = [
    path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'mkcert.exe'),
  ];

  const packagesDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(packagesDir)) {
    try {
      const dirs = fs.readdirSync(packagesDir);
      for (const d of dirs) {
        if (d.toLowerCase().includes('mkcert')) {
          const exe = path.join(packagesDir, d, 'mkcert.exe');
          if (fs.existsSync(exe)) candidates.push(exe);
        }
      }
    } catch {}
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return `"${c}"`;
  }
  return null;
}

console.log('\n=========================================');
console.log('   VR Player — Configuração de HTTPS Local');
console.log('=========================================\n');

let mkcertBin = findMkcert();

if (!mkcertBin) {
  console.log('🔍 mkcert não encontrado. Instalando via winget...');
  try {
    execSync('winget install FiloSottile.mkcert --accept-source-agreements --accept-package-agreements', { stdio: 'inherit' });
    mkcertBin = findMkcert() || 'mkcert';
    console.log('✅ mkcert instalado com sucesso!');
  } catch (err) {
    console.error('❌ Não foi possível instalar o mkcert automaticamente via winget.');
    console.error('   Você pode instalar manualmente executando no terminal:');
    console.error('   winget install FiloSottile.mkcert');
    process.exit(1);
  }
} else {
  console.log(`✅ mkcert localizado: ${mkcertBin}`);
}

try {
  const caRoot = path.join(process.env.LOCALAPPDATA || '', 'mkcert');
  const caSrc = path.join(caRoot, 'rootCA.pem');

  if (!fs.existsSync(caSrc)) {
    console.log('🔒 Registrando Autoridade Certificadora local...');
    try {
      execSync(`${mkcertBin} -install`, { stdio: 'inherit', timeout: 8000 });
    } catch {
      console.log('⚠️ Aviso: Continuando com a CA local existente...');
    }
  }

  const ips = getLocalIPs();
  console.log(`🌐 Gerando certificados HTTPS para: ${ips.join(', ')}`);

  const certPath = path.join(CERTS_DIR, 'cert.pem');
  const keyPath = path.join(CERTS_DIR, 'key.pem');

  execSync(`${mkcertBin} -cert-file "${certPath}" -key-file "${keyPath}" ${ips.join(' ')}`, { stdio: 'inherit' });

  const caDst = path.join(CERTS_DIR, 'rootCA.crt');
  if (fs.existsSync(caSrc)) {
    fs.copyFileSync(caSrc, caDst);
    console.log(`✅ Certificado raiz para iPhone salvo em: ${caDst}`);
  }

  console.log('\n🎉 Certificados HTTPS gerados com sucesso na pasta /certs!');
  console.log('\n📱 COMO HABILITAR NO IPHONE (apenas 1 vez):');
  console.log('1. Inicie o servidor: npm start');
  console.log('2. No Safari do iPhone, acesse o link de instalação do certificado que o servidor vai exibir.');
  console.log('3. Vá em Ajustes do iPhone -> "Perfil Baixado" -> Toque em Instalar.');
  console.log('4. Vá em Ajustes -> Geral -> Sobre -> "Certificados Confiáveis" (no final) -> Ative a chavinha do mkcert.');
  console.log('\nPronto! A partir daí o Safari libera giroscópio e streaming sem qualquer aviso.\n');
} catch (e) {
  console.error('Erro ao gerar certificados:', e.message);
  process.exit(1);
}
