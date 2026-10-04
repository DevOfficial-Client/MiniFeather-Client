(() => {
    'use strict';
    const W = globalThis;
    try { W.MF_BetterPlayerLayersArmor?.destroy?.(); } catch {}

    const EVENT = 'minifeather:better-player-layers-config';
    const MAX_VERTICES = 48000;
    const state = {
        manual: false, realistic: false, destroyed: false, game: null,
        armor: new Map(), timer: 0, lastScan: -Infinity, lastGameScan: -Infinity,
        pixels: new WeakMap(), failures: new WeakMap()
    };

    function isEnabled() {
        // A Realistic skin switch must not implicitly turn on armor relief.
        return state.manual || state.realistic || W.MF_BetterPlayerLayers?.getState?.().manualEnabled === true;
    }
    function findGame() {
        for (const game of [W.__MINIBLOX_GAME__, W.__MB?.game, W.Game, W.game, state.game]) {
            if (game?.player && game.world) return game;
        }
        const now = performance.now();
        if (now - state.lastGameScan < 1500) return null;
        state.lastGameScan = now;
        const element = document.querySelector('#react') || document.querySelector('#root');
        if (!element) return null;
        const queue = Object.keys(element).filter(k => /^__react(?:Fiber|Container|InternalInstance)\$/.test(k)).map(k => element[k]);
        const seen = new Set();
        for (let i = 0; i < queue.length && i < 1200; i++) {
            const fiber = queue[i];
            if (!fiber || seen.has(fiber)) continue;
            seen.add(fiber);
            for (const value of [fiber.stateNode, fiber.memoizedProps, fiber.pendingProps, fiber.memoizedState]) {
                for (const game of [value, value?.game]) if (game?.player && game.world) return game;
            }
            if (fiber.child) queue.push(fiber.child);
            if (fiber.sibling) queue.push(fiber.sibling);
        }
        return null;
    }
    function localEntity(game) {
        const id = game?.player?.id;
        for (const get of [() => game?.world?.getPlayerById?.(id), () => game?.world?.players?.get?.(id), () => game?.world?.entities?.get?.(id)]) {
            try { const entity = get(); if (entity?.mesh) return entity; } catch {}
        }
        return game?.player?.mesh ? game.player : null;
    }
    function sourceGeometry(object) {
        return object.__mfFirstPersonGeometry?.source || object.geometry;
    }
    function assignGeometry(object, geometry) {
        const firstPerson = object.__mfFirstPersonGeometry;
        if (firstPerson) {
            // F5 keeps the binding but renders its unfiltered source. Update
            // both pointers then; do not leave a disposed relief on screen.
            const previous = firstPerson.source;
            firstPerson.source = geometry;
            if (object.geometry === previous) object.geometry = geometry;
        }
        else object.geometry = geometry;
    }
    function armorObjects(root) {
        // Use native armor registries, never unknown cosmetics or held items.
        const objects = new Set(), registry = root?.skinnedArmor || root?.armorMesh;
        for (const object of Object.values(registry || {})) {
            if (!object?.geometry || !object.parent || object.userData?._equipped === false) continue;
            if (object.visible === false && !object.__mfFirstPersonGeometry) continue;
            objects.add(object);
        }
        return objects;
    }
    function firstMaterial(object) {
        const material = object.__realMaterial || object.material;
        return Array.isArray(material) ? material.find(Boolean) : material;
    }
    function readTexture(map) {
        const image = map?.image;
        const width = Number(image?.naturalWidth || image?.width || 0), height = Number(image?.naturalHeight || image?.height || 0);
        if (!width || !height) return null;
        const cached = state.pixels.get(map);
        if (cached?.image === image && cached.width === width && cached.height === height) return cached;
        // Logical armor texels, not thousands of HD-pack microvoxels.
        const w = Math.min(64, width), h = Math.max(1, Math.round(height * w / width));
        if (h > 128) return null;
        let data;
        try {
            if (image.data && image.data.length === width * height * 4) {
                data = new Uint8ClampedArray(w * h * 4);
                for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                    const from = (Math.min(height - 1, Math.floor(y * height / h)) * width + Math.floor(x * width / w)) * 4;
                    data.set(image.data.subarray(from, from + 4), (y * w + x) * 4);
                }
            } else {
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) return null;
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(image, 0, 0, width, height, 0, 0, w, h);
                data = ctx.getImageData(0, 0, w, h).data;
            }
        } catch { return null; }
        const pixels = { image, width, height, w, h, data, flipY: map.flipY !== false };
        state.pixels.set(map, pixels);
        return pixels;
    }
    function component(attribute, vertex, channel) {
        if (attribute.array) return attribute.array[vertex * attribute.itemSize + channel];
        if (attribute.data?.array) return attribute.data.array[vertex * attribute.data.stride + attribute.offset + channel];
        return [attribute.getX, attribute.getY, attribute.getZ, attribute.getW][channel].call(attribute, vertex);
    }
    const blend = (v, u, w) => v[0] * (1 - u) * (1 - w) + v[1] * u * (1 - w) + v[2] * (1 - u) * w + v[3] * u * w;
    const point = (corners, u, v) => [0, 1, 2].map(c => blend(corners.map(p => p[c]), u, v));
    const shift = (p, n, d) => p.map((v, i) => v + n[i] * d);

    function pixelDepth(pixels, uv) {
        const x = Math.min(pixels.w - 1, Math.max(0, Math.floor(uv[0] * pixels.w)));
        const y = Math.min(pixels.h - 1, Math.max(0, Math.floor((pixels.flipY ? 1 - uv[1] : uv[1]) * pixels.h)));
        const i = (y * pixels.w + x) * 4;
        if (pixels.data[i + 3] < 8) return -1;
        const light = (pixels.data[i] * 0.2126 + pixels.data[i + 1] * 0.7152 + pixels.data[i + 2] * 0.0722) / 255;
        return (0.06 + Math.round(light * 2) * 0.06) / 16;
    }
    function buildRelief(original, pixels) {
        const attributes = original?.attributes, position = attributes?.position, uv = attributes?.uv, index = original?.index;
        if (!position || !uv || position.count < 4 || position.count % 4 || position.count > 1024) return null;
        // Reject future/custom non-quad topology rather than guessing.
        if (!index || index.count !== position.count / 4 * 6) return null;
        for (let q = 0; q < position.count / 4; q++) {
            const expected = [0, 1, 2, 2, 1, 3];
            for (let i = 0; i < 6; i++) if (index.getX(q * 6 + i) !== q * 4 + expected[i]) return null;
        }
        if (Object.values(attributes).some(a => !a || a.itemSize > 4 || a.count !== position.count)) return null;
        const arrays = Object.fromEntries(Object.keys(attributes).map(k => [k, []]));
        if (!arrays.normal) arrays.normal = [];
        const indices = [], groups = [];
        let group = null;
        function emit(points, texcoords, normal, faceVertex) {
            const base = arrays.position.length / 3;
            if (base + 4 > MAX_VERTICES) throw new Error('ARMOR_VERTEX_BUDGET');
            for (let i = 0; i < 4; i++) {
                arrays.position.push(...points[i]); arrays.uv.push(...texcoords[i]); arrays.normal.push(...normal);
                for (const [name, attribute] of Object.entries(attributes)) {
                    if (['position', 'normal', 'uv'].includes(name)) continue;
                    // Native armor faces are rigidly weighted to one animated bone.
                    for (let c = 0; c < attribute.itemSize; c++) arrays[name].push(component(attribute, faceVertex, c));
                }
            }
            const a = points[1].map((v, i) => v - points[0][i]), b = points[2].map((v, i) => v - points[0][i]);
            const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
            const forward = cross.reduce((sum, v, i) => sum + v * normal[i], 0) >= 0;
            indices.push(...(forward ? [base, base + 1, base + 2, base + 2, base + 1, base + 3] : [base, base + 2, base + 1, base + 2, base + 3, base + 1]));
        }
        let geometry = null;
        try {
            for (let start = 0; start < position.count; start += 4) {
                const corners = [0, 1, 2, 3].map(i => [position.getX(start + i), position.getY(start + i), position.getZ(start + i)]);
                const tex = [0, 1, 2, 3].map(i => [uv.getX(start + i), uv.getY(start + i)]);
                const texAt = (u, v) => [0, 1].map(c => blend(tex.map(p => p[c]), u, v));
                const faceIndex = start / 4 * 6;
                const materialIndex = (original.groups || []).find(g => faceIndex >= g.start && faceIndex < g.start + g.count)?.materialIndex || 0;
                if (!group || group.materialIndex !== materialIndex) {
                    group = { start: indices.length, count: 0, materialIndex }; groups.push(group);
                }
                const before = indices.length;
                const columns = Math.max(1, Math.round(Math.hypot((tex[1][0] - tex[0][0]) * pixels.w, (tex[1][1] - tex[0][1]) * pixels.h)));
                const rows = Math.max(1, Math.round(Math.hypot((tex[2][0] - tex[0][0]) * pixels.w, (tex[2][1] - tex[0][1]) * pixels.h)));
                if (columns > 64 || rows > 64) return null;
                const normal = attributes.normal ? [attributes.normal.getX(start), attributes.normal.getY(start), attributes.normal.getZ(start)] : (() => {
                    const a = corners[1].map((v, i) => v - corners[0][i]), b = corners[2].map((v, i) => v - corners[0][i]);
                    const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
                    const length = Math.hypot(...n); return n.map(v => v / (length || 1));
                })();
                const depth = new Float32Array(columns * rows);
                for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) depth[y * columns + x] = pixelDepth(pixels, texAt((x + 0.5) / columns, (y + 0.5) / rows));
                const at = (x, y) => x < 0 || y < 0 || x >= columns || y >= rows ? 0 : Math.max(0, depth[y * columns + x]);
                for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
                    const height = depth[y * columns + x];
                    if (height < 0) continue;
                    const u0 = x / columns, u1 = (x + 1) / columns, v0 = y / rows, v1 = (y + 1) / rows;
                    const base = [point(corners, u0, v0), point(corners, u1, v0), point(corners, u0, v1), point(corners, u1, v1)];
                    const outer = base.map(p => shift(p, normal, height));
                    emit(outer, [texAt(u0, v0), texAt(u1, v0), texAt(u0, v1), texAt(u1, v1)], normal, start);
                    const center = texAt((x + 0.5) / columns, (y + 0.5) / rows);
                    for (const [a, b, lower] of [[0, 1, at(x, y - 1)], [1, 3, at(x + 1, y)], [3, 2, at(x, y + 1)], [2, 0, at(x - 1, y)]]) {
                        if (height <= lower + 1e-7) continue;
                        const tangent = base[b].map((v, i) => v - base[a][i]);
                        let sideNormal = [tangent[1] * normal[2] - tangent[2] * normal[1], tangent[2] * normal[0] - tangent[0] * normal[2], tangent[0] * normal[1] - tangent[1] * normal[0]];
                        const length = Math.hypot(...sideNormal); if (!length) continue;
                        sideNormal = sideNormal.map(v => v / length);
                        const centerPoint = point(corners, (u0 + u1) / 2, (v0 + v1) / 2);
                        if (sideNormal.reduce((sum, v, i) => sum + v * (base[a][i] - centerPoint[i]), 0) < 0) sideNormal = sideNormal.map(v => -v);
                        emit([outer[a], outer[b], shift(base[a], normal, lower), shift(base[b], normal, lower)], [center, center, center, center], sideNormal, start);
                    }
                }
                group.count += indices.length - before;
            }
            if (!indices.length) return null;
            geometry = new original.constructor();
            for (const [name, values] of Object.entries(arrays)) {
                const source = attributes[name] || attributes.position;
                const Typed = source.array?.constructor || Float32Array, Attribute = source.constructor;
                geometry.setAttribute(name, new Attribute(new Typed(values), name === 'normal' ? 3 : source.itemSize, source.normalized === true));
            }
            geometry.setIndex(indices);
            for (const group of groups) if (group.count) geometry.addGroup?.(group.start, group.count, group.materialIndex);
            geometry.computeBoundingBox?.(); geometry.computeBoundingSphere?.();
            if (original.boundingSphere && geometry.boundingSphere?.copy) {
                geometry.boundingSphere.copy(original.boundingSphere); geometry.boundingSphere.radius += 0.025;
            }
            return geometry;
        } catch { try { geometry?.dispose?.(); } catch {} return null; }
    }
    function restore(object, entry) {
        if (sourceGeometry(object) === entry.generated) assignGeometry(object, entry.original);
        try { entry.generated.dispose?.(); } catch {}
    }
    function restoreAll() {
        for (const [object, entry] of state.armor) restore(object, entry);
        state.armor.clear(); state.failures = new WeakMap();
    }
    function patch(object, now) {
        const previous = state.armor.get(object), effective = sourceGeometry(object);
        const original = previous && effective === previous.generated ? previous.original : effective;
        const map = firstMaterial(object)?.map;
        if (previous && original === previous.original && previous.map === map && previous.image === map?.image) return;
        if (previous) { restore(object, previous); state.armor.delete(object); }
        const failure = state.failures.get(object);
        if (failure?.original === original && failure.map === map && failure.image === map?.image && now - failure.at < 5000) return;
        const pixels = readTexture(map), generated = pixels && buildRelief(original, pixels);
        if (!generated) { state.failures.set(object, { original, map, image: map?.image, at: now }); return; }
        assignGeometry(object, generated);
        state.armor.set(object, { original, generated, map, image: map.image });
        state.failures.delete(object);
    }
    function synchronize() {
        if (state.destroyed) return;
        if (!isEnabled()) { if (state.armor.size) restoreAll(); return; }
        const now = performance.now();
        if (now - state.lastScan < 350) return;
        state.lastScan = now;
        const game = findGame(), root = localEntity(game)?.mesh;
        state.game = game;
        const current = armorObjects(root);
        for (const [object, entry] of state.armor) if (!current.has(object)) { restore(object, entry); state.armor.delete(object); }
        for (const object of current) patch(object, now);
    }
    function refresh() {
        if (isEnabled()) {
            if (!state.timer) state.timer = W.setInterval(synchronize, 400);
            state.lastScan = -Infinity; synchronize();
        } else {
            if (state.timer) W.clearInterval(state.timer);
            state.timer = 0; restoreAll(); state.game = null;
        }
    }
    function setEnabled(value) { if (state.destroyed) return; state.manual = !!value; refresh(); }
    function setRealisticOptions(options = {}) {
        if (state.destroyed || state.realistic === !!options.enabled) return;
        state.realistic = !!options.enabled; refresh();
    }
    function onConfig(event) {
        let detail = event.detail;
        if (typeof detail === 'string') try { detail = JSON.parse(detail); } catch { return; }
        if (typeof detail?.enabled === 'boolean') setEnabled(detail.enabled);
    }
    function destroy() {
        if (state.destroyed) return;
        state.destroyed = true;
        if (state.timer) W.clearInterval(state.timer);
        state.timer = 0; restoreAll();
        document.removeEventListener(EVENT, onConfig);
        if (W.MF_BetterPlayerLayersArmor === api) delete W.MF_BetterPlayerLayersArmor;
    }
    const api = Object.freeze({
        enable: () => setEnabled(true), disable: () => setEnabled(false),
        setRealisticOptions, synchronize, destroy,
        getState: () => ({ enabled: isEnabled(), manualEnabled: state.manual, realisticEnabled: state.realistic,
            armorMeshes: state.armor.size, vertices: [...state.armor.values()].reduce((n, e) => n + e.generated.attributes.position.count, 0),
            reliefPixels: 0.18, materialMode: 'native', extraDrawCalls: 0 })
    });
    W.MF_BetterPlayerLayersArmor = api;
    document.addEventListener(EVENT, onConfig);
})();
