#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// minifeather client for windows. webview2 loads miniblox.io and the client rides in
// via initialization scripts (webview2 runs them before any page script, document_start
// style). assets are served over the mfapp custom protocol straight from the install dir.
// no csp on miniblox, so the hotloader can eval freely. lucky us. :D

use std::fs;
use std::path::PathBuf;

use tauri::Manager;
use tauri::WebviewUrl;
use tauri::WebviewWindowBuilder;
use tauri::webview::NewWindowResponse;

const MAIN_JS: &str = include_str!("../resources/mf/main.js");
const END_JS: &str = include_str!("../resources/mf/main-end.js");

fn mime_for(path: &str) -> &'static str {
    let p = path.to_lowercase();
    if p.ends_with(".js") || p.ends_with(".mjs") {
        "text/javascript"
    } else if p.ends_with(".json") {
        "application/json"
    } else if p.ends_with(".html") {
        "text/html"
    } else if p.ends_with(".css") {
        "text/css"
    } else if p.ends_with(".png") {
        "image/png"
    } else if p.ends_with(".gif") {
        "image/gif"
    } else if p.ends_with(".webp") {
        "image/webp"
    } else if p.ends_with(".jpg") || p.ends_with(".jpeg") {
        "image/jpeg"
    } else if p.ends_with(".svg") {
        "image/svg+xml"
    } else if p.ends_with(".ogg") || p.ends_with(".oga") {
        "audio/ogg"
    } else if p.ends_with(".mp3") {
        "audio/mpeg"
    } else if p.ends_with(".wav") {
        "audio/wav"
    } else if p.ends_with(".ttf") {
        "font/ttf"
    } else if p.ends_with(".otf") {
        "font/otf"
    } else if p.ends_with(".woff") {
        "font/woff"
    } else if p.ends_with(".woff2") {
        "font/woff2"
    } else if p.ends_with(".glb") {
        "model/gltf-binary"
    } else if p.ends_with(".gltf") {
        "model/gltf+json"
    } else {
        "application/octet-stream"
    }
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
            if let Ok(v) = u8::from_str_radix(hex, 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn serve_file(root: &PathBuf, rel: &str) -> tauri::http::Response<Vec<u8>> {
    let cors = ("Access-Control-Allow-Origin", "*");
    if rel.is_empty() || rel.split('/').any(|seg| seg == "..") {
        return tauri::http::Response::builder()
            .status(404)
            .header(cors.0, cors.1)
            .body(Vec::new())
            .unwrap();
    }
    let full = root.join(rel);
    match fs::read(&full) {
        Ok(data) => tauri::http::Response::builder()
            .status(200)
            .header("Content-Type", mime_for(rel))
            .header("Cache-Control", "public, max-age=3600")
            .header(cors.0, cors.1)
            .body(data)
            .unwrap(),
        Err(_) => tauri::http::Response::builder()
            .status(404)
            .header(cors.0, cors.1)
            .body(Vec::new())
            .unwrap(),
    }
}

// paste/drag chat images: the webview cannot POST to catbox (no cors headers on their
// api), so the rust side does the upload on the page's behalf. no accounts, no github. :D
fn catbox_upload(bytes: Vec<u8>) -> impl std::future::Future<Output = Result<String, String>> {
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name("image.png")
        .mime_str("application/octet-stream")
        .expect("static mime");
    let form = reqwest::multipart::Form::new()
        .text("reqtype", "fileupload")
        .part("fileToUpload", part);
    async move {
        let client = reqwest::Client::new();
        let res = client
            .post("https://catbox.moe/user/api.php")
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("upload failed: {e}"))?;
        let text = res.text().await.map_err(|e| format!("read failed: {e}"))?;
        let url = text.trim().to_string();
        if url.starts_with("https://files.catbox.moe/") {
            Ok(url)
        } else {
            Err(format!("catbox rejected: {}", url.chars().take(80).collect::<String>()))
        }
    }
}
fn main() {
    // the 68% lives here, at chromium's device-scale layer: the game sizes its canvas
    // to the css viewport, so css zoom breaks that math (canvas at zoom% of the window).
    // dsf makes innerWidth grow instead and the canvas fills the window on its own. :D
    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--force-device-scale-factor=0.68");

    tauri::Builder::default()
        .register_uri_scheme_protocol("mfapp", |ctx, request| {
            let uri = request.uri();
            let path = percent_decode(uri.path());
            let rel = path.trim_start_matches('/');

            // POST /upload = chat image upload proxy (catbox). the handler thread blocks
            // on a channel while the spawned task does the async http round trip.
            if rel == "upload" && request.method() == tauri::http::Method::POST {
                let body = request.into_body();
                let (tx, rx) = std::sync::mpsc::channel();
                tauri::async_runtime::spawn(async move {
                    let _ = tx.send(catbox_upload(body).await);
                });
                let (status, text) = match rx.recv() {
                    Ok(Ok(url)) => (200u16, url),
                    Ok(Err(e)) => (502u16, e),
                    Err(e) => (500u16, format!("channel: {e}")),
                };
                return tauri::http::Response::builder()
                    .status(status)
                    .header("Content-Type", "text/plain; charset=utf-8")
                    .header("Access-Control-Allow-Origin", "*")
                    .body(text.into_bytes())
                    .unwrap();
            }
            let root = ctx
                .app_handle()
                .path()
                .resource_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            let root = root.join("client");
            if request.method() == tauri::http::Method::OPTIONS {
                return tauri::http::Response::builder()
                    .status(200)
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                    .header("Access-Control-Allow-Headers", "*")
                    .body(Vec::new())
                    .unwrap();
            }
            let rel = if rel.starts_with("mf/") {
                rel.to_string()
            } else {
                format!("client/{}", rel)
            };
            serve_file(&root.parent().unwrap_or(&root).to_path_buf(), &rel)
        })
        .setup(|app| {
            // boots on the local splash page (frontendDist) which paints instantly and
            // self-navigates to the game: no white flash, ever. :D
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("minifeather client")
                .inner_size(1280.0, 720.0)
                .min_inner_size(800.0, 480.0)
                .center()
                // wry blocks every popup by default, which kills the google sign-in
                // popup. allow lets webview2 open it natively, keeping window.opener
                // alive so the oauth postMessage dance works. :D
                .on_new_window(|_url, _features| NewWindowResponse::Allow)
                .initialization_script(MAIN_JS)
                .initialization_script(END_JS)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running minifeather client");
}
