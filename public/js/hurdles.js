import * as THREE from 'three';
import { mat, mesh, pivot, damp } from './util.js';

const COUNT = 6, HALF_WIDTH = 1.7, BAR_Y = 0.85, CLEAR_HEIGHT = 0.5, COOLDOWN = 6;

// Jumps scattered round the field. Crossing between the posts in the air clears one;
// crossing on the ground knocks the bar off.
export function createHurdles(scene, world, onEvent) {
  const white = mat(0xf1ece0, 0.7), red = mat(0xb3261e, 0.6), spent = mat(0x8d877c, 0.8);
  const postGeo = new THREE.CylinderGeometry(0.07, 0.08, 1.15, 10);
  const capGeo = new THREE.SphereGeometry(0.1, 12, 8);
  const barGeo = new THREE.CylinderGeometry(0.045, 0.045, HALF_WIDTH * 2, 10);
  barGeo.rotateZ(Math.PI / 2);

  const list = [];
  for (let i = 0, tries = 0; i < COUNT && tries < 400; tries++) {
    const a = Math.random() * Math.PI * 2, d = 16 + Math.random() * 36;
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    if ((Math.abs(x) < 6 && z > 0 && z < 45) || !world.isFree(x, z, 3.2)) continue;
    const yaw = Math.random() * Math.PI;
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const group = pivot(scene, x, 0, z);
    group.rotation.y = yaw;
    for (const s of [1, -1]) {
      mesh(postGeo, white, group, s * HALF_WIDTH, 0.575, 0);
      mesh(capGeo, red, group, s * HALF_WIDTH, 1.18, 0);
      world.obstacles.push({ x: x + s * HALF_WIDTH * cos, z: z - s * HALF_WIDTH * sin, r: 0.15 });
    }
    // reserves the approach so nothing else spawns in it; riders pass straight through
    world.obstacles.push({ x, z, r: 2.4, soft: true });
    const bar = mesh(barGeo, red, group, 0, BAR_Y, 0);
    list.push({ x, z, sin, cos, bar, cooldown: 0, fallen: false, lastSide: null });
    i++;
  }

  function reset() {
    for (const h of list) {
      h.cooldown = 0;
      h.fallen = false;
      h.lastSide = null;
      h.bar.material = red;
      h.bar.position.y = BAR_Y;
      h.bar.rotation.y = 0;
    }
  }

  // rider: { x, z, y }
  function update(dt, rider) {
    for (const h of list) {
      const dx = rider.x - h.x, dz = rider.z - h.z;
      const along = dx * h.cos - dz * h.sin;   // position along the bar
      const side = dx * h.sin + dz * h.cos;    // signed distance from the bar's line
      const crossed = h.lastSide !== null && h.lastSide * side < 0 && Math.abs(h.lastSide) < 3;
      h.lastSide = side;
      if (crossed && h.cooldown === 0 && Math.abs(along) < HALF_WIDTH - 0.2) {
        h.cooldown = COOLDOWN;
        h.fallen = rider.y < CLEAR_HEIGHT;
        h.bar.material = spent;
        onEvent(h.fallen ? 'knock' : 'clear', h);
      }
      if (h.cooldown > 0) {
        h.cooldown = Math.max(0, h.cooldown - dt);
        if (h.cooldown === 0) { h.fallen = false; h.bar.material = red; }
      }
      h.bar.position.y = damp(h.bar.position.y, h.fallen ? 0.06 : BAR_Y, 10, dt);
      h.bar.rotation.y = damp(h.bar.rotation.y, h.fallen ? 0.5 : 0, 10, dt);
    }
  }

  return { list, update, reset };
}
