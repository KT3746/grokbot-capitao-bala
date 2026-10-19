// CAPITÃO BALA — arcade 3D original (Three.js r160)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { initAudio, sfx, music, setMuted, isMuted } from './audio.js?v=202610191530';

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
let touchMode = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
if (!touchMode) document.body.classList.add('no-touch');
const vibrate = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) {} };

// ---------------- Renderer + qualidade adaptativa ----------------
const canvas = $('cena');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  $('loading').textContent = 'Seu navegador não conseguiu ligar o 3D (WebGL). Tente o Chrome atualizado.';
  throw e;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = touchMode ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

const TIERS = [
  { name: 'baixa', pr: 0.9, shadow: 0, bloom: 0 },
  { name: 'media', pr: 1.35, shadow: 1024, bloom: 0.5 },
  { name: 'alta', pr: 2, shadow: 2048, bloom: 1 },
];
let tierIdx = touchMode ? 1 : 2;
const qp = new URLSearchParams(location.search).get('q');
if (qp && /^[012]$/.test(qp)) tierIdx = +qp;
let bloomScale = 1;
const ZOOM = +(new URLSearchParams(location.search).get('zoom') || 1);
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060914);
scene.fog = new THREE.Fog(0x0a0f24, 34, 80);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 220);

const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: touchMode ? 0 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.45, 1.05);
const bloomSetSize = bloom.setSize.bind(bloom);
bloom.setSize = (w, h) => bloomSetSize(Math.max(32, Math.round(w * bloomScale)), Math.max(32, Math.round(h * bloomScale)));
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------- Luzes ----------------
const hemi = new THREE.HemisphereLight(0x8a9cff, 0x3a2040, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe0bf, 1.9);
sun.position.set(9, 20, 7);
sun.shadow.camera.left = -19; sun.shadow.camera.right = 19;
sun.shadow.camera.top = 19; sun.shadow.camera.bottom = -19;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0x3a7bff, 0.9);
rim.position.set(-10, 8, -12);
scene.add(rim);
const muzzleLight = new THREE.PointLight(0xffb347, 0, 9, 2);
scene.add(muzzleLight);
const boomLight = new THREE.PointLight(0xff7a2a, 0, 16, 2);
scene.add(boomLight);
let boomI = 0;

function applyTier() {
  const t = TIERS[tierIdx];
  const pr = Math.min(window.devicePixelRatio || 1, t.pr);
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  const sh = t.shadow > 0;
  sun.castShadow = sh;
  if (sh && sun.shadow.mapSize.x !== t.shadow) {
    sun.shadow.mapSize.set(t.shadow, t.shadow);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  bloomScale = t.bloom || 0.5;
  bloom.enabled = t.bloom > 0;
  if (glowMesh) glowMesh.visible = !bloom.enabled;
  resize();
}
let partScale = 300;
let glowMesh = null; // brilho aditivo dos tiros quando o bloom está desligado
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = w < h ? 62 : 50;
  camera.updateProjectionMatrix();
  partScale = (h * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
  if (particleMat) particleMat.uniforms.uScale.value = partScale;
}
window.addEventListener('resize', resize);

// ---------------- Helpers de geometria ----------------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function P(geo, color, emis, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  geo.applyMatrix4(_m);
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3), em = new Float32Array(n);
  const col = new THREE.Color(color);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; em[i] = emis; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  geo.setAttribute('emis', new THREE.BufferAttribute(em, 1));
  return geo;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, ws = 12, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);

function instMaterial(opts = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35, ...opts });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float emis;\nattribute float iFlash;\nvarying float vEmis;\nvarying float vFlash;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmis = emis;\nvFlash = iFlash;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vEmis;\nvarying float vFlash;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vEmis + vec3(vFlash * 1.6, vFlash * 1.4, vFlash * 1.2);');
  };
  m.customProgramCacheKey = () => 'cb-inst';
  return m;
}
const std = (color, rough = 0.5, metal = 0.2, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

// ---------------- Texturas procedurais ----------------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const groundTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#2b3143'; g.fillRect(0, 0, w, h);
  const n = 4, s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const l = 26 + Math.random() * 12;
    g.fillStyle = `hsl(225,12%,${l * 0.62}%)`;
    g.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
    for (let k = 0; k < 40; k++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`;
      g.fillRect(i * s + Math.random() * s, j * s + Math.random() * s, 2 + Math.random() * 10, 2 + Math.random() * 10);
    }
  }
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 2;
  for (let k = 0; k < 7; k++) {
    g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y);
    for (let q = 0; q < 6; q++) { x += rand(-30, 30); y += rand(-30, 30); g.lineTo(x, y); }
    g.stroke();
  }
  for (let k = 0; k < 4; k++) {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.translate(Math.random() * w, Math.random() * h); g.scale(rand(30, 70), rand(20, 50));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore();
  }
});
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
groundTex.repeat.set(30, 30);
const windowTex = canvasTex(64, 128, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let y = 4; y < h - 4; y += 10) for (let x = 4; x < w - 4; x += 10) {
    const r = Math.random();
    if (r < 0.28) { g.fillStyle = Math.random() < 0.7 ? '#ffcf7a' : '#7fd8ff'; g.fillRect(x, y, 6, 6); }
  }
});
const windowColor = canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#2a2f3d'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b1f29'; for (let y = 4; y < h; y += 10) g.fillRect(0, y + 6, w, 4); });

// ---------------- Mundo / arena ----------------
const ARENA = 22;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), std(0xffffff, 0.92, 0.05, { map: groundTex }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// marcas no chão
const markMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15, 0.5, 1.2), transparent: true, opacity: 0.28, depthWrite: false });
const ring1 = new THREE.Mesh(new THREE.RingGeometry(5.7, 5.85, 64), markMat);
ring1.rotation.x = -Math.PI / 2; ring1.position.y = 0.02; scene.add(ring1);
const ring2 = new THREE.Mesh(new THREE.RingGeometry(11.85, 12, 96), markMat);
ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.02; scene.add(ring2);

// muros com faixa de neon
const wallParts = [];
const neonParts = [];
for (let side = 0; side < 4; side++) {
  const horiz = side < 2, sg = side % 2 ? 1 : -1;
  const len = ARENA * 2 + 2;
  const wx = horiz ? 0 : sg * (ARENA + 0.6), wz = horiz ? sg * (ARENA + 0.6) : 0;
  const ry = horiz ? 0 : Math.PI / 2;
  wallParts.push(P(box(len, 1.3, 1), 0x3a4152, 0, wx, 0.65, wz, 0, ry));
  for (let k = -ARENA; k <= ARENA; k += 4) {
    const px = horiz ? k : wx, pz = horiz ? wz : k;
    wallParts.push(P(box(1.2, 1.9, 1.3), 0x262b38, 0, px, 0.95, pz, 0, ry));
  }
  neonParts.push(P(box(len, 0.12, 1.04), 0xff7a1a, 1.5, wx, 1.33, wz, 0, ry));
}
const wallMesh = new THREE.Mesh(mergeGeometries(wallParts), instMaterial({ roughness: 0.8, metalness: 0.3 }));
wallMesh.geometry.setAttribute('iFlash', new THREE.BufferAttribute(new Float32Array(wallMesh.geometry.attributes.position.count), 1));
wallMesh.castShadow = wallMesh.receiveShadow = true;
scene.add(wallMesh);
const neonMesh = new THREE.Mesh(mergeGeometries(neonParts), instMaterial());
neonMesh.geometry.setAttribute('iFlash', new THREE.BufferAttribute(new Float32Array(neonMesh.geometry.attributes.position.count), 1));
scene.add(neonMesh);

// blocos/obstáculos
const PILLARS = [[-9, -7], [9, -7], [-9, 8], [9, 8], [0, -15], [0, 15], [-16, 0], [16, 0]];
const pillarParts = [];
PILLARS.forEach(([x, z], i) => {
  if (i < 4) {
    pillarParts.push(P(box(2.2, 2.2, 2.2), 0x59606f, 0, x, 1.1, z));
    pillarParts.push(P(box(2.26, 0.25, 2.26), 0xffb020, 0.6, x, 1.6, z));
    pillarParts.push(P(box(1.7, 0.08, 1.7), 0x2ad4ff, 1.2, x, 2.24, z));
  } else {
    pillarParts.push(P(cyl(0.75, 0.75, 1.5, 14), 0x2f7a3a, 0, x, 0.75, z));
    pillarParts.push(P(cyl(0.78, 0.78, 0.14, 14), 0x7dff5a, 1.3, x, 1.1, z));
    pillarParts.push(P(cyl(0.78, 0.78, 0.14, 14), 0x7dff5a, 1.3, x, 0.4, z));
  }
});
const pillarMesh = new THREE.Mesh(mergeGeometries(pillarParts), instMaterial({ roughness: 0.6 }));
pillarMesh.geometry.setAttribute('iFlash', new THREE.BufferAttribute(new Float32Array(pillarMesh.geometry.attributes.position.count), 1));
pillarMesh.castShadow = pillarMesh.receiveShadow = true;
scene.add(pillarMesh);
const PILLAR_R = PILLARS.map((_, i) => (i < 4 ? 1.55 : 0.95));

// prédios em volta (instanciados)
const bGeo = new THREE.BoxGeometry(1, 1, 1);
bGeo.translate(0, 0.5, 0);
const bMat = std(0xffffff, 0.85, 0.2, { map: windowColor, emissiveMap: windowTex, emissive: 0xffffff, emissiveIntensity: 1.1 });
const NB = 46;
const buildings = new THREE.InstancedMesh(bGeo, bMat, NB);
{
  const d = new THREE.Object3D();
  for (let i = 0; i < NB; i++) {
    const a = (i / NB) * Math.PI * 2 + rand(-0.04, 0.04);
    const r = rand(31, 44);
    d.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    d.rotation.y = rand(0, Math.PI);
    d.scale.set(rand(5, 9), rand(7, 24), rand(5, 9));
    d.updateMatrix();
    buildings.setMatrixAt(i, d.matrix);
  }
}
buildings.receiveShadow = true;
scene.add(buildings);
// postes de luz (emissivos) nos cantos
const lampParts = [];
[[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
  const x = sx * (ARENA + 0.6), z = sz * (ARENA + 0.6);
  lampParts.push(P(cyl(0.18, 0.25, 6, 8), 0x22262f, 0, x, 3, z));
  lampParts.push(P(box(1.4, 0.3, 0.5), 0x22262f, 0, x - sx * 0.5, 6, z - sz * 0.5));
  lampParts.push(P(sph(0.35), 0xffe6a8, 4, x - sx * 0.9, 5.8, z - sz * 0.9));
});
const lampMesh = new THREE.Mesh(mergeGeometries(lampParts), instMaterial());
lampMesh.geometry.setAttribute('iFlash', new THREE.BufferAttribute(new Float32Array(lampMesh.geometry.attributes.position.count), 1));
lampMesh.castShadow = true;
scene.add(lampMesh);

// ---------------- Herói: Capitão Bala ----------------
function buildHero() {
  const g = new THREE.Group();
  const suit = std(0x1f4fc4, 0.55, 0.25), armor = std(0xff8a1f, 0.35, 0.55), dark = std(0x1b1e27, 0.6, 0.35);
  const metal = std(0x9aa3b5, 0.28, 0.85), gold = std(0xffc23a, 0.3, 0.8, { emissive: 0xffa21a, emissiveIntensity: 0.9 });
  const visor = std(0x06202c, 0.15, 0.4, { emissive: 0x2ad4ff, emissiveIntensity: 3.2 });
  const mats = [suit, armor, dark, metal];
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.22, 0.95, 0); legR.position.set(0.22, 0.95, 0); g.add(legL, legR);
  [legL, legR].forEach((L) => { add(box(0.27, 0.62, 0.3), suit, 0, -0.3, 0, L); add(box(0.3, 0.18, 0.32), armor, 0, -0.25, 0.04, L); add(box(0.3, 0.34, 0.42), dark, 0, -0.78, 0.05, L); });
  add(box(0.82, 0.78, 0.46), suit, 0, 1.38, 0);
  add(box(0.72, 0.46, 0.12), armor, 0, 1.47, 0.24);
  const emb = new THREE.Group(); emb.position.set(0, 1.48, 0.31); g.add(emb);
  add(cyl(0.07, 0.07, 0.2, 10), gold, 0, -0.04, 0, emb);
  add(sph(0.07, 10, 6), gold, 0, 0.06, 0, emb).scale.set(1, 1.6, 1);
  add(box(0.86, 0.13, 0.5), dark, 0, 1.0, 0);
  add(box(0.16, 0.12, 0.06), gold, 0, 1.0, 0.26);
  add(sph(0.24, 12, 8), armor, -0.52, 1.66, 0).scale.set(1, 0.8, 1);
  add(sph(0.24, 12, 8), armor, 0.52, 1.66, 0).scale.set(1, 0.8, 1);
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.5, 1.6, 0); armR.position.set(0.5, 1.6, 0); g.add(armL, armR);
  [armL, armR].forEach((A) => { add(box(0.2, 0.62, 0.22), suit, 0, -0.3, 0, A); add(box(0.24, 0.2, 0.26), dark, 0, -0.62, 0, A); });
  armL.rotation.set(-1.25, 0, 0.35); armR.rotation.set(-1.35, 0, -0.1);
  add(cyl(0.16, 0.2, 0.16, 10), dark, 0, 1.83, 0);
  const head = new THREE.Group(); head.position.set(0, 2.08, 0); g.add(head);
  add(sph(0.32, 16, 12), suit, 0, 0, 0, head).scale.set(1, 1.02, 1.05);
  add(box(0.1, 0.12, 0.62), armor, 0, 0.3, -0.02, head);
  add(box(0.66, 0.1, 0.1), armor, 0, 0.02, -0.02, head);
  add(box(0.5, 0.15, 0.12), visor, 0, -0.01, 0.27, head);
  const cape = new THREE.Group(); cape.position.set(0, 1.74, -0.26); g.add(cape);
  const capeMat = std(0xd8361f, 0.7, 0.05, { side: THREE.DoubleSide });
  add(box(0.84, 1.25, 0.05), capeMat, 0, -0.62, 0, cape);
  add(box(0.86, 0.1, 0.07), gold, 0, -1.22, 0, cape);
  mats.push(capeMat);
  const gun = new THREE.Group(); gun.position.set(0.12, 1.32, 0.55); g.add(gun);
  add(box(0.2, 0.24, 0.78), metal, 0, 0, 0, gun);
  add(box(0.22, 0.06, 0.6), armor, 0, 0.1, 0, gun);
  add(box(0.12, 0.26, 0.16), dark, 0, -0.2, -0.15, gun);
  const barrel = add(cyl(0.07, 0.07, 0.34, 10), dark, 0, 0.02, 0.5, gun); barrel.rotation.x = Math.PI / 2;
  add(cyl(0.085, 0.085, 0.06, 10), visor, 0, 0.02, 0.67, gun).rotation.x = Math.PI / 2;
  const tip = new THREE.Object3D(); tip.position.set(0, 0.02, 0.78); gun.add(tip);
  // brilho de boca de cano
  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3.6, 1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const flash = new THREE.Group();
  const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 6), flashMat); f1.rotation.x = Math.PI / 2; f1.position.z = 0.4;
  const f2 = new THREE.Mesh(sph(0.2, 8, 6), flashMat);
  flash.add(f1, f2); flash.visible = false; tip.add(flash);
  // aura de esquiva / invencível
  const shadowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  shadowDisc.rotation.x = -Math.PI / 2; shadowDisc.position.y = 0.03; g.add(shadowDisc);
  const glowRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.6, 3), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  glowRing.rotation.x = -Math.PI / 2; glowRing.position.y = 0.04; g.add(glowRing);
  return { g, legL, legR, armL, armR, head, tip, flash, mats, cape, glowRing };
}
const hero = buildHero();
scene.add(hero.g);

// ---------------- Inimigos (malhas instanciadas) ----------------
function zombieGeo() {
  const skin = 0x7fae5a, shirt = 0x5c4a6e, pants = 0x4a3b2a;
  return mergeGeometries([
    P(box(0.26, 0.86, 0.28), pants, 0, -0.17, 0.43, 0),
    P(box(0.26, 0.86, 0.28), pants, 0, 0.17, 0.43, 0.05, 0.12),
    P(box(0.64, 0.72, 0.4), shirt, 0, 0, 1.2, 0.04, 0.16),
    P(box(0.5, 0.2, 0.42), 0x3e3150, 0, 0.06, 0.92, 0.02),
    P(box(0.17, 0.17, 0.72), skin, 0, -0.38, 1.44, 0.36, -0.1),
    P(box(0.17, 0.17, 0.72), skin, 0, 0.38, 1.38, 0.38, 0.12),
    P(box(0.44, 0.46, 0.44), skin, 0, 0, 1.82, 0.12, 0.1, 0, 0.14),
    P(box(0.1, 0.08, 0.05), 0xfff26a, 3.5, -0.1, 1.86, 0.35),
    P(box(0.1, 0.08, 0.05), 0xfff26a, 3.5, 0.11, 1.84, 0.35),
    P(box(0.22, 0.06, 0.05), 0x1a0f0f, 0, 0, 1.68, 0.34),
  ]);
}
function fastGeo() {
  const chrome = 0xc3cddd;
  return mergeGeometries([
    P(sph(0.4, 16, 12), chrome, 0, 0, 0.95, 0, 0, 0, 0, 1, 0.85, 1.1),
    P(box(0.56, 0.11, 0.2), 0x2af0ff, 3.5, 0, 1.0, 0.34),
    P(box(0.08, 0.5, 0.6), 0xff3a4a, 0.4, -0.42, 0.95, -0.1, 0, 0, 0.5),
    P(box(0.08, 0.5, 0.6), 0xff3a4a, 0.4, 0.42, 0.95, -0.1, 0, 0, -0.5),
    P(new THREE.ConeGeometry(0.22, 0.35, 10), 0x2a2e38, 0, 0, 0.5, 0, Math.PI),
    P(sph(0.14, 8, 6), 0xff9a2a, 4.5, 0, 0.32, 0),
    P(cyl(0.02, 0.02, 0.4, 5), 0x2a2e38, 0, 0, 1.45, 0),
    P(sph(0.06, 6, 4), 0xff2a2a, 4, 0, 1.67, 0),
    P(box(0.08, 0.08, 0.4), 0x2a2e38, 0, -0.22, 0.75, 0.38),
    P(box(0.08, 0.08, 0.4), 0x2a2e38, 0, 0.22, 0.75, 0.38),
  ]);
}
function tankGeo() {
  const steel = 0x5d6474, dark = 0x22252c;
  return mergeGeometries([
    P(box(0.46, 0.52, 1.7), dark, 0, -0.62, 0.26, 0),
    P(box(0.46, 0.52, 1.7), dark, 0, 0.62, 0.26, 0),
    P(box(1.32, 0.72, 1.42), steel, 0, 0, 0.82, 0),
    P(box(1.34, 0.12, 1.44), 0xd0242a, 0.8, 0, 0.92, 0),
    P(box(0.92, 0.56, 0.84), 0x707889, 0, 0, 1.46, -0.05),
    P(cyl(0.13, 0.15, 0.95, 10), dark, 0, 0, 1.46, 0.75, Math.PI / 2),
    P(cyl(0.16, 0.16, 0.08, 10), 0xff4a2a, 2.5, 0, 1.46, 1.22, Math.PI / 2),
    P(box(0.62, 0.1, 0.05), 0xff2a2a, 4, 0, 1.58, 0.37),
    P(box(0.2, 0.3, 0.2), dark, 0, -0.35, 1.85, -0.3),
    P(sph(0.09, 6, 4), 0xffa020, 3, -0.35, 2.05, -0.3),
  ]);
}
const enemyMat = instMaterial();
const TYPES = {
  zombie: { geo: zombieGeo(), max: 70, hp: 30, speed: 2.3, r: 0.55, score: 100, dmg: 12, color: [0.5, 1.6, 0.3], drop: 0.06 },
  fast: { geo: fastGeo(), max: 50, hp: 16, speed: 5.4, r: 0.45, score: 150, dmg: 9, color: [0.4, 2, 3], drop: 0.08 },
  tank: { geo: tankGeo(), max: 24, hp: 130, speed: 1.35, r: 0.95, score: 400, dmg: 18, color: [3, 0.8, 0.3], drop: 0.3 },
};
for (const k in TYPES) {
  const T = TYPES[k];
  T.mesh = new THREE.InstancedMesh(T.geo, enemyMat, T.max);
  T.flashAttr = new THREE.InstancedBufferAttribute(new Float32Array(T.max), 1);
  T.flashAttr.setUsage(THREE.DynamicDrawUsage);
  T.geo.setAttribute('iFlash', T.flashAttr);
  T.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  T.mesh.castShadow = true;
  T.mesh.frustumCulled = false;
  T.mesh.count = 0;
  scene.add(T.mesh);
}
const dummy = new THREE.Object3D();
let enemies = [];

// ---------------- Projéteis ----------------
function bulletPool(geo, color, max) {
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color }), max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.count = 0; scene.add(mesh);
  return { mesh, list: [], max };
}
const pBullets = bulletPool(new THREE.BoxGeometry(0.13, 0.13, 0.8), new THREE.Color(5, 3.4, 1.0), 260);
const eBullets = bulletPool(new THREE.SphereGeometry(0.24, 10, 8), new THREE.Color(4.5, 0.5, 2.8), 260);
{ // halo aditivo (substitui o bloom na qualidade baixa)
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  glowMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 520);
  glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glowMesh.setColorAt(0, new THREE.Color(1, 1, 1));
  glowMesh.frustumCulled = false; glowMesh.count = 0; glowMesh.visible = false; scene.add(glowMesh);
}
const GLOW_P = new THREE.Color(1.0, 0.62, 0.22), GLOW_E = new THREE.Color(1.0, 0.2, 0.75);
function updateGlow() {
  if (!glowMesh.visible) return;
  let n = 0;
  for (const b of pBullets.list) { dummy.position.set(b.x, 1.25, b.z); dummy.rotation.set(0, Math.atan2(b.vx, b.vz), 0); dummy.scale.set(0.9, 1, 2.0); dummy.updateMatrix(); glowMesh.setMatrixAt(n, dummy.matrix); glowMesh.setColorAt(n, GLOW_P); n++; }
  for (const b of eBullets.list) { dummy.position.set(b.x, 1.15, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1.5, 1, 1.5); dummy.updateMatrix(); glowMesh.setMatrixAt(n, dummy.matrix); glowMesh.setColorAt(n, GLOW_E); n++; }
  glowMesh.count = n; glowMesh.instanceMatrix.needsUpdate = true; if (glowMesh.instanceColor) glowMesh.instanceColor.needsUpdate = true;
}

// ---------------- Partículas (GPU points, aditivas) ----------------
const NP = touchMode ? 900 : 1600;
const pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 4), pSize = new Float32Array(NP);
const pVel = new Float32Array(NP * 3), pLife = new Float32Array(NP), pMax = new Float32Array(NP), pS0 = new Float32Array(NP), pS1 = new Float32Array(NP), pGrav = new Float32Array(NP), pDrag = new Float32Array(NP), pBase = new Float32Array(NP * 3);
let pCursor = 0;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('aColor', new THREE.BufferAttribute(pCol, 4).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage));
let particleMat = new THREE.ShaderMaterial({
  uniforms: { uScale: { value: partScale } },
  vertexShader: `attribute float aSize; attribute vec4 aColor; varying vec4 vC; uniform float uScale;
    void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d) * 4.0; if (r > 1.0) discard; float a = 1.0 - r; a *= a; gl_FragColor = vec4(vC.rgb * vC.a * a, 1.0); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const points = new THREE.Points(pGeo, particleMat);
points.frustumCulled = false;
scene.add(points);
function emit(x, y, z, vx, vy, vz, col, life, s0, s1, grav = 0, drag = 1.5) {
  const i = pCursor; pCursor = (pCursor + 1) % NP;
  pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
  pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
  pBase[i * 3] = col[0]; pBase[i * 3 + 1] = col[1]; pBase[i * 3 + 2] = col[2];
  pLife[i] = life; pMax[i] = life; pS0[i] = s0; pS1[i] = s1; pGrav[i] = grav; pDrag[i] = drag;
}
function burst(x, y, z, n, col, speed, life, size, grav = -9) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, u = rand(-0.3, 1), sp = speed * rand(0.3, 1);
    emit(x, y, z, Math.cos(a) * sp * Math.sqrt(1 - u * u), u * sp + speed * 0.3, Math.sin(a) * sp * Math.sqrt(1 - u * u), col, life * rand(0.6, 1.2), size * rand(0.6, 1.3), 0, grav);
  }
}
function updateParticles(dt) {
  for (let i = 0; i < NP; i++) {
    if (pLife[i] <= 0) { pSize[i] = 0; continue; }
    pLife[i] -= dt;
    const t = 1 - pLife[i] / pMax[i];
    const dr = Math.exp(-pDrag[i] * dt);
    pVel[i * 3] *= dr; pVel[i * 3 + 2] *= dr; pVel[i * 3 + 1] = pVel[i * 3 + 1] * dr + pGrav[i] * dt;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    if (pPos[i * 3 + 1] < 0.05) { pPos[i * 3 + 1] = 0.05; pVel[i * 3 + 1] *= -0.4; }
    const a = pLife[i] <= 0 ? 0 : 1 - t * t;
    pCol[i * 4] = pBase[i * 3]; pCol[i * 4 + 1] = pBase[i * 3 + 1]; pCol[i * 4 + 2] = pBase[i * 3 + 2]; pCol[i * 4 + 3] = a;
    pSize[i] = pLife[i] <= 0 ? 0 : pS0[i] + (pS1[i] - pS0[i]) * t;
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.aColor.needsUpdate = true; pGeo.attributes.aSize.needsUpdate = true;
}

// ---------------- Destroços (cubinhos físicos) ----------------
const ND = touchMode ? 100 : 180;
const debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std(0xffffff, 0.5, 0.6), ND);
debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
debrisMesh.castShadow = true; debrisMesh.frustumCulled = false; debrisMesh.count = 0;
debrisMesh.setColorAt(0, new THREE.Color(1, 1, 1));
scene.add(debrisMesh);
const debris = [];
const _c = new THREE.Color();
function addDebris(x, y, z, color, n, sp = 6, size = 0.18) {
  for (let k = 0; k < n; k++) {
    if (debris.length >= ND) debris.shift();
    const a = Math.random() * Math.PI * 2, s = sp * rand(0.4, 1);
    debris.push({ x, y, z, vx: Math.cos(a) * s, vy: rand(3, 8), vz: Math.sin(a) * s, rx: rand(0, 6), ry: rand(0, 6), sx: rand(-12, 12), sy: rand(-12, 12), life: rand(1.0, 1.8), size: size * rand(0.6, 1.4), color });
  }
}
function updateDebris(dt) {
  let n = 0;
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.life -= dt;
    if (d.life <= 0) { debris.splice(i, 1); continue; }
    d.vy -= 22 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rx += d.sx * dt; d.ry += d.sy * dt;
    if (d.y < d.size * 0.5) { d.y = d.size * 0.5; d.vy *= -0.35; d.vx *= 0.7; d.vz *= 0.7; d.sx *= 0.7; d.sy *= 0.7; }
  }
  for (const d of debris) {
    dummy.position.set(d.x, d.y, d.z); dummy.rotation.set(d.rx, d.ry, 0); dummy.scale.setScalar(d.size * Math.min(1, d.life * 2)); dummy.updateMatrix();
    debrisMesh.setMatrixAt(n, dummy.matrix); debrisMesh.setColorAt(n, _c.setHex(d.color)); n++;
  }
  debrisMesh.count = n;
  debrisMesh.instanceMatrix.needsUpdate = true;
  if (debrisMesh.instanceColor) debrisMesh.instanceColor.needsUpdate = true;
}

// ---------------- Ondas de choque (anéis) ----------------
const rings = [];
for (let i = 0; i < 10; i++) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
  rings.push({ m, t: 0, dur: 0.4, max: 3 });
}
let ringI = 0;
function shock(x, z, max, col, dur = 0.4) {
  const r = rings[ringI]; ringI = (ringI + 1) % rings.length;
  r.m.position.set(x, 0.08, z); r.t = 0; r.dur = dur; r.max = max; r.m.visible = true;
  r.m.material.color.setRGB(col[0], col[1], col[2]);
}
function updateRings(dt) {
  for (const r of rings) {
    if (!r.m.visible) continue;
    r.t += dt; const k = r.t / r.dur;
    if (k >= 1) { r.m.visible = false; continue; }
    const s = 0.3 + r.max * (1 - (1 - k) * (1 - k));
    r.m.scale.setScalar(s); r.m.material.opacity = 1 - k;
  }
}

// ---------------- Itens (power-ups) ----------------
const PW = {
  shotgun: { color: 0xff8a1f, label: 'ESPINGARDA', css: '#ff8a1f', dur: 12, rgb: [3, 1.4, 0.3] },
  rapid: { color: 0x2ad4ff, label: 'TIRO RÁPIDO', css: '#2ad4ff', dur: 11, rgb: [0.4, 2.2, 3.2] },
  health: { color: 0x38e07b, label: 'VIDA +35', css: '#38e07b', dur: 0, rgb: [0.5, 3, 1] },
};
// geometrias/materiais compartilhados (sem vazamento a cada item)
const ITEM_GEO = {
  bar1: box(0.7, 0.24, 0.24), bar2: box(0.24, 0.7, 0.24), shell: cyl(0.1, 0.1, 0.5, 10), cap: cyl(0.11, 0.11, 0.12, 10),
  oct: new THREE.OctahedronGeometry(0.38), ring: new THREE.TorusGeometry(0.7, 0.06, 8, 32), beam: cyl(0.55, 0.7, 3, 16).translate(0, 1.5, 0),
};
const ITEM_CAP_MAT = std(0xffd23a, 0.3, 0.9);
const ITEM_MATS = {};
for (const k in PW) {
  const P_ = PW[k];
  ITEM_MATS[k] = {
    mat: std(P_.color, 0.3, 0.5, { emissive: P_.color, emissiveIntensity: 1.6 }),
    ring: new THREE.MeshBasicMaterial({ color: new THREE.Color(...P_.rgb) }),
    beam: new THREE.MeshBasicMaterial({ color: new THREE.Color(...P_.rgb).multiplyScalar(0.18), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  };
}
function buildItem(kind) {
  const M = ITEM_MATS[kind], mat = M.mat;
  const g = new THREE.Group();
  const icon = new THREE.Group(); icon.position.y = 1.0; g.add(icon);
  if (kind === 'health') {
    icon.add(new THREE.Mesh(ITEM_GEO.bar1, mat), new THREE.Mesh(ITEM_GEO.bar2, mat));
  } else if (kind === 'shotgun') {
    for (let i = -1; i <= 1; i++) { const s = new THREE.Mesh(ITEM_GEO.shell, mat); s.position.x = i * 0.24; const c = new THREE.Mesh(ITEM_GEO.cap, ITEM_CAP_MAT); c.position.set(i * 0.24, -0.26, 0); icon.add(s, c); }
  } else {
    const o = new THREE.Mesh(ITEM_GEO.oct, mat); o.scale.y = 1.4; icon.add(o);
  }
  icon.children.forEach((c) => (c.castShadow = true));
  const ringM = new THREE.Mesh(ITEM_GEO.ring, M.ring);
  ringM.rotation.x = Math.PI / 2; ringM.position.y = 0.08; g.add(ringM);
  g.add(new THREE.Mesh(ITEM_GEO.beam, M.beam));
  return { g, icon };
}
let items = [];
function dropItem(x, z, kind) {
  if (items.length >= 6) return;
  if (!kind) kind = player.hp < 55 && Math.random() < 0.55 ? 'health' : ['shotgun', 'rapid', 'health'][Math.floor(Math.random() * 3)];
  const it = buildItem(kind);
  it.g.position.set(clamp(x, -ARENA + 1, ARENA - 1), 0, clamp(z, -ARENA + 1, ARENA - 1));
  scene.add(it.g);
  items.push({ ...it, kind, life: 14, t: 0 });
}

// ---------------- Chefe ----------------
const BOSS_NAMES = ['TRITURADOR', 'COLOSSO DE AÇO', 'REI DOS ZUMBIS-ROBÔ', 'MEGA-DESTRUIDOR', 'O IMPLACÁVEL'];
function buildBoss() {
  const g = new THREE.Group();
  const steel = std(0x4b5263, 0.45, 0.75), dark = std(0x1e2129, 0.6, 0.5), red = std(0x8a1010, 0.4, 0.4, { emissive: 0xff2010, emissiveIntensity: 0.6 });
  const core = std(0xff3010, 0.2, 0.2, { emissive: 0xff3a10, emissiveIntensity: 4 });
  const eye = std(0x200000, 0.2, 0.2, { emissive: 0xff1a1a, emissiveIntensity: 5 });
  const mats = [steel, dark];
  const add = (geo, m, x, y, z, p = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };
  add(box(1.0, 1.1, 3.2), dark, -1.35, 0.55, 0); add(box(1.0, 1.1, 3.2), dark, 1.35, 0.55, 0);
  add(box(2.6, 0.9, 2.6), steel, 0, 1.4, 0);
  add(box(3.2, 2.1, 2.2), steel, 0, 2.8, 0);
  add(box(3.26, 0.25, 2.26), red, 0, 2.2, 0);
  const coreM = add(sph(0.5, 16, 12), core, 0, 2.9, 1.08);
  add(box(1.5, 0.9, 1.3), steel, 0, 4.25, 0.1);
  add(box(1.2, 0.2, 0.08), eye, 0, 4.3, 0.77);
  add(box(0.15, 0.7, 0.15), dark, -0.5, 4.95, 0); add(box(0.15, 0.7, 0.15), dark, 0.5, 4.95, 0);
  const armL = new THREE.Group(), armR = new THREE.Group(); armL.position.set(-2.1, 3.3, 0); armR.position.set(2.1, 3.3, 0); g.add(armL, armR);
  [armL, armR].forEach((A) => { add(sph(0.65, 12, 10), red, 0, 0, 0, A); add(box(0.8, 1.6, 0.8), steel, 0, -1.0, 0.2, A); const c = add(cyl(0.28, 0.32, 1.4, 12), dark, 0, -1.4, 0.8, A); c.rotation.x = Math.PI / 2; add(cyl(0.3, 0.3, 0.1, 12), core, 0, -1.4, 1.5, A).rotation.x = Math.PI / 2; });
  return { g, core: coreM, armL, armR, mats };
}
const bossModel = buildBoss(); // um único modelo reaproveitado (sem vazamento)
let boss = null;
function roman(n) {
  const T = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let r = '';
  for (const [v, l] of T) while (n >= v) { r += l; n -= v; }
  return r;
}
let runId = 0;
const bossesKilled = { n: 0 };

// ---------------- Números de dano (DOM) ----------------
const dmgLayer = $('dmg-layer');
const dmgPool = [];
for (let i = 0; i < 36; i++) { const el = document.createElement('div'); el.className = 'dmg'; el.style.opacity = '0'; dmgLayer.appendChild(el); dmgPool.push({ el, t: 0, life: 0, x: 0, y: 0, z: 0 }); }
let dmgI = 0;
function dmgNum(x, y, z, text, cls = '') {
  const d = dmgPool[dmgI]; dmgI = (dmgI + 1) % dmgPool.length;
  d.el.textContent = text; d.el.className = 'dmg ' + cls; d.x = x + rand(-0.3, 0.3); d.y = y; d.z = z + rand(-0.2, 0.2); d.t = 0; d.life = cls === 'big' ? 1.2 : 0.75;
}
const _p = new THREE.Vector3();
function updateDmg(dt) {
  const w = window.innerWidth, h = window.innerHeight;
  for (const d of dmgPool) {
    if (d.t >= d.life) { if (d.el.style.opacity !== '0') d.el.style.opacity = '0'; continue; }
    d.t += dt;
    const k = d.t / d.life;
    _p.set(d.x, d.y + k * 1.4, d.z).project(camera);
    const sx = (_p.x * 0.5 + 0.5) * w, sy = (-_p.y * 0.5 + 0.5) * h;
    const sc = k < 0.15 ? 0.6 + k * 5 : 1.35 - k * 0.4;
    d.el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(-50%,-50%) scale(${sc.toFixed(2)})`;
    d.el.style.opacity = String(k > 0.7 ? (1 - k) / 0.3 : 1);
  }
}

// ---------------- Estado do jogo ----------------
const player = { x: 0, z: 0, hp: 100, maxHp: 100, inv: 0, face: 0, dashT: 0, dashCd: 0, ddx: 0, ddz: 1, fireT: 0, shotgun: 0, rapid: 0, walk: 0, flashT: 0, mvx: 0, mvz: 0, shots: 0, aiming: false };
let state = 'title', demo = true;
let score = 0, wave = 0, kills = 0, combo = 0, comboT = 0, maxCombo = 0;
let best = 0;
try { best = +localStorage.getItem('cb-recorde') || 0; } catch (_) {}
let spawnQueue = [], spawnT = 0, waveState = 'fight', interT = 0, waveScale = { hp: 1, sp: 1 };
let shake = 0, hitstop = 0, slowT = 0, dyingT = 0, demoT = 0, titleAng = 0;
const camPos = new THREE.Vector3(0, 20, 14), camLook = new THREE.Vector3();

// ---------------- Entrada ----------------
const keys = {};
const joy = { id: null, sx: 0, sy: 0, x: 0, y: 0 };
const aimS = { id: null, sx: 0, sy: 0, x: 0, y: 0 };
const mouse = { x: 0, y: 0, down: false };
const joyBase = $('joy-base'), joyKnob = $('joy-knob'), aimBase = $('aim-base'), aimKnob = $('aim-knob');
const JR = 56;
function setStick(s, base, knob, cx, cy) {
  let dx = cx - s.sx, dy = cy - s.sy; const l = Math.hypot(dx, dy);
  if (l > JR) { dx *= JR / l; dy *= JR / l; }
  s.x = dx / JR; s.y = dy / JR;
  knob.style.transform = `translate(${dx}px,${dy}px)`;
}
canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  if (state !== 'playing') return;
  if (e.pointerType === 'mouse') { if (e.button === 0) mouse.down = true; mouse.x = e.clientX; mouse.y = e.clientY; return; }
  if (!touchMode) { touchMode = true; document.body.classList.remove('no-touch'); }
  e.preventDefault();
  if (e.clientX < window.innerWidth * 0.5 && joy.id === null) {
    joy.id = e.pointerId; joy.sx = e.clientX; joy.sy = e.clientY; joy.x = joy.y = 0;
    joyBase.style.left = e.clientX + 'px'; joyBase.style.top = e.clientY + 'px'; joyKnob.style.transform = ''; joyBase.hidden = false;
  } else if (aimS.id === null) {
    aimS.id = e.pointerId; aimS.sx = e.clientX; aimS.sy = e.clientY; aimS.x = aimS.y = 0;
    aimBase.style.left = e.clientX + 'px'; aimBase.style.top = e.clientY + 'px'; aimKnob.style.transform = ''; aimBase.hidden = false;
  }
}, { passive: false });
window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; return; }
  if (e.pointerId === joy.id) setStick(joy, joyBase, joyKnob, e.clientX, e.clientY);
  else if (e.pointerId === aimS.id) setStick(aimS, aimBase, aimKnob, e.clientX, e.clientY);
});
const endPtr = (e) => {
  if (e.pointerType === 'mouse') { mouse.down = false; return; }
  if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; joyBase.hidden = true; }
  if (e.pointerId === aimS.id) { aimS.id = null; aimS.x = aimS.y = 0; aimBase.hidden = true; }
};
window.addEventListener('pointerup', endPtr);
window.addEventListener('pointercancel', endPtr);
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (state === 'playing' && (e.code === 'Space' || e.code === 'ShiftLeft')) { dash(); e.preventDefault(); }
  if (e.code === 'KeyP' || e.code === 'Escape') { if (state === 'playing') pauseGame(); else if (state === 'paused') resumeGame(); }
  if (e.code === 'Enter' && state === 'title' && $('tela-como').hidden) startGame();
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; });
$('btn-dash').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); dash(); });

const raycaster = new THREE.Raycaster(), aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.3), _ndc = new THREE.Vector2(), _hit = new THREE.Vector3();
function mouseGround() {
  _ndc.set((mouse.x / window.innerWidth) * 2 - 1, -(mouse.y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  return raycaster.ray.intersectPlane(aimPlane, _hit);
}

// ---------------- Ações do jogador ----------------
function dash() {
  if (player.dashCd > 0 || player.hp <= 0) return;
  let dx = player.mvx, dz = player.mvz;
  if (Math.hypot(dx, dz) < 0.1) { dx = Math.sin(player.face); dz = Math.cos(player.face); }
  const l = Math.hypot(dx, dz); player.ddx = dx / l; player.ddz = dz / l;
  player.dashT = 0.2; player.dashCd = 1.0; sfx.dash(); vibrate(15);
  shock(player.x, player.z, 2, [0.3, 1.5, 3]);
}
// linha de visão: o segmento herói→alvo não pode atravessar um pilar
function losClear(x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1;
  for (let k = 0; k < PILLARS.length; k++) {
    const px = PILLARS[k][0], pz = PILLARS[k][1];
    const t = clamp(((px - x0) * dx + (pz - z0) * dz) / L2, 0, 1);
    const cx = x0 + dx * t - px, cz = z0 + dz * t - pz, r = PILLAR_R[k] * 0.9;
    if (cx * cx + cz * cz < r * r) return false;
  }
  return true;
}
function nearestTarget(range) {
  let bx = 0, bz = 0, bd = range * range, found = false;
  for (const e of enemies) {
    if (e.spawn > 0 || e.dead) continue;
    const d = (e.x - player.x) ** 2 + (e.z - player.z) ** 2;
    if (d < bd && losClear(player.x, player.z, e.x, e.z)) { bd = d; bx = e.x; bz = e.z; found = true; }
  }
  if (boss && boss.enter <= 0) {
    const d = (boss.x - player.x) ** 2 + (boss.z - player.z) ** 2 - 4;
    if (d < bd && losClear(player.x, player.z, boss.x, boss.z)) { bd = d; bx = boss.x; bz = boss.z; found = true; }
  }
  return found ? [bx - player.x, bz - player.z] : null;
}
const _tip = new THREE.Vector3();
function fire(dx, dz) {
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  hero.tip.getWorldPosition(_tip);
  const ang = Math.atan2(dx, dz);
  const pellets = player.shotgun > 0 ? 5 : 1;
  const spread = player.shotgun > 0 ? 0.36 : 0.04;
  for (let i = 0; i < pellets; i++) {
    if (pBullets.list.length >= pBullets.max) break;
    const a = ang + (pellets > 1 ? (i / (pellets - 1) - 0.5) * spread * 2 : rand(-spread, spread));
    const sp = 34 * (pellets > 1 ? rand(0.9, 1.05) : 1);
    pBullets.list.push({ x: _tip.x, z: _tip.z, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, life: pellets > 1 ? 0.45 : 0.75, dmg: pellets > 1 ? 9 : 10 });
  }
  player.fireT = (player.rapid > 0 ? 0.075 : 0.155) * (player.shotgun > 0 ? 1.9 : 1);
  player.shots++;
  hero.flash.visible = true; hero.flash.rotation.z = Math.random() * 6; hero.flash.scale.setScalar(pellets > 1 ? 1.5 : rand(0.8, 1.1));
  player.flashTimer = 0.05;
  muzzleLight.position.copy(_tip); muzzleLight.intensity = pellets > 1 ? 70 : 40;
  for (let k = 0; k < 3; k++) emit(_tip.x, _tip.y, _tip.z, dx * rand(4, 9) + rand(-1.5, 1.5), rand(0, 2), dz * rand(4, 9) + rand(-1.5, 1.5), [4, 2.4, 0.6], 0.12, 0.25, 0.05, 0, 4);
  if (player.shots % 2 === 0) { if (debris.length < ND) debris.push({ x: _tip.x - dx * 0.5, y: 1.3, z: _tip.z - dz * 0.5, vx: dz * 3 + rand(-1, 1), vy: rand(3, 5), vz: -dx * 3 + rand(-1, 1), rx: 0, ry: 0, sx: rand(-20, 20), sy: rand(-20, 20), life: 0.9, size: 0.07, color: 0xffc23a }); }
  if (!demo) sfx.shot(pellets > 1); else if (Math.random() < 0.3) sfx.shot(false);
  shake = Math.min(1, shake + (pellets > 1 ? 0.08 : 0.025));
}
let lastHitSfx = 0;
function damageEnemy(e, dmg, dx, dz) {
  const crit = Math.random() < 0.1;
  if (crit) dmg *= 2;
  e.hp -= dmg; e.flash = 1;
  const kb = e.type === 'tank' ? 1.2 : 4.5;
  const l = Math.hypot(dx, dz) || 1; e.kx += (dx / l) * kb; e.kz += (dz / l) * kb;
  const T = TYPES[e.type];
  const col = e.type === 'zombie' ? [0.6, 2, 0.3] : [3.5, 2.2, 0.6];
  for (let k = 0; k < 5; k++) emit(e.x, 1.2, e.z, -dx / l * rand(2, 6) + rand(-3, 3), rand(1, 5), -dz / l * rand(2, 6) + rand(-3, 3), col, 0.35, 0.3, 0.05, -12, 2);
  if (!demo) dmgNum(e.x, 2.2, e.z, String(Math.round(dmg)), crit ? 'crit' : '');
  const n = performance.now();
  if (n - lastHitSfx > 50) { lastHitSfx = n; if (e.type === 'zombie') sfx.hit(); else sfx.metal(); }
  if (e.hp <= 0) killEnemy(e, T);
}
function addScore(v) {
  if (demo || state !== 'playing') return;
  score += v;
  const el = $('hud-score'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
function killEnemy(e, T) {
  e.dead = true;
  kills++;
  combo++; comboT = 2.2; maxCombo = Math.max(maxCombo, combo);
  const mult = Math.min(5, 1 + Math.floor(combo / 5));
  const pts = T.score * mult;
  addScore(pts);
  if (!demo && mult > 1) dmgNum(e.x, 3, e.z, '+' + pts, 'big');
  const big = e.type === 'tank';
  burst(e.x, 1.1, e.z, big ? 46 : 24, T.color, big ? 11 : 7, 0.6, big ? 0.7 : 0.45, -6);
  burst(e.x, 1.1, e.z, big ? 18 : 8, [4, 2.6, 0.8], big ? 14 : 9, 0.3, 0.35, -3);
  addDebris(e.x, 1, e.z, e.type === 'zombie' ? 0x6f9e4a : e.type === 'fast' ? 0xc3cddd : 0x5d6474, big ? 12 : 6, big ? 8 : 6, big ? 0.3 : 0.18);
  shock(e.x, e.z, big ? 5 : 2.6, T.color, big ? 0.5 : 0.35);
  boomLight.position.set(e.x, 2, e.z); boomI = big ? 260 : 120;
  shake = Math.min(1, shake + (big ? 0.5 : 0.18));
  if (big) hitstop = 0.05;
  if (!demo) sfx.explode(big);
  if (!demo && Math.random() < T.drop) dropItem(e.x, e.z);
}
function hurtPlayer(dmg, sx, sz) {
  if (demo || (DEBUG && window.__CBgod) || player.inv > 0 || player.dashT > 0 || player.hp <= 0) return;
  player.hp = Math.max(0, player.hp - dmg);
  player.inv = 0.9; player.flashT = 0.25;
  shake = Math.min(1, shake + 0.5);
  vibrate(player.hp <= 0 ? [120, 60, 240] : 70);
  sfx.hurt();
  dmgNum(player.x, 2.6, player.z, '-' + dmg, '');
  const v = $('hurt-vignette'); v.style.opacity = '1'; setTimeout(() => (v.style.opacity = '0'), 160);
  const dx = player.x - sx, dz = player.z - sz, l = Math.hypot(dx, dz) || 1;
  player.x += (dx / l) * 0.8; player.z += (dz / l) * 0.8;
  burst(player.x, 1.4, player.z, 12, [3, 0.4, 0.3], 6, 0.4, 0.3);
  combo = 0;
  if (player.hp <= 0) die();
}
function die() {
  state = 'dying'; dyingT = 1.6; slowT = 1.2;
  burst(player.x, 1.2, player.z, 70, [3, 1.5, 0.4], 12, 0.9, 0.7, -5);
  addDebris(player.x, 1.2, player.z, 0x1f4fc4, 10, 8, 0.25);
  addDebris(player.x, 1.2, player.z, 0xff8a1f, 8, 8, 0.25);
  shock(player.x, player.z, 7, [3, 1.2, 0.3], 0.7);
  boomLight.position.set(player.x, 2, player.z); boomI = 300;
  hero.g.visible = false;
  sfx.explode(true); music(false);
  joy.id = aimS.id = null; joyBase.hidden = aimBase.hidden = true;
}

// ---------------- Ondas e spawns ----------------
function spawnEnemy(type, x, z) {
  const T = TYPES[type];
  let alive = 0; for (const e of enemies) if (e.type === type) alive++;
  if (alive >= T.max) return false;
  if (x === undefined && !demo && camera.aspect < 1 && viewExt.ok) {
    const vp = viewSpawnPoint();
    if (vp) { x = vp[0]; z = vp[1]; }
  }
  if (x === undefined) {
    for (let k = 0; k < 12; k++) {
      const side = Math.floor(Math.random() * 4), t = rand(-ARENA + 1.5, ARENA - 1.5), edge = ARENA - 1.2;
      x = side === 0 ? t : side === 1 ? t : side === 2 ? -edge : edge;
      z = side === 0 ? -edge : side === 1 ? edge : t;
      if (Math.hypot(x - player.x, z - player.z) > 10) break;
    }
  }
  const hp = T.hp * waveScale.hp;
  enemies.push({ type, x, z, vx: 0, vz: 0, kx: 0, kz: 0, hp, maxHp: hp, r: T.r, speed: T.speed * waveScale.sp * rand(0.9, 1.1), flash: 0, t: rand(0, 10), spawn: 0.55, face: Math.atan2(player.x - x, player.z - z), shootT: rand(1.5, 3), seed: rand(0, 6.28), dead: false });
  for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; emit(x + Math.cos(a) * 0.9, 0.2, z + Math.sin(a) * 0.9, 0, rand(3, 6), 0, T.color, 0.5, 0.35, 0.05, 0, 1); }
  shock(x, z, 1.6, T.color, 0.45);
  return true;
}
// no retrato: nasce logo fora da área visível (perto da ação, mas não na tela)
function insidePillar(x, z, pad) {
  for (let k = 0; k < PILLARS.length; k++) { const dx = x - PILLARS[k][0], dz = z - PILLARS[k][1], r = PILLAR_R[k] + pad; if (dx * dx + dz * dz < r * r) return true; }
  return false;
}
function viewSpawnPoint() {
  const m = 1.8, lim = ARENA - 1.2;
  for (let k = 0; k < 14; k++) {
    let x, z;
    if (Math.random() < 0.62) { x = camLook.x + (Math.random() < 0.5 ? -1 : 1) * (viewExt.w + m); z = camLook.z + rand(-viewExt.top * 0.8, viewExt.bot * 0.9); }
    else { x = camLook.x + rand(-viewExt.w, viewExt.w); z = Math.random() < 0.55 ? camLook.z - viewExt.top - m : camLook.z + viewExt.bot + m; }
    x = clamp(x, -lim, lim); z = clamp(z, -lim, lim);
    if (Math.hypot(x - player.x, z - player.z) > 7 && !insidePillar(x, z, 0.6)) return [x, z];
  }
  return null;
}
function showBanner(html, cls = '') {
  const b = $('banner'); b.innerHTML = html; b.className = cls; b.hidden = true; void b.offsetWidth; b.hidden = false;
  clearTimeout(showBanner.t); showBanner.t = setTimeout(() => (b.hidden = true), 1900);
}
function startWave(n) {
  wave = n; waveState = 'fight';
  waveScale = { hp: 1 + 0.14 * (n - 1), sp: Math.min(1.55, 1 + 0.035 * (n - 1)) };
  const isBoss = n % 5 === 0;
  spawnQueue = [];
  const count = isBoss ? 4 + n : Math.min(64, 6 + Math.round(n * 3.2));
  const fastP = n >= 2 ? Math.min(0.4, 0.12 + 0.04 * n) : 0;
  const tankP = n >= 3 ? Math.min(0.22, 0.05 * (n - 2)) : 0;
  for (let i = 0; i < count; i++) { const r = Math.random(); spawnQueue.push(r < tankP ? 'tank' : r < tankP + fastP ? 'fast' : 'zombie'); }
  spawnT = 1.2;
  if (isBoss) {
    spawnBoss(n / 5);
    showBanner(`CHEFE!<small>${boss.name}</small>`, 'boss');
    sfx.boss(); vibrate([60, 40, 60]);
  } else {
    showBanner(`ONDA ${n}<small>${n === 1 ? 'Proteja a arena!' : n % 5 === 4 ? 'Chefe na próxima!' : 'Prepare-se!'}</small>`);
    sfx.wave();
  }
}
function spawnBoss(bi) {
  const B = bossModel;
  B.g.rotation.set(0, 0, 0); B.armL.rotation.set(0, 0, 0); B.armR.rotation.set(0, 0, 0); B.core.scale.setScalar(1);
  for (const m of B.mats) m.emissive.setRGB(0, 0, 0);
  const hp = 1400 * (1 + 0.7 * (bi - 1));
  boss = { ...B, bi, x: 0, z: -14, hp, maxHp: hp, r: 2.1, t: 0, enter: 2.2, actT: 2.5, act: null, actStep: 0, actTimer: 0, cvx: 0, cvz: 0, flash: 0, face: 0, name: BOSS_NAMES[(bi - 1) % BOSS_NAMES.length] + (bi > BOSS_NAMES.length ? ' ' + roman(Math.floor((bi - 1) / BOSS_NAMES.length) + 1) : ''), cycle: 0 };
  if (Math.hypot(player.x, player.z + 14) < 8) boss.z = 14;
  boss.g.position.set(boss.x, -6, boss.z);
  scene.add(boss.g);
  $('boss-name').textContent = boss.name; $('boss-wrap').hidden = false;
}
function enemyShot(x, z, ang, sp) {
  if (eBullets.list.length >= eBullets.max) return;
  eBullets.list.push({ x, z, vx: Math.sin(ang) * sp, vz: Math.cos(ang) * sp, life: 4 });
}
function updateBoss(dt) {
  const b = boss;
  b.t += dt; b.flash = Math.max(0, b.flash - dt * 8);
  const toP = Math.atan2(player.x - b.x, player.z - b.z);
  if (b.enter > 0) {
    b.enter -= dt;
    b.g.position.y = -6 * Math.max(0, b.enter / 2.2) ** 2;
    shake = Math.min(1, shake + dt * 1.2);
    if (Math.random() < 0.6) emit(b.x + rand(-2.5, 2.5), 0.2, b.z + rand(-2.5, 2.5), rand(-2, 2), rand(4, 9), rand(-2, 2), [3, 1, 0.3], 0.8, 0.6, 0.1, -4);
    b.g.position.x = b.x; b.g.position.z = b.z; b.g.rotation.y = toP;
    if (b.enter <= 0) { b.g.position.y = 0; shock(b.x, b.z, 9, [3, 0.8, 0.2], 0.6); shake = 1; }
    return;
  }
  // ações
  b.actT -= dt;
  if (!b.act && b.actT <= 0) {
    const order = ['radial', 'aimed', 'charge', 'radial', 'summon', 'aimed'];
    b.act = order[b.cycle++ % order.length]; b.actStep = 0; b.actTimer = 0;
  }
  let sp = 1.5 + b.bi * 0.25;
  if (b.act === 'radial') {
    b.actTimer -= dt;
    if (b.actTimer <= 0) {
      const n = 14 + b.bi * 4, off = b.actStep * 0.5 * (Math.PI * 2 / n);
      for (let i = 0; i < n; i++) enemyShot(b.x, b.z, (i / n) * Math.PI * 2 + off, 7 + b.bi);
      sfx.enemyShot(); shock(b.x, b.z, 4, [3, 0.4, 2], 0.35);
      b.actStep++; b.actTimer = 0.45;
      if (b.actStep >= 2 + Math.min(2, b.bi - 1)) { b.act = null; b.actT = 1.4; }
    }
    sp *= 0.3;
  } else if (b.act === 'aimed') {
    b.actTimer -= dt;
    if (b.actTimer <= 0) {
      for (let i = -2; i <= 2; i++) enemyShot(b.x + Math.sin(toP) * 2, b.z + Math.cos(toP) * 2, toP + i * 0.16, 11 + b.bi);
      sfx.enemyShot(); b.actStep++; b.actTimer = 0.28;
      if (b.actStep >= 3 + b.bi) { b.act = null; b.actT = 1.2; }
    }
    sp *= 0.5;
  } else if (b.act === 'charge') {
    if (b.actStep === 0) { b.actStep = 1; b.actTimer = 0.75; b.cvx = Math.sin(toP); b.cvz = Math.cos(toP); }
    b.actTimer -= dt;
    if (b.actStep === 1) {
      b.flash = 0.6 + 0.4 * Math.sin(b.t * 40); sp = 0;
      b.cvx = Math.sin(toP); b.cvz = Math.cos(toP);
      if (b.actTimer <= 0) { b.actStep = 2; b.actTimer = 0.75; sfx.dash(); shock(b.x, b.z, 4, [3, 0.5, 0.2]); }
    } else {
      b.x += b.cvx * 17 * dt; b.z += b.cvz * 17 * dt; sp = 0;
      if (Math.random() < 0.8) emit(b.x, 0.4, b.z, rand(-3, 3), rand(1, 3), rand(-3, 3), [3, 1.2, 0.3], 0.5, 0.6, 0.1, -3);
      shake = Math.min(1, shake + dt * 0.8);
      if (b.actTimer <= 0 || Math.abs(b.x) > ARENA - 2 || Math.abs(b.z) > ARENA - 2) { b.act = null; b.actT = 1.3; shock(b.x, b.z, 6, [3, 0.8, 0.2], 0.5); shake = Math.min(1, shake + 0.4); }
    }
  } else if (b.act === 'summon') {
    for (let i = 0; i < 3 + b.bi; i++) { const a = rand(0, 6.28); spawnEnemy(Math.random() < 0.5 ? 'fast' : 'zombie', clamp(b.x + Math.cos(a) * 3.5, -ARENA + 1, ARENA - 1), clamp(b.z + Math.sin(a) * 3.5, -ARENA + 1, ARENA - 1)); }
    b.act = null; b.actT = 1.5;
  }
  if (sp > 0) { b.x += Math.sin(toP) * sp * dt; b.z += Math.cos(toP) * sp * dt; }
  b.x = clamp(b.x, -ARENA + 2, ARENA - 2); b.z = clamp(b.z, -ARENA + 2, ARENA - 2);
  b.face += Math.atan2(Math.sin(toP - b.face), Math.cos(toP - b.face)) * Math.min(1, dt * 3);
  b.g.position.set(b.x, Math.abs(Math.sin(b.t * 3)) * 0.08, b.z);
  b.g.rotation.y = b.face;
  b.core.scale.setScalar(1 + 0.15 * Math.sin(b.t * 7));
  b.armL.rotation.x = Math.sin(b.t * 2) * 0.2; b.armR.rotation.x = -Math.sin(b.t * 2) * 0.2;
  for (const m of b.mats) m.emissive.setRGB(b.flash * 0.9, b.flash * 0.75, b.flash * 0.7);
  if (Math.hypot(player.x - b.x, player.z - b.z) < b.r + 0.5) hurtPlayer(b.act === 'charge' ? 28 : 20, b.x, b.z);
  $('boss-fill').style.width = Math.max(0, (b.hp / b.maxHp) * 100).toFixed(1) + '%';
}
function damageBoss(dmg) {
  const b = boss; if (!b || b.enter > 0) return;
  const crit = Math.random() < 0.1; if (crit) dmg *= 2;
  b.hp -= dmg; b.flash = Math.max(b.flash, 0.35);
  dmgNum(b.x + rand(-1, 1), 4.5, b.z, String(Math.round(dmg)), crit ? 'crit' : '');
  const n = performance.now(); if (n - lastHitSfx > 50) { lastHitSfx = n; sfx.metal(); }
  if (b.hp <= 0) killBoss();
}
function killBoss() {
  const b = boss; boss = null;
  bossesKilled.n++;
  addScore(5000 * b.bi);
  dmgNum(b.x, 5, b.z, '+' + 5000 * b.bi, 'big');
  slowT = 1.3; shake = 1; hitstop = 0.12;
  vibrate([100, 50, 200]);
  const rid = runId;
  for (let i = 0; i < 5; i++) setTimeout(() => {
    if (rid !== runId) return;
    const x = b.x + rand(-2, 2), z = b.z + rand(-2, 2);
    burst(x, 2.5, z, 50, i % 2 ? [3, 1.2, 0.3] : [3.5, 2.5, 0.8], 13, 0.9, 0.9, -5);
    shock(x, z, 7, [3, 0.9, 0.3], 0.6); boomLight.position.set(x, 3, z); boomI = 400; shake = 1; sfx.explode(true);
  }, i * 160);
  addDebris(b.x, 3, b.z, 0x4b5263, 30, 12, 0.45);
  addDebris(b.x, 3, b.z, 0x8a1010, 14, 12, 0.35);
  scene.remove(b.g);
  $('boss-wrap').hidden = true;
  dropItem(b.x - 1.5, b.z, 'health'); dropItem(b.x + 1.5, b.z, Math.random() < 0.5 ? 'shotgun' : 'rapid');
  showBanner('CHEFE DERROTADO!<small>+' + 5000 * b.bi + ' pontos</small>');
}

// ---------------- Atualização principal ----------------
function updatePlayer(dt) {
  let mx = 0, mz = 0;
  if (!demo) {
    if (keys.KeyW || keys.ArrowUp) mz -= 1;
    if (keys.KeyS || keys.ArrowDown) mz += 1;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    const jl = Math.hypot(joy.x, joy.y);
    if (jl > 0.12) { mx += joy.x; mz += joy.y; }
  } else {
    demoT += dt;
    const tx = Math.cos(demoT * 0.35) * 6, tz = Math.sin(demoT * 0.35) * 6;
    mx = (tx - player.x) * 0.5; mz = (tz - player.z) * 0.5;
  }
  let ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; ml = 1; }
  player.mvx = mx; player.mvz = mz;
  player.dashCd = Math.max(0, player.dashCd - dt);
  let speed = 7.2;
  if (player.dashT > 0) {
    player.dashT -= dt;
    player.x += player.ddx * 22 * dt; player.z += player.ddz * 22 * dt;
    emit(player.x, 1.2, player.z, rand(-1, 1), rand(0, 1), rand(-1, 1), [0.4, 1.8, 3.5], 0.35, 0.8, 0.1, 0, 2);
  } else {
    player.x += mx * speed * dt; player.z += mz * speed * dt;
  }
  // colisões
  for (let i = 0; i < PILLARS.length; i++) {
    const [px, pz] = PILLARS[i], rr = PILLAR_R[i] + 0.45;
    const dx = player.x - px, dz = player.z - pz, d = Math.hypot(dx, dz);
    if (d < rr && d > 0.0001) { player.x = px + (dx / d) * rr; player.z = pz + (dz / d) * rr; }
  }
  player.x = clamp(player.x, -ARENA + 0.6, ARENA - 0.6); player.z = clamp(player.z, -ARENA + 0.6, ARENA - 0.6);

  // mira e tiro
  let ax = 0, az = 0, wantFire = false;
  if (!demo && Math.hypot(aimS.x, aimS.y) > 0.3) { ax = aimS.x; az = aimS.y; wantFire = true; }
  else if (!demo && mouse.down) { const h = mouseGround(); if (h) { ax = h.x - player.x; az = h.z - player.z; wantFire = true; } }
  else { const t = nearestTarget(demo ? 14 : 17); if (t) { ax = t[0]; az = t[1]; wantFire = true; } }
  player.aiming = wantFire;
  let targetFace = player.face;
  if (wantFire) targetFace = Math.atan2(ax, az);
  else if (ml > 0.1) targetFace = Math.atan2(mx, mz);
  player.face += Math.atan2(Math.sin(targetFace - player.face), Math.cos(targetFace - player.face)) * Math.min(1, dt * 18);
  player.fireT -= dt;
  if (wantFire && player.fireT <= 0 && player.dashT <= 0) {
    const diff = Math.abs(Math.atan2(Math.sin(targetFace - player.face), Math.cos(targetFace - player.face)));
    if (diff < 0.5) fire(Math.sin(player.face), Math.cos(player.face));
  }
  player.shotgun = Math.max(0, player.shotgun - dt);
  player.rapid = Math.max(0, player.rapid - dt);
  player.inv = Math.max(0, player.inv - dt);
  player.flashT = Math.max(0, player.flashT - dt);
  if (player.flashTimer > 0) { player.flashTimer -= dt; if (player.flashTimer <= 0) hero.flash.visible = false; }

  // animação do herói
  const moving = player.dashT > 0 ? 1.5 : ml;
  player.walk += dt * (6 + 8 * moving) * (moving > 0.05 ? 1 : 0);
  const sw = Math.sin(player.walk) * 0.75 * Math.min(1, moving);
  hero.legL.rotation.x = sw; hero.legR.rotation.x = -sw;
  const recoil = player.flashTimer > 0 ? 0.18 : 0;
  hero.armL.rotation.x = -1.25 + recoil; hero.armR.rotation.x = -1.35 + recoil;
  hero.g.position.set(player.x, Math.abs(Math.cos(player.walk)) * 0.08 * Math.min(1, moving), player.z);
  hero.g.rotation.set(player.dashT > 0 ? 0.35 : moving * 0.08, player.face, 0);
  hero.cape.rotation.x = 0.12 + Math.min(1, moving) * 0.5 + Math.sin(player.walk * 0.5 + performance.now() * 0.003) * 0.06;
  hero.glowRing.material.color.setRGB(player.shotgun > 0 ? 3 : 0.3, player.shotgun > 0 ? 1.4 : 1.6, player.shotgun > 0 ? 0.3 : 3);
  hero.g.visible = demo || player.inv <= 0 || Math.floor(player.inv * 16) % 2 === 0;
  const f = player.flashT * 4;
  for (const m of hero.mats) m.emissive.setRGB(f * 1.5, f * 0.2, f * 0.1);
}
function updateEnemies(dt) {
  const n = enemies.length;
  for (let i = 0; i < n; i++) {
    const e = enemies[i];
    e.t += dt; e.flash = Math.max(0, e.flash - dt * 7);
    if (e.spawn > 0) { e.spawn -= dt; continue; }
    const dx = player.x - e.x, dz = player.z - e.z, d = Math.hypot(dx, dz) || 1;
    let tx = dx / d, tz = dz / d, sp = e.speed;
    if (e.type === 'fast') { const w = Math.sin(e.t * 3.5 + e.seed) * 0.75; const ox = -tz * w, oz = tx * w; tx += ox; tz += oz; }
    if (e.type === 'tank') {
      if (d < 7) { const s = Math.sin(e.seed) > 0 ? 1 : -1; tx = -tz * s * 0.6; tz = (dx / d) * s * 0.6; }
      e.shootT -= dt;
      if (e.shootT <= 0 && d < 17 && !demo) {
        const a = Math.atan2(dx, dz);
        const cx = e.x + Math.sin(e.face) * 1.2, cz = e.z + Math.cos(e.face) * 1.2;
        if (wave >= 8) { enemyShot(cx, cz, a - 0.2, 8.5); enemyShot(cx, cz, a + 0.2, 8.5); }
        enemyShot(cx, cz, a, 8.5);
        for (let k = 0; k < 6; k++) emit(cx, 1.4, cz, Math.sin(a) * rand(2, 5) + rand(-1, 1), rand(0, 2), Math.cos(a) * rand(2, 5) + rand(-1, 1), [3, 0.5, 2], 0.25, 0.4, 0.05, 0, 3);
        sfx.enemyShot(); e.shootT = rand(2.0, 2.8); e.kx -= Math.sin(a) * 1.5; e.kz -= Math.cos(a) * 1.5;
      }
    }
    if (demo && d < 2.5) sp = 0;
    const ease = Math.min(1, dt * 5);
    e.vx += (tx * sp - e.vx) * ease; e.vz += (tz * sp - e.vz) * ease;
    const kd = Math.exp(-dt * 7); e.kx *= kd; e.kz *= kd;
    e.x += (e.vx + e.kx) * dt; e.z += (e.vz + e.kz) * dt;
    const want = Math.atan2(dx, dz);
    e.face += Math.atan2(Math.sin(want - e.face), Math.cos(want - e.face)) * Math.min(1, dt * 6);
    if (!e.dead && d < e.r + 0.5) { hurtPlayer(TYPES[e.type].dmg, e.x, e.z); e.kx -= (dx / d) * 6; e.kz -= (dz / d) * 6; }
  }
  // separação
  for (let i = 0; i < n; i++) {
    const a = enemies[i];
    for (let j = i + 1; j < n; j++) {
      const b = enemies[j];
      const dx = b.x - a.x, dz = b.z - a.z, rr = a.r + b.r;
      if (dx > rr || dx < -rr || dz > rr || dz < -rr) continue;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (rr - d) * 0.5;
        const wa = b.type === 'tank' ? 0.8 : 0.5, wb = 1 - wa;
        a.x -= (dx / d) * push * wa * 2; a.z -= (dz / d) * push * wa * 2;
        b.x += (dx / d) * push * wb * 2; b.z += (dz / d) * push * wb * 2;
      }
    }
    for (let k = 0; k < PILLARS.length; k++) {
      const [px, pz] = PILLARS[k], rr = PILLAR_R[k] + a.r;
      const dx = a.x - px, dz = a.z - pz, d = Math.hypot(dx, dz);
      if (d < rr && d > 1e-4) { a.x = px + (dx / d) * rr; a.z = pz + (dz / d) * rr; }
    }
    a.x = clamp(a.x, -ARENA + 0.5, ARENA - 0.5); a.z = clamp(a.z, -ARENA + 0.5, ARENA - 0.5);
  }
  if (enemies.some((e) => e.dead)) enemies = enemies.filter((e) => !e.dead);
  // instâncias
  const cnt = { zombie: 0, fast: 0, tank: 0 };
  for (const e of enemies) {
    const T = TYPES[e.type], i = cnt[e.type]++;
    const s = e.spawn > 0 ? 1 - e.spawn / 0.55 : 1;
    let y = 0, rx = 0, rz = 0;
    if (e.type === 'zombie') { rz = Math.sin(e.t * 5 + e.seed) * 0.12; rx = 0.1; y = Math.abs(Math.sin(e.t * 5 + e.seed)) * 0.06; }
    else if (e.type === 'fast') { y = 0.15 + Math.sin(e.t * 7) * 0.12; rx = 0.25; rz = Math.sin(e.t * 3.5 + e.seed) * 0.35; if (Math.random() < 0.25 && e.spawn <= 0) emit(e.x, 0.3 + y, e.z, rand(-0.5, 0.5), -2, rand(-0.5, 0.5), [3, 1.4, 0.3], 0.25, 0.3, 0.05, 0, 2); }
    else { y = Math.random() * 0.03; }
    dummy.position.set(e.x, y - (1 - s) * 1.5, e.z);
    dummy.rotation.set(rx, e.face, rz, 'YXZ');
    dummy.scale.set(s, s * (1 + e.flash * 0.12), s);
    dummy.updateMatrix();
    T.mesh.setMatrixAt(i, dummy.matrix);
    T.flashAttr.array[i] = e.flash;
  }
  for (const k in TYPES) { const T = TYPES[k]; T.mesh.count = cnt[k]; T.mesh.instanceMatrix.needsUpdate = true; T.flashAttr.needsUpdate = true; }
}
function hitsPillar(x, z) {
  for (let k = 0; k < PILLARS.length; k++) { const dx = x - PILLARS[k][0], dz = z - PILLARS[k][1]; if (dx * dx + dz * dz < PILLAR_R[k] * PILLAR_R[k] * 0.8) return true; }
  return false;
}
function updateBullets(dt) {
  const L = pBullets.list;
  for (let i = L.length - 1; i >= 0; i--) {
    const b = L[i];
    b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
    let dead = b.life <= 0 || Math.abs(b.x) > ARENA + 0.2 || Math.abs(b.z) > ARENA + 0.2;
    if (!dead && hitsPillar(b.x, b.z)) { dead = true; burst(b.x, 1.3, b.z, 4, [3, 2, 0.6], 4, 0.2, 0.2); }
    if (!dead) for (const e of enemies) {
      if (e.dead || e.spawn > 0) continue;
      const dx = e.x - b.x, dz = e.z - b.z, rr = e.r + 0.2;
      if (dx * dx + dz * dz < rr * rr) { damageEnemy(e, b.dmg, b.vx, b.vz); dead = true; break; }
    }
    if (!dead && boss && boss.enter <= 0) { const dx = boss.x - b.x, dz = boss.z - b.z; if (dx * dx + dz * dz < boss.r * boss.r) { dead = true; burst(b.x, 1.6, b.z, 4, [3.5, 2.2, 0.6], 5, 0.25, 0.25); damageBoss(b.dmg); } }
    if (dead) { L[i] = L[L.length - 1]; L.pop(); }
  }
  pBullets.mesh.count = L.length;
  for (let i = 0; i < L.length; i++) { const b = L[i]; dummy.position.set(b.x, 1.3, b.z); dummy.rotation.set(0, Math.atan2(b.vx, b.vz), 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); pBullets.mesh.setMatrixAt(i, dummy.matrix); }
  pBullets.mesh.instanceMatrix.needsUpdate = true;
  const E = eBullets.list;
  for (let i = E.length - 1; i >= 0; i--) {
    const b = E[i];
    b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
    let dead = b.life <= 0 || Math.abs(b.x) > ARENA + 1 || Math.abs(b.z) > ARENA + 1 || hitsPillar(b.x, b.z);
    if (!dead && state === 'playing') { const dx = player.x - b.x, dz = player.z - b.z; if (dx * dx + dz * dz < 0.42 && player.inv <= 0 && player.dashT <= 0) { hurtPlayer(boss ? 12 : 10, b.x, b.z); dead = true; } }
    if (dead) { burst(b.x, 1.2, b.z, 5, [3, 0.4, 2], 3, 0.25, 0.25); E[i] = E[E.length - 1]; E.pop(); }
  }
  eBullets.mesh.count = E.length;
  const pulse = 1 + Math.sin(performance.now() * 0.02) * 0.15;
  for (let i = 0; i < E.length; i++) { const b = E[i]; dummy.position.set(b.x, 1.2, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(pulse); dummy.updateMatrix(); eBullets.mesh.setMatrixAt(i, dummy.matrix); }
  eBullets.mesh.instanceMatrix.needsUpdate = true;
}
function updateItems(dt) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.t += dt; it.life -= dt;
    it.icon.rotation.y += dt * 2.4; it.icon.position.y = 1 + Math.sin(it.t * 3) * 0.18;
    it.g.visible = it.life > 3 || Math.floor(it.life * 8) % 2 === 0;
    const d = Math.hypot(player.x - it.g.position.x, player.z - it.g.position.z);
    if (d < 1.4 && state === 'playing' && !(it.kind === 'health' && player.hp >= player.maxHp)) {
      const P_ = PW[it.kind];
      if (it.kind === 'health') { const h = Math.min(35, player.maxHp - player.hp); player.hp = Math.min(player.maxHp, player.hp + 35); dmgNum(player.x, 2.8, player.z, '+' + Math.max(1, Math.round(h)), 'heal'); sfx.heal(); }
      else { player[it.kind] = P_.dur; dmgNum(player.x, 2.8, player.z, P_.label + '!', 'big'); sfx.power(); }
      burst(it.g.position.x, 1, it.g.position.z, 30, P_.rgb, 7, 0.6, 0.4, 2);
      shock(it.g.position.x, it.g.position.z, 3, P_.rgb, 0.4);
      vibrate(25);
      scene.remove(it.g); items.splice(i, 1); continue;
    }
    if (it.life <= 0) { scene.remove(it.g); items.splice(i, 1); }
  }
}
function updateWaves(dt) {
  if (demo) {
    spawnT -= dt;
    if (spawnT <= 0 && enemies.length < 7) { spawnEnemy(Math.random() < 0.3 ? 'fast' : Math.random() < 0.1 ? 'tank' : 'zombie'); spawnT = 1.2; }
    return;
  }
  if (state !== 'playing') return; // morto: sem bônus nem próxima onda
  if (waveState === 'intermission') {
    interT -= dt;
    if (interT <= 0) startWave(wave + 1);
    return;
  }
  const maxAlive = touchMode ? 30 : 42;
  spawnT -= dt;
  if (spawnQueue.length && spawnT <= 0 && enemies.length < maxAlive) {
    const burstN = wave >= 6 ? 2 : 1;
    for (let k = 0; k < burstN && spawnQueue.length; k++) if (spawnEnemy(spawnQueue[0])) spawnQueue.shift();
    spawnT = Math.max(0.25, 1.0 - wave * 0.055);
  }
  if (!spawnQueue.length && !enemies.length && !boss) {
    waveState = 'intermission'; interT = 2.6;
    const bonus = wave * 250; addScore(bonus);
    player.hp = Math.min(player.maxHp, player.hp + 10);
    showBanner(`ONDA ${wave} CONCLUÍDA!<small>Bônus +${bonus} · Vida +10</small>`);
    sfx.power();
  }
}
const viewExt = { w: 10, top: 12, bot: 7, ok: false }; // extensão visível do chão em volta do ponto de mira da câmera
function updateCamera(dt, rdt) {
  const a = camera.aspect, t = Math.tan((camera.fov * Math.PI) / 360);
  const portrait = a < 1;
  // retrato: câmera mais alta e mais inclinada, mostrando ~7 m para cada lado do herói
  const D = (portrait ? clamp(7 / (t * a), 18, 30) : clamp(Math.max(9.5 / (t * a), 7.6 / t), 13, 27)) * ZOOM;
  const pitch = portrait ? 1.22 : 1.0;
  let lx = player.x, lz = player.z;
  if (state === 'title' || demo) {
    viewExt.ok = false; lampMesh.visible = true;
    titleAng += rdt * 0.15;
    const r = a < 1 ? 11 : 9;
    const k = 1 - Math.exp(-rdt * 3);
    camPos.x += (player.x + Math.sin(titleAng) * r - camPos.x) * k; camPos.y += ((a < 1 ? 6.5 : 5) - camPos.y) * k; camPos.z += (player.z + Math.cos(titleAng) * r - camPos.z) * k;
    camLook.x += (player.x - camLook.x) * k; camLook.z += (player.z - camLook.z) * k; camLook.y = a < 1 ? -0.6 : 0.6;
  } else {
    // extensão visível no chão (frente/trás do ponto de mira e meia-largura)
    const H = Math.sin(pitch) * D, back = Math.cos(pitch) * D, hv = (camera.fov * Math.PI) / 360;
    const angTop = Math.max(0.12, pitch - hv), angBot = pitch + hv;
    viewExt.top = H / Math.tan(angTop) - back;
    viewExt.bot = back - H / Math.tan(angBot);
    viewExt.w = D * t * a; viewExt.ok = true;
    lampMesh.visible = !portrait; // no retrato a câmera alta faz os postes dos cantos taparem o herói
    lx += player.mvx * 1.5; lz += player.mvz * 1.5;
    if (boss) { lx += (boss.x - player.x) * (portrait ? 0.2 : 0.3); lz += (boss.z - player.z) * (portrait ? 0.2 : 0.3); }
    // não mostrar além dos muros (sem metade da tela de prédios), mas sempre com o herói bem dentro da tela
    const E = ARENA + 1;
    const xr = Math.max(0, E - viewExt.w);
    lx = clamp(lx, -xr, xr);
    lx = clamp(lx, player.x - viewExt.w * 0.5, player.x + viewExt.w * 0.5);
    let zMin = -E + viewExt.top, zMax = E - viewExt.bot;
    if (zMin > zMax) zMin = zMax = (zMin + zMax) / 2;
    lz = clamp(lz, zMin, zMax);
    lz = clamp(lz, player.z - viewExt.bot * 0.55, player.z + viewExt.top * 0.5);
    const tx = lx, ty = H, tz = lz + back;
    const k = 1 - Math.exp(-rdt * 7);
    camPos.x += (tx - camPos.x) * k; camPos.y += (ty - camPos.y) * k; camPos.z += (tz - camPos.z) * k;
    camLook.x += (lx - camLook.x) * k; camLook.z += (lz - camLook.z) * k; camLook.y = 1;
  }
  shake = Math.max(0, shake - rdt * 1.8);
  const s = shake * shake * 0.9;
  camera.position.set(camPos.x + rand(-s, s), camPos.y + rand(-s, s), camPos.z + rand(-s, s));
  camera.lookAt(camLook.x + rand(-s, s) * 0.3, camLook.y, camLook.z);
  // sombra acompanha o centro da área visível
  const sz = viewExt.ok ? camLook.z - (viewExt.top - viewExt.bot) * 0.5 : camLook.z;
  sun.position.set(camLook.x + 9, 20, sz + 7); sun.target.position.set(camLook.x, 0, sz);
}

// ---------------- Setas de borda (inimigos fora da tela) ----------------
const arrowLayer = document.createElement('div'); arrowLayer.id = 'arrow-layer'; $('hud').insertBefore(arrowLayer, $('btn-dash'));
const ARROW_N = 8, ARROW_COL = { zombie: '#8dff5a', fast: '#3ae8ff', tank: '#ff7a3a' };
function mkArrow(cls) {
  const el = document.createElement('div'); el.className = 'edge-arrow ' + cls; el.style.display = 'none';
  const tri = document.createElement('i'); el.appendChild(tri);
  let lb = null;
  if (cls === 'boss') { lb = document.createElement('b'); lb.textContent = 'CHEFE'; el.appendChild(lb); }
  arrowLayer.appendChild(el);
  return { el, tri, lb, on: false };
}
const arrows = []; for (let i = 0; i < ARROW_N; i++) arrows.push(mkArrow('enemy'));
const bossArrow = mkArrow('boss');
const _cand = [];
function placeArrow(A, x, y, z, color, near) {
  _p.set(x, y, z).project(camera);
  const w = window.innerWidth, h = window.innerHeight;
  const topM = boss ? 178 : 92, botM = 26, sideM = 20; // abaixo da barra do chefe
  let sx = (_p.x * 0.5 + 0.5) * w, sy = (-_p.y * 0.5 + 0.5) * h;
  const behind = _p.z > 1;
  if (!behind && sx > sideM && sx < w - sideM && sy > topM && sy < h - botM) return false; // visível
  const cx = w / 2, cy = (topM + h - botM) / 2;
  let dx = sx - cx, dy = sy - cy; if (behind) { dx = -dx; dy = -dy; }
  const tx = dx > 0 ? (w - sideM - cx) / dx : dx < 0 ? (sideM - cx) / dx : Infinity;
  const ty = dy > 0 ? (h - botM - cy) / dy : dy < 0 ? (topM - cy) / dy : Infinity;
  const k = Math.min(tx, ty);
  const px = cx + dx * k, py = cy + dy * k;
  if (!A.on) { A.el.style.display = ''; A.on = true; }
  A.el.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px)`;
  A.tri.style.transform = `rotate(${Math.atan2(dy, dx).toFixed(3)}rad) scale(${(0.8 + 0.45 * near).toFixed(2)})`;
  if (A.lb) { const L = Math.hypot(dx, dy) || 1; A.lb.style.transform = `translate(calc(-50% - ${(dx / L * 40).toFixed(1)}px), calc(-50% - ${(dy / L * 40).toFixed(1)}px))`; }
  if (color) A.el.style.color = color;
  A.el.style.opacity = (0.45 + 0.55 * near).toFixed(2);
  return true;
}
function hideArrow(A) { if (A.on) { A.el.style.display = 'none'; A.on = false; } }
function updateArrows() {
  if (state !== 'playing') { for (const A of arrows) hideArrow(A); hideArrow(bossArrow); return; }
  _cand.length = 0;
  for (const e of enemies) { if (e.dead || e.spawn > 0) continue; _cand.push(e); e._d2 = (e.x - player.x) ** 2 + (e.z - player.z) ** 2; }
  _cand.sort((p, q) => p._d2 - q._d2);
  let n = 0;
  for (let i = 0; i < _cand.length && n < ARROW_N; i++) {
    const e = _cand[i];
    const near = clamp(1 - (Math.sqrt(e._d2) - 6) / 22, 0, 1);
    if (placeArrow(arrows[n], e.x, 1, e.z, ARROW_COL[e.type], near)) n++;
  }
  for (let i = n; i < ARROW_N; i++) hideArrow(arrows[i]);
  if (boss && !(boss.enter > 1.6)) { if (!placeArrow(bossArrow, boss.x, 2.5, boss.z, null, 1)) hideArrow(bossArrow); }
  else hideArrow(bossArrow);
}

// ---------------- HUD ----------------
const hud = { score: -1, wave: -1, hp: -1, combo: -1, pw: '' };
function updateHud() {
  if (hud.score !== score) { hud.score = score; $('hud-score').textContent = score.toLocaleString('pt-BR'); }
  if (hud.wave !== wave) { hud.wave = wave; $('hud-wave').textContent = 'ONDA ' + wave; }
  const hp = Math.round(player.hp);
  if (hud.hp !== hp) {
    hud.hp = hp; const pct = (hp / player.maxHp) * 100 + '%';
    $('hp-fill').style.width = pct; $('hp-ghost').style.width = pct; $('hp-fill').classList.toggle('low', hp < 30);
  }
  const mult = Math.min(5, 1 + Math.floor(combo / 5));
  const cKey = combo >= 3 ? combo + 'x' + mult : '';
  if (hud.combo !== cKey) { hud.combo = cKey; const c = $('hud-combo'); c.hidden = !cKey; if (cKey) c.textContent = `COMBO ${combo}${mult > 1 ? ' · x' + mult : ''}`; }
  let pw = '';
  for (const k of ['shotgun', 'rapid']) if (player[k] > 0) pw += `<div class="pchip" style="background:${PW[k].css}">${PW[k].label} ${Math.ceil(player[k])}s<i style="width:${(player[k] / PW[k].dur) * 100}%"></i></div>`;
  if (pw !== hud.pw) { hud.pw = pw; $('hud-power').innerHTML = pw; }
  $('btn-dash').classList.toggle('cool', player.dashCd > 0);
}

// ---------------- Telas ----------------
const screens = ['tela-titulo', 'tela-como', 'tela-pausa', 'tela-fim'];
function show(id) { for (const s of screens) $(s).hidden = s !== id; }
function paintSound() { const t = isMuted() ? '🔇 Som: desligado' : '🔊 Som: ligado'; $('btn-som').textContent = t; $('btn-som2').textContent = t; }
function clearWorld() {
  enemies = []; pBullets.list.length = 0; eBullets.list.length = 0;
  for (const it of items) scene.remove(it.g); items = [];
  if (boss) { scene.remove(boss.g); boss = null; }
  $('boss-wrap').hidden = true;
  for (let i = 0; i < NP; i++) pLife[i] = 0;
  debris.length = 0;
}
function resetPlayer() {
  Object.assign(player, { x: 0, z: 0, hp: 100, inv: 0, face: Math.PI, dashT: 0, dashCd: 0, fireT: 0, shotgun: 0, rapid: 0, flashT: 0, mvx: 0, mvz: 0 });
  hero.g.visible = true;
}
function startGame() {
  initAudio(); sfx.click(); runId++;
  clearWorld(); resetPlayer();
  demo = false; state = 'playing';
  score = 0; kills = 0; combo = 0; maxCombo = 0; bossesKilled.n = 0; wave = 0;
  for (const k in hud) hud[k] = k === 'pw' ? '' : -1;
  show(null); $('hud').hidden = false;
  camPos.set(0, 22, 14);
  music(true);
  startWave(1);
}
function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused'; show('tela-pausa'); music(false);
  joy.id = aimS.id = null; joy.x = joy.y = aimS.x = aimS.y = 0; joyBase.hidden = aimBase.hidden = true; mouse.down = false;
}
function resumeGame() { if (state !== 'paused') return; sfx.click(); state = 'playing'; show(null); music(true); last = performance.now(); }
function toTitle() {
  sfx.click(); music(false);
  runId++; clearWorld(); resetPlayer(); demo = true; state = 'title'; demoT = 0;
  $('hud').hidden = true; show('tela-titulo');
  $('titulo-recorde').textContent = best.toLocaleString('pt-BR');
}
function showResults() {
  state = 'over';
  const rec = score > best && score > 0;
  if (rec) { best = score; try { localStorage.setItem('cb-recorde', String(best)); } catch (_) {} sfx.record(); } else sfx.over();
  $('fim-titulo').textContent = wave >= 10 ? 'QUE BATALHA!' : 'FIM DE JOGO';
  $('fim-recorde').hidden = !rec;
  $('fim-pontos').textContent = score.toLocaleString('pt-BR');
  $('fim-onda').textContent = wave;
  $('fim-abates').textContent = kills;
  $('fim-chefes').textContent = bossesKilled.n;
  $('fim-combo').textContent = maxCombo;
  $('fim-melhor').textContent = best.toLocaleString('pt-BR');
  $('hud').hidden = true;
  show('tela-fim');
}
$('btn-jogar').addEventListener('click', startGame);
$('btn-como').addEventListener('click', () => { initAudio(); sfx.click(); show('tela-como'); });
$('btn-como-ok').addEventListener('click', () => { sfx.click(); show('tela-titulo'); });
const toggleSound = () => { initAudio(); setMuted(!isMuted()); paintSound(); sfx.click(); };
$('btn-som').addEventListener('click', toggleSound);
$('btn-som2').addEventListener('click', toggleSound);
$('btn-pause').addEventListener('click', (e) => { e.stopPropagation(); initAudio(); sfx.click(); pauseGame(); });
$('btn-continuar').addEventListener('click', resumeGame);
$('btn-reiniciar').addEventListener('click', startGame);
$('btn-menu').addEventListener('click', toTitle);
$('btn-denovo').addEventListener('click', startGame);
$('btn-fim-menu').addEventListener('click', toTitle);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

// ---------------- Loop ----------------
let last = performance.now(), fAcc = 0, fN = 0, fpsNow = 60, lowCount = 0, highCount = 0, lastDown = -1e9, lastUp = -1e9, upBlockUntil = 0;
const maxTier = tierIdx;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now;
  const rdt = Math.min(0.05, Math.max(0, raw));
  fAcc += raw; fN++;
  if (fAcc >= 2) {
    fpsNow = fN / fAcc; fAcc = 0; fN = 0;
    if (!qp && (state === 'playing' || state === 'title') && !document.hidden) {
      // histerese: cai rápido (2 janelas < 45 fps), sobe devagar (4 janelas > 56 fps), e para de subir se oscilar
      if (fpsNow < 45 && tierIdx > 0) {
        highCount = 0;
        if (++lowCount >= 2) { tierIdx--; applyTier(); lowCount = 0; if (now - lastUp < 20000) upBlockUntil = now + 90000; lastDown = now; }
      } else if (fpsNow > 56 && tierIdx < maxTier && now > upBlockUntil && now - lastDown > 10000) {
        lowCount = 0;
        if (++highCount >= 4) { tierIdx++; applyTier(); highCount = 0; lastUp = now; }
      } else { lowCount = 0; highCount = 0; }
    }
  }
  if (state !== 'paused') {
    let dt = rdt;
    if (hitstop > 0) { hitstop -= rdt; dt = 0; }
    if (slowT > 0) { slowT -= rdt; dt *= 0.35; }
    if (state === 'playing' || state === 'title') updatePlayer(dt);
    if (state !== 'over') { updateWaves(dt); updateEnemies(dt); if (boss) updateBoss(dt); updateBullets(dt); updateItems(dt); }
    if (state === 'dying') { dyingT -= rdt; if (dyingT <= 0) showResults(); }
    comboT -= dt; if (comboT <= 0) combo = 0;
    // brasas no ar
    if (Math.random() < 0.6) emit(camLook.x + rand(-16, 16), 0.2, camLook.z + rand(-14, 14), rand(-0.3, 0.3), rand(0.6, 1.4), rand(-0.3, 0.3), [1.6, 0.6, 0.15], 3, 0.12, 0.02, 0.1, 0.2);
    updateParticles(dt); updateDebris(dt); updateRings(dt); updateDmg(dt);
    muzzleLight.intensity *= Math.exp(-rdt * 30);
    boomI *= Math.exp(-rdt * 9); boomLight.intensity = boomI;
    neonMesh.material.emissiveIntensity = 1;
    updateGlow();
    if (state === 'playing') updateHud();
  }
  updateCamera(0, state === 'paused' ? 0 : rdt);
  updateArrows();
  if (bloom.enabled) composer.render(); else renderer.render(scene, camera);
}

if (DEBUG) window.__CB = {
  get state() { return state; }, get fps() { return fpsNow; }, get tier() { return TIERS[tierIdx].name; },
  get wave() { return wave; }, get enemies() { return enemies.length; }, get score() { return score; }, get hp() { return player.hp; },
  get boss() { return boss ? { hp: boss.hp, name: boss.name } : null; },
  skipTo(n) { clearWorld(); startWave(n); }, killAll() { for (const e of enemies) damageEnemy(e, 9999, 0, 1); if (boss) damageBoss(99999); },
  hurt(n) { player.inv = 0; player.dashT = 0; hurtPlayer(n, player.x + 1, player.z); }, drop(k) { dropItem(player.x + 2, player.z, k); }, info: () => renderer.info.render,
  mem: () => ({ ...renderer.info.memory, programs: renderer.info.programs.length }), restart: () => startGame(), menu: () => toTitle(),
  setTier(i) { tierIdx = clamp(i, 0, 2); applyTier(); }, get items() { return items.length; }, get view() { return { ...viewExt }; },
  get player() { return { x: player.x, z: player.z }; }, teleport(x, z) { player.x = x; player.z = z; },
  arrows: () => arrows.filter((A) => A.on).length + (bossArrow.on ? 1 : 0), get bossArrow() { return bossArrow.on; },
  screen(x, z) { _p.set(x, 1, z).project(camera); return { x: (_p.x * 0.5 + 0.5) * window.innerWidth, y: (-_p.y * 0.5 + 0.5) * window.innerHeight }; },
  get bossPos() { return boss ? { x: boss.x, z: boss.z, enter: boss.enter } : null; },
};

paintSound();
$('titulo-recorde').textContent = best.toLocaleString('pt-BR');
applyTier();
resetPlayer();
// pré-compila chefe e itens (sem travada no 1º chefe / 1º item)
{
  const pre = [bossModel.g, ...Object.keys(PW).map((k) => buildItem(k).g)];
  pre.forEach((o, i) => { o.position.set(i * 3 - 4, 0, 2); o.traverse((c) => (c.frustumCulled = false)); scene.add(o); });
  updateCamera(0, 0.016);
  renderer.compile(scene, camera);
  composer.render(); renderer.render(scene, camera);
  pre.forEach((o) => { scene.remove(o); o.traverse((c) => (c.frustumCulled = true)); });
}
$('loading').hidden = true;
requestAnimationFrame((t) => { last = t; frame(t); });
