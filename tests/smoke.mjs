// Teste de fumaça do CAPITÃO BALA (Playwright, navegador sem janela).
// Uso:  npm install && npm run test:smoke
// Usa o Chrome/Chromium instalado no sistema (defina CHROME_PATH se não for achado automaticamente).
// Sobe um servidor estático local, abre o jogo com ?debug=1 e verifica o fluxo principal.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

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
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, name, info = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${info ? ' — ' + info : ''}`); if (!ok) fails++; };

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

  // loja
  await E(() => __CB.menu());
  await E(() => __CB.loja('conquistas'));
  check(await E(() => !document.getElementById('tela-loja').hidden && document.querySelectorAll('#loja-lista .li').length >= 10), 'loja e lista de conquistas');
  const mem = await E(() => __CB.mem());
  check(mem.geometries < 400 && mem.textures < 80, 'memória da GPU sob controle', JSON.stringify(mem));
  check(errors.length === 0, 'sem erros no console', errors.slice(0, 3).join(' | '));
} catch (e) {
  console.error(e); fails++;
} finally {
  await browser.close(); server.close();
}
console.log(fails ? `\n${fails} falha(s).` : '\nTudo certo!');
process.exit(fails ? 1 : 0);
