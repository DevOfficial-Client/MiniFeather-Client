# Análisis de miniblox.io

> Documento generado el 2026-08-31 a partir de análisis con Puppeteer (navegación headless, extracción DOM y screenshot).

## Descripción general

**Miniblox** es un juego tipo Minecraft **multiplayer gratuito que corre 100% en el navegador** (WebGL/WebGPU). No requiere descarga ni registro para jugar.

- **Título de la página:** "Miniblox"
- **Versión detectada en UI:** `v3.46.223`
- **Meta description:** *"Play free with friends — no download, no sign-up, just click and play. A world of games like Minecraft, from Skywars to Survival. Unblocked at school!"*
- **Autores (meta author):** Victor Wei, qhyun
- **Keywords SEO:** Minecraft unblocked, games like Minecraft, unblocked games at school, Skywars, EggWars, Survival, Creative, blocky multiplayer games...
- **Theme color:** `#0d9488` (teal)

## Tecnología detectada

| Elemento | Detalle |
|---|---|
| Motor | Canvas WebGL a pantalla completa (1280x800 en el test) + canvas HUD superpuesto (`#canvas-hud`) |
| SPA | Bundle único `assets/index-CeJBadM.js` (app compilada, minificada) |
| React | Presente en el DOM (raíz `#react`); el estado del juego es accesible vía React fibers |
| Ads | **CrazyGames SDK v3** + **AdinPlay** (aip tag + ad-manager v4) |
| Analytics | Google Tag Manager (`G-HJ760XE436`) |
| Login social | Google Identity Services (`accounts.google.com/gsi/client`) |
| Tracking | iframe de sincronización de liadm.com (LiveIntent) |
| Imágenes | WebP con hash en nombre (Vite-style: `survival-Ddo9a1x-.webp`) |

## Modos de juego oficiales (con jugadas acumuladas)

| Modo | URL | Jugadas |
|---|---|---|
| SURVIVAL | /game/survival | 751k |
| SKYWARS | /game/skywars | 733k |
| EGGWARS | /game/eggwars | 683k |
| SUPERFLAT | /game/superflat | 409k |
| CREATIVE | /game/creative | 250k |
| BRIDGE DUELS | /game/bridge-duels | 332k |
| PLOTS | /game/plots | 118k |
| CLASSIC PVP | /game/pvp | 104k |
| KITPVP | /game/kitpvp | 104k |
| PARKOUR | /game/parkour | 35k |
| ONE IN THE QUIVER | /game/one-in-the-quiver | 17k |
| COMUNIDAD | — | 0 |

## Servidores personalizados

La home muestra secciones **"TOP JUEGOS PERSONALIZADOS"** y **"EN ASCENSO"**, con **87 servidores custom** explorables y opción de **unirse con código**. Ejemplos observados en vivo:

- LifeSteal SMP [v2], mace PvP, Elytra Flying City, The King SMP S2, Super City, Mining server, **Talk to Verity**, Pillars Of Fortune, Prison Escape, One Block, servidores árabes y SMPs de todo tipo.
- Los contadores mostrados son jugadores en línea por servidor (cifras de 2 a 28 en el momento del análisis).

## Menú lateral / navegación

Inicio · Ajustes · Planetas · Logros · Clasificaciones · Más

## Elementos de UI destacados

- Pantalla de bienvenida localizada: *"¡BIENVENIDO A MINIBLOX! Bloques, construcción y batallas — ¡vamos!"* (el sitio detecta idioma del navegador; la sesión de análisis se mostró en español).
- Login: "Iniciar sesión" / "Crear cuenta" (con Google disponible).
- Footer legal: Privacidad, Términos, Sitios asociados, Cookies, Configuración de privacidad, Reglas del juego, **Cómo jugar**, **Scripting**.
- Imagen OG: `images/titlescreen/default.png` (2560px).

## Observaciones técnicas del análisis

1. **Carga pesada:** la navegación Puppeteer excedió el timeout de 30s (bundle grande + ads + WebGL). El DOM sí quedó accesible (`readyState: interactive`).
2. **6 canvas** en la página: el principal del juego (1280x800), el HUD (`canvas-hud`), y varios auxiliares (1x1, 73x73, 300x150, 960x600 — típicamente para partículas/minimapa/ads).
3. **Arquitectura interna minificada** sin API pública documentada en la página; mods de cliente (como MiniFeather) acceden al juego vía React fibers y el objeto global `__MINIBLOX_GAME__`.
4. **Modelo de negocio:** anuncios (CrazyGames + AdinPlay) + cosméticos/planetas (pasos de progreso).
5. Existe un mirror alternativo: **miniblox.online** (usado también por los clientes modded como host permission).

## Enlaces

- Sitio: <https://miniblox.io>
- Cómo jugar / Scripting: accesibles desde el footer del sitio
