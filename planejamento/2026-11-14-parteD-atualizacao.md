# Parte D: o app se atualiza sozinho

## Por quê

O dono perguntou se o app "se autossustenta" e pediu para "fazer tudo se atualizar sozinho". Hoje:

- **Já se atualiza:** o que vem da ESPN (jogos, placares, classificações, elencos).
- **Depende dele:**
  - três arquivos editados à mão: `campeoes.json`, `boxe_eventos.json` e `transmissoes.json`;
  - a constante `TEMPORADA` da NBA no PC;
  - o APK, que leva telas e dados dentro dele: qualquer mudança só chega ao celular baixando e instalando um APK novo.

**Sucesso:** sem ele editar nada nem reinstalar, o celular passa a mostrar:
- as telas novas, correções e dados novos depois de cada push;
- os campeões novos;
- as lutas grandes de boxe (as que têm artigo na Wikipédia), com os resultados.

## Fatos que moldam a solução

- **Repositório e Pages:** o repositório `byGlazed/Scoresports-pessoal2` ficou público em 14/11/2026 (pedido do dono, depois de tirar a linha de coautor do histórico). O GitHub Pages publica `docs/` em `https://byglazed.github.io/Scoresports-pessoal2/`.
- **Chave do APK:** a chave que assina o APK (`android/scoresports.keystore`, com as senhas no `build.gradle`) já está no repositório público. O dono aceitou isso antes de abrir o repositório. Trocar a chave obrigaria a desinstalar o app e perder os favoritos, então ela fica como está.
- **Como o APK abre:**
  - ele abre `https://appassets.androidplatform.net/assets/www/index.html`, servido pelo `WebViewAssetLoader` a partir dos assets;
  - os favoritos (localStorage) e o banco (IndexedDB) pertencem a essa origem; se a origem mudar, eles se perdem;
  - pedidos à ESPN, Wikipédia e Wikidata passam por `buscarPeloAndroid` (CORS).
- **De onde vêm os dados:**
  - `direto.js` lê os dados com `jsonLocal("dados/<arquivo>.json")`, relativo à página;
  - `gerar_celular.py` copia as telas e os `DADOS` para `docs/` e para `android/app/src/main/assets/www/`, e carimba a versão no `sw.js`.
- **Build do APK:** o workflow `apk.yml` monta o APK a cada push na `main` e publica no release `apk`. O `versionCode` é o `run_number`.
- **Fontes testadas em 14/11/2026:**
  - a ESPN não informa os canais do Brasil (Brasileirão sem `broadcasts`/`geoBroadcasts`) e não cobre boxe;
  - a Wikipédia não tem "2026 in boxing";
  - o TheSportsDB gratuito entrega 1 próxima luta;
  - o Wikidata (SPARQL e API) estava com limite de pedidos por causa de uma falha deles.

## Abordagens consideradas

1. **O APK baixa as atualizações e as serve na mesma origem (escolhida pelo dono).** Ao abrir, o app consulta um arquivo de versão no Pages. Se houver versão nova, baixa telas e dados para o armazenamento interno e passa a servi-los em `appassets.androidplatform.net` na abertura seguinte.
   - **Ganha:** favoritos mantidos, funciona sem internet, tudo chega sem reinstalar.
   - **Custa:** código Java novo, que só dá para testar no celular.
2. **Só os dados pelo Pages, telas com aviso de APK novo.** Mais simples, mas cada mudança de tela pede instalação manual. Recusada pelo dono.
3. **O APK abre o site do Pages direto.** Descartada: troca a origem (perde os favoritos uma vez) e não abre sem internet na primeira vez.

## Objetivos

### 1. Atualização das telas e dados no APK

- **O que é baixado:** `gerar_celular.py` passa a gerar, em `docs/`, um manifesto de versão. Ele traz:
  - a versão (a mesma carimbada no `sw.js`);
  - a lista de todos os arquivos servidos na pasta `www`, com tamanho e SHA-256.
- **Quando procurar:** a cada abertura (e ao voltar para o app depois de um tempo, se fácil), em segundo plano, o app baixa o manifesto do Pages. Se a versão for diferente da que está em uso:
  - baixa só os arquivos que mudaram para uma pasta nova no armazenamento interno;
  - confere cada SHA-256;
  - só então marca a pasta como pronta.
- **Download incompleto:** se faltar internet ou um hash não bater, a pasta é descartada e nada muda.
- **Quando passa a valer:** na abertura seguinte, sem recarregar no meio do uso. O app serve a pasta pronta na mesma origem e no mesmo caminho de hoje (`/assets/www/...`), com `InternalStoragePathHandler` ou equivalente. Os favoritos e o banco continuam.
- **APK novo por cima:** se o APK instalado trouxer uma versão das telas mais nova que a baixada, vale a do APK, e a baixada é apagada. Instalar um APK novo nunca deixa telas velhas.
- **O que fica:** no máximo a versão em uso e a que está sendo baixada.
- **APK precisa mudar:** mudanças no Java (ou no Android em geral) não chegam por esse caminho. O manifesto diz o menor `versionCode` de APK que as telas exigem. Se o instalado for menor, aparece um aviso discreto, "Nova versão do app", com o link do release. As telas novas não devem quebrar num APK velho: quando precisarem de algo do Java, o manifesto as segura até o APK novo.
- **Dados num APK velho (decisão do construtor):** enquanto as telas estão seguras, o APK velho continua baixando os arquivos de `dados/` do mesmo manifesto e só deixa de fora as telas. Os campeões e as lutas novas continuam chegando. Os arquivos de dados mantêm o formato de hoje; mudar o formato deles exige subir o `versionCode` mínimo.
- **Workflow do APK:** não roda quando o commit só muda arquivos de dados.

### 2. Robô diário no GitHub Actions

- **Quando roda:** um workflow agendado uma vez por dia (e pelo botão "Run workflow") roda scripts Python de atualização.
- **O que faz com o resultado:** se algum arquivo de dados mudar, roda `gerar_celular.py`, faz o commit e o push na `main`. A mensagem do commit é em português e **sem nenhuma linha de coautor**. O Pages republica e o celular pega na abertura seguinte. O PC pega com `git pull`.
- **Regras de segurança dos dados:**
  - o robô só **acrescenta** ou **completa**; nunca apaga nem troca o que já está escrito à mão;
  - quando a fonte falha, o arquivo fica como está, e a execução termina sem erro, deixando um aviso no log;
  - nenhum segredo nos arquivos do repositório; se precisar de chave (parte F), ela fica nos *secrets* do GitHub.
- **Campeões (`campeoes.json`):**
  - **Fonte:** a ESPN, a mesma que o app já usa. Quando a temporada de uma competição está encerrada, o campeão é:
    - nas ligas de pontos corridos, o 1º da classificação final;
    - nas copas e nas ligas americanas (NBA, NFL, MLB, NHL), o vencedor da final;
    - na F1, o líder do mundial depois da última corrida.
  - **Quando escreve:** só se a temporada ainda não estiver no arquivo, e no topo da lista, no formato atual.
  - **Na dúvida:** se não der para saber com segurança, não escreve.
  - O Wikidata pode servir de conferência, mas não pode ser necessário.
- **Boxe (`boxe_eventos.json`):**
  - **Fonte (revista no plano, 14/11/2026):** os artigos de luta da Wikipédia em inglês, das categorias "AAAA boxing matches" do ano atual e do seguinte (ex.: "Tyson Fury vs. Anthony Joshua", "Viddal Riley vs. Seydi Coupe"). Cada artigo tem uma ficha (infobox) com data, local, cinturões e, depois da luta, o resultado.
  - **Por que não o cartel dos campeões:** o projeto de boxe da Wikipédia proíbe lutas futuras nas tabelas de cartel. Elas só trazem lutas já feitas, e o "marcado para" fica no texto, sem data certa.
  - **O que o robô faz:**
    - acrescenta as lutas marcadas que ainda não estão no arquivo;
    - completa o vencedor e o resultado das lutas do arquivo que já aconteceram e estão sem resultado.
  - **Limite:** cobre as lutas grandes, que têm artigo próprio, com cinturão ou não. Lutas menores sem artigo continuam à mão; o README diz isso.
  - **Horário e canal:** a Wikipédia não dá o horário nem o canal. O horário fica `null` (a tela já mostra "Horário a definir"). O canal também fica vazio, porque o padrão do boxe em `transmissoes.json` é vazio de propósito (cada evento tem o seu); a tela mostra "Canal a definir". O dono pode completar à mão, e o robô nunca troca o que ele escreveu.
  - **Bom vizinho:** a Wikipédia e o Wikidata limitaram os pedidos durante os testes (erro 429). O robô faz poucos pedidos, um de cada vez, se identifica com o endereço do repositório e, num 429, espera e tenta de novo poucas vezes. Se não der, desiste sem mudar nada.
- **Temporada da NBA no PC:** `TEMPORADA` em `nba_dados.py` e `classificacao.py` passa a ser calculada pela data, no formato `"2026-27"`; a temporada nova começa em outubro.

### 3. README

Explicar o que se atualiza sozinho, o que ainda é à mão (canais de TV e lutas sem campeão) e como rodar o robô pelo botão.

## Fora desta parte

- **Canais de TV automáticos:** não há fonte aberta; os padrões de `transmissoes.json` continuam.
- **Kings League:** parte E.
- **E-sports (CS2 e Valorant pela PandaScore):** parte F, a próxima depois da E.
  - Com o repositório público, a chave da PandaScore **não pode** ir no código nem no APK.
  - Esta parte deixa pronto o caminho que a F usa: o robô com *secrets* do GitHub publicando JSON no Pages, e o canal de atualização do APK.
  - Placar ao vivo de e-sports, se precisar, é decidido na F.
- **Instalar APK sozinho:** o Android não deixa um app se reinstalar sem o dono tocar em "Instalar". O aviso do objetivo 1 leva até lá.

## Anti-objetivos (falhou, mesmo que funcione)

- Perder os favoritos ou o banco do celular.
- O app não abrir sem internet, ou abrir em branco depois de um download pela metade.
- Telas novas num APK velho que não as suporta.
- O robô apagar ou estragar dado certo escrito à mão, ou publicar campeão errado.
- Um APK novo a cada commit diário do robô.
- Qualquer chave ou senha nova no repositório público (a chave do APK é a exceção aceita acima).
- Commits com linha de coautor.

## Fica a cargo de quem constrói

- Nomes de arquivos e funções.
- Formato do manifesto.
- Horário do robô.
- Como ler as fichas das lutas na Wikipédia.
- Como a ESPN diz que uma temporada acabou.
- Texto e lugar do aviso de APK novo.
- Como testar o Java sem Android aqui. O dono instala o APK do release e confere no celular; o plano diz o que ele precisa olhar.
