(function () {
    'use strict';

    const TAG = '[MiniFeather HandSway]';

    const state = {
        enabled: true,
        game: null,
        lastScan: 0,
        vy: 0,
        yawDelta: 0,
        strafe: 0,
        idle: 0,
        breath: 0,
        breathTarget: 0,
        breathY: 0,
        breathTargetY: 0,
        breathNext: 0
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

    const MAX_FALL_ROT = 0.06;
    const MAX_FALL_POS = 0.02;
    const STRAFE_ROT = 0.045;
    const STRAFE_POS = 0.012;
    const YAW_LAG_K = 0.09;
    const IDLE_AMP = 0.012;
    const IDLE_POS = 0.007;
    const IDLE_STEP_MIN = 0.4;
    const IDLE_STEP_MAX = 1.3;
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

        const k = smoothFactor();
        state.vy += ((motion.y || 0) - state.vy) * k;
        state.yawDelta +=
            (wrapAngle((p.yaw || 0) - (p.prevYaw || 0)) - state.yawDelta) * k;

        const yaw = p.yaw || 0;
        const sin = Math.sin(yaw);
        const cos = Math.cos(yaw);
        const latRaw = motion.x * cos - motion.z * sin;
        state.strafe += (latRaw - state.strafe) * k;

        const speed = Math.hypot(motion.x || 0, motion.z || 0);
        const moving = speed > 0.08 || Math.abs(state.vy) > 0.08;
        const idleTarget = moving ? 0 : 1;
        state.idle += (idleTarget - state.idle) * Math.min(1, k * (moving ? 4 : 0.6));
        state.idle = Math.max(0, Math.min(1, state.idle));

        let useDamp = 1;
        try {
            if (p.itemInUse || p.isBlocking?.()) useDamp = 0.3;
        } catch {}

        const t = performance.now() / 1000;
        if (t >= state.breathNext) {
            state.breathNext = t + IDLE_STEP_MIN + Math.random() * (IDLE_STEP_MAX - IDLE_STEP_MIN);
            state.breathTarget = (Math.random() * 2 - 1) * IDLE_AMP;
            state.breathTargetY = (Math.random() * 2 - 1) * IDLE_POS;
        }
        state.breath += (state.breathTarget - state.breath) * Math.min(1, k * 2.5);
        state.breathY += (state.breathTargetY - state.breathY) * Math.min(1, k * 2.5);

        const fallRot = Math.max(-1, Math.min(1, state.vy * 2)) * MAX_FALL_ROT * useDamp;
        const fallPos = Math.max(-1, Math.min(1, state.vy * 2)) * MAX_FALL_POS * useDamp;
        const strafeAmt = Math.max(-1, Math.min(1, state.strafe * 3)) * STRAFE_ROT * useDamp;
        const strafePos = Math.max(-1, Math.min(1, state.strafe * 3)) * STRAFE_POS * useDamp;
        const lagZ =
            Math.max(-0.5, Math.min(0.5, state.yawDelta)) *
            YAW_LAG_K *
            useDamp;
        const idleRotX = state.breath * state.idle * useDamp;
        const idlePosY = state.breathY * state.idle * useDamp;

        const it = lf.item;
        const ra = lf.rightArm;

        it.rotation.x += fallRot + idleRotX;
        it.rotation.z += strafeAmt - lagZ;
        it.position.y += fallPos + idlePosY;
        it.position.x += strafePos * 0.6;

        ra.rotation.x += fallRot * 0.8 + idleRotX;
        ra.rotation.z += strafeAmt * 0.7 - lagZ * 0.5;
        ra.position.y += fallPos * 0.8 + idlePosY;
        ra.position.x += strafePos * 0.5;
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
