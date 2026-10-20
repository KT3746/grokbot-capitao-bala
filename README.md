# CAPITÃO BALA

Arcade de tiro 3D original (Three.js r160, WebGL) — o herói Capitão Bala defende a arena contra zumbis e robôs invasores.

**Jogar:** https://kt3746.github.io/grokbot-capitao-bala/?v=202610201130

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

Teste de fumaça com Playwright (abre o jogo num Chrome sem janela e passa pelo fluxo principal: título, partida, objetivo, inimigos novos, escudo, cartas, armas, chefe com cinemática e fase 2, arena 2, fim de jogo com dica, continuar e retomar partida, moedas salvas, loja e volumes; e, se o WebKit estiver instalado, uma passada iPhone com toque, áudio, PWA e falta de vibração):

```bash
npm install          # instala só o playwright-core (sem baixar navegador)
npm run test:smoke   # usa o Chrome/Chromium do sistema; ou CHROME_PATH=/caminho/do/chrome npm run test:smoke
npx playwright-core install webkit   # opcional: adiciona a passada iPhone/Safari (WebKit)
```

Não precisa de servidor: o script sobe um servidor local sozinho. Uma captura da arena 2 fica em `tests/out/`.

## Novidades

### Novidades v10 (20/10/2026)

- **📅 Desafio Diário** — modo novo no título. Todo dia (meia-noite de Brasília) sai um desafio igual para todo mundo: **arena fixa**, **arma inicial** e **2 ou 3 modificadores** sorteados de 13 — Inimigos Rápidos, Só Laser, Granadas Infinitas, Sem Cura, Chefes em Dobro (a cada 3 ondas), Elites Frequentes, Só Cartas Raras, Gravidade de Moedas, Escuridão (só a lanterna ilumina), Contra o Tempo (tempo por onda no HUD), Canhão de Vidro, Enxame e Pesos-Pesados.
  - Ondas, elites, cartas e itens usam **sorteio com semente do dia**: mesma sorte para todos.
  - **Meta**: vencer a onda 8 a 12 (muda por dia); depois é pontuação. 1ª vez que cumpre no dia: **+150 🪙**.
  - Cartão do desafio com os modificadores, **contagem regressiva** para o próximo, melhor resultado do dia, **sequência 🔥 de dias seguidos** e **calendário dos últimos 7 dias**.
  - Sem CONTINUAR e sem "Retomar" no diário; não mexe no recorde normal.
  - 3 conquistas: Desafiante, Pegando o Ritmo (3 dias seguidos) e Semana Perfeita (7 dias).
- **Balanceamento**: a carta da arma que você está usando aparece bem mais (≈4 em cada 10 telas de cartas) — dá para chegar ao **NV 5 lá pela onda 10-12** (robô de teste: NV 5 na onda 10).
- Correções: o 🪙 do botão da Loja não quebra mais linha em telas de 375 px; conquistas durante a partida aparecem embaixo e não cobrem mais a arma no HUD.
- Teste automático: semente do dia determinística, virada do dia em Brasília, sequência com datas simuladas, modificadores aplicados (Só Laser, Só Cartas Raras, Chefes em Dobro) e sem continue (Chromium + WebKit).

### Novidades v9 (20/10/2026)

- **Armas com nível (1 a 5)** — pegar de novo a arma que você já usa (carta de ARMA ou item no chão) sobe o nível dela: mais dano, mais disparos, tiros maiores e mais brilhantes. O nível aparece no HUD (**NV 3**), na tela de cartas e na pausa. Trocar de arma guarda o nível de cada uma.
- **EVOLUÇÃO!** 🧬 — arma no **nível 5** + as **2 cartas da receita** vira uma super arma, com nome, cor e efeito novos e um momento especial na tela:
  - 🔹 Blaster + ⚡ Cadência + 🎯 Olho de Águia → 🌟 **SUPERNOVA** (rajadas douradas que atravessam e acertam mais críticos)
  - 🔶 Leque + 🔱 Tiro Múltiplo + 🗡️ Perfuração → 🌪️ **TEMPESTADE** (chumbos vermelhos que atravessam e quicam)
  - 🔆 Laser + ❄️ Tiro Gélido + 🌩️ Corrente Elétrica → 🌈 **PRISMA** (feixe arco-íris que congela e dá choque)
  - 💣 Granadas + 💥 Abate Explosivo + 💪 Dano+ → ☄️ **MEGABOMBA** (explosão enorme que solta 3 bombinhas)
  - 🪃 Bumerangue + 🌀 Lâminas Orbitais + 👟 Botas Turbo → 💿 **DISCO TROVÃO** (discos maiores, mais longe, com choque)
- **Tela Arsenal** no menu: todas as receitas; as evoluções ainda não descobertas aparecem como **silhueta ???** (salvo no aparelho).
- **Menu novo**: arenas em grade com arte, requisito 🔒 e **melhor onda em cada arena**; botões com ícones; no PC/tela baixa o título fica ao lado do menu (nada sai da tela). Pausa com arena, onda, pontos, arma e progresso da evolução. Cartas com brilho e nível da arma (NV 2 → 3).
- **3 conquistas novas**: No Talo (arma nível 5), EVOLUÇÃO! e Arsenal Completo (as 5 evoluções).
- Teste automático cobre níveis, as 5 evoluções, Arsenal, layout do título e memória (Chromium + WebKit/iPhone).

### Novidades v8 (19/10/2026)

- **3ª arena: Laboratório** 🧪 — subterrâneo com tanques de ensaio em hexágono e cubas brilhantes. Libera ao chegar na **onda 15**; o seletor de arenas mostra o requisito (🔒 Onda N) de cada uma.
- **Perigo do Laboratório: laser de varredura** — o feixe pisca antes, atravessa a arena e deixa uma **faixa verde** (abertura) segura; também dá para pular com a ESQUIVA. Fere inimigos no caminho.
- **4 inimigos novos**, cada um apresentado no aviso da onda: **Drone Vigia** (voa por cima dos blocos e atira), **Ninho Zumbi** (parado, solta zumbis até ser destruído), **Piscante** (teleporta; o círculo roxo mostra onde vai reaparecer) e **Robô Médico** (cura e protege os vizinhos — derrube primeiro). A estreia de cada um muda conforme a arena.
- **3 chefes novos com fase 2**: **Núcleo Triplo** (escudo enquanto os 3 satélites estiverem vivos; na fase 2 eles voltam), **Gêmeos Faísca** (dois corpos, uma vida; na fase 2 um fio de energia liga os dois) e **Doutor Volt** (comanda os lasers; na fase 2 liga dois cruzados). Cada arena tem a sua **ordem de chefes**.
- **Inimigos de elite** (VELOZ, BLINDADO, EXPLOSIVO) com **aura colorida**: mais vida, 3× pontos, +4 moedas e mais itens. O EXPLOSIVO estoura ao cair.
- **Arma nova: BUMERANGUE** 🪃 (vai, atravessa tudo e volta) e **6 cartas novas**: Tiro Gélido, Pele de Aço, Pé-de-Coelho, Adrenalina, Corrente Elétrica e Lâminas Orbitais.
- **8 conquistas novas** e **2 visuais novos** do herói: **Tóxico** (loja) e **Cósmico** (conquista Caçador de Elite).
- Robô de teste rebalanceado nas 3 arenas; teste automático cobre a arena nova, inimigos, elites, chefes, bumerangue e cartas (Chromium + WebKit/iPhone).

### v7.1 (19/10/2026)
- **CONTINUAR depois de morrer**: no fim de jogo, o botão verde **CONTINUAR (onda N)** aparece acima de "Jogar de novo".
  - A onda em que você morreu recomeça do zero, sem os inimigos e tiros que estavam na tela.
  - Você mantém pontos, poderes, arma e moedas, volta com a vida cheia e fica alguns segundos invencível (o herói pisca).
  - Na onda de chefe, ele volta com a vida cheia e na fase 1, sem repetir a cinemática longa.
  - É **1 continue por partida**. A melhoria permanente **Segunda Chance** (💖, 500 moedas na Loja) dá mais 1.
  - Moedas, abates e partidas não são contados duas vezes.
  - O recorde feito com continue continua valendo, mas aparece com a marca "*com continue".
- **Retomar partida**: a partida é salva no aparelho no começo de cada onda.
  - Se o app fechar no meio do jogo, o título mostra **Retomar partida (onda N)** e volta ao começo daquela onda, com poderes e pontos.
  - Começar um jogo novo ou chegar ao fim de jogo apaga o que estava salvo.
- O teste de fumaça agora cobre o continue, o limite de 1 por partida e o retomar depois de recarregar a página, no Chromium e no WebKit.

### v7 (19/10/2026)
- **Câmera e herói**: o Capitão Bala ficou menor na tela e a câmera mostra mais da arena, como nos jogos do gênero (Archero, Vampire Survivors).
  - A capa ficou mais curta e não cobre mais a arma nem a mira vista de cima.
- **Chefe com fase 2**: com 50% da vida o chefe para, **ruge** (aviso de 1,2 s, tela pisca e o chão treme) e entra em **FÚRIA**.
  - Visual novo: chifres, espinhos e um anel de energia girando. O núcleo também brilha mais forte.
  - Fica 30% mais rápido e descansa menos entre os golpes. Rajadas e leques ganham mais tiros.
  - Golpe novo, a **chuva de meteoros**: depois de cada ataque caem círculos vermelhos em você e em volta. Saia do círculo antes da explosão.
- **Luz e cor**: correção de cor leve, vinheta nas bordas e luz de contorno (rim light) no herói, nos inimigos e no chefe, com a cor de cada arena.
  - Na qualidade Baixa, que não tem sombras, todos ganham uma sombra de contato barata (1 só chamada de desenho para todos).
- **Música em camadas**, toda sintetizada:
  - Muda com a situação: calma no menu e entre ondas, combate (com arpejo a partir da onda 3), chefe, e chefe em fúria.
  - Com a vida baixa, a música fica abafada.
  - As explosões grandes e o dano abaixam a música por um instante, para os efeitos importantes se destacarem.
- **Volumes separados** em Configurações: geral, música e efeitos, salvos no aparelho.
- **Começo mais suave**:
  - Ondas 1 e 2 com menos inimigos, mais lentos e que batem menos.
  - Objetivo na tela ("Derrote todos · chefe na onda 5") e contador de inimigos que faltam na onda.
- **Dica no fim de jogo**: de acordo com o que derrotou você. Exemplos: laser do Atirador, explosão do Zumbi-Bomba, golpes do chefe, ou não ter usado a esquiva.
- **iPhone / Safari**:
  - O som é liberado no primeiro toque.
  - Sem erro onde não existe tela cheia nem vibração. A opção de vibração some e aparece um aviso no lugar.
  - Respeita as áreas seguras (Dynamic Island e barra de início).
  - Ícone e título próprios para "Adicionar à Tela de Início", com uma dica única explicando como instalar.
- **Testes**: o teste de fumaça cobre a fase 2 do chefe, os volumes, a dica e o objetivo. Também roda uma passada no **WebKit** (motor do Safari) com tela de iPhone, se ele estiver instalado.

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

