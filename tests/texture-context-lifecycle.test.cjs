'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('texture interception never loses active off-DOM WebGL contexts', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/Render/TextureInterceptor.js'), 'utf8');
  const boundary = src.indexOf("    var KEY = 'mf_custom_textures';");
  assert.ok(boundary > 0);
  let now = 1000;
  let losses = 0;
  const intervals = [];
  class Canvas {
    constructor() {
      this.isConnected = false;
      this.gl = {
        isContextLost: () => false,
        getExtension: () => ({ loseContext() { losses++; } }),
        drawArrays() {}
      };
    }
    getContext() { return this.gl; }
  }
  const ctx = { HTMLCanvasElement: Canvas, Date: { now: () => now },
    setInterval(fn) { intervals.push(fn); return 1; }, clearInterval() {} };
  ctx.window = ctx;
  vm.runInNewContext(src.slice(0, boundary) + '})();', ctx);
  const canvases = Array.from({ length: 12 }, () => new Canvas());
  for (const canvas of canvases) canvas.getContext('webgl2');
  now += 30000;
  for (const canvas of canvases) canvas.gl.drawArrays();
  for (const fn of intervals) fn();
  assert.equal(losses, 0);
  assert.equal(canvases[0].getContext('webgl2'), canvases[0].gl);
});
