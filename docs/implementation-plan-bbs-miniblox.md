# Implementation Plan — Funcionalidad tipo BBS en MiniFeather Client

> Plan para traer las capacidades de creación de películas/machinimas del mod BBS a miniblox.io, sobre la base del cliente MiniFeather v4.7.1.
> No se porta código de BBS (licencia ARR, Java/Fabric): se reimplementan los conceptos sobre el pipeline JS/Three.js de miniblox.

## Objetivo

Un módulo nuevo **`MF_Film`** que permita: grabar acciones del jugador, reproducirlas como actores visuales, mover una cámara cinematográfica por keyframes, y exportar video — todo client-side, con UI integrada en el GUI existente.

## Principios de diseño (alineados con el cliente)

- Un IIFE por archivo con guard `window.__MF_*`, API expuesta en `window.MF_Film`.
- Mundo MAIN (`document_start`) para acceso al juego; config vía `minifeather:film-config` desde `content.js` (mundo ISOLATED).
- Resolución defensiva del handle del juego (`globalThis.miniblox` → React fibers de `#react`), igual que el resto de módulos.
- Tiempo en **ticks de 20Hz** (como BBS), nunca frames: determinismo entre sesiones y FPS.
- Persistencia: `chrome.storage.local` para settings; `localStorage` para cachés grandes; export/import de proyectos como archivo `.mffilm.json`.

---

## Fase 1 — Recorder + Actor Puppet (MVP) — ✅ IMPLEMENTADA

> Implementado en `src/MF_Film.js` (~530 líneas) + comando `/film` en ClientCommands.js + registro en manifest.

**Lo implementado:**
- Recorder a 20Hz (`setInterval` 50ms) con delta encoding (umbral 1e-4), contador de ticks caídos para diagnóstico y tolerancia a entidades no disponibles un instante.
- Captura por frame: XYZ, yaw, pitch, sneak/sprint + 11 joints (`headPivot`, `body`, `skeleton` solo-posición, shoulders/elbows, hips/knees) vía BFS.
- Formato `.mffilm.json` v1 con `version/name/fps/durationTicks/server/actors[].frames` — coincide con el spec de arriba.
- Playback: rAF con muestreo por tick fraccional, interpolación lerp para posición y camino-corto para yaw/joints; pausa/reanudación con `playTickBase`.
- Actor puppet: spawn vía `MF_CustomModels.spawn(file, x,y,z, {puppet:true})` (patrón MF_Peer/Verity); los joints se aplican por BFS sobre el root del actor.
- Integración con `MF_FaceSwap.onTick(tick)` en cada tick de playback → los triggers de cara se disparan en su punto del video.
- Persistencia: `localStorage['minifeather_films_v1']` con límite 45MB y error descriptivo; export como descarga blob.
- Al reproducir se detiene cualquier emote activo (mitigación de conflicto de joints).
- `diag()` reporta joints encontrados para validar contra cambios del bundle.

**Pendiente de F1 (conocido):** el actor usa `verity_full_model.glb` como modelo base; la skin real del jugador grabado llega con la Fase 4.2 (skin del actor).

### Archivos nuevos
- `src/MF_Film.js` (~600 líneas estimadas): recorder + playback + actor manager.

### Componentes

**1. Recorder**
- Loop de muestreo a 20Hz (setInterval de 50ms, no rAF) sobre `game.player`:
  - Posición XYZ, yaw, pitch, onGround, sneak/sprint/swim flags.
  - Joints del mesh: reusar `findJoint(mesh, name)` por BFS (patrón Emotes.js) para headPivot, shoulders/elbows, hips/knees, body, skeleton.
  - Held item id + swing flag (si es accesible en el estado del player).
- Compresión de keyframes: solo guardar el frame si cambia algo respecto al anterior (delta encoding); interpolación Hermite en playback para suavizar.

**2. Formato de datos `.mffilm.json`**
```json
{
  "version": 1,
  "name": "escena-1",
  "fps": 20,
  "durationTicks": 600,
  "tracks": {
    "actor-1": {
      "type": "player-replay",
      "skin": "EstebanGrp_",
      "frames": [
        { "t": 0, "p": [x,y,z], "yaw": 0, "pitch": 0, "joints": { "headPivot": [rx,ry,rz], "...": [] } }
      ]
    }
  }
}
```

**3. Actor Puppet**
- Spawn: clonar el mesh del jugador local (técnica del guest de MF_Peer) o usar `MF_CustomModels.spawn()` con un `.glb` base.
- Playback: escribir `joint.rotation/position` cada frame vía rAF con muestreo por tick (verificado: el juego no resetea joints).
- Nametag del actor para distinguirlo.
- API: `MF_Film.startRecording()`, `stopRecording()`, `save(name)`, `spawnActor(track)`, `despawnActor(id)`, `play()`, `pause()`, `stop()`.

### Criterios de aceptación
- [ ] Grabación de 60s sin drops visibles (validar delta de ticks en log).
- [ ] El actor reproduce posición + rotaciones de joints fielmente (comparar frame a frame).
- [ ] `/film record`, `/film save <n>`, `/film play`, `/film stop` funcionan en chat.
- [ ] El proyecto sobrevive recarga de página (localStorage) y se exporta a archivo.

---

## Fase 2 — Cámara cinematográfica + exportación de video

**Objetivo:** trayectorias de cámara por keyframes y grabar la pantalla a archivo.

### Componentes

**1. Camera clips (extensión de `src/FreeCam.js` o archivo `src/MF_FilmCamera.js`)**
- Tipos de clip (paridad con BBS): `idle` (fijo), `keyframe` (lista de poses + interpolación), `path` (curva Catmull-Rom por puntos), `dolly` (acercamiento A→B).
- Interpolaciones: linear, Hermite (default), step. Reusar catálogo de easings de Emotes.js.
- Modo "teleport player to camera": mover al jugador con la cámara para evitar descarga de chunks lejanos (equivalente al fix de BBS para Entity Model Features).
- FOV animable por keyframe (acceso a `game.gameScene` cámara ya resuelto en FreeCam).

**2. Exportador de video**
- `gameCanvas.captureStream(60)` + `MediaRecorder` (mime `video/webm;codecs=vp9` con fallback vp8/avc1).
- Mezcla de audio: `AudioContext` + `createMediaStreamDestination()` al que enrutar los `.ogg` existentes (PatPat ya reproduce assets locales — reusar su carga).
- Estado "REC" en HUD + beep de inicio/fin (BBS lo hace igual).
- Descarga vía anchor blob (no requiere permiso `downloads` extra; el background ya lo tiene si se quiere por ahí).

### Criterios de aceptación
- [ ] Un clip `path` de 10s se reproduce suave y sin jitter.
- [ ] Video webm de 30s con audio, reproducible en VLC.
- [ ] La cámara vuelve limpiamente al control del jugador al terminar (sin cámara secuestrada).

---

## Fase 3 — Timeline UI en el GUI — 🎬 REDIRIGIDA a MF_Studio

> Decisión de diseño: en vez de una página más dentro del GUI de content.js, se construyó **`src/MF_Studio.js`**: una interfaz de edición a pantalla completa estilo **DaVinci Resolve** que reemplaza la UI del juego (modo cine oculta HUD/inventario) mientras el juego sigue corriendo detrás.

**Lo implementado (anticipado de la F3):**
- **Timeline NLE real** (`src/MF_Timeline.js`): clips arrastrables con trim por bordes (grips), zoom con rueda (centrado en cursor, Alt+rueda en toda la zona), snapping a 0/playhead/bordes (6px, Alt desactiva), multi-selección Shift+click, Supr borra, pan con botón central/Shift, botón "Ajustar". Regla adaptativa al zoom. Pistas V1 tomas / V2 caras / A1 audio. API `MF_Timeline.addClip/removeClip/fit`.
- Layout DaVinci: top bar (logo/proyecto/transporte/REC/cine), panel Media izquierdo (tomas + caras), preview central transparente, inspector derecho, timeline inferior.
- Panel Media actúa como Media Pool: click en toma = añade clip al final de la secuencia.
- Transporte conectado a MF_Film; REC auto-guarda y aparece en Media.
- **Modo cine**: oculta solo UI del juego (respeta contenedores con canvas grande) → "adiós inventario" sin perder el render.
- Atajos: **F1** abrir/cerrar · **Space** play/pausa · **Home** a 0 · **R** grabar.
- Comando `/studio open|close|cinema` (alias `/estudio`).

**Pendiente de F3:** reproducir la secuencia completa (ahora reproduce el clip activo), importar `.mffilm.json` desde Media, medidor de FPS, undo/redo.

### Cambios
- `src/content.js`:
  - Nuevo item en `NAV_ITEMS`: `{ id: 'film', label: t('nav.film'), icon: '🎬' }`.
  - `PAGE_RENDERERS.film` con: lista de proyectos, pistas (actores/cámara/audio), play/pause/stop, import/export.
- Widget **timeline** nuevo: barra horizontal con regla de ticks, bloques por pista, scrub con click/drag; render en un `<canvas>` dedicado (más barato que DOM para zoom).
- Panel de propiedades del keyframe seleccionado: posición/rotación editables numéricamente, tipo de interpolación.
- Settings nuevos en `DEFAULT_SETTINGS`: `film.enabled`, `film.showOverlay` (HUD de tiempo de escena).
- Integración con el bridge existente: `minifeather:film-config` / `minifeather:film-state`.
- Comandos de chat en `src/ClientCommands.js`: `/film`, `/actor`, `/camera`, `/render`.

### Criterios de aceptación
- [ ] Crear/abrir/borrar proyectos desde el GUI.
- [ ] Mover un keyframe con drag cambia el playback.
- [ ] Búsqueda global del GUI encuentra "film".

---

## Fase 4 — Extras (post-MVP, priorizados)

0. **✅ Face swap por trigger** (`src/MF_FaceSwap.js` — implementado): compone una textura nueva (skin base + región de cara 8x8 en (8,8) y overlay en (40,8)) sobre canvas y hace hot-swap de `material.map`. Reutiliza las 17 caras de emoción de Verity (`client-side mod/entity/`). API: `MF_FaceSwap.set/preview/revert/list` + `applyAtTick(tick, face)` / `onTick(t)` para el timeline del film mode. Comando de chat: `/face set|preview|revert|list`.

1. **Model blocks**: `MF_CustomModels.spawn()` anclado a XYZ con orientación; persistencia por servidor en `chrome.storage`; menú contextual para colocar el modelo apuntado.
2. **✅ Skin/modelo del actor**: el actor ya NO usa el GLB de Verity — `spawnActor()` hace `player.mesh.clone(true)` (profundo, **comparte** geometría/texturas → skin y proporciones exactas del jugador sin duplicar GPU) y lo añade a `game.gameScene.scene`. Los joints replican nombres → los keyframes grabados aplican directo. Fallback al GLB solo si el clone falla. `frustumCulled=false` + `matrixAutoUpdate=true` en el clon.
3. **✅ Editor de pose** (`src/MF_Pose.js`): setPart por grados (pitch/yaw/roll/bend) sobre 6 partes, rest-pose capturada al vuelo, presets (tpose/salute/sit/hero...), poses guardadas en localStorage (formato joints de MF_Film → inyectables en keyframes). Integrado como panel del Studio con sliders en vivo.
4. **Subset Molang** para modelos glTF: evaluador de `query.head_yaw`, `query.head_pitch`, `query.velocity`, `query.ground_speed`, `query.age`, `query.anim_time` + estados `idle/running/sprinting/crouching/falling/swipe/jump` que hacen crossfade de clips del AnimationMixer (tabla de acciones de BBS).
5. **Audio multi-pista**: pista de audio en el timeline, disparo por trigger de tick, volumen editable.
6. **Anchor keyframes** (feature única de BBS): adjuntar el final de un replay al inicio de otro para encadenar escenas.
7. **P2P multi-actor** (paridad con BBS Together): host autoritativo difunde estado de actores a 20Hz vía `MF_Peer`; cada guest renderiza puppets. Ya existe el patrón completo (Verity puppet).
8. **Snowstorm (parcial)**: parser del JSON de snowstorm.app → capa de partículas client-side sobre el patrón de DamageParticles.

---

## Integración con el manifiesto

```json
// src/manifest.json — añadir al bloque MAIN world (document_start, all_frames):
"src/MF_Film.js",          // ✅ añadido (tras Emotes.js y MF_FaceSwap.js)
"src/MF_Studio.js",        // ✅ añadido (GUI estilo DaVinci Resolve)
"src/MF_FilmCamera.js"     // Fase 2, pendiente
```
Orden: después de `src/FreeCam.js` (depende de su resolución de cámara) y de `src/CustomModels.js` (usa su spawn). Sin permisos nuevos.

## Dependencias internas

| Necesita | De dónde | Estado |
|---|---|---|
| Resolución de game handle | Emotes.js `getGame()` | Existe (copiar patrón) |
| BFS de joints | Emotes.js `findJoint()` | Existe |
| Spawn de entidades custom | `MF_CustomModels.spawn()` | Existe |
| Puppet interpolado | MF_Peer guest renderer | Existe (adaptar) |
| Captura de canvas + audio | — | **Nuevo** (estándar web, sin libs) |
| GUI/timeline | content.js GUI | Extender |
| Easings | Emotes.js | Existe |

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El bundle del juego cambia y rompe la resolución de joints | Multi-vía como el resto del cliente + `MF_Film.diag()` con reporte de joints encontrados |
| Playback con jitter a FPS bajos | Muestrear por tick + interpolar; nunca grabar por frame |
| Memory: grabaciones largas | Delta encoding + guardar en localStorage con límite (p.ej. 50MB) y aviso |
| Actores visibles solo en cliente | Documentado: para machinima basta (grabas tu pantalla); multi-jugador real va en Fase 4.6 |
| MediaRecorder sin soporte de codec en un navegador | Cadena de fallback vp9→vp8→avc1 + aviso en UI |
| Conflictos con VanillaAnimations/Emotes escribiendo los mismos joints | Manager de prioridad: playback de film desactiva emotes activos y avisa |

## Plan de verificación por fase

1. F1: test manual grabación→playback lado a lado + `MF_Film.diag()` sin errores.
2. F2: video de 30s con movimiento de cámara compuesto; reproducir fuera del navegador.
3. F3: flujo completo crear→editar→render desde GUI sin abrir consola.
4. F4: cada extra con su propio criterio mínimo antes de pasar al siguiente.
