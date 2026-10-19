// CAPITÃO BALA — arcade 3D original (Three.js r160)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { initAudio, sfx, music, setMuted, isMuted, musicIntensity, laser as laserSfx, setVolume, getVolumes, setLowHp, setWaveLevel, audioState, musicLevel } from './audio.js?v=202610192130';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { buildHero, SKINS, zombieGeo, fastGeo, tankGeo, sniperGeo, bombaGeo, guardGeo, animInject, animDepthMaterial } from './models.js?v=202610192130';
import { meta, saveMeta, resetMeta, SHOP, ARENAS, ACH, ACH_BY, lvl, arenaUnlocked } from './meta.js?v=202610192130';

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
let touchMode = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
if (!touchMode) document.body.classList.add('no-touch');
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };
let vibOn = LS.get('cb-vibrar', '1') !== '0';
const vibrate = (p) => { if (!vibOn) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) {} };

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

// pr = teto de pixelRatio no PC; prM = teto no celular (Galaxy tem DPR 2.6–3.5: renderizar tudo isso não compensa)
const TIERS = [
  { name: 'baixa', label: 'Baixa', pr: 0.9, prM: 1.0, shadow: 0, bloom: 0 },
  { name: 'media', label: 'Média', pr: 1.35, prM: 1.4, shadow: 1024, bloom: 0.6 },
  { name: 'alta', label: 'Alta', pr: 2, prM: 1.8, shadow: 2048, bloom: 1 },
];
// ---- detecção do aparelho (memória, núcleos, GPU) ----
const DEV = (() => {
  const mem = navigator.deviceMemory || 0, cores = navigator.hardwareConcurrency || 0;
  let gpu = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
  } catch (_) {}
  const g = gpu.toLowerCase();
  let cls = 'mid';
  const adreno = +(g.match(/adreno[^0-9]*(\d{3})/) || [])[1] || 0;
  const mali = g.match(/mali-([gt])(\d+)/);
  const maliN = mali ? +mali[2] : 0;
  if (/swiftshader|llvmpipe|software|powervr|mali-t|mali-4|mali-g(31|51|52|57)\b|adreno[^0-9]*[2-5]\d\d/.test(g)) cls = 'low';
  else if (/xclipse|immortalis/.test(g) || adreno >= 730 || (mali && mali[1] === 'g' && maliN >= 710)) cls = 'high';
  else if (adreno >= 640 || (mali && maliN >= 68)) cls = 'mid';
  if ((mem && mem <= 3) || (cores && cores <= 4)) cls = 'low';
  else if (cls === 'high' && mem && mem < 6) cls = 'mid';
  return { mem, cores, gpu, cls };
})();
const qp = new URLSearchParams(location.search).get('q');
const qpOk = !!(qp && /^[012]$/.test(qp));
let qualPref = LS.get('cb-qualidade', 'auto'); if (!/^(auto|[012])$/.test(qualPref)) qualPref = 'auto';
const isAuto = () => !qpOk && qualPref === 'auto';
function autoStartTier() {
  if (!touchMode) return DEV.cls === 'low' ? 1 : 2;
  return DEV.cls === 'low' ? 0 : 1; // celular: alto/médio começam em Média (médio sem sombra), fraco em Baixa
}
function autoMaxTier() { return touchMode ? 1 : 2; }
function prefTier() { return qpOk ? +qp : qualPref === 'auto' ? autoStartTier() : +qualPref; }
let tierIdx = prefTier();
let maxTier = isAuto() ? autoMaxTier() : tierIdx;
let bloomScale = 1;
const ZOOM = +(new URLSearchParams(location.search).get('zoom') || 1);
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

const scene = new THREE.Scene();
renderer.info.autoReset = false; // soma todas as passadas do quadro (cena + pós-processamento)
scene.background = new THREE.Color(0x060914);
scene.fog = new THREE.Fog(0x0a0f24, 34, 80);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 220);

const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: touchMode ? 0 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.22, 1.05); // raio menor: halos redondos, sem 'quadrados' das mips baixas
const bloomSetSize = bloom.setSize.bind(bloom);
bloom.setSize = (w, h) => bloomSetSize(Math.max(32, Math.round(w * bloomScale)), Math.max(32, Math.round(h * bloomScale)));
composer.addPass(bloom);
const gradePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.08 }, uTint: { value: new THREE.Vector3(1.02, 1.0, 0.97) }, uShadow: { value: new THREE.Vector3(0.006, 0.01, 0.022) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  // em espaço linear, antes do tone mapping: sombras puxadas para o azul, luzes levemente quentes, saturação suave
  fragmentShader: 'uniform sampler2D tDiffuse; uniform float uSat; uniform vec3 uTint; uniform vec3 uShadow; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)); vec3 g = mix(vec3(l), c.rgb, uSat) * uTint; g += uShadow * (1.0 - clamp(l * 4.0, 0.0, 1.0)); gl_FragColor = vec4(max(g, 0.0), c.a); }',
});
composer.addPass(gradePass);
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
  let pr = Math.min(window.devicePixelRatio || 1, touchMode ? t.prM : t.pr);
  if (touchMode && DEV.cls === 'low') pr = Math.min(pr, tierIdx === 0 ? 0.85 : 1.2);
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  const sh = t.shadow > 0 && !(isAuto() && touchMode && DEV.cls !== 'high' && tierIdx === 1); // médio no automático: sem sombras
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
  if (typeof measureHud === 'function') requestAnimationFrame(measureHud);
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

const rimU = { value: new THREE.Color(0.25, 0.5, 1.1) };
const RIM_GLSL = 'totalEmissiveRadiance += uRim * pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 3.0);';
function addRim(m) { // contorno de luz barato: realça a silhueta contra o chão escuro
  if (m.userData.rim) return; m.userData.rim = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); sh.uniforms.uRim = rimU; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRim;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + RIM_GLSL); };
  const k = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => '';
  m.customProgramCacheKey = () => k() + '-rim';
}
function instMaterial(opts = {}, dissolve = false, anim = false) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35, ...opts });
  m.onBeforeCompile = (s) => {
    if (anim) animInject(s, true);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float emis;\nattribute float iFlash;\nvarying float vEmis;\nvarying float vFlash;' + (dissolve ? '\nattribute float iDis;\nvarying float vDis;\nvarying vec3 vLP;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmis = emis;\nvFlash = iFlash;' + (dissolve ? '\nvDis = iDis;\nvLP = position;' : ''));
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vEmis;\nvarying float vFlash;' + (dissolve ? '\nvarying float vDis;\nvarying vec3 vLP;' : ''))
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vEmis + vec3(vFlash * 2.8, vFlash * 2.7, vFlash * 2.5);' + (dissolve
        ? '\nif (vDis > 0.0) { float dn = fract(sin(dot(floor(vLP * 7.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453) * 0.8 + (1.0 - clamp(vLP.y / 2.2, 0.0, 1.0)) * 0.2; if (dn < vDis) discard; if (dn < vDis + 0.14) totalEmissiveRadiance += vec3(3.2, 1.3, 0.35); }' : ''));
  };
  m.customProgramCacheKey = () => (anim ? 'cb-inst-anim' : dissolve ? 'cb-inst-dis' : 'cb-inst');
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

// ---------------- Arenas: Praça Neon (cidade) e Porto Ferrugem (docas) ----------------
function staticMesh(parts, opts = {}, shadow = true) {
  const m = new THREE.Mesh(mergeGeometries(parts), instMaterial(opts));
  m.geometry.setAttribute('iFlash', new THREE.BufferAttribute(new Float32Array(m.geometry.attributes.position.count), 1));
  m.castShadow = shadow; m.receiveShadow = true; return m;
}
const cityGroup = new THREE.Group(), portoGroup = new THREE.Group();
scene.add(cityGroup, portoGroup); portoGroup.visible = false;
for (const o of [ring1, ring2, pillarMesh, buildings]) { scene.remove(o); cityGroup.add(o); }
const CITY_PILLARS = PILLARS.map((p, i) => [p[0], p[1], PILLAR_R[i]]);
// cidade: carros estacionados, árvores em canteiros, barreiras e máquinas de refrigerante do lado de fora dos muros
{
  const parts = [], E = ARENA + 1.6;
  const carCols = [0xc23a2a, 0x2a6ac2, 0xe0c23a, 0x3a3f4a, 0xe8e8ee, 0x2a9a6a];
  const spots = [[-14, -1], [6, -1], [-6, 1], [14, 1], [-18, 2], [18, -2], [0, 3], [10, 3]];
  spots.forEach(([t, side], i) => {
    const horiz = i % 2 === 0, sg = side > 0 ? 1 : -1, off = E + 2.4 + Math.abs(side) * 0.4;
    const x = horiz ? t : sg * off, z = horiz ? sg * off : t, ry = horiz ? 0 : Math.PI / 2, c = carCols[i % carCols.length];
    const cx = Math.cos(ry), sx = Math.sin(ry), at = (u, w) => [x + u * cx + w * sx, z - u * sx + w * cx];
    parts.push(P(box(4, 0.8, 1.9), c, 0, x, 0.65, z, 0, ry), P(box(2.2, 0.7, 1.7), 0x1a2030, 0.25, x, 1.38, z, 0, ry));
    for (const u of [-1.3, 1.3]) for (const w of [-0.9, 0.9]) { const [px, pz] = at(u, w); parts.push(P(cyl(0.36, 0.36, 0.3, 10), 0x111318, 0, px, 0.36, pz, Math.PI / 2, ry + Math.PI / 2)); }
    for (const w of [-0.65, 0.65]) { const [px, pz] = at(2.01, w); parts.push(P(box(0.05, 0.16, 0.36), 0xfff2c0, 2.5, px, 0.78, pz, 0, ry)); }
  });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26, r = E + 6.5 + (i % 3);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    parts.push(P(cyl(1.1, 1.2, 0.6, 12), 0x5a5f6a, 0, x, 0.3, z), P(cyl(0.16, 0.22, 2.2, 8), 0x4a3424, 0, x, 1.6, z));
    parts.push(P(sph(1.3, 7, 5), 0x2f6a34, 0.05, x, 3.1, z, i, i * 2, 0, 1, 0.9, 1), P(sph(0.95, 7, 5), 0x3f8a3a, 0.08, x + 0.4, 3.8, z - 0.2, i * 3, i, 0));
  }
  for (let i = 0; i < 4; i++) {
    const sx = i % 2 ? 1 : -1, sz = i < 2 ? 1 : -1, x = sx * (E + 1.2), z = sz * 8.5;
    parts.push(P(box(0.9, 2.1, 0.8), [0xd8322a, 0x2a7ad8, 0x3ad86a, 0xe8b02a][i], 0.15, x, 1.05, z), P(box(0.7, 1.2, 0.05), 0xbfe8ff, 1.6, x - sx * 0.43, 1.25, z, 0, Math.PI / 2));
  }
  for (let i = 0; i < 8; i++) { // barreiras listradas
    const t = -ARENA + 4 + i * 5.6, sg = i % 2 ? 1 : -1;
    parts.push(P(box(2.2, 0.9, 0.5), 0xe8e8e8, 0, t, 0.45, sg * (E + 0.9)), P(box(2.24, 0.18, 0.52), 0xff5a1a, 0.5, t, 0.62, sg * (E + 0.9)));
  }
  cityGroup.add(staticMesh(parts, { roughness: 0.55 }));
}

// porto: chão de chapas de aço rebitadas, ferrugem e faixas de perigo
const portoTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#2d2a28'; g.fillRect(0, 0, w, h);
  const n = 4, s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x0 = i * s, y0 = j * s, l = 20 + Math.random() * 9;
    g.fillStyle = `hsl(${200 + Math.random() * 30},6%,${l}%)`; g.fillRect(x0 + 2, y0 + 2, s - 4, s - 4);
    // padrão antiderrapante (losangos)
    g.fillStyle = 'rgba(255,255,255,.05)';
    for (let a = 8; a < s - 8; a += 14) for (let b = 8; b < s - 8; b += 14) { g.save(); g.translate(x0 + a + ((b / 14) % 2) * 7, y0 + b); g.rotate((((a + b) / 14) % 2 ? 1 : -1) * 0.7); g.fillRect(-4, -1, 8, 2); g.restore(); }
    g.fillStyle = 'rgba(0,0,0,.6)';
    for (const [rx, ry] of [[8, 8], [s - 8, 8], [8, s - 8], [s - 8, s - 8], [s / 2, 8], [s / 2, s - 8]]) { g.beginPath(); g.arc(x0 + rx, y0 + ry, 3, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.18)';
    for (const [rx, ry] of [[8, 8], [s - 8, 8], [8, s - 8], [s - 8, s - 8]]) { g.beginPath(); g.arc(x0 + rx - 1, y0 + ry - 1, 1.3, 0, 7); g.fill(); }
  }
  for (let k = 0; k < 6; k++) { // manchas de ferrugem
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, 'rgba(120,64,30,.22)'); gr.addColorStop(1, 'rgba(110,50,20,0)');
    g.save(); g.translate(Math.random() * w, Math.random() * h); g.scale(rand(18, 55), rand(12, 40)); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore();
  }
});
portoTex.wrapS = portoTex.wrapT = THREE.RepeatWrapping; portoTex.repeat.set(14, 14);
const stripeTex = canvasTex(128, 32, (g, w, h) => { g.fillStyle = '#16181c'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8b02a'; for (let x = -32; x < w + 32; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 16, 0); g.lineTo(x + 32, h); g.lineTo(x + 16, h); g.fill(); } });
stripeTex.wrapS = THREE.RepeatWrapping; stripeTex.repeat.set(25, 1);
const PORTO_PILLARS = [[-11, -11, 1.75], [11, -11, 1.75], [-11, 11, 1.75], [11, 11, 1.75], [0, -5.5, 0.95], [0, 5.5, 0.95], [-5.5, 0, 0.95], [5.5, 0, 0.95], [-17, 4, 0.95], [17, -4, 0.95]];
{
  const parts = [];
  PORTO_PILLARS.forEach(([x, z, r], i) => {
    if (r > 1) { // caixote de carga reforçado
      const c = [0xb2551f, 0x2a5a8a, 0x3a7a3a, 0x8a2a2a][i];
      parts.push(P(box(2.8, 2.3, 2.8), c, 0, x, 1.15, z));
      for (const k of [-1.05, -0.35, 0.35, 1.05]) { parts.push(P(box(0.12, 2.3, 2.86), c, 0, x + k, 1.15, z, 0, 0, 0, 1, 1, 1)); parts.push(P(box(2.86, 2.3, 0.12), c, 0, x, 1.15, z + k)); }
      parts.push(P(box(2.9, 0.16, 2.9), 0x1d2028, 0, x, 2.32, z), P(box(1.9, 0.07, 1.9), 0x2affd0, 0.55, x, 2.42, z));
      parts.push(P(box(2.9, 0.2, 2.9), 0xe8b02a, 0.35, x, 0.1, z));
    } else { // tambores com aro luminoso
      parts.push(P(cyl(0.72, 0.72, 1.45, 16), 0x2a4a7a, 0, x, 0.73, z), P(cyl(0.75, 0.75, 0.08, 16), 0x1a2030, 0, x, 0.35, z), P(cyl(0.75, 0.75, 0.08, 16), 0x1a2030, 0, x, 1.1, z));
      parts.push(P(cyl(0.6, 0.66, 0.06, 16), 0x3a4048, 0, x, 1.47, z), P(cyl(0.12, 0.12, 0.06, 8), 0x8a8f9a, 0, x + 0.3, 1.5, z), P(cyl(0.735, 0.735, 0.1, 16), 0xffb020, 0.9, x, 1.3, z));
      parts.push(P(cyl(0.38, 0.38, 0.9, 12), 0x8a3a1a, 0, x + 0.82, 0.45, z + 0.3), P(cyl(0.4, 0.4, 0.05, 12), 0x3a2a24, 0, x + 0.82, 0.92, z + 0.3), P(cyl(0.395, 0.395, 0.07, 12), 0x2affd0, 0.9, x + 0.82, 0.78, z + 0.3));
    }
  });
  const m = staticMesh(parts, { roughness: 0.6, metalness: 0.4 }); portoGroup.add(m);
  // cais: pilhas de contêineres, guindastes, cabeços de amarração e água ao norte
  const cont = [], E = ARENA + 1.6;
  const ccol = [0xc23a2a, 0x2a6ac2, 0x3a9a4a, 0xe08a2a, 0x8a8f9a, 0x6a2a8a];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2, r = rand(33, 41), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z < -30) continue;
    const ry = a + Math.PI / 2 + (Math.random() < 0.5 ? 0 : Math.PI / 2), hN = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < hN; k++) { const c = ccol[(i * 3 + k) % ccol.length]; cont.push(P(box(6, 2.5, 2.5), c, 0, x, 1.25 + k * 2.5, z, 0, ry + rand(-0.05, 0.05))); cont.push(P(box(6.04, 0.12, 2.54), 0x1a1d24, 0, x, 2.45 + k * 2.5, z, 0, ry)); }
  }
  for (const cx of [-14, 14]) { // guindastes de pórtico com luz de alerta
    const z = -33;
    for (const lx of [-4, 4]) cont.push(P(box(0.7, 16, 0.7), 0xe8b02a, 0, cx + lx, 8, z - 3), P(box(0.7, 16, 0.7), 0xe8b02a, 0, cx + lx, 8, z + 3));
    cont.push(P(box(9.4, 0.9, 0.9), 0xe8b02a, 0, cx, 16, z - 3), P(box(9.4, 0.9, 0.9), 0xe8b02a, 0, cx, 16, z + 3), P(box(1.2, 1, 22), 0xd8a020, 0, cx, 17.2, z + 3));
    cont.push(P(box(2, 1.6, 2), 0x2a2f3a, 0.2, cx, 15.2, z + 6), P(sph(0.3, 8, 6), 0xff2a1a, 4, cx, 17.9, z + 13.8), P(sph(0.3, 8, 6), 0xff2a1a, 4, cx, 16.6, z - 3.5));
  }
  for (let i = 0; i < 14; i++) { const t = -ARENA + 2 + i * 3.3; cont.push(P(cyl(0.3, 0.4, 0.9, 10), 0x2a2d34, 0, t, 0.45, -(E + 1.2)), P(sph(0.36, 10, 6), 0x2a2d34, 0, t, 0.95, -(E + 1.2))); }
  for (let i = 0; i < 10; i++) { const sx = i % 2 ? 1 : -1, z = -16 + i * 3.6; cont.push(P(cyl(0.6, 0.6, 1.2, 12), [0x2a6ac2, 0xc23a2a, 0x3a9a4a][i % 3], 0, sx * (E + 1.5), 0.6, z), P(cyl(0.62, 0.62, 0.06, 12), 0xffb020, 1.1, sx * (E + 1.5), 1.2, z)); }
  portoGroup.add(staticMesh(cont, { roughness: 0.7, metalness: 0.35 }));
  const stripeMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  for (const [x, z, w, d] of [[0, -19.5, 40, 0.7], [0, 19.5, 40, 0.7], [-19.5, 0, 0.7, 38.6], [19.5, 0, 0.7, 38.6]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w > d ? w : d, 0.7), stripeMat); m.rotation.x = -Math.PI / 2; if (d > w) m.rotation.z = Math.PI / 2; m.position.set(x, 0.015, z); m.receiveShadow = true; portoGroup.add(m);
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(140, 40), std(0x0a2a34, 0.18, 0.6, { emissive: 0x041418, emissiveIntensity: 1 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.03, -(ARENA + 4) - 20); water.receiveShadow = true; portoGroup.add(water);
}
const ARENA_LOOK = {
  cidade: { bg: 0x060914, fog: 0x0a0f24, near: 34, far: 80, hemi: [0x8a9cff, 0x3a2040, 0.95], sun: [0xffe0bf, 1.9], rim: [0x3a7bff, 0.9], neon: 0xff7a1a, mark: [0.15, 0.5, 1.2], rimF: [0.22, 0.45, 1.05] },
  porto: { bg: 0x0d0907, fog: 0x1c120c, near: 28, far: 72, hemi: [0xffc890, 0x203a44, 0.8], sun: [0xffb070, 2.0], rim: [0x22e0c8, 1.1], neon: 0x2affd0, mark: [1.2, 0.6, 0.1], rimF: [0.15, 0.7, 0.62] },
};
function recolor(mesh, hex) { const c = new THREE.Color(hex), a = mesh.geometry.attributes.color; for (let i = 0; i < a.count; i++) a.setXYZ(i, c.r, c.g, c.b); a.needsUpdate = true; }
let arena = 'cidade';
function setArena(id, force) {
  if (!ARENAS[id] || (!arenaUnlocked(id) && !force)) id = 'cidade';
  arena = id; if (meta.arena !== id) { meta.arena = id; saveMeta(); }
  const P2 = id === 'porto';
  PILLARS.length = 0; PILLAR_R.length = 0;
  for (const p of P2 ? PORTO_PILLARS : CITY_PILLARS) { PILLARS.push([p[0], p[1]]); PILLAR_R.push(p[2]); }
  cityGroup.visible = !P2; portoGroup.visible = P2;
  ground.material.map = P2 ? portoTex : groundTex;
  const L = ARENA_LOOK[id];
  scene.background.setHex(L.bg); scene.fog.color.setHex(L.fog); scene.fog.near = L.near; scene.fog.far = L.far;
  hemi.color.setHex(L.hemi[0]); hemi.groundColor.setHex(L.hemi[1]); hemi.intensity = L.hemi[2];
  sun.color.setHex(L.sun[0]); sun.intensity = L.sun[1]; rim.color.setHex(L.rim[0]); rim.intensity = L.rim[1];
  recolor(neonMesh, L.neon); markMat.color.setRGB(...L.mark); rimU.value.setRGB(...L.rimF);
  if (typeof clearDecals === 'function') clearDecals();
}

// ---------------- Herói: Capitão Bala (modelo procedural em js/models.js) ----------------
// pose por articulação: passada (quadril+joelho), torção do tronco, braços segurando a arma com recuo, capa ondulando,
// rolamento da esquiva (giro completo do corpo), recuo ao levar dano e queda para trás na derrota.
function poseHero(m, rc, roll, hit, death) {
  const t = performance.now() * 0.001, ph = player.walk, am = Math.abs(m), dir = m < 0 ? -1 : 1, breath = Math.sin(t * 2.8);
  const sw = Math.sin(ph) * 0.85 * am * dir;
  hero.legL.rotation.set(sw, 0, 0); hero.legR.rotation.set(-sw, 0, 0);
  hero.kneeL.rotation.x = 0.06 + Math.max(0, Math.sin(ph + 1.3 * dir)) * 1.15 * am; hero.kneeR.rotation.x = 0.06 + Math.max(0, Math.sin(ph + Math.PI + 1.3 * dir)) * 1.15 * am;
  hero.body.position.y = 1.0 - 0.04 * am + Math.abs(Math.cos(ph)) * 0.07 * am + breath * 0.008 * (1 - am);
  hero.body.rotation.set(0, 0, 0);
  hero.torso.rotation.set(0.05 * am - rc * 0.06 - hit * 0.5, Math.sin(ph) * 0.13 * am, Math.sin(ph) * 0.03 * am);
  hero.head.rotation.set(breath * 0.02 + hit * 0.25, -hero.torso.rotation.y * 0.8, 0);
  hero.armR.rotation.set(-0.92 + rc * 0.28 + breath * 0.02 + hit * 0.4, 0, -0.34); hero.elR.rotation.set(-0.78 - rc * 0.18, 0, 0);
  hero.armL.rotation.set(-1.12 + rc * 0.22 + breath * 0.02 + hit * 0.4, 0, 0.66); hero.elL.rotation.set(-0.62, 0, 0);
  hero.gun.position.z = 0.58 - rc * 0.16; hero.gun.rotation.x = -rc * 0.12;
  const C = hero.capeSegs;
  C[0].rotation.x = 0.1 + am * 0.22 + Math.sin(t * 3 + ph * 0.5) * 0.04 + hit * 0.3;
  C[1].rotation.x = 0.05 + am * 0.18 + Math.sin(t * 5.2 - 1) * (0.04 + 0.1 * am);
  C[2].rotation.x = 0.04 + am * 0.16 + Math.sin(t * 6.1 - 2.2) * (0.04 + 0.13 * am);
  if (roll > 0) { // rolamento: o corpo dá uma cambalhota e encolhe
    const e = roll * roll * (3 - 2 * roll), tuck = Math.sin(roll * Math.PI);
    hero.body.rotation.x = e * Math.PI * 2; hero.body.position.y = 1.0 - tuck * 0.42;
    hero.legL.rotation.x = hero.legR.rotation.x = -1.3 * tuck; hero.kneeL.rotation.x = hero.kneeR.rotation.x = 1.9 * tuck;
    hero.torso.rotation.x = 0.5 * tuck; hero.head.rotation.x = 0.4 * tuck;
    for (const c of C) c.rotation.x += tuck * 0.6;
  }
  if (death > 0) { // cai de costas, braços abertos
    const e = Math.min(1, death), q = e < 1 ? e * e : 1, bounce = e >= 1 ? 0 : 0;
    hero.body.rotation.x = -q * 1.42; hero.body.position.y = 1.0 - q * 0.72 + bounce;
    hero.legL.rotation.x = -0.25 * q; hero.legR.rotation.x = 0.1 * q; hero.kneeL.rotation.x = 0.35 * q; hero.kneeR.rotation.x = 0.1;
    hero.armR.rotation.set(-0.2 - 0.6 * (1 - q), 0, -1.1 * q); hero.armL.rotation.set(-0.3 - 0.6 * (1 - q), 0, 1.2 * q); hero.elR.rotation.x = hero.elL.rotation.x = -0.3;
    hero.head.rotation.x = -0.3 * q; hero.torso.rotation.set(0, 0, 0);
    for (let i = 0; i < 3; i++) C[i].rotation.x = 1.25 * q * (i === 0 ? 1 : 0.15);
  }
}
const hero = buildHero();
const HERO_S = 0.84; // herói um pouco menor: silhueta legível sem tapar a mira
hero.g.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial) addRim(o.material); });
hero.skin(meta.skin);
scene.add(hero.g);

// ---------------- Inimigos (malhas instanciadas, modelos em js/models.js) ----------------
const enemyMat = instMaterial({}, true, true); addRim(enemyMat);
const enemyDepth = animDepthMaterial();
const TYPES = {
  zombie: { geo: zombieGeo(), max: 70, hp: 30, speed: 2.3, r: 0.55, score: 100, dmg: 12, color: [0.5, 1.6, 0.3], drop: 0.06, walk: 5, goo: 'gosma', nome: 'Zumbi' },
  fast: { geo: fastGeo(), max: 50, hp: 16, speed: 5.4, r: 0.45, score: 150, dmg: 9, color: [0.4, 2, 3], drop: 0.08, walk: 12, goo: 'oleo', nome: 'Corredor' },
  tank: { geo: tankGeo(), max: 24, hp: 130, speed: 1.35, r: 0.95, score: 400, dmg: 18, color: [3, 0.8, 0.3], drop: 0.3, walk: 3.6, goo: 'oleo', nome: 'Blindado' },
  sniper: { geo: sniperGeo(), max: 10, hp: 38, speed: 2.6, r: 0.5, score: 300, dmg: 10, color: [3, 0.3, 0.5], drop: 0.15, walk: 6, goo: 'oleo', nome: 'Atirador' },
  bomba: { geo: bombaGeo(), max: 16, hp: 42, speed: 3.3, r: 0.7, score: 250, dmg: 10, color: [3, 1.6, 0.2], drop: 0.08, walk: 8, goo: 'gosma', nome: 'Zumbi-Bomba' },
  escudo: { geo: guardGeo(), max: 12, hp: 95, speed: 1.75, r: 0.78, score: 450, dmg: 16, color: [0.4, 1.6, 3], drop: 0.2, walk: 4.5, goo: 'oleo', nome: 'Guardião' },
};
for (const k in TYPES) {
  const T = TYPES[k];
  T.mesh = new THREE.InstancedMesh(T.geo, enemyMat, T.max);
  T.flashAttr = new THREE.InstancedBufferAttribute(new Float32Array(T.max), 1);
  T.flashAttr.setUsage(THREE.DynamicDrawUsage);
  T.geo.setAttribute('iFlash', T.flashAttr);
  T.disAttr = new THREE.InstancedBufferAttribute(new Float32Array(T.max), 1); T.disAttr.setUsage(THREE.DynamicDrawUsage);
  T.geo.setAttribute('iDis', T.disAttr);
  T.animAttr = new THREE.InstancedBufferAttribute(new Float32Array(T.max * 4), 4); T.animAttr.setUsage(THREE.DynamicDrawUsage);
  T.geo.setAttribute('iAnim', T.animAttr);
  T.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  T.mesh.castShadow = true; T.mesh.customDepthMaterial = enemyDepth;
  T.mesh.frustumCulled = false;
  T.mesh.count = 0;
  scene.add(T.mesh);
}
const dummy = new THREE.Object3D();
let enemies = [], enemySeq = 0;
const corpses = []; // inimigos abatidos se desfazendo (mesmas malhas instanciadas)

// ---------------- Projéteis ----------------
function bulletPool(geo, color, max) {
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color }), max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.count = 0; scene.add(mesh);
  return { mesh, list: [], max };
}
const pBullets = bulletPool(new THREE.BoxGeometry(0.13, 0.13, 0.8), new THREE.Color(1, 1, 1), 320);
pBullets.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
// rastro dos tiros: 1 plano aditivo com degradê por bala, mesma pool (1 draw call)
const trailMesh = (() => {
  const c = document.createElement('canvas'); c.width = 8; c.height = 64;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.9)'); g.fillStyle = gr; g.fillRect(0, 0, 8, 64);
  const geo = new THREE.PlaneGeometry(0.2, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
  const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), 320);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, new THREE.Color(1, 1, 1)); m.frustumCulled = false; m.count = 0; scene.add(m);
  return m;
})();
const TRAIL_B = new THREE.Color(1.6, 1.0, 0.35), TRAIL_L = new THREE.Color(1.8, 0.6, 0.15);
const eBullets = bulletPool(new THREE.SphereGeometry(0.24, 10, 8), new THREE.Color(2.6, 0.35, 1.7), 260);
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

// ---------------- Armas, granadas, laser, avisos e poderes (tudo em pool) ----------------
const WEAPONS = {
  blaster: { nome: 'BLASTER', icon: '🔹', css: '#2ad4ff', glow: 0x2ad4ff },
  leque: { nome: 'LEQUE', icon: '🔶', css: '#ff6a1f', glow: 0xff5a1f },
  laser: { nome: 'LASER', icon: '🔆', css: '#ff3adf', glow: 0xff3adf },
  granada: { nome: 'GRANADAS', icon: '💣', css: '#7dff3a', glow: 0x7dff3a },
};
const BCOL = { blaster: new THREE.Color(2.8, 1.9, 0.6), leque: new THREE.Color(3.2, 1.1, 0.3) };
// granadas (instanciadas)
const grenades = [];
const grenMesh = new THREE.InstancedMesh(sph(0.24, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 2.6, 0.5) }), 24);
grenMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); grenMesh.frustumCulled = false; grenMesh.count = 0; scene.add(grenMesh);
// laser (um feixe externo + núcleo branco)
const laserGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
const laserBeam = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.35, 2.4), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
const laserCore = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 3), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
for (const m of [laserBeam, laserCore]) { m.visible = false; m.frustumCulled = false; scene.add(m); }
// explosões em fila (Abate Explosivo) — processadas aos poucos, sem recursão
const blasts = [];
// avisos de ataque do chefe (círculos e faixas no chão)
const teleRingGeo = new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
const teleDiscGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
const teleLineGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateX(Math.PI / 2);
// cor <= 1 e sem tone mapping: fica abaixo do limiar do bloom (1,05) e não 'estoura' para branco/laranja
const teleMat = () => new THREE.MeshBasicMaterial({ color: 0xff1a10, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const TELE_RED = [1, 0.06, 0.04], TELE_GREEN = [0.25, 1, 0.35];
const TELE = [];
for (let i = 0; i < 10; i++) {
  const T = { ring: new THREE.Mesh(teleRingGeo, teleMat()), disc: new THREE.Mesh(teleDiscGeo, teleMat()), lineBg: new THREE.Mesh(teleLineGeo, teleMat()), lineFill: new THREE.Mesh(teleLineGeo, teleMat()), on: false, kind: 'circle', t: 0, dur: 1, x: 0, z: 0, r: 1, ang: 0, len: 1, w: 1, hurt: true };
  for (const m of [T.ring, T.disc, T.lineBg, T.lineFill]) { m.visible = false; m.position.y = 0.06; m.renderOrder = 2; scene.add(m); }
  TELE.push(T);
}
let teleI = 0;
function teleGet(kind, dur, col) {
  const T = TELE[teleI]; teleI = (teleI + 1) % TELE.length;
  T.on = true; T.kind = kind; T.t = 0; T.dur = dur; T.hurt = true;
  const mx = Math.max(1, col[0], col[1], col[2]);
  for (const m of [T.ring, T.disc, T.lineBg, T.lineFill]) { m.material.color.setRGB(col[0] / mx, col[1] / mx, col[2] / mx); m.visible = false; }
  return T;
}
function teleCircle(x, z, r, dur, col = TELE_RED) { const T = teleGet('circle', dur, col); T.x = x; T.z = z; T.r = r; T.ring.visible = T.disc.visible = true; return T; }
function teleLine(x, z, ang, len, w, dur, col = TELE_RED) { const T = teleGet('line', dur, col); T.x = x; T.z = z; T.ang = ang; T.len = len; T.w = w; T.lineBg.visible = T.lineFill.visible = true; return T; }
function hideTele(T) { T.on = false; for (const m of [T.ring, T.disc, T.lineBg, T.lineFill]) m.visible = false; }
function updateTele(dt) {
  for (const T of TELE) {
    if (!T.on) continue;
    T.t += dt;
    if (T.t >= T.dur) { hideTele(T); continue; }
    const k = T.t / T.dur, pulse = 0.5 + 0.5 * Math.sin(T.t * (k > 0.7 ? 46 : 22)); // pisca mais rápido perto do golpe
    if (T.kind === 'circle') {
      T.ring.position.set(T.x, 0.07, T.z); T.ring.scale.setScalar(T.r); T.ring.material.opacity = 0.7 + 0.3 * pulse;
      T.disc.position.set(T.x, 0.06, T.z); T.disc.scale.setScalar(Math.max(0.05, T.r * k)); T.disc.material.opacity = 0.3 + 0.35 * k;
    } else {
      for (const m of [T.lineBg, T.lineFill]) { m.position.set(T.x, 0.06, T.z); m.rotation.y = T.ang; }
      T.lineBg.scale.set(T.w, 1, T.len); T.lineBg.material.opacity = 0.22 + 0.2 * pulse;
      T.lineFill.scale.set(T.w * 0.8, 1, Math.max(0.05, T.len * k)); T.lineFill.material.opacity = 0.45 + 0.35 * k;
    }
  }
}
function hideAllTele() { for (const T of TELE) hideTele(T); }

// ---- poderes (cartas entre ondas) ----
const RAR = { comum: { nome: 'COMUM', peso: 60 }, raro: { nome: 'RARO', peso: 28 }, epico: { nome: 'ÉPICO', peso: 12 }, arma: { nome: 'ARMA NOVA', peso: 10 } };
const num = (v) => String(v).replace('.', ',');
const UPGRADES = [
  { id: 'dano', nome: 'Dano+', icon: '💪', rar: 'comum', max: 6, desc: (l) => `+20% de dano em todas as armas (total +${l * 20}%)` },
  { id: 'cadencia', nome: 'Cadência+', icon: '⚡', rar: 'comum', max: 5, desc: (l) => `Atira ${l * 15}% mais rápido` },
  { id: 'veloc', nome: 'Botas Turbo', icon: '👟', rar: 'comum', max: 4, desc: (l) => `+${l * 10}% de velocidade de corrida` },
  { id: 'vidamax', nome: 'Vida Máx+', icon: '❤️', rar: 'comum', max: 5, desc: () => '+25 de vida máxima e cura 25', apply: () => { player.maxHp += 25; heal(25); } },
  { id: 'cura', nome: 'Kit Médico', icon: '🩹', rar: 'comum', max: 99, hide: true, cond: () => player.hp < player.maxHp * 0.8, desc: () => 'Cura 50% da vida agora', apply: () => heal(player.maxHp * 0.5) },
  { id: 'critico', nome: 'Olho de Águia', icon: '🎯', rar: 'comum', max: 4, desc: (l) => `Chance de crítico (dano x2): ${10 + l * 8}%` },
  { id: 'esquiva', nome: 'Esquiva Rápida', icon: '💨', rar: 'comum', max: 3, desc: (l) => `Recarga da ESQUIVA ${l * 20}% menor` },
  { id: 'ima', nome: 'Ímã', icon: '🧲', rar: 'comum', max: 3, desc: (l) => `Puxa itens de até ${num((1.4 + l * 2.5).toFixed(1))} m` },
  { id: 'multi', nome: 'Tiro Múltiplo', icon: '🔱', rar: 'raro', max: 3, desc: (l) => `+${l} projétil por disparo (laser: feixe mais largo e forte)` },
  { id: 'perfura', nome: 'Perfuração', icon: '🗡️', rar: 'raro', max: 3, desc: (l) => `Tiros atravessam ${l} inimigo${l > 1 ? 's' : ''}` },
  { id: 'ricochete', nome: 'Ricochete', icon: '🔁', rar: 'raro', max: 2, desc: (l) => `Tiros quicam ${l}x em muros e pilares` },
  { id: 'vampiro', nome: 'Recarga Vital', icon: '💚', rar: 'raro', max: 3, desc: (l) => `A cada 10 abates, cura ${l * 4} de vida` },
  { id: 'escudo', nome: 'Escudo Regenerativo', icon: '🛡️', rar: 'epico', max: 3, desc: (l) => `Bloqueia 1 golpe; recarrega em ${15 - l * 3} s` },
  { id: 'explosao', nome: 'Abate Explosivo', icon: '💥', rar: 'epico', max: 3, desc: (l) => `Inimigos explodem ao morrer e ferem os vizinhos (raio ${num((2 + l * 0.5).toFixed(1))} m)` },
  { id: 'w_leque', nome: 'Espingarda LEQUE', icon: '🔶', rar: 'arma', max: 1, hide: true, cond: () => player.weapon !== 'leque', desc: () => 'Rajada larga de 7 chumbos que empurra forte. Ótima de perto.', apply: () => setWeapon('leque') },
  { id: 'w_laser', nome: 'LASER Contínuo', icon: '🔆', rar: 'arma', max: 1, hide: true, cond: () => player.weapon !== 'laser', desc: () => 'Feixe contínuo que atravessa todos os inimigos da linha.', apply: () => setWeapon('laser') },
  { id: 'w_granada', nome: 'Lança-GRANADAS', icon: '💣', rar: 'arma', max: 1, hide: true, cond: () => player.weapon !== 'granada', desc: () => 'Granadas em arco que explodem em área. Passam por cima dos pilares.', apply: () => setWeapon('granada') },
];
const UPG_BY = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
const up = {};
const stats = { dmg: 1, rate: 1, speed: 1, crit: 0.1, multi: 0, pierce: 0, bounce: 0, magnet: 1.4, dashCd: 1, shieldCd: 0, blast: 0, vamp: 0 };
const L = (id) => up[id] || 0;
function recalcStats() {
  stats.dmg = 1 + 0.2 * L('dano'); stats.rate = 1 + 0.15 * L('cadencia'); stats.speed = 1 + 0.1 * L('veloc');
  stats.crit = 0.1 + 0.08 * L('critico'); stats.multi = L('multi'); stats.pierce = L('perfura'); stats.bounce = L('ricochete');
  stats.magnet = 1.4 + 2.5 * L('ima'); stats.dashCd = 1 - 0.2 * L('esquiva'); stats.blast = L('explosao'); stats.vamp = L('vampiro');
  stats.dmg *= 1 + 0.05 * lvl('dano'); stats.magnet += 0.6 * lvl('ima'); stats.dashCd *= 1 - 0.06 * lvl('esquiva');
  const sh = L('escudo'); const was = stats.shieldCd; stats.shieldCd = sh ? 15 - sh * 3 : 0;
  if (sh && !was) { player.shieldOn = true; player.shieldT = 0; }
}
function resetRun() {
  for (const k in up) delete up[k];
  recalcStats(); player.shieldOn = lvl('escudo') > 0; player.shieldT = 0; player.vampN = 0; player.maxHp = 100 + 10 * lvl('vida'); player.hp = player.maxHp;
  runWeapons.clear(); runWeapons.add('blaster'); runHit = false; runBombs = 0;
  setWeapon('blaster', true); runPicks.length = 0;
}
const runPicks = [];
const runWeapons = new Set(); let runHit = false, runBombs = 0;
function heal(v) {
  const h = Math.min(v, player.maxHp - player.hp); if (h <= 0) return;
  player.hp += h; dmgNum(player.x, 2.8, player.z, '+' + Math.round(h), 'heal');
}
function setWeapon(w, silent) {
  player.weapon = w; if (!demo) { runWeapons.add(w); if (runWeapons.size >= 4) unlockAch('armas4'); } hero.gunGlow.emissive.setHex(WEAPONS[w].glow); player.fireT = 0.15;
  if (w !== 'laser') stopLaser();
  if (!silent) { sfx.weapon(); dmgNum(player.x, 3, player.z, WEAPONS[w].nome + '!', 'big'); vibrate([20, 30, 20]); hud.pw = '#'; weaponToast(w); }
}
function ownedHtml(withNames) {
  let h = '';
  for (const u of UPGRADES) { if (u.hide || !L(u.id)) continue; if (!withNames && u.id === 'escudo') { h += `<span class="ui sh ${player.shieldOn ? 'on' : ''}">${u.icon}<b>${L(u.id)}</b></span>`; continue; } h += withNames ? `<div class="own"><span>${u.icon}</span>${u.nome} <b>${L(u.id)}/${u.max}</b></div>` : `<span class="ui">${u.icon}<b>${L(u.id)}</b></span>`; }
  return h;
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
const ringGeo = new THREE.RingGeometry(0.8, 1, 40); // uma geometria para todas as ondas de choque
for (let i = 0; i < 10; i++) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
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

// ---------------- Manchas no chão: gosma verde, óleo e marca de queimado (sem sangue) — pool instanciado ----------------
const splatTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const blob = (x, y, r, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.7, `rgba(255,255,255,${a * 0.9})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  blob(64, 64, 34, 0.95);
  for (let i = 0; i < 9; i++) { const a = Math.random() * 6.28, d = 18 + Math.random() * 16; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 10 + Math.random() * 12, 0.85); }
  for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, d = 40 + Math.random() * 20; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + Math.random() * 4, 0.9); }
  const t = new THREE.CanvasTexture(c); return t;
})();
const DECAL_MAX = 48, DECAL_CAP = [16, 32, 48];
const decalMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: splatTex, transparent: true, depthWrite: false, roughness: 0.3, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), DECAL_MAX);
decalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); decalMesh.setColorAt(0, new THREE.Color()); decalMesh.frustumCulled = false; decalMesh.count = 0; decalMesh.receiveShadow = true; decalMesh.renderOrder = 1;
scene.add(decalMesh);
const DECAL_COL = { gosma: new THREE.Color(0.3, 0.95, 0.12), oleo: new THREE.Color(0.05, 0.05, 0.08), queimado: new THREE.Color(0.025, 0.02, 0.018) };
const decals = []; let decalI = 0;
for (let i = 0; i < DECAL_MAX; i++) decals.push({ on: false, x: 0, z: 0, s: 1, r: 0, kind: 'oleo', t: 0 });
function splat(x, z, kind, s) {
  const D = decals[decalI % DECAL_CAP[tierIdx]]; decalI++;
  D.on = true; D.x = x; D.z = z; D.s = s; D.r = Math.random() * 6.28; D.kind = DECAL_COL[kind] ? kind : 'oleo'; D.t = 0;
}
function clearDecals() { for (const D of decals) D.on = false; decalMesh.count = 0; }
function updateDecals(dt) {
  let n = 0;
  for (let i = 0; i < DECAL_MAX; i++) {
    const D = decals[i]; if (!D.on) continue;
    D.t += dt; if (D.t > 14) { D.on = false; continue; }
    const k = Math.min(1, D.t / 0.12) * (D.t > 12 ? (14 - D.t) / 2 : 1), sc = D.s * (0.6 + 0.4 * k);
    dummy.position.set(D.x, 0.025 + (i % 8) * 0.002, D.z); dummy.rotation.set(0, D.r, 0); dummy.scale.set(sc, 1, sc); dummy.updateMatrix();
    decalMesh.setMatrixAt(n, dummy.matrix); decalMesh.setColorAt(n, DECAL_COL[D.kind]); n++;
  }
  decalMesh.count = n; decalMesh.instanceMatrix.needsUpdate = true; if (decalMesh.instanceColor) decalMesh.instanceColor.needsUpdate = true;
}

// ---------------- Sombras de contato (blob) — 1 draw call para todos os inimigos e o chefe ----------------
const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,.65)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const BLOB_MAX = 200;
const blobMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), BLOB_MAX);
blobMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); blobMesh.frustumCulled = false; blobMesh.count = 0; blobMesh.renderOrder = 1; scene.add(blobMesh);
function updateBlobs() {
  const low = !sun.castShadow; blobMesh.material.opacity = low ? 0.6 : 0.32; // sem sombra real: blob mais forte
  let n = 0;
  for (const e of enemies) { if (n >= BLOB_MAX) break; const s = e.r * 2.5 * (e.spawn > 0 ? 1 - e.spawn / 0.55 : 1); dummy.position.set(e.x, 0.035, e.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(s, 1, s); dummy.updateMatrix(); blobMesh.setMatrixAt(n++, dummy.matrix); }
  if (boss && boss.enter <= 0 && n < BLOB_MAX) { const s = boss.r * 2.4 / (1 + (boss.y || 0) * 0.12); dummy.position.set(boss.x, 0.035, boss.z); dummy.scale.set(s, 1, s); dummy.updateMatrix(); blobMesh.setMatrixAt(n++, dummy.matrix); }
  blobMesh.count = n; blobMesh.instanceMatrix.needsUpdate = true;
}

// ---------------- Itens (power-ups) ----------------
const PW = {
  shotgun: { color: 0xff8a1f, label: 'ESPINGARDA', css: '#ff8a1f', dur: 12, rgb: [3, 1.4, 0.3] },
  rapid: { color: 0x2ad4ff, label: 'TIRO RÁPIDO', css: '#2ad4ff', dur: 11, rgb: [0.4, 2.2, 3.2] },
  health: { color: 0x38e07b, label: 'VIDA +35', css: '#38e07b', dur: 0, rgb: [0.5, 3, 1] },
  w_leque: { color: 0xff5a1f, label: 'ARMA: LEQUE', css: '#ff5a1f', dur: 0, rgb: [3, 0.9, 0.2], weapon: 'leque' },
  w_laser: { color: 0xff3adf, label: 'ARMA: LASER', css: '#ff3adf', dur: 0, rgb: [3, 0.4, 2.6], weapon: 'laser' },
  w_granada: { color: 0x7dff3a, label: 'ARMA: GRANADAS', css: '#7dff3a', dur: 0, rgb: [0.8, 3, 0.4], weapon: 'granada' },
};
// geometrias/materiais compartilhados (sem vazamento a cada item)
const ITEM_GEO = {
  bar1: box(0.7, 0.24, 0.24), bar2: box(0.24, 0.7, 0.24), shell: cyl(0.1, 0.1, 0.5, 10), cap: cyl(0.11, 0.11, 0.12, 10),
  oct: new THREE.OctahedronGeometry(0.38), ball: sph(0.3, 14, 10), band: cyl(0.31, 0.31, 0.08, 14), ring: new THREE.TorusGeometry(0.7, 0.06, 8, 32), beam: cyl(0.55, 0.7, 3, 16).translate(0, 1.5, 0),
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
  } else if (kind === 'w_leque') {
    for (let i = -2; i <= 2; i++) { const s = new THREE.Mesh(ITEM_GEO.shell, mat); s.position.x = i * 0.16; s.rotation.z = -i * 0.28; icon.add(s); }
  } else if (kind === 'w_laser') {
    const o = new THREE.Mesh(ITEM_GEO.oct, mat); o.scale.set(0.55, 2.0, 0.55); icon.add(o);
    const o2 = new THREE.Mesh(ITEM_GEO.oct, mat); o2.scale.set(1.1, 0.3, 1.1); icon.add(o2);
  } else if (kind === 'w_granada') {
    icon.add(new THREE.Mesh(ITEM_GEO.ball, mat)); const b = new THREE.Mesh(ITEM_GEO.band, ITEM_CAP_MAT); icon.add(b);
  } else {
    const o = new THREE.Mesh(ITEM_GEO.oct, mat); o.scale.y = 1.4; icon.add(o);
  }
  if (kind.startsWith('w_')) icon.scale.setScalar(1.25);
  icon.children.forEach((c) => (c.castShadow = true));
  const ringM = new THREE.Mesh(ITEM_GEO.ring, M.ring);
  ringM.rotation.x = Math.PI / 2; ringM.position.y = 0.08; g.add(ringM);
  g.add(new THREE.Mesh(ITEM_GEO.beam, M.beam));
  return { g, icon };
}
let items = [];
function dropItem(x, z, kind) {
  if (items.length >= 6) return;
  if (!kind) {
    if (wave >= 2 && Math.random() < 0.08) kind = randomWeaponItem(); // arma rara
    else kind = player.hp < player.maxHp * 0.5 && Math.random() < 0.45 ? 'health' : ['shotgun', 'rapid', 'health', 'shotgun', 'rapid'][Math.floor(Math.random() * 5)];
  }
  const it = buildItem(kind);
  it.g.position.set(clamp(x, -ARENA + 1, ARENA - 1), 0, clamp(z, -ARENA + 1, ARENA - 1));
  scene.add(it.g);
  items.push({ ...it, kind, life: kind.startsWith('w_') ? 11 : 14, t: 0 });
}
function randomWeaponItem() {
  const ks = ['w_leque', 'w_laser', 'w_granada'].filter((k) => PW[k].weapon !== player.weapon);
  return ks[Math.floor(Math.random() * ks.length)];
}

// ---------------- Chefe ----------------
// cada chefe tem um repertório próprio de ataques (todos com aviso visual antes)
const BOSS_TYPES = [
  { nome: 'TRITURADOR', ordem: ['charge', 'radial', 'summon', 'charge', 'aimed'], core: 0xff3a10, red: 0x8a1010, escala: 1.0 },
  { nome: 'COLOSSO DE AÇO', ordem: ['slam', 'radial', 'aimed', 'slam', 'summon'], core: 0xffa020, red: 0x7a4a10, escala: 1.15 },
  { nome: 'REI DOS ZUMBIS-ROBÔ', ordem: ['summon', 'spiral', 'charge', 'summon', 'slam'], core: 0x7dff3a, red: 0x2a6a10, escala: 1.05 },
  { nome: 'MEGA-DESTRUIDOR', ordem: ['spiral', 'slam', 'aimed', 'charge', 'radial'], core: 0xc040ff, red: 0x501090, escala: 1.2 },
  { nome: 'O IMPLACÁVEL', ordem: ['slam', 'spiral', 'charge', 'radial', 'summon', 'aimed'], core: 0xffffff, red: 0x5a6478, escala: 1.25 },
];
const BOSS_NAMES = BOSS_TYPES.map((t) => t.nome);
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
  // fase 2: chifres, espinhos nos ombros e um anel de energia girando na cintura
  const furyMat = std(0x300800, 0.3, 0.3, { emissive: 0xff5a10, emissiveIntensity: 3.2 });
  const fury = new THREE.Group(); fury.visible = false; g.add(fury);
  for (const sx of [-1, 1]) {
    const h = add(new THREE.ConeGeometry(0.22, 1.1, 6), furyMat, sx * 0.62, 5.0, 0.05, fury); h.rotation.z = -sx * 0.5;
    for (let k = 0; k < 3; k++) { const sp = add(new THREE.ConeGeometry(0.16, 0.7, 5), furyMat, sx * (2.0 + k * 0.05), 3.85 + k * 0.05, -0.35 + k * 0.35, fury); sp.rotation.z = -sx * 0.9; }
  }
  const ring = add(new THREE.TorusGeometry(2.3, 0.09, 6, 40), furyMat, 0, 2.2, 0, fury); ring.rotation.x = Math.PI / 2;
  return { g, core: coreM, armL, armR, mats, red, coreMat: core, eye, fury, ring, furyMat };
}
const bossModel = buildBoss(); // um único modelo reaproveitado (sem vazamento)
bossModel.g.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial) addRim(o.material); });
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
const player = { weapon: 'blaster', shieldOn: false, shieldT: 0, laserOn: false, laserTick: 0, vampN: 0, x: 0, z: 0, hp: 100, maxHp: 100, inv: 0, face: 0, dashT: 0, dashCd: 0, ddx: 0, ddz: 1, fireT: 0, shotgun: 0, rapid: 0, walk: 0, flashT: 0, mvx: 0, mvz: 0, shots: 0, aiming: false, recoil: 0, leanF: 0, leanS: 0 };
let state = 'title', demo = true;
let score = 0, wave = 0, kills = 0, combo = 0, comboT = 0, maxCombo = 0;
let best = 0;
try { best = +localStorage.getItem('cb-recorde') || 0; } catch (_) {}
let spawnQueue = [], spawnT = 0, waveState = 'fight', interT = 0, waveScale = { hp: 1, sp: 1, dmg: 1 }, cardsPending = false, waveTime = 0, waveTaken = 0;
let shake = 0, hitstop = 0, slowT = 0, slowK = 0.35, dyingT = 0, demoT = 0, titleAng = 0;
let shakeMul = +LS.get('cb-tremor', '1'); if (!(shakeMul >= 0 && shakeMul <= 1)) shakeMul = 1;
const camKick = new THREE.Vector3(); // empurrão direcional da câmera (recuo, golpes)
function addShake(v) { shake = Math.min(1, shake + v * shakeMul); }
function kickCam(dx, dz, v) { const l = Math.hypot(dx, dz) || 1; camKick.x += (dx / l) * v * shakeMul; camKick.z += (dz / l) * v * shakeMul; }
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
  if (state === 'upgrade') { cardKey(e); return; }
  if ((e.code === 'KeyE' || e.code === 'KeyF') && state === 'playing') swapWeapon();
  if (e.code === 'KeyP' || e.code === 'Escape') { if (state === 'playing') pauseGame(); else if (state === 'paused') resumeGame(); }
  if (e.code === 'Enter' && state === 'title' && !$('tela-titulo').hidden) startGame();
  if (e.code === 'Escape' && !$('tela-tutorial').hidden) closeTutorial();
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
  dashesUsed++; player.dashT = 0.2; player.rollT = 0.34; player.dashCd = stats.dashCd; sfx.dash(); vibrate(15);
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
    let d = (e.x - player.x) ** 2 + (e.z - player.z) ** 2;
    // mira automática esperta: evita gastar tiro no escudo do Guardião e prioriza o Zumbi-Bomba que chega perto
    if (e.type === 'escudo' && shieldBlocks(e, e.x - player.x, e.z - player.z)) d = d * 1.8 + 30;
    else if (e.type === 'bomba' && d < 49) d *= 0.4;
    if (d < bd && losClear(player.x, player.z, e.x, e.z)) { bd = d; bx = e.x; bz = e.z; found = true; }
  }
  if (boss && boss.enter <= 0) {
    const d = (boss.x - player.x) ** 2 + (boss.z - player.z) ** 2 - 4;
    if (d < bd && losClear(player.x, player.z, boss.x, boss.z)) { bd = d; bx = boss.x; bz = boss.z; found = true; }
  }
  return found ? [bx - player.x, bz - player.z] : null;
}
const _tip = new THREE.Vector3();
const FLASH_COL = { blaster: [6, 3.6, 1.2], leque: [6, 2.4, 0.6], granada: [2.2, 5, 1], laser: [5, 1, 4.4] };
function fire(dx, dz) {
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  hero.tip.getWorldPosition(_tip);
  const ang = Math.atan2(dx, dz), W = player.weapon;
  const extra = stats.multi + (player.shotgun > 0 ? 2 : 0);
  let rate = 0.155, flashS = rand(0.8, 1.1), kick = 0.025, big = false;
  if (W === 'granada') {
    const n = 1 + Math.min(3, extra);
    const t = nearestTarget(16);
    const dist = t ? clamp(Math.hypot(t[0], t[1]), 3.5, 14) : 9;
    for (let i = 0; i < n; i++) {
      if (grenades.length >= 24) break;
      const a = ang + (n > 1 ? (i / (n - 1) - 0.5) * 0.55 : 0), d = dist * (n > 1 ? rand(0.85, 1.1) : 1);
      const tx = clamp(player.x + Math.sin(a) * d, -ARENA + 0.5, ARENA - 0.5), tz = clamp(player.z + Math.cos(a) * d, -ARENA + 0.5, ARENA - 0.5);
      grenades.push({ x0: _tip.x, z0: _tip.z, x1: tx, z1: tz, t: 0, dur: 0.38 + d * 0.03, x: _tip.x, y: 1.3, z: _tip.z, h: 1.6 + d * 0.22 });
    }
    rate = 0.62; flashS = 1.3; kick = 0.06; big = true;
    if (!demo) sfx.lob();
  } else {
    const leque = W === 'leque';
    const n = leque ? 7 + extra * 2 : 1 + extra;
    const spread = leque ? 0.62 + extra * 0.06 : n > 1 ? 0.11 * (n - 1) : 0;
    for (let i = 0; i < n; i++) {
      if (pBullets.list.length >= pBullets.max) break;
      const a = ang + (n > 1 ? (i / (n - 1) - 0.5) * spread : rand(-0.04, 0.04)) + (leque ? rand(-0.04, 0.04) : 0);
      const sp = leque ? rand(26, 33) : 34;
      pBullets.list.push({ d: 0, x: _tip.x, z: _tip.z, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, life: leque ? 0.36 : 0.75, dmg: (leque ? 8 : 10) * stats.dmg, kind: leque ? 'leque' : 'blaster', pierce: stats.pierce, bounce: stats.bounce, hit: -1, kb: leque ? 2.2 : 1 });
    }
    if (leque) { rate = 0.46; flashS = 1.6; kick = 0.1; big = true; } else if (n > 1) flashS = 1.2;
    if (!demo) { if (leque) sfx.leque(); else sfx.shot(n > 2); } else if (Math.random() < 0.3) sfx.shot(false);
  }
  player.fireT = (rate / stats.rate) * (player.rapid > 0 ? 0.5 : 1);
  player.shots++;
  hero.flash.visible = true; hero.flash.rotation.z = Math.random() * 6; hero.flash.scale.set(flashS * rand(0.85, 1.15), flashS * rand(0.85, 1.15), flashS * rand(0.8, 1.3));
  hero.star.rotation.z = Math.random() * 1.6; hero.star.scale.setScalar(rand(0.7, 1.2));
  const FC = FLASH_COL[W] || FLASH_COL.blaster; hero.flashMat.color.setRGB(FC[0], FC[1], FC[2]);
  player.recoil = Math.min(1.4, player.recoil + (W === 'leque' ? 1 : W === 'granada' ? 0.8 : 0.45));
  if (!demo) kickCam(-dx, -dz, W === 'leque' ? 0.22 : W === 'granada' ? 0.16 : 0.05);
  player.flashTimer = 0.05;
  muzzleLight.position.copy(_tip); muzzleLight.color.setHex(0xffb347); muzzleLight.intensity = big ? 70 : 40;
  for (let k = 0; k < 3; k++) emit(_tip.x, _tip.y, _tip.z, dx * rand(4, 9) + rand(-1.5, 1.5), rand(0, 2), dz * rand(4, 9) + rand(-1.5, 1.5), [4, 2.4, 0.6], 0.12, 0.25, 0.05, 0, 4);
  if (player.shots % 2 === 0 && W !== 'granada') { if (debris.length < ND) debris.push({ x: _tip.x - dx * 0.5, y: 1.3, z: _tip.z - dz * 0.5, vx: dz * 3 + rand(-1, 1), vy: rand(3, 5), vz: -dx * 3 + rand(-1, 1), rx: 0, ry: 0, sx: rand(-20, 20), sy: rand(-20, 20), life: 0.9, size: 0.07, color: 0xffc23a }); }
  addShake(kick);
}
// ---- laser contínuo ----
function stopLaser() { player.laserOn = false; laserBeam.visible = laserCore.visible = false; laserSfx(false); }
function updateLaser(dt, on) {
  if (!on || state !== 'playing') { if (player.laserOn) stopLaser(); return; }
  if (!player.laserOn) { player.laserOn = true; laserSfx(true); }
  hero.tip.getWorldPosition(_tip);
  const dx = Math.sin(player.face), dz = Math.cos(player.face);
  const extra = stats.multi + (player.shotgun > 0 ? 2 : 0);
  let len = 15;
  for (let k = 0; k < PILLARS.length; k++) { // para no primeiro pilar
    const cx = PILLARS[k][0] - _tip.x, cz = PILLARS[k][1] - _tip.z, t = cx * dx + cz * dz;
    if (t <= 0 || t > len + 2) continue;
    const p2 = cx * cx + cz * cz - t * t, r = PILLAR_R[k] * 0.9;
    if (p2 < r * r) len = Math.min(len, t - Math.sqrt(r * r - p2));
  }
  const wallT = Math.min(dx > 0.001 ? (ARENA - _tip.x) / dx : dx < -0.001 ? (-ARENA - _tip.x) / dx : 99, dz > 0.001 ? (ARENA - _tip.z) / dz : dz < -0.001 ? (-ARENA - _tip.z) / dz : 99);
  len = Math.max(0.3, Math.min(len, wallT));
  const w = 0.3 * (1 + 0.3 * extra), fl = 1 + Math.sin(performance.now() * 0.05) * 0.12;
  laserBeam.visible = laserCore.visible = true;
  laserBeam.position.set(_tip.x, 1.3, _tip.z); laserBeam.rotation.set(0, player.face, 0); laserBeam.scale.set(w * 1.6 * fl, w * fl, len);
  laserCore.position.copy(laserBeam.position); laserCore.rotation.copy(laserBeam.rotation); laserCore.scale.set(w * 0.45, w * 0.45, len);
  muzzleLight.position.copy(_tip); muzzleLight.color.setHex(0xff3adf); hero.flashMat.color.setRGB(5, 1, 4.4); hero.star.rotation.z += 0.3; hero.flash.scale.setScalar(0.7 + Math.random() * 0.3); muzzleLight.intensity = 30 + Math.random() * 15;
  player.laserTick -= dt;
  if (player.laserTick <= 0) {
    player.laserTick = (0.07 / stats.rate) * (player.rapid > 0 ? 0.6 : 1);
    const dmg = 6 * stats.dmg * (1 + 0.25 * extra);
    for (const e of enemies) {
      if (e.dead || e.spawn > 0) continue;
      const rx = e.x - _tip.x, rz = e.z - _tip.z, t = rx * dx + rz * dz;
      if (t < -0.3 || t > len + e.r) continue;
      const px = rx - dx * t, pz = rz - dz * t;
      if (px * px + pz * pz < (e.r + w) ** 2) { if (shieldBlocks(e, dx, dz)) { if (Math.random() < 0.3) burst(e.x, 1.3, e.z, 2, [0.5, 2, 3.5], 5, 0.15, 0.2); continue; } e.back = isBehind(e, dx, dz); damageEnemy(e, dmg, dx, dz, 0.35, true); }
    }
    if (boss && boss.enter <= 0) {
      const rx = boss.x - _tip.x, rz = boss.z - _tip.z, t = rx * dx + rz * dz;
      if (t > 0 && t < len + boss.r) { const px = rx - dx * t, pz = rz - dz * t; if (px * px + pz * pz < (boss.r + w) ** 2) damageBoss(dmg * 0.9, true); }
    }
    const ex = _tip.x + dx * len, ez = _tip.z + dz * len;
    for (let k = 0; k < 2; k++) emit(ex, 1.3, ez, rand(-3, 3), rand(1, 4), rand(-3, 3), [3, 0.5, 2.6], 0.25, 0.35, 0.05, -6, 2);
  }
  addShake(dt * 0.25);
}
// ---- granadas ----
function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.t += dt; const k = Math.min(1, g.t / g.dur);
    g.x = g.x0 + (g.x1 - g.x0) * k; g.z = g.z0 + (g.z1 - g.z0) * k;
    g.y = 1.3 * (1 - k) + 0.25 * k + Math.sin(k * Math.PI) * g.h;
    if (Math.random() < 0.6) emit(g.x, g.y, g.z, rand(-0.5, 0.5), rand(0, 1), rand(-0.5, 0.5), [1.2, 3, 0.5], 0.3, 0.25, 0.05, 0, 2);
    if (k >= 1) { explodeGrenade(g.x, g.z); grenades[i] = grenades[grenades.length - 1]; grenades.pop(); }
  }
  grenMesh.count = grenades.length;
  for (let i = 0; i < grenades.length; i++) { const g = grenades[i]; dummy.position.set(g.x, g.y, g.z); dummy.rotation.set(g.t * 9, g.t * 7, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); grenMesh.setMatrixAt(i, dummy.matrix); }
  grenMesh.instanceMatrix.needsUpdate = true;
}
function explodeGrenade(x, z) {
  const R = 3.2 + 0.25 * stats.multi, dmg = 46 * stats.dmg;
  for (const e of enemies) {
    if (e.dead || e.spawn > 0) continue;
    const d = Math.hypot(e.x - x, e.z - z);
    if (d < R + e.r) damageEnemy(e, dmg * (1 - 0.4 * Math.min(1, d / R)), e.x - x, e.z - z, 1.8);
  }
  if (boss && boss.enter <= 0 && Math.hypot(boss.x - x, boss.z - z) < R + boss.r) damageBoss(dmg * 0.8);
  burst(x, 0.8, z, 34, [1.6, 3.2, 0.5], 10, 0.55, 0.6, -6);
  burst(x, 0.8, z, 16, [4, 2.6, 0.8], 13, 0.3, 0.4, -3);
  shock(x, z, R, [1.2, 3, 0.4], 0.45);
  addDebris(x, 0.5, z, 0x3a4a2a, 6, 7, 0.16);
  boomLight.position.set(x, 2, z); boomI = Math.max(boomI, 220);
  addShake(0.3);
  if (!demo) sfx.grenade();
}
function processBlasts() {
  let n = 0;
  while (blasts.length && n < 10) {
    const B = blasts.shift(); n++;
    shock(B.x, B.z, B.r, [3, 1.2, 0.3], 0.35); burst(B.x, 1, B.z, 14, [3.5, 1.6, 0.4], 7, 0.35, 0.4, -4);
    for (const e of enemies) { if (e.dead || e.spawn > 0) continue; const d = Math.hypot(e.x - B.x, e.z - B.z); if (d < B.r + e.r) damageEnemy(e, B.dmg, e.x - B.x, e.z - B.z, 1.2, true); }
    if (boss && boss.enter <= 0 && Math.hypot(boss.x - B.x, boss.z - B.z) < B.r + boss.r) damageBoss(B.dmg * 0.5, true);
    if (n === 1) sfx.blast();
  }
}
let lastHitSfx = 0;
const runKillsT = {};
function damageEnemy(e, dmg, dx, dz, kbMul = 1, quiet = false) {
  const crit = Math.random() < stats.crit;
  if (crit) dmg *= 2;
  e.hp -= dmg; e.flash = 1;
  { // faísca de impacto: clarão curto no ponto do golpe + estilhaços rápidos refletidos
    const l0 = Math.hypot(dx, dz) || 1, ix = e.x - (dx / l0) * e.r * 0.8, iz = e.z - (dz / l0) * e.r * 0.8;
    emit(ix, 1.3, iz, 0, 0, 0, [5, 4.4, 3.4], 0.07, crit ? 1.3 : 0.8, 0.1, 0, 0);
    const ns = quiet ? 1 : tierIdx > 0 ? 4 : 2;
    for (let k = 0; k < ns; k++) { const a = Math.atan2(-dx, -dz) + rand(-1.1, 1.1), sp = rand(7, 14); emit(ix, 1.3, iz, Math.sin(a) * sp, rand(0.5, 4), Math.cos(a) * sp, [4.5, 3.4, 1.4], 0.16, 0.22, 0.03, -14, 5); }
  }
  const kb = (e.type === 'tank' || e.type === 'escudo' ? 1.2 : 4.5) * kbMul;
  const l = Math.hypot(dx, dz) || 1; e.kx += (dx / l) * kb; e.kz += (dz / l) * kb;
  const T = TYPES[e.type];
  const col = e.type === 'zombie' || e.type === 'bomba' ? [0.6, 2, 0.3] : [3.5, 2.2, 0.6];
  for (let k = 0; k < 5; k++) emit(e.x, 1.2, e.z, -dx / l * rand(2, 6) + rand(-3, 3), rand(1, 5), -dz / l * rand(2, 6) + rand(-3, 3), col, 0.35, 0.3, 0.05, -12, 2);
  if (!demo && (!quiet || crit)) dmgNum(e.x, 2.2, e.z, String(Math.round(dmg)), crit ? 'crit' : '');
  const n = performance.now();
  if (n - lastHitSfx > 50) { lastHitSfx = n; if (e.type === 'zombie' || e.type === 'bomba') sfx.hit(); else sfx.metal(); }
  if (e.hp <= 0 && !e.dead) killEnemy(e, T);
}
function addScore(v) {
  if (demo || state !== 'playing') return;
  score += v;
  const el = $('hud-score'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
function bombBlast(x, z, src) {
  const R = 3.2; let n = 0;
  if (src && src.tele && src.tele.on && src.tele.r === 3.2) hideTele(src.tele);
  if (src) src.tele = null;
  for (const e of enemies) {
    if (e.dead || e.spawn > 0 || e === src) continue;
    const d = Math.hypot(e.x - x, e.z - z);
    if (d < R + e.r) { damageEnemy(e, 60 * (1 - 0.35 * Math.min(1, d / R)), e.x - x, e.z - z, 1.8, true); if (e.dead) n++; }
  }
  if (boss && boss.enter <= 0 && Math.hypot(boss.x - x, boss.z - z) < R + boss.r) damageBoss(40, true);
  if (!demo && state === 'playing' && Math.hypot(player.x - x, player.z - z) < R + 0.2) hurtPlayer(22, x, z, 'bomba');
  if (!demo) { runBombs = n; if (n >= 3) unlockAch('bomba3'); }
  burst(x, 0.8, z, 40, [3.5, 1.4, 0.3], 11, 0.6, 0.65, -6); burst(x, 0.8, z, 18, [1.2, 3, 0.4], 8, 0.5, 0.5, -4);
  shock(x, z, R, [3.5, 1.2, 0.3], 0.5); splat(x, z, 'queimado', 3.4); splat(x + rand(-0.6, 0.6), z + rand(-0.6, 0.6), 'gosma', 1.8);
  boomLight.position.set(x, 2, z); boomI = Math.max(boomI, 260); addShake(0.4); hitstop = Math.max(hitstop, 0.04);
  if (!demo) sfx.grenade();
}
function killEnemy(e, T) {
  e.dead = true;
  if (!demo) { runKillsT[e.type] = (runKillsT[e.type] || 0) + 1; if (kills === 0) unlockAch('abate1'); if (combo + 1 >= 25) unlockAch('combo25'); if (e.type === 'escudo' && e.back) unlockAch('costas'); }
  splat(e.x, e.z, T.goo, e.type === 'tank' ? 2.4 : 1.3 + Math.random() * 0.4);
  if (e.type === 'bomba') bombBlast(e.x, e.z, e);
  if (corpses.length < 60) { const l = Math.hypot(e.kx, e.kz) || 1, kk = Math.min(4, l); corpses.push({ type: e.type, ph: e.ph, x: e.x, z: e.z, face: e.face, t: 0, vx: (e.kx / l) * kk, vz: (e.kz / l) * kk, tilt: Math.random() < 0.5 ? -1 : 1 }); }
  kills++;
  combo++; comboT = 2.2; maxCombo = Math.max(maxCombo, combo);
  const mult = Math.min(5, 1 + Math.floor(combo / 5));
  const pts = T.score * mult;
  addScore(pts);
  if (!demo && mult > 1) dmgNum(e.x, 3, e.z, '+' + pts, 'big');
  const big = e.type === 'tank' || e.type === 'escudo';
  burst(e.x, 1.1, e.z, big ? 46 : 24, T.color, big ? 11 : 7, 0.6, big ? 0.7 : 0.45, -6);
  burst(e.x, 1.1, e.z, big ? 18 : 8, [4, 2.6, 0.8], big ? 14 : 9, 0.3, 0.35, -3);
  addDebris(e.x, 1, e.z, e.type === 'zombie' || e.type === 'bomba' ? 0x6f9e4a : e.type === 'fast' ? 0xc3cddd : e.type === 'sniper' ? 0x8a3a4a : 0x5d6474, big ? 12 : 6, big ? 8 : 6, big ? 0.3 : 0.18);
  shock(e.x, e.z, big ? 5 : 2.6, T.color, big ? 0.5 : 0.35);
  boomLight.position.set(e.x, 2, e.z); boomI = big ? 260 : 120;
  addShake((big ? 0.5 : 0.18));
  if (big) hitstop = 0.05;
  if (!demo) sfx.explode(big);
  if (!demo && Math.random() < T.drop) dropItem(e.x, e.z);
  if (!demo && stats.blast > 0) blasts.push({ x: e.x, z: e.z, r: 2 + 0.5 * stats.blast, dmg: (10 + 8 * stats.blast) * stats.dmg });
  if (!demo && stats.vamp > 0 && ++player.vampN >= 10) { player.vampN = 0; heal(stats.vamp * 4); }
}
let lastHit = '', dashesUsed = 0;
function hurtPlayer(dmg, sx, sz, src = '') {
  if (demo || cine || (DEBUG && window.__CBgod) || player.inv > 0 || player.dashT > 0 || player.hp <= 0) return;
  if (player.shieldOn) { // escudo regenerativo absorve o golpe
    player.shieldOn = false; player.shieldT = stats.shieldCd; player.inv = 0.6;
    sfx.shield(); shock(player.x, player.z, 2.6, [0.4, 1.4, 3], 0.4); showHitDir(sx, sz); vibrate(30);
    dmgNum(player.x, 2.6, player.z, 'BLOQUEADO!', 'heal'); hud.pw = '#';
    return;
  }
  dmg = Math.round(dmg * waveScale.dmg); waveTaken += dmg; lastHit = src;
  kickCam(player.x - sx, player.z - sz, 0.25 + Math.min(0.35, dmg * 0.012));
  player.hp = Math.max(0, player.hp - dmg);
  player.inv = 0.9; player.flashT = 0.25; player.hitT = 0.3; runHit = true;
  addShake(Math.min(0.75, 0.25 + dmg * 0.014)); // tremor proporcional ao dano
  hitstop = Math.max(hitstop, player.hp <= 0 ? 0.12 : 0.07); // hit-stop no golpe
  showHitDir(sx, sz);
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
  state = 'dying'; dyingT = 1.6; slowT = 1.2; slowK = 0.35; wakeLock(false);
  burst(player.x, 1.2, player.z, 40, [3, 1.5, 0.4], 10, 0.8, 0.6, -5);
  addDebris(player.x, 1.2, player.z, 0x8a96aa, 8, 7, 0.2);
  shock(player.x, player.z, 7, [3, 1.2, 0.3], 0.7);
  boomLight.position.set(player.x, 2, player.z); boomI = 300;
  player.deathT = 0; hero.flash.visible = false; hero.g.visible = true; hero.shield.visible = false;
  splat(player.x, player.z, 'queimado', 2.6);
  sfx.explode(true); music(false); musicIntensity(0); stopLaser();
  if (DEBUG) runLog.push({ morreu: wave, t: +waveTime.toFixed(1), score, picks: runPicks.join(','), weapon: player.weapon });
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
  enemies.push({ id: ++enemySeq, type, x, z, vx: 0, vz: 0, kx: 0, kz: 0, hp, maxHp: hp, r: T.r, speed: T.speed * waveScale.sp * rand(0.9, 1.1), flash: 0, t: rand(0, 10), spawn: 0.55, face: Math.atan2(player.x - x, player.z - z), shootT: type === 'sniper' ? rand(2.2, 3.2) : rand(1.5, 3), seed: rand(0, 6.28), dead: false, ph: 0, aimT: 0, ax: 0, az: 0, fuse: 0, tele: null, atk: 0, recoil: 0, back: false });
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
  // inimigos escalam mais forte que antes (o jogador agora evolui com poderes)
  waveScale = { hp: 1 + 0.15 * (n - 1) + 0.006 * (n - 1) ** 2, sp: n === 1 ? 0.82 : n === 2 ? 0.9 : Math.min(1.55, 1 + 0.035 * (n - 1)), dmg: 1 + 0.05 * (n - 1) };
  waveTime = 0; waveTaken = 0;
  const isBoss = n % 5 === 0;
  if (!demo) {
    if (n >= 5) unlockAch('onda5'); if (n >= 10) unlockAch('onda10'); if (n >= 15) unlockAch('onda15');
    if (n > meta.maxWave) { const u0 = arenaUnlocked('porto'); meta.maxWave = n; saveMeta(); if (!u0 && arenaUnlocked('porto')) setTimeout(() => toast('⚓ Nova arena liberada: Porto Ferrugem! Escolha no menu.'), 2600); }
  }
  spawnQueue = [];
  const count = isBoss ? 4 + n : n === 1 ? 6 : n === 2 ? 9 : Math.min(64, 6 + Math.round(n * 3.2));
  const P2 = arena === 'porto', o = P2 ? 1 : 0;
  const fastP = n >= 2 ? Math.min(0.4, 0.12 + 0.04 * n) : 0;
  const tankP = n >= 3 ? Math.min(0.2, 0.05 * (n - 2)) : 0;
  const bombP = n >= 3 - o ? Math.min(0.13, 0.035 * (n - 2 + o)) * (P2 ? 1.4 : 1) : 0;
  const snipP = n >= 4 - o ? Math.min(0.09, 0.025 * (n - 3 + o)) * (P2 ? 1.4 : 1) : 0;
  const guarP = n >= 6 - o ? Math.min(0.09, 0.02 * (n - 5 + o)) * (P2 ? 1.4 : 1) : 0;
  const mix = [['tank', tankP], ['bomba', bombP], ['sniper', snipP], ['escudo', guarP], ['fast', fastP]];
  for (let i = 0; i < count; i++) { let r = Math.random(), t = 'zombie'; for (const [k, p] of mix) { if (r < p) { t = k; break; } r -= p; } spawnQueue.push(t); }
  // apresenta cada inimigo novo na primeira onda em que ele pode aparecer (e garante um deles)
  const intro = { bomba: [3 - o, 'Zumbi-Bomba: atire de longe!'], sniper: [4 - o, 'Atirador: saia da mira vermelha!'], escudo: [6 - o, 'Guardião: ataque pelas costas!'] };
  let tip = '';
  for (const k in intro) if (n === intro[k][0] && !isBoss) { tip = intro[k][1]; spawnQueue.splice(Math.min(spawnQueue.length, 3), 0, k); }
  spawnT = isBoss ? 3.6 : 1.2;
  if (isBoss) {
    spawnBoss(n / 5);
    if (!demo) startBossCine(); else showBanner(`CHEFE!<small>${boss.name}</small>`, 'boss');
    sfx.boss(); vibrate([60, 40, 60]);
  } else {
    showBanner(`ONDA ${n}<small>${tip || (n === 1 ? 'Derrote todos os inimigos para vencer a onda' : n % 5 === 4 ? 'Chefe na próxima!' : 'Prepare-se!')}</small>`, tip ? 'novo' : '');
    sfx.wave();
  }
}
function spawnBoss(bi) {
  const B = bossModel;
  B.coreMat.emissiveIntensity = 4; B.red.emissiveIntensity = 0.6;
  B.g.rotation.set(0, 0, 0); B.armL.rotation.set(0, 0, 0); B.armR.rotation.set(0, 0, 0); B.core.scale.setScalar(1);
  for (const m of B.mats) m.emissive.setRGB(0, 0, 0);
  const type = BOSS_TYPES[(bi - 1) % BOSS_TYPES.length];
  B.coreMat.color.setHex(type.core); B.coreMat.emissive.setHex(type.core); B.eye.emissive.setHex(type.core);
  B.red.color.setHex(type.red); B.red.emissive.setHex(type.core); B.red.emissiveIntensity = 0.5;
  B.g.scale.setScalar(type.escala); B.fury.visible = false;
  const hp = 1500 * (1 + 0.8 * (bi - 1));
  boss = { ...B, bi, type, x: 0, z: -14, y: 0, hp, maxHp: hp, r: 2.1 * type.escala, t: 0, enter: 2.2, actT: 2.5, act: null, actStep: 0, actTimer: 0, cvx: 0, cvz: 0, flash: 0, face: 0, shots: 0, spA: 0, tele: null, pts: [], tx: 0, tz: 0, sx0: 0, sz0: 0, name: type.nome + (bi > BOSS_TYPES.length ? ' ' + roman(Math.floor((bi - 1) / BOSS_TYPES.length) + 1) : ''), cycle: 0, p2: false, roarT: 0, combo: false };
  musicIntensity(1);
  if (Math.hypot(player.x, player.z + 14) < 8) boss.z = 14;
  boss.g.position.set(boss.x, -6, boss.z);
  scene.add(boss.g);
  $('boss-name').textContent = boss.name; $('boss-wrap').hidden = false; document.body.classList.add('has-boss'); measureHud();
}
function enemyShot(x, z, ang, sp, dmg = 0, big = false, src = 'tiroChefe') {
  if (eBullets.list.length >= eBullets.max) return;
  eBullets.list.push({ x, z, vx: Math.sin(ang) * sp, vz: Math.cos(ang) * sp, life: 4, dmg, big, src });
}
// laser de mira do Atirador (faixa fina vermelha, sem bloom para ficar legível)
const aimMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0xff1a22, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }), 12);
aimMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); aimMesh.frustumCulled = false; aimMesh.count = 0; scene.add(aimMesh);
let aimingNow = 0; // no máximo 3 Atiradores mirando ao mesmo tempo (dá para ler e desviar)
function drawAim(e, i) {
  if (i >= 12) return;
  const a = Math.atan2(e.ax - e.x, e.az - e.z), len = Math.min(26, Math.hypot(e.ax - e.x, e.az - e.z) + 5);
  const locked = e.aimT <= 0.3, w = locked ? (Math.floor(e.aimT * 30) % 2 ? 0.16 : 0.08) : 0.05;
  dummy.position.set(e.x + Math.sin(a) * 1.2, 1.46, e.z + Math.cos(a) * 1.2); dummy.rotation.set(0, a, 0, 'YXZ'); dummy.scale.set(w, w, len); dummy.updateMatrix();
  aimMesh.setMatrixAt(i, dummy.matrix);
}
function updateBoss(dt) {
  const b = boss;
  b.t += dt; b.flash = Math.max(0, b.flash - dt * 8);
  const toP = Math.atan2(player.x - b.x, player.z - b.z);
  if (b.enter > 0) {
    b.enter -= dt;
    b.g.position.y = -6 * Math.max(0, b.enter / 2.2) ** 2;
    addShake(dt * 1.2);
    if (Math.random() < 0.6) emit(b.x + rand(-2.5, 2.5), 0.2, b.z + rand(-2.5, 2.5), rand(-2, 2), rand(4, 9), rand(-2, 2), [3, 1, 0.3], 0.8, 0.6, 0.1, -4);
    b.g.position.x = b.x; b.g.position.z = b.z; b.g.rotation.y = toP;
    if (b.enter <= 0) { b.g.position.y = 0; shock(b.x, b.z, 9, [3, 0.8, 0.2], 0.6); addShake(1); }
    return;
  }
  // fase 2: rugido (aviso) antes de ficar mais rápido e encadear combos
  if (b.roarT > 0) {
    b.roarT -= dt; b.flash = 0.5 + 0.5 * Math.sin(b.t * 36); addShake(dt * 1.5);
    const k = 1 - Math.max(0, b.roarT) / 1.25; b.g.scale.setScalar(b.type.escala * (1 + 0.1 * Math.min(1, k * 1.6)));
    if (Math.random() < 0.7) emit(b.x + rand(-1, 1), 4 + rand(0, 1), b.z + rand(-1, 1), rand(-4, 4), rand(2, 6), rand(-4, 4), [3.5, 0.9, 0.2], 0.6, 0.7, 0.1, -6, 2);
  }
  if (b.p2) { b.ring.rotation.z += dt * 4; b.furyMat.emissiveIntensity = 2.6 + Math.sin(b.t * 9) * 0.8; }
  // ações — todas com aviso no chão antes do golpe
  if (b.roarT <= 0) b.actT -= dt;
  if (!b.act && b.actT <= 0) {
    const o = b.type.ordem;
    if (b.p2 && b.combo) { b.act = 'meteoro'; b.combo = false; } // fase 2: cada golpe vem seguido de uma chuva de meteoros
    else { b.act = o[b.cycle++ % o.length]; b.combo = b.p2; }
    b.actStep = 0; b.actTimer = 0; b.shots = 0; b.tele = null;
  }
  let sp = (1.5 + b.bi * 0.25) * (b.p2 ? 1.3 : 1) * (b.roarT > 0 ? 0 : 1);
  const end = (t) => { b.act = null; b.actT = b.p2 ? (b.combo ? 0.45 : t * 0.7) : t; if (b.tele) { hideTele(b.tele); b.tele = null; } };
  if (b.act === 'radial') {
    if (b.actStep === 0) { b.actStep = 1; b.actTimer = 0.65; b.tele = teleCircle(b.x, b.z, 4.6, 0.65); sfx.warn(); }
    b.actTimer -= dt;
    if (b.actStep === 1) { b.flash = 0.5 + 0.4 * Math.sin(b.t * 30); if (b.tele) { b.tele.x = b.x; b.tele.z = b.z; } if (b.actTimer <= 0) { b.actStep = 2; b.actTimer = 0; b.tele = null; } }
    else if (b.actTimer <= 0) {
      const n = 14 + b.bi * 4 + (b.p2 ? 4 : 0), off = b.shots * 0.5 * (Math.PI * 2 / n);
      for (let i = 0; i < n; i++) enemyShot(b.x, b.z, (i / n) * Math.PI * 2 + off, 7 + b.bi);
      sfx.enemyShot(); shock(b.x, b.z, 4, [3, 0.4, 2], 0.35);
      b.shots++; b.actTimer = 0.45;
      if (b.shots >= 2 + Math.min(2, b.bi - 1)) end(1.4);
    }
    sp *= 0.3;
  } else if (b.act === 'aimed') {
    if (b.actStep === 0) { b.actStep = 1; b.actTimer = 0.55; b.tele = teleLine(b.x, b.z, toP, 15, 1.6, 0.55); sfx.warn(); }
    b.actTimer -= dt;
    if (b.actStep === 1) { if (b.tele) { b.tele.x = b.x; b.tele.z = b.z; b.tele.ang = toP; } if (b.actTimer <= 0) { b.actStep = 2; b.actTimer = 0; b.tele = null; } }
    else if (b.actTimer <= 0) {
      const w = b.p2 ? 3 : 2; for (let i = -w; i <= w; i++) enemyShot(b.x + Math.sin(toP) * 2, b.z + Math.cos(toP) * 2, toP + i * 0.16, 11 + b.bi);
      sfx.enemyShot(); b.shots++; b.actTimer = 0.28;
      if (b.shots >= 3 + b.bi) end(1.2);
    }
    sp *= 0.5;
  } else if (b.act === 'charge') {
    if (b.actStep === 0) { b.actStep = 1; b.actTimer = 0.9; b.cvx = Math.sin(toP); b.cvz = Math.cos(toP); b.tele = teleLine(b.x, b.z, toP, 13.6, b.r * 2, 0.9); sfx.warn(); }
    b.actTimer -= dt;
    if (b.actStep === 1) {
      b.flash = 0.6 + 0.4 * Math.sin(b.t * 40); sp = 0;
      if (b.actTimer > 0.3) { b.cvx = Math.sin(toP); b.cvz = Math.cos(toP); if (b.tele) { b.tele.x = b.x; b.tele.z = b.z; b.tele.ang = toP; } } // trava a direção 0,3 s antes
      if (b.actTimer <= 0) { b.actStep = 2; b.actTimer = 0.8; b.tele = null; sfx.dash(); shock(b.x, b.z, 4, [3, 0.5, 0.2]); }
    } else {
      b.x += b.cvx * 17 * dt; b.z += b.cvz * 17 * dt; sp = 0;
      if (Math.random() < 0.8) emit(b.x, 0.4, b.z, rand(-3, 3), rand(1, 3), rand(-3, 3), [3, 1.2, 0.3], 0.5, 0.6, 0.1, -3);
      addShake(dt * 0.8);
      if (b.actTimer <= 0 || Math.abs(b.x) > ARENA - 2 || Math.abs(b.z) > ARENA - 2) { end(1.3); shock(b.x, b.z, 6, [3, 0.8, 0.2], 0.5); addShake(0.4); }
    }
  } else if (b.act === 'summon') {
    if (b.actStep === 0) {
      b.actStep = 1; b.actTimer = 0.95; b.pts = [];
      for (let i = 0; i < 3 + b.bi; i++) { const a = rand(0, 6.28), r = rand(3.5, 5.5); const x = clamp(b.x + Math.cos(a) * r, -ARENA + 1, ARENA - 1), z = clamp(b.z + Math.sin(a) * r, -ARENA + 1, ARENA - 1); b.pts.push([x, z]); const T = teleCircle(x, z, 1.1, 0.95, TELE_GREEN); T.hurt = false; }
      sfx.warn();
    }
    b.actTimer -= dt; sp *= 0.4;
    if (b.actTimer <= 0) { for (const [x, z] of b.pts) spawnEnemy(Math.random() < 0.5 ? 'fast' : 'zombie', x, z); end(1.5); }
  } else if (b.act === 'slam') {
    const D = 1.15;
    if (b.actStep === 0) {
      b.actStep = 1; b.actTimer = D; b.sx0 = b.x; b.sz0 = b.z;
      b.tx = clamp(player.x, -ARENA + 2.5, ARENA - 2.5); b.tz = clamp(player.z, -ARENA + 2.5, ARENA - 2.5);
      b.slamR = 3.4 + 0.2 * Math.min(4, b.bi);
      b.tele = teleCircle(b.tx, b.tz, b.slamR, D); sfx.warn();
    }
    b.actTimer -= dt; sp = 0;
    const k = clamp(1 - b.actTimer / D, 0, 1), e = k * k * (3 - 2 * k);
    b.x = b.sx0 + (b.tx - b.sx0) * e; b.z = b.sz0 + (b.tz - b.sz0) * e; b.y = Math.sin(k * Math.PI) * 6.5;
    if (b.actTimer <= 0) {
      b.y = 0; b.tele = null;
      if (Math.hypot(player.x - b.tx, player.z - b.tz) < b.slamR) hurtPlayer(26, b.tx, b.tz, 'chefe');
      shock(b.tx, b.tz, b.slamR * 1.7, [3, 0.9, 0.2], 0.6); burst(b.tx, 0.4, b.tz, 46, [3, 1.4, 0.3], 12, 0.7, 0.6, -6);
      addDebris(b.tx, 0.6, b.tz, 0x4b5263, 14, 10, 0.3); boomLight.position.set(b.tx, 1.5, b.tz); boomI = 320; addShake(1); vibrate(60);
      sfx.slam();
      if (b.bi >= 2) for (let i = 0; i < 12; i++) enemyShot(b.tx, b.tz, (i / 12) * Math.PI * 2, 6);
      end(1.3);
    }
  } else if (b.act === 'meteoro') { // novo na fase 2: círculos caem em cima de você e em volta
    if (b.actStep === 0) {
      b.actStep = 1; b.actTimer = 0.95; b.pts = [];
      const n = 3 + Math.min(2, b.bi - 1);
      for (let i = 0; i < n; i++) { const a = rand(0, 6.28), r = i === 0 ? 0 : rand(2.5, 4.5); const x = clamp(player.x + Math.cos(a) * r, -ARENA + 1, ARENA - 1), z = clamp(player.z + Math.sin(a) * r, -ARENA + 1, ARENA - 1); b.pts.push([x, z]); teleCircle(x, z, 1.9, 0.95); }
      sfx.warn();
    }
    b.actTimer -= dt; sp *= 0.5;
    if (b.actTimer <= 0) {
      let hit = false;
      for (const [x, z] of b.pts) { burst(x, 0.5, z, 22, [3.5, 1.3, 0.3], 9, 0.5, 0.5, -6); shock(x, z, 2.6, [3.5, 1, 0.2], 0.4); splat(x, z, 'queimado', 2.4); if (!hit && Math.hypot(player.x - x, player.z - z) < 1.9) { hurtPlayer(18, x, z, 'chefe'); hit = true; } }
      boomLight.position.set(player.x, 2, player.z); boomI = Math.max(boomI, 260); addShake(0.5); sfx.meteor();
      end(1.1);
    }
  } else if (b.act === 'spiral') {
    if (b.actStep === 0) { b.actStep = 1; b.actTimer = 0.6; b.tele = teleCircle(b.x, b.z, 3.2, 0.6); sfx.warn(); b.spA = toP; }
    b.actTimer -= dt; sp *= 0.2;
    if (b.actStep === 1) { b.flash = 0.5 + 0.4 * Math.sin(b.t * 30); if (b.actTimer <= 0) { b.actStep = 2; b.actTimer = 2.4; b.shots = 0; b.tele = null; } }
    else {
      b.shots -= dt;
      if (b.shots <= 0) { b.shots = 0.085; const arms = b.bi >= 4 ? 3 : 2; for (let i = 0; i < arms; i++) enemyShot(b.x, b.z, b.spA + (i / arms) * Math.PI * 2, 6.5); b.spA += 0.27; if (Math.random() < 0.3) sfx.enemyShot(); }
      if (b.actTimer <= 0) end(1.3);
    }
  }
  if (sp > 0) { b.x += Math.sin(toP) * sp * dt; b.z += Math.cos(toP) * sp * dt; }
  b.x = clamp(b.x, -ARENA + 2, ARENA - 2); b.z = clamp(b.z, -ARENA + 2, ARENA - 2);
  b.face += Math.atan2(Math.sin(toP - b.face), Math.cos(toP - b.face)) * Math.min(1, dt * 3);
  b.g.position.set(b.x, (b.y || 0) + Math.abs(Math.sin(b.t * 3)) * 0.08, b.z);
  b.g.rotation.y = b.face;
  b.core.scale.setScalar(1 + 0.15 * Math.sin(b.t * 7));
  b.armL.rotation.x = Math.sin(b.t * 2) * 0.2; b.armR.rotation.x = -Math.sin(b.t * 2) * 0.2;
  for (const m of b.mats) m.emissive.setRGB(b.flash * 0.9 + (b.p2 ? 0.08 : 0), b.flash * 0.75, b.flash * 0.7);
  if ((b.y || 0) < 1 && Math.hypot(player.x - b.x, player.z - b.z) < b.r + 0.5) hurtPlayer(b.act === 'charge' ? 28 : 20, b.x, b.z, 'chefe');
  $('boss-fill').style.width = Math.max(0, (b.hp / b.maxHp) * 100).toFixed(1) + '%';
}
function startPhase2(b) {
  b.p2 = true; b.roarT = 1.25; b.act = null; b.actT = 1.4; b.y = 0; if (b.tele) { hideTele(b.tele); b.tele = null; }
  hideAllTele(); b.fury.visible = true; b.coreMat.emissiveIntensity = 7; b.red.emissiveIntensity = 1.6;
  if (!demo) { sfx.roar(); vibrate([80, 40, 160]); showBanner(`FÚRIA!<small>${b.name} — fase 2</small>`, 'boss'); }
  addShake(1); screenFlash('boss'); boomLight.position.set(b.x, 3, b.z); boomI = 380;
  for (let i = 0; i < 3; i++) setTimeout(() => { if (boss === b) shock(b.x, b.z, 5 + i * 3, [3.5, 0.8, 0.2], 0.55); }, i * 260);
}
function damageBoss(dmg, quiet = false) {
  const b = boss; if (!b || b.enter > 0) return;
  const crit = Math.random() < stats.crit; if (crit) dmg *= 2;
  b.hp -= dmg; b.flash = Math.max(b.flash, 0.35);
  if (!b.p2 && b.hp > 0 && b.hp <= b.maxHp * 0.5) startPhase2(b);
  if (!quiet) emit(b.x + rand(-0.8, 0.8), 2 + rand(0, 2), b.z + rand(-0.8, 0.8), rand(-5, 5), rand(1, 5), rand(-5, 5), [5, 4, 2.4], 0.1, 0.9, 0.1, -10, 3);
  if (!quiet || crit) dmgNum(b.x + rand(-1, 1), 4.5, b.z, String(Math.round(dmg)), crit ? 'crit' : '');
  const n = performance.now(); if (n - lastHitSfx > 50) { lastHitSfx = n; sfx.metal(); }
  if (b.hp <= 0) killBoss();
}
function killBoss() {
  const b = boss; boss = null;
  bossesKilled.n++; musicIntensity(0); hideAllTele();
  if (!demo) { meta.bosses++; saveMeta(); unlockAch('chefe1'); if (meta.bosses >= 5) unlockAch('chefe5'); }
  addScore(5000 * b.bi);
  dmgNum(b.x, 5, b.z, '+' + 5000 * b.bi, 'big');
  slowT = 2.0; slowK = 0.18; addShake(1); hitstop = 0.14; screenFlash('boss');
  vibrate([100, 50, 200]);
  const rid = runId;
  for (let i = 0; i < 5; i++) setTimeout(() => {
    if (rid !== runId) return;
    const x = b.x + rand(-2, 2), z = b.z + rand(-2, 2);
    burst(x, 2.5, z, 50, i % 2 ? [3, 1.2, 0.3] : [3.5, 2.5, 0.8], 13, 0.9, 0.9, -5);
    shock(x, z, 7, [3, 0.9, 0.3], 0.6); boomLight.position.set(x, 3, z); boomI = 400; addShake(1); sfx.explode(true);
  }, i * 160);
  addDebris(b.x, 3, b.z, 0x4b5263, 30, 12, 0.45);
  addDebris(b.x, 3, b.z, 0x8a1010, 14, 12, 0.35);
  scene.remove(b.g);
  $('boss-wrap').hidden = true; document.body.classList.remove('has-boss');
  dropItem(b.x - 1.5, b.z, 'health'); dropItem(b.x + 1.5, b.z, randomWeaponItem());
  showBanner('CHEFE DERROTADO!<small>+' + 5000 * b.bi + ' pontos</small>');
}

// ---------------- Atualização principal ----------------
function updatePlayer(dt) {
  let mx = 0, mz = 0;
  if (!demo && DEBUG && bot.on) { const B = botInput(dt); mx = B[0]; mz = B[1]; if (B[2]) dash(); }
  else if (!demo) {
    if (keys.KeyW || keys.ArrowUp) mz -= 1;
    if (keys.KeyS || keys.ArrowDown) mz += 1;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    const jl = Math.hypot(joy.x, joy.y);
    if (jl > 0.12) { mx += joy.x; mz += joy.y; }
  } else {
    demoT += dt;
    const tx = Math.cos(demoT * 0.22) * 1.4, tz = Math.sin(demoT * 0.22) * 1.4; // no título o herói quase parado (respiração + tiros)
    mx = (tx - player.x) * 0.5; mz = (tz - player.z) * 0.5;
  }
  let ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; ml = 1; }
  player.mvx = mx; player.mvz = mz;
  player.dashCd = Math.max(0, player.dashCd - dt);
  let speed = 7.2 * stats.speed;
  if (player.dashT > 0) {
    player.dashT -= dt;
    if (player.dashT <= 0) for (let k = 0; k < 8; k++) { const a = rand(0, 6.28); emit(player.x, 0.12, player.z, Math.cos(a) * 3, rand(0.3, 1), Math.sin(a) * 3, [0.32, 0.27, 0.22], 0.5, 0.35, 0.8, 0.5, 4); }
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
  const laserW = player.weapon === 'laser' && !demo;
  if (wantFire && player.dashT <= 0) {
    const diff = Math.abs(Math.atan2(Math.sin(targetFace - player.face), Math.cos(targetFace - player.face)));
    if (laserW) updateLaser(dt, diff < 0.6);
    else if (player.fireT <= 0 && diff < 0.5) fire(Math.sin(player.face), Math.cos(player.face));
  } else if (laserW) updateLaser(dt, false);
  if (!laserW && player.laserOn) stopLaser();
  // escudo regenerativo
  if (stats.shieldCd > 0 && !player.shieldOn && !demo) { player.shieldT -= dt; if (player.shieldT <= 0) { player.shieldOn = true; sfx.shieldUp(); hud.pw = '#'; } }
  hero.shield.visible = player.shieldOn && !demo;
  if (hero.shield.visible) hero.shield.material.opacity = 0.12 + 0.06 * Math.sin(performance.now() * 0.006);
  player.shotgun = Math.max(0, player.shotgun - dt);
  player.rapid = Math.max(0, player.rapid - dt);
  player.inv = Math.max(0, player.inv - dt);
  player.flashT = Math.max(0, player.flashT - dt);
  if (player.flashTimer > 0) { player.flashTimer -= dt; if (player.flashTimer <= 0) hero.flash.visible = false; }
  if (player.laserOn) hero.flash.visible = true;

  // animação do herói
  const moving = player.dashT > 0 ? 1.5 : ml;
  const prevW = player.walk;
  player.walk += dt * (6 + 8 * moving) * (moving > 0.05 ? 1 : 0);
  // poeira a cada passo (meia volta da passada)
  if (moving > 0.3 && Math.floor(prevW / Math.PI) !== Math.floor(player.walk / Math.PI)) {
    const side = Math.floor(player.walk / Math.PI) % 2 ? 1 : -1, cx = Math.cos(player.face) * 0.22 * side, cz = -Math.sin(player.face) * 0.22 * side;
    const n = tierIdx > 0 ? 3 : 2;
    for (let k = 0; k < n; k++) emit(player.x + cx + rand(-0.15, 0.15), 0.1, player.z + cz + rand(-0.15, 0.15), -player.mvx * rand(0.5, 1.5) + rand(-0.6, 0.6), rand(0.4, 1.1), -player.mvz * rand(0.5, 1.5) + rand(-0.6, 0.6), [0.32, 0.27, 0.22], 0.5, 0.3, 0.75, 0.6, 3);
  }
  player.recoil *= Math.exp(-dt * 14);
  player.rollT = Math.max(0, player.rollT - dt); player.rollK = player.rollT > 0 ? 1 - player.rollT / 0.34 : 0;
  player.hitT = Math.max(0, (player.hitT || 0) - dt);
  const fwd = player.mvx * Math.sin(player.face) + player.mvz * Math.cos(player.face), sideM = player.mvx * Math.cos(player.face) - player.mvz * Math.sin(player.face);
  const k = Math.min(1, dt * 10);
  player.leanF += ((player.dashT > 0 ? 0.1 : fwd * 0.16) - player.leanF) * k; player.leanS += ((player.dashT > 0 ? 0 : -sideM * 0.14) - player.leanS) * k;
  // corrida para trás (mirando para um lado e andando para o outro) inverte a passada
  poseHero(Math.min(1, moving) * (fwd < -0.3 ? -1 : 1), player.recoil, player.rollT > 0 ? player.rollK : 0, player.hitT / 0.3, 0);
  hero.g.position.set(player.x, 0, player.z);
  hero.g.rotation.set(player.leanF - player.recoil * 0.05, player.face, player.leanS);
  hero.g.scale.setScalar(HERO_S);
  hero.glowRing.material.color.setRGB(player.shotgun > 0 ? 3 : 0.3, player.shotgun > 0 ? 1.4 : 1.6, player.shotgun > 0 ? 0.3 : 3);
  hero.g.visible = demo || player.inv <= 0 || player.hitT > 0.15 || Math.floor(player.inv * 16) % 2 === 0;
  const f = player.flashT * 4;
  if (player.flashT > 0.17) for (const m of hero.mats) m.emissive.setRGB(2.4, 2.4, 2.4); // clarão branco
  else for (const m of hero.mats) m.emissive.setRGB(f * 1.5, f * 0.2, f * 0.1);
}
function updateEnemies(dt) {
  const n = enemies.length;
  for (let i = 0; i < n; i++) {
    const e = enemies[i];
    e.t += dt; e.flash = Math.max(0, e.flash - dt * 9);
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
        if (wave >= 8) { enemyShot(cx, cz, a - 0.2, 8.5, 0, false, 'tank'); enemyShot(cx, cz, a + 0.2, 8.5, 0, false, 'tank'); }
        enemyShot(cx, cz, a, 8.5, 0, false, 'tank');
        for (let k = 0; k < 6; k++) emit(cx, 1.4, cz, Math.sin(a) * rand(2, 5) + rand(-1, 1), rand(0, 2), Math.cos(a) * rand(2, 5) + rand(-1, 1), [3, 0.5, 2], 0.25, 0.4, 0.05, 0, 3);
        sfx.enemyShot(); e.shootT = rand(2.0, 2.8); e.kx -= Math.sin(a) * 1.5; e.kz -= Math.cos(a) * 1.5; e.recoil = 1;
      }
    }
    if (e.type === 'zombie') e.atk = Math.max(0, Math.min(1, (e.atk || 0) + (d < 2.4 ? dt * 5 : -dt * 3)));
    if (e.type === 'tank') e.recoil = Math.max(0, (e.recoil || 0) - dt * 3);
    if (e.type === 'sniper') { // mantém distância, mira com laser (trava 0,3 s antes) e dispara um tiro rápido
      const want = 12.5, los = losClear(e.x, e.z, player.x, player.z);
      if (e.aimT > 0) {
        sp = 0; e.aimT -= dt;
        if (e.aimT > 0.3) { e.ax = player.x; e.az = player.z; if (!los) { e.aimT = 0; e.shootT = 1.1; } }
        else if (e.aimT <= 0) { const a = Math.atan2(e.ax - e.x, e.az - e.z); const cx = e.x + Math.sin(a) * 1.4, cz = e.z + Math.cos(a) * 1.4; enemyShot(cx, cz, a, 30, 17, true, 'sniper'); sfx.snipe(); e.shootT = rand(2.6, 3.4); e.kx -= Math.sin(a) * 2; e.kz -= Math.cos(a) * 2; for (let k = 0; k < 8; k++) emit(cx, 1.46, cz, Math.sin(a) * rand(3, 8), rand(0, 2), Math.cos(a) * rand(3, 8), [3, 0.3, 0.5], 0.2, 0.4, 0.05, 0, 3); }
      } else {
        const dir = d > want + 2 ? 1 : d < want - 3 ? -1 : 0, st = Math.sin(e.t * 0.6 + e.seed) > 0 ? 1 : -1;
        tx = (dx / d) * dir + (-dz / d) * st * 0.5; tz = (dz / d) * dir + (dx / d) * st * 0.5;
        e.shootT -= dt;
        if (e.shootT <= 0 && los && d < 21 && !demo && state === 'playing' && aimingNow < 3) { aimingNow++; e.aimT = 1.05; e.ax = player.x; e.az = player.z; sfx.aim(); }
      }
    }
    if (e.type === 'bomba') { // corre até você, acende o pavio e explode (também fere os outros inimigos)
      if (e.fuse > 0) { sp = 0; e.fuse -= dt; if (e.fuse <= 0) { e.hp = 0; killEnemy(e, TYPES.bomba); } }
      else if (d < 2.1 && !demo) { e.fuse = 0.75; const T_ = teleCircle(e.x, e.z, 3.2, 0.75); e.tele = T_; sfx.fuse(); }
    }
    if (e.type === 'escudo') sp *= d < 3 ? 0.5 : 1;
    if (demo && d < 2.5) sp = 0;
    const ease = Math.min(1, dt * 5);
    e.vx += (tx * sp - e.vx) * ease; e.vz += (tz * sp - e.vz) * ease;
    const kd = Math.exp(-dt * 7); e.kx *= kd; e.kz *= kd;
    e.x += (e.vx + e.kx) * dt; e.z += (e.vz + e.kz) * dt;
    const want = e.type === 'sniper' && e.aimT > 0 ? Math.atan2(e.ax - e.x, e.az - e.z) : Math.atan2(dx, dz);
    e.face += Math.atan2(Math.sin(want - e.face), Math.cos(want - e.face)) * Math.min(1, dt * (e.type === 'escudo' ? 1.5 : 6)); // Guardião vira devagar: dá para flanquear
    if (!e.dead && e.type !== 'bomba' && d < e.r + 0.5) { hurtPlayer(TYPES[e.type].dmg * (wave <= 2 ? 0.8 : 1), e.x, e.z, e.type); e.kx -= (dx / d) * 6; e.kz -= (dz / d) * 6; }
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
  const cnt = {}; for (const k in TYPES) cnt[k] = 0;
  aimingNow = 0; for (const e of enemies) if (e.aimT > 0) aimingNow++;
  let nAim = 0;
  for (const e of enemies) {
    const T = TYPES[e.type], i = cnt[e.type]++;
    const s = e.spawn > 0 ? 1 - e.spawn / 0.55 : 1;
    const spd = Math.hypot(e.vx, e.vz), amp = Math.min(1, spd / Math.max(0.5, e.speed));
    e.ph = (e.ph || e.seed) + dt * T.walk * (0.35 + 0.65 * amp);
    let y = 0, rx = 0, rz = 0, sc = 1, atk = 0, hd = 0;
    if (e.type === 'zombie') { rz = Math.sin(e.ph * 0.5) * 0.1; rx = 0.08; y = Math.abs(Math.sin(e.ph)) * 0.05; atk = e.atk || 0; hd = Math.sin(e.ph * 0.5) * 0.4; }
    else if (e.type === 'fast') { y = Math.abs(Math.sin(e.ph)) * 0.1; rx = 0.18 + amp * 0.2; rz = Math.sin(e.t * 3.5 + e.seed) * 0.25; if (Math.random() < 0.25 && e.spawn <= 0) emit(e.x - Math.sin(e.face) * 0.4, 0.9 + y, e.z - Math.cos(e.face) * 0.4, rand(-0.5, 0.5), -1, rand(-0.5, 0.5), [3, 1.4, 0.3], 0.25, 0.3, 0.05, 0, 2); }
    else if (e.type === 'tank') { y = Math.abs(Math.sin(e.ph)) * 0.04; atk = Math.max(0, (e.recoil || 0)); }
    else if (e.type === 'sniper') { atk = e.aimT > 0 ? -0.6 : 0; rx = e.aimT > 0 ? -0.05 : 0.04; if (e.aimT > 0) drawAim(e, nAim++); }
    else if (e.type === 'bomba') { y = Math.abs(Math.sin(e.ph)) * 0.08; rz = Math.sin(e.ph * 0.5) * 0.12; if (e.fuse > 0) { const k = 1 - e.fuse / 0.75; sc = 1 + k * 0.35 + Math.sin(e.t * 40) * 0.04 * k; e.flash = Math.max(e.flash, Math.floor(e.t * (8 + 20 * k)) % 2 ? 0.8 : 0); } }
    else if (e.type === 'escudo') { y = Math.abs(Math.sin(e.ph)) * 0.04; rx = -0.04; }
    dummy.position.set(e.x, y - (1 - s) * 1.5, e.z);
    dummy.rotation.set(rx, e.face, rz, 'YXZ');
    dummy.scale.set(s * sc * (1 + e.flash * 0.08), s * sc * (1 + e.flash * 0.14), s * sc * (1 + e.flash * 0.08));
    dummy.updateMatrix();
    T.mesh.setMatrixAt(i, dummy.matrix);
    T.flashAttr.array[i] = e.flash; T.disAttr.array[i] = 0;
    T.animAttr.array[i * 4] = e.ph; T.animAttr.array[i * 4 + 1] = e.spawn > 0 ? 0 : amp; T.animAttr.array[i * 4 + 2] = atk; T.animAttr.array[i * 4 + 3] = hd + e.flash * -0.6;
  }
  aimMesh.count = nAim; aimMesh.instanceMatrix.needsUpdate = true;
  // abatidos: estouro rápido + dissolve com borda incandescente
  for (let j = corpses.length - 1; j >= 0; j--) {
    const c = corpses[j]; c.t += dt;
    if (c.t >= 0.34) { corpses[j] = corpses[corpses.length - 1]; corpses.pop(); continue; }
    const T = TYPES[c.type]; if (cnt[c.type] >= T.max) continue;
    const i = cnt[c.type]++, k = c.t / 0.34, pop = 1 + Math.sin(Math.min(1, k * 2.5) * Math.PI) * 0.18;
    dummy.position.set(c.x + c.vx * c.t, -k * 0.35, c.z + c.vz * c.t); dummy.rotation.set(-k * 0.5 * c.tilt, c.face, k * 0.4 * c.tilt, 'YXZ');
    dummy.scale.set(pop, pop * (1 - k * 0.2), pop); dummy.updateMatrix();
    T.mesh.setMatrixAt(i, dummy.matrix); T.flashAttr.array[i] = Math.max(0, 1 - k * 3); T.disAttr.array[i] = 0.05 + k * 0.98;
    T.animAttr.array[i * 4] = c.ph || 0; T.animAttr.array[i * 4 + 1] = 0; T.animAttr.array[i * 4 + 2] = 0.4 * k; T.animAttr.array[i * 4 + 3] = -k;
  }
  for (const k in TYPES) { const T = TYPES[k]; T.mesh.count = cnt[k]; T.disAttr.needsUpdate = true; T.animAttr.needsUpdate = true; T.mesh.instanceMatrix.needsUpdate = true; T.flashAttr.needsUpdate = true; }
}
function hitsPillar(x, z) {
  for (let k = 0; k < PILLARS.length; k++) { const dx = x - PILLARS[k][0], dz = z - PILLARS[k][1]; if (dx * dx + dz * dz < PILLAR_R[k] * PILLAR_R[k] * 0.8) return true; }
  return false;
}
function isBehind(e, vx, vz) { const l = Math.hypot(vx, vz) || 1; return (Math.sin(e.face) * vx + Math.cos(e.face) * vz) / l > 0.45; }
function shieldBlocks(e, vx, vz) { if (e.type !== 'escudo' || e.spawn > 0) return false; const l = Math.hypot(vx, vz) || 1; return (Math.sin(e.face) * -vx + Math.cos(e.face) * -vz) / l > 0.42; }
function pillarAt(x, z) {
  for (let k = 0; k < PILLARS.length; k++) { const dx = x - PILLARS[k][0], dz = z - PILLARS[k][1]; if (dx * dx + dz * dz < PILLAR_R[k] * PILLAR_R[k] * 0.8) return k; }
  return -1;
}
function updateBullets(dt) {
  const L = pBullets.list, lim = ARENA + 0.2;
  for (let i = L.length - 1; i >= 0; i--) {
    const b = L[i];
    b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt; b.d += 34 * dt;
    let dead = b.life <= 0;
    if (!dead && (Math.abs(b.x) > lim || Math.abs(b.z) > lim)) {
      if (b.bounce > 0) { // ricochete no muro
        if (Math.abs(b.x) > lim) { b.vx = -b.vx; b.x = clamp(b.x, -lim, lim); }
        if (Math.abs(b.z) > lim) { b.vz = -b.vz; b.z = clamp(b.z, -lim, lim); }
        b.bounce--; b.life += 0.3; b.hit = -1; burst(b.x, 1.3, b.z, 3, [3, 2.4, 0.8], 4, 0.15, 0.2);
      } else dead = true;
    }
    if (!dead) {
      const k = pillarAt(b.x, b.z);
      if (k >= 0) {
        if (b.bounce > 0) {
          let nx = b.x - PILLARS[k][0], nz = b.z - PILLARS[k][1]; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
          const dot = b.vx * nx + b.vz * nz; b.vx -= 2 * dot * nx; b.vz -= 2 * dot * nz;
          const rr = PILLAR_R[k] * 0.9 + 0.05; b.x = PILLARS[k][0] + nx * rr; b.z = PILLARS[k][1] + nz * rr;
          b.bounce--; b.life += 0.3; b.hit = -1; burst(b.x, 1.3, b.z, 3, [3, 2.4, 0.8], 4, 0.15, 0.2);
        } else { dead = true; burst(b.x, 1.3, b.z, 4, [3, 2, 0.6], 4, 0.2, 0.2); }
      }
    }
    if (!dead) for (const e of enemies) {
      if (e.dead || e.spawn > 0 || e.id === b.hit) continue;
      const dx = e.x - b.x, dz = e.z - b.z, rr = e.r + 0.2;
      if (dx * dx + dz * dz < rr * rr) {
        if (shieldBlocks(e, b.vx, b.vz)) { // ricocheteia no escudo
          burst(b.x, 1.3, b.z, 6, [0.5, 2, 3.5], 6, 0.2, 0.25); if (performance.now() - lastHitSfx > 60) { lastHitSfx = performance.now(); sfx.block(); }
          if (b.bounce > 0) { b.vx = -b.vx; b.vz = -b.vz; b.bounce--; b.hit = e.id; } else dead = true;
          break;
        }
        e.back = isBehind(e, b.vx, b.vz);
        damageEnemy(e, b.dmg, b.vx, b.vz, b.kb);
        if (b.pierce > 0) { b.pierce--; b.hit = e.id; b.dmg *= 0.85; } else dead = true;
        break;
      }
    }
    if (!dead && boss && boss.enter <= 0 && b.hit !== -2) { const dx = boss.x - b.x, dz = boss.z - b.z; if (dx * dx + dz * dz < boss.r * boss.r) { burst(b.x, 1.6, b.z, 4, [3.5, 2.2, 0.6], 5, 0.25, 0.25); damageBoss(b.dmg); if (b.pierce > 0) { b.pierce--; b.hit = -2; } else dead = true; } }
    if (dead) { L[i] = L[L.length - 1]; L.pop(); }
  }
  pBullets.mesh.count = L.length;
  for (let i = 0; i < L.length; i++) {
    const b = L[i], lq = b.kind === 'leque';
    dummy.position.set(b.x, 1.3, b.z); dummy.rotation.set(0, Math.atan2(b.vx, b.vz), 0); dummy.scale.set(lq ? 1.25 : 1, lq ? 1.25 : 1, lq ? 0.5 : 1); dummy.updateMatrix();
    pBullets.mesh.setMatrixAt(i, dummy.matrix); pBullets.mesh.setColorAt(i, BCOL[b.kind] || BCOL.blaster);
    dummy.scale.set(lq ? 1.4 : 1, 1, Math.min(lq ? 1.1 : 2.2, b.d * 0.12)); dummy.updateMatrix(); // rastro (só depois de sair do cano)
    trailMesh.setMatrixAt(i, dummy.matrix); trailMesh.setColorAt(i, lq ? TRAIL_L : TRAIL_B);
  }
  trailMesh.count = L.length; trailMesh.instanceMatrix.needsUpdate = true; if (trailMesh.instanceColor) trailMesh.instanceColor.needsUpdate = true;
  pBullets.mesh.instanceMatrix.needsUpdate = true; if (pBullets.mesh.instanceColor) pBullets.mesh.instanceColor.needsUpdate = true;
  updateGrenades(dt);
  const E = eBullets.list;
  for (let i = E.length - 1; i >= 0; i--) {
    const b = E[i];
    b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
    let dead = b.life <= 0 || Math.abs(b.x) > ARENA + 1 || Math.abs(b.z) > ARENA + 1 || hitsPillar(b.x, b.z);
    if (!dead && state === 'playing') { const dx = player.x - b.x, dz = player.z - b.z; if (dx * dx + dz * dz < 0.42 && player.inv <= 0 && player.dashT <= 0) { hurtPlayer(b.dmg || (boss ? 12 : 10), b.x, b.z, b.src); dead = true; } }
    if (dead) { burst(b.x, 1.2, b.z, 5, [3, 0.4, 2], 3, 0.25, 0.25); E[i] = E[E.length - 1]; E.pop(); }
  }
  eBullets.mesh.count = E.length;
  const pulse = 1 + Math.sin(performance.now() * 0.02) * 0.15;
  for (let i = 0; i < E.length; i++) { const b = E[i]; dummy.position.set(b.x, b.big ? 1.46 : 1.2, b.z); dummy.rotation.set(0, Math.atan2(b.vx, b.vz), 0); if (b.big) dummy.scale.set(0.55, 0.55, 2.4); else dummy.scale.setScalar(pulse); dummy.updateMatrix(); eBullets.mesh.setMatrixAt(i, dummy.matrix); }
  eBullets.mesh.instanceMatrix.needsUpdate = true;
}
// ---- troca de arma: aparece um botão quando o herói está em cima da arma (nada de troca surpresa)
let swapIt = null;
const swapBtn = $('btn-trocar');
function weaponToast(w) {
  const W = WEAPONS[w], el = $('wpn-toast');
  el.innerHTML = `<span>${W.icon}</span>${W.nome}<small>arma equipada</small>`; el.style.setProperty('--c', W.css);
  el.hidden = true; void el.offsetWidth; el.hidden = false;
  clearTimeout(weaponToast.t); weaponToast.t = setTimeout(() => (el.hidden = true), 1600);
}
function paintSwap(it) {
  if (it === swapIt) return;
  swapIt = it;
  if (!it) { swapBtn.hidden = true; return; }
  const w = PW[it.kind].weapon, W = WEAPONS[w], cur = WEAPONS[player.weapon];
  swapBtn.style.setProperty('--c', W.css);
  swapBtn.innerHTML = `<span class="sw-i">${W.icon}</span><span class="sw-t">${W.nome}</span><small>${touchMode ? 'Toque para trocar' : 'Aperte E para trocar'} · atual: ${cur.icon} ${cur.nome}</small>`;
  swapBtn.hidden = false; sfx.click();
}
function swapWeapon() {
  const it = swapIt; if (!it || state !== 'playing' || !items.includes(it)) return;
  const old = player.weapon, w = PW[it.kind].weapon;
  const x = it.g.position.x, z = it.g.position.z;
  scene.remove(it.g); items.splice(items.indexOf(it), 1);
  setWeapon(w);
  burst(x, 1, z, 30, PW[it.kind].rgb, 7, 0.6, 0.4, 2); shock(x, z, 3, PW[it.kind].rgb, 0.4);
  if (old !== 'blaster') { dropItem(x + rand(-0.4, 0.4), z + 1.6, 'w_' + old); } // a arma antiga fica no chão
  paintSwap(null);
}
swapBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); swapWeapon(); });
swapBtn.addEventListener('click', (e) => e.preventDefault());
function updateItems(dt) {
  let near = null, nearD = 1.5;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.t += dt; it.life -= dt;
    it.icon.rotation.y += dt * 2.4; it.icon.position.y = 1 + Math.sin(it.t * 3) * 0.18;
    it.g.visible = it.life > 3 || Math.floor(it.life * 8) % 2 === 0;
    let d = Math.hypot(player.x - it.g.position.x, player.z - it.g.position.z);
    const isW = it.kind.startsWith('w_');
    if (isW) { // arma: não é puxada pelo ímã nem trocada sozinha
      if (state === 'playing' && d < nearD && PW[it.kind].weapon !== player.weapon) { near = it; nearD = d; }
      if (it.life <= 0) { scene.remove(it.g); items.splice(i, 1); }
      continue;
    }
    if (state === 'playing' && d < stats.magnet && d > 1.0 && !(it.kind === 'health' && player.hp >= player.maxHp)) { // ímã
      const k = Math.min(1, (dt * 11) / d); it.g.position.x += (player.x - it.g.position.x) * k; it.g.position.z += (player.z - it.g.position.z) * k;
      d = Math.hypot(player.x - it.g.position.x, player.z - it.g.position.z);
    }
    if (d < 1.4 && state === 'playing' && !(it.kind === 'health' && player.hp >= player.maxHp)) {
      const P_ = PW[it.kind];
      if (it.kind === 'health') { const h = Math.min(35, player.maxHp - player.hp); player.hp = Math.min(player.maxHp, player.hp + 35); dmgNum(player.x, 2.8, player.z, '+' + Math.max(1, Math.round(h)), 'heal'); sfx.heal(); }
      else if (P_.weapon) setWeapon(P_.weapon);
      else { player[it.kind] = P_.dur; dmgNum(player.x, 2.8, player.z, P_.label + '!', 'big'); sfx.power(); }
      burst(it.g.position.x, 1, it.g.position.z, 30, P_.rgb, 7, 0.6, 0.4, 2);
      shock(it.g.position.x, it.g.position.z, 3, P_.rgb, 0.4);
      vibrate(25);
      scene.remove(it.g); items.splice(i, 1); continue;
    }
    if (it.life <= 0) { scene.remove(it.g); items.splice(i, 1); }
  }
  paintSwap(near);
  if (near && DEBUG && bot.on) swapWeapon();
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
    if (interT <= 0) { if (cardsPending) { cardsPending = false; openCards(); } else startWave(wave + 1); }
    return;
  }
  waveTime += dt;
  const maxAlive = touchMode ? 30 : 42;
  spawnT -= dt;
  if (spawnQueue.length && spawnT <= 0 && enemies.length < maxAlive) {
    const burstN = wave >= 6 ? 2 : 1;
    for (let k = 0; k < burstN && spawnQueue.length; k++) if (spawnEnemy(spawnQueue[0])) spawnQueue.shift();
    spawnT = wave <= 2 ? 1.5 : Math.max(0.25, 1.0 - wave * 0.055);
  }
  if (!spawnQueue.length && !enemies.length && !boss) {
    waveState = 'intermission'; interT = 1.2; cardsPending = true;
    if (!demo && wave >= 5 && waveTaken === 0) unlockAch('intocavel');
    const bonus = wave * 250; addScore(bonus);
    player.hp = Math.min(player.maxHp, player.hp + 10);
    if (DEBUG) runLog.push({ onda: wave, t: +waveTime.toFixed(1), hp: Math.round(player.hp), max: player.maxHp, dano: Math.round(waveTaken), arma: player.weapon, poderes: runPicks.length });
    showBanner(`ONDA ${wave} CONCLUÍDA!<small>Bônus +${bonus} · Vida +10</small>`);
    sfx.power();
  }
}
let bossZoom = 1;
// entrada do chefe: barras de cinema, câmera vai até ele e volta, cartão com o nome
let cine = null;
const BOSS_LEMA = { 'TRITURADOR': 'Esmaga tudo pelo caminho', 'COLOSSO DE AÇO': 'Pisa forte e faz o chão tremer', 'REI DOS ZUMBIS-ROBÔ': 'Nunca luta sozinho', 'MEGA-DESTRUIDOR': 'Espirais de energia sem fim', 'O IMPLACÁVEL': 'Um pouco de tudo, sem descanso' };
function startBossCine() {
  cine = { t: 0, dur: 3.3 };
  $('boss-card').innerHTML = `<small>CHEFE ${boss.bi}</small><b>${boss.name}</b><i>${BOSS_LEMA[boss.type.nome] || 'Prepare-se!'}</i>`;
  const c = $('cine'); c.className = ''; void c.offsetWidth; c.className = 'on';
  boss.actT += 1.2; stopLaser(); paintSwap(null);
}
function updateCine(rdt) {
  if (!cine) return;
  cine.t += rdt;
  if (cine.t >= 2.7 && $('cine').className === 'on') $('cine').className = 'off';
  if (cine.t >= cine.dur || !boss) { cine = null; $('cine').className = ''; }
}
const viewExt = { w: 10, top: 12, bot: 7, ok: false }; // extensão visível do chão em volta do ponto de mira da câmera
function updateCamera(dt, rdt) {
  const a = camera.aspect, t = Math.tan((camera.fov * Math.PI) / 360);
  const portrait = a < 1;
  // retrato: câmera mais alta e mais inclinada, mostrando ~7 m para cada lado do herói
  // luta de chefe: afasta um pouco a câmera para caber chefe + herói
  bossZoom += ((boss && state !== 'title' ? (portrait ? 1.08 : 1.2) : 1) - bossZoom) * Math.min(1, rdt * 2);
  const D = (portrait ? clamp(7.7 / (t * a), 19, 32) : clamp(Math.max(10.2 / (t * a), 8.1 / t), 14, 28)) * ZOOM * bossZoom;
  const pitch = portrait ? 1.22 : 1.0;
  let lx = player.x, lz = player.z;
  if (state === 'title' || demo) {
    viewExt.ok = false; lampMesh.visible = true;
    titleAng += rdt * 0.15;
    const r = a < 1 ? 11 : 9;
    const k = 1 - Math.exp(-rdt * 3);
    camPos.x += (player.x + Math.sin(titleAng) * r - camPos.x) * k; camPos.y += ((a < 1 ? 6.5 : 5) - camPos.y) * k; camPos.z += (player.z + Math.cos(titleAng) * r - camPos.z) * k;
    camLook.x += (player.x - camLook.x) * k; camLook.z += (player.z - camLook.z) * k; camLook.y = a < 1 ? -0.6 : 0.6;
  } else if (cine && boss && cine.t < 2.55) {
    viewExt.ok = false;
    const bs = boss.type.escala, k = 1 - Math.exp(-rdt * (cine.t < 0.25 ? 2.2 : 3.4)), orb = (cine.t - 1.3) * 0.14;
    const tx = boss.x + Math.sin(orb) * 9.5 * bs, ty = 4.4 * bs, tz = boss.z + Math.cos(orb) * 9.5 * bs;
    camPos.x += (tx - camPos.x) * k; camPos.y += (ty - camPos.y) * k; camPos.z += (tz - camPos.z) * k;
    camLook.x += (boss.x - camLook.x) * k; camLook.z += (boss.z - camLook.z) * k; camLook.y += ((boss.y || 0) + 2.6 * bs - camLook.y) * k;
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
    // chefe não pode ficar escondido debaixo do HUD: limita o quanto ele fica "para cima" na tela
    if (boss) {
      const h = window.innerHeight, yMin = hudM.boss + (portrait ? 150 : 85);
      const ndc = clamp(1 - (2 * yMin) / h, -0.6, 0.95);
      const ang = pitch - Math.atan(ndc * Math.tan(hv));
      if (ang > 0.05) { const dAhead = H / Math.tan(ang) - back; lz = Math.min(lz, boss.z + dAhead); }
    }
    lz = clamp(lz, player.z - viewExt.bot * (boss ? 0.72 : 0.55), player.z + viewExt.top * 0.5);
    const tx = lx, ty = H, tz = lz + back;
    const k = 1 - Math.exp(-rdt * 7);
    camPos.x += (tx - camPos.x) * k; camPos.y += (ty - camPos.y) * k; camPos.z += (tz - camPos.z) * k;
    camLook.x += (lx - camLook.x) * k; camLook.z += (lz - camLook.z) * k; camLook.y += (1 - camLook.y) * k;
  }
  shake = Math.max(0, shake - rdt * 1.8);
  // tremor suave (ruído por senos, não aleatório por quadro) + empurrão direcional que volta com mola
  const s = shake * shake * 0.85, tt = performance.now() * 0.001;
  const nx = (Math.sin(tt * 41.3) + Math.sin(tt * 23.1 + 1.7) * 0.6) * s, ny = (Math.sin(tt * 37.7 + 0.4) + Math.sin(tt * 19.9 + 2.3) * 0.6) * s * 0.7, nz = (Math.sin(tt * 31.1 + 2.9) + Math.sin(tt * 27.3 + 0.8) * 0.6) * s;
  camKick.multiplyScalar(Math.exp(-rdt * 12));
  camera.position.set(camPos.x + nx + camKick.x, camPos.y + ny, camPos.z + nz + camKick.z);
  camera.lookAt(camLook.x + nx * 0.3 + camKick.x * 0.5, camLook.y, camLook.z + camKick.z * 0.5);
  // sombra acompanha o centro da área visível
  const sz = viewExt.ok ? camLook.z - (viewExt.top - viewExt.bot) * 0.5 : camLook.z;
  sun.position.set(camLook.x + 9, 20, sz + 7); sun.target.position.set(camLook.x, 0, sz);
}

// ---------------- Setas de borda (inimigos fora da tela) ----------------
const arrowLayer = document.createElement('div'); arrowLayer.id = 'arrow-layer'; $('hud').insertBefore(arrowLayer, $('btn-dash'));
const ARROW_N = 8, ARROW_COL = { zombie: '#8dff5a', fast: '#3ae8ff', tank: '#ff7a3a', sniper: '#ff3a5a', bomba: '#ffb020', escudo: '#5ab8ff' };
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
  const topM = (boss ? hudM.boss : hudM.top) + 22, botM = 26, sideM = 20; // abaixo do HUD/barra do chefe
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

// ---------------- Medidas do HUD (para câmera e setas) ----------------
const hudM = { top: 70, boss: 150 };
function measureHud() {
  if ($('hud').hidden) return;
  const t = document.querySelector('.hud-top').getBoundingClientRect();
  hudM.top = t.bottom;
  const bw = $('boss-wrap');
  if (!bw.hidden) hudM.boss = Math.max(t.bottom, bw.getBoundingClientRect().bottom);
  else hudM.boss = t.bottom + 50;
}

// ---------------- Indicador de direção do dano ----------------
const hitArcs = [];
for (let i = 0; i < 4; i++) { const el = document.createElement('div'); el.className = 'hit-arc'; el.style.opacity = '0'; $('hud').insertBefore(el, $('btn-dash')); hitArcs.push({ el, life: 0, x: 0, z: 0 }); }
let hitArcI = 0;
function showHitDir(sx, sz) {
  const A = hitArcs[hitArcI]; hitArcI = (hitArcI + 1) % hitArcs.length;
  A.life = 0.75; A.x = sx; A.z = sz;
}
const _hp2 = new THREE.Vector3();
function updateHitArcs(rdt) {
  let heroS = null;
  for (const A of hitArcs) {
    if (A.life <= 0) continue;
    A.life -= rdt;
    if (A.life <= 0 || state !== 'playing') { A.life = 0; A.el.style.opacity = '0'; continue; }
    if (!heroS) { _p.set(player.x, 1.2, player.z).project(camera); heroS = [(_p.x * 0.5 + 0.5) * innerWidth, (-_p.y * 0.5 + 0.5) * innerHeight]; }
    // direção na tela: do herói para a origem do golpe
    let dx = A.x - player.x, dz = A.z - player.z; const L = Math.hypot(dx, dz) || 1;
    _hp2.set(player.x + (dx / L) * 3, 1.2, player.z + (dz / L) * 3).project(camera);
    const ax = (_hp2.x * 0.5 + 0.5) * innerWidth - heroS[0], ay = (-_hp2.y * 0.5 + 0.5) * innerHeight - heroS[1];
    const ang = Math.atan2(ay, ax) + Math.PI / 2;
    const k = A.life / 0.75;
    A.el.style.transform = `translate(${heroS[0].toFixed(1)}px,${heroS[1].toFixed(1)}px) rotate(${ang.toFixed(3)}rad) scale(${(1.15 - 0.15 * k).toFixed(3)})`;
    A.el.style.opacity = Math.min(1, k * 1.6).toFixed(2);
  }
}

// ---------------- Vida baixa: vinheta pulsante + batimento ----------------
let lowOn = false, hbT = 0;
function updateLowHealth(rdt) {
  const want = state === 'playing' && player.hp > 0 && player.hp < 30;
  if (want !== lowOn) { lowOn = want; $('low-vignette').classList.toggle('on', want); }
  if (!want) { hbT = 0; return; }
  const k = player.hp / 30; // 0..1
  $('low-vignette').style.setProperty('--hb', (0.45 + 0.45 * k).toFixed(2) + 's');
  hbT -= rdt;
  if (hbT <= 0) { sfx.heartbeat(); hbT = 0.45 + 0.45 * k; }
}

// ---------------- HUD ----------------
const hud = { score: -1, wave: -1, hp: -1, combo: -1, pw: '' };
function updateHud() {
  if (hud.score !== score) { hud.score = score; $('hud-score').textContent = score.toLocaleString('pt-BR'); }
  const left = boss ? -2 : spawnQueue.length + enemies.length;
  if (hud.wave !== wave || hud.left !== left) {
    hud.wave = wave; hud.left = left;
    $('hud-wave').textContent = 'ONDA ' + wave + (left === -2 ? ' · CHEFE' : waveState === 'fight' && left > 0 ? ' · faltam ' + left : '');
    const goal = $('hud-goal'); const g = wave <= 2 && waveState === 'fight' ? '🎯 Derrote todos · chefe na onda 5' : '';
    if (goal.textContent !== g) { goal.textContent = g; goal.hidden = !g; }
  }
  const hp = Math.round(player.hp);
  if (hud.hp !== hp) {
    hud.hp = hp; const pct = (hp / player.maxHp) * 100 + '%';
    $('hp-fill').style.width = pct; $('hp-ghost').style.width = pct; $('hp-fill').classList.toggle('low', hp < 30);
  }
  const mult = Math.min(5, 1 + Math.floor(combo / 5));
  const cKey = combo >= 3 ? combo + 'x' + mult : '';
  if (hud.combo !== cKey) { hud.combo = cKey; const c = $('hud-combo'); c.hidden = !cKey; if (cKey) c.textContent = `COMBO ${combo}${mult > 1 ? ' · x' + mult : ''}`; }
  const W = WEAPONS[player.weapon];
  let pw = `<div class="wchip" style="--c:${W.css}">${W.icon} ${W.nome}</div>`;
  const own = ownedHtml(false);
  if (own) pw += `<div class="upg-row">${own}</div>`;
  for (const k of ['shotgun', 'rapid']) if (player[k] > 0) pw += `<div class="pchip" style="background:${PW[k].css}">${PW[k].label} ${Math.ceil(player[k])}s<i style="width:${(player[k] / PW[k].dur) * 100}%"></i></div>`;
  if (pw !== hud.pw) { hud.pw = pw; $('hud-power').innerHTML = pw; }
  $('btn-dash').classList.toggle('cool', player.dashCd > 0);
}

// ---------------- Clarão de tela / transições ----------------
function screenFlash(kind) { const el = $('flash'); el.className = ''; void el.offsetWidth; el.className = 'on ' + (kind || ''); }
function wipe() { const el = $('wipe'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
// ---------------- iOS / WebKit ----------------
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const unlockAudio = () => { if (audioState() !== 'running') initAudio(); };
for (const ev of ['touchend', 'pointerdown', 'keydown']) document.addEventListener(ev, unlockAudio, { capture: true, passive: true });
const canVibrate = typeof navigator.vibrate === 'function';
function iosHint() {
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
  if (!IOS || standalone || LS.get('cb-dica-ios', '0') === '1') return;
  LS.set('cb-dica-ios', '1');
  setTimeout(() => toast('📲 No Safari: Compartilhar → "Adicionar à Tela de Início" para jogar em tela cheia.'), 1200);
}
// ---------------- Tela cheia + tela sempre acesa (celular) ----------------
let fsTried = false, wakeSentinel = null;
function tryFullscreen() {
  if (fsTried || !touchMode || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) return;
  fsTried = true;
  const el = document.documentElement;
  try {
    if (el.requestFullscreen && !document.fullscreenElement) { const p = el.requestFullscreen({ navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); }
    else if (el.webkitRequestFullscreen && !document.webkitFullscreenElement) el.webkitRequestFullscreen(); // iPad; no iPhone não existe e o jogo segue normal
  } catch (_) {}
}
async function wakeLock(on) {
  try {
    if (on) { if (!wakeSentinel && navigator.wakeLock && document.visibilityState === 'visible') { wakeSentinel = await navigator.wakeLock.request('screen'); wakeSentinel.addEventListener('release', () => (wakeSentinel = null)); } }
    else if (wakeSentinel) { const w = wakeSentinel; wakeSentinel = null; await w.release(); }
  } catch (_) { wakeSentinel = null; }
}
// ---------------- Telas ----------------
const screens = ['tela-titulo', 'tela-tutorial', 'tela-config', 'tela-pausa', 'tela-fim', 'tela-cartas', 'tela-loja'];
// ---- conquistas (com aviso na tela, em fila)
const achQ = []; let achBusy = false;
function unlockAch(id) {
  if (demo) return; const a = ACH_BY[id]; if (!a || meta.ach[id]) return;
  meta.ach[id] = Date.now(); meta.coins += a.moedas; meta.earned += a.moedas;
  if (id === 'chefe5' && !meta.skins.includes('rubi')) meta.skins.push('rubi');
  saveMeta(); achQ.push(a); if (!achBusy) nextAch();
  if (meta.earned >= 1000) unlockAch('poupanca');
}
function nextAch() {
  const a = achQ.shift(), el = $('ach-toast');
  if (!a) { achBusy = false; el.hidden = true; return; }
  achBusy = true; el.innerHTML = `<span class="ic">${a.icon}</span><div><small>CONQUISTA!</small><b>${a.nome}</b><em>+${a.moedas} 🪙</em></div>`;
  el.hidden = true; void el.offsetWidth; el.hidden = false; sfx.ach(); vibrate(25);
  setTimeout(nextAch, 2700);
}
function runCoins() { return Math.round((Math.floor(score / 500) + wave * 3 + bossesKilled.n * 25) * (1 + 0.1 * lvl('moedas'))); }
const fmt = (n) => n.toLocaleString('pt-BR');
function paintCoins() { $('titulo-moedas').textContent = fmt(meta.coins); $('loja-moedas').textContent = fmt(meta.coins); }
function paintArenaSel() {
  $('arena-sel').innerHTML = Object.entries(ARENAS).map(([id, A]) => { const ok = arenaUnlocked(id); return `<button data-a="${id}" class="${arena === id ? 'on' : ''}${ok ? '' : ' lock'}" aria-pressed="${arena === id}">${A.icon} ${A.nome}${ok ? '' : `<small>🔒 Onda ${A.req}</small>`}</button>`; }).join('');
}
$('arena-sel').addEventListener('click', (ev) => {
  const b = ev.target.closest('button'); if (!b) return; initAudio(); sfx.click();
  const id = b.dataset.a, A = ARENAS[id];
  if (!arenaUnlocked(id)) { toast(`🔒 Chegue à onda ${A.req} para liberar o ${A.nome}.`); return; }
  setArena(id); paintArenaSel(); wipe();
});
let lojaTab = 'melhorias';
function skinSwatch(k) { const S = SKINS[k], h = (c) => '#' + c.toString(16).padStart(6, '0'); return `<span class="sw" style="--a:${h(S.suit)};--b:${h(S.armor)};--c:${h(S.cape)};--d:${h(S.visor)}"></span>`; }
function paintLoja() {
  paintCoins();
  for (const b of document.querySelectorAll('#tela-loja .tabs button')) b.classList.toggle('on', b.dataset.tab === lojaTab);
  let h = '';
  if (lojaTab === 'melhorias') for (const u of SHOP) {
    const l = lvl(u.id), mx = l >= u.max, c = u.custo[l];
    h += `<div class="li${mx ? ' done' : ''}"><span class="ic">${u.icon}</span><div class="tx"><b>${u.nome} <em>${l}/${u.max}</em></b><small>${u.desc(mx ? l : l + 1)}</small></div><button class="buy" data-buy="${u.id}" ${mx || meta.coins < c ? 'disabled' : ''}>${mx ? 'MÁX' : '🪙 ' + fmt(c)}</button></div>`;
  } else if (lojaTab === 'visuais') for (const k in SKINS) {
    const S = SKINS[k], own = meta.skins.includes(k), eq = meta.skin === k;
    const btn = eq ? '<button class="buy" disabled>EM USO</button>' : own ? `<button class="buy eq" data-skin="${k}">USAR</button>` : S.preco < 0 ? `<button class="buy" disabled>🏆</button>` : `<button class="buy" data-skin="${k}" ${meta.coins < S.preco ? 'disabled' : ''}>🪙 ${fmt(S.preco)}</button>`;
    h += `<div class="li${eq ? ' on' : ''}">${skinSwatch(k)}<div class="tx"><b>${S.nome}</b><small>${own ? (eq ? 'Equipado' : 'Seu') : S.preco < 0 ? 'Conquista: ' + ACH_BY[S.conquista].nome : 'Uniforme do Capitão'}</small></div>${btn}</div>`;
  } else {
    const n = ACH.filter((a) => meta.ach[a.id]).length;
    h += `<div class="ach-count">${n} de ${ACH.length} conquistas</div>`;
    for (const a of ACH) { const ok = !!meta.ach[a.id]; h += `<div class="li ach${ok ? ' done' : ' locked'}"><span class="ic">${ok ? a.icon : '🔒'}</span><div class="tx"><b>${a.nome}</b><small>${a.desc}</small></div><span class="rw">${ok ? '✔' : '+' + a.moedas + ' 🪙'}</span></div>`; }
  }
  $('loja-lista').innerHTML = h;
}
function openLoja() { initAudio(); sfx.click(); show('tela-loja'); paintLoja(); $('loja-lista').scrollTop = 0; }
$('btn-loja').addEventListener('click', openLoja);
$('btn-loja-ok').addEventListener('click', () => { sfx.click(); show('tela-titulo'); paintCoins(); });
for (const b of document.querySelectorAll('#tela-loja .tabs button')) b.addEventListener('click', () => { sfx.click(); lojaTab = b.dataset.tab; paintLoja(); $('loja-lista').scrollTop = 0; });
$('loja-lista').addEventListener('click', (ev) => {
  const b = ev.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.buy) {
    const u = SHOP.find((x) => x.id === b.dataset.buy), l = lvl(u.id), c = u.custo[l];
    if (l >= u.max || meta.coins < c) return;
    meta.coins -= c; meta.up[u.id] = l + 1; saveMeta(); sfx.pick(l + 1 >= u.max ? 'epico' : 'raro'); vibrate(20); toast(`${u.icon} ${u.nome} nível ${l + 1}!`);
  } else if (b.dataset.skin) {
    const k = b.dataset.skin, S = SKINS[k];
    if (!meta.skins.includes(k)) { if (S.preco < 0 || meta.coins < S.preco) return; meta.coins -= S.preco; meta.skins.push(k); sfx.coin(); unlockAch('estilo'); }
    else sfx.click();
    meta.skin = k; saveMeta(); hero.skin(k);
  }
  paintLoja();
});
function show(id) { for (const s of screens) $(s).hidden = s !== id; }
function paintSound() { const t = isMuted() ? '🔇 Som: desligado' : '🔊 Som: ligado'; $('btn-som').textContent = t; $('btn-som2').textContent = t; }
function clearWorld() {
  enemies = []; corpses.length = 0; pBullets.list.length = 0; trailMesh.count = 0; eBullets.list.length = 0; grenades.length = 0; grenMesh.count = 0; blasts.length = 0;
  hideAllTele(); stopLaser(); musicIntensity(0);
  for (const it of items) scene.remove(it.g); items = []; paintSwap(null);
  if (boss) { scene.remove(boss.g); boss = null; }
  $('boss-wrap').hidden = true; document.body.classList.remove('has-boss');
  for (const A of hitArcs) { A.life = 0; A.el.style.opacity = '0'; }
  for (let i = 0; i < NP; i++) pLife[i] = 0;
  debris.length = 0; clearDecals(); cine = null; $('cine').className = '';
}
function resetPlayer() {
  Object.assign(player, { x: 0, z: 0, hp: 100, inv: 0, face: Math.PI, dashT: 0, dashCd: 0, fireT: 0, shotgun: 0, rapid: 0, flashT: 0, mvx: 0, mvz: 0, recoil: 0, leanF: 0, leanS: 0, rollT: 0, rollK: 0, hitT: 0, deathT: 0 });
  hero.g.visible = true; hero.skin(meta.skin); poseHero(0, 0, 0, 0, 0);
}
function startGame() {
  initAudio(); sfx.click();
  if (LS.get('cb-tutorial', '0') !== '1') { openTutorial('primeira'); return; } // 1ª vez: tutorial rápido antes
  runId++;
  clearWorld(); resetPlayer(); resetRun();
  demo = false; state = 'playing'; cardsPending = false;
  if (arena === 'porto') unlockAch('porto');
  score = 0; kills = 0; combo = 0; maxCombo = 0; bossesKilled.n = 0; wave = 0; lastHit = ''; dashesUsed = 0;
  for (const k in hud) hud[k] = k === 'pw' ? '' : -1;
  show(null); $('hud').hidden = false; measureHud(); wipe();
  tryFullscreen(); wakeLock(true);
  camPos.set(0, 22, 14);
  music(true);
  startWave(1);
}
function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused'; show('tela-pausa'); music(false); stopLaser(); wakeLock(false); paintSwap(null);
  $('pausa-upg').innerHTML = `<div class="own"><span>${WEAPONS[player.weapon].icon}</span>${WEAPONS[player.weapon].nome}</div>` + (ownedHtml(true) || '<div class="own vazio">Nenhum poder ainda</div>');
  joy.id = aimS.id = null; joy.x = joy.y = aimS.x = aimS.y = 0; joyBase.hidden = aimBase.hidden = true; mouse.down = false;
}
function resumeGame() { if (state !== 'paused') return; sfx.click(); state = 'playing'; show(null); music(true); last = performance.now(); wakeLock(true); }
function toTitle() {
  sfx.click();
  runId++; clearWorld(); resetPlayer(); resetRun(); demo = true; state = 'title'; demoT = 0; wakeLock(false); wipe();
  $('hud').hidden = true; show('tela-titulo');
  $('titulo-recorde').textContent = best.toLocaleString('pt-BR'); paintCoins(); paintArenaSel();
  musicIntensity(0); music(true); // trilha calma no menu
}
function countUp(el, to, ms) {
  const t0 = performance.now(), id = ++countUp.id; el._cu = id; el.textContent = '0'; el.classList.add('counting');
  const step = (n) => {
    if (id !== el._cu) return; // cada número conta sozinho (pontos e moedas ao mesmo tempo)
    const k = Math.min(1, (n - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(to * e).toLocaleString('pt-BR');
    if (k < 1) { if (Math.random() < 0.35 && el.id === 'fim-pontos') sfx.tick(); requestAnimationFrame(step); } else el.classList.remove('counting');
  };
  requestAnimationFrame(step);
}
countUp.id = 0;
const LIVE_URL = 'https://kt3746.github.io/grokbot-capitao-bala/';
let lastRun = { score: 0, wave: 0, rec: false };
function shareText() {
  const r = lastRun;
  return r.rec ? `Bati meu recorde no CAPITÃO BALA: ${r.score.toLocaleString('pt-BR')} pontos, chegando à onda ${r.wave}! Duvido você me superar 💥` : `Fiz ${r.score.toLocaleString('pt-BR')} pontos e cheguei à onda ${r.wave} no CAPITÃO BALA (meu recorde: ${best.toLocaleString('pt-BR')})! Duvido você me superar 💥`;
}
function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = true; void el.offsetWidth; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 2200); }
async function copyText(t) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(t); return true; } } catch (_) {}
  try { const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-999px;top:0;opacity:0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (_) { return false; }
}
async function shareRecord() {
  sfx.click();
  const text = shareText(), data = { title: 'CAPITÃO BALA', text, url: LIVE_URL };
  if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
    try { await navigator.share(data); return 'share'; } catch (e) { if (e && e.name === 'AbortError') return 'abort'; }
  }
  const ok = await copyText(text + ' ' + LIVE_URL);
  toast(ok ? '✅ Texto copiado! Cole onde quiser.' : 'Não deu para copiar. Link: ' + LIVE_URL);
  return ok ? 'copy' : 'fail';
}
const DICAS = {
  zombie: 'Os zumbis cercam quem fica parado. Ande em círculos e use a ESQUIVA (💨) para atravessar o grupo.',
  fast: 'Os robôs velozes são frágeis: recue andando para trás enquanto atira e eles caem antes de chegar.',
  tank: 'O Blindado atira de longe: use os blocos como escudo e só chegue perto com uma arma forte.',
  sniper: 'Quando a linha vermelha do Atirador aparecer, saia dela para o lado ou use a esquiva.',
  bomba: 'Atire no Zumbi-Bomba de longe. Se o círculo vermelho aparecer, saia dele na hora!',
  escudo: 'O Guardião bloqueia tiros de frente: dê a volta e acerte pelas costas, ou use granadas.',
  chefe: 'Círculos e faixas vermelhas no chão avisam o golpe do chefe: saia antes de piscarem rápido.',
  tiroChefe: 'Os tiros do chefe vêm em leque: procure o espaço entre eles e use a esquiva para atravessar.',
};
function deathTip() {
  if (dashesUsed === 0 && wave >= 2) return 'Você não usou a ESQUIVA (💨) nenhuma vez: durante o rolamento nada te acerta!';
  if (wave <= 2 && !DICAS[lastHit]) return 'Continue sempre andando: parado você vira alvo fácil. O tiro é automático.';
  return DICAS[lastHit] || 'Pegue as cartas de poder entre as ondas: dano e cadência deixam tudo mais fácil.';
}
function showResults() {
  state = 'over'; wakeLock(false); paintSwap(null);
  const rec = score > best && score > 0;
  lastRun = { score, wave, rec };
  if (rec) { best = score; try { localStorage.setItem('cb-recorde', String(best)); } catch (_) {} sfx.record(); } else sfx.over();
  $('fim-titulo').textContent = wave >= 10 ? 'QUE BATALHA!' : 'FIM DE JOGO';
  $('fim-recorde').hidden = !rec;
  $('fim-dica').innerHTML = '<b>💡 Dica</b>' + deathTip();
  countUp($('fim-pontos'), score, 1300);
  $('fim-onda').textContent = wave;
  $('fim-abates').textContent = kills;
  $('fim-chefes').textContent = bossesKilled.n;
  $('fim-combo').textContent = maxCombo;
  $('fim-melhor').textContent = best.toLocaleString('pt-BR');
  $('fim-poderes').innerHTML = `<span class="ui">${WEAPONS[player.weapon].icon}</span>` + ownedHtml(false);
  // moedas e progresso permanente
  const coins = runCoins(), unl0 = arenaUnlocked('porto');
  meta.coins += coins; meta.earned += coins; meta.kills += kills; meta.runs++; meta.maxWave = Math.max(meta.maxWave, wave); saveMeta();
  $('fim-moedas').innerHTML = `+<b id="fim-moedas-n">0</b> 🪙 <small>total ${fmt(meta.coins)}</small>`; countUp($('fim-moedas-n'), coins, 900);
  if (meta.kills >= 500) unlockAch('abates500');
  if (meta.earned >= 1000) unlockAch('poupanca');
  if (!unl0 && arenaUnlocked('porto')) setTimeout(() => toast('⚓ Nova arena liberada: Porto Ferrugem!'), 900);
  $('hud').hidden = true;
  show('tela-fim');
}
$('btn-jogar').addEventListener('click', startGame);
$('btn-como').addEventListener('click', () => { initAudio(); sfx.click(); openTutorial('menu'); });

// ---------------- Tutorial rápido (1ª vez + "Como jogar") ----------------
const TUT_TOUCH = [
  { art: 'move', t: 'Andar', x: 'Arraste o <b>polegar esquerdo</b> em qualquer lugar da metade <b>esquerda</b> da tela para andar.' },
  { art: 'fire', t: 'Tiro automático', x: 'O Capitão <b>atira sozinho</b> no inimigo mais perto. Quer mirar? Arraste o polegar na metade <b>direita</b>.' },
  { art: 'dash', t: 'ESQUIVA', x: 'Toque no botão <b>ESQUIVA</b> para um pulo rápido: você fica <b>invencível</b> por um instante!' },
  { art: 'items', t: 'Itens e chefes', x: 'Depois de cada onda, <b>escolha um PODER</b>. Pegue <span class="pw o">ESPINGARDA</span> <span class="pw c">TIRO RÁPIDO</span> <span class="pw g">VIDA</span> e <b>armas novas</b>. A cada <b>5 ondas</b>, um <b>CHEFE</b>: fuja das áreas vermelhas!' },
];
const TUT_PC = [
  { art: 'keys', t: 'Andar', x: 'Use <b>WASD</b> ou as <b>setas</b> do teclado para andar.' },
  { art: 'fire', t: 'Tiro automático', x: 'O Capitão <b>atira sozinho</b> no inimigo mais perto. Para mirar, <b>segure o clique</b> do mouse onde quiser.' },
  { art: 'dash', t: 'ESQUIVA e pausa', x: '<b>Espaço</b> faz a ESQUIVA (invencível por um instante). <b>P</b> ou <b>Esc</b> pausa o jogo.' },
  TUT_TOUCH[3],
];
let tutMode = 'menu', tutStep = 0, tutSteps = TUT_TOUCH;
function openTutorial(mode) {
  tutMode = mode; tutStep = 0; tutSteps = touchMode ? TUT_TOUCH : TUT_PC;
  paintTutorial(); show('tela-tutorial');
}
function paintTutorial() {
  const S = tutSteps[tutStep];
  $('tut-art').className = 'tut-art art-' + S.art;
  $('tut-titulo').textContent = S.t;
  $('tut-txt').innerHTML = S.x;
  $('tut-dots').innerHTML = tutSteps.map((_, i) => `<i class="${i === tutStep ? 'on' : ''}"></i>`).join('');
  const lastStep = tutStep === tutSteps.length - 1;
  $('tut-prox').textContent = lastStep ? (tutMode === 'primeira' ? '▶ Começar!' : 'Entendi!') : 'Próximo ▶';
}
function closeTutorial() {
  LS.set('cb-tutorial', '1');
  if (tutMode === 'primeira') startGame(); else show('tela-titulo');
}
$('tut-prox').addEventListener('click', () => { sfx.click(); if (tutStep < tutSteps.length - 1) { tutStep++; paintTutorial(); } else closeTutorial(); });
$('tut-pular').addEventListener('click', () => { sfx.click(); closeTutorial(); });

// ---------------- Configurações ----------------
let cfgBack = 'tela-titulo';
function paintConfig() {
  for (const b of document.querySelectorAll('#seg-qual button')) b.classList.toggle('on', b.dataset.q === qualPref);
  for (const b of document.querySelectorAll('#seg-vib button')) b.classList.toggle('on', (b.dataset.v === '1') === vibOn);
  for (const b of document.querySelectorAll('#seg-som button')) b.classList.toggle('on', (b.dataset.s === '1') === !isMuted());
  for (const b of document.querySelectorAll('#seg-trem button')) b.classList.toggle('on', +b.dataset.t === shakeMul);
  const cur = TIERS[tierIdx].label + (sun.castShadow ? '' : ' (sem sombras)');
  const dev = DEV.cls === 'high' ? 'aparelho forte' : DEV.cls === 'mid' ? 'aparelho intermediário' : 'aparelho básico';
  $('cfg-info').textContent = qpOk ? `Fixada pelo link (?q=${qp}): ${cur}.` : qualPref === 'auto' ? `Automática: ${cur} · ${dev}. Ajusta sozinha conforme o FPS.` : `Fixa em ${cur}.`;
}
function openConfig(back) { cfgBack = back; paintConfig(); paintVolumes(); show('tela-config'); }
function paintVolumes() { const V = getVolumes(); for (const el of document.querySelectorAll('.vol input')) { el.value = Math.round(V[el.dataset.k] * 100); el.nextElementSibling.textContent = el.value + '%'; el.style.setProperty('--p', el.value + '%'); } }
let volTick = 0;
for (const el of document.querySelectorAll('.vol input')) el.addEventListener('input', () => {
  initAudio(); setVolume(el.dataset.k, el.value / 100); paintVolumes();
  if (el.dataset.k === 'musica') { if (state !== 'playing') { musicIntensity(0); music(true); } }
  else if (performance.now() - volTick > 120) { volTick = performance.now(); sfx.coin(); }
});
if (!canVibrate) { $('seg-vib').hidden = true; $('vib-off').hidden = false; }
for (const b of document.querySelectorAll('#seg-qual button')) b.addEventListener('click', () => {
  sfx.click(); qualPref = b.dataset.q; LS.set('cb-qualidade', qualPref);
  if (!qpOk) { tierIdx = prefTier(); maxTier = isAuto() ? autoMaxTier() : tierIdx; lowCount = highCount = 0; applyTier(); }
  paintConfig();
});
for (const b of document.querySelectorAll('#seg-vib button')) b.addEventListener('click', () => { vibOn = b.dataset.v === '1'; LS.set('cb-vibrar', vibOn ? '1' : '0'); sfx.click(); vibrate(30); paintConfig(); });
for (const b of document.querySelectorAll('#seg-trem button')) b.addEventListener('click', () => { shakeMul = +b.dataset.t; LS.set('cb-tremor', String(shakeMul)); sfx.click(); shake = 0; addShake(0.6); paintConfig(); });
for (const b of document.querySelectorAll('#seg-som button')) b.addEventListener('click', () => { initAudio(); setMuted(b.dataset.s !== '1'); paintSound(); sfx.click(); paintConfig(); });
$('btn-config').addEventListener('click', () => { initAudio(); sfx.click(); openConfig('tela-titulo'); });
$('btn-config2').addEventListener('click', () => { sfx.click(); openConfig('tela-pausa'); });
$('btn-config-ok').addEventListener('click', () => { sfx.click(); show(cfgBack); });
const toggleSound = () => { initAudio(); setMuted(!isMuted()); paintSound(); sfx.click(); };
$('btn-som').addEventListener('click', toggleSound);
$('btn-som2').addEventListener('click', toggleSound);
$('btn-pause').addEventListener('click', (e) => { e.stopPropagation(); initAudio(); sfx.click(); pauseGame(); });
$('btn-continuar').addEventListener('click', resumeGame);
$('btn-reiniciar').addEventListener('click', startGame);
$('btn-menu').addEventListener('click', toTitle);
$('btn-denovo').addEventListener('click', startGame);
$('btn-fim-menu').addEventListener('click', toTitle);
$('btn-share').addEventListener('click', () => { shareRecord(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

// ---------------- Cartas de poder (entre ondas) ----------------
let cardOffer = [], cardFocus = 0, cardArmT = 0;
function rollCards() {
  const pool = UPGRADES.filter((u) => (u.cond ? u.cond() : true) && L(u.id) < u.max && !(u.rar === 'arma' && wave < 2));
  const out = []; let hasWeapon = false;
  while (out.length < 3 && pool.length) {
    let tot = 0; for (const u of pool) tot += RAR[u.rar].peso;
    let r = Math.random() * tot, pick = pool[pool.length - 1];
    for (const u of pool) { r -= RAR[u.rar].peso; if (r <= 0) { pick = u; break; } }
    pool.splice(pool.indexOf(pick), 1);
    if (pick.rar === 'arma') { if (hasWeapon) continue; hasWeapon = true; }
    out.push(pick);
  }
  return out;
}
function resetSticks() { joy.id = aimS.id = null; joy.x = joy.y = aimS.x = aimS.y = 0; joyBase.hidden = aimBase.hidden = true; mouse.down = false; for (const k in keys) keys[k] = false; }
function openCards() {
  state = 'upgrade'; stopLaser(); resetSticks();
  cardOffer = rollCards(); cardFocus = 0;
  const el = $('cartas');
  el.innerHTML = cardOffer.map((u, i) => `<button class="card r-${u.rar}" data-i="${i}" style="--d:${i * 0.07}s"><span class="c-rar">${RAR[u.rar].nome}</span><span class="c-icon">${u.icon}</span><span class="c-txt"><span class="c-nome">${u.nome}</span><span class="c-desc">${u.desc(L(u.id) + 1)}</span>${u.hide ? '' : `<span class="c-lvl">Nível ${L(u.id) + 1}/${u.max}</span>`}</span>${touchMode ? '' : `<span class="c-key">${i + 1}</span>`}</button>`).join('');
  $('cartas-sub').textContent = `Onda ${wave} concluída!`;
  $('cartas-dica').textContent = touchMode ? 'Toque em uma carta' : 'Clique ou use 1, 2, 3 (ou setas + Enter)';
  el.classList.remove('armed'); cardArmT = performance.now() + 450; // evita toque acidental do polegar que estava jogando
  setTimeout(() => el.classList.add('armed'), 450);
  paintCardFocus(); show('tela-cartas'); sfx.cards();
  if (DEBUG && bot.on) setTimeout(() => pickCard(botChoose(cardOffer), true), 40);
}
function paintCardFocus() { [...$('cartas').children].forEach((c, i) => c.classList.toggle('focus', !touchMode && i === cardFocus)); }
function pickCard(i, force) {
  if (state !== 'upgrade' || !cardOffer[i]) return;
  if (!force && performance.now() < cardArmT) return;
  const u = cardOffer[i];
  if (!u.hide) up[u.id] = L(u.id) + 1;
  if (u.rar === 'epico') unlockAch('epica');
  if (u.apply) u.apply();
  recalcStats(); runPicks.push(u.id);
  sfx.pick(u.rar); vibrate(20);
  show(null); state = 'playing'; last = performance.now(); interT = 1.3; hud.pw = '#'; hud.hp = -1;
  showBanner(`${u.icon} ${u.nome}<small>${u.hide ? 'Pronto!' : 'Nível ' + L(u.id)}</small>`, 'pick');
}
function cardKey(e) {
  const m = /^(?:Digit|Numpad)([1-3])$/.exec(e.code);
  if (m) { pickCard(+m[1] - 1); e.preventDefault(); return; }
  if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { cardFocus = (cardFocus + cardOffer.length - 1) % cardOffer.length; paintCardFocus(); e.preventDefault(); }
  else if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { cardFocus = (cardFocus + 1) % cardOffer.length; paintCardFocus(); e.preventDefault(); }
  else if (e.code === 'Enter' || e.code === 'Space') { pickCard(cardFocus); e.preventDefault(); }
}
$('cartas').addEventListener('click', (e) => { const b = e.target.closest('.card'); if (b) pickCard(+b.dataset.i); });

// ---------------- Robô de teste (só com ?debug=1): joga sozinho para balancear ----------------
const bot = { on: false, mode: 'prio' };
const runLog = [];
const BOT_PRIO = ['w_laser', 'multi', 'dano', 'cadencia', 'escudo', 'explosao', 'perfura', 'vidamax', 'cura', 'critico', 'ricochete', 'vampiro', 'veloc', 'esquiva', 'ima', 'w_granada', 'w_leque'];
function botChoose(offer) {
  if (bot.mode !== 'prio') return Math.floor(Math.random() * offer.length);
  let best = 0, bp = 99;
  offer.forEach((u, i) => { const p = BOT_PRIO.indexOf(u.id); if (p >= 0 && p < bp) { bp = p; best = i; } });
  return best;
}
function botInput(dt) {
  // modo 'casual' imita um humano mediano: reage a cada 0,25 s, ignora metade dos tiros e quase não usa esquiva
  const cas = bot.mode === 'casual';
  if (cas) { bot.rt = (bot.rt || 0) - dt; if (bot.rt > 0 && bot.last) return [bot.last[0], bot.last[1], false]; bot.rt = 0.25; }
  let fx = 0, fz = 0, danger = false;
  for (const e of enemies) {
    if (e.spawn > 0) continue;
    const dx = player.x - e.x, dz = player.z - e.z, d2 = dx * dx + dz * dz;
    if (d2 < 100) { const d = Math.sqrt(d2) || 0.01, w = ((e.type === 'tank' ? 1.6 : 1) * 6) / (d2 + 1); fx += (dx / d) * w; fz += (dz / d) * w; if (d < e.r + 1.1) danger = true; }
  }
  for (const b of eBullets.list) {
    if (cas && (b.x * 7.3 + b.z * 3.1) % 2 > 1) continue;
    const dx = player.x - b.x, dz = player.z - b.z, d2 = dx * dx + dz * dz;
    if (d2 < 20 && dx * b.vx + dz * b.vz > 0) { const vl = Math.hypot(b.vx, b.vz) || 1, px = -b.vz / vl, pz = b.vx / vl, side = dx * px + dz * pz >= 0 ? 1 : -1, w = 5 / (d2 + 0.5); fx += px * side * w; fz += pz * side * w; if (d2 < 1.3) danger = true; }
  }
  if (boss) { const dx = player.x - boss.x, dz = player.z - boss.z, d2 = dx * dx + dz * dz, d = Math.sqrt(d2) || 0.01, w = 40 / (d2 + 1); fx += (dx / d) * w; fz += (dz / d) * w; if (d < boss.r + 1.5) danger = true; }
  for (const T of TELE) {
    if (!T.on || !T.hurt) continue;
    if (T.kind === 'circle') { const dx = player.x - T.x, dz = player.z - T.z, d = Math.hypot(dx, dz) || 0.01; if (d < T.r + 0.8) { fx += (dx / d) * 4; fz += (dz / d) * 4; if (T.t > T.dur * 0.65) danger = true; } }
    else { const ux = Math.sin(T.ang), uz = Math.cos(T.ang), rx = player.x - T.x, rz = player.z - T.z, t = rx * ux + rz * uz, px = rx - ux * t, pz = rz - uz * t, pd = Math.hypot(px, pz) || 0.01; if (t > -1 && t < T.len + 1 && pd < T.w / 2 + 1) { fx += (px / pd) * 4; fz += (pz / pd) * 4; if (T.t > T.dur * 0.7) danger = true; } }
  }
  for (const e of enemies) { // mira do Atirador: sai da linha
    if (e.type !== 'sniper' || !(e.aimT > 0)) continue;
    const a = Math.atan2(e.ax - e.x, e.az - e.z), ux = Math.sin(a), uz = Math.cos(a), rx = player.x - e.x, rz = player.z - e.z, t = rx * ux + rz * uz, px = rx - ux * t, pz = rz - uz * t, pd = Math.hypot(px, pz) || 0.01;
    if (t > 0 && pd < 2) { fx += (px / pd) * 5; fz += (pz / pd) * 5; if (e.aimT < 0.35) danger = true; }
  }
  fx += -player.x * 0.03; fz += -player.z * 0.03;
  let bestI = null, bd = 144;
  for (const it of items) { if (it.kind === 'health' && player.hp >= player.maxHp * 0.8) continue; const d2 = (it.g.position.x - player.x) ** 2 + (it.g.position.z - player.z) ** 2; if (d2 < bd) { bd = d2; bestI = it; } }
  let fl = Math.hypot(fx, fz);
  if (bestI && fl < 2.5) { const dx = bestI.g.position.x - player.x, dz = bestI.g.position.z - player.z, d = Math.sqrt(bd) || 1; fx += (dx / d) * 0.9; fz += (dz / d) * 0.9; }
  fl = Math.hypot(fx, fz);
  if (fl < 0.15) { fx = -player.z * 0.1 + 0.2; fz = player.x * 0.1; fl = Math.hypot(fx, fz); }
  if (cas) { const a = Math.atan2(fx, fz) + rand(-0.5, 0.5); bot.last = [Math.sin(a), Math.cos(a)]; return [bot.last[0], bot.last[1], danger && player.dashCd <= 0 && Math.random() < 0.25]; }
  return [fx / fl, fz / fl, danger && player.dashCd <= 0];
}
let simSpeed = 1;

// ---------------- Loop ----------------
let last = performance.now(), fAcc = 0, fN = 0, fpsNow = 60, lowCount = 0, highCount = 0, lastDown = -1e9, lastUp = -1e9, upBlockUntil = 0;
function stepSim(rdt) {
  let dt = rdt;
  if (hitstop > 0) { hitstop -= rdt; dt = 0; }
  if (slowT > 0) { slowT -= rdt; dt *= slowT > 0.5 ? slowK : slowK + (1 - slowK) * (1 - Math.max(0, slowT) / 0.5); } // sai da câmera lenta suavemente
  if (state === 'title' || (state === 'playing' && !cine)) updatePlayer(dt);
  else if (state === 'playing' && cine) { player.mvx = player.mvz = 0; poseHero(0, 0, 0, 0, 0); hero.g.visible = true; }
  if (state !== 'over') { updateWaves(dt); updateEnemies(dt); if (boss) updateBoss(dt); updateBullets(dt); processBlasts(); updateItems(dt); }
  if (state === 'dying') { dyingT -= rdt; player.deathT += rdt * 1.6; poseHero(0, 0, 0, 0, player.deathT); hero.g.visible = true; if (dyingT <= 0) showResults(); }
  comboT -= dt; if (comboT <= 0) combo = 0;
  // brasas no ar
  if (Math.random() < 0.6) emit(camLook.x + rand(-16, 16), 0.2, camLook.z + rand(-14, 14), rand(-0.3, 0.3), rand(0.6, 1.4), rand(-0.3, 0.3), [1.6, 0.6, 0.15], 3, 0.12, 0.02, 0.1, 0.2);
  updateParticles(dt); updateDebris(dt); updateRings(dt); updateDmg(dt); updateTele(dt); updateDecals(dt); updateBlobs();
  muzzleLight.intensity *= Math.exp(-rdt * 30);
  boomI *= Math.exp(-rdt * 9); boomLight.intensity = boomI;
  neonMesh.material.emissiveIntensity = 1;
  updateGlow();
}
const perfFrame = { calls: 0, triangles: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now;
  const rdt = Math.min(0.05, Math.max(0, raw));
  fAcc += raw; fN++;
  if (fAcc >= 2) {
    fpsNow = fN / fAcc; fAcc = 0; fN = 0;
    if (isAuto() && (state === 'playing' || state === 'title') && !document.hidden) {
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
  const frozen = state === 'paused' || state === 'upgrade';
  if (!frozen) {
    const steps = DEBUG && state === 'playing' ? simSpeed : 1;
    for (let i = 0; i < steps; i++) stepSim(rdt);
    updateCine(rdt);
    if (state === 'playing') updateHud();
  if (state === 'playing') { musicIntensity(boss ? (boss.p2 ? 3 : 2) : waveState === 'fight' ? 1 : 0); setWaveLevel(wave); }
  setLowHp(state === 'playing' && lowOn);
  }
  updateCamera(0, frozen ? 0 : rdt);
  updateArrows(); updateHitArcs(frozen ? 0 : rdt); updateLowHealth(frozen ? 0 : rdt);
  renderer.info.reset();
  if (bloom.enabled) composer.render(); else renderer.render(scene, camera);
  perfFrame.calls = renderer.info.render.calls; perfFrame.triangles = renderer.info.render.triangles;
}

if (DEBUG) window.__CB = {
  get state() { return state; }, get fps() { return fpsNow; }, get tier() { return TIERS[tierIdx].name; },
  get wave() { return wave; }, get enemies() { return enemies.length; }, get score() { return score; }, get hp() { return player.hp; },
  get boss() { return boss ? { hp: boss.hp, name: boss.name } : null; },
  skipTo(n) { clearWorld(); startWave(n); }, killAll() { for (const e of enemies) damageEnemy(e, 9999, 0, 1); if (boss) damageBoss(99999); },
  hurt(n) { player.inv = 0; player.dashT = 0; hurtPlayer(n, player.x + 1, player.z); }, drop(k) { dropItem(player.x + 2, player.z, k); }, info: () => renderer.info.render,
  mem: () => ({ ...renderer.info.memory, programs: renderer.info.programs.length }), restart: () => startGame(), menu: () => toTitle(),
  setTier(i) { tierIdx = clamp(i, 0, 2); applyTier(); }, get items() { return items.length; }, get view() { return { ...viewExt }; },
  get player() { return { x: player.x, z: player.z }; }, get dev() { return { ...DEV, tierIdx, maxTier, qualPref, vibOn, shadow: sun.castShadow, pr: renderer.getPixelRatio() }; },
  hurtFrom(n, sx, sz) { player.inv = 0; player.dashT = 0; hurtPlayer(n, sx, sz); }, get hitArcs() { return hitArcs.filter((A) => A.life > 0).length; }, get lowHealth() { return lowOn; },
  get hudM() { return { ...hudM }; },
  sceneStats() { const g = new Set(); let o = 0; scene.traverse((c) => { o++; if (c.geometry) g.add(c.geometry.uuid); }); return { objects: o, geos: g.size, types: [...new Set([...g])].length }; }, teleport(x, z) { player.x = x; player.z = z; },
  arrows: () => arrows.filter((A) => A.on).length + (bossArrow.on ? 1 : 0), get bossArrow() { return bossArrow.on; },
  screen(x, z) { _p.set(x, 1, z).project(camera); return { x: (_p.x * 0.5 + 0.5) * window.innerWidth, y: (-_p.y * 0.5 + 0.5) * window.innerHeight }; },
  get bossPos() { return boss ? { x: boss.x, z: boss.z, enter: boss.enter, act: boss.act, step: boss.actStep, y: boss.y } : null; },
  bot(on, mode = 'prio') { bot.on = on; bot.mode = mode; }, speed(n) { simSpeed = clamp(n | 0, 1, 8); }, get runLog() { return runLog; }, clearLog() { runLog.length = 0; },
  weapon(w) { setWeapon(w); }, get weaponNow() { return player.weapon; }, get cards() { return cardOffer.map((u) => u.id); }, pickCard(i) { pickCard(i, true); },
  get up() { return { ...up }; }, get stats() { return { ...stats }; }, giveUp(id, n = 1) { up[id] = Math.min(UPG_BY[id].max, L(id) + n); recalcStats(); hud.pw = '#'; },
  get tele() { return TELE.filter((T) => T.on).map((T) => T.kind); }, forceAct(a) { if (boss) { boss.act = a; boss.actStep = 0; boss.actTimer = 0; boss.shots = 0; } },
  get laser() { return player.laserOn; }, get grenades() { return grenades.length; }, get pb() { return pBullets.list.length; }, get maxHp() { return player.maxHp; },
  openCards() { openCards(); }, get swap() { return swapIt ? PW[swapIt.kind].weapon : null; }, swapNow() { swapWeapon(); }, get corpses() { return corpses.length; },
  arena(id) { setArena(id, true); paintArenaSel(); }, get arenaNow() { return arena; }, spawn(t, dx = 0, dz = 7) { return spawnEnemy(t, player.x + dx, player.z + dz); },
  get meta() { return JSON.parse(JSON.stringify(meta)); }, setMeta(o) { resetMeta(o); setArena(meta.arena); hero.skin(meta.skin); paintCoins(); paintArenaSel(); }, unlock(id) { unlockAch(id); },
  perf: () => ({ ...perfFrame }), get cine() { return cine ? +cine.t.toFixed(2) : null; }, get decals() { return decals.filter((D) => D.on).length; }, loja(tab) { lojaTab = tab || 'melhorias'; openLoja(); },
  get types() { const c = {}; for (const e of enemies) c[e.type] = (c[e.type] || 0) + 1; return c; }, get sniperAim() { return enemies.filter((e) => e.type === 'sniper' && e.aimT > 0).length; }, enemyList: () => enemies.map((e) => ({ t: e.type, x: +e.x.toFixed(1), z: +e.z.toFixed(1), hp: Math.round(e.hp), face: +e.face.toFixed(2), aim: +(e.aimT || 0).toFixed(2), fuse: +(e.fuse || 0).toFixed(2) })),
  setFace(i, f) { if (enemies[i]) enemies[i].face = f; }, hitEnemy(i, dmg, vx, vz) { const e = enemies[i]; if (!e) return null; if (shieldBlocks(e, vx, vz)) return 'bloqueado'; e.back = isBehind(e, vx, vz); damageEnemy(e, dmg, vx, vz); return e.dead ? 'morto' : 'ok'; }, splat(k) { splat(player.x + 2, player.z, k, 2); }, clearQueue() { spawnQueue.length = 0; }, keepOnly(ids) { enemies = enemies.filter((e) => ids.includes(e.id)); }, lastId: () => enemySeq, get eb() { return eBullets.list.length; }, tough() { for (const e of enemies) e.hp = e.maxHp = 1e6; }, freeze(on) { for (const e of enemies) e.speed = on ? 0.001 : TYPES[e.type].speed; },
  get p2() { return boss ? { p2: boss.p2, roar: +boss.roarT.toFixed(2), act: boss.act, hp: Math.round(boss.hp), max: boss.maxHp } : null; }, bossHalf() { if (boss) damageBoss(boss.hp - boss.maxHp * 0.49, true); }, bossHeal() { if (boss) boss.hp = boss.maxHp * 0.49; },
  get audio() { return { state: audioState(), level: musicLevel(), vol: getVolumes() }; }, get tip() { return deathTip(); }, get lastHit() { return lastHit; }, get ios() { return { IOS, canVibrate }; },
  get heroScale() { return hero.g.scale.x; },
  get shakeMul() { return shakeMul; }, get wake() { return !!wakeSentinel; }, get flashCls() { return $("flash").className; }, get slow() { return { slowT, slowK }; }, get lastShare() { return shareText(); }, share: () => shareRecord(), get appV() { return APP_V; },
  dropAt(k, dx = 0, dz = 0) { dropItem(player.x + dx, player.z + dz, k); }, forceOver() { score = 12345; wave = 7; showResults(); },
};

paintSound(); iosHint();
setArena(meta.arena); paintCoins(); paintArenaSel();
$('titulo-recorde').textContent = best.toLocaleString('pt-BR');
applyTier();
resetPlayer();
// pré-compila chefe e itens (sem travada no 1º chefe / 1º item)
{
  const pre = [bossModel.g, ...Object.keys(PW).map((k) => buildItem(k).g)];
  pre.forEach((o, i) => { o.position.set(i * 3 - 4, 0, 2); o.traverse((c) => (c.frustumCulled = false)); scene.add(o); });
  const fx = [laserBeam, laserCore, hero.shield, ...TELE.flatMap((T) => [T.ring, T.disc, T.lineBg, T.lineFill])];
  bossModel.fury.visible = true; fx.forEach((m) => (m.visible = true)); portoGroup.visible = cityGroup.visible = true; decalMesh.count = aimMesh.count = 1; decalMesh.setMatrixAt(0, new THREE.Matrix4()); aimMesh.setMatrixAt(0, new THREE.Matrix4()); grenMesh.count = 1; grenMesh.setMatrixAt(0, new THREE.Matrix4()); trailMesh.count = 1; trailMesh.setMatrixAt(0, new THREE.Matrix4());
  updateCamera(0, 0.016);
  renderer.compile(scene, camera);
  composer.render(); renderer.render(scene, camera);
  pre.forEach((o) => { scene.remove(o); o.traverse((c) => (c.frustumCulled = true)); });
  bossModel.fury.visible = false; fx.forEach((m) => (m.visible = false)); grenMesh.count = 0; trailMesh.count = 0; decalMesh.count = aimMesh.count = 0; setArena(arena);
}
$('loading').hidden = true;
// girar o celular no meio da partida: remede o HUD e solta os joysticks (as coordenadas mudaram)
let rotT = 0;
window.addEventListener('resize', () => { clearTimeout(rotT); rotT = setTimeout(() => { if (!$('hud').hidden) measureHud(); if (state === 'playing') resetSticks(); }, 150); });
const APP_V = new URL(import.meta.url).searchParams.get('v') || 'dev';
if ('serviceWorker' in navigator && !new URLSearchParams(location.search).has('nosw') && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js?v=' + APP_V, { scope: './' }).then((reg) => { reg.update().catch(() => {}); }).catch(() => {});
  });
}
requestAnimationFrame((t) => { last = t; frame(t); });
