// MF_Config.saveDefaults(): el defaults.json de TU config actual. la plantilla
// shipped manda las secciones, el resto cae en "other". run: node --test tests/config-defaults.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(ROOT, 'src', 'UI', 'ClientPanel.js'), 'utf8');

function namedFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} missing`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} has no closing brace`);
}

function buildWith(settings, template) {
  const fn = vm.runInNewContext(`(${namedFunction(code, 'buildDefaultsObject')})`, { settings });
  return fn(template);
}

const TEMPLATE = {
  _note: 'meh...default configs, i think',
  general: { language: 'en', discord: true },
  hud: { fpsCounter: true, coordinates: false },
  render: { fullBright: false, leafWindStrength: 0.085 }
};

test('sections come from the shipped template with current values on top', () => {
  const settings = { language: 'es', discord: true, fpsCounter: false, coordinates: true, fullBright: true, leafWindStrength: 0.2 };
  const out = buildWith(settings, TEMPLATE);
  assert.equal(out.general.language, 'es', 'current value wins');
  assert.equal(out.hud.fpsCounter, false, 'current value wins');
  assert.equal(out.hud.coordinates, true);
  assert.equal(out.render.leafWindStrength, 0.2);
  assert.equal(out._note.startsWith('_') === false && typeof out._note === 'string', true, 'own note, loader-safe name');
});

test('template value survives when the key is not in current settings', () => {
  const out = buildWith({}, TEMPLATE);
  assert.equal(out.general.language, 'en');
  assert.equal(out.render.fullBright, false);
});

test('settings keys outside the template land in "other" (sorted, nothing lost)', () => {
  const settings = { zoom: true, zoomBind: 'KeyX', alphaBind: 'A', language: 'es' };
  const out = buildWith(settings, TEMPLATE);
  assert.deepEqual(Object.keys(out.other), ['alphaBind', 'zoom', 'zoomBind']);
  assert.equal(out.other.zoomBind, 'KeyX');
});

test('underscore keys of the template are dropped, round-trips through the panel flatten', () => {
  const settings = { language: 'es', keystrokes: true };
  const out = buildWith(settings, TEMPLATE);
  const json = JSON.stringify(out, null, 2) + '\n';
  const reloaded = JSON.parse(json);
  const flat = {};
  for (const k in reloaded) {
    if (k.startsWith('_')) continue;
    const v = reloaded[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(flat, v);
    else flat[k] = v;
  }
  assert.equal(flat._note, undefined, 'note never leaks into settings');
  assert.equal(flat.language, 'es');
  assert.equal(flat.keystrokes, true);
});

test('console command is exposed with both entry points', () => {
  assert.match(code, /window\.MF_Config = \{/);
  assert.match(code, /async defaults\(\)/);
  assert.match(code, /async saveDefaults\(\)/);
  assert.match(code, /a\.download = 'defaults\.json'/);
});

test('MAIN-world bridge: shim inyectado + ida y vuelta por CustomEvent + cleanup en destroy', () => {
  // la consola de devtools vive en MAIN world; el panel es ISOLATED. sin el
  // shim, el comando sería invisible para quien lo va a usar.
  assert.match(code, /const MF_CONFIG_SHIM = /, 'shim source exists');
  assert.match(code, /mf:config:req:v1/, 'request event');
  assert.match(code, /mf:config:res:v1/, 'response event');
  assert.match(code, /window\.addEventListener\(MF_CONFIG_REQ, onConfigRequest\)/, 'panel answers requests');
  assert.match(code, /window\.removeEventListener\(MF_CONFIG_REQ, onConfigRequest\)/, 'destroy cleans up');
  assert.match(code, /s\.textContent = MF_CONFIG_SHIM/, 'shim actually injected');

  // el shim se ejecuta de verdad: eval del string literal tal cual vive en el source
  const shim = vm.runInNewContext(code.match(/const MF_CONFIG_SHIM = ("(?:[^"\\]|\\[\s\S])*");/)[1]);

  // caso userscript/APK: ya existe MF_Config → el shim no pisa nada
  const existing = { window: { MF_Config: { marker: true }, addEventListener() {}, dispatchEvent() {} } };
  vm.runInNewContext(shim, existing);
  assert.equal(existing.window.MF_Config.marker, true, 'shim bails when MF_Config already exists');

  // caso extensión: instala el comando y ask() despacha el request con id
  const sent = [];
  const listeners = {};
  const fresh = {
    window: {
      addEventListener: (t, fn) => { listeners[t] = fn; },
      dispatchEvent: ev => sent.push(ev)
    },
    CustomEvent: function (type, opts) { this.type = type; this.detail = opts && opts.detail; },
    setTimeout: () => 0,
    JSON,
    Error
  };
  vm.runInNewContext(shim, fresh);
  assert.equal(typeof fresh.window.MF_Config.defaults, 'function');
  assert.equal(typeof fresh.window.MF_Config.saveDefaults, 'function');
  const p = fresh.window.MF_Config.saveDefaults();
  assert.equal(sent.length, 1, 'ask dispatched exactly one request');
  const req = JSON.parse(sent[0].detail);
  assert.equal(req.cmd, 'save');
  assert.equal(typeof req.id, 'number');
  // responde como lo haría el panel y la promesa se resuelve con la config
  listeners['mf:config:res:v1']({ detail: JSON.stringify({ id: req.id, ok: true, data: '{"general":{"language":"es"}}' }) });
  return p.then(out => assert.deepEqual({ ...out.general }, { language: 'es' }));
});

test('no template (userscript/APK) degrades to a single flat "other" section', () => {
  const settings = { language: 'es', zoom: true };
  const out = buildWith(settings, null);
  // el objeto viene del realm del vm: separamos prototype antes del deepEqual
  assert.deepEqual({ ...out.other }, { language: 'es', zoom: true });
});
