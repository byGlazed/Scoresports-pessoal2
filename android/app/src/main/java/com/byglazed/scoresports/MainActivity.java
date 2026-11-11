package com.byglazed.scoresports;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * O app é a mesma página da versão do celular (pasta docs/), guardada dentro do APK.
 *
 * - As telas abrem de dentro do APK (funcionam sem internet).
 * - Os pedidos à ESPN e à Wikipédia são feitos aqui pelo Android e entregues à página
 *   com a permissão de acesso (CORS), então o navegador nunca bloqueia nada.
 * - Links de fora (Wikipédia, NBA.com) abrem no navegador do celular.
 */
public class MainActivity extends Activity {

    private static final String ENDERECO_APP = "https://appassets.androidplatform.net/assets/www/index.html";
    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle estadoSalvo) {
        super.onCreate(estadoSalvo);

        final WebViewAssetLoader arquivos = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        setContentView(web);

        WebSettings config = web.getSettings();
        config.setJavaScriptEnabled(true);
        config.setDomStorageEnabled(true);   // localStorage: favoritos e preferências
        config.setDatabaseEnabled(true);     // IndexedDB: o banco com os dados guardados
        config.setAllowFileAccess(false);
        config.setAllowContentAccess(false);
        config.setMediaPlaybackRequiresUserGesture(true);
        config.setUserAgentString(config.getUserAgentString() + " ScoresportsApp/1.0");
        // respeita o tamanho de letra do celular até +15%; acima disso o layout quebra
        config.setTextZoom(Math.min(Math.round(getResources().getConfiguration().fontScale * 100), 115));

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest pedido) {
                Uri uri = pedido.getUrl();
                String host = uri.getHost() == null ? "" : uri.getHost();
                if (host.equals("appassets.androidplatform.net")) {
                    return arquivos.shouldInterceptRequest(uri);
                }
                if (pedido.getMethod().equals("GET") && (host.endsWith("espn.com") || host.endsWith("wikipedia.org") || host.endsWith("wikidata.org"))) {
                    return buscarPeloAndroid(uri.toString());
                }
                return null; // o resto (fontes, logos, fotos) segue normal
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest pedido) {
                Uri uri = pedido.getUrl();
                if ("appassets.androidplatform.net".equals(uri.getHost())) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignorado) {
                    // sem navegador: não faz nada
                }
                return true;
            }
        });

        if (estadoSalvo != null) {
            web.restoreState(estadoSalvo);
        } else {
            web.loadUrl(ENDERECO_APP);
        }
    }

    /** Faz o pedido HTTP pelo Android e devolve a resposta com a permissão de CORS. */
    private WebResourceResponse buscarPeloAndroid(String endereco) {
        Map<String, String> cabecalhos = new HashMap<>();
        cabecalhos.put("Access-Control-Allow-Origin", "*");
        cabecalhos.put("Cache-Control", "no-store");
        HttpURLConnection conexao = null;
        try {
            conexao = (HttpURLConnection) new URL(endereco).openConnection();
            conexao.setConnectTimeout(15000);
            conexao.setReadTimeout(20000);
            conexao.setInstanceFollowRedirects(true);
            conexao.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) ScoresportsApp/1.0");
            conexao.setRequestProperty("Accept", "application/json");
            int status = conexao.getResponseCode();
            InputStream corpo = status >= 400 ? conexao.getErrorStream() : conexao.getInputStream();
            if (corpo == null) {
                corpo = new ByteArrayInputStream(new byte[0]);
            }
            byte[] bytes = lerTudo(corpo);
            // o WebView não aceita códigos 3xx numa resposta montada à mão
            if (status >= 300 && status < 400) {
                status = 502;
            }
            String motivo = conexao.getResponseMessage();
            if (motivo == null || motivo.trim().isEmpty()) {
                motivo = status < 400 ? "OK" : "Erro";
            }
            return new WebResourceResponse("application/json", "utf-8", status, motivo, cabecalhos, new ByteArrayInputStream(bytes));
        } catch (Exception erro) {
            String json = "{\"erro\": \"sem conexão\"}";
            return new WebResourceResponse("application/json", "utf-8", 503, "Sem conexao", cabecalhos,
                    new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
        } finally {
            if (conexao != null) {
                conexao.disconnect();
            }
        }
    }

    private static byte[] lerTudo(InputStream entrada) throws java.io.IOException {
        java.io.ByteArrayOutputStream saida = new java.io.ByteArrayOutputStream();
        byte[] bloco = new byte[16384];
        int lidos;
        while ((lidos = entrada.read(bloco)) != -1) {
            saida.write(bloco, 0, lidos);
        }
        entrada.close();
        return saida.toByteArray();
    }

    /** Botão voltar do Android: fecha o painel, a gaveta ou o detalhe antes de sair do app. */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.voltarAndroid ? window.voltarAndroid() : false", resultado -> {
            if (!"true".equals(resultado)) {
                if (web.canGoBack()) {
                    web.goBack();
                } else {
                    MainActivity.super.onBackPressed(); // sai do app
                }
            }
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado);
        web.saveState(estado);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }
}
