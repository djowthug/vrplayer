// Ambientes Virtuais 3D para Three.js (Modo Cinema e Projeções Planas)
// Procedural, ultraleve (zero downloads externos), com alta taxa de quadros (60/120 FPS).

import * as THREE from 'three';

/** Gera textura circular suave de partícula com gradiente radial para as estrelas */
function createStarTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  gradient.addColorStop(0.2, 'rgba(215, 235, 255, 0.9)');
  gradient.addColorStop(0.55, 'rgba(120, 180, 255, 0.35)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

export class EnvironmentManager {
  constructor(scene, planeMesh) {
    this.scene = scene;
    this.planeMesh = planeMesh;
    this.currentEnv = 'cinema';
    this.visible = false;

    this.rootGroup = new THREE.Group();
    this.rootGroup.renderOrder = 0;
    this.rootGroup.visible = false;
    this.scene.add(this.rootGroup);

    this.envGroups = {
      void: new THREE.Group(),
      cinema: new THREE.Group(),
      space: new THREE.Group(),
      grid: new THREE.Group(),
    };

    Object.values(this.envGroups).forEach((g) => {
      g.renderOrder = 0;
      this.rootGroup.add(g);
    });

    this.initCinema();
    this.initSpace();
    this.initGrid();

    this.setEnvironment(this.currentEnv);
  }

  // ---------------- 1. Sala de Cinema IMAX ----------------
  initCinema() {
    const group = this.envGroups.cinema;

    // Piso escuro com perspectiva (rebaixado a y = -2.6 para não encostar na tela)
    const floorGeo = new THREE.PlaneGeometry(24, 28);
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0x0f1117,
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -2.6, -4);
    floor.renderOrder = 0;
    group.add(floor);

    // Linhas de LED azul no rodapé do corredor
    const lineMatL = new THREE.LineBasicMaterial({ color: 0x0a84ff, transparent: true, opacity: 0.4 });
    const ptsL = [new THREE.Vector3(-4.2, -2.58, 8), new THREE.Vector3(-6.2, -2.58, -12)];
    const lineL = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ptsL), lineMatL);
    lineL.renderOrder = 0;
    group.add(lineL);

    const lineMatR = new THREE.LineBasicMaterial({ color: 0x0a84ff, transparent: true, opacity: 0.4 });
    const ptsR = [new THREE.Vector3(4.2, -2.58, 8), new THREE.Vector3(6.2, -2.58, -12)];
    const lineR = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ptsR), lineMatR);
    lineR.renderOrder = 0;
    group.add(lineR);

    // Paredes acústicas laterais com painéis geométricos sutis
    const wallMat = new THREE.MeshBasicMaterial({ color: 0x141620, depthWrite: true, depthTest: true });
    const wallGeo = new THREE.BoxGeometry(0.3, 8, 20);

    const wallLeft = new THREE.Mesh(wallGeo, wallMat);
    wallLeft.position.set(-9.5, 1.2, -4);
    wallLeft.rotation.y = 0.12;
    wallLeft.renderOrder = 0;
    group.add(wallLeft);

    const wallRight = new THREE.Mesh(wallGeo, wallMat);
    wallRight.position.set(9.5, 1.2, -4);
    wallRight.rotation.y = -0.12;
    wallRight.renderOrder = 0;
    group.add(wallRight);

    // Fileiras de poltronas de cinema em silhueta
    // Posicionadas estritamente no piso (y = -2.44, topo em -2.29), abaixo da tela (fundo da tela em y = -2.0)
    const seatMat = new THREE.MeshBasicMaterial({ color: 0x08090d, depthWrite: true, depthTest: true });
    const seatGeo = new THREE.BoxGeometry(0.65, 0.3, 0.42);

    // Fileira dianteira (z = -3.8, corredor central amplo para visão 100% limpa)
    for (let x = -4.5; x <= 4.5; x += 0.9) {
      if (Math.abs(x) < 1.3) continue; // Corredor central limpo
      const seat = new THREE.Mesh(seatGeo, seatMat);
      seat.position.set(x, -2.44, -3.8);
      seat.renderOrder = 0;
      group.add(seat);
    }

    // Fileira intermediária (z = -2.4)
    for (let x = -5.0; x <= 5.0; x += 0.95) {
      if (Math.abs(x) < 1.4) continue;
      const seat = new THREE.Mesh(seatGeo, seatMat);
      seat.position.set(x, -2.44, -2.4);
      seat.renderOrder = 0;
      group.add(seat);
    }

    // Moldura elegante posicionada estritamente atrás da tela (z = -6.08)
    const bezelMat = new THREE.MeshBasicMaterial({ color: 0x161924, depthWrite: true, depthTest: true });
    this.screenBezel = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.08), bezelMat);
    this.screenBezel.position.set(0, 0, -6.08);
    this.screenBezel.renderOrder = 1;
    group.add(this.screenBezel);
  }

  // ---------------- 2. Espaço Sideral / Cosmos ----------------
  initSpace() {
    const group = this.envGroups.space;

    // 1.400 estrelas procedurais com distribuição esférica distante (60 a 95 unidades)
    const starCount = 1400;
    const starGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 60 + Math.random() * 35; // Raio estritamente distante (> 60 unidades)

      const sinPhi = Math.sin(phi);
      positions[i * 3] = r * sinPhi * Math.cos(theta);
      positions[i * 3 + 1] = r * sinPhi * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      // Cores estelares (branco puro, azul celeste, dourado estelar)
      const tint = Math.random();
      if (tint < 0.65) {
        colors[i * 3] = 0.92; colors[i * 3 + 1] = 0.96; colors[i * 3 + 2] = 1.0;
      } else if (tint < 0.88) {
        colors[i * 3] = 0.60; colors[i * 3 + 1] = 0.82; colors[i * 3 + 2] = 1.0;
      } else {
        colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.88; colors[i * 3 + 2] = 0.65;
      }
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Partículas circulares suaves antialiased
    const starMat = new THREE.PointsMaterial({
      size: 1.6,
      map: createStarTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthTest: true,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(starGeo, starMat);
    this.stars.renderOrder = 0;
    group.add(this.stars);

    // Nebulosa suave distante (z = -80)
    const nebulaGeo = new THREE.RingGeometry(35, 75, 32);
    const nebulaMat = new THREE.MeshBasicMaterial({
      color: 0x3d2060,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.16,
      depthTest: true,
      depthWrite: false,
    });
    const nebula = new THREE.Mesh(nebulaGeo, nebulaMat);
    nebula.position.set(0, 10, -80);
    nebula.rotation.x = 0.4;
    nebula.renderOrder = 0;
    group.add(nebula);
  }

  // ---------------- 3. Cyber Grid ----------------
  initGrid() {
    const group = this.envGroups.grid;

    // Grade de perspectiva no piso (rebaixada)
    const floorGrid = new THREE.GridHelper(60, 48, 0x0a84ff, 0x162238);
    floorGrid.position.set(0, -2.6, -4);
    floorGrid.renderOrder = 0;
    group.add(floorGrid);

    // Grade de teto sutil
    const ceilGrid = new THREE.GridHelper(60, 48, 0xbf5af2, 0x1b1328);
    ceilGrid.position.set(0, 7.5, -4);
    ceilGrid.renderOrder = 0;
    group.add(ceilGrid);

    // Linha do horizonte de guia
    const horizonMat = new THREE.LineBasicMaterial({ color: 0x0a84ff, transparent: true, opacity: 0.4, depthTest: true });
    const hPts = [new THREE.Vector3(-40, 0, -30), new THREE.Vector3(40, 0, -30)];
    const horizon = new THREE.Line(new THREE.BufferGeometry().setFromPoints(hPts), horizonMat);
    horizon.renderOrder = 0;
    group.add(horizon);
  }

  // ---------------- Atualizações de Estado ----------------
  setEnvironment(envId) {
    if (!this.envGroups[envId]) envId = 'void';
    this.currentEnv = envId;

    Object.keys(this.envGroups).forEach((id) => {
      this.envGroups[id].visible = (id === envId);
    });

    if (envId === 'void') {
      this.scene.background.set(0x000000);
    } else if (envId === 'cinema') {
      this.scene.background.set(0x0a0c12);
    } else if (envId === 'space') {
      this.scene.background.set(0x020206);
    } else if (envId === 'grid') {
      this.scene.background.set(0x060710);
    }
  }

  setVisible(visible) {
    this.visible = visible;
    this.rootGroup.visible = visible;
    if (!visible) {
      this.scene.background.set(0x000000);
    } else {
      this.setEnvironment(this.currentEnv);
    }
  }

  updateScreenSize(scaleX, scaleY) {
    if (this.screenBezel) {
      this.screenBezel.scale.set(scaleX + 0.35, scaleY + 0.35, 1);
    }
  }

  update(dt = 0.016) {
    if (!this.visible) return;

    if (this.currentEnv === 'space' && this.stars) {
      // Rotação sutil do campo estelar para sensação de imersão cósmica
      this.stars.rotation.y += dt * 0.012;
      this.stars.rotation.x += dt * 0.005;
    }
  }
}
