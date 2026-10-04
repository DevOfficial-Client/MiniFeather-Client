const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// skinguard se evalúa en un sandbox sin DOM ni crypto: la heurística pura
// (evaluateSkinPixels) es el contrato, igual que en el navegador. :D
const source = fs.readFileSync(path.join(__dirname, '../src/Cosmetics/SkinGuard.js'), 'utf8');
const sandbox = {
  console,
  fetch: () => Promise.reject(new Error('sin red en tests'))
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const guard = sandbox.__MF_SKIN_GUARD__;
assert.ok(guard, 'SkinGuard no expuso __MF_SKIN_GUARD__');

const SKIN = [200, 150, 110, 255];   // tono de piel clásico del pixelart
const CLOTH = [40, 70, 200, 255];    // pantalón/camisa azul
const CLEAR = [0, 0, 0, 0];

function makeSkin(w, h, painter) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = painter(x, y);
      const i = (y * w + x) * 4;
      data[i] = px[0]; data[i + 1] = px[1]; data[i + 2] = px[2]; data[i + 3] = px[3];
    }
  }
  return data;
}
const inRect = (x, y, rx, ry, rw, rh) => x >= rx && x < rx + rw && y >= ry && y < ry + rh;

test('skin con ropa normal: no se marca', () => {
  // cara y brazos de piel, torso y piernas con ropa
  const data = makeSkin(64, 64, (x, y) => {
    if (inRect(x, y, 8, 8, 8, 8)) return SKIN;       // cara
    if (inRect(x, y, 4, 20, 4, 12)) return SKIN;     // brazos pelados (legit)
    return CLOTH;
  });
  const v = guard.evaluateSkinPixels(64, 64, data);
  assert.equal(v.flag, false);
});

test('sin camisa pero con pantalón: no se marca (falso positivo clásico evitado)', () => {
  const data = makeSkin(64, 64, (x, y) => {
    if (inRect(x, y, 20, 20, 8, 8)) return SKIN;     // torso pelado
    return CLOTH;
  });
  assert.equal(guard.evaluateSkinPixels(64, 64, data).flag, false);
});

test('desnudo integral 64x64: se marca', () => {
  const data = makeSkin(64, 64, (x, y) => {
    if (inRect(x, y, 20, 20, 8, 8)) return SKIN;     // pecho
    if (inRect(x, y, 20, 28, 8, 4)) return SKIN;     // ingle
    if (inRect(x, y, 32, 28, 8, 4)) return SKIN;     // trasero
    if (inRect(x, y, 4, 20, 4, 12)) return SKIN;     // piernas
    return CLOTH;
  });
  const v = guard.evaluateSkinPixels(64, 64, data);
  assert.equal(v.flag, true);
  assert.equal(v.reason, 'nsfw-heuristic');
});

test('desnudo en legacy 64x32: se marca vía piernas', () => {
  const data = makeSkin(64, 32, (x, y) => {
    if (inRect(x, y, 20, 20, 8, 8)) return SKIN;
    if (inRect(x, y, 20, 28, 8, 4)) return SKIN;
    if (inRect(x, y, 4, 20, 4, 12)) return SKIN;
    return CLOTH; // el torso trasero (32,28) pintado de ropa
  });
  const v = guard.evaluateSkinPixels(64, 32, data);
  assert.equal(v.stats.butt, 0, 'trasero con ropa: ratio 0, no cuenta');
  assert.equal(v.flag, true);
});

test('altura que no corresponde a ningún layout de skin (h=24): no opina', () => {
  const data = makeSkin(64, 24, () => SKIN);
  const v = guard.evaluateSkinPixels(64, 24, data);
  assert.equal(v.stats.butt, undefined, 'sin análisis: stats vacíos');
  assert.equal(v.flag, false);
});

test('textura que no es de skin (dimensiones raras): no opina', () => {
  const data = makeSkin(17, 17, () => SKIN);
  assert.equal(guard.evaluateSkinPixels(17, 17, data).flag, false);
});

test('imagen totalmente transparente: no se marca', () => {
  const data = makeSkin(64, 64, () => CLEAR);
  assert.equal(guard.evaluateSkinPixels(64, 64, data).flag, false);
});

test('skin HD 128x128 (escala x2): se marca igual', () => {
  const data = makeSkin(128, 128, (x, y) => {
    if (inRect(x, y, 40, 40, 16, 16)) return SKIN;   // pecho x2
    if (inRect(x, y, 40, 56, 16, 8)) return SKIN;    // ingle x2
    if (inRect(x, y, 64, 56, 16, 8)) return SKIN;    // trasero x2
    if (inRect(x, y, 8, 40, 8, 24)) return SKIN;     // piernas x2
    return CLOTH;
  });
  assert.equal(guard.evaluateSkinPixels(128, 128, data).flag, true);
});

test('blocklist: hash en lista se detecta (case-insensitive), fuera de lista no', () => {
  guard.setBlocklist(['ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789']);
  assert.equal(guard.isBlocklisted('abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'), true);
  assert.equal(guard.isBlocklisted('0000000000000000000000000000000000000000000000000000000000000000'), false);
  assert.equal(guard.isBlocklisted(null), false);
});

test('registro custodiado: skinguard instala el proxy de __MF_PACK_SKINS__ y los ids bloqueados desaparecen para cualquier lector', () => {
  const reg = sandbox.__MF_PACK_SKINS__;
  assert.ok(reg, 'el registro debe existir tras cargar skinguard (carga antes que cosmetics)');
  reg['mf_test'] = 'https://example.com/skin.png'; // http: no se toca en el set
  assert.equal(reg['mf_test'], 'https://example.com/skin.png');
  guard.markBlockedId('mf_test', true);
  assert.equal(reg['mf_test'], undefined, 'id bloqueado: el get-trap devuelve undefined');
  assert.equal('mf_test' in Object.assign({}, reg), true, 'sigue existiendo físicamente (purge por veredicto)');
  guard.markBlockedId('mf_test', false);
  assert.equal(reg['mf_test'], 'https://example.com/skin.png');
  delete reg['mf_test'];
  assert.equal(reg['mf_test'], undefined);
});
