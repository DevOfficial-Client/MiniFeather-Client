// Analiza un GLB: estructura, accessors, texturas, skins, animaciones
const fs = require('fs');
const file = process.argv[2] || 'models/entities/verity_full_model.glb';

const buf = fs.readFileSync(file);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const dv = new DataView(ab);
if (dv.getUint32(0, true) !== 0x46546c67) { console.log('NO ES GLB'); process.exit(1); }
const total = dv.getUint32(8, true);
let json = null, bin = null, off = 12;
while (off < total) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, start, len)));
    else if (type === 0x004e4942) bin = ab.slice(start, start + len);
    off = start + len;
}
console.log('=== ' + file + ' (' + buf.length + ' bytes, bin ' + (bin ? bin.byteLength : 0) + ') ===');
console.log('generator:', json.asset?.generator, '| version:', json.asset?.version);
console.log('meshes:', json.meshes?.length, '| nodes:', json.nodes?.length, '| materials:', json.materials?.length);
console.log('textures:', json.textures?.length, '| images:', json.images?.length);
console.log('skins:', json.skins?.length, '| animations:', json.animations?.length);
console.log('cameras:', json.cameras?.length, '| extensions:', Object.keys(json.extensionsUsed || {}));

// atributos usados
const attrs = new Set();
let prims = 0, tri = 0, verts = 0;
for (const m of json.meshes || []) {
    for (const p of m.primitives) {
        prims++;
        Object.keys(p.attributes).forEach((a) => attrs.add(a));
        const posAcc = json.accessors[p.attributes.POSITION];
        verts += posAcc.count;
        const idxAcc = p.indices != null ? json.accessors[p.indices] : null;
        tri += idxAcc ? idxAcc.count / 3 : posAcc.count / 3;
    }
}
console.log('primitivas:', prims, '| triangulos:', Math.round(tri), '| vertices:', verts);
console.log('atributos:', [...attrs].join(', '));

// tipos de componentType de indices
const idxTypes = new Set();
for (const m of json.meshes || []) for (const p of m.primitives) if (p.indices != null) idxTypes.add(json.accessors[p.indices].componentType);
console.log('componentTypes de indices:', [...idxTypes].join(', '), '(5123=u16, 5125=u32)');

// imagenes
for (let i = 0; i < (json.images || []).length; i++) {
    const img = json.images[i];
    const desc = img.bufferView != null ? 'bufferView ' + img.bufferView + ' (' + (img.mimeType || '?') + ')' : (img.uri || '').slice(0, 60);
    console.log('imagen[' + i + ']:', desc);
}

// bounds del scene graph
function nodeMat(n) {
    if (n.matrix) return n.matrix;
    const m = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
    if (n.scale) { m[0]=n.scale[0]; m[5]=n.scale[1]; m[10]=n.scale[2]; }
    if (n.translation) { m[12]=n.translation[0]; m[13]=n.translation[1]; m[14]=n.translation[2]; }
    return m;
}
function mul(a,b){const o=new Array(16);for(let r=0;r<4;r++)for(let c=0;c<4;c++)o[r*4+c]=a[r*4]*b[c]+a[r*4+1]*b[4+c]+a[r*4+2]*b[8+c]+a[r*4+3]*b[12+c];return o;}
const dvb = new DataView(bin);
function readAcc(acc) {
    const sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
    const reads={5120:o=>dvb.getInt8(o),5121:o=>dvb.getUint8(o),5122:o=>dvb.getInt16(o,true),5123:o=>dvb.getUint16(o,true),5125:o=>dvb.getUint32(o,true),5126:o=>dvb.getFloat32(o,true)};
    const numC={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[acc.type];
    const comp=sizes[acc.componentType]; const read=reads[acc.componentType];
    const bv=json.bufferViews[acc.bufferView||0];
    const base=(bv.byteOffset||0)+(acc.byteOffset||0);
    const stride=bv.byteStride||comp*numC;
    const out=new Float32Array(acc.count*numC);
    for(let i=0;i<acc.count;i++){const row=base+i*stride;for(let j=0;j<numC;j++)out[i*numC+j]=read(row+j*comp);}
    return out;
}
let minY=Infinity,maxY=-Infinity,maxR=0;
function walk(idx, pm) {
    const n=json.nodes[idx]; if(!n) return;
    const wm=mul(pm,nodeMat(n));
    if(n.mesh!=null){
        for(const p of json.meshes[n.mesh].primitives){
            const pos=readAcc(json.accessors[p.attributes.POSITION]);
            for(let i=0;i<pos.length;i+=3){
                const x=wm[0]*pos[i]+wm[4]*pos[i+1]+wm[8]*pos[i+2]+wm[12];
                const y=wm[1]*pos[i]+wm[5]*pos[i+1]+wm[9]*pos[i+2]+wm[13];
                const z=wm[2]*pos[i]+wm[6]*pos[i+1]+wm[10]*pos[i+2]+wm[14];
                if(y<minY)minY=y; if(y>maxY)maxY=y;
                const r=Math.hypot(x,z); if(r>maxR)maxR=r;
            }
        }
    }
    for(const c of n.children||[]) walk(c,wm);
}
for(const n of json.scenes?.[json.scene??0]?.nodes||[]) walk(n,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
console.log('bounds: Y ' + minY.toFixed(3) + ' a ' + maxY.toFixed(3) + ' (altura ' + (maxY-minY).toFixed(3) + '), radio max ' + maxR.toFixed(3));

// skins: JOINTS_0/WEIGHTS_0 implican rig, mi parser los ignora (pose bind estatica)
if (attrs.has('JOINTS_0')) console.log('NOTA: tiene skinning (JOINTS_0) — se renderizara en pose de bind (estatico)');
if ((json.animations||[]).length) console.log('NOTA: tiene animaciones — ignoradas por ahora');
