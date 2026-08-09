// MiniFeather Features — Block Highlight
// Ported from the working inject(3).js implementation.
//
// Settings:
//   miniblox_blockhighlight
//   miniblox_blockhighlight_color
//   miniblox_blockhighlight_thickness
//
// Refresh message:
//   MINIBLOX_REFRESH_BLOCK_HIGHLIGHT

(function () {
    'use strict';

    const TAG = '[MiniFeather Features]';

    if (window.__MF_FEATURES_BLOCK_HIGHLIGHT__) return;
    window.__MF_FEATURES_BLOCK_HIGHLIGHT__ = true;

    function findGameInstance() {
        const candidates = [
            document.getElementById('root'),
            document.querySelector('canvas'),
            document.body,
            ...document.querySelectorAll('#root *')
        ];

        for (const el of candidates) {
            if (!el) continue;

            const fiberKey = Object.keys(el).find(k =>
                k.startsWith('__reactFiber$') ||
                k.startsWith('__reactInternalInstance$') ||
                k.startsWith('__reactContainer$')
            );

            if (!fiberKey) continue;

            let fiber = el[fiberKey];

            while (fiber) {
                const state = fiber.stateNode;

                if (state) {
                    if (
                        typeof state.queue === 'function' &&
                        typeof state.connect === 'function'
                    ) return state;

                    if (
                        state.game &&
                        typeof state.game.queue === 'function' &&
                        typeof state.game.connect === 'function'
                    ) return state.game;
                }

                const props = fiber.memoizedProps;

                if (props) {
                    if (
                        props.game &&
                        typeof props.game.queue === 'function' &&
                        typeof props.game.connect === 'function'
                    ) return props.game;

                    for (const key in props) {
                        const value = props[key];

                        if (
                            value &&
                            typeof value === 'object' &&
                            typeof value.queue === 'function' &&
                            typeof value.connect === 'function'
                        ) return value;
                    }
                }

                fiber = fiber.return;
            }
        }

        return null;
    }

    function getGame() {
        if (window.miniblox) return window.miniblox;

        const game = findGameInstance();

        if (game) {
            window.miniblox = game;
            console.log(`${TAG} ✓ Game instance captured.`);
        }

        return game;
    }

    // Exact thickness technique from inject(3).js.
    function applySelectBoxThickness(selectBox, thicknessVal, colorHex) {
        const level = parseInt(thicknessVal || '1', 10);

        if (!selectBox) return;

        if (
            !selectBox._thickChildren ||
            selectBox._thickLevel !== level
        ) {
            if (selectBox._thickChildren) {
                selectBox._thickChildren.forEach(child => {
                    selectBox.remove(child);

                    if (child.material) {
                        child.material.dispose();
                    }
                });
            }

            selectBox._thickChildren = [];
            selectBox._thickLevel = level;

            if (level > 1) {
                const Box3HelperClass = selectBox.constructor;

                const LineSegmentsClass =
                    Object.getPrototypeOf(Box3HelperClass);

                const LineBasicMaterialClass =
                    selectBox.material.constructor;

                const color =
                    new selectBox.material.color.constructor(colorHex);

                const d = 0.001;
                const localD = d * 2;

                const offsets = [];

                // Level 2
                if (level >= 2) {
                    offsets.push(
                        [localD, 0, 0],
                        [-localD, 0, 0],
                        [0, localD, 0],
                        [0, -localD, 0],
                        [0, 0, localD],
                        [0, 0, -localD]
                    );

                    const d2 = localD * 0.7;

                    offsets.push(
                        [d2, d2, 0],
                        [-d2, d2, 0],
                        [d2, -d2, 0],
                        [-d2, -d2, 0],

                        [0, d2, d2],
                        [0, -d2, d2],
                        [0, d2, -d2],
                        [0, -d2, -d2],

                        [d2, 0, d2],
                        [-d2, 0, d2],
                        [d2, 0, -d2],
                        [-d2, 0, -d2]
                    );

                    const d3 = localD * 1.4;

                    offsets.push(
                        [d3, 0, 0],
                        [-d3, 0, 0],
                        [0, d3, 0],
                        [0, -d3, 0],
                        [0, 0, d3],
                        [0, 0, -d3]
                    );
                }

                // Level 3
                if (level >= 3) {
                    const d4 = localD * 1.7;

                    offsets.push(
                        [d4, d4, 0],
                        [-d4, d4, 0],
                        [d4, -d4, 0],
                        [-d4, -d4, 0],

                        [0, d4, d4],
                        [0, -d4, d4],
                        [0, d4, -d4],
                        [0, -d4, -d4],

                        [d4, 0, d4],
                        [-d4, 0, d4],
                        [d4, 0, -d4],
                        [-d4, 0, -d4]
                    );

                    const d5 = localD * 2.0;

                    offsets.push(
                        [d5, d5, d5],
                        [-d5, d5, d5],
                        [d5, -d5, d5],
                        [-d5, -d5, d5],

                        [d5, d5, -d5],
                        [-d5, d5, -d5],
                        [d5, -d5, -d5],
                        [-d5, -d5, -d5]
                    );
                }

                // Level 4
                if (level >= 4) {
                    const d6 = localD * 2.4;

                    offsets.push(
                        [d6, d6, 0],
                        [-d6, d6, 0],
                        [d6, -d6, 0],
                        [-d6, -d6, 0],

                        [0, d6, d6],
                        [0, -d6, d6],
                        [0, d6, -d6],
                        [0, -d6, -d6],

                        [d6, 0, d6],
                        [-d6, 0, d6],
                        [d6, 0, -d6],
                        [-d6, 0, -d6]
                    );

                    const d7 = localD * 2.8;

                    offsets.push(
                        [d7, 0, 0],
                        [-d7, 0, 0],
                        [0, d7, 0],
                        [0, -d7, 0],
                        [0, 0, d7],
                        [0, 0, -d7]
                    );

                    const d8 = localD * 3.1;

                    offsets.push(
                        [d8, d8, 0],
                        [-d8, d8, 0],
                        [d8, -d8, 0],
                        [-d8, -d8, 0],

                        [0, d8, d8],
                        [0, -d8, d8],
                        [0, d8, -d8],
                        [0, -d8, -d8],

                        [d8, 0, d8],
                        [-d8, 0, d8],
                        [d8, 0, -d8],
                        [-d8, 0, -d8]
                    );
                }

                offsets.forEach(offset => {
                    const material =
                        new LineBasicMaterialClass({
                            color,
                            toneMapped: false
                        });

                    const clone =
                        new LineSegmentsClass(
                            selectBox.geometry,
                            material
                        );

                    clone.position.set(
                        offset[0],
                        offset[1],
                        offset[2]
                    );

                    selectBox.add(clone);
                    selectBox._thickChildren.push(clone);
                });
            }
        } else {
            selectBox._thickChildren.forEach(child => {
                if (child.material?.color) {
                    child.material.color.set(colorHex);
                }
            });
        }
    }

    window.minibloxApplySelectBoxThickness =
        applySelectBoxThickness;

    function refreshBlockHighlight() {
        try {
            const game = getGame();
            const selectBox = game?.player?.selectBox;

            if (!selectBox) return false;

            if (
                localStorage.getItem(
                    'miniblox_blockhighlight'
                ) === 'false'
            ) {
                selectBox.visible = false;
                return true;
            }

            selectBox.visible = true;

            const color =
                localStorage.getItem(
                    'miniblox_blockhighlight_color'
                ) || '#ffffff';

            if (selectBox.material?.color) {
                selectBox.material.color.set(color);
            }

            const thickness =
                localStorage.getItem(
                    'miniblox_blockhighlight_thickness'
                ) || '1';

            applySelectBoxThickness(
                selectBox,
                thickness,
                color
            );

            return true;
        } catch (err) {
            console.warn(
                `${TAG} Refresh error:`,
                err
            );

            return false;
        }
    }

    // Find PlayerController from the cached game bundle
    // and patch select().
    function patchSelectMethod(module) {
        if (window.__MF_BLOCK_HIGHLIGHT_SELECT_PATCHED__) {
            return true;
        }

        let proto = null;

        for (const key in module) {
            try {
                const exp = module[key];

                if (
                    typeof exp === 'object' &&
                    typeof exp?.getTargetedBlockCoords ===
                        'function'
                ) {
                    proto = Object.getPrototypeOf(exp);

                } else if (
                    typeof exp === 'function' &&
                    exp.prototype &&
                    typeof exp.prototype
                        .getTargetedBlockCoords ===
                        'function'
                ) {
                    proto = exp.prototype;
                }
            } catch (_) {}
        }

        if (!proto || typeof proto.select !== 'function') {
            return false;
        }

        if (proto.select.__mfBlockHighlightPatched) {
            window.__MF_BLOCK_HIGHLIGHT_SELECT_PATCHED__ = true;
            return true;
        }

        const originalSelect = proto.select;

        const patchedSelect = function (...args) {
            const result =
                originalSelect.apply(this, args);

            refreshBlockHighlight();

            return result;
        };

        patchedSelect.__mfBlockHighlightPatched = true;

        proto.select = patchedSelect;

        window.__MF_BLOCK_HIGHLIGHT_SELECT_PATCHED__ = true;

        console.log(
            `${TAG} ✓ PlayerController.select patched.`
        );

        return true;
    }

    function scanBundle() {
        const script = document.querySelector(
            'script[src*="/assets/index-"]'
        );

        if (!script) return false;

        import(script.src)
            .then(module => {
                if (!module) return;

                patchSelectMethod(module);
                refreshBlockHighlight();

                console.log(
                    `${TAG} ✓ Bundle scanned.`
                );
            })
            .catch(err => {
                console.warn(
                    `${TAG} Bundle scan failed:`,
                    err
                );
            });

        return true;
    }

    window.addEventListener(
        'message',
        event => {
            if (
                event.data?.type ===
                'MINIBLOX_REFRESH_BLOCK_HIGHLIGHT'
            ) {
                refreshBlockHighlight();
            }
        }
    );

    let bundleStarted = false;

    const interval = setInterval(() => {
        if (!bundleStarted) {
            bundleStarted = scanBundle();
        }

        refreshBlockHighlight();

        if (
            bundleStarted &&
            window.miniblox &&
            window.miniblox.player?.selectBox &&
            window.__MF_BLOCK_HIGHLIGHT_SELECT_PATCHED__
        ) {
            clearInterval(interval);

            console.log(
                `${TAG} ✓ Block Highlight ready.`
            );
        }
    }, 500);

    document.addEventListener(
        'minifeather:block-highlight-config',
        event => {
            let config; 
            try {
                config =
                    typeof event.detail === 'string'
                        ? JSON.parse(event.detail)
                        : event.detail;
            } catch (_) {
                console.warn(
                    `${TAG} Invalid Block Highlight config.`
                );  
                return;
            }   
            if (
                !config ||
                typeof config !== 'object'
            ) {
                return;
            }   
            if (
                typeof config.enabled === 'boolean'
            ) {
                localStorage.setItem(
                    'miniblox_blockhighlight',
                    config.enabled
                        ? 'true'
                        : 'false'
                );
            }   
            if (
                typeof config.color === 'string' &&
                /^#[0-9a-fA-F]{6}$/.test(
                    config.color
                )
            ) {
                localStorage.setItem(
                    'miniblox_blockhighlight_color',
                    config.color
                );
            }   
            if (
                Number.isFinite(
                    Number(config.thickness)
                )
            ) {
                const thickness = Math.max(
                    1,
                    Math.min(
                        4,
                        Number(config.thickness)
                    )
                );  
                localStorage.setItem(
                    'miniblox_blockhighlight_thickness',
                    String(thickness)
                );
            }   
            refreshBlockHighlight();    
            console.log(
                `${TAG} UI Block Highlight config applied.`
            );
        }
    );

    // Public API for MiniFeather.
    window.MF_FEATURES = {
        refreshBlockHighlight,

        setBlockHighlight(enabled) {
            localStorage.setItem(
                'miniblox_blockhighlight',
                enabled ? 'true' : 'false'
            );

            refreshBlockHighlight();
        },

        setBlockHighlightColor(color) {
            localStorage.setItem(
                'miniblox_blockhighlight_color',
                color
            );

            refreshBlockHighlight();
        },

        setBlockHighlightThickness(thickness) {
            localStorage.setItem(
                'miniblox_blockhighlight_thickness',
                String(thickness)
            );

            refreshBlockHighlight();
        }
    };

    console.log(
        `${TAG} Loaded.`
    );
})();