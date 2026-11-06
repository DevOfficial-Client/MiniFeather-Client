'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./helpers/render-lifecycle.cjs');
const root = path.join(__dirname, '..');

test('normal shader defaults agree across the JSON, panel and MAIN renderer', () => {
  const defaults = JSON.parse(fs.readFileSync(path.join(root, 'defaults.json'), 'utf8'));
  const panel = fs.readFileSync(path.join(root, 'src/UI/ClientPanel.js'), 'utf8');
  assert.equal(defaults.shaders?.customShaderPreset ?? defaults.render?.customShaderPreset, 'photon');
  assert.match(panel, /customShaderPreset: 'photon'/);
  assert.doesNotMatch(panel, /customShaderPreset \|\| 'spooklementary'/);
  const f = fixture();
  f.load('src/Shaders/CustomShader.js', 'state');
  assert.equal(f.context.MF_CustomShader.getState().preset, 'photon');
});

test('an explicitly saved Spooklementary choice is preserved and remains an optional preset', () => {
  const f = fixture();
  f.context.localStorage.setItem('miniblox_customshader_preset', 'spooklementary');
  f.load('src/Shaders/CustomShader.js', 'state');
  assert.equal(f.context.MF_CustomShader.getState().preset, 'spooklementary');
  assert.ok(f.context.MF_CustomShader.listPresets().includes('photon'));
  assert.ok(f.context.MF_CustomShader.listPresets().includes('spooklementary'));
});
