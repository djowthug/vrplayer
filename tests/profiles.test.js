// Teste automatizado de Persistência Híbrida de Perfis e Retomada de Reprodução
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateVideoKey,
  sanitizeProfile,
  loadVideoProfiles,
  saveVideoProfiles,
  getVideoProfile,
  updateVideoProfile,
  deleteVideoProfile,
} from '../scripts/profiles-service.js';
import {
  extractProfileFromState,
  applyProfileToState,
} from '../js/profiles.js';
import { VideoProfileManager } from '../js/utils/video-profile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_PROFILES_FILE = path.join(__dirname, 'test-video-profiles.json');

test('Perfis de Vídeo e Retomada Automática', async (t) => {
  // Limpeza de ambiente de teste
  t.afterEach(() => {
    try {
      if (fs.existsSync(TEST_PROFILES_FILE)) fs.unlinkSync(TEST_PROFILES_FILE);
    } catch {}
  });

  await t.test('generateVideoKey normaliza nomes e vincula tamanho em bytes', () => {
    // 1. Chave consistente independente do caminho da pasta
    const key1 = generateVideoKey('insta360_ferias.mp4', 14582910);
    const keyFromSubfolder = generateVideoKey('Viagens/Praia/insta360_ferias.mp4', 14582910);
    assert.equal(key1, 'vid_insta360_ferias.mp4_14582910');
    assert.equal(keyFromSubfolder, 'vid_Viagens_Praia_insta360_ferias.mp4_14582910');

    // 2. Mesma chave para arquivos idênticos movidos de pasta
    const baseName = path.basename('C:\\Users\\User\\Videos\\VR\\meuvideo.mp4');
    const movedBaseName = path.basename('E:\\MeusVR\\meuvideo.mp4');
    assert.equal(
      generateVideoKey(baseName, 524288000),
      generateVideoKey(movedBaseName, 524288000)
    );

    // 3. Sanitização de caracteres proibidos
    const dirty = generateVideoKey('video"teste*:<>?.mp4', 1000);
    assert.equal(dirty, 'vid_videoteste.mp4_1000');
  });

  await t.test('sanitizeProfile valida e aplica limites nos parâmetros ópticos e de imagem', () => {
    const raw = {
      projection: 'invalid_projection',
      stereo: 'sbs',
      swap: true,
      fisheyeFov: 280, // Acima do limite (max 240)
      fisheyeScale: 0.5, // Abaixo do limite (min 0.7)
      curvature: 1.5, // Acima do limite (max 1.0)
      exposure: 3.0, // Acima do limite (max 1.5)
      brightness: -1.0, // Abaixo do limite (min -0.5)
      contrast: 0.2, // Abaixo do limite (min 0.4)
      saturation: 1.25,
      gamma: 0.9,
      pitchOffset: 120, // Acima do limite (max 85)
      spatialAudio: 'ambisonics-foa',
      dominantEye: 'left',
    };

    const clean = sanitizeProfile(raw);

    assert.equal(clean.projection, '360'); // Fallback para 360 padrão
    assert.equal(clean.stereo, 'sbs');
    assert.equal(clean.swap, true);
    assert.equal(clean.fisheyeFov, 240);
    assert.equal(clean.fisheyeScale, 0.7);
    assert.equal(clean.curvature, 1.0);
    assert.equal(clean.exposure, 1.5);
    assert.equal(clean.brightness, -0.5);
    assert.equal(clean.contrast, 0.4);
    assert.equal(clean.saturation, 1.25);
    assert.equal(clean.gamma, 0.9);
    assert.equal(clean.pitchOffset, 85);
    assert.equal(clean.spatialAudio, 'ambisonics-foa');
    assert.equal(clean.dominantEye, 'left');
  });

  await t.test('Persistência e recuperação em video-profiles.json', () => {
    const key = 'vid_filme_vr.mp4_104857600';
    const profileData = {
      currentTime: 125.4,
      duration: 600,
      completed: false,
      profile: {
        projection: 'fisheye',
        stereo: 'sbs',
        fisheyeFov: 190,
        curvature: 0.45,
        exposure: 0.2,
        brightness: 0.0,
        contrast: 1.05,
        saturation: 1.1,
        gamma: 1.0,
        pitchOffset: 15,
        spatialAudio: 'stereo-headtracked',
      },
    };

    // Atualiza perfil no arquivo de teste
    const saved = updateVideoProfile(key, profileData, TEST_PROFILES_FILE);
    assert.equal(saved.currentTime, 125.4);
    assert.equal(saved.duration, 600);
    assert.equal(saved.completed, false);
    assert.equal(saved.profile.projection, 'fisheye');
    assert.equal(saved.profile.fisheyeFov, 190);
    assert.equal(saved.profile.pitchOffset, 15);
    assert.ok(saved.updatedAt > 0);

    // Lê do disco e verifica integridade
    const loaded = getVideoProfile(key, TEST_PROFILES_FILE);
    assert.deepEqual(loaded, saved);

    // Marca como concluído (> 92% da duração)
    const completedUpdate = updateVideoProfile(key, { currentTime: 580, duration: 600 }, TEST_PROFILES_FILE);
    assert.equal(completedUpdate.completed, true);

    // Deleta perfil
    const deleted = deleteVideoProfile(key, TEST_PROFILES_FILE);
    assert.equal(deleted, true);
    assert.equal(getVideoProfile(key, TEST_PROFILES_FILE), null);
  });

  await t.test('extractProfileFromState e applyProfileToState sincronizam motores corretamente', () => {
    const mockState = {
      format: { projection: '180', layout: 'sbs', swap: true },
      image: { exposure: 0.15, brightness: 0.05, contrast: 1.1, saturation: 1.2, gamma: 0.95 },
      fisheye: { fov: 185, scale: 1.05 },
      cinema: { curvature: 0.5, distance: 3.2, scale: 1.1 },
      audioSpatialType: 'ambisonics-foa',
      dominantEye: 'right',
    };

    const mockLook = {
      pitchOffset: 0,
      getPitchOffsetDeg: () => 20,
      setPitchOffset: (rad) => { mockLook.pitchOffset = rad; },
    };

    const mockVr = {
      format: null,
      image: null,
      fisheye: null,
      cinema: null,
      setFormat: (f) => { mockVr.format = f; },
      setImage: (img) => { mockVr.image = img; },
      setFisheyeSettings: (fe) => { mockVr.fisheye = fe; },
      setCinemaScreen: (cin) => { mockVr.cinema = cin; },
    };

    const mockSpatial = { enabled: true };

    // Extração do perfil
    const extracted = extractProfileFromState(mockState, mockLook, mockVr, mockSpatial);
    assert.equal(extracted.projection, '180');
    assert.equal(extracted.stereo, 'sbs');
    assert.equal(extracted.swap, true);
    assert.equal(extracted.exposure, 0.15);
    assert.equal(extracted.pitchOffset, 20);
    assert.equal(extracted.curvature, 0.5);
    assert.equal(extracted.spatialAudio, 'ambisonics-foa');
    assert.equal(extracted.dominantEye, 'right');

    // Aplicação de novo perfil a outro estado
    const targetState = {
      format: { projection: '360', layout: 'mono', swap: false },
      image: { exposure: 0, brightness: 0, contrast: 1, saturation: 1, gamma: 1 },
      fisheye: { fov: 180, scale: 1.0 },
      cinema: { curvature: 0.35, distance: 2.8, scale: 1.0 },
      dominantEye: 'both',
    };

    let dominantEyeApplied = '';
    let spatialModeApplied = '';
    const callbacks = {
      setDominantEye: (eye) => { dominantEyeApplied = eye; },
      setSpatialAudioMode: (mode) => { spatialModeApplied = mode; },
      syncSliders: () => {},
      renderFormatUI: () => {},
    };

    const applied = applyProfileToState(
      { profile: extracted },
      targetState,
      mockVr,
      mockLook,
      mockSpatial,
      callbacks
    );

    assert.equal(applied, true);
    assert.equal(targetState.format.projection, '180');
    assert.equal(targetState.format.layout, 'sbs');
    assert.equal(targetState.format.swap, true);
    assert.equal(targetState.image.exposure, 0.15);
    assert.equal(targetState.cinema.curvature, 0.5);
    assert.equal(dominantEyeApplied, 'right');
    assert.equal(spatialModeApplied, 'ambisonics-foa');
    assert.equal(Math.round(mockLook.pitchOffset * (180 / Math.PI)), 20);
  });

  await t.test('VideoProfileManager (js/utils/video-profile.js) gerencia chave, progresso, perfil e retenção', () => {
    const manager = new VideoProfileManager();
    const videoItem = {
      name: 'Viagens/Praia/vr_rollercoaster_180.mp4',
      size: 85000000,
    };

    const key = manager.getVideoKey(videoItem);
    assert.equal(key, 'vr_rollercoaster_180.mp4_85000000');

    // Salvar configurações de perfil
    manager.saveProfileSettings(videoItem, {
      projection: '180',
      stereo: 'sbs',
      exposure: 0.3,
    });

    let saved = manager.get(videoItem);
    assert.ok(saved);
    assert.equal(saved.profile.projection, '180');
    assert.equal(saved.profile.stereo, 'sbs');
    assert.equal(saved.profile.exposure, 0.3);

    // Salvar progresso no meio do vídeo
    manager.saveProgress(videoItem, 120, 300, true);
    saved = manager.get(videoItem);
    assert.equal(saved.currentTime, 120);
    assert.equal(saved.duration, 300);
    assert.equal(saved.completed, false);

    // Salvar progresso ao final (>97%) -> zera currentTime e marca completed
    manager.saveProgress(videoItem, 295, 300, true);
    saved = manager.get(videoItem);
    assert.equal(saved.currentTime, 0);
    assert.equal(saved.completed, true);

    // Resetar perfil customizado
    manager.resetProfile(videoItem);
    saved = manager.get(videoItem);
    assert.equal(saved.profile, undefined);
    assert.equal(saved.completed, true);
  });

  await t.test('formatTime e cálculo de progresso produzem marcações corretas', async () => {
    const { formatTime } = await import('../js/utils/format.js');
    assert.equal(formatTime(65), '1:05');
    assert.equal(formatTime(412), '6:52');
    assert.equal(formatTime(3665), '1:01:05');

    const manager = new VideoProfileManager();
    const item = { name: 'sample_overlay.mp4', size: 500000 };

    // Inicial sem perfil
    assert.equal(manager.get(item), null);

    // Com perfil de projeção/estéreo e progresso em andamento
    manager.saveProfileSettings(item, { projection: '180', stereo: 'sbs' });
    manager.saveProgress(item, 412, 1000, true);
    const inProgress = manager.get(item);
    assert.equal(inProgress.profile.projection, '180');
    assert.equal(inProgress.profile.stereo, 'sbs');
    assert.equal(inProgress.currentTime, 412);
    assert.equal(inProgress.completed, false);

    const percent = Math.min(99, Math.max(2, Math.round((inProgress.currentTime / inProgress.duration) * 100)));
    assert.equal(percent, 41);

    // Vídeo concluído
    manager.saveProgress(item, 990, 1000, true);
    const finished = manager.get(item);
    assert.equal(finished.completed, true);
    assert.equal(finished.currentTime, 0);
  });
});

