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

    log("starting (passive mode)");

    var CUSTOM_SKINS_URL =
        "https://raw.githubusercontent.com/DevOfficial-Client/MiniFeather-Client/main/accounts.json";
    var CUSTOM_SKINS_FALLBACK_URL = null;
    try {
        CUSTOM_SKINS_FALLBACK_URL = chrome.runtime.getURL("assets/accounts.json");
    } catch (e) {}

    var SKIN_PATH_REGEX = /^textures\/entity\/skins\/([^/?#]+)\.png(?:[?#].*)?$/i;

    var customSkinsDb = null;
    var customSkinsLoading = null;
    var skinIdToUsername = {};
    var patched = false;

    function loadCustomSkinDatabase() {
        if (customSkinsDb !== null) return Promise.resolve(customSkinsDb);
        if (customSkinsLoading) return customSkinsLoading;

        log("fetching JSON:", CUSTOM_SKINS_URL);

        customSkinsLoading = fetch(CUSTOM_SKINS_URL, { cache: "no-store" })
            .catch(function (err) {
                // GitHub caído / sin red: fetch rechaza sin respuesta HTTP.
                if (!CUSTOM_SKINS_FALLBACK_URL) throw err;
                warn("network error, trying local fallback:", (err && err.message) || err);
                return null; // marca para usar el local abajo
            })
            .then(function (response) {
                const nonOk = !response || !response.ok;
                if (nonOk && CUSTOM_SKINS_FALLBACK_URL) {
                    warn("remote unavailable, using local copy");
                    return fetch(CUSTOM_SKINS_FALLBACK_URL).then(function (r) {
                        if (!r.ok) throw new Error("local non-OK");
                        return r.json();
                    });
                }
                if (nonOk) throw new Error("non-OK " + (response ? response.status : "network"));
                return response.json();
            })
            .then(function (data) {
                if (!data || typeof data !== "object" || !data.players) {
                    warn("JSON has unexpected shape, using empty DB");
                    customSkinsDb = { players: {} };
                    return customSkinsDb;
                }
                customSkinsDb = data;
                return customSkinsDb;
            })
            .catch(function (e) {
                warn("JSON fetch failed, using empty DB. Reason:", (e && e.message) || e);
                customSkinsDb = { players: {} };
                return customSkinsDb;
            })
            .then(function (v) {
                customSkinsLoading = null;
                return v;
            });

        return customSkinsLoading;
    }

    function getCustomSkinForId(skinId) {
        if (!skinId || typeof skinId !== "string") return null;
        if (!customSkinsDb || !customSkinsDb.players) return null;

        var username = skinIdToUsername[skinId];
        if (username && customSkinsDb.players[username]) {
            return customSkinsDb.players[username];
        }

        if (customSkinsDb.players[skinId]) {
            return customSkinsDb.players[skinId];
        }

        return null;
    }

    function tryCaptureProfile(data) {
        if (!data || typeof data !== "object") return;

        var username = null;
        var skin = null;

        if (typeof data.username === "string") username = data.username;
        else if (typeof data.name === "string") username = data.name;
        if (typeof data.skin === "string") {
            skin = data.skin;
        } else if (data.cosmetics && typeof data.cosmetics.skin === "string") {
            skin = data.cosmetics.skin;
        }

        if (username && skin) {
            if (skinIdToUsername[skin] !== username) {
                skinIdToUsername[skin] = username;
            }
        }
    }

    function patchFetch() {
        if (window.__customSkinsFetchPatched) return true;
        if (typeof window.fetch !== "function") return false;

        var originalFetch = window.fetch;
        window.fetch = function (input, init) {
            var args = arguments;

            var reqUrl = "";
            try {
                reqUrl = typeof input === "string" ? input : (input && input.url ? input.url : "");
            } catch (e) {}

            var promise = originalFetch.apply(this, args);

            if ((reqUrl.indexOf("miniblox.io") !== -1 || reqUrl.indexOf("miniblox.online") !== -1) &&
                (reqUrl.indexOf("auth-api") !== -1 ||
                 reqUrl.indexOf("/api/") !== -1 ||
                 reqUrl.indexOf("profile") !== -1 ||
                 reqUrl.indexOf("player") !== -1 ||
                 reqUrl.indexOf("user") !== -1)) {

                promise.then(function (response) {
                    try {
                        var contentType = response.headers && response.headers.get
                            ? (response.headers.get("content-type") || "")
                            : "";
                        if (contentType.indexOf("application/json") === -1 &&
                            contentType.indexOf("text/plain") === -1) {
                            return;
                        }
                        var clone = response.clone();
                        clone.json().then(function (data) {
                            tryCaptureProfile(data);
                        }).catch(function () {});
                    } catch (e) {}
                }).catch(function () {});
            }

            return promise;
        };
        window.__customSkinsFetchPatched = true;
        return true;
    }

    function patchXHR() {
        if (window.__customSkinsXHRPatched) return true;
        if (typeof window.XMLHttpRequest !== "function") return false;

        var Original = window.XMLHttpRequest;
        var originalOpen = Original.prototype.open;
        var originalSend = Original.prototype.send;

        Original.prototype.open = function (method, url) {
            this.__customSkinsUrl = url;
            return originalOpen.apply(this, arguments);
        };

        Original.prototype.send = function () {
            var self = this;
            this.addEventListener("load", function () {
                try {
                    var ct = self.getResponseHeader && self.getResponseHeader("content-type") || "";
                    if (ct.indexOf("application/json") === -1 &&
                        ct.indexOf("text/plain") === -1) {
                        return;
                    }
                    var data = JSON.parse(self.responseText);
                    tryCaptureProfile(data);
                } catch (e) {}
            });
            return originalSend.apply(this, arguments);
        };

        window.__customSkinsXHRPatched = true;
        return true;
    }

    function patchImageSrc() {
        if (patched) return true;

        var proto = HTMLImageElement.prototype;
        var descriptor = Object.getOwnPropertyDescriptor(proto, "src");
        if (!descriptor || !descriptor.set || !descriptor.get) return false;

        var originalSet = descriptor.set;
        var originalUrls = new WeakMap();

        Object.defineProperty(proto, "src", {
            configurable: true,
            enumerable: descriptor.enumerable,
            get: function () {
                return descriptor.get.call(this);
            },
            set: function (value) {
                if (typeof value !== "string") {
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
                    originalSet.call(this, value);
                    return;
                }

                originalUrls.set(this, value);

                var self = this;
                this.addEventListener(
                    "error",
                    function () {
                        var orig = originalUrls.get(self);
                        if (orig && !self.__customSkinRetried) {
                            self.__customSkinRetried = true;
                            originalSet.call(self, orig);
                        }
                    },
                    { once: true }
                );

                originalSet.call(this, custom.skin);
            },
        });

        patched = true;
        return true;
    }

    function tryPatch() {
        patchFetch();
        patchXHR();
        if (typeof HTMLImageElement === "undefined") return false;
        return patchImageSrc();
    }

    if (tryPatch()) {
        log("all patches applied at startup");
    } else {
        var pollTicks = 0;
        var setupInterval = setInterval(function () {
            pollTicks++;
            if (tryPatch()) {
                clearInterval(setupInterval);
            }
        }, 250);
    }

    loadCustomSkinDatabase();
})();
