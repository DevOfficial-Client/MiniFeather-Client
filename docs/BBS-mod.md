# Investigación: BBS Mod (Minecraft)

> Documento generado el 2026-08-31 a partir de investigación web.

## ¿Qué es?

**BBS mod** es un mod de Minecraft creado por **McHorse** (autor del famoso Blockbuster mod). Es el "sucesor espiritual" de Blockbuster: un **estudio de animación y creación de contenido** dentro de Minecraft, orientado a creadores que hacen machinimas, roleplays y cinemáticas. Su punto más fuerte es la creación de animaciones.

- **Descargas:** ~261K en Modrinth
- **Licencia:** ARR (All Rights Reserved)
- **Estado actual:** McHorse se retiró del desarrollo; la comunidad continúa el proyecto mediante forks

## Compatibilidad e instalación

| Aspecto | Detalle |
|---|---|
| Versiones MC | 1.20.4 y 1.20.1 |
| Loader | Fabric (solo requiere Fabric API) |
| Forge | Funciona en 1.20.1 vía **Sinytra Connector** (bugs resueltos desde la v1.2) |
| Compatibilidad garantizada | Solo **Sodium** e **Iris** |

El autor no planea compatibilidad con otros mods: "si otro mod crashea con BBS, es lo que es".

### Mods incompatibles conocidos

OptiFabric, Blur+, Dynamic FPS, TaCZ, ResolutionControl+, Legacy4J, Effective, Immersive Engineering, Stellarity, Simple Animated Guns, Modular Force Field System, Polytone — la mayoría rompen la vista previa del editor de películas o las texturas de los forms.

### Peculiaridades (quirks)

- Con **Entity Model Features** + resource packs, las animaciones de mobs parecen limitadas por FPS (el jugador está lejos; acercarse o activar "Teleport player to camera").
- **Distant Horizons** tenía glitch visual en la preview antes de la v1.2.1.

## Funciones principales

- **Grabación y reproducción** de acciones del jugador (caminar, saltar, atacar).
- **Editor de replays basado en keyframes** con interpolación Hermite.
- **Editor de cámara basado en clips** (trayectorias cinematográficas, conversores dolly/path/keyframe).
- **Modelos Blockbench**: animaciones, meshes, variables Molang (`query.head_yaw`, `query.head_pitch`, `query.velocity`, `query.ground_speed`, `query.yaw_speed`, `query.age`, `query.anim_time`), exportados con el plugin "BBS Model Ex/importer" como `.bbs.json`.
- **Acciones de animación** para modelos: `idle`, `running`, `sprinting`, `crouching_idle`, `crouching`, `falling`, `swipe`, `jump`.
- **Soporte parcial de partículas Snowstorm**.
- **Model blocks**: colocar y sostener modelos personalizados en el mundo.
- **Sistema de Forms**: mezclar modelos, bloques, items, imágenes, partículas, etc. para crear apariencias de actores y model blocks.
- **Editor de mundos** (pinceles spray/smooth/paste, flood fill, máscaras, estructuras).
- **Editor de películas** (film editor) con control de actores WASD.
- **Renderizado de video en juego**, importación de audio, voxel lighting (torch light), soporte de joystick.
- Carpeta de assets del usuario: `config/bbs/assets/`.

## Blockbuster vs BBS

| Propiedad | Blockbuster | BBS |
|---|---|---|
| Versión MC | 1.12.2 (antes 1.10.2/1.11.2) | 1.20.4 y 1.20.1 |
| Loader | Forge | Fabric (Forge 1.20.1 vía Sinytra) |
| Mods extra | Requería muchos | Solo Fabric API |

**Blockbuster tiene y BBS no:**
- Funciones CGI avanzadas (32-bit depth, keying para After Effects/Blender).
- Structure morph (estructuras como morphs) — aunque CML lo implementó.
- (Sequencer morph y shader curves fueron añadidos a BBS en 1.6.)

**BBS tiene y Blockbuster no:**
- Keyframes `anchor`: unir replays distintos suavemente.
- Transformaciones de model blocks (aspecto distinto en 1ª/3ª persona, útil para roleplay).
- UX drásticamente mejorada.

## Forks activos (tras el retiro de McHorse)

| Fork | Descripción | Versiones |
|---|---|---|
| **BBS CML EDITION** (ElGatoPro300) | El más popular (~55K descargas). Forms Fluid/Light/Structure/Shape, glTF y Mine-imator, Model Editor, bases de IK y dynamic bones, sistema de addons, Triggers block, editor de películas 2.0 personalizable | 1.20.1 – 1.21.4 |
| **BBS FS** (Wemppy) | "Sucesor fiel" del original | 1.20.1 – 1.21.11 |
| **BBS Together** | Fork **multijugador**: corrige desync de paquetes, cursores coloreados de otros jugadores, sync de assets, `/bbs record [selector]` | 1.20.1 / 1.20.4 |
| **BBS Reforge** (OverTv) | Adaptación a 1.21.1 con iluminación dinámica | 1.21.1 |

## Ecosistema de addons

- **BBS Addon Engine** — capa de compatibilidad para ejecutar addons de CML en BBS base/FS; menú de addons en el dashboard; API para registrar Forms, clips de cámara/acción, funciones Molang, etc.
- **BBS S&B Addon** — importación FBX/glTF/GLB, shape keys, multi-textura, armaduras para `.bbs.json`.
- **BBS AAAddon** — partículas AAA (`.efkefc`) como forms (`config/bbs/assets/effeks/`).
- **BBS Structure Addon** — animar estructuras guardadas con structure block.

## Historia

- **2023:** nace como app/juego independiente (BBS 0.2 – 0.7.1, distribuido en itch.io) con voxel lighting, joystick, world editor, grabación de video.
- Luego se convierte en mod para Minecraft moderno, serie 1.x (1.2 arregla Forge/Sinytra, 1.6 añade sequencer y shader curves).
- **~2026:** McHorse anuncia su retiro; el repo `mchorse/bbs` queda archivado y la comunidad bifurca el proyecto (CML, FS, Together, Reforge).
- La wiki oficial (`mchorse/bbs-mod-wiki`) sigue siendo la referencia técnica.

## Recursos

- Wiki: <https://github.com/mchorse/bbs-mod-wiki/wiki/>
- Modrinth: <https://modrinth.com/mod/bbs-mod>
- CurseForge: <https://www.curseforge.com/minecraft/mc-mods/bbs-mod>
- Discord: <https://discord.gg/NpNvNtyrrH>
- Tutoriales: canal de YouTube "McHorse's Creations" (The Ultimate Guide to BBS mod, BBS academy)
