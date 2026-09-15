(function () {
    'use strict';
    if (window.__MF_CustomSkins) return;
    window.__MF_CustomSkins = true;

    var TAG = "[MiniFeather Skins]";
    var VERBOSE = false;

    function log() {
        if (!VERBOSE) return;
        var args = [TAG].concat(Array.prototype.slice.call(arguments));
        console.log.apply(console, args);
    }

    function warn() {
        var args = [TAG].concat(Array.prototype.slice.call(arguments));
        console.warn.apply(console, args);
    }

    log("starting (profile patch mode)");

    // ─── Base de skins locales ───────────────────────────────────────
    // MAIN world no tiene chrome.runtime: SplashScreen (ISOLATED) inyecta
    // meta[name=mf-skins-base] con la URL de /skins/ de la extensión.
    function skinsBaseUrl() {
        var meta = document.querySelector('meta[name="mf-skins-base"]');
        return meta && meta.content ? meta.content : null;
    }

    // ─── IDs compartidos con packs custom (MF_Facial) ────────────────
    // Registro vivo "nombre custom → URL del PNG" + interceptor <img src>.
    // Comparte globals con MF_Facial (instala el hook quien llegue primero;
    // el registro se lee EN VIVO al resolver cada URL).
    var packSkinReg = (globalThis.__MF_PACK_SKINS__ ||= {});
    var CUSTOM_URL_RE = /(?:^|\/)auth-api\/skins\/custom\/([^\/?#]+)\.png(?:[?#]|$)/;
    var MF_DEV_SKINS = ['eve', 'gab', 'itzesteban', 'nightrise', 'notsenpai'];

    function installCustomUrlHook() {
        if (globalThis.__MF_PACK_IMG_HOOK__) return;
        var proto = HTMLImageElement.prototype;
        var d = Object.getOwnPropertyDescriptor(proto, 'src');
        if (!d || !d.set || !d.get) return;
        var origSet = d.set;
        Object.defineProperty(proto, 'src', {
            configurable: true,
            enumerable: d.enumerable,
            get: function () { return d.get.call(this); },
            set: function (v) {
                if (typeof v === 'string') {
                    var reg = globalThis.__MF_PACK_SKINS__;
                    if (reg) {
                        var m = v.match(CUSTOM_URL_RE);
                        if (m && reg[m[1]]) { origSet.call(this, reg[m[1]]); return; }
                        // rutas del juego con o sin subdirectorios:
                        //   textures/entity/skins/devs/itzesteban.png
                        //   textures/entity/skins/chris.png
                        // se les quita prefijo y .png y se busca en el registro.
                        // INGAME el juego también pide la ruta plana para ids
                        // custom (textures/entity/skins/custom:mf_x.png):
                        // reintentar sin el prefijo "custom:".
                        var m2 = v.match(/(?:^|\/)textures\/entity\/skins\/(.+?)\.png(?:[?#]|$)/);
                        if (m2) {
                            var k2 = reg[m2[1]] ? m2[1]
                                : m2[1].replace(/^custom:/i, '');
                            if (reg[k2]) { origSet.call(this, reg[k2]); return; }
                        }
                    }
                }
                origSet.call(this, v);
            }
        });
        globalThis.__MF_PACK_IMG_HOOK__ = true;
    }

    // skins sueltas de skins/devs/ → ids custom:mf_dev_<nombre>. Se registra
    // en cuanto la meta mf-skins-base está disponible (SplashScreen).
    var devSkinsRegistered = false;
    function registerDevSkins() {
        if (devSkinsRegistered) return;
        var base = skinsBaseUrl();
        if (!base) return;
        // la meta apunta DENTRO de /skins/ (chrome-extension://<id>/skins/)
        base = String(base).replace(/\/*$/, '/');
        for (var i = 0; i < MF_DEV_SKINS.length; i++) {
            var n = MF_DEV_SKINS[i];
            packSkinReg['mf_dev_' + n] = base + 'devs/' + n + '.png';
        }
        // packs builtin de skins/mypacks/ (id custom:mf_<pack>) por si
        // MF_Facial aún no cargó — misma URL que usa su packSkinUrl
        var packs = {
            estebangxe: 'EstebanExG__1_1.png',
            angrywolfx: 'angrywolfx.png',
            eve: 'eve.png'
        };
        for (var id in packs) {
            if (!Object.prototype.hasOwnProperty.call(packs, id)) continue;
            if (!packSkinReg['mf_' + id]) {
                packSkinReg['mf_' + id] = base + 'mypacks/' + id + '/' + packs[id];
            }
        }
        devSkinsRegistered = true;
        installCustomUrlHook();
        log('ids custom listos (devs + mypacks)');
    }

    // ─── Carga de la base de datos de overrides ──────────────────────
    // Formato de la caché local:
    //   { "players": { "<uuid>": { "skin": "devs/itzesteban", ... } } }
    // Acepta clave por uuid (preferido, inmune a renombres) o username.
    // "skin" puede ser:
    //   - ruta relativa a /skins/ sin extensión ("devs/itzesteban")
    //   - ruta con extensión ("devs/itzesteban.png")
    //   - nombre de skin vanilla de miniblox ("chris") → se reescribe el
    //     campo profile.cosmetics.skin del JSON del servidor tal cual
    var DB_KEY = 'minifeather:custom-skins-db';

    // ─── DB builtin (viene con la extensión) ─────────────────────────
    // Mapa jugador → id de skin custom. Los ids custom:mf_* los resuelve
    // el interceptor de arriba contra /skins/ del client (así TODOS los
    // usuarios del client ven la skin, sin depender del server).
    // Se puede sobreescribir/añadir con accounts.json (fetch) o editando
    // assets/accounts.json en el repo.
    var BUILTIN_DB = {
        players: {
            // packs de skins/mypacks/ (uuid del pack.json → custom:mf_<id>)
            '6eb7369a-551e-406a-9a63-6db7a358e1e5': { skin: 'custom:mf_estebangxe' }, // EstebanGxE
            'c4201f43-2de9-4275-930a-301fae4cce6c': { skin: 'custom:mf_angrywolfx' }, // AngryWolfX
            // skins sueltas de skins/devs/ (username → custom:mf_dev_<png>)
            'itzesteban': { skin: 'custom:mf_dev_itzesteban' },
            'nightrise': { skin: 'custom:mf_dev_nightrise' },
            'notsenpai': { skin: 'custom:mf_dev_notsenpai' },
            'gab': { skin: 'custom:mf_dev_gab' },
            'eve': { skin: 'custom:mf_eve' }
        }
    };

    var db = null;            // { uuidOrName: {skin, ...} }
    var dbByUuid = null;      // uuid lowercase → entry
    var dbByName = null;      // username lowercase → entry
    var dbLoading = null;

    function normalizeSkinValue(value) {
        if (typeof value !== 'string') return null;
        // ids custom (clase nativa del juego) pasan tal cual
        if (value.indexOf('custom:') === 0) return value;
        var v = value.trim().replace(/\\/g, '/').replace(/^\/+/, '');
        if (!v) return null;
        var m = v.match(/^skins\/(.+)$/i);
        if (m) v = m[1];
        return v.replace(/\.png$/i, '');
    }

    function isVanillaSkinId(id) {
        // ids vanilla: solo [a-z0-9_] sin barras (p.ej. "chris", "bob").
        // Si lleva barra es una ruta a /skins/ del pack.
        return typeof id === 'string' && id && /^[a-z0-9_]+$/i.test(id) && id.indexOf('/') === -1;
    }

    function entrySkinUrl(entry) {
        if (!entry || !entry.__skin) return null;
        // id custom: → lo resuelve el hook de /auth-api/skins/custom/ (no
        // hay URL directa que construir aquí)
        if (String(entry.__skin).indexOf('custom:') === 0) return null;
        if (isVanillaSkinId(entry.__skin)) return null; // se reescribe el id, no la URL
        var base = skinsBaseUrl();
        if (!base) return null;
        return base + entry.__skin + '.png';
    }

    function parseDb(data, reset) {
        if (reset) { dbByUuid = {}; dbByName = {}; }
        if (!dbByUuid) dbByUuid = {};
        if (!dbByName) dbByName = {};
        if (!data || typeof data !== 'object') return;
        var players = data.players || data;
        for (var key in players) {
            if (!Object.prototype.hasOwnProperty.call(players, key)) continue;
            var raw = players[key];
            if (!raw || typeof raw !== 'object') continue;
            var skin = normalizeSkinValue(raw.skin);
            if (!skin) continue;
            var entry = { __skin: skin };
            if (typeof raw.rank === 'string' && raw.rank) entry.rank = raw.rank;
            var uuidKey = String(key).toLowerCase();
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuidKey)) {
                dbByUuid[uuidKey] = entry;
            } else {
                dbByName[uuidKey] = entry;
            }
        }
    }

    function loadDb() {
        if (db !== null) return Promise.resolve(db);
        if (dbLoading) return dbLoading;

        var finish = function (data) {
            // builtin primero; accounts.json (si existe) sobreescribe/añade
            parseDb(BUILTIN_DB, true);
            parseDb(data, false);
            db = data || {};
            dbLoading = null;
            var n = Object.keys(dbByUuid).length + Object.keys(dbByName).length;
            log('DB lista (' + n + ' overrides)');
            return db;
        };

        // el MAIN world no tiene chrome.runtime.getURL garantizado en todas
        // las versiones: pasamos por sendMessage → background, que sí tiene
        // acceso a los recursos de la extensión. Fallback: si chrome.runtime
        // no está disponible (raro), intentar getURL directamente.
        dbLoading = new Promise(function (resolve) {
            var done = false;
            var finishFromExt = function (json) {
                if (done) return;
                done = true;
                resolve(json);
            };
            try {
                if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage({ type: 'mfAccounts:get' }, function (res) {
                        if (chrome.runtime.lastError || !res || !res.success) {
                            // fallback: intentar getURL directo
                            try {
                                fetch(chrome.runtime.getURL('assets/accounts.json'), { cache: 'no-store' })
                                    .then(function (r) { return r.ok ? r.json() : null; })
                                    .then(finishFromExt)
                                    .catch(function () { finishFromExt(null); });
                            } catch (_) { finishFromExt(null); }
                            return;
                        }
                        finishFromExt(res.json || null);
                    });
                    return;
                }
            } catch (_) {}
            try {
                fetch(chrome.runtime.getURL('assets/accounts.json'), { cache: 'no-store' })
                    .then(function (r) { return r.ok ? r.json() : null; })
                    .then(finishFromExt)
                    .catch(function () { finishFromExt(null); });
                return;
            } catch (_) {}
            finishFromExt(null);
        })
            .then(finish)
            .catch(function (e) {
                warn('accounts.json local no disponible (' + (e && e.message || e) + '), usando sessionStorage');
                try {
                    var cached = sessionStorage.getItem(DB_KEY);
                    if (cached) return finish(JSON.parse(cached));
                } catch (_) {}
                return finish(null);
            });

        return dbLoading;
    }

    // ─── Lookup de override para un perfil ───────────────────────────
    function lookupEntry(profile) {
        if (!dbByUuid && !dbByName) return null;
        var uuid = typeof profile.uuid === 'string' ? profile.uuid.toLowerCase() : null;
        if (uuid && dbByUuid[uuid]) return dbByUuid[uuid];
        var name = typeof profile.username === 'string'
            ? profile.username.toLowerCase()
            : (typeof profile.name === 'string' ? profile.name.toLowerCase() : null);
        if (name && dbByName[name]) return dbByName[name];
        return null;
    }

    // ─── Parche del JSON ─────────────────────────────────────────────
    // El servidor manda el perfil plano: { username, uuid, skin, cape, ... }.
    // El juego lo parsea con mP: cosmetics.skin = e.skin. Reescribimos
    // e.skin ANTES de que el juego lo vea:
    //   - skin vanilla ("chris") → cambiamos el id y el juego carga su PNG
    //   - skin del pack ("devs/itzesteban") → id custom + la URL la resuelve
    //     el interceptor de <img> de más abajo
    //   - URL absoluta (raw.githubusercontent) → el juego tiene
    //     loadSkinFromUrl y el TextureInterceptor la espeja localmente
    var patchedProfiles = new WeakSet();

    function patchProfile(profile) {
        if (!profile || typeof profile !== 'object') return false;
        if (patchedProfiles.has(profile)) return false;
        patchedProfiles.add(profile);

        var entry = lookupEntry(profile);
        if (!entry) return false;

        try {
            profile.skin = entry.__skin;
            log('skin override', profile.uuid, '->', entry.__skin);
            return true;
        } catch (e) {
            return false;
        }
    }

    // Camina el JSON buscando objetos con uuid (perfiles sueltos, listas
    // de amigos, leaderboards...). Profundidad limitada por rendimiento.
    function walkAndPatch(node, depth) {
        if (!node || typeof node !== 'object' || depth > 3) return false;
        var changed = false;

        if (typeof node.uuid === 'string' && node.uuid.length > 8) {
            changed = patchProfile(node) || changed;
        }

        if (Array.isArray(node)) {
            for (var i = 0; i < node.length && i < 200; i++) {
                changed = walkAndPatch(node[i], depth + 1) || changed;
            }
            return changed;
        }

        for (var key in node) {
            if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
            var value = node[key];
            if (value && typeof value === 'object') {
                changed = walkAndPatch(value, depth + 1) || changed;
            }
        }
        return changed;
    }

    // ─── Interceptor de respuestas JSON (fetch) ──────────────────────
    function isProfileResponse(url) {
        return url.indexOf('miniblox.io') !== -1 ||
               url.indexOf('miniblox.online') !== -1 ||
               url.charAt(0) === '/' ||
               url.indexOf('auth-api') !== -1;
    }

    function patchFetch() {
        if (window.__customSkinsFetchPatched) return true;
        if (typeof window.fetch !== 'function') return false;

        var originalFetch = window.fetch;
        window.fetch = function (input, init) {
            var args = arguments;

            var reqUrl = '';
            try {
                reqUrl = typeof input === 'string' ? input : (input && input.url ? input.url : '');
            } catch (e) {}

            var promise = originalFetch.apply(this, args);
            if (!reqUrl || !isProfileResponse(reqUrl)) return promise;

            // Reconstruir la Response con el JSON parcheado para que el
            // juego lea el perfil ya modificado.
            return promise.then(function (response) {
                try {
                    var ct = response.headers && response.headers.get
                        ? (response.headers.get('content-type') || '')
                        : '';
                    if (ct.indexOf('json') === -1 && ct.indexOf('text/plain') === -1) {
                        return response;
                    }
                    return response.clone().text().then(function (text) {
                        var data;
                        try { data = JSON.parse(text); } catch (e) { return response; }
                        if (!walkAndPatch(data, 0)) return response;
                        var out;
                        try { out = JSON.stringify(data); } catch (e) { return response; }
                        try {
                            var headers = new Headers(response.headers);
                            headers.set('content-type', 'application/json');
                            return new Response(out, {
                                status: response.status,
                                statusText: response.statusText,
                                headers: headers
                            });
                        } catch (e) {
                            return new Response(out, { headers: { 'content-type': 'application/json' } });
                        }
                    }).catch(function () { return response; });
                } catch (e) {
                    return response;
                }
            });
        };
        window.__customSkinsFetchPatched = true;
        return true;
    }

    // ─── Interceptor de <img src> para skins del pack ────────────────
    // El juego carga textures/entity/skins/<id>.png. Si <id> es uno de
    // nuestros ids custom, lo servimos desde /skins/ de la extensión.
    // Las skins vanilla de otros usuarios pasan intactas.
    var SKIN_PATH_REGEX = /^textures\/entity\/skins\/([^/?#]+)\.png(?:[?#].*)?$/i;
    // mismo hook pero para rutas con subdirectorio (devs/…, custom:…/…)
    var SKIN_PATH_REGEX_DEEP = /^textures\/entity\/skins\/(.+?)\.png(?:[?#].*)?$/i;
    var patched = false;

    function getCustomSkinForId(skinId) {
        if (!dbByUuid && !dbByName) return null;
        for (var uuid in dbByUuid) {
            if (dbByUuid[uuid].__skin === skinId) return dbByUuid[uuid];
        }
        for (var name in dbByName) {
            if (dbByName[name].__skin === skinId) return dbByName[name];
        }
        return null;
    }

    // ─── Watcher en vivo de perfiles del mundo ───────────────────────
    // Los perfiles de otros jugadores llegan por socket (protobuf), no por
    // fetch: spawnPlayer asigna profile.cosmetics = packet.cosmetics.
    // Recorremos world.players y reescribimos cosmetics.skin por uuid.
    // El propio juego hace mesh.recreate() al detectar el cambio (lo usa
    // en applyEntry y en el sync de contenido mod).
    function findGame() {
        try {
            if (window.miniblox?.player) return window.miniblox;
            var react = document.querySelector('#react');
            if (react) {
                for (var key in react) {
                    var game = react[key]?.updateQueue?.baseState?.element?.props?.game;
                    if (game?.player) return game;
                }
            }
        } catch (e) {}
        return null;
    }

    var lastLiveScan = 0;

    function applyLiveOverrides() {
        registerDevSkins(); // idempotente: espera la meta mf-skins-base
        if (dbByUuid === null && dbByName === null) return;

        var game = findGame();
        var world = game?.world;
        if (!world || !world.players) return;

        try {
            var players = world.players;
            if (typeof players.forEach === 'function') {
                players.forEach(function (player) { overridePlayer(player); });
            } else if (typeof players.values === 'function') {
                var it = players.values();
                var entry;
                while (!(entry = it.next()).done) overridePlayer(entry.value);
            }
        } catch (e) {}
    }

    // ─── Reemplazo de TEXTURA directa (sin recreate) ─────────────────
    // El recreate() nativo del juego es async (getModel → downloadSkin):
    // si la skin custom tarda en resolver, monta un modelo NUEVO sin
    // desmontar el viejo → el espectador ve DOS modelos superpuestos.
    // Pintar la textura del mesh ya montado es visualmente idéntico y no
    // toca la jerarquía (mismo patrón que MF_Mesh.applySkinToPeer).
    var paintedPlayers = new WeakSet();

    function resolveSkinImageUrl(entry) {
        if (!entry || !entry.__skin) return null;
        var s = String(entry.__skin);
        // custom:<id> → registro compartido __MF_PACK_SKINS__ (lo llena
        // parseDb para URLs y MF_Facial/registerDevSkins para packs)
        if (s.indexOf('custom:') === 0) {
            var reg = globalThis.__MF_PACK_SKINS__ || {};
            return reg[s.slice(7)] || null;
        }
        return entrySkinUrl(entry);
    }

    function skinMaterialsOf(mesh) {
        var out = [], seen = new Set();
        try {
            mesh.traverse(function (o) {
                if (!o || !o.material) return;
                var list = Array.isArray(o.material) ? o.material : [o.material];
                for (var i = 0; i < list.length; i++) {
                    var m = list[i];
                    if (m && m.map && !seen.has(m)) { seen.add(m); out.push(m); }
                }
            });
        } catch (_) {}
        // heurística de textura de skin: múltiplo de 64, cuadrada o 2:1
        var skins = out.filter(function (m) {
            var w = m.map?.image?.width, h = m.map?.image?.height;
            if (!w || !h) return false;
            var k64 = w / 64;
            return Number.isInteger(k64) && (h === w || h === w / 2);
        });
        return skins.length ? skins : out;
    }

    function paintEntitySkin(player, entry) {
        try {
            var mesh = player.mesh;
            if (!mesh || typeof mesh.traverse !== 'function') return false;
            var url = resolveSkinImageUrl(entry);
            if (!url) return false;
            var mats = skinMaterialsOf(mesh);
            if (!mats.length) return false;
            var img = new Image();
            img.crossOrigin = 'anonymous'; // imprescindible para WebGL
            img.onload = function () {
                for (var i = 0; i < mats.length; i++) {
                    var t = mats[i].map;
                    if (!t) continue;
                    try {
                        var c = document.createElement('canvas');
                        c.width = img.naturalWidth || img.width;
                        c.height = img.naturalHeight || img.height;
                        var ctx = c.getContext('2d');
                        ctx.imageSmoothingEnabled = false;
                        ctx.drawImage(img, 0, 0);
                        var nt = null;
                        try { nt = new t.constructor(c); } catch (_) {}
                        if (!nt) continue;
                        try {
                            nt.magFilter = t.magFilter; nt.minFilter = t.minFilter;
                            if (t.colorSpace !== undefined && 'colorSpace' in nt) nt.colorSpace = t.colorSpace;
                            nt.flipY = t.flipY; nt.wrapS = t.wrapS; nt.wrapT = t.wrapT;
                        } catch (_) {}
                        mats[i].map = nt;
                        mats[i].needsUpdate = true;
                    } catch (_) {}
                }
            };
            img.onerror = function () {
                warn('no se pudo pintar la skin custom:', url);
                paintedPlayers.delete(player); // reintentar en el próximo scan
            };
            img.src = url;
            return true;
        } catch (_) { return false; }
    }

    function overridePlayer(player) {
        if (!player || !player.profile) return;
        var profile = player.profile;
        var cosmetics = profile.cosmetics;
        if (!cosmetics || typeof cosmetics !== 'object') return;

        var entry = lookupEntry(profile);
        if (!entry) return;

        var target = entry.__skin;
        var painted = paintedPlayers.has(player);
        if (cosmetics.skin === target && painted) return;

        if (isVanillaSkinId(target)) {
            // skin vanilla (chris…): la vía nativa es segura — el juego
            // ya tiene la textura en su atlas, el recreate es instantáneo
            // y no deja modelos colgando
            if (cosmetics.skin === target) return;
            try {
                cosmetics.skin = target;
                if (player.mesh && typeof player.mesh.recreate === 'function') {
                    player.mesh.recreate();
                }
            } catch (e) {}
            return;
        }

        // pintar la textura del modelo YA montado (sin recreate → sin
        // segundo modelo). Si aún no hay materiales (mesh cargando), el
        // próximo scan del watcher reintenta.
        if (!painted && paintEntitySkin(player, entry)) {
            paintedPlayers.add(player);
            log('live override (textura)', profile.uuid || profile.username, '->', target);
        }
        // el id queda en cosmetics para tab/nametags y para que un
        // recreate NATIVO futuro (respawn, sombrero…) la cargue por el
        // hook de <img> — nunca llamamos recreate() nosotros
        if (cosmetics.skin !== target) {
            try { cosmetics.skin = target; } catch (e) {}
        }
    }

    function startLiveWatcher() {
        setInterval(function () {
            var now = performance.now();
            if (now - lastLiveScan < 500) return;
            lastLiveScan = now;
            applyLiveOverrides();
        }, 500);
    }

    function patchImageSrc() {
        if (patched) return true;

        var proto = HTMLImageElement.prototype;
        var descriptor = Object.getOwnPropertyDescriptor(proto, 'src');
        if (!descriptor || !descriptor.set || !descriptor.get) return false;

        var originalSet = descriptor.set;
        var originalUrls = new WeakMap();

        Object.defineProperty(proto, 'src', {
            configurable: true,
            enumerable: descriptor.enumerable,
            get: function () {
                return descriptor.get.call(this);
            },
            set: function (value) {
                if (typeof value !== 'string') {
                    originalSet.call(this, value);
                    return;
                }

                var match = value.match(SKIN_PATH_REGEX) || value.match(SKIN_PATH_REGEX_DEEP);
                if (!match) {
                    originalSet.call(this, value);
                    return;
                }

                var skinId = match[1];
                // el juego pide la ruta plana también para ids custom:
                // textures/entity/skins/custom:mf_x.png → probar sin prefijo
                if (skinId.indexOf('custom:') === 0) skinId = skinId.slice(7);
                var custom = getCustomSkinForId(skinId);

                if (!custom) {
                    originalSet.call(this, value); // skin vanilla u otra: intacta
                    return;
                }

                var url = entrySkinUrl(custom);
                if (!url) {
                    originalSet.call(this, value);
                    return;
                }

                originalUrls.set(this, value);

                var self = this;
                this.addEventListener(
                    'error',
                    function () {
                        var orig = originalUrls.get(self);
                        if (orig && !self.__customSkinRetried) {
                            self.__customSkinRetried = true;
                            warn('fallo la skin custom, volviendo a vanilla:', skinId);
                            originalSet.call(self, orig);
                        }
                    },
                    { once: true }
                );

                originalSet.call(this, url);
            },
        });

        patched = true;
        return true;
    }

    function tryPatch() {
        patchFetch();
        registerDevSkins();
        if (typeof HTMLImageElement === 'undefined') return false;
        return patchImageSrc();
    }

    if (tryPatch()) {
        log('patches aplicados');
    } else {
        var pollTicks = 0;
        var setupInterval = setInterval(function () {
            pollTicks++;
            registerDevSkins(); // la meta mf-skins-base llega con SplashScreen
            if (tryPatch()) {
                clearInterval(setupInterval);
            }
        }, 250);
    }

    // Precargar la DB y cachearla para navegaciones siguientes
    loadDb().then(function (data) {
        if (!data) return;
        try {
            sessionStorage.setItem(DB_KEY, JSON.stringify({
                players: data.players || data
            }));
        } catch (_) {}
    });

    // Watcher de perfiles en vivo (socket protobuf)
    startLiveWatcher();
})();
