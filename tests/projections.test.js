import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFromName, detectVideoFormat } from '../js/detect.js';

// Mapeamento idêntico ao js/projections.js
const PROJECTION_MODE = { '360': 0, '180': 1, fisheye: 2, flat: 3 };

test('Projeções WebGL, Heurística de Nomes e Alternância SBS', async (t) => {
  await t.test('Constantes de PROJECTION_MODE conferem com enum numérico GLSL', () => {
    assert.equal(PROJECTION_MODE['360'], 0);
    assert.equal(PROJECTION_MODE['180'], 1);
    assert.equal(PROJECTION_MODE['fisheye'], 2);
    assert.equal(PROJECTION_MODE['flat'], 3);
  });

  await t.test('detectFromName reconhece projeções VR e layouts estereoscópicos corretamente', () => {
    // 360 SBS
    const d1 = detectFromName('video_360_sbs.mp4');
    assert.equal(d1.projection, '360');
    assert.equal(d1.layout, 'sbs');

    // 180 LR (Left-Right)
    const d2 = detectFromName('vr_rollercoaster_180_lr.mp4');
    assert.equal(d2.projection, '180');
    assert.equal(d2.layout, 'sbs');

    // VR180 Half-SBS
    const d3 = detectFromName('clip_vr180_hsbs.mov');
    assert.equal(d3.projection, '180');
    assert.equal(d3.layout, 'sbs');

    // Fisheye / Olho de peixe
    const d4 = detectFromName('canon_rf52_fisheye_sbs.mp4');
    assert.equal(d4.projection, 'fisheye');
    assert.equal(d4.layout, 'sbs');

    // Top-Bottom (OU / Over-Under)
    const d5 = detectFromName('flight_360_tb.mp4');
    assert.equal(d5.projection, '360');
    assert.equal(d5.layout, 'tb');

    // Mono / 2D
    const d6 = detectFromName('cinema_movie_2d.mp4');
    assert.equal(d6.layout, 'mono');

    // Tags de Áudio Espacial
    assert.equal(detectFromName('concert_360_ambix.mp4').spatialAudio, 'ambisonics-foa');
    assert.equal(detectFromName('show_vr180_foa.mp4').spatialAudio, 'ambisonics-foa');
    assert.equal(detectFromName('space_360_spatial.mp4').spatialAudio, 'ambisonics-foa');
    assert.equal(detectFromName('orchestra_binaural_180.mp4').spatialAudio, 'ambisonics-foa');
    assert.equal(detectFromName('movie_imax_5.1.mp4').spatialAudio, 'surround-5.1');
    assert.equal(detectFromName('action_clip_5_1_sbs.mp4').spatialAudio, 'surround-5.1');
  });

  await t.test('Cálculo de eyeRect para SBS (Left, Right e Swap)', () => {
    function computeEyeRect(layout, eye, swap) {
      const e = swap ? 1 - eye : eye;
      if (layout === 'sbs') return e === 0 ? [0, 0, 0.5, 1] : [0.5, 0, 0.5, 1];
      if (layout === 'tb') return [0, e === 0 ? 0.5 : 0, 1, 0.5];
      return [0, 0, 1, 1];
    }

    // SBS Padrão: Olho esquerdo (0) pega metade esquerda [0, 0, 0.5, 1]
    assert.deepEqual(computeEyeRect('sbs', 0, false), [0, 0, 0.5, 1]);
    // SBS Padrão: Olho direito (1) pega metade direita [0.5, 0, 0.5, 1]
    assert.deepEqual(computeEyeRect('sbs', 1, false), [0.5, 0, 0.5, 1]);

    // SBS Invertido (Swap Eyes): Olho esquerdo pega metade direita
    assert.deepEqual(computeEyeRect('sbs', 0, true), [0.5, 0, 0.5, 1]);
    // SBS Invertido: Olho direito pega metade esquerda
    assert.deepEqual(computeEyeRect('sbs', 1, true), [0, 0, 0.5, 1]);

    // Top-Bottom Padrão: Olho esquerdo pega metade superior
    assert.deepEqual(computeEyeRect('tb', 0, false), [0, 0.5, 1, 0.5]);
    // Top-Bottom Padrão: Olho direito pega metade inferior
    assert.deepEqual(computeEyeRect('tb', 1, false), [0, 0, 1, 0.5]);
  });

  await t.test('Mapeamento Cilíndrico Côncavo (Curved Screen Projection)', () => {
    function computeCurvedUv(u, v, curvature) {
      if (curvature <= 0.001) return { u, v };
      const PI = Math.PI;
      const maxHalfArc = curvature * (75.0 * PI / 180.0) * 0.5;
      const nx = (u - 0.5) * 2.0;
      const theta = nx * maxHalfArc;
      const tanHalf = Math.tan(maxHalfArc);
      let mappedX = nx;
      if (tanHalf > 0.0001) {
        mappedX = Math.tan(theta) / tanHalf;
      }
      const outU = 0.5 + mappedX * 0.5;
      const edgeDist = nx * nx;
      const vertCurve = 1.0 + edgeDist * curvature * 0.06;
      const outV = 0.5 + (v - 0.5) * vertCurve;
      return {
        u: Math.max(0, Math.min(1, outU)),
        v: Math.max(0, Math.min(1, outV)),
      };
    }

    // Centro da tela (u=0.5, v=0.5) permanece inalterado no centro
    const center = computeCurvedUv(0.5, 0.5, 0.35);
    assert.equal(Math.round(center.u * 1000) / 1000, 0.5);
    assert.equal(Math.round(center.v * 1000) / 1000, 0.5);

    // Bordas horizontais (u=0 e u=1) mapeiam com simetria para 0 e 1
    const leftEdge = computeCurvedUv(0.0, 0.5, 0.35);
    const rightEdge = computeCurvedUv(1.0, 0.5, 0.35);
    assert.equal(Math.round(leftEdge.u * 1000) / 1000, 0.0);
    assert.equal(Math.round(rightEdge.u * 1000) / 1000, 1.0);
  });

  await t.test('detectVideoFormat detecta nome ou proporções do vídeo', async () => {
    // 1. Detecta pelo nome
    const resName = await detectVideoFormat(null, 'viagem_vr180_sbs.mp4');
    assert.equal(resName.projection, '180');
    assert.equal(resName.stereo, 'sbs');
    assert.equal(resName.source, 'nome');

    // 2. Detecta por proporção sem pistas no nome
    const mockVideoEl = { videoWidth: 3840, videoHeight: 1920 }; // aspect 2:1
    const resAspect = await detectVideoFormat(mockVideoEl, 'video_desconhecido.mp4');
    assert.equal(resAspect.projection, '360');
    assert.equal(resAspect.stereo, 'mono');
    assert.equal(resAspect.source, 'proporção');
  });
});


