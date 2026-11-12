import * as THREE from 'three';

const DOWN = new THREE.Vector3(0, -1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (lo, hi, v) => {
  const t = clamp((v - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
};
// frame-rate independent approach of `current` toward `target`
export const damp = (current, target, rate, dt) => lerp(current, target, 1 - Math.exp(-rate * dt));

export function mat(color, roughness = 0.8, metalness = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: 0.45, ...extra });
}

export function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

export function pivot(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

export function ellipsoid(parent, rx, ry, rz, material, x = 0, y = 0, z = 0) {
  const m = mesh(new THREE.SphereGeometry(1, 20, 14), material, parent, x, y, z);
  m.scale.set(rx, ry, rz);
  return m;
}

// Tapered segment hanging down -Y from the parent's origin, with rounded joints at both ends.
export function limb(parent, rTop, rBot, len, material) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, len, 16, 1);
  geo.translate(0, -len / 2, 0);
  mesh(geo, material, parent);
  mesh(new THREE.SphereGeometry(rTop, 16, 12), material, parent);
  mesh(new THREE.SphereGeometry(rBot, 16, 12), material, parent, 0, -len, 0);
}

// Static limb between two points given in the parent's space.
export function segment(parent, from, to, rTop, rBot, material) {
  const g = pivot(parent, from.x, from.y, from.z);
  const dir = _a.copy(to).sub(from);
  const len = dir.length();
  g.quaternion.setFromUnitVectors(DOWN, dir.normalize());
  limb(g, rTop, rBot, len, material);
  return g;
}

// Orient a unit-length cylinder (built along Y, centred) so it spans two world points.
export function stretch(object, from, to) {
  const dir = _b.copy(to).sub(from);
  const len = dir.length();
  object.position.copy(from).addScaledVector(dir, 0.5);
  object.scale.set(1, len, 1);
  object.quaternion.setFromUnitVectors(DOWN, dir.normalize().negate());
}

// Skin of elliptical rings along Z. Sections must be listed in increasing z:
// { z, rx, ry, x?, y? }. A partial arc (a0..a1) gives an open sheet.
export function loft(sections, segs = 24, a0 = 0, a1 = Math.PI * 2) {
  const closed = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6;
  const cols = closed ? segs : segs + 1;
  const pos = [];
  const idx = [];
  for (const s of sections) {
    for (let j = 0; j < cols; j++) {
      const a = a0 + (a1 - a0) * (j / segs);
      pos.push((s.x || 0) + Math.cos(a) * s.rx, (s.y || 0) + Math.sin(a) * s.ry, s.z);
    }
  }
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * cols + j;
      const b = i * cols + ((j + 1) % cols);
      idx.push(a, b, a + cols, b, b + cols, a + cols);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
