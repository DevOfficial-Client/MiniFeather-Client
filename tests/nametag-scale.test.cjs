const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sources = Object.fromEntries(['TitanTiny', 'HealthNameTags', 'DistanceNameTags'].map(name => [
    name, fs.readFileSync(path.join(__dirname, `../src/Render/${name}.js`), 'utf8')
]));

// Deliberately renamed native methods: discovery must work without a specific
// Miniblox bundle's obfuscated names, before and after text decoration.
class NativePlayerMesh {
    constructor(entity) {
        this.entity = entity;
        this.position = entity.pos;
        this.nameTagText = entity.profile.username;
        this.nameTagColor = '#ffffff';
        this.nameTagOpacity = 0.8;
        this.isMesh = true;
        this.parent = {};
        this.children = [];
        this.scale = { x: 1, y: 1, z: 1, set(x, y, z) { Object.assign(this, { x, y, z }); } };
    }
    updateMatrixWorld() {}
    labelOffset() { return 2.2; }
    drawPlayerLabel(batch, marker) {
        return batch.submit({ x: this.position.x, y: this.position.y + this.labelOffset(), z: this.position.z },
            this.nameTagText, this.nameTagColor, this.nameTagOpacity, marker);
    }
}

function setup() {
    const player = { id: 7, pos: { x: 1, y: 2, z: 3 }, width: 0.6, height: 1.8,
        health: 20, profile: { username: 'Local' }, getEyeHeight() { return 1.62; } };
    const local = { ...player }, remote = { ...player, id: 8, pos: { x: 4, y: 2, z: 7 }, health: 16.5, profile: { username: 'Remote' } };
    local.mesh = new NativePlayerMesh(local);
    remote.mesh = new NativePlayerMesh(remote);
    const game = { player, world: { entitiesDump: new Map([[7, local], [8, remote]]) } };
    const react = { root: { updateQueue: { baseState: { element: { props: { game } } } } } };
    let clock = 1000, frames = [];
    const sandbox = {
        performance: { now: () => clock },
        document: { addEventListener() {}, dispatchEvent() {}, querySelector: selector => selector === '#react' ? react : null },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        requestAnimationFrame(fn) { frames.push(fn); }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    for (const name of ['TitanTiny', 'HealthNameTags', 'DistanceNameTags']) vm.runInContext(sources[name], sandbox, { filename: `${name}.js` });
    const draw = entity => {
        let result;
        const returned = entity.mesh.drawPlayerLabel({ submit(position, text, color, opacity, marker) {
            result = { position, text, color, opacity, marker }; return 'submitted';
        } }, 'native-argument');
        assert.equal(returned, 'submitted');
        assert.equal(result.marker, 'native-argument');
        assert.equal(result.color, '#ffffff');
        assert.equal(result.opacity, 0.8);
        assert.equal(entity.mesh.nameTagText, entity.profile.username, 'decorated text is temporary');
        return result;
    };
    return { sandbox, player, local, remote, draw, tick() {
        clock += 1000;
        const current = frames; frames = [];
        for (const fn of current) fn(clock);
    } };
}

function close(actual, expected) {
    assert.ok(Math.abs(actual - expected) < 1e-8, `expected ${expected}, got ${actual}`);
}

for (const order of ['labels-first', 'scale-first']) {
    for (const decoration of ['health', 'distance', 'both']) {
        test(`nametag follows Titan & Tiny with ${decoration}, ${order}`, () => {
            const state = setup(), { sandbox: s, local, remote, draw } = state;
            const labels = () => {
                s.MiniFeatherHealthNameTags.setEnabled(decoration !== 'distance');
                s.MiniFeatherDistanceNameTags.setEnabled(decoration !== 'health');
            };
            const scale = () => { s.TitanTiny.setScale(3); s.TitanTiny.setEnabled(true); };
            if (order === 'labels-first') { labels(); scale(); } else { scale(); labels(); }
            assert.equal(s.TitanTiny.modelFound, true);
            close(draw(local).position.y, local.pos.y + 1.8 * 3 + 0.4);
            close(draw(remote).position.y, remote.pos.y + 2.2);
            assert.equal(draw(local).text, decoration === 'both' ? 'Local (❤20 | 0.0m)' : decoration === 'health' ? 'Local (❤20)' : 'Local (0.0m)');
            assert.equal(draw(remote).text, decoration === 'both' ? 'Remote (❤16.5 | 5.0m)' : decoration === 'health' ? 'Remote (❤16.5)' : 'Remote (5.0m)');
            s.TitanTiny.setScale(0.25);
            close(draw(local).position.y, local.pos.y + 1.8 * 0.25 + 0.4);
            s.MiniFeatherHealthNameTags.setEnabled(false);
            s.MiniFeatherDistanceNameTags.setEnabled(false);
            close(draw(local).position.y, local.pos.y + 1.8 * 0.25 + 0.4);
            assert.equal(draw(local).text, 'Local');
            labels();
            s.TitanTiny.setScale(5);
            close(draw(local).position.y, local.pos.y + 1.8 * 5 + 0.4);
            s.TitanTiny.setEnabled(false);
            close(draw(local).position.y, local.pos.y + 2.2);
            assert.equal(local.mesh.labelOffset, NativePlayerMesh.prototype.labelOffset);
            s.MiniFeatherHealthNameTags.setEnabled(false);
            s.MiniFeatherDistanceNameTags.setEnabled(false);
            assert.equal(local.mesh.drawPlayerLabel, NativePlayerMesh.prototype.drawPlayerLabel);
        });
    }
}

test('native nametag without decorators still scales and restores normally', () => {
    const { sandbox: s, local, draw } = setup();
    s.TitanTiny.setScale(3); s.TitanTiny.setEnabled(true);
    close(draw(local).position.y, local.pos.y + 5.8);
    s.TitanTiny.setEnabled(false);
    close(draw(local).position.y, local.pos.y + 2.2);
});

test('scaled native entity-height offsets are not scaled twice', () => {
    const { sandbox: s, local, draw } = setup();
    const originalOffset = local.mesh.labelOffset = function () { return this.entity.height + 0.4; };
    s.MiniFeatherHealthNameTags.setEnabled(true);
    s.MiniFeatherDistanceNameTags.setEnabled(true);
    s.TitanTiny.setScale(3); s.TitanTiny.setEnabled(true);
    close(local.height, 5.4);
    close(draw(local).position.y, local.pos.y + 5.8);
    s.TitanTiny.setScale(0.01);
    close(draw(local).position.y, local.pos.y + 0.418);
    s.TitanTiny.setScale(1);
    close(draw(local).position.y, local.pos.y + 2.2);
    s.TitanTiny.setEnabled(false);
    assert.equal(local.mesh.labelOffset, originalOffset);
    close(local.height, 1.8);
});

test('respawn or model replacement keeps decorated labels aligned and restores the old mesh', () => {
    const { sandbox: s, local, draw, tick } = setup();
    s.MiniFeatherHealthNameTags.setEnabled(true);
    s.MiniFeatherDistanceNameTags.setEnabled(true);
    s.TitanTiny.setScale(3); s.TitanTiny.setEnabled(true);
    const previous = local.mesh;
    local.mesh = new NativePlayerMesh(local);
    tick();
    close(previous.scale.y, 1);
    assert.equal(previous.labelOffset, NativePlayerMesh.prototype.labelOffset);
    assert.equal(previous.drawPlayerLabel, NativePlayerMesh.prototype.drawPlayerLabel);
    close(local.mesh.scale.y, 3);
    close(draw(local).position.y, local.pos.y + 5.8);
    assert.equal(draw(local).text, 'Local (❤20 | 0.0m)');
});

test('health and distance stay live and restore the original text even when native drawing fails', () => {
    const { sandbox: s, local, remote, draw } = setup();
    s.MiniFeatherHealthNameTags.setEnabled(true);
    s.MiniFeatherDistanceNameTags.setEnabled(true);
    s.TitanTiny.setScale(3); s.TitanTiny.setEnabled(true);
    local.health = 8;
    remote.pos.x = 10; remote.pos.z = 3;
    assert.equal(draw(local).text, 'Local (❤8 | 0.0m)');
    assert.equal(draw(remote).text, 'Remote (❤16.5 | 9.0m)');
    close(draw(local).position.y, local.pos.y + 5.8);
    assert.throws(() => local.mesh.drawPlayerLabel({ submit() { throw new Error('native draw failed'); } }), /native draw failed/);
    assert.equal(local.mesh.nameTagText, 'Local');
});
