import * as THREE from 'three';
import { mat, mesh, pivot, ellipsoid, limb, segment, loft, lerp, clamp, damp } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = (u) => u * u * (3 - 2 * u);

// Torso rings from seat to neck; lofted along z, then stood upright.
const TORSO = [
  { z: -0.10, rx: 0.02, ry: 0.02 }, { z: -0.08, rx: 0.15, ry: 0.11 }, { z: 0.0, rx: 0.165, ry: 0.12 },
  { z: 0.14, rx: 0.135, ry: 0.10 }, { z: 0.30, rx: 0.17, ry: 0.115 }, { z: 0.42, rx: 0.19, ry: 0.11 },
  { z: 0.48, rx: 0.12, ry: 0.09 }, { z: 0.52, rx: 0.055, ry: 0.055 }, { z: 0.60, rx: 0.05, ry: 0.05 },
];

// Arm poses: [shoulder x, shoulder z, elbow x, wrist x, spine twist]
const REST_R = [-0.3, -0.4, -1.3, 0.25, 0];
const REST_L = [-0.45, 0.12, -1.15, 0, 0];
const SLASH = [
  { t: 0, v: REST_R }, { t: 0.32, v: [-2.5, -0.55, -0.9, -0.3, -0.35] },
  { t: 0.55, v: [-0.75, -0.75, -0.2, 1.4, 0.4] }, { t: 1, v: REST_R },
];
const THROW = [
  { t: 0, v: REST_L }, { t: 0.4, v: [-0.9, -0.5, -2.1, 0, 0.25] },
  { t: 0.62, v: [-1.45, 0.25, -0.15, 0, -0.3] }, { t: 1, v: REST_L },
];
const SLASH_TIME = 0.5, STRIKE_AT = 0.5;
const THROW_TIME = 0.42, RELEASE_AT = 0.56;

function sample(keys, u, out) {
  let i = 1;
  while (i < keys.length - 1 && keys[i].t < u) i++;
  const a = keys[i - 1], b = keys[i];
  const k = ease(clamp((u - a.t) / (b.t - a.t), 0, 1));
  for (let j = 0; j < out.length; j++) out[j] = lerp(a.v[j], b.v[j], k);
}

function createKatana(parent) {
  const katana = pivot(parent);
  const steel = mat(0xe6ebf0, 0.28, 0.55, { envMapIntensity: 1.6 });
  const shape = new THREE.Shape();
  const back = (t) => 0.012 + 0.045 * t * t;
  shape.moveTo(0, back(0));
  for (let i = 1; i <= 12; i++) shape.lineTo(0.72 * (i / 12), back(i / 12));
  for (let i = 11; i >= 0; i--) { const t = (i / 12) * 0.94; shape.lineTo(0.72 * t, back(t) - 0.03); }
  shape.closePath();
  const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false });
  blade.rotateY(-Math.PI / 2);
  blade.translate(0.003, 0, 0.165);
  mesh(blade, steel, katana);
  const grip = new THREE.CylinderGeometry(0.016, 0.016, 0.26, 12);
  grip.rotateX(Math.PI / 2);
  mesh(grip, mat(0x14161b, 0.9), katana, 0, 0, 0.03);
  const guard = new THREE.CylinderGeometry(0.042, 0.042, 0.008, 20);
  guard.rotateX(Math.PI / 2);
  mesh(guard, mat(0x9a7b3a, 0.35, 0.9), katana, 0, 0, 0.162);
  katana.rotation.y = -0.35;
  return katana;
}

export function createNinja({ onStrike, onRelease }) {
  const cloth = mat(0x15171c, 0.88);
  const wrap = mat(0x23262e, 0.9);
  const red = mat(0x9c1b17, 0.8);
  const skin = mat(0xd7a47c, 0.65);
  const metal = mat(0x8d949c, 0.4, 0.8);

  const root = new THREE.Group();
  const spine = pivot(root, 0, 0.09, 0);
  const torsoGeo = loft(TORSO, 22);
  torsoGeo.rotateX(-Math.PI / 2);
  mesh(torsoGeo, cloth, spine);
  const sash = mesh(new THREE.TorusGeometry(0.135, 0.024, 8, 24), red, spine, 0, 0.12, 0);
  sash.rotation.x = Math.PI / 2;
  sash.scale.y = 0.75;
  ellipsoid(spine, 0.025, 0.09, 0.02, red, 0.13, 0.05, 0.05);
  segment(spine, V(0.17, 0.52, -0.13), V(-0.2, -0.02, -0.14), 0.02, 0.018, mat(0x0b0b0d, 0.3));
  segment(spine, V(0.12, 0.45, 0.1), V(-0.13, 0.14, 0.1), 0.012, 0.012, wrap);

  // --- head
  const head = pivot(spine, 0, 0.64, 0.01);
  const hood = mesh(new THREE.SphereGeometry(0.108, 24, 18), cloth, head);
  hood.scale.set(0.95, 1.08, 1);
  const face = mesh(new THREE.SphereGeometry(0.1095, 24, 6, Math.PI / 2 - 0.8, 1.6, Math.PI / 2 - 0.24, 0.3), skin, head);
  face.scale.copy(hood.scale);
  const band = mesh(new THREE.TorusGeometry(0.107, 0.011, 8, 32), red, head, 0, 0.05, 0);
  band.rotation.x = Math.PI / 2;
  band.scale.x = 0.95;
  mesh(new THREE.SphereGeometry(0.02, 10, 8), red, head, 0, 0.05, -0.11);
  const eyeWhite = mat(0xf2efe8, 0.3);
  const pupil = mat(0x0a0705, 0.2);
  for (const s of [1, -1]) {
    ellipsoid(head, 0.017, 0.009, 0.006, eyeWhite, s * 0.04, 0.012, 0.1);
    ellipsoid(head, 0.007, 0.007, 0.005, pupil, s * 0.04, 0.012, 0.104);
    const brow = mesh(new THREE.BoxGeometry(0.042, 0.008, 0.012), cloth, head, s * 0.04, 0.03, 0.1);
    brow.rotation.z = s * 0.3;
  }
  const tails = [];
  for (const s of [1, -1]) {
    const tail = pivot(head, s * 0.012, 0.05, -0.115);
    const geo = new THREE.BoxGeometry(0.03, 0.004, 0.24);
    geo.translate(0, 0, -0.12);
    mesh(geo, red, tail);
    tails.push(tail);
  }

  // --- arms (the rider's left is +x, right is -x)
  const arm = (s) => {
    const shoulder = pivot(spine, s * 0.2, 0.41, 0);
    limb(shoulder, 0.058, 0.046, 0.27, cloth);
    const elbow = pivot(shoulder, 0, -0.27, 0);
    limb(elbow, 0.046, 0.04, 0.25, wrap);
    const hand = pivot(elbow, 0, -0.25, 0);
    mesh(new THREE.SphereGeometry(0.045, 12, 10), cloth, hand);
    return { shoulder, elbow, hand };
  };
  const left = arm(1);
  const right = arm(-1);
  const katana = createKatana(right.hand);
  // ends of the blade, for the slash trail
  const bladeBase = pivot(katana, 0, 0.035, 0.2);
  const bladeTip = pivot(katana, 0, 0.04, 0.88);

  // --- legs wrapped around the barrel, feet in the stirrups
  for (const s of [1, -1]) {
    const hip = V(s * 0.11, 0.07, 0), knee = V(s * 0.33, -0.12, 0.32), ankle = V(s * 0.39, -0.52, 0.22);
    segment(root, hip, knee, 0.088, 0.07, cloth);
    segment(root, knee, ankle, 0.068, 0.05, wrap);
    ellipsoid(root, 0.05, 0.045, 0.12, cloth, s * 0.39, -0.56, 0.27);
    mesh(new THREE.TorusGeometry(0.075, 0.008, 6, 20), metal, root, s * 0.39, -0.55, 0.3);
  }

  let slashT = -1, throwT = -1, lean = 0;
  const poseR = [...REST_R], poseL = [...REST_L];

  // s: same motion state the horse gets; gait: the horse's stride info
  function update(dt, t, s, gait) {
    const m = gait.move, wg = gait.gallop * m, wt = gait.trot * m;
    poseR.splice(0, 5, ...REST_R);
    poseL.splice(0, 5, ...REST_L);
    if (slashT >= 0) {
      const before = slashT;
      slashT += dt / SLASH_TIME;
      if (before < STRIKE_AT && slashT >= STRIKE_AT) onStrike();
      if (slashT >= 1) slashT = -1; else sample(SLASH, slashT, poseR);
    }
    if (throwT >= 0) {
      const before = throwT;
      throwT += dt / THROW_TIME;
      if (before < RELEASE_AT && throwT >= RELEASE_AT) onRelease();
      if (throwT >= 1) throwT = -1; else sample(THROW, throwT, poseL);
    }
    const sway = Math.sin(gait.phase * 2) * 0.05 * m;
    right.shoulder.rotation.set(poseR[0] + sway, 0, poseR[1]);
    right.elbow.rotation.x = poseR[2];
    katana.rotation.x = poseR[3];
    left.shoulder.rotation.set(poseL[0] - sway * 0.5, 0, poseL[1]);
    left.elbow.rotation.x = poseL[2];

    lean = damp(lean, 0.06 + 0.32 * wg + s.rear * 0.5 - s.pitch * 0.6, 8, dt);
    spine.rotation.x = lean + Math.sin(gait.phase + 0.4) * 0.03 * wg;
    spine.rotation.y = poseR[4] + poseL[4];
    spine.rotation.z = -s.turn * 0.08 * m;
    spine.position.y = 0.09 + Math.max(0, Math.sin(gait.phase * 2)) * 0.035 * wt * (1 - gait.gallop);
    head.rotation.x = -lean * 0.75;
    head.rotation.y = s.turn * 0.35 - spine.rotation.y * 0.6;
    tails.forEach((tail, i) => {
      tail.rotation.x = -1.25 + 1.1 * Math.max(wg, wt * 0.5) + Math.sin(t * (3 + 9 * m) + i * 1.7) * (0.06 + 0.14 * m);
      tail.rotation.y = Math.sin(t * (2 + 6 * m) + i) * (0.1 + 0.15 * m);
    });
  }

  return {
    root, update,
    reinHand: left.hand,
    throwHand: left.hand,
    get busy() { return slashT >= 0 || throwT >= 0; },
    // the fast part of the swing, when the blade should leave a trail
    get swinging() { return slashT > 0.28 && slashT < 0.72; },
    bladeBase, bladeTip,
    slash() { if (slashT < 0 && throwT < 0) slashT = 0; },
    throwStar() { if (slashT < 0 && throwT < 0) throwT = 0; },
  };
}
