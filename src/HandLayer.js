(function () {
    'use strict';

    const TAG = '[MiniFeather HandLayer]';
    const patched = new WeakSet();

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

    function findBoxClass(model) {
        let C = model.constructor;
        while (C) {
            if (typeof C.addBox === 'function') return C;
            C = Object.getPrototypeOf(C);
        }
        return null;
    }

    setInterval(() => {
        const game = getGame();
        if (!game?.player) return;

        let mesh = null;
        try {
            mesh = game.player.cxIyHVwkzsfbax?.() ?? game.player.mesh;
        } catch {}
        const model = mesh?.model;
        if (!model?.parts || patched.has(model)) return;

        const Box = findBoxClass(model);
        if (!Box) return;

        try {
            if (!('rightArm2' in model.parts)) model.parts.rightArm2 = Box.addBox(40, 32, 4, 12, 4);
            if (!('rightArmSlim2' in model.parts)) model.parts.rightArmSlim2 = Box.addBox(40, 32, 3, 12, 4);
            if (!('leftArm2' in model.parts)) model.parts.leftArm2 = Box.addBox(48, 48, 4, 12, 4);
            if (!('leftArmSlim2' in model.parts)) model.parts.leftArmSlim2 = Box.addBox(48, 48, 3, 12, 4);
        } catch (e) {
            return;
        }
        patched.add(model);

        try {
            const cam = game.gameScene?.axesHelper?.parent;
            for (const child of cam?.children ?? []) {
                if (
                    typeof child?.updateArmAnimation === 'function' &&
                    child.rightArm &&
                    child.item
                ) {
                    child.armSkin = null;
                    break;
                }
            }
        } catch {}

        console.log(TAG + ' overlay layer habilitada en primera persona.');
    }, 1500);
})();
