# CAPITÃO BALA

Arcade de tiro 3D original (Three.js r160, WebGL) — o herói Capitão Bala defende a arena contra zumbis e robôs invasores.

**Jogar:** https://kt3746.github.io/grokbot-capitao-bala/?v=202610191545

- Menu ⚙ Configurações: qualidade (Auto/Baixa/Média/Alta), vibração e som — salvos no aparelho.
- Celular: arraste à esquerda para andar, tiro automático no inimigo mais perto, arraste à direita para mirar, botão ESQUIVA.
- PC: WASD/setas, mouse para mirar (segure o clique), Espaço = esquiva, P/Esc = pausa.
- Ondas crescentes, 3 tipos de inimigo (zumbi, robô veloz, robô tanque), chefe a cada 5 ondas.
- Itens: espingarda, tiro rápido, vida. Recorde salvo no aparelho.
- Gráficos: sombras dinâmicas, bloom (UnrealBloomPass), partículas, luz do disparo, malhas instanciadas e qualidade adaptativa (`?q=0|1|2` força baixa/média/alta).

Toda a arte é gerada por código (formas simples) e todos os sons são sintetizados com WebAudio. Three.js © autores do three.js (MIT), em `js/vendor`.

## Novidades

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

