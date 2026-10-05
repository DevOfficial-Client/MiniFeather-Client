# Credits & Third-Party Notices

MiniFeather Client ships with art, models and resources made by other people. This file credits them and records what we know about each one. Some assets were collected from community sites over time and their origins were not always written down — if we got a credit wrong, you are (or know) an uncredited author, or you want something removed, contact us on Discord (`discord.gg/k4Ku9DTQDQ`, see EULA §14.2) and we will fix it or take it down.

## Models & animations

| What | Author / source | Where |
|---|---|---|
| Gun models & textures (7 guns) | TACZ — Timeless and Classics Zero (MCModderAnchor), converted from the mod's default gun pack ([CurseForge](https://www.curseforge.com/minecraft/mc-mods/timeless-and-classics-zero)) | `models/tacz/` |
| Better Cats (cat model + textures) | Mrblueyeti — credit embedded in the pack files ("The only official virus free download of Better Cats": [CurseForge](https://www.curseforge.com/minecraft/texture-packs/better-cats-minecraft)) | `textures/entity/cat/` |
| Player animation rig (`player.jem`) | Fresh Animations lineage — FreshLX (original), Traben (player adaptation), BoZo_Xo2 (base pack), Ithan (edits); names embedded in the file | `src/PlayerAnims/EMFPack.js` |
| Fresh Animations CEM engine (mob models & animations, `MF_FreshAnims`) | Engine code is ours; **no Fresh Animations assets are bundled**. Fresh Animations is © FreshLX, All Rights Reserved ([Modrinth](https://modrinth.com/resourcepack/fresh-animations) · [CurseForge](https://www.curseforge.com/minecraft/texture-packs/fresh-animations)). Each user imports their own downloaded copy locally; per the official terms it is not redistributed, re-hosted or shared modified from here. | `src/PlayerAnims/MF_FreshAnims.js` |
| Horse model | Vincent Yanez ([sketchfab.com/vinceyanez](https://sketchfab.com/vinceyanez)), CC-BY-4.0 | `models/entities/minecraft_-_horse.glb` |
| Backrooms Level 0 | "bro" ([sketchfab.com/speakerscientist74_Legit](https://sketchfab.com/speakerscientist74_Legit)), CC-BY-4.0 | `models/entities/backrooms_level_0.glb` (+ `assets/content/minifeather-pack/`) |
| Maternal Wraith / Stalker | Besmot ([sketchfab.com/Besmot](https://sketchfab.com/Besmot)), CC-BY-4.0 | `models/entities/` |
| Verity model | ChocoChip67 ([sketchfab.com/ChocoChip67](https://sketchfab.com/ChocoChip67)), CC-BY-4.0 | `models/entities/verity_full_model.glb` |
| Emotecraft mod + 18 stock emotes | KosmX, CC-BY-4.0 | `emotes/emotecraft-for-MC1.18.2-2.2.7-b.build.50-forge/` |

## Community emotes

Authors recovered from metadata embedded inside the `.emotecraft` files themselves:

| Emote | Author |
|---|---|
| KL-sit-2 | KuzhenLarn |
| Rat Dance 1.2 | hemiRV |
| cool sit | Wah0o |
| The Honored One (levitation) | TheXFrost |
| Sit Adorably | SPEmotes pack ([spemotes.com](https://spemotes.com/)) |
| Sit suggestively | **unknown** — the file carries no author metadata |

## Shaders & effects

| What | Author / source | Where |
|---|---|---|
| Particular leaf/particle pack | Chailotl ([github.com/Chailotl/particular](https://github.com/Chailotl/particular)), LGPL-3.0 | `assets/particular/`, `assets/mfpack/`, `textures/particle/` |
| MF_Deferred shader | JS port of **IterationT 3.2.0** by Tahnass — redistribution permission pending | `src/Shaders/`, `src/Core/mirror.js` |
| Shader data textures | IterationT 3.2.0 (Tahnass) | `assets/shadertextures/` |
| PBR maps | **Removed from the package** (2026-10-01): the previously bundled maps derived from work © 2020 RRe36 (All Rights Reserved) could not be redistributed. PBR is available in-client via Modrinth presets: [UltimaCraft PBR](https://modrinth.com/resourcepack/ultimacraft-pbr) (CC-BY-NC-4.0), [SPBR](https://modrinth.com/resourcepack/spbr) (GPL-3.0) and [Vanilla Normals Renewed](https://github.com/Poudingue/Vanilla-Normals-Renewed) | — |

## Libraries & fonts

| What | Author / source | Where |
|---|---|---|
| brocha (brotli codec) | Nicholas Berlette + Google (MIT) | `src/Libraries/brocha.min.js` |
| JSZip | Stuart Knightley & contributors (MIT / GPLv3) | `src/Libraries/jszip.min.js` |
| Minecraft font | Mojang Studios | `assets/classic/`, `classic/font/` |

## Based on Minecraft / Miniblox assets

- Vanilla-Minecraft-derived art (GUI hearts & hunger icons, baby-mob textures in `assets/tiny/`, vanilla-style item textures): based on Minecraft assets © Mojang Studios.
- Miniblox game assets mirrored for mod/offline use (`classic/`, `textures/entity/`, capes & skins under `skins/`): © the Miniblox developers. MiniFeather is a client mod for their game and claims no ownership of it.

## Unknown author / origin

- `assets/Faithful.ttf` — UI font; named after the Faithful project but the exact origin could not be verified.
- `assets/memes/gif/` — internet meme GIFs, unattributable individually.

## Inspirations (mechanics only — no assets or code)

`src/Horror/MF_Horror.js` re-implements, from scratch and client-side, the *experience* of well-known Minecraft horror mods. All of them are All Rights Reserved or without a reusable license: zero assets, sounds, texts or code were taken from any of them. Everything in the module (figures, sounds synthesized with WebAudio, fake chat strings) is MiniFeather's own:

- **From The Fog** (Lunar Eclipse Studio) — inspiration for the "figure in the fog" preset. https://lunareclipse.studio
- **The Broken Script** (wendigodrip) — inspiration for the "broken script" meta-glitch preset. https://modrinth.com/mod/the-broken-script
- **Cave Dweller / The Man From The Fog** — inspiration for the "dweller" stalker preset.
- **Weeping Angels** (Doctor Who concept, multiple MC mods) — inspiration for the freeze-when-watched preset.

## MiniFeather team art

Made by the MiniFeather team (**botless**, **AngryWolfX**, **ShusukeGxE_**, **Not_Senpai**, **ItzNightrise**), some of it original work inspired by or adapted from existing art (Minecraft-style items and icons, custom mobs and pets):

`golden_apple/`, `knight_walk/`, team emotes (`sit`, `wave`, `dance`, `facepalm`, `tpose`), `skins/facialskins/`, `skins/mypacks/`, `skins/devs/`, most of `models/entities/` (Blockbench sets), `textures/` (spear, mace, wolf variants), `assets/ui/` icons, `assets/voice/` icons, `assets/crosshair/`.

---

Last reviewed: 2026-10-04. New third-party art should land together with a note in this file (what, author, source URL, license).
