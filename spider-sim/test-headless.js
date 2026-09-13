// Prueba headless: araña hexbot en galope caminando 100 ticks hacia un target
'use strict';
const { Vec } = require('./src/vecmath');
const { SpiderBody } = require('./src/spider-body');
const { Gait } = require('./src/gait');
const { PRESETS } = require('./src/presets');
const { ECS, setupBehaviours, setupSpiderBody, TargetBehaviour } = require('./src/behaviour');

// mundo plano sintético de y=0 (suelo en y=64+1)
class FlatWorld {
  constructor(groundY = 65) { this.groundY = groundY; }
  getBlock(x, y, z) {
    if (Math.floor(y) < this.groundY) return { name: 'minecraft:stone', isPassable: false };
    return { name: 'minecraft:air', isPassable: true };
  }
  raycastGround(position, direction, maxDistance) {
    // DDA simplificado sobre plano
    if (direction.y >= -1e-6) return null;
    const t = (position.y - this.groundY) / -direction.y;
    if (t > maxDistance) return null;
    return new Vec(position.x + direction.x * t, this.groundY, position.z + direction.z * t);
  }
  isOnGround(p) { return p.y <= this.groundY + 1e-9; }
  resolveCollision(position, direction) {
    const dir = direction.clone().normalize();
    const hit = this.raycastGround(position.clone().sub(dir), dir, direction.length());
    if (hit) return { position: hit, offset: hit.clone().sub(position) };
    return null;
  }
}

const world = new FlatWorld(65);
const app = new ECS();
setupSpiderBody(app); // cuerpo primero (orden setupSpider.kt)
setupBehaviours(app);

const bodyPlan = PRESETS.hexbot(4, 1.0);
const spider = SpiderBody.fromLocation(0, 66.1, 0, 0, world, bodyPlan, Gait.defaultWalk(), Gait.defaultGallop(), 'test', true);
const entity = app.spawn({ SpiderBody: spider });
entity.add('TargetBehaviour', new TargetBehaviour(new Vec(10, 65, 8), spider.walkGait.stationary.bodyHeight * 2));

console.log('ticks, x, y, z, vel, walking, groundedLegs, movingLegs');
let errors = 0;
for (let t = 0; t < 100; t++) {
  try {
    app.update();
  } catch (e) {
    errors++;
    console.error('ERROR tick', t, e.message);
    console.error(e.stack.split('\n').slice(0, 4).join('\n'));
    if (errors > 3) break;
    break;
  }
  if (t % 10 === 0) {
    const grounded = spider.legs.filter((l) => l.isGrounded()).length;
    const moving = spider.legs.filter((l) => l.isMoving).length;
    console.log(t, spider.position.x.toFixed(2), spider.position.y.toFixed(2), spider.position.z.toFixed(2),
      spider.velocity.length().toFixed(3), spider.isWalking, grounded, moving);
  }
}
console.log('done. errors:', errors);
if (spider.legs.length) {
  const leg = spider.legs[0];
  const err = leg.chain.getEndEffector().distance(leg.endEffector);
  console.log('FABRIK error patas 0:', err.toFixed(5), 'segms:', leg.chain.segments.map((s) => s.length.toFixed(2)).join(','));
}
