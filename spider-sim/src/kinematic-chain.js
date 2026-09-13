// Port 1:1 de utilities/KinematicChain.kt — FABRIK real + getRelativeRotations
'use strict';
const { Quat } = require('./joml');
const { Vec } = require('./vecmath');

class ChainSegment {
  constructor(position, length, initDirection) {
    this.position = position;
    this.length = length;
    this.initDirection = initDirection;
  }
  clone() { return new ChainSegment(this.position.clone(), this.length, this.initDirection.clone()); }
}

function moveSegment(point, pullTowards, segment) {
  const direction = pullTowards.clone().sub(point);
  if (direction.lengthSquared() < 1e-24) return;
  direction.normalize();
  point.copy(pullTowards).sub(direction.mul(segment));
}

class KinematicChain {
  constructor(root, segments) {
    this.root = root; // Vec (referencia viva a attachmentPosition)
    this.segments = segments;
    this.maxIterations = 20;
    this.tolerance = 0.01;
  }

  fabrik(target) {
    for (let i = 0; i < this.maxIterations; i++) {
      this.fabrikForward(target);
      this.fabrikBackward();
      if (this.getEndEffector().distanceSquared(target) < this.tolerance) break;
    }
  }

  straightenDirection(rotation) {
    const position = this.root.clone();
    for (const segment of this.segments) {
      const initDirection = segment.initDirection.clone().rotate(rotation);
      position.add(initDirection.mul(segment.length));
      segment.position.copy(position);
    }
  }

  fabrikForward(newPosition) {
    const lastSegment = this.segments[this.segments.length - 1];
    lastSegment.position.copy(newPosition);
    for (let i = this.segments.length - 1; i >= 1; i--) {
      const previousSegment = this.segments[i];
      const segment = this.segments[i - 1];
      moveSegment(segment.position, previousSegment.position, previousSegment.length);
    }
  }

  fabrikBackward() {
    moveSegment(this.segments[0].position, this.root, this.segments[0].length);
    for (let i = 1; i < this.segments.length; i++) {
      const previousSegment = this.segments[i - 1];
      const segment = this.segments[i];
      moveSegment(segment.position, previousSegment.position, segment.length);
    }
  }

  getEndEffector() { return this.segments[this.segments.length - 1].position; }

  getVectors() {
    return this.segments.map((segment, i) => {
      const previous = i > 0 ? this.segments[i - 1].position : this.root;
      return segment.position.clone().sub(previous);
    });
  }

  // utilities_maths.kt getRotationAroundAxis
  static getRotationAroundAxis(vec, pivot) {
    const orientation = new Quat().rotationTo(0, 0, 1, vec.x, vec.y, vec.z);
    return quatEulerYXZRelative(orientation, pivot);
  }

  getRelativeRotations(pivot) {
    const vectors = this.getVectors();
    const firstEuler = KinematicChain.getRotationAroundAxis(vectors[0], pivot);
    const firstRotation = new Quat(pivot.x, pivot.y, pivot.z, pivot.w).rotateYXZ(firstEuler.y, firstEuler.x, 0.0);
    const rotations = vectors.map((current, i) => {
      if (i === 0) return firstRotation;
      const previous = vectors[i - 1];
      return new Quat().rotationTo(previous.x, previous.y, previous.z, current.x, current.y, current.z);
    });
    return rotations;
  }

  getRotations(pivot) {
    const rotations = this.getRelativeRotations(pivot);
    for (let i = 1; i < rotations.length; i++) {
      rotations[i].mul(rotations[i - 1]); // cumulate: r[i] = r[i] * r[i-1]
    }
    return rotations;
  }
}

// utilities_maths.kt Quaternionf.getYXZRelative
function quatEulerYXZRelative(q, pivot) {
  const { quatDifference } = require('./joml');
  const relative = quatDifference(pivot, q);
  return relative.getEulerAnglesYXZ();
}

module.exports = { KinematicChain, ChainSegment };
