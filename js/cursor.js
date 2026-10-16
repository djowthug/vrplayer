// Gerenciador de Cursor Virtual controlado por Gamepad Bluetooth para uso mobile e desktop.
// Permite interagir com botões, cards, menus e listas usando o analógico,
// e ajustar barras deslizantes (range sliders) com precisão cirúrgica via D-Pad (◀ ▶).

const DEFAULT_DEADZONE = 0.15;
const DEFAULT_BASE_SPEED = 550; // Pixels por segundo (calibrado para movimento dócil e estável)
const HIDE_TIMEOUT_MS = 3000; // Tempo de inatividade antes de ocultar o cursor (3s)
const SCROLL_SPEED = 600; // Pixels por segundo para rolagem

export class VirtualCursor {
  constructor(options = {}) {
    this.deadzone = options.deadzone ?? DEFAULT_DEADZONE;
    this.baseSpeed = options.baseSpeed ?? DEFAULT_BASE_SPEED;
    this.sensitivityPercent = options.sensitivity ?? 100;
    this.speed = (this.sensitivityPercent / 100) * this.baseSpeed;
    this.hideTimeout = options.hideTimeout ?? HIDE_TIMEOUT_MS;
    this.isUiActive = typeof options.isUiActive === 'function' ? options.isUiActive : () => true;

    this.cursorId = options.id || 'gamepad-cursor';
    this.el = document.getElementById(this.cursorId);
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.id = this.cursorId;
      this.el.className = 'virtual-cursor hidden';
      this.el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(this.el);
    }

    this.mirrorEl = document.getElementById(this.cursorId + '-mirror');
    if (!this.mirrorEl) {
      this.mirrorEl = document.createElement('div');
      this.mirrorEl.id = this.cursorId + '-mirror';
      this.mirrorEl.className = 'virtual-cursor hidden';
      this.mirrorEl.setAttribute('aria-hidden', 'true');
      document.body.appendChild(this.mirrorEl);
    }

    // Inicializa no centro da janela
    this.x = window.innerWidth / 2;
    this.y = window.innerHeight / 2;
    this.visible = false;
    this.lastFrameTime = performance.now();
    this.hideTimer = null;

    // Barra deslizante atualmente selecionada para ajuste fino via D-Pad
    this.activeSlider = null;
    this._sliderHoldDir = 0;
    this._sliderHoldTime = 0;
    this._sliderLastStep = 0;

    // Rastreamento de estado de botões para detecção de borda (edge detection)
    this._btn0Prev = false;
    this._btn1Prev = false;

    this._rafId = null;
    this._running = false;

    this._onResize = this._onResize.bind(this);
    this._updateLoop = this._updateLoop.bind(this);

    window.addEventListener('resize', this._onResize);
    this._updatePositionStyles();
    this.start();
  }

  setSensitivity(percent) {
    this.sensitivityPercent = Math.max(20, Math.min(300, Number(percent) || 100));
    this.speed = (this.sensitivityPercent / 100) * this.baseSpeed;
  }

  _onResize() {
    this.x = Math.max(0, Math.min(this.x, window.innerWidth));
    this.y = Math.max(0, Math.min(this.y, window.innerHeight));
    this._updatePositionStyles();
  }

  _updatePositionStyles() {
    const player = document.getElementById('player');
    const isHeadset = document.body.classList.contains('headset-mode') || player?.classList.contains('headset');
    const isDominantLeft = player?.classList.contains('dominant-left') || document.body.classList.contains('dominant-left');
    const isDominantRight = player?.classList.contains('dominant-right') || document.body.classList.contains('dominant-right');

    if (this.el) {
      if (isHeadset) {
        const halfW = window.innerWidth / 2;
        const normalizedX = ((this.x % halfW) + halfW) % halfW;

        if (isDominantRight) {
          // Apenas olho direito
          this.el.classList.add('hidden');
          if (this.mirrorEl) {
            this.mirrorEl.style.left = `${Math.round(normalizedX + halfW)}px`;
            this.mirrorEl.style.top = `${Math.round(this.y)}px`;
            if (this.visible) this.mirrorEl.classList.remove('hidden');
            else this.mirrorEl.classList.add('hidden');
          }
        } else if (isDominantLeft) {
          // Apenas olho esquerdo
          this.el.style.left = `${Math.round(normalizedX)}px`;
          this.el.style.top = `${Math.round(this.y)}px`;
          if (this.visible) this.el.classList.remove('hidden');
          else this.el.classList.add('hidden');
          if (this.mirrorEl) this.mirrorEl.classList.add('hidden');
        } else {
          // Ambos os olhos
          this.el.style.left = `${Math.round(normalizedX)}px`;
          this.el.style.top = `${Math.round(this.y)}px`;
          if (this.visible) this.el.classList.remove('hidden');
          else this.el.classList.add('hidden');
          if (this.mirrorEl) {
            this.mirrorEl.style.left = `${Math.round(normalizedX + halfW)}px`;
            this.mirrorEl.style.top = `${Math.round(this.y)}px`;
            if (this.visible) this.mirrorEl.classList.remove('hidden');
            else this.mirrorEl.classList.add('hidden');
          }
        }
      } else {
        this.el.style.left = `${Math.round(this.x)}px`;
        this.el.style.top = `${Math.round(this.y)}px`;
        if (this.visible) this.el.classList.remove('hidden');
        if (this.mirrorEl) {
          this.mirrorEl.classList.add('hidden');
        }
      }
    }
  }

  show() {
    this.visible = true;
    this._updatePositionStyles();
    this.resetHideTimer();
  }

  hide() {
    this.visible = false;
    if (this.el) {
      this.el.classList.add('hidden');
      this.el.classList.remove('clicking', 'hovering');
    }
    if (this.mirrorEl) {
      this.mirrorEl.classList.add('hidden');
      this.mirrorEl.classList.remove('clicking', 'hovering');
    }
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  resetHideTimer() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
    }
    this.hideTimer = setTimeout(() => {
      this.hide();
    }, this.hideTimeout);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this.lastFrameTime = performance.now();
    this._rafId = requestAnimationFrame(this._updateLoop);
  }

  stop() {
    this._running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this.deactivateActiveSlider();
    this.hide();
  }

  _getActiveGamepad() {
    if (typeof navigator.getGamepads !== 'function') return null;
    const gamepads = navigator.getGamepads();
    if (!gamepads) return null;

    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (gp && gp.connected) {
        return gp;
      }
    }
    return null;
  }

  _applyDeadzone(val) {
    if (Math.abs(val) <= this.deadzone) return 0;
    const sign = Math.sign(val);
    const normalized = (Math.abs(val) - this.deadzone) / (1 - this.deadzone);
    // Curva de resposta suave (fino controle em valores baixos, veloz em extremos)
    return sign * Math.pow(normalized, 1.35);
  }

  _updateLoop(now) {
    if (!this._running) return;

    const dt = Math.min(Math.max((now - this.lastFrameTime) / 1000, 0.001), 0.1);
    this.lastFrameTime = now;

    const gp = this._getActiveGamepad();
    if (gp) {
      this._processGamepad(gp, dt);
    }

    this._rafId = requestAnimationFrame(this._updateLoop);
  }

  _processGamepad(gp, dt) {
    // Se a interface 2D não estiver ativa (ex: modo VR imersivo sem UI aberta), oculta cursor
    if (!this.isUiActive()) {
      if (this.visible) {
        this.deactivateActiveSlider();
        this.hide();
      }
      return;
    }

    // Leitura do analógico esquerdo: axes[0] = X, axes[1] = Y
    const rawX = gp.axes && gp.axes[0] !== undefined ? gp.axes[0] : 0;
    const rawY = gp.axes && gp.axes[1] !== undefined ? gp.axes[1] : 0;

    const moveX = this._applyDeadzone(rawX);
    const moveY = this._applyDeadzone(rawY);

    const hasMovement = moveX !== 0 || moveY !== 0;

    if (hasMovement) {
      // Atualiza coordenadas dentro dos limites da tela
      this.x = Math.max(0, Math.min(this.x + moveX * this.speed * dt, window.innerWidth));
      this.y = Math.max(0, Math.min(this.y + moveY * this.speed * dt, window.innerHeight));

      this._updatePositionStyles();
      this.show();

      // Se afastou do slider ativo, cancela o foco automático
      this._checkSliderProximity();
    }

    // Tratamento de cancelamento com Botão B (botão 1 / Círculo)
    const btn1 = gp.buttons ? gp.buttons[1] : null;
    const btn1Pressed = btn1 ? (btn1.pressed || btn1.value > 0.5) : false;
    const btn1JustPressed = btn1Pressed && !this._btn1Prev;
    this._btn1Prev = btn1Pressed;

    if (btn1JustPressed && this.activeSlider) {
      this.deactivateActiveSlider();
    }

    // Se houver uma barra de slider ativa, o D-Pad (◀ ▶) ajusta o valor com precisão
    if (this.activeSlider) {
      this._processSliderDpad(gp, dt);
    } else {
      // Caso contrário, Analógico Direito ou D-Pad Cima/Baixo faz rolagem
      this._processScrolling(gp, dt);
    }

    // Detecção de clique no botão principal de confirmação (botão 0 / A / Cross)
    this._processButtons(gp);

    // Feedback visual sutil de hover sobre elementos clicáveis quando o cursor estiver visível
    if (this.visible) {
      this._updateHoverState();
    }
  }

  _checkSliderProximity() {
    if (!this.activeSlider) return;

    if (!document.body.contains(this.activeSlider)) {
      this.deactivateActiveSlider();
      return;
    }

    const rect = this.activeSlider.getBoundingClientRect();
    // Distância do cursor à caixa delimitadora do slider
    const dx = Math.max(rect.left - this.x, 0, this.x - rect.right);
    const dy = Math.max(rect.top - this.y, 0, this.y - rect.bottom);
    const dist = Math.hypot(dx, dy);

    // Se o usuário moveu o cursor para mais de 75px do slider, desvincula o foco
    if (dist > 75) {
      this.deactivateActiveSlider();
    }
  }

  setActiveSlider(slider) {
    if (!slider) return;
    if (this.activeSlider === slider) return;

    this.deactivateActiveSlider();
    if (!document.body.contains(slider)) return;

    this.activeSlider = slider;
    this.activeSlider.classList.add('gamepad-slider-active');
    try { this.activeSlider.focus(); } catch {}
    this.resetHideTimer();
  }

  deactivateActiveSlider() {
    if (this.activeSlider) {
      this.activeSlider.classList.remove('gamepad-slider-active');
      try { this.activeSlider.blur(); } catch {}
      this.activeSlider = null;
    }
    this._sliderHoldDir = 0;
    this._sliderHoldTime = 0;
    this._sliderLastStep = 0;
  }

  hasActiveSlider() {
    return !!this.activeSlider;
  }

  _processSliderDpad(gp, dt) {
    if (!this.activeSlider) return;

    // D-Pad Esquerda (14) e Direita (15)
    const dpadLeft = gp.buttons && gp.buttons[14]?.pressed;
    const dpadRight = gp.buttons && gp.buttons[15]?.pressed;

    let dir = 0;
    if (dpadRight) dir = 1;
    else if (dpadLeft) dir = -1;

    if (dir !== 0) {
      this.resetHideTimer();
      if (this._sliderHoldDir !== dir) {
        // Primeiro toque imediato
        this._sliderHoldDir = dir;
        this._sliderHoldTime = 0;
        this._sliderLastStep = 0;
        this._stepSlider(dir);
      } else {
        // Mantido pressionado: repetição contínua com aceleração gradual
        this._sliderHoldTime += dt;
        const REPEAT_DELAY = 0.35; // Segundos antes de repetir
        const REPEAT_INTERVAL = this._sliderHoldTime > 1.4 ? 0.04 : 0.08; // Rápido após 1.4s
        if (this._sliderHoldTime >= REPEAT_DELAY) {
          if (this._sliderHoldTime - this._sliderLastStep >= REPEAT_INTERVAL) {
            this._stepSlider(dir);
            this._sliderLastStep = this._sliderHoldTime;
          }
        }
      }
    } else {
      this._sliderHoldDir = 0;
      this._sliderHoldTime = 0;
      this._sliderLastStep = 0;
    }
  }

  _stepSlider(direction) {
    if (!this.activeSlider) return;
    const s = this.activeSlider;
    const min = Number(s.min !== '' ? s.min : 0);
    const max = Number(s.max !== '' ? s.max : 100);
    let step = Number(s.step !== '' && s.step !== 'any' ? s.step : (max - min) / 100);
    if (!step || isNaN(step) || step <= 0) step = 1;

    let curVal = Number(s.value);
    if (isNaN(curVal)) curVal = min;

    let nextVal = curVal + direction * step;
    nextVal = Math.min(max, Math.max(min, nextVal));

    // Arredondamento para evitar ruído de ponto flutuante IEEE (ex: 1.000000000002)
    const stepDecimals = (step.toString().split('.')[1] || '').length;
    if (stepDecimals > 0) {
      nextVal = Number(nextVal.toFixed(Math.min(stepDecimals, 6)));
    }

    if (nextVal !== curVal) {
      s.value = nextVal;
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  _processScrolling(gp, dt) {
    let scrollY = 0;

    // Analógico direito (axes[3] para vertical)
    if (gp.axes && gp.axes.length > 3) {
      const rawRightY = gp.axes[3];
      const stickY = this._applyDeadzone(rawRightY);
      if (stickY !== 0) {
        scrollY += stickY * SCROLL_SPEED * dt;
      }
    }

    // D-Pad Cima (12) e Baixo (13) quando não há slider ativo
    if (gp.buttons) {
      const dpadUp = gp.buttons[12]?.pressed;
      const dpadDown = gp.buttons[13]?.pressed;
      if (dpadUp) scrollY -= SCROLL_SPEED * dt;
      if (dpadDown) scrollY += SCROLL_SPEED * dt;
    }

    if (Math.abs(scrollY) > 0.01) {
      this.resetHideTimer();

      // Encontra elemento rolável abaixo do cursor ou cai no container principal
      const target = this._findScrollableElement(this.x, this.y);
      if (target) {
        target.scrollBy({ top: scrollY, behavior: 'auto' });
      } else {
        window.scrollBy({ top: scrollY, behavior: 'auto' });
      }
    }
  }

  _findScrollableElement(x, y) {
    let el = document.elementFromPoint(x, y);
    while (el && el !== document.body && el !== document.documentElement) {
      const overflowY = window.getComputedStyle(el).overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
        return el;
      }
      el = el.parentElement;
    }

    // Se nenhum sob o cursor for rolável, verifica containers comuns abertos
    const home = document.getElementById('home');
    if (home && !home.hidden && home.scrollHeight > home.clientHeight) return home;

    const cloudList = document.getElementById('cloud-files-list-container');
    if (cloudList && cloudList.scrollHeight > cloudList.clientHeight) return cloudList;

    const batchList = document.getElementById('batch-list');
    if (batchList && !batchList.hidden && batchList.scrollHeight > batchList.clientHeight) return batchList;

    return null;
  }

  _processButtons(gp) {
    const btn0 = gp.buttons ? gp.buttons[0] : null;
    const isPressed = btn0 ? (btn0.pressed || btn0.value > 0.5) : false;
    const justPressed = isPressed && !this._btn0Prev;
    const justReleased = !isPressed && this._btn0Prev;

    this._btn0Prev = isPressed;

    if (justPressed) {
      this.show();
      if (this.el) this.el.classList.add('clicking');
      if (this.mirrorEl) this.mirrorEl.classList.add('clicking');

      const player = document.getElementById('player');
      const isHeadset = document.body.classList.contains('headset-mode') || player?.classList.contains('headset');
      const isDominantRight = player?.classList.contains('dominant-right') || document.body.classList.contains('dominant-right');
      let clickX = this.x;
      if (isHeadset) {
        const halfW = window.innerWidth / 2;
        const normX = ((this.x % halfW) + halfW) % halfW;
        clickX = isDominantRight ? (normX + halfW) : normX;
      }
      this._performClick(clickX, this.y);
    } else if (justReleased) {
      if (this.el) this.el.classList.remove('clicking');
      if (this.mirrorEl) this.mirrorEl.classList.remove('clicking');
    }
  }

  _performClick(x, y) {
    let rawTarget = document.elementFromPoint(x, y);
    if (!rawTarget) return;

    if (rawTarget.correspondingUseElement) {
      rawTarget = rawTarget.correspondingUseElement;
    }

    // Detecta se o clique foi diretamente em uma barra de slide ou em sua linha
    const sliderRow = typeof rawTarget.closest === 'function' ? rawTarget.closest('.slider-row') : null;
    const rangeTarget = (typeof rawTarget.closest === 'function' ? rawTarget.closest('input[type="range"]') : null) || sliderRow?.querySelector('input[type="range"]');

    if (rangeTarget) {
      this.setActiveSlider(rangeTarget);
    } else {
      // Clicou fora de qualquer slide bar
      this.deactivateActiveSlider();
    }

    const clickableSelectors = 'button, a, input, select, textarea, label, [role="button"], [role="option"], [tabindex], .chip, .preset-card, .btn-cloud-action, .sheet-item, .batch-file-item, .pill-btn-nav, .pill-btn-action, .pill-preset-btn, .pill-preset-item';

    // Busca elemento acionável (botões, links, selects, cards, labels, etc.)
    const actionable = (typeof rawTarget.closest === 'function' ? rawTarget.closest(clickableSelectors) : null)
      || rawTarget.parentElement?.closest?.(clickableSelectors)
      || rawTarget;

    const eventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
    };

    // Dispara cadeia de eventos de ponteiro
    actionable.dispatchEvent(new PointerEvent('pointerdown', { ...eventInit, pointerId: 1, isPrimary: true, button: 0 }));
    actionable.dispatchEvent(new MouseEvent('mousedown', { ...eventInit, button: 0 }));
    actionable.dispatchEvent(new PointerEvent('pointerup', { ...eventInit, pointerId: 1, isPrimary: true, button: 0 }));
    actionable.dispatchEvent(new MouseEvent('mouseup', { ...eventInit, button: 0 }));

    if (typeof actionable.click === 'function') {
      actionable.click();
    }

    if (actionable.tagName === 'INPUT' || actionable.tagName === 'TEXTAREA' || actionable.tagName === 'SELECT') {
      try { actionable.focus(); } catch {}
    }
  }

  _updateHoverState() {
    const player = document.getElementById('player');
    const isHeadset = document.body.classList.contains('headset-mode') || player?.classList.contains('headset');
    const isDominantRight = player?.classList.contains('dominant-right') || document.body.classList.contains('dominant-right');
    let targetX = this.x;
    if (isHeadset) {
      const halfW = window.innerWidth / 2;
      const normX = ((this.x % halfW) + halfW) % halfW;
      targetX = isDominantRight ? (normX + halfW) : normX;
    }
    let rawTarget = document.elementFromPoint(targetX, this.y);
    if (!rawTarget || !this.el) return;

    if (rawTarget.correspondingUseElement) {
      rawTarget = rawTarget.correspondingUseElement;
    }

    const clickableSelectors = 'button, a, input, select, textarea, label, [role="button"], [role="option"], .chip, .preset-card, .btn-cloud-action, .sheet-item, .batch-file-item, .slider-row, .pill-btn-nav, .pill-btn-action, .pill-preset-btn, .pill-preset-item';

    const isClickable = !!(
      (typeof rawTarget.closest === 'function' ? rawTarget.closest(clickableSelectors) : null)
      || rawTarget.parentElement?.closest?.(clickableSelectors)
    );

    this.el.classList.toggle('hovering', isClickable);
    if (this.mirrorEl) this.mirrorEl.classList.toggle('hovering', isClickable);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    if (this.mirrorEl && this.mirrorEl.parentNode) {
      this.mirrorEl.parentNode.removeChild(this.mirrorEl);
    }
  }
}
