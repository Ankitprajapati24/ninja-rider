import * as THREE from 'three';
import { damp } from './util.js';

const TRAIL_LENGTH = 14;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _s = new THREE.Vector3(), _c = new THREE.Color(), _v = new THREE.Vector3();

// A fixed pool of instanced particles; spawning reuses the oldest slot.
// behaviour: { gravity, drag, puff } — a puff grows then fades instead of tumbling.
function createPool(scene, geometry, material, size, behaviour) {
  const mesh = new THREE.InstancedMesh(geometry, material, size);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  for (let i = 0; i < size; i++) {
    mesh.setMatrixAt(i, HIDDEN);
    mesh.setColorAt(i, _c.set(0xffffff));
  }
  scene.add(mesh);
  const items = Array.from({ length: size }, () => ({
    life: 0, max: 1, size: 0.05, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Vector3(), spin: new THREE.Vector3(),
  }));
  let next = 0;

  function spawn(pos, vel, color, scale, life) {
    const p = items[next];
    mesh.setColorAt(next, _c.set(color));
    next = (next + 1) % size;
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    p.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14);
    p.size = scale;
    p.life = p.max = life;
  }

  function update(dt) {
    let active = false;
    items.forEach((p, i) => {
      if (p.life <= 0) return;
      p.life -= dt;
      if (p.life <= 0) {
        mesh.setMatrixAt(i, HIDDEN);
        active = true;
        return;
      }
      p.vel.y -= behaviour.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-behaviour.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.02) {
        p.pos.y = 0.02;
        p.vel.set(p.vel.x * 0.4, 0, p.vel.z * 0.4);
        p.spin.multiplyScalar(0.5);
      }
      p.rot.addScaledVector(p.spin, dt);
      const t = 1 - p.life / p.max;
      const k = behaviour.puff ? p.size * (0.4 + 1.6 * t) * (1 - t * t) : p.size * Math.min(1, (1 - t) * 3);
      _q.setFromEuler(_e.set(p.rot.x, p.rot.y, p.rot.z));
      mesh.setMatrixAt(i, _m.compose(p.pos, _q, _s.setScalar(k)));
      active = true;
    });
    if (active) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  return { spawn, update };
}

export function createEffects(scene, camera) {
  const chips = createPool(scene, new THREE.BoxGeometry(1, 0.35, 1), new THREE.MeshLambertMaterial(), 240,
    { gravity: 11, drag: 0.6, puff: false });
  const sparks = createPool(scene, new THREE.OctahedronGeometry(0.5, 0),
    new THREE.MeshBasicMaterial({ toneMapped: false }), 160, { gravity: 1.5, drag: 2.2, puff: false });
  const dust = createPool(scene, new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.2, depthWrite: false }), 120,
    { gravity: -0.4, drag: 2.5, puff: true });

  const vel = new THREE.Vector3();
  const randomDir = (speed, up) => vel.set(Math.random() - 0.5, Math.random() * up, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));

  // --- katana trail: a ribbon between the blade's base and tip over the last few frames
  const trailPos = new Float32Array(TRAIL_LENGTH * 2 * 3);
  const trailCol = new Float32Array(TRAIL_LENGTH * 2 * 4);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 4).setUsage(THREE.DynamicDrawUsage));
  const index = [];
  for (let i = 0; i < TRAIL_LENGTH - 1; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  trailGeo.setIndex(index);
  const trail = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  trail.frustumCulled = false;
  scene.add(trail);
  const history = [];

  function updateTrail(active, base, tip) {
    if (active) history.unshift([base.clone(), tip.clone()]);
    else history.shift();
    if (history.length > TRAIL_LENGTH) history.length = TRAIL_LENGTH;
    trail.visible = history.length > 1;
    if (!trail.visible) return;
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const [b, t] = history[Math.min(i, history.length - 1)];
      trailPos.set([b.x, b.y, b.z, t.x, t.y, t.z], i * 6);
      const alpha = i < history.length ? (1 - i / history.length) * 0.85 : 0;
      trailCol.set([0.7, 0.85, 1, alpha * 0.2, 0.85, 0.95, 1, alpha], i * 8);
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.color.needsUpdate = true;
  }

  // --- camera shake, applied on top of wherever the camera controls put the camera
  let shakeAmount = 0;
  const shakeOffset = new THREE.Vector3();

  return {
    burst(x, y, z, colors, count = 22, speed = 5) {
      for (let i = 0; i < count; i++) {
        chips.spawn(_v.set(x, y, z), randomDir(speed, 1.4), colors[i % colors.length], 0.05 + Math.random() * 0.06, 0.9 + Math.random() * 0.6);
      }
    },
    sparkle(x, y, z, color, count = 26, speed = 4) {
      for (let i = 0; i < count; i++) {
        sparks.spawn(_v.set(x, y, z), randomDir(speed, 1), color, 0.04 + Math.random() * 0.05, 0.5 + Math.random() * 0.5);
      }
    },
    puff(x, z, spread = 0.4, count = 2) {
      for (let i = 0; i < count; i++) {
        _v.set(x + (Math.random() - 0.5) * spread, 0.1, z + (Math.random() - 0.5) * spread);
        dust.spawn(_v, vel.set((Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8),
          0xd8c7a2, 0.16 + Math.random() * 0.12, 0.6 + Math.random() * 0.4);
      }
    },
    shake(amount) { shakeAmount = Math.min(0.5, shakeAmount + amount); },
    // call before the camera controls move the camera
    removeShake() { camera.position.sub(shakeOffset); },
    // call after the camera controls moved the camera
    applyShake(dt) {
      shakeAmount = damp(shakeAmount, 0, 7, dt);
      shakeOffset.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shakeAmount * 0.5);
      camera.position.add(shakeOffset);
    },
    updateTrail,
    update(dt) {
      chips.update(dt);
      sparks.update(dt);
      dust.update(dt);
    },
  };
}
