// ==UserScript==
// @name         skins
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  only code at 3am
// @author       EstebanExG_
// @match        https://miniblox.io/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    var TAG = "[custom-skins]";
    var VERBOSE = true;

    function log() {
        if (!VERBOSE) return;
        var args = [TAG].concat(Array.prototype.slice.call(arguments));
        console.log.apply(console, args);
    }

    function warn() {
        var args = [TAG].concat(Array.prototype.slice.call(arguments));
        console.warn.apply(console, args);
    }

    function err() {
        var args = [TAG].concat(Array.prototype.slice.call(arguments));
        console.error.apply(console, args);
    }

    log("starting v1.4 (Plan E: fetch + Image.src with username mapping)");

    var CUSTOM_SKINS_URL =
        "https://raw.githubusercontent.com/DevOfficial-Client/MiniFeather-Client/main/accounts.json";

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
            .then(function (response) {
                log("HTTP status:", response.status, response.statusText);
                if (!response.ok) {
                    warn("JSON fetch non-OK, using empty DB");
                    customSkinsDb = { players: {} };
                    return customSkinsDb;
                }
                return response.json();
            })
            .then(function (data) {
                if (!data || typeof data !== "object" || !data.players) {
                    warn("JSON has unexpected shape, using empty DB");
                    customSkinsDb = { players: {} };
                    return customSkinsDb;
                }
                customSkinsDb = data;
                var count = 0;
                for (var k in data.players) {
                    if (Object.prototype.hasOwnProperty.call(data.players, k)) count++;
                }
                log("JSON loaded, players in DB:", count);
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
                log(
                    "profile captured: skinId",
                    JSON.stringify(skin),
                    "-> username",
                    JSON.stringify(username)
                );
            }
        }
    }

    function patchFetch() {
        if (window.__customSkinsFetchPatched) return true;
        if (typeof window.fetch !== "function") return false;

        var originalFetch = window.fetch;
        window.fetch = function (input, init) {
            var args = arguments;
            var promise = originalFetch.apply(this, args);

            promise.then(function (response) {
                try {
                    var url = "";
                    try {
                        url = (response.url) || (input && input.url) || (typeof input === "string" ? input : "");
                    } catch (e) {}
                    var contentType = response.headers && response.headers.get
                        ? (response.headers.get("content-type") || "")
                        : "";
                    if (contentType.indexOf("application/json") === -1 &&
                        contentType.indexOf("text/plain") === -1) {
                        return;
                    }
                    log("fetch JSON response:", url);
                    var clone = response.clone();
                    clone.json().then(function (data) {
                        log("fetch JSON parsed, keys:", Object.keys(data || {}).slice(0, 8).join(","));
                        tryCaptureProfile(data);
                    }).catch(function (e) {
                        warn("fetch JSON parse failed:", (e && e.message) || e);
                    });
                } catch (e) {}
            }).catch(function () {});

            return promise;
        };
        window.__customSkinsFetchPatched = true;
        log("fetch patched OK (profile capture)");
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
        log("XHR patched OK (profile capture)");
        return true;
    }
    function patchImageSrc() {
        if (patched) return true;

        var proto = HTMLImageElement.prototype;
        var descriptor = Object.getOwnPropertyDescriptor(proto, "src");
        if (!descriptor || !descriptor.set || !descriptor.get) {
            err("HTMLImageElement.src descriptor not found");
            return false;
        }

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

                var username = skinIdToUsername[skinId];
                log(
                    "redirecting skin for",
                    JSON.stringify(skinId),
                    username ? "(username " + JSON.stringify(username) + ")" : "(no username mapping)",
                    "->",
                    custom.skin
                );

                originalUrls.set(this, value);

                var self = this;
                this.addEventListener(
                    "error",
                    function () {
                        var orig = originalUrls.get(self);
                        if (orig && !self.__customSkinRetried) {
                            self.__customSkinRetried = true;
                            warn(
                                "custom skin failed for",
                                JSON.stringify(skinId),
                                "falling back to vanilla"
                            );
                            originalSet.call(self, orig);
                        }
                    },
                    { once: true }
                );

                originalSet.call(this, custom.skin);
            },
        });

        patched = true;
        log("HTMLImageElement.src patched OK");
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
                log("patches applied on tick", pollTicks);
            } else if (pollTicks % 20 === 0) {
                log("waiting for HTMLImageElement... tick", pollTicks);
            }
        }, 250);
    }

    loadCustomSkinDatabase();
})();
