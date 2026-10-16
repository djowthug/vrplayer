// Teste automatizado de gerenciamento de pastas e organização da biblioteca
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';

test('Gerenciamento e Organização de Pastas', async (t) => {
  await t.test('Adição e remoção de pastas na lista de monitoramento', () => {
    let videoDirs = ['D:\\FilmesVR', 'E:\\MeusVR'];
    let primaryDir = 'D:\\FilmesVR';

    // Adiciona nova pasta
    const newFolder = 'F:\\NovosVR';
    if (!videoDirs.some((d) => path.resolve(d) === path.resolve(newFolder))) {
      videoDirs.push(newFolder);
    }
    assert.equal(videoDirs.length, 3);
    assert.ok(videoDirs.includes(newFolder));

    // Deduplicação ao adicionar mesma pasta
    if (!videoDirs.some((d) => path.resolve(d) === path.resolve(newFolder))) {
      videoDirs.push(newFolder);
    }
    assert.equal(videoDirs.length, 3);

    // Remoção de pasta (DELETE)
    const removeFolder = 'D:\\FilmesVR';
    videoDirs = videoDirs.filter((d) => path.resolve(d) !== path.resolve(removeFolder));
    if (path.resolve(primaryDir) === path.resolve(removeFolder)) {
      primaryDir = videoDirs[0] || './videos';
    }

    assert.equal(videoDirs.length, 2);
    assert.ok(!videoDirs.includes(removeFolder));
    assert.equal(primaryDir, 'E:\\MeusVR');
  });

  await t.test('Agrupamento de vídeos por pasta raiz e extração de subpastas', () => {
    const mockVideos = [
      {
        name: 'video1.mp4',
        folderName: '2160p',
        folderRoot: 'F:\\TERA BACKUP\\2160p',
        subfolder: '',
        sizeBytes: 1000,
        mtime: 100,
      },
      {
        name: 'video2.mp4',
        folderName: '2160p',
        folderRoot: 'F:\\TERA BACKUP\\2160p',
        subfolder: 'Sci-Fi',
        sizeBytes: 5000,
        mtime: 300,
      },
      {
        name: 'video3.mp4',
        folderName: 'MeusVR',
        folderRoot: 'E:\\MeusVR',
        subfolder: 'Viagens/Praia',
        sizeBytes: 2000,
        mtime: 200,
      },
    ];

    // Agrupamento por pasta
    const groups = new Map();
    for (const v of mockVideos) {
      const f = v.folderName || 'Principal';
      if (!groups.has(f)) groups.set(f, []);
      groups.get(f).push(v);
    }

    assert.equal(groups.size, 2);
    assert.equal(groups.get('2160p').length, 2);
    assert.equal(groups.get('MeusVR').length, 1);
    assert.equal(groups.get('2160p')[1].subfolder, 'Sci-Fi');
    assert.equal(groups.get('MeusVR')[0].subfolder, 'Viagens/Praia');
  });

  await t.test('Ordenação de vídeos por nome, tamanho e data', () => {
    const list = [
      { name: 'Beta.mp4', sizeBytes: 500, mtime: 10 },
      { name: 'Alpha.mp4', sizeBytes: 100, mtime: 30 },
      { name: 'Gama.mp4', sizeBytes: 900, mtime: 20 },
    ];

    // Ordenação Nome ASC
    const byNameAsc = [...list].sort((a, b) => a.name.localeCompare(b.name));
    assert.equal(byNameAsc[0].name, 'Alpha.mp4');
    assert.equal(byNameAsc[2].name, 'Gama.mp4');

    // Ordenação Recentes (mtime DESC)
    const byRecent = [...list].sort((a, b) => b.mtime - a.mtime);
    assert.equal(byRecent[0].name, 'Alpha.mp4');
    assert.equal(byRecent[2].name, 'Beta.mp4');

    // Ordenação Tamanho DESC
    const bySizeDesc = [...list].sort((a, b) => b.sizeBytes - a.sizeBytes);
    assert.equal(bySizeDesc[0].name, 'Gama.mp4');
    assert.equal(bySizeDesc[2].name, 'Alpha.mp4');
  });
});
