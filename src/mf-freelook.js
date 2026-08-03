// MiniFeather Freelook — Head-mounted camera via third-person pipeline
// --------------------------------------------------------------------
// Core idea (from user suggestion):
//   The game's third-person camera already handles chunk loading, frustum
//   culling, and player rendering correctly. We just need to REPOSITION it
//   from "behind the player" to "at the player's head", then let the game's
//   own mouse/camera system handle the rotation naturally.
//
// How it works:
//   1. On activation: save the head position (from the first-person viewMatrix,
//      which has the camera exactly at eye level).
//   2. Switch game to third-person (fixes chunk loading + frustum culling).
//   3. Intercept uniformMatrix4fv: take the game's rotation (correct direction)
//      but swap the position for the saved head position.
//   4. Also recompute modelViewMatrix to stay consistent.
//   5. On deactivation: restore original perspective.
//
// Checks (in priority order):
//   - window.game.player.toggleCameraPerspective  (direct game object access)
//   - Simulated F5 keydown event                  (fallback)
(function () {
  'use strict';
  const TAG = '[MiniFeather Freelook]';
  // ── Config (writable by content.js settings panel via window.MF_FREELOOK) ───
  let FREELOOK_KEY  = 'KeyZ';
  let FREELOOK_MODE = 'hold'; // 'toggle' | 'hold' | 'off'
  const HEAD_OFFSET_Y = 0.4;   // units above eye level (increase to raise camera higher)
  // ── State ────────────────────────────────────────────────────────────────────
  let active          = false;
  let headPos         = null;  // world-space camera pos saved at activation
  let savedPersp      = -1;    // perspective index before freelook (for restore)
  let lastRealView    = null;  // fresh Float32Array copy of latest real viewMatrix
  // ── Column-major mat3 / mat4 helpers ─────────────────────────────────────────
  const m3from4 = m => [m[0],m[1],m[2], m[4],m[5],m[6], m[8],m[9],m[10]];
  const m3T     = m => [m[0],m[3],m[6], m[1],m[4],m[7], m[2],m[5],m[8]];
  const m3mulv3 = (m,v) => [
    m[0]*v[0]+m[3]*v[1]+m[6]*v[2],
    m[1]*v[0]+m[4]*v[1]+m[7]*v[2],
    m[2]*v[0]+m[5]*v[1]+m[8]*v[2]
  ];

  // World-space camera position: camPos = R_view^T * (-t)
  function extractCamPos(v) {
    return m3mulv3(m3T(m3from4(v)), [-v[12],-v[13],-v[14]]);
  }
  // Build a 4×4 view matrix from a mat3 VIEW-rotation and world-space position
  // (Rv is already the view-space rotation, i.e. R_world^T)
  function buildView(Rv, pos) {
    const t = m3mulv3(Rv, [-pos[0],-pos[1],-pos[2]]);
    return new Float32Array([
      Rv[0],Rv[1],Rv[2],0,
      Rv[3],Rv[4],Rv[5],0,
      Rv[6],Rv[7],Rv[8],0,
      t[0], t[1], t[2], 1
    ]);
  }
  // Invert a pure rotation+translation view matrix
  function invertView(v) {
    const rT = m3T(m3from4(v)), p = extractCamPos(v);
    return new Float32Array([
      rT[0],rT[1],rT[2],0,
      rT[3],rT[4],rT[5],0,
      rT[6],rT[7],rT[8],0,
      p[0], p[1], p[2], 1
    ]);
  }

  // 4×4 column-major matrix multiply
  function m4mul(a, b) {
    const o = new Float32Array(16);
    for (let c=0;c<4;c++) for (let r=0;r<4;r++) {
      let s=0; for (let k=0;k<4;k++) s+=a[k*4+r]*b[c*4+k]; o[c*4+r]=s;
    }
    return o;
  }
  // The head-mounted view: live position from gameView (follows player) + Y offset,
  // with the game's own rotation so it points the right direction.
  function makeHeadView(gameView) {
    const pos = extractCamPos(gameView); // live position — updates every frame
    pos[1] += HEAD_OFFSET_Y;             // lift above eye/camera level
    const Rv = m3from4(gameView);        // view-space rotation (game direction)
    return buildView(Rv, pos);
  }
  // ── WebGL hook ───────────────────────────────────────────────────────────────
  const proto = window.WebGL2RenderingContext?.prototype
             ?? window.WebGLRenderingContext?.prototype;
  if (!proto) {
    console.warn(`${TAG} No WebGL prototype — hook skipped.`);
  } else {
    // Tag uniform locations so we can identify them cheaply per call
    const origGetLoc = proto.getUniformLocation;
    proto.getUniformLocation = function(prog, name) {
      const loc = origGetLoc.call(this, prog, name);
      if (loc) loc._mf = name;
      return loc;
    };

    const origUni = proto.uniformMatrix4fv;
    proto.uniformMatrix4fv = function(loc, t, val, ...rest) {
      const name = loc?._mf;
      if (name === 'viewMatrix') {
        // Always store a fresh copy — THREE.js reuses the same typed-array buffer
        const real = new Float32Array(val instanceof Float32Array ? val : new Float32Array(val));
        lastRealView = real;
        if (active) {
          return origUni.call(this, loc, false, makeHeadView(real), ...rest);
        }
        return origUni.call(this, loc, t, val, ...rest);
      }
      // modelViewMatrix is pre-baked on the CPU as view*model.
      // Recover model = inv(realView) * realMV, then upload headView * model.
      if (name === 'modelViewMatrix' && active && lastRealView) {
        const realMV = val instanceof Float32Array ? val : new Float32Array(val);
        const model  = m4mul(invertView(lastRealView), realMV);
        return origUni.call(this, loc, false, m4mul(makeHeadView(lastRealView), model), ...rest);
      }

      return origUni.call(this, loc, t, val, ...rest);
    };
    console.log(`${TAG} WebGL hook ready.`);
  }
  // ── Perspective switching ─────────────────────────────────────────────────────
  // Priority 1: direct game object access (most reliable, no key simulation).
  // Priority 2: simulate F5 keydown (fallback for when game isn't on window).
  function cyclePerspective(targetOrSteps) {
    // Try direct game object access first
    try {
      if (window.game?.player && typeof game.player.perspective !== 'undefined'
          && typeof game.player.toggleCameraPerspective === 'function') {
        const target = typeof targetOrSteps === 'number' ? targetOrSteps : -1;
        let steps = 0;
        if (target >= 0) {
          while (game.player.perspective !== target && steps++ < 5) {
            game.player.perspective = (game.player.perspective + 1) % 3;
            game.player.toggleCameraPerspective();
          }
        }
        return true;
      }
    } catch (_) {}

    // Fallback: simulate F5 key presses
    const count = typeof targetOrSteps === 'number' ? targetOrSteps : 1;
    for (let i = 0; i < count; i++) {
      try {
        document.dispatchEvent(new KeyboardEvent('keydown', {
          code: 'F5', key: 'F5', keyCode: 116,
          bubbles: true, cancelable: true
        }));
      } catch (_) {}
    }
    return false;
  }
  // ── Freelook toggle ───────────────────────────────────────────────────────────
  function setFL(on) {
    if (on === active) return;

    if (on) {
      // Save head position from current (first-person) view matrix
      if (lastRealView) {
        headPos = extractCamPos(lastRealView);
        headPos[1] += HEAD_OFFSET_Y;
        console.log(`${TAG} Head pos saved:`, headPos.map(v=>v.toFixed(2)));
      } else {
        headPos = null;
        console.warn(`${TAG} No viewMatrix seen yet — head pos unknown.`);
      }
      active = true;

      // Save current perspective then switch to third-person back (1)
      try {
        if (window.game?.player && typeof game.player.perspective !== 'undefined') {
          savedPersp = game.player.perspective;
        } else {
          savedPersp = -1;
        }
      } catch(_) { savedPersp = -1; }

      cyclePerspective(1);
      console.log(`${TAG} ON`);

    } else {
      active = false;
      headPos = null;

      // Restore original perspective
      if (savedPersp >= 0) {
        cyclePerspective(savedPersp);
      } else {
        // Assume we were at first-person (0), now at back (1): need 2 presses to reach 0
        cyclePerspective(2);
      }

      console.log(`${TAG} OFF`);
    }
  }
  // ── Key handling ─────────────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.repeat) return;
    // Rebind mode
    if (window.MF_FREELOOK?._binding) {
      if (e.code !== 'Escape' && e.code !== 'Backspace') {
        FREELOOK_KEY = e.code;
        window.MF_FREELOOK._binding = false;
        window.MF_FREELOOK.onKeyChanged?.(FREELOOK_KEY);
        console.log(`${TAG} Key rebound to ${FREELOOK_KEY}`);
      }
      return;
    }
    if (e.code !== FREELOOK_KEY)      return;
    if (!document.pointerLockElement) return; // only while in-game
    if (FREELOOK_MODE === 'off')      return;
    if (FREELOOK_MODE === 'toggle') setFL(!active);
    else if (FREELOOK_MODE === 'hold') setFL(true);
  }, true);
  window.addEventListener('keyup', e => {
    if (e.code === FREELOOK_KEY && FREELOOK_MODE === 'hold') setFL(false);
  }, true);

  // ── Public API for content.js settings UI ────────────────────────────────────
  window.MF_FREELOOK = {
    get key()    { return FREELOOK_KEY;  },
    get mode()   { return FREELOOK_MODE; },
    get active() { return active;        },
    setKey(k)    { FREELOOK_KEY  = k;   },
    setMode(m)   { FREELOOK_MODE = m; if (m === 'off') setFL(false); },
    setFL,
    _binding: false,
    startBinding()    { this._binding = true; },
    onKeyChanged: null
  };
  console.log(`${TAG} Loaded. Key=${FREELOOK_KEY} Mode=${FREELOOK_MODE}`);
})();