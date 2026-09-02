(function () {
    'use strict';

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

    // ─── Carga de la base de datos de overrides ──────────────────────
    // Formato (raíz del proyecto, accounts.json):
    //   { "players": { "<uuid>": { "skin": "devs/itzesteban", ... } } }
    // Acepta clave por uuid (preferido, inmune a renombres) o username.
    // "skin" puede ser:
    //   - ruta relativa a /skins/ sin extensión ("devs/itzesteban")
    //   - ruta con extensión ("devs/itzesteban.png")
    //   - nombre de skin vanilla de miniblox ("chris") → se reescribe el
    //     campo profile.cosmetics.skin del JSON del servidor tal cual
    var DB_KEY = 'minifeather:custom-skins-db';

    var db = null;            // { uuidOrName: {skin, ...} }
    var dbByUuid = null;      // uuid lowercase → entry
    var dbByName = null;      // username lowercase → entry
    var dbLoading = null;

    function normalizeSkinValue(value) {
        if (typeof value !== 'string') return null;
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
        if (isVanillaSkinId(entry.__skin)) return null; // se reescribe el id, no la URL
        var base = skinsBaseUrl();
        if (!base) return null;
        return base + entry.__skin + '.png';
    }

    function parseDb(data) {
        dbByUuid = {};
        dbByName = {};
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
            parseDb(data);
            db = data || {};
            dbLoading = null;
            var n = Object.keys(dbByUuid).length + Object.keys(dbByName).length;
            log('DB lista (' + n + ' overrides)');
            return db;
        };

        dbLoading = fetch('/accounts.json', { cache: 'no-store' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
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

                var match = value.match(SKIN_PATH_REGEX);
                if (!match) {
                    originalSet.call(this, value);
                    return;
                }

                var skinId = match[1];
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
        if (typeof HTMLImageElement === 'undefined') return false;
        return patchImageSrc();
    }

    if (tryPatch()) {
        log('patches aplicados');
    } else {
        var pollTicks = 0;
        var setupInterval = setInterval(function () {
            pollTicks++;
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
