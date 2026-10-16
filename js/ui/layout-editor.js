import {
  HUD_ELEMENTS,
  LIMITS,
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
} from './hud-layout.js';

export class HudLayoutEditor {
  constructor({
    store,
    getMode = () => 'screen',
    getHeadsetSettings = () => ({}),
    hud = () => {},
    onLayoutChange = () => {},
    setControlsVisible = () => {},
  } = {}) {
    this.store = store;
    this.getMode = getMode;
    this.getHeadsetSettings = getHeadsetSettings;
    this.hud = hud;
    this.onLayoutChange = onLayoutChange;
    this.setControlsVisible = setControlsVisible;

    this._isOpen = false;
    this._selectedId = 'bottom';
    this._layouts = {
      headset: null,
      screen: null,
    };

    this._dragState = null;
    this._stickAccumX = 0;
    this._stickAccumY = 0;
    this._wasPillOpenBefore = false;

    this._loadLayouts();
    this._initPanels();
  }

  _storageKey(mode) {
    return `hud_layout:${mode}`;
  }

  _loadLayouts() {
    ['headset', 'screen'].forEach((mode) => {
      let raw = null;
      if (this.store) {
        raw = this.store.get(this._storageKey(mode), null);
      }
      this._layouts[mode] = normalizeLayout(raw, mode);
    });
  }

  _saveCurrent() {
    const mode = this.getMode();
    const l = this._layouts[mode];
    if (this.store) {
      this.store.set(this._storageKey(mode), l);
    }
  }

  get currentLayout() {
    const mode = this.getMode();
    return this._layouts[mode] || defaultLayout(mode);
  }

  getCurrentAutoHideMs() {
    return this.currentLayout.autoHideMs;
  }

  isOpen() {
    return this._isOpen;
  }

  apply(mode = this.getMode()) {
    const layout = this._layouts[mode] || defaultLayout(mode);
    const isHeadset = mode === 'headset';
    const lens = lensOffsets(this.getHeadsetSettings());
    const vars = layoutToCssVars(layout, { headset: isHeadset, lens });

    const root = document.documentElement;
    Object.entries(vars).forEach(([k, v]) => {
      root.style.setProperty(k, v);
    });

    this.onLayoutChange(vars, layout);
  }

  refreshLens() {
    if (this.getMode() === 'headset') {
      this.apply('headset');
    }
  }

  refreshMode() {
    this.apply(this.getMode());
    if (this._isOpen) this._renderPanels();
  }

  _initPanels() {
    const createPanel = (id, side) => {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.className = `layout-editor-panel glass ${side}`;
        el.hidden = true;
        el.setAttribute('role', 'region');
        el.setAttribute('aria-label', 'Editor de Layout do HUD');
      }
      return el;
    };

    const paneLeft = document.getElementById('controls-pane-left');
    const paneRight = document.getElementById('controls-pane-right');

    if (paneLeft && !document.getElementById('layout-editor-panel-l')) {
      this.panelL = createPanel('layout-editor-panel-l', 'left');
      paneLeft.appendChild(this.panelL);
    } else {
      this.panelL = document.getElementById('layout-editor-panel-l');
    }

    if (paneRight && !document.getElementById('layout-editor-panel-r')) {
      this.panelR = createPanel('layout-editor-panel-r', 'right');
      paneRight.appendChild(this.panelR);
    } else {
      this.panelR = document.getElementById('layout-editor-panel-r');
    }

    const bindPanel = (panel) => {
      if (!panel || panel._bound) return;
      panel._bound = true;

      panel.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
      });

      panel.addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const act = btn.getAttribute('data-act');
        this._handleAction(act, btn);
      });
    };

    bindPanel(this.panelL);
    bindPanel(this.panelR);

    // Seleção e arrasto direto nos HUDs ao clicar neles
    this._setupElementClickAndDrag();
  }

  _handleAction(act) {
    switch (act) {
      case 'close':
      case 'done':
        this.close();
        break;
      case 'prev-el':
        this.cycleElement(-1);
        break;
      case 'next-el':
        this.cycleElement(1);
        break;
      case 'up':
        this.move(0, -1);
        break;
      case 'down':
        this.move(0, 1);
        break;
      case 'left':
        this.move(-1, 0);
        break;
      case 'right':
        this.move(1, 0);
        break;
      case 'scale-down':
        this.scale(-1);
        break;
      case 'scale-up':
        this.scale(1);
        break;
      case 'safe-down':
        this.adjustSafe(-1);
        break;
      case 'safe-up':
        this.adjustSafe(1);
        break;
      case 'opacity-down':
        this.adjustOpacity(-1);
        break;
      case 'opacity-up':
        this.adjustOpacity(1);
        break;
      case 'cycle-autohide':
        this.cycleAutoHide(1);
        break;
      case 'toggle-lens':
        this.toggleLens();
        break;
      case 'reset-el':
        this.resetCurrentElement();
        break;
      case 'reset-all':
        this.resetAll();
        break;
      default:
        break;
    }
  }

  _getTargetDoms(id) {
    const doms = [];
    switch (id) {
      case 'top':
        document.querySelectorAll('.top-bar').forEach((el) => doms.push(el));
        break;
      case 'bottom':
        document.querySelectorAll('.bottom-bar').forEach((el) => doms.push(el));
        break;
      case 'pill':
        document.querySelectorAll('#settings-pill, .pill-pane').forEach((el) => doms.push(el));
        break;
      case 'hud':
        document.querySelectorAll('.hud-eye span').forEach((el) => doms.push(el));
        break;
      default:
        break;
    }
    return doms;
  }

  _updateHighlights() {
    document.querySelectorAll('.hud-target-highlight').forEach((el) => {
      el.classList.remove('hud-target-highlight');
    });

    if (!this._isOpen) return;

    const targets = this._getTargetDoms(this._selectedId);
    targets.forEach((el) => el.classList.add('hud-target-highlight'));
  }

  _renderPanels() {
    const mode = this.getMode();
    const l = this.currentLayout;
    const curEl = l.elements[this._selectedId] || { x: 0, y: 0, scale: 1 };
    const elMeta = HUD_ELEMENTS.find((e) => e.id === this._selectedId) || HUD_ELEMENTS[0];

    const coordX = (curEl.x >= 0 ? `+${curEl.x}` : `${curEl.x}`) + '%';
    const coordY = (curEl.y >= 0 ? `+${curEl.y}` : `${curEl.y}`) + '%';
    const scalePercent = `${Math.round(curEl.scale * 100)}%`;
    const safePercent = `${Math.round(l.safeMargin)}%`;
    const opacityPercent = `${Math.round(l.opacity * 100)}%`;
    const autoHideLabel = formatAutoHide(l.autoHideMs);
    const modeLabel = mode === 'headset' ? 'Modo Óculos' : 'Modo Tela';

    const html = `
      <div class="lep-header">
        <div class="lep-title">📐 Layout dos HUDs <span style="font-size:10px;opacity:.7;font-weight:normal;">(${modeLabel})</span></div>
        <button class="lep-btn-close" type="button" data-act="close" title="Concluir e Salvar (Enter / Esc / B)">✕</button>
      </div>

      <div class="lep-selector-row">
        <button class="lep-nav-btn lep-prev" type="button" data-act="prev-el" title="Elemento anterior ([ ou L1)">◀</button>
        <div class="lep-target-badge">
          <span class="lep-target-name">${elMeta.label}</span>
          <span class="lep-target-coords">X: ${coordX} · Y: ${coordY}</span>
        </div>
        <button class="lep-nav-btn lep-next" type="button" data-act="next-el" title="Próximo elemento (] ou R1)">▶</button>
      </div>

      <div class="lep-dpad-grid">
        <button class="lep-dir-btn lep-up" type="button" data-act="up" title="Mover para cima (▲)">▲</button>
        <button class="lep-dir-btn lep-left" type="button" data-act="left" title="Mover para esquerda (◀)">◀</button>
        <div class="lep-dir-btn lep-center" title="Use D-Pad ou Setas">✛</div>
        <button class="lep-dir-btn lep-right" type="button" data-act="right" title="Mover para direita (▶)">▶</button>
        <button class="lep-dir-btn lep-down" type="button" data-act="down" title="Mover para baixo (▼)">▼</button>
      </div>

      <div class="lep-controls-list">
        <div class="lep-row">
          <span class="lep-label">Escala do elemento:</span>
          <div class="lep-stepper">
            <button class="lep-step-btn" type="button" data-act="scale-down" title="Reduzir tamanho (− ou L2)">−</button>
            <span class="lep-val">${scalePercent}</span>
            <button class="lep-step-btn" type="button" data-act="scale-up" title="Aumentar tamanho (+ ou R2)">+</button>
          </div>
        </div>

        <div class="lep-row">
          <span class="lep-label">Margem segura:</span>
          <div class="lep-stepper">
            <button class="lep-step-btn" type="button" data-act="safe-down" title="Reduzir margem">−</button>
            <span class="lep-val">${safePercent}</span>
            <button class="lep-step-btn" type="button" data-act="safe-up" title="Aumentar margem">+</button>
          </div>
        </div>

        <div class="lep-row">
          <span class="lep-label">Opacidade:</span>
          <div class="lep-stepper">
            <button class="lep-step-btn" type="button" data-act="opacity-down" title="Diminuir opacidade">−</button>
            <span class="lep-val">${opacityPercent}</span>
            <button class="lep-step-btn" type="button" data-act="opacity-up" title="Aumentar opacidade">+</button>
          </div>
        </div>

        <div class="lep-row">
          <span class="lep-label">Auto-ocultar:</span>
          <button class="lep-chip-btn" type="button" data-act="cycle-autohide" title="Clique para alternar tempo">${autoHideLabel}</button>
        </div>

        ${
          mode === 'headset'
            ? `
        <div class="lep-row">
          <span class="lep-label">Centro óptico:</span>
          <button class="lep-toggle-btn ${l.followLens ? 'active' : ''}" type="button" data-act="toggle-lens" title="Seguir IPD e calibração das lentes (C ou X)">
            ${l.followLens ? '◎ Seguir: ATIVO' : '○ Seguir: DESLIGADO'}
          </button>
        </div>`
            : ''
        }
      </div>

      <div class="lep-footer-actions">
        <button class="lep-action-btn lep-btn-reset-all" type="button" data-act="reset-el" title="Restaurar este elemento (R ou Y)">↺ Elemento</button>
        <button class="lep-action-btn lep-btn-reset-all" type="button" data-act="reset-all" title="Restaurar perfil padrão">↺ Padrões</button>
        <button class="lep-action-btn lep-btn-done" type="button" data-act="done" title="Salvar e fechar (Enter)">✓ Concluir</button>
      </div>
    `;

    if (this.panelL) this.panelL.innerHTML = html;
    if (this.panelR) this.panelR.innerHTML = html;
  }

  _setupElementClickAndDrag() {
    const getTargetFromElement = (el) => {
      if (el.closest('.top-bar')) return 'top';
      if (el.closest('.bottom-bar')) return 'bottom';
      if (el.closest('#settings-pill') || el.closest('.pill-pane')) return 'pill';
      if (el.closest('#hud') || el.closest('.hud-eye')) return 'hud';
      return null;
    };

    const handlePointerDown = (e) => {
      if (!this._isOpen) return;
      if (e.target.closest('.layout-editor-panel')) return;

      const targetId = getTargetFromElement(e.target);
      if (!targetId) return;

      this.setElement(targetId);

      const isHeadset = this.getMode() === 'headset';
      const paneW = isHeadset ? window.innerWidth / 2 : window.innerWidth;
      const paneH = window.innerHeight;

      const startLayout = { ...this.currentLayout.elements[targetId] };
      const startClientX = e.clientX;
      const startClientY = e.clientY;

      const onPointerMove = (moveEvt) => {
        const dxPx = moveEvt.clientX - startClientX;
        const dyPx = moveEvt.clientY - startClientY;
        const dxPct = (dxPx / paneW) * 100;
        const dyPct = (dyPx / paneH) * 100;

        const targetX = Math.round(startLayout.x + dxPct);
        const targetY = Math.round(startLayout.y + dyPct);

        const mode = this.getMode();
        this._layouts[mode] = moveElement(
          this._layouts[mode],
          this._selectedId,
          targetX - this.currentLayout.elements[this._selectedId].x,
          targetY - this.currentLayout.elements[this._selectedId].y,
        );
        this.apply(mode);
        this._renderPanels();
      };

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        this._saveCurrent();
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    };

    const player = document.getElementById('player');
    if (player) {
      player.addEventListener('pointerdown', handlePointerDown, true);
    }
  }

  open() {
    if (this._isOpen) return;
    this._isOpen = true;

    const player = document.getElementById('player');
    if (player) player.classList.add('layout-editing');

    this.setControlsVisible(true);

    const pill = document.getElementById('settings-pill');
    if (pill) {
      this._wasPillOpenBefore = !pill.hidden;
      pill.hidden = false;
      pill.classList.add('show');
    }

    const hudEl = document.getElementById('hud');
    const hudL = document.getElementById('hud-l');
    const hudR = document.getElementById('hud-r');
    if (hudEl && hudL && hudR) {
      if (!hudL.textContent) {
        hudL.textContent = 'Prévia do HUD\nPosição e escala ajustáveis';
        hudR.textContent = 'Prévia do HUD\nPosição e escala ajustáveis';
      }
      hudEl.classList.add('show');
    }

    if (this.panelL) this.panelL.hidden = false;
    if (this.panelR) this.panelR.hidden = false;

    this._renderPanels();
    this._updateHighlights();

    this.hud('📐 Editor de Layout Aberto\nSetas/D-Pad movem · [ ] trocam · Esc/B salva', 4000);
  }

  close() {
    if (!this._isOpen) return;
    this._isOpen = false;

    const player = document.getElementById('player');
    if (player) player.classList.remove('layout-editing');

    if (this.panelL) this.panelL.hidden = true;
    if (this.panelR) this.panelR.hidden = true;

    this._updateHighlights();

    const pill = document.getElementById('settings-pill');
    if (pill && !this._wasPillOpenBefore) {
      pill.hidden = true;
      pill.classList.remove('show');
    }

    const hudEl = document.getElementById('hud');
    const hudL = document.getElementById('hud-l');
    const hudR = document.getElementById('hud-r');
    if (hudEl && hudL && hudR) {
      if (hudL.textContent.includes('Prévia do HUD')) {
        hudL.textContent = '';
        hudR.textContent = '';
        hudEl.classList.remove('show');
      }
    }

    this._saveCurrent();
    this.hud('Layout salvo!', 2000);
  }

  toggle() {
    if (this._isOpen) this.close();
    else this.open();
  }

  cycleElement(dir = 1) {
    const idx = HUD_ELEMENTS.findIndex((e) => e.id === this._selectedId);
    const n = HUD_ELEMENTS.length;
    const nextIdx = (idx + Math.sign(dir) + n) % n;
    this._selectedId = HUD_ELEMENTS[nextIdx].id;
    this._updateHighlights();
    this._renderPanels();
  }

  prevElement() {
    this.cycleElement(-1);
  }

  nextElement() {
    this.cycleElement(1);
  }

  resetCurrent() {
    this.resetCurrentElement();
  }

  setElement(id) {
    if (HUD_ELEMENTS.some((e) => e.id === id)) {
      this._selectedId = id;
      this._updateHighlights();
      this._renderPanels();
    }
  }

  move(dx, dy) {
    const mode = this.getMode();
    this._layouts[mode] = moveElement(this._layouts[mode], this._selectedId, dx, dy);
    this._saveCurrent();
    this.apply(mode);
    this._renderPanels();
  }

  scale(dir) {
    const mode = this.getMode();
    this._layouts[mode] = scaleElement(this._layouts[mode], this._selectedId, dir);
    this._saveCurrent();
    this.apply(mode);
    this._renderPanels();
  }

  adjustSafe(dir) {
    const mode = this.getMode();
    this._layouts[mode] = adjustSafeMargin(this._layouts[mode], dir);
    this._saveCurrent();
    this.apply(mode);
    this._renderPanels();
  }

  adjustOpacity(dir) {
    const mode = this.getMode();
    this._layouts[mode] = adjustOpacity(this._layouts[mode], dir);
    this._saveCurrent();
    this.apply(mode);
    this._renderPanels();
  }

  cycleAutoHide(dir = 1) {
    const mode = this.getMode();
    this._layouts[mode] = cycleAutoHide(this._layouts[mode], dir);
    this._saveCurrent();
    this._renderPanels();
  }

  toggleLens() {
    const mode = this.getMode();
    const cur = this._layouts[mode];
    this._layouts[mode] = { ...cur, followLens: !cur.followLens };
    this._saveCurrent();
    this.apply(mode);
    this._renderPanels();
  }

  resetCurrentElement() {
    const mode = this.getMode();
    this._layouts[mode] = resetElement(this._layouts[mode], this._selectedId, mode);
    this._saveCurrent();
    this.apply(mode);
    this._renderPanels();
    this.hud('Elemento restaurado', 1500);
  }

  resetAll() {
    const mode = this.getMode();
    this._layouts[mode] = defaultLayout(mode);
    this._saveCurrent();
    this.apply(mode);
    this._renderPanels();
    this.hud('Layout restaurado para os padrões', 2000);
  }

  onLayoutMoveStick(stickX, stickY, dt) {
    if (!this._isOpen) return;
    const speed = 25; // % por segundo
    this._stickAccumX += stickX * speed * dt;
    this._stickAccumY += stickY * speed * dt;

    let dx = 0;
    let dy = 0;
    if (Math.abs(this._stickAccumX) >= 1) {
      dx = Math.trunc(this._stickAccumX);
      this._stickAccumX -= dx;
    }
    if (Math.abs(this._stickAccumY) >= 1) {
      dy = Math.trunc(this._stickAccumY);
      this._stickAccumY -= dy;
    }

    if (dx !== 0 || dy !== 0) {
      this.move(dx, dy);
    }
  }

  handleKey(e) {
    if (!this._isOpen) {
      if (e.key === 'g' || e.key === 'G') {
        this.open();
        return true;
      }
      return false;
    }

    if (e.key === 'Escape' || e.key === 'Enter' || e.key === 'g' || e.key === 'G') {
      this.close();
      return true;
    }

    if (e.key === '[' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      this.cycleElement(-1);
      return true;
    }
    if (e.key === ']' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      this.cycleElement(1);
      return true;
    }

    const step = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.move(0, -step);
      return true;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.move(0, step);
      return true;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.move(-step, 0);
      return true;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.move(step, 0);
      return true;
    }

    if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      this.scale(-1);
      return true;
    }
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      this.scale(1);
      return true;
    }

    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      this.resetCurrentElement();
      return true;
    }

    if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      this.toggleLens();
      return true;
    }

    return false;
  }
}
