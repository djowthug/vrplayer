import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, formatDuration } from '../js/utils/format.js';

test('Utilitários Compartilhados (DRY) - Bytes e Duração', async (t) => {
  await t.test('formatBytes formata corretamente bytes, KB, MB e GB', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(1024), '1.0 KB');
    assert.equal(formatBytes(1048576), '1.0 MB');
    assert.equal(formatBytes(1073741824), '1.00 GB');
  });

  await t.test('formatDuration formata segundos em formato MM:SS e HH:MM:SS', () => {
    assert.equal(formatDuration(0), '0:00');
    assert.equal(formatDuration(65), '1:05');
    assert.equal(formatDuration(3665), '1:01:05');
  });
});
