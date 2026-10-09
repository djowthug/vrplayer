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

    // Play / Pause
    if ((index === 0 || index === 9) && justPressed) {
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

    // Voltar vídeo (-10s)
    if (index === 14 || index === 4 || index === 6) {
      this._handleRepeatableSeek(-10, index, justPressed, isPressed, holdTime, lastRepeat);
      return;
    }

    // Avançar vídeo (+10s)
    if (index === 15 || index === 5 || index === 7) {
      this._handleRepeatableSeek(10, index, justPressed, isPressed, holdTime, lastRepeat);
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
    // Mini controles VR em modo genérico (Mocute, VR Box, etc.)
    switch (index) {
      case 0: // Botão principal / gatilho
      case 9:
        if (justPressed) this.callbacks.onPlayPause?.();
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

  destroy() {
    window.removeEventListener('gamepadconnected', this._onConnected);
    window.removeEventListener('gamepaddisconnected', this._onDisconnected);
  }
}
