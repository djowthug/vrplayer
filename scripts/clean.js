// Script para limpar diretórios de compilação, cache e arquivos temporários do projeto
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const cleanCache = args.includes('--cache') || args.includes('--all');
const cleanAll = args.includes('--all');

const TARGET_DIRS = ['dist', 'build', 'out', '.icon-ico', 'scratch'];
const EXT_CLEAN = ['.tmp', '.log', '.bak'];

console.log('🧹 Limpando resíduos de build, caches e arquivos temporários...');

let deletedCount = 0;
let bytesFreed = 0;

function getFolderSize(dir) {
  let size = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        size += getFolderSize(full);
      } else if (ent.isFile()) {
        try { size += fs.statSync(full).size; } catch {}
      }
    }
  } catch {}
  return size;
}

function formatBytes(b) {
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
  return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// 1. Limpa diretórios temporários e de compilação
for (const dir of TARGET_DIRS) {
  const dirPath = path.resolve(dir);
  if (fs.existsSync(dirPath)) {
    try {
      const dirSize = getFolderSize(dirPath);
      fs.rmSync(dirPath, { recursive: true, force: true });
      bytesFreed += dirSize;
      console.log(`  ✓ Removido diretório: ${dir} (${formatBytes(dirSize)})`);
      deletedCount++;
    } catch (err) {
      console.warn(`  ⚠️ Não foi possível remover ${dir}: ${err.message}`);
    }
  }
}

// 2. Limpa cache de thumbnails se solicitado ou se for limpeza geral
if (cleanCache) {
  const cacheThumbDir = path.resolve('.cache', 'thumbnails');
  if (fs.existsSync(cacheThumbDir)) {
    try {
      const thumbFiles = fs.readdirSync(cacheThumbDir);
      let thumbSize = 0;
      for (const f of thumbFiles) {
        const full = path.join(cacheThumbDir, f);
        try {
          thumbSize += fs.statSync(full).size;
          fs.unlinkSync(full);
          deletedCount++;
        } catch {}
      }
      bytesFreed += thumbSize;
      console.log(`  ✓ Limpo cache de miniaturas: .cache/thumbnails (${formatBytes(thumbSize)})`);
    } catch (err) {
      console.warn(`  ⚠️ Não foi possível limpar .cache: ${err.message}`);
    }
  }
}

// 3. Remove arquivos temporários espalhados
function cleanFiles(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const fullPath = path.join(dir, ent.name);
      if (ent.isDirectory() && ent.name !== 'node_modules' && ent.name !== '.git') {
        cleanFiles(fullPath);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (EXT_CLEAN.includes(ext) || ent.name === 'Thumbs.db' || ent.name === '.DS_Store') {
          try {
            const fSize = fs.statSync(fullPath).size;
            fs.unlinkSync(fullPath);
            bytesFreed += fSize;
            console.log(`  ✓ Removido arquivo: ${path.relative(process.cwd(), fullPath)}`);
            deletedCount++;
          } catch {}
        }
      }
    }
  } catch {}
}

cleanFiles(process.cwd());

console.log(`\n✨ Limpeza concluída! ${deletedCount} item(s) limpo(s) | Espaço liberado: ~${formatBytes(bytesFreed)}.\n`);
