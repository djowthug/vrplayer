// tests/video-profile.test.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { VideoProfileManager } from '../js/utils/video-profile.js';

// Mock simples de localStorage e fetch para ambiente Node.js
function setupBrowserMocks(initialServerData = {}) {
  const store = new Map();
  const fetchCalls = [];

  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear()
  };

  globalThis.fetch = async (url, options = {}) => {
    fetchCalls.push({ url, options });
    if (options.method === 'POST') {
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return {
      ok: true,
      json: async () => initialServerData
    };
  };

  return { store, fetchCalls };
}

describe('VideoProfileManager', () => {
  let mocks;

  beforeEach(() => {
    mocks = setupBrowserMocks();
  });

  it('deve gerar uma chave única consistente baseada no nome do arquivo e tamanho', () => {
    const manager = new VideoProfileManager();
    const videoA = { name: 'folder/sub/Praia_180_SBS.mp4', size: 104857600 };
    const videoB = { name: 'outra_pasta/Praia_180_SBS.mp4', size: 104857600 };

    // Mesmo mudando de pasta, a chave permanece idêntica
    assert.equal(manager.getVideoKey(videoA), 'Praia_180_SBS.mp4_104857600');
    assert.equal(manager.getVideoKey(videoA), manager.getVideoKey(videoB));
  });

  it('deve salvar e recuperar o segundo exato de reprodução com force=true', () => {
    const manager = new VideoProfileManager();
    const video = { name: 'show_360.mp4', size: 500000 };

    manager.saveProgress(video, 145.8, 600, true);

    const saved = manager.get(video);
    assert.ok(saved);
    assert.equal(saved.currentTime, 145);
    assert.equal(saved.duration, 600);
    assert.equal(saved.completed, false);
  });

  it('deve respeitar o throttle de 3 segundos quando force=false', () => {
    const manager = new VideoProfileManager();
    const video = { name: 'filme_imax.mkv', size: 900000 };

    // Primeiro save passa normalmente
    manager.saveProgress(video, 30, 1200, false);
    assert.equal(manager.get(video).currentTime, 30);

    // Segundo save imediato com force=false deve ser ignorado pelo throttle
    manager.saveProgress(video, 31, 1200, false);
    assert.equal(manager.get(video).currentTime, 30);

    // Com force=true (ex: evento pause), grava imediatamente
    manager.saveProgress(video, 48, 1200, true);
    assert.equal(manager.get(video).currentTime, 48);
  });

  it('deve zerar currentTime e marcar completed=true quando passar de 97% do vídeo', () => {
    const manager = new VideoProfileManager();
    const video = { name: 'documentario_vr.mp4', size: 250000 };

    // Salva aos 595s de um vídeo de 600s (>97% e faltando menos de 10s)
    manager.saveProgress(video, 595, 600, true);

    const saved = manager.get(video);
    assert.equal(saved.currentTime, 0);
    assert.equal(saved.completed, true);
  });

  it('deve salvar e mesclar ajustes finos de perfil sem perder o progresso de tempo', () => {
    const manager = new VideoProfileManager();
    const video = { name: 'mal_nomeado.mp4', size: 777000 };

    manager.saveProgress(video, 210, 900, true);
    manager.saveProfileSettings(video, {
      projection: 'fisheye',
      stereo: 'sbs',
      fisheyeFov: 190,
      exposure: 0.2
    });

    // Atualiza apenas a curvatura depois
    manager.saveProfileSettings(video, { curvature: 45 });

    const saved = manager.get(video);
    assert.equal(saved.currentTime, 210);
    assert.deepEqual(saved.profile, {
      projection: 'fisheye',
      stereo: 'sbs',
      fisheyeFov: 190,
      exposure: 0.2,
      curvature: 45
    });
  });

  it('deve sincronizar com o servidor priorizando o registro com updatedAt mais recente', async () => {
    const video = { name: 'viagem_quest.mp4', size: 123456 };
    const key = 'viagem_quest.mp4_123456';

    // Servidor tem um progresso mais novo (feito no óculos VR às 2000ms)
    setupBrowserMocks({
      [key]: {
        currentTime: 500,
        duration: 1000,
        updatedAt: 2000,
        profile: { projection: '180', stereo: 'sbs' }
      }
    });

    const manager = new VideoProfileManager();
    // Local tem um registro antigo (1000ms)
    manager.cache[key] = {
      currentTime: 120,
      duration: 1000,
      updatedAt: 1000
    };

    await manager.syncFromServer();

    const synced = manager.get(video);
    assert.equal(synced.currentTime, 500);
    assert.equal(synced.profile.projection, '180');
  });

  it('deve permitir resetar apenas o perfil visual mantendo o tempo assistido', () => {
    const manager = new VideoProfileManager();
    const video = { name: 'teste_reset.mp4', size: 333000 };

    manager.saveProgress(video, 88, 400, true);
    manager.saveProfileSettings(video, { projection: '360', exposure: 0.5 });

    manager.resetProfile(video);

    const saved = manager.get(video);
    assert.equal(saved.currentTime, 88);
    assert.equal(saved.profile, undefined);
  });
});
