(function () {
'use strict';

const EVENT_CONFIG = 'minifeather:no-weather-config';

const state = {
    enabled: false,
    game: null,
    world: null,
    weather: null,
    patch: null,
    timer: 0,
    lastScan: 0
};

function getGame(force = false) {
    const now = performance.now();

    if (globalThis.miniblox?.player && globalThis.miniblox?.world) {
        return globalThis.miniblox;
    }

    if (!force && state.game?.player && state.game?.world && now - state.lastScan < 900) {
        return state.game;
    }

    state.lastScan = now;

    try {
        const react = document.querySelector('#react');
        if (!react) return state.game?.player && state.game?.world ? state.game : null;

        for (const root of Object.values(react)) {
            const game = root?.updateQueue?.baseState?.element?.props?.game;
            if (game?.player && game?.world) return game;
        }
    } catch {}

    return state.game?.player && state.game?.world ? state.game : null;
}

function getWeather(game) {
    return game?.gameScene?.weather || game?.player?.game?.gameScene?.weather || null;
}

function saveMethod(target, key) {
    return {
        target,
        key,
        own: Object.prototype.hasOwnProperty.call(target, key),
        value: target[key],
        patched: null
    };
}

function restoreMethod(record) {
    if (!record?.target) return;
    try {
        if (record.target[record.key] !== record.patched) return;
        if (record.own) record.target[record.key] = record.value;
        else delete record.target[record.key];
    } catch {}
}

function suppressVisuals(weather) {
    if (!weather) return;

    try {
        if (weather.rain?.mesh) weather.rain.mesh.visible = false;
    } catch {}

    try {
        if (weather.snow?.mesh) weather.snow.mesh.visible = false;
    } catch {}

    try {
        if (Array.isArray(weather.bolts)) {
            for (const bolt of weather.bolts) {
                try {
                    bolt?.removeFromParent?.();
                } catch {}
                try {
                    if (bolt) bolt.visible = false;
                } catch {}
            }
            weather.bolts.length = 0;
        }
    } catch {}
}

function restorePatch() {
    const patch = state.patch;
    state.patch = null;

    if (!patch) return;

    for (const record of patch.methods) {
        restoreMethod(record);
    }

    try {
        if (patch.weather?.rain?.mesh && patch.rainVisible !== undefined) {
            patch.weather.rain.mesh.visible = patch.rainVisible;
        }
    } catch {}

    try {
        if (patch.weather?.snow?.mesh && patch.snowVisible !== undefined) {
            patch.weather.snow.mesh.visible = patch.snowVisible;
        }
    } catch {}
}

function patchMethod(record, fn) {
    try {
        record.patched = fn;
        record.target[record.key] = fn;
        return record.target[record.key] === fn;
    } catch {
        return false;
    }
}

function applyPatch(game, world, weather) {
    if (!game || !world || !weather) return false;

    if (
        state.patch &&
        state.patch.game === game &&
        state.patch.world === world &&
        state.patch.weather === weather
    ) {
        suppressVisuals(weather);
        return true;
    }

    restorePatch();

    const records = [
        saveMethod(world, 'getRainStrength'),
        saveMethod(world, 'getThunderStrength'),
        saveMethod(world, 'isRaining'),
        saveMethod(world, 'isThundering'),
        saveMethod(weather, 'update'),
        saveMethod(weather, 'addBolt')
    ];

    const patch = {
        game,
        world,
        weather,
        methods: records,
        rainVisible: weather.rain?.mesh?.visible,
        snowVisible: weather.snow?.mesh?.visible
    };

    const rainStrength = records[0];
    const thunderStrength = records[1];
    const isRaining = records[2];
    const isThundering = records[3];
    const update = records[4];
    const addBolt = records[5];

    patchMethod(rainStrength, function () {
        return 0;
    });

    patchMethod(thunderStrength, function () {
        return 0;
    });

    patchMethod(isRaining, function () {
        return false;
    });

    patchMethod(isThundering, function () {
        return false;
    });

    patchMethod(addBolt, function () {});

    patchMethod(update, function (...args) {
        let result;
        try {
            result = update.value.apply(this, args);
        } catch {}
        if (state.enabled) suppressVisuals(this);
        return result;
    });

    state.patch = patch;

    try {
        weather.clear?.();
    } catch {}

    suppressVisuals(weather);
    return true;
}

function refresh(force = false) {
    if (!state.enabled) return;

    const game = getGame(force);
    const world = game?.world || null;
    const weather = getWeather(game);

    if (!game || !world || !weather) {
        if (state.patch) restorePatch();
        state.game = game || null;
        state.world = world;
        state.weather = weather;
        return;
    }

    state.game = game;
    state.world = world;
    state.weather = weather;
    applyPatch(game, world, weather);
}

function start() {
    if (state.timer) return;
    state.timer = window.setInterval(() => {
        refresh(false);
    }, 350);
}

function stop() {
    if (state.timer) {
        clearInterval(state.timer);
        state.timer = 0;
    }
    restorePatch();
    state.game = null;
    state.world = null;
    state.weather = null;
}

function setEnabled(value) {
    const enabled = !!value;
    if (state.enabled === enabled) {
        if (enabled) refresh(true);
        return;
    }

    state.enabled = enabled;

    if (enabled) {
        refresh(true);
        start();
    } else {
        stop();
    }
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

window.addEventListener('beforeunload', () => {
    stop();
}, { once: true });

globalThis.MiniFeatherNoWeather = {
    setEnabled,
    refresh() {
        refresh(true);
    },
    get enabled() {
        return state.enabled;
    }
};
})();
