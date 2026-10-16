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
  uniform float curvature;   // Curvatura cilíndrica côncava (0.0 = plano normal)
  uniform vec4 eyeRect;      // xy = deslocamento, zw = escala (região do olho na textura)
  uniform float fisheyeFov;  // em radianos
  uniform float fisheyeScale;// escala/zoom do círculo (1.0 = normal)
  uniform float exposure;
  uniform float brightness;
  uniform float contrast;
  uniform float saturation;
  uniform float gamma;
  varying vec3 vDir;
  varying vec2 vUv;
  const float PI = 3.141592653589793;

  void main() {
    vec2 uv;
    bool inside = true;

    if (mode == 3) {
      if (curvature > 0.001) {
        // Projeção cilíndrica matemática côncava:
        // Transforma a coordenada horizontal em arco angular suave (abraço periférico),
        // eliminando a sensação de retângulo plano distante sem distorção abrupta.
        float maxHalfArc = curvature * (75.0 * PI / 180.0) * 0.5;
        float nx = (vUv.x - 0.5) * 2.0;
        float theta = nx * maxHalfArc;
        float tanHalf = tan(maxHalfArc);
        if (tanHalf > 0.0001) {
          float mappedX = tan(theta) / tanHalf;
          uv.x = 0.5 + mappedX * 0.5;
        } else {
          uv.x = vUv.x;
        }
        // Curvatura periférica vertical sutil para acompanhar a geometria cilíndrica nos cantos
        float edgeDist = nx * nx;
        float vertCurve = 1.0 + edgeDist * curvature * 0.06;
        uv.y = 0.5 + (vUv.y - 0.5) * vertCurve;
        uv = clamp(uv, 0.0, 1.0);
      } else {
        uv = vUv;
      }
    } else {
      vec3 d = normalize(vDir);
      if (mode == 2) {
        // Olho de peixe equidistante: raio proporcional ao ângulo a partir da frente (-Z)
        float theta = acos(clamp(-d.z, -1.0, 1.0));
        float halfFov = fisheyeFov * 0.5;
        if (theta > halfFov) inside = false;
        float r = (theta / halfFov * 0.5) / max(fisheyeScale, 0.01);
        if (r > 0.5) inside = false;
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

    // 1. Exposição (escala EV: -1.0 a +1.0)
    c *= pow(2.0, exposure);

    // 2. Brilho e Contraste
    c = (c - 0.5) * contrast + 0.5 + brightness;

    // 3. Saturação cromática (luminância Rec. 709)
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(luma), c, saturation);

    // 4. Correção de Gamma
    c = pow(max(c, vec3(0.0)), vec3(1.0 / max(gamma, 0.01)));

    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
  }
`;

export function createVideoMaterial(texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      mode: { value: 0 },
      curvature: { value: 0.0 },
      eyeRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      fisheyeFov: { value: Math.PI },
      fisheyeScale: { value: 1.0 },
      exposure: { value: 0.0 },
      brightness: { value: 0.0 },
      contrast: { value: 1.0 },
      saturation: { value: 1.0 },
      gamma: { value: 1.0 },
    },
    vertexShader: videoVert,
    fragmentShader: videoFrag,
    side: THREE.DoubleSide,
    depthWrite: true,
    depthTest: true,
  });
}

// ---------- Calibração Óptica Avançada (lentes Cardboard / VR Box / VRG) e Correção Desktop ----------
// Uma única passada de pós-processamento aplica, por pixel:
//   1. Centro óptico por olho (IPD + offset X/Y independente)
//   2. Distorção de barril de ordem superior: r_dist = r · (1 + K1·r² + K2·r⁴)
//   3. Aberração cromática lateral: escala radial independente por canal (R/G/B)
//   4. Nitidez CAS (Contrast Adaptive Sharpening) para compensar o desfoque das lentes
//   5. Alinhamento vertical estéreo (dividido entre os dois olhos)
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
  uniform vec2 texel;      // 1/largura, 1/altura do render target do olho (para o CAS)
  uniform float k1;        // distorção radial de 2ª ordem
  uniform float k2;        // distorção radial de 4ª ordem
  uniform vec3 caK;        // (Ka, 0, Kb): R_scale = 1+Ka·r², G_scale = 1, B_scale = 1+Kb·r²
  uniform float sharpness; // 0..1 (intensidade do CAS)
  uniform float ipd;       // deslocamento do centro de cada lente (fração da metade da tela)
  uniform vec2 centerL;    // offset do centro óptico do olho esquerdo
  uniform vec2 centerR;    // offset do centro óptico do olho direito
  uniform float vShift;    // alinhamento vertical estéreo (+ sobe o olho direito)
  uniform float aspect;    // largura/altura de cada metade (ou tela inteira no desktop)
  uniform bool isStereo;   // true = óculos VR SBS, false = desktop (tela cheia monocular)
  varying vec2 vUv;

  vec3 tap(bool left, vec2 s) {
    return left ? texture2D(tLeft, s).rgb : texture2D(tRight, s).rgb;
  }

  // AMD FidelityFX CAS simplificado (cruz de 5 amostras). Calcula o realce na
  // coordenada do canal verde e aplica como delta sobre a cor já corrigida de aberração.
  vec3 cas(bool left, vec2 s, vec3 base) {
    vec3 c  = tap(left, s);
    vec3 n  = tap(left, s + vec2(0.0, texel.y));
    vec3 so = tap(left, s - vec2(0.0, texel.y));
    vec3 e  = tap(left, s + vec2(texel.x, 0.0));
    vec3 w  = tap(left, s - vec2(texel.x, 0.0));
    vec3 mn = min(c, min(min(n, so), min(e, w)));
    vec3 mx = max(c, max(max(n, so), max(e, w)));
    vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(0.0001)), 0.0, 1.0));
    vec3 wgt = -amp / mix(8.0, 5.0, sharpness);
    vec3 sharp = (c + (n + so + e + w) * wgt) / (1.0 + 4.0 * wgt);
    return base + (sharp - c);
  }

  vec2 toUv(vec2 p, float vs) {
    return vec2(p.x / aspect, p.y) + 0.5 + vec2(0.0, vs);
  }

  void main() {
    bool left = true;
    vec2 uv = vUv;
    vec2 center = vec2(0.5);
    float vs = 0.0;

    if (isStereo) {
      left = vUv.x < 0.5;
      uv.x = left ? vUv.x * 2.0 : (vUv.x - 0.5) * 2.0;
      center = left ? vec2(0.5 - ipd, 0.5) + centerL : vec2(0.5 + ipd, 0.5) + centerR;
      vs = left ? -0.5 * vShift : 0.5 * vShift;
    }

    vec2 p = uv - center;
    p.x *= aspect;
    float r2 = dot(p, p);
    vec2 pd = p * (1.0 + k1 * r2 + k2 * r2 * r2);

    vec2 sG = toUv(pd, vs);
    if (sG.x < 0.0 || sG.x > 1.0 || sG.y < 0.0 || sG.y > 1.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    vec2 sR = toUv(pd * (1.0 + caK.x * r2), vs);
    vec2 sB = toUv(pd * (1.0 + caK.z * r2), vs);
    vec3 col = vec3(tap(left, sR).r, tap(left, sG).g, tap(left, sB).b);

    if (sharpness > 0.001) col = cas(left, sG, col);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

export function createDistortionMaterial(texLeft, texRight) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tLeft: { value: texLeft },
      tRight: { value: texRight },
      texel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
      k1: { value: 0.22 },
      k2: { value: 0.04 },
      caK: { value: new THREE.Vector3(0, 0, 0) },
      sharpness: { value: 0 },
      ipd: { value: 0 },
      centerL: { value: new THREE.Vector2(0, 0) },
      centerR: { value: new THREE.Vector2(0, 0) },
      vShift: { value: 0 },
      aspect: { value: 1 },
      isStereo: { value: true },
    },
    vertexShader: postVert,
    fragmentShader: postFrag,
    depthTest: false,
    depthWrite: false,
  });
}
