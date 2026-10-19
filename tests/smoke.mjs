// Teste de fumaça do CAPITÃO BALA (Playwright, navegador sem janela).
// Uso:  npm install && npm run test:smoke
// Usa o Chrome/Chromium instalado no sistema (defina CHROME_PATH se não for achado automaticamente).
// Se o WebKit do Playwright estiver instalado (npx playwright-core install webkit), roda também
// uma passada "iPhone" (Safari/WebKit). Para pular: SKIP_WEBKIT=1.
// Sobe um servidor estático local, abre o jogo com ?debug=1 e verifica o fluxo principal.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests', 'out');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(ROOT, u.endsWith('/') ? u + 'index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean);
const executablePath = candidates.find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, name, info = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${info ? ' — ' + info : ''}`); if (!ok) fails++; };

async function chromiumRun() {
  console.log('— Chromium (Android 412×915, toque)');
  const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
  fs.mkdirSync(OUT, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { localStorage.setItem('cb-tutorial', '1'); localStorage.setItem('cb-qualidade', '0'); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const E = (fn, a) => page.evaluate(fn, a);
  const waitFor = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await E(fn).catch(() => false)) return true; await sleep(200); } return false; };

  await page.goto(BASE + '?debug=1&nosw=1', { waitUntil: 'load' });
  check(await waitFor(() => window.__CB && __CB.state === 'title'), 'carrega e mostra o título');
  check(await E(() => document.querySelectorAll('#arena-sel button').length === 2), 'seletor de arenas no título');
  check(await E(() => document.querySelector('#arena-sel button[data-a="porto"]').classList.contains('lock')), 'Porto Ferrugem começa bloqueado');

  await page.tap('#btn-jogar');
  check(await waitFor(() => __CB.state === 'playing' && __CB.wave === 1), 'partida começa na onda 1');
  await E(() => { window.__CBgod = true; });
  check(await waitFor(() => !document.getElementById('hud-goal').hidden, 12000), 'objetivo aparece nas primeiras ondas', await E(() => document.getElementById('hud-goal').textContent));
  check(await E(() => __CB.heroScale < 1), 'herói menor na tela', String(await E(() => __CB.heroScale)));

  // inimigos novos e seus contra-ataques
  await E(() => { __CB.skipTo(6); __CB.killAll(); });
  const sp = await E(() => ['sniper', 'bomba', 'escudo'].map((t) => __CB.spawn(t, 0, 8)));
  check(sp.every(Boolean), 'Atirador, Zumbi-Bomba e Guardião nascem');
  await sleep(1500);
  const sh = await E(() => { const L = __CB.enemyList(), i = L.findIndex((e) => e.t === 'escudo'); if (i < 0) return null; __CB.setFace(i, Math.PI); return [__CB.hitEnemy(i, 1, 0, 1), __CB.hitEnemy(i, 1, 0, -1)]; });
  check(sh && sh[0] === 'bloqueado' && sh[1] !== 'bloqueado', 'escudo do Guardião bloqueia de frente e leva dano pelas costas', JSON.stringify(sh));
  await E(() => __CB.killAll());
  check(await waitFor(() => __CB.decals > 0, 8000), 'manchas no chão aparecem nos abates');

  // armas
  for (const w of ['leque', 'laser', 'granada', 'blaster']) await E((x) => __CB.weapon(x), w);
  check(await E(() => __CB.weaponNow === 'blaster'), 'troca de armas');

  // cartas de poder
  await E(() => { __CB.openCards(); });
  check(await waitFor(() => __CB.state === 'upgrade', 8000), 'tela de cartas abre');
  await E(() => __CB.pickCard(0));
  check(await waitFor(() => __CB.state === 'playing', 8000), 'escolher carta volta ao jogo');

  // chefe com entrada cinematográfica
  await E(() => __CB.skipTo(5));
  check(await waitFor(() => __CB.cine !== null, 8000), 'cinemática do chefe começa');
  check(await waitFor(() => __CB.cine === null && __CB.boss, 30000), 'cinemática termina e o chefe luta');
  await E(() => __CB.bossHalf());
  const p2 = await E(() => __CB.p2);
  check(p2 && p2.p2 && p2.roar > 0, 'chefe entra na fase 2 com rugido aos 50%', JSON.stringify(p2));
  await E(() => __CB.speed(4));
  check(await waitFor(() => __CB.p2 && __CB.p2.act === 'meteoro', 40000), 'fase 2 usa o combo de meteoros');
  await E(() => __CB.speed(1));

  // segunda arena
  await E(() => __CB.arena('porto'));
  check(await E(() => __CB.arenaNow === 'porto'), 'troca para o Porto Ferrugem');
  await E(() => __CB.skipTo(3));
  await sleep(1500);
  const perf = await E(() => __CB.perf());
  check(perf.calls > 0 && perf.triangles > 0, 'renderiza a arena 2', `${perf.calls} draw calls, ${perf.triangles} triângulos`);
  await page.screenshot({ path: path.join(OUT, 'porto.png') });

  // fim de jogo: moedas salvas no aparelho
  await E(() => { window.__CBgod = false; __CB.hurt(9999); });
  check(await waitFor(() => __CB.state === 'over', 30000), 'tela de fim de jogo');
  const m = await E(() => __CB.meta);
  check(m.coins > 0 && m.runs === 1, 'moedas da partida salvas', `${m.coins} moedas`);
  check(await E(() => !!JSON.parse(localStorage.getItem('cb-meta')).coins), 'progresso no localStorage');
  check(await E(() => document.getElementById('fim-dica').textContent.length > 12), 'dica no fim de jogo', await E(() => document.getElementById('fim-dica').textContent));

  // loja
  await E(() => __CB.menu());
  await E(() => __CB.loja('conquistas'));
  check(await E(() => !document.getElementById('tela-loja').hidden && document.querySelectorAll('#loja-lista .li').length >= 10), 'loja e lista de conquistas');
  const mem = await E(() => __CB.mem());
  check(mem.geometries < 400 && mem.textures < 80, 'memória da GPU sob controle', JSON.stringify(mem));
  await volumeChecks(E);
  check(errors.length === 0, 'sem erros no console', errors.slice(0, 3).join(' | '));
  } catch (e) {
    console.error(e); fails++;
  } finally { await browser.close(); }
}

async function volumeChecks(E) {
  await E(() => { __CB.menu(); document.getElementById('btn-config').click(); });
  await sleep(400);
  const v = await E(() => { const i = document.querySelector('.vol input[data-k="musica"]'); i.value = 30; i.dispatchEvent(new Event('input')); return [document.querySelectorAll('.vol input').length, __CB.audio.vol.musica, JSON.parse(localStorage.getItem('cb-volume')).musica]; });
  check(v[0] === 3 && Math.abs(v[1] - 0.3) < 0.01 && Math.abs(v[2] - 0.3) < 0.01, 'volumes geral/música/efeitos ajustam e salvam', JSON.stringify(v));
}

// Passada iPhone (WebKit): toque, áudio liberado no 1º toque, sem tela cheia/vibração sem erro, áreas seguras.
async function webkitRun() {
  let browser;
  try { browser = await webkit.launch(); } catch (e) { console.log('— WebKit não instalado/indisponível, pulando (' + String(e.message).split('\n')[0] + ')'); return; }
  console.log('— WebKit (iPhone 390×844, toque)');
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
    await ctx.addInitScript(() => { localStorage.setItem('cb-tutorial', '1'); localStorage.setItem('cb-qualidade', '0'); });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const E = (fn, a) => page.evaluate(fn, a);
    const waitFor = async (fn, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await E(fn).catch(() => false)) return true; await sleep(250); } return false; };
    await page.goto(BASE + '?debug=1&nosw=1', { waitUntil: 'load' });
    check(await waitFor(() => window.__CB && __CB.state === 'title'), '[webkit] carrega e mostra o título');
    const meta = await E(() => ['apple-mobile-web-app-capable', 'apple-mobile-web-app-title', 'apple-mobile-web-app-status-bar-style'].every((n) => document.querySelector(`meta[name="${n}"]`)) && !!document.querySelector('link[rel="apple-touch-icon"]') && /viewport-fit=cover/.test(document.querySelector('meta[name=viewport]').content));
    check(meta, '[webkit] metas de PWA para "Adicionar à Tela de Início" e viewport-fit=cover');
    check(await E(() => __CB.ios.IOS && !document.getElementById('vib-off').hidden), '[webkit] sem vibração: opção escondida, aviso no lugar', JSON.stringify(await E(() => __CB.ios)));
    await page.tap('#btn-jogar');
    check(await waitFor(() => __CB.state === 'playing'), '[webkit] toque inicia a partida');
    check(await waitFor(() => __CB.audio.state === 'running', 8000), '[webkit] áudio liberado no primeiro toque', await E(() => __CB.audio.state));
    await page.touchscreen.tap(200, 600); await sleep(800);
    await E(() => { window.__CBgod = true; __CB.skipTo(5); });
    check(await waitFor(() => __CB.cine === null && __CB.boss, 40000), '[webkit] chefe aparece');
    await E(() => __CB.bossHalf());
    check(await E(() => __CB.p2 && __CB.p2.p2), '[webkit] fase 2 do chefe');
    await E(() => { window.__CBgod = false; __CB.hurt(9999); });
    check(await waitFor(() => __CB.state === 'over', 30000), '[webkit] fim de jogo');
    await volumeChecks(E);
    await page.screenshot({ path: path.join(OUT, 'webkit-config.png') });
    check(errors.length === 0, '[webkit] sem erros no console', errors.slice(0, 3).join(' | '));
  } catch (e) { console.error(e); fails++; } finally { await browser.close(); }
}

try { if (!process.env.SKIP_CHROMIUM) await chromiumRun(); if (!process.env.SKIP_WEBKIT) await webkitRun(); } finally { server.close(); }
console.log(fails ? `\n${fails} falha(s).` : '\nTudo certo!');
process.exit(fails ? 1 : 0);
