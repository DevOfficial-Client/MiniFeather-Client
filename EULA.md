# End User License Agreement (EULA) — MiniFeather Client

**Agreement version:** 1.0
**Effective date:** September 27, 2026
**Product:** MiniFeather Client (browser extension for Google Chrome / Chromium, MV3)
**Developers:** botless, AngryWolfX, ShusukeGxE_, Not_Senpai, ItzNightrise ("the Development Team", "we")

This End User License Agreement ("Agreement") is a binding contract between you ("User", "you") and the MiniFeather Development Team. By installing, copying or using MiniFeather Client ("the Client", "the Software"), you agree to be bound by the terms of this Agreement. If you do not agree to any of the terms, do not install or use the Software and delete it from your system.

> [!NOTE]
> Este documento también está disponible en español: [EULA.es.md](EULA.es.md)

---

## 1. Nature of the product and third-party acknowledgment

1.1. MiniFeather Client is a browser extension developed by community members, **with no affiliation, endorsement or sponsorship from Miniblox, its development team or any third party**. "Miniblox" and its assets are the property of their respective owners.

1.2. **Product status: W.I.P. (Work In Progress).** The Client is under active, ongoing development. Features may be unstable, incomplete, change without notice, break after Miniblox or browser updates, or be removed temporarily or permanently. Features labeled "experimental" and those marked as not suitable for regular play may contain bugs and behave unpredictably. The User agrees to use the Software with full knowledge of its development status and **must not rely on it for any critical use**.

1.3. The Client runs on top of the game Miniblox (`miniblox.io`, `miniblox.online`) and **modifies its behavior inside the User's browser** (rendering, interface, control input and game network communications). The User acknowledges that the use of third-party software may violate Miniblox's Terms of Service and that **the User is solely responsible for any consequences (including suspension or banning of their account)**.

1.4. The Software is provided "AS IS" and "AS AVAILABLE", without warranties of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose and non-infringement. Use of the Software is **at the User's own risk**.

---

## 2. License granted

2.1. The User is granted a **limited, revocable, non-exclusive, free and non-transferable** license to install and use the Software for personal, non-commercial purposes.

2.2. Intellectual ownership of the Software belongs to the Development Team. This license does not constitute a sale.

---

## 3. Restrictions of use

The User agrees **NOT** to:

3.1. Use the Software to gain an **unfair advantage on competitive servers**, including without limitation: the Baritone module (automated movement, combat and mining), the IdlePlayerBot module (simulated bots), Anti-AFK, or any form of automation not authorized by the rules of the server they are playing on.

3.2. Reverse engineer the Miniblox network protocol for exploitation purposes, overload servers or falsify the number of connected players.

3.3. Sell, rent, sublicense or commercially exploit the Software or any derivative.

3.4. Circumvent anticheat systems, payment systems or access controls of Miniblox or third parties.

3.5. Use the Software to harass, stalk, dox or harm other players.

3.6. Redistribute modified copies of the Software while passing the result off as an official product of the Development Team.

---

## 4. Automation and competitive advantage modules — specific notice

The Client includes features that automate game actions or alter the information perceived by the User. They are listed with an indicative risk level regarding anticheat measures and server rules:

| Risk level | Modules |
|---|---|
| Extreme | IdlePlayerBot, Baritone |
| High | Anti-AFK |
| Moderate | Auto Sprint, Safe Sneak, FullBright, Zoom, Health NameTags, Freelook, Elytra Flight (controls) |
| Low | Dynamic Crosshair, Distance NameTags, Auto Respawn |
| Restricted by design | FreeCam (reserved for server administrators or whitelist) |
| No gameplay risk (cosmetic/QoL) | Custom skins and models, emotes, shaders, LeafWind, AllayPets, SpiderSim/SpiderBot, DuckMobs, CrittersMobs, animations, GUIPatch, waypoints, map, client chat, and other visual modules |

4.1. The User is solely responsible for verifying which modules are allowed on each server and for disabling those that are not.

4.2. The Development Team **gives no warranty that the use of the Software will not result in the suspension, restriction or deletion of the User's account on Miniblox or any third-party service**.

---

## 5. Privacy and data handling

The Software operates **without its own accounts or its own servers**. However, to deliver its features it processes and transmits the data described below. The User accepts this handling by using the corresponding features.

### 5.1. Data stored locally (does not leave the device unless stated otherwise)

Stored in the browser's local storage (`localStorage`, `IndexedDB`, `chrome.storage.local`), **unencrypted**:

- Client preferences and configuration (equivalent to `defaults.json`), language, colors, keybinds.
- Waypoints (server/world names, coordinates, colors).
- Nicknames assigned to friends (Miniblox UUID and username).
- Imported skins and face packs (base64 PNG images), texture packs and models.
- Saved local servers (LocalGames).
- VerityAI conversation history and, if configured by the User, their **AI API key in plain text** (spending-capped keys are recommended).

### 5.2. Data that leaves the device

| Service | Function | Transmitted data |
|---|---|---|
| GitHub (`api.github.com`, `raw.githubusercontent.com`, `github.com`) | Auto-update, community skin/rank database, resourcepack downloads | No personal User data; anonymous download requests only |
| ntfy.sh (public message bus) | ClientChat (chat between Client users), voice call signaling, local world announcements | Miniblox username and UUID (in ClientChat), SHA-256 hash of the UUID (voice), content of the messages the User writes, world name and player count |
| PeerJS / WebRTC (P2P) | Voice, skin/face sharing between friends, LocalGames | Direct peer-to-peer audio (voice), shared skin/face image, IP address potentially visible to connected peers (inherent to WebRTC) |
| Klipy (`api.klipy.com`) | GIF search for chat | The User's search query |
| OpenRouter / Zhipu / Puter (VerityAI) | Optional AI assistant | Conversation history and game chat messages if auto-reply is active |
| qu.ax / YouTube | Chat clip playback and music integration | No personal data from the Client; the YouTube embed is subject to Google's policy |
| Miniblox (`miniblox.io`) | Normal game operation | User session managed by the game itself |

5.2.1. **Important notice about ntfy.sh:** the ClientChat and voice signaling channels are public by design. Anyone who knows the channel name can read the transmitted content. **Do not send personal information, passwords or sensitive data over ClientChat or voice.**

5.2.2. **Microphone:** audio capture is only requested when the User accepts or starts a voice call (opt-in via `/call on`), can be muted at any time and fully disabled with `/call off`.

### 5.3. Accounts and credentials

5.3.1. The Client **does not request, store or manage Miniblox passwords**. The active game session is created and managed exclusively by Miniblox; the Client only detects it to identify the User within its social features.

5.3.2. The voice identification feature publishes a SHA-256 hash of the account UUID, which does not cryptographically verify account ownership. **Confirm the other party's identity through other means before disclosing sensitive information.**

### 5.4. Minors

The Software is not directed at children under 13. If the User is a minor, they must use the Software with the knowledge and supervision of a parent or legal guardian, who accepts this Agreement on their behalf.

---

## 6. Updates and code execution

6.1. The Client includes an **auto-updater** that downloads components from the project's public GitHub repository (`DevOfficial-Client/MiniFeather-Client`) and applies them through a "hotload" system without going through Chrome Web Store review. This behavior can be disabled in the settings.

6.2. The Client loads third-party libraries from public CDNs (PeerJS from `unpkg.com`, Puter from `js.puter.com`).

6.3. The User acknowledges and accepts these mechanisms as part of how the Software works, along with the inherent risks of relying on third-party repositories and CDNs (unavailability, unwanted changes, supply chain compromise).

6.4. Given the W.I.P. status of the project, updates may be applied more frequently than in stable software and may introduce behavior changes, regressions or temporary incompatibilities. The User may disable the auto-updater at their own responsibility, assuming that older versions may become incompatible with the game or with social features (ClientChat, voice, LocalGames).

---

## 7. Network traffic modification

7.1. The Client uses the `declarativeNetRequest` permission to **redirect texture and graphic asset requests** from Miniblox to customized versions chosen by the User (skins, capes, texture packs). These redirects only affect the User's own browser.

7.2. The "ads" feature is an **inverse opt-in**: ads are hidden by default (visually) and can be voluntarily re-enabled with the "Support Ads" toggle to support the game.

---

## 8. User-generated content and community

8.1. The User is solely responsible for any content they publish through ClientChat, advertised local worlds, voice calls or any other social feature of the Client.

8.2. Publishing illegal content, hate speech, spam, malware, malicious links or sexual content involving minors (including fiction) is prohibited. The Development Team may, at its discretion, remove content from community databases and block access to social features.

8.3. Skins, packs and community contributions published in the project repositories may be used, distributed and modified by the Development Team within the MiniFeather ecosystem. By uploading content, the User warrants they hold the necessary rights to it.

---

## 9. Disclaimer of warranties

9.1. The Software is provided without any warranty, in its current development state (W.I.P.). There is no guarantee that it will be uninterrupted, secure, free of errors, that its features are complete, or that it will work with future versions of Miniblox, browsers or third-party dependencies. Bug reports and their fixes are not guaranteed and are not subject to deadlines.

9.2. The Development Team may modify, suspend or discontinue any feature (including ClientChat, voice, LocalGames or VerityAI) at any time and without prior notice, as part of the project's iterative development.

---

## 10. Limitation of liability

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE DEVELOPMENT TEAM SHALL NOT BE LIABLE FOR:

10.1. Direct, indirect, incidental, special, consequential or punitive damages, data loss, loss of profits or loss of game accounts arising from the use or inability to use the Software.

10.2. Bans, suspensions, restrictions or loss of items, progress or cosmetics on Miniblox or any third-party service.

10.3. Third-party acts: interception of messages on public channels, compromise of repositories or CDNs, abuse of API keys configured by the User, or behavior of other peers in WebRTC connections.

10.4. Loss of locally stored data (browser storage may be cleared by the browser itself, by updates or by other extensions).

---

## 11. Termination

11.1. This license is effective until terminated. The User may terminate it at any time by uninstalling the Software.

11.2. The license terminates automatically if the User breaches any of the terms of this Agreement. In that case, the User must uninstall and destroy all copies of the Software.

---

## 12. Changes to the Agreement

12.1. The Development Team may modify this Agreement at any time. The current version will be published in the project's official repository. Continued use of the Software after changes are published constitutes acceptance of them.

---

## 13. Governing law

13.1. This Agreement is governed by the laws applicable in the jurisdiction of the Development Team, without prejudice to the User's mandatory consumer rights in their place of residence.

13.2. Any dispute will first be attempted to be resolved amicably through the project's official Discord before going to court.

---

## 14. Legal notice and contact

14.1. MiniFeather Client is a community-driven, open-source, non-commercial, non-profit project.

14.2. If you are the rights holder of Miniblox or any third-party asset used and wish to request a change or removal, or if you have questions about this Agreement or data handling, contact us through the project's official Discord: `https://discord.gg/k4Ku9DTQDQ`.

---

## 15. Artificial Intelligence

### 15.1. AI as a development tool

15.1.1. The Client was developed **with the significant assistance of artificial intelligence tools** (code generation, refactoring, translation and documentation). AI-generated contributions were reviewed and adopted by the Development Team, which remains responsible for the published code. Nevertheless, given the nature of these tools, the Software may contain errors, inconsistencies or unintended behaviors that automated review did not detect.

15.1.2. The User acknowledges that the combination of AI-assisted development and the W.I.P. status of the project (section 1.2) increases the likelihood of bugs, and that the Software must not be treated as fully audited code.

### 15.2. VerityAI (AI features included in the Client)

The Client integrates an optional AI assistant ("VerityAI", enabled by default with the free Puter provider, configurable via the `/verity` command).

15.2.1. **Providers and keys.** VerityAI supports Puter (no key required), OpenRouter and Zhipu/GLM (both requiring a User-provided API key). If configured, the API key is stored **unencrypted** in the browser's local storage and sent to the corresponding provider with each request. The User is responsible for the safekeeping, spending limits and revocation of their keys.

15.2.2. **Data transmitted.** When the assistant is used, the conversation history (up to the last 20 messages), the configured persona and the message text are sent to the selected provider's servers. If the `autoReply` mode is enabled, **game chat messages may be processed and answered automatically**, which means game chat content is sent to the AI provider.

15.2.3. **No guarantees of accuracy.** AI responses may be inaccurate, outdated, nonsensical or misleading. The User must not rely on them as factual, technical or legal advice. The Development Team is not responsible for the content of AI responses or for actions taken based on them.

15.2.4. **Compliance with provider terms.** Use of Puter, OpenRouter, Zhipu or any other provider is additionally governed by each provider's own terms of service and policies. The User must ensure their use complies with those terms.

15.2.5. **Prohibited uses.** The User must not use VerityAI to generate or spread content prohibited in section 8, to automate harassment of other players, or to violate the rules of any server or third-party service.

---

**By installing or using MiniFeather Client, you declare that you have read, understood and accepted all the terms of this Agreement.**
