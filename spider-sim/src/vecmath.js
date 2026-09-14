// Vector estilo Bukkit + extensiones de utilities/maths/maths.kt
'use strict';
const { Quat, V3 } = require('./joml');

const UP_VECTOR = () => new Vec(0, 1, 0);
const DOWN_VECTOR = () => new Vec(0, -1, 0);
const FORWARD_VECTOR = () => new Vec(0, 0, 1);

class Vec {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setY(y) { this.y = y; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vec(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  addS(x, y, z) { this.x += x; this.y += y; this.z += z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  mul(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  lengthSquared() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  length() { return Math.sqrt(this.lengthSquared()); }
  normalize() {
    const len = this.length();
    if (len < 1e-12) { this.x = 0; this.y = 0; this.z = 0; return this; }
    this.x /= len; this.y /= len; this.z /= len;
    return this;
  }
  distanceSquared(v) { const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return dx * dx + dy * dy + dz * dz; }
  distance(v) { return Math.sqrt(this.distanceSquared(v)); }
  isZero() { return this.x === 0 && this.y === 0 && this.z === 0; }

  // Bukkit rotateAroundY
  rotateAroundY(angle) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const x = this.x * cos + this.z * sin;
    const z = this.x * -sin + this.z * cos;
    this.x = x; this.z = z;
    return this;
  }
  // Bukkit rotateAroundX
  rotateAroundX(angle) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const y = this.y * cos - this.z * sin;
    const z = this.y * sin + this.z * cos;
    this.y = y; this.z = z;
    return this;
  }
  // extensión maths.kt rotate(quaternion)
  rotate(q) {
    // v' = q * v * q⁻¹
    const inv = new Quat(q.x, q.y, q.z, q.w).invert();
    const vq = new Quat(this.x, this.y, this.z, 0);
    const out = vq.premul(q).mul(inv);
    this.x = out.x; this.y = out.y; this.z = out.z;
    return this;
  }
  // maths.kt pitch()
  pitch() { return -Math.atan2(this.y, Math.hypot(this.x, this.z)); }
  // maths.kt yaw()
  yaw() { return -Math.atan2(-this.x, this.z); }
  // utilities_maths.kt horizontalDistance / verticalDistance / horizontalLength
  horizontalDistance(v) { return Math.hypot(this.x - v.x, this.z - v.z); }
  verticalDistance(v) { return Math.abs(this.y - v.y); }
  horizontalLength() { return Math.hypot(this.x, this.z); }
  toV3() { return new V3(this.x, this.y, this.z); }
}

// ext moved to Vec (Vec.rotate) — helpers libres:
function rotateAroundY(origin, angle) {
  return (v) => v.sub(origin).rotateAroundY(angle).add(origin);
}

// maths.kt lerp / moveTowards de doubles
function lerp(a, b, t) { return a * (1 - t) + b * t; }
function moveTowards(current, target, speed) {
  const d = target - current;
  return Math.abs(d) < speed ? target : current + speed * Math.sign(d);
}
// lerp de Vector (in place)
function vecLerp(v, other, t) {
  v.x += (other.x - v.x) * t;
  v.y += (other.y - v.y) * t;
  v.z += (other.z - v.z) * t;
  return v;
}
function vecMoveTowards(v, target, speed) {
  const diff = target.clone().sub(v);
  const d = diff.length();
  if (d <= speed) return v.copy(target);
  return v.add(diff.mul(speed / d));
}
function average(vectors) {
  const out = new Vec(0, 0, 0);
  for (const v of vectors) out.add(v);
  return out.mul(1 / vectors.length);
}

// Capsule (utilities_maths.kt)
class Capsule {
  constructor(point1, point2, radius) { this.point1 = point1; this.point2 = point2; this.radius = radius; }
  contains(point) { return lineDistanceSquared(this.point1, this.point2, point) <= this.radius * this.radius; }
}
function lineDistanceSquared(a, b, point) {
  const abX = b.x - a.x, abY = b.y - a.y, abZ = b.z - a.z;
  const lenSq = abX * abX + abY * abY + abZ * abZ;
  const apX = point.x - a.x, apY = point.y - a.y, apZ = point.z - a.z;
  const t = lenSq < 1e-12 ? 0 : Math.max(0, Math.min(1, (apX * abX + apY * abY + apZ * abZ) / lenSq));
  const dx = point.x - (a.x + abX * t);
  const dy = point.y - (a.y + abY * t);
  const dz = point.z - (a.z + abZ * t);
  return dx * dx + dy * dy + dz * dz;
}

class LineSegment {
  constructor(point1, point2) { this.point1 = point1; this.point2 = point2; }
  static fromOffset(origin, offset) { return new LineSegment(origin.clone(), origin.clone().add(offset)); }
  vector() { return this.point2.clone().sub(this.point1); }
}

// polygons.kt
function pointInPolygon(px, pz, polygon) {
  let count = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if ((a.y <= pz && b.y > pz) || (b.y <= pz && a.y > pz)) {
      const slope = (b.x - a.x) / (b.y - a.y);
      const intersect = a.x + (pz - a.y) * slope;
      if (intersect < px) count++;
    }
  }
  return count % 2 === 1;
}
function nearestPointOnClampedLine(px, pz, a, b) {
  const apx = px - a.x, apz = pz - a.y;
  const abx = b.x - a.x, abz = b.y - a.y;
  const dot = apx * abx + apz * abz;
  const lenAB = Math.hypot(a.x - b.x, a.y - b.y);
  const t = dot / (lenAB * lenAB || 1);
  const tc = Math.max(0, Math.min(1, t));
  return { x: a.x + tc * abx, y: a.y + tc * abz };
}
function nearestPointInPolygon(px, pz, polygon) {
  let closest = polygon[0];
  let closestDistance = Math.hypot(px - closest.x, pz - closest.y);
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const p = nearestPointOnClampedLine(px, pz, a, b);
    const d = Math.hypot(px - p.x, pz - p.y);
    if (d < closestDistance) { closest = p; closestDistance = d; }
  }
  return closest;
}

// maths2.kt Double.eased
function eased(t) { return t * t * (3 - 2 * t); }

module.exports = {
  Vec, UP_VECTOR, DOWN_VECTOR, FORWARD_VECTOR,
  lerp, moveTowards, vecLerp, vecMoveTowards, average,
  Capsule, LineSegment, lineDistanceSquared,
  pointInPolygon, nearestPointInPolygon, eased, rotateAroundY,
};
