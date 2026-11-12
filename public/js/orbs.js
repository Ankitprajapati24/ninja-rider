import * as THREE from 'three';

const COUNT = 8, LOW = 1.7, HIGH = 3.25, HIGH_CHANCE = 0.4;
const REACH = 1.15, RESPAWN = 4, FIELD_MIN = 8, FIELD_MAX = 50;
// the rider's body spans this height above the horse's feet
const BODY_BOTTOM = 0.9, BODY_TOP = 2.6;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(160,230,255,0.8)');
  gradient.addColorStop(1, 'rgba(80,180,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Floating spirit orbs. Ride through one to collect it; high ones need a jump.
export function createOrbs(scene, world, onCollect) {
  const coreGeo = new THREE.IcosahedronGeometry(0.17, 2);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xbff0ff, toneMapped: false });
  const haloMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0x7fd8ff, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false });

  const list = Array.from({ length: COUNT }, (_, i) => {
    const group = new THREE.Group();
    const core = new THREE.Mesh(coreGeo, coreMat);
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(1.1);
    group.add(core, halo);
    scene.add(group);
    return { x: 0, z: 0, y: LOW, group, phase: i * 1.7, timer: 0, active: false };
  });

  function place(orb, rider) {
    for (let tries = 0; tries < 200; tries++) {
      const a = Math.random() * Math.PI * 2, d = FIELD_MIN + Math.random() * (FIELD_MAX - FIELD_MIN);
      const x = Math.sin(a) * d, z = Math.cos(a) * d;
      if (Math.hypot(x - rider.x, z - rider.z) < 8 || !world.isFree(x, z, 1.2)) continue;
      orb.x = x;
      orb.z = z;
      break;
    }
    orb.y = Math.random() < HIGH_CHANCE ? HIGH : LOW;
    orb.active = true;
    orb.group.visible = true;
    orb.group.scale.setScalar(0.01);
  }

  function reset(rider) {
    for (const orb of list) place(orb, rider);
  }

  function update(dt, t, rider, collecting) {
    for (const orb of list) {
      if (!orb.active) {
        orb.timer -= dt;
        if (orb.timer <= 0) place(orb, rider);
        continue;
      }
      const s = orb.group.scale.x;
      orb.group.scale.setScalar(s + (1 - s) * Math.min(1, dt * 6));
      orb.group.position.set(orb.x, orb.y + Math.sin(t * 2 + orb.phase) * 0.12, orb.z);
      orb.group.children[0].rotation.y = t * 1.5 + orb.phase;
      if (!collecting) continue;
      const near = Math.hypot(rider.x - orb.x, rider.z - orb.z) < REACH;
      const level = orb.y >= rider.y + BODY_BOTTOM && orb.y <= rider.y + BODY_TOP;
      if (near && level) {
        orb.active = false;
        orb.group.visible = false;
        orb.timer = RESPAWN;
        onCollect(orb);
      }
    }
  }

  return { list, reset, update, HIGH };
}
