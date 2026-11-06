// Offline GPU fixture, not a live Miniblox session. No user profile or network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFileSync(path.join(root, relative), 'utf8');
function expose(source, name, values) {
  const end = source.lastIndexOf('})();');
  assert.ok(end >= 0);
  return source.slice(0, end) + `window.${name} = {${values}};\n` + source.slice(end);
}
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://render-audit.local') throw new Error('External network forbidden');
    if (['/three.module.js', '/three.core.js'].includes(url.pathname)) {
      return route.fulfill({ contentType: 'text/javascript',
        body: read('node_modules/three/build' + url.pathname) });
    }
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="react"></div>' });
  });
  await page.goto('http://render-audit.local/');
  await page.evaluate(async () => {
    const THREE = await import('/three.module.js');
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.setSize(96, 96);
    document.body.append(renderer.domElement);
    const scene = new THREE.Scene();
    const chunks = new THREE.Group(); scene.add(chunks);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 4;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({ color: 0x44ff66, transparent: true }));
    chunks.add(mesh);
    window.audit = { THREE, renderer, scene, chunks, camera, mesh, leaf: true, native: mesh.material };
    window.miniblox = { player: { pos: { x: 0, y: 64, z: 0 } },
      world: { getBlock: () => ({ name: window.audit.leaf ? 'oak_leaves' : 'stone' }) },
      camera, gameScene: { scene, chunkMeshes: chunks, camera, renderer } };
    document.querySelector('#react').__reactContainer$fixture = {
      updateQueue: { baseState: { element: { props: { game: window.miniblox } } } }
    };
  });
  await page.addScriptTag({ content: expose(read('src/Render/LeafWind.js'), 'auditLeaf', 'state, setEnabled, scan') });
  await page.evaluate(() => window.auditLeaf.setEnabled(true));
  await page.waitForFunction(() => window.auditLeaf.state.records.size === 1);
  const first = await page.evaluate(() => {
    const a = window.audit;
    a.renderer.render(a.scene, a.camera);
    const gl = a.renderer.getContext();
    const pixel = new Uint8Array(4);
    gl.readPixels(48, 48, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return { pixel: [...pixel], error: gl.getError() };
  });
  assert.equal(first.error, 0);
  assert.ok(first.pixel[1] > 100, 'leaf geometry is visible');
  const changed = await page.evaluate(() => {
    const a = window.audit;
    a.leaf = false;
    for (const key of ['position', 'normal', 'uv']) {
      const old = a.mesh.geometry.attributes[key];
      const array = new Float32Array(old.array.length * 2);
      array.set(old.array); array.set(old.array, old.array.length);
      a.mesh.geometry.setAttribute(key, new a.THREE.BufferAttribute(array, old.itemSize));
    }
    // Draw before scan: the per-mesh guard must avoid the obsolete mask.
    a.renderer.render(a.scene, a.camera);
    const gl = a.renderer.getContext();
    const pixel = new Uint8Array(4);
    gl.readPixels(48, 48, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    window.auditLeaf.scan();
    return { pixel: [...pixel], error: gl.getError(), mask: !!a.mesh.geometry.getAttribute('mfLeaf') };
  });
  assert.equal(changed.error, 0);
  assert.equal(changed.mask, false);
  assert.ok(changed.pixel[1] > 100, 'updated native geometry remains visible');
  await page.waitForFunction(() => !window.auditLeaf.state.working);
  await page.addScriptTag({ content: expose(read('src/Shaders/CustomShader.js'), 'auditShader', 'state, scan, disable') });
  const combined = await page.evaluate(() => {
    const a = window.audit;
    window.auditShader.state.enabled = true;
    window.auditShader.scan();
    a.renderer.render(a.scene, a.camera);
    const gl = a.renderer.getContext();
    const error = gl.getError();
    const hooked = window.auditShader.state.hooked.size;
    a.chunks.remove(a.mesh);
    window.auditLeaf.scan(); window.auditShader.scan();
    return { error, hooked, retired: window.auditShader.state.hooked.size,
      leafRetired: window.auditLeaf.state.records.size };
  });
  assert.equal(combined.error, 0);
  assert.equal(combined.hooked, 1);
  assert.equal(combined.retired, 0);
  assert.equal(combined.leafRetired, 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: 'Edge headless, isolated WebGL fixture', first, changed, combined, errors }, null, 2));
  await page.evaluate(() => {
    window.auditLeaf.setEnabled(false); window.auditShader.disable();
    window.audit.renderer.dispose();
  });
  await context.close();
} finally {
  await browser.close();
}
