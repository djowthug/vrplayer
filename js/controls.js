// Controles de visão: giroscópio, arrastar, pinça, toques e recentralizar.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
// Converte o sistema do aparelho (tela para cima) para câmera olhando para frente.
const Q_SCREEN = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class LookControls {
  constructor(el, getFov) {
    this.el = el;
    this.getFov = getFov;

    this.deviceQ = new THREE.Quaternion();
    this.hasGyro = false;
    this.needsRecenter = true;
    this.yawOffset = 0;
    this.dragYaw = 0;
    this.dragPitch = 0;

    /** No modo óculos: sem arrastar, com toque duplo. */
    this.headsetMode = false;
    /** Se true, o toque simples é disparado na hora (sem esperar por toque duplo). */
    this.immediateTap = false;

    this.onTap = null;
    this.onDoubleTap = null;
    this.onLongPress = null;
    this.onPinch = null;

    this._euler = new THREE.Euler();
    this._q0 = new THREE.Quaternion();
    this._qYaw = new THREE.Quaternion();
    this._tmpQ = new THREE.Quaternion();
    this._fwd = new THREE.Vector3();
    this._pointers = new Map();
    this._onOrient = this._onOrient.bind(this);

    el.addEventListener('pointerdown', (e) => this._down(e));
    el.addEventListener('pointermove', (e) => this._move(e));
    el.addEventListener('pointerup', (e) => this._up(e, false));
    el.addEventListener('pointercancel', (e) => this._up(e, true));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * Pede permissão ao giroscópio. Precisa ser chamado dentro de um toque do usuário
   * (requestPermission é chamado de forma síncrona antes de qualquer await).
   * @returns {Promise<boolean>}
   */
  requestGyro() {
    if (typeof window.DeviceOrientationEvent === 'undefined') return Promise.resolve(false);
    const listen = () => {
      window.addEventListener('deviceorientation', this._onOrient);
      return true;
    };
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      return DeviceOrientationEvent.requestPermission()
        .then((state) => (state === 'granted' ? listen() : false))
        .catch(() => false);
    }
    return Promise.resolve(listen());
  }

  _onOrient(e) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const angle = screen.orientation && typeof screen.orientation.angle === 'number'
      ? screen.orientation.angle
      : window.orientation || 0;
    this._euler.set(e.beta * DEG, e.alpha * DEG, -e.gamma * DEG, 'YXZ');
    this.deviceQ
      .setFromEuler(this._euler)
      .multiply(Q_SCREEN)
      .multiply(this._q0.setFromAxisAngle(Z_AXIS, -angle * DEG));
    if (!this.hasGyro) {
      this.hasGyro = true;
      this.dragPitch = 0;
      this.needsRecenter = true;
    }
  }

  _compose(out) {
    const yaw = this.yawOffset + this.dragYaw;
    if (this.hasGyro) {
      this._qYaw.setFromAxisAngle(Y_AXIS, yaw);
      out.copy(this._qYaw).multiply(this.deviceQ);
    } else {
      this._euler.set(this.dragPitch, yaw, 0, 'YXZ');
      out.setFromEuler(this._euler);
    }
    return out;
  }

  getQuaternion(out) {
    if (this.needsRecenter) {
      this.needsRecenter = false;
      this._recenterNow();
    }
    return this._compose(out);
  }

  /** Traz o centro do vídeo para a direção em que a pessoa está olhando. */
  recenter() {
    this.needsRecenter = true;
  }

  _recenterNow() {
    this._compose(this._tmpQ);
    this._fwd.set(0, 0, -1).applyQuaternion(this._tmpQ);
    const yaw = Math.atan2(-this._fwd.x, -this._fwd.z);
    this.yawOffset -= yaw;
    if (!this.hasGyro) this.dragPitch = 0;
  }

  // ---------------- Ponteiros ----------------
  _dist() {
    const [a, b] = [...this._pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  _down(e) {
    this.el.setPointerCapture?.(e.pointerId);
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    clearTimeout(this._longTimer);
    if (this._pointers.size === 1) {
      this._start = { x: e.clientX, y: e.clientY };
      this._moved = false;
      this._long = false;
      this._longTimer = setTimeout(() => {
        if (!this._moved && this._pointers.size === 1) {
          this._long = true;
          this.onLongPress?.();
        }
      }, 600);
    } else {
      this._moved = true;
      this._pinchDist = this._dist();
    }
  }

  _move(e) {
    const p = this._pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;

    if (this._pointers.size === 1) {
      if (!this._moved && Math.hypot(e.clientX - this._start.x, e.clientY - this._start.y) > 10) {
        this._moved = true;
        clearTimeout(this._longTimer);
      }
      if (this._moved && !this.headsetMode) {
        const k = (this.getFov() * DEG) / (this.el.clientHeight || 1);
        this.dragYaw += dx * k;
        if (!this.hasGyro) this.dragPitch = clamp(this.dragPitch + dy * k, -85 * DEG, 85 * DEG);
      }
    } else if (this._pointers.size === 2) {
      const d = this._dist();
      if (this._pinchDist > 0 && d > 0) this.onPinch?.(d / this._pinchDist);
      this._pinchDist = d;
    }
  }

  _up(e, cancelled) {
    if (!this._pointers.has(e.pointerId)) return;
    this._pointers.delete(e.pointerId);
    if (this._pointers.size > 0) {
      this._pinchDist = this._pointers.size === 2 ? this._dist() : 0;
      return;
    }
    clearTimeout(this._longTimer);
    if (cancelled || this._moved || this._long) return;

    if (!this.headsetMode || this.immediateTap) {
      this.onTap?.();
      return;
    }
    if (this._tapTimer) {
      clearTimeout(this._tapTimer);
      this._tapTimer = null;
      this.onDoubleTap?.();
    } else {
      this._tapTimer = setTimeout(() => {
        this._tapTimer = null;
        this.onTap?.();
      }, 280);
    }
  }
}
