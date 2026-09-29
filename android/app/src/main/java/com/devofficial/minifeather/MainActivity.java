package com.devofficial.minifeather;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLConnection;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * MiniFeather Client para Android.
 * Carga miniblox.io en un WebView e inyecta el client (bundles mf/main.js y mf/main-end.js,
 * generados por tools/build-mobile.js) justo tras <head>, replicando el orden de los
 * content scripts del manifest y la semántica document_start / document_end (defer).
 * Los recursos del client se sirven desde el APK bajo https://appassets.androidplatform.net/
 * con cabeceras CORS, equivalente a web_accessible_resources.
 */
public class MainActivity extends Activity {

    private static final String TAG = "MiniFeather";
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://miniblox.io/";
    private static final String BOOT_TAGS =
            "<script src=\"https://appassets.androidplatform.net/mf/main.js\"></script>"
            + "<script defer src=\"https://appassets.androidplatform.net/mf/main-end.js\"></script>";

    private static final int FILE_CHOOSER_CODE = 1001;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private PermissionRequest pendingPermission;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " MiniFeatherAndroid/" + versionName());

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new MFWebViewClient());
        webView.setWebChromeClient(new MFWebChromeClient());
        webView.setDownloadListener(this::enqueueDownload);

        webView.loadUrl(START_URL);
        ensureMicPermission();
    }

    private String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    // ---------------- WebViewClient: serving de assets + inyección ----------------

    private class MFWebViewClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            String host = url.getHost();
            if (host == null) return null;

            if (ASSET_HOST.equals(host)) {
                return serveClientAsset(url.getPath());
            }

            boolean gameHost = "miniblox.io".equals(host) || "miniblox.online".equals(host);
            if (request.isForMainFrame() && gameHost && "GET".equalsIgnoreCase(request.getMethod())) {
                return interceptGameDocument(url, request.getRequestHeaders());
            }
            return null;
        }
    }

    /** Sirve el client empaquetado (assets/client/** y assets/mf/**) con CORS abierto. */
    private WebResourceResponse serveClientAsset(String rawPath) {
        if (rawPath == null) return notFound();
        String path = rawPath.startsWith("/") ? rawPath.substring(1) : rawPath;
        if (path.isEmpty() || path.contains("..")) return notFound();

        InputStream in = null;
        String[] candidates = { "client/" + path, path };
        for (String candidate : candidates) {
            try {
                in = getAssets().open(candidate);
                break;
            } catch (IOException ignored) { }
        }
        if (in == null) return notFound();

        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cache-Control", "public, max-age=3600");
        return new WebResourceResponse(guessMime(path), null, 200, "OK", headers, in);
    }

    private WebResourceResponse notFound() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers,
                new ByteArrayInputStream(new byte[0]));
    }

    /**
     * Descarga el HTML principal de miniblox.io, inyecta los bundles del client tras <head>
     * y devuelve la respuesta modificada. Si algo falla, devuelve null para que WebView
     * cargue la página original (sin client) en lugar de romper la navegación.
     */
    private WebResourceResponse interceptGameDocument(Uri uri, Map<String, String> requestHeaders) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(uri.toString());
            conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);
            String cookie = CookieManager.getInstance().getCookie(uri.toString());
            if (cookie != null) conn.setRequestProperty("Cookie", cookie);
            conn.setRequestProperty("User-Agent", webView.getSettings().getUserAgentString());
            String accept = requestHeaders != null ? requestHeaders.get("Accept") : null;
            conn.setRequestProperty("Accept", accept != null ? accept : "text/html,application/xhtml+xml,*/*");

            int code = conn.getResponseCode();
            if (code != 200) return null;
            String type = conn.getContentType();
            if (type == null || !type.toLowerCase().contains("text/html")) return null;

            byte[] body = readAll(conn.getInputStream());
            String html = new String(body, StandardCharsets.UTF_8);
            html = injectAfterHead(html, BOOT_TAGS);
            if (html == null) return null;

            byte[] out = html.getBytes(StandardCharsets.UTF_8);
            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "*");
            String contentType = type.contains("charset") ? type : type + "; charset=utf-8";
            return new WebResourceResponse("text/html", "utf-8", 200, "OK", headers,
                    new ByteArrayInputStream(out));
        } catch (Exception e) {
            Log.w(TAG, "interceptGameDocument falló: " + e);
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    static String injectAfterHead(String html, String inject) {
        String lower = html.toLowerCase();
        int idx = lower.indexOf("<head");
        if (idx >= 0) {
            int gt = html.indexOf('>', idx);
            if (gt >= 0) return html.substring(0, gt + 1) + inject + html.substring(gt + 1);
        }
        idx = lower.indexOf("<html");
        if (idx >= 0) {
            int gt = html.indexOf('>', idx);
            if (gt >= 0) return html.substring(0, gt + 1) + inject + html.substring(gt + 1);
        }
        return inject + html;
    }

    private static byte[] readAll(InputStream in) throws IOException {
        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        in.close();
        return bos.toByteArray();
    }

    private static String guessMime(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".gif")) return "image/gif";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".ogg") || p.endsWith(".oga")) return "audio/ogg";
        if (p.endsWith(".mp3")) return "audio/mpeg";
        if (p.endsWith(".wav")) return "audio/wav";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".otf")) return "font/otf";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".glb")) return "model/gltf-binary";
        if (p.endsWith(".gltf")) return "model/gltf+json";
        String guessed = URLConnection.guessContentTypeFromName(p);
        return guessed != null ? guessed : "application/octet-stream";
    }

    // ---------------- WebChromeClient: permisos, file chooser, consola ----------------

    private class MFWebChromeClient extends WebChromeClient {
        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            runOnUiThread(() -> {
                boolean allGranted = true;
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                        allGranted &= hasPermission(android.Manifest.permission.RECORD_AUDIO);
                    } else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                        allGranted &= hasPermission(android.Manifest.permission.CAMERA);
                    }
                }
                if (allGranted) {
                    request.grant(request.getResources());
                } else {
                    pendingPermission = request;
                    ensureMicPermission();
                }
            });
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (filePathCallback != null) filePathCallback.onReceiveValue(null);
            filePathCallback = callback;
            try {
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                startActivityForResult(
                        Intent.createChooser(intent, "Seleccionar archivo"), FILE_CHOOSER_CODE);
            } catch (Exception e) {
                filePathCallback = null;
                return false;
            }
            return true;
        }

        @Override
        public boolean onConsoleMessage(android.webkit.ConsoleMessage message) {
            Log.d(TAG, "[console] " + message.messageLevel() + " " + message.message());
            return true;
        }
    }

    private boolean hasPermission(String perm) {
        return checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED;
    }

    private void ensureMicPermission() {
        if (Build.VERSION.SDK_INT >= 23 && !hasPermission(android.Manifest.permission.RECORD_AUDIO)) {
            requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, 1002);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 1002 && pendingPermission != null) {
            PermissionRequest req = pendingPermission;
            pendingPermission = null;
            java.util.ArrayList<String> granted = new java.util.ArrayList<>();
            for (String resource : req.getResources()) {
                boolean ok = true;
                if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                    ok = hasPermission(android.Manifest.permission.RECORD_AUDIO);
                } else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                    ok = hasPermission(android.Manifest.permission.CAMERA);
                }
                if (ok) granted.add(resource);
            }
            if (!granted.isEmpty()) req.grant(granted.toArray(new String[0]));
            else req.deny();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_CODE && filePathCallback != null) {
            filePathCallback.onReceiveValue(
                    WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            filePathCallback = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    // ---------------- Descargas (chrome.downloads shim → DownloadManager) ----------------

    private void enqueueDownload(String url, String userAgent, String contentDisposition,
                                 String mimeType, long contentLength) {
        try {
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null) req.addRequestHeader("Cookie", cookie);
            req.addRequestHeader("User-Agent", userAgent != null ? userAgent
                    : webView.getSettings().getUserAgentString());
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,
                    "MiniFeather-Client.zip");
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            dm.enqueue(req);
            Toast.makeText(this, "Descargando actualización…", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Log.w(TAG, "descarga falló: " + e);
        }
    }

    // ---------------- Navegación / ciclo de vida ----------------

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            moveTaskToBack(true);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    private void hideSystemUi() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
