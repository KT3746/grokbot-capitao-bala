// CAPITÃO BALA — modelos procedurais originais (herói, inimigos) e o shader de animação dos inimigos.
// Tudo gerado por código: nenhum arquivo de arte externo.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, ws = 12, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
const std = (color, rough = 0.5, metal = 0.2, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

// ---------------------------------------------------------------- inimigos
// Cada peça recebe: cor, emissivo, "parte" (0 corpo, 1/2 pernas, 3/4 braços, 5 cabeça, 6 extra) e o pivô da parte.
// O vertex shader gira cada parte em volta do pivô a partir de um atributo por instância (fase, amplitude, ataque):
// um ciclo de corrida completo em 1 draw call por tipo, sem esqueleto na CPU.
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function Q(geo, color, emis, part, pivot, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  geo.applyMatrix4(_m);
  if (geo.index) geo = geo.toNonIndexed(); // flat: todas as peças no mesmo formato para o merge
  const n = geo.attributes.position.count, col = new THREE.Color(color);
  const c = new Float32Array(n * 3), em = new Float32Array(n), pa = new Float32Array(n), pv = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; em[i] = emis; pa[i] = part; pv[i * 3] = pivot[0]; pv[i * 3 + 1] = pivot[1]; pv[i * 3 + 2] = pivot[2]; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  geo.setAttribute('emis', new THREE.BufferAttribute(em, 1));
  geo.setAttribute('part', new THREE.BufferAttribute(pa, 1));
  geo.setAttribute('pivot', new THREE.BufferAttribute(pv, 3));
  geo.deleteAttribute('uv');
  return geo;
}
const O = [0, 0, 0];
function merge(list) { const g = mergeGeometries(list); g.computeBoundingSphere(); return g; }

export function zombieGeo() {
  const skin = 0x86b25e, skinD = 0x5f8a40, shirt = 0x5c4a7e, pants = 0x3d4a66, dark = 0x1d1a22, eye = 0xd8ff3a;
  const LL = [-0.17, 0.86, 0], LR = [0.17, 0.86, 0], AL = [-0.36, 1.48, 0.12], AR = [0.36, 1.44, 0.12], H = [0, 1.62, 0.14];
  return merge([
    Q(box(0.25, 0.6, 0.28), pants, 0, 1, LL, -0.17, 0.56, 0), Q(box(0.21, 0.28, 0.24), skinD, 0, 1, LL, -0.17, 0.17, 0.02), Q(box(0.27, 0.12, 0.38), dark, 0, 1, LL, -0.17, 0.06, 0.07),
    Q(box(0.25, 0.48, 0.28), pants, 0, 2, LR, 0.17, 0.62, 0), Q(box(0.21, 0.4, 0.24), skinD, 0, 2, LR, 0.17, 0.22, 0.02), Q(box(0.27, 0.12, 0.38), dark, 0, 2, LR, 0.17, 0.06, 0.07),
    Q(box(0.52, 0.2, 0.36), 0x5a3a22, 0, 0, O, 0, 0.9, 0.02),
    Q(box(0.62, 0.64, 0.4), shirt, 0, 0, O, 0, 1.22, 0.08, 0.3),
    Q(box(0.3, 0.22, 0.03), 0x8a78a8, 0, 0, O, 0.12, 1.12, 0.3, 0.3), // rasgo claro na camisa
    Q(box(0.09, 0.32, 0.03), 0xc23a3a, 0, 0, O, -0.06, 1.24, 0.32, 0.3), // gravata torta
    Q(box(0.19, 0.19, 0.36), shirt, 0, 3, AL, -0.36, 1.47, 0.3), Q(box(0.15, 0.15, 0.42), skin, 0, 3, AL, -0.36, 1.45, 0.68), Q(box(0.18, 0.12, 0.15), skinD, 0, 3, AL, -0.36, 1.44, 0.94),
    Q(box(0.19, 0.19, 0.36), shirt, 0, 4, AR, 0.36, 1.42, 0.3), Q(box(0.15, 0.15, 0.42), skin, 0, 4, AR, 0.36, 1.38, 0.66, 0.1), Q(box(0.18, 0.12, 0.15), skinD, 0, 4, AR, 0.36, 1.36, 0.9, 0.1),
    Q(box(0.44, 0.46, 0.44), skin, 0, 5, H, 0, 1.84, 0.22, 0.1, 0, 0.12),
    Q(box(0.46, 0.1, 0.3), 0x2b2a18, 0, 5, H, 0.02, 2.09, 0.16, 0.1, 0, 0.12), // cabelo
    Q(box(0.11, 0.09, 0.05), eye, 4, 5, H, -0.1, 1.88, 0.45), Q(box(0.11, 0.09, 0.05), eye, 4, 5, H, 0.11, 1.86, 0.45),
    Q(box(0.24, 0.07, 0.05), dark, 0, 5, H, 0.01, 1.7, 0.44),
  ]);
}
export function fastGeo() {
  const chrome = 0xc9d3e3, dark = 0x2a2e38, red = 0xff3a4a;
  const LL = [-0.18, 0.78, 0], LR = [0.18, 0.78, 0], AL = [-0.38, 1.02, 0], AR = [0.38, 1.02, 0], X = [0, 1.36, -0.1];
  return merge([
    Q(sph(0.38, 14, 10), chrome, 0, 0, O, 0, 1.06, 0.04, 0.3, 0, 0, 1, 0.82, 1.18),
    Q(box(0.52, 0.1, 0.16), 0x2af0ff, 4, 0, O, 0, 1.12, 0.4), // visor
    Q(box(0.08, 0.46, 0.56), red, 0.5, 0, O, -0.4, 1.0, -0.14, 0, 0, 0.5), Q(box(0.08, 0.46, 0.56), red, 0.5, 0, O, 0.4, 1.0, -0.14, 0, 0, -0.5),
    Q(sph(0.13, 8, 6), 0xff9a2a, 4.5, 0, O, 0, 0.92, -0.42), // propulsor
    Q(cyl(0.02, 0.02, 0.42, 5), dark, 0, 6, X, 0, 1.58, -0.12), Q(sph(0.06, 6, 4), 0xff2a2a, 4, 6, X, 0, 1.8, -0.12),
    Q(box(0.12, 0.4, 0.14), dark, 0, 1, LL, -0.18, 0.6, 0.07, -0.4), Q(box(0.1, 0.42, 0.1), chrome, 0, 1, LL, -0.18, 0.25, -0.06, 0.35), Q(box(0.16, 0.06, 0.3), dark, 0, 1, LL, -0.18, 0.04, 0.08),
    Q(box(0.12, 0.4, 0.14), dark, 0, 2, LR, 0.18, 0.6, 0.07, -0.4), Q(box(0.1, 0.42, 0.1), chrome, 0, 2, LR, 0.18, 0.25, -0.06, 0.35), Q(box(0.16, 0.06, 0.3), dark, 0, 2, LR, 0.18, 0.04, 0.08),
    Q(box(0.06, 0.12, 0.56), red, 0.6, 3, AL, -0.42, 0.92, 0.22, 0.4), Q(box(0.06, 0.12, 0.56), red, 0.6, 4, AR, 0.42, 0.92, 0.22, 0.4),
  ]);
}
export function tankGeo() {
  const steel = 0x5d6474, dark = 0x22252c, plate = 0x7a8496, red = 0xd0242a;
  const LL = [-0.55, 0.9, 0], LR = [0.55, 0.9, 0], AL = [-0.78, 1.6, 0], AR = [0.78, 1.62, 0], H = [0, 1.62, 0];
  return merge([
    Q(box(0.42, 0.66, 0.6), dark, 0, 1, LL, -0.55, 0.45, 0), Q(box(0.5, 0.18, 0.84), dark, 0, 1, LL, -0.55, 0.09, 0.06), Q(box(0.46, 0.2, 0.2), red, 0.8, 1, LL, -0.55, 0.62, 0.32),
    Q(box(0.42, 0.66, 0.6), dark, 0, 2, LR, 0.55, 0.45, 0), Q(box(0.5, 0.18, 0.84), dark, 0, 2, LR, 0.55, 0.09, 0.06), Q(box(0.46, 0.2, 0.2), red, 0.8, 2, LR, 0.55, 0.62, 0.32),
    Q(box(1.3, 0.8, 1.2), steel, 0, 0, O, 0, 1.2, 0), Q(box(1.12, 0.5, 0.1), plate, 0, 0, O, 0, 1.25, 0.62), Q(box(1.32, 0.12, 1.22), red, 0.9, 0, O, 0, 1.0, 0),
    Q(cyl(0.12, 0.14, 0.5, 8), dark, 0, 0, O, -0.35, 1.8, -0.45), Q(cyl(0.12, 0.14, 0.5, 8), dark, 0, 0, O, 0.35, 1.8, -0.45), // escapamentos (lidos de cima)
    Q(cyl(0.09, 0.09, 0.06, 8), 0xffa020, 3, 0, O, -0.35, 2.06, -0.45), Q(cyl(0.09, 0.09, 0.06, 8), 0xffa020, 3, 0, O, 0.35, 2.06, -0.45),
    Q(box(0.7, 0.36, 0.6), plate, 0, 5, H, 0, 1.78, 0.08), Q(box(0.5, 0.08, 0.04), 0xff2a2a, 4.5, 5, H, 0, 1.8, 0.4),
    Q(box(0.34, 0.66, 0.34), steel, 0, 3, AL, -0.84, 1.25, 0.1), Q(box(0.44, 0.38, 0.44), dark, 0, 3, AL, -0.84, 0.84, 0.18),
    Q(box(0.4, 0.4, 0.5), steel, 0, 4, AR, 0.84, 1.66, 0.05), Q(cyl(0.18, 0.21, 1.0, 10), dark, 0, 4, AR, 0.84, 1.66, 0.6, Math.PI / 2), Q(cyl(0.2, 0.2, 0.08, 10), 0xff4a2a, 3, 4, AR, 0.84, 1.66, 1.12, Math.PI / 2),
  ]);
}
// Atirador: alto e fino, olho-mira vermelho e rifle longo
export function sniperGeo() {
  const body = 0x463a6a, dark = 0x1c1a26, metal = 0x9aa3b5, red = 0xff2030;
  const LL = [-0.2, 1.0, 0], LR = [0.2, 1.0, 0], H = [0, 1.72, 0], G = [0.24, 1.46, 0];
  return merge([
    Q(box(0.1, 1.0, 0.12), metal, 0, 1, LL, -0.24, 0.52, 0, 0, 0, -0.08), Q(box(0.2, 0.06, 0.3), dark, 0, 1, LL, -0.28, 0.03, 0.04),
    Q(box(0.1, 1.0, 0.12), metal, 0, 2, LR, 0.24, 0.52, 0, 0, 0, 0.08), Q(box(0.2, 0.06, 0.3), dark, 0, 2, LR, 0.28, 0.03, 0.04),
    Q(box(0.42, 0.62, 0.3), body, 0, 0, O, 0, 1.34, 0), Q(box(0.46, 0.1, 0.34), red, 1.2, 0, O, 0, 1.08, 0),
    Q(box(0.7, 0.06, 0.3), dark, 0, 0, O, 0, 1.62, -0.05), // ombreira larga (silhueta em T vista de cima)
    Q(box(0.3, 0.24, 0.3), body, 0, 5, H, 0, 1.82, 0), Q(cyl(0.08, 0.1, 0.16, 10), red, 5, 5, H, 0, 1.82, 0.2, Math.PI / 2),
    Q(box(0.08, 0.1, 1.5), dark, 0, 6, G, 0.24, 1.46, 0.62), Q(box(0.1, 0.16, 0.36), metal, 0, 6, G, 0.24, 1.42, 0.06), Q(box(0.05, 0.05, 0.08), red, 4, 6, G, 0.24, 1.47, 1.38),
  ]);
}
// Zumbi-Bomba: barrigudo com um barril brilhante amarrado na frente
export function bombaGeo() {
  const skin = 0x8fb04a, dark = 0x2a2416, barrel = 0xffc21a, glow = 0xff7a1a;
  const LL = [-0.24, 0.5, 0], LR = [0.24, 0.5, 0], AL = [-0.5, 1.2, 0], AR = [0.5, 1.2, 0], H = [0, 1.45, 0.08];
  return merge([
    Q(box(0.24, 0.46, 0.26), dark, 0, 1, LL, -0.24, 0.24, 0), Q(box(0.24, 0.46, 0.26), dark, 0, 2, LR, 0.24, 0.24, 0),
    Q(sph(0.56, 14, 10), skin, 0, 0, O, 0, 0.98, 0, 0, 0, 0, 1.1, 1, 1.05),
    Q(cyl(0.3, 0.3, 0.52, 12), barrel, 0.6, 0, O, 0, 0.95, 0.52, 0, 0, Math.PI / 2),
    Q(cyl(0.31, 0.31, 0.1, 12), glow, 3.5, 0, O, 0, 0.95, 0.52, 0, 0, Math.PI / 2),
    Q(box(1.2, 0.08, 0.08), dark, 0, 0, O, 0, 0.95, 0.24), // cinta
    Q(box(0.32, 0.3, 0.3), skin, 0, 5, H, 0, 1.62, 0.12), Q(box(0.08, 0.07, 0.04), glow, 4, 5, H, -0.08, 1.66, 0.28), Q(box(0.08, 0.07, 0.04), glow, 4, 5, H, 0.08, 1.66, 0.28),
    Q(box(0.14, 0.52, 0.14), skin, 0, 3, AL, -0.62, 1.42, 0.05, 0, 0, 0.55), Q(box(0.14, 0.52, 0.14), skin, 0, 4, AR, 0.62, 1.42, 0.05, 0, 0, -0.55),
  ]);
}
// Guardião: robô com escudo de energia frontal (só leva dano por trás, dos lados ou de explosões)
export function guardGeo() {
  const steel = 0x3d5a8a, dark = 0x1a2233, glow = 0x2ab8ff;
  const LL = [-0.25, 0.85, 0], LR = [0.25, 0.85, 0], H = [0, 1.72, 0], AR = [0.5, 1.5, 0];
  return merge([
    Q(box(0.24, 0.78, 0.3), steel, 0, 1, LL, -0.25, 0.45, 0), Q(box(0.3, 0.14, 0.44), dark, 0, 1, LL, -0.25, 0.07, 0.05),
    Q(box(0.24, 0.78, 0.3), steel, 0, 2, LR, 0.25, 0.45, 0), Q(box(0.3, 0.14, 0.44), dark, 0, 2, LR, 0.25, 0.07, 0.05),
    Q(box(0.82, 0.76, 0.56), steel, 0, 0, O, 0, 1.3, -0.04), Q(box(0.6, 0.3, 0.1), dark, 0, 0, O, 0, 1.36, -0.36),
    Q(sph(0.12, 8, 6), glow, 4, 0, O, 0, 1.36, -0.42), // núcleo nas costas: o ponto fraco brilha
    Q(box(0.44, 0.32, 0.4), steel, 0, 5, H, 0, 1.84, 0), Q(box(0.1, 0.06, 0.04), glow, 4.5, 5, H, -0.1, 1.86, 0.21), Q(box(0.1, 0.06, 0.04), glow, 4.5, 5, H, 0.1, 1.86, 0.21),
    Q(box(1.2, 1.24, 0.06), 0x15466e, 0.55, 0, O, 0, 1.12, 0.74), // escudo
    Q(box(1.0, 0.05, 0.03), glow, 2.2, 0, O, 0, 1.38, 0.79), Q(box(1.0, 0.05, 0.03), glow, 2.2, 0, O, 0, 0.86, 0.79), Q(box(0.05, 0.9, 0.03), glow, 2.2, 0, O, 0, 1.12, 0.79),
    Q(box(1.3, 0.1, 0.12), dark, 0, 0, O, 0, 1.76, 0.74), Q(box(1.3, 0.1, 0.12), dark, 0, 0, O, 0, 0.48, 0.74),
    Q(box(0.1, 1.34, 0.12), dark, 0, 0, O, -0.65, 1.12, 0.74), Q(box(0.1, 1.34, 0.12), dark, 0, 0, O, 0.65, 1.12, 0.74),
    Q(box(0.18, 0.6, 0.18), steel, 0, 4, AR, 0.56, 1.2, 0.1),
  ]);
}

// trechos GLSL do esqueleto procedural
const ANIM_HEAD = `
attribute float part; attribute vec3 pivot; attribute vec4 iAnim;
mat3 cbRotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c); }
mat3 cbRot(){
  float ph = iAnim.x, amp = iAnim.y, atk = iAnim.z, a = 0.0;
  if (part > 0.5 && part < 1.5) a = sin(ph) * 0.75 * amp;
  else if (part > 1.5 && part < 2.5) a = sin(ph + 3.14159) * 0.75 * amp;
  else if (part > 2.5 && part < 3.5) a = sin(ph + 3.14159) * 0.28 * amp - atk * 0.9;
  else if (part > 3.5 && part < 4.5) a = sin(ph) * 0.28 * amp - atk * 0.9;
  else if (part > 4.5 && part < 5.5) a = sin(ph * 2.0) * 0.08 * amp + iAnim.w * 0.25;
  else if (part > 5.5) a = sin(ph * 2.0) * 0.18 * amp - atk * 0.12;
  return cbRotX(a);
}`;
export function animInject(s, withNormal) {
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + ANIM_HEAD);
  if (withNormal) {
    s.vertexShader = s.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nmat3 cbR = cbRot();\nobjectNormal = cbR * objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = cbR * (transformed - pivot) + pivot;');
  } else {
    s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = cbRot() * (transformed - pivot) + pivot;');
  }
}
// material de sombra que também anima as partes (senão a sombra ficaria parada)
export function animDepthMaterial() {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (s) => animInject(s, false);
  m.customProgramCacheKey = () => 'cb-anim-depth';
  return m;
}

// ---------------------------------------------------------------- herói
export const SKINS = {
  classico: { nome: 'Clássico', suit: 0x1f4fc4, armor: 0xff8a1f, cape: 0xd8361f, visor: 0x2ad4ff, preco: 0 },
  noturno: { nome: 'Noturno', suit: 0x23203a, armor: 0x8a5cff, cape: 0x3b1670, visor: 0xff3adf, preco: 150 },
  selva: { nome: 'Selva', suit: 0x2f6a34, armor: 0xffa020, cape: 0x7a4a1a, visor: 0x9dff3a, preco: 200 },
  gelo: { nome: 'Gelo', suit: 0xd7e6f5, armor: 0x3aa0ff, cape: 0x1f5fd8, visor: 0x7ff3ff, preco: 250 },
  dourado: { nome: 'Dourado', suit: 0xf2f2f2, armor: 0xffc23a, cape: 0xffb020, visor: 0xffe08a, preco: 300 },
  rubi: { nome: 'Rubi', suit: 0x7a0f1f, armor: 0xffd76a, cape: 0x1b1e27, visor: 0xff4a4a, preco: -1, conquista: 'chefe5' },
};
export function buildHero() {
  const g = new THREE.Group();
  const suit = std(0x1f4fc4, 0.5, 0.25), armor = std(0xff8a1f, 0.32, 0.6), dark = std(0x1b1e27, 0.6, 0.35);
  const metal = std(0x9aa3b5, 0.28, 0.85), gold = std(0xffc23a, 0.3, 0.8, { emissive: 0xffa21a, emissiveIntensity: 0.9 });
  const visor = std(0x06202c, 0.12, 0.4, { emissive: 0x2ad4ff, emissiveIntensity: 3.4 });
  const capeMat = std(0xd8361f, 0.7, 0.05, { side: THREE.DoubleSide });
  const mats = [suit, armor, dark, metal, capeMat];
  const add = (geo, mat, x, y, z, parent, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m; };
  const body = new THREE.Group(); body.position.y = 1.0; g.add(body); // pivô do corpo (rolamento, queda)
  // pernas com joelho
  const mkLeg = (sx) => {
    const hip = new THREE.Group(); hip.position.set(sx * 0.2, -0.04, 0); body.add(hip);
    add(box(0.27, 0.46, 0.3), suit, 0, -0.22, 0, hip);
    add(box(0.29, 0.16, 0.32), armor, 0, -0.16, 0.03, hip);
    const knee = new THREE.Group(); knee.position.set(0, -0.44, 0); hip.add(knee);
    add(box(0.25, 0.4, 0.28), suit, 0, -0.18, 0, knee);
    add(box(0.27, 0.14, 0.12), armor, 0, -0.02, 0.13, knee); // joelheira
    add(box(0.31, 0.24, 0.44), dark, 0, -0.42, 0.06, knee); // bota
    add(box(0.32, 0.06, 0.46), armor, 0, -0.3, 0.06, knee);
    return { hip, knee };
  };
  const LgL = mkLeg(-1), LgR = mkLeg(1);
  add(box(0.68, 0.18, 0.42), dark, 0, 0.0, 0, body); add(box(0.18, 0.13, 0.06), gold, 0, 0.0, 0.22, body); // cinto
  // tronco
  const torso = new THREE.Group(); torso.position.set(0, 0.08, 0); body.add(torso);
  add(box(0.62, 0.24, 0.4), suit, 0, 0.1, 0, torso);
  add(box(0.82, 0.58, 0.48), suit, 0, 0.44, 0, torso);
  add(box(0.72, 0.4, 0.1), armor, 0, 0.5, 0.25, torso); // peitoral
  const emb = new THREE.Group(); emb.position.set(0, 0.5, 0.31); torso.add(emb); // emblema: bala dourada
  add(cyl(0.07, 0.07, 0.2, 10), gold, 0, -0.04, 0, emb); add(sph(0.07, 10, 6), gold, 0, 0.06, 0, emb).scale.set(1, 1.6, 1);
  add(sph(0.21, 12, 8), armor, -0.5, 0.74, 0, torso).scale.set(1.05, 0.7, 1.1); add(sph(0.21, 12, 8), armor, 0.5, 0.74, 0, torso).scale.set(1.05, 0.7, 1.1);
  // mochila-propulsor (silhueta vista de cima) com saídas brilhantes
  add(box(0.5, 0.48, 0.2), dark, 0, 0.46, -0.32, torso);
  const vent = std(0x06202c, 0.2, 0.3, { emissive: 0x2ad4ff, emissiveIntensity: 2.6 });
  add(cyl(0.08, 0.1, 0.12, 10), vent, -0.14, 0.18, -0.34, torso); add(cyl(0.08, 0.1, 0.12, 10), vent, 0.14, 0.18, -0.34, torso);
  // braços com cotovelo segurando a arma
  const mkArm = (sx) => {
    const sh = new THREE.Group(); sh.position.set(sx * 0.5, 0.66, 0); torso.add(sh);
    add(box(0.2, 0.36, 0.22), suit, 0, -0.18, 0, sh);
    const el = new THREE.Group(); el.position.set(0, -0.36, 0); sh.add(el);
    add(box(0.2, 0.3, 0.22), suit, 0, -0.14, 0, el); add(box(0.24, 0.12, 0.26), armor, 0, -0.06, 0, el);
    add(box(0.22, 0.16, 0.24), dark, 0, -0.32, 0, el); // luva
    return { sh, el };
  };
  const ArL = mkArm(-1), ArR = mkArm(1);
  // capacete com crista e viseira envolvente
  const head = new THREE.Group(); head.position.set(0, 0.98, 0); torso.add(head);
  add(cyl(0.15, 0.19, 0.16, 10), dark, 0, -0.16, 0, head);
  add(sph(0.32, 16, 12), suit, 0, 0.04, 0, head).scale.set(1, 1.02, 1.08);
  add(box(0.1, 0.16, 0.66), armor, 0, 0.36, -0.03, head); // crista
  add(box(0.06, 0.1, 0.4), gold, 0, 0.44, -0.03, head);
  add(box(0.68, 0.1, 0.12), armor, 0, 0.06, -0.02, head);
  add(box(0.56, 0.16, 0.14), visor, 0, 0.02, 0.27, head);
  add(box(0.6, 0.04, 0.16), dark, 0, 0.11, 0.27, head);
  add(cyl(0.07, 0.07, 0.08, 10), gold, -0.34, 0.03, 0, head, 0, 0, Math.PI / 2); add(cyl(0.07, 0.07, 0.08, 10), gold, 0.34, 0.03, 0, head, 0, 0, Math.PI / 2);
  // capa em 3 segmentos (balança em onda)
  const capeSegs = [];
  let parent = torso, y0 = 0.72, z0 = -0.43;
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Group(); s.position.set(0, i === 0 ? y0 : -0.36, i === 0 ? z0 : 0); parent.add(s);
    add(box(0.7 + i * 0.08, 0.37, 0.04), capeMat, 0, -0.18, 0, s);
    if (i === 2) add(box(0.88, 0.06, 0.06), gold, 0, -0.36, 0, s);
    capeSegs.push(s); parent = s;
  }
  // arma
  const gun = new THREE.Group(); gun.position.set(0.12, 0.34, 0.58); torso.add(gun);
  add(box(0.2, 0.24, 0.78), metal, 0, 0, 0, gun);
  add(box(0.22, 0.06, 0.6), armor, 0, 0.1, 0, gun);
  add(box(0.12, 0.26, 0.16), dark, 0, -0.2, -0.15, gun);
  add(cyl(0.07, 0.07, 0.34, 10), dark, 0, 0.02, 0.5, gun, Math.PI / 2);
  const gunGlow = std(0x06202c, 0.15, 0.4, { emissive: 0x2ad4ff, emissiveIntensity: 3.2 });
  add(cyl(0.085, 0.085, 0.06, 10), gunGlow, 0, 0.02, 0.67, gun, Math.PI / 2);
  add(box(0.23, 0.04, 0.5), gunGlow, 0, 0.135, 0, gun);
  const tip = new THREE.Object3D(); tip.position.set(0, 0.02, 0.78); gun.add(tip);
  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3.6, 1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const flash = new THREE.Group();
  const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 6), flashMat); f1.rotation.x = Math.PI / 2; f1.position.z = 0.4;
  const f2 = new THREE.Mesh(sph(0.2, 8, 6), flashMat);
  const starGeo = new THREE.PlaneGeometry(1.25, 0.16);
  const f3 = new THREE.Mesh(starGeo, flashMat), f4 = new THREE.Mesh(starGeo, flashMat); f4.rotation.z = Math.PI / 2;
  const star = new THREE.Group(); star.add(f3, f4); star.position.z = 0.12;
  flash.add(f1, f2, star); flash.visible = false; tip.add(flash);
  // sombra de contato, anel e escudo
  const shadowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }));
  shadowDisc.rotation.x = -Math.PI / 2; shadowDisc.position.y = 0.03; g.add(shadowDisc);
  const glowRing = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.82, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.6, 3), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  glowRing.rotation.x = -Math.PI / 2; glowRing.position.y = 0.04; g.add(glowRing);
  const shield = new THREE.Mesh(sph(1.2, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.9, 2.2), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
  shield.position.y = 1.15; shield.visible = false; g.add(shield);
  g.rotation.order = 'YXZ';
  const skin = (id) => { const S = SKINS[id] || SKINS.classico; suit.color.setHex(S.suit); armor.color.setHex(S.armor); capeMat.color.setHex(S.cape); visor.emissive.setHex(S.visor); vent.emissive.setHex(S.visor); };
  return { g, body, torso, legL: LgL.hip, legR: LgR.hip, kneeL: LgL.knee, kneeR: LgR.knee, armL: ArL.sh, armR: ArR.sh, elL: ArL.el, elR: ArR.el, head, tip, flash, flashMat, star, mats, capeSegs, glowRing, gunGlow, shield, gun, skin, shadowDisc };
}
