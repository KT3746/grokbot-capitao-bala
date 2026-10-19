// Sons sintetizados com WebAudio (nada de arquivos externos)
let ctx = null, master = null, musicGain = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('cb-mudo') === '1'; } catch (_) {}
let musicOn = false, musicTimer = null, step = 0, nextTime = 0, intensity = 0, laserNodes = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.55;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 6;
  master.connect(comp); comp.connect(ctx.destination);
  musicGain = ctx.createGain(); musicGain.gain.value = 0.32; musicGain.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('cb-mudo', m ? '1' : '0'); } catch (_) {}
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.02);
}
export function suspend(s) { if (!ctx) return; if (s) ctx.suspend(); else ctx.resume(); }

function tone(type, f0, f1, dur, vol, when = 0, dest = master) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, freq, q = 1, type = 'lowpass', when = 0, dest = master, fEnd) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (fEnd) f.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
let lastShot = 0;
export const sfx = {
  shot(shotgun) {
    if (!ctx) return; const n = ctx.currentTime; if (n - lastShot < 0.045) return; lastShot = n;
    if (shotgun) { noise(0.18, 0.5, 1800, 0.7, 'lowpass', 0, master, 300); tone('square', 160, 50, 0.12, 0.18); }
    else { tone('square', 880 + Math.random() * 80, 220, 0.07, 0.11); noise(0.05, 0.22, 3000, 0.8, 'highpass'); }
  },
  hit() { tone('triangle', 420, 160, 0.06, 0.14); },
  metal() { tone('square', 1300, 600, 0.05, 0.07); noise(0.04, 0.12, 5000, 2, 'bandpass'); },
  explode(big) {
    noise(big ? 1.1 : 0.45, big ? 0.9 : 0.55, big ? 900 : 1400, 0.8, 'lowpass', 0, master, 60);
    tone('sine', big ? 120 : 160, 30, big ? 0.9 : 0.35, big ? 0.6 : 0.35);
  },
  hurt() { tone('sawtooth', 220, 70, 0.25, 0.25); noise(0.15, 0.3, 600); },
  power() { [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.12, 0.09, i * 0.06)); },
  heal() { [392, 523, 659].forEach((f, i) => tone('sine', f, f * 1.01, 0.2, 0.15, i * 0.07)); },
  dash() { noise(0.2, 0.25, 600, 1, 'bandpass', 0, master, 3000); },
  wave() { [262, 330, 392, 523].forEach((f, i) => tone('sawtooth', f, f, 0.18, 0.07, i * 0.09)); },
  boss() { tone('sawtooth', 70, 45, 1.4, 0.35); tone('square', 105, 60, 1.4, 0.16); noise(1.2, 0.25, 300); },
  enemyShot() { tone('sawtooth', 300, 120, 0.12, 0.06); },
  click() { tone('square', 660, 880, 0.05, 0.08); },
  over() { [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.98, 0.35, 0.2, i * 0.22)); },
  heartbeat() { if (!ctx) return; tone('sine', 78, 42, 0.16, 0.55); tone('sine', 70, 38, 0.2, 0.42, 0.2); noise(0.06, 0.08, 220, 1, 'lowpass'); },
  leque() { if (!ctx) return; const n = ctx.currentTime; if (n - lastShot < 0.045) return; lastShot = n; noise(0.26, 0.6, 1200, 0.6, 'lowpass', 0, master, 180); tone('square', 120, 40, 0.16, 0.2); noise(0.04, 0.3, 4000, 1, 'highpass'); },
  lob() { tone('triangle', 300, 520, 0.12, 0.12); noise(0.1, 0.12, 900, 1, 'bandpass', 0, master, 2400); },
  grenade() { noise(0.8, 0.85, 700, 0.7, 'lowpass', 0, master, 50); tone('sine', 95, 28, 0.7, 0.6); tone('square', 60, 30, 0.25, 0.12); },
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
  slam() { noise(0.9, 0.9, 500, 0.7, 'lowpass', 0, master, 40); tone('sine', 70, 25, 0.8, 0.7); },
  blast() { noise(0.3, 0.35, 1100, 0.8, 'lowpass', 0, master, 120); tone('sine', 140, 40, 0.2, 0.2); },
  tick() { tone('square', 1500, 1500, 0.025, 0.035); },
  record() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone('square', f, f, 0.16, 0.1, i * 0.1)); },
};

// Trilha simples: baixo + bumbo + chimbal, em loop
const BASS = [55, 55, 65.4, 55, 73.4, 55, 65.4, 49];
const LEAD = [440, 523.3, 659.3, 523.3, 587.3, 698.5, 880, 784];
function scheduleMusic() {
  if (!ctx || !musicOn) return;
  while (nextTime < ctx.currentTime + 0.25) {
    const when = nextTime - ctx.currentTime;
    const s = step % 16;
    if (s % 4 === 0) tone('sine', 140, 40, 0.18, 0.5, when, musicGain);
    if (s % 2 === 1) noise(0.04, 0.12, 7000, 1, 'highpass', when, musicGain);
    if (s % 8 === 4) noise(0.12, 0.18, 1800, 0.8, 'bandpass', when, musicGain);
    if (s % 2 === 0) tone('sawtooth', BASS[(step >> 1) % 8], BASS[(step >> 1) % 8], 0.16, 0.12, when, musicGain);
    if (intensity > 0) { // camada de chefe: chimbal em semicolcheia, bumbo extra, arpejo e "stab"
      noise(0.025, 0.07, 9000, 1, 'highpass', when + 0.055, musicGain);
      if (s === 10 || s === 14) tone('sine', 140, 40, 0.16, 0.42, when, musicGain);
      if (s % 2 === 0) { const f = LEAD[(step >> 1) % 8]; tone('square', f, f, 0.09, 0.045, when, musicGain); }
      if (s % 8 === 0) tone('sawtooth', BASS[(step >> 1) % 8] * 2, BASS[(step >> 1) % 8], 0.32, 0.09, when, musicGain);
    }
    step++; nextTime += intensity > 0 ? 0.112 : 0.125;
  }
}
export function music(on) {
  if (!ctx) return;
  musicOn = on;
  if (on && !musicTimer) { nextTime = ctx.currentTime + 0.05; musicTimer = setInterval(scheduleMusic, 60); }
  if (!on && musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
export function musicIntensity(v) { intensity = v; }
// laser contínuo: zumbido com LFO enquanto o feixe está ligado
export function laser(on) {
  if (!ctx) return;
  if (on && !laserNodes) {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o1.type = 'sawtooth'; o1.frequency.value = 180; o2.type = 'square'; o2.frequency.value = 271;
    f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 3;
    lfo.frequency.value = 14; lg.gain.value = 500; lfo.connect(lg); lg.connect(f.frequency);
    g.gain.value = 0; g.gain.setTargetAtTime(0.07, ctx.currentTime, 0.02);
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
    o1.start(); o2.start(); lfo.start();
    laserNodes = { o1, o2, lfo, g };
  } else if (!on && laserNodes) {
    const n = laserNodes; laserNodes = null; const t = ctx.currentTime;
    n.g.gain.setTargetAtTime(0, t, 0.03); for (const o of [n.o1, n.o2, n.lfo]) o.stop(t + 0.2);
  }
}
