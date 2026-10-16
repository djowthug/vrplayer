import test from 'node:test';
import assert from 'node:assert/strict';

// Utilitário de parsing de Range idêntico ao server.js
function parseRangeHeader(rangeHeader, fileSize) {
  if (!rangeHeader) return null;
  const parts = rangeHeader.replace(/bytes=/, '').split('-');
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

  if (isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
    return { status: 416, headers: { 'Content-Range': `bytes */${fileSize}` } };
  }

  const chunkLength = end - start + 1;
  return {
    status: 206,
    start,
    end,
    chunkLength,
    headers: {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkLength,
    },
  };
}

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
  });

  await t.test('Parse de Range fechado específico (bytes=1024-2047)', () => {
    const result = parseRangeHeader('bytes=1024-2047', fileSize);
    assert.equal(result.status, 206);
    assert.equal(result.start, 1024);
    assert.equal(result.end, 2047);
    assert.equal(result.chunkLength, 1024);
    assert.equal(result.headers['Content-Range'], `bytes 1024-2047/${fileSize}`);
  });

  await t.test('Parse de Range aberto (bytes=5242880-) até o fim do arquivo', () => {
    const result = parseRangeHeader('bytes=5242880-', fileSize);
    assert.equal(result.status, 206);
    assert.equal(result.start, 5242880);
    assert.equal(result.end, fileSize - 1);
    assert.equal(result.chunkLength, fileSize - 5242880);
    assert.equal(result.headers['Content-Range'], `bytes 5242880-${fileSize - 1}/${fileSize}`);
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
