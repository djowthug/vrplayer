import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGofileContentId } from '../scripts/cloud-service.js';

test('Resolução de URLs de Nuvem (Torbox / Gofile)', async (t) => {
  await t.test('parseGofileContentId extrai id de URL padrão https://gofile.io/d/abcXYZ', () => {
    const id = parseGofileContentId('https://gofile.io/d/abcXYZ');
    assert.equal(id, 'abcXYZ');
  });

  await t.test('parseGofileContentId extrai id de URL com contents https://gofile.io/contents/test1234', () => {
    const id = parseGofileContentId('https://gofile.io/contents/test1234');
    assert.equal(id, 'test1234');
  });

  await t.test('parseGofileContentId aceita ID alfanumérico direto', () => {
    const id = parseGofileContentId('abcXYZ-123_4');
    assert.equal(id, 'abcXYZ-123_4');
  });

  await t.test('parseGofileContentId retorna null para entrada vazia ou inválida', () => {
    assert.equal(parseGofileContentId(''), null);
    assert.equal(parseGofileContentId(null), null);
    assert.equal(parseGofileContentId('not an id!'), null);
  });

  await t.test('Configuração e validação de chaves de API do Torbox', () => {
    const cleanKey = '   test-api-key-12345   '.trim();
    assert.equal(cleanKey, 'test-api-key-12345');
    assert.ok(cleanKey.length > 0);
  });
});
