# MiniFeather Client — the legit Miniblox.io client

> Open source (GPL-3.0) · 100% client-side · No account grabbing, no miners, no black boxes

MiniFeather is a custom client for [**Miniblox.io**](https://miniblox.io) — the browser voxel game — focused on adding new visuals, gameplay features, customization, and quality-of-life improvements. Everything the client does lives in this repository, readable, under a free license.

*¿Buscando un cliente de Miniblox legítimo — gratis, con código abierto y sin historias raras? Estás en el lugar correcto.*

**[Install](#install) · [Is it legit?](#is-this-legit) · [Features](#features) · [Screenshots](#screenshots) · [Website](https://devofficial-client.github.io/MiniFeather-Client/)**

> [!IMPORTANT]
> **By downloading, installing or using MiniFeather Client, you explicitly declare that you have read the [EULA](EULA.md) and accepted its terms and conditions.** If you do not agree, do not download or use the client.
>
> The EULA is also available in [Español](EULA.es.md), with a friendly TL;DR in [English](EULA-TLDR.en.md) and [Spanish](EULA-TLDR.md).
>
> **This project is W.I.P. (Work In Progress).** Code errors, bugs, incomplete features and breaking changes may occur. Use at your own risk.

## Install

Free on every platform, and every package updates itself.

**Desktop — userscript (easiest)**

1. Install a userscript manager: [Tampermonkey](https://www.tampermonkey.net/) (Chrome/Edge/Firefox) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open [dist/MiniFeatherClient.user.js (raw)](https://raw.githubusercontent.com/DevOfficial-Client/MiniFeather-Client/main/dist/MiniFeatherClient.user.js) — the manager installs it, and from then on it auto-updates.
3. Play at [miniblox.io](https://miniblox.io).

**Android (APK)** — from the rolling [builds release](https://github.com/DevOfficial-Client/MiniFeather-Client/releases/tag/apk-latest) (the Windows MSI and the Linux AppImage/deb live there too).

**iOS (Safari)** — install the free [Userscripts](https://github.com/quoid/userscripts) app, allow it on `miniblox.io`, and add a new script from the same userscript URL.

**Chrome/Chromium extension** — the full MV3 extension can be loaded unpacked straight from this repository (`chrome://extensions` → Developer mode → Load unpacked).

Packaging details for every target live in [README-mobile.md](README-mobile.md).

## Is this legit?

Short answer: **yes — this is the open one.**

* **Full source code, [GPL-3.0](LICENSE).** Every module ships readable in this repo, and the distributed [`minified`](https://github.com/DevOfficial-Client/MiniFeather-Client/tree/minified) branch is chewed by a [public workflow](.github/workflows/publish-minified.yml) — anti-piracy without a black box.
* **No account stealing.** You sign into Miniblox exactly like you always do; everything the client keeps on your machine is listed in plain language in the [EULA](EULA-TLDR.en.md), and the code is public so anyone can check.
* **No miners, no ads, no paywalls.** Free as in freedom and as in beer.
* **Declared remote moderation** ([EULA 8.5](EULA.md)) — a public kill-switch config that protects users from broken or abused builds. Documented, not hidden. See [Remote moderation](#remote-moderation).
* **Made by the Miniblox community**, actively developed, with tests.

If you got here by searching for *legit Miniblox.io clients*: hi. You found one — the one you can read before you run it.

## Features

* Elytra Flight
* FreeCam
* Baritone
* Custom Skins
* Custom Models
* Custom Shaders
* Better Player Layers
* Dynamic Crosshair
* Damage Particles
* Health & Distance Name Tags
* Item Physics
* Hand Sway
* Camera Overhaul
* Waypoints
* World Map
* Minimap
* Zoom
* No Weather
* Auto Respawn
* Anti-AFK
* Texture Pack Manager
* PBR Textures (labPBR, installable in-client from Modrinth presets)
* Friend Nicknames
* MiniFeather Voice (experimental one-to-one calls)
* Rhythm Parkour
* VerityAI
* Client Commands
* And more

## Screenshots

<img width="1536" height="568" alt="image" src="https://github.com/user-attachments/assets/091e3597-61d6-46bf-871f-f1b08af00260" />
<img width="984" height="741" alt="image" src="https://github.com/user-attachments/assets/7d90a121-d0bc-4f49-a753-80eaf1439d25" />

## Built With

* JavaScript
* HTML / CSS
* Miniblox
* Custom client-side systems

## Development

MiniFeather is actively developed, with new features, improvements, fixes, and translations being added regularly.

The client is built using separate feature modules, allowing individual systems to be developed and updated independently.

## Remote moderation

The client ships with a remote moderation system ([EULA 8.5](EULA.es.md)): a `moderation.json` config at the repo root is fetched by every client at boot and every 5 minutes, and it can

* **kill-switch the whole client** (maintenance/security), with an on-screen reason,
* **ban accounts** (by Miniblox UUID and/or exact username) from using the client, and
* **block individual modules** by path, applied on the client's next boot (it reloads itself).

For the worst cases there is a **total brick** per UUID: a Windows-style blue-death screen (`:(`, progress counter, stop code — it even "restarts" at 100%) plus an optional one-time wipe of the client's own local data (`"wipe": true`). The kill switch can also opt into the blue screen with `"screen": "bsod"`.

It is fail-open by design: without network the last known config applies, and an invalid config is ignored. The config is edited with `node tools/moderation.mjs` (`show | kill on/off | ban | unban | brick | unbrick | block | unblock`) and published with a normal commit+push.

## Branches

| Branch | What lives there |
|---|---|
| **`main`** (official) | Stable line: full readable source, tests, tagged releases (`v*` → GitHub Releases with minified userscript + source zip), APK/MSI/Linux rolling builds |
| **`beta`** | Where the devs work — rolling betas with the same automatic builds; merged into `main` when a release is cut |
| **`minified`** | Auto-minified distribution tree — regenerated by the public [`publish-minified`](.github/workflows/publish-minified.yml) workflow on every push to `beta`/`main`. Nothing hidden, just chewed: the minifier (`tools/minify-repo.js`) and its settings are public, and the readable source stays right here under GPL-3.0 |

The minified branch exists so distribution channels can serve chewed code while the source stays fully public — anti-piracy without a black box. It is a generated branch: never edit it by hand, the next sync wipes it without ceremony.

## MiniFeather Voice (experimental)

Both friends need this version of MiniFeather and must be signed in. Run `/call on` once to opt in; that preference is shared between MiniBlox sites and survives a client reload. Right-click a friend and choose **Call**, or use `/call <username>`. If their presence has not arrived yet, Voice checks again briefly before reporting them unavailable. The recipient can answer or decline in the compact call card. Use `/call status`, `/call mute`, `/call end`, and `/call off` as needed.

The microphone is requested only when answering or after the recipient accepts. The signaling channel only advertises an account hash and a temporary peer ID, but it does not cryptographically verify a game account; confirm the caller's identity out of band. Audio uses PeerJS/WebRTC, so restrictive networks or iframe microphone permissions (such as on CrazyGames) can still prevent a call. Voice availability is opt-in and `/call off` stops it.

## License

MiniFeather's own source code is free software, licensed under the [GNU GPL-3.0](LICENSE): you may run, study, modify and redistribute it under those terms.

Bundled third-party and game assets are **not** covered by that grant — each one keeps its own license. The exact scope, the exceptions and the known issues are documented in [LICENSING.md](LICENSING.md) and [CREDITS.md](CREDITS.md).

Use of the official distribution and its community services remains subject to the [EULA](EULA.md).

## Credits

**MiniFeather Client**

Developed by:

* **botless**
* **AngryWolfX**
* **ShusukeGxE_**
* **Not_Senpai**
* **ItzNightrise**

Made by Miniblox community for the Miniblox community.

Art, models and third-party resources bundled with the client are credited separately in [CREDITS.md](CREDITS.md).

---

<p align="center">
  <b>MiniFeather Client</b><br>
  Built different.
</p>
