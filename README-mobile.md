# MiniFeather Client — Móvil (Android APK + iOS userscript)

Port del client a móviles sin extensión de Chrome. Todo reutiliza los módulos originales:

- `src/Core/CompatShim.js` — implementa el subconjunto de `chrome.*` que usa el client (`storage`, `runtime.getURL`, `sendMessage`, `connect`) sobre localStorage. No hace nada si la extensión real está instalada.
- `src/Core/MF_MiniBackground.js` — puerto del service worker (`background.js`): cuentas/skins, spritesheet, updater + hot-sync (OTA sigue funcionando) y los puertos ntfy de señalización (chat, voz, localgames).
- `src/Core/MF_InPageRedirects.js` — sustituto in-página de `declarativeNetRequest` (parchea `fetch`/XHR/`img.src`): spritesheet, texturas extra, y skins/capas custom.
- `tools/build-mobile.js` — empaqueta los módulos en el orden exacto de `manifest.json`:
  - `dist/MiniFeatherClient.user.js` → userscript (iOS / Firefox Android / escritorio)
  - `android/app/src/main/assets/mf/main.js` + `main-end.js` → arranque del APK

## Android — APK

1. Descarga el APK del release rolling: `https://github.com/DevOfficial-Client/MiniFeather-Client/releases/tag/apk-latest`
2. Ábrelo en el teléfono y acepta "instalar de origen desconocido".
3. El primer arranque pide permiso de micrófono (voz P2P). Listo: se abre miniblox.io con el client inyectado.

El APK se regenera automáticamente en cada push a `main` (workflow `mobile-build`). El HotLoader aplica hot-updates de los módulos marcados en `hotload.json` sin reinstalar el APK.

Nota: es un build *debug* firmado con la clave de debug generada en CI — normal para uso personal; si algún día se quiere publicar en Play Store se firma release.

## iOS — Safari + app "Userscripts" (gratis, sin cuenta de developer)

1. Instala **Userscripts** desde el App Store (gratis y open source: https://github.com/quoid/userscripts).
2. Ajustes → Safari → Extensiones → Userscripts → permitir en `miniblox.io` y activarla.
3. En la app Userscripts: añadir nuevo script desde URL:
   `https://raw.githubusercontent.com/DevOfficial-Client/MiniFeather-Client/main/dist/MiniFeatherClient.user.js`
4. Abre miniblox.io en Safari — el client carga como en escritorio.

Limitaciones iOS: sin redirects de skins vía `declarativeNetRequest` (se usan los in-page), el updater abre el zip por link en vez de `chrome.downloads`, y los hot-modules se aplican al recargar la página.

## Firefox Android (alternativa sin APK)

1. Instala Firefox y la extensión **Violentmonkey**.
2. Importa el mismo userscript de arriba.
3. Igual que iOS: shim + mini-background embebidos, sin service worker.

## Desarrollo

```bash
node tools/build-mobile.js          # regenera userscript + bundles Android
node --check dist/MiniFeatherClient.user.js
cd android && gradle :app:assembleDebug   # requiere JDK 17 + Android SDK
```

`CompatShim` solo se activa si NO hay extensión real (`chrome.runtime.id` ausente), así que el mismo código es inofensivo en la extensión de escritorio.
