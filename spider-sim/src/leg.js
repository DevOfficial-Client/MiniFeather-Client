
'use strict';
const { Quat } = require('./joml');
const { Vec, UP_VECTOR, DOWN_VECTOR, lerp, moveTowards, Capsule, LineSegment, average } = require('./vecmath');
const { KinematicChain, ChainSegment } = require('./kinematic-chain');
const { GAIT_TYPES, PIVOT_MODES } = require('./gait');

class LegTarget {
  constructor(position, isGrounded, id) {
    this.position = position;
    this.isGrounded = isGrounded;
    this.id = id;
  }
}

class Leg {
  constructor(spider, legPlan) {
    this.spider = spider;
    this.legPlan = legPlan;

    this.updateMemo();

    this.groundTarget = this.locateGroundTarget();
    this.target = this.groundTarget || this.strandedTarget();
    this.endEffector = this.target.position.clone();
    this.previousEndEffector = this.endEffector.clone();

    let stride = 0;
    const segments = legPlan.segments.map((segment) => {
      stride += segment.length;
      const position = spider.position.clone()
        .add(legPlan.restPosition.clone().normalize().mul(stride));
      return new ChainSegment(position, segment.length, segment.initDirection.clone());
    });
    this.chain = new KinematicChain(this.attachmentPosition, segments);

    this.touchingGround = true;
    this.isMoving = false;
    this.timeSinceBeginMove = 0;
    this.timeSinceStopMove = 0;
    this.stepStart = new Vec(0, 0, 0);
    this.stepProgress = 0.0;
    this.isDisabled = false;
    this.isPrimary = false;
    this.canMove = false;
  }

  get isOutsideTriggerZone() { return !this.triggerZone.contains(this.endEffector); }
  get isUncomfortable() { return !this.comfortZone.contains(this.endEffector); }
  isGrounded() { return this.touchingGround && !this.isMoving && !this.isDisabled; }

  updateMemo() {
    const lerpedGait = this.spider.lerpedGait();
    const scanOrientation = PIVOT_MODES[this.spider.gait.scanPivotMode](this.spider);
    const upVector = UP_VECTOR().rotate(scanOrientation);

    this.restPosition = this.legPlan.restPosition.clone();
    this.restPosition.add(upVector.clone().mul(-lerpedGait.bodyHeight));
    this.restPosition.rotate(scanOrientation).add(this.spider.position);

    this.lookAheadPosition = this.lookAheadPositionFn(this.restPosition, lerpedGait.triggerZoneRadius);

    const scanStartAxis = upVector.clone().mul(lerpedGait.bodyHeight * 1.6);
    const scanAxis = upVector.clone().mul(-lerpedGait.bodyHeight * 2.5);
    this.scanLine = LineSegment.fromOffset(this.lookAheadPosition.clone().add(scanStartAxis), scanAxis);

    const zoneStart = this.restPosition.clone().add(scanStartAxis);
    const zoneEnd = zoneStart.clone().add(scanAxis);
    this.triggerZone = new Capsule(zoneStart, zoneEnd, lerpedGait.triggerZoneRadius);
    this.comfortZone = new Capsule(zoneStart, zoneEnd, this.spider.gait.comfortZoneRadius);

    this.attachmentPosition = this.legPlan.attachmentPosition.clone()
      .rotate(this.spider.orientation).add(this.spider.position);
  }

  update() {
    this.updateMovement();
    this.chain.root.copy(this.attachmentPosition);

    if (this.spider.gait.straightenLegs) {
      
      const pivot = PIVOT_MODES[this.spider.gait.legChainPivotMode](this.spider);
      const pivotCopy = new Quat(pivot.x, pivot.y, pivot.z, pivot.w);
      const direction = this.endEffector.clone().sub(this.attachmentPosition);
      const rotation = KinematicChain.getRotationAroundAxis(direction, pivotCopy);
      rotation.x += this.spider.gait.legStraightenRotation;
      const orientation = pivotCopy.rotateYXZ(rotation.y, rotation.x, 0.0);
      this.chain.straightenDirection(orientation);
    }

    if (!this.spider.debug.disableFabrik) {
      this.chain.fabrik(this.endEffector);
    }
  }

  updateMovement() {
    this.previousEndEffector = this.endEffector.clone();
    this.timeSinceBeginMove += 1;
    this.timeSinceStopMove += 1;

    const oldTargetPosition = this.target.position.clone();
    const ground = this.locateGroundTarget();
    this.groundTarget = ground;

    if (this.isDisabled) {
      this.target = this.disabledTarget(ground && ground.position);
    } else {
      if (ground) this.target = ground;
      if (!this.target.isGrounded || !this.comfortZone.contains(this.target.position)) {
        this.target = this.strandedTarget();
      }
    }

    if (oldTargetPosition.distanceSquared(this.target.position) > 1e-6) {
      this.softResetStep();
    }

    if (!this.isGrounded()) {
      this.applyBodyMotion(this.endEffector);
      if (this.isMoving) this.applyBodyMotion(this.stepStart);
    }

    let didStep = false;
    if (this.isMoving) {
      didStep = this.updateMove();
    } else {
      this.canMove = GAIT_TYPES[this.spider.gait.type].canMoveLeg(this);
      if (this.canMove) this.beginMove();
    }

    const collision = this.spider.world.resolveCollision(this.endEffector, DOWN_VECTOR());
    if (collision) {
      const isFurtherFromTarget = collision.position.distance(this.target.position) > this.endEffector.distance(this.target.position);
      if (!isFurtherFromTarget) {
        didStep = true;
        this.touchingGround = true;
        this.endEffector.y = collision.position.y;
        this.spider.events.push(['step', this.spider.id, this.spider.legs.indexOf(this)]);
      }
    }

    if (didStep) this.spider.stepCount++;
  }

  applyBodyMotion(point) {
    point.add(this.spider.velocity);
    point.sub(this.spider.position).rotateAroundY(this.spider.rotationalVelocity.y).add(this.spider.position);
  }

  beginMove() {
    this.isMoving = true;
    this.timeSinceBeginMove = 0;
    this.stepStart = this.endEffector.clone();
    this.stepProgress = 0.0;
    this.touchingGround = false;
  }

  completeMove() {
    this.isMoving = false;
    this.timeSinceStopMove = 0;
    this.endEffector.copy(this.target.position);
    this.touchingGround = this.touchingGroundFn();
    return this.touchingGround;
  }

  stepLiftFactor(t) { return 4.0 * t * (1.0 - t); }

  sampleStepPosition(t) {
    const position = new Vec(
      lerp(this.stepStart.x, this.target.position.x, t),
      lerp(this.stepStart.y, this.target.position.y, t),
      lerp(this.stepStart.z, this.target.position.z, t)
    );
    position.y += this.spider.gait.legLiftHeight * this.stepLiftFactor(t);
    return position;
  }

  updateMove() {
    const gait = this.spider.gait;
    const distance = Math.max(this.stepStart.horizontalDistance(this.target.position), 1e-4);
    this.stepProgress = moveTowards(this.stepProgress, 1.0, gait.legMoveSpeed / distance);
    this.endEffector.copy(this.sampleStepPosition(this.stepProgress));
    if (this.stepProgress >= 1.0) return this.completeMove();
    return false;
  }

  softResetStep() {
    this.stepStart = this.endEffector.clone();
    this.stepProgress = 0.0;
  }

  touchingGroundFn() {
    return this.spider.world.isOnGround(this.endEffector, DOWN_VECTOR().rotate(this.spider.orientation));
  }

  lookAheadPositionFn(restPosition, triggerZoneRadius) {
    if (!this.spider.isWalking) return restPosition.clone();
    const direction = this.spider.velocity.isZero()
      ? this.spider.forwardDirection()
      : this.spider.velocity.clone().normalize();
    const lookAhead = direction.mul(triggerZoneRadius * this.spider.gait.legLookAheadFraction).add(restPosition);
    lookAhead.sub(this.spider.position).rotateAroundY(this.spider.rotationalVelocity.y).add(this.spider.position);
    return lookAhead;
  }

  locateGroundTarget() {
    const lookAhead = this.lookAheadPosition;
    const scanStartPosition = this.scanLine.point1;
    const scanVector = this.scanLine.vector();
    const scanLength = scanVector.length();

    let id = 0;
    const world = this.spider.world;
    const rayCast = (x, z) => {
      id += 1;
      const start = new Vec(x, scanStartPosition.y, z);
      const hit = world.raycastGround(start, scanVector, scanLength);
      if (!hit) return null;
      return new LegTarget(hit.clone(), true, id);
    };

    const x = scanStartPosition.x;
    const z = scanStartPosition.z;
    const mainCandidate = rayCast(x, z);
    if (!this.spider.gait.legScanAlternativeGround) return mainCandidate;

    if (mainCandidate) {
      if (mainCandidate.position.y >= lookAhead.y - 0.24 && mainCandidate.position.y <= lookAhead.y + 1.5) {
        return mainCandidate;
      }
    }

    const margin = 2 / 16.0;
    const nx = Math.floor(x) - margin;
    const nz = Math.floor(z) - margin;
    const pz = Math.ceil(z) + margin;
    const px = Math.ceil(x) + margin;

    const candidates = [
      rayCast(nx, nz), rayCast(nx, z), rayCast(nx, pz),
      rayCast(x, nz), mainCandidate, rayCast(x, pz),
      rayCast(px, nz), rayCast(px, z), rayCast(px, pz),
    ];

    const preferredPosition = lookAhead.clone();
    const frontBlock = world.getBlock(lookAhead.clone().add(this.spider.forwardDirection().clone().mul(1)));
    if (frontBlock && !frontBlock.isPassable) preferredPosition.y += this.spider.gait.legScanHeightBias;

    const valid = candidates.filter(Boolean);
    let best = null, bestD = Infinity;
    for (const c of valid) {
      const d = c.position.distanceSquared(preferredPosition);
      if (d < bestD) { best = c; bestD = d; }
    }
    if (best && !this.comfortZone.contains(best.position)) return null;
    return best;
  }

  strandedTarget() {
    return new LegTarget(this.lookAheadPosition.clone(), false, -1);
  }

  disabledTarget(groundPosition) {
    const lerpedGait = this.spider.lerpedGait();
    const upVector = UP_VECTOR().rotate(this.spider.orientation);
    const target = this.strandedTarget();
    target.position.add(upVector.clone().mul(lerpedGait.bodyHeight * 0.5));
    const minY = (groundPosition ? groundPosition.y : -Infinity) + lerpedGait.bodyHeight * 0.1;
    if (target.position.y < minY) target.position.y = minY;
    return target;
  }
}

module.exports = { Leg, LegTarget };
