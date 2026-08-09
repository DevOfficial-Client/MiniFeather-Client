(function () {
    'use strict';

    const EVENT_CONFIG = 'minifeather:healthnametags-config';

    const state = {
        enabled: false,
        game: null,
        entityMap: null,
        patched: new Map(),
        lastGameScan: 0,
        lastEntityScan: 0
    };

    function sameId(a, b) {
        if (a === undefined || a === null || b === undefined || b === null) return false;
        return String(a) === String(b);
    }

    function getGame(force = false) {
        const now = performance.now();
        if (!force && state.game?.player && now - state.lastGameScan < 900) return state.game;
        state.lastGameScan = now;
        try {
            const react = document.querySelector('#react');
            if (!react) return state.game?.player ? state.game : null;
            for (const root of Object.values(react)) {
                const game = root?.updateQueue?.baseState?.element?.props?.game;
                if (!game?.player) continue;
                if (state.game !== game) {
                    restoreAll();
                    state.game = game;
                    state.entityMap = null;
                }
                return game;
            }
        } catch {}
        return state.game?.player ? state.game : null;
    }

    function isMapLike(value) {
        return !!(value && typeof value.get === 'function' && typeof value.values === 'function');
    }

    function looksLikeEntityMap(value) {
        if (!isMapLike(value)) return false;
        let checked = 0;
        let found = 0;
        try {
            for (const entity of value.values()) {
                checked++;
                if (entity && entity.pos && (entity.mesh || entity.id !== undefined)) found++;
                if (checked >= 12) break;
            }
        } catch {
            return false;
        }
        return checked > 0 && found > 0;
    }

    function resolveEntityMap(game) {
        if (state.entityMap && isMapLike(state.entityMap)) return state.entityMap;
        const direct = [
            game?.world?.entitiesDump,
            game?.world?.entities,
            game?.world?.entityMap,
            game?.entityManager?.entities
        ];
        for (const candidate of direct) {
            if (!looksLikeEntityMap(candidate)) continue;
            state.entityMap = candidate;
            return candidate;
        }
        const world = game?.world;
        if (!world) return null;
        const queue = [{ value: world, depth: 0 }];
        const seen = new WeakSet();
        let visited = 0;
        while (queue.length && visited < 360) {
            const current = queue.shift();
            const value = current.value;
            if (!value || typeof value !== 'object' || seen.has(value)) continue;
            seen.add(value);
            visited++;
            if (looksLikeEntityMap(value)) {
                state.entityMap = value;
                return value;
            }
            if (current.depth >= 2) continue;
            let keys = [];
            try {
                keys = Object.keys(value);
            } catch {
                continue;
            }
            for (const key of keys) {
                let child;
                try {
                    child = value[key];
                } catch {
                    continue;
                }
                if (child && typeof child === 'object') queue.push({ value: child, depth: current.depth + 1 });
            }
        }
        return null;
    }

    function isPlayerEntity(entity) {
        const mesh = entity?.mesh;
        if (!mesh || typeof mesh !== 'object') return false;
        if (typeof entity?.profile?.username !== 'string') return false;
        if (!('nameTagText' in mesh)) return false;
        return true;
    }

    function getHealthFrom(source) {
        if (!source) return null;
        try {
            if (typeof source.getHealth === 'function') {
                const value = Number(source.getHealth());
                if (Number.isFinite(value)) return value;
            }
        } catch {}
        const values = [source.health, source.currentHealth, source.hp];
        for (const value of values) {
            const number = Number(value);
            if (Number.isFinite(number)) return number;
        }
        return null;
    }

    function getHealth(entity) {
        const direct = getHealthFrom(entity);
        if (direct !== null) return direct;
        const local = state.game?.player;
        if (sameId(entity?.id, local?.id)) return getHealthFrom(local);
        return null;
    }

    function formatHealth(value) {
        const health = Number(value);
        if (!Number.isFinite(health)) return '';
        if (Math.abs(health - Math.round(health)) < 0.05) return String(Math.round(health));
        return health.toFixed(1);
    }

    function findNativeNameTagRenderMethod(mesh) {
        const preferred = ['ABPXLcQiyzFdP'];
        for (const key of preferred) {
            if (typeof mesh?.[key] === 'function') return key;
        }
        let proto = mesh;
        const seen = new Set();
        for (let depth = 0; proto && depth < 7; depth++) {
            let names = [];
            try {
                names = Object.getOwnPropertyNames(proto);
            } catch {}
            for (const key of names) {
                if (key === 'constructor' || seen.has(key)) continue;
                seen.add(key);
                let fn;
                try {
                    fn = mesh[key];
                } catch {
                    continue;
                }
                if (typeof fn !== 'function') continue;
                let source = '';
                try {
                    source = Function.prototype.toString.call(fn);
                } catch {}
                if (!source) continue;
                if (
                    source.includes('nameTagText') &&
                    source.includes('nameTagColor') &&
                    source.includes('nameTagOpacity') &&
                    (source.includes('.submit(') || source.includes('DskCNsFNrprfkz'))
                ) {
                    return key;
                }
            }
            proto = Object.getPrototypeOf(proto);
        }
        return null;
    }

    function patchEntity(entity) {
        const mesh = entity?.mesh;
        if (!mesh) return null;
        const existing = state.patched.get(entity);
        if (existing && existing.mesh === mesh && mesh[existing.method] === existing.wrapper) return existing;
        if (existing) unpatchEntity(entity, existing);
        const method = findNativeNameTagRenderMethod(mesh);
        if (!method) return null;
        const original = mesh[method];
        if (typeof original !== 'function') return null;
        const hadOwn = Object.prototype.hasOwnProperty.call(mesh, method);
        const ownValue = hadOwn ? mesh[method] : undefined;
        const record = {
            entity,
            mesh,
            method,
            original,
            hadOwn,
            ownValue,
            wrapper: null
        };
        record.wrapper = function (...args) {
            if (!state.enabled) return original.apply(this, args);
            const health = getHealth(entity);
            const text = this.nameTagText;
            if (health === null || typeof text !== 'string' || !text.length) return original.apply(this, args);
            this.nameTagText = `${text} ❤ ${formatHealth(health)}`;
            try {
                return original.apply(this, args);
            } finally {
                this.nameTagText = text;
            }
        };
        try {
            mesh[method] = record.wrapper;
        } catch {
            return null;
        }
        state.patched.set(entity, record);
        return record;
    }

    function unpatchEntity(entity, record) {
        if (!record) return;
        try {
            if (record.mesh?.[record.method] === record.wrapper) {
                if (record.hadOwn) record.mesh[record.method] = record.ownValue;
                else delete record.mesh[record.method];
            }
        } catch {
            try {
                record.mesh[record.method] = record.original;
            } catch {}
        }
        state.patched.delete(entity);
    }

    function restoreAll() {
        for (const [entity, record] of Array.from(state.patched.entries())) unpatchEntity(entity, record);
    }

    function refreshPlayers(force = false) {
        if (!state.enabled) return;
        const now = performance.now();
        if (!force && now - state.lastEntityScan < 450) return;
        state.lastEntityScan = now;
        const game = getGame(force);
        if (!game?.player) return;
        const entities = resolveEntityMap(game);
        if (!entities) return;
        const live = new Set();
        try {
            for (const entity of entities.values()) {
                if (!isPlayerEntity(entity)) continue;
                live.add(entity);
                patchEntity(entity);
            }
        } catch {}
        for (const [entity, record] of Array.from(state.patched.entries())) {
            if (!live.has(entity) || entity?.mesh !== record.mesh) unpatchEntity(entity, record);
        }
    }

    function setEnabled(value) {
        state.enabled = !!value;
        if (state.enabled) refreshPlayers(true);
        else restoreAll();
    }

    function applyConfig(detail) {
        let config = detail;
        if (typeof config === 'string') {
            try {
                config = JSON.parse(config);
            } catch {
                return;
            }
        }
        if (!config || typeof config !== 'object') return;
        if ('enabled' in config) setEnabled(config.enabled);
    }

    document.addEventListener(EVENT_CONFIG, event => {
        applyConfig(event.detail);
    }, true);

    function loop() {
        if (state.enabled) refreshPlayers(false);
        requestAnimationFrame(loop);
    }

    globalThis.MiniFeatherHealthNameTags = {
        setEnabled,
        refresh() {
            refreshPlayers(true);
        },
        get enabled() {
            return state.enabled;
        },
        get patchedPlayers() {
            return state.patched.size;
        }
    };

    requestAnimationFrame(loop);
})();
