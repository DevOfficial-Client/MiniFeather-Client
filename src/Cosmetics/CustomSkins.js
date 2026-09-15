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
        // el hook de <img> es crítico para los ids custom (incluidos los
        // mf_url_* que genera parseDb para URLs absolutas): instalarlo ya,
        // sin esperar la meta
        installCustomUrlHook();
        if (devSkinsRegistered) return;
        var base = skinsBaseUrl();
        if (!base) return;
        // la meta apunta DENTRO de /skins/ (chrome-extension://<id>/skins/)
        base = String(base).replace(/\/*$/, '/');
        for (var i = 0; i < MF_DEV_SKINS.length; i++) {
            var n = MF_DEV_SKINS[i];
            packSkinReg['mf_dev_' + n] = base + 'devs/' + n + '.png';
            // también la forma de RUTA (sin "custom:"): el juego puede pedir
            // textures/entity/skins/devs/<n>.png directamente cuando la DB
            // guarda "devs/<n>" o "devs/<n>.png"
            packSkinReg['devs/' + n] = base + 'devs/' + n + '.png';
        }
        // packs builtin de skins/mypacks/ (id custom:mf_<pack>) por si
        // MF_Facial aún no cargó — misma URL que usa su packSkinUrl
        var packs = {
            shusukegxe: 'shusukegxe.png',
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
        log('ids custom listos (devs + mypacks)');
    }

    // ─── Carga de la base de datos de overrides ──────────────────────
    // Formato (assets/accounts.json local o accounts.json del repo remoto):
    //   { "players": { "<uuid>": { "skin": "devs/itzesteban", ... }, "<username>": { ... } } }
    // Acepta clave por uuid (preferido, inmune a renombres) o username.
    // "skin" puede ser:
    //   - id custom: (custom:mf_<pack>, custom:mf_dev_<png>) → lo resuelve
    //     el hook de /auth-api/skins/custom/ del MAIN world
    //   - ruta relativa a /skins/ sin extensión ("devs/itzesteban")
    //   - ruta con extensión ("devs/itzesteban.png")
    //   - nombre de skin vanilla de miniblox ("chris") → se reescribe el
    //     campo profile.cosmetics.skin del JSON del servidor tal cual
    //   - URL absoluta (https://..., chrome-extension://..., file://...,
    //     data:image/..., blob:...) → el juego la carga con loadSkinFromUrl
    //     y TextureInterceptor la espeja localmente
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
        var v = value.trim();
        if (!v) return null;
        // ids custom (clase nativa del juego) pasan tal cual
        if (v.indexOf('custom:') === 0) return v;
        // URL absoluta (http(s), chrome-extension, file, data, blob) → el
        // juego tiene loadSkinFromUrl que la carga directo, sólo se normaliza
        // el separador (la barra se conserva tal cual)
        if (/^(https?:\/|chrome-extension:\/|file:\/|data:image\/|blob:)/i.test(v)) {
            return v.replace(/\\/g, '/');
        }
        v = v.replace(/\\/g, '/').replace(/^\/+/, '');
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

    function isAbsoluteSkinUrl(id) {
        return typeof id === 'string' && /^(https?:\/|chrome-extension:\/|file:\/|data:image\/|blob:)/i.test(id);
    }

    function entrySkinUrl(entry) {
        if (!entry || !entry.__skin) return null;
        // id custom: → lo resuelve el hook de /auth-api/skins/custom/ (no
        // hay URL directa que construir aquí)
        if (String(entry.__skin).indexOf('custom:') === 0) return null;
        // URL absoluta: el juego la carga con loadSkinFromUrl, no se espeja
        if (isAbsoluteSkinUrl(entry.__skin)) return entry.__skin;
        if (isVanillaSkinId(entry.__skin)) return null; // se reescribe el id, no la URL
        var base = skinsBaseUrl();
        if (!base) return null;
        return base + entry.__skin + '.png';
    }

    function parseDb(data, reset) {
        if (reset) { dbByUuid = {}; dbByName = {}; }
        if (!dbByUuid) dbByUuid = {};
        if (!dbByName) dbByName = {};
        dbNameIndex = null; // índice loose inválido: DB cambió
        if (!data || typeof data !== 'object') return;
        var players = data.players || data;
        for (var key in players) {
            if (!Object.prototype.hasOwnProperty.call(players, key)) continue;
            var raw = players[key];
            if (!raw || typeof raw !== 'object') continue;
            var skin = normalizeSkinValue(raw.skin);
            if (!skin) continue;
            // URL absoluta → id custom sintético + registro en __MF_PACK_SKINS__:
            // el juego no acepta URLs en profile.skin (construye su propio
            // path textures/entity/skins/<valor>.png y falla 403/404), pero el
            // hook de <img> sí intercambia auth-api/skins/custom/<id>.png por
            // cualquier URL del registro.
            if (isAbsoluteSkinUrl(skin)) {
                var urlId = 'mf_url_' + String(key).toLowerCase()
                    .replace(/[^a-z0-9_]/g, '');
                if (!packSkinReg[urlId]) {
                    packSkinReg[urlId] = skin;
                    log('skin URL registrada', key, '->', skin);
                }
                skin = 'custom:' + urlId;
            }
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
            publishDb();
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
    // Publicar la DB resuelta para otros módulos (MF_Facial la usa para
    // matchear el pack de facial de un player por uuid/username):
    //   window.__MF_CustomSkins_DB__ = { byUuid: {<uuid>: '<skin>'}, byName: {...} }
    function publishDb() {
        try {
            var byUuid = {}, byName = {};
            for (var u in dbByUuid) if (Object.prototype.hasOwnProperty.call(dbByUuid, u)) byUuid[u] = dbByUuid[u].__skin;
            for (var n in dbByName) if (Object.prototype.hasOwnProperty.call(dbByName, n)) byName[n] = dbByName[n].__skin;
            window.__MF_CustomSkins_DB__ = { byUuid: byUuid, byName: byName };
        } catch (_) {}
    }

    // normalizar username para matching: minúsculas y sin _/- al final
    // (el juego muestra "ShusukeGxE_" pero la DB puede tener
    // "shusukegxe") — también prueba sin separadores internos
    function normNameKey(name) {
        if (typeof name !== 'string') return null;
        var n = name.toLowerCase().replace(/[\s_-]+/g, '');
        return n || null;
    }
    // índice de nombres normalizados → entrada (se reconstruye en parseDb)
    var dbNameIndex = null;
    function lookupByNameLoose(name) {
        if (!dbByName) return null;
        var direct = dbByName[String(name).toLowerCase()];
        if (direct) return direct;
        if (!dbNameIndex) {
            dbNameIndex = {};
            for (var n in dbByName) {
                if (!Object.prototype.hasOwnProperty.call(dbByName, n)) continue;
                var k = normNameKey(n);
                if (k && !dbNameIndex[k]) dbNameIndex[k] = dbByName[n];
            }
        }
        var k2 = normNameKey(name);
        return k2 ? (dbNameIndex[k2] || null) : null;
    }

    function lookupEntry(profile) {
        if (!dbByUuid && !dbByName) return null;
        var uuid = typeof profile.uuid === 'string' ? profile.uuid.toLowerCase() : null;
        if (uuid && dbByUuid[uuid]) return dbByUuid[uuid];
        var name = typeof profile.username === 'string'
            ? profile.username.toLowerCase()
            : (typeof profile.name === 'string' ? profile.name.toLowerCase() : null);
        if (name) {
            var byName = lookupByNameLoose(name);
            if (byName) return byName;
        }
        // el profile puede traer sólo uuid (ej. spawnPlayer): usar la cache
        // remota para resolver por username y reintentar
        if (uuid) {
            var cached = remoteProfiles.get(uuid);
            if (cached && cached.username) {
                var cachedName = String(cached.username).toLowerCase();
                var loose = lookupByNameLoose(cachedName);
                if (loose) return loose;
            }
        }
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

    // Cache de perfiles remotos capturados por fetch/XHR. Permite que un
    // override configurado por username también se aplique cuando el juego
    // sólo expone el uuid (ej. spawnPlayer). El juego reescribe el profile
    // del mundo en cada scan; la cache evita perder el mapeo uuid→username
    // cuando el JSON entrante sólo trae uno de los dos.
    var remoteProfiles = new Map();    // uuid lowercase → { username, profile, ts }

    function captureProfiles(data) {
        if (!data || typeof data !== 'object') return;
        var now = Date.now();
        var queue = [data];
        var seen = new WeakSet();
        while (queue.length) {
            var node = queue.shift();
            if (!node || typeof node !== 'object' || seen.has(node)) continue;
            seen.add(node);
            if (Array.isArray(node)) {
                for (var i = 0; i < node.length && i < 200; i++) queue.push(node[i]);
                continue;
            }
            var uuid = typeof node.uuid === 'string' ? node.uuid.toLowerCase() : null;
            var uname = typeof node.username === 'string' ? node.username : null;
            if (uuid && uuid.length >= 8 && (uname || node.cosmetics || node.skin)) {
                var entry = remoteProfiles.get(uuid) || {};
                if (uname) entry.username = uname;
                if (node.cosmetics || node.skin) entry.profile = node;
                entry.ts = now;
                remoteProfiles.set(uuid, entry);
            }
            for (var k in node) {
                if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
                var v = node[k];
                if (v && typeof v === 'object') queue.push(v);
            }
        }
    }

    function transformProfileData(data) {
        return walkAndPatch(data, 0) ? data : data;
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
                        // siempre capturamos (para mapear uuid↔username de
                        // jugadores remotos), aunque no haya overrides a aplicar
                        try { captureProfiles(data); } catch (_) {}
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

    // XHR wrapping (mismo método que FriendNicknames.js): algunos endpoints
    // del juego usan XMLHttpRequest en vez de fetch; sin este patch el
    // override de skins de terceros nunca se aplicaría a esos jugadores.
    function patchXHR() {
        try {
            var XHR = window.XMLHttpRequest;
            if (!XHR || !XHR.prototype) return false;
            var proto = XHR.prototype;

            if (!proto.__customSkinsResponsePatched) {
                try {
                    var textDesc = Object.getOwnPropertyDescriptor(proto, 'responseText');
                    if (textDesc && textDesc.get && textDesc.configurable !== false) {
                        Object.defineProperty(proto, 'responseText', {
                            configurable: true,
                            enumerable: textDesc.enumerable,
                            get: function () {
                                var text = textDesc.get.call(this);
                                if (!this.__customSkinsProfile || !text) return text;
                                if (this.__customSkinsTransformedTextSource === text &&
                                    typeof this.__customSkinsTransformedText === 'string') {
                                    return this.__customSkinsTransformedText;
                                }
                                try {
                                    var data = JSON.parse(text);
                                    try { captureProfiles(data); } catch (_) {}
                                    walkAndPatch(data, 0);
                                    var transformed = JSON.stringify(data);
                                    this.__customSkinsTransformedTextSource = text;
                                    this.__customSkinsTransformedText = transformed;
                                    return transformed;
                                } catch (_) {
                                    return text;
                                }
                            }
                        });
                    }
                } catch (_) {}

                try {
                    var respDesc = Object.getOwnPropertyDescriptor(proto, 'response');
                    if (respDesc && respDesc.get && respDesc.configurable !== false) {
                        Object.defineProperty(proto, 'response', {
                            configurable: true,
                            enumerable: respDesc.enumerable,
                            get: function () {
                                var value = respDesc.get.call(this);
                                if (!this.__customSkinsProfile || this.responseType !== 'json' ||
                                    !value || typeof value !== 'object') return value;
                                if (this.__customSkinsTransformedRespSource === value &&
                                    this.__customSkinsTransformedResp) {
                                    return this.__customSkinsTransformedResp;
                                }
                                try {
                                    try { captureProfiles(value); } catch (_) {}
                                    walkAndPatch(value, 0);
                                    this.__customSkinsTransformedRespSource = value;
                                    this.__customSkinsTransformedResp = value;
                                    return value;
                                } catch (_) {
                                    return value;
                                }
                            }
                        });
                    }
                } catch (_) {}

                try {
                    Object.defineProperty(proto, '__customSkinsResponsePatched', {
                        value: true, configurable: true
                    });
                } catch (_) {}
            }

            var nativeOpen = proto.open;
            if (typeof nativeOpen === 'function' && !nativeOpen.__customSkinsWrapped) {
                var wrappedOpen = function (method, url) {
                    try {
                        this.__customSkinsProfile = isProfileResponse(String(url || ''));
                        this.__customSkinsTransformedTextSource = null;
                        this.__customSkinsTransformedText = null;
                        this.__customSkinsTransformedRespSource = null;
                        this.__customSkinsTransformedResp = null;
                    } catch (_) {}
                    return nativeOpen.apply(this, arguments);
                };
                Object.defineProperty(wrappedOpen, '__customSkinsWrapped', { value: true });
                Object.defineProperty(wrappedOpen, '__customSkinsOriginal', { value: nativeOpen });
                proto.open = wrappedOpen;
            }

            var nativeSend = proto.send;
            if (typeof nativeSend === 'function' && !nativeSend.__customSkinsWrapped) {
                var wrappedSend = function () {
                    if (this.__customSkinsProfile && !this.__customSkinsListener) {
                        this.__customSkinsListener = true;
                        this.addEventListener('loadend', function () {
                            try {
                                if (this.responseType === 'json' && this.response) {
                                    try { captureProfiles(this.response); } catch (_) {}
                                    return;
                                }
                                var text = this.responseText;
                                if (typeof text === 'string' && text) {
                                    try { captureProfiles(JSON.parse(text)); } catch (_) {}
                                }
                            } catch (_) {}
                        }, { once: true });
                    }
                    return nativeSend.apply(this, arguments);
                };
                Object.defineProperty(wrappedSend, '__customSkinsWrapped', { value: true });
                Object.defineProperty(wrappedSend, '__customSkinsOriginal', { value: nativeSend });
                proto.send = wrappedSend;
            }

            return true;
        } catch (_) {
            return false;
        }
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
        patchPacketBus();  // idempotente: el bus nace al ENTRAR al server
        if (dbByUuid === null && dbByName === null) return;

        var game = findGame();
        var world = game?.world;
        if (!world || !world.players) return;

        // diagnóstico: muestra identidad de los players del mundo (para
        // verificar por qué un override no matchea)
        try {
            if (window.__MF_SKIN_DEBUG__ && game.player) {
                var lg = game.player;
                console.log('[MF Skins DEBUG] local:', JSON.stringify({
                    username: lg.profile?.username, uuid: lg.profile?.uuid,
                    skin: lg.profile?.cosmetics?.skin
                }));
            }
        } catch (_) {}

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

        // playerList: fuente con UUID (llenada por CPacketPlayerList del
        // socket protobuf). Las entidades de world.players NUNCA traen
        // uuid (CPacketSpawnPlayer no la incluye) — el juego une ambas
        // por id interno. Nosotros unimos ambos lados para que el
        // override por uuid llegue a la entidad correcta:
        //   playerList {id → {uuid, name, skin}} + world.players {id → e}
        try {
            var pl = game.playerList;
            if (pl) {
                var listEntries = pl.entries ? [...pl.entries()] : Object.entries(pl);
                for (var li = 0; li < listEntries.length; li++) {
                    var pk = listEntries[li][0], pv = listEntries[li][1];
                    if (!pv || typeof pv !== 'object') continue;
                    // capturar uuid↔name para lookupEntry (y MF_Facial)
                    if (pv.uuid && (pv.name || pv.username)) {
                        captureProfiles({ uuid: pv.uuid, username: pv.username || pv.name });
                    }
                    // reescribir la skin del REGISTRO de la lista (tab,
                    // nametags que leen playerList, cabeza de jugador…)
                    var plEntry = lookupEntry({ uuid: pv.uuid, username: pv.username || pv.name });
                    if (plEntry && pv.skin !== plEntry.__skin) {
                        pv.skin = plEntry.__skin;
                    }
                    // aplicar a la ENTIDAD del mundo con ese id interno
                    var ent = null;
                    try { ent = world.getPlayerById?.(pk) || world.players?.get?.(pk); } catch (_) {}
                    if (ent) overridePlayer(ent);
                }
            }
        } catch (e) {}
    }

    function overridePlayer(player) {
        if (!player || !player.profile) return;
        var profile = player.profile;
        var cosmetics = profile.cosmetics;
        if (!cosmetics || typeof cosmetics !== 'object') return;

        var entry = lookupEntry(profile);
        if (!entry) return;

        var target = entry.__skin;
        if (cosmetics.skin === target) return;

        try {
            cosmetics.skin = target;
            log('live override', profile.uuid || profile.username, '->', target);
            // recrear el mesh como hace el juego cuando cambia la skin
            if (player.mesh && typeof player.mesh.recreate === 'function') {
                player.mesh.recreate();
            } else if (player.mesh?.bXbFHkqbGNBEv) {
                player.mesh.bXbFHkqbGNBEv();
            }
        } catch (e) {}
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

    // ─── Interceptor del bus de paquetes protobuf (socket) ───────────
    // El juego recibe CPacketPlayerList (uuid+name+skin de TODOS los
    // jugadores del server) y CPacketSpawnPlayer (skin al aparecer en
    // vista, SIN uuid) por WebSocket protobuf. Reescribimos el paquete
    // ANTES de que los handlers del juego lo procesen: así la skin
    // override llega ya en spawn (mesh creado con la skin correcta).
    //
    // Estrategia doble (el bus puede registrarse antes o después de
    // nuestro hook):
    //   a) hookear .on: envuelve los handlers que el juego REGISTRE a
    //      partir de ahora
    //   b) hookear .emit (si existe): reescribe el paquete al llegar,
    //      cubre handlers YA registrados
    // Y como respaldo, el watcher de 500ms (applyLiveOverrides) une
    // playerList(uuid) ↔ world.players(sin uuid) por id interno.
    var packetBusPatched = false;
    function rewritePlayerData(pd, db) {
        if (!pd || typeof pd !== 'object') return;
        // capturar uuid↔name (alimenta lookupEntry + MF_Facial)
        if (pd.uuid && (pd.name || pd.username)) {
            captureProfiles({ uuid: pd.uuid, username: pd.username || pd.name, skin: pd.skin });
        }
        var sk = null;
        if (pd.uuid) sk = db.byUuid[String(pd.uuid).toLowerCase()]?.__skin || null;
        if (!sk) {
            var loose = lookupByNameLoose(pd.name || pd.username);
            if (loose) sk = loose.__skin;
        }
        if (sk) pd.skin = sk;
    }
    function rewritePacket(name, pkt) {
        try {
            var db = window.__MF_CustomSkins_DB__;
            if (!db) return pkt;
            if (name === 'CPacketSpawnPlayer' && pkt && pkt.cosmetics) {
                // spawn: sin uuid → resolver por name (loose) contra la
                // cache remota (uuid→name ya capturado por PlayerList)
                var nm = String(pkt.name || '').toLowerCase();
                var found = null;
                for (var u in db.byUuid) {
                    var ru = remoteProfiles.get(u);
                    if (ru && ru.username && String(ru.username).toLowerCase() === nm) { found = db.byUuid[u]; break; }
                }
                if (!found) {
                    var looseEntry = lookupEntry({ name: nm });
                    if (looseEntry) found = looseEntry.__skin;
                }
                if (found) pkt.cosmetics.skin = found;
            } else if ((name === 'CPacketPlayerList' || name === 'CPacketPlayerListDelta') && pkt && pkt.players) {
                for (var i = 0; i < pkt.players.length; i++) {
                    rewritePlayerData(pkt.players[i], db);
                }
            }
        } catch (_) {}
        return pkt;
    }
    function patchPacketBus() {
        if (packetBusPatched) return true;
        var g = findGame();
        if (!g) return false;
        // buscar el bus: objeto con .on/.emit estilo EventEmitter
        var candidates = [];
        try {
            var seen = new Set();
            var scan = function (obj, depth) {
                if (!obj || typeof obj !== 'object' || depth > 2 || seen.has(obj)) return;
                seen.add(obj);
                for (var k in obj) {
                    try {
                        var v = obj[k];
                        if (v && typeof v === 'object' &&
                            typeof v.on === 'function' && !v.__mfBusHook &&
                            (typeof v.emit === 'function' || typeof v.off === 'function')) {
                            v.__mfBusHook = true; // marcar YA: no duplicar
                            candidates.push(v);
                            scan(v, depth + 1); // buses anidados
                        } else if (v && typeof v === 'object' && depth < 2) {
                            scan(v, depth + 1);
                        }
                    } catch (_) {}
                }
            };
            scan(g, 0);
        } catch (_) {}
        if (!candidates.length) return false;

        for (var ci = 0; ci < candidates.length; ci++) {
            var bus = candidates[ci];
            try {
                // a) .on → envuelve handlers FUTUROS
                var dOn = Object.getOwnPropertyDescriptor(bus, 'on') ||
                          Object.getOwnPropertyDescriptor(Object.getPrototypeOf(bus) || {}, 'on');
                if (dOn && dOn.writable && typeof dOn.value === 'function') {
                    var nativeOn = dOn.value;
                    bus.on = function (name, handler) {
                        if (typeof name === 'string' && typeof handler === 'function' &&
                            /^CPacket(PlayerList|SpawnPlayer|PlayerListDelta)$/.test(name)) {
                            var orig = handler;
                            var wrapped = function (pkt) {
                                return orig.call(this, rewritePacket(name, pkt));
                            };
                            try { wrapped.__mfWrapOf = orig; } catch (_) {}
                            return nativeOn.call(this, name, wrapped);
                        }
                        return nativeOn.call(this, name, handler);
                    };
                    try { bus.on.__mfNative = nativeOn; } catch (_) {}
                }
                // b) .emit → reescribe paquetes ANTES de despacharlos a
                //    handlers YA registrados
                var dEm = Object.getOwnPropertyDescriptor(bus, 'emit') ||
                          Object.getOwnPropertyDescriptor(Object.getPrototypeOf(bus) || {}, 'emit');
                if (dEm && dEm.writable && typeof dEm.value === 'function') {
                    var nativeEmit = dEm.value;
                    bus.emit = function (name, pkt) {
                        if (typeof name === 'string' &&
                            /^CPacket(PlayerList|SpawnPlayer|PlayerListDelta)$/.test(name)) {
                            try { rewritePacket(name, pkt); } catch (_) {}
                        }
                        return nativeEmit.apply(this, arguments);
                    };
                    try { bus.emit.__mfNative = nativeEmit; } catch (_) {}
                }
            } catch (_) {}
        }
        packetBusPatched = true;
        log('bus de paquetes hookeado (' + candidates.length + ' bus)');
        return true;
    }

    function tryPatch() {
        patchFetch();
        patchXHR();
        patchPacketBus();
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

    // ─── DB remota (SkinBot de Discord) ───────────────────────────
    // El bot /skin edita accounts.json en un repo DEDICADO vía API de
    // GitHub. Aquí lo fusionamos en runtime: los overrides remotos
    // ganan al local, sin esperar al updater de la extensión.
    // La URL se puede sobreescribir sin recompilar:
    //   localStorage.setItem('mf:dburl', '<url-raw-del-json>')
    var REMOTE_DB_URL = localStorage.getItem('mf:dburl') ||
        'https://raw.githubusercontent.com/EstebanGrp/mfaccs/main/accounts.json';
    var remoteDbEtag = null;

    function applyRemoteDb(data) {
        if (!data || typeof data !== 'object') return false;
        // los overrides remotos SOBREESCRIBEN al empaquetado (el bot es
        // la fuente de verdad cuando hay conflicto)
        parseDb({ players: data.players || data }, false);
        db = data;
        publishDb();
        // re-cache para esta sesión
        try {
            sessionStorage.setItem(DB_KEY, JSON.stringify({
                players: data.players || data
            }));
        } catch (_) {}
        log('DB remota aplicada (' + Object.keys(data.players || data).length + ' entradas)');
        return true;
    }

    function fetchRemoteDb() {
        fetch(REMOTE_DB_URL + '?t=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) { if (j) applyRemoteDb(j); })
            .catch(function () {});
    }

    // primera carga + refresh periódico (5 min): los cambios del bot en
    // Discord llegan solos a todos los clientes
    fetchRemoteDb();
    setInterval(fetchRemoteDb, 5 * 60 * 1000);

    // Watcher de perfiles en vivo (socket protobuf)
    startLiveWatcher();
})();
