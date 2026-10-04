# Licensing — what the GPL covers and what it doesn't

The team's own source code of MiniFeather Client is released under the **GNU General Public License v3.0** ([LICENSE](LICENSE)). This file records the exact scope of that grant, what stays out of it, and the known issues — so nobody has to guess. The friendly version of the same story lives in [CREDITS.md](CREDITS.md).

## Covered by the GPL-3.0 (the team's own code)

- `src/` — the client's modules. Written by the MiniFeather team with heavy AI assistance (EULA §15.1); reviewed and owned by the team.
- `tools/` and `tests/`.
- Generated files whose only source is the above: `src/Core/mirror.js` is produced by `tools/build-mirror.js` and embeds `src/` modules verbatim — it inherits the same GPL-3.0 and is not a separate work.
- Project configuration: `manifest.json`, `hotload.json`, `mirror.json`, `defaults.json`, `build.json`.

## Not covered — third-party code and libraries

- `src/Libraries/brocha.min.js` — MIT (© Nicholas Berlette + Google). Its own header and license win for that file.
- `src/Libraries/jszip.min.js` — MIT or GPLv3, dual licensed (© Stuart Knightley & contributors).

## Not covered — third-party art, models, emotes and shaders

Everything credited in [CREDITS.md](CREDITS.md) keeps **its own license**; the GPL-3.0 grant does not extend to it. Highlights:

- Gun models & textures from TACZ / Timeless and Classics Zero (`models/tacz/`) — GPL-3.0 mod content; redistribution under GPL-compatible terms with attribution.
- Emotecraft mod + stock emotes (`emotes/`) — CC-BY-4.0 (KosmX); community emotes credited per-file.
- Particular particle pack (`assets/particular/`, `assets/mfpack/`, `textures/particle/`) — LGPL-3.0 (Chailotl).
- Sketchfab models (`models/entities/*.glb`) — CC-BY-4.0, credited per file.
- Player animation rig embedded in `src/PlayerAnims/EMFPack.js` — Fresh Animations lineage (FreshLX → Traben → BoZo_Xo2 → Ithan); the credits travel inside the file itself. It rides along as data, not as team code.

## Not covered — game-ecosystem assets (interoperability mirrors)

- `classic/` and parts of `textures/entity/`, `skins/` — Miniblox assets, © the Miniblox developers.
- Minecraft-derived art (GUI icons, baby-mob textures, vanilla-style items, `assets/classic/` fonts) — based on Minecraft assets, © Mojang Studios.

These are mirrored because the client mods the game and needs them to work offline. They remain the property of their owners, are **not** licensed under the GPL, and redistributing them is between whoever does it and those owners.

## Team's own art

`golden_apple/`, `knight_walk/`, team emotes, `skins/facialskins/`, `skins/mypacks/`, `skins/devs/`, most Blockbench sets in `models/entities/`, and the team's textures and UI icons are the MiniFeather team's own work (see CREDITS.md). They are distributed with the client but the GPL-3.0 grant above is about the code; treat the art as © the team unless the file says otherwise.

## Known issues (open items — tracked, not solved)

1. **IterationT port — the big one.** `src/Shaders/MF_Deferred.js` contains a verbatim JS port of IterationT 3.2.0's post-processing chain (bloom, auto-exposure, AgX), and `assets/shadertextures/` ships the pack's data textures (~42MB: AtmoData, CloudNoise). Redistribution permission from Tahnass is **pending** (CREDITS.md). The GPL-3.0 grant does not extend to this material and cannot legalize it: either the permission arrives (then this note goes away) or the port + textures must be removed or turned into an opt-in download before the repository can claim a clean license. Until then, this is the repo's main legal loose end.
2. **`assets/Faithful.ttf`** — UI font whose exact origin could not be verified (CREDITS.md). Verify or replace it.
3. **`assets/memes/gif/`** — internet meme GIFs with no attributable author. Low risk for a community client, but unattributable content is still unattributable.

## Name, logo and "official"

The GPL covers the code, and copyleft already forces any fork to keep the source open under GPL-3.0. What it does not cover is the branding: the "MiniFeather" name, the team identities, the logo, the Discord and the official distribution channels are not part of the license grant. Modified distributions must not present themselves as official (EULA §3.6) — that's passing off, and it's not solved by copyright law but it is a real rule.

## LICENSE vs EULA — who wins

- **LICENSE (GPL-3.0)** governs the source code: run, study, modify, redistribute — yes, including commercially, if the GPL terms (source disclosure, same license, no extra restrictions) are honored. That's what the GPL is.
- **EULA** governs the use of the official distribution and its community services (ClientChat, voice, MiniFeather accounts, VerityAI).
- For the code, the GPL wins and the EULA adds no further restrictions on it (EULA §2.3). The EULA's non-commercial spirit applies to the official distribution and services, not to what third parties may do with the GPL-licensed source.

---

Last reviewed: 2026-10-02. New third-party content should land together with a note here and in CREDITS.md.
