import test from 'node:test';
import assert from 'node:assert/strict';
import { SPEAKER_LAYOUTS, SpatialAudioEngine } from '../js/spatial-audio.js';

test('Motor de Áudio Espacial (js/spatial-audio.js)', async (t) => {
  await t.test('Layouts de caixas de som virtuais (SPEAKER_LAYOUTS) definidos corretamente', () => {
    // 1. Estéreo Ancorado (2 canais: Front-Left e Front-Right)
    const stereo = SPEAKER_LAYOUTS['stereo-headtracked'];
    assert.equal(stereo.length, 2);
    assert.deepEqual(stereo[0], [-1.8, 0.0, -2.5]);
    assert.deepEqual(stereo[1], [1.8, 0.0, -2.5]);

    // 2. Ambisonics FOA (4 canais: 4 cantos esféricos)
    const foa = SPEAKER_LAYOUTS['ambisonics-foa'];
    assert.equal(foa.length, 4);
    assert.deepEqual(foa[0], [-2.0, 0.5, -2.0]);
    assert.deepEqual(foa[1], [2.0, 0.5, -2.0]);
    assert.deepEqual(foa[2], [-2.0, -0.5, 2.0]);
    assert.deepEqual(foa[3], [2.0, -0.5, 2.0]);

    // 3. Surround 5.1 (6 canais: L, R, Center, LFE, SL, SR)
    const surround51 = SPEAKER_LAYOUTS['surround-5.1'];
    assert.equal(surround51.length, 6);
    assert.deepEqual(surround51[0], [-2.2, 0.0, -2.5]); // Front Left
    assert.deepEqual(surround51[1], [2.2, 0.0, -2.5]);  // Front Right
    assert.deepEqual(surround51[2], [0.0, 0.0, -3.0]);  // Center tela
    assert.deepEqual(surround51[3], [0.0, -1.0, -2.0]); // LFE Subwoofer
    assert.deepEqual(surround51[4], [-2.8, 0.0, 1.2]);  // Surround Left
    assert.deepEqual(surround51[5], [2.8, 0.0, 1.2]);   // Surround Right
  });

  await t.test('Instanciação e estado padrão da classe SpatialAudioEngine', () => {
    const mockVideo = {};
    const engine = new SpatialAudioEngine(mockVideo);

    assert.equal(engine.video, mockVideo);
    assert.equal(engine.enabled, false);
    assert.equal(engine.mode, 'none');
    assert.equal(engine.ctx, null);
    assert.equal(engine.panners.length, 0);
  });

  await t.test('Orientação do listener com rotação da câmera Three.js', () => {
    const mockVideo = {};
    const engine = new SpatialAudioEngine(mockVideo);

    // Mock simples do AudioContext e Listener Web Audio API
    let listenerState = { forwardX: 0, forwardY: 0, forwardZ: -1, upX: 0, upY: 1, upZ: 0 };
    engine.ctx = {
      listener: {
        forwardX: { value: 0 },
        forwardY: { value: 0 },
        forwardZ: { value: 0 },
        upX: { value: 0 },
        upY: { value: 0 },
        upZ: { value: 0 },
      }
    };
    engine.enabled = true;

    // Câmera olhando reto para frente (quaternion neutro: 0, 0, 0, 1)
    const mockCamera = {
      quaternion: { x: 0, y: 0, z: 0, w: 1 }
    };

    engine.updateListenerFromCamera(mockCamera);
    assert.equal(engine.ctx.listener.forwardX.value, 0);
    assert.equal(engine.ctx.listener.forwardY.value, 0);
    assert.equal(engine.ctx.listener.forwardZ.value, -1);
    assert.equal(engine.ctx.listener.upX.value, 0);
    assert.equal(engine.ctx.listener.upY.value, 1);
    assert.equal(engine.ctx.listener.upZ.value, 0);
  });

  await t.test('Limpeza e desconexão de panners (clearPanners e destroy)', () => {
    const mockVideo = {};
    const engine = new SpatialAudioEngine(mockVideo);

    let disconnectedPanner = false;
    let disconnectedSplitter = false;

    engine.splitter = {
      disconnect: () => { disconnectedSplitter = true; }
    };
    engine.source = {
      disconnect: () => {}
    };
    engine.panners = [
      { disconnect: () => { disconnectedPanner = true; } }
    ];

    engine.clearPanners();
    assert.equal(disconnectedSplitter, true);
    assert.equal(disconnectedPanner, true);
    assert.equal(engine.splitter, null);
    assert.equal(engine.panners.length, 0);
  });
});
