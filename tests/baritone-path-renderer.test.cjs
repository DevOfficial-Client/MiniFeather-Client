const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/Movement/BaritonePathRenderer.js'), 'utf8');

function harness(options = {}) {
  let nextId = 0;
  const stats = { geometry: [], materials: [], objects: [], unsafeCalls: 0 };
  class C {
    constructor(value = 0xffffff) { this.value = value; }
    setHex(value) { this.value = value; return this; }
  }
  class A {
    constructor(array, itemSize) { this.isBufferAttribute = true; this.array = new Float32Array(array); this.itemSize = itemSize; this.count = this.array.length / itemSize; this.version = 0; }
    setUsage(usage) { this.usage = usage; return this; }
    set needsUpdate(value) { if (value) this.version++; }
  }
  class G {
    constructor() { this.isBufferGeometry = true; this.id = ++nextId; this.attributes = {}; this.index = null; this.drawRange = { start: 0, count: Infinity }; this.disposed = 0; stats.geometry.push(this); }
    setAttribute(name, attribute) { this.attributes[name] = attribute; return this; }
    setIndex(index) { this.index = index; }
    setDrawRange(start, count) { this.drawRange = { start, count }; }
    dispose() { this.disposed++; }
  }
  class BG extends G {
    constructor() { super(); this.isBoxGeometry = true; this.setAttribute('position', new A([0, 0, 0, 1, 1, 1], 3)); this.setIndex([0, 1]); }
  }
  class LB {
    constructor() { this.isLineBasicMaterial = true; this.type = 'LineBasicMaterial'; this.color = new C(); this.disposed = 0; stats.materials.push(this); }
    clone() { const clone = new LB(); clone.color.setHex(this.color.value); return clone; }
    dispose() { this.disposed++; }
  }
  class O {
    constructor() { this.isObject3D = true; this.children = []; this.parent = null; this.visible = true; this.userData = {}; stats.objects.push(this); }
    add(object) { object.parent?.remove(object); this.children.push(object); object.parent = this; }
    remove(object) { this.children = this.children.filter(child => child !== object); if (object.parent === this) object.parent = null; }
  }
  class M extends O {
    constructor(geometry, material) { super(); this.isMesh = true; this.geometry = geometry; this.material = material; }
  }
  class LS extends O {
    constructor(geometry, material) { super(); this.isLineSegments = true; this.geometry = geometry; this.material = material; }
  }
  class H extends LS {
    constructor(box) {
      if (!box?.min || !box?.max) throw new Error('Box3Helper must never be used as a custom geometry constructor');
      super(new BG(), new LB()); this.isBox3Helper = true; this.box = box;
    }
    updateMatrixWorld() { if (!this.box.min) throw new Error('invalid helper box'); }
  }
  class S extends O {
    constructor() { super(); this.isScene = true; this.type = 'Scene'; }
    clear() { stats.unsafeCalls++; throw new Error('do not clear the native scene'); }
  }
  const scene = new S(), camera = new O(); camera.isCamera = true;
  const helper = new H({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } });
  const mesh = new M(new G(), new LB());
  mesh.geometry.setAttribute('position', new A([0, 0, 0, 0, 1, 0, 1, 0, 0], 3));
  scene.add(helper); if (!options.linesOnly) scene.add(mesh);
  const nativeGeometry = helper.geometry, nativeMaterial = helper.material;
  const game = { world: {}, player: { selectBox: helper }, gameScene: { scene, camera, renderer: {
    render() { stats.unsafeCalls++; throw new Error('do not invoke or replace the native renderer'); }
  } } };
  const context = vm.createContext({ Float32Array });
  if (options.namespace) context.THREE = { BufferGeometry: G, Float32BufferAttribute: A, LineBasicMaterial: LB, Mesh: M, LineSegments: LS };
  vm.runInContext(source, context);
  const renderer = context.__MF_BARITONE_PATH_RENDERER__.create(options.rendererOptions || {});
  const owned = () => scene.children.filter(child => child.userData?.mfBaritonePath);
  return { context, renderer, stats, game, scene, camera, helper, mesh, nativeGeometry, nativeMaterial, owned, classes: { G, A, LB, M, LS, S, O } };
}

const route = () => [{ x: 0, y: 1, z: 0, action: 'walk' }, { x: 1, y: 1, z: 0, action: 'walk' }, { x: 2, y: 1, z: 0, action: 'walk' }];

test('native constructors draw colored triangle ribbons in the existing world scene without touching its renderer', () => {
  const h = harness();
  h.nativeMaterial.color.setHex(0xff00ff);
  assert.equal(h.renderer.bind(h.game), true);
  assert.equal(h.renderer.update({ path: route(), pathIndex: 0, goal: { x: 2, y: 1, z: 0 } }), true);
  const visible = h.owned();
  assert.equal(visible.length, 2);
  assert.ok(visible.every(object => object.isMesh && object.parent === h.scene && object.frustumCulled === false));
  assert.equal(h.renderer.diagnostics().mode, 'native-ribbons');
  assert.equal(h.renderer.diagnostics().source, 'native-scene');
  assert.equal(h.renderer.diagnostics().attached, true);
  const front = visible.find(object => object.material.depthTest);
  assert.ok(front.geometry.drawRange.count > 0 && front.geometry.drawRange.count % 3 === 0);
  assert.equal(front.geometry.index, null);
  assert.equal(front.geometry.constructor, h.classes.G, 'the base native geometry is selected, not a primitive subclass');
  assert.equal(front.material.vertexColors, true);
  assert.equal(front.material.wireframe, false);
  assert.equal(front.material.color.value, 0xffffff);
  assert.equal(front.material.depthWrite, false);
  assert.equal(front.material.forceSinglePass, true);
  assert.ok(Math.abs(front.geometry.attributes.position.array[1] - 1.13) < .04, 'writes must use the copied native attribute array, not the source allocation');
  assert.equal(h.stats.unsafeCalls, 0);
  assert.equal(h.helper.parent, h.scene);
  assert.equal(h.helper.geometry, h.nativeGeometry);
  assert.equal(h.nativeGeometry.disposed, 0);
  assert.equal(h.nativeMaterial.disposed, 0);
  assert.equal(h.nativeMaterial.color.value, 0xff00ff, 'sample colors and materials are never edited');
  front.onBeforeRender();
  assert.equal(h.renderer.diagnostics().renderCount, 1);
  h.renderer.destroy();
});

test('visibility toggles and duplicate updates reuse GPU buffers and do not upload unchanged geometry', () => {
  const h = harness(), data = { path: route(), pathIndex: 0 };
  h.renderer.bind(h.game); h.renderer.update(data);
  const geometry = h.owned()[0].geometry, position = geometry.attributes.position;
  const uploads = h.renderer.diagnostics().uploads, allocations = h.stats.geometry.length;
  h.renderer.update(data);
  assert.equal(h.renderer.diagnostics().uploads, uploads);
  assert.equal(geometry.attributes.position, position);
  assert.equal(h.renderer.setVisible(false), false);
  assert.equal(h.owned().length, 0);
  h.renderer.update({ ...data, pathIndex: 1 });
  assert.equal(h.renderer.setVisible(true), true);
  assert.equal(h.owned()[0].geometry, geometry);
  assert.equal(h.stats.geometry.length, allocations);
  assert.equal(h.renderer.diagnostics().uploads, uploads + 1);
  data.path[1].x = 7;
  h.renderer.update(data);
  assert.equal(h.renderer.diagnostics().uploads, uploads + 2, 'in-place terrain/path changes also invalidate the bounded fingerprint');
  h.renderer.destroy();
});

test('repeated visibility settings are no-ops until the explicit update arrives', () => {
  const h = harness(), data = { path: route(), pathIndex: 0 };
  h.renderer.bind(h.game); h.renderer.update(data);
  const uploads = h.renderer.diagnostics().uploads;
  data.path[1].x = 7;
  assert.equal(h.renderer.setVisible(true), true);
  assert.equal(h.renderer.diagnostics().uploads, uploads, 'an already visible overlay must not reprocess its pending snapshot');
  h.renderer.update(data);
  assert.equal(h.renderer.diagnostics().uploads, uploads + 1);
  h.renderer.destroy();
});

test('remaining path and preview share a strict 512-node geometry budget with bounded action markers', () => {
  const h = harness();
  const path = Array.from({ length: 2000 }, (_, x) => ({ x, y: 1, z: 0, action: 'mine', breakBlocks: [{ x, y: 1, z: 0 }, { x, y: 2, z: 0 }] }));
  h.renderer.bind(h.game);
  h.renderer.update({ path, pathIndex: 700, planning: true, preview: path });
  const result = h.renderer.diagnostics();
  assert.equal(result.nodes, 512);
  assert.equal(result.markers, 64);
  assert.ok(result.vertices <= h.owned()[0].geometry.attributes.position.count);
  assert.ok(result.segments <= 512 + (64 + 3) * 12);
  h.renderer.destroy();
});

test('route, planning preview, excavation and placement use distinct vertex colors', () => {
  const h = harness(), path = route();
  path[1].breakBlocks = [{ x: 1, y: 2, z: 0 }];
  path[2].placeBlocks = [{ x: 2, y: 0, z: 0 }];
  h.renderer.bind(h.game);
  h.renderer.update({ path, planning: true, preview: [{ x: 3, y: 1, z: 0 }, { x: 4, y: 1, z: 0 }], goal: { x: 4, y: 1, z: 0 } });
  const geometry = h.owned()[0].geometry;
  const colors = geometry.attributes.color.array;
  const found = new Set();
  for (let offset = 0; offset < geometry.drawRange.count * 3; offset += 3) {
    found.add((Math.round(colors[offset] * 255) << 16) | (Math.round(colors[offset + 1] * 255) << 8) | Math.round(colors[offset + 2] * 255));
  }
  for (const color of [0x75eea4, 0x57beff, 0xff6978, 0xffbb55, 0xffe25b]) assert.ok(found.has(color));
  h.renderer.destroy();
});

test('clear detaches only owned objects, and world changes dispose only owned geometry and materials', () => {
  const h = harness();
  h.renderer.bind(h.game); h.renderer.update({ path: route() });
  const objects = h.owned(), geometry = objects[0].geometry;
  h.renderer.clear();
  assert.equal(h.owned().length, 0);
  assert.equal(geometry.drawRange.count, 0);
  assert.equal(geometry.disposed, 0, 'clear keeps bounded buffers ready for the next command');
  h.renderer.update({ path: route() });
  assert.equal(h.owned()[0].geometry, geometry);
  h.game.world = {};
  assert.equal(h.renderer.bind(h.game), true);
  assert.equal(geometry.disposed, 1);
  assert.ok(objects.every(object => object.material.disposed === 1));
  assert.equal(h.nativeGeometry.disposed, 0);
  assert.equal(h.nativeMaterial.disposed, 0);
  assert.equal(h.helper.parent, h.scene);
  h.renderer.destroy(); h.renderer.destroy();
  assert.equal(geometry.disposed, 1);
  assert.equal(h.renderer.update({ path: route() }), false);
});

test('a missing scene or graphics capabilities fails diagnostically without touching camera or gameplay', () => {
  const h = harness();
  const group = new h.classes.O(); group.type = 'Scene';
  const unrelated = { world: {}, gameScene: { scene: group, camera: h.camera } };
  assert.equal(h.renderer.bind(unrelated), false);
  assert.match(h.renderer.diagnostics().error, /world scene/);
  assert.equal(group.children.length, 0);
  const bare = new h.classes.S();
  assert.equal(h.renderer.bind({ world: {}, gameScene: { scene: bare } }), false);
  assert.match(h.renderer.diagnostics().error, /constructors/);
  assert.equal(h.stats.unsafeCalls, 0);
  h.renderer.destroy();
});

test('a native scene below a camera is never accepted as the world attachment target', () => {
  const h = harness();
  const nested = new h.classes.S(); h.camera.add(nested);
  assert.equal(h.renderer.bind({ world: {}, gameScene: { scene: nested, camera: h.camera } }), false);
  assert.equal(nested.children.length, 0);
  h.renderer.destroy();
});

test('semantic scene discovery works with renamed gameScene fields and a verified THREE namespace fallback', () => {
  const h = harness({ namespace: true });
  const bare = new h.classes.S();
  assert.equal(h.renderer.bind({ world: {}, gameScene: { renamedNativeScene: bare } }), true);
  assert.equal(h.renderer.update({ path: route() }), true);
  assert.equal(h.renderer.diagnostics().source, 'three-namespace');
  assert.ok(bare.children.every(child => child.isMesh));
  h.renderer.destroy();
});

test('native line fallback never accidentally constructs Box3Helper with geometry arguments', () => {
  const h = harness({ linesOnly: true });
  h.renderer.bind(h.game); h.renderer.update({ path: route() });
  assert.equal(h.renderer.diagnostics().mode, 'native-lines');
  assert.ok(h.owned().every(object => object.constructor === h.classes.LS));
  assert.ok(h.owned()[0].geometry.drawRange.count % 2 === 0);
  h.renderer.destroy();
});

test('a world initially lacking meshes upgrades the temporary line fallback to native ribbons', () => {
  const h = harness({ linesOnly: true });
  h.renderer.bind(h.game); h.renderer.update({ path: route() });
  const old = h.owned()[0].geometry;
  assert.equal(h.renderer.diagnostics().mode, 'native-lines');
  h.scene.add(h.mesh);
  h.renderer.bind(h.game); h.renderer.update({ path: route() });
  assert.equal(h.renderer.diagnostics().mode, 'native-ribbons');
  assert.equal(old.disposed, 1);
  assert.ok(h.owned().every(object => object.isMesh));
  h.renderer.destroy();
});

test('invalid and discontinuous points never put NaN values or connecting lines into GPU buffers', () => {
  const h = harness();
  h.renderer.bind(h.game);
  h.renderer.update({ path: [{ x: NaN, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, null, { x: Infinity, y: 1, z: 0 }, { x: 2, y: 1, z: 0 }], goal: { x: NaN, y: 1, z: 0 } });
  assert.equal(h.renderer.diagnostics().nodes, 2);
  assert.equal(h.renderer.diagnostics().vertices, 0, 'discontinuities must not be drawn as an invented route');
  assert.equal(h.owned().length, 0);
  h.renderer.destroy();
});

test('module reload destroys all previous instances and their owned render resources', () => {
  const h = harness();
  h.renderer.bind(h.game); h.renderer.update({ path: route() });
  const objects = h.owned(), geometry = objects[0].geometry;
  vm.runInContext(source, h.context);
  assert.equal(h.renderer.diagnostics().destroyed, true);
  assert.equal(h.owned().length, 0);
  assert.equal(geometry.disposed, 1);
  assert.equal(h.nativeGeometry.disposed, 0);
});

test('failed native scene attachment reports an error and removes only its partial overlay', () => {
  const h = harness();
  h.renderer.bind(h.game);
  const original = h.scene.add;
  let calls = 0;
  h.scene.add = function (object) {
    if (++calls === 2) throw new Error('native scene temporarily unavailable');
    return original.call(this, object);
  };
  assert.equal(h.renderer.update({ path: route() }), false);
  assert.match(h.renderer.diagnostics().error, /temporarily unavailable/);
  assert.equal(h.owned().length, 0);
  assert.equal(h.helper.parent, h.scene);
  assert.equal(h.nativeGeometry.disposed, 0);
  h.scene.add = original;
  assert.equal(h.renderer.update({ path: route() }), true);
  assert.equal(h.owned().length, 2);
  h.renderer.destroy();
});
