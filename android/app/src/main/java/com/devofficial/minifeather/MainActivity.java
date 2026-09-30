package com.devofficial.minifeather;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
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
import java.util.Scanner;

// minifeather client for android. loads miniblox.io and injects the client before the
// game notices anything. the eula gate runs first, because lawyers. :v
public class MainActivity extends Activity {

    private static final String TAG = "minifeather";
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://miniblox.io/";

    // defines window.__MF_UPLOAD_BRIDGE__ for the chat paste/drag flow: hands the file
    // (base64) to the MFAndroidUpload js interface and resolves with the catbox url.
    private static final String UPLOAD_BRIDGE_JS =
            "window.__MF_UPLOAD_BRIDGE__=function(file){return new Promise(function(resolve){" +
            "var fr=new FileReader();fr.onerror=function(){resolve({success:false,error:'read failed'})};" +
            "fr.onload=function(){var b64=String(fr.result||'').split(',')[1]||'';" +
            "var cb='mfup'+Date.now()+Math.floor(Math.random()*1e6);var t=setTimeout(function(){" +
            "if(window[cb]){delete window[cb];resolve({success:false,error:'timeout'})}},90000);" +
            "window[cb]=function(ok,val){clearTimeout(t);delete window[cb];" +
            "resolve(ok?{success:true,url:val}:{success:false,error:String(val)})};" +
            "try{window.MFAndroidUpload.upload(b64,(file&&file.name)||'imagen.png',cb)}" +
            "catch(e){clearTimeout(t);delete window[cb];resolve({success:false,error:String(e)})}};" +
            "fr.readAsDataURL(file)})};";

    private static final String BOOT_TAGS =
            "<script src=\"https://appassets.androidplatform.net/mf/main.js\"></script>"
            + "<script>" + UPLOAD_BRIDGE_JS + "</script>"
            + "<script defer src=\"https://appassets.androidplatform.net/mf/main-end.js\"></script>";

    private static final int FILE_CHOOSER_CODE = 1001;
    private static final String EULA_PREF = "mf_eula";
    private static final String EULA_ACCEPTED = "mf_eula_accepted_v1";

    private WebView webView;
    private boolean pendingLoad = true;
    private ValueCallback<Uri[]> filePathCallback;
    private PermissionRequest pendingPermission;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = new WebView(this);
        setContentView(webView);
        webView.addJavascriptInterface(new MFUploader(), "MFAndroidUpload");

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

        if (isEulaAccepted()) {
            startGame();
        } else {
            showEula();
        }
        ensureMicPermission();
    }

    private String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    // ---------------- eula gate: human tl;dr by default, legal text one tap away ----------------

    private boolean isSpanishLocale() {
        return getApplicationContext().getResources().getConfiguration()
                .locale.getLanguage().startsWith("es");
    }

    private boolean isEulaAccepted() {
        return getSharedPreferences(EULA_PREF, MODE_PRIVATE).getBoolean(EULA_ACCEPTED, false);
    }

    private void startGame() {
        if (!pendingLoad) return;
        pendingLoad = false;
        webView.loadUrl(START_URL);
    }

    private String readAsset(String name) {
        AssetManager assets = getAssets();
        try {
            InputStream in = assets.open("eula/" + name);
            Scanner scanner = new Scanner(in, "UTF-8").useDelimiter("\\A");
            String text = scanner.hasNext() ? scanner.next() : "";
            scanner.close();
            return text;
        } catch (IOException e) {
            return name;
        }
    }

    private void showEula() {
        boolean es = isSpanishLocale();
        String human = readAsset(es ? "EULA-TLDR.md" : "EULA-TLDR.en.md");
        String legal = readAsset(es ? "EULA.es.md" : "EULA.md");
        final boolean[] showingLegal = {false};

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(es ? "eula de minifeather client" : "minifeather client eula")
                .setMessage(human)
                .setPositiveButton(es ? "aceptar y jugar" : "accept and play",
                        (d, which) -> {
                            getSharedPreferences(EULA_PREF, MODE_PRIVATE)
                                    .edit().putBoolean(EULA_ACCEPTED, true).apply();
                            startGame();
                        })
                .setNegativeButton(es ? "rechazar y salir" : "decline and exit",
                        (d, which) -> finish())
                .setNeutralButton(es ? "ver eula legal" : "view legal eula", null)
                .setCancelable(false)
                .create();
        dialog.show();
        dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v -> {
            showingLegal[0] = !showingLegal[0];
            dialog.setMessage(showingLegal[0] ? legal : human);
        });
    }

    // ---------------- webviewclient: asset serving + injection ----------------

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

    // serves the packaged client (assets/client/** and assets/mf/**) with open cors
    private WebResourceResponse serveClientAsset(String rawPath) {
        if (rawPath == null) return notFound();
        String path = rawPath.startsWith("/") ? rawPath.substring(1) : rawPath;
        if (path.isEmpty() || path.contains("..")) return notFound();

        InputStream in = null;
        String[] candidates = {"client/" + path, path};
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

    // fetches the main html, injects the client bundles right after <head> and serves it.
    // on any failure returns null so webview loads the original page, client-less but alive.
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
            return new WebResourceResponse("text/html", "utf-8", 200, "OK", headers,
                    new ByteArrayInputStream(out));
        } catch (Exception e) {
            Log.w(TAG, "interceptGameDocument failed: " + e);
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

    // ---------------- chat image upload proxy (catbox) ----------------
    // the webview cannot POST to catbox (no cors headers on their api), so java does
    // the upload on the page's behalf — same deal as the tauri/extension shells. :D
    private class MFUploader {
        @JavascriptInterface
        public void upload(final String b64, final String name, final String callback) {
            new Thread(() -> {
                boolean ok = false;
                String value = "upload failed";
                try {
                    if (b64 == null || b64.isEmpty() || b64.length() > 16 * 1024 * 1024) {
                        throw new IOException("imagen demasiado grande (max 10mb)");
                    }
                    byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                    String safeName = (name == null || name.isEmpty() ? "image.png" : name)
                            .replaceAll("[^\\w.-]", "_");
                    String boundary = "----minifeather" + System.currentTimeMillis();
                    java.io.ByteArrayOutputStream body = new java.io.ByteArrayOutputStream();
                    body.write(("--" + boundary + "\r\n"
                            + "Content-Disposition: form-data; name=\"reqtype\"\r\n\r\nfileupload\r\n"
                            + "--" + boundary + "\r\n"
                            + "Content-Disposition: form-data; name=\"fileToUpload\"; filename=\""
                            + safeName + "\"\r\n"
                            + "Content-Type: application/octet-stream\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                    body.write(bytes);
                    body.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));

                    HttpURLConnection conn = (HttpURLConnection) new URL("https://catbox.moe/user/api.php").openConnection();
                    conn.setRequestMethod("POST");
                    conn.setDoOutput(true);
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(90000);
                    conn.setFixedLengthStreamingMode(body.size());
                    conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
                    java.io.OutputStream os = conn.getOutputStream();
                    body.writeTo(os);
                    os.close();
                    int code = conn.getResponseCode();
                    InputStream in = code < 400 ? conn.getInputStream() : conn.getErrorStream();
                    String text = in == null ? "" : new String(readAll(in), StandardCharsets.UTF_8).trim();
                    if (in != null) in.close();
                    conn.disconnect();
                    ok = code < 400 && text.startsWith("https://files.catbox.moe/");
                    value = ok ? text : "catbox " + code + ": "
                            + text.substring(0, Math.min(80, text.length()));
                } catch (Exception e) {
                    value = String.valueOf(e);
                }
                final boolean fOk = ok;
                final String fValue = value;
                final String cb = callback == null ? "" : callback.replaceAll("[^A-Za-z0-9_]", "");
                runOnUiThread(() -> {
                    if (cb.isEmpty() || webView == null) return;
                    String json = "\"" + fValue.replace("\\", "\\\\").replace("\"", "\\\"")
                            .replace("\r", "\\r").replace("\n", "\\n") + "\"";
                    webView.evaluateJavascript(
                            "try{(window['" + cb + "']||0)(" + fOk + "," + json + ")}catch(e){}", null);
                });
            }).start();
        }
    }

    // ---------------- webchromeclient: permissions, file chooser, console ----------------

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
                        Intent.createChooser(intent, "select file"), FILE_CHOOSER_CODE);
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

    // ---------------- downloads (chrome.downloads shim -> downloadmanager) ----------------

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
            Toast.makeText(this, "downloading update…", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Log.w(TAG, "download failed: " + e);
        }
    }

    // ---------------- navigation / lifecycle ----------------

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
