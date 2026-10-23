// Isolated WebGL regression scene, not a live-world FPS certification.
// Uses a temporary browser profile, synthetic players and procedural textures.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const output = mkdtempSync(join(tmpdir(), 'mf-cape-check-'));
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<style>body{margin:0;background:#101923;color:#d8e7f5;font:16px monospace}h2{margin:14px;text-align:center}canvas{display:block}footer{display:flex;justify-content:space-around}</style><h2>Better Animated Cape · isolated WebGL check</h2><canvas id="demo"></canvas><footer><span>Idle / wind</span><span>Running / turn</span><span>Crouching</span></footer>');
  const three = readFileSync(new URL('../node_modules/three/build/three.cjs', import.meta.url), 'utf8');
  await page.addScriptTag({ content: `(function(exports){${three}\n})(window.THREE = {});` });
  await page.evaluate(() => {
    window.__realNow = performance.now.bind(performance);
    window.__capeTime = 0;
    Object.defineProperty(performance, 'now', { value: () => window.__capeTime, configurable: true });
  });
  await page.addScriptTag({ content: readFileSync(new URL('../src/Render/BetterAnimationCape.js', import.meta.url), 'utf8') });
  const result = await page.evaluate(() => {
    const T = THREE;
    const scene = new T.Scene(); scene.background = new T.Color(0x101923);
    const renderer = new T.WebGLRenderer({ canvas: document.querySelector('#demo'), antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1100, 550); renderer.setPixelRatio(1);
    const camera = new T.PerspectiveCamera(40, 2, 0.05, 100);
    camera.position.set(0.8, 2.4, 7.5); camera.lookAt(0, 1, 0);
    scene.add(new T.HemisphereLight(0xd6efff, 0x334354, 2));
    const light = new T.DirectionalLight(0xffffff, 2.8); light.position.set(-3, 5, 4); scene.add(light);
    scene.add(new T.GridHelper(12, 24, 0x40566b, 0x263442));
    const pixels = new Uint8Array(16 * 32 * 4);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) {
      const at = (y * 16 + x) * 4;
      const gold = x < 2 || x > 13 || y < 2 || y > 29 || (Math.abs(x - 7.5) + Math.abs(y - 16) / 2 < 4);
      const color = gold ? [240, 179, 56] : (x + y) % 2 ? [142, 31, 62] : [168, 40, 70];
      pixels.set([...color, 255], at);
    }
    const texture = new T.DataTexture(pixels, 16, 32); texture.magFilter = T.NearestFilter;
    texture.minFilter = T.NearestFilter; texture.colorSpace = T.SRGBColorSpace; texture.needsUpdate = true;
    const capeMaterial = new T.MeshStandardMaterial({ map: texture, roughness: 0.85 });
    const bodyMaterial = new T.MeshStandardMaterial({ color: 0x367b95, roughness: 0.9 });
    const skinMaterial = new T.MeshStandardMaterial({ color: 0xd3a686 });
    const source = new T.BoxGeometry(0.6, 0.95, 0.04).translate(0, -0.475, 0);
    const game = { player: null, world: { players: new Map() } };
    function makePlayer(id, x) {
      const mesh = new T.Group(), body = new T.Group(), torso = new T.Bone(), cape = new T.Group();
      body.position.y = 1.5; torso.position.y = -0.375; body.add(torso); mesh.add(body);
      const torsoMesh = new T.Mesh(new T.BoxGeometry(0.5, 0.75, 0.25), bodyMaterial); torso.add(torsoMesh);
      const head = new T.Mesh(new T.BoxGeometry(0.46, 0.46, 0.46), skinMaterial); head.position.y = 0.23; body.add(head);
      for (const sign of [-1, 1]) {
        const arm = new T.Mesh(new T.BoxGeometry(0.23, 0.7, 0.23), skinMaterial); arm.position.set(sign * 0.39, -0.35, 0); body.add(arm);
        const leg = new T.Mesh(new T.BoxGeometry(0.23, 0.75, 0.23), bodyMaterial); leg.position.set(sign * 0.13, -1.125, 0); body.add(leg);
      }
      cape.position.z = 0.18; cape.add(new T.Mesh(source, capeMaterial)); body.add(cape);
      mesh.body = body; mesh.torso = torso; mesh.meshes = { torso: torsoMesh }; mesh.capeMesh = cape;
      const entity = { id, pos: new T.Vector3(x, 0, 0), mesh, sneak: false, inWater: false };
      mesh.render = function () {
        mesh.position.copy(entity.pos);
        cape.rotation.x = entity.sneak ? -0.5 : -0.08;
        cape.position.y = entity.sneak ? -0.20 : 0;
        body.rotation.x = entity.sneak ? 0.25 : 0;
        mesh.updateMatrixWorld(true);
      };
      game.world.players.set(id, entity); scene.add(mesh); return entity;
    }
    const players = [makePlayer(1, -1.8), makePlayer(2, 0), makePlayer(3, 1.8)];
    game.player = players[1]; window.__MINIBLOX_GAME__ = game;
    BetterAnimationCape.configure({ enabled: true });
    for (let frame = 0; frame < 120; frame++) {
      window.__capeTime += 1000 / 60;
      players[1].pos.z -= 0.04; players[1].mesh.rotation.y = Math.sin(frame / 25) * 0.35;
      players[2].sneak = true;
      for (const player of players) player.mesh.render();
    }
    // Move the demo group together for framing, preserving its settled cloth.
    const visual = new T.Group(); scene.add(visual);
    for (const player of players) visual.add(player.mesh);
    players[1].mesh.position.z = 0; // apply identical translation to native root and cloth via matrix
    renderer.render(scene, camera);
    const benchmark = count => {
      while (game.world.players.size < count) makePlayer(game.world.players.size + 1, 0);
      BetterAnimationCape.synchronize();
      const subjects = [...game.world.players.values()].slice(0, count);
      const samples = [];
      for (let frame = 0; frame < 160; frame++) {
        window.__capeTime += 1000 / 60;
        const start = window.__realNow();
        for (const player of subjects) { player.pos.z -= 0.02; player.mesh.render(); }
        const elapsed = window.__realNow() - start;
        if (frame > 30) samples.push(elapsed);
      }
      samples.sort((a, b) => a - b);
      return { capes: count, medianPhysicsMs: samples[Math.floor(samples.length / 2)], p95PhysicsMs: samples[Math.floor(samples.length * 0.95)] };
    };
    window.__capeDemo = { renderer, scene, camera, game, players, benchmark, source };
    return { version: BetterAnimationCape.getState().version, screenshotState: BetterAnimationCape.getState(), glError: renderer.getContext().getError() };
  });
  const screenshot = join(output, 'cape-webgl.png');
  await page.screenshot({ path: screenshot });
  const checks = await page.evaluate(() => {
    const { benchmark, game, renderer, source } = window.__capeDemo;
    const performance = [benchmark(1), benchmark(16)];
    const positions = [], normals = [], uvs = [], indices = [];
    for (let row = 0; row < 17; row++) for (let col = 0; col < 11; col++) {
      const cube = new THREE.BoxGeometry(0.6 / 11, 0.95 / 17, 0.04).translate((col - 5) * 0.6 / 11, -(row + 0.5) * 0.95 / 17, 0);
      const offset = positions.length / 3;
      positions.push(...cube.attributes.position.array); normals.push(...cube.attributes.normal.array); uvs.push(...cube.attributes.uv.array);
      indices.push(...Array.from(cube.index.array, value => value + offset)); cube.dispose();
    }
    const voxel = new THREE.BufferGeometry();
    voxel.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    voxel.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    voxel.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); voxel.setIndex(indices);
    for (const player of game.world.players.values()) player.mesh.capeMesh.children[0].geometry = voxel;
    performance.push({ ...benchmark(16), geometry: 'Native-like 11x17 closed pixel cubes' });
    const before = BetterAnimationCape.getState();
    const texturesPreserved = [...game.world.players.values()].every(player => !!player.mesh.capeMesh.children[0].material.map);
    BetterAnimationCape.setEnabled(false);
    const restored = [...game.world.players.values()].every(player => player.mesh.capeMesh.children[0].geometry === voxel);
    const disabled = BetterAnimationCape.getState();
    renderer.dispose(); voxel.dispose(); source.dispose();
    return { performance, before, texturesPreserved, restored, disabled };
  });
  assert.equal(result.version, 3); assert.equal(result.glError, 0);
  assert.equal(checks.before.error, ''); assert.equal(checks.before.geometryBuilds, 32);
  assert.equal(checks.texturesPreserved, true); assert.equal(checks.restored, true); assert.equal(checks.disabled.hooks, 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ scope: 'Synthetic real WebGL scene; physics timings do not measure actual game FPS.', screenshot, result, checks, errors }, null, 2));
} finally { await browser.close(); }
