// Gerenciador de Gamepad e controles Bluetooth para VR (iOS Safari, Android e PC).
// Suporta controles padrão (Xbox, PlayStation, Joy-Con, MFi) e mini controles VR (Mocute, VR Box, etc.).

const DEADZONE = 0.16;
const YAW_SPEED = 1.4; // Radianos/segundo (~80°/s) para girar a visão com o analógico
const PITCH_SPEED = 1.0;
const REPEAT_DELAY = 0.4; // Segundos antes de começar a repetir se segurar o botão
const REPEAT_RATE = 0.2; // Intervalo de repetição ao segurar

export class GamepadManager {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.connected = false;
    this.activeId = '';
    this.activeIdx = null;

    // Estado dos botões para debounce e repetição
    this._btnPrev = new Map();
    this._btnHoldTime = new Map();
    this._btnLastRepeat = new Map();

    this._onConnected = this._onConnected.bind(this);
    this._onDisconnected = this._onDisconnected.bind(this);

    window.addEventListener('gamepadconnected', this._onConnected);
    window.addEventListener('gamepaddisconnected', this._onDisconnected);
  }

  _onConnected(e) {
    const gp = e.gamepad;
    if (gp) {
      this.connected = true;
      this.activeIdx = gp.index;
      this.activeId = this._cleanName(gp.id);
      this.callbacks.onConnected?.(this.activeId);
    }
  }

  _onDisconnected(e) {
    if (this.activeIdx === null || (e.gamepad && e.gamepad.index === this.activeIdx)) {
      this.connected = false;
      this.activeIdx = null;
      this.activeId = '';
      this._btnPrev.clear();
      this._btnHoldTime.clear();
      this._btnLastRepeat.clear();
      this.callbacks.onDisconnected?.();
    }
  }

  _cleanName(id) {
    if (!id) return 'Controle Bluetooth';
    // Remove identificadores excessivos tipo " (STANDARD GAMEPAD Vendor: 045e Product: 028e)"
    const clean = id.replace(/\s*\([^)]*\)/g, '').trim();
    return clean || 'Controle Bluetooth';
  }

  /**
   * Obtém o controle ativo (com polling para contornar limitações do Safari iOS).
   */
  getGamepad() {
    if (typeof navigator.getGamepads !== 'function') return null;
    const gamepads = navigator.getGamepads();
    if (!gamepads) return null;

    if (this.activeIdx !== null && gamepads[this.activeIdx] && gamepads[this.activeIdx].connected) {
      return gamepads[this.activeIdx];
    }

    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (gp && gp.connected) {
        if (!this.connected) {
          this.connected = true;
          this.activeIdx = gp.index;
          this.activeId = this._cleanName(gp.id);
          this.callbacks.onConnected?.(this.activeId);
        }
        return gp;
      }
    }

    if (this.connected) {
      this.connected = false;
      this.activeIdx = null;
      this.activeId = '';
      this.callbacks.onDisconnected?.();
    }

    return null;
  }

  /**
   * Atualiza a leitura do controle. Deve ser chamado a cada frame no loop de animação.
   * @param {number} dt Delta time em segundos desde o último frame.
   */
  update(dt) {
    const gp = this.getGamepad();
    if (!gp) return;

    this._updateAxes(gp, dt);
    this._updateButtons(gp, dt);
  }

  _updateAxes(gp, dt) {
    if (!gp.axes || gp.axes.length === 0) return;

    // Eixos padrão:
    // Analógico Esquerdo: 0 (X), 1 (Y)
    // Analógico Direito:  2 (X), 3 (Y)
    const lx = gp.axes[0] ?? 0;
    const ly = gp.axes[1] ?? 0;
    const rx = gp.axes[2] ?? 0;
    const ry = gp.axes[3] ?? 0;

    // Seleciona o analógico com maior inclinação (geralmente analógico direito para câmera ou o único do mini controle)
    const rMag = Math.hypot(rx, ry);
    const lMag = Math.hypot(lx, ly);

    let ax = 0;
    let ay = 0;
    if (rMag > DEADZONE) {
      ax = rx;
      ay = ry;
    } else if (lMag > DEADZONE) {
      ax = lx;
      ay = ly;
    }

    const cleanVal = (v) => {
      if (Math.abs(v) <= DEADZONE) return 0;
      const sign = Math.sign(v);
      return sign * ((Math.abs(v) - DEADZONE) / (1 - DEADZONE));
    };

    const stickX = cleanVal(ax);
    const stickY = cleanVal(ay);

    // Se o Editor de Layout estiver aberto, o analógico move o HUD suavemente
    if (this.callbacks.isLayoutActive?.()) {
      if (stickX !== 0 || stickY !== 0) {
        this.callbacks.onLayoutStickMove?.(stickX * 22 * dt, stickY * 22 * dt);
      }
      return;
    }

    // Se o HUD da pílula estiver aberto, pausa giro para estabilizar visão durante ajuste
    if (this.callbacks.isPillActive?.()) {
      return;
    }

    // Girar visão horizontal (Yaw)
    if (stickX !== 0) {
      // stickX > 0 (inclinado para a direita) -> gira visão para a direita (yaw diminui)
      this.callbacks.onRotateYaw?.(-stickX * YAW_SPEED * dt);
    }

    // Inclinar visão vertical (Pitch) quando giroscópio não estiver ativo
    if (stickY !== 0) {
      // stickY < 0 (inclinado para cima) -> olha para cima
      this.callbacks.onRotatePitch?.(-stickY * PITCH_SPEED * dt);
    }
  }

  _updateButtons(gp, dt) {
    const isStandard = gp.mapping === 'standard';
    const count = gp.buttons ? gp.buttons.length : 0;

    for (let i = 0; i < count; i++) {
      const btn = gp.buttons[i];
      const isPressed = btn ? (btn.pressed || btn.value > 0.5) : false;
      const wasPressed = this._btnPrev.get(i) || false;
      const justPressed = isPressed && !wasPressed;

      let holdTime = this._btnHoldTime.get(i) || 0;
      let lastRepeat = this._btnLastRepeat.get(i) || 0;

      if (isPressed) {
        holdTime += dt;
        this._btnHoldTime.set(i, holdTime);
      } else {
        this._btnHoldTime.set(i, 0);
        this._btnLastRepeat.set(i, 0);
      }

      this._btnPrev.set(i, isPressed);

      // Despacha ações
      if (isStandard) {
        this._handleStandardButton(i, justPressed, isPressed, holdTime, lastRepeat);
      } else {
        this._handleGenericButton(i, justPressed, isPressed, holdTime, lastRepeat);
      }
    }
  }

  _handleStandardButton(index, justPressed, isPressed, holdTime, lastRepeat) {
    // Modo de ajuste interativo do Layout do HUD
    if (this.callbacks.isLayoutActive?.()) {
      // Fechar e Salvar (B / Círculo ou Start ou Select/Back)
      if ((index === 1 || index === 8 || index === 9) && justPressed) {
        this.callbacks.onLayoutClose?.();
        return;
      }
      // Alternar seguir centro óptico (X / Quadrado)
      if (index === 2 && justPressed) {
        this.callbacks.onLayoutToggleLens?.();
        return;
      }
      // Restaurar valor do elemento ativo (Y / Triângulo)
      if (index === 3 && justPressed) {
        this.callbacks.onLayoutReset?.();
        return;
      }
      // Elemento anterior (L1 / LB)
      if (index === 4 && justPressed) {
        this.callbacks.onLayoutPrev?.();
        return;
      }
      // Próximo elemento (R1 / RB)
      if (index === 5 && justPressed) {
        this.callbacks.onLayoutNext?.();
        return;
      }
      // Escala diminuir (L2 / LT)
      if (index === 6) {
        this._handleRepeatableLayoutAdjust('scale', -1, index, justPressed, isPressed, holdTime, lastRepeat);
        return;
      }
      // Escala aumentar (R2 / RT)
      if (index === 7) {
        this._handleRepeatableLayoutAdjust('scale', 1, index, justPressed, isPressed, holdTime, lastRepeat);
        return;
      }
      // Mover Cima (D-Pad Cima)
      if (index === 12) {
        this._handleRepeatableLayoutAdjust('moveY', -1, index, justPressed, isPressed, holdTime, lastRepeat);
        return;
      }
      // Mover Baixo (D-Pad Baixo)
      if (index === 13) {
        this._handleRepeatableLayoutAdjust('moveY', 1, index, justPressed, isPressed, holdTime, lastRepeat);
        return;
      }
      // Mover Esquerda (D-Pad Esquerda)
      if (index === 14) {
        this._handleRepeatableLayoutAdjust('moveX', -1, index, justPressed, isPressed, holdTime, lastRepeat);
        return;
      }
      // Mover Direita (D-Pad Direita)
      if (index === 15) {
        this._handleRepeatableLayoutAdjust('moveX', 1, index, justPressed, isPressed, holdTime, lastRepeat);
        return;
      }
      // Botão 0 (A / Cross) é reservado para cliques e seleção pelo cursor virtual
      return;
    }

    // Modo de ajuste da Pílula HUD
    if (this.callbacks.isPillActive?.()) {
      // Fechar (B / Círculo ou Start/Menu)
      if ((index === 1 || index === 8 || index === 9) && justPressed) {
        this.callbacks.onPillClose?.();
        return;
      }
      // Ciclar Preset de Headset (X / Quadrado)
      if (index === 2 && justPressed) {
        this.callbacks.onPillPresetCycle?.(1);
        return;
      }
      // Restaurar valor padrão do parâmetro (Y / Triângulo)
      if (index === 3 && justPressed) {
        this.callbacks.onPillReset?.();
        return;
      }
      // Parâmetro anterior (L1 / LB ou D-Pad Cima)
      if ((index === 4 || index === 12) && justPressed) {
        this.callbacks.onPillPrev?.();
        return;
      }
      // Próximo parâmetro (R1 / RB ou D-Pad Baixo)
      if ((index === 5 || index === 13) && justPressed) {
        this.callbacks.onPillNext?.();
        return;
      }
      // Reduzir valor do ajuste (D-Pad Esquerda ou Gatilho L2)
      if (index === 14 || index === 6) {
        this._handleRepeatablePillAdjust(-1, index, justPressed, isPressed, holdTime, lastRepeat);
        return;
      }
      // Aumentar valor do ajuste (D-Pad Direita ou Gatilho R2)
      if (index === 15 || index === 7) {
        this._handleRepeatablePillAdjust(1, index, justPressed, isPressed, holdTime, lastRepeat);
        return;
      }
      // Botão 0 (A / Cross) é reservado para cliques e seleção pelo cursor virtual
      return;
    }

    // Abrir o editor de layout segurando Y (botão 3) por 1.2 segundos
    if (index === 3) {
      if (isPressed && holdTime >= 1.2 && !this._btn3LongFired) {
        this._btn3LongFired = true;
        this.callbacks.onLayoutOpen?.();
        return;
      }
      if (!isPressed) {
        this._btn3LongFired = false;
      }
    }

    // Mapeamento W3C Standard Gamepad:
    // 0: A / Cruz
    // 1: B / Círculo
    // 2: X / Quadrado
    // 3: Y / Triângulo
    // 4: L1 / LB
    // 5: R1 / RB
    // 6: L2 / LT
    // 7: R2 / RT
    // 8: Back / Select / Share
    // 9: Start / Options / Menu
    // 10: L3 (clique analógico esquerdo)
    // 11: R3 (clique analógico direito)
    // 12: D-Pad Cima
    // 13: D-Pad Baixo
    // 14: D-Pad Esquerda
    // 15: D-Pad Direita

    // Play / Pause ou Menu
    if (index === 9 && justPressed) {
      if (this.callbacks.onToggleMenu) {
        this.callbacks.onToggleMenu();
      } else {
        this.callbacks.onPlayPause?.();
      }
      return;
    }
    if (index === 0 && justPressed) {
      this.callbacks.onPlayPause?.();
      return;
    }

    // Recentralizar a visão (Recenter)
    if ((index === 1 || index === 3 || index === 10 || index === 11) && justPressed) {
      this.callbacks.onRecenter?.();
      return;
    }

    // Alternar modo óculos (Headset VR)
    if ((index === 2 || index === 8) && justPressed) {
      this.callbacks.onToggleHeadset?.();
      return;
    }

    // Próximo vídeo (segurar L1 e apertar R1) / Vídeo anterior (segurar R1 e apertar L1)
    if (index === 5 && justPressed && this._btnPrev.get(4)) {
      this.callbacks.onNextVideo?.();
      return;
    }
    if (index === 4 && justPressed && this._btnPrev.get(5)) {
      this.callbacks.onPrevVideo?.();
      return;
    }

    // Voltar vídeo (-10s com D-Pad Esquerda ou L1)
    if (index === 14 || index === 4) {
      this._handleRepeatableSeek(-10, index, justPressed, isPressed, holdTime, lastRepeat);
      return;
    }

    // Avançar vídeo (+10s com D-Pad Direita ou R1)
    if (index === 15 || index === 5) {
      this._handleRepeatableSeek(10, index, justPressed, isPressed, holdTime, lastRepeat);
      return;
    }

    // Zoom com Gatilhos (L2 / LT diminui zoom, R2 / RT aumenta zoom)
    if (index === 6) {
      this._handleRepeatableZoom(-1, index, justPressed, isPressed, holdTime, lastRepeat);
      return;
    }
    if (index === 7) {
      this._handleRepeatableZoom(1, index, justPressed, isPressed, holdTime, lastRepeat);
      return;
    }

    // Volume / Zoom FOV
    if (index === 12 && justPressed) {
      this.callbacks.onVolumeChange?.(0.05);
      return;
    }
    if (index === 13 && justPressed) {
      this.callbacks.onVolumeChange?.(-0.05);
      return;
    }
  }

  _handleGenericButton(index, justPressed, isPressed, holdTime, lastRepeat) {
    // Modo de ajuste interativo do Layout do HUD para mini controles
    if (this.callbacks.isLayoutActive?.()) {
      if ((index === 1 || index === 8 || index === 9) && justPressed) {
        this.callbacks.onLayoutClose?.();
        return;
      }
      if (index === 2 && justPressed) {
        this.callbacks.onLayoutToggleLens?.();
        return;
      }
      if (index === 3 && justPressed) {
        this.callbacks.onLayoutReset?.();
        return;
      }
      if ((index === 4 || index === 12) && justPressed) {
        this.callbacks.onLayoutPrev?.();
        return;
      }
      if ((index === 5 || index === 13) && justPressed) {
        this.callbacks.onLayoutNext?.();
        return;
      }
      if (index === 14) {
        this._handleRepeatableLayoutAdjust('moveX', -1, index, justPressed, isPressed, holdTime, lastRepeat);
        return;
      }
      if (index === 15) {
        this._handleRepeatableLayoutAdjust('moveX', 1, index, justPressed, isPressed, holdTime, lastRepeat);
        return;
      }
      return;
    }

    // Modo de ajuste da Pílula HUD para mini controles
    if (this.callbacks.isPillActive?.()) {
      if ((index === 1 || index === 8 || index === 9) && justPressed) {
        this.callbacks.onPillClose?.();
        return;
      }
      if (index === 2 && justPressed) {
        this.callbacks.onPillPresetCycle?.(1);
        return;
      }
      if (index === 3 && justPressed) {
        this.callbacks.onPillReset?.();
        return;
      }
      if ((index === 4 || index === 12) && justPressed) {
        this.callbacks.onPillPrev?.();
        return;
      }
      if ((index === 5 || index === 13) && justPressed) {
        this.callbacks.onPillNext?.();
        return;
      }
      if (index === 14) {
        this._handleRepeatablePillAdjust(-1, index, justPressed, isPressed, holdTime, lastRepeat);
        return;
      }
      if (index === 15) {
        this._handleRepeatablePillAdjust(1, index, justPressed, isPressed, holdTime, lastRepeat);
        return;
      }
      // Botão 0 (Gatilho / A) é reservado para cliques e seleção pelo cursor virtual
      return;
    }

    // Mini controles VR em modo genérico (Mocute, VR Box, etc.)
    switch (index) {
      case 0: // Botão principal / gatilho
        if (justPressed) this.callbacks.onPlayPause?.();
        break;
      case 9:
        if (justPressed) {
          if (this.callbacks.onToggleMenu) this.callbacks.onToggleMenu();
          else this.callbacks.onPlayPause?.();
        }
        break;
      case 1: // Botão secundário / B
      case 3:
      case 10:
      case 11:
        if (justPressed) this.callbacks.onRecenter?.();
        break;
      case 2:
      case 8:
        if (justPressed) this.callbacks.onToggleHeadset?.();
        break;
      case 4:
      case 14:
        this._handleRepeatableSeek(-10, index, justPressed, isPressed, holdTime, lastRepeat);
        break;
      case 5:
      case 15:
        this._handleRepeatableSeek(10, index, justPressed, isPressed, holdTime, lastRepeat);
        break;
      case 12:
        if (justPressed) this.callbacks.onVolumeChange?.(0.05);
        break;
      case 13:
        if (justPressed) this.callbacks.onVolumeChange?.(-0.05);
        break;
    }
  }

  _handleRepeatableLayoutAdjust(type, val, index, justPressed, isPressed, holdTime, lastRepeat) {
    const fire = () => {
      if (type === 'moveX') this.callbacks.onLayoutMove?.(val, 0);
      else if (type === 'moveY') this.callbacks.onLayoutMove?.(0, val);
      else if (type === 'scale') this.callbacks.onLayoutScale?.(val);
    };
    if (justPressed) {
      fire();
      this._btnLastRepeat.set(index, 0);
    } else if (isPressed && holdTime >= REPEAT_DELAY) {
      const elapsedSinceRepeat = holdTime - REPEAT_DELAY - lastRepeat;
      if (elapsedSinceRepeat >= 0.08) {
        fire();
        this._btnLastRepeat.set(index, holdTime - REPEAT_DELAY);
      }
    }
  }

  _handleRepeatablePillAdjust(direction, index, justPressed, isPressed, holdTime, lastRepeat) {
    if (justPressed) {
      this.callbacks.onPillAdjust?.(direction);
      this._btnLastRepeat.set(index, 0);
    } else if (isPressed && holdTime >= REPEAT_DELAY) {
      const elapsedSinceRepeat = holdTime - REPEAT_DELAY - lastRepeat;
      if (elapsedSinceRepeat >= 0.08) {
        this.callbacks.onPillAdjust?.(direction);
        this._btnLastRepeat.set(index, holdTime - REPEAT_DELAY);
      }
    }
  }

  _handleRepeatableSeek(seconds, index, justPressed, isPressed, holdTime, lastRepeat) {
    if (justPressed) {
      this.callbacks.onSeek?.(seconds);
      this._btnLastRepeat.set(index, 0);
    } else if (isPressed && holdTime >= REPEAT_DELAY) {
      const elapsedSinceRepeat = holdTime - REPEAT_DELAY - lastRepeat;
      if (elapsedSinceRepeat >= REPEAT_RATE) {
        this.callbacks.onSeek?.(seconds);
        this._btnLastRepeat.set(index, holdTime - REPEAT_DELAY);
      }
    }
  }

  _handleRepeatableZoom(dir, index, justPressed, isPressed, holdTime, lastRepeat) {
    if (justPressed) {
      this.callbacks.onZoom?.(dir);
      this._btnLastRepeat.set(index, 0);
    } else if (isPressed && holdTime >= REPEAT_DELAY) {
      const elapsedSinceRepeat = holdTime - REPEAT_DELAY - lastRepeat;
      if (elapsedSinceRepeat >= 0.12) {
        this.callbacks.onZoom?.(dir);
        this._btnLastRepeat.set(index, holdTime - REPEAT_DELAY);
      }
    }
  }

  destroy() {
    window.removeEventListener('gamepadconnected', this._onConnected);
    window.removeEventListener('gamepaddisconnected', this._onDisconnected);
  }
}
