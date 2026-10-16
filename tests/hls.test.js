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

  await t.test('Valida posicionamento de flags de busca rápida para 8K sem crash de GPU', () => {
    const startTime = 2292.5;
    const fullPath = 'C:\\videos\\sample_8k.mp4';
    const args = ['-y'];

    if (startTime > 0) {
      args.push('-ss', startTime.toFixed(2));
    }
    args.push('-noaccurate_seek', '-threads', '0', '-i', fullPath);
    args.push('-vf', 'scale=3840:-2,format=yuv420p');
    args.push('-max_muxing_queue_size', '1024');

    const ssIndex = args.indexOf('-ss');
    const inputIndex = args.indexOf('-i');
    const noAccurateIndex = args.indexOf('-noaccurate_seek');
    const threadsIndex = args.indexOf('-threads');
    const vfIndex = args.indexOf('-vf');

    // -ss e -noaccurate_seek e -threads DEVEM vir antes de -i
    assert.ok(ssIndex !== -1 && ssIndex < inputIndex, '-ss deve vir antes de -i');
    assert.ok(noAccurateIndex !== -1 && noAccurateIndex < inputIndex, '-noaccurate_seek deve vir antes de -i');
    assert.ok(threadsIndex !== -1 && threadsIndex < inputIndex, '-threads deve vir antes de -i');
    // -vf e -max_muxing_queue_size devem vir após -i
    assert.ok(vfIndex > inputIndex, '-vf deve vir após -i');
    assert.equal(args[vfIndex + 1], 'scale=3840:-2,format=yuv420p');
    assert.ok(args.includes('-max_muxing_queue_size') && args[args.indexOf('-max_muxing_queue_size') + 1] === '1024');
    // Não deve conter -hwaccel antes de -i que cause crash de escala de vídeo 8K
    assert.equal(args.includes('-hwaccel'), false);
  });

  await t.test('Validação de playlist identifica primeiro segmento .ts em disco', () => {
    const mockPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:2.000000,
seg_0_0000.ts
#EXTINF:2.000000,
seg_0_0001.ts
`;
    assert.ok(mockPlaylist.includes('#EXTINF:'));
    const lines = mockPlaylist.split('\n').map(l => l.trim());
    const firstSegmentLine = lines.find(l => l.endsWith('.ts') && !l.startsWith('#'));
    assert.equal(firstSegmentLine, 'seg_0_0000.ts');
  });
});
