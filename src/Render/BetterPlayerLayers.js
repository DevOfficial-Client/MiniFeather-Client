(() => {
    'use strict';

    const W = globalThis;
    let enabled = false;
    const injectedFirstPersonParts = new Map();

    const EXTREME = Object.freeze({
        inflate: 0.64,
        nativeInflate: 0.20,
        depth: 0.095,
        alphaThreshold: 8
    });

    const FACE_LAYOUT = Object.freeze([
        { normal: [0, 1, 0],  corners: [[1, 1], [0, 1], [1, 0], [0, 0]] },
        { normal: [0, -1, 0], corners: [[1, 0], [0, 0], [1, 1], [0, 1]] },
        { normal: [0, 0, -1], corners: [[0, 0], [1, 0], [0, 1], [1, 1]] },
        { normal: [0, 0, 1],  corners: [[0, 0], [1, 0], [0, 1], [1, 1]] },
        { normal: [1, 0, 0],  corners: [[0, 1], [0, 0], [1, 1], [1, 0]] },
        { normal: [-1, 0, 0], corners: [[0, 1], [0, 0], [1, 1], [1, 0]] }
    ]);

    const PARTS = Object.freeze([
        { reference: 'head',           overlay: 'head2',            target: 'headPivot' },
        { reference: 'torso',          overlay: 'torso2',           target: 'torso' },
        { reference: 'rightArmTop',    overlay: 'rightArmTop2',     slimOverlay: 'rightArmTopSlim2',    target: 'rightShoulderJoint' },
        { reference: 'rightArmBottom', overlay: 'rightArmBottom2',  slimOverlay: 'rightArmBottomSlim2', target: 'rightElbowJoint' },
        { reference: 'leftArmTop',     overlay: 'leftArmTop2',      slimOverlay: 'leftArmTopSlim2',     target: 'leftShoulderJoint' },
        { reference: 'leftArmBottom',  overlay: 'leftArmBottom2',   slimOverlay: 'leftArmBottomSlim2',  target: 'leftElbowJoint' },
        { reference: 'rightLegTop',    overlay: 'rightLegTop2',     target: 'rightHipJoint' },
        { reference: 'rightLegBottom', overlay: 'rightLegBottom2',  target: 'rightKneeJoint' },
        { reference: 'leftLegTop',     overlay: 'leftLegTop2',      target: 'leftHipJoint' },
        { reference: 'leftLegBottom',  overlay: 'leftLegBottom2',   target: 'leftKneeJoint' }
    ]);

    const state = {
        game: null,
        entity: null,
        mesh: null,
        signature: '',
        bindings: [],
        firstPerson: {
            renderer: null,
            arm: null,
            generated: null,
            geometry: null,
            material: null,
            signature: ''
        }
    };

    const isGame = value => Boolean(value && typeof value === 'object' && value.player && value.world);

    function findGameInReact(element) {
        if (!element) return null;

        let keys;
        try {
            keys = Object.keys(element);
        } catch {
            return null;
        }

        for (const key of keys) {
            if (!key.startsWith('__reactFiber$') &&
                !key.startsWith('__reactContainer$') &&
                !key.startsWith('__reactInternalInstance$')) continue;

            let root;
            try {
                root = element[key];
            } catch {
                continue;
            }

            const queue = [root];
            const visited = new Set();
            let scanned = 0;

            while (queue.length && scanned++ < 1000) {
                const fiber = queue.shift();
                if (!fiber || visited.has(fiber)) continue;
                visited.add(fiber);

                const candidates = [
                    fiber.stateNode,
                    fiber.stateNode?.game,
                    fiber.memoizedProps,
                    fiber.memoizedProps?.game,
                    fiber.pendingProps,
                    fiber.pendingProps?.game,
                    fiber.memoizedState,
                    fiber.memoizedState?.game
                ];

                for (const candidate of candidates) {
                    if (isGame(candidate)) return candidate;
                    if (isGame(candidate?.game)) return candidate.game;
                }

                if (fiber.child) queue.push(fiber.child);
                if (fiber.sibling) queue.push(fiber.sibling);
            }
        }

        return null;
    }

    function findGame() {
        for (const candidate of [W.Game, W.game, W.__MINIBLOX_GAME__, state.game]) {
            if (isGame(candidate)) return candidate;
        }

        const game = findGameInReact(document.querySelector('#react'));
        if (game) W.__MINIBLOX_GAME__ = game;
        return game;
    }

    function findLocalEntity(game) {
        const player = game?.player;
        if (!player) return null;

        const id = player.id;

        for (const getter of [
            () => game.world?.getPlayerById?.(id),
            () => game.world?.players?.get?.(id),
            () => game.world?.entities?.get?.(id)
        ]) {
            try {
                const entity = getter();
                if (entity?.mesh) return entity;
            } catch {}
        }

        return null;
    }

    function firstMaterial(material) {
        return Array.isArray(material) ? material.find(Boolean) ?? null : material ?? null;
    }

    function findHandRenderer(game) {
        try {
            const camera = game?.gameScene?.axesHelper?.parent;
            for (const child of camera?.children ?? []) {
                if (
                    typeof child?.updateArmAnimation === 'function' &&
                    typeof child?.update === 'function' &&
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
        let Type = model?.constructor;
        while (Type) {
            if (typeof Type.addBox === 'function') return Type;
            Type = Object.getPrototypeOf(Type);
        }
        return null;
    }

    function ensureFirstPersonLayerParts(model) {
        if (!model?.parts) return false;

        const Box = findBoxClass(model);
        if (!Box) return false;

        let injected = injectedFirstPersonParts.get(model);
        if (!injected) {
            injected = {};
            injectedFirstPersonParts.set(model, injected);
        }

        try {
            if (!model.parts.rightArm2) {
                const part = Box.addBox(40, 32, 4, 12, 4);
                model.parts.rightArm2 = part;
                injected.rightArm2 = part;
            }

            if (!model.parts.rightArmSlim2) {
                const part = Box.addBox(40, 32, 3, 12, 4);
                model.parts.rightArmSlim2 = part;
                injected.rightArmSlim2 = part;
            }

            return true;
        } catch {
            return false;
        }
    }

    function restoreFirstPersonLayerParts() {
        for (const [model, injected] of injectedFirstPersonParts) {
            if (!model?.parts) continue;

            for (const [name, definition] of Object.entries(injected)) {
                if (model.parts[name] === definition) delete model.parts[name];
            }
        }

        injectedFirstPersonParts.clear();

        const renderer = findHandRenderer(state.game);
        try { renderer?.update?.(true); } catch {}
    }

    function detectSkinny(mesh) {
        const values = [
            mesh?.model?.skin && mesh?.entity?.profile?.cosmetics?.skinny,
            mesh?.entity?.profile?.cosmetics?.skinny,
            mesh?.entity?.profile?.skinny,
            state.game?.player?.profile?.cosmetics?.skinny,
            state.game?.player?.profile?.skinny
        ];

        for (const value of values) {
            if (typeof value === 'boolean') return value;
        }

        const part = mesh?.model?.parts?.rightArmTopSlim2;
        const geometry = mesh?.meshes?.rightArmTop?.geometry;
        if (!part || !geometry?.attributes?.position) return false;

        try {
            geometry.computeBoundingBox?.();
            const box = geometry.boundingBox;
            if (!box) return false;
            return Math.abs(box.max.x - box.min.x) * 16 < 3.9;
        } catch {
            return false;
        }
    }

    function skinSource(mesh) {
        for (const name of ['head', 'torso', 'rightArmTop', 'leftArmTop']) {
            const material = firstMaterial(mesh?.meshes?.[name]?.material);
            if (material?.map) return { material, map: material.map };
        }

        for (const object of Object.values(mesh?.meshes ?? {})) {
            const material = firstMaterial(object?.material);
            if (material?.map) return { material, map: material.map };
        }

        return null;
    }

    function readSkinPixels(map) {
        const image = map?.image;
        if (!image) return null;

        const width = Number(image.width ?? image.videoWidth ?? image.naturalWidth ?? 0);
        const height = Number(image.height ?? image.videoHeight ?? image.naturalHeight ?? 0);
        if (!width || !height) return null;

        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;

        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return null;

        context.imageSmoothingEnabled = false;

        try {
            context.drawImage(image, 0, 0, width, height, 0, 0, 64, 64);
            return context.getImageData(0, 0, 64, 64).data;
        } catch {
            return null;
        }
    }

    function pixelAlpha(pixels, x, y) {
        if (!pixels || x < 0 || y < 0 || x >= 64 || y >= 64) return 0;
        return pixels[(y * 64 + x) * 4 + 3];
    }

    function overlayDefinition(mesh, layout, skinny) {
        const name = skinny && layout.slimOverlay ? layout.slimOverlay : layout.overlay;
        const definition = mesh?.model?.parts?.[name];
        return definition?.uvs?.length === 6 ? { name, definition } : null;
    }

    function vertexPosition(attribute, index) {
        return [attribute.getX(index), attribute.getY(index), attribute.getZ(index)];
    }

    function bilinear(corners, layout, u, v) {
        let p00 = null;
        let p10 = null;
        let p01 = null;
        let p11 = null;

        for (let i = 0; i < 4; i++) {
            const [cu, cv] = layout.corners[i];
            const point = corners[i];
            if (cu === 0 && cv === 0) p00 = point;
            else if (cu === 1 && cv === 0) p10 = point;
            else if (cu === 0 && cv === 1) p01 = point;
            else if (cu === 1 && cv === 1) p11 = point;
        }

        if (!p00 || !p10 || !p01 || !p11) return null;

        const a = (1 - u) * (1 - v);
        const b = u * (1 - v);
        const c = (1 - u) * v;
        const d = u * v;

        return [
            p00[0] * a + p10[0] * b + p01[0] * c + p11[0] * d,
            p00[1] * a + p10[1] * b + p01[1] * c + p11[1] * d,
            p00[2] * a + p10[2] * b + p01[2] * c + p11[2] * d
        ];
    }

    function shifted(point, normal, amount) {
        return [
            point[0] + normal[0] * amount,
            point[1] + normal[1] * amount,
            point[2] + normal[2] * amount
        ];
    }

    function textureQuad(x, y) {
        const u0 = x / 64;
        const u1 = (x + 1) / 64;
        const v0 = 1 - y / 64;
        const v1 = 1 - (y + 1) / 64;
        return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    }

    function pushQuad(positions, uvs, indices, points, texcoords) {
        const base = positions.length / 3;

        for (let i = 0; i < 4; i++) {
            positions.push(points[i][0], points[i][1], points[i][2]);
            uvs.push(texcoords[i][0], texcoords[i][1]);
        }

        indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }

    function pushTile(positions, uvs, indices, outer, normal, texcoords) {
        const depth = EXTREME.depth / 16;
        const inner = outer.map(point => shifted(point, normal, -depth));

        pushQuad(positions, uvs, indices, outer, texcoords);

        const centerU = (texcoords[0][0] + texcoords[2][0]) * 0.5;
        const centerV = (texcoords[0][1] + texcoords[2][1]) * 0.5;
        const sideUv = [[centerU, centerV], [centerU, centerV], [centerU, centerV], [centerU, centerV]];

        pushQuad(positions, uvs, indices, [outer[0], outer[1], inner[0], inner[1]], sideUv);
        pushQuad(positions, uvs, indices, [outer[1], outer[3], inner[1], inner[3]], sideUv);
        pushQuad(positions, uvs, indices, [outer[3], outer[2], inner[3], inner[2]], sideUv);
        pushQuad(positions, uvs, indices, [outer[2], outer[0], inner[2], inner[0]], sideUv);
    }

    function sourcePixel(start, length, index) {
        return length >= 0 ? start + index : start - index - 1;
    }

    function buildGeometry(referenceGeometry, overlay, pixels) {
        const position = referenceGeometry?.attributes?.position;
        if (!position || position.count < 48) return null;

        const overlayStart = position.count - 24;
        const extraInflate = Math.max(0, EXTREME.inflate - EXTREME.nativeInflate) / 16;
        const positions = [];
        const uvs = [];
        const indices = [];

        for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
            const face = FACE_LAYOUT[faceIndex];
            const uv = overlay.definition.uvs[faceIndex];
            if (!uv || uv.length < 4) continue;

            const [startX, startY, widthSigned, heightSigned] = uv;
            const width = Math.abs(Math.round(widthSigned));
            const height = Math.abs(Math.round(heightSigned));
            if (!width || !height) continue;

            const corners = [0, 1, 2, 3].map(i => vertexPosition(position, overlayStart + faceIndex * 4 + i));

            for (let py = 0; py < height; py++) {
                const sy = sourcePixel(startY, heightSigned, py);
                if (sy < 0 || sy >= 64) continue;

                const ty0 = py / height;
                const ty1 = (py + 1) / height;
                const vTop = 1 - ty0;
                const vBottom = 1 - ty1;

                for (let px = 0; px < width; px++) {
                    const sx = sourcePixel(startX, widthSigned, px);
                    if (sx < 0 || sx >= 64) continue;
                    if (pixelAlpha(pixels, sx, sy) < EXTREME.alphaThreshold) continue;

                    const u0 = px / width;
                    const u1 = (px + 1) / width;

                    const quad = [
                        bilinear(corners, face, u0, vTop),
                        bilinear(corners, face, u1, vTop),
                        bilinear(corners, face, u0, vBottom),
                        bilinear(corners, face, u1, vBottom)
                    ];

                    if (quad.some(point => !point)) continue;

                    const outer = quad.map(point => shifted(point, face.normal, extraInflate));
                    pushTile(positions, uvs, indices, outer, face.normal, textureQuad(sx, sy));
                }
            }
        }

        if (!positions.length) return null;

        try {
            const Geometry = referenceGeometry.constructor;
            const PositionAttribute = referenceGeometry.attributes.position.constructor;
            const UVAttribute = referenceGeometry.attributes.uv?.constructor ?? PositionAttribute;
            const geometry = new Geometry();

            geometry.setAttribute('position', new PositionAttribute(new Float32Array(positions), 3));
            geometry.setAttribute('uv', new UVAttribute(new Float32Array(uvs), 2));
            geometry.setIndex(indices);
            geometry.computeVertexNormals?.();
            geometry.computeBoundingBox?.();
            geometry.computeBoundingSphere?.();
            return geometry;
        } catch {
            return null;
        }
    }

    function cloneMaterial(reference) {
        const source = firstMaterial(reference?.material) ?? skinSource(state.mesh)?.material;
        if (!source) return null;

        try {
            const material = source.clone();
            material.map = source.map;
            material.transparent = true;
            material.alphaTest = EXTREME.alphaThreshold / 255;
            material.depthWrite = true;
            material.side = 2;
            material.needsUpdate = true;
            return material;
        } catch {
            return null;
        }
    }

    function copyLocalTransform(source, target) {
        try { target.position.copy(source.position); } catch {}
        try { target.quaternion.copy(source.quaternion); } catch {}
        try { target.scale.copy(source.scale); } catch {}
        try { target.renderOrder = (source.renderOrder ?? 0) + 2; } catch {}
    }

    function materialSignature(material) {
        const source = firstMaterial(material);
        const map = source?.map;
        const image = map?.image;
        return [
            source?.uuid ?? '',
            map?.uuid ?? '',
            image?.currentSrc ?? image?.src ?? '',
            String(image?.width ?? image?.naturalWidth ?? ''),
            String(image?.height ?? image?.naturalHeight ?? '')
        ].join(':');
    }

    function firstPersonSignature(renderer, mesh) {
        const arm = renderer?.rightArm;
        return [
            renderer?.uuid ?? '',
            arm?.uuid ?? '',
            arm?.geometry?.uuid ?? '',
            materialSignature(arm?.material),
            mesh?.model?.skin ?? '',
            String(detectSkinny(mesh))
        ].join('|');
    }

    function cleanupFirstPerson() {
        const fp = state.firstPerson;

        try { fp.generated?.removeFromParent?.(); } catch {}
        try { fp.geometry?.dispose?.(); } catch {}
        try { fp.material?.dispose?.(); } catch {}

        fp.renderer = null;
        fp.arm = null;
        fp.generated = null;
        fp.geometry = null;
        fp.material = null;
        fp.signature = '';
    }

    function rebuildFirstPerson(renderer, mesh) {
        const model = mesh?.model;
        if (!renderer || !model?.parts) return false;
        if (!ensureFirstPersonLayerParts(model)) return false;

        let arm = renderer.rightArm;
        let vertexCount = arm?.geometry?.attributes?.position?.count ?? 0;

        if (vertexCount < 48) {
            try { renderer.update(true); } catch {}
            arm = renderer.rightArm;
            vertexCount = arm?.geometry?.attributes?.position?.count ?? 0;
        }

        if (!arm?.geometry || vertexCount < 48) return false;

        const sourceMaterial = firstMaterial(arm.material);
        const pixels = readSkinPixels(sourceMaterial?.map ?? skinSource(mesh)?.map);
        if (!pixels) return false;

        const skinny = detectSkinny(mesh);
        const overlayName = skinny ? 'rightArmSlim2' : 'rightArm2';
        const definition = model.parts[overlayName];
        if (!definition?.uvs?.length) return false;

        const geometry = buildGeometry(arm.geometry, { definition }, pixels);
        if (!geometry) return false;

        const material = cloneMaterial(arm);
        if (!material) {
            try { geometry.dispose?.(); } catch {}
            return false;
        }

        let generated;
        try {
            generated = new arm.constructor(geometry, material);
        } catch {
            try { geometry.dispose?.(); } catch {}
            try { material.dispose?.(); } catch {}
            return false;
        }

        generated.name = 'MiniFeatherBetterPlayerLayers:firstPersonRightArm';
        generated.frustumCulled = false;
        generated.castShadow = false;
        generated.receiveShadow = false;
        generated.renderOrder = (arm.renderOrder ?? 0) + 2;

        try {
            arm.add(generated);
        } catch {
            try { geometry.dispose?.(); } catch {}
            try { material.dispose?.(); } catch {}
            return false;
        }

        const fp = state.firstPerson;
        fp.renderer = renderer;
        fp.arm = arm;
        fp.generated = generated;
        fp.geometry = geometry;
        fp.material = material;
        fp.signature = firstPersonSignature(renderer, mesh);
        return true;
    }

    function synchronizeFirstPerson(game, mesh) {
        const renderer = findHandRenderer(game);
        if (!renderer) {
            if (state.firstPerson.generated) cleanupFirstPerson();
            return;
        }

        if (!ensureFirstPersonLayerParts(mesh?.model)) return;

        let arm = renderer.rightArm;
        if ((arm?.geometry?.attributes?.position?.count ?? 0) < 48) {
            try { renderer.update(true); } catch {}
            arm = renderer.rightArm;
        }

        const signature = firstPersonSignature(renderer, mesh);
        const fp = state.firstPerson;
        const detached = fp.generated && fp.generated.parent !== arm;
        const changed = renderer !== fp.renderer || arm !== fp.arm || signature !== fp.signature;

        if (!fp.generated || detached || changed) {
            cleanupFirstPerson();
            rebuildFirstPerson(renderer, mesh);
        }
    }

    function modelSignature(mesh) {
        const values = [
            mesh?.uuid ?? '',
            mesh?.model?.skin ?? '',
            String(mesh?.entity?.profile?.cosmetics?.skin ?? ''),
            String(detectSkinny(mesh))
        ];

        for (const layout of PARTS) {
            const reference = mesh?.meshes?.[layout.reference];
            values.push(
                reference?.geometry?.uuid ?? '',
                firstMaterial(reference?.material)?.map?.uuid ?? ''
            );
        }

        return values.join('|');
    }

    function cleanup() {
        for (const binding of state.bindings) {
            try { binding.generated?.removeFromParent?.(); } catch {}
            try { binding.geometry?.dispose?.(); } catch {}
            try { binding.material?.dispose?.(); } catch {}
        }

        state.bindings = [];
        state.signature = '';
    }

    function build(mesh) {
        const source = skinSource(mesh);
        if (!source?.map || !mesh?.model?.parts) return false;

        const pixels = readSkinPixels(source.map);
        if (!pixels) return false;

        const skinny = detectSkinny(mesh);
        const bindings = [];

        for (const layout of PARTS) {
            const reference = mesh?.meshes?.[layout.reference];
            const target = mesh?.[layout.target];
            const overlay = overlayDefinition(mesh, layout, skinny);

            if (!reference?.geometry || !target?.add || !overlay) continue;

            const geometry = buildGeometry(reference.geometry, overlay, pixels);
            if (!geometry) continue;

            const material = cloneMaterial(reference);
            if (!material) {
                try { geometry.dispose?.(); } catch {}
                continue;
            }

            let generated;
            try {
                generated = new reference.constructor(geometry, material);
            } catch {
                try { geometry.dispose?.(); } catch {}
                try { material.dispose?.(); } catch {}
                continue;
            }

            copyLocalTransform(reference, generated);
            generated.name = `MiniFeatherBetterPlayerLayers:${layout.reference}`;
            generated.frustumCulled = false;
            generated.castShadow = false;
            generated.receiveShadow = reference.receiveShadow ?? false;

            try {
                target.add(generated);
            } catch {
                try { geometry.dispose?.(); } catch {}
                try { material.dispose?.(); } catch {}
                continue;
            }

            bindings.push({ generated, geometry, material, target });
        }

        if (!bindings.length) return false;

        state.bindings = bindings;
        state.signature = modelSignature(mesh);
        return true;
    }

    function syncVisibility() {
        const mesh = state.mesh;
        if (!mesh) return;

        const visible = mesh.visible !== false &&
            mesh.skeleton?.visible !== false &&
            (mesh.skinnedBody ? mesh.skinnedBody.visible !== false : true);

        for (const binding of state.bindings) {
            binding.generated.visible = visible && binding.target?.visible !== false;
        }
    }

    function synchronize() {
        if (!enabled) return;

        const game = findGame();
        if (!game?.player) {
            cleanup();
            cleanupFirstPerson();
            state.game = null;
            state.entity = null;
            state.mesh = null;
            return;
        }

        const entity = findLocalEntity(game);
        const mesh = entity?.mesh;
        if (!mesh?.meshes || !mesh?.model?.parts) return;

        const meshChanged = mesh !== state.mesh;
        state.game = game;
        state.entity = entity;
        state.mesh = mesh;

        const signature = modelSignature(mesh);
        if (meshChanged || signature !== state.signature) {
            cleanup();
            build(mesh);
        }

        syncVisibility();
        synchronizeFirstPerson(game, mesh);
    }

    function setEnabled(value) {
        const next = Boolean(value);
        if (enabled === next) {
            if (enabled) synchronize();
            return;
        }

        enabled = next;

        if (enabled) {
            synchronize();
            return;
        }

        cleanup();
        cleanupFirstPerson();
        restoreFirstPersonLayerParts();
        state.game = null;
        state.entity = null;
        state.mesh = null;
    }

    document.addEventListener('minifeather:better-player-layers-config', event => {
        let detail = event.detail;

        try {
            if (typeof detail === 'string') detail = JSON.parse(detail);
        } catch {
            detail = null;
        }

        setEnabled(detail?.enabled === true);
    });

    W.setInterval(synchronize, 250);
})();
