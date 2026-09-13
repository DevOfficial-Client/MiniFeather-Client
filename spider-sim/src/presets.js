// Port 1:1 de spider/presets/presets.kt — bodyPlans biped..octopod y bots
'use strict';
const { Vec, FORWARD_VECTOR } = require('./vecmath');

class SegmentPlan {
  constructor(length, initDirection) {
    this.length = length;
    this.initDirection = initDirection;
    this.model = null; // no se usa en sim (el cliente renderiza)
  }
  clone() { return new SegmentPlan(this.length, this.initDirection.clone()); }
}

class LegPlan {
  constructor(attachmentPosition, restPosition, segments) {
    this.attachmentPosition = attachmentPosition;
    this.restPosition = restPosition;
    this.segments = segments;
  }
}

class BodyPlan {
  constructor() {
    this.scale = 1.0;
    this.legs = [];
    this.bodyModel = 'flat';
  }
  addLegPair(root, rest, segments) {
    this.legs.push(new LegPlan(new Vec(root.x, root.y, root.z), new Vec(rest.x, rest.y, rest.z), segments));
    this.legs.push(new LegPlan(new Vec(-root.x, root.y, root.z), new Vec(-rest.x, rest.y, rest.z), segments.map((s) => s.clone())));
  }
}

function equalLength(segmentCount, length) {
  const out = [];
  for (let i = 0; i < segmentCount; i++) out.push(new SegmentPlan(length, FORWARD_VECTOR().clone()));
  return out;
}

function createRobotSegments(segmentCount, lengthScale) {
  const out = [];
  for (let index = 0; index < segmentCount; index++) {
    let length = lengthScale;
    let initDirection = FORWARD_VECTOR().clone();
    if (index === 0) {
      length *= 0.5;
      initDirection = initDirection.rotateAroundX(Math.PI / 3);
    }
    if (index === 1) length *= 0.8;
    out.push(new SegmentPlan(length, initDirection));
  }
  return out;
}

const PRESETS = {
  biped(sc = 3, sl = 1.0) {
    const p = new BodyPlan();
    p.addLegPair(new Vec(0, 0, 0), new Vec(1.0, 0, 0), equalLength(sc, 1.0 * sl));
    return p;
  },
  quadruped(sc = 3, sl = 1.0) {
    const p = new BodyPlan();
    p.addLegPair(new Vec(0, 0, 0), new Vec(0.9, 0, 0.9), equalLength(sc, 0.9 * sl));
    p.addLegPair(new Vec(0, 0, 0), new Vec(1.0, 0, -1.1), equalLength(sc, 1.2 * sl));
    return p;
  },
  hexapod(sc = 3, sl = 1.0) {
    const p = new BodyPlan();
    p.addLegPair(new Vec(0, 0, 0.1), new Vec(1.0, 0, 1.1), equalLength(sc, 1.1 * sl));
    p.addLegPair(new Vec(0, 0, 0.0), new Vec(1.3, 0, -0.3), equalLength(sc, 1.1 * sl));
    p.addLegPair(new Vec(0, 0, -0.1), new Vec(1.2, 0, -2.0), equalLength(sc, 1.6 * sl));
    return p;
  },
  octopod(sc = 3, sl = 1.0) {
    const p = new BodyPlan();
    p.addLegPair(new Vec(0, 0, 0.1), new Vec(1.0, 0, 1.6), equalLength(sc, 1.1 * sl));
    p.addLegPair(new Vec(0, 0, 0.0), new Vec(1.3, 0, 0.4), equalLength(sc, 1.0 * sl));
    p.addLegPair(new Vec(0, 0, -0.1), new Vec(1.3, 0, -0.9), equalLength(sc, 1.1 * sl));
    p.addLegPair(new Vec(0, 0, -0.2), new Vec(1.1, 0, -2.5), equalLength(sc, 1.6 * sl));
    return p;
  },
  quadbot(sc = 4, sl = 1.0) {
    const p = new BodyPlan();
    p.bodyModel = 'flat';
    p.addLegPair(new Vec(0.2, -0.35, 0.2), new Vec(1.3, 0, 1.0), createRobotSegments(sc, 0.9 * 0.7 * sl));
    p.addLegPair(new Vec(0.2, -0.35, -0.2), new Vec(1.43, 0, -1.2), createRobotSegments(sc, 1.2 * 0.7 * sl));
    return p;
  },
  hexbot(sc = 4, sl = 1.0) {
    const p = new BodyPlan();
    p.bodyModel = 'flat';
    p.addLegPair(new Vec(0.2, -0.35, 0.2), new Vec(1.3 * 1.0, 0, 1.3), createRobotSegments(sc, 1.1 * 0.7 * sl));
    p.addLegPair(new Vec(0.2, -0.35, 0.0), new Vec(1.3 * 1.2, 0, -0.1), createRobotSegments(sc, 1.1 * 0.7 * sl));
    p.addLegPair(new Vec(0.2, -0.35, -0.2), new Vec(1.3 * 1.1, 0, -1.6), createRobotSegments(sc, 1.3 * 0.7 * sl));
    return p;
  },
  octobot(sc = 4, sl = 1.0) {
    const p = new BodyPlan();
    p.bodyModel = 'flat';
    p.addLegPair(new Vec(0.2, -0.35, 0.3), new Vec(1.3 * 1.0, 0, 1.3), createRobotSegments(sc, 1.1 * 0.7 * sl));
    p.addLegPair(new Vec(0.2, -0.35, 0.1), new Vec(1.3 * 1.2, 0, 0.5), createRobotSegments(sc, 1.0 * 0.7 * sl));
    p.addLegPair(new Vec(0.2, -0.35, 0.1), new Vec(1.3 * 1.2, 0, -0.7), createRobotSegments(sc, 1.1 * 0.7 * sl));
    p.addLegPair(new Vec(0.2, -0.35, -0.3), new Vec(1.3 * 1.1, 0, -1.6), createRobotSegments(sc, 1.3 * 0.7 * sl));
    return p;
  },
};

module.exports = { PRESETS, BodyPlan, LegPlan, SegmentPlan, createRobotSegments };

