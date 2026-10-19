// Sons sintetizados com WebAudio (nada de arquivos externos)
let ctx = null, master = null, musicGain = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('cb-mudo') === '1'; } catch (_) {}
let musicOn = false, musicTimer = null, step = 0, nextTime = 0;

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
  record() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone('square', f, f, 0.16, 0.1, i * 0.1)); },
};

// Trilha simples: baixo + bumbo + chimbal, em loop
const BASS = [55, 55, 65.4, 55, 73.4, 55, 65.4, 49];
function scheduleMusic() {
  if (!ctx || !musicOn) return;
  while (nextTime < ctx.currentTime + 0.25) {
    const when = nextTime - ctx.currentTime;
    const s = step % 16;
    if (s % 4 === 0) tone('sine', 140, 40, 0.18, 0.5, when, musicGain);
    if (s % 2 === 1) noise(0.04, 0.12, 7000, 1, 'highpass', when, musicGain);
    if (s % 8 === 4) noise(0.12, 0.18, 1800, 0.8, 'bandpass', when, musicGain);
    if (s % 2 === 0) tone('sawtooth', BASS[(step >> 1) % 8], BASS[(step >> 1) % 8], 0.16, 0.12, when, musicGain);
    step++; nextTime += 0.125;
  }
}
export function music(on) {
  if (!ctx) return;
  musicOn = on;
  if (on && !musicTimer) { nextTime = ctx.currentTime + 0.05; musicTimer = setInterval(scheduleMusic, 60); }
  if (!on && musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
