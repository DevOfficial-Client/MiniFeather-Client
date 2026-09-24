
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
            void 0;
        }

        return game;
    }

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

                if (level >= 5) {
                    const d9 = localD * 3.7;

                    offsets.push(
                        [d9, 0, 0],
                        [-d9, 0, 0],
                        [0, d9, 0],
                        [0, -d9, 0],
                        [0, 0, d9],
                        [0, 0, -d9],

                        [d9, d9, 0],
                        [-d9, d9, 0],
                        [d9, -d9, 0],
                        [-d9, -d9, 0],

                        [0, d9, d9],
                        [0, -d9, d9],
                        [0, d9, -d9],
                        [0, -d9, -d9],

                        [d9, 0, d9],
                        [-d9, 0, d9],
                        [d9, 0, -d9],
                        [-d9, 0, -d9]
                    );
                }

                if (level >= 6) {
                    const d10 = localD * 4.4;

                    offsets.push(
                        [d10, 0, 0],
                        [-d10, 0, 0],
                        [0, d10, 0],
                        [0, -d10, 0],
                        [0, 0, d10],
                        [0, 0, -d10],

                        [d10, d10, 0],
                        [-d10, d10, 0],
                        [d10, -d10, 0],
                        [-d10, -d10, 0],

                        [0, d10, d10],
                        [0, -d10, d10],
                        [0, d10, -d10],
                        [0, -d10, -d10],

                        [d10, 0, d10],
                        [-d10, 0, d10],
                        [d10, 0, -d10],
                        [-d10, 0, -d10],

                        [d10, d10, d10],
                        [-d10, d10, d10],
                        [d10, -d10, d10],
                        [-d10, -d10, d10],

                        [d10, d10, -d10],
                        [-d10, d10, -d10],
                        [d10, -d10, -d10],
                        [-d10, -d10, -d10]
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

    // HSV→RGB (componentes 0..1) para el degradado por vértice.
    function hsvToRgb(h) {
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const q = 1 - f;
        switch (i % 6) {
            case 0: return [1, f, 0];
            case 1: return [q, 1, 0];
            case 2: return [0, 1, f];
            case 3: return [0, q, 1];
            case 4: return [f, 0, 1];
            default: return [1, 0, q];
        }
    }

    // ── Arcoíris "rotando" alrededor del cuadrado ──
    // El hue de cada vértice deriva de su ángulo alrededor del eje Y
    // (más un leve término espiral vertical). Con el offset temporal los
    // colores recorren el perímetro como si el contorno estuviera girando
    // (ciclo 2.5s). Los hijos de thickness comparten geometría → heredan
    // el efecto solos.
    function applyRainbowBox(selectBox, now) {
        const geo = selectBox.geometry;
        const pos = geo?.attributes?.position;
        if (!pos) return;

        const count = pos.count;

        // Hue base por vértice (cacheado; la geometría es estática):
        // ángulo alrededor del eje Y → los colores recorren el perímetro.
        // Término espiral suave para que las aristas verticales fluyan.
        let param = geo.__mfRainbowParam;
        if (!param || param.length !== count) {
            param = new Float32Array(count);
            const pa = pos.array;
            let minY = Infinity;
            let maxY = -Infinity;
            for (let i = 0; i < count; i++) {
                const y = pa[i * 3 + 1];
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
            const spanY = maxY - minY || 1;
            for (let i = 0; i < count; i++) {
                const angle =
                    Math.atan2(pa[i * 3 + 2], pa[i * 3]) /
                        (Math.PI * 2) +
                    0.5;
                const h =
                    (pa[i * 3 + 1] - minY) / spanY;
                param[i] = angle + h * 0.125;
            }
            geo.__mfRainbowParam = param;
        }

        // Atributo de color por vértice
        let colAttr = geo.attributes.color;
        if (!colAttr || colAttr.count !== count) {
            colAttr = new pos.constructor(
                new Float32Array(count * 3),
                3
            );
            geo.setAttribute('color', colAttr);
        }

        const offset = (now / 2500) % 1; // "giro" temporal
        const ca = colAttr.array;
        const norm = h => ((h % 1) + 1) % 1;
        for (let i = 0; i < count; i += 2) {
            const h1 = param[i] + offset;
            let h2 = i + 1 < count
                ? param[i + 1] + offset
                : h1;
            // Camino más corto en el círculo de hue: evita el salto de
            // color en la arista que cierra el ciclo del perímetro.
            while (h2 - h1 > 0.5) h2 -= 1;
            while (h2 - h1 < -0.5) h2 += 1;
            const [r, g, b] = hsvToRgb(norm(h1));
            ca[i * 3] = r;
            ca[i * 3 + 1] = g;
            ca[i * 3 + 2] = b;
            if (i + 1 < count) {
                const [r2, g2, b2] = hsvToRgb(norm(h2));
                ca[i * 3 + 3] = r2;
                ca[i * 3 + 4] = g2;
                ca[i * 3 + 5] = b2;
            }
        }
        colAttr.needsUpdate = true;

        // vertexColors ON + color base blanco (la multiplicación del
        // shader no debe teñir el degradado) en el material y los hijos.
        const mats = [selectBox.material];
        if (selectBox._thickChildren) {
            for (const child of selectBox._thickChildren) {
                if (child?.material) mats.push(child.material);
            }
        }
        for (const m of mats) {
            if (!m) continue;
            m.vertexColors = true;
            if (m.color) m.color.set('#ffffff');
            m.needsUpdate = true;
        }
        selectBox.__mfRainbowOn = true;
    }

    // Apaga vertexColors al desactivar rainbow (guard: solo si estaba ON).
    function clearRainbowBox(selectBox) {
        if (!selectBox.__mfRainbowOn) return;
        selectBox.__mfRainbowOn = false;
        const mats = [selectBox.material];
        if (selectBox._thickChildren) {
            for (const child of selectBox._thickChildren) {
                if (child?.material) mats.push(child.material);
            }
        }
        for (const m of mats) {
            if (!m) continue;
            m.vertexColors = false;
            m.needsUpdate = true;
        }
    }

    function rainbowActive() {
        try {
            return (
                localStorage.getItem(
                    'miniblox_blockhighlight_rainbow'
                ) === 'true'
            );
        } catch (_) {
            return false;
        }
    }

    // Aplica el color al material del selectBox Y a los hijos de thickness
    // (cada nivel >1 crea LineSegments con material propio horneado —
    // recolorear solo el padre no cambia nada visible).
    function recolorBox(selectBox, color) {
        if (selectBox.material?.color) {
            selectBox.material.color.set(color);
        }
        if (selectBox._thickChildren) {
            for (const child of selectBox._thickChildren) {
                if (child?.material?.color) {
                    child.material.color.set(color);
                }
            }
        }
    }

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

            const rainbow = rainbowActive();

            const color = rainbow
                ? '#ffffff' // neutro: el degradado vive en los vértices
                : localStorage.getItem(
                      'miniblox_blockhighlight_color'
                  ) || '#ffffff';

            const thickness =
                localStorage.getItem(
                    'miniblox_blockhighlight_thickness'
                ) || '1';

            // Primero thickness (crea/recolorea hijos con el color dado),
            // luego el arcoíris sobre todo (así los hijos nuevos ya entran
            // con vertexColors en el mismo frame).
            applySelectBoxThickness(
                selectBox,
                thickness,
                color
            );

            if (rainbow) {
                applyRainbowBox(
                    selectBox,
                    performance.now()
                );
            } else {
                clearRainbowBox(selectBox);
                recolorBox(selectBox, color);
            }

            return true;
        } catch (err) {
            console.warn(
                `${TAG} Refresh error:`,
                err
            );

            return false;
        }
    }

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

        void 0;

        return true;
    }

    const MAX_BUNDLE_ATTEMPTS = 10;

    let bundleAttempts = 0;
    let bundleExhausted = false;

    function scanBundle() {
        const script = document.querySelector(
            'script[src*="/assets/index-"]'
        );

        if (!script || !document.querySelector('canvas')) {
            return false;
        }

        if (bundleExhausted) return true;

        bundleAttempts++;

        import(script.src)
            .then(module => {
                try {
                    if (!module) return;

                    patchSelectMethod(module);
                    refreshBlockHighlight();

                    void 0;
                } catch (err) {
                    console.warn(
                        `${TAG} Bundle module error:`,
                        err
                    );
                }
            })
            .catch(err => {
                if (bundleAttempts >= MAX_BUNDLE_ATTEMPTS) {
                    bundleExhausted = true;

                    console.warn(
                        `${TAG} Bundle scan skipped after ${bundleAttempts} attempts:`,
                        err?.message || err
                    );
                } else {
                    
                    bundleStarted = false;
                }
            });

        return true;
    }

    window.addEventListener(
        'message',
        onHighlightMessage
    );

    function onHighlightMessage(event) {
        if (
            event.data?.type ===
            'MINIBLOX_REFRESH_BLOCK_HIGHLIGHT'
        ) {
            refreshBlockHighlight();
        }
    }

    let bundleStarted = false;
    let intervalTicks = 0;
    const MAX_INTERVAL_TICKS = 120; 

    const interval = setInterval(() => {
        intervalTicks++;

        if (!bundleStarted) {
            bundleStarted = scanBundle();
        }

        refreshBlockHighlight();

        const ready =
            window.miniblox &&
            window.miniblox.player?.selectBox;

        if (
            (ready &&
                window
                    .__MF_BLOCK_HIGHLIGHT_SELECT_PATCHED__) ||
            intervalTicks >= MAX_INTERVAL_TICKS
        ) {
            clearInterval(interval);

            void 0;
        }
    }, 500);

    // ── Modo arcoíris del block highlight ──
    // El color lo calcula refreshBlockHighlight() en cada refresh (corre
    // tras cada select() del juego), leyendo localStorage. Aquí solo
    // persistimos la preferencia y forzamos un refresh inmediato.
    function setRainbow(on) {
        localStorage.setItem(
            'miniblox_blockhighlight_rainbow',
            on ? 'true' : 'false'
        );
        refreshBlockHighlight();
    }

    function onHighlightConfig(event) {
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
        if (typeof config.rainbow === 'boolean') {
            setRainbow(config.rainbow);
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
                    6,
                    Number(config.thickness)
                )
            );
            localStorage.setItem(
                'miniblox_blockhighlight_thickness',
                String(thickness)
            );
        }
        refreshBlockHighlight();
        void 0;
    }
    document.addEventListener(
        'minifeather:block-highlight-config',
        onHighlightConfig
    );

    // Guard de re-inyección: destruye interval y listeners del scope
    // anterior antes de que este re-registre los suyos.
    try { window.__MF_FEATURES_SCOPE__?.destroy?.(); } catch (_) {}
    window.__MF_FEATURES_SCOPE__ = {
        destroy() {
            clearInterval(interval);
            window.removeEventListener('message', onHighlightMessage);
            document.removeEventListener(
                'minifeather:block-highlight-config',
                onHighlightConfig
            );
        }
    };

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

    void 0;
})();