
'use strict';

class LerpGait {
  constructor(bodyHeight, triggerZoneRadius) {
    this.bodyHeight = bodyHeight;
    this.triggerZoneRadius = triggerZoneRadius;
  }
  scale(s) { this.bodyHeight *= s; this.triggerZoneRadius *= s; return this; }
  clone() { return new LerpGait(this.bodyHeight, this.triggerZoneRadius); }
  lerp(target, factor) {
    this.bodyHeight = this.bodyHeight * (1 - factor) + target.bodyHeight * factor;
    this.triggerZoneRadius = this.triggerZoneRadius * (1 - factor) + target.triggerZoneRadius * factor;
    return this;
  }
}

const PIVOT_MODES = {
  YAxis: (spider) => spider.orientationHorizontal(),
  SpiderOrientation: (spider) => spider.orientation,
  GroundOrientation: (spider) => spider.preferredOrientation,
};

class Gait {
  constructor(walkSpeed, type) {
    this.type = type; 
    this.stationary = new LerpGait(1.1, 0.25);
    this.moving = new LerpGait(1.1, 0.8);
    this.maxBodyDistanceFromGround = 0.25;
    this.maxSpeed = walkSpeed;
    this.moveAcceleration = 0.15 / 4;
    this.rotateAcceleration = 0.15 / 4;
    this.rotationalDragCoefficient = 0.2;
    this.legMoveSpeed = walkSpeed * 2.5;
    this.legLiftHeight = 0.35;
    this.comfortZoneRadius = 1.2;
    this.gravityAcceleration = 0.08;
    this.airDragCoefficient = 0.02;
    this.bounceFactor = 0.5;
    this.bodyHeightCorrectionAcceleration = 0.08 * 4;
    this.bodyHeightCorrectionFactor = 0.25;
    this.legScanAlternativeGround = true;
    this.legScanHeightBias = 0.5;
    this.tridentKnockBack = 0.3;
    this.tridentRotationalKnockBack = 0.3 / 4;
    this.legLookAheadFraction = 0.6;
    this.groundDragCoefficient = 0.2;
    this.samePairCooldown = 1;
    this.crossPairCooldown = 1;
    this.useLegacyNormalForce = false;
    this.polygonLeeway = 0.0;
    this.stabilizationFactor = 0.0;
    this.uncomfortableSpeedMultiplier = 0.0;
    this.disableAdvancedRotation = false;
    this.preferredPitchLeeway = 10 * Math.PI / 180;
    this.straightenLegs = true;
    this.legStraightenRotation = -80 * Math.PI / 180;
    this.scanPivotMode = 'YAxis';
    this.legChainPivotMode = 'SpiderOrientation';
    this.preferLevelBreakpoint = 45 * Math.PI / 180;
    this.preferLevelBias = 0.0;
    this.preferredRotationLerpFraction = 0.3;
    this.rotationLerp = 0.3;
  }

  static defaultWalk() { return new Gait(0.15, 'WALK'); }

  static defaultGallop() {
    const g = new Gait(0.4, 'GALLOP');
    g.moving.bodyHeight = 1.6;
    g.legMoveSpeed = 0.5;
    g.rotateAcceleration = 0.25 / 4;
    g.uncomfortableSpeedMultiplier = 0.6;
    g.samePairCooldown = 2;
    g.crossPairCooldown = 4;
    g.polygonLeeway = 0.5;
    return g;
  }

  scale(s) {
    this.stationary.scale(s);
    this.moving.scale(s);
    this.maxBodyDistanceFromGround *= s;
    this.maxSpeed *= s;
    this.moveAcceleration *= s;
    this.legMoveSpeed *= s;
    this.legLiftHeight *= s;
    this.comfortZoneRadius *= s;
    this.legScanHeightBias *= s;
    this.tridentRotationalKnockBack /= s;
  }
}

const LegLookUp = {
  diagonalPairs(legs) { return legs.map((it) => [this.diagonalFront(it), this.diagonalBack(it), it]); },
  isLeftLeg(leg) { return leg % 2 === 0; },
  isRightLeg(leg) { return !this.isLeftLeg(leg); },
  getPairIndex(leg) { return Math.floor(leg / 2); },
  isDiagonal1(leg) {
    return this.getPairIndex(leg) % 2 === 0 ? this.isLeftLeg(leg) : this.isRightLeg(leg);
  },
  isDiagonal2(leg) { return !this.isDiagonal1(leg); },
  diagonalFront(leg) { return this.isLeftLeg(leg) ? leg - 1 : leg - 3; },
  diagonalBack(leg) { return this.isLeftLeg(leg) ? leg + 3 : leg + 1; },
  front(leg) { return leg - 2; },
  back(leg) { return leg + 2; },
  horizontal(leg) { return this.isLeftLeg(leg) ? leg + 1 : leg - 1; },
  diagonal(leg) { return [this.diagonalFront(leg), this.diagonalBack(leg)]; },
  adjacent(leg) { return [this.front(leg), this.back(leg), this.horizontal(leg)]; },
};

function unIndexLeg(spider, indices) {
  return indices.map((i) => spider.legs[i]).filter(Boolean);
}

const WalkGaitType = {
  getLegsInUpdateOrder(spider) {
    const indices = spider.legs.length;
    const diagonal1 = [];
    const diagonal2 = [];
    for (let i = 0; i < indices; i++) {
      if (LegLookUp.isDiagonal1(i)) diagonal1.push(i);
      else diagonal2.push(i);
    }
    return [...diagonal1, ...diagonal2].map((i) => spider.legs[i]);
  },
  canMoveLeg(leg) {
    const spider = leg.spider;
    const index = spider.legs.indexOf(leg);
    if (!leg.target.isGrounded) return true;
    leg.isPrimary = true;
    const crossPair = unIndexLeg(spider, LegLookUp.adjacent(index));
    if (crossPair.some((it) => !it.isGrounded() && !it.isDisabled && it.target.isGrounded)) return false;
    if (crossPair.some((it) => it.target.isGrounded && it.timeSinceStopMove < spider.gait.crossPairCooldown)) return false;
    const samePair = unIndexLeg(spider, LegLookUp.diagonal(index));
    if (samePair.some((it) => it.target.isGrounded && it.timeSinceBeginMove < spider.gait.samePairCooldown)) return false;
    const wantsToMove = leg.isOutsideTriggerZone || !leg.touchingGround;
    const alreadyAtTarget = leg.endEffector.distanceSquared(leg.target.position) < 0.01;
    const onGround = spider.legs.some((l) => l.isGrounded()) || spider.onGround;
    return wantsToMove && !alreadyAtTarget && onGround;
  },
};

const GallopGaitType = {
  getLegsInUpdateOrder(spider) { return WalkGaitType.getLegsInUpdateOrder(spider); },
  canMoveLeg(leg) {
    const spider = leg.spider;
    const index = spider.legs.indexOf(leg);
    if (!spider.isWalking) return WalkGaitType.canMoveLeg(leg);
    if (!leg.target.isGrounded) return true;
    const onGround = spider.legs.some((l) => l.isGrounded()) || spider.onGround;
    if (!onGround) return false;
    const pair = spider.legs[LegLookUp.horizontal(index)];
    leg.isPrimary = LegLookUp.isDiagonal1(index) || pair.isDisabled || !pair.target.isGrounded;
    if (leg.isPrimary) {
      const front = spider.legs[LegLookUp.diagonalFront(index)];
      if (front && leg.target.isGrounded && leg.timeSinceBeginMove < spider.gait.crossPairCooldown) return false;
      return leg.isOutsideTriggerZone || !leg.touchingGround;
    } else {
      const hasCooldown = pair.target.isGrounded && pair.timeSinceBeginMove < spider.gait.samePairCooldown;
      return pair.isMoving && !hasCooldown;
    }
  },
};

const GAIT_TYPES = { WALK: WalkGaitType, GALLOP: GallopGaitType };

module.exports = { Gait, LerpGait, LegLookUp, WalkGaitType, GallopGaitType, GAIT_TYPES, PIVOT_MODES, unIndexLeg };
