// Shaders de projeção e de distorção de lente.
// A projeção é calculada por pixel a partir da direção de visão, então uma única
// esfera atende 360°, 180° e olho de peixe sem costuras ou UVs especiais.
import * as THREE from 'three';

export const PROJECTION_MODE = { '360': 0, '180': 1, fisheye: 2, flat: 3 };

const videoVert = /* glsl */`
  varying vec3 vDir;
  varying vec2 vUv;
  void main() {
    vDir = position;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const videoFrag = /* glsl */`
  uniform sampler2D map;
  uniform int mode;          // 0 = 360, 1 = 180, 2 = olho de peixe, 3 = plano
  uniform vec4 eyeRect;      // xy = deslocamento, zw = escala (região do olho na textura)
  uniform float fisheyeFov;  // em radianos
  uniform float brightness;
  uniform float contrast;
  varying vec3 vDir;
  varying vec2 vUv;
  const float PI = 3.141592653589793;

  void main() {
    vec2 uv;
    bool inside = true;

    if (mode == 3) {
      uv = vUv;
    } else {
      vec3 d = normalize(vDir);
      if (mode == 2) {
        // Olho de peixe equidistante: raio proporcional ao ângulo a partir da frente (-Z)
        float theta = acos(clamp(-d.z, -1.0, 1.0));
        float halfFov = fisheyeFov * 0.5;
        if (theta > halfFov) inside = false;
        float r = theta / halfFov * 0.5;
        float phi = atan(d.y, d.x);
        uv = vec2(0.5 + r * cos(phi), 0.5 + r * sin(phi));
      } else {
        float lon = atan(d.x, -d.z);
        float lat = asin(clamp(d.y, -1.0, 1.0));
        if (mode == 0) {
          uv = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
        } else {
          if (abs(lon) > PI * 0.5) inside = false;
          uv = vec2(lon / PI + 0.5, lat / PI + 0.5);
        }
      }
    }

    if (!inside) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    uv = eyeRect.xy + clamp(uv, 0.0005, 0.9995) * eyeRect.zw;
    vec3 c = texture2D(map, uv).rgb;
    c = (c - 0.5) * contrast + 0.5 + brightness;
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
  }
`;

export function createVideoMaterial(texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      mode: { value: 0 },
      eyeRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      fisheyeFov: { value: Math.PI },
      brightness: { value: 0 },
      contrast: { value: 1 },
    },
    vertexShader: videoVert,
    fragmentShader: videoFrag,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

// ---------- Distorção de barril para lentes de Cardboard / VR Box ----------
const postVert = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const postFrag = /* glsl */`
  uniform sampler2D tLeft;
  uniform sampler2D tRight;
  uniform float k1;
  uniform float k2;
  uniform float ipd;      // deslocamento do centro de cada lente (fração da metade da tela)
  uniform float aspect;   // largura/altura de cada metade
  varying vec2 vUv;

  void main() {
    bool left = vUv.x < 0.5;
    vec2 uv = vec2(left ? vUv.x * 2.0 : (vUv.x - 0.5) * 2.0, vUv.y);
    vec2 center = vec2(left ? 0.5 - ipd : 0.5 + ipd, 0.5);

    vec2 p = uv - center;
    p.x *= aspect;
    float r2 = dot(p, p);
    p *= 1.0 + k1 * r2 + k2 * r2 * r2;
    p.x /= aspect;
    vec2 s = p + 0.5;

    if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    vec3 c = left ? texture2D(tLeft, s).rgb : texture2D(tRight, s).rgb;
    gl_FragColor = vec4(c, 1.0);
  }
`;

export function createDistortionMaterial(texLeft, texRight) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tLeft: { value: texLeft },
      tRight: { value: texRight },
      k1: { value: 0.25 },
      k2: { value: 0.1 },
      ipd: { value: 0 },
      aspect: { value: 1 },
    },
    vertexShader: postVert,
    fragmentShader: postFrag,
    depthTest: false,
    depthWrite: false,
  });
}
