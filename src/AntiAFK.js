(function () {
  'use strict';

  const EVENT = 'minifeather:anti-afk-config';
  const KEY = '__MINIFEATHER_ANTI_AFK__';

  const s = {
    enabled: false,
    active: false,
    destroyed: false,
    delaySeconds: 120,
    game: null,
    player: null,
    applyName: null,
    sendName: null,
    originalApply: null,
    hookApply: null,
    applyHadOwn: false,
    lastActivity: Date.now(),
    lastNativeCall: 0,
    scanTimer: 0,
    idleTimer: 0,
    fallbackTimer: 0,
    mouseX: null,
    mouseY: null
  };

  try {
    globalThis[KEY]?.destroy?.();
  } catch {}

  function clampDelay(v) {
    const n = Number(v);

    if (!Number.isFinite(n)) {
      return 120;
    }

    return Math.max(
      5,
      Math.min(
        150,
        Math.round(n / 5) * 5
      )
    );
  }

  function getGame(force = false) {
    if (
      !force &&
      s.game?.player?.pos
    ) {
      return s.game;
    }

    try {
      const direct = [
        globalThis.__MB?.game,
        globalThis.game,
        globalThis.__game,
        globalThis.minibloxGame,
        globalThis.MiniBlox?.game
      ];

      for (const game of direct) {
        if (game?.player?.pos) {
          s.game = game;
          return game;
        }
      }
    } catch {}

    try {
      const roots = [
        document.querySelector('#react'),
        document.querySelector('#root'),
        document.querySelector(
          '[id*="react"]'
        )
      ].filter(Boolean);

      for (const el of roots) {
        for (
          const root
          of Object.values(el)
        ) {
          const candidates = [
            root?.updateQueue
              ?.baseState
              ?.element
              ?.props
              ?.game,

            root?.memoizedProps?.game,
            root?.pendingProps?.game,

            root?.return
              ?.memoizedProps
              ?.game,

            root?.return
              ?.return
              ?.memoizedProps
              ?.game,

            root?.child
              ?.memoizedProps
              ?.game,

            root?.child
              ?.child
              ?.memoizedProps
              ?.game
          ];

          for (
            const game
            of candidates
          ) {
            if (game?.player?.pos) {
              s.game = game;
              return game;
            }
          }
        }
      }
    } catch {}

    return null;
  }

  function methodsOf(obj) {
    const out = [];
    const seen = new Set();

    let proto = obj;

    for (
      let depth = 0;
      proto && depth < 14;
      depth++
    ) {
      let names = [];

      try {
        names =
          Object.getOwnPropertyNames(
            proto
          );
      } catch {}

      for (const name of names) {
        if (
          name === 'constructor' ||
          seen.has(name)
        ) {
          continue;
        }

        seen.add(name);

        let fn;

        try {
          fn = obj[name];
        } catch {
          continue;
        }

        if (
          typeof fn !== 'function'
        ) {
          continue;
        }

        let src = '';

        try {
          src =
            Function.prototype
              .toString
              .call(fn);
        } catch {}

        out.push({
          name,
          fn,
          src
        });
      }

      try {
        proto =
          Object.getPrototypeOf(
            proto
          );
      } catch {
        break;
      }
    }

    return out;
  }

  function findApply(player) {
    let best = null;

    for (
      const m
      of methodsOf(player)
    ) {
      let score = 0;

      const x = m.src;

      if (
        x.includes(
          'ayHGaukUNSp'
        )
      ) {
        score += 10;
      }

      if (
        x.includes(
          'yNDNKuoxzL'
        )
      ) {
        score += 10;
      }

      if (
        x.includes('jumping')
      ) {
        score += 5;
      }

      if (
        x.includes('.right')
      ) {
        score += 4;
      }

      if (
        x.includes('.left')
      ) {
        score += 4;
      }

      if (
        x.includes('.up')
      ) {
        score += 4;
      }

      if (
        x.includes('.down')
      ) {
        score += 4;
      }

      if (
        x.includes('.jump')
      ) {
        score += 4;
      }

      if (
        x.includes(
          'usingItem'
        )
      ) {
        score += 2;
      }

      if (
        m.name ===
        'aowZWMsCgJ'
      ) {
        score += 6;
      }

      if (
        !best ||
        score > best.score
      ) {
        best = {
          ...m,
          score
        };
      }
    }

    return best?.score >= 28
      ? best
      : null;
  }

  function findSend(player) {
    let best = null;

    for (
      const m
      of methodsOf(player)
    ) {
      let score = 0;

      const x = m.src;

      if (
        x.includes(
          'serverMoveForward'
        )
      ) {
        score += 10;
      }

      if (
        x.includes(
          'serverMoveStrafe'
        )
      ) {
        score += 10;
      }

      if (
        x.includes(
          'ayHGaukUNSp'
        )
      ) {
        score += 5;
      }

      if (
        x.includes(
          'yNDNKuoxzL'
        )
      ) {
        score += 5;
      }

      if (
        x.includes(
          'sendPacket'
        )
      ) {
        score += 5;
      }

      if (
        x.includes(
          'serverSneakState'
        )
      ) {
        score += 2;
      }

      if (
        x.includes(
          'serverSprintState'
        )
      ) {
        score += 2;
      }

      if (
        m.name ===
        'GksBoXJsoTP'
      ) {
        score += 6;
      }

      if (
        !best ||
        score > best.score
      ) {
        best = {
          ...m,
          score
        };
      }
    }

    return best?.score >= 25
      ? best
      : null;
  }

  function actionAt(now) {
    const t = now % 5200;

    return {
      up:
        t < 260,

      down:
        t >= 520 &&
        t < 780,

      left:
        t >= 1900 &&
        t < 2160,

      right:
        t >= 2420 &&
        t < 2680,

      jump:
        t >= 3600 &&
        t < 3730
    };
  }

  function buildInput(
    base,
    player
  ) {
    const a =
      actionAt(Date.now());

    return {
      ...(
        base ||
        player.currentInput ||
        {}
      ),

      up:
        a.up,

      down:
        a.down,

      left:
        a.left,

      right:
        a.right,

      jump:
        a.jump,

      sneak:
        false,

      usingItem:
        false,

      yaw:
        Number.isFinite(
          Number(player.yaw)
        )
          ? player.yaw
          : base?.yaw,

      pitch:
        Number.isFinite(
          Number(player.pitch)
        )
          ? player.pitch
          : base?.pitch
    };
  }

  function neutralInput(
    base,
    player
  ) {
    return {
      ...(
        base ||
        player.currentInput ||
        {}
      ),

      up: false,
      down: false,
      left: false,
      right: false,
      jump: false,
      sneak: false,
      usingItem: false,

      yaw:
        Number.isFinite(
          Number(player.yaw)
        )
          ? player.yaw
          : base?.yaw,

      pitch:
        Number.isFinite(
          Number(player.pitch)
        )
          ? player.pitch
          : base?.pitch
    };
  }

  function sendNow(player) {
    if (
      !player ||
      !s.sendName
    ) {
      return;
    }

    try {
      player[
        s.sendName
      ]?.call(player);
    } catch {}
  }

  function applyNow(input) {
    const p = s.player;

    if (
      !p ||
      typeof s.originalApply !==
        'function'
    ) {
      return false;
    }

    try {
      s.originalApply.call(
        p,
        input
      );

      s.lastNativeCall =
        Date.now();

      sendNow(p);

      return true;
    } catch {
      return false;
    }
  }

  function stopMovement() {
    const p = s.player;

    if (!p) {
      return;
    }

    applyNow(
      neutralInput(
        p.currentInput,
        p
      )
    );
  }

  function restoreHook() {
    const p = s.player;

    if (
      p &&
      s.applyName &&
      s.hookApply
    ) {
      try {
        if (
          p[s.applyName] ===
          s.hookApply
        ) {
          if (
            s.applyHadOwn
          ) {
            p[s.applyName] =
              s.originalApply;
          } else {
            delete p[
              s.applyName
            ];
          }
        }
      } catch {}
    }

    s.applyName = null;
    s.sendName = null;
    s.originalApply = null;
    s.hookApply = null;
    s.applyHadOwn = false;
  }

  function hookPlayer(player) {
    if (!player) {
      return false;
    }

    if (
      s.player &&
      s.player !== player
    ) {
      stopMovement();
      restoreHook();
    }

    s.player = player;

    const apply =
      findApply(player);

    const send =
      findSend(player);

    if (!apply) {
      return false;
    }

    s.applyName =
      apply.name;

    s.sendName =
      send?.name || null;

    s.originalApply =
      apply.fn;

    s.applyHadOwn =
      Object.prototype
        .hasOwnProperty
        .call(
          player,
          apply.name
        );

    const hook =
      function (
        input,
        ...args
      ) {
        s.lastNativeCall =
          Date.now();

        if (
          !s.enabled ||
          !s.active ||
          s.player !== this
        ) {
          return s.originalApply.call(
            this,
            input,
            ...args
          );
        }

        return s.originalApply.call(
          this,
          buildInput(
            input,
            this
          ),
          ...args
        );
      };

    try {
      player[
        apply.name
      ] = hook;

      if (
        player[
          apply.name
        ] !== hook
      ) {
        return false;
      }
    } catch {
      return false;
    }

    s.hookApply = hook;

    return true;
  }

  function ensureRuntime() {
    if (
      !s.enabled ||
      s.destroyed
    ) {
      return false;
    }

    const game =
      getGame(true);

    const player =
      game?.player;

    if (!player?.pos) {
      return false;
    }

    s.game = game;

    if (
      s.player !== player ||
      !s.hookApply ||
      player[
        s.applyName
      ] !== s.hookApply
    ) {
      return hookPlayer(
        player
      );
    }

    return true;
  }

  function activate() {
    if (
      !s.enabled ||
      s.active ||
      !ensureRuntime()
    ) {
      return;
    }

    s.active = true;

    applyNow(
      buildInput(
        s.player.currentInput,
        s.player
      )
    );
  }

  function deactivate(
    resetActivity = true
  ) {
    if (s.active) {
      s.active = false;

      stopMovement();
    }

    if (resetActivity) {
      s.lastActivity =
        Date.now();
    }
  }

  function activity(e) {
    if (
      e?.isTrusted === false
    ) {
      return;
    }

    deactivate(true);
  }

  function mouseMove(e) {
    if (
      e.isTrusted === false
    ) {
      return;
    }

    const dx =
      Number(
        e.movementX
      ) || 0;

    const dy =
      Number(
        e.movementY
      ) || 0;

    if (
      Math.hypot(
        dx,
        dy
      ) >= 1
    ) {
      s.mouseX =
        e.clientX;

      s.mouseY =
        e.clientY;

      activity(e);

      return;
    }

    if (
      s.mouseX === null ||
      s.mouseY === null
    ) {
      s.mouseX =
        e.clientX;

      s.mouseY =
        e.clientY;

      return;
    }

    const d =
      Math.hypot(
        e.clientX -
          s.mouseX,

        e.clientY -
          s.mouseY
      );

    s.mouseX =
      e.clientX;

    s.mouseY =
      e.clientY;

    if (d >= 4) {
      activity(e);
    }
  }

  const listeners = [
    [
      'keydown',
      activity
    ],

    [
      'mousedown',
      activity
    ],

    [
      'pointerdown',
      activity
    ],

    [
      'wheel',
      activity
    ],

    [
      'touchstart',
      activity
    ],

    [
      'mousemove',
      mouseMove
    ]
  ];

  function addListeners() {
    for (
      const [
        type,
        fn
      ] of listeners
    ) {
      window.addEventListener(
        type,
        fn,
        true
      );
    }
  }

  function removeListeners() {
    for (
      const [
        type,
        fn
      ] of listeners
    ) {
      window.removeEventListener(
        type,
        fn,
        true
      );
    }
  }

  function startTimers() {
    if (!s.scanTimer) {
      s.scanTimer =
        setInterval(
          () => {
            if (
              s.enabled
            ) {
              ensureRuntime();
            }
          },
          1000
        );
    }

    if (!s.idleTimer) {
      s.idleTimer =
        setInterval(
          () => {
            if (
              !s.enabled ||
              s.active
            ) {
              return;
            }

            if (
              Date.now() -
                s.lastActivity >=
              s.delaySeconds *
                1000
            ) {
              activate();
            }
          },
          250
        );
    }

    if (!s.fallbackTimer) {
      s.fallbackTimer =
        setInterval(
          () => {
            if (
              !s.enabled ||
              !s.active ||
              !ensureRuntime()
            ) {
              return;
            }

            if (
              Date.now() -
                s.lastNativeCall <
              300
            ) {
              return;
            }

            applyNow(
              buildInput(
                s.player
                  .currentInput,
                s.player
              )
            );
          },
          250
        );
    }
  }

  function stopTimers() {
    clearInterval(
      s.scanTimer
    );

    clearInterval(
      s.idleTimer
    );

    clearInterval(
      s.fallbackTimer
    );

    s.scanTimer = 0;
    s.idleTimer = 0;
    s.fallbackTimer = 0;
  }

  function enable() {
    if (
      s.destroyed
    ) {
      return false;
    }

    if (
      s.enabled
    ) {
      return true;
    }

    s.enabled = true;
    s.active = false;

    s.lastActivity =
      Date.now();

    addListeners();
    startTimers();
    ensureRuntime();

    return true;
  }

  function disable() {
    s.enabled = false;

    deactivate(false);

    stopTimers();
    removeListeners();
    restoreHook();

    s.player = null;
    s.game = null;

    s.lastActivity =
      Date.now();
  }

  function applyConfig(
    config = {}
  ) {
    const delay =
      config.delaySeconds ??
      config.delay ??
      config.seconds;

    if (
      delay != null
    ) {
      s.delaySeconds =
        clampDelay(delay);
    }

    if (
      config.enabled === true
    ) {
      enable();
    }

    if (
      config.enabled === false
    ) {
      disable();
    }
  }

  function onConfig(e) {
    let config = {};

    try {
      config =
        typeof e.detail ===
        'string'
          ? JSON.parse(
              e.detail || '{}'
            )
          : (
              e.detail || {}
            );
    } catch {}

    applyConfig(config);
  }

  function destroy() {
    if (
      s.destroyed
    ) {
      return;
    }

    document.removeEventListener(
      EVENT,
      onConfig
    );

    disable();

    s.destroyed = true;

    try {
      delete globalThis[
        KEY
      ];
    } catch {}
  }

  document.addEventListener(
    EVENT,
    onConfig
  );

  globalThis[KEY] = {
    enable,
    disable,
    destroy,
    applyConfig,

    get status() {
      return {
        enabled:
          s.enabled,

        active:
          s.active,

        delaySeconds:
          s.delaySeconds,

        idleSeconds:
          Math.max(
            0,
            (
              Date.now() -
              s.lastActivity
            ) / 1000
          ),

        playerHooked:
          !!s.player,

        applyMethod:
          s.applyName,

        sendMethod:
          s.sendName,

        hidden:
          document.hidden
      };
    }
  };
})();
