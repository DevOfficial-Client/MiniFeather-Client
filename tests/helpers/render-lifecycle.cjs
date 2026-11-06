'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('three');
const ROOT = path.join(__dirname, '../..');

function fixture() {
  let now = 5000;
  let serial = 0;
  let queries = 0;
  let leaf = true;
  const leafBlock = { name: 'oak_leaves' };
  const stoneBlock = { name: 'stone' };
  const jobs = new Map();
  const intervals = new Map();
  const frames = new Map();
  const events = new Map();
  const scene = new THREE.Scene();
  const chunks = new THREE.Group();
  scene.add(chunks);
  const game = {
    player: { pos: { x: 0, y: 64, z: 0 } },
    world: { getBlock() { queries++; return leaf ? leafBlock : stoneBlock; } },
    gameScene: { scene, chunkMeshes: chunks },
    camera: new THREE.PerspectiveCamera()
  };
  const react = { '__reactContainer$fixture': {
    updateQueue: { baseState: { element: { props: { game } } } }
  } };
  const storage = new Map();
  const context = vm.createContext({
    miniblox: game,
    document: {
      querySelector: selector => selector === '#react' ? react : null,
      getElementById: id => id === 'react' ? react : null,
      addEventListener(type, fn) { events.set(type, fn); },
      removeEventListener() {},
      createElement: () => ({ getContext: () => null }),
      head: { appendChild() {} }, body: { appendChild() {} },
      documentElement: { style: {} }
    },
    performance: { now: () => now },
    setInterval(fn) { const id = ++serial; intervals.set(id, fn); return id; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(fn) { const id = ++serial; jobs.set(id, fn); return id; },
    clearTimeout(id) { jobs.delete(id); },
    requestIdleCallback(fn) { const id = ++serial; jobs.set(id, fn); return id; },
    cancelIdleCallback(id) { jobs.delete(id); },
    requestAnimationFrame(fn) { const id = ++serial; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    console: { log() {}, info() {}, warn() {}, error() {} },
    WebGL2RenderingContext: class {}, WebGLRenderingContext: class {},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    Image: class {},
    Float32Array, Uint8Array, Uint32Array, Map, Set,
    fetch() { throw new Error('Network is forbidden in render tests'); }
  });
  context.window = context;
  function load(relative, probe) {
    let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    const end = source.lastIndexOf('})();');
    if (end < 0) throw new Error('Missing module boundary: ' + relative);
    source = source.slice(0, end) + `globalThis.__probe = {${probe}};\n` + source.slice(end);
    vm.runInContext(source, context, { filename: relative });
    return context.__probe;
  }
  function flush(limit = 10000) {
    let count = 0;
    while (jobs.size) {
      if (++count > limit) throw new Error('Render jobs did not settle');
      const [id, fn] = jobs.entries().next().value;
      jobs.delete(id);
      fn({ didTimeout: false, timeRemaining: () => 5 });
    }
    return count;
  }
  function mesh(geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial({ transparent: true })) {
    const result = new THREE.Mesh(geometry, material);
    chunks.add(result);
    result.updateMatrixWorld(true);
    return result;
  }
  return {
    context, game, scene, chunks, load, flush, mesh, jobs, intervals, frames,
    advance(value = 2500) { now += value; },
    setLeaf(value) { leaf = value; },
    get queries() { return queries; }
  };
}

module.exports = { fixture, THREE, ROOT };
