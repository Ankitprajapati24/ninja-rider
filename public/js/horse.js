import * as THREE from 'three';
import { mat, mesh, pivot, ellipsoid, limb, segment, loft, lerp, smoothstep } from './util.js';

const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Barrel cross-sections from croup (-z) to chest (+z).
const TORSO = [
  { z: -0.92, y: 1.30, rx: 0.02, ry: 0.02 }, { z: -0.88, y: 1.30, rx: 0.16, ry: 0.20 },
  { z: -0.72, y: 1.30, rx: 0.27, ry: 0.31 }, { z: -0.45, y: 1.28, rx: 0.30, ry: 0.33 },
  { z: -0.15, y: 1.24, rx: 0.30, ry: 0.31 }, { z: 0.15, y: 1.22, rx: 0.31, ry: 0.33 },
  { z: 0.45, y: 1.24, rx: 0.29, ry: 0.35 }, { z: 0.68, y: 1.27, rx: 0.24, ry: 0.33 },
  { z: 0.82, y: 1.30, rx: 0.16, ry: 0.24 }, { z: 0.88, y: 1.32, rx: 0.02, ry: 0.02 },
];
const NECK = [
  { z: -0.16, y: -0.02, rx: 0.02, ry: 0.02 }, { z: -0.12, y: -0.02, rx: 0.15, ry: 0.20 },
  { z: 0.0, y: -0.02, rx: 0.19, ry: 0.27 }, { z: 0.25, y: -0.01, rx: 0.15, ry: 0.22 },
  { z: 0.5, y: 0, rx: 0.125, ry: 0.18 }, { z: 0.75, y: 0, rx: 0.105, ry: 0.15 },
  { z: 0.88, y: 0, rx: 0.095, ry: 0.13 }, { z: 0.93, y: 0, rx: 0.02, ry: 0.02 },
];
const HEAD = [
  { z: -0.14, y: 0.02, rx: 0.02, ry: 0.02 }, { z: -0.10, y: 0, rx: 0.09, ry: 0.11 },
  { z: 0.0, y: -0.02, rx: 0.115, ry: 0.15 }, { z: 0.12, y: -0.035, rx: 0.115, ry: 0.15 },
  { z: 0.28, y: -0.02, rx: 0.09, ry: 0.11 }, { z: 0.42, y: -0.01, rx: 0.07, ry: 0.085 },
  { z: 0.54, y: -0.012, rx: 0.072, ry: 0.08 }, { z: 0.60, y: -0.015, rx: 0.055, ry: 0.06 },
  { z: 0.63, y: -0.02, rx: 0.02, ry: 0.02 },
];
// Footfall offsets (fraction of a stride) for [left fore, right fore, left hind, right hind].
const WALK = [0.25, 0.75, 0.0, 0.5];
const TROT = [0.0, 0.5, 0.5, 0.0];
const GALLOP = [0.45, 0.55, 0.0, 0.12];
const HIP = V(0, 1.15, -0.6);

function torsoAt(z, grow) {
  let i = 1;
  while (i < TORSO.length - 1 && TORSO[i].z < z) i++;
  const a = TORSO[i - 1], b = TORSO[i];
  const t = (z - a.z) / (b.z - a.z);
  return { z, y: lerp(a.y, b.y, t), rx: lerp(a.rx, b.rx, t) + grow, ry: lerp(a.ry, b.ry, t) + grow };
}

export function createHorse() {
  const coat = mat(0x6b3d1f, 0.5);
  const dark = mat(0x17110d, 0.6);
  const hoofMat = mat(0x0f0c0a, 0.35);
  const muzzle = mat(0x2a1b13, 0.6);
  const eyeMat = mat(0x050403, 0.08);
  const white = mat(0xe9e2d6, 0.7);
  const cloth = mat(0x7d1512, 0.9, 0, { side: THREE.DoubleSide });
  const leather = mat(0x1d1410, 0.55);

  const root = new THREE.Group();
  // `body` pivots at the hips so the horse can rear; `core` restores root coordinates.
  const body = pivot(root, HIP.x, HIP.y, HIP.z);
  const core = pivot(body, -HIP.x, -HIP.y, -HIP.z);

  const torso = mesh(loft(TORSO, 28), coat, core);

  // --- neck and head
  const neck = pivot(core, 0, 1.40, 0.66);
  mesh(loft(NECK, 22), coat, neck);
  const head = pivot(neck, 0, 0, 0.86);
  mesh(loft(HEAD, 22), coat, head);
  ellipsoid(head, 0.066, 0.07, 0.07, muzzle, 0, -0.015, 0.565);
  ellipsoid(head, 0.03, 0.02, 0.15, white, 0, 0.092, 0.2);
  ellipsoid(head, 0.05, 0.03, 0.1, dark, 0, 0.125, 0.0);
  const ears = [];
  for (const s of [1, -1]) {
    ellipsoid(head, 0.024, 0.024, 0.024, eyeMat, s * 0.105, 0.03, 0.1);
    ellipsoid(head, 0.014, 0.012, 0.02, eyeMat, s * 0.038, 0.02, 0.615);
    const ear = pivot(head, s * 0.062, 0.11, -0.04);
    const cone = new THREE.ConeGeometry(0.036, 0.14, 12);
    cone.translate(0, 0.07, 0);
    mesh(cone, coat, ear).scale.z = 0.6;
    ear.rotation.z = -s * 0.2;
    ears.push(ear);
  }

  // --- bridle
  const noseband = mesh(new THREE.TorusGeometry(0.083, 0.008, 8, 28), leather, head, 0, -0.01, 0.4);
  noseband.scale.set(0.9, 1.1, 1);
  const bits = [];
  for (const s of [1, -1]) {
    segment(head, V(s * 0.076, 0, 0.4), V(s * 0.104, 0.07, -0.02), 0.007, 0.007, leather);
    bits.push(pivot(head, s * 0.078, -0.04, 0.47));
  }

  // --- mane
  const mane = [];
  for (let i = 0; i < 13; i++) {
    const t = i / 12;
    const strand = pivot(neck, 0, lerp(0.24, 0.12, t), 0.04 + 0.8 * t);
    ellipsoid(strand, 0.024, 0.14, 0.065, dark, 0.03, -0.12, 0);
    mane.push(strand);
  }

  // --- tail
  const tail = [];
  let parent = pivot(core, 0, 1.5, -0.87);
  const radii = [0.045, 0.07, 0.065, 0.045, 0.012];
  for (let k = 0; k < 4; k++) {
    limb(parent, radii[k], radii[k + 1], 0.27, dark);
    tail.push(parent);
    parent = pivot(parent, 0, -0.27, 0);
  }

  // --- tack
  const blanket = [-0.24, -0.06, 0.12, 0.28, 0.42].map((z) => torsoAt(z, 0.012));
  mesh(loft(blanket, 28, -0.2, Math.PI + 0.2), cloth, core);
  mesh(loft([0.19, 0.24, 0.29].map((z) => torsoAt(z, 0.017)), 28), leather, core);
  const seat = torsoAt(0.1, 0);
  const seatY = seat.y + seat.ry;
  ellipsoid(core, 0.19, 0.05, 0.27, leather, 0, seatY + 0.005, 0.1);
  ellipsoid(core, 0.09, 0.05, 0.05, leather, 0, seatY + 0.05, 0.33);
  ellipsoid(core, 0.15, 0.06, 0.05, leather, 0, seatY + 0.055, -0.13);
  const saddle = pivot(core, 0, seatY + 0.05, 0.1);

  // --- legs
  const hoof = (parentPivot) => {
    const h = pivot(parentPivot, 0, -0.13, 0);
    h.rotation.x = 0.5;
    const geo = new THREE.CylinderGeometry(0.052, 0.068, 0.1, 16);
    geo.translate(0, -0.05, 0.012);
    mesh(geo, hoofMat, h);
  };
  const foreLeg = (s) => {
    const shoulder = pivot(core, s * 0.19, 1.10, 0.58);
    limb(shoulder, 0.095, 0.055, 0.53, coat);
    ellipsoid(shoulder, 0.1, 0.2, 0.15, coat, 0, -0.06, 0);
    const knee = pivot(shoulder, 0, -0.53, 0);
    mesh(new THREE.SphereGeometry(0.06, 14, 10), coat, knee);
    limb(knee, 0.048, 0.04, 0.35, dark);
    const fetlock = pivot(knee, 0, -0.35, 0);
    mesh(new THREE.SphereGeometry(0.05, 14, 10), dark, fetlock);
    limb(fetlock, 0.042, 0.045, 0.13, dark);
    hoof(fetlock);
    return { shoulder, knee, fetlock };
  };
  const hindLeg = (s) => {
    const hip = pivot(core, s * 0.2, 1.18, -0.62);
    limb(hip, 0.14, 0.09, 0.34, coat);
    ellipsoid(hip, 0.13, 0.22, 0.2, coat, -s * 0.02, -0.02, 0.02);
    const stifle = pivot(hip, 0, -0.34, 0);
    limb(stifle, 0.088, 0.05, 0.36, coat);
    const hock = pivot(stifle, 0, -0.36, 0);
    mesh(new THREE.SphereGeometry(0.058, 14, 10), dark, hock);
    limb(hock, 0.05, 0.042, 0.32, dark);
    const fetlock = pivot(hock, 0, -0.32, 0);
    mesh(new THREE.SphereGeometry(0.05, 14, 10), dark, fetlock);
    limb(fetlock, 0.043, 0.046, 0.13, dark);
    hoof(fetlock);
    return { hip, stifle, hock, fetlock };
  };
  const fore = [foreLeg(1), foreLeg(-1)];
  const hind = [hindLeg(1), hindLeg(-1)];

  // `steps` counts hoof strikes so the caller can time hoofbeats
  const gait = { phase: 0, move: 0, trot: 0, gallop: 0, steps: 0 };
  const airborne = [false, false, false, false];

  // s: { stride (m/s driving the legs), rear 0..1, tuck 0..1, pitch (rad), turn -1..1 }
  function update(dt, t, s) {
    const m = smoothstep(0, 0.6, s.stride);
    const wt = smoothstep(2.2, 3.4, s.stride);
    const wg = smoothstep(5.5, 7.5, s.stride);
    if (s.stride > 0.02) gait.phase = (gait.phase + dt * TAU * (0.6 + s.stride * 0.15)) % TAU;
    gait.move = m; gait.trot = wt; gait.gallop = wg;
    const ph = gait.phase;
    const swing = lerp(lerp(0.3, 0.4, wt), 0.6, wg) * m;
    const flex = lerp(0.9, 1.5, wg) * m;
    const idle = 1 - m;

    for (let i = 0; i < 4; i++) {
      const off = lerp(lerp(WALK[i], TROT[i], wt), GALLOP[i], wg);
      const p = ph + off * TAU;
      const c = Math.cos(p);
      const lift = Math.max(0, -Math.sin(p));
      if (airborne[i] && lift === 0 && m > 0.3) gait.steps++;
      airborne[i] = lift > 0;
      if (i < 2) {
        const leg = fore[i];
        const paw = s.rear * Math.sin(t * 8 + i * Math.PI);
        leg.shoulder.rotation.x = -swing * c - s.rear * 0.7 + paw * 0.25 - s.tuck * 0.55;
        leg.knee.rotation.x = lift * flex + s.rear * 1.0 + paw * 0.4 + s.tuck * 1.5;
        leg.fetlock.rotation.x = -0.5 + lift * 0.9 * m + s.tuck * 0.6 + s.rear * 0.4;
      } else {
        const leg = hind[i - 2];
        leg.hip.rotation.x = -0.3 - swing * 0.85 * c + s.rear * 0.8 + s.tuck * 0.55;
        leg.stifle.rotation.x = 0.75 + lift * 0.55 * m - s.tuck * 0.25;
        leg.hock.rotation.x = -0.45 - lift * 0.95 * m + s.tuck * 0.2;
        leg.fetlock.rotation.x = -0.5 + lift * 0.8 * m + s.tuck * 0.5;
      }
    }

    const bob = (Math.sin(2 * ph) * 0.025 * (1 - wg) + Math.sin(ph + 2.2) * 0.07 * wg) * m;
    core.position.set(-HIP.x, -HIP.y + bob, -HIP.z);
    body.rotation.x = -s.rear * 0.8 + Math.sin(ph + 0.6) * 0.045 * wg * m + s.pitch;
    torso.scale.x = 1 + Math.sin(t * 1.6) * 0.01;

    neck.rotation.x = -0.9 + 0.28 * wg * m + Math.sin(2 * ph) * 0.04 * m * (1 - wg)
      + Math.sin(ph + 1) * 0.07 * wg * m + Math.sin(t * 0.7) * 0.03 * idle + s.rear * 0.15;
    neck.rotation.y = Math.sin(t * 0.31) * 0.12 * idle * (1 - s.rear) + s.turn * 0.22;
    head.rotation.x = 1.45 - 0.15 * wg * m + Math.sin(t * 0.9 + 1) * 0.04 * idle - s.rear * 0.3;

    ears.forEach((ear, i) => { ear.rotation.x = Math.sin(t * 1.3 + i * 2) * 0.12 - 0.5 * wg * m; });
    tail.forEach((seg, k) => {
      seg.rotation.x = k === 0 ? 0.45 + (0.5 * wg + 0.2 * wt) * m + s.rear * 0.3 : -0.12 * (1 - 0.35 * wg * m);
      seg.rotation.z = Math.sin(t * (1.6 + 3 * m) + k * 0.7) * (0.1 + 0.08 * m) * (k === 0 ? 0.6 : 1);
    });
    mane.forEach((strand, i) => {
      strand.rotation.x = 0.9 + 0.55 * wg * m + Math.sin(t * 5 + i) * 0.05 * m;
      strand.rotation.z = 0.55 + 0.35 * wg * m + Math.sin(t * (2 + 6 * m) + i * 0.8) * (0.03 + 0.1 * m);
    });
  }

  return { root, core, saddle, bits, gait, update };
}
