import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HUD_ELEMENTS,
  LIMITS,
  DEFAULT_HEADSET_SAFE_MARGIN,
  defaultLayout,
  normalizeLayout,
  moveElement,
  scaleElement,
  resetElement,
  adjustSafeMargin,
  adjustOpacity,
  cycleAutoHide,
  formatAutoHide,
  lensOffsets,
  layoutToCssVars,
} from '../js/ui/hud-layout.js';

test('Layout dos HUDs - modelo puro', async (t) => {
  await t.test('defaultLayout separa perfis de óculos e tela', () => {
    assert.equal(defaultLayout('headset').safeMargin, DEFAULT_HEADSET_SAFE_MARGIN);
    assert.equal(defaultLayout('screen').safeMargin, 0);
    assert.equal(defaultLayout('qualquer').safeMargin, 0);
    for (const { id } of HUD_ELEMENTS) {
      assert.deepEqual(defaultLayout('headset').elements[id], { x: 0, y: 0, scale: 1 });
    }
  });

  await t.test('normalizeLayout tolera entradas inválidas', () => {
    assert.deepEqual(normalizeLayout(null, 'headset'), defaultLayout('headset'));
    assert.deepEqual(normalizeLayout('lixo', 'screen'), defaultLayout('screen'));
    assert.deepEqual(normalizeLayout([1, 2], 'screen'), defaultLayout('screen'));
  });

  await t.test('normalizeLayout aplica limites e descarta chaves extras', () => {
    const n = normalizeLayout({
      safeMargin: 99,
      opacity: 0,
      autoHideMs: 1234,
      followLens: 'sim',
      extra: true,
      elements: { top: { x: 500, y: -500, scale: 9 }, bottom: { x: 'a' }, fake: { x: 1 } },
    }, 'headset');
    assert.equal(n.safeMargin, LIMITS.safeMax);
    assert.equal(n.opacity, LIMITS.opacityMin);
    assert.equal(n.autoHideMs, 3500);
    assert.equal(n.followLens, false);
    assert.equal(n.extra, undefined);
    assert.deepEqual(n.elements.top, { x: LIMITS.pos, y: -LIMITS.pos, scale: LIMITS.scaleMax });
    assert.deepEqual(n.elements.bottom, { x: 0, y: 0, scale: 1 });
    assert.equal(n.elements.fake, undefined);
  });

  await t.test('moveElement e scaleElement respeitam limites sem mutar o original', () => {
    const base = defaultLayout('screen');
    const moved = moveElement(base, 'bottom', 3, -2);
    assert.deepEqual(moved.elements.bottom, { x: 3, y: -2, scale: 1 });
    assert.deepEqual(base.elements.bottom, { x: 0, y: 0, scale: 1 });
    assert.equal(moveElement(base, 'bottom', 999, 0).elements.bottom.x, LIMITS.pos);
    assert.equal(moveElement(base, 'inexistente', 1, 1), base);

    let s = base;
    for (let i = 0; i < 50; i++) s = scaleElement(s, 'top', 1);
    assert.equal(s.elements.top.scale, LIMITS.scaleMax);
    for (let i = 0; i < 50; i++) s = scaleElement(s, 'top', -1);
    assert.equal(s.elements.top.scale, LIMITS.scaleMin);
  });

  await t.test('resetElement restaura apenas o elemento', () => {
    let l = moveElement(defaultLayout('headset'), 'pill', 5, 5);
    l = moveElement(l, 'hud', 2, 2);
    const r = resetElement(l, 'pill', 'headset');
    assert.deepEqual(r.elements.pill, { x: 0, y: 0, scale: 1 });
    assert.deepEqual(r.elements.hud, { x: 2, y: 2, scale: 1 });
  });

  await t.test('margem, opacidade e auto-ocultar ciclam dentro dos limites', () => {
    let l = defaultLayout('screen');
    l = adjustSafeMargin(l, -1);
    assert.equal(l.safeMargin, 0);
    l = adjustOpacity(l, 1);
    assert.equal(l.opacity, 1);
    l = adjustOpacity(l, -1);
    assert.equal(l.opacity, 0.9);
    assert.equal(cycleAutoHide(l, 1).autoHideMs, 5000);
    assert.equal(cycleAutoHide(cycleAutoHide(cycleAutoHide(l, 1), 1), 1).autoHideMs, 0);
    assert.equal(cycleAutoHide({ ...l, autoHideMs: 0 }, 1).autoHideMs, 2000);
    assert.equal(formatAutoHide(0), 'Nunca');
    assert.equal(formatAutoHide(3500), '3,5 s');
    assert.equal(formatAutoHide(2000), '2 s');
  });

  await t.test('lensOffsets converte o centro óptico do shader (IPD e eixo Y invertido)', () => {
    assert.deepEqual(lensOffsets({}), { l: { x: 0, y: 0 }, r: { x: 0, y: 0 } });
    const o = lensOffsets({ ipd: 0.02, lensLX: 0.01, lensLY: 0.03, lensRX: -0.01, lensRY: -0.02 });
    assert.deepEqual(o.l, { x: -1, y: -3 });
    assert.deepEqual(o.r, { x: 1, y: 2 });
  });

  await t.test('layoutToCssVars gera variáveis por modo e zera lente quando desligada', () => {
    const lens = { l: { x: -1, y: 2 }, r: { x: 1, y: 2 } };
    const l = moveElement(defaultLayout('headset'), 'top', 4, 6);
    const v = layoutToCssVars(l, { headset: true, lens });
    assert.equal(v['--hud-pane-w'], '50vw');
    assert.equal(v['--hud-safe'], String(DEFAULT_HEADSET_SAFE_MARGIN));
    assert.equal(v['--hud-top-x'], '4');
    assert.equal(v['--hud-top-y'], '6');
    assert.equal(v['--hud-lens-l-x'], '0');

    const on = layoutToCssVars({ ...l, followLens: true }, { headset: true, lens });
    assert.equal(on['--hud-lens-l-x'], '-1');
    assert.equal(on['--hud-lens-r-y'], '2');

    const screen = layoutToCssVars({ ...l, followLens: true }, { headset: false, lens });
    assert.equal(screen['--hud-pane-w'], '100vw');
    assert.equal(screen['--hud-lens-r-x'], '0');
  });
});
