# Parte D (o app se atualiza sozinho): plano de implementação

> **Para quem for executar:** use superpowers:executing-plans, tarefa por tarefa. Os passos usam caixas (`- [ ]`). Os títulos das tarefas usam a palavra "Task" para os scripts de acompanhamento.

**Objetivo:** o APK baixa sozinho, do GitHub Pages, as telas e os dados novos, e passa a usá-los na abertura seguinte sem perder os favoritos. Um robô diário no GitHub Actions acrescenta campeões (ESPN) e lutas de boxe (Wikipédia).

**Arquitetura:**
- **Pacote de telas:** `gerar_celular.py` publica em `docs/apk/` a mesma pasta `www` que vai dentro do APK, mais um manifesto em texto (`versao.txt`) com a versão e o SHA-256 de cada arquivo.
- **No Android:** a lógica de decisão (o que baixar, que versão servir) fica numa classe Java pura, sem Android, testada com o Java da máquina. O `MainActivity` só faz a rede, os arquivos e a troca da pasta servida.
- **Robô:** scripts Python só com a biblioteca padrão, em `robo/`. As regras são funções puras testadas com `unittest`, sobre amostras reais guardadas em `testes/amostras/`.

**Tecnologia:** Java 17 (Android) e Java local para testes; Python 3.12 da biblioteca padrão; GitHub Actions; JavaScript puro nas telas.

**Spec:** `planejamento/2026-11-14-parteD-atualizacao.md`

## Regras globais

- **Commits:** em português e **sem nenhuma linha de coautor ou menção a Claude** (pedido do dono). Isso vale também para os commits do robô.
- **Repositório público:** nenhuma senha ou chave nova em arquivo. A chave do APK que já está lá é a exceção aceita.
- **Endereços:**
  - Pages: `https://byglazed.github.io/Scoresports-pessoal2/`;
  - pacote do APK: `…/apk/`;
  - manifesto: `…/apk/versao.txt`;
  - release do APK: `https://github.com/byGlazed/Scoresports-pessoal2/releases/latest`.
- **Identificação nos pedidos:**
  - robô: `User-Agent: Scoresports/1.0 (+https://github.com/byGlazed/Scoresports-pessoal2)`;
  - app: o User-Agent atual do app.
- **Robô:** só acrescenta ou completa dados e nunca apaga ou troca o que foi escrito à mão. Fonte fora do ar ou 429 → nada muda e a execução termina com sucesso, com um aviso no log.
- **Testes:**
  - JS: `node --test testes/*.test.js`;
  - Python: `python -m unittest discover -s testes -p "*_teste.py"`;
  - Java: `python testes/rodar_java.py`, que compila e roda os testes Java com o `javac`/`java` da máquina.
  
  Tudo verde ao fim de cada tarefa.
- **Depois de mudar telas, `celular/` ou dados:** `python gerar_celular.py`, e o commit vai junto com o `docs/` e o `www`.

## Pontos de atenção na revisão

1. **Download pela metade ou hash errado:** a versão em uso continua e a pasta nova é apagada. Teste na Task 1 (`AtualizacaoTeste.hashErradoNaoTroca`).
2. **APK instalado mais novo que a versão baixada:** vale a do APK e a baixada some. Teste na Task 1 (`AtualizacaoTeste.apkMaisNovoVence`).
3. **APK abaixo de `apk_minimo`:** baixa só `dados/` e mantém as telas. Teste na Task 1 (`AtualizacaoTeste.apkVelhoSoDados`).
4. **Fonte do robô com erro ou 429:** os arquivos ficam idênticos e o processo sai com código 0. Testes nas Tasks 5 e 6 (`test_fonte_fora_nao_muda`).
5. **Robô diante de dados à mão:** não duplica temporada nem luta já escrita, nem troca vencedor, canal ou horário escritos à mão. Testes nas Tasks 5 e 6 (`test_nao_duplica`, `test_nao_troca_o_que_e_manual`).

---

### Task 1: lógica pura da atualização (Java) e o executor de testes Java

**Arquivos:**
- Criar:
  - `android/app/src/main/java/com/byglazed/scoresports/Atualizacao.java` (só `java.*`, sem Android, sem `org.json`);
  - `testes/java/AtualizacaoTeste.java`;
  - `testes/rodar_java.py`.

**Interfaces** (pacote `com.byglazed.scoresports`):
- **Manifesto em texto, uma informação por linha, separada por espaço:**
  ```
  versao 20261114-183000
  apk_minimo 0
  arquivo <sha256-hex> <tamanho> <caminho/relativo>
  ```
  - O caminho é relativo à pasta `www`, usa `/` e não tem espaços (o `gerar_celular.py` garante).
- `static final class Manifesto { String versao; int apkMinimo; Map<String, Arquivo> arquivos; }` e `static final class Arquivo { String sha256; long tamanho; }`.
- `static Manifesto ler(String texto)`: lança `IllegalArgumentException` se faltar `versao` ou se uma linha `arquivo` estiver malformada.
- `static String escolherPasta(String versaoEmbutida, String versaoBaixada)`:
  - devolve `"baixada"` só se `versaoBaixada != null` e `versaoBaixada.compareTo(versaoEmbutida) > 0`;
  - senão devolve `"embutida"`.
  - As versões são `AAAAMMDD-HHMMSS`, comparáveis como texto.
- `static List<String> aBaixar(Manifesto remoto, Manifesto atual, int versionCodeApk)`:
  - devolve os caminhos cujo SHA difere do `atual`, ou que não existem nele;
  - se `versionCodeApk < remoto.apkMinimo`, só os que começam com `dados/`;
  - lista ordenada.
- `static boolean podeTrocar(Manifesto remoto, Map<String, String> shaDosBaixados, Manifesto atual, int versionCodeApk)`:
  - é `true` só se todo arquivo que precisava ser baixado tem SHA igual ao do remoto;
  - os demais são reaproveitados da pasta atual.
- `static String sha256(byte[] dados)`: hex minúsculo.
- `static Manifesto mesclarSoDados(Manifesto remoto, Manifesto atual)`: o manifesto da pasta nova quando o APK está velho. Fica com as telas do `atual` e os `dados/` do `remoto`, e com `versao = atual.versao + "+d" + remoto.versao`.
  - Assim a pasta só de dados nunca parece "mais nova" que um APK com telas novas; a regra de `escolherPasta` deve comparar só o prefixo antes de `+d`. Documentar na classe.

**Passos:**
- [ ] **Passo 1:** `testes/rodar_java.py` compila `Atualizacao.java` e `testes/java/*.java` para `build/java-testes` (ignorado pelo git) e roda `java -cp build/java-testes AtualizacaoTeste`. Sai com o código de saída do teste.
- [ ] **Passo 2:** `AtualizacaoTeste.java` tem um `main` que roda cada teste, conta falhas e sai com `System.exit(falhas > 0 ? 1 : 0)`. Os testes:
  - `lerManifesto`: o exemplo acima com 2 arquivos dá versão, `apkMinimo` 0 e 2 entradas; sem `versao` lança.
  - `escolherPastaPorVersao`:
    - `("20261114-100000", null)` → embutida;
    - `("20261114-100000", "20261115-090000")` → baixada;
    - `("20261116-000000", "20261115-090000")` → embutida;
    - `("20261114-100000", "20261114-100000+d20261115-090000")` → embutida, porque o prefixo é igual.
  - `aBaixarSoOQueMudou`: atual {a.js:1, dados/c.json:1} e remoto {a.js:1, b.js:2, dados/c.json:2} → `[b.js, dados/c.json]`.
  - `apkVelhoSoDados`: o mesmo caso com `apkMinimo 50` e `versionCodeApk 40` → `[dados/c.json]` (ponto de atenção 3).
  - `hashErradoNaoTroca`: `podeTrocar` com um SHA diferente → `false`; todos certos → `true` (ponto de atenção 1).
  - `apkMaisNovoVence`: embutida `20261120-000000` e baixada `20261118-000000` → embutida (ponto de atenção 2).
  - `sha256Conhecido`: `sha256("abc".getBytes(UTF_8))` = `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`.
- [ ] **Passo 3:** `python testes/rodar_java.py` falha (classe não existe).
- [ ] **Passo 4:** implementar `Atualizacao.java`.
- [ ] **Passo 5:** `python testes/rodar_java.py` passa; acrescentar `build/` ao `.gitignore`. Commit: "Atualização do app: regras puras e testes em Java".

### Task 2: pacote do APK no Pages com manifesto

**Arquivos:**
- Modificar: `gerar_celular.py`.
- Criar: `celular/apk_minimo.txt` (conteúdo `0`), `testes/gerar_celular_teste.py`.

**Interfaces:**
- **Funções novas em `gerar_celular.py`:**
  - `montar_manifesto(pasta: Path, versao: str, apk_minimo: int) -> str`: o texto do formato da Task 1;
    - linhas `arquivo` ordenadas pelo caminho;
    - sem o próprio `versao.txt`;
    - lança `ValueError` em caminho com espaço.
  - `main()`:
    - gera a versão uma vez (`time.strftime("%Y%m%d-%H%M%S")`) e usa a mesma no `sw.js` e no manifesto;
    - depois de montar `APK_WWW`, escreve `APK_WWW/versao.txt`;
    - copia `APK_WWW` inteira para `DOCS/apk/`.
- **O que fica fora do manifesto:** o `docs/sw.js` não muda e o service worker do site não usa `docs/apk/`. O `registrar.js` dentro do APK já não registra o service worker.

**Passos:**
- [ ] **Passo 1: teste** `test_manifesto` numa pasta temporária com `index.html` e `dados/a.json`:
  - o texto começa com `versao 20260101-000000\napk_minimo 3\n`;
  - tem 2 linhas `arquivo`, com SHA-256 e tamanho certos, em ordem;
  - um arquivo `com espaço.js` faz levantar `ValueError`.
- [ ] **Passo 2:** o teste falha; implementar; o teste passa.
- [ ] **Passo 3:** `python gerar_celular.py`. Conferir:
  - existem `docs/apk/versao.txt` e `docs/apk/index.html`;
  - o `docs/apk/index.html` tem `android.js`;
  - `python testes/rodar_java.py` continua verde.
  
  Commit: "Pages publica o pacote do APK com manifesto de versão".

### Task 3: o APK baixa, confere e passa a servir a versão nova

**Arquivos:**
- Modificar: `MainActivity.java`, `android/app/build.gradle` (só se faltar algo para `InternalStoragePathHandler`; a versão do `androidx.webkit` atual já deve ter).
- Criar: `android/app/src/main/java/com/byglazed/scoresports/Atualizador.java`.

**Interfaces:**
- **Pastas no armazenamento interno (`getFilesDir()`):**
  - `www-baixada/`: a versão pronta;
  - `www-nova/`: o download em andamento;
  - `www-baixada/versao.txt` diz a versão dela.
- **`Atualizador`:**
  - `Atualizador(Context ctx, int versionCode)`;
  - `File pastaParaServir()`: usa `Atualizacao.escolherPasta` com a versão do `assets/www/versao.txt` e a da `www-baixada`. Devolve `www-baixada` ou `null` (servir os assets). Quando a embutida vence, apaga `www-baixada` (ponto de atenção 2);
  - `void procurarEmSegundoPlano()`: numa `Thread`, faz o seguinte e engole toda exceção (log e sai):
    1. baixa `…/apk/versao.txt` com `Cache-Control: no-cache`;
    2. se a versão for igual à em uso, para;
    3. calcula `aBaixar`;
    4. baixa cada arquivo para `www-nova/` e copia os demais da pasta atual (`www-baixada` ou `assets/www`);
    5. confere com `podeTrocar`;
    6. escreve o `versao.txt` (o remoto, ou o `mesclarSoDados` se o APK for velho);
    7. troca: renomeia `www-baixada` para `www-velha`, `www-nova` para `www-baixada`, e apaga `www-velha`.
    
    Se falhar no meio, apaga `www-nova` (ponto de atenção 1).
  - `boolean precisaApkNovo()`: `versionCode < apkMinimo` do último manifesto lido (guardado em `SharedPreferences`).
- **`MainActivity`:**
  - no `onCreate`, monta o `WebViewAssetLoader` com o caminho `/assets/www/` servido por `InternalStoragePathHandler(ctx, pastaParaServir())` quando houver pasta baixada; os outros `/assets/` continuam com o `AssetsPathHandler`;
  - chama `procurarEmSegundoPlano()` depois do `loadUrl`;
  - no `onPageFinished`, se `precisaApkNovo()`, chama `evaluateJavascript("window.mostrarAvisoApk && window.mostrarAvisoApk('<link do release>')", null)`.
- **`versionCode`:** vem de `BuildConfig.VERSION_CODE` ou do `PackageManager`.

**Passos:**
- [ ] **Passo 1: implementar.** O `.github/workflows/apk.yml` passa a:
  - rodar também em push nas branches `parte*`;
  - rodar `python testes/rodar_java.py` antes do Gradle;
  - publicar o release só quando `github.ref == 'refs/heads/main'`;
  - ignorar commits que só mudam dados, com `paths-ignore`: `campeoes.json`, `boxe_eventos.json`, `transmissoes.json`, `docs/**`, `android/app/src/main/assets/www/**`.
- [ ] **Passo 2: verificação.** Push da branch e conferir pela API pública do GitHub (`/actions/runs` e as anotações do check-run) que o workflow compila e os testes Java passam.
- [ ] **Passo 3:** commit com a mensagem "O app baixa as telas e os dados novos do Pages e usa na abertura seguinte".

### Task 4: aviso de APK novo nas telas

**Arquivos:**
- Modificar: `static/navegacao.js`, `static/style.css`.

**Interfaces:**
- `window.mostrarAvisoApk(link: string)`:
  - insere, uma vez, uma faixa acima da barra de baixo com o texto "Nova versão do app disponível" e o botão "Baixar" (`<a href=link>`; o Android abre fora do app pelo `shouldOverrideUrlLoading`);
  - tem um "×" que esconde a faixa até a próxima abertura;
  - os alvos de toque têm 44 px.

**Passos:**
- [ ] **Passo 1:** implementar; `python gerar_celular.py`.
- [ ] **Passo 2: conferir no navegador** (375×812): chamar `mostrarAvisoApk("https://example.com")` no console mostra a faixa, sem cobrir a barra; o "×" esconde.
- [ ] **Passo 3:** commit com a mensagem "Aviso de nova versão do app".

### Task 5: robô dos campeões (ESPN)

**Arquivos:**
- Criar: `robo/__init__.py`, `robo/rede.py`, `robo/campeoes.py`, `testes/robo_campeoes_teste.py`, `testes/amostras/espn_*` (respostas reais).

**Interfaces:**
- **`robo/rede.py`:** `pegar_json(url) -> dict | None`.
  - Usa o User-Agent das regras globais e um intervalo de 1 s entre pedidos.
  - Em 429 ou 5xx, espera 30 s e tenta mais 2 vezes.
  - Erro final → `None`, com aviso no log.
- **`robo/campeoes.py`:**
  - `COMPETICOES`: a lista do que o robô cuida.
    - As chaves de hoje do `campeoes.json` mais as copas e supercopas do app. Para futebol, as ligas vêm de `celular/direto.js` `D_ESPORTES.futebol.ligas`; fica fixada no código, com um teste que confere com o arquivo.
    - Cada item tem `chave` (`"nba"`, `"futebol:eng.fa"`…), `esporte_espn` (`"soccer"`, `"basketball"`…), `liga` e `tipo` (`"pontos"`, `"final"` ou `"f1"`).
    - Pontos corridos: as ligas nacionais de futebol. Final: copas, competições continentais, seleções, NBA, NFL, MLB, NHL e MLS. F1: `f1`.
  - `rotulo_temporada(display_name: str, chave: str) -> str`: o começo do `displayName` da ESPN (`"2025-26"` ou `"2025"`). Para a NFL, `"2025 (Super Bowl LX)"`, em algarismos romanos de `ano - 1965`.
  - `temporada_encerrada(temporada: dict, hoje: date) -> bool`: `endDate` antes de hoje.
  - `campeao_pontos(standings: dict) -> dict | None`: o 1º colocado, `{"campeao": nome}`.
  - `campeao_final(eventos: list) -> dict | None`: o vencedor do último jogo encerrado, `{"campeao", "vice"}`; `None` se o último não tem vencedor.
  - `campeao_f1(pilotos, construtores) -> dict | None`: `{"campeao": piloto, "extra": "Construtores: X"}`.
  - `juntar(arquivo: dict, chave: str, item: dict) -> bool`: põe o item no topo da lista da chave (criando a chave se faltar). Devolve `False` sem mexer se aquela `temporada` já existe na lista.
  - `atualizar(arquivo: dict, hoje: date, buscar=pegar_json) -> list[str]`: devolve a lista de mudanças.
- **Fontes da ESPN** (confirmadas em 14/11/2026):
  - temporadas: `sports.core.api.espn.com/v2/sports/{esporte}/leagues/{liga}/seasons`, com `year`, `startDate`, `endDate` e `displayName`;
  - classificação: `site.api.espn.com/apis/v2/sports/{esporte}/{liga}/standings?season={year}`;
  - jogos: o scoreboard com `dates=AAAAMMDD-AAAAMMDD` no intervalo da temporada, `lang=pt&region=br`.
  - Para a F1, as rotas que o `espn_dados.py`/`direto.js` já usam.

**Passos:**
- [ ] **Passo 1: amostras.** Baixar e guardar em `testes/amostras/`: as temporadas da `eng.1` e da `nba`, a classificação final da `eng.1` 2025, os jogos da final da `bra.copa_do_brazil` 2025 e o mundial de F1 2025.
- [ ] **Passo 2: testes** em `robo_campeoes_teste.py`:
  - `test_rotulo`: `"2025-26 English Premier League"` → `"2025-26"`; `"2025 Copa do Brasil"` → `"2025"`; NFL `"2025"` → `"2025 (Super Bowl LX)"`.
  - `test_campeao_pontos`, `test_campeao_final` e `test_campeao_f1`, com as amostras e os valores que estão hoje no `campeoes.json`: Arsenal 2025-26, Corinthians e Vasco na Copa do Brasil 2025, Lando Norris e McLaren.
  - `test_nao_duplica` (ponto de atenção 5): `juntar` com uma temporada já presente devolve `False` e não muda o arquivo.
  - `test_fonte_fora_nao_muda` (ponto de atenção 4): `atualizar` com um `buscar` que sempre devolve `None` não muda nada e devolve `[]`.
  - `test_competicoes_batem_com_o_app`: toda liga de `D_ESPORTES.futebol.ligas` do `direto.js` aparece em `COMPETICOES`.
- [ ] **Passo 3:** os testes falham; implementar; os testes passam.
- [ ] **Passo 4:** rodar de verdade, `python -m robo.campeoes --seco`, que mostra as mudanças sem gravar. Conferir à mão que nada errado aparece.
- [ ] **Passo 5:** commit com a mensagem "Robô dos campeões pela ESPN".

### Task 6: robô do boxe (Wikipédia)

**Arquivos:**
- Criar: `robo/boxe.py`, `testes/robo_boxe_teste.py`, `testes/amostras/wiki_luta_*.json`.

**Interfaces:**
- `ficha_da_luta(wikitexto: str) -> dict | None`: lê a ficha do artigo (`{{Infobox boxing match`; conferir o nome e os campos reais na amostra). Devolve `{data: "AAAA-MM-DD", lutadores: [a, b], local, titulo, vencedor: str|None, resultado: str|None}`.
- `id_da_luta(data, lutadores) -> str`: o formato do arquivo, `"AAAA-MM-DD-sobrenomeA-sobrenomeB"`, minúsculo e sem acentos.
- `mesma_luta(evento, ficha) -> bool`: mesma data (±1 dia) e os dois sobrenomes nos lutadores da luta principal.
- `juntar_luta(arquivo, ficha, hoje) -> str | None`:
  - acrescenta um evento novo se a luta é futura e não está no arquivo, com `inicio: null`, `canais: []`, `nome: "A x B"` e uma luta;
  - se já está e não tem resultado, completa o `vencedor` e o `resultado`;
  - nunca troca campos já preenchidos (ponto de atenção 5);
  - devolve a mudança ou `None`.
- `atualizar(arquivo, hoje, buscar) -> list[str]`: lista os membros de `Category:{ano} boxing matches` (ano atual e o seguinte), pede o wikitexto da seção 0 de cada um e junta. Usa a API da Wikipédia com `action=parse&prop=wikitext&section=0` e `list=categorymembers`.
- **Mantém o arquivo:** a ordem dos eventos fica por data, e a chave `_como_usar` ganha a frase "O robô acrescenta as lutas grandes que têm artigo na Wikipédia e completa os resultados."

**Passos:**
- [ ] **Passo 1: amostras.** Guardar o wikitexto de "Viddal Riley vs. Seydi Coupe" e de uma luta já feita com resultado (de "Category:2026 boxing matches"). Se a Wikipédia responder 429, esperar e tentar mais tarde. Não inventar a ficha.
- [ ] **Passo 2: testes:**
  - `test_ficha_futura` e `test_ficha_com_resultado`, com as amostras;
  - `test_mesma_luta` (Riley x Coupe casa com o evento que já está no arquivo);
  - `test_nao_duplica`;
  - `test_nao_troca_o_que_e_manual`: evento com `vencedor` e `canais` preenchidos fica igual;
  - `test_fonte_fora_nao_muda`.
- [ ] **Passo 3:** os testes falham; implementar; os testes passam. Depois, `python -m robo.boxe --seco` de verdade, conferindo a lista de mudanças.
- [ ] **Passo 4:** commit com a mensagem "Robô do boxe pelas fichas de luta da Wikipédia".

### Task 7: o robô no GitHub Actions, a temporada da NBA e o README

**Arquivos:**
- Criar: `robo/__main__.py`, `.github/workflows/robo.yml`, `testes/robo_temporada_teste.py`.
- Modificar: `nba_dados.py`, `classificacao.py` e `README.md`.

**Interfaces:**
- `python -m robo`: carrega os dois JSON, roda `campeoes.atualizar` e `boxe.atualizar`, e grava com `ensure_ascii=False, indent=2` só se mudou.
  - Imprime as mudanças.
  - Sai com 0 sempre, a não ser por um erro de programação.
- `robo.yml`:
  - roda agendado diariamente (`cron: "0 10 * * *"`, 7h de Brasília) e por `workflow_dispatch`, com `permissions: contents: write, pages: write`;
  - faz `checkout`, Python 3.12, `python -m robo` e `python gerar_celular.py`;
  - se `git status --porcelain` tiver algo, faz o commit como `github-actions[bot]`, com a mensagem "Robô: dados atualizados (AAAA-MM-DD)", sem coautor, e o push;
  - depois pede uma publicação do Pages: `gh api -X POST repos/${{ github.repository }}/pages/builds` com `GH_TOKEN: ${{ github.token }}`, ignorando erro.
- `temporada_nba(hoje: date) -> str` em `nba_dados.py`: de outubro em diante, `"AAAA-(AA+1)"`; antes, `"(AAAA-1)-AA"`. `TEMPORADA = temporada_nba(date.today())`; o `classificacao.py` importa de `nba_dados`.

**Passos:**
- [ ] **Passo 1: teste** `test_temporada_nba`: 2026-11-14 → `"2026-27"`; 2027-03-01 → `"2026-27"`; 2027-10-01 → `"2027-28"`. O teste falha; implementar; o teste passa.
- [ ] **Passo 2:** `robo/__main__.py` e o `robo.yml`. Rodar `python -m robo` localmente.
- [ ] **Passo 3: README.**
  - Seção "O que se atualiza sozinho": telas e dados no APK, campeões, lutas grandes de boxe e temporada da NBA.
  - O que ainda é à mão: canais de TV e lutas sem artigo.
  - Como rodar o robô pelo botão "Run workflow".
  - Tirar "Atualizar a grade de transmissões automaticamente" dos próximos passos e escrever por quê.
- [ ] **Passo 4: conferência final.**
  - Todos os testes (JS, Python e Java) passam.
  - Push da branch e o workflow do APK verde pela API.
  - No navegador, `docs/apk/versao.txt` aparece depois do merge (a conferir após o push na main).
- [ ] **Passo 5:** commit com a mensagem "Robô diário no GitHub, temporada da NBA pela data e README".

## O que o dono confere no celular depois do merge (o Android não roda aqui)

1. Baixar e instalar o APK novo do release, por cima do atual. Os favoritos continuam.
2. Abrir com internet, fechar e abrir de novo: o app abre normal.
3. Depois de um próximo push qualquer (ou de uma execução do robô), abrir, fechar e abrir: a mudança aparece sem reinstalar.
4. Modo avião: o app abre com a última versão.
