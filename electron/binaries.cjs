const path = require('path');
const fs = require('fs');

/**
 * Localiza o caminho absoluto para o executável estático.
 * Ordem de busca:
 * 1. process.resourcesPath/bin/<nome>.exe (Instalador Electron NSIS / Portátil empacotado)
 * 2. <projectRoot>/bin/<nome>.exe (Ambiente de desenvolvimento local)
 * 3. Fallback para comando padrão do PATH do sistema Windows
 */
function getBinaryPath(name) {
  const exe = process.platform === 'win32' && !name.endsWith('.exe') ? `${name}.exe` : name;

  // 1. Recursos empacotados pelo electron-builder (produção)
  if (process.resourcesPath) {
    const packagedPath = path.join(process.resourcesPath, 'bin', exe);
    if (fs.existsSync(packagedPath)) {
      return packagedPath;
    }
  }

  // 2. Pasta bin/ na raiz do projeto
  const localProjectBin = path.join(__dirname, '..', 'bin', exe);
  if (fs.existsSync(localProjectBin)) {
    return localProjectBin;
  }

  // 3. Fallback transparente para o PATH
  return name;
}

/**
 * Injeta a pasta bin no início do PATH do processo atual
 */
function setupBinaryEnv() {
  const dirs = [];

  if (process.resourcesPath) {
    const packagedDir = path.join(process.resourcesPath, 'bin');
    if (fs.existsSync(packagedDir)) dirs.push(packagedDir);
  }

  const localDir = path.join(__dirname, '..', 'bin');
  if (fs.existsSync(localDir)) dirs.push(localDir);

  if (dirs.length > 0) {
    const sep = path.delimiter;
    process.env.PATH = dirs.join(sep) + sep + (process.env.PATH || '');
  }
}

module.exports = {
  getBinaryPath,
  setupBinaryEnv,
};
