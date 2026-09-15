
'use strict';
const { Quat, V3, quatDifference } = require('./joml');
const { Vec, FORWARD_VECTOR, vecMoveTowards } = require('./vecmath');

class StayStillBehaviour { }
class TargetBehaviour {
  constructor(target, distance) { this.target = target; this.distance = distance; }
}
class DirectionBehaviour {
  constructor(targetDirection, walkDirection) { this.targetDirection = targetDirection; this.walkDirection = walkDirection; }
}

function rotateTowards(spider, targetVector) {
  const currentEuler = spider.orientation.getEulerAnglesYXZ();

  const targetEuler = new Quat()
    .rotationTo(0, 0, 1, targetVector.x, targetVector.y, targetVector.z)
    .getEulerAnglesYXZ();

  targetEuler.x = Math.max(
    spider.preferredPitch - spider.gait.preferredPitchLeeway,
    Math.min(spider.preferredPitch + spider.gait.preferredPitchLeeway, targetEuler.x)
  );

  targetEuler.z = spider.preferredRoll;

  if (spider.legs.some((leg) => leg.isUncomfortable && !leg.isMoving)) targetEuler.y = currentEuler.y;

  const targetOrientation = new Quat().rotationYXZ(targetEuler.y, targetEuler.x, targetEuler.z);

  const softenedTarget = new Quat(spider.orientation.x, spider.orientation.y, spider.orientation.z, spider.orientation.w)
    .slerp(targetOrientation, 1 - spider.gait.rotationLerp);

  const inv = spider.orientation.clone().invert();
  const delta = mulQuats(softenedTarget, inv);
  const axisAngle = quatToAxisAngle(delta);
  let desiredOmega = new V3();
  if (axisAngle.angle >= 1e-8) {
    desiredOmega = new V3(axisAngle.x, axisAngle.y, axisAngle.z).mul(axisAngle.angle);
  }

  spider.isRotatingYaw = desiredOmega.lengthSquared() > 0.001 * 0.001;

  const groundedCount = spider.legs.filter((l) => l.isGrounded()).length;
  const maxAcceleration = spider.gait.rotateAcceleration * groundedCount / spider.legs.length;
  v3MoveTowards(spider.rotationalVelocity, desiredOmega, maxAcceleration);
}

function mulQuats(a, b) {
  const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
  const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
  const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
  const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
  return new Quat(x, y, z, w);
}

function quatToAxisAngle(q) {
  q = q.clone().normalize();
  let angle = 2 * Math.acos(Math.max(-1, Math.min(1, q.w)));
  const s = Math.sqrt(Math.max(0, 1 - q.w * q.w));
  if (s < 1e-8) return { x: 1, y: 0, z: 0, angle: 0 };
  return { x: q.x / s, y: q.y / s, z: q.z / s, angle };
}

function v3MoveTowards(v, target, speed) {
  const diff = new V3(target.x - v.x, target.y - v.y, target.z - v.z);
  const d = diff.length();
  if (d <= speed) { v.set(target.x, target.y, target.z); return v; }
  return v.add(diff.mul(speed / d));
}

function walkAt(spider, targetVelocity, stunned = false) {
  const acceleration = spider.gait.moveAcceleration;
  const target = targetVelocity.clone();

  if (spider.legs.some((leg) => leg.isUncomfortable && !leg.isMoving)) {
    target.y = spider.velocity.y;
    target.mul(spider.gait.uncomfortableSpeedMultiplier);
    vecMoveTowards(spider.velocity, target, acceleration);
    spider.isWalking = targetVelocity.x !== 0.0 && targetVelocity.z !== 0.0;
  } else {
    target.y = spider.velocity.y;
    vecMoveTowards(spider.velocity, target, acceleration);
    spider.isWalking = spider.velocity.x !== 0.0 && spider.velocity.z !== 0.0;
  }

  if (stunned && targetVelocity.isZero()) spider.isWalking = false;
}

function setupBehaviours(app) {
  
  app.onTick(() => {
    for (const [entity, spider] of app.query('SpiderBody', 'StayStillBehaviour')) {
      walkAt(spider, new Vec(0, 0, 0));
      rotateTowards(spider, spider.forwardDirection().clone().setY(0));
    }
  });

  app.onTick(() => {
    for (const [entity, spider, behaviour] of app.query('SpiderBody', 'TargetBehaviour')) {
      const direction = behaviour.target.clone().sub(spider.position).normalize();
      rotateTowards(spider, direction);

      const currentSpeed = spider.velocity.length();
      const decelerateDistance = (currentSpeed * currentSpeed) / (2 * spider.gait.moveAcceleration);
      const currentDistance = spider.position.horizontalDistance(behaviour.target);

      if (currentDistance > behaviour.distance + decelerateDistance) {
        walkAt(spider, direction.clone().mul(spider.gait.maxSpeed));
      } else {
        walkAt(spider, new Vec(0, 0, 0));
      }
    }
  });

  app.onTick(() => {
    for (const [entity, spider, behaviour] of app.query('SpiderBody', 'DirectionBehaviour')) {
      rotateTowards(spider, behaviour.targetDirection);
      walkAt(spider, behaviour.walkDirection.clone().mul(spider.gait.maxSpeed));
    }
  });
}

function setupSpiderBody(app) {
  app.onTick(() => {
    for (const [entity, spider] of app.query('SpiderBody')) {
      void entity;
      spider.update();
    }
  });
}

function setupDefaultBehaviour(app) {
  app.onTick(() => {
    for (const [entity] of app.query('SpiderBody')) {
      if (!entityHas(entity, 'TargetBehaviour') && !entityHas(entity, 'DirectionBehaviour')) {
        replaceComponent(entity, 'StayStillBehaviour', new StayStillBehaviour());
      }
    }
  });
}

class ECSEntity {
  constructor() {
    this.components = new Map(); 
    this.scheduledForRemoval = false;
  }
  add(name, component) { this.components.set(name, component); return this; }
  remove() { this.scheduledForRemoval = true; }
  has(name) { return this.components.has(name); }
  get(name) { return this.components.get(name); }
  replace(name, component) { this.components.set(name, component); }
}
function entityHas(entity, name) { return entity.has(name); }
function replaceComponent(entity, name, component) { entity.replace(name, component); }

class ECS {
  constructor() {
    this.entities = [];
    this.tickSystems = [];
    this.eventListeners = [];
  }
  onTick(fn) { this.tickSystems.push(fn); }
  spawn(components) {
    const entity = new ECSEntity();
    for (const [name, c] of Object.entries(components)) entity.add(name, c);
    this.entities.push(entity);
    return entity;
  }
  query(...names) {
    const out = [];
    for (const entity of this.entities) {
      const comps = names.map((n) => entity.get(n));
      if (comps.every(Boolean)) out.push([entity, ...comps]);
    }
    return out;
  }
  update() {
    for (const system of this.tickSystems) system(this);
    this.entities = this.entities.filter((e) => !e.scheduledForRemoval);
  }
}

module.exports = {
  ECS, ECSEntity, setupBehaviours, setupSpiderBody, setupDefaultBehaviour,
  StayStillBehaviour, TargetBehaviour, DirectionBehaviour,
  rotateTowards, walkAt,
};
