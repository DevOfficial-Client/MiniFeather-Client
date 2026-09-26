# SECURITY AUDIT REPORT — MiniFeather-Client

**Scope:** Entire repository (`manifest.json`, `src/`, `classic/`, `assets/`, `hotload.json`, `defaults.json`, scripts and configs).
**Method:** Direct reading of every executable file, data-flow analysis (SOURCE → PROCESSING → DESTINATION), and cross-module call tracing. No repository files were modified.

---

## 1. EXECUTIVE SUMMARY

**No evidence of token logging, cookie theft, or exfiltration of Miniblox sessions was found.**

- The Miniblox session token (`session_v1` in `localStorage`) is read in **exactly one place** (`src/Cosmetics/MF_Accounts.js`) and is sent **exclusively to Miniblox's own origin** (`location.origin + '/auth-api/accounts/me'`). It never travels to ntfy.sh, GitHub, PeerJS, or any third party.
- There is no access to `document.cookie` anywhere in the extension code (verified by exhaustive search; the only matches are inside the minified bundles of the original game, which are Miniblox's own code).
- The `Response.prototype.json` hook and the `fetch`/`XMLHttpRequest` wrappers **do not extract data**: they modify responses cosmetically (the `rank` field, textures) or emulate endpoints locally.

**However, one serious finding unrelated to Miniblox credentials was identified:** the client panel creates "MiniFeather" accounts by sending **username + password in PLAIN TEXT** to a **public** ntfy.sh topic. Anyone who knows the topic name can read those credentials. Additional findings include exposure of username/UUID/chat on public ntfy topics, remote code execution by design (hot-reload from GitHub raw), and an unvalidated branch in the background fetch bridge. Details below.

---

## 2. CRITICAL FINDINGS

### F1 — Plain-text password published to a public ntfy.sh topic
- **Severity: HIGH** (does not affect Miniblox credentials)
- **File/function:** `src/UI/ClientPanel.js` → `createMiniFeatherAccount()` (constant `MF_ACC_TOPIC = 'mf-accounts-req-v1'`, ~lines 8376-8566)
- **Code:**
```js
const payload = {
    type: 'mf_account_create',
    username: user,
    password: pass, // the SkinBot hashes it (PBKDF2) before storing
    skin: skin || undefined,
    client: MODULE_VERSION,
    at: Date.now()
};
port.postMessage({ type: 'publish', requestId: 'mfacc', topic: MF_ACC_TOPIC, message: JSON.stringify(payload) });
```
- **What it does:** publishes the JSON payload via the service worker (HTTP POST) to `https://ntfy.sh/mf-accounts-req-v1`.
- **What data it obtains:** unhashed username and password of the "MiniFeather" account (a parallel account managed by a bot, not the Miniblox account).
- **Where it sends it:** public ntfy.sh topic `mf-accounts-req-v1`. The PBKDF2 hash happens **afterwards**, in the receiving bot (GitHub Actions), not in transit.
- **Why it is dangerous:** ntfy.sh topics are readable by anyone who knows the topic name (and ntfy retains messages for a period). A third party subscribing to the topic obtains reusable credentials if the user reuses passwords.
- **Mitigating evidence:** there is no connection whatsoever to Miniblox credentials; the flow is independent of `session_v1`. The apparent intent is legitimate (account registration via bot), but the implementation is insecure.

### F2 — Identity and chat exposure on public ntfy.sh topics
- **Severity: MEDIUM**
- **Files/functions:**
  - `src/Chat/ClientChat.js` → `publishSignal()`: the announce payload includes `{name: state.username, uuid: state.uuid}` and chat messages are published to the global topic.
  - `src/World/LocalGames.js` → `serverAdvertPayload()` (~lines 356-370): publishes `hostUuid` (Miniblox UUID) + `hostName` to the global topic `mf-local-globalregistryv1a1b2c3d4e5f6`.
- **Data involved:** username, UUID, and chat content of the user.
- **Destination:** public ntfy.sh topics (readable by any subscriber).
- **Why it matters:** these are not credentials, but they are persistent identifiers linkable to the Miniblox account plus activity metadata. This is deliberate design (the client's chat/game list), not covert exfiltration.

### F3 — Remote code execution by design (HotLoader + auto-updater)
- **Severity: MEDIUM** (supply-chain risk, not malicious behavior)
- **Files:** `src/Core/HotLoader.js` (function `injectInline(code)`), `src/Core/background.js` (updater against `DevOfficial-Client/MiniFeather-Client` on GitHub), `hotload.json` (8 modules).
- **What it does:** downloads JavaScript from `raw.githubusercontent.com`, caches it in `localStorage['mf:hot:v1']`, and executes it via `injectInline` in Miniblox's **MAIN world** (same context as the game and its token).
- **Why it requires review:** if the remote repository or branch were compromised, arbitrary code would run with access to Miniblox's DOM (including `localStorage`, where `session_v1` lives). The mechanism is transparent, documented, and has a fallback to the packaged local version; it is a design decision, not malware. **Missing** to reduce the risk: post-download integrity verification (hash/SRI/signature) of the fetched code.

### F4 — `MF_KLIPY_FETCH` branch of the fetch bridge without URL validation
- **Severity: LOW** ("requires review")
- **File:** `src/Core/background.js`, handler for `MF_BRIDGE_FETCH`/`MF_KLIPY_FETCH`.
- **Relevant code:** the regex exists:
```js
const KLIPY_API_RE = /^https:\/\/api\.klipy\.com\/api\/v1\/[\w-]+\/gifs\/(search|trending)(\?.*)?$/;
```
but while `MF_BRIDGE_FETCH` enforces it, the `MF_KLIPY_FETCH` type enters the same handler **without passing through the regex**.
- **Why it matters:** the service worker holds broad host permissions, so this branch would allow CORS-free fetches to arbitrary URLs *if someone sent that message*. **No sender of `MF_KLIPY_FETCH` was found anywhere in the repository**, so today it is dead attack surface, not exploitation. Needs review/restriction.

### F5 — CDNs without Subresource Integrity (SRI)
- **Severity: LOW**
- **Evidence:** `src/Studio/MF_Peer.js` / `src/P2P/MF_Mesh.js` / `MF_VoiceChat.js` load `https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js`; `src/AI/VerityAI.js` dynamically loads `https://js.puter.com/v2/` (only if the user selects that provider). None use `integrity`/`crossorigin`.
- **Why it matters:** a compromised CDN would execute code in the page. The pinned version (`@1.5.4`) partially mitigates this.

---

## 3. CREDENTIALS

Complete inventory of session/storage access points and what happens next:

| # | Access | File/function | Data | What happens next |
|---|--------|---------------|------|-------------------|
| 1 | `localStorage.getItem('session_v1')` | `src/Cosmetics/MF_Accounts.js` → `readSession()` | Miniblox session token | → `fetchMe()` → `POST location.origin + '/auth-api/accounts/me'` with `body: {token}` and `credentials:'include'`. **Only to Miniblox itself (same-origin).** The ISOLATED panel receives only `session: !!acc.session` (**boolean**, never the token). |
| 2 | `credentials: 'include'` | `src/Cosmetics/MF_Accounts.js` and `src/World/IdlePlayerBot.js` (~lines 600-819) | Same-origin cookies | Only on fetches to `location.origin` (Miniblox). Verified: no credentialed fetch to third-party domains exists. |
| 3 | `localStorage` (`mf:*` keys) | HotLoader (`mf:hot:v1`), TexturePackManager (`mf_custom_textures`), VerityAI (user's AI API key), client defaults | Cached code, textures, third-party AI API key | Local use only. The VerityAI API key is sent **only to the chosen provider's official endpoint** (`Authorization: Bearer …` to `openrouter.ai` or `api.z.ai`). Never mixed with the Miniblox token. |
| 4 | `sessionStorage` / IndexedDB / Cache Storage / `document.cookie` | — | **No access anywhere in the extension code.** | Verified by exhaustive search; the only `document.cookie` matches are in the original game bundles (`index-9c634339.js`, `index-BfBcwb2y.js`), which are Miniblox's code, not the client's. |
| 5 | Miniblox UUID | ClientChat (`state.uuid`), LocalGames (`hostUuid`), MF_Accounts "Insert UUID" button (on `/signin\|/signup\|/account` routes, writes/copies the user's own UUID, not the token) | Public profile identifier | Published to ntfy topics (F2) or used locally. Not an authentication secret. |

**Partial conclusion:** the only point where the `session_v1` token leaves the process is the authenticated call to Miniblox itself. No second sink exists.

---

## 4. EXTERNAL COMMUNICATIONS

| File | URL/domain | Method | Data sent | Apparent purpose | Contains credentials? |
|------|------------|--------|-----------|------------------|-----------------------|
| `src/Cosmetics/MF_Accounts.js` | `location.origin` (miniblox.io/.online) `/auth-api/accounts/me` | POST | `{ token: session_v1 }` + cookies | Authenticated user profile | **YES — Miniblox token, but sent to Miniblox itself (legitimate)** |
| `src/UI/ClientPanel.js` (via background) | `https://ntfy.sh/mf-accounts-req-v1` | POST | `{username, password (plain text), skin, client, at}` | MiniFeather account registration via bot | **YES — MiniFeather account password in cleartext (F1, NOT Miniblox)** |
| `src/Chat/ClientChat.js` (via background) | `https://ntfy.sh/<global topic>` | POST | `{name, uuid}`, chat messages | Client global chat | No (public identity) |
| `src/World/LocalGames.js` | `https://ntfy.sh/mf-local-globalregistryv1a1b2c3d4e5f6` | POST | `hostUuid`, `hostName`, game metadata | Local game registry | No |
| `src/P2P/MF_VoiceSignalBridge.js` | `https://ntfy.sh/mfvoice-v1-…` | WS + POST | Validated `MFVOICE1` payloads (allowed types, `from` 24-hex, ≤1200 bytes, rate-limited) | P2P voice signaling | No |
| `src/World/IdlePlayerBot.js` | `location.origin` `/` and `/assets/index-*.js`, `/auth-api/launch/invite_code` | GET / POST | Same-origin cookies (`credentials:'include'`), `{code}` | Game protocol discovery; invite resolution | Cookies to Miniblox itself (legitimate) |
| `src/Core/background.js` | `api.github.com`, `raw.githubusercontent.com`, `github.com`, `objects.githubusercontent.com` | GET | Nothing sensitive | Auto-update and hot cache | No |
| `src/Core/inject.js` | `ntfy.sh/mf-skins-updates-v1/sse`, `raw.githubusercontent.com/EstebanGrp/mfaccs/main/accounts.json` | GET (receive only) | Nothing | Live rank/skin database | No |
| `src/Core/HotLoader.js` | `raw.githubusercontent.com` | GET | Nothing | Module hot-reload | No |
| `src/AI/VerityAI.js` | `js.puter.com`, `openrouter.ai`, `api.z.ai` | POST (dynamic) | Provider API key in `Authorization`, chat prompts | Optional AI feature | Provider API key → to its official endpoint |
| MF_Peer / MF_Mesh / MF_VoiceChat | `wss://ntfy.sh/…`, default PeerJS broker (`0.peerjs.com`), `unpkg.com` | WS / script | Peer IDs, signaling; voice/skins travel over WebRTC P2P | P2P connectivity | No |
| `src/Core/background.js` (Klipy proxy) | `https://api.klipy.com/api/v1/.../gifs/(search|trending)` | GET (proxy) | GIF search query (+ user's Klipy API key in query, if configured) | Chat GIFs | No (Klipy API key to Klipy) |

---

## 5. DYNAMIC CODE AND OBFUSCATION

**Dynamic code present (all identified):**

1. **`injectInline(code)`** in HotLoader — executes cached remote code fetched from GitHub raw. This is remote code loading **by design** (hot-reload), with documented guards in `hotload.json`. See F3.
2. **`eval()`** in `src/World/WorldMap.js:359` and `src/Render/WaterSplash.js:179`:
```js
const fromFn = cellProto.get.toString().match(/(\w+)\.fromBlockStateId/);
if (fromFn) { const regName = fromFn[1]; _blockRegistry = eval(regName); }
```
It evaluates a **minified variable name extracted from the game's own bundle** (`\w+` pattern, not external input). It is a trick to resolve the block registry without depending on the exact minified name. No network data is evaluated.
3. **`new Function(...)`** in `classic/mf-boot.js`: Worker shim for the opaque-origin MV3 sandbox; only executes the extension's own worker files (same-origin fetch). Legitimate.
4. **Dynamic `import()` / blobs**: `src/Core/inject.js` creates a local blob that **re-exports** the original `GuiToast-*.js` with rank-color overrides (import-map proxy). It does not download new code.
5. **Remote CDN scripts**: PeerJS (unpkg, pinned version) and puter.js — without SRI (F5).

**Obfuscation:**
- **No deliberate obfuscation exists in the extension code.** All of `src/` is readable and commented.
- **`atob`/`btoa`** appear in 8 files (`CustomModels`, `TextureInterceptor`, `MF_Peer`, `TexturePackManager`, `LocalGames`, `MF_PbrEditor`, `AnimatedItems`, `GrassFlowers`) — all for **image/texture dataURLs**, verified one by one.
- The `index-*.js` bundles in `classic/assets/` are minified because they are the **original Miniblox game**, not first-party code. The root-level `index-BfBcwb2y.js` is a non-executed reference copy (only mentioned in a comment in `FpsBoost.js`).
- `classic/gafc.js` creates a hidden `<div id="oybpxpensgbayvar">` of 4 lines: a harmless stub replacing an ad script from the original site. The random-looking name mimics the pattern of the ad code it replaces; there is no network, eval, or data access.

---

## 6. DEPENDENCIES

- **Single `package.json`**: `classic/package.json` — `devDependencies: { lite-server: ^2.6.1 }`, one `start` script. **No `postinstall`, `preinstall`, or `install` scripts** (verified repo-wide with a global search: 0 matches).
- **Locally vendored libraries** (PeerJS, JSZip): loaded from first-party files or pinned-version CDNs; no `node_modules` distributed.
- **Runtime remote code** (not install-time): GitHub raw (hot-reload, updater, rank DB), unpkg (PeerJS), js.puter.com (optional). Supply-chain risk documented in F3/F5.
- **`manifest.json`**: permissions `storage`, `declarativeNetRequest`, `activeTab`, `alarms`, `downloads`. Host permissions restricted to miniblox.io/.online, GitHub, cdn.modrinth.com, api.klipy.com, ntfy.sh, google.com. **No `cookies`, no `webRequest`, no `<all_urls>`** — the extension *cannot* read browser cookies at the API level.

---

## 7. SENSITIVE DATA FLOWS

```
FLOW A — Miniblox token (SAFE)
localStorage['session_v1'] → readSession() [MF_Accounts.js]
  → fetchMe() → fetch(location.origin + '/auth-api/accounts/me', {body:{token}})
  → DESTINATION: Miniblox itself. NO third-party sinks.
  (The panel only receives: session: !!acc.session → boolean)

FLOW B — MiniFeather password (FINDING F1)
<panel password input> → createMiniFeatherAccount() [ClientPanel.js]
  → JSON.stringify({username, password, ...})
  → port.postMessage publish → background.js (ntfy publish)
  → POST https://ntfy.sh/mf-accounts-req-v1
  → DESTINATION: any subscriber of the public topic. UNHASHED password.

FLOW C — Public identity/chat (FINDING F2)
state.username / state.uuid / chat text [ClientChat.js]
  → publishSignal() → background publish → ntfy.sh global topic → subscribers
hostUuid/hostName [LocalGames.js] → serverAdvertPayload() → ntfy.sh → subscribers

FLOW D — Game responses (LOCAL, no transmission)
fetch response → Response.prototype.json (wrapped) [inject.js]
  → shouldPatchApiResponse() filters ONLY Miniblox routes
     (/accounts/get, /friends/, /leaderboards/, /dm/history, /party/)
  → patchTree() mutates only the 'rank' field
  → DESTINATION: returned to the game in memory. Nothing is logged or transmitted.

FLOW E — Executed remote code (F3, by design)
raw.githubusercontent.com → HotLoader → localStorage['mf:hot:v1'] cache
  → injectInline(code) → executed in Miniblox MAIN world

FLOW F — Textures (LOCAL, no transmission)
HTMLImageElement.src / XHR.open [TexturePackManager, TextureInterceptor]
  → substitution with local dataUrl → rendering. No outgoing data.
```

---

## 8. FALSE POSITIVES

These elements could trigger alerts in a pattern-based scan, but flow analysis shows a legitimate explanation:

1. **`fetch`/`XMLHttpRequest` wrappers** in `src/Cosmetics/CustomSkinAPI.js` and TexturePackManager: they **locally emulate** `/accounts/custom_skin/upload` and `/accounts/set_cosmetic` (respond without network) or redirect texture URLs. They do not exfiltrate; they intercept to *avoid* the network, not to capture it.
2. **`eval()`** in WorldMap/WaterSplash: evaluates an internal identifier of the game bundle extracted by regex from the code itself, not external input (see section 5).
3. **`atob`/`btoa`**: exclusively for images/dataURLs across 8 render/model modules.
4. **`credentials: 'include'`**: only towards `location.origin` (Miniblox). Identical to what the unmodified game does.
5. **`classic/gafc.js`** and the name `oybpxpensgbayvar`: a 4-line anti-ads stub with no network access or dynamic execution.
6. **`new Function`** in mf-boot.js: a Worker shim required by the opaque origin of the MV3 sandbox; it only executes the extension's own workers.
7. **EventSource to ntfy.sh** in inject.js: a **receive-only** channel used to refresh the rank/skin database; it publishes nothing.
8. **Miniblox endpoints** (`/auth-api/*`, `/accounts/get`, `/friends/`, `/dm/history`, `/party/`, `/leaderboards/`): all accesses are same-origin reads or authenticated with the user's own token towards Miniblox. The client only **reads/patches locally** (and the response hook only changes the cosmetic `rank` field).

---

## 9. CONCLUSION

**No evidence of token logging, cookie theft, or exfiltration of Miniblox credentials was found.**

Specifically, based strictly on the evidence:
- The `session_v1` token has **a single read point** and **a single destination**: the Miniblox API, same-origin.
- There is no access to `document.cookie` in the extension code, nor any extension permission that would allow it.
- The network interceptors (`Response.prototype.json`, XHR, `fetch`, `img.src`) were fully traced: they mutate cosmetically or locally; they do not capture or forward data.

**What WAS found (with evidence):**
1. **HIGH** — "MiniFeather" account passwords in plain text published to a public ntfy.sh topic (`mf-accounts-req-v1`). These are not Miniblox credentials, but it is genuinely insecure credential transmission.
2. **MEDIUM** — Username/UUID/chat exposed on public ntfy.sh topics (deliberate design of the chat/game list).
3. **MEDIUM** — Remote code from GitHub raw executed in the MAIN world, without post-download integrity verification (**requires review**: supply-chain risk accepted by design, not malware).
4. **LOW** — `MF_KLIPY_FETCH` branch without URL validation in the background (**requires review**: no sender exists in the repo today); CDNs without SRI.

None of this constitutes covert malicious behavior: these are visible implementation weaknesses and design decisions, not a token logger.
