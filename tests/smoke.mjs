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
  check(await E(() => document.querySelectorAll('#arena-sel button').length === 3), 'seletor de arenas no título (3 arenas)');
  check(await E(() => /Onda 15/.test(document.querySelector('#arena-sel button[data-a="lab"]').textContent)), 'Laboratório mostra o requisito (onda 15)');
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

  await v8Checks(page, E, waitFor, '', true);
  await v9Checks(page, E, waitFor, '');

  // fim de jogo: moedas salvas no aparelho
  await E(() => { window.__CBgod = false; __CB.hurt(9999); });
  check(await waitFor(() => __CB.state === 'over', 30000), 'tela de fim de jogo');
  const m = await E(() => __CB.meta);
  check(m.coins > 0 && m.runs === 1, 'moedas da partida salvas', `${m.coins} moedas`);
  check(await E(() => !!JSON.parse(localStorage.getItem('cb-meta')).coins), 'progresso no localStorage');
  check(await E(() => document.getElementById('fim-dica').textContent.length > 12), 'dica no fim de jogo', await E(() => document.getElementById('fim-dica').textContent));
  await continueChecks(page, E, waitFor, '');

  // loja
  await E(() => __CB.menu());
  await E(() => __CB.loja('conquistas'));
  check(await E(() => !document.getElementById('tela-loja').hidden && document.querySelectorAll('#loja-lista .li').length >= 10), 'loja e lista de conquistas');
  await v9MenuChecks(page, E, waitFor, '');
  await v10Checks(page, E, waitFor, '');
  const mem = await E(() => __CB.mem());
  check(mem.geometries < 400 && mem.textures < 80, 'memória da GPU sob controle', JSON.stringify(mem));
  await volumeChecks(E);
  await resumeChecks(page, E, waitFor, '');
  check(errors.length === 0, 'sem erros no console', errors.slice(0, 3).join(' | '));
  } catch (e) {
    console.error(e); fails++;
  } finally { await browser.close(); }
}

// v8: 3ª arena com laser de varredura, inimigos novos, elites, chefes novos, bumerangue e cartas novas
// v10: Desafio Diário — semente pela data de Brasília, modificadores, sequência de dias (datas simuladas)
async function v10Checks(page, E, waitFor, tag) {
  const det = await E(() => { const a = JSON.stringify(__CB.daily.info('2026-10-20')), b = JSON.stringify(__CB.daily.info('2026-10-20')); const days = Array.from({ length: 60 }, (_, i) => __CB.daily.info(new Date(Date.UTC(2026, 9, 20 + i, 12)).toISOString().slice(0, 10)));
    const ok = days.every((d) => d.mods.length >= 2 && d.mods.length <= 3 && d.goal >= 8 && d.goal <= 12 && new Set(d.mods).size === d.mods.length && !(d.mods.includes('solaser') && d.mods.includes('granadas')));
    return { same: a === b, varied: new Set(days.map((d) => d.mods.join())).size > 30, ok, arenas: new Set(days.map((d) => d.arena)).size }; });
  check(det.same && det.varied && det.ok && det.arenas === 3, tag + 'desafio do dia é determinístico pela data e varia entre os dias (2-3 modificadores)', JSON.stringify(det));
  const tz = await E(() => [__CB.daily.dayOf(Date.UTC(2026, 9, 21, 2, 30)), __CB.daily.dayOf(Date.UTC(2026, 9, 21, 3, 30)), __CB.daily.next(Date.UTC(2026, 9, 21, 2, 30))]);
  check(tz[0] === '2026-10-20' && tz[1] === '2026-10-21' && tz[2] === 30 * 60000, tag + 'dia vira à meia-noite de Brasília e a contagem regressiva bate', JSON.stringify(tz));
  const rng = await E(() => { __CB.daily.seed('2026-10-20'); const a = __CB.daily.rng().concat(__CB.daily.rng()); __CB.daily.seed('2026-10-20'); const b = __CB.daily.rng().concat(__CB.daily.rng()); __CB.daily.seed(null); return JSON.stringify(a) === JSON.stringify(b); });
  check(rng, tag + 'sorteios de ondas, cartas e itens repetem com a mesma semente');
  const st = await E(() => { const m = __CB.meta; m.daily = { days: {}, streak: 0, last: '', bestStreak: 0 }; delete m.ach.diario3; __CB.setMeta(m); const D = __CB.daily; return [D.mark('2026-10-18'), D.mark('2026-10-19'), D.mark('2026-10-19'), D.mark('2026-10-20'), !!__CB.meta.ach.diario3, D.mark('2026-10-22'), __CB.meta.daily.bestStreak]; });
  check(JSON.stringify(st) === '[1,2,2,3,true,1,3]', tag + 'sequência: dias seguidos somam, mesmo dia não conta 2x, pular um dia zera; conquista de 3 dias', JSON.stringify(st));
  // acha dias com modificadores específicos e testa que valem na partida
  const dayWith = (id) => E((id) => { for (let i = 0; i < 400; i++) { const d = new Date(Date.UTC(2026, 9, 20 + i, 15)); const I = __CB.daily.info(d.toISOString().slice(0, 10)); if (I.mods.includes(id)) return { ms: d.getTime(), I }; } return null; }, id);
  const L1 = await dayWith('solaser');
  await E((ms) => { __CB.daily.setNow(ms); __CB.daily.open(); }, L1.ms);
  check(await waitFor(() => !document.getElementById('tela-diario').hidden && document.querySelectorAll('.dmod').length >= 2 && /Novo desafio em/.test(document.getElementById('diario-card').textContent) && document.querySelectorAll('.dc').length === 7, 4000), tag + 'cartão do desafio: modificadores, contagem regressiva e últimos 7 dias');
  if (!tag) await page.screenshot({ path: path.join(OUT, 'diario.png') });
  await E(() => document.getElementById('btn-diario-go').click());
  check(await waitFor(() => __CB.state === 'playing' && __CB.daily.on, 8000), tag + 'Desafio Diário começa');
  const okG = await waitFor(() => __CB.weaponNow === 'laser' && __CB.arenaNow === __CB.daily.cur.arena && !!document.querySelector('.dchip') && /Meta/.test(document.getElementById('hud-goal').textContent), 5000);
  const g = await E(() => ({ w: __CB.weaponNow, a: __CB.arenaNow, want: __CB.daily.cur.arena, day: __CB.daily.cur.day, chip: !!document.querySelector('.dchip'), goal: document.getElementById('hud-goal').textContent }));
  check(okG && g.want === L1.I.arena, tag + 'modificador Só Laser + arena do dia aplicados', JSON.stringify(g) + ' esperado ' + L1.I.arena);
  const offers = await E(() => { window.__CBgod = true; const out = []; for (let i = 0; i < 12; i++) { __CB.openCards(); out.push(...__CB.cards); __CB.pickCard(0); } return out; });
  check(!offers.some((id) => id.startsWith('w_') && id !== 'w_laser'), tag + 'Só Laser: nenhuma carta de outra arma', offers.filter((x) => x.startsWith('w_')).join(','));
  await E(() => { window.__CBgod = false; __CB.hurt(9999); });
  check(await waitFor(() => __CB.state === 'over', 20000), tag + 'fim do desafio');
  const fim = await E(() => ({ cont: document.getElementById('btn-fim-cont').hidden, t: document.getElementById('fim-titulo').textContent, tries: Object.values(__CB.meta.daily.days).some((d) => d.tries >= 1) }));
  check(fim.cont && /DESAFIO/.test(fim.t) && fim.tries, tag + 'sem CONTINUAR no diário e resultado do dia salvo', JSON.stringify(fim));
  const R1 = await dayWith('raras');
  await E((ms) => { __CB.daily.setNow(ms); __CB.daily.start(); }, R1.ms);
  await waitFor(() => __CB.state === 'playing' && __CB.daily.on, 8000);
  const rar = await E(() => { window.__CBgod = true; __CB.skipTo(3); const out = []; for (let i = 0; i < 8; i++) { __CB.openCards(); out.push(...__CB.cards); __CB.pickCard(0); } return out; });
  check(await E((ids) => ids.every((id) => !__CB.cardRar || __CB.cardRar(id) !== 'comum'), rar), tag + 'Só Cartas Raras: nenhuma carta comum', rar.join(','));
  const C1 = await dayWith('chefes2');
  await E((ms) => { __CB.daily.setNow(ms); __CB.daily.start(); }, C1.ms);
  await waitFor(() => __CB.state === 'playing' && __CB.daily.on, 8000);
  await E(() => { window.__CBgod = true; __CB.skipTo(3); });
  check(await waitFor(() => !!__CB.boss, 8000), tag + 'Chefes em Dobro: chefe já na onda 3');
  await E(() => { __CB.clearQueue(); __CB.killAll(); window.__CBgod = false; __CB.daily.setNow(0); __CB.menu(); });
  check(await waitFor(() => __CB.state === 'title' && !__CB.daily.on, 6000), tag + 'volta ao título e sai do modo diário');
}
// v9: níveis de arma (1-5), EVOLUÇÃO (nível 5 + par de cartas), HUD e memória estável
async function v9Checks(page, E, waitFor, tag) {
  const mem0 = await E(() => __CB.mem());
  await E(() => { window.__CBgod = true; __CB.clearQueue(); __CB.killAll(); __CB.weapon('leque'); });
  const l0 = await E(() => __CB.wl('leque'));
  await E(() => __CB.weaponUp());
  check(await waitFor(() => __CB.wl('leque') === 2 && /NV 2/.test(document.querySelector('.wchip .wlv')?.textContent || ''), 4000), tag + 'arma sobe de nível e o HUD mostra (NV 2)', `${l0} → ${await E(() => __CB.wl('leque'))}`);
  await E(() => { for (let i = 0; i < 3; i++) __CB.spawn('zombie', i * 2 - 2, 7); });
  await page.waitForTimeout(800);
  check(await E(() => __CB.state === 'playing'), tag + 'leque nível 2 dispara sem erro');
  await E(() => { __CB.weapon('blaster'); __CB.setWL('blaster', 4); __CB.giveUp('cadencia', 1); __CB.giveUp('critico', 1); __CB.weaponUp(); });
  check(await waitFor(() => __CB.wEvo.blaster && __CB.wName === 'SUPERNOVA' && !document.getElementById('evo-fx').hidden && /EVOLUÇÃO/.test(document.getElementById('evo-fx').textContent), 4000), tag + 'BLASTER nível 5 + Cadência + Olho de Águia → EVOLUÇÃO! SUPERNOVA', JSON.stringify(await E(() => __CB.wEvo)));
  check(await E(() => __CB.meta.evos.includes('blaster') && __CB.meta.ach.evo1), tag + 'evolução descoberta fica salva (Arsenal) + conquista');
  if (!tag) await page.screenshot({ path: path.join(OUT, 'evo.png') });
  for (const [w, r] of [['leque', ['multi', 'perfura']], ['laser', ['gelo', 'raio']], ['granada', ['explosao', 'dano']], ['bume', ['orbita', 'veloc']]]) await E(([w, r]) => { __CB.weapon(w); __CB.setWL(w, 5); for (const k of r) __CB.giveUp(k, 1); __CB.weaponUp(); for (let i = 0; i < 3; i++) __CB.spawn('zombie', i * 2 - 2, 6); }, [w, r]).then(() => page.waitForTimeout(700));
  check(await E(() => Object.keys(__CB.wEvo).length === 5 && __CB.wName === 'DISCO TROVÃO'), tag + 'as 5 armas evoluem (Tempestade, Prisma, Megabomba, Disco Trovão)', JSON.stringify(await E(() => __CB.wEvo)));
  await E(() => { __CB.killAll(); });
  await page.waitForTimeout(1500);
  const mem1 = await E(() => __CB.mem());
  check(mem1.geometries <= mem0.geometries + 30 && mem1.textures <= mem0.textures + 4, tag + 'memória estável depois das evoluções', `${JSON.stringify(mem0)} → ${JSON.stringify(mem1)}`);
}
async function v9MenuChecks(page, E, waitFor, tag) {
  await E(() => __CB.menu()); await waitFor(() => __CB.state === 'title');
  const lay = await E(() => { const b = [...document.querySelectorAll('#arena-sel button')].map((x) => x.getBoundingClientRect()); return { rows: new Set(b.map((r) => Math.round(r.top))).size, out: b.some((r) => r.right > innerWidth || r.left < 0), sw: document.documentElement.scrollWidth <= innerWidth, best: !!document.querySelector('#arena-sel .ar-art') }; });
  check(lay.rows === 1 && !lay.out && lay.sw && lay.best, tag + 'arenas numa linha só, com arte e sem estourar a tela', JSON.stringify(lay));
  await E(() => document.getElementById('btn-arsenal').click());
  check(await waitFor(() => !document.getElementById('tela-arsenal').hidden && document.querySelectorAll('.ars').length === 5 && document.querySelectorAll('.ars.ok').length >= 1, 4000), tag + 'Arsenal mostra as 5 receitas (descobertas com nome)', await E(() => document.getElementById('arsenal-cont').textContent));
  if (!tag) await page.screenshot({ path: path.join(OUT, 'arsenal.png') });
  await E(() => document.getElementById('btn-arsenal-ok').click());
  check(await waitFor(() => !document.getElementById('tela-titulo').hidden, 3000), tag + 'Arsenal volta ao título');
}
async function v8Checks(page, E, waitFor, tag, full) {
  const bossReady = () => waitFor(() => __CB.cine === null && __CB.bossPos && __CB.bossPos.enter <= 0, 40000);
  await E(() => { const m = __CB.meta; m.maxWave = Math.max(m.maxWave, 16); __CB.setMeta(m); __CB.arena('lab'); });
  check(await E(() => __CB.arenaNow === 'lab' && !document.querySelector('#arena-sel button[data-a="lab"]').classList.contains('lock')), tag + 'Laboratório libera na onda 15');
  await E(() => { window.__CBgod = false; __CB.skipTo(2); __CB.clearQueue(); __CB.killAll(); __CB.anchor(); __CB.teleport(6, 0); });
  await E(() => __CB.sweepNow('x', 1, -6));
  check(await E(() => __CB.sweeps.length === 1 && __CB.sweeps[0].ph === 'warn'), tag + 'laser de varredura avisa antes (faixa verde = abertura)');
  const hp0 = await E(() => __CB.hp);
  check(await waitFor(() => __CB.sweeps.length === 0, 30000), tag + 'varredura atravessa a arena');
  check((await E(() => __CB.hp)) < hp0, tag + 'laser fere quem fica fora da abertura', `${hp0} → ${await E(() => __CB.hp)}`);
  await E(() => { window.__CBgod = true; __CB.teleport(0, 0); for (const [t, x, z] of [['drone', -4, 6], ['ninho', 5, 7], ['salta', -6, -6], ['medico', 6, -5], ['zombie', 7, -5]]) __CB.spawn(t, x, z); __CB.spawnElite('zombie', 'explosivo', -3, -7); });
  check(await waitFor(() => { const t = __CB.types; return t.drone && t.ninho && t.salta && t.medico; }, 8000), tag + 'Drone, Ninho, Piscante e Robô Médico nascem', JSON.stringify(await E(() => __CB.types)));
  await waitFor(() => __CB.auraN > 0, 3000);
  const el = await E(() => ({ e: __CB.elites, a: __CB.auraN }));
  check(el.e.length === 1 && el.a === 1, tag + 'elite com aura', JSON.stringify(el));
  await E(() => { __CB.toughType('ninho'); __CB.toughType('medico'); __CB.toughType('salta'); __CB.speed(3); });
  check(await waitFor(() => __CB.eFlags().some((e) => e.minor), 20000), tag + 'Ninho solta zumbis');
  if (full) {
    check(await waitFor(() => __CB.eFlags().some((e) => e.prot > 0), 20000), tag + 'Robô Médico protege os aliados');
    check(await waitFor(() => __CB.eFlags().some((e) => e.tp > 0), 20000), tag + 'Piscante avisa (círculo roxo) e se teleporta');
  }
  await E(() => __CB.speed(1));
  await page.screenshot({ path: path.join(OUT, tag ? 'webkit-lab.png' : 'lab.png') });
  await E(() => { __CB.keepOnly([]); __CB.spawnElite('zombie', 'blindado', 0, 5); __CB.killAll(); __CB.anchor(); });
  check(await waitFor(() => __CB.bonusCoins >= 4, 4000), tag + 'elite dá moedas extras', String(await E(() => __CB.bonusCoins)));
  // chefe Núcleo Triplo: satélites protegem o corpo; fase 2 traz os satélites de volta
  await E(() => { __CB.forceBoss('nucleo'); __CB.skipTo(5); __CB.clearQueue(); __CB.anchor(); });
  check(await bossReady(), tag + 'chefe Núcleo Triplo aparece');
  let bx = await E(() => __CB.bossX);
  check(bx && bx.mech === 'nucleo' && bx.sats === 3 && bx.bubble, tag + 'Núcleo Triplo com 3 satélites e escudo', JSON.stringify(bx));
  await E(() => __CB.hitSats(1e6)); bx = await E(() => __CB.bossX);
  check(bx.sats === 0 && !bx.bubble, tag + 'derrubar os satélites expõe o núcleo');
  await E(() => __CB.bossHalf()); bx = await E(() => __CB.bossX);
  check(bx.p2 && bx.sats === 3, tag + 'fase 2 do Núcleo: satélites voltam');
  await E(() => __CB.killAll()); check(await waitFor(() => !__CB.bossX, 5000), tag + 'Núcleo derrotado');
  if (full) {
    await E(() => { __CB.forceBoss('gemeos'); __CB.skipTo(5); __CB.clearQueue(); __CB.anchor(); });
    check(await bossReady(), 'Gêmeos Faísca aparecem');
    check(!!(await E(() => __CB.bossX.twin)), 'dois corpos com vida compartilhada');
    await E(() => { __CB.bossHalf(); __CB.speed(3); });
    check(await waitFor(() => { __CB.bossHeal(); return __CB.bossX && __CB.bossX.teth === 'on'; }, 30000), 'fase 2 dos Gêmeos: fio de energia entre eles');
    await E(() => { __CB.speed(1); __CB.killAll(); });
    check(await waitFor(() => !__CB.bossX && __CB.meta.ach.gemeos, 5000), 'Gêmeos derrotados (conquista)');
    await E(() => { __CB.forceBoss('volt'); __CB.skipTo(5); __CB.clearQueue(); __CB.anchor(); });
    check(await bossReady(), 'Doutor Volt aparece');
    await E(() => { __CB.bossHalf(); }); await sleep(1600); await E(() => { __CB.bossHeal(); __CB.forceAct('varredura'); });
    check(await waitFor(() => __CB.sweeps.length === 2, 8000), 'Doutor Volt (fase 2) liga 2 lasers cruzados');
    await page.screenshot({ path: path.join(OUT, 'volt.png') });
    await E(() => __CB.killAll()); await waitFor(() => !__CB.bossX, 5000);
    // bumerangue e cartas novas
    await E(() => { __CB.clearQueue(); __CB.weapon('bume'); __CB.giveUp('orbita', 1); __CB.giveUp('gelo', 1); __CB.giveUp('raio', 1); for (let i = 0; i < 3; i++) __CB.spawn('zombie', i * 2 - 2, 7); });
    check(await waitFor(() => __CB.bumes > 0, 8000), 'BUMERANGUE vai e volta');
    check(await waitFor(() => { const s = __CB.stats; return s.orbit >= 1 && __CB.orbN === 1 + s.orbit && s.slow >= 1 && s.chain >= 1; }, 8000), 'Lâminas Orbitais, Tiro Gélido e Corrente Elétrica', JSON.stringify(await E(() => ({ orbN: __CB.orbN, orbit: __CB.stats.orbit, slow: __CB.stats.slow, chain: __CB.stats.chain, st: __CB.state }))));
    check(await E(() => __CB.bossRot('lab')[0] === 'DOUTOR VOLT' && __CB.bossRot('cidade')[0] === 'TRITURADOR'), 'rodízio de chefes por arena');
  }
  await E(() => { __CB.weapon('blaster'); });
}

// CONTINUAR: recomeça a onda com vida cheia; só 1 por partida; moedas não contam 2x
async function continueChecks(page, E, waitFor, tag) {
  const w = await E(() => __CB.wave), m1 = await E(() => __CB.meta);
  check(await E(() => !document.getElementById('btn-fim-cont').hidden && /onda \d+/.test(document.getElementById('btn-fim-cont').textContent)), tag + 'botão CONTINUAR no fim de jogo');
  await page.tap('#btn-fim-cont');
  check(await waitFor(() => __CB.state === 'playing'), tag + 'continuar volta à partida');
  const a = await E(() => ({ wave: __CB.wave, hp: __CB.hpInfo, cont: __CB.cont }));
  check(a.wave === w && a.hp.hp === a.hp.max && a.hp.inv > 1.5, tag + 'mesma onda, vida cheia e invencível por um instante', JSON.stringify(a));
  await E(() => { window.__CBgod = false; __CB.hurt(9999); });
  await waitFor(() => __CB.state === 'over', 30000);
  const m2 = await E(() => __CB.meta);
  check(await E(() => document.getElementById('btn-fim-cont').hidden && !document.getElementById('fim-cont').hidden), tag + 'segunda morte sem continue (e marcada "com continue")');
  check(m2.runs === m1.runs && m2.coins >= m1.coins, tag + 'moedas e partidas sem contar duas vezes', `partidas ${m1.runs}→${m2.runs}, moedas ${m1.coins}→${m2.coins}`);
}
// RETOMAR: partida salva no início da onda volta depois de recarregar a página
async function resumeChecks(page, E, waitFor, tag) {
  await E(() => __CB.menu()); await waitFor(() => __CB.state === 'title');
  await page.tap('#btn-jogar'); await waitFor(() => __CB.state === 'playing');
  await E(() => { window.__CBgod = true; __CB.skipTo(3); });
  await sleep(400);
  await page.reload(); await waitFor(() => window.__CB && __CB.state === 'title');
  check(await E(() => !document.getElementById('btn-retomar').hidden && /onda 3/.test(document.getElementById('btn-retomar').textContent)), tag + 'título oferece "Retomar partida (onda 3)" após recarregar');
  await page.tap('#btn-retomar');
  check(await waitFor(() => __CB.state === 'playing' && __CB.wave === 3), tag + 'retomar volta para a onda 3');
  await E(() => { window.__CBgod = false; __CB.hurt(9999); }); await waitFor(() => __CB.state === 'over', 30000);
  await E(() => __CB.menu()); await waitFor(() => __CB.state === 'title');
  check(await E(() => document.getElementById('btn-retomar').hidden), tag + 'depois do fim de jogo não há o que retomar');
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
    await E(() => { __CB.clearQueue(); __CB.anchor(); __CB.killAll(); }); await waitFor(() => !__CB.boss, 5000);
    await v8Checks(page, E, waitFor, '[webkit] ', false);
    await v9Checks(page, E, waitFor, '[webkit] ');
    await E(() => { window.__CBgod = false; __CB.hurt(9999); });
    check(await waitFor(() => __CB.state === 'over', 30000), '[webkit] fim de jogo');
    await continueChecks(page, E, waitFor, '[webkit] ');
    await v9MenuChecks(page, E, waitFor, '[webkit] ');
    await v10Checks(page, E, waitFor, '[webkit] ');
    await volumeChecks(E);
    await resumeChecks(page, E, waitFor, '[webkit] ');
    await page.screenshot({ path: path.join(OUT, 'webkit-config.png') });
    check(errors.length === 0, '[webkit] sem erros no console', errors.slice(0, 3).join(' | '));
  } catch (e) { console.error(e); fails++; } finally { await browser.close(); }
}

try { if (!process.env.SKIP_CHROMIUM) await chromiumRun(); if (!process.env.SKIP_WEBKIT) await webkitRun(); } finally { server.close(); }
console.log(fails ? `\n${fails} falha(s).` : '\nTudo certo!');
process.exit(fails ? 1 : 0);
