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

function isCommandAvailable(cmd) {
  try {
    execSync(`where ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

console.log('\n=========================================');
console.log('   VR Player — Configuração de HTTPS Local');
console.log('=========================================\n');

if (!isCommandAvailable('mkcert')) {
  console.log('🔍 mkcert não encontrado. Instalando via winget...');
  try {
    execSync('winget install FiloSottile.mkcert --accept-source-agreements --accept-package-agreements', { stdio: 'inherit' });
    console.log('✅ mkcert instalado com sucesso!');
  } catch (err) {
    console.error('❌ Não foi possível instalar o mkcert automaticamente via winget.');
    console.error('   Você pode instalar manualmente executando no terminal:');
    console.error('   winget install FiloSottile.mkcert');
    process.exit(1);
  }
}

try {
  console.log('🔒 Registrando Autoridade Certificadora local...');
  execSync('mkcert -install', { stdio: 'inherit' });

  const ips = getLocalIPs();
  console.log(`🌐 Gerando certificados para: ${ips.join(', ')}`);

  const certPath = path.join(CERTS_DIR, 'cert.pem');
  const keyPath = path.join(CERTS_DIR, 'key.pem');

  execSync(`mkcert -cert-file "${certPath}" -key-file "${keyPath}" ${ips.join(' ')}`, { stdio: 'inherit' });

  // Copia a Root CA para a pasta certs com extensão .crt (que o iOS reconhece direto)
  const caRoot = execSync('mkcert -CAROOT').toString().trim();
  const caSrc = path.join(caRoot, 'rootCA.pem');
  const caDst = path.join(CERTS_DIR, 'rootCA.crt');
  if (fs.existsSync(caSrc)) {
    fs.copyFileSync(caSrc, caDst);
    console.log(`✅ Certificado raiz salvo em: ${caDst}`);
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
