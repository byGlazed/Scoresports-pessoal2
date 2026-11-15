import com.byglazed.scoresports.Atualizacao;
import com.byglazed.scoresports.Atualizacao.Manifesto;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Testes das regras de atualização do app. Rode com: python testes/rodar_java.py */
public class AtualizacaoTeste {

    private static int falhas = 0;

    private static void confere(boolean ok, String nome, String detalhe) {
        if (ok) {
            System.out.println("ok    " + nome);
        } else {
            falhas++;
            System.out.println("FALHA " + nome + ": " + detalhe);
        }
    }

    private static void igual(Object esperado, Object obtido, String nome) {
        confere(esperado.equals(obtido), nome, "esperado " + esperado + ", obtido " + obtido);
    }

    private static Manifesto manifesto(String versao, int apkMinimo, String... arquivos) {
        StringBuilder t = new StringBuilder("versao " + versao + "\napk_minimo " + apkMinimo + "\n");
        for (int i = 0; i < arquivos.length; i += 2) {
            t.append("arquivo ").append(arquivos[i + 1]).append(" 10 ").append(arquivos[i]).append("\n");
        }
        return Atualizacao.ler(t.toString());
    }

    static void lerManifesto() {
        Manifesto m = Atualizacao.ler("versao 20261114-183000\napk_minimo 0\narquivo aa11 120 index.html\narquivo bb22 30 dados/campeoes.json\n");
        igual("20261114-183000", m.versao, "lerManifesto: versao");
        igual(0, m.apkMinimo, "lerManifesto: apk_minimo");
        igual(2, m.arquivos.size(), "lerManifesto: arquivos");
        igual("bb22", m.arquivos.get("dados/campeoes.json").sha256, "lerManifesto: sha");
        igual(30L, m.arquivos.get("dados/campeoes.json").tamanho, "lerManifesto: tamanho");
        boolean lancou = false;
        try {
            Atualizacao.ler("apk_minimo 0\n");
        } catch (IllegalArgumentException e) {
            lancou = true;
        }
        confere(lancou, "lerManifesto: sem versao lança", "não lançou");
        lancou = false;
        try {
            Atualizacao.ler("versao 1\narquivo so-o-sha\n");
        } catch (IllegalArgumentException e) {
            lancou = true;
        }
        confere(lancou, "lerManifesto: linha malformada lança", "não lançou");
        for (String ruim : new String[] {"../fora.js", "/raiz.js", "a/../../b.js", "a\\b.js"}) {
            lancou = false;
            try {
                Atualizacao.ler("versao 1\narquivo aa 1 " + ruim + "\n");
            } catch (IllegalArgumentException e) {
                lancou = true;
            }
            confere(lancou, "lerManifesto: caminho fora da pasta lança (" + ruim + ")", "não lançou");
        }
    }

    static void escolherPastaPorVersao() {
        igual("embutida", Atualizacao.escolherPasta("20261114-100000", null), "escolherPasta: sem baixada");
        igual("baixada", Atualizacao.escolherPasta("20261114-100000", "20261115-090000"), "escolherPasta: baixada mais nova");
        igual("embutida", Atualizacao.escolherPasta("20261116-000000", "20261115-090000"), "escolherPasta: embutida mais nova");
        // APK velho: as telas são as do APK, os dados vieram depois; vale a pasta baixada
        igual("baixada", Atualizacao.escolherPasta("20261114-100000", "20261114-100000+d20261115-090000"), "escolherPasta: só dados com telas iguais");
        // APK novo instalado por cima de uma pasta só de dados mais antiga: vale o APK
        igual("embutida", Atualizacao.escolherPasta("20261120-000000", "20261114-100000+d20261115-090000"), "escolherPasta: APK novo vence pasta só de dados");
        igual("baixada", Atualizacao.escolherPasta("20261114-100000", "20261115-000000+d20261116-000000"), "escolherPasta: só dados com telas mais novas");
    }

    static void aBaixarSoOQueMudou() {
        Manifesto atual = manifesto("1", 0, "a.js", "1", "dados/c.json", "1");
        Manifesto remoto = manifesto("2", 0, "a.js", "1", "b.js", "2", "dados/c.json", "2");
        igual(Arrays.asList("b.js", "dados/c.json"), Atualizacao.aBaixar(remoto, atual, 40), "aBaixar: só o que mudou");
    }

    static void apkVelhoSoDados() {
        Manifesto atual = manifesto("1", 0, "a.js", "1", "dados/c.json", "1");
        Manifesto remoto = manifesto("2", 50, "a.js", "1", "b.js", "2", "dados/c.json", "2");
        igual(Arrays.asList("dados/c.json"), Atualizacao.aBaixar(remoto, atual, 40), "aBaixar: APK velho baixa só dados");
        Manifesto mesclado = Atualizacao.mesclarSoDados(remoto, atual);
        igual("1+d2", mesclado.versao, "mesclarSoDados: versao");
        confere(!mesclado.arquivos.containsKey("b.js"), "mesclarSoDados: sem telas novas", "trouxe b.js");
        igual("2", mesclado.arquivos.get("dados/c.json").sha256, "mesclarSoDados: dados novos");
        igual("1", mesclado.arquivos.get("a.js").sha256, "mesclarSoDados: telas de antes");
    }

    static void hashErradoNaoTroca() {
        Manifesto atual = manifesto("1", 0, "a.js", "1");
        Manifesto remoto = manifesto("2", 0, "a.js", "1", "b.js", "2", "dados/c.json", "3");
        Map<String, String> baixados = new HashMap<>();
        baixados.put("b.js", "2");
        baixados.put("dados/c.json", "errado");
        confere(!Atualizacao.podeTrocar(remoto, baixados, atual, 40), "podeTrocar: hash errado", "deixou trocar");
        baixados.put("dados/c.json", "3");
        confere(Atualizacao.podeTrocar(remoto, baixados, atual, 40), "podeTrocar: tudo certo", "não deixou trocar");
        baixados.remove("b.js");
        confere(!Atualizacao.podeTrocar(remoto, baixados, atual, 40), "podeTrocar: faltou arquivo", "deixou trocar");
    }

    static void apkMaisNovoVence() {
        igual("embutida", Atualizacao.escolherPasta("20261120-000000", "20261118-000000"), "apkMaisNovoVence");
    }

    static void sha256Conhecido() {
        igual("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
                Atualizacao.sha256("abc".getBytes(StandardCharsets.UTF_8)), "sha256Conhecido");
    }

    /** Uma pasta com arquivos faltando ou corrompidos não pode ser servida (nem virar a pasta baixada). */
    static void conferirPastaNoDisco() {
        Manifesto m = Atualizacao.ler("versao 2\napk_minimo 0\narquivo "
                + Atualizacao.sha256("abc".getBytes(StandardCharsets.UTF_8)) + " 3 app.js\narquivo "
                + Atualizacao.sha256("{}".getBytes(StandardCharsets.UTF_8)) + " 2 dados/c.json\n");
        Map<String, byte[]> disco = new HashMap<>();
        disco.put("app.js", "abc".getBytes(StandardCharsets.UTF_8));
        disco.put("dados/c.json", "{}".getBytes(StandardCharsets.UTF_8));
        igual(Arrays.asList(), Atualizacao.arquivosRuins(m, disco::get), "arquivosRuins: tudo certo");
        disco.remove("app.js");
        igual(Arrays.asList("app.js"), Atualizacao.arquivosRuins(m, disco::get), "arquivosRuins: faltando");
        disco.put("app.js", "abd".getBytes(StandardCharsets.UTF_8));
        igual(Arrays.asList("app.js"), Atualizacao.arquivosRuins(m, disco::get), "arquivosRuins: corrompido");
    }

    public static void main(String[] args) {
        conferirPastaNoDisco();
        lerManifesto();
        escolherPastaPorVersao();
        aBaixarSoOQueMudou();
        apkVelhoSoDados();
        hashErradoNaoTroca();
        apkMaisNovoVence();
        sha256Conhecido();
        System.out.println(falhas == 0 ? "todos os testes passaram" : falhas + " falha(s)");
        System.exit(falhas > 0 ? 1 : 0);
    }
}
