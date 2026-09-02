(function () {
    'use strict';

    const TAG = '[MiniFeather HandLayer]';
    const patchedModels = new WeakSet();
    const failedModels = new WeakMap();
    let warnedNoModel = false;
    let warnedNoLf = false;

    console.log(TAG + ' cargado, monitorizando...');

    function getGame() {
        if (globalThis.miniblox?.player) return globalThis.miniblox;
        try {
            const react = document.querySelector('#react');
            if (!react) return null;
            for (const root of Object.values(react)) {
                const game = root?.updateQueue?.baseState?.element?.props?.game;
                if (game?.player) return game;
            }
        } catch {}
        return null;
    }

    function findHandRenderer(game) {
        try {
            const cam = game?.gameScene?.axesHelper?.parent;
            for (const child of cam?.children ?? []) {
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

    function findBoxClass(model) {
        let C = model.constructor;
        while (C) {
            if (typeof C.addBox === 'function') return C;
            C = Object.getPrototypeOf(C);
        }
        return null;
    }

    function scanForPlayerModel(root) {
        const seen = new Set();
        const queue = [root];
        const found = [];
        let visited = 0;
        while (queue.length && visited < 20000) {
            const node = queue.pop();
            if (!node || seen.has(node)) continue;
            seen.add(node);
            visited++;
            const m = node.model;
            if (m?.parts && 'rightArmTop2' in m.parts) found.push(m);
            if (node.children) {
                for (let i = 0; i < node.children.length; i++) queue.push(node.children[i]);
            }
        }
        return found;
    }

    function findModel(game, lf) {
        let mesh = null;
        try {
            mesh = game.player.cxIyHVwkzsfbax?.() ?? game.player.mesh;
        } catch {}
        if (mesh?.model?.parts) return mesh.model;

        const candidates = scanForPlayerModel(game.gameScene);
        if (candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];

        try {
            const armMat = lf?.rightArm?.material;
            for (const m of candidates) {
                if (m.initMesh('rightArm')?.material === armMat) return m;
            }
        } catch {}
        return candidates[0];
    }

    function sleeveAlphaRatio(mat) {
        try {
            const img = mat?.map?.image;
            if (!img?.width || !img?.height) return null;
            const c = document.createElement('canvas');
            c.width = 4;
            c.height = 12;
            const g = c.getContext('2d', { willReadFrequently: true });
            const r = img.width / 64;
            g.drawImage(img, 40 * r, 32 * r, 4 * r, 12 * r, 0, 0, 4, 12);
            const d = g.getImageData(0, 0, 4, 12).data;
            let n = 0;
            for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
            return n / 48;
        } catch {
            return null;
        }
    }

    setInterval(() => {
        const game = getGame();
        if (!game?.player || !game.gameScene) return;

        const lf = findHandRenderer(game);
        if (!lf?.rightArm?.geometry) {
            if (!warnedNoLf) {
                warnedNoLf = true;
                console.warn(TAG + ' hand renderer aun no disponible, esperando...');
            }
            return;
        }

        const model = findModel(game, lf);
        if (!model) {
            if (!warnedNoModel) {
                warnedNoModel = true;
                console.warn(TAG + ' no se encontro el modelo del player en la escena.');
            }
            return;
        }

        if (!patchedModels.has(model)) {
            if ((failedModels.get(model) ?? 0) >= 3) return;
            const Box = findBoxClass(model);
            if (!Box) {
                console.warn(TAG + ' addBox no encontrado en la cadena del modelo.');
                return;
            }
            try {
                if (!('rightArm2' in model.parts)) model.parts.rightArm2 = Box.addBox(40, 32, 4, 12, 4);
                if (!('rightArmSlim2' in model.parts)) model.parts.rightArmSlim2 = Box.addBox(40, 32, 3, 12, 4);
                if (!('leftArm2' in model.parts)) model.parts.leftArm2 = Box.addBox(48, 48, 4, 12, 4);
                if (!('leftArmSlim2' in model.parts)) model.parts.leftArmSlim2 = Box.addBox(48, 48, 3, 12, 4);
                const probe = model.initMesh('rightArm');
                const probeCnt = probe.geometry?.attributes?.position?.count ?? 0;
                if (probeCnt >= 48) {
                    probe.geometry.dispose();
                } else {
                    delete model.parts.rightArm2;
                    delete model.parts.rightArmSlim2;
                    delete model.parts.leftArm2;
                    delete model.parts.leftArmSlim2;
                    failedModels.set(model, (failedModels.get(model) ?? 0) + 1);
                    console.warn(TAG + ' initMesh no genero overlay (verts=' + probeCnt + '), intento ' + failedModels.get(model) + '/3');
                    return;
                }
            } catch (e) {
                console.warn(TAG + ' error parcheando modelo:', e);
                return;
            }
            patchedModels.add(model);
        }

        const cnt = lf.rightArm.geometry.attributes.position?.count ?? 0;

        // sincronizar material: si el juego cargo/actualizo la skin del brazo
        // original despues de nuestro rebuild, copiarla al mesh overlay
        try {
            const orig = lf.__mfOrigArm;
            if (orig && lf.rightArm.material !== orig.material) {
                lf.rightArm.material = orig.material;
                lf.armSkin = model.skin;
                const a2 = sleeveAlphaRatio(orig.material);
                console.log(
                    TAG + ' skin de la mano actualizada (skin=' + model.skin +
                    ', alfa manga=' + (a2 === null ? '?' : Math.round(a2 * 100) + '%') + ')'
                );
            }
        } catch {}

        if (cnt >= 48) return;

        try {
            const old = lf.rightArm;
            const neu = model.initMesh('rightArm');
            const neuCnt = neu.geometry?.attributes?.position?.count ?? 0;
            neu.position.copy(old.position);
            neu.quaternion.copy(old.quaternion);
            lf.remove(old);
            // mantener el original en escena oculto: el juego sigue actualizando
            // su material cuando carga la skin, y nosotros lo sincronizamos arriba
            old.visible = false;
            lf.add(old);
            lf.__mfOrigArm = old;
            lf.add(neu);
            lf.rightArm = neu;
            lf.armSkin = model.skin;
            lf.armSkinReady = true;

            if (neuCnt >= 48) {
                const a = sleeveAlphaRatio(neu.material);
                console.log(
                    TAG + ' capa overlay activa (verts ' + cnt + ' -> ' + neuCnt +
                    ', skin=' + model.skin + ', alfa manga=' +
                    (a === null ? '?' : Math.round(a * 100) + '%') + ')'
                );
                if (a !== null && a === 0) {
                    console.warn(TAG + ' tu skin NO tiene pixeles en la zona de manga (40,32)-(44,44); la capa existe pero es transparente.');
                }
            } else {
                console.warn(TAG + ' el rebuild no genero overlay (verts=' + neuCnt + '), skin=' + model.skin);
            }
        } catch (e) {
            console.warn(TAG, e);
        }
    }, 1000);
})();
