// Script operacional de automação DevOps: Limpeza de build, caches, temporários e manutenção Git
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { formatBytes } from '../js/utils/format.js';

// Resolução determinística e multiplataforma da raiz do projeto
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🧹 VR Player — Utilitário DevOps de Limpeza e Manutenção

Uso:
  node scripts/clean.js [opções]
  npm run clean          (Limpa resíduos de compilação e arquivos temporários)
  npm run clean:cache    (Limpa resíduos, caches locais de miniaturas e sessões HLS)
  npm run clean:git      (Limpa resíduos e executa manutenção do repositório Git)
  npm run clean:all      (Limpeza completa de builds, caches e manutenção do repositório Git)

Opções:
  --cache       Remove pastas de cache (.cache/, caches em os.tmpdir())
  --git         Executa poda de branches/remotos obsoletos (git fetch --prune) e git gc
  --all         Executa todas as tarefas de limpeza acima combinadas
  --dry-run     Modo de simulação (apenas lista os itens sem removê-los)
  --help, -h    Exibe esta mensagem de ajuda
`);
  process.exit(0);
}

const isDryRun = args.includes('--dry-run');
const cleanCache = args.includes('--cache') || args.includes('--all');
const cleanGit = args.includes('--git') || args.includes('--all');

// Diretórios estritamente protegidos contra qualquer deleção acidental
const PROTECTED_DIRS = new Set([
  path.join(PROJECT_ROOT, 'bin'),
  path.join(PROJECT_ROOT, 'videos'),
  path.join(PROJECT_ROOT, 'certs'),
  path.join(PROJECT_ROOT, 'node_modules'),
  path.join(PROJECT_ROOT, '.git'),
]);

// Extensões de arquivos protegidos contra deleção acidental
const PROTECTED_EXTS = new Set(['.exe', '.dll', '.so', '.dylib', '.bat', '.cmd', '.sh']);

const TARGET_DIRS = [
  'dist',
  'build',
  'out',
  '_site',
  '.icon-ico',
  'scratch',
  '.temp',
  '.tmp',
  'coverage',
  '.nyc_output',
];

const EXT_CLEAN = ['.tmp', '.log', '.bak', '.backup', '.swp', '.swo'];
const SYSTEM_FILES_CLEAN = ['Thumbs.db', 'ehthumbs.db', 'Desktop.ini', '.DS_Store', '.AppleDouble', '.LSOverride'];

if (isDryRun) {
  console.log('🔍 [DRY-RUN] Modo de simulação ativado: nenhum arquivo será alterado.');
}
console.log('🧹 Iniciando rotina de limpeza DevOps...');

let deletedCount = 0;
let bytesFreed = 0;

function isProtectedDir(targetPath) {
  const resolved = path.resolve(targetPath);
  if (resolved === PROJECT_ROOT) return true;
  for (const prot of PROTECTED_DIRS) {
    if (resolved === prot || resolved.startsWith(prot + path.sep)) {
      return true;
    }
  }
  return false;
}

function shouldSkipDirectory(fullPath, dirName) {
  if (
    dirName === 'node_modules' ||
    dirName === '.git' ||
    dirName === 'bin' ||
    dirName === 'videos' ||
    dirName === 'certs'
  ) {
    return true;
  }
  const resolved = path.resolve(fullPath);
  for (const prot of PROTECTED_DIRS) {
    if (resolved === prot || resolved.startsWith(prot + path.sep)) {
      return true;
    }
  }
  return false;
}

function getFolderSize(dir) {
  let size = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        size += getFolderSize(full);
      } else if (ent.isFile()) {
        try {
          size += fs.statSync(full).size;
        } catch {}
      }
    }
  } catch {}
  return size;
}

// 1. Limpa diretórios temporários e de compilação
for (const relDir of TARGET_DIRS) {
  const dirPath = path.resolve(PROJECT_ROOT, relDir);

  if (isProtectedDir(dirPath)) {
    console.warn(`  🔒 Proteção acionada: o diretório ${relDir} está na lista protegida e não será removido.`);
    continue;
  }

  if (fs.existsSync(dirPath)) {
    try {
      const dirSize = getFolderSize(dirPath);
      if (!isDryRun) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
      bytesFreed += dirSize;
      console.log(`  ✓ Removido diretório de build: ${relDir} (${formatBytes(dirSize)})${isDryRun ? ' [DRY-RUN]' : ''}`);
      deletedCount++;
    } catch (err) {
      console.warn(`  ⚠️ Não foi possível remover ${relDir}: ${err.message}`);
    }
  }
}

// 2. Limpa caches de miniaturas e arquivos temporários de streaming HLS no OS
if (cleanCache) {
  const cacheDirs = [
    path.join(PROJECT_ROOT, '.cache'),
    path.join(os.tmpdir(), 'vrplayer-hls-cache'),
    path.join(os.tmpdir(), 'vrplayer'),
  ];

  for (const cDir of cacheDirs) {
    if (isProtectedDir(cDir)) continue;

    if (fs.existsSync(cDir)) {
      try {
        const cSize = getFolderSize(cDir);
        if (!isDryRun) {
          fs.rmSync(cDir, { recursive: true, force: true });
        }
        bytesFreed += cSize;
        const displayName = path.isAbsolute(cDir) && cDir.startsWith(PROJECT_ROOT)
          ? path.relative(PROJECT_ROOT, cDir)
          : cDir;
        console.log(`  ✓ Cache removido: ${displayName} (${formatBytes(cSize)})${isDryRun ? ' [DRY-RUN]' : ''}`);
        deletedCount++;
      } catch (err) {
        console.warn(`  ⚠️ Falha ao limpar cache ${cDir}: ${err.message}`);
      }
    }
  }
}

// 3. Remove arquivos temporários espalhados
function cleanFiles(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const fullPath = path.join(dir, ent.name);

      if (ent.isDirectory()) {
        // Ignora pastas protegidas ou pesadas
        if (!shouldSkipDirectory(fullPath, ent.name)) {
          cleanFiles(fullPath);
        }
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();

        // Salvaguarda adicional: nunca deletar binários estáticos ou scripts executáveis
        if (PROTECTED_EXTS.has(ext)) {
          continue;
        }

        if (EXT_CLEAN.includes(ext) || SYSTEM_FILES_CLEAN.includes(ent.name)) {
          try {
            const fSize = fs.statSync(fullPath).size;
            if (!isDryRun) {
              fs.unlinkSync(fullPath);
            }
            bytesFreed += fSize;
            const relPath = path.relative(PROJECT_ROOT, fullPath);
            console.log(`  ✓ Removido arquivo temporário: ${relPath}${isDryRun ? ' [DRY-RUN]' : ''}`);
            deletedCount++;
          } catch {}
        }
      }
    }
  } catch {}
}

cleanFiles(PROJECT_ROOT);

// 4. Manutenção de branches e histórico redundante do Git
if (cleanGit) {
  const gitDir = path.join(PROJECT_ROOT, '.git');
  if (fs.existsSync(gitDir)) {
    console.log('\n🌿 Executando manutenção e saneamento de referências Git...');
    if (isDryRun) {
      console.log('  [DRY-RUN] Poda de referências e coleta de lixo simuladas.');
    } else {
      try {
        execSync('git fetch --prune origin', { stdio: 'pipe', cwd: PROJECT_ROOT });
        console.log('  ✓ Referências remotas obsoletas podadas (git fetch --prune).');
      } catch {
        console.warn('  ℹ Nenhuma referência remota podada (remoto offline ou sem credenciais).');
      }
      try {
        execSync('git gc --prune=now', { stdio: 'pipe', cwd: PROJECT_ROOT });
        console.log('  ✓ Coleta de lixo e otimização do repositório Git executada (git gc).');
      } catch (err) {
        console.warn('  ⚠️ Falha no git gc:', err.message);
      }
    }
  }
}

const summaryText = isDryRun
  ? `\n✨ Simulação concluída! ${deletedCount} item(s) seriam limpos | Espaço a liberar: ~${formatBytes(bytesFreed)}.\n`
  : `\n✨ Limpeza concluída! ${deletedCount} item(s) limpo(s) | Espaço liberado: ~${formatBytes(bytesFreed)}.\n`;

console.log(summaryText);
