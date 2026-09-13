// Port 1:1 de JOML Quaternionf (subset usado por el mod) + Vector3f.
// Fórmulas copiadas de joml/Quaternionf.java (JOML-CI/JOML master).
'use strict';

class Quat {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x; this.y = y; this.z = z; this.w = w;
  }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  setQ(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
  clone() { return new Quat(this.x, this.y, this.z, this.w); }

  lengthSquared() { return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w; }
  normalize() {
    const inv = 1 / Math.sqrt(this.lengthSquared() || 1);
    this.x *= inv; this.y *= inv; this.z *= inv; this.w *= inv;
    return this;
  }

  // this = this * q (JOML mul)
  mul(q) {
    return mulInto(this, this, q);
  }
  // this = q * this (JOML premul)
  premul(q) {
    return mulInto(this, q, this);
  }
  // this = q⁻¹ (normalizado) — usado por difference
  invert() {
    const invNorm = 1 / this.lengthSquared();
    this.x = -this.x * invNorm; this.y = -this.y * invNorm;
    this.z = -this.z * invNorm; this.w = this.w * invNorm;
    return this;
  }

  // JOML rotationYXZ(angleY, angleX, angleZ): set absoluto
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

  // JOML rotateYXZ: right-multiply
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

  // JOML rotateAxis: right-multiply por axis-angle
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

  // JOML rotateX / rotateZ: right-multiply (axis unitaria → mismo resultado)
  rotateX(angle) { return this.rotateAxis(angle, 1, 0, 0); }
  rotateZ(angle) { return this.rotateAxis(angle, 0, 0, 1); }

  // JOML rotationTo(from, to): rotación de arco más corto entre direcciones
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

  // JOML getEulerAnglesYXZ
  getEulerAnglesYXZ() {
    const safeAsin = (v) => Math.asin(Math.max(-1, Math.min(1, v)));
    return {
      x: safeAsin(-2.0 * (this.y * this.z - this.w * this.x)),
      y: Math.atan2(this.x * this.z + this.y * this.w, 0.5 - this.y * this.y - this.x * this.x),
      z: Math.atan2(this.y * this.x + this.w * this.z, 0.5 - this.x * this.x - this.z * this.z),
    };
  }

  // JOML slerp(target, alpha)
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

// Hamilton product dest = a * b (fórmula JOML dest.set con fma expandido)
function mulInto(dest, a, b) {
  const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
  const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
  const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
  const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
  dest.x = x; dest.y = y; dest.z = z; dest.w = w;
  return dest;
}

// JOML difference: this⁻¹ * other
function quatDifference(q, other) {
  const invNorm = 1 / q.lengthSquared();
  const x = -q.x * invNorm, y = -q.y * invNorm, z = -q.z * invNorm, w = q.w * invNorm;
  return mulInto(new Quat(), { x, y, z, w }, other);
}

// Vector3f mínimo (para rotationalVelocity y ejes)
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setV(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  mul(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  mulV(v) { this.x *= v.x; this.y *= v.y; this.z *= v.z; return this; }
  length() { return Math.sqrt(this.lengthSquared()); }
  lengthSquared() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalized() { return new V3(this.x, this.y, this.z).normalize(); }
  normalize() {
    const inv = 1 / Math.sqrt(this.lengthSquared() || 1);
    this.x *= inv; this.y *= inv; this.z *= inv;
    return this;
  }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(a, b) {
    this.x = a.y * b.z - a.z * b.y;
    this.y = a.z * b.x - a.x * b.z;
    this.z = a.x * b.y - a.y * b.x;
    return this;
  }
  clone() { return new V3(this.x, this.y, this.z); }
}

module.exports = { Quat, V3, mulInto, quatDifference };
