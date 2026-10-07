// Renderizador Three.js: modo Tela (um olho) e modo Óculos (estéreo + correção de lente).
import * as THREE from 'three';
import { createVideoMaterial, createDistortionMaterial, PROJECTION_MODE } from './projections.js';

export class VRRenderer {
  constructor(container, video) {
    this.container = container;
    this.video = video;

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
    this.plane.position.set(0, 0, -6);
    this.scene.add(this.sphere, this.plane);

    const rtOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true };
    this.rtL = new THREE.WebGLRenderTarget(2, 2, rtOpts);
    this.rtR = new THREE.WebGLRenderTarget(2, 2, rtOpts);
    this.postMaterial = createDistortionMaterial(this.rtL.texture, this.rtR.texture);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial);
    quad.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(quad);
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.format = { projection: '360', layout: 'mono', swap: false };
    this.headset = false;
    this.headsetSettings = { ipd: 0, fov: 90, distortion: 0.25 };
    this.viewFov = 75;

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
    this.scene.background.set(flat ? 0x0c0c0e : 0x000000);
    this.updatePlane();
  }

  /** Dimensiona a "tela de cinema" de acordo com a proporção de um olho. */
  updatePlane() {
    const vw = this.video.videoWidth || 16;
    const vh = this.video.videoHeight || 9;
    let r = vw / vh;
    const { layout } = this.format;
    if (layout === 'sbs' && r > 2.5) r /= 2;      // SBS completo (ex.: 3840x1080)
    if (layout === 'tb' && r < 1.2) r *= 2;       // TB completo (ex.: 1920x2160)
    const h = 4;
    this.plane.scale.set(h * r, h, 1);
  }

  setImage({ brightness, contrast }) {
    this.material.uniforms.brightness.value = brightness;
    this.material.uniforms.contrast.value = contrast;
  }

  setHeadsetSettings(s) {
    this.headsetSettings = { ...this.headsetSettings, ...s };
    const u = this.postMaterial.uniforms;
    u.ipd.value = this.headsetSettings.ipd;
    u.k1.value = this.headsetSettings.distortion;
    u.k2.value = this.headsetSettings.distortion * 0.4;
  }

  setHeadset(on) {
    this.headset = on;
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
    this.rtL.setSize(ew, eh);
    this.rtR.setSize(ew, eh);
    this.postMaterial.uniforms.aspect.value = w / 2 / h;
  }

  render(quaternion) {
    const { renderer: r, camera, scene } = this;
    camera.quaternion.copy(quaternion);

    if (!this.headset) {
      camera.fov = this.viewFov;
      camera.aspect = this.width / this.height;
      camera.updateProjectionMatrix();
      this.setEye(0);
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }

    camera.fov = this.headsetSettings.fov;
    camera.aspect = this.width / 2 / this.height;
    camera.updateProjectionMatrix();

    this.setEye(0);
    r.setRenderTarget(this.rtL);
    r.render(scene, camera);

    this.setEye(1);
    r.setRenderTarget(this.rtR);
    r.render(scene, camera);

    r.setRenderTarget(null);
    r.render(this.postScene, this.postCamera);
  }
}
