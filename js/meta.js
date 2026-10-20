// CAPITÃO BALA — progresso permanente salvo no aparelho (moedas, melhorias, visuais, conquistas, arenas).
const KEY = 'cb-meta';
const DEF = () => ({ v: 1, coins: 0, earned: 0, up: {}, skins: ['classico'], skin: 'classico', ach: {}, kills: 0, bosses: 0, maxWave: 0, runs: 0, arena: 'cidade', elites: 0, bossTypes: [] });
export const meta = (() => {
  try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && typeof j === 'object') return Object.assign(DEF(), j); } catch (_) {}
  return DEF();
})();
export function saveMeta() { try { localStorage.setItem(KEY, JSON.stringify(meta)); } catch (_) {} }
export function resetMeta(obj) { for (const k of Object.keys(meta)) delete meta[k]; Object.assign(meta, DEF(), obj || {}); saveMeta(); }

// melhorias permanentes pequenas (o jogo continua sendo decidido nas cartas de cada partida)
export const SHOP = [
  { id: 'vida', nome: 'Couraça', icon: '🦺', max: 3, custo: [60, 130, 240], desc: (l) => `Começa com +${l * 10} de vida` },
  { id: 'dano', nome: 'Munição Reforçada', icon: '🔩', max: 3, custo: [80, 170, 320], desc: (l) => `+${l * 5}% de dano` },
  { id: 'ima', nome: 'Ímã de Bolso', icon: '🧲', max: 2, custo: [50, 120], desc: (l) => `Puxa itens de +${String((l * 0.6).toFixed(1)).replace('.', ',')} m` },
  { id: 'esquiva', nome: 'Botas Leves', icon: '🥾', max: 2, custo: [70, 160], desc: (l) => `ESQUIVA recarrega ${l * 6}% mais rápido` },
  { id: 'moedas', nome: 'Cofrinho', icon: '🐷', max: 3, custo: [100, 210, 360], desc: (l) => `+${l * 10}% de moedas por partida` },
  { id: 'escudo', nome: 'Escudo Inicial', icon: '🛡️', max: 1, custo: [420], desc: () => 'Começa toda partida com 1 bloqueio de escudo' },
  { id: 'segunda', nome: 'Segunda Chance', icon: '💖', max: 1, custo: [500], desc: () => '+1 CONTINUAR por partida (2 no total)' },
];
export const ARENAS = {
  cidade: { nome: 'Praça Neon', icon: '🌃', req: 0, desc: 'A arena original, cercada de prédios.' },
  porto: { nome: 'Porto Ferrugem', icon: '⚓', req: 10, desc: 'Docas industriais, caixotes no centro e mais inimigos especiais.' },
  lab: { nome: 'Laboratório', icon: '🧪', req: 15, desc: 'Laboratório subterrâneo com lasers de varredura e muitos drones.' },
};
export const ACH = [
  { id: 'abate1', nome: 'Primeiro Abate', desc: 'Derrote seu primeiro inimigo.', icon: '🎯', moedas: 10 },
  { id: 'onda5', nome: 'Aquecendo', desc: 'Chegue à onda 5.', icon: '🔥', moedas: 20 },
  { id: 'onda10', nome: 'Veterano da Arena', desc: 'Chegue à onda 10 (libera o Porto Ferrugem).', icon: '🎖️', moedas: 50 },
  { id: 'onda15', nome: 'Lenda Viva', desc: 'Chegue à onda 15.', icon: '👑', moedas: 100 },
  { id: 'chefe1', nome: 'Caçador de Chefes', desc: 'Derrote um chefe.', icon: '🤖', moedas: 30 },
  { id: 'chefe5', nome: 'Sem Medo de Gigante', desc: 'Derrote 5 chefes no total (libera o visual Rubi).', icon: '🏆', moedas: 80 },
  { id: 'combo25', nome: 'Imparável', desc: 'Faça um combo de 25.', icon: '⚡', moedas: 40 },
  { id: 'abates500', nome: 'Faxina Geral', desc: 'Derrote 500 inimigos no total.', icon: '🧹', moedas: 60 },
  { id: 'armas4', nome: 'Colecionador', desc: 'Use as 4 armas na mesma partida.', icon: '🧰', moedas: 40 },
  { id: 'epica', nome: 'Sorte Grande', desc: 'Escolha uma carta épica.', icon: '💎', moedas: 20 },
  { id: 'bomba3', nome: 'Fogo Amigo', desc: 'Um Zumbi-Bomba derruba 3 inimigos de uma vez.', icon: '💣', moedas: 40 },
  { id: 'intocavel', nome: 'Intocável', desc: 'Termine uma onda (da 5 em diante) sem levar dano.', icon: '✨', moedas: 40 },
  { id: 'costas', nome: 'Pelas Costas', desc: 'Derrote um Guardião acertando o núcleo nas costas.', icon: '🗡️', moedas: 25 },
  { id: 'porto', nome: 'Novos Ares', desc: 'Jogue uma partida no Porto Ferrugem.', icon: '⚓', moedas: 20 },
  { id: 'estilo', nome: 'Estiloso', desc: 'Compre um visual novo.', icon: '🎨', moedas: 20 },
  { id: 'poupanca', nome: 'Poupança', desc: 'Ganhe 1.000 moedas no total.', icon: '🪙', moedas: 50 },
  { id: 'lab', nome: 'Cientista de Campo', desc: 'Jogue uma partida no Laboratório (libera na onda 15).', icon: '🧪', moedas: 40 },
  { id: 'onda20', nome: 'Inabalável', desc: 'Chegue à onda 20.', icon: '🌟', moedas: 150 },
  { id: 'elite10', nome: 'Caçador de Elite', desc: 'Derrote 10 inimigos de elite (com aura) no total. Libera o visual Cósmico.', icon: '💠', moedas: 60 },
  { id: 'ninho', nome: 'Dedetizador', desc: 'Destrua um Ninho Zumbi.', icon: '🪺', moedas: 25 },
  { id: 'laser10', nome: 'Dança dos Lasers', desc: 'Escape de 10 varreduras de laser seguidas sem ser atingido.', icon: '🕺', moedas: 50 },
  { id: 'bume5', nome: 'Vai e Volta', desc: 'Derrote 5 inimigos com um único bumerangue.', icon: '🪃', moedas: 40 },
  { id: 'gemeos', nome: 'Separados no Nascimento', desc: 'Derrote os Gêmeos Faísca.', icon: '⚡', moedas: 50 },
  { id: 'chefes8', nome: 'Enciclopédia de Chefes', desc: 'Derrote os 8 chefes diferentes.', icon: '📚', moedas: 200 },
];
export const ACH_BY = Object.fromEntries(ACH.map((a) => [a.id, a]));
export const lvl = (id) => meta.up[id] || 0;
export const arenaUnlocked = (id) => meta.maxWave >= (ARENAS[id] || ARENAS.cidade).req;
