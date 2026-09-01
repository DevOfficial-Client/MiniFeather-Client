# Análisis del código: MiniFeather Client

> Documento generado el 2026-08-31 analizando la carpeta `c:\Users\etc\Desktop\MiniFeather-Client`.

## Identidad

| Campo | Valor |
|---|---|
| Nombre | **MiniFeatherClient** |
| Versión | 4.7.1 |
| Tipo | Extensión Chrome **Manifest V3** (mod de cliente para miniblox.io) |
| Descripción | "MiniFeather Client for Miniblox — Better Player Layers Beta" |
| Repo | `DevOfficial-Client/MiniFeather-Client` (rama `main`) |
| Build | 2026-08-28 — feature estrella: segunda capa de piel 3D píxel a píxel + manga en primera persona |
| Lenguaje | Vanilla JS, sin build step (los archivos de `src/` se sirven tal cual) |

Dominios objetivo: `miniblox.io` y `miniblox.online` (mirror). Permisos: `storage`, `declarativeNetRequest`, `activeTab`, `alarms`, `downloads`; además GitHub para el auto-updater.

## Arquitectura (3 contextos)

### 1. Service worker — `src/background.js` (~1.040 líneas)
Único lugar con APIs privilegiadas:
- **Redirects de skins/capes** con `declarativeNetRequest` (reglas 1000+ skins, 2000+ capes): redirige `textures/entity/skins/<name>.png` a URLs personalizadas.
- **Redirects de texturas**: regla 999 (spritesheet principal), 10000–10019 (armaduras a pack remoto), 20000–29999 (~340 texturas locales del bundle `textures/`), 30000+ (UI del menú). Bloques generados entre marcadores `MFGEN:...`.
- **Auto-updater V2**: poll a GitHub cada 6h (`chrome.alarms`), compara SHAs de blobs vs el git tree remoto, muestra badge "UP" y puede descargar el zip del repo.
- Router de mensajes: `setSkin`, `setCape`, `setSpritesheet`, `setLocalTextures`, `setMenuUiOverride`, `mfUpdater:*`.

### 2. Content scripts en el mundo MAIN (`document_start`, `all_frames`)
~40 archivos (líneas 39–89 de `manifest.json`) que corren **dentro del contexto JS de la página**. El handle del juego se resuelve vía `globalThis.__MINIBLOX_GAME__`, `globalThis.miniblox` o caminando los React fibers (`#react` → `updateQueue.baseState.element.props.game`). Cada módulo es un IIFE con guard `window.__MF_*` y expone APIs `window.MF_*`.

### 3. Content scripts en mundo ISOLATED (`document_end`)
`translations.js`, `jszip.min.js`, `TexturePackManager.js`, `AutoUpdater.js` y **`content.js` (~8.750 líneas)** — el orquestador y host del GUI.

### Comunicación entre contextos
1. **Ciclo de vida**: `createLifecycle()` → `{enable, disable, refresh, destroy}`; `registerModule(name, factory)` en un `MODULES` Map; `applyGuiSettings()` mapea settings → módulos.
2. **Puente CustomEvent** (ISOLATED → MAIN): `document.dispatchEvent(new CustomEvent('minifeather:<feature>-config', {detail}))` con ~44 features (patpat, elytra-flight, no-weather, leaf-wind, handsway, better-player-layers, guipatch, custom-shader, damage-particles, auto-respawn, anti-afk, rhythmparkour, localgames, zoom, cameraoverhaul, freecam, dynamiccrosshair, armorhud, healthnametags, waypoints, client-binds, language-config...). Los módulos MAIN responden con `minifeather:<feature>-state`.
3. **Globals de ventana** para comandos: `MF_Verity`, `MF_Peer`, `MF_CustomModels`, `MF_FEATURES` consumidos por `ClientCommands.js`, que hookea el chat del juego y despacha `minifeather:client-command`.

## Features principales

### HUD
- `keystrokes` — visualizador WASD/clicks.
- `fpsCounter` / `cpsCounter` / `pingCounter` — cajas de stats arrastrables (ping desde el RTT de la conexión).
- `coordinates` — lectura XYZ.
- `armorHud` — HUD de durabilidad de armadura con editor visual (`assets/armor-hud-editor.png`).
- `dynamicCrosshair` — crosshair que cambia según objetivo del raycast (aire/bloque/entidad/jugador/item) con iconos de `assets/crosshair/*.png`.
- `guiPatch` — parchea el bundle `GuiHud-*.js` en vuelo (hash detectado con `PerformanceObserver`).

### Render / visuales
- `rebrand` — logo, favicon, título y fondo con assets MiniFeather + fuente pixel `Faithful.ttf` (incluye patch de `CanvasRenderingContext2D.font`).
- `titanTiny` — escala del jugador local 0.20x–5.00x (hitbox, cámara y nametag sincronizados).
- `betterPlayerLayers` — capa de piel secundaria 3D con inflate/depth/umbral alfa + brazo en primera persona.
- `healthNameTags` / `distanceNameTags` — barras de vida / distancias sobre jugadores.
- `damageParticles` — números de daño flotantes.
- `patPat` — acariciar entidades (squish + sonido + cámara + sync P2P).
- `itemPhysics`, `noWeather`, `leafWind`, `handSway`, `vanillaAnimations` — cosmética de mundo/mano.
- `zoom` (X), `freelook` (Z), `freecam`, `cameraOverhaul` (modelo de cámara con 11 parámetros: roll/bob/sway/FOV, presets suave/normal/fuerte), `elytraFlight` (modelo de vuelo con banking y auto-nivel).
- `customShader` — cadena de post-procesado (VHS, CRT, cel, fog, grain, glitch, bloom, aberración cromática, DOF) con preset default `spooklementary` y render-scale.

### Mundo / gameplay
- `waypoints` — posiciones guardadas con haz/overlay y panel.
- `WorldMap` — mapa del mundo a pantalla completa (tecla U), colores por bloque (`BLOCK_NAME_COLORS`), escaneo de chunks radio 12, caché por servidor (5 servidores / 500 chunks) + `MinimapCache`.
- `autoRespawn`, `antiAfk` (5–150s), `rhythmParkour` (híbrido ritmo/parkour sincronizado con música, multijugador P2P), `LocalGames` (ver abajo).
- `Baritone` — bot pathfinding A* real (MinHeap propio, presupuesto de 5s, caché de chunks, costes de salto/sneak); inyecta `desiredInput {strafe, forward, jump, sneak, yaw}` en el pipeline de input; `goto`, `follow(username)`, `stop`.
- `ClientCommands` — router de chat: `/toggle`, `/bind`, `/waypoint`, `/verity`, `/model`, `/room`, `/baritone`, `/p2p`, `/emote`, `/caballo`, `/stalker`, `/backrooms`, `/mf help`...

### Cosmética / assets
- `CustomSkins.js` — 52 skins + 33 capas incluidas vía redirects del background.
- `TexturePackManager` + JSZip — importa un resource pack real de Minecraft (.zip), reconstruye el spritesheet 1024px en canvas usando `assets/frames.json` y lo persiste como data-URL en localStorage; `TextureInterceptor.js` lo inyecta en el loader de texturas del juego.
- Pack local espejo en `assets/mfpack/` servido por un puente de meta-tags plantado por `SplashScreen.js`.

### Misc
- `FriendNicknames`, `translations.js` (multi-idioma), `SplashScreen` (splash animada 3.7s), `AutoUpdater`, `features.js` (color/grosor del highlight de bloques), página YouTube Music.
- `inject.js` — parchea `Response.prototype.json` para reescribir el `rank` de dos UUIDs a un tag cyan "DEV" (easter egg de devs) y proxy de import-maps que intercepta `GuiToast-*.js`.

## GUI / menú

- **Entrada**: botón pluma pixel-art insertado sobre el botón Settings del sidebar (retry 15s con MutationObserver) o tecla **Right Shift**.
- **Estructura**: `#mf-gui-overlay` + `#mf-gui`, creado lazy, descargado 160ms tras fade-out para no filtrar DOM.
- **Navegación**: 12 páginas (dashboard, hud, render, youtubeMusic, shaders, cosmetics, chat, waypoints, world, settings, about, credits) + **modo búsqueda global**.
- **Dashboard**: tarjetas en vivo de FPS/ping/módulos activos/versión (refresh 500ms).
- **Persistencia**: `chrome.storage.local` con debounce 150ms, flush en `beforeunload`/`visibilitychange`, sync entre tabs, guard contra "Extension context invalidated".
- **i18n**: `t(key)` desde `globalThis.MINIFEATHER_TRANSLATIONS`; cambios de idioma re-renderizan overlays MAIN.
- **Teardown completo** con `destroy()`: aborta 2 AbortControllers, desconecta 4 observers y elimina todo el DOM inyectado.

## Sistemas notables

### VerityAI (`src/VerityAI.js`)
Compañera IA in-game (`window.MF_Verity`). Tres proveedores: **puter.js** (gratis, sin key, vía CDN), **OpenRouter** (`gpt-4o-mini` default) y **GLM/Zhipu`; config en `localStorage['minifeather_verity_ai']`. Historial rodante de 20 mensajes, persona en español, retry con menor `max_tokens` en 402, respuestas habladas con `speechSynthesis`. `spawn()`/`despawn()` materializan a Verity como entidad 3D (`models/entities/verity_full_model.glb`, `verity_monstertm.glb`) con texturas de humor y clips de voz `.ogg`.

### P2P (`src/MF_Peer.js`)
WebRTC vía PeerJS 1.5.4. `/p2p host [code]` crea peer `mf-<code>`; **host autoritativo** (corre Verity local, difunde posición a 20Hz), guest renderiza un puppet interpolado. Parchea `MF_Verity.say` y `MF_CustomModels.despawn` para espejar chat/remociones; `sendPat()` replica el pat entre peers.

### Modelos custom y emotes
`CustomModels.js` mapea nombres de entidad a `.glb` (warden, caballo, stalker, backrooms level 0, maternal wraith, cubo de prueba) con animaciones; API `MF_CustomModels.set/spawn/despawn/followVerity/diag`. El pack "client-side mod" añade dimensión de terror: caballo con tareas/sonidos, stalker que se congela al ser observado, audio de jumpscare. `Emotes.js` traduce el **formato `.emotecraft` de Emotecraft** a rotaciones de mesh de miniblox (pivots/joints, escala por separación de caderas 3.8px MC, inversión de pitch/yaw, easings de easings.net, blending al reposo). Incluye wave, dance, facepalm, sit, tpose, Rat Dance.

### LocalGames (`src/LocalGames.js`)
El módulo más ambicioso: mundos sandbox offline/P2P. Secuestra la capa de sockets (solo deja pasar `SPacketPing`/`CPacketPong`), fabrica paquetes de chunks y registros de bloques, genera terreno por semilla y sincroniza por WebRTC (STUN de Cloudflare) + BroadcastChannel como registro global de salas (protocolo v3, máx 8 jugadores, staleness 5.5 min).

## Estructura de carpetas relevante

```
manifest.json          # MV3, orden de scripts
build.json             # metadatos del build
src/                   # ~45 módulos JS (content.js = 8.7k líneas, orquestador)
src/background.js      # redirects + updater
backups/               # copias .backup.js de 6 módulos (iteración activa)
assets/                # crosshairs, GUI, memes, mfpack, fuentes, sonidos, frames.json
textures/              # ~340 texturas servidas por redirect (entity/particle/etc.)
models/entities/       # .glb (warden, horse, stalker, verity, backrooms...)
emotes/                # .emotecraft
client-side mod/       # pack de contenido horror (entity/, horse/, sounds/, stalker/)
skins/, .commandcode/, YouTubeMusic.b64, skinuserscript.js
```

## Hallazgos / observaciones

- Proyecto muy activo: `backups/` con 6 módulos respaldados y build de hace 3 días.
- Sin build step ni bundler: todo vanilla JS served as-is — coherente con la naturaleza de userscript/extension modding.
- Acoplamiento defensivo fuerte al juego: resolución de handle por múltiples vías (global, React fibers), heurísticas de entity maps y BFS de joints, porque miniblox está minificado y sin versionar.
- Duplicados menores: `Dynamic Crosshair.js` y `DynamicCrosshair.js` ambos cargados; `LeafWind.js` listado dos veces en el manifest (líneas 64 y 81).
