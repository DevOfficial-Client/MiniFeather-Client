// MiniFeather — SpiderSim: simulador embebido (fusión de spider-sim dentro de la extensión)
//
// Port 1:1 de TheCymaera/minecraft-spider corriendo DENTRO de la página:
//   - JOML Quaternionf/Vector3f (subset del mod)
//   - FABRIK real (KinematicChain)
//   - Gait/LegLookUp/GAIT_TYPES + presets (biped..octobot)
//   - SpiderBody (gravedad, drag, normal force, colisiones) + Leg completa
//   - ECS + behaviours (StayStill/Target/Direction)
//   - LiveWorld: implementa getBlock/raycastGround/resolveCollision/isOnGround
//     sobre los chunks NATIVOS del juego en vivo → la física se simula sobre
//     el MISMO terreno que el jugador ve, en cualquier mundo (garden o server).
//
// Corre a 20 Hz (setInterval 50ms) y expone window.MF_SPIDER_SIM con la misma
// interfaz de mensajes del servidor WebSocket viejo (hello/add/remove/frame/
// spawn/target/staystill/despawn) — pero sin Node, sin puerto, sin proceso.
(() => {
  'use strict';
  const TAG = '[MiniFeather SpiderSim]';

  // ═══ logging de diagnóstico (nivel 0=off 1=básico 2=detalle 3=verboso) ═══
  // Activar: /spider log 1..3  ·  o localStorage['mf:spiderlog']='2'
  const LOG = (() => {
    let level = 0;
    try { level = parseInt(localStorage.getItem('mf:spiderlog') || '0', 10) || 0; } catch (_) {}
    const t0 = performance.now();
    const ring = []; // últimas 300 entradas para dump sin consola
    const fmt = (v) => {
      if (typeof v === 'number') return Math.round(v * 100) / 100;
      if (Array.isArray(v)) return v.map(fmt).join(',');
      return v;
    };
    const write = (lvl, tag, args) => {
      const entry = { t: Math.round(performance.now() - t0), lvl, tag, msg: args.map((a) => (typeof a === 'object' ? safeJson(a) : String(a))).join(' ') };
      ring.push(entry);
      if (ring.length > 300) ring.shift();
      if (level >= lvl) console.log(TAG, `[${entry.t}ms]`, tag, ...args.map(fmt));
    };
    const safeJson = (o) => { try { return JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)); } catch { return String(o); } };
    return {
      get level() { return level; },
      setLevel(l) { level = (l | 0); try { localStorage.setItem('mf:spiderlog', String(level)); } catch (_) {} console.log(TAG, 'log level →', level); },
      i: (...a) => write(1, 'info', a),
      d: (...a) => write(2, 'detail', a),
      v: (...a) => write(3, 'verbose', a),
      dump(n = 30) { return ring.slice(-n); },
      clear() { ring.length = 0; },
    };
  })();

  // ══════════════════════════════════════════════════════════════════
  // joml.js — Quat + V3 (port de JOML Quaternionf)
  // ══════════════════════════════════════════════════════════════════
  class Quat {
    constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
    set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
    setQ(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
    clone() { return new Quat(this.x, this.y, this.z, this.w); }
    lengthSquared() { return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w; }
    normalize() {
      const inv = 1 / Math.sqrt(this.lengthSquared() || 1);
      this.x *= inv; this.y *= inv; this.z *= inv; this.w *= inv;
      return this;
    }
    mul(q) { return mulInto(this, this, q); }
    premul(q) { return mulInto(this, q, this); }
    invert() {
      const invNorm = 1 / this.lengthSquared();
      this.x = -this.x * invNorm; this.y = -this.y * invNorm;
      this.z = -this.z * invNorm; this.w = this.w * invNorm;
      return this;
    }
    rotationYXZ(angleY, angleX, angleZ) {
      const sx = Math.sin(angleX * 0.5), cx = Math.cos(angleX * 0.5);
      const sy = Math.sin(angleY * 0.5), cy = Math.cos(angleY * 0.5);
      const sz = Math.sin(angleZ * 0.5), cz = Math.cos(angleZ * 0.5);
      const x = cy * sx, y = sy * cx, z = sy * sx, w = cy * cx;
      this.x = x * cz + y * sz;
      this.y = y * cz - x * sz;
      this.z = w * sz - z * cz;
      this.w = w * cz + z * sz;
      return this;
    }
    rotateYXZ(angleY, angleX, angleZ) {
      const sx = Math.sin(angleX * 0.5), cx = Math.cos(angleX * 0.5);
      const sy = Math.sin(angleY * 0.5), cy = Math.cos(angleY * 0.5);
      const sz = Math.sin(angleZ * 0.5), cz = Math.cos(angleZ * 0.5);
      const yx = cy * sx, yy = sy * cx, yz = sy * sx, yw = cy * cx;
      const x = yx * cz + yy * sz;
      const y = yy * cz - yx * sz;
      const z = yw * sz - yz * cz;
      const w = yw * cz + yz * sz;
      return mulInto(this, this, { x, y, z, w });
    }
    rotateAxis(angle, axisX, axisY, axisZ) {
      const hangle = angle / 2;
      const sinAngle = Math.sin(hangle);
      const invLen = 1 / Math.sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ);
      const rx = axisX * invLen * sinAngle;
      const ry = axisY * invLen * sinAngle;
      const rz = axisZ * invLen * sinAngle;
      const rw = Math.cos(hangle);
      return mulInto(this, this, { x: rx, y: ry, z: rz, w: rw });
    }
    rotateX(angle) { return this.rotateAxis(angle, 1, 0, 0); }
    rotateZ(angle) { return this.rotateAxis(angle, 0, 0, 1); }
    rotationTo(fx, fy, fz, tx, ty, tz) {
      const fn = 1 / Math.sqrt(fx * fx + fy * fy + fz * fz);
      const tn = 1 / Math.sqrt(tx * tx + ty * ty + tz * tz);
      fx *= fn; fy *= fn; fz *= fn;
      tx *= tn; ty *= tn; tz *= tn;
      const dot = fx * tx + fy * ty + fz * tz;
      if (dot < -1.0 + 1e-6) {
        let x = fy, y = -fx, z = 0, w = 0;
        if (x * x + y * y === 0) { x = 0; y = fz; z = -fy; }
        const invLen = 1 / Math.sqrt(x * x + y * y + z * z);
        this.x = x * invLen; this.y = y * invLen; this.z = z * invLen; this.w = 0;
      } else {
        const sd2 = Math.sqrt((1 + dot) * 2);
        const isd2 = 1 / sd2;
        const cx = fy * tz - fz * ty;
        const cy = fz * tx - fx * tz;
        const cz = fx * ty - fy * tx;
        let x = cx * isd2, y = cy * isd2, z = cz * isd2, w = sd2 * 0.5;
        const n2 = 1 / Math.sqrt(x * x + y * y + z * z + w * w);
        this.x = x * n2; this.y = y * n2; this.z = z * n2; this.w = w * n2;
      }
      return this;
    }
    getEulerAnglesYXZ() {
      const safeAsin = (v) => Math.asin(Math.max(-1, Math.min(1, v)));
      return {
        x: safeAsin(-2.0 * (this.y * this.z - this.w * this.x)),
        y: Math.atan2(this.x * this.z + this.y * this.w, 0.5 - this.y * this.y - this.x * this.x),
        z: Math.atan2(this.y * this.x + this.w * this.z, 0.5 - this.x * this.x - this.z * this.z),
      };
    }
    slerp(target, alpha) {
      const cosom = this.x * target.x + this.y * target.y + this.z * target.z + this.w * target.w;
      const absCosom = Math.abs(cosom);
      let scale0, scale1;
      if (1.0 - absCosom > 1e-6) {
        const sinSqr = 1 - absCosom * absCosom;
        const sinom = 1 / Math.sqrt(sinSqr);
        const omega = Math.atan2(sinSqr * sinom, absCosom);
        scale0 = Math.sin((1.0 - alpha) * omega) * sinom;
        scale1 = Math.sin(alpha * omega) * sinom;
      } else {
        scale0 = 1.0 - alpha;
        scale1 = alpha;
      }
      if (cosom < 0) scale1 = -scale1;
      this.x = scale0 * this.x + scale1 * target.x;
      this.y = scale0 * this.y + scale1 * target.y;
      this.z = scale0 * this.z + scale1 * target.z;
      this.w = scale0 * this.w + scale1 * target.w;
      return this;
    }
  }

  function mulInto(dest, a, b) {
    const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
    const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
    const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
    const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
    dest.x = x; dest.y = y; dest.z = z; dest.w = w;
    return dest;
  }

  function quatDifference(q, other) {
    const invNorm = 1 / q.lengthSquared();
    const x = -q.x * invNorm, y = -q.y * invNorm, z = -q.z * invNorm, w = q.w * invNorm;
    return mulInto(new Quat(), { x, y, z, w }, other);
  }

  class V3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setV(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    mul(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    length() { return Math.sqrt(this.lengthSquared()); }
    lengthSquared() { return this.x * this.x + this.y * this.y + this.z * this.z; }
    normalized() { return new V3(this.x, this.y, this.z).normalize(); }
    normalize() {
      const inv = 1 / Math.sqrt(this.lengthSquared() || 1);
      this.x *= inv; this.y *= inv; this.z *= inv;
      return this;
    }
    clone() { return new V3(this.x, this.y, this.z); }
  }

  // ══════════════════════════════════════════════════════════════════
  // vecmath.js — Vec estilo Bukkit + helpers
  // ══════════════════════════════════════════════════════════════════
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
    rotateAroundY(angle) {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const x = this.x * cos + this.z * sin;
      const z = this.x * -sin + this.z * cos;
      this.x = x; this.z = z;
      return this;
    }
    rotateAroundX(angle) {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const y = this.y * cos - this.z * sin;
      const z = this.y * sin + this.z * cos;
      this.y = y; this.z = z;
      return this;
    }
    rotate(q) {
      const inv = new Quat(q.x, q.y, q.z, q.w).invert();
      const vq = new Quat(this.x, this.y, this.z, 0);
      const out = vq.premul(q).mul(inv);
      this.x = out.x; this.y = out.y; this.z = out.z;
      return this;
    }
    pitch() { return -Math.atan2(this.y, Math.hypot(this.x, this.z)); }
    horizontalDistance(v) { return Math.hypot(this.x - v.x, this.z - v.z); }
    horizontalLength() { return Math.hypot(this.x, this.z); }
  }

  function lerp(a, b, t) { return a * (1 - t) + b * t; }
  function moveTowards(current, target, speed) {
    const d = target - current;
    return Math.abs(d) < speed ? target : current + speed * Math.sign(d);
  }
  function average(vectors) {
    const out = new Vec(0, 0, 0);
    for (const v of vectors) out.add(v);
    return out.mul(1 / vectors.length);
  }

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

  // ══════════════════════════════════════════════════════════════════
  // kinematic-chain.js — FABRIK
  // ══════════════════════════════════════════════════════════════════
  class ChainSegment {
    constructor(position, length, initDirection) {
      this.position = position;
      this.length = length;
      this.initDirection = initDirection;
    }
  }

  function moveSegment(point, pullTowards, segment) {
    const direction = pullTowards.clone().sub(point);
    if (direction.lengthSquared() < 1e-24) return;
    direction.normalize();
    point.copy(pullTowards).sub(direction.mul(segment));
  }

  class KinematicChain {
    constructor(root, segments) {
      this.root = root;
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
        rotations[i].mul(rotations[i - 1]);
      }
      return rotations;
    }
  }

  function quatEulerYXZRelative(q, pivot) {
    const relative = quatDifference(pivot, q);
    return relative.getEulerAnglesYXZ();
  }

  // ══════════════════════════════════════════════════════════════════
  // gait.js — Gait + LegLookUp + GAIT_TYPES
  // ══════════════════════════════════════════════════════════════════
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

  // ══════════════════════════════════════════════════════════════════
  // presets.js
  // ══════════════════════════════════════════════════════════════════
  class SegmentPlan {
    constructor(length, initDirection) {
      this.length = length;
      this.initDirection = initDirection;
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
      this.gaitTuning = null; // ajustes de Gait por preset (altura, zonas…)
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

  // Escala un BodyPlan completo por un factor (presets GIGANTES):
  //   - attachment/rest positions y longitudes de segmento × factor
  //   - gaitTuning proporcional (bodyHeight, triggerZoneRadius) para que el
  //     cuerpo flote a la altura del monstruo y las zonas de paso escalen
  //   - el resto de parámetros del gait (velocidades, aceleraciones) los
  //     ajusta spawnSpider después; aquí solo va lo geométrico
  function makeGiant(plan, factor) {
    for (const leg of plan.legs) {
      leg.attachmentPosition.mul(factor);
      leg.restPosition.mul(factor);
      for (const seg of leg.segments) seg.length *= factor;
    }
    // gaitTuning escalado — si el preset base no tenía, crearlo desde los
    // valores por defecto del Gait (bodyHeight 1.1) para que el cuerpo suba
    // proporcionalmente al tamaño del gigante
    const t = plan.gaitTuning || (plan.gaitTuning = {});
    if (!t.stationary) t.stationary = { bodyHeight: 1.1, triggerZoneRadius: 0.25 };
    if (!t.moving) t.moving = { bodyHeight: 1.1, triggerZoneRadius: 0.8 };
    t.stationary.bodyHeight *= factor;
    t.stationary.triggerZoneRadius *= factor;
    t.moving.bodyHeight *= factor;
    t.moving.triggerZoneRadius *= factor;
    return plan;
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
    // Araña real: 8 patas (4 pares) × 2 segmentos (fémur + tibia) = cadena corta
    // para minimizar coste del FABRIK. El renderer dibuja el torso como
    // 1 mesh fusionado (cefalotórax+abdomen) escalado por bodyModel y tamaño.
    spider(sc = 2, sl = 1.0) {
      const p = new BodyPlan();
      p.bodyModel = 'flat';
      p.addLegPair(new Vec(0, 0, 0.20), new Vec(1.00, 0, 1.60), equalLength(sc, 1.10 * sl));
      p.addLegPair(new Vec(0, 0, 0.10), new Vec(1.30, 0, 0.40), equalLength(sc, 1.00 * sl));
      p.addLegPair(new Vec(0, 0, -0.10), new Vec(1.30, 0, -0.90), equalLength(sc, 1.10 * sl));
      p.addLegPair(new Vec(0, 0, -0.20), new Vec(1.10, 0, -2.50), equalLength(sc, 1.60 * sl));
      return p;
    },
    // Kraken: cuadrúpedo de 5 bloques de alto con patas de pulpo — TODAS las
    // patas se anclan al FRENTE del cuerpo y se proyectan hacia adelante (+Z);
    // el cuerpo queda atrás, como un pulpo que avanza sobre sus tentáculos.
    // gaitTuning sube el bodyHeight a 5 (la física mantiene el cuerpo flotando
    // a esa altura sobre el apoyo promedio de las patas).
    kraken(sc = 3, sl = 1.0) {
      const p = new BodyPlan();
      p.bodyModel = 'flat';
      p.gaitTuning = {
        stationary: { bodyHeight: 5.0, triggerZoneRadius: 0.6 },
        moving: { bodyHeight: 5.0, triggerZoneRadius: 1.4 },
        // Todas las patas al FRENTE → el centro de masa queda fuera del
        // polígono de apoyo y la fuerza normal moderna se anula (el cuerpo
        // caería). El modo legacy devuelve normal (0,1,0) si hay un par
        // diagonal apoyado → el cuerpo flota a bodyHeight=5 como un pulpo.
        gait: { useLegacyNormalForce: true },
      };
      p.addLegPair(new Vec(0.4, 0, 1.6), new Vec(1.4, 0, 4.2), equalLength(sc, 2.4 * sl));
      p.addLegPair(new Vec(0.4, 0, 1.0), new Vec(2.2, 0, 5.6), equalLength(sc, 2.9 * sl));
      return p;
    },
    // ─── presets GIGANTES ───
    // Escalan TODO el body plan de otro preset: attachments, rests, longitudes
    // de segmento y el gait (bodyHeight, zonas de trigger/comfort, alturas de
    // paso). Mismo comportamiento físico, escala de monstruo.
    giant_spider() { return makeGiant(PRESETS.spider(2, 1.0), 3.0); },
    giant_kraken() { return makeGiant(PRESETS.kraken(3, 1.0), 2.0); },
    giant_hexbot() { return makeGiant(PRESETS.hexbot(4, 1.0), 3.0); },
  };

  // ══════════════════════════════════════════════════════════════════
  // LiveWorld — interfaz World sobre los chunks NATIVOS del juego
  // ══════════════════════════════════════════════════════════════════
  // El SpiderBody del mod espera: getBlock(x,y,z) → {name, isPassable} | null,
  // raycastGround(pos, dir, maxDist) → Vec|null, isOnGround, resolveCollision.
  // getBlock lee el chunk vivo del juego (chunk.getBlockState — la ruta NO
  // recursiva) con caché por tick para no spamear llamadas nativas en el DDA.
  class LiveWorld {
    constructor() {
      this.game = null;
      this.blockCache = new Map();
      this.stats = { queries: 0, nullChunk: 0, air: 0, solid: 0, rayHits: 0, rayMiss: 0, raycasts: 0 };
    }

    setGame(game) {
      if (game && game !== this.game) {
        this.game = game;
        LOG.i('LiveWorld: juego conectado (world=' + (game.world ? 'sí' : 'no') + ')');
      }
    }
    clearCache() { this.blockCache.clear(); }

    getBlock(x, y, z) {
      const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
      const key = bx + ',' + by + ',' + bz;
      const cached = this.blockCache.get(key);
      if (cached !== undefined) return cached;
      const block = this.queryBlock(bx, by, bz);
      if (this.blockCache.size < 65536) this.blockCache.set(key, block);
      return block;
    }

    queryBlock(bx, by, bz) {
      if (by < 0 || by > 255) return { name: 'minecraft:air', isPassable: true };
      const world = this.game?.world;
      if (!world) {
        this.stats.nullChunk++;
        return null; // sin mundo → chunk no cargado
      }
      try {
        const proto = Object.getPrototypeOf(world);
        if (typeof proto.getChunk !== 'function') { this.stats.nullChunk++; return null; }
        const chunk = proto.getChunk.call(world, { x: bx, y: by, z: bz });
        if (chunk == null || chunk.isDummyChunk) { this.stats.nullChunk++; return null; }
        if (typeof chunk.getBlockState !== 'function') { this.stats.nullChunk++; return null; }
        const bs = chunk.getBlockState({ x: bx, y: by, z: bz });
        if (!bs || !bs.id) { this.stats.air++; return { name: 'minecraft:air', isPassable: true }; }
        this.stats.solid++;
        return { name: 'miniblox:block', isPassable: false };
      } catch (_) {
        this.stats.nullChunk++;
        return null;
      }
    }

    raycastGround(position, direction, maxDistance) {
      const dirLen = direction.length();
      if (dirLen < 1e-12) return null;
      const dx = direction.x / dirLen, dy = direction.y / dirLen, dz = direction.z / dirLen;
      const ox = position.x, oy = position.y, oz = position.z;

      const stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
      const stepY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
      const stepZ = dz > 0 ? 1 : (dz < 0 ? -1 : 0);

      const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
      const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
      const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;

      let bx = Math.floor(ox), by = Math.floor(oy), bz = Math.floor(oz);
      let tMaxX = stepX !== 0 ? intbound(ox, dx) : Infinity;
      let tMaxY = stepY !== 0 ? intbound(oy, dy) : Infinity;
      let tMaxZ = stepZ !== 0 ? intbound(oz, dz) : Infinity;
      let t = 0;

      this.stats.raycasts++;

      for (;;) {
        const block = this.getBlock(bx, by, bz);
        if (block && !block.isPassable) {
          this.stats.rayHits++;
          return new Vec(ox + dx * t, oy + dy * t, oz + dz * t);
        }
        if (tMaxX < tMaxY && tMaxX < tMaxZ) {
          t = tMaxX; bx += stepX; tMaxX += tDeltaX;
        } else if (tMaxY < tMaxZ) {
          t = tMaxY; by += stepY; tMaxY += tDeltaY;
        } else {
          t = tMaxZ; bz += stepZ; tMaxZ += tDeltaZ;
        }
        if (t > maxDistance) { this.stats.rayMiss++; return null; }
        if (by < -64 || by > 320) { this.stats.rayMiss++; return null; }
      }
    }

    isOnGround(position, downVector) {
      return this.raycastGround(position, downVector, 0.001) !== null;
    }

    resolveCollision(position, direction) {
      const dir = direction.clone().normalize();
      const hit = this.raycastGround(position.clone().sub(dir), dir, direction.length());
      if (hit) {
        return { position: hit, offset: hit.clone().sub(position) };
      }
      return null;
    }
  }

  function intbound(s, ds) {
    if (ds > 0) return (Math.floor(s) + 1 - s) / ds;
    return (s - Math.floor(s)) / -ds;
  }

  // ══════════════════════════════════════════════════════════════════
  // leg.js
  // ══════════════════════════════════════════════════════════════════
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

      // MODO MOTOR (IA neuroevolutiva): la red coloca los pies —
      // sin gait preprogramado. Solo física: inercia + colisión suelo.
      if (this.spider.motorControlled) {
        if (this.motorSwing) {
          // swing SUAVE: velocidad muscular finita hacia el objetivo,
          // proporcional al tamaño del cuerpo (gigantes: pasos largos)
          const spd = (this.spider.gait.stepMoveSpeed || 0.35) * (this.spider.motorScale || 1);
          const dx = this.motorSwing.wx - this.endEffector.x;
          const dz = this.motorSwing.wz - this.endEffector.z;
          const d = Math.hypot(dx, dz);
          if (d > 1e-4) {
            const step = Math.min(d, spd);
            this.endEffector.x += (dx / d) * step;
            this.endEffector.z += (dz / d) * step;
          }
          // pie en el aire: baja por gravedad hasta tocar suelo
          this.endEffector.y -= 0.25;
        } else {
          // pie plantado: el cuerpo se mueve → arrastrarlo (inercia)
          this.applyBodyMotion(this.endEffector);
        }
        const collision = this.world.resolveCollision(this.endEffector, DOWN_VECTOR());
        if (collision) {
          this.touchingGround = true;
          this.endEffector.y = collision.position.y;
        } else if (!this.motorSwing) {
          this.touchingGround = false;
        }
        return;
      }

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
          this.spider.events.push(['step', this.spider.uuid, this.spider.legs.indexOf(this)]);
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

  // ══════════════════════════════════════════════════════════════════
  // spider-body.js
  // ══════════════════════════════════════════════════════════════════
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
      this.name = uuid;
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

    orientationHorizontal() { return this.horizontalQuat(); }
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
  }

  function vecLerpInPlace(v, target, t) {
    v.x += (target.x - v.x) * t;
    v.y += (target.y - v.y) * t;
    v.z += (target.z - v.z) * t;
  }

  // ══════════════════════════════════════════════════════════════════
  // behaviour.js — ECS + behaviours
  // ══════════════════════════════════════════════════════════════════
  class StayStillBehaviour { }
  class TargetBehaviour {
    constructor(target, distance) { this.target = target; this.distance = distance; }
  }
  class DirectionBehaviour {
    constructor(targetDirection, walkDirection) { this.targetDirection = targetDirection; this.walkDirection = walkDirection; }
  }

  // ══════════════════════════════════════════════════════════════════
  // pathfinding.js — A* sobre grid 2D con alturas muestreadas del mundo
  // ══════════════════════════════════════════════════════════════════
  class MinHeap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(item) {
      const a = this.a;
      a.push(item);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p].f <= a[i].f) break;
        const t = a[p]; a[p] = a[i]; a[i] = t;
        i = p;
      }
    }
    pop() {
      const a = this.a;
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < a.length && a[l].f < a[m].f) m = l;
          if (r < a.length && a[r].f < a[m].f) m = r;
          if (m === i) break;
          const t = a[m]; a[m] = a[i]; a[i] = t;
          i = m;
        }
      }
      return top;
    }
  }

  const PATH_NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  // Altura de suelo transitable en (x,z): raycast hacia abajo desde hintY+12
  // (máx 24 bloques) + clearance de bloques sobre la superficie. null = no walkable.
  function sampleWalkableY(world, x, z, hintY, clearance) {
    const hit = world.raycastGround(new Vec(x + 0.5, hintY + 12, z + 0.5), DOWN_VECTOR(), 24);
    if (!hit || !Number.isFinite(hit.y)) return null;
    const base = Math.floor(hit.y + 0.1);
    for (let cy = 0; cy < clearance; cy++) {
      const b = world.getBlock(x, base + cy, z);
      if (b && !b.isPassable) return null;
    }
    return hit.y;
  }

  // ¿Se puede caminar en línea recta de a→b? (muestreo por bloque: suelo
  // existe, escalón ≤ maxStep, sin techo). Usado como atajo barato cuando no
  // hay obstáculos y para simplificar la ruta del A* (string pulling).
  function lineWalkable(world, ax, ay, az, bx, bz, opts) {
    const { clearance = 2, maxStep = 1.5 } = opts || {};
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
    let lastY = ay;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const y = sampleWalkableY(world, Math.floor(x), Math.floor(z), lastY, clearance);
      if (y == null) return false;
      if (Math.abs(y - lastY) > maxStep) return false;
      lastY = y;
    }
    return true;
  }

  // A* 8-direcciones sobre bloques. Devuelve { waypoints:[Vec], reached } con
  // los puntos en centros de bloque (y = suelo) ya simplificados, o null si ni
  // el arranque es transitable. Presupuesto duro: maxIter expansiones y radio
  // maxDist (Manhattan) desde el inicio; si la meta no se alcanza, devuelve la
  // ruta al nodo más cercano a ella (best-effort).
  function findPath(world, start, goal, opts) {
    const { clearance = 2, maxStep = 1.5, maxDist = 48, maxIter = 4000 } = opts || {};
    const heights = new Map();
    const walkable = (x, z, hintY) => {
      const key = x + ',' + z;
      if (!heights.has(key)) heights.set(key, sampleWalkableY(world, x, z, hintY, clearance));
      return heights.get(key);
    };

    const sx = Math.floor(start.x), sz = Math.floor(start.z);
    const gx = Math.floor(goal.x), gz = Math.floor(goal.z);
    const sy = walkable(sx, sz, start.y);
    if (sy == null) return null;
    const goalHint = Number.isFinite(goal.y) ? goal.y : start.y;

    const octile = (x, z) => {
      const dx = Math.abs(x - gx), dz = Math.abs(z - gz);
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };

    const gScore = new Map([[sx + ',' + sz, 0]]);
    const yOf = new Map([[sx + ',' + sz, sy]]);
    const came = new Map();
    const open = new MinHeap();
    open.push({ x: sx, z: sz, f: octile(sx, sz) });

    let best = { x: sx, z: sz, h: octile(sx, sz) };
    let reached = false;
    let iter = 0;

    while (open.size) {
      const cur = open.pop();
      const ck = cur.x + ',' + cur.z;
      const g = gScore.get(ck);
      if (g == null || g + octile(cur.x, cur.z) > cur.f + 1e-6) continue; // obsoleta
      if (cur.x === gx && cur.z === gz) { best = { x: cur.x, z: cur.z, h: 0 }; reached = true; break; }
      if (++iter > maxIter) break;
      const curY = yOf.get(ck);

      for (const [dx, dz] of PATH_NEIGHBORS) {
        const nx = cur.x + dx, nz = cur.z + dz;
        if (Math.abs(nx - sx) + Math.abs(nz - sz) > maxDist) continue;
        const ny = walkable(nx, nz, curY);
        if (ny == null || Math.abs(ny - curY) > maxStep) continue;
        if (dx !== 0 && dz !== 0) {
          // sin cortar esquinas: ambos ortogonales adyacentes deben ser transitables
          const o1 = walkable(cur.x + dx, cur.z, curY);
          const o2 = walkable(cur.x, cur.z + dz, curY);
          if (o1 == null || o2 == null || Math.abs(o1 - curY) > maxStep || Math.abs(o2 - curY) > maxStep) continue;
        }
        const nk = nx + ',' + nz;
        const stepCost = (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1) + Math.abs(ny - curY) * 0.5;
        const ng = g + stepCost;
        if (ng < (gScore.get(nk) ?? Infinity)) {
          gScore.set(nk, ng);
          yOf.set(nk, ny);
          came.set(nk, ck);
          const h = octile(nx, nz);
          if (h < best.h) best = { x: nx, z: nz, h };
          open.push({ x: nx, z: nz, f: ng + h });
        }
      }
    }

    // reconstruir desde best (goal si llegó, si no el más cercano)
    const nodes = [];
    let k = best.x + ',' + best.z;
    while (k) {
      const [x, z] = k.split(',').map(Number);
      nodes.push({ x, y: yOf.get(k) ?? sy, z });
      k = came.get(k);
    }
    nodes.reverse();

    // simplificación (string pulling): saltar waypoints intermedios cuando la
    // línea recta es transitable
    const waypoints = [];
    let i = 0;
    while (i < nodes.length) {
      let j = nodes.length - 1;
      for (; j > i + 1; j--) {
        if (lineWalkable(world, nodes[i].x, nodes[i].y, nodes[i].z, nodes[j].x, nodes[j].z, { clearance, maxStep })) break;
      }
      const n = nodes[j];
      waypoints.push(new Vec(n.x + 0.5, n.y, n.z + 0.5));
      if (j === i) break;
      i = j;
    }
    return { waypoints, reached };
  }

  // Behaviour con pathfinding A*: persigue un objetivo fijo (goto) o vivo
  // (follow del jugador). En terreno abierto camina en línea recta (barato);
  // el A* entra cuando la línea está bloqueada, el objetivo se movió de la
  // ruta calculada o la araña se atasca.
  class PathfindBehaviour {
    constructor(opts = {}) {
      this.distance = opts.distance ?? 3; // distancia de parada al objetivo
      this.followPlayer = !!opts.followPlayer;
      this.target = opts.target || null; // Vec fijo
      this.waypoints = null;
      this.wp = 0;
      this.pathGoal = null; // Vec del objetivo cuando se calculó la ruta
      this.nextCompute = 0; // ms — rate limit de A*
      this.straightUntil = 0; // ms — línea recta válida hasta esta marca
      this.stuckMs = 0;
    }
  }

  // IA de caza: máquina de estados por araña (acecho → rodeo → emboscada →
  // mordisco → retirada). Reutiliza los campos de pathfinding para el acecho.
  class HuntBehaviour {
    constructor(opts = {}) {
      this.range = opts.range ?? 48; // radio de engagement (fuera → re-acechar)
      this.aggression = opts.aggression ?? 1; // acelera rodeos y mordiscos
      this.state = 'stalk';
      this.stateT = 0; // ms en el estado
      this.circleDir = Math.random() < 0.5 ? 1 : -1;
      this.circleT = 2000; // ms de rodeo antes de la emboscada
      this.nextPounceOk = 0; // ms — cooldown de mordisco
      this.bites = 0;
      // runtime de pathfinding (para el acecho)
      this.waypoints = null;
      this.wp = 0;
      this.pathGoal = null;
      this.nextCompute = 0;
      this.straightUntil = 0;
      this.stuckMs = 0;
    }
  }

  // Títere: espeja una araña NATIVA del server (reemplazo de modelo). El
  // servidor manda: x/z se copian por velocidad (las patas caminan solas y
  // siguen el suelo), el yaw se copia por rotación suave.
  class PuppetBehaviour {
    constructor(entityId) {
      this.entityId = entityId;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // IA EVOLUTIVA — selección natural
  // ══════════════════════════════════════════════════════════════════
  // Cada araña tiene un GENOMA que controla su fenotipo (velocidad real de
  // sus gaits, longitud de patas, temperamento) y su comportamiento
  // (estrategia de búsqueda de comida vs caza del jugador).
  //
  // Ciclo de vida:
  //   energía: se gasta al moverse (proporcional a velocidad y masa) y se
  //   gana al comer comida (food) o morder al jugador (caza).
  //   muerte: energía ≤ 0 → la araña muere y se elimina (selección: los
  //   genomas ineficientes desaparecen solos).
  //   reproducción: energía ≥ umbral → nace una cría con el genoma del
  //   padre + mutación gaussiana. La energía se divide entre padre y cría.
  //
  // El sistema corre como un onTick más del ECS y NO interfiere con los
  // otros modos (follow/goto/hunt/replace): solo se activa con el
  // comando `evolve` y despacha componentes `EvolutionBehaviour`.

  // Genoma: números normalizados ~U[0,1] que se traducen a fenotipo en
  // applyGenome(). Mutación = perturbación gaussiana por gen.
  class Genome {
    constructor(genes) {
      // 15 genes: speed, accel, legLen, bodyHeight, aggression, huntRange,
      // foodVsHunt (0=recolecta, 1=caza), metabolism, reproThreshold,
      // turnRate, bitePower, legMoveSpeed, strength (músculo máx),
      // endurance (estamina máx), recovery (regeneración)
      this.genes = genes || Genome.random();
      this.generation = 0;
      this.lineage = []; // nombres de ancestros (para el árbol)
    }
    static random() {
      const g = {};
      for (const k of Genome.GENE_LIST) g[k] = Math.random();
      return g;
    }
    static mutate(parentGenes, rate = 0.18, sigma = 0.16) {
      const g = { ...parentGenes };
      for (const k of Genome.GENE_LIST) {
        if (Math.random() < rate) {
          // gaussiana aproximada (suma de uniformes) centrada en el valor
          const noise = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5 * sigma;
          g[k] = Math.max(0, Math.min(1, g[k] + noise));
        }
      }
      return g;
    }
    clone() {
      const g = new Genome({ ...this.genes });
      g.generation = this.generation;
      g.lineage = [...this.lineage];
      return g;
    }
    child() {
      const g = new Genome(Genome.mutate(this.genes));
      g.generation = this.generation + 1;
      g.lineage = [...this.lineage, this.generation].slice(-8);
      return g;
    }
  }
  Genome.GENE_LIST = [
    'speed', 'accel', 'legLen', 'bodyHeight', 'aggression', 'huntRange',
    'foodVsHunt', 'metabolism', 'reproThreshold', 'turnRate', 'bitePower', 'legMoveSpeed',
    'strength', 'endurance', 'recovery',
  ];

  // Traduce genoma → fenotipo del SpiderBody (gaits) + parámetros de
  // conducta. Se llama al nacer (spawnSpiderEvolution) y define lo que la
  // selección puede "ver": una araña lenta pero eficiente puede vivir más
  // que una rápida derrochadora.
  function applyGenome(spider, genome) {
    const g = genome.genes;
    // locomoción: mapear [0,1] → rangos jugosos (comparables a los default)
    const walkSpeed = 0.08 + g.speed * 0.25;        // 0.08..0.33 (def 0.15)
    const gallopSpeed = walkSpeed * (1.6 + g.speed * 1.4);
    // MÚSCULO: más strength = más empuje (aceleración y salto), pero masa
    // muscular extra cuesta metabolismo (la selección equilibra músculo vs
    // eficiencia). El empuje escala ~strength², el coste ~lineal.
    const muscleBoost = 0.7 + g.strength * 1.1;     // 0.7..1.8 ×
    for (const gait of [spider.walkGait, spider.gallopGait]) {
      gait.maxSpeed = walkSpeed;
      gait.moveAcceleration = (0.02 + g.accel * 0.06) * muscleBoost; // def 0.0375
      gait.rotateAcceleration = (0.02 + g.accel * 0.08) * muscleBoost;
      gait.legMoveSpeed = walkSpeed * (1.8 + g.legMoveSpeed * 2.2); // def ×2.5
      gait.rotationLerp = 0.15 + g.turnRate * 0.4;   // def 0.3
      gait.stationary.bodyHeight = 0.7 + g.bodyHeight * 0.9; // def 1.1
      gait.moving.bodyHeight = 0.7 + g.bodyHeight * 1.1;
      // patas más fuertes levantan más el cuerpo al andar (empuje real)
      gait.legLiftHeight = 0.25 + g.strength * 0.3;  // def 0.35
    }
    spider.gallopGait.maxSpeed = gallopSpeed;
    // metabolismo: lo usa el sistema evolutivo (coste por tick)
    spider.__mfGenome = genome;
    return spider;
  }

  // Estado evolutivo por araña
  class EvolutionBehaviour {
    constructor(genome) {
      this.genome = genome;
      this.energy = 55;       // arranque: suficiente para explorar
      this.maxEnergy = 100;
      // ESTAMINA: capacidad de esfuerzo físico. Se gasta al correr/cazar
      // (más rápido con músculo grande), se regenera quieta o al andar
      // suave. Sin estamina la araña no puede sprintar ni morder fuerte.
      this.maxStamina = 0.6 + genome.genes.endurance * 1.4; // 0.6..2.0 (×segundos de sprint)
      this.stamina = this.maxStamina; // nace descansada
      this.staminaDrain = 0;  // diagnóstico: drenaje del último tick
      this.age = 0;           // ticks vividos
      this.bites = 0;
      this.foodEaten = 0;
      this.children = 0;
      this.dead = false;
      this.reproCooldown = 0;
      // runtime de deambular (wander) hacia comida
      this.wanderDir = Math.random() * Math.PI * 2;
      this.wanderT = 0;
      this.targetFood = null;
    }
  }

  // Comida: puntos del mundo que las arañas pueden comer. Se generan cerca
  // del jugador (radio 24) sobre el suelo y expiran.
  const evoFood = {
    items: [], // { pos: Vec, t: ms de vida restante, id }
    nextId: 1,
    spawnEvery: 0, // ticks hasta el próximo spawn
    rate: 4,      // comida nueva cada N ticks (austero: la competencia muerde)
  };

  function evoSpawnFood() {
    const p = sim.lastPlayerPos;
    if (!p || (p.x === 0 && p.y === 0 && p.z === 0)) return;
    if (evoFood.items.length >= 14) return; // escasez = presión selectiva
    const ang = Math.random() * Math.PI * 2;
    const rad = 4 + Math.random() * 20;
    const x = p.x + Math.cos(ang) * rad;
    const z = p.z + Math.sin(ang) * rad;
    const hit = sim.world.raycastGround(new Vec(x, (p.y || 64) + 24, z), DOWN_VECTOR(), 48);
    if (!hit) return;
    evoFood.items.push({ pos: new Vec(hit.x, hit.y, hit.z), t: 45000, id: evoFood.nextId++ });
    emit({ type: 'evo', event: 'food', at: [round3(hit.x), round3(hit.y), round3(hit.z)] });
  }

  // ¿Está la simulación evolutiva activa? (comando evolve)
  let evoActive = false;
  let evoStats = { births: 0, deaths: 0, generation: 0, bestFitness: 0, ticks: 0 };

  // ════════════════════════════════════════════════════════════
  // AMENAZAS: depredadores que patrullan y CAZAN arañas
  // ════════════════════════════════════════════════════════════
  // Como los Predator de ai/env.py: velocidad 0.30 (< sprint 0.40
  // → huir SIRVE), sentido 14 bloques, atrapan a 2. La IA los ve
  // en su observación (features 6-8 + 16) y aprende a escapar.
  const predators = {
    items: [],   // { pos: Vec, heading, state: 'patrol'|'chase', wanderT }
    on: false,
    count: 2,
    kills: 0,
  };

  function predatorSpawn() {
    const p = sim.lastPlayerPos;
    if (!p || (p.x === 0 && p.y === 0 && p.z === 0)) return;
    // nace lejos de las arañas
    for (let tries = 0; tries < 8; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 26 + Math.random() * 12;
      const x = p.x + Math.cos(ang) * rad;
      const z = p.z + Math.sin(ang) * rad;
      const hit = sim.world.raycastGround(new Vec(x, (p.y || 64) + 30, z), DOWN_VECTOR(), 60);
      if (!hit) continue;
      predators.items.push({
        pos: new Vec(hit.x, hit.y, hit.z),
        heading: Math.random() * Math.PI * 2,
        state: 'patrol',
        wanderT: 0,
        wanderDir: Math.random() * Math.PI * 2,
      });
      return;
    }
  }

  function setupPredators(app) {
    app.onTick(() => {
      if (!predators.on) return;
      // mantener población
      while (predators.items.length < predators.count) predatorSpawn();
      const SENSE = 14, EAT = 2, SPD = 0.30, CHASE_DIV = 1.4;
      for (const pr of predators.items) {
        // presa más cercana (araña viva más lenta que el depredador)
        let prey = null, pd = Infinity;
        for (const s of sim.spiders) {
          const d = s.body.position.distanceSquared(pr.pos);
          if (d < pd) { pd = d; prey = s; }
        }
        const dist = Math.sqrt(pd);
        if (prey && dist < SENSE) {
          pr.state = 'chase';
          pr.heading = Math.atan2(prey.body.position.z - pr.pos.z, prey.body.position.x - pr.pos.x);
          const spd = SPD * (dist > 6 ? 1.25 : 1.0); // embiste al final
          pr.pos.x += Math.cos(pr.heading) * spd;
          pr.pos.z += Math.sin(pr.heading) * spd;
          // ATRAPADA
          if (dist < EAT) {
            const evo = prey.entity.components.get('EvolutionBehaviour');
            const ai = prey.entity.components.get('RemoteAIBehaviour');
            const fitness = evo ? round3(evoFitness(evo)) : 0;
            predators.kills++;
            evoStats.deaths++;
            if (ai) { aiSendReset(ai); }
            emit({ type: 'evo', event: 'predation', name: prey.name, fitness });
            const idx = sim.spiders.indexOf(prey);
            if (idx >= 0) sim.spiders.splice(idx, 1);
            prey.entity.remove();
            emit({ type: 'remove', name: prey.name });
          }
        } else {
          pr.state = 'patrol';
          if (--pr.wanderT <= 0) { pr.wanderDir = Math.random() * Math.PI * 2; pr.wanderT = 120 + Math.random() * 260; }
          pr.heading = pr.wanderDir;
          pr.pos.x += Math.cos(pr.heading) * SPD * 0.6;
          pr.pos.z += Math.sin(pr.heading) * SPD * 0.6;
        }
        // pegar al suelo
        const hit = sim.world.raycastGround(new Vec(pr.pos.x, pr.pos.y + 20, pr.pos.z), DOWN_VECTOR(), 40);
        if (hit) { pr.pos.y = hit.y; }
        void CHASE_DIV;
      }
      emit({ type: 'evo', event: 'preds', positions: predators.items.map((pr) => [round3(pr.pos.x), round3(pr.pos.y), round3(pr.pos.z), pr.state === 'chase' ? 1 : 0]) });
    });
  }

  // El corazón: sistema ECS de la evolución
  function setupEvolution(app) {
    app.onTick(() => {
      if (!evoActive) return;
      const now = sim.tickCount * TICK_MS;
      const p = sim.lastPlayerPos;

      // 1) comida: spawn cadencioso + expiración
      if (--evoFood.spawnEvery <= 0) { evoSpawnFood(); evoFood.spawnEvery = evoFood.rate * 20; }
      for (let i = evoFood.items.length - 1; i >= 0; i--) {
        evoFood.items[i].t -= TICK_MS;
        if (evoFood.items[i].t <= 0) evoFood.items.splice(i, 1);
      }

      // 2) por cada araña evolutiva
      const names = new Map();
      for (const s of sim.spiders) names.set(s.body, s.name);
      const newborns = [];
      for (const [entity, spider, evo] of app.query('SpiderBody', 'EvolutionBehaviour')) {
        void entity;
        evo.age++;
        if (evo.reproCooldown > 0) evo.reproCooldown--;

        // ── metabolismo: coste por tick (velocidad × masa-ish) ──
        // El MÚSCULO pesa: masa muscular extra sube el gasto base
        const g = evo.genome.genes;
        const speed = Math.hypot(spider.velocity.x, spider.velocity.z);
        const speedFactor = Math.min(1, speed / (spider.gait.maxSpeed || 0.2));
        const muscleMass = 0.8 + g.strength * 0.7;  // 0.8..1.5 × coste base
        const metabRate = (0.006 + g.metabolism * 0.03) * (0.35 + speedFactor * 0.65) * muscleMass;
        evo.energy -= metabRate;

        // ── ESTAMINA: esfuerzo físico (sprint/caza) drena, descanso llena ──
        // drenaje: correr por encima del 60% de capacidad; escala con el
        // músculo (empujar masa grande cansa más)
        const drainThreshold = 0.6;
        let drain = 0;
        if (speedFactor > drainThreshold) {
          drain = (speedFactor - drainThreshold) * (0.025 + g.strength * 0.02); // por tick
        }
        // regeneración: quieta/andando suave (más lenta con músculo grande)
        if (drain === 0) {
          const regen = (0.0015 + g.recovery * 0.004) / muscleMass;
          evo.stamina = Math.min(evo.maxStamina, evo.stamina + regen);
        } else {
          evo.stamina = Math.max(0, evo.stamina - drain);
        }
        evo.staminaDrain = drain;
        // fatiga: por debajo del 15% de estamina, el rendimiento cae (cap
        // de velocidad y mordiscos débiles) — como un músculo agotado
        const fatigued = evo.stamina < evo.maxStamina * 0.15;
        const speedCap = fatigued ? 0.45 : 1;   // la araña agotada tropieza

        // ── percepción: comida más cercana ──
        let bestFood = null, bestD = Infinity;
        for (const f of evoFood.items) {
          const d = spider.position.distanceSquared(f.pos);
          if (d < bestD) { bestD = d; bestFood = f; }
        }

        // ── conducta: gen foodVsHunt elige estrategia ──
        const hungry = evo.energy < 70;
        if (bestFood && hungry && g.foodVsHunt < 0.55) {
          // recolectar: ir a por la comida (sprint si hay estamina)
          const d = Math.sqrt(bestD);
          const dir = new Vec(bestFood.pos.x - spider.position.x, 0, bestFood.pos.z - spider.position.z);
          if (d > 0.8) {
            rotateTowards(spider, dir);
            const urgency = d > 6 ? 1 : 0.7; // lejos: sprint; cerca: moderado
            walkAt(spider, dir.clone().normalize().mul(spider.gait.maxSpeed * urgency * speedCap));
          } else {
            walkAt(spider, new Vec(0, 0, 0));
          }
          if (d < 1.4 && bestFood) {
            // comer: +energía, quitar comida, evento
            const idx = evoFood.items.indexOf(bestFood);
            if (idx >= 0) {
              evoFood.items.splice(idx, 1);
              evo.energy = Math.min(evo.maxEnergy, evo.energy + 32);
              evo.stamina = Math.min(evo.maxStamina, evo.stamina + 0.15); // comer reanima
              evo.foodEaten++;
              emit({ type: 'evo', event: 'eat', name: names.get(spider) || '?', at: [round3(bestFood.pos.x), round3(bestFood.pos.y), round3(bestFood.pos.z)], energy: round3(evo.energy) });
            }
          }
        } else if (g.foodVsHunt >= 0.55 && hungry && p) {
          // cazar al jugador (versión evolutiva: usa aggression del genoma)
          const dx = p.x - spider.position.x;
          const dz = p.z - spider.position.z;
          const d = Math.hypot(dx, dz);
          const dir = new Vec(dx, 0, dz);
          if (d > 2.2) {
            rotateTowards(spider, dir);
            walkAt(spider, dir.clone().normalize().mul(spider.gait.maxSpeed * (0.6 + g.aggression * 0.5) * speedCap));
          } else if (d < 2.2 && now > (evo.nextBiteOk || 0)) {
            // mordisco al jugador: mucha energía (recompensa por arriesgar).
            // Con fatiga el mordisco es débil: el músculo agotado no aprieta
            const biteMult = fatigued ? 0.35 : 1;
            evo.nextBiteOk = now + 4000 / (0.4 + g.aggression * (fatigued ? 0.5 : 1));
            evo.energy = Math.min(evo.maxEnergy, evo.energy + (14 + g.bitePower * 16) * biteMult);
            evo.stamina = Math.max(0, evo.stamina - 0.12); // morder cuesta esfuerzo
            evo.bites++;
            emit({
              type: 'evo', event: 'bite', name: names.get(spider) || '?',
              at: [round3(p.x), round3(p.y), round3(p.z)], bites: evo.bites, energy: round3(evo.energy),
            });
          } else {
            walkAt(spider, new Vec(0, 0, 0));
          }
        } else {
          // saciada (o sin comida): deambular suave cerca (ahorra energía)
          evo.wanderT -= TICK_MS;
          if (evo.wanderT <= 0) {
            evo.wanderDir = Math.random() * Math.PI * 2;
            evo.wanderT = 1500 + Math.random() * 2500;
          }
          const dir = new Vec(Math.cos(evo.wanderDir), 0, Math.sin(evo.wanderDir));
          rotateTowards(spider, dir);
          walkAt(spider, dir.mul(spider.gait.maxSpeed * 0.35 * speedCap));
        }

        // ── muerte por inanición: SELECCIÓN NATURAL ──
        if (evo.energy <= 0) {
          const rec = sim.spiders.find((r) => r.body === spider);
          const name = names.get(spider) || rec?.name || '?';
          const fitness = evoFitness(evo);
          evoStats.deaths++;
          // fin del episodio de esa mente → memoria GRU a cero en el server
          const aiDead = rec ? rec.entity.components.get('RemoteAIBehaviour') : entity.components.get('RemoteAIBehaviour');
          if (aiDead) { aiSendReset(aiDead); aiDead.obs = null; }
          emit({ type: 'evo', event: 'death', name, fitness: round3(fitness), gen: evo.genome.generation, age: evo.age });
          if (rec) {
            const idx = sim.spiders.indexOf(rec);
            if (idx >= 0) sim.spiders.splice(idx, 1);
            rec.entity.remove();
            emit({ type: 'remove', name: rec.name });
          } else {
            entity.remove();
          }
          continue;
        }

        // ── reproducción: cría mutada ──
        const reproAt = 62 + g.reproThreshold * 30; // 62..92
        if (evo.energy >= reproAt && evo.age > 240 && evo.reproCooldown <= 0) {
          const rec = sim.spiders.find((r) => r.body === spider);
          if (rec && sim.spiders.length < 16) {
            const child = evoSpawnChild(rec, evo);
            if (child) newborns.push(child);
          }
          evo.energy *= 0.45; // criar cuesta: el padre dona energía
          evo.children++;
          evo.reproCooldown = 600; // 30 s
        }
      }

      // 3) contabilidad
      evoStats.ticks++;
      if (newborns.length) {
        evoStats.births += newborns.length;
        let maxGen = evoStats.generation;
        for (const n of newborns) maxGen = Math.max(maxGen, n.generation);
        evoStats.generation = maxGen;
      }
      void now;
    });
  }

  function evoFitness(evo) {
    // fitness = comida×3 + mordiscos×5 + crías×8 + edad×0.002 + eficiencia
    // física (sobrevivir con estamina en reserva = músculo bien gestionado)
    const staminaBonus = (evo.stamina / Math.max(0.001, evo.maxStamina)) * 2;
    return evo.foodEaten * 3 + evo.bites * 5 + evo.children * 8 + evo.age * 0.002 + staminaBonus;
  }

  // nace una cría junto al padre, con genoma mutado
  function evoSpawnChild(parentRec, parentEvo) {
    const genome = parentEvo.genome.child();
    const ang = Math.random() * Math.PI * 2;
    const x = parentRec.body.position.x + Math.cos(ang) * 2.5;
    const z = parentRec.body.position.z + Math.sin(ang) * 2.5;
    const hit = sim.world.raycastGround(new Vec(x, parentRec.body.position.y + 12, z), DOWN_VECTOR(), 24);
    const y = (hit ? hit.y : parentRec.body.position.y) + 2;
    const name = 'evo-' + genome.generation + '-' + (sim.spiders.length + 1);
    const spider = spawnSpiderGenome(name, x, y, z, ang, genome);
    const rec = sim.spiders[sim.spiders.length - 1];
    const evo = rec?.body === spider ? new EvolutionBehaviour(genome) : null;
    if (evo) {
      evo.energy = Math.max(20, parentEvo.energy * 0.4); // herencia
      rec.entity.replace('EvolutionBehaviour', evo);
      evoStats.bestFitness = Math.max(evoStats.bestFitness, evoFitness(parentEvo));
      emit({
        type: 'evo', event: 'birth', name,
        gen: genome.generation, parent: parentRec.name,
        parentFitness: round3(evoFitness(parentEvo)),
        genes: { ...genome.genes },
      });
    }
    return genome;
  }

  // spawn con genoma (preset base 'spider' + fenotipo del genoma)
  function spawnSpiderGenome(name, x, y, z, yaw, genome) {
    const spider = spawnSpider(name, 'spider', x, y, z, yaw, genome.genes.speed > 0.6);
    applyGenome(spider, genome);
    return spider;
  }

  // ══════════════════════════════════════════════════════════════════
  // IA REMOTA MOTOR — control de CADA músculo (neuroevolución)
  // ══════════════════════════════════════════════════════════════════
  // Cero comportamientos preprogramados: la red (ai/server.py) emite
  // 28 comandos continuos = 8 patas × [swing, lateral, lift] +
  // cuerpo × [pitch, roll, yaw, thrust]. El movimiento EMERGE de la
  // física del juego (pie plantado se retrae → empuja el cuerpo).
  // Aprendizaje: SOLO selección natural en ai/ecoserver.py.
  class RemoteAIBehaviour {
    constructor() {
      this.sid = null;         // id de sesión (memoria GRU por araña)
      this.motors = null;      // últimos 28 comandos recibidos
      this.obs = null;
      this.prevFoodDist = null;
      this.prevPredDist = null;
      this.eaten = 0;
      this.bites = 0;
      this.biteCd = 0;
      this.travel = 0;
      this.lastPos = null;
      this.mindAge = 0;        // ticks desde el último reset de memoria
      this.kills = 0;          // 5 mordidas = kill
      this.fightTicks = 0;     // persecución sostenida
      this.preyHp = 60;        // HP virtual de la presa (jugador)
      this.postFight = 0;
    }
  }

  // cliente WebSocket del AI server (compartido por todas las arañas)
  const aiws = {
    sock: null,
    url: '',
    ready: false,
    pending: new Map(), // requestId → resolve
    nextId: 1,
    stats: { connected: false, backend: null, generation: null, device: null, sent: 0, recvd: 0 },
  };

  function aiConnect(url) {
    if (aiws.sock && aiws.url === url && aiws.ready) return Promise.resolve(true);
    aiDisconnect();
    aiws.url = url;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => { if (!settled) { settled = true; resolve(ok); } };
      let sock;
      try { sock = new WebSocket(url); } catch (e) { finish(false); return; }
      aiws.sock = sock;
      sock.onopen = () => {
        sock.send(JSON.stringify({ t: 'init' }));
      };
      sock.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.t === 'ready') {
            aiws.ready = true;
            aiws.stats.connected = true;
            aiws.stats.backend = msg.stats?.backend ?? null;
            aiws.stats.generation = msg.stats?.generation ?? null;
            aiws.stats.device = msg.stats?.device ?? null;
            aiws.stats.mem = msg.stats?.mem ?? null;
            aiws.stats.motors = msg.stats?.motors ?? null;
            LOG.i('AI motor server listo:', msg.stats);
            finish(true);
          } else if (msg.t === 'motors') {
            const p = aiws.pending.get(msg.id);
            if (p) {
              aiws.pending.delete(msg.id);
              p(Array.isArray(msg.m) ? msg.m : null);
              aiws.stats.recvd++;
            }
          } else if (msg.t === 'stats') {
            aiws.stats.generation = msg.stats?.generation ?? aiws.stats.generation;
            aiws.stats.device = msg.stats?.device ?? null;
          }
        } catch (_) {}
      };
      sock.onclose = () => {
        aiws.ready = false;
        aiws.stats.connected = false;
        aiws.sock = null;
        for (const [, p] of aiws.pending) { try { p(null); } catch (_) {} }
        aiws.pending.clear();
      };
      sock.onerror = () => { finish(false); };
      setTimeout(() => finish(aiws.ready), 3000);
    });
  }

  function aiDisconnect() {
    try { aiws.sock?.close(); } catch (_) {}
    aiws.sock = null;
    aiws.ready = false;
    aiws.stats.connected = false;
  }

  // pedir comandos de músculo (async; null = sin respuesta → relajar).
  // pending se indexa por SID: el server responde {"t":"motors","id":<sid>}
  // — el mismo id de sesión que enviamos en "act".
  function aiAct(obs, ai) {
    return new Promise((resolve) => {
      if (!aiws.ready) { resolve(null); return; }
      if (!ai.sid) ai.sid = aiws.nextId++;
      const sid = ai.sid;
      // petición anterior de ESTA araña sin resolver → descartar (la nueva
      // obs la suplanta); resolver null para no colgar el .then viejo
      const old = aiws.pending.get(sid);
      if (old) { try { old(null); } catch (_) {} aiws.pending.delete(sid); }
      aiws.pending.set(sid, resolve);
      aiws.stats.sent++;
      try {
        aiws.sock.send(JSON.stringify({ t: 'act', id: sid, obs }));
        setTimeout(() => {
          // solo caduca si sigue siendo NUESTRA promesa (no una más nueva)
          if (aiws.pending.get(sid) === resolve) {
            aiws.pending.delete(sid);
            resolve(null);
          }
        }, 250);
      } catch (_) { aiws.pending.delete(sid); resolve(null); }
    });
  }

  // araña muerta/nueva → memoria de la GRU a cero
  function aiSendReset(ai) {
    if (!aiws.ready || !ai.sid) return;
    try { aiws.sock.send(JSON.stringify({ t: 'reset', id: ai.sid })); } catch (_) {}
  }

  // ── observación de UNA araña (26 floats, misma forma que env.py) ──
  function aiObservation(spider, ai, evo) {
    const p = sim.lastPlayerPos;
    const A = 24;
    const SENSE = 14;
    const yaw = spider.orientation.getEulerAnglesYXZ().y;
    // comida más cercana
    let fa = 0, fdist = 2;
    if (evoFood.items.length) {
      let best = null, bd = Infinity;
      for (const f of evoFood.items) {
        const d = spider.position.distanceSquared(f.pos);
        if (d < bd) { bd = d; best = f; }
      }
      if (best) {
        fa = relAngleTo(spider.position, best.pos, yaw);
        fdist = Math.min(2, Math.sqrt(bd) / A);
      }
    }
    // jugador
    let pa = 0, pdist = 2;
    if (p) {
      pa = relAngleTo(spider.position, p, yaw);
      pdist = Math.min(2, spider.position.distance(p) / A);
    }
    // amenaza más cercana
    let ta = 0, tdist = 2, chasing = 0;
    if (predators.items.length) {
      let best = null, bd = Infinity;
      for (const pr of predators.items) {
        const d = spider.position.distanceSquared(pr.pos);
        if (d < bd) { bd = d; best = pr; }
      }
      if (best) {
        ta = relAngleTo(spider.position, best.pos, yaw);
        tdist = Math.min(2, Math.sqrt(bd) / A);
        chasing = Math.sqrt(bd) < SENSE ? 1 : 0;
      }
    }
    const speed = Math.hypot(spider.velocity.x, spider.velocity.z);
    const maxSp = spider.gait.maxSpeed || 0.2;
    const stMax = evo ? evo.maxStamina : 1.3;
    const st = evo ? evo.stamina : 1;
    // propiocepción: ¿cada pie está en el suelo? (16-23) + fracción (24)
    const grounded = spider.legs.map((l) => (l.isGrounded() ? 1 : 0));
    // altura del cuerpo sobre el suelo (normalizada ~0..1.5)
    const groundY = typeof spider.getGroundHeight === 'function'
      ? spider.getGroundHeight() : (spider.gait?.bodyHeight ?? 0.9);
    const height = clamp((spider.position.y - groundY) + 0.9, 0.25, 2.5);
    // combate: HP virtual de la presa (60 − mordidas×12) y flag en-combate
    const preyHp = clamp(1 - (ai.bites * 12) / 60, 0, 1);
    const inCombat = p && spider.position.distance(p) < 8 ? 1 : 0;
    return [
      round3(Math.sin(fa)), round3(Math.cos(fa)), round3(fdist),
      round3(Math.sin(pa)), round3(Math.cos(pa)), round3(pdist),
      round3(Math.sin(ta)), round3(Math.cos(ta)), round3(tdist),
      round3(Math.sin(yaw)), round3(Math.cos(yaw)),
      round3(evo ? evo.energy / 100 : 0.5),
      round3(st / stMax),
      round3(Math.min(1.5, speed / maxSp)),
      round3(spider.rotationalVelocity.y || 0),
      st < stMax * 0.15 ? 1 : 0,
      ...grounded,
      round3(grounded.reduce((a, b) => a + b, 0) / (spider.legs.length || 8)),
      round3(height),
      round3(preyHp),      // 26: HP de la presa
      inCombat,            // 27: en combate (< 8 bloques)
      1,
    ];
  }

  // ángulo relativo (-π..π; 0 = justo al frente de la araña)
  function relAngleTo(from, to, yaw) {
    const ang = Math.atan2(to.z - from.z, to.x - from.x) - yaw;
    return Math.atan2(Math.sin(ang), Math.cos(ang));
  }

  // aplicar los 28 comandos de músculo a la física del juego
  // (núcleo del control motor puro: el pie plantado se retrae hacia
  //  su objetivo → el suelo resiste → el CUERPO es empujado)
  function aiApplyMotors(spider, m) {
    if (!m || m.length < 24) {
      // músculos relajados: el cuerpo cae si nadie lo sostiene
      spider.velocity.y -= 0.06;
      return;
    }
    const N = Math.min(spider.legs.length, 8);
    const yaw = spider.orientation.getEulerAnglesYXZ().y;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);

    // escala del cuerpo: proporcional al alcance real de las patas.
    // Normal 'spider': rest0 = (1.6, 2.56) → hypot 3.02 → escala 1.0
    // (física IDÉNTICA a la actual). Gigante ×3: 9.06 → escala 3.0.
    const baseRest = spider.legs[0]?.legPlan?.restPosition;
    const scale = Math.max(1, baseRest ? Math.hypot(baseRest.x, baseRest.z) / 3.02 : 1);
    spider.motorScale = scale;
    const LEG_REACH = 2.6 * scale;
    const PUSH = 0.09, FOOT_SLIP = 0.14;

    // ── 1) patas: colocar pies y acumular empuje + sustento ──
    for (let i = 0; i < N; i++) {
      const leg = spider.legs[i];
      const swing = clamp(m[i * 3], -1, 1);
      const lateral = clamp(m[i * 3 + 1], -1, 1);
      const lift = clamp(m[i * 3 + 2], -1, 1);

      // objetivo del pie en marco del cuerpo: anclaje + desplazamiento.
      // El clamp es RELATIVO al anclaje (±reach), no absoluto → escala
      // con el cuerpo (gigantes mueven los pies en proporción a su tamaño).
      const anchor = leg.legPlan.restPosition; // dir. de reposo (local)
      const axMin = anchor.x - LEG_REACH, axMax = anchor.x + LEG_REACH;
      const azMin = anchor.z - LEG_REACH, azMax = anchor.z + LEG_REACH;
      const ax = clamp(anchor.x * (1 + lateral * 0.4), axMin, axMax);
      const az = clamp(anchor.z + swing * LEG_REACH, azMin, azMax);
      // extensión REAL de la pata: distancia anclaje→pie
      const ext = Math.hypot(ax - anchor.x, az - anchor.z);

      // a coordenadas mundo
      const wx = spider.position.x + ax * cos - az * sin;
      const wz = spider.position.z + ax * sin + az * cos;

      if (lift > 0.3) {
        // pie en el AIRE: swing SUAVE hacia el objetivo (nada de teleport)
        leg.isMoving = true;
        leg.touchingGround = false;
        leg.motorSwing = { wx, wz };
      } else {
        // pie PLANTADO: tira hacia su objetivo → el suelo resiste →
        // el CUERPO es empujado (propulsión emergente)
        leg.isMoving = false;
        const dx = wx - leg.endEffector.x;
        const dz = wz - leg.endEffector.z;
        spider.velocity.x += dx * PUSH;
        spider.velocity.z += dz * PUSH;
        leg.endEffector.x += dx * FOOT_SLIP;
        leg.endEffector.z += dz * FOOT_SLIP;
        leg.touchingGround = true;
        leg.motorSwing = null;
      }
    }

    // ── 2) cuerpo: SOLO yaw. La altura la resuelve la física propia
    //    del juego: fractionOfLegsGrounded escala la aceleración de
    //    sustento (calcPreferredY) y la gravedad tira hacia abajo →
    //    levantar muchas patas = el cuerpo SE HUNDE solo.
    const yawT = m.length >= 27 ? clamp(m[26], -1, 1) : 0;
    spider.rotationalVelocity.y = clamp(spider.rotationalVelocity.y + yawT * 0.02, -0.15, 0.15);
    spider.isWalking = Math.hypot(spider.velocity.x, spider.velocity.z) > 0.02;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // sistema: tick de las arañas con IA remota MOTOR
  function setupRemoteAI(app) {
    app.onTick(() => {
      const p = sim.lastPlayerPos;
      const names = new Map();
      for (const s of sim.spiders) names.set(s.body, s.name);
      for (const [entity, spider, ai] of app.query('SpiderBody', 'RemoteAIBehaviour')) {
        void entity;
        // sin server → músculos relajados (fail-safe)
        if (!aiws.ready) { aiApplyMotors(spider, null); continue; }
        const rec = sim.spiders.find((r) => r.body === spider);
        const evo = rec ? rec.entity.components.get('EvolutionBehaviour') : null;

        // ── mecánica de mordida (combate real contra el jugador) ──
        const pDist = p ? spider.position.distance(p) : Infinity;
        if (p && pDist < 8) ai.fightTicks++;
        else {
          if (ai.fightTicks > 90) ai.postFight = 240;   // retirada lograda
          ai.fightTicks = 0;
        }
        if (p && pDist < 1.6 && ai.biteCd <= 0) {
          ai.bites++;
          ai.biteCd = 80;                       // 4s entre mordidas
          ai.preyHp = Math.max(0, ai.preyHp - 12);
          if (ai.preyHp <= 0) {
            ai.kills++;
            ai.preyHp = 60;                     // nueva presa
          }
          if (evo) evo.energy = Math.min(100, evo.energy + 18);
          emit({
            type: 'ai', event: 'bite',
            name: names.get(spider) || '?',
            at: [round3(spider.position.x), round3(spider.position.y), round3(spider.position.z)],
            bites: ai.bites, kills: ai.kills,
          });
        }
        if (ai.biteCd > 0) ai.biteCd--;
        if (ai.postFight > 0) ai.postFight--;

        // obs → server → 28 comandos → física
        const obs = aiObservation(spider, ai, evo);
        aiAct(obs, ai).then((motors) => {
          if (motors) { ai.motors = motors; aiApplyMotors(spider, motors); }
          else aiApplyMotors(spider, null);
        });
        ai.mindAge++;

        // tracking de viaje (para el fitness en vivo)
        if (ai.lastPos) {
          ai.travel += Math.hypot(
            spider.position.x - ai.lastPos.x,
            spider.position.z - ai.lastPos.z,
          );
        }
        ai.lastPos = { x: spider.position.x, z: spider.position.z };
        void p; void names;
      }
    });
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
    const delta = mulInto(new Quat(), softenedTarget, inv);
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
      vecMoveTowardsV(spider.velocity, target, acceleration);
      spider.isWalking = targetVelocity.x !== 0.0 && targetVelocity.z !== 0.0;
    } else {
      target.y = spider.velocity.y;
      vecMoveTowardsV(spider.velocity, target, acceleration);
      spider.isWalking = spider.velocity.x !== 0.0 && spider.velocity.z !== 0.0;
    }

    if (stunned && targetVelocity.isZero()) spider.isWalking = false;
  }

  function vecMoveTowardsV(v, target, speed) {
    const dx = target.x - v.x, dy = target.y - v.y, dz = target.z - v.z;
    const d = Math.hypot(dx, dy, dz);
    if (d <= speed) { v.copy(target); return v; }
    const f = speed / d;
    v.x += dx * f; v.y += dy * f; v.z += dz * f;
    return v;
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

  class ECS {
    constructor() {
      this.entities = [];
      this.tickSystems = [];
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

  // Paso de pathfinding compartido: gestiona waypoints/línea recta/A*/atasco
  // sobre los campos runtime del behaviour (waypoints, wp, pathGoal,
  // straightOk…). Devuelve la dirección horizontal normalizada hacia el
  // siguiente punto, o null si no hay avance posible.
  function pathfindStep(spider, behaviour, target, pfOpts, now) {
    const bodyH = spider.lerpedGait().bodyHeight;

    let wpPos = null;
    if (behaviour.waypoints && behaviour.wp < behaviour.waypoints.length) {
      const cur = behaviour.waypoints[behaviour.wp];
      if (Math.hypot(cur.x - spider.position.x, cur.z - spider.position.z) <= Math.max(1.2, bodyH * 0.25)) {
        behaviour.wp++;
      }
      wpPos = behaviour.waypoints[behaviour.wp] ?? null;
    }

    // atasco: quiere caminar pero casi no avanza → invalidar ruta y forzar A*
    const speed = Math.hypot(spider.velocity.x, spider.velocity.z);
    behaviour.stuckMs = speed < spider.gait.maxSpeed * 0.25 ? behaviour.stuckMs + TICK_MS : 0;
    if (behaviour.stuckMs > 2500) {
      behaviour.stuckMs = 0;
      behaviour.waypoints = null;
      behaviour.pathGoal = null;
      behaviour.straightUntil = 0;
      behaviour.nextCompute = 0;
      LOG.d('path: atasco detectado → re-ruta');
    }

    const goalMoved = !behaviour.pathGoal
      || Math.hypot(target.x - behaviour.pathGoal.x, target.z - behaviour.pathGoal.z) > 6;
    if (goalMoved && behaviour.waypoints) {
      behaviour.waypoints = null; // la meta se alejó de la ruta → re-calcular
      wpPos = null;
    }

    // ¿línea recta viable? (cache 1 s)
    if (now >= behaviour.straightUntil) {
      behaviour.straightUntil = now + 1000;
      behaviour.straightOk = lineWalkable(
        sim.world, spider.position.x, spider.position.y, spider.position.z, target.x, target.z, pfOpts
      );
    }

    // calcular ruta si no hay waypoints y la recta está bloqueada
    if (!wpPos && !behaviour.straightOk && now >= behaviour.nextCompute) {
      behaviour.nextCompute = now + 1500;
      const path = findPath(sim.world, spider.position, target, pfOpts);
      if (path && path.waypoints.length > 1) {
        behaviour.waypoints = path.waypoints;
        behaviour.wp = 1; // 0 = celda de arranque
        behaviour.pathGoal = target.clone();
        wpPos = behaviour.waypoints[behaviour.wp];
        LOG.d('path:', 'A*', path.waypoints.length, 'waypoints, reached=', path.reached);
      } else {
        behaviour.pathGoal = target.clone(); // evita recomputar cada tick
      }
    }

    // dirección de marcha: waypoint activo, o directo al objetivo (fallback
    // mientras expira el rate-limit del A* — la física de patas sigue empujando)
    const steer = wpPos ?? target;
    const dir = new Vec(steer.x - spider.position.x, 0, steer.z - spider.position.z);
    const len = Math.hypot(dir.x, dir.z);
    if (len < 1e-6) return null;
    dir.x /= len; dir.z /= len;
    return dir;
  }

  function setupBehaviours(app) {
    // StayStill
    app.onTick(() => {
      for (const [entity, spider] of app.query('SpiderBody', 'StayStillBehaviour')) {
        void entity;
        walkAt(spider, new Vec(0, 0, 0));
        rotateTowards(spider, spider.forwardDirection().clone().setY(0));
      }
    });

    // Target
    app.onTick(() => {
      for (const [entity, spider, behaviour] of app.query('SpiderBody', 'TargetBehaviour')) {
        void entity;
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

    // Direction
    app.onTick(() => {
      for (const [entity, spider, behaviour] of app.query('SpiderBody', 'DirectionBehaviour')) {
        void entity;
        rotateTowards(spider, behaviour.targetDirection);
        walkAt(spider, behaviour.walkDirection.clone().mul(spider.gait.maxSpeed));
      }
    });

    // Pathfind: objetivo fijo (goto) o vivo (follow). En terreno abierto camina
    // directo (línea recta verificada 1×/s); si está bloqueada, el objetivo se
    // movió de la meta de la ruta, o la araña se atasca → A* (rate-limited).
    app.onTick(() => {
      const p = sim.lastPlayerPos;
      const now = sim.tickCount * TICK_MS;
      for (const [entity, spider, behaviour] of app.query('SpiderBody', 'PathfindBehaviour')) {
        void entity;
        const target = behaviour.followPlayer
          ? (p ? new Vec(p.x, p.y, p.z) : null)
          : behaviour.target;
        if (!target) { walkAt(spider, new Vec(0, 0, 0)); continue; }

        if (Math.hypot(target.x - spider.position.x, target.z - spider.position.z) <= behaviour.distance) {
          walkAt(spider, new Vec(0, 0, 0));
          behaviour.waypoints = null;
          behaviour.pathGoal = null;
          continue;
        }

        const bodyH = spider.lerpedGait().bodyHeight;
        const pfOpts = {
          clearance: Math.max(2, Math.round(bodyH)),
          maxStep: 1 + bodyH * 0.4, // gigantes saltan escalones más altos
        };
        const dir = pathfindStep(spider, behaviour, target, pfOpts, now);
        if (!dir) { walkAt(spider, new Vec(0, 0, 0)); continue; }
        rotateTowards(spider, dir.clone());
        walkAt(spider, dir.mul(spider.gait.maxSpeed));
      }
    });

    // Hunt: IA de caza — acecho (con pathfinding) → rodeo orbital → emboscada
    // (windup) → salto con MORDISCO → retirada. Radios y saltos escalan con el
    // tamaño; `aggression` acelera los ciclos. Cada mordisco emite un evento
    // 'hunt' que el renderer convierte en mensaje de chat.
    app.onTick(() => {
      const p = sim.lastPlayerPos;
      const now = sim.tickCount * TICK_MS;
      const names = new Map();
      for (const s of sim.spiders) names.set(s.body, s.name);
      for (const [entity, spider, hunt] of app.query('SpiderBody', 'HuntBehaviour')) {
        void entity;
        if (!p) { walkAt(spider, new Vec(0, 0, 0)); continue; }
        const target = new Vec(p.x, p.y, p.z);
        const bodyH = spider.lerpedGait().bodyHeight;
        const pfOpts = { clearance: Math.max(2, Math.round(bodyH)), maxStep: 1 + bodyH * 0.4 };
        const dx = target.x - spider.position.x;
        const dz = target.z - spider.position.z;
        const d = Math.hypot(dx, dz);
        const ux = d > 1e-6 ? dx / d : 0;
        const uz = d > 1e-6 ? dz / d : 1;
        const circleR = 2.5 + bodyH * 1.5;
        const biteR = Math.max(1.6, bodyH * 0.9);
        hunt.stateT += TICK_MS;

        if (hunt.state === 'stalk') {
          const dir = pathfindStep(spider, hunt, target, pfOpts, now);
          if (dir) {
            rotateTowards(spider, dir.clone());
            walkAt(spider, dir.mul(spider.gait.maxSpeed * 0.8)); // acecho sigiloso
          } else walkAt(spider, new Vec(0, 0, 0));
          if (d < circleR) {
            hunt.state = 'circle';
            hunt.stateT = 0;
            hunt.circleT = (1200 + Math.random() * 2200) / hunt.aggression;
            hunt.circleDir = Math.random() < 0.5 ? 1 : -1;
          }
        } else if (hunt.state === 'circle') {
          if (d > circleR * 2.5 || d > hunt.range * 1.5) { hunt.state = 'stalk'; hunt.stateT = 0; continue; }
          // tangente + corrección radial para orbitar a circleR
          let mx = -uz * hunt.circleDir + ux * ((d - circleR) / circleR) * 1.5;
          let mz = ux * hunt.circleDir + uz * ((d - circleR) / circleR) * 1.5;
          const ml = Math.hypot(mx, mz) || 1;
          rotateTowards(spider, new Vec(ux, 0, uz)); // siempre mirando a la presa
          walkAt(spider, new Vec(mx / ml, 0, mz / ml).mul(spider.gait.maxSpeed * 0.55));
          if (hunt.stateT > hunt.circleT) { hunt.state = 'windup'; hunt.stateT = 0; }
        } else if (hunt.state === 'windup') {
          walkAt(spider, new Vec(0, 0, 0)); // agazapada…
          rotateTowards(spider, new Vec(ux, 0, uz));
          if (hunt.stateT > 350) {
            hunt.state = 'pounce';
            hunt.stateT = 0;
            // embestida: impulso horizontal + salto escalado al cuerpo
            spider.velocity.x += ux * spider.gait.maxSpeed * 2.2;
            spider.velocity.z += uz * spider.gait.maxSpeed * 2.2;
            spider.velocity.y = Math.max(spider.velocity.y, bodyH * 1.4);
          }
        } else if (hunt.state === 'pounce') {
          walkAt(spider, new Vec(ux, 0, uz).mul(spider.gait.maxSpeed * 1.6));
          if (d < biteR && now >= hunt.nextPounceOk) {
            hunt.bites++;
            hunt.nextPounceOk = now + (3500 + Math.random() * 2000) / hunt.aggression;
            emit({
              type: 'hunt', event: 'bite',
              name: names.get(spider) || '?',
              at: [round3(target.x), round3(target.y), round3(target.z)],
              bites: hunt.bites,
            });
            hunt.state = 'recover';
            hunt.stateT = 0;
          } else if (hunt.stateT > 1300) { // falló el salto
            hunt.state = 'recover';
            hunt.stateT = 0;
          }
        } else { // recover — retirada tras la mordida
          rotateTowards(spider, new Vec(ux, 0, uz));
          walkAt(spider, new Vec(-ux, 0, -uz).mul(spider.gait.maxSpeed * 0.45));
          if (hunt.stateT > 1600) {
            hunt.state = d > circleR * 2 ? 'stalk' : 'circle';
            hunt.stateT = 0;
            if (hunt.state === 'circle') hunt.circleT = (1200 + Math.random() * 2200) / hunt.aggression;
          }
        }
      }
    });

    // Puppet: espejo de arañas NATIVAS del server (/spider replace). La mesh
    // nativa se oculta cada tick (el render loop puede re-mostrarla) y el
    // cuerpo copia posición/yaw; la física de patas sigue el suelo sola.
    app.onTick(() => {
      if (!sim.replace.on) return;
      const map = sim.replace.map;
      for (const [entity, spider, puppet] of app.query('SpiderBody', 'PuppetBehaviour')) {
        void entity;
        const rec = sim.spiders.find((r) => r.entity === entity);
        const native = map?.get?.(puppet.entityId) ?? null;
        if (!native || !native.pos || !rec) {
          if (rec) despawnPuppetRecord(rec, 'araña server desapareció');
          continue;
        }
        rec.native = native; // refrescar (el mapa puede recrearse)
        if (native.mesh && native.mesh.visible !== false) {
          try { native.mesh.visible = false; } catch (_) {}
        }
        const dx = native.pos.x - spider.position.x;
        const dz = native.pos.z - spider.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.05) {
          // persecución proporcional con techo: pegada cuando está cerca
          const speed = Math.min(spider.gait.maxSpeed * 3, 1 + dist * 4);
          spider.velocity.x = dx / dist * speed;
          spider.velocity.z = dz / dist * speed;
        } else {
          spider.velocity.x = 0;
          spider.velocity.z = 0;
        }
        // altura: la y nativa es el CENTRO del hitbox → suelo = y - altura/2;
        // el cuerpo se FIJA a bodyHeight sobre ese suelo. Con gaits gigantes
        // la fuerza normal deriva (equilibrio en +66): el control por velocidad
        // realimenta ese resorte, así que imponemos la posición directamente y
        // anulamos vy (la gravedad de un tick es despreciable).
        const half = (Number(native.height) || 0.9) / 2;
        spider.position.y = native.pos.y - half + spider.lerpedGait().bodyHeight;
        spider.velocity.y = 0;
        spider.isWalking = dist > 0.2;
        const yaw = Number(native.yaw ?? native.bodyYaw ?? 0) || 0;
        rotateTowards(spider, new Vec(Math.sin(yaw), 0, Math.cos(yaw)));
      }
    });

    // Replace scan: cada 10 ticks (500 ms) descubre arañas nativas nuevas y
    // les crea un títere con el preset 'spider' a sim.replace.scale de alto.
    app.onTick(() => {
      if (!sim.replace.on || sim.tickCount % 10 !== 0) return;
      const map = resolveEntityMap(sim.world.game);
      if (!map) return;
      sim.replace.map = map;
      for (const native of map.values()) {
        if (entityTypeOf(native) !== 'spider') continue;
        const id = native.id ?? native.entityId ?? native.uuid;
        if (id === undefined || !native.pos) continue;
        const name = 'srv-' + id;
        if (sim.spiders.some((r) => r.name === name)) continue;
        const hit = sim.world.raycastGround(new Vec(native.pos.x, native.pos.y + 40, native.pos.z), DOWN_VECTOR(), 80);
        const y = (hit ? hit.y : native.pos.y) + 4;
        const spider = spawnSpider(name, 'spider', native.pos.x, y, native.pos.z, Number(native.yaw ?? 0) || 0, false, sim.replace.scale);
        const rec = sim.spiders[sim.spiders.length - 1];
        rec.puppet = true;
        rec.native = native;
        rec.entity.replace('PuppetBehaviour', new PuppetBehaviour(id));
        emit({ type: 'add', spider: serializeSpider(spider, name, 'spider') });
        LOG.i('replace: server', id, '→', name, 'altura', sim.replace.scale);
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

  // ══════════════════════════════════════════════════════════════════
  // runtime — server.js embebido (mismo protocolo de mensajes)
  // ══════════════════════════════════════════════════════════════════
  const TICK_MS = 50;
  const sim = {
    app: new ECS(),
    world: new LiveWorld(),
    spiders: [], // { entity, body, name, preset, puppet?, native? }
    lastPlayerPos: null,
    tickCount: 0,
    interval: 0,
    running: false,
    initialSpawnsDone: false, // arañas iniciales ya creadas (o suprimidas por clear)
    onMessage: null, // callback del renderer (SpiderBot) para add/remove/frame
    replace: { on: false, scale: 100, map: null }, // reemplazo de arañas del server
  };

  // ── resolución de entidades nativas (patrón TinyTakeover/MF_Morph) ──
  function isMapLike(v) {
    return !!v && typeof v.forEach === 'function' && typeof v.values === 'function' && v.size !== undefined;
  }

  function resolveEntityMap(game) {
    for (const candidate of [
      game?.world?.entitiesDump, game?.world?.entities, game?.world?.entityMap, game?.entityManager?.entities,
    ]) {
      if (!isMapLike(candidate) || candidate.size === 0) continue;
      for (const entity of candidate.values()) {
        if (entity && (entity.pos || entity.mesh || entity.id !== undefined)) return candidate;
      }
    }
    return null;
  }

  function entityTypeOf(entity) {
    if (typeof entity?.type === 'string' && entity.type) return entity.type.toLowerCase();
    if (typeof entity?.entityType === 'string' && entity.entityType) return entity.entityType.toLowerCase();
    return (entity?.constructor?.name || '').replace(/^Entity/, '').toLowerCase();
  }

  // quita un títere: restaura la mesh nativa y despawnea el espejo
  function despawnPuppetRecord(rec, reason) {
    try { if (rec.native?.mesh) rec.native.mesh.visible = true; } catch (_) {}
    rec.entity.remove();
    const i = sim.spiders.indexOf(rec);
    if (i >= 0) sim.spiders.splice(i, 1);
    emit({ type: 'remove', name: rec.name });
    LOG.i('replace: fuera', rec.name, reason || '');
  }

  function replaceOff() {
    sim.replace.on = false;
    sim.replace.map = null;
    for (const rec of sim.spiders.filter((r) => r.puppet)) {
      try { if (rec.native?.mesh) rec.native.mesh.visible = true; } catch (_) {}
      rec.entity.remove();
      emit({ type: 'remove', name: rec.name });
    }
    sim.spiders = sim.spiders.filter((r) => !r.puppet);
    LOG.i('replace OFF');
  }

  // Multiplicador global de estilización: patas LARGAS y DELGADAS en todos
  // los presets. sl escala la longitud de cada segmento (más alcance) y el
  // renderer usa grosores menores (SpiderBot.legThickness), manteniendo las
  // proporciones de cada preset pero con silueta de araña patilarga.
  const LEG_STYLE = { length: 1.6, width: 0.6 };

  function spawnSpider(name, preset, x, y, z, yaw, gallop, scale) {
    // sin forzar (4,1.0): cada preset usa sus segmentos de diseño.
    // 'spider' = 2 segmentos (fémur+tibia) — coincide con el renderer,
    // que dibuja TODOS los segmentos (antes solo dibujaba 2 de 4 y la
    // mitad inferior de la pata —la que toca el suelo— no se veía).
    const bodyPlan = PRESETS[preset]();
    // /spider spawn <preset> scale <altura> — altura del CUERPO en bloques
    // (1..200). Se re-escala todo el plan proporcionalmente (makeGiant);
    // la altura natural del preset (kraken=5, resto=1.1) da el factor.
    if (Number.isFinite(scale)) {
      const natural = bodyPlan.gaitTuning?.stationary?.bodyHeight ?? 1.1;
      const target = Math.max(1, Math.min(200, scale));
      makeGiant(bodyPlan, target / natural);
      LOG.i('scale: altura objetivo', target, '(natural', natural.toFixed(2) + ')');
    }
    // patas largas y delgadas: estirar segmentos de todos los presets
    for (const leg of bodyPlan.legs) {
      for (const seg of leg.segments) seg.length *= LEG_STYLE.length;
      leg.restPosition.mul(LEG_STYLE.length);
    }
    const walkGait = Gait.defaultWalk();
    const gallopGait = Gait.defaultGallop();
    // ajustes de gait por preset (p.ej. kraken: bodyHeight 5, normal legacy)
    const tuning = bodyPlan.gaitTuning;
    if (tuning) {
      for (const g of [walkGait, gallopGait]) {
        if (tuning.stationary) Object.assign(g.stationary, tuning.stationary);
        if (tuning.moving) Object.assign(g.moving, tuning.moving);
        if (tuning.gait) Object.assign(g, tuning.gait);
      }
    }
    const spider = SpiderBody.fromLocation(x, y, z, yaw, sim.world, bodyPlan, walkGait, gallopGait, name, gallop);
    const entity = sim.app.spawn({ SpiderBody: spider });
    // Inicializar patas YA (update() asigna this.legs = bodyPlan.legs → Leg[]).
    // Si no lo hacemos, serializeSpider() usa bodyPlan.legs (LegPlan[]) en vez
    // de Leg[] y legs.length aparece 0 en el log, aunque la información que se
    // envía al renderer sigue siendo correcta.
    if (spider.legs.length === 0 && spider.bodyPlan && spider.bodyPlan.legs.length) {
      try { spider.update(); } catch (_) {}
    }
    sim.spiders.push({ entity, body: spider, name, preset, gallop });
    LOG.i('spawn:', name, preset, { pos: [x, y, z], yaw, gallop, legs: spider.legs.length || spider.bodyPlan.legs.length });
    return spider;
  }

  function serializeSpider(spider, name, preset) {
    return {
      name, preset,
      gallop: spider.gallop,
      bodyModel: spider.bodyPlan.bodyModel,
      scale: spider.bodyPlan.scale,
      legs: spider.bodyPlan.legs.map((l) => ({
        attachment: [l.attachmentPosition.x, l.attachmentPosition.y, l.attachmentPosition.z],
        segments: l.segments.map((s) => s.length),
      })),
    };
  }

  function round3(v) { return Math.round(v * 1000) / 1000; }

  // escala del torso por preset (SpiderTorsoModels.kt apply{})
  const TORSO_SCALES = { flat: 0.8, boxy: 0.75, stealth: 0.8 };

  function quatToMatrix(q, scale) {
    const { x, y, z, w } = q;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const s = scale;
    const r00 = (1 - (yy + zz)) * s, r11 = (1 - (xx + zz)) * s, r22 = (1 - (xx + yy)) * s;
    const r01 = (xy - wz) * s, r02 = (xz + wy) * s;
    const r10 = (xy + wz) * s, r12 = (yz - wx) * s;
    const r20 = (xz - wy) * s, r21 = (yz + wx) * s;
    return [r00, r10, r20, 0, r01, r11, r21, 0, r02, r12, r22, 0, 0, 0, 0, 1];
  }

  function serializePose(spider, name) {
    const legs = [];
    const pivot = PIVOT_MODES[spider.gait.legChainPivotMode](spider);
    for (const leg of spider.legs) {
      const rotations = leg.chain.getRotations(pivot).map((r) => [round3(r.x), round3(r.y), round3(r.z), round3(r.w)]);
      legs.push({
        att: [round3(leg.attachmentPosition.x), round3(leg.attachmentPosition.y), round3(leg.attachmentPosition.z)],
        joints: leg.chain.segments.map((s) => [round3(s.position.x), round3(s.position.y), round3(s.position.z)]),
        rot: rotations,
      });
    }
    const o = spider.orientation;
    return {
      n: name ?? spider.name,
      p: [round3(spider.position.x), round3(spider.position.y), round3(spider.position.z)],
      q: [round3(o.x), round3(o.y), round3(o.z), round3(o.w)],
      torso: { m: quatToMatrix(o, TORSO_SCALES[spider.bodyPlan.bodyModel] ?? 1) },
      legs,
    };
  }

  function emit(msg) {
    LOG.v('emit →', msg.type, msg.spider?.name ?? (msg.poses ? msg.poses.length + ' poses' : ''));
    try { sim.onMessage?.(msg); } catch (e) { LOG.i('ERROR: onMessage lanzó:', e?.message || e); }
  }

  async function handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    LOG.d('msg ←', msg.type, msg.name ?? '');
    if (msg.type === 'hello') {
      for (const s of sim.spiders) emit({ type: 'add', spider: serializeSpider(s.body, s.name, s.preset) });
    } else if (msg.type === 'player') {
      if (Number.isFinite(msg.x) && Number.isFinite(msg.y) && Number.isFinite(msg.z)) {
        sim.lastPlayerPos = { x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw || 0, t: Date.now() };
      }
    } else if (msg.type === 'spawn') {
      const preset = PRESETS[msg.preset] ? msg.preset : 'hexbot';
      let x = msg.x, y = msg.y, z = msg.z, yaw = msg.yaw || 0;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        const p = sim.lastPlayerPos;
        if (p && !(p.x === 0 && p.y === 0 && p.z === 0)) {
          const side = (Math.random() < 0.5 ? 1 : -1) * (2 + Math.random() * 2);
          const yawRad = p.yaw || 0;
          x = p.x + Math.cos(yawRad) * side;
          z = p.z - Math.sin(yawRad) * side;
          yaw = yawRad + Math.PI;
          const hit = sim.world.raycastGround(new Vec(x, p.y + 30, z), DOWN_VECTOR(), 60);
          y = (hit ? hit.y : p.y) + 2;
        } else {
          return; // sin posición conocida del jugador ni coordenadas: no spawn
        }
      }
      const name = msg.name || ('spider' + (sim.spiders.length + 1));
      const spider = spawnSpider(name, preset, x, y, z, yaw, !!msg.gallop, Number(msg.scale));
      emit({ type: 'add', spider: serializeSpider(spider, name, preset) });
    } else if (msg.type === 'target') {
      const laser = new Vec(msg.x, msg.y, msg.z);
      let best = null, bestD = Infinity;
      for (const s of sim.spiders) {
        const d = s.body.position.distanceSquared(laser);
        if (d < bestD) { best = s; bestD = d; }
      }
      if (best) {
        best.entity.replace('TargetBehaviour', new TargetBehaviour(laser.clone(), best.body.walkGait.stationary.bodyHeight * 2));
        LOG.i('target:', { at: [msg.x, msg.y, msg.z], spider: best.name, dist: Math.sqrt(bestD) });
      }
    } else if (msg.type === 'staystill') {
      LOG.i('staystill (todas)');
      for (const s of sim.spiders) s.entity.replace('StayStillBehaviour', new StayStillBehaviour());
    } else if (msg.type === 'follow') {
      // /spider follow [dist] | /spider follow off — con pathfinding A*
      if (!sim.spiders.length) { LOG.i('follow: no hay arañas'); return; }
      const off = (msg.off === true) || String(msg.off ?? '').toLowerCase() === 'off' || String(msg.off ?? '').toLowerCase() === 'false';
      if (off) {
        for (const s of sim.spiders) s.entity.components.delete('PathfindBehaviour');
        LOG.i('follow OFF');
        return;
      }
      const dist = Number(msg.distance);
      const behaviour = new PathfindBehaviour({
        followPlayer: true,
        distance: Number.isFinite(dist) && dist > 0 ? dist : 3,
      });
      for (const s of sim.spiders) {
        s.entity.components.delete('TargetBehaviour');
        s.entity.components.delete('StayStillBehaviour');
        s.entity.components.delete('HuntBehaviour');
        s.entity.replace('PathfindBehaviour', behaviour);
      }
      LOG.i('follow ON (A*), distancia', behaviour.distance);
    } else if (msg.type === 'goto') {
      // /spider goto <x> [y] <z> | /spider goto off — A* a coordenadas fijas
      if (!sim.spiders.length) { LOG.i('goto: no hay arañas'); return; }
      const off = (msg.off === true) || String(msg.off ?? '').toLowerCase() === 'off';
      if (off) {
        for (const s of sim.spiders) s.entity.components.delete('PathfindBehaviour');
        LOG.i('goto OFF');
        return;
      }
      const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) { LOG.i('goto: uso goto <x> [y] <z>'); return; }
      for (const s of sim.spiders) {
        const hintY = Number.isFinite(y) ? y : s.body.position.y;
        s.entity.components.delete('TargetBehaviour');
        s.entity.components.delete('StayStillBehaviour');
        s.entity.components.delete('HuntBehaviour');
        s.entity.replace('PathfindBehaviour', new PathfindBehaviour({
          distance: 2,
          target: new Vec(x, hintY, z),
        }));
      }
      LOG.i('goto', [x, Number.isFinite(y) ? y : 'auto', z]);
    } else if (msg.type === 'hunt') {
      // /spider hunt [range] [aggression] | /spider hunt off — IA de caza
      if (!sim.spiders.length) { LOG.i('hunt: no hay arañas'); return; }
      const off = (msg.off === true) || String(msg.off ?? '').toLowerCase() === 'off' || String(msg.off ?? '').toLowerCase() === 'false';
      if (off) {
        for (const s of sim.spiders) s.entity.components.delete('HuntBehaviour');
        LOG.i('hunt OFF');
        return;
      }
      const range = Number(msg.range);
      const aggression = Number(msg.aggression);
      const opts = {
        range: Number.isFinite(range) && range > 0 ? range : 48,
        aggression: Number.isFinite(aggression) && aggression > 0 ? Math.min(5, aggression) : 1,
      };
      for (const s of sim.spiders) {
        s.entity.components.delete('TargetBehaviour');
        s.entity.components.delete('StayStillBehaviour');
        s.entity.components.delete('PathfindBehaviour');
        // instancia POR araña: la máquina de estados es estado individual
        s.entity.replace('HuntBehaviour', new HuntBehaviour(opts));
      }
      LOG.i('hunt ON', opts);
    } else if (msg.type === 'evolve') {
      // /spider evolve [n] | evolve off — IA evolutiva con selección natural
      const off = (msg.off === true) || String(msg.off ?? '').toLowerCase() === 'off';
      if (off) {
        for (const s of [...sim.spiders]) {
          // las arañas con IA remota conservan su economía (energía/comida)
          if (s.entity.has('RemoteAIBehaviour')) continue;
          s.entity.components.delete('EvolutionBehaviour');
        }
        // la economía sigue viva mientras queden arañas que la usen
        evoActive = sim.spiders.some((s) => s.entity.has('EvolutionBehaviour'));
        if (!evoActive) evoFood.items.length = 0;
        LOG.i('evolve OFF');
        emit({ type: 'evo', event: 'off' });
        return;
      }
      const n = Number(msg.count);
      const count = Number.isFinite(n) && n > 0 ? Math.min(24, Math.round(n)) : 6;
      // población inicial: genomas aleatorios (generación 0)
      const p = sim.lastPlayerPos;
      if (!p || (p.x === 0 && p.y === 0 && p.z === 0)) {
        LOG.i('evolve: esperando posición del jugador…');
        return;
      }
      // limpiar modos incompatibles de las arañas existentes
      for (const s of sim.spiders) {
        s.entity.components.delete('TargetBehaviour');
        s.entity.components.delete('StayStillBehaviour');
        s.entity.components.delete('PathfindBehaviour');
        s.entity.components.delete('HuntBehaviour');
      }
      let spawned = 0;
      const firstNames = [];
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        const rad = 4 + Math.random() * 3;
        const x = p.x + Math.cos(ang) * rad;
        const z = p.z + Math.sin(ang) * rad;
        const hit = sim.world.raycastGround(new Vec(x, p.y + 20, z), DOWN_VECTOR(), 40);
        const y = (hit ? hit.y : p.y) + 2;
        const genome = new Genome();
        const name = 'evo-0-' + (sim.spiders.length + 1);
        const spider = spawnSpiderGenome(name, x, y, z, ang, genome);
        const rec = sim.spiders[sim.spiders.length - 1];
        if (rec?.body === spider) {
          rec.entity.replace('EvolutionBehaviour', new EvolutionBehaviour(genome));
          firstNames.push(name);
          spawned++;
        }
      }
      // limpiar arañas NO evolutivas sobrantes (las garden iniciales)
      for (const s of [...sim.spiders]) {
        if (!s.entity.has('EvolutionBehaviour')) {
          const idx = sim.spiders.indexOf(s);
          if (idx >= 0) sim.spiders.splice(idx, 1);
          s.entity.remove();
          emit({ type: 'remove', name: s.name });
        }
      }
      evoActive = true;
      evoStats = { births: 0, deaths: 0, generation: 0, bestFitness: 0, ticks: 0 };
      LOG.i('evolve ON:', spawned, 'arañas gen-0 (selección natural activa)');
      emit({ type: 'evo', event: 'on', count: spawned });
    } else if (msg.type === 'ai') {
      // /spider ai [url|off] — IA remota (deep learning via ai/server.py)
      if (msg.off === true) {
        // quitar behaviour + liberar los músculos de las arañas
        let removed = 0;
        for (const s of sim.spiders) {
          const ai = s.entity.components.get('RemoteAIBehaviour');
          if (ai) { aiSendReset(ai); s.body.motorControlled = false; }
          if (s.entity.components.delete('RemoteAIBehaviour')) removed++;
        }
        // la economía evolutiva sigue viva solo si quedan arañas evo
        evoActive = sim.spiders.some((s) => s.entity.has('EvolutionBehaviour'));
        aiDisconnect();
        LOG.i('IA motor OFF:', removed, 'arañas liberadas (gait normal restaurado)');
        return { ok: true, removed };
      }
      const url = typeof msg.url === 'string' && msg.url
        ? msg.url
        : 'ws://127.0.0.1:8766/ws';
      const n = Number(msg.count);
      const count = Number.isFinite(n) && n > 0 ? Math.min(12, Math.round(n)) : 3;
      const p = sim.lastPlayerPos;
      if (!p || (p.x === 0 && p.y === 0 && p.z === 0)) {
        return { ok: false, error: 'espera a estar en el mundo (sin posición del jugador)' };
      }
      const connected = await aiConnect(url);
      if (!connected) {
        return { ok: false, error: `no se pudo conectar a ${url} — ¿está corriendo ai/server.py?` };
      }
      // población: genomas ALEATORIOS (fenotipos variados para que la IA
      // explore capacidades distintas) o reutilizar las evo existentes
      let spawned = 0;
      const useExisting = msg.useExisting === true;
      if (useExisting) {
        for (const s of sim.spiders) {
          if (s.entity.has('EvolutionBehaviour')) {
            s.body.motorControlled = true;
            s.entity.replace('RemoteAIBehaviour', new RemoteAIBehaviour());
            spawned++;
          }
        }
        if (spawned) evoActive = true; // comida + metabolismo activos
      }
      for (let i = spawned; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        const rad = 4 + Math.random() * 3;
        const x = p.x + Math.cos(ang) * rad;
        const z = p.z + Math.sin(ang) * rad;
        const hit = sim.world.raycastGround(new Vec(x, p.y + 20, z), DOWN_VECTOR(), 40);
        const y = (hit ? hit.y : p.y) + 2;
        const genome = new Genome();
        const name = 'ai-' + (sim.spiders.length + 1);
        const spider = spawnSpiderGenome(name, x, y, z, ang, genome);
        const rec = sim.spiders[sim.spiders.length - 1];
        if (rec?.body === spider) {
          // cuerpo controlado MÚSCULO a MÚSCULO: el gait preprogramado
          // queda desactivado; la economía (energía/comida/muerte) sigue
          spider.motorControlled = true;
          evoActive = true;
          rec.entity.replace('EvolutionBehaviour', new EvolutionBehaviour(genome));
          rec.entity.replace('RemoteAIBehaviour', new RemoteAIBehaviour());
          spawned++;
        }
      }
      evoStats = { births: 0, deaths: 0, generation: 0, bestFitness: 0, ticks: 0 };
      // amenazas activas por defecto: la IA aprende a huir
      if (msg.noPredators !== true) { predators.on = true; predators.kills = 0; }
      LOG.i('AI remota ON:', spawned, 'arañas controladas por el DQN en', url,
        predators.on ? `(+${predators.count} depredadores)` : '(sin amenazas)');
      return { ok: true, count: spawned, url, backend: aiws.stats.backend, predators: predators.on ? predators.count : 0 };
    } else if (msg.type === 'predators') {
      // /spider predators [n] | off — amenazas que cazan arañas
      if (msg.off === true) {
        predators.on = false;
        predators.items.length = 0;
        LOG.i('depredadores OFF');
        return { ok: true, kills: predators.kills };
      }
      const n = Number(msg.count);
      predators.count = Number.isFinite(n) && n > 0 ? Math.min(8, Math.round(n)) : 2;
      predators.on = true;
      LOG.i('depredadores ON:', predators.count, '(patrullan y cazan arañas)');
      return { ok: true, count: predators.count, kills: predators.kills };
    } else if (msg.type === 'aistats') {
      // estado del cerebro motor + qué músculo está usando cada araña
      const minds = [];
      for (const s of sim.spiders) {
        const ai = s.entity.components.get('RemoteAIBehaviour');
        if (ai) {
          const m = ai.motors;
          minds.push({
            name: s.name,
            sid: ai.sid ?? null,
            age: ai.mindAge,
            travel: round3(ai.travel),
            bites: ai.bites,
            kills: ai.kills,
            fight: ai.fightTicks,
            // resumen de actividad muscular: media |swing| de las 8 patas
            legs: m && m.length >= 24
              ? round3(m.slice(0, 24).filter((_, i) => i % 3 === 0).reduce((a, b) => a + Math.abs(b), 0) / 8)
              : null,
            lift: m && m.length >= 24
              ? round3(m.slice(0, 24).filter((_, i) => i % 3 === 2).reduce((a, b) => a + Math.abs(b), 0) / 8)
              : null,
          });
        }
      }
      return { ok: true, conn: { ...aiws.stats }, minds, evolve: evoActive ? evoStats : null };
    } else if (msg.type === 'evostats') {
      // /spider stats — tabla de la población viva (ordenada por fitness)
      const rows = [];
      for (const s of sim.spiders) {
        const evo = s.entity.components.get('EvolutionBehaviour');
        if (!evo) continue;
        rows.push({
          name: s.name,
          gen: evo.genome.generation,
          energy: round3(evo.energy),
          stamina: round3(evo.stamina / Math.max(0.001, evo.maxStamina)), // 0..1
          tired: evo.stamina < evo.maxStamina * 0.15,
          age: evo.age,
          food: evo.foodEaten,
          bites: evo.bites,
          children: evo.children,
          fitness: round3(evoFitness(evo)),
          genes: Object.fromEntries(Genome.GENE_LIST.map((k) => [k, round3(evo.genome.genes[k])])),
        });
      }
      rows.sort((a, b) => b.fitness - a.fitness);
      return { ok: true, active: evoActive, stats: evoStats, population: rows };
    } else if (msg.type === 'replace') {
      // /spider replace [scale] | off — arañas del server → preset 'spider'
      const off = (msg.off === true) || String(msg.off ?? '').toLowerCase() === 'off';
      if (off) { replaceOff(); return; }
      const scale = Number(msg.scale);
      sim.replace = {
        on: true,
        scale: Number.isFinite(scale) && scale > 0 ? Math.min(200, scale) : 100,
        map: null,
      };
      LOG.i('replace ON: arañas server → spider, altura', sim.replace.scale);
    } else if (msg.type === 'tphere') {
      const p = sim.lastPlayerPos;
      if (!p || !(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))) {
        LOG.i('tphere: sin posición del jugador');
        return;
      }
      let count = 0;
      for (const s of sim.spiders) {
        teleportSpiderExact(s, p.x, p.y, p.z);
        count++;
      }
      LOG.i('tphere:', count, 'arañas a', [p.x, p.y, p.z]);
    } else if (msg.type === 'despawn') {
      const idx = msg.name ? sim.spiders.findIndex((s) => s.name === msg.name) : 0;
      if (idx >= 0) {
        const [s] = sim.spiders.splice(idx, 1);
        s.entity.remove();
        LOG.i('despawn:', s.name);
        emit({ type: 'remove', name: s.name });
      }
    }
  }

  function teleportSpider(s, x, z) {
    const p = sim.lastPlayerPos;
    const hit = sim.world.raycastGround(new Vec(x, 130, z), DOWN_VECTOR(), 200);
    const y = (hit ? hit.y : (p?.y ?? 64)) + 2;
    LOG.i('teleport:', s.name, { to: [x, y, z], rayHit: !!hit });
    s.body.position.set(x, y, z);
    s.body.velocity.set(0, 0, 0);
    for (const leg of s.body.legs) {
      leg.chain.root.copy(leg.attachmentPosition);
      if (s.body.gait.straightenLegs) {
        const pivot = PIVOT_MODES[s.body.gait.legChainPivotMode](s.body);
        const pivotCopy = new Quat(pivot.x, pivot.y, pivot.z, pivot.w);
        const direction = leg.endEffector.clone().sub(leg.attachmentPosition);
        const rotation = KinematicChain.getRotationAroundAxis(direction, pivotCopy);
        rotation.x += s.body.gait.legStraightenRotation;
        const orientation = pivotCopy.rotateYXZ(rotation.y, rotation.x, 0.0);
        leg.chain.straightenDirection(orientation);
      }
      leg.chain.fabrik(leg.endEffector);
    }
  }

  function teleportSpiderExact(s, x, y, z) {
    LOG.i('tphere:', s.name, { to: [x, y, z] });
    s.body.position.set(x, y, z);
    s.body.velocity.set(0, 0, 0);
    for (const leg of s.body.legs) {
      leg.attachmentPosition = leg.legPlan.attachmentPosition.clone()
        .rotate(s.body.orientation).add(s.body.position);
      const lerpedGait = s.body.lerpedGait();
      const scanOrientation = PIVOT_MODES[s.body.gait.scanPivotMode](s.body);
      const upVector = UP_VECTOR().rotate(scanOrientation);
      leg.restPosition = leg.legPlan.restPosition.clone()
        .add(upVector.clone().mul(-lerpedGait.bodyHeight))
        .rotate(scanOrientation).add(s.body.position);
      leg.endEffector.copy(leg.restPosition);
      leg.previousEndEffector.copy(leg.endEffector);
      const ground = leg.locateGroundTarget();
      leg.groundTarget = ground;
      leg.target = ground || leg.strandedTarget();
      leg.stepStart = leg.endEffector.clone();
      leg.stepProgress = 0.0;
      leg.touchingGround = false;
      leg.isMoving = false;
      leg.timeSinceBeginMove = 0;
      leg.timeSinceStopMove = 0;
      leg.chain.root.copy(leg.attachmentPosition);
      if (s.body.gait.straightenLegs) {
        const pivot = PIVOT_MODES[s.body.gait.legChainPivotMode](s.body);
        const pivotCopy = new Quat(pivot.x, pivot.y, pivot.z, pivot.w);
        const direction = leg.endEffector.clone().sub(leg.attachmentPosition);
        const rotation = KinematicChain.getRotationAroundAxis(direction, pivotCopy);
        rotation.x += s.body.gait.legStraightenRotation;
        const orientation = pivotCopy.rotateYXZ(rotation.y, rotation.x, 0.0);
        leg.chain.straightenDirection(orientation);
      }
      leg.chain.fabrik(leg.endEffector);
    }
  }

  function anchorSpidersToPlayer() {
    const p = sim.lastPlayerPos;
    for (const s of sim.spiders) {
      if (s.puppet) continue; // los títeres siguen a su araña server, no al jugador
      const b = s.body;
      // altura de reposo del gigante (p.ej. giant_kraken flota a 10): colocar
      // el cuerpo a groundY + bodyHeight para que no caiga durante el re-asentado
      const yFor = (spider, z) => {
        const hit = sim.world.raycastGround(new Vec(p.x + 2, 130, z), DOWN_VECTOR(), 200);
        const groundY = hit ? hit.y : p.y;
        return groundY + spider.body.lerpedGait().bodyHeight + 1;
      };
      const far = !Number.isFinite(b.position.x) || !Number.isFinite(b.position.y) || !Number.isFinite(b.position.z)
        || b.position.distance(new Vec(p.x, p.y, p.z)) > 64;
      // teleportSpiderExact (no teleportSpider): resetea TODO el estado de
      // las patas (end effector, ground target, progreso de paso). Si solo se
      // mueve el cuerpo, los end effectors quedan a decenas de bloques y las
      // patas tardan ~15 s en re-alcanzarlos — sin apoyo, el cuerpo cae al
      // suelo y ya no se levanta.
      if (far) teleportSpiderExact(s, p.x + 2, yFor(s, p.z), p.z);
    }
  }

  function setupDefaultBehaviourTick() {
    for (const [entity] of sim.app.query('SpiderBody')) {
      if (!entity.has('TargetBehaviour') && !entity.has('StayStillBehaviour') && !entity.has('PathfindBehaviour')
        && !entity.has('HuntBehaviour') && !entity.has('PuppetBehaviour') && !entity.has('EvolutionBehaviour')) {
        entity.add('StayStillBehaviour', new StayStillBehaviour());
      }
    }
  }

  function tick() {
    const t0 = performance.now();
    try {
      // anclaje: araña >64 bloques del jugador (o NaN) → teleport al lado
      const p = sim.lastPlayerPos;
      if (p && !(p.x === 0 && p.y === 0 && p.z === 0)) anchorSpidersToPlayer();

      // limpiar caché de bloques por tick (el mundo vivo cambia: agua, bloques…)
      sim.world.clearCache();

      // sistemas ECS (behaviours → cuerpo, mismo orden que setupSpider.kt)
      sim.app.update();
      setupDefaultBehaviourTick();
      sim.tickCount++;

      // frame de poses (20 Hz)
      if (sim.spiders.length) {
        const poses = [];
        for (const s of sim.spiders) poses.push(serializePose(s.body, s.name));
        emit({ type: 'frame', t: sim.tickCount, poses });
      }

      // foto de estado cada 5s (nivel 2) — pos, velocidad, patas, física
      if (LOG.level >= 2 && sim.tickCount % 100 === 0) {
        for (const s of sim.spiders) {
          const b = s.body;
          LOG.d('foto:', s.name, {
            pos: [b.position.x, b.position.y, b.position.z],
            vel: [b.velocity.x, b.velocity.y, b.velocity.z],
            onGround: b.onGround,
            walking: b.isWalking,
            steps: b.stepCount,
            legsGrounded: b.legs.filter((l) => l.isGrounded()).length + '/' + b.legs.length,
            legsMoving: b.legs.filter((l) => l.isMoving).length,
            stranded: b.legs.filter((l) => !l.target?.isGrounded).length,
          });
        }
        const st = sim.world.stats;
        LOG.d('world:', st, 'cache:', sim.world.blockCache.size);
        Object.keys(st).forEach((k) => { st[k] = 0; }); // reset por ventana
      }
    } catch (e) {
      console.warn(TAG, 'tick error (recuperado)', e);
      LOG.i('ERROR tick:', e?.message || e, '\n' + String(e?.stack || '').split('\n').slice(0, 4).join('\n'));
    }
    sim.tickMs = sim.tickMs ? sim.tickMs * 0.9 + (performance.now() - t0) * 0.1 : (performance.now() - t0);
  }

  // resolución robusta del singleton del juego (misma técnica que SpiderBot)
  let moduleGameResolvePromise = null;
  let simGame = null;

  function looksLikeGameSingleton(value) {
    return !!(
      value && typeof value === 'object' &&
      typeof value.boot === 'function' &&
      typeof value.queue === 'function' &&
      typeof value.connect === 'function' &&
      typeof value.inGame === 'function' &&
      value.info && value.serverInfo
    );
  }

  async function resolveGameFromModule() {
    if (moduleGameResolvePromise) return moduleGameResolvePromise;
    moduleGameResolvePromise = (async () => {
      const urls = [];
      const add = (url) => {
        if (!url || typeof url !== 'string') return;
        if (!url.includes('/assets/index-') || !url.endsWith('.js')) return;
        if (!urls.includes(url)) urls.push(url);
      };
      try {
        for (const s of document.querySelectorAll('script[type="module"][src]')) add(s.src);
      } catch (_) {}
      try {
        for (const e of performance.getEntriesByType('resource')) add(e?.name);
      } catch (_) {}
      for (const url of urls) {
        try {
          const mod = await import(url);
          if (!mod || typeof mod !== 'object') continue;
          for (const value of Object.values(mod)) {
            if (looksLikeGameSingleton(value) && value.player && value.world) {
              return value;
            }
          }
        } catch (_) {}
      }
      return null;
    })();
    moduleGameResolvePromise.finally(() => { moduleGameResolvePromise = null; });
    return moduleGameResolvePromise;
  }

  function refreshGame() {
    for (const candidate of [globalThis.miniblox, globalThis.__MINIBLOX_GAME__, simGame]) {
      if (candidate?.player && candidate?.world) { simGame = candidate; sim.world.setGame(candidate); return candidate; }
    }
    try {
      const react = document.querySelector('#react');
      if (react) {
        for (const value of Object.values(react)) {
          const game = value?.updateQueue?.baseState?.element?.props?.game;
          if (game?.player && game?.world) {
            simGame = game;
            sim.world.setGame(game);
            LOG.d('game resuelto vía #react fiber');
            return game;
          }
        }
      }
    } catch (_) {}
    resolveGameFromModule().then((game) => {
      if (game && game.player && game.world) {
        simGame = game;
        sim.world.setGame(game);
        LOG.d('game resuelto vía import() del módulo');
      }
    });
    return simGame?.player && simGame?.world ? simGame : null;
  }

  // ── arranque ──
  setupSpiderBody(sim.app);
  setupBehaviours(sim.app);
  setupEvolution(sim.app);
  setupPredators(sim.app);
  setupRemoteAI(sim.app);

  function start() {
    if (sim.running) return;
    sim.running = true;
    sim.interval = setInterval(tick, TICK_MS);
    refreshGame();
  }

  function stop() {
    if (!sim.running) return;
    sim.running = false;
    clearInterval(sim.interval);
  }

  // reporte del jugador: lo llama SpiderBot desde su raf con la pos real
  function reportPlayer(x, y, z, yaw) {
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      const prev = sim.lastPlayerPos;
      sim.lastPlayerPos = { x, y, z, yaw: yaw || 0, t: Date.now() };
      if (!prev || (prev.x === 0 && prev.y === 0 && prev.z === 0)) {
        LOG.i('primer reporte del jugador:', [x, y, z], 'yaw', yaw || 0);
      }
    } else {
      LOG.d('reportPlayer IGNORADO (no finito):', [x, y, z]);
    }
  }

  // ═══ API pública (misma forma que el WebSocket viejo) ═══
  const api = {
    send(msg) {
      return Promise.resolve(handleMessage(msg))
        .then((r) => (r !== undefined ? r : { ok: true }))
        .catch((e) => ({ ok: false, error: e.message }));
    },
    onMessage(fn) { sim.onMessage = fn; },
    start, stop,
    reportPlayer,
    refreshGame,
    // stats de la evolución (población viva ordenada por fitness)
    evolveStats() { return api.send({ type: 'evostats' }); },
    // arañas iniciales: se crean cuando se conoce la posición del jugador.
    // Solo UNA vez por sesión: /spider clear marca el flag y no vuelven a
    // aparecer (antes el tick del renderer las re-creaba al ver la lista vacía).
    ensureInitialSpiders() {
      if (sim.initialSpawnsDone || sim.spiders.length) return false;
      const p = sim.lastPlayerPos;
      if (!p) return false;
      if (p.x === 0 && p.y === 0 && p.z === 0) {
        LOG.d('ensureInitialSpiders: esperando posición real del jugador…');
        return false;
      }
      const side = 3;
      // arañas reales por defecto: preset 'spider' = 8 patas × 2 segmentos
      // + torso fusionado (cefalotórax + abdomen) en el renderer
      const g0 = spawnSpider('garden-0', 'spider', p.x + side, p.y + 2, p.z, 0, true);
      spawnSpider('garden-1', 'spider', p.x - side - 1, p.y + 2, p.z + side, 90, false);
      emit({ type: 'add', spider: serializeSpider(g0, 'garden-0', 'spider') });
      const s1 = sim.spiders[1];
      if (s1) emit({ type: 'add', spider: serializeSpider(s1.body, s1.name, s1.preset) });
      sim.initialSpawnsDone = true;
      LOG.i('arañas iniciales creadas:', sim.spiders.length, '@', [p.x, p.y, p.z]);
      return true;
    },
    list() {
      return sim.spiders.map((s) => ({
        name: s.name, preset: s.preset, gallop: s.body.gallop,
        pos: [round3(s.body.position.x), round3(s.body.position.y), round3(s.body.position.z)],
        grounded: s.body.onGround,
        legs: s.body.legs.length,
      }));
    },
    clear() {
      // restaurar las meshes nativas de los títeres antes de borrarlos
      for (const rec of sim.spiders) {
        if (rec.puppet) { try { if (rec.native?.mesh) rec.native.mesh.visible = true; } catch (_) {} }
      }
      sim.replace.on = false; // y no re-crearlas en el próximo scan
      // emit remove por araña: el renderer local Y el peer P2P deben limpiar
      for (const s of [...sim.spiders]) {
        emit({ type: 'remove', name: s.name });
        s.entity.remove();
      }
      sim.spiders.length = 0;
      // suprimir también las iniciales: si clear dejó la lista vacía, el tick
      // del renderer volvería a crearlas → nunca más en esta sesión
      sim.initialSpawnsDone = true;
    },
    debug() {
      return {
        running: sim.running,
        tick: sim.tickCount,
        tickMs: Math.round((sim.tickMs || 0) * 100) / 100,
        spiders: sim.spiders.length,
        hasGame: !!(simGame?.player && simGame?.world),
        player: sim.lastPlayerPos ? [round3(sim.lastPlayerPos.x), round3(sim.lastPlayerPos.y), round3(sim.lastPlayerPos.z)] : null,
        cache: sim.world.blockCache.size,
        logLevel: LOG.level,
        evolve: evoActive ? { ...evoStats, population: sim.spiders.filter((s) => s.entity.has('EvolutionBehaviour')).length } : null,
      };
    },
    // nivel de log: 0=off 1=info 2=detalle 3=verboso
    log(level) {
      if (level === undefined || level === null) return LOG.level;
      LOG.setLevel(level);
      return LOG.level;
    },
    // últimas entradas del ring buffer (para volcar sin consola)
    logs(n) { return LOG.dump(n); },
    logsClear() { LOG.clear(); },
    // hot-reload: parar todo y restaurar meshes nativas antes de re-crear
    dispose() {
      try { api.clear(); } catch (_) {}
      try { stop(); } catch (_) {}
      try { clearInterval(sim.initialWatcher); } catch (_) {}
    },
  };

  window.MF_SPIDER_SIM = api;

  start();

  // auto-spawn cuando se conozca la posición real del jugador: watcher barato
  // (SpiderBot reporta desde su raf; esto cubre el caso de que tarde)
  sim.initialWatcher = setInterval(() => {
    if (sim.spiders.length) { clearInterval(sim.initialWatcher); return; }
    refreshGame();
    const player = simGame?.player;
    const pos = player?.pos;
    if (pos && Number.isFinite(Number(pos.x)) && !(pos.x === 0 && pos.y === 0 && pos.z === 0)) {
      reportPlayer(Number(pos.x), Number(pos.y), Number(pos.z), Number(player.yaw) || 0);
      if (api.ensureInitialSpiders()) clearInterval(sim.initialWatcher);
    }
  }, 1000);

  console.log(TAG, 'cargado — simulador embebido (sin Node, sin WebSocket). window.MF_SPIDER_SIM');
})();
