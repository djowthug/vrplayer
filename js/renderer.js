// Renderizador Three.js: modo Tela (um olho) e modo Óculos (estéreo + correção de lente).
import * as THREE from 'three';
import { createVideoMaterial, createDistortionMaterial, PROJECTION_MODE } from './projections.js';
import { EnvironmentManager } from './environments.js';

function buildCurvedPlaneGeometry(w, h, curvature = 0) {
  if (curvature <= 0.02) {
    return new THREE.PlaneGeometry(w, h, 1, 1);
  }
  const segsX = 64;
  const segsY = 8;
  const geom = new THREE.PlaneGeometry(w, h, segsX, segsY);
  const pos = geom.attributes.position;
  const maxAngle = (75 * Math.PI) / 180;
  const arc = curvature * maxAngle;
  const radius = w / arc;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const theta = (x / (w / 2)) * (arc / 2);
    const newZ = radius * (1 - Math.cos(theta));
    const newX = radius * Math.sin(theta);
    pos.setX(i, newX);
    pos.setZ(i, newZ);
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  return geom;
}

export class VRRenderer {
  constructor(container, video) {
    this.container = container;
    this.video = video;
    this.spatialAudio = null;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // Cores são passadas sem conversão: o vídeo já está em sRGB.
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

    const tex = (this.texture = new THREE.VideoTexture(video));
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;

    this.material = createVideoMaterial(tex);
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(100, 96, 64), this.material);
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.plane.position.set(0, 0, -2.8);
    this.plane.renderOrder = 10;
    this.material.depthWrite = true;
    this.material.depthTest = true;
    this.scene.add(this.sphere, this.plane);

    this.envManager = new EnvironmentManager(this.scene, this.plane);

    const rtOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true };
    this.rtL = new THREE.WebGLRenderTarget(2, 2, rtOpts);
    this.rtR = new THREE.WebGLRenderTarget(2, 2, rtOpts);
    this.rtMono = new THREE.WebGLRenderTarget(2, 2, rtOpts);
    this.postMaterial = createDistortionMaterial(this.rtL.texture, this.rtR.texture);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial);
    quad.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(quad);
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.format = { projection: '360', layout: 'mono', swap: false };
    this.headset = false;
    this.headsetSettings = {
      fov: 82, k1: 0.22, k2: 0.04, ca: 0.05, sharpening: 35, ipd: 0,
      lensLX: 0, lensLY: 0, lensRX: 0, lensRY: 0, vShift: 0, roll: 0,
    };
    this.viewFov = 75;
    this.desktopOptics = { k1: 0, k2: 0, ca: 0, sharpening: 0 };
    this.fisheyeSettings = { fov: 180, scale: 1.0 };
    this.screenDistance = 2.8;
    this.desktopDistance = 6.0;
    this.screenCurvature = 0.35;
    this.desktopCurvature = 0.0;
    this.screenScale = 1.0;
    this._lastW = null;
    this._lastH = null;
    this._lastCurvature = null;
    this._rollQ = new THREE.Quaternion();
    this._zAxis = new THREE.Vector3(0, 0, 1);

    this.resize();
    this.setFormat(this.format);
  }

  currentFov() {
    return this.headset ? this.headsetSettings.fov : this.viewFov;
  }

  setFormat(format) {
    this.format = { ...this.format, ...format };
    const flat = this.format.projection === 'flat';
    this.material.uniforms.mode.value = PROJECTION_MODE[this.format.projection] ?? 0;
    this.sphere.visible = !flat;
    this.plane.visible = flat;
    this.envManager.setVisible(flat && (!this.headset || this.envManager.currentEnv !== 'void'));
    this.updatePlane();
  }

  setFisheyeSettings({ fov, scale } = {}) {
    if (fov !== undefined) {
      this.fisheyeSettings.fov = fov;
      this.material.uniforms.fisheyeFov.value = (fov * Math.PI) / 180;
    }
    if (scale !== undefined) {
      this.fisheyeSettings.scale = scale;
      this.material.uniforms.fisheyeScale.value = scale;
    }
  }

  /** Calibração óptica do modo Tela (monocular): { k1, k2, ca, sharpening }. */
  setDesktopOptics(o = {}) {
    this.desktopOptics = { ...this.desktopOptics, ...o };
  }

  /** True quando o modo Tela precisa da passada de pós-processamento. */
  desktopNeedsPost() {
    const o = this.desktopOptics;
    return (o.k1 || 0) > 0.001 || (o.k2 || 0) > 0.001 || (o.ca || 0) > 0.0005 || (o.sharpening || 0) > 0.5;
  }

  /** Preenche os uniformes do shader de pós-processamento a partir de um perfil óptico. */
  _applyOptics(o, stereo, rt) {
    const u = this.postMaterial.uniforms;
    const ca = o.ca || 0;
    u.isStereo.value = stereo;
    u.k1.value = o.k1 || 0;
    u.k2.value = o.k2 || 0;
    u.caK.value.set(-ca, 0, ca);
    u.sharpness.value = Math.min(1, Math.max(0, (o.sharpening || 0) / 100));
    u.texel.value.set(1 / Math.max(1, rt.width), 1 / Math.max(1, rt.height));
    if (stereo) {
      u.ipd.value = o.ipd || 0;
      u.centerL.value.set(o.lensLX || 0, o.lensLY || 0);
      u.centerR.value.set(o.lensRX || 0, o.lensRY || 0);
      u.vShift.value = o.vShift || 0;
      u.aspect.value = this.width / 2 / this.height;
    } else {
      u.ipd.value = 0;
      u.centerL.value.set(0, 0);
      u.centerR.value.set(0, 0);
      u.vShift.value = 0;
      u.aspect.value = this.width / this.height;
    }
  }

  setEnvironment(envId) {
    this.envManager.setEnvironment(envId);
  }

  /** Dimensiona e posiciona a "tela de cinema" (com curvatura opcional e distância personalizada). */
  updatePlane() {
    const vw = this.video.videoWidth || 16;
    const vh = this.video.videoHeight || 9;
    let r = vw / vh;
    const { layout } = this.format;
    if (layout === 'sbs' && r > 2.5) r /= 2;      // SBS completo (ex.: 3840x1080)
    if (layout === 'tb' && r < 1.2) r *= 2;       // TB completo (ex.: 1920x2160)
    const scale = this.screenScale || 1.0;
    const h = 4 * scale;
    const w = h * r;

    // No modo óculos (headset), usa distância e curvatura imersivas padrão; no modo desktop, mantém valores confortáveis de monitor
    const curv = this.headset ? (this.screenCurvature ?? 0.35) : (this.desktopCurvature ?? 0.0);
    if (this._lastW !== w || this._lastH !== h || this._lastCurvature !== curv) {
      this._lastW = w;
      this._lastH = h;
      this._lastCurvature = curv;
      if (this.plane.geometry) this.plane.geometry.dispose();
      this.plane.geometry = buildCurvedPlaneGeometry(w, h, curv);
      this.plane.scale.set(1, 1, 1);
    }

    if (this.material?.uniforms?.curvature) {
      this.material.uniforms.curvature.value = curv;
    }

    const dist = this.headset ? (this.screenDistance || 2.8) : (this.desktopDistance || 6.0);
    this.plane.position.set(0, 0, -dist);
    this.envManager.updateScreenSize(w, h);
  }

  /** Ajusta parâmetros do Modo Cinema (distância virtual, curvatura IMAX e escala). */
  setCinemaScreen({ distance, curvature, scale } = {}) {
    if (distance !== undefined) {
      this.screenDistance = distance;
      if (!this.headset) this.desktopDistance = distance;
    }
    if (curvature !== undefined) {
      this.screenCurvature = curvature;
      if (!this.headset) this.desktopCurvature = curvature;
    }
    if (scale !== undefined) this.screenScale = scale;
    this.updatePlane();
  }

  setImage({ brightness = 0, contrast = 1, exposure = 0, saturation = 1, gamma = 1 } = {}) {
    const u = this.material.uniforms;
    if (u.brightness) u.brightness.value = brightness;
    if (u.contrast) u.contrast.value = contrast;
    if (u.exposure) u.exposure.value = exposure;
    if (u.saturation) u.saturation.value = saturation;
    if (u.gamma) u.gamma.value = gamma;
  }

  setHeadsetSettings(s) {
    this.headsetSettings = { ...this.headsetSettings, ...s };
    if (this.headset) this._applyOptics(this.headsetSettings, true, this.rtL);
  }

  setHeadset(on) {
    this.headset = on;
    const flat = this.format.projection === 'flat';
    this.envManager.setVisible(flat && (!this.headset || this.envManager.currentEnv !== 'void'));
    this.updatePlane();
    this.resize();
  }

  /** Seleciona a região da textura correspondente a cada olho. */
  setEye(eye) {
    const { layout, swap } = this.format;
    const e = swap ? 1 - eye : eye;
    const rect = this.material.uniforms.eyeRect.value;
    if (layout === 'sbs') rect.set(e === 0 ? 0 : 0.5, 0, 0.5, 1);
    else if (layout === 'tb') rect.set(0, e === 0 ? 0.5 : 0, 1, 0.5); // v = 1 é o topo
    else rect.set(0, 0, 1, 1);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    const ew = Math.max(1, Math.floor((w / 2) * pr));
    const eh = Math.max(1, Math.floor(h * pr));
    const fw = Math.max(1, Math.floor(w * pr));
    this.rtL.setSize(ew, eh);
    this.rtR.setSize(ew, eh);
    this.rtMono.setSize(fw, eh);
    this.postMaterial.uniforms.aspect.value = this.headset ? w / 2 / h : w / h;
  }

  setSpatialAudio(spatialAudio) {
    this.spatialAudio = spatialAudio;
  }

  render(quaternion, dt = 0.016) {
    this.envManager.update(dt);
    const { renderer: r, camera, scene } = this;

    const isFlat = this.format.projection === 'flat';
    const isHeadLocked = this.headset && isFlat;

    if (isHeadLocked) {
      // Modo Head-Locked: tela virtual ancorada na linha de visão central do usuário
      camera.quaternion.set(0, 0, 0, 1);
    } else {
      camera.quaternion.copy(quaternion);
    }

    if (this.spatialAudio) {
      this.spatialAudio.updateListenerFromCamera(camera);
    }

    if (!this.headset) {
      camera.fov = this.viewFov;
      camera.aspect = this.width / this.height;
      camera.updateProjectionMatrix();
      this.setEye(0);

      if (this.desktopNeedsPost()) {
        r.setRenderTarget(this.rtMono);
        r.render(scene, camera);

        this._applyOptics(this.desktopOptics, false, this.rtMono);
        this.postMaterial.uniforms.tLeft.value = this.rtMono.texture;

        r.setRenderTarget(null);
        r.render(this.postScene, this.postCamera);
      } else {
        r.setRenderTarget(null);
        r.render(scene, camera);
      }
      return;
    }

    const hs = this.headsetSettings;
    // Inclinação do horizonte (Roll): gira a câmera em torno do eixo de visão,
    // evitando cantos pretos que surgiriam ao girar a imagem já renderizada.
    if (hs.roll) {
      this._rollQ.setFromAxisAngle(this._zAxis, THREE.MathUtils.degToRad(hs.roll));
      camera.quaternion.multiply(this._rollQ);
    }

    camera.fov = hs.fov;
    camera.aspect = this.width / 2 / this.height;
    camera.updateProjectionMatrix();

    this.setEye(0);
    r.setRenderTarget(this.rtL);
    r.render(scene, camera);

    this.setEye(1);
    r.setRenderTarget(this.rtR);
    r.render(scene, camera);

    this._applyOptics(hs, true, this.rtL);
    const u = this.postMaterial.uniforms;
    u.tLeft.value = this.rtL.texture;
    u.tRight.value = this.rtR.texture;

    r.setRenderTarget(null);
    r.render(this.postScene, this.postCamera);
  }
}
