import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRangeHeader, MAX_RANGE_CHUNK } from '../server.js';

test('HTTP Range Requests - Safari iOS e Scrubbing', async (t) => {
  const fileSize = 10485760; // 10 MB

  await t.test('Retorna null quando header Range não é fornecido (200 OK standard)', () => {
    const result = parseRangeHeader(undefined, fileSize);
    assert.equal(result, null);
  });

  await t.test('Parse de Range inicial do Safari (bytes=0-1) para probing de metadados', () => {
    const result = parseRangeHeader('bytes=0-1', fileSize);
    assert.equal(result.status, 206);
    assert.equal(result.start, 0);
    assert.equal(result.end, 1);
    assert.equal(result.chunkLength, 2);
    assert.equal(result.headers['Content-Range'], `bytes 0-1/${fileSize}`);
    assert.equal(result.headers['Accept-Ranges'], 'bytes');
    assert.equal(result.headers['Cache-Control'], 'no-store');
  });

  await t.test('Parse de Range fechado específico (bytes=1024-2047)', () => {
    const result = parseRangeHeader('bytes=1024-2047', fileSize);
    assert.equal(result.status, 206);
    assert.equal(result.start, 1024);
    assert.equal(result.end, 2047);
    assert.equal(result.chunkLength, 1024);
    assert.equal(result.headers['Content-Range'], `bytes 1024-2047/${fileSize}`);
    assert.equal(result.headers['Cache-Control'], 'no-store');
  });

  await t.test('Parse de Range aberto (bytes=5242880-) até o fim do arquivo quando restante <= 8MB', () => {
    const result = parseRangeHeader('bytes=5242880-', fileSize);
    assert.equal(result.status, 206);
    assert.equal(result.start, 5242880);
    assert.equal(result.end, fileSize - 1);
    assert.equal(result.chunkLength, fileSize - 5242880);
    assert.equal(result.headers['Content-Range'], `bytes 5242880-${fileSize - 1}/${fileSize}`);
  });

  await t.test('Limita Range aberto (bytes=0-) em arquivo grande para fatia máxima de 8MB', () => {
    const largeFileSize = 52428800; // 50 MB
    const result = parseRangeHeader('bytes=0-', largeFileSize);
    assert.equal(result.status, 206);
    assert.equal(result.start, 0);
    assert.equal(result.end, MAX_RANGE_CHUNK - 1); // 8388607
    assert.equal(result.chunkLength, MAX_RANGE_CHUNK); // 8 * 1024 * 1024 (8MB)
    assert.equal(result.headers['Content-Range'], `bytes 0-${MAX_RANGE_CHUNK - 1}/${largeFileSize}`);
    assert.equal(result.headers['Cache-Control'], 'no-store');
    assert.equal(result.headers['Accept-Ranges'], 'bytes');
  });

  await t.test('Limita janela gigante fechada (bytes=0-30000000) a 8MB para não estourar RAM do WebKit', () => {
    const largeFileSize = 52428800; // 50 MB
    const result = parseRangeHeader('bytes=0-30000000', largeFileSize);
    assert.equal(result.status, 206);
    assert.equal(result.start, 0);
    assert.equal(result.end, MAX_RANGE_CHUNK - 1);
    assert.equal(result.chunkLength, MAX_RANGE_CHUNK);
    assert.equal(result.headers['Content-Range'], `bytes 0-${MAX_RANGE_CHUNK - 1}/${largeFileSize}`);
  });

  await t.test('Rejeita Range inválido com início além do tamanho do arquivo (416 Range Not Satisfiable)', () => {
    const result = parseRangeHeader(`bytes=${fileSize + 100}-`, fileSize);
    assert.equal(result.status, 416);
    assert.equal(result.headers['Content-Range'], `bytes */${fileSize}`);
  });

  await t.test('Rejeita Range com start > end (416 Range Not Satisfiable)', () => {
    const result = parseRangeHeader('bytes=500-200', fileSize);
    assert.equal(result.status, 416);
    assert.equal(result.headers['Content-Range'], `bytes */${fileSize}`);
  });
});
