(function () {
    'use strict';

    /**
     * VanillaAnimations — Freezes elbow and knee joints rigid for ALL players.
     * Scans the entity map and freezes joints on every biped entity.
     */

    const state = {
        enabled: false,
        game: null,
        trackedJoints: [],   // [{joint, origUpdateMatrixWorld}]
        lastGameScan: 0,
        lastScan: 0,
        rafId: null
    };

    // ── Game discovery ───────────────────────────────────────

    function getGame(force = false) {
        const now = performance.now();
        if (!force && state.game?.player && now - state.lastGameScan < 1000) {
            return state.game;
        }
        state.lastGameScan = now;

        try {
            const react = document.querySelector('#react');
            if (!react) return state.game?.player ? state.game : null;

            for (const root of Object.values(react)) {
                const game = root?.updateQueue?.baseState?.element?.props?.game;
                if (game?.player) return (state.game = game);
            }
        } catch {}
        return state.game?.player ? state.game : null;
    }

    // ── Entity map resolution ────────────────────────────────

    function isMapLike(value) {
        return !!(value && typeof value.get === 'function' && typeof value.values === 'function');
    }

    function looksLikeEntityMap(value) {
        if (!isMapLike(value)) return false;
        let checked = 0, entityLike = 0;
        try {
            for (const entity of value.values()) {
                checked++;
                if (entity && entity.pos && (entity.mesh || entity.id !== undefined)) entityLike++;
                if (checked >= 12) break;
            }
        } catch { return false; }
        return checked > 0 && entityLike > 0;
    }

    function resolveEntityMap(game) {
        const direct = [
            game?.world?.entitiesDump,
            game?.world?.entities,
            game?.world?.entityMap,
            game?.entityManager?.entities
        ];
        for (const candidate of direct) {
            if (looksLikeEntityMap(candidate)) return candidate;
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

            if (looksLikeEntityMap(value)) return value;
            if (current.depth >= 2) continue;

            let keys = [];
            try { keys = Object.keys(value); } catch { continue; }
            for (const key of keys) {
                let child;
                try { child = value[key]; } catch { continue; }
                if (child && typeof child === 'object') {
                    queue.push({ value: child, depth: current.depth + 1 });
                }
            }
        }
        return null;
    }

    // ── Joint extraction ─────────────────────────────────────

    function findJoint(mesh, name) {
        if (!mesh) return null;
        if (mesh[name] && mesh[name].rotation) return mesh[name];

        const queue = [mesh];
        const seen = new WeakSet();
        let visited = 0;

        while (queue.length && visited < 500) {
            const obj = queue.shift();
            if (!obj || typeof obj !== 'object' || seen.has(obj)) continue;
            seen.add(obj);
            visited++;

            if (obj[name] && obj[name].rotation) return obj[name];

            if (Array.isArray(obj.children)) {
                for (const child of obj.children) queue.push(child);
            }
        }
        return null;
    }

    const JOINT_NAMES = ['leftElbowJoint', 'rightElbowJoint', 'leftKneeJoint', 'rightKneeJoint'];

    function extractJoints(mesh) {
        const joints = [];
        for (const name of JOINT_NAMES) {
            const joint = findJoint(mesh, name);
            if (joint) joints.push(joint);
        }
        return joints;
    }

    // ── Freeze / Unfreeze ────────────────────────────────────

    function freezeJoint(joint) {
        if (joint._mfFrozen) return;
        joint._mfFrozen = true;
        joint._mfOrigUpdateMatrixWorld = joint.updateMatrixWorld.bind(joint);
        joint.updateMatrixWorld = function () {
            this.rotation.x = 0;
            this.rotation.y = 0;
            this.rotation.z = 0;
            return this._mfOrigUpdateMatrixWorld.apply(this, arguments);
        };
    }

    function unfreezeJoint(joint) {
        if (!joint._mfFrozen) return;
        joint.updateMatrixWorld = joint._mfOrigUpdateMatrixWorld;
        joint._mfFrozen = false;
        joint._mfOrigUpdateMatrixWorld = undefined;
        joint.rotation.x = 0;
        joint.rotation.y = 0;
        joint.rotation.z = 0;
    }

    function unfreezeAll() {
        for (const joint of state.trackedJoints) {
            unfreezeJoint(joint);
        }
        state.trackedJoints = [];
    }

    // ── Scan all entities ────────────────────────────────────

    function scanEntities() {
        const game = getGame();
        if (!game) return;

        // Use a Set to track already-frozen joints
        const stillValid = new Set();

        const entities = resolveEntityMap(game);
        if (entities) {
            try {
                for (const entity of entities.values()) {
                    if (!entity?.mesh) continue;
                    const joints = extractJoints(entity.mesh);
                    for (const joint of joints) {
                        if (!stillValid.has(joint)) {
                            freezeJoint(joint);
                            stillValid.add(joint);
                            if (!state.trackedJoints.includes(joint)) {
                                state.trackedJoints.push(joint);
                            }
                        }
                    }
                }
            } catch {}
        }

        // Unfreeze joints that are no longer tracked (entity despawned)
        state.trackedJoints = state.trackedJoints.filter(joint => {
            if (stillValid.has(joint)) return true;
            unfreezeJoint(joint);
            return false;
        });
    }

    // ── Render Loop ──────────────────────────────────────────

    function loop() {
        if (!state.enabled) return;

        const now = performance.now();
        if (now - state.lastScan > 500) {
            state.lastScan = now;
            try { scanEntities(); } catch {}
        }

        // Freeze all tracked joints every frame
        for (const joint of state.trackedJoints) {
            if (joint && joint.rotation) {
                joint.rotation.x = 0;
                joint.rotation.y = 0;
                joint.rotation.z = 0;
            }
        }

        state.rafId = requestAnimationFrame(loop);
    }

    // ── Public API ───────────────────────────────────────────

    function setEnabled(enabled) {
        if (enabled === state.enabled) return;

        if (enabled) {
            if (globalThis.VanillaAnimations?.state?.enabled) {
                globalThis.VanillaAnimations.setEnabled(false);
            }
            state.enabled = true;
            state.lastScan = 0;
            getGame(true);
            try { scanEntities(); } catch {}
            state.rafId = requestAnimationFrame(loop);
        } else {
            state.enabled = false;
            if (state.rafId) {
                cancelAnimationFrame(state.rafId);
                state.rafId = null;
            }
            unfreezeAll();
        }

        emitState();
    }

    function emitState() {
        document.dispatchEvent(new CustomEvent('minifeather:vanillaanimations-state', {
            detail: JSON.stringify({ enabled: state.enabled })
        }));
    }

    function applyConfig(detail) {
        try {
            const cfg = typeof detail === 'string' ? JSON.parse(detail) : detail;
            if (cfg.enabled !== undefined) {
                setEnabled(cfg.enabled === true || cfg.enabled === 'true');
            }
        } catch (e) {}
    }

    // ── Event listeners ──────────────────────────────────────

    document.addEventListener('minifeather:vanillaanimations-config', (e) => {
        applyConfig(e.detail);
    });

    // ── Export ───────────────────────────────────────────────

    globalThis.VanillaAnimations = {
        setEnabled,
        get enabled() { return state.enabled; },
        get state() { return state; },
        applyConfig
    };

})();
