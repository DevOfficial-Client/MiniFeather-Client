
'use strict';
const { Quat, V3 } = require('./joml');
const { Vec, DOWN_VECTOR, FORWARD_VECTOR, UP_VECTOR, lerp, average } = require('./vecmath');
const { Leg } = require('./leg');
const { LegLookUp, GAIT_TYPES, PIVOT_MODES } = require('./gait');
const { KinematicChain } = require('./kinematic-chain');
const { pointInPolygon, nearestPointInPolygon } = require('./vecmath');

class NormalInfo {
  constructor(normal, origin = null, contactPolygon = null, centreOfMass = null) {
    this.normal = normal;
    this.origin = origin;
    this.contactPolygon = contactPolygon;
    this.centreOfMass = centreOfMass;
  }
}

class SpiderBody {
  constructor(uuid, world, position, orientation, bodyPlan, walkGait, gallopGait) {
    this.uuid = uuid;
    this.world = world;
    this.position = position;
    this.orientation = orientation;
    this.bodyPlan = bodyPlan;
    this.walkGait = walkGait;
    this.gallopGait = gallopGait;
    this.gallop = false;
    this.onGround = false;
    this.legs = [];
    this.normal = null;
    this.normalAcceleration = new Vec(0, 0, 0);
    this.debug = { disableFabrik: false };
    this.events = []; 
    this.stepCount = 0;
    this.lastAppliedBodyPlan = null;
    this.isWalking = false;
    this.isRotatingYaw = false;

    const e = orientation.getEulerAnglesYXZ();
    this.preferredPitch = e.x;
    this.preferredRoll = e.z;
    this.preferredOrientation = orientation.clone();

    this.velocity = new Vec(0, 0, 0);
    this.rotationalVelocity = new V3();
  }

  get gait() { return this.gallop ? this.gallopGait : this.walkGait; }

  orientationHorizontal() {
    return this.horizontalQuat();
  }
  horizontalQuat() {
    const f = this.forwardDirection();
    const fz = new Vec(f.x, 0, f.z);
    if (fz.lengthSquared() < 1e-10) {
      return new Quat().rotationYXZ(this.orientation.getEulerAnglesYXZ().y, 0, 0);
    }
    fz.normalize();
    return new Quat().rotationTo(0, 0, 1, fz.x, fz.y, fz.z);
  }

  static fromLocation(x, y, z, yawDegrees, world, bodyPlan, walkGait, gallopGait, uuid, gallop = false) {
    const orientation = new Quat().rotationYXZ(-yawDegrees * Math.PI / 180, 0, 0);
    const spider = new SpiderBody(uuid, world, new Vec(x, y, z), orientation, bodyPlan, walkGait, gallopGait);
    spider.gallop = gallop;
    return spider;
  }

  forwardDirection() {
    return FORWARD_VECTOR().rotate(this.orientation);
  }

  accelerateRotation(axis, angle) {
    const a = new V3(axis.x, axis.y, axis.z);
    if (a.lengthSquared() < 1e-12) return;
    a.normalize().mul(angle);
    this.rotationalVelocity.add(a);
  }

  teleport(newPosition) {
    const diff = newPosition.clone().sub(this.position);
    this.position.copy(newPosition);
    for (const leg of this.legs) leg.endEffector.add(diff);
  }

  lerpedGait() {
    if (this.isRotatingYaw) return this.gait.moving.clone();
    const speedFraction = this.velocity.length() / this.gait.maxSpeed;
    return this.gait.stationary.clone().lerp(this.gait.moving, speedFraction);
  }

  updatePreferredAngles() {
    const heading = this.horizontalQuat();
    if (this.gait.disableAdvancedRotation) {
      this.preferredPitch = 0;
      this.preferredRoll = 0;
      this.preferredOrientation = heading;
      return;
    }
    const getPos = (leg) => (leg.groundTarget && leg.groundTarget.position) || leg.restPosition;

    const frontLeft = this.legs[0]; if (!frontLeft) return;
    const frontRight = this.legs[1]; if (!frontRight) return;
    const backLeft = this.legs[this.legs.length - 2]; if (!backLeft) return;
    const backRight = this.legs[this.legs.length - 1]; if (!backRight) return;

    const forwardLeft = getPos(frontLeft).clone().sub(getPos(backLeft));
    const forwardRight = getPos(frontRight).clone().sub(getPos(backRight));
    const forward = average([forwardLeft, forwardRight]);

    const sideways = new Vec(0, 0, 0);
    for (let i = 0; i < this.legs.length; i += 2) {
      const left = this.legs[i];
      const right = this.legs[i + 1];
      if (!left || !right) continue;
      sideways.add(getPos(right).clone().sub(getPos(left)));
    }

    this.preferredPitch = lerp(forward.pitch(), this.preferredPitch, this.gait.preferredRotationLerpFraction);
    this.preferredRoll = lerp(sideways.pitch(), this.preferredRoll, this.gait.preferredRotationLerpFraction);

    if (this.preferredPitch < this.gait.preferLevelBreakpoint) this.preferredPitch *= 1 - this.gait.preferLevelBias;
    if (this.preferredRoll < this.gait.preferLevelBreakpoint) this.preferredRoll *= 1 - this.gait.preferLevelBias;

    this.preferredOrientation = new Quat(heading.x, heading.y, heading.z, heading.w)
      .rotateX(this.preferredPitch).rotateZ(this.preferredRoll);
  }

  update() {
    if (this.lastAppliedBodyPlan !== this.bodyPlan) {
      this.legs = this.bodyPlan.legs.map((plan) => new Leg(this, plan));
      this.lastAppliedBodyPlan = this.bodyPlan;
    }

    this.updatePreferredAngles();

    const groundedLegs = this.legs.filter((l) => l.isGrounded());
    const fractionOfLegsGrounded = groundedLegs.length / this.legs.length;

    this.velocity.y -= this.gait.gravityAcceleration;
    this.velocity.y *= 1 - this.gait.airDragCoefficient;

    const angularSpeed = this.rotationalVelocity.length();
    if (angularSpeed > 1e-8) {
      this.orientation.premul(
        new Quat().rotateAxis(
          angularSpeed,
          this.rotationalVelocity.x / angularSpeed,
          this.rotationalVelocity.y / angularSpeed,
          this.rotationalVelocity.z / angularSpeed
        )
      );
    }

    if (!this.isWalking) {
      const legDrag = 1 - this.gait.groundDragCoefficient * fractionOfLegsGrounded;
      this.velocity.x *= legDrag;
      this.velocity.z *= legDrag;
    }

    const rotDrag = 1 - this.gait.rotationalDragCoefficient * fractionOfLegsGrounded;
    this.rotationalVelocity.mul(rotDrag);

    if (this.onGround) {
      const bodyDrag = 0.5;
      this.velocity.x *= bodyDrag;
      this.velocity.z *= bodyDrag;
      this.rotationalVelocity.mul(bodyDrag);
    }

    const normal = this.calcNormal();
    this.normal = normal;

    this.normalAcceleration = new Vec(0, 0, 0);
    if (normal) {
      const preferredY = this.calcPreferredY();
      const preferredYAcceleration = Math.max(preferredY - this.position.y - this.velocity.y, 0.0);
      const capableAcceleration = this.gait.bodyHeightCorrectionAcceleration * fractionOfLegsGrounded;
      const accelerationMagnitude = Math.min(preferredYAcceleration, capableAcceleration);

      this.normalAcceleration = normal.normal.clone().mul(accelerationMagnitude);
      if (this.normalAcceleration.horizontalLength() > this.normalAcceleration.y) this.normalAcceleration.mul(0.0);
      this.velocity.add(this.normalAcceleration);
    }

    this.position.add(this.velocity);

    const rayLength = Math.max(1.0, Math.abs(this.velocity.y));
    const collision = this.world.resolveCollision(this.position, new Vec(0, -rayLength, 0));
    if (collision) {
      this.onGround = true;
      this.position.y = collision.position.y;
      if (this.velocity.y < 0) this.velocity.y *= -this.gait.bounceFactor;
      if (this.velocity.y < this.gait.gravityAcceleration) this.velocity.y = 0;
    } else {
      this.onGround = this.world.isOnGround(this.position, DOWN_VECTOR().rotate(this.orientation));
    }

    const updateOrder = GAIT_TYPES[this.gait.type].getLegsInUpdateOrder(this);
    for (const leg of updateOrder) leg.updateMemo();
    for (const leg of updateOrder) leg.update();

    this.updatePreferredAngles();
  }

  legsInPolygonalOrder() {
    const lefts = [], rights = [];
    for (let i = 0; i < this.legs.length; i++) {
      (LegLookUp.isLeftLeg(i) ? lefts : rights).push(i);
    }
    return [...lefts, ...rights.reverse()];
  }

  calcPreferredY() {
    const lookAhead = this.position.clone().add(this.velocity);
    const ground = this.world.raycastGround(lookAhead, DOWN_VECTOR().rotate(this.preferredOrientation), this.lerpedGait().bodyHeight);
    const groundY = ground ? ground.y : -Infinity;

    let sum = 0;
    for (const leg of this.legs) sum += leg.target.position.y;
    const averageY = sum / this.legs.length + this.lerpedGait().bodyHeight;

    const pivot = PIVOT_MODES[this.gait.legChainPivotMode](this);
    const target = UP_VECTOR().rotate(pivot).mul(this.gait.maxBodyDistanceFromGround);
    const targetY = Math.max(averageY, groundY + target.y);
    const stabilizedY = lerp(this.position.y, targetY, this.gait.bodyHeightCorrectionFactor);
    return stabilizedY;
  }

  applyStabilization(normal) {
    if (!normal.origin || !normal.centreOfMass) return;
    if (normal.origin.horizontalDistance(normal.centreOfMass) < this.gait.polygonLeeway) {
      normal.origin.x = normal.centreOfMass.x;
      normal.origin.z = normal.centreOfMass.z;
    }
    const stabilizationTarget = normal.origin.clone();
    stabilizationTarget.y = normal.centreOfMass.y;
    vecLerpInPlace(normal.centreOfMass, stabilizationTarget, this.gait.stabilizationFactor);
    normal.normal.copy(normal.centreOfMass.clone().sub(normal.origin)).normalize();
  }

  calcLegacyNormal() {
    const pairs = LegLookUp.diagonalPairs([...this.legs.keys()]);
    for (const pair of pairs) {
      const legsInPair = pair.map((i) => this.legs[i]).filter(Boolean);
      if (legsInPair.length && legsInPair.every((l) => l.isGrounded())) {
        return new NormalInfo(new Vec(0, 1, 0));
      }
    }
    return null;
  }

  calcNormal() {
    if (this.gait.useLegacyNormalForce) return this.calcLegacyNormal();

    const centreOfMass = average(this.legs.map((l) => l.endEffector));
    vecLerpInPlace(centreOfMass, this.position, 0.5);
    centreOfMass.y += 0.01;

    const groundedLegs = this.legsInPolygonalOrder().map((i) => this.legs[i]).filter((l) => l.isGrounded());
    if (groundedLegs.length === 0) return null;

    const legsPolygon = groundedLegs.map((l) => l.endEffector.clone());
    const polygonCenterY = legsPolygon.reduce((s, v) => s + v.y, 0) / legsPolygon.length;

    if (legsPolygon.length === 1) {
      const origin = groundedLegs[0].endEffector.clone();
      const info = new NormalInfo(
        centreOfMass.clone().sub(origin).normalize(), origin, legsPolygon, centreOfMass
      );
      this.applyStabilization(info);
      return info;
    }

    const polygon2D = legsPolygon.map((v) => ({ x: v.x, y: v.z }));
    if (pointInPolygon(centreOfMass.x, centreOfMass.z, polygon2D)) {
      return new NormalInfo(
        new Vec(0, 1, 0),
        new Vec(centreOfMass.x, polygonCenterY, centreOfMass.z),
        legsPolygon, centreOfMass
      );
    }

    const point = nearestPointInPolygon(centreOfMass.x, centreOfMass.z, polygon2D);
    const origin = new Vec(point.x, polygonCenterY, point.y);
    const info = new NormalInfo(centreOfMass.clone().sub(origin).normalize(), origin, legsPolygon, centreOfMass);
    this.applyStabilization(info);
    return info;
  }
}

function vecLerpInPlace(v, target, t) {
  v.x += (target.x - v.x) * t;
  v.y += (target.y - v.y) * t;
  v.z += (target.z - v.z) * t;
}

module.exports = { SpiderBody, NormalInfo };
