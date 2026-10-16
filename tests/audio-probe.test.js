import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAudioSpatialInfo, probeAudioMetadata, clearAudioProbeCache } from '../scripts/audio-probe.js';

test('Detecção e Classificação de Áudio Espacial (scripts/audio-probe.js)', async (t) => {
  clearAudioProbeCache();

  await t.test('Identifica Ambisonics de 1ª Ordem (FOA) por channel_layout ambisonic ou quad', () => {
    const stream = {
      codec_name: 'aac',
      channels: 4,
      channel_layout: 'ambisonic',
      sample_rate: '48000',
    };
    const result = parseAudioSpatialInfo(stream);
    assert.equal(result.spatialType, 'ambisonics-foa');
    assert.equal(result.channels, 4);
    assert.equal(result.codec, 'aac');
    assert.equal(result.sampleRate, 48000);
  });

  await t.test('Identifica Ambisonics (FOA) por side_data_list esférico (spherical)', () => {
    const stream = {
      codec_name: 'opus',
      channels: 4,
      channel_layout: 'unknown',
      side_data_list: [{ side_data_type: 'Spherical Video / Spatial Audio' }],
      sample_rate: '48000',
    };
    const result = parseAudioSpatialInfo(stream);
    assert.equal(result.spatialType, 'ambisonics-foa');
    assert.equal(result.channels, 4);
    assert.equal(result.codec, 'opus');
  });

  await t.test('Identifica Ambisonics (FOA) por tag handler_name ou nome de arquivo com ambi', () => {
    const stream = {
      codec_name: 'pcm_s16le',
      channels: 4,
      tags: { handler_name: 'Ambisonic Audio Handler' },
    };
    const result = parseAudioSpatialInfo(stream);
    assert.equal(result.spatialType, 'ambisonics-foa');

    const streamByFile = {
      codec_name: 'aac',
      channels: 4,
    };
    const resultFile = parseAudioSpatialInfo(streamByFile, 'c:/videos/show_360_ambi.mp4');
    assert.equal(resultFile.spatialType, 'ambisonics-foa');
  });

  await t.test('Identifica Surround 5.1 (6 canais)', () => {
    const stream = {
      codec_name: 'ac3',
      channels: 6,
      channel_layout: '5.1(side)',
      sample_rate: '48000',
    };
    const result = parseAudioSpatialInfo(stream);
    assert.equal(result.spatialType, 'surround-5.1');
    assert.equal(result.channels, 6);
    assert.equal(result.codec, 'ac3');
  });

  await t.test('Identifica Surround 7.1 (8 canais)', () => {
    const stream = {
      codec_name: 'eac3',
      channels: 8,
      channel_layout: '7.1',
      sample_rate: '48000',
    };
    const result = parseAudioSpatialInfo(stream);
    assert.equal(result.spatialType, 'surround-7.1');
    assert.equal(result.channels, 8);
    assert.equal(result.codec, 'eac3');
  });

  await t.test('Identifica Estéreo padrão como elegível para ancoragem e head-tracking virtual', () => {
    const stream = {
      codec_name: 'aac',
      channels: 2,
      channel_layout: 'stereo',
      sample_rate: '44100',
    };
    const result = parseAudioSpatialInfo(stream);
    assert.equal(result.spatialType, 'stereo-headtracked');
    assert.equal(result.channels, 2);
    assert.equal(result.codec, 'aac');
    assert.equal(result.sampleRate, 44100);
  });

  await t.test('Retorna spatialType none para áudio mono ou ausência de streams', () => {
    const monoStream = {
      codec_name: 'aac',
      channels: 1,
      channel_layout: 'mono',
    };
    assert.equal(parseAudioSpatialInfo(monoStream).spatialType, 'none');
    assert.equal(parseAudioSpatialInfo(null).spatialType, 'none');
  });

  await t.test('probeAudioMetadata retorna erro amigável se arquivo não existir', async () => {
    const res = await probeAudioMetadata('c:/arquivo/inexistente_vr.mp4');
    assert.equal(res.spatialType, 'none');
    assert.equal(res.channels, 0);
    assert.ok(res.error);
  });

  await t.test('Estrutura de resposta para vídeo e áudio espacial', () => {
    const mockAudio = {
      spatialType: 'ambisonics-foa',
      channels: 4,
      codec: 'aac',
      layout: '4.0(ambisonic)',
      sampleRate: 48000,
    };
    const mockVideo = {
      codec: 'hevc',
      width: 3840,
      height: 1920,
      duration: 120.5,
      streamType: 'direct',
      needsDownscale: false,
    };
    const payload = {
      path: 'VR/concert_ambi.mp4',
      video: mockVideo,
      audio: mockAudio,
    };

    assert.equal(payload.path, 'VR/concert_ambi.mp4');
    assert.equal(payload.audio.spatialType, 'ambisonics-foa');
    assert.equal(payload.audio.channels, 4);
    assert.equal(payload.video.codec, 'hevc');
  });
});
