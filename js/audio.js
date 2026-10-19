// Sons sintetizados com WebAudio (nada de arquivos externos)
// Mixagem: efeitos e música em barramentos separados -> volume geral -> compressor -> saída.
// A música tem camadas por intensidade (calma, combate, chefe, chefe fase 2), filtro abafado com vida baixa
// e "ducking" (abaixa sozinha) nos sons grandes, para os golpes importantes aparecerem.
let ctx = null, master = null, musicGain = null, sfxGain = null, duckGain = null, musicFilter = null, noiseBuf = null;
let muted = false;
const VOL = { geral: 0.8, musica: 0.7, efeitos: 0.9 };
try {
  muted = localStorage.getItem('cb-mudo') === '1';
  const v = JSON.parse(localStorage.getItem('cb-volume') || 'null');
  if (v) for (const k in VOL) if (typeof v[k] === 'number') VOL[k] = Math.min(1, Math.max(0, v[k]));
} catch (_) {}
let musicOn = false, musicTimer = null, step = 0, nextTime = 0, intensity = 0, laserNodes = null, lowHp = false, waveLvl = 1;
const MASTER_K = 0.7, MUSIC_K = 0.42, SFX_K = 1;

export function initAudio() {
  if (ctx) { if (ctx.state !== 'running') ctx.resume().catch(() => {}); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try { ctx = new AC(); } catch (_) { ctx = null; return; }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : VOL.geral * MASTER_K;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.18;
  master.connect(comp); comp.connect(ctx.destination);
  sfxGain = ctx.createGain(); sfxGain.gain.value = VOL.efeitos * SFX_K; sfxGain.connect(master);
  musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 16000; musicFilter.Q.value = 0.7;
  duckGain = ctx.createGain(); duckGain.gain.value = 1;
  musicGain = ctx.createGain(); musicGain.gain.value = VOL.musica * MUSIC_K;
  musicGain.connect(musicFilter); musicFilter.connect(duckGain); duckGain.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // iOS/WebKit: tocar um buffer silencioso dentro do 1º toque destrava o áudio
  try { const b = ctx.createBuffer(1, 1, 22050), src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start(0); } catch (_) {}
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
}
export function audioState() { return ctx ? ctx.state : 'none'; }
export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('cb-mudo', m ? '1' : '0'); } catch (_) {}
  if (master) master.gain.setTargetAtTime(m ? 0 : VOL.geral * MASTER_K, ctx.currentTime, 0.02);
}
export function getVolumes() { return { ...VOL }; }
export function setVolume(k, v) {
  if (!(k in VOL)) return; VOL[k] = Math.min(1, Math.max(0, v));
  try { localStorage.setItem('cb-volume', JSON.stringify(VOL)); } catch (_) {}
  if (!ctx) return; const t = ctx.currentTime;
  if (k === 'geral' && !muted) master.gain.setTargetAtTime(VOL.geral * MASTER_K, t, 0.03);
  if (k === 'musica') musicGain.gain.setTargetAtTime(VOL.musica * MUSIC_K, t, 0.03);
  if (k === 'efeitos') sfxGain.gain.setTargetAtTime(VOL.efeitos * SFX_K, t, 0.03);
}
// abaixa a música por um instante (explosões grandes, chefe, dano)
export function duck(depth = 0.45, hold = 0.25) {
  if (!ctx) return; const t = ctx.currentTime, g = duckGain.gain;
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(depth, t + 0.03); g.setTargetAtTime(1, t + 0.03 + hold, 0.25);
}
export function setLowHp(on) {
  if (on === lowHp) return; lowHp = on;
  if (ctx) musicFilter.frequency.setTargetAtTime(on ? 650 : 16000, ctx.currentTime, on ? 0.25 : 0.5);
}
export function setWaveLevel(n) { waveLvl = n; }
export function suspend(s) { if (!ctx) return; if (s) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); }

function tone(type, f0, f1, dur, vol, when = 0, dest = sfxGain) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, freq, q = 1, type = 'lowpass', when = 0, dest = sfxGain, fEnd) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (fEnd) f.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
function pad(freqs, dur, vol, when = 0, type = 'triangle') {
  if (!ctx) return;
  const t = ctx.currentTime + when, g = ctx.createGain(), f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 900; f.connect(g); g.connect(musicGain);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  for (const fr of freqs) for (const det of [-6, 6]) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = fr; o.detune.value = det; o.connect(f); o.start(t); o.stop(t + dur + 0.05); }
}
let lastShot = 0;
export const sfx = {
  shot(shotgun) {
    if (!ctx) return; const n = ctx.currentTime; if (n - lastShot < 0.045) return; lastShot = n;
    if (shotgun) { noise(0.18, 0.5, 1800, 0.7, 'lowpass', 0, sfxGain, 300); tone('square', 160, 50, 0.12, 0.18); }
    else { tone('square', 880 + Math.random() * 80, 220, 0.07, 0.11); noise(0.05, 0.22, 3000, 0.8, 'highpass'); }
  },
  hit() { tone('triangle', 420, 160, 0.06, 0.14); },
  metal() { tone('square', 1300, 600, 0.05, 0.07); noise(0.04, 0.12, 5000, 2, 'bandpass'); },
  explode(big) {
    if (big) duck(0.5, 0.2);
    noise(big ? 1.1 : 0.45, big ? 0.9 : 0.55, big ? 900 : 1400, 0.8, 'lowpass', 0, sfxGain, 60);
    tone('sine', big ? 120 : 160, 30, big ? 0.9 : 0.35, big ? 0.6 : 0.35);
  },
  hurt() { duck(0.6, 0.15); tone('sawtooth', 220, 70, 0.25, 0.25); noise(0.15, 0.3, 600); },
  power() { [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.12, 0.09, i * 0.06)); },
  heal() { [392, 523, 659].forEach((f, i) => tone('sine', f, f * 1.01, 0.2, 0.15, i * 0.07)); },
  dash() { noise(0.2, 0.25, 600, 1, 'bandpass', 0, sfxGain, 3000); },
  wave() { [262, 330, 392, 523].forEach((f, i) => tone('sawtooth', f, f, 0.18, 0.07, i * 0.09)); },
  boss() { duck(0.3, 1.2); tone('sawtooth', 70, 45, 1.4, 0.35); tone('square', 105, 60, 1.4, 0.16); noise(1.2, 0.25, 300); },
  enemyShot() { tone('sawtooth', 300, 120, 0.12, 0.06); },
  click() { tone('square', 660, 880, 0.05, 0.08); },
  over() { [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.98, 0.35, 0.2, i * 0.22)); },
  heartbeat() { if (!ctx) return; tone('sine', 78, 42, 0.16, 0.55); tone('sine', 70, 38, 0.2, 0.42, 0.2); noise(0.06, 0.08, 220, 1, 'lowpass'); },
  leque() { if (!ctx) return; const n = ctx.currentTime; if (n - lastShot < 0.045) return; lastShot = n; noise(0.26, 0.6, 1200, 0.6, 'lowpass', 0, sfxGain, 180); tone('square', 120, 40, 0.16, 0.2); noise(0.04, 0.3, 4000, 1, 'highpass'); },
  lob() { tone('triangle', 300, 520, 0.12, 0.12); noise(0.1, 0.12, 900, 1, 'bandpass', 0, sfxGain, 2400); },
  grenade() { duck(0.6, 0.15); noise(0.8, 0.85, 700, 0.7, 'lowpass', 0, sfxGain, 50); tone('sine', 95, 28, 0.7, 0.6); tone('square', 60, 30, 0.25, 0.12); },
  shield() { tone('triangle', 1200, 300, 0.25, 0.18); tone('sine', 600, 900, 0.18, 0.1, 0.05); noise(0.1, 0.15, 6000, 2, 'bandpass'); },
  shieldUp() { tone('sine', 500, 1000, 0.18, 0.08); },
  cards() { [392, 523, 659, 784].forEach((f, i) => tone('triangle', f, f, 0.22, 0.1, i * 0.05)); noise(0.3, 0.06, 5000, 1, 'highpass'); },
  pick(r) { const b = r === 'epico' || r === 'arma' ? [523, 784, 1046, 1568] : r === 'raro' ? [523, 659, 988] : [523, 784]; b.forEach((f, i) => tone('square', f, f, 0.14, 0.09, i * 0.06)); },
  weapon() { [330, 440, 660, 880].forEach((f, i) => tone('sawtooth', f, f * 1.01, 0.12, 0.07, i * 0.05)); noise(0.2, 0.1, 3000, 1, 'bandpass'); },
  aim() { tone('sine', 1500, 2400, 0.9, 0.035); tone('square', 3000, 3000, 0.04, 0.03, 0.75); }, // mira do Atirador (sobe até travar)
  snipe() { tone('sawtooth', 1800, 140, 0.22, 0.13); noise(0.12, 0.3, 4000, 1.2, 'highpass'); },
  fuse() { for (let i = 0; i < 6; i++) tone('square', 700 + i * 140, 700 + i * 140, 0.04, 0.07, i * 0.12); noise(0.7, 0.06, 6000, 3, 'bandpass'); },
  block() { tone('triangle', 2200, 1600, 0.06, 0.09); noise(0.05, 0.1, 7000, 3, 'bandpass'); },
  ach() { [784, 988, 1175, 1568].forEach((f, i) => tone('triangle', f, f, 0.18, 0.1, i * 0.07)); },
  coin() { tone('square', 1318, 1318, 0.06, 0.06); tone('square', 1760, 1760, 0.1, 0.06, 0.06); },
  warn() { tone('square', 880, 880, 0.08, 0.06); tone('square', 660, 660, 0.08, 0.06, 0.1); },
  slam() { duck(0.45, 0.3); noise(0.9, 0.9, 500, 0.7, 'lowpass', 0, sfxGain, 40); tone('sine', 70, 25, 0.8, 0.7); },
  blast() { noise(0.3, 0.35, 1100, 0.8, 'lowpass', 0, sfxGain, 120); tone('sine', 140, 40, 0.2, 0.2); },
  tick() { tone('square', 1500, 1500, 0.025, 0.035); },
  roar() { duck(0.25, 1.1); tone('sawtooth', 120, 48, 1.3, 0.32); tone('square', 92, 40, 1.3, 0.14); tone('sawtooth', 180, 70, 0.9, 0.12, 0.15); noise(1.3, 0.35, 420, 1.2, 'bandpass', 0, sfxGain, 120); },
  meteor() { noise(0.5, 0.5, 800, 0.7, 'lowpass', 0, sfxGain, 80); tone('sine', 110, 35, 0.4, 0.4); },
  record() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone('square', f, f, 0.16, 0.1, i * 0.1)); },
};

// Trilha procedural em camadas (Lá menor: Am - F - C - G)
// 0 = calma (menu/intervalo): pad + baixo suave | 1 = combate: bateria, baixo, arpejo cresce com a onda
// 2 = chefe: andamento mais rápido, bumbo dobrado, "stab" e melodia | 3 = chefe fase 2: tudo + sirene e caixa em rufo
const PROG = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
const ROOT = [55, 43.65, 65.41, 49];
const ARP = [0, 1, 2, 1, 2, 0, 1, 2];
const MEL = [659.3, 587.3, 523.3, 587.3, 659.3, 784, 659.3, 587.3, 523.3, 440, 523.3, 587.3, 523.3, 440, 392, 440];
function scheduleMusic() {
  if (!ctx || !musicOn) return;
  const lvl = intensity;
  const stepDur = lvl >= 2 ? 0.107 : lvl === 1 ? 0.122 : 0.15;
  while (nextTime < ctx.currentTime + 0.3) {
    const when = Math.max(0, nextTime - ctx.currentTime);
    const s = step % 16, bar = (step >> 4) % 4, ch = PROG[bar], root = ROOT[bar];
    if (s === 0) pad(ch, stepDur * 16, lvl === 0 ? 0.05 : 0.03, when, lvl >= 2 ? 'sawtooth' : 'triangle');
    if (lvl === 0) {
      if (s % 8 === 0) tone('sine', root * 2, root * 2, 0.5, 0.12, when, musicGain);
      if (s % 4 === 2) tone('triangle', ch[ARP[(s >> 1) % 8]] * 2, ch[ARP[(s >> 1) % 8]] * 2, 0.25, 0.025, when, musicGain);
    } else {
      // bateria
      if (s % 4 === 0 || (lvl >= 2 && (s === 10 || s === 14))) tone('sine', 150, 40, 0.18, 0.5, when, musicGain);
      if (s % 8 === 4) { noise(0.13, 0.2, 1800, 0.8, 'bandpass', when, musicGain); tone('triangle', 220, 160, 0.06, 0.08, when, musicGain); }
      if (s % 2 === 1 || lvl >= 2) noise(0.035, lvl >= 2 ? 0.07 : 0.1, 8000, 1, 'highpass', when, musicGain);
      // baixo
      if (s % 2 === 0) { const f = (s % 8 === 6 ? root * 1.5 : root); tone('sawtooth', f, f, 0.15, 0.11, when, musicGain); }
      // arpejo: entra a partir da onda 3 no combate, sempre no chefe
      if ((waveLvl >= 3 || lvl >= 2) && s % 2 === 0) { const f = ch[ARP[(s >> 1) % 8]] * 2; tone('square', f, f, 0.07, lvl >= 2 ? 0.035 : 0.025, when, musicGain); }
      if (lvl >= 2) {
        if (s === 0 || s === 6 || s === 12) tone('sawtooth', ch[0] * 2, ch[0] * 2, 0.22, 0.05, when, musicGain);
        if (s % 2 === 0 && bar % 2 === 1) { const f = MEL[s] ; tone('square', f, f, 0.1, 0.03, when, musicGain); }
      }
      if (lvl >= 3) {
        if (s >= 12) noise(0.05, 0.12, 2200, 1, 'bandpass', when, musicGain);
        if (s === 0 && bar % 2 === 0) tone('sawtooth', 880, 440, stepDur * 8, 0.025, when, musicGain);
      }
    }
    step++; nextTime += stepDur;
  }
}
export function music(on) {
  if (!ctx) return;
  musicOn = on;
  if (on && !musicTimer) { nextTime = ctx.currentTime + 0.05; step = 0; musicTimer = setInterval(scheduleMusic, 60); }
  if (!on && musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
// 0 calma, 1 combate, 2 chefe, 3 chefe fase 2
export function musicIntensity(v) { intensity = v; }
export function musicLevel() { return intensity; }
// laser contínuo: zumbido com LFO enquanto o feixe está ligado
export function laser(on) {
  if (!ctx) return;
  if (on && !laserNodes) {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o1.type = 'sawtooth'; o1.frequency.value = 180; o2.type = 'square'; o2.frequency.value = 271;
    f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 3;
    lfo.frequency.value = 14; lg.gain.value = 500; lfo.connect(lg); lg.connect(f.frequency);
    g.gain.value = 0; g.gain.setTargetAtTime(0.07, ctx.currentTime, 0.02);
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(sfxGain);
    o1.start(); o2.start(); lfo.start();
    laserNodes = { o1, o2, lfo, g };
  } else if (!on && laserNodes) {
    const n = laserNodes; laserNodes = null; const t = ctx.currentTime;
    n.g.gain.setTargetAtTime(0, t, 0.03); for (const o of [n.o1, n.o2, n.lfo]) o.stop(t + 0.2);
  }
}
