(function () {
    'use strict';
    const TAG = '[MiniFeather Freelook]';

    // ── Config
    let FREELOOK_KEY = 'KeyZ';
    let FREELOOK_MODE = 'hold'; // 'toggle' | 'hold' | 'off'
    const PITCH_LIMIT = Math.PI / 2 - 0.02;
    // ── State 
    let active = false;
    let sensitivity = 0.002;
    let calibrated = false;
    let savedYaw = 0;
    let savedPitch = 0;
    let savedPerspective = null;
    let perspectiveForced = false;
    let yawOffset = 0;
    let pitchOffset = 0;

    function findGameInstance() {
    const candidates = [
        document.getElementById("root"),
        document.querySelector("canvas"),
        document.body,
        ...document.querySelectorAll("#root *")
    ];

    for (const el of candidates) {
        if (!el) continue;
        const keys = Object.keys(el);
        const fiberKey = keys.find(k =>
            k.startsWith('__reactFiber$') ||
            k.startsWith('__reactInternalInstance$') ||
            k.startsWith('__reactContainer$')
        );
        if (!fiberKey) continue;
        let fiber = el[fiberKey];
        while (fiber) {
            if (fiber.stateNode) {
                if (
                    typeof fiber.stateNode.queue === 'function' &&
                    typeof fiber.stateNode.connect === 'function'
                ) {
                    return fiber.stateNode;
                }
                if (
                    fiber.stateNode.game &&
                    typeof fiber.stateNode.game.queue === 'function' &&
                    typeof fiber.stateNode.game.connect === 'function'
                ) {
                    return fiber.stateNode.game;
                }
            }
            if (fiber.memoizedProps) {
                if (
                    fiber.memoizedProps.game &&
                    typeof fiber.memoizedProps.game.queue === 'function' &&
                    typeof fiber.memoizedProps.game.connect === 'function'
                ) {
                    return fiber.memoizedProps.game;
                }
                for (const propName in fiber.memoizedProps) {
                    const value = fiber.memoizedProps[propName];
                    if (
                        value &&
                        typeof value === 'object' &&
                        typeof value.queue === 'function' &&
                        typeof value.connect === 'function'
                    ) {
                        return value;
                    }
                }
            }
            fiber = fiber.return;
        }
    }
    return null;
}

  function getCameraChain() {
      let game = window.miniblox;
      if (!game) {
          game = findGameInstance();
          if (game) {
              window.miniblox = game;
              console.log(
                  '[MiniFeather Freelook] ✓ Game instance captured.'
              );
          }
      }
      if (!game) {
          return null;
      }
      const gameScene =
          game.player &&
          game.player.game &&
          game.player.game.gameScene;
      if (!gameScene || !gameScene.camera) {
          return null;
      }
      const camera = gameScene.camera;
      if (!camera.parent || !camera.parent.parent) {
          return null;
      }
      return {
          player: game.player,
          pitchObject: camera.parent,
          yawObject: camera.parent.parent
      };
  }

  const gameCaptureInterval = setInterval(() => {
    if (window.miniblox) {
        clearInterval(gameCaptureInterval);
        return;
    }
    const game = findGameInstance();
    if (game) {
        window.miniblox = game;

        console.log(
            '[MiniFeather Freelook] ✓ Miniblox game captured.'
        );
        clearInterval(gameCaptureInterval);
    }
  }, 500);

  if (!window.__MF_FRELOOK_EVENT_HOOK__) {
      window.__MF_FRELOOK_EVENT_HOOK__ = true;
      const originalAddEventListener =
          EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (
          type,
          handler,
          options
      ) {
          if (
              type === 'mousemove' &&
              this === document &&
              typeof handler === 'function'
          ) {
              const originalHandler = handler;
              const wrappedHandler = function (e) {
                  if (window._mfFreelookActive) {
                      const fakeEvent = new Proxy(e, {
                          get(target, prop) {
                              if (
                                  prop === 'movementX' ||
                                  prop === 'movementY'
                              ) {
                                  return 0;
                              }
                              const value = Reflect.get(
                                  target,
                                  prop,
                                  target
                              );
                              return typeof value === 'function'
                                  ? value.bind(target)
                                  : value;
                          }
                      });
                      originalHandler.call(this, fakeEvent);
                      if (window._mfFreelookApplyDelta) {
                          window._mfFreelookApplyDelta(
                              e.movementX,
                              e.movementY
                          );
                      }
                  } else {
                      originalHandler.call(this, e);
                  }
              };
              return originalAddEventListener.call(
                  this,
                  type,
                  wrappedHandler,
                  options
              );
          }
          return originalAddEventListener.call(
              this,
              type,
              handler,
              options
          );
      };
      console.log(
          `${TAG} Early mousemove hook installed.`
      );
  } else {
      console.log(
          `${TAG} Early mousemove hook already installed.`
      );
  }

  function getLocalPlayer() {
      const game = window.miniblox;
      return game && game.player ? game.player : null;
  }

  function enterFreelookPerspective(player) {
      if (!player) return;
      savedPerspective = player.perspective;
      perspectiveForced = false;  
      if (savedPerspective !== 0) {
          return;
      }
      player.perspective = 1;
      if (typeof player.toggleCameraPerspective === 'function') {
          player.toggleCameraPerspective();
      }
      perspectiveForced = true;
      console.log(
          `${TAG} First-person detected — switched to third-person freelook.`
      );
  }

  function restoreFreelookPerspective(player) {
      if (!player || savedPerspective === null) {
          return;
      }
      if (perspectiveForced) {
          player.perspective = savedPerspective;
          if (typeof player.toggleCameraPerspective === 'function') {
              player.toggleCameraPerspective();
          }        
          console.log(
              `${TAG} Restored original perspective: ${savedPerspective}`
          );
      }   
      savedPerspective = null;
      perspectiveForced = false;
  }

  window._mfFreelookApplyDelta = function (dx, dy) {
      if (!active) return;
      const chain = getCameraChain();
      if (!chain) return;
      const {
          pitchObject,
          yawObject
      } = chain;
      yawOffset -= dx * sensitivity;
      pitchOffset -= dy * sensitivity;
      const totalPitch =
          savedPitch + pitchOffset;
      if (totalPitch > PITCH_LIMIT) {
          pitchOffset =
              PITCH_LIMIT - savedPitch;
      }
      if (totalPitch < -PITCH_LIMIT) {
          pitchOffset =
              -PITCH_LIMIT - savedPitch;
      }
      yawObject.rotation.y =
          savedYaw + yawOffset;
      pitchObject.rotation.x =
          savedPitch + pitchOffset;
  };

  (function calibrateSensitivity() {
      function tryCalibrate(e) {
          if (
              calibrated ||
              active ||
              !document.pointerLockElement
          ) {
              return;
          }
          if (!e.movementX) return;
          const chain = getCameraChain();
          if (!chain) return;
          const capturedYaw =
              chain.yawObject.rotation.y;
          const capturedDx =
              e.movementX;
          setTimeout(function () {
              if (
                  calibrated ||
                  !chain.yawObject
              ) {
                  return;
              }
              const delta =
                  chain.yawObject.rotation.y -
                  capturedYaw;
              if (
                  Math.abs(delta) > 0.000001 &&
                  capturedDx !== 0
              ) {
                  sensitivity =
                      Math.abs(
                          delta / capturedDx
                      );
                  calibrated = true;
                  console.log(
                      `${TAG} Sensitivity calibrated: ` +
                      `${sensitivity.toFixed(7)} rad/px`
                  );
                  document.removeEventListener(
                      'mousemove',
                      tryCalibrate,
                      false
                  );
              }
          }, 0);
      }
      document.addEventListener(
          'mousemove',
          tryCalibrate,
          false
      );
  })();

  function setFL(on) {
      if (on === active) {
          return;
      }
      const chain = getCameraChain();
      if (!chain) {
          console.warn(
              `${TAG} Cannot ${
                  on ? 'enable' : 'disable'
              } freelook: camera chain not ready.`
          );
          return;
      }
      const {
          player,
          pitchObject,
          yawObject
      } = chain;
      if (on) {
          savedYaw =
              yawObject.rotation.y;
          savedPitch =
              pitchObject.rotation.x;
          yawOffset = 0;
          pitchOffset = 0;
          enterFreelookPerspective(player);
          active = true;
          window._mfFreelookActive = true;
          console.log(
              `${TAG} ON — ` +
              `yaw=${savedYaw.toFixed(3)} ` +
              `pitch=${savedPitch.toFixed(3)} ` +
              `sensitivity=${sensitivity.toFixed(7)}`
          );
      } else {
          active = false;
          window._mfFreelookActive = false;
          yawOffset = 0;
          pitchOffset = 0;
          yawObject.rotation.y =
              savedYaw;
          pitchObject.rotation.x =
              savedPitch;
          restoreFreelookPerspective(player);
          console.log(
              `${TAG} OFF — camera snapped back to body direction.`
          );
      }
  }

  document.addEventListener(
      'pointerlockchange',
      function () {
          if (
              !document.pointerLockElement &&
              active
          ) {
              active = false;
              window._mfFreelookActive = false;
              yawOffset = 0;
              pitchOffset = 0;
              const chain =
                  getCameraChain();
              if (chain) {
                  chain.yawObject.rotation.y =
                      savedYaw;
                  chain.pitchObject.rotation.x =
                      savedPitch;
                  restoreFreelookPerspective(chain.player);
              }
              console.log(
                  `${TAG} Auto-disabled — pointer lock released.`
              );
          }
      },
      false
  );

  document.addEventListener(
      'keydown',
      e => {
          if (e.repeat) {
              return;
          }
          if (window.MF_FREELOOK?._binding) {
              if (
                  e.code !== 'Escape' &&
                  e.code !== 'Backspace' &&
                  e.code !== 'Delete'
              ) {
                  FREELOOK_KEY = e.code;           
                  window.MF_FREELOOK._binding = false;             
                  window.MF_FREELOOK.onKeyChanged?.(
                      FREELOOK_KEY
                  );           
                  console.log(
                      `${TAG} Key rebound to ${FREELOOK_KEY}`
                  );
              }            
              return;
          }
          if (
              e.code !== FREELOOK_KEY
          ) {
              return;
          }
          if (
              !document.pointerLockElement
          ) {
              return;
          }
          if (
              FREELOOK_MODE === 'off'
          ) {
              return;
          }
          if (
              FREELOOK_MODE === 'toggle'
          ) {
              setFL(!active);
          } else if (
              FREELOOK_MODE === 'hold'
          ) {
              setFL(true);
          }
      },
      true
  );

  window.addEventListener(
      'keyup',
      e => {
          if (
              e.code === FREELOOK_KEY &&
              FREELOOK_MODE === 'hold'
          ) {
              setFL(false);
          }
      },
      true
  );

  document.addEventListener(
      'minifeather:freelook-config',
      event => {
          let config;      
          try {
              config =
                  typeof event.detail === 'string'
                      ? JSON.parse(event.detail)
                      : event.detail;
          } catch (_) {
              return;
          }        
          if (!config || typeof config !== 'object') {
              return;
          }        
          if (
              typeof config.bind === 'string'
          ) {
              FREELOOK_KEY =
                  config.bind || 'KeyZ';
          }        
          if (
              config.mode === 'hold' ||
              config.mode === 'toggle'
          ) {
              FREELOOK_MODE =
                  config.mode;
          }        
          if (
              typeof config.enabled === 'boolean'
          ) {
              if (
                  config.enabled &&
                  FREELOOK_MODE !== 'off'
              ) {
              } else if (!config.enabled) {
                  setFL(false);
              }
          }        
          console.log(
              `${TAG} UI config applied:`,
              {
                  enabled: config.enabled,
                  key: FREELOOK_KEY,
                  mode: FREELOOK_MODE
              }
          );
      }
  );       

  document.addEventListener(
      'minifeather:freelook-binding',
      event => {
          let data;        
          try {
              data =
                  typeof event.detail === 'string'
                      ? JSON.parse(event.detail)
                      : event.detail;
          } catch (_) {
              return;
          }        
          if (!data) return;       
          window.MF_FREELOOK._binding =
              !!data.active;       
          console.log(
              `${TAG} UI key binding mode:`,
              !!data.active
          );
      }
  );

  window.MF_FREELOOK = {
      get key() {
          return FREELOOK_KEY;
      },
      get mode() {
          return FREELOOK_MODE;
      },
      get active() {
          return active;
      },
      setKey(k) {
          FREELOOK_KEY = k;
      },
      setMode(m) {
          FREELOOK_MODE = m;
          if (m === 'off') {
              setFL(false);
          }
      },
      setFL,
      _binding: false,
      startBinding() {
          this._binding = true;
      },
      onKeyChanged: null
  };
  console.log(
      `${TAG} Loaded. ` +
      `Key=${FREELOOK_KEY} ` +
      `Mode=${FREELOOK_MODE}`
  );
})();
