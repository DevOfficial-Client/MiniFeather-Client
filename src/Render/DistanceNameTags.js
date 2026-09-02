(function () {
    'use strict';

    const EVENT_CONFIG = 'minifeather:distancenametags-config';
    const core = globalThis.MiniFeatherNativeNameTagsCore;
    if (!core) return;

    const state = {
        enabled: false
    };

    function getPos(source) {
        const pos = source?.pos || source?.position || source?.mesh?.position;
        if (!pos) return null;
        const x = Number(pos.x);
        const y = Number(pos.y);
        const z = Number(pos.z);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
        return { x, y, z };
    }

    function getDistance(entity, game) {
        const local = getPos(game?.player);
        const remote = getPos(entity);
        if (!local || !remote) return null;
        const dx = remote.x - local.x;
        const dy = remote.y - local.y;
        const dz = remote.z - local.z;
        const distance = Math.hypot(dx, dy, dz);
        return Number.isFinite(distance) ? distance : null;
    }

    function formatDistance(value) {
        const distance = Math.max(0, Number(value));
        if (!Number.isFinite(distance)) return '';
        return distance.toFixed(1);
    }

    core.registerDecorator('distance', (entity, text, game) => {
        const distance = getDistance(entity, game);
        if (distance === null) return text;
        const value = `${formatDistance(distance)}m`;
        const health = text.match(/\s\(❤([^)]*)\)$/);
        if (health) return `${text.slice(0, health.index)} (❤${health[1]} | ${value})`;
        return `${text} (${value})`;
    });

    function setEnabled(value) {
        state.enabled = !!value;
        core.setDecoratorEnabled('distance', state.enabled);
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
        if (state.enabled) core.refresh();
    }

    document.addEventListener(EVENT_CONFIG, event => {
        applyConfig(event.detail);
    }, true);

    globalThis.MiniFeatherDistanceNameTags = {
        setEnabled,
        refresh() {
            core.refresh();
        },
        get enabled() {
            return state.enabled;
        }
    };
})();
