(function () {
    'use strict';

    const TAG = '[MiniFeather HandSway]';

    const state = {
        enabled: true,
        game: null,
        lastScan: 0,
        vy: 0,
        yawDelta: 0,
        lean: 0
    };

    try {
        state.enabled =
            localStorage.getItem('miniblox_handsway') !== 'false';
    } catch {}

    window.MF_HandSway = {
        get enabled() { return state.enabled; },
        set enabled(v) {
            state.enabled = !!v;
            try {
                localStorage.setItem(
                    'miniblox_handsway',
                    String(state.enabled)
                );
            } catch {}
        }
    };

    function getGame(force = false) {
        if (globalThis.miniblox?.player) {
            return (state.game = globalThis.miniblox);
        }
        const now = performance.now();
        if (!force && state.game?.player && now - state.lastScan < 900) {
            return state.game;
        }
        state.lastScan = now;
        try {
            const react = document.querySelector('#react');
            if (!react) return state.game?.player ? state.game : null;
            for (const root of Object.values(react)) {
                const game =
                    root?.updateQueue?.baseState?.element?.props?.game;
                if (game?.player) return (state.game = game);
            }
        } catch {}
        return state.game?.player ? state.game : null;
    }

    function findHandRenderer(game) {
        try {
            const cam = game?.gameScene?.axesHelper?.parent;
            if (!cam?.children) return null;
            for (const child of cam.children) {
                if (
                    typeof child?.updateArmAnimation === 'function' &&
                    child.item &&
                    child.rightArm
                ) {
                    return child;
                }
            }
        } catch {}
        return null;
    }

    const WALK_FREQ = 0.8;
    const MAX_WALK_ROT = 0.16;
    const MAX_WALK_ROLL = 0.05;
    const WALK_POS = 0.02;
    const LEAN_ROT = 0.10;
    const JUMP_K = 0.045;
    const YAW_LAG_K = 0.18;
    const TAU = 0.09;
    const lastFrame = { t: 0 };
    function smoothFactor() {
        const t = performance.now();
        const dt = lastFrame.t ? Math.min(0.25, (t - lastFrame.t) / 1000) : 0.016;
        lastFrame.t = t;
        return 1 - Math.exp(-dt / TAU);
    }

    function wrapAngle(a) {
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        return a;
    }

    function applySway(lf, player) {
        const p = player;
        const motion = p.motion;
        if (!motion) return;

        let pt = 0.5;
        try {
            if (typeof p.getPartialTicks === 'function') {
                pt = p.getPartialTicks() || 0;
            }
        } catch {}

        const amountNow = Math.min(1.5, p.limbSwingAmount || 0);
        const amountPrev = Math.min(1.5, p.prevLimbSwingAmount ?? amountNow);
        const amount = amountPrev + (amountNow - amountPrev) * pt;

        const phase =
            (p.limbSwing || 0) - (p.limbSwingAmount || 0) * (1 - pt);

        const speed = Math.hypot(motion.x || 0, motion.z || 0);

        const k = smoothFactor();
        state.vy += ((motion.y || 0) - state.vy) * k;
        state.yawDelta +=
            (wrapAngle((p.yaw || 0) - (p.prevYaw || 0)) - state.yawDelta) * k;
        state.lean += (Math.min(1, speed / 0.35) - state.lean) * k;

        let useDamp = 1;
        try {
            if (p.itemInUse || p.isBlocking?.()) useDamp = 0.3;
        } catch {}

        const walkX =
            Math.cos(phase * WALK_FREQ) * amount * MAX_WALK_ROT * useDamp;
        const walkZ =
            Math.sin(phase * WALK_FREQ * 0.5) *
            amount *
            MAX_WALK_ROLL *
            useDamp;
        const bobY =
            -Math.abs(Math.sin(phase * WALK_FREQ)) *
            amount *
            WALK_POS *
            useDamp;
        const dipX =
            Math.max(-1, Math.min(1, state.vy * 3)) * JUMP_K * useDamp;
        const lagZ =
            Math.max(-0.5, Math.min(0.5, state.yawDelta)) *
            YAW_LAG_K *
            useDamp;
        const leanX = state.lean * LEAN_ROT * useDamp;

        const it = lf.item;
        const ra = lf.rightArm;

        it.rotation.x += walkX + dipX - leanX;
        it.rotation.z += walkZ - lagZ;
        it.position.y += bobY;

        ra.rotation.x += walkX * 0.6 + dipX * 0.8 - leanX * 0.5;
        ra.rotation.z -= walkZ * 0.5 + lagZ * 0.4;
        ra.position.y -= bobY * 0.6;
    }

    function hookHandRenderer(lf) {
        if (lf.updateArmAnimation.__mfHandSwayPatched) return true;

        if (typeof lf.__mfHandSwayOrig === 'function') {
            lf.updateArmAnimation = lf.__mfHandSwayOrig;
        }

        const original = lf.updateArmAnimation;
        if (typeof original !== 'function') return false;

        const patched = function (...args) {
            original.apply(this, args);
            if (!state.enabled) return;
            try {
                const player = getGame()?.player;
                if (player) applySway(this, player);
            } catch {}
        };
        patched.__mfHandSwayPatched = true;
        lf.__mfHandSwayOrig = original;
        lf.updateArmAnimation = patched;

        console.log(`${TAG} Hooked first-person hand renderer.`);
        return true;
    }

    const interval = setInterval(() => {
        const game = getGame(true);
        if (!game?.gameScene) return;
        const lf = findHandRenderer(game);
        if (!lf) return;
        if (hookHandRenderer(lf)) {
            clearInterval(interval);
            console.log(
                `${TAG} Loaded. Toggle: window.MF_HandSway.enabled`
            );
        }
    }, 600);
})();
