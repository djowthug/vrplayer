// Utilitário para verificar e garantir que os binários estáticos estejam presentes em bin/
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BIN_DIR = path.resolve('bin');
if (!fs.existsSync(BIN_DIR)) {
  fs.mkdirSync(BIN_DIR, { recursive: true });
}

function findSystemExecutable(name) {
  try {
    const out = execSync(`where.exe ${name}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (out) {
      const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (fs.existsSync(line)) return line;
      }
    }
  } catch {}

  // Busca em pastas conhecidas do WinGet
  const localAppData = process.env.LOCALAPPDATA || '';
  const wingetPkg = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(wingetPkg)) {
    try {
      const entries = fs.readdirSync(wingetPkg);
      for (const ent of entries) {
        if (ent.toLowerCase().includes(name.toLowerCase())) {
          const direct = path.join(wingetPkg, ent, `${name}.exe`);
          if (fs.existsSync(direct)) return direct;
          const inBin = path.join(wingetPkg, ent, 'bin', `${name}.exe`);
          if (fs.existsSync(inBin)) return inBin;
        }
      }
    } catch {}
  }

  // Busca na pasta de downloads do usuário
  const userProfile = process.env.USERPROFILE || '';
  const downloads = path.join(userProfile, 'Downloads');
  if (fs.existsSync(downloads)) {
    try {
      const entries = fs.readdirSync(downloads);
      for (const ent of entries) {
        if (ent.toLowerCase().includes(name.toLowerCase())) {
          const full = path.join(downloads, ent);
          if (fs.statSync(full).isDirectory()) {
            const inBin = path.join(full, 'bin', `${name}.exe`);
            if (fs.existsSync(inBin)) return inBin;
            const direct = path.join(full, `${name}.exe`);
            if (fs.existsSync(direct)) return direct;
          }
        }
      }
    } catch {}
  }

  return null;
}

const REQUIRED_BINARIES = ['ffmpeg.exe', 'ffprobe.exe', 'mkcert.exe'];

console.log('\n=============================================');
console.log('   VR Player — Verificação de Binários Estáticos');
console.log('=============================================\n');

let allReady = true;

for (const exe of REQUIRED_BINARIES) {
  const dest = path.join(BIN_DIR, exe);
  const baseName = path.basename(exe, '.exe');

  if (fs.existsSync(dest)) {
    const stat = fs.statSync(dest);
    const sizeMb = (stat.size / (1024 * 1024)).toFixed(1);
    console.log(` ✔ [PRONTO]  ${exe.padEnd(12)} (${sizeMb} MB) em ${dest}`);
    continue;
  }

  console.log(` ⏳ Procurando ${baseName} no computador...`);
  const found = findSystemExecutable(baseName);

  if (found && fs.existsSync(found)) {
    console.log(`    Copiando de: ${found}`);
    try {
      fs.copyFileSync(found, dest);
      const stat = fs.statSync(dest);
      const sizeMb = (stat.size / (1024 * 1024)).toFixed(1);
      console.log(` ✔ [COPIADO] ${exe.padEnd(12)} (${sizeMb} MB) copiado para bin/`);
    } catch (err) {
      console.error(` ✖ Erro ao copiar ${exe}:`, err.message);
      allReady = false;
    }
  } else {
    console.warn(` ⚠ [AUSENTE] ${exe} não encontrado automaticamente.`);
    allReady = false;
  }
}

console.log('\n---------------------------------------------');
if (allReady) {
  console.log('🎉 Todos os binários estáticos estão prontos para empacotamento!');
} else {
  console.log('ℹ Se desejar, copie manualmente ffmpeg.exe, ffprobe.exe e mkcert.exe para a pasta "bin/".');
}
console.log('---------------------------------------------\n');
