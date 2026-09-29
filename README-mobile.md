# minifeather client — builds (android apk, windows msi, linux, ios userscript)

the client packaged for every platform, no chrome extension needed. everything reuses the
original modules; the extension chrome is replaced by a small compatibility layer.

## how it works

- `src/Core/CompatShim.js` — implements the chrome.* subset the client uses (`storage`,
  `runtime.getURL`, `sendMessage`, `connect`) over localStorage. silently does nothing when
  the real extension is running.
- `src/Core/MF_MiniBackground.js` — port of the service worker (`background.js`): accounts,
  skins/capes, spritesheet prefs, the updater + **hot-sync (the client hot-updates itself
  from github, no reinstalls)** and the ntfy signaling ports (chat, voice, localgames).
  hot modules apply on the next load and the page auto-reloads when idle code lands.
- `src/Core/MF_InPageRedirects.js` — in-page replacement for `declarativeNetRequest`
  (patches `fetch`/XHR/`img.src`): spritesheet, extra textures, custom skins/capes.
- `src/Core/MF_EulaGate.js` — accept dialog for the embedded apps (tauri/electron).
- `tools/build-mobile.js` — packs the modules in the exact `manifest.json` order and emits
  one bundle per target (userscript, android, tauri, electron).

## downloads

rolling release, regenerated on every push to `main`:
`https://github.com/DevOfficial-Client/MiniFeather-Client/releases/tag/apk-latest`

- **android apk** (debug-signed): open it on the phone, allow unknown sources, done.
  first launch shows the eula (human tl;dr, en/es, full legal text one tap away).
- **windows msi** (tauri + webview2): standard installer with the legal eula license page.
- **linux**: appimage (universal) or deb (electron).

## ios — safari + the free "userscripts" app

1. install **userscripts** from the app store (free, open source: https://github.com/quoid/userscripts).
2. settings → safari → extensions → userscripts → allow on `miniblox.io`.
3. in the userscripts app, add a new script from url:
   `https://raw.githubusercontent.com/DevOfficial-Client/MiniFeather-Client/main/dist/MiniFeatherClient.user.js`
4. open miniblox.io in safari.

## firefox android (no apk)

install firefox + **violentmonkey**, import the same userscript url.

## eula

every package ships the eula in both flavors and languages: `EULA.md` / `EULA.es.md`
(full legal text) and `EULA-TLDR.en.md` / `EULA-TLDR.md` (human-readable version).

## development

```bash
node tools/build-mobile.js        # regenerate all bundles
node --check dist/MiniFeatherClient.user.js
gradle :app:assembleDebug -p android          # android (jdk 17 + sdk)
cd windows-msi && npx @tauri-apps/cli@2 build # windows msi (rust)
cd linux-installer && npm install && npm run dist # linux packages
```

`CompatShim` only activates when the real extension is absent (no `chrome.runtime.id`),
so the same code is harmless in the desktop extension.
