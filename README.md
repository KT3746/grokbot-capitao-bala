# CAPITÃO BALA

Arcade de tiro 3D original (Three.js r160, WebGL) — o herói Capitão Bala defende a arena contra zumbis e robôs invasores.

**Jogar:** https://kt3746.github.io/grokbot-capitao-bala/?v=202610192000

- Instale como app (PWA): no Chrome do celular, menu ⋮ → "Adicionar à tela inicial". Funciona offline depois da 1ª visita.
- Menu ⚙ Configurações: qualidade (Auto/Baixa/Média/Alta), tremor da câmera, vibração e som — salvos no aparelho.
- Celular: arraste à esquerda para andar, tiro automático no inimigo mais perto, arraste à direita para mirar, botão ESQUIVA.
- PC: WASD/setas, mouse para mirar (segure o clique), Espaço = esquiva, P/Esc = pausa.
- Ondas crescentes, 6 tipos de inimigo (zumbi, robô veloz, robô tanque, Atirador, Zumbi-Bomba e Guardião), chefe a cada 5 ondas com entrada de cinema.
- 2 arenas: Praça Neon e Porto Ferrugem (liberada ao chegar à onda 10). Moedas, loja de melhorias, visuais do herói e conquistas salvos no aparelho.
- Entre as ondas: escolha 1 de 3 cartas de PODER. Armas: Blaster, Espingarda LEQUE, LASER contínuo e Lança-GRANADAS.
- Itens: espingarda, tiro rápido, vida e armas raras. Recorde salvo no aparelho.
- Gráficos: sombras dinâmicas, bloom (UnrealBloomPass), partículas, luz do disparo, malhas instanciadas e qualidade adaptativa (`?q=0|1|2` força baixa/média/alta).

Toda a arte é original e gerada por código (modelos em `js/models.js`, texturas em canvas) e todos os sons são sintetizados com WebAudio: o jogo não usa nenhum arquivo de arte, modelo ou som de terceiros (nenhum asset externo, nem CC0). Three.js © autores do three.js (MIT), em `js/vendor`.

## Teste automático

Teste de fumaça com Playwright (abre o jogo num Chrome sem janela e passa pelo fluxo principal: título, partida, inimigos novos, escudo, cartas, armas, chefe com cinemática, arena 2, fim de jogo, moedas salvas e loja):

```bash
npm install          # instala só o playwright-core (sem baixar navegador)
npm run test:smoke   # usa o Chrome/Chromium do sistema; ou CHROME_PATH=/caminho/do/chrome npm run test:smoke
```

Não precisa de servidor: o script sobe um servidor local sozinho. Uma captura da arena 2 fica em `tests/out/`.

## Novidades

### v6 (19/10/2026)
- **Herói novo**: o Capitão Bala ganhou um modelo novo, todo articulado, que é fácil de reconhecer na câmera de cima.
  - Visual: capacete com crista e viseira, ombreiras, emblema de bala no peito, capa em 3 partes e botas.
  - Animação procedural: passada com quadril e joelho, tronco que gira, braços segurando a arma com recuo e capa ondulando.
  - Esquiva vira um rolamento completo. Ao levar dano ele recua, e na derrota cai de costas.
- **Inimigos refeitos**: silhuetas próprias, olhos que brilham e animação de andar, braços e cabeça.
  - A animação roda na placa de vídeo (esqueleto simples no shader), então os inimigos continuam instanciados. As sombras também se mexem.
- **3 inimigos novos, cada um com seu jeito de vencer**:
  - **Atirador** (a partir da onda 4): fica longe e mira com um laser vermelho. A mira trava 0,3 s antes do tiro. Saia da linha, esconda-se atrás de um obstáculo ou use a esquiva. No máximo 3 miram ao mesmo tempo.
  - **Zumbi-Bomba** (onda 3): corre até você, acende o pavio (círculo vermelho) e explode. Atire de longe, ou deixe-o explodir no meio dos outros inimigos.
  - **Guardião** (onda 6): tem um escudo de energia na frente que rebate os tiros, e o laser não passa. Ataque pelos lados ou pelas costas (ele vira devagar), ou use granadas e explosões.
  - Cada inimigo novo é apresentado na faixa da onda em que aparece pela primeira vez.
- **Arena 2: Porto Ferrugem**, liberada ao chegar à onda 10 e escolhida no menu.
  - Chão de chapas de aço rebitadas, caixotes e tambores em outra disposição, e faixas de perigo.
  - Em volta: contêineres, guindastes com luz de alerta e o mar.
  - Luz alaranjada de porto e neon verde-água.
  - Os inimigos especiais aparecem antes e em maior número.
- **Ambiente**:
  - A Praça Neon ganhou carros, árvores, barreiras e máquinas de refrigerante do lado de fora dos muros.
  - Manchas no chão sem sangue: gosma verde dos zumbis, óleo dos robôs e marcas de queimado das explosões. Elas somem aos poucos e usam um pool de 16/32/48 conforme a qualidade.
- **Progresso permanente** (salvo no aparelho):
  - Moedas por partida: pontos, ondas e chefes.
  - **Loja** com 6 melhorias pequenas: Couraça, Munição Reforçada, Ímã de Bolso, Botas Leves, Cofrinho e Escudo Inicial.
  - **6 visuais** do herói. O Rubi só sai com a conquista de 5 chefes.
  - **16 conquistas** com aviso na tela e moedas de prêmio.
- **Entrada do chefe**: barras de cinema e câmera que vai até o chefe enquanto ele surge e depois volta. Um cartão mostra o nome e o lema. Durante a entrada ninguém leva dano.
- **Teste automático** no repositório (`npm run test:smoke`, veja acima).
- **Desempenho**: tudo continua em pool e instanciado, e os níveis Baixa/Média/Alta seguem iguais.
  - Medição de uma onda cheia (~40 inimigos, paisagem, contando sombra e pós-processamento):
    - Baixa: ~87 draw calls e ~28 mil triângulos.
    - Média/Alta: ~160 draw calls e ~54 mil triângulos.

### v5 (19/10/2026)
- **Avisos dos chefes em vermelho de verdade**: os círculos e faixas de ataque saíram do bloom (cor sem tone mapping), ficam vermelhos vivos e piscam mais rápido logo antes do golpe. A invocação continua verde.
- **Arma no chão não troca sozinha**: ao passar por cima aparece o botão **TROCAR** (no PC, tecla **E**) mostrando a arma nova e a atual. A arma antiga fica no chão, e a do chão some em ~11 s. Ao trocar, o nome da arma aparece em destaque.
- **Mais impacto**:
  - Tremor de câmera proporcional ao golpe, com empurrão na direção do impacto e ajuste Normal/Reduzido/Desligado.
  - Clarão de cano em estrela, com a cor de cada arma.
  - Rastros nos tiros e faíscas de impacto.
  - Inimigos se desfazem em blocos com borda incandescente.
  - Clarão de tela e câmera lenta na morte do chefe.
  - Poeira dos passos e da esquiva.
  - Herói com recuo da arma, inclinação na corrida e nas curvas, e respiração parado.
  - Tudo continua instanciado, e os efeitos extras diminuem na qualidade Baixa.
- **Telas**:
  - Título animado: herói parado respirando, logo pulsando com reflexo de luz e menu entrando em sequência.
  - Transições suaves entre telas.
  - Faixas de onda com entrada animada; a do chefe treme.
  - Pontos do fim de jogo contam até o total.
  - Fonte única e margens seguras para notch e furo de câmera, inclusive em paisagem.
- **Celular**:
  - PWA com manifesto, ícones e funcionamento offline. O service worker usa cache versionado pelo `v=`: cada versão nova assume na hora e apaga a antiga, e a página sempre vem da rede quando há internet.
  - Tela cheia no 1º toque em JOGAR (quando o navegador permite) e tela sempre acesa durante a partida (Wake Lock).
  - Layout compacto com o celular deitado.
- **Compartilhar recorde** no fim de jogo: usa o compartilhamento do celular ou copia o texto com o link.

### v4 (19/10/2026)
- **Cartas de poder** depois de cada onda (inclusive a do chefe): 3 cartas grandes, fáceis de tocar, com ícone, descrição e cor de raridade (comum, raro, épico, arma). PC: clique, teclas 1/2/3 ou setas + Enter.
- 17 cartas que acumulam com limite: Dano+, Cadência+, Botas Turbo, Vida Máx+, Kit Médico, Olho de Águia (crítico), Esquiva Rápida, Ímã, Tiro Múltiplo, Perfuração, Ricochete, Recarga Vital, Escudo Regenerativo, Abate Explosivo e as 3 armas novas.
- Poderes aparecem como ícones no HUD, na pausa e na tela final.
- **3 armas novas**, com visual e som próprios, todas em malhas instanciadas/pool: Espingarda LEQUE (rajada em leque com empurrão), LASER contínuo (atravessa inimigos e para nos pilares) e Lança-GRANADAS (arco com explosão em área). Vêm de cartas ou como drop raro, e o chefe sempre solta uma arma.
- **Chefes com personalidade**: cada um dos 5 tem sua sequência de ataques. São 6 golpes: investida, anel de tiros, rajada mirada, invocação, salto esmagador e espiral. Todos têm aviso no chão (círculo ou faixa que enche) antes do golpe, visível no retrato.
- Trilha do chefe ganha uma camada mais intensa (baixo mais rápido e melodia).
- **Balanceamento**: inimigos ganham mais vida (crescimento quadrático suave) e causam mais dano a cada onda, para acompanhar os poderes. Vida e armas caem com menos frequência.

### v3 (19/10/2026)
- Desempenho no Galaxy: detecta o aparelho (memória, núcleos e GPU Mali/Adreno/Xclipse) e escolhe a qualidade inicial; aparelhos intermediários começam sem sombras e os básicos em Baixa. Resolução limitada no celular (máx. 1,0 / 1,4 / 1,8).
- Novo menu ⚙ Configurações (início e pausa): qualidade Auto/Baixa/Média/Alta, vibração e som, tudo salvo. `?q=` continua valendo.
- Chefe sempre à vista no retrato: barra do chefe compacta e câmera que se afasta e reposiciona na luta.
- Feedback: arco vermelho mostra de que lado veio o golpe, vinheta pulsante e batimento cardíaco com vida baixa, hit-stop e clarão branco no herói ao levar dano, inimigos piscam em branco com faíscas.
- Tutorial rápido na 1ª partida (pode pular); "Como jogar" no menu repete o tutorial.
- Brilho (bloom) mais suave e redondo nos tiros.

### v2 (19/10/2026)
- Câmera no celular em pé: mais alta e inclinada, mostra a área em volta do herói e não passa dos muros; postes dos cantos somem no retrato para não tapar o herói.
- Setas na borda da tela apontam inimigos fora da tela (cor por tipo) e o CHEFE (seta vermelha maior).
- No retrato, inimigos nascem logo fora da área visível (perto da ação).
- Qualidade baixa: sem bloom (acabaram os quadrados borrados), tiros com brilho aditivo leve. A qualidade automática agora também sobe de volta quando o FPS melhora (com histerese).
- Chefe e itens pré-compilados ao carregar: sem travada no 1º chefe. Sem vazamento de memória entre partidas (modelo do chefe e materiais dos itens reaproveitados).
- Depois de morrer, nada de bônus de onda nem próxima onda.
- Vida cheia: o item de VIDA fica no chão. Chefes repetidos ganham II, III, IV… Mira automática não atira em inimigo atrás de pilar.
- Ganchos de depuração só com `?debug=1`.

### v1 (19/10/2026)
- Primeira versão.

