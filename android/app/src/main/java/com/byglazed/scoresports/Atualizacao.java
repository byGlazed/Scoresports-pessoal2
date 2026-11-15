package com.byglazed.scoresports;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Regras da atualização das telas e dos dados do app, sem nada do Android
 * (testadas no PC por testes/rodar_java.py).
 *
 * O manifesto (versao.txt, gerado pelo gerar_celular.py) tem uma informação por linha:
 *
 *   versao 20261114-183000
 *   apk_minimo 0
 *   arquivo <sha256> <tamanho> <caminho/relativo>
 *
 * A versão é a data e a hora da geração, comparável como texto. Quando o APK instalado é
 * mais velho que o apk_minimo, o app baixa só os dados: a pasta resultante fica com a versão
 * "<versão das telas>+d<versão dos dados>", e só o que vem antes do "+d" (as telas) conta
 * na hora de escolher entre a pasta baixada e a que veio dentro do APK.
 */
public final class Atualizacao {

    public static final String SEPARADOR_DADOS = "+d";

    private Atualizacao() {
    }

    public static final class Arquivo {
        public final String sha256;
        public final long tamanho;

        public Arquivo(String sha256, long tamanho) {
            this.sha256 = sha256;
            this.tamanho = tamanho;
        }
    }

    public static final class Manifesto {
        public String versao;
        public int apkMinimo;
        public final Map<String, Arquivo> arquivos = new LinkedHashMap<>();

        /** O texto no mesmo formato do versao.txt. */
        public String comoTexto() {
            StringBuilder t = new StringBuilder();
            t.append("versao ").append(versao).append('\n');
            t.append("apk_minimo ").append(apkMinimo).append('\n');
            List<String> caminhos = new ArrayList<>(arquivos.keySet());
            Collections.sort(caminhos);
            for (String c : caminhos) {
                Arquivo a = arquivos.get(c);
                t.append("arquivo ").append(a.sha256).append(' ').append(a.tamanho).append(' ').append(c).append('\n');
            }
            return t.toString();
        }
    }

    public static Manifesto ler(String texto) {
        Manifesto m = new Manifesto();
        for (String linha : texto.split("\n")) {
            linha = linha.trim();
            if (linha.isEmpty()) {
                continue;
            }
            String[] partes = linha.split(" ");
            switch (partes[0]) {
                case "versao":
                    if (partes.length != 2) {
                        throw new IllegalArgumentException("linha de versão malformada: " + linha);
                    }
                    m.versao = partes[1];
                    break;
                case "apk_minimo":
                    try {
                        m.apkMinimo = Integer.parseInt(partes[1]);
                    } catch (RuntimeException e) {
                        throw new IllegalArgumentException("apk_minimo malformado: " + linha);
                    }
                    break;
                case "arquivo":
                    if (partes.length != 4) {
                        throw new IllegalArgumentException("linha de arquivo malformada: " + linha);
                    }
                    if (!caminhoSeguro(partes[3])) {
                        throw new IllegalArgumentException("caminho fora da pasta do app: " + partes[3]);
                    }
                    try {
                        m.arquivos.put(partes[3], new Arquivo(partes[1], Long.parseLong(partes[2])));
                    } catch (NumberFormatException e) {
                        throw new IllegalArgumentException("tamanho malformado: " + linha);
                    }
                    break;
                default:
                    // linhas desconhecidas ficam para versões futuras do formato
                    break;
            }
        }
        if (m.versao == null || m.versao.isEmpty()) {
            throw new IllegalArgumentException("manifesto sem versão");
        }
        return m;
    }

    /** Só caminhos relativos dentro da pasta www: sem "..", sem "/" no começo e sem "\". */
    static boolean caminhoSeguro(String caminho) {
        if (caminho.isEmpty() || caminho.startsWith("/") || caminho.contains("\\")) {
            return false;
        }
        for (String parte : caminho.split("/")) {
            if (parte.isEmpty() || parte.equals("..") || parte.equals(".")) {
                return false;
            }
        }
        return true;
    }

    /** A parte da versão que diz respeito às telas (sem o "+d..." dos dados). */
    public static String versaoDasTelas(String versao) {
        int i = versao.indexOf(SEPARADOR_DADOS);
        return i < 0 ? versao : versao.substring(0, i);
    }

    /**
     * "baixada" quando a pasta baixada tem telas mais novas que as do APK, ou as mesmas telas
     * com dados mais novos (APK velho que só recebe dados); senão "embutida".
     * Um APK novo instalado por cima tem telas mais novas e vence a pasta baixada.
     */
    public static String escolherPasta(String versaoEmbutida, String versaoBaixada) {
        if (versaoBaixada == null) {
            return "embutida";
        }
        String telasBaixadas = versaoDasTelas(versaoBaixada);
        int comparacao = telasBaixadas.compareTo(versaoEmbutida);
        if (comparacao > 0) {
            return "baixada";
        }
        boolean soDados = versaoBaixada.length() > telasBaixadas.length();
        return comparacao == 0 && soDados ? "baixada" : "embutida";
    }

    private static boolean ehDado(String caminho) {
        return caminho.startsWith("dados/");
    }

    private static boolean deveIr(String caminho, Manifesto remoto, int versionCodeApk) {
        return versionCodeApk >= remoto.apkMinimo || ehDado(caminho);
    }

    /** Caminhos a baixar: os que mudaram ou não existem na versão atual; com APK velho, só os dados. */
    public static List<String> aBaixar(Manifesto remoto, Manifesto atual, int versionCodeApk) {
        List<String> lista = new ArrayList<>();
        for (Map.Entry<String, Arquivo> e : remoto.arquivos.entrySet()) {
            String caminho = e.getKey();
            if (!deveIr(caminho, remoto, versionCodeApk)) {
                continue;
            }
            Arquivo atualArq = atual == null ? null : atual.arquivos.get(caminho);
            if (atualArq == null || !atualArq.sha256.equals(e.getValue().sha256)) {
                lista.add(caminho);
            }
        }
        Collections.sort(lista);
        return lista;
    }

    /** Só troca quando todo arquivo que precisava ser baixado chegou com o SHA certo. */
    public static boolean podeTrocar(Manifesto remoto, Map<String, String> shaDosBaixados, Manifesto atual, int versionCodeApk) {
        for (String caminho : aBaixar(remoto, atual, versionCodeApk)) {
            String sha = shaDosBaixados.get(caminho);
            if (sha == null || !sha.equals(remoto.arquivos.get(caminho).sha256)) {
                return false;
            }
        }
        return true;
    }

    /** Manifesto da pasta nova quando o APK é velho: telas da versão atual, dados da remota. */
    public static Manifesto mesclarSoDados(Manifesto remoto, Manifesto atual) {
        Manifesto m = new Manifesto();
        m.versao = versaoDasTelas(atual.versao) + SEPARADOR_DADOS + remoto.versao;
        m.apkMinimo = atual.apkMinimo;
        for (Map.Entry<String, Arquivo> e : atual.arquivos.entrySet()) {
            if (!ehDado(e.getKey())) {
                m.arquivos.put(e.getKey(), e.getValue());
            }
        }
        for (Map.Entry<String, Arquivo> e : remoto.arquivos.entrySet()) {
            if (ehDado(e.getKey())) {
                m.arquivos.put(e.getKey(), e.getValue());
            }
        }
        return m;
    }

    /** Lê um arquivo da pasta; devolve null se ele não existe ou não dá para ler. */
    public interface Leitor {
        byte[] ler(String caminho);
    }

    /** Os arquivos do manifesto que faltam na pasta ou não conferem com o SHA (lista ordenada). */
    public static List<String> arquivosRuins(Manifesto m, Leitor leitor) {
        List<String> ruins = new ArrayList<>();
        for (Map.Entry<String, Arquivo> e : m.arquivos.entrySet()) {
            byte[] conteudo = leitor.ler(e.getKey());
            if (conteudo == null || !sha256(conteudo).equals(e.getValue().sha256)) {
                ruins.add(e.getKey());
            }
        }
        Collections.sort(ruins);
        return ruins;
    }

    public static String sha256(byte[] dados) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(dados);
            StringBuilder t = new StringBuilder(h.length * 2);
            for (byte b : h) {
                t.append(Character.forDigit((b >> 4) & 0xf, 16)).append(Character.forDigit(b & 0xf, 16));
            }
            return t.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
