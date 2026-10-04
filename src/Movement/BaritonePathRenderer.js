(function () {
  'use strict';

  const BARITONE_PATH_RENDERER_VERSION = 1;
  const ROOT = globalThis, KEY = '__MF_BARITONE_PATH_RENDERER__';
  const MAX_NODES = 512, MAX_MARKERS = 64;
  const MAX_SEGMENTS = MAX_NODES + (MAX_MARKERS + 3) * 12;
  const instances = new Set();
  const PALETTE = {
    route: 0x75eea4, preview: 0x57beff, mine: 0xff6978,
    place: 0xffbb55, goal: 0xffe25b, checkpoint: 0xb9a0ff, current: 0xffffff
  };
  const finite = point => point && ['x', 'y', 'z'].every(axis =>
    Number.isFinite(point[axis]) && Math.abs(point[axis]) <= 30000000);
  const coord = node => ({ x: node.x + .5, y: node.y + .13, z: node.z + .5 });
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  try { ROOT[KEY]?.destroy?.(); } catch (_) {}

  function descriptors(object) {
    try { return Object.values(Object.getOwnPropertyDescriptors(object || {})).map(value => value.value).filter(Boolean); }
    catch (_) { return []; }
  }
  function sceneFor(game) {
    const candidates = [game?.gameScene?.scene, game?.scene?.scene, game?.scene,
      ...descriptors(game?.gameScene).slice(0, 64), ...descriptors(game).slice(0, 64)];
    return candidates.find(value => {
      if (value?.isScene !== true || typeof value.add !== 'function' || typeof value.remove !== 'function') return false;
      for (let parent = value.parent, depth = 0; parent && depth < 12; parent = parent.parent, depth++) {
        if (parent.isCamera === true) return false;
      }
      return true;
    }) || null;
  }
  function constructorFor(object, flag) {
    for (let ctor = object?.constructor, depth = 0; typeof ctor === 'function' && depth < 12;
      ctor = Object.getPrototypeOf(ctor), depth++) {
      let text = '';
      try { text = Function.prototype.toString.call(ctor); } catch (_) {}
      if ((own(ctor.prototype || {}, flag) && ctor.prototype[flag] === true) ||
          new RegExp(`(?:\\.|\\b)${flag}\\s*=`).test(text)) return ctor;
    }
    return null;
  }
  function constructorsFor(game, scene) {
    const queue = [game?.player?.selectBox, game?.gameScene?.axesHelper,
      game?.player?.mesh, game?.gameScene?.camera, scene].filter(Boolean);
    const seen = new Set();
    let Geometry, Attribute, Mesh, Lines, template;
    for (let index = 0; index < queue.length && index < 256; index++) {
      const object = queue[index];
      if (!object || seen.has(object) || object.userData?.mfBaritonePath) continue;
      seen.add(object);
      const attribute = object.geometry?.attributes?.position;
      if (attribute?.array && !attribute.isInterleavedBufferAttribute) {
        Geometry ||= constructorFor(object.geometry, 'isBufferGeometry');
        Attribute ||= attribute.constructor;
      }
      if (object.isMesh === true) Mesh ||= constructorFor(object, 'isMesh');
      if (object.isLineSegments === true) Lines ||= constructorFor(object, 'isLineSegments');
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if ((material?.isLineBasicMaterial === true || material?.isMeshBasicMaterial === true) && typeof material.clone === 'function') {
          if (!template || material.isLineBasicMaterial === true) template = material;
        }
      }
      for (const child of object.children || []) {
        if (queue.length >= 256) break;
        queue.push(child);
      }
      // Model containers need not themselves be Three Object3Ds.
      if (!object.isObject3D && !Array.isArray(object.children)) {
        for (const child of descriptors(object).slice(0, 24)) {
          if (child?.isObject3D && queue.length < 256) queue.push(child);
        }
      }
      if (Geometry && Attribute && Mesh && template) break;
    }
    if (Geometry && Attribute && template && (Mesh || Lines)) {
      return { Geometry, Attribute, Object: Mesh || Lines, template, ribbons: !!Mesh, source: 'native-scene' };
    }
    for (const namespace of [ROOT.THREE, game?.THREE, game?.gameScene?.THREE]) {
      if (typeof namespace?.BufferGeometry === 'function' &&
          typeof (namespace.Float32BufferAttribute || namespace.BufferAttribute) === 'function' &&
          typeof namespace.LineBasicMaterial === 'function' &&
          typeof (namespace.Mesh || namespace.LineSegments) === 'function') {
        return { Geometry: namespace.BufferGeometry, Attribute: namespace.Float32BufferAttribute || namespace.BufferAttribute,
          Object: namespace.Mesh || namespace.LineSegments, Material: namespace.LineBasicMaterial,
          ribbons: !!namespace.Mesh, source: 'three-namespace' };
      }
    }
    return null;
  }

  function create(options = {}) {
    let game = null, world = null, scene = null, ctors = null;
    let geometry = null, position = null, colors = null, front = null, behind = null;
    let visible = true, destroyed = false, pending = null, fingerprint = null, error = '';
    let vertices = 0, nodes = 0, markers = 0, segments = 0, uploads = 0;
    let renderCount = 0, occludedRenderCount = 0;
    const materials = new Set();

    function detach() {
      for (const object of [front, behind]) {
        if (!object) continue;
        try { object.parent?.remove(object); } catch (_) {}
        object.visible = false;
      }
    }
    function dispose() {
      detach();
      try { geometry?.dispose?.(); } catch (_) {}
      for (const material of materials) { try { material.dispose?.(); } catch (_) {} }
      materials.clear();
      geometry = position = colors = front = behind = null;
      fingerprint = null; vertices = nodes = markers = segments = 0;
    }
    function material(opacity, depthTest) {
      const result = ctors.template ? ctors.template.clone() : new ctors.Material();
      materials.add(result);
      // Both native LineBasicMaterial and MeshBasicMaterial use ShaderLib.basic.
      // The native renderer chooses TRIANGLES from the Mesh, not the material.
      result.color?.setHex?.(0xffffff);
      result.vertexColors = true; result.transparent = true; result.opacity = opacity;
      result.depthTest = depthTest; result.depthWrite = false; result.toneMapped = false;
      result.fog = false; result.side = 2; result.wireframe = false;
      result.forceSinglePass = true;
      result.map = null; result.alphaMap = null; result.needsUpdate = true;
      return result;
    }
    function resources() {
      if (geometry) return true;
      try {
        geometry = new ctors.Geometry();
        const count = MAX_SEGMENTS * (ctors.ribbons ? 12 : 2);
        position = new ctors.Attribute(new Float32Array(count * 3), 3);
        colors = new ctors.Attribute(new Float32Array(count * 3), 3);
        if (!position.array || !colors.array || typeof geometry.setAttribute !== 'function') throw new Error('Unsupported native buffer attributes');
        position.setUsage?.(35048); colors.setUsage?.(35048);
        geometry.setAttribute('position', position); geometry.setAttribute('color', colors);
        geometry.setIndex?.(null); geometry.setDrawRange(0, 0);
        front = new ctors.Object(geometry, material(.96, true));
        if (options.occluded !== false) behind = new ctors.Object(geometry, material(.10, false));
        for (const object of [front, behind]) {
          if (!object) continue;
          object.name = 'MiniFeather Baritone path'; object.userData ||= {};
          object.userData.mfBaritonePath = true;
          object.frustumCulled = false; object.castShadow = false; object.receiveShadow = false;
          object.raycast = () => {};
          object.renderOrder = object === front ? 901 : 900;
          object.visible = false;
        }
        front.onBeforeRender = () => { renderCount++; };
        if (behind) behind.onBeforeRender = () => { occludedRenderCount++; };
        return true;
      } catch (exception) {
        error = String(exception?.message || exception); dispose(); return false;
      }
    }
    function attach() {
      if (!visible || !vertices || !scene) { detach(); return true; }
      try {
        for (const object of [behind, front]) {
          if (!object) continue;
          if (object.parent !== scene) scene.add(object);
          object.visible = true;
        }
        return true;
      } catch (exception) {
        error = String(exception?.message || exception); detach(); return false;
      }
    }
    function vertex(x, y, z, hex) {
      if (vertices >= position.count || vertices * 3 + 2 >= position.array.length) return;
      const offset = vertices++ * 3;
      position.array[offset] = x; position.array[offset + 1] = y; position.array[offset + 2] = z;
      colors.array[offset] = ((hex >> 16) & 255) / 255;
      colors.array[offset + 1] = ((hex >> 8) & 255) / 255;
      colors.array[offset + 2] = (hex & 255) / 255;
    }
    function segment(a, b, hex, width = .035) {
      if (!finite(a) || !finite(b) || segments >= MAX_SEGMENTS) return;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const length = Math.hypot(dx, dy, dz);
      if (length < .00001) return;
      segments++;
      if (!ctors.ribbons) { vertex(a.x, a.y, a.z, hex); vertex(b.x, b.y, b.z, hex); return; }
      const horizontal = Math.hypot(dx, dz);
      const ux = horizontal > .00001 ? -dz / horizontal : 1;
      const uz = horizontal > .00001 ? dx / horizontal : 0;
      const cross = { x: dy * uz / length, y: (dz * ux - dx * uz) / length, z: -dy * ux / length };
      for (const axis of [{ x: ux, y: 0, z: uz }, cross]) {
        const ox = axis.x * width, oy = axis.y * width, oz = axis.z * width;
        vertex(a.x - ox, a.y - oy, a.z - oz, hex);
        vertex(b.x - ox, b.y - oy, b.z - oz, hex);
        vertex(b.x + ox, b.y + oy, b.z + oz, hex);
        vertex(a.x - ox, a.y - oy, a.z - oz, hex);
        vertex(b.x + ox, b.y + oy, b.z + oz, hex);
        vertex(a.x + ox, a.y + oy, a.z + oz, hex);
      }
    }
    function box(point, hex, radius = .48, height = .96) {
      if (!finite(point)) return;
      const x = point.x + .5, y = point.y + .03, z = point.z + .5;
      const corners = [];
      for (const dy of [0, height]) for (const dz of [-radius, radius]) for (const dx of [-radius, radius]) {
        corners.push({ x: x + dx, y: y + dy, z: z + dz });
      }
      for (const [a, b] of [[0, 1], [0, 2], [1, 3], [2, 3], [4, 5], [4, 6], [5, 7], [6, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) {
        segment(corners[a], corners[b], hex, .013);
      }
    }
    function hash(data, path, index, preview) {
      let value = 2166136261;
      const mix = part => { value = Math.imul(value ^ part, 16777619) >>> 0; };
      const point = point => {
        if (!finite(point)) { mix(-1); return; }
        for (const axis of ['x', 'y', 'z']) mix(Math.round(point[axis] * 1024));
      };
      mix(index); mix(data.planning ? 1 : 0); point(data.goal); point(data.routeGoal);
      for (const [list, start, cap] of [[path, index, MAX_NODES], [preview, 0, Math.max(0, MAX_NODES - Math.min(MAX_NODES, path.length - index))]]) {
        mix(Math.min(cap, list.length - start));
        for (let i = start; i < list.length && i < start + cap; i++) {
          const node = list[i]; point(node);
          const action = String(node?.action || '');
          for (let j = 0; j < action.length && j < 20; j++) mix(action.charCodeAt(j));
          for (const blocks of [node?.breakBlocks, node?.placeBlocks]) {
            mix(Array.isArray(blocks) ? Math.min(4, blocks.length) : 0);
            for (const block of (Array.isArray(blocks) ? blocks : []).slice(0, 4)) point(block);
          }
        }
      }
      return value;
    }
    function update(data = {}) {
      if (destroyed) return false;
      pending = data;
      if (!visible) { detach(); return true; }
      if (!bind(game) || !resources()) return false;
      pending = data;
      const path = Array.isArray(data.path) ? data.path : [];
      const index = Math.max(0, Math.min(path.length, Math.floor(Number(data.pathIndex) || 0)));
      const preview = data.planning ? (Array.isArray(data.preview) ? data.preview : Array.isArray(data.preview?.path) ? data.preview.path : []) : [];
      const next = hash(data, path, index, preview);
      if (fingerprint === next) return attach();
      fingerprint = next; vertices = nodes = markers = segments = 0;
      let previous = null;
      for (let i = index; i < path.length && i < index + MAX_NODES; i++) {
        const node = path[i];
        if (!finite(node)) { previous = null; continue; }
        const target = coord(node);
        if (previous) segment(previous, target, PALETTE.route);
        previous = target; nodes++;
        for (const [blocks, color] of [[node.breakBlocks, PALETTE.mine], [node.placeBlocks, PALETTE.place]]) {
          for (const block of Array.isArray(blocks) ? blocks.slice(0, 4) : []) {
            if (markers >= MAX_MARKERS) break;
            if (finite(block)) { box(block, color); markers++; }
          }
        }
      }
      previous = null;
      const previewLimit = Math.max(0, MAX_NODES - Math.min(MAX_NODES, path.length - index));
      for (let i = 0; i < preview.length && i < previewLimit; i++) {
        const node = preview[i];
        if (!finite(node)) { previous = null; continue; }
        const target = coord(node);
        if (previous) segment(previous, target, PALETTE.preview, .024);
        previous = target; nodes++;
      }
      if (finite(path[index])) box(path[index], PALETTE.current, .18, .30);
      if (finite(data.goal)) box(data.goal, PALETTE.goal, .48, 1.9);
      if (finite(data.routeGoal) && (!finite(data.goal) || ['x', 'y', 'z'].some(axis => data.routeGoal[axis] !== data.goal[axis]))) {
        box(data.routeGoal, PALETTE.checkpoint, .32, .6);
      }
      for (const attribute of [position, colors]) {
        attribute.clearUpdateRanges?.(); attribute.addUpdateRange?.(0, vertices * 3);
        attribute.needsUpdate = true;
      }
      geometry.setDrawRange(0, vertices); uploads++;
      error = ''; return attach();
    }
    function bind(nextGame) {
      if (destroyed) return false;
      const nextScene = sceneFor(nextGame), nextWorld = nextGame?.world;
      if (!nextScene || !nextWorld) {
        dispose(); game = nextGame || null; world = nextWorld || null; scene = null; ctors = null;
        pending = null;
        error = 'Native world scene is not available'; return false;
      }
      if (nextWorld !== world || nextScene !== scene || nextGame !== game) {
        dispose(); pending = null;
        game = nextGame; world = nextWorld; scene = nextScene; ctors = null;
      }
      if (!ctors || !ctors.ribbons) {
        const resolved = constructorsFor(game, scene);
        if (resolved?.ribbons && ctors && !ctors.ribbons) dispose();
        ctors = resolved || ctors;
      }
      if (!ctors) { error = 'Native geometry/material constructors are not available'; return false; }
      error = ''; return true;
    }
    const api = {
      bind, update,
      setVisible(value) {
        const nextVisible = !!value;
        if (visible === nextVisible) return visible;
        visible = nextVisible;
        if (!visible) detach(); else if (pending) update(pending);
        return visible;
      },
      clear() {
        detach(); pending = null; fingerprint = null; vertices = nodes = markers = segments = 0;
        geometry?.setDrawRange(0, 0);
      },
      destroy() {
        if (destroyed) return;
        dispose(); destroyed = true; pending = null; game = world = scene = ctors = null;
        instances.delete(api);
      },
      diagnostics() {
        return { version: BARITONE_PATH_RENDERER_VERSION, visible, destroyed,
          attached: !!front && front.parent === scene, sceneIsWorldRoot: !!scene?.isScene,
          mode: ctors ? ctors.ribbons ? 'native-ribbons' : 'native-lines' : 'unavailable',
          source: ctors?.source || '', materialType: front?.material?.type || '',
          nodes, markers, vertices, segments, maxNodes: MAX_NODES, uploads,
          renderCount, occludedRenderCount, error };
      }
    };
    instances.add(api);
    return api;
  }

  ROOT[KEY] = Object.freeze({ version: BARITONE_PATH_RENDERER_VERSION, create,
    destroy() { for (const instance of [...instances]) instance.destroy(); } });
})();
