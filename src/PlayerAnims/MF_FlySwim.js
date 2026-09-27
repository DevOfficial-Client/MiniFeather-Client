(function () {
    'use strict';

    const PI = Math.PI;
    const torad = (d) => d * PI / 180;
    const swimmers = new WeakMap();

    function getState(mesh) {
        let s = swimmers.get(mesh);
        if (!s) {
            s = {
                swim: 0, fly: 0, lev: 0,
                levTimer: 0, levSide: 1, levFB: 0, levLR: 0,
                levOnGroundOld: true,
                water: 0
            };
            swimmers.set(mesh, s);
        }
        return s;
    }
    function quadraticArmUpdate(f) {
        return -65.0 * f + f * f;
    }

    const QUAD14 = quadraticArmUpdate(14.0);
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

    /**
     * Avanza las intensidades hacia el objetivo con suavizado exponencial
     * independiente del framerate (dt en segundos). Objetivos ∈ {0,1}:
     *   swim — pose de nado (swimAmount MC)
     *   fly  — pose de vuelo elytra (fallFlyingScale MC)
     *   lev  — pose de levitate/vuelo creativo (LevitateIntensity DAR:
     *          converge /4·frame_time, ~0.25/tick)
     */
    function animate(mesh, dt, swimTarget, flyTarget, levTarget) {
        const s = getState(mesh);
        s.t = (s.t || 0) + dt;
        const dts = Math.max(0.001, Math.min(0.1, dt));
        const k = 1 - Math.pow(0.85, dts * 20);
        s.swim += (clamp(swimTarget, 0, 1) - s.swim) * k;
        s.fly += (clamp(flyTarget, 0, 1) - s.fly) * k;
        const ft = dts * 60;
        s.lev += (clamp(levTarget || 0, 0, 1) - s.lev) * clamp(0.25 * ft, 0, 0.9);
        s.levTimer += ft * 0.05;
        const side0 = s.levSide === 0 ? 1 : s.levSide;
        const onG = !!st_onGround;
        s.levSide = side0 * (onG ? -1 : 1);
        s.levFB = (st_moveF || 0) * (st_limbSpeed || 0) * s.lev;
        s.levLR = (st_moveS || 0) * (st_limbSpeed || 0) * -s.lev;
        if (!st_swimming) {
            const wTarget = st_inWater ? 1 : 0;
            s.water += (wTarget - s.water) * clamp((1 / 14) * ft, 0, 0.9);
        } else {
            s.water = 0;
        }
        return s;
    }
    let st_onGround = true, st_moveF = 0, st_moveS = 0, st_limbSpeed = 0;
    let st_inWater = false, st_swimming = false;
    function setFrameState(st) {
        st_onGround = !!(st && st.onGround);
        st_moveF = (st && st.moveForward) || 0;
        st_moveS = (st && st.moveStrafe) || 0;
        st_limbSpeed = (st && st.limbSpeed) || 0;
        st_inWater = !!(st && st.inWater);
        st_swimming = !!(st && st.swimming);
    }

    /**
     * Construye la pose de nado/elytra/levitate (misma forma que
     * EMFRuntime.buildPose). st: estado de EMFRuntime.buildFrameState.
     * Devuelve { poses, weight } o null si todas las intensidades ≈ 0.
     *
     * Ejes: salida en espacio MC (igual que buildPose del pack), el
     * orquestador adapta a Miniblox (negación de head, twist del body).
     */
    function buildPose(s, st) {
        const swim = s.swim, fly = s.fly, lev = s.lev, water = s.water || 0;
        const anySwim = swim > 0.005, anyFly = fly > 0.005, anyLev = lev > 0.005;
        const anyWater = water > 0.01 && !anySwim && !anyFly && !anyLev;
        if (!anySwim && !anyFly && !anyLev && !anyWater) return null;

        const poses = Object.create(null);
        const pitchDeg = st.headPitchDeg || 0;
        const pitchRad = pitchDeg * PI / 180;
        if (anySwim) {
            const target = st.inWater ? (-90 - pitchDeg) : -90;
            const bodyPitch = lerp(0, target, swim);
            const f1 = (st.limbSwing || 0) * 2;
            const f7 = ((f1 % 26) + 26) % 26;
            const l = { x: 0, y: 0, z: 0 }, r = { x: 0, y: 0, z: 0 };
            if (f7 < 14.0) {
                l.z = PI + 1.8707964 * quadraticArmUpdate(f7) / QUAD14;
                r.z = PI - 1.8707964 * quadraticArmUpdate(f7) / QUAD14;
            } else if (f7 < 22.0) {
                const f8 = (f7 - 14.0) / 8.0;
                l.x = (PI / 2) * f8; r.x = (PI / 2) * f8;
                l.z = 5.012389 - 1.8707964 * f8;
                r.z = 1.2707963 + 1.8707964 * f8;
            } else {
                const f5 = (f7 - 22.0) / 4.0;
                l.x = (PI / 2) - (PI / 2) * f5; r.x = (PI / 2) - (PI / 2) * f5;
                l.z = PI; r.z = PI;
            }
            l.y = r.y = PI;
            const legL = 0.3 * Math.cos(f1 * 0.33333334 + PI);
            const legR = 0.3 * Math.cos(f1 * 0.33333334);

            poses.head = { rx: lerp(pitchRad, -PI / 4, swim) - pitchRad };
            poses.body = { rx: torad(bodyPitch) };
            poses.left_arm = { rx: lerp(0, l.x, swim), ry: lerp(0, l.y, swim), rz: lerp(0, l.z, swim) };
            poses.right_arm = { rx: lerp(0, r.x, swim), ry: lerp(0, r.y, swim), rz: lerp(0, r.z, swim) };
            poses.left_leg = { rx: lerp(0, legL, swim) };
            poses.right_leg = { rx: lerp(0, legR, swim) };
            return { poses, weight: { swim, fly: 0, lev: 0 } };
        }
        if (anyFly) {
            const flyArmX = -PI * 0.9, flyArmZ = 0.1;
            poses.head = { rx: lerp(0, -PI / 4 - pitchRad, fly) };
            poses.left_arm = { rx: lerp(0, flyArmX, fly), rz: lerp(0, -flyArmZ, fly) };
            poses.right_arm = { rx: lerp(0, flyArmX, fly), rz: lerp(0, flyArmZ, fly) };
            poses.left_leg = { rx: 0 };
            poses.right_leg = { rx: 0 };
            return { poses, weight: { swim: 0, fly, lev: 0 } };
        }
        if (anyWater) {
            poses.left_arm = { rz: water * torad(-60) };
            poses.right_arm = { rz: water * torad(60) };
            return { poses, weight: { swim: 0, fly: 0, lev: 0, water } };
        }
        const I = lev;
        const T = s.levTimer;
        const side = s.levSide;
        const FB = s.levFB;
        const LR = s.levLR;
        const fbDamp = (1 - Math.abs(FB) / 1.5);
        const rl_rx = Math.sin(T - side) * I * 0.05 + I * 0.1 + FB * 0.3;
        const ll_rx = Math.sin(T + side) * I * 0.05 + I * 0.1 + FB * 0.3;
        const rl_ty = clamp(side * I * 3 + Math.sin(T - side - 1) * I * 0.5, -5, 0) * fbDamp;
        const ll_ty = clamp(side * -I * 3 + Math.sin(T + side - 1) * I * 0.5, -5, 0) * fbDamp;
        const rl_tz = clamp(side * I * 2.5, -3, 0) * fbDamp;
        const ll_tz = clamp(side * -I * 2.5, -3, 0) * fbDamp;
        const body_rx = Math.sin(T - 0.3) * I * 0.05 - I * 0.1 * fbDamp + FB * 0.2;
        const body_ry = side * 0.1 * I;
        const body_tz = Math.sin(T - 0.3) * I * -0.5 + I * 1 * fbDamp - FB * 2;
        const la_rx = Math.sin(T + 0.3) * I * 0.1 + FB * 0.2;
        const ra_rx = Math.sin(T + 0.6) * I * 0.1 + FB * 0.2;
        const la_rz = Math.sin(T - 0.3) * I * 0.05 + I * -0.2 + LR * 0.3;
        const ra_rz = Math.sin(T - 0.6) * I * -0.05 + I * 0.2 + LR * 0.3;
        const la_ry = I * -0.2;
        const ra_ry = I * 0.2;

        poses.head = {};
        poses.body = { rx: body_rx, ry: body_ry, tz: body_tz };
        poses.left_arm = { rx: la_rx, ry: la_ry, rz: la_rz };
        poses.right_arm = { rx: ra_rx, ry: ra_ry, rz: ra_rz };
        poses.left_leg = { rx: ll_rx, ty: ll_ty, tz: ll_tz };
        poses.right_leg = { rx: rl_rx, ty: rl_ty, tz: rl_tz };

        return { poses, weight: { swim: 0, fly: 0, lev: I } };
    }

    globalThis.MF_FlySwim = { animate, buildPose, setFrameState };
})();
