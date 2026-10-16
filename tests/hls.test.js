import test from 'node:test';
import assert from 'node:assert/strict';
import { getHlsAudioArgs } from '../scripts/hls-streamer.js';

// Regras de compatibilidade direta com Safari iOS extraídas de scripts/hls-streamer.js
function evaluateDirectCompatibility({ ext, vCodec, aCodec, width }) {
  const isIosContainer = ext === '.mp4' || ext === '.mov' || ext === '.m4v';
  const isIosVideo = vCodec === 'h264' || vCodec === 'hevc';
  const isIosAudio = !aCodec || aCodec === 'aac' || aCodec === 'mp3';
  const is4kOrLess = width > 0 && width <= 3840;
  const isDirectCompatible = isIosContainer && isIosVideo && isIosAudio && is4kOrLess;
  const is8k = width > 3840;

  let reason = 'Compatível direto';
  if (!isDirectCompatible) {
    if (is8k) reason = `Resolução ${width}px > 4K (requer downscale para 3840px)`;
    else if (!isIosContainer) reason = `Contêiner ${ext.toUpperCase()} incompatível com Safari`;
    else if (!isIosVideo) reason = `Codec de vídeo ${vCodec} requer H.264`;
    else if (!isIosAudio) reason = `Áudio ${aCodec} requer conversão AAC`;
  }

  return {
    isDirectCompatible,
    needsDownscale: is8k,
    reason,
  };
}

// Cálculo seguro de Fast-Seek (-ss)
function calculateSafeSeekTime(targetTime, mediaDuration) {
  return Math.max(0, Math.min(targetTime, Math.max(0, (mediaDuration || 10) - 1)));
}

test('Transcodificação HLS e Fast-Seek (-ss)', async (t) => {
  await t.test('Identifica MP4 H.264/AAC 1080p como Compatível Direto (sem transcode)', () => {
    const res = evaluateDirectCompatibility({
      ext: '.mp4',
      vCodec: 'h264',
      aCodec: 'aac',
      width: 1920,
    });
    assert.equal(res.isDirectCompatible, true);
    assert.equal(res.needsDownscale, false);
    assert.equal(res.reason, 'Compatível direto');
  });

  await t.test('Identifica vídeo 8K (7680x3840) exigindo downscale ativo para 3840px', () => {
    const res = evaluateDirectCompatibility({
      ext: '.mp4',
      vCodec: 'h264',
      aCodec: 'aac',
      width: 7680,
    });
    assert.equal(res.isDirectCompatible, false);
    assert.equal(res.needsDownscale, true);
    assert.match(res.reason, /requer downscale para 3840px/);
  });

  await t.test('Identifica MKV exigindo transcodificação HLS devido a contêiner incompatível', () => {
    const res = evaluateDirectCompatibility({
      ext: '.mkv',
      vCodec: 'h264',
      aCodec: 'aac',
      width: 3840,
    });
    assert.equal(res.isDirectCompatible, false);
    assert.match(res.reason, /Contêiner \.MKV incompatível com Safari/);
  });

  await t.test('Identifica áudio AC3 exigindo conversão para AAC estéreo', () => {
    const res = evaluateDirectCompatibility({
      ext: '.mp4',
      vCodec: 'h264',
      aCodec: 'ac3',
      width: 3840,
    });
    assert.equal(res.isDirectCompatible, false);
    assert.match(res.reason, /Áudio ac3 requer conversão AAC/);
  });

  await t.test('Identifica codec VP9/AV1 exigindo transcodificação para H.264', () => {
    const res = evaluateDirectCompatibility({
      ext: '.webm',
      vCodec: 'vp9',
      aCodec: 'opus',
      width: 1920,
    });
    assert.equal(res.isDirectCompatible, false);
  });

  await t.test('Calcula clamping de tempo para Fast-Seek (-ss)', () => {
    const duration = 120.0; // 2 minutos
    assert.equal(calculateSafeSeekTime(35.5, duration), 35.5);
    assert.equal(calculateSafeSeekTime(-10, duration), 0);
    assert.equal(calculateSafeSeekTime(150, duration), 119.0); // clamped duration - 1s
  });

  await t.test('getHlsAudioArgs preserva 4 canais a 384k para Ambisonics FOA', () => {
    const args = getHlsAudioArgs('ambisonics-foa');
    assert.deepEqual(args, ['-c:a', 'aac', '-b:a', '384k', '-ac', '4']);
  });

  await t.test('getHlsAudioArgs preserva 6 canais a 512k para Surround 5.1 e 7.1', () => {
    const args51 = getHlsAudioArgs('surround-5.1');
    assert.deepEqual(args51, ['-c:a', 'aac', '-b:a', '512k', '-ac', '6']);

    const args71 = getHlsAudioArgs('surround-7.1');
    assert.deepEqual(args71, ['-c:a', 'aac', '-b:a', '512k', '-ac', '6']);
  });

  await t.test('getHlsAudioArgs usa estéreo padrão (-ac 2, 256k) para outros formatos', () => {
    const argsStereo = getHlsAudioArgs('stereo-headtracked');
    assert.deepEqual(argsStereo, ['-c:a', 'aac', '-b:a', '256k', '-ac', '2']);

    const argsDefault = getHlsAudioArgs(null);
    assert.deepEqual(argsDefault, ['-c:a', 'aac', '-b:a', '256k', '-ac', '2']);
  });
});
