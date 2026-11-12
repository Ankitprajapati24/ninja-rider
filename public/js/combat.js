import * as THREE from 'three';
import { mat, mesh, pivot, damp } from './util.js';

const TARGET_Y = 1.75, HIT_RADIUS = 0.6, SLASH_REACH = 2.7;
const STAR_SPEED = 28, STAR_GRAVITY = 5, STAR_LIFE = 3, AIM_RANGE = 40, AIM_CONE = 0.6;
const COUNT = 9, FIELD_MIN = 12, FIELD_MAX = 55, SPAWN_CLEARANCE = 10;
const GOLD_CHANCE = 0.2, GOLD_LIFE = 14, DOWN_TIME = 1.2;
const _aim = new THREE.Vector3();

function targetTexture(light, dark) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  [light, dark, light, dark].forEach((color, i) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(64, 64, 64 - i * 16, 0, Math.PI * 2);
    g.fill();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function starGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, r = i % 2 ? 0.03 : 0.09;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: false });
  geo.translate(0, 0, -0.004);
  geo.rotateX(Math.PI / 2);
  return geo;
}

// onHit({ kind: 'star' | 'slash', gold, x, z, distance })
export function createCombat(scene, world, onHit) {
  const wood = mat(0x6e5236, 0.9), straw = mat(0xc9b27a, 0.95);
  const face = mat(0xffffff, 0.9, 0, { map: targetTexture('#e9dfc8', '#b3261e') });
  const goldFace = mat(0xffffff, 0.35, 0.3, { map: targetTexture('#ffd75a', '#8a5a00'), emissive: 0x5a3c00 });
  const goldRim = mat(0xe0b040, 0.4, 0.5);
  const plainMats = [straw, face, face], goldMats = [goldRim, goldFace, goldFace];
  const postGeo = new THREE.CylinderGeometry(0.06, 0.07, TARGET_Y, 10);
  const discGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 28);
  discGeo.rotateX(Math.PI / 2);

  const targets = [];
  for (let i = 0; i < COUNT; i++) {
    const group = pivot(scene);
    const tilt = pivot(group);
    mesh(postGeo, wood, tilt, 0, TARGET_Y / 2, 0);
    const disc = mesh(discGeo, plainMats, tilt, 0, TARGET_Y, 0.1);
    const obstacle = { x: 0, z: 0, r: 0.25 };
    world.obstacles.push(obstacle);
    targets.push({ x: 0, z: 0, group, tilt, disc, obstacle, state: 'up', timer: 0, gold: false });
  }

  // Moves a target to a free spot in the field, away from the rider, and stands it up.
  function place(target, rider) {
    target.obstacle.x = 1e6; // out of the way while searching
    for (let tries = 0; tries < 200; tries++) {
      const a = Math.random() * Math.PI * 2, d = FIELD_MIN + Math.random() * (FIELD_MAX - FIELD_MIN);
      const x = Math.sin(a) * d, z = Math.cos(a) * d;
      if (Math.abs(x) < 5 && z > 0 && z < 45) continue;
      if (Math.hypot(x - rider.x, z - rider.z) < SPAWN_CLEARANCE || !world.isFree(x, z, 1.6)) continue;
      target.x = x;
      target.z = z;
      break;
    }
    target.obstacle.x = target.x;
    target.obstacle.z = target.z;
    target.gold = false;
    target.gold = !targets.some((t) => t.gold) && Math.random() < GOLD_CHANCE;
    target.timer = target.gold ? GOLD_LIFE : 0;
    target.state = 'up';
    target.disc.material = target.gold ? goldMats : plainMats;
    target.group.position.set(target.x, 0, target.z);
    target.group.rotation.y = Math.atan2(rider.x - target.x, rider.z - target.z);
    target.tilt.rotation.x = 0;
    target.tilt.scale.setScalar(0.01);
  }

  const starGeo = starGeometry();
  const starMat = mat(0x3a3f47, 0.35, 0.9, { envMapIntensity: 1 });
  const stars = [];

  function knock(target, kind, distance) {
    if (target.state !== 'up') return;
    target.state = 'down';
    target.timer = DOWN_TIME;
    onHit({ kind, gold: target.gold, x: target.x, z: target.z, distance });
  }

  // Throws toward the nearest standing target inside the aim cone, otherwise straight ahead.
  function throwStar(origin, forward, carry) {
    let best = null, bestDist = AIM_RANGE;
    for (const target of targets) {
      if (target.state !== 'up') continue;
      const dx = target.x - origin.x, dz = target.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist < bestDist && dist > 1 && (dx * forward.x + dz * forward.z) / dist > AIM_CONE) { best = target; bestDist = dist; }
    }
    const vel = new THREE.Vector3();
    if (best) {
      _aim.set(best.x, TARGET_Y, best.z).sub(origin);
      const time = _aim.length() / STAR_SPEED;
      vel.copy(_aim).divideScalar(time);
      vel.y += 0.5 * STAR_GRAVITY * time;
    } else {
      vel.copy(forward).multiplyScalar(STAR_SPEED).add(carry);
      vel.y += 2;
    }
    const star = mesh(starGeo, starMat, scene, origin.x, origin.y, origin.z);
    stars.push({ mesh: star, vel, life: STAR_LIFE, stuck: false, fromX: origin.x, fromZ: origin.z });
  }

  function slashAt(position) {
    for (const target of targets) {
      if (Math.hypot(target.x - position.x, target.z - position.z) < SLASH_REACH) knock(target, 'slash', 0);
    }
  }

  function stepStar(star, dt) {
    const p = star.mesh.position;
    star.vel.y -= STAR_GRAVITY * dt;
    p.addScaledVector(star.vel, dt);
    star.mesh.rotation.y += 32 * dt;
    for (const target of targets) {
      if (target.state !== 'up') continue;
      if (Math.hypot(target.x - p.x, TARGET_Y - p.y, target.z - p.z) < HIT_RADIUS) {
        knock(target, 'star', Math.hypot(target.x - star.fromX, target.z - star.fromZ));
        star.life = 0;
        return;
      }
    }
    if (p.y < 0.04) {
      p.y = 0.04;
      star.mesh.rotation.x = 1.1;
      star.stuck = true;
    }
  }

  function update(dt, rider) {
    for (const target of targets) {
      const down = target.state === 'down';
      if (down || target.gold) {
        // a knocked target moves on after a moment; a gold one also leaves if nobody hits it
        target.timer -= dt;
        if (target.timer <= 0) place(target, rider);
      }
      target.tilt.rotation.x = damp(target.tilt.rotation.x, target.state === 'down' ? -1.45 : 0, 9, dt);
      target.tilt.scale.setScalar(damp(target.tilt.scale.x, 1, 8, dt));
    }
    for (let i = stars.length - 1; i >= 0; i--) {
      const star = stars[i];
      star.life -= dt;
      // two half steps keep a fast star from tunnelling through a target
      for (let n = 0; n < 2 && !star.stuck && star.life > 0; n++) stepStar(star, dt / 2);
      if (star.life <= 0) {
        scene.remove(star.mesh);
        stars.splice(i, 1);
      }
    }
  }

  function reset(rider) {
    for (const star of stars) scene.remove(star.mesh);
    stars.length = 0;
    for (const target of targets) target.gold = false;
    for (const target of targets) place(target, rider);
  }

  reset({ x: 0, z: 0 });
  return { targets, throwStar, slashAt, update, reset };
}
