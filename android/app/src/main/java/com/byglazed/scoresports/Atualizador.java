package com.byglazed.scoresports;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Baixa do GitHub Pages as telas e os dados novos e os deixa prontos para a próxima abertura.
 *
 * - www-baixada/: a versão pronta, servida no lugar da que veio no APK quando é mais nova;
 * - www-nova/: o download em andamento; só vira www-baixada depois que todo arquivo confere.
 *
 * As regras (o que baixar, qual pasta servir) ficam em Atualizacao, testada no PC.
 *
 * Uma busca por vez no app inteiro (TRAVA é estática: cada abertura cria um Atualizador novo,
 * e uma busca da abertura anterior pode ainda estar rodando). A pasta nova é conferida no disco
 * antes da troca, e a baixada é conferida de novo a cada abertura: se faltar ou estiver errado
 * algum arquivo, ela é apagada e o app abre com as telas do APK.
 */
final class Atualizador {

    static final String ENDERECO = "https://byglazed.github.io/Scoresports-pessoal2/apk/";
    static final String RELEASE = "https://github.com/byGlazed/Scoresports-pessoal2/releases/latest";
    private static final String LOG = "Atualizador";
    private static final ReentrantLock TRAVA = new ReentrantLock();

    private final Context ctx;
    private final int versionCode;
    private final File baixada;
    private final File nova;
    private final File velha;
    private final SharedPreferences preferencias;

    Atualizador(Context ctx, int versionCode) {
        this.ctx = ctx.getApplicationContext();
        this.versionCode = versionCode;
        File base = this.ctx.getFilesDir();
        this.baixada = new File(base, "www-baixada");
        this.nova = new File(base, "www-nova");
        this.velha = new File(base, "www-velha");
        this.preferencias = this.ctx.getSharedPreferences("atualizacao", Context.MODE_PRIVATE);
    }

    /** A pasta baixada, se ela deve ser servida; null para servir as telas do APK. */
    File pastaParaServir() {
        Atualizacao.Manifesto daBaixada = lerBaixada();
        if (daBaixada == null) {
            return null;
        }
        Atualizacao.Manifesto embutido = lerEmbutido();
        boolean maisNova = embutido == null || "baixada".equals(Atualizacao.escolherPasta(embutido.versao, daBaixada.versao));
        if (maisNova && Atualizacao.arquivosRuins(daBaixada, caminho -> lerArquivo(new File(baixada, caminho))).isEmpty()) {
            return baixada;
        }
        // um APK mais novo foi instalado por cima, ou a pasta está incompleta: valem as telas do APK.
        // A pasta só é apagada se nenhuma busca estiver mexendo nela agora.
        if (TRAVA.tryLock()) {
            try {
                apagar(baixada);
            } finally {
                TRAVA.unlock();
            }
        }
        return null;
    }

    /** As telas atuais pedem um APK mais novo que este? (diz o último manifesto lido) */
    boolean precisaApkNovo() {
        return versionCode < preferencias.getInt("apk_minimo", 0);
    }

    void procurarEmSegundoPlano() {
        new Thread(() -> {
            if (!TRAVA.tryLock()) {
                return; // outra busca já está rodando
            }
            try {
                procurar();
            } finally {
                TRAVA.unlock();
            }
        }, "atualizador").start();
    }

    private void procurar() {
        try {
            Atualizacao.Manifesto remoto = Atualizacao.ler(new String(baixar(ENDERECO + "versao.txt"), StandardCharsets.UTF_8));
            preferencias.edit().putInt("apk_minimo", remoto.apkMinimo).apply();

            File servida = pastaParaServir();
            Atualizacao.Manifesto atual = servida != null ? lerBaixada() : lerEmbutido();
            if (atual == null) {
                return;
            }
            List<String> faltam = Atualizacao.aBaixar(remoto, atual, versionCode);
            if (faltam.isEmpty()) {
                return; // nada mudou (com APK velho a versão nunca é igual: por isso compara arquivo a arquivo)
            }

            apagar(nova);
            if (!nova.mkdirs()) {
                throw new IOException("não criou " + nova);
            }
            Map<String, String> shas = new HashMap<>();
            for (String caminho : faltam) {
                byte[] conteudo = baixar(ENDERECO + caminho);
                String sha = Atualizacao.sha256(conteudo);
                shas.put(caminho, sha);
                if (!sha.equals(remoto.arquivos.get(caminho).sha256)) {
                    throw new IOException("arquivo não confere: " + caminho);
                }
                escrever(new File(nova, caminho), conteudo);
            }
            if (!Atualizacao.podeTrocar(remoto, shas, atual, versionCode)) {
                throw new IOException("download incompleto");
            }

            Atualizacao.Manifesto alvo = versionCode < remoto.apkMinimo ? Atualizacao.mesclarSoDados(remoto, atual) : remoto;
            Set<String> baixados = new HashSet<>(faltam);
            for (Map.Entry<String, Atualizacao.Arquivo> e : alvo.arquivos.entrySet()) {
                String caminho = e.getKey();
                if (baixados.contains(caminho)) {
                    continue;
                }
                byte[] conteudo;
                try {
                    conteudo = lerDaVersaoAtual(servida, caminho);
                } catch (IOException faltou) {
                    // o arquivo não está aqui (o Android deixa de fora dos assets nomes que começam com ponto, por exemplo): baixa
                    conteudo = baixar(ENDERECO + caminho);
                }
                if (!Atualizacao.sha256(conteudo).equals(e.getValue().sha256)) {
                    throw new IOException("arquivo da versão atual não confere: " + caminho);
                }
                escrever(new File(nova, caminho), conteudo);
            }
            // confere no disco o que foi gravado antes de trocar
            List<String> ruins = Atualizacao.arquivosRuins(alvo, c -> lerArquivo(new File(nova, c)));
            if (!ruins.isEmpty()) {
                throw new IOException("arquivos gravados não conferem: " + ruins);
            }
            escrever(new File(nova, "versao.txt"), alvo.comoTexto().getBytes(StandardCharsets.UTF_8));

            // troca: a pasta antiga sai só depois que a nova está inteira
            apagar(velha);
            if (baixada.exists() && !baixada.renameTo(velha)) {
                throw new IOException("não moveu a pasta antiga");
            }
            if (!nova.renameTo(baixada)) {
                velha.renameTo(baixada);
                throw new IOException("não moveu a pasta nova");
            }
            apagar(velha);
            Log.i(LOG, "versão " + alvo.versao + " pronta para a próxima abertura");
        } catch (Exception erro) {
            // sem internet, Pages fora do ar ou arquivo errado: fica tudo como estava
            Log.w(LOG, "atualização não feita: " + erro);
            apagar(nova);
        }
    }

    private Atualizacao.Manifesto lerEmbutido() {
        try (InputStream entrada = ctx.getAssets().open("www/versao.txt")) {
            return Atualizacao.ler(new String(lerTudo(entrada), StandardCharsets.UTF_8));
        } catch (Exception erro) {
            return null;
        }
    }

    private Atualizacao.Manifesto lerBaixada() {
        File arquivo = new File(baixada, "versao.txt");
        if (!arquivo.isFile()) {
            return null;
        }
        try (InputStream entrada = new FileInputStream(arquivo)) {
            return Atualizacao.ler(new String(lerTudo(entrada), StandardCharsets.UTF_8));
        } catch (Exception erro) {
            return null;
        }
    }

    /** O conteúdo do arquivo, ou null se ele não existe ou não dá para ler. */
    private static byte[] lerArquivo(File arquivo) {
        if (!arquivo.isFile()) {
            return null;
        }
        try (InputStream entrada = new FileInputStream(arquivo)) {
            return lerTudo(entrada);
        } catch (IOException erro) {
            return null;
        }
    }

    private byte[] lerDaVersaoAtual(File servida, String caminho) throws IOException {
        if (servida != null) {
            try (InputStream entrada = new FileInputStream(new File(servida, caminho))) {
                return lerTudo(entrada);
            }
        }
        try (InputStream entrada = ctx.getAssets().open("www/" + caminho)) {
            return lerTudo(entrada);
        }
    }

    private static byte[] baixar(String endereco) throws IOException {
        HttpURLConnection conexao = (HttpURLConnection) new URL(endereco).openConnection();
        try {
            conexao.setConnectTimeout(15000);
            conexao.setReadTimeout(30000);
            conexao.setUseCaches(false);
            conexao.setRequestProperty("Cache-Control", "no-cache");
            conexao.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) ScoresportsApp/1.0");
            int status = conexao.getResponseCode();
            if (status != 200) {
                throw new IOException("HTTP " + status + " em " + endereco);
            }
            try (InputStream entrada = conexao.getInputStream()) {
                return lerTudo(entrada);
            }
        } finally {
            conexao.disconnect();
        }
    }

    private static void escrever(File arquivo, byte[] conteudo) throws IOException {
        File pasta = arquivo.getParentFile();
        if (pasta != null && !pasta.isDirectory() && !pasta.mkdirs()) {
            throw new IOException("não criou " + pasta);
        }
        try (FileOutputStream saida = new FileOutputStream(arquivo)) {
            saida.write(conteudo);
        }
    }

    private static byte[] lerTudo(InputStream entrada) throws IOException {
        ByteArrayOutputStream saida = new ByteArrayOutputStream();
        byte[] bloco = new byte[16384];
        int lidos;
        while ((lidos = entrada.read(bloco)) != -1) {
            saida.write(bloco, 0, lidos);
        }
        return saida.toByteArray();
    }

    private static void apagar(File arquivo) {
        if (!arquivo.exists()) {
            return;
        }
        File[] filhos = arquivo.listFiles();
        if (filhos != null) {
            for (File filho : filhos) {
                apagar(filho);
            }
        }
        if (!arquivo.delete()) {
            Log.w(LOG, "não apagou " + arquivo);
        }
    }
}
