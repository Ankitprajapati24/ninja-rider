import * as THREE from 'three';
import { mat, mesh } from './util.js';

const HORIZON = 0xf0c9a2;
const ZENITH = 0x2d6ecf;
const SUN_OFFSET = new THREE.Vector3(-30, 38, -22);
const PETALS = 500, PETAL_BOX = 22;

// small seeded generator so the landscape is the same on every load
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function grassTexture(rand) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#4c7437';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    const l = 24 + rand() * 20, h = 85 + rand() * 30;
    g.fillStyle = `hsla(${h}, 38%, ${l}%, 0.5)`;
    g.fillRect(rand() * 256, rand() * 256, 1 + rand() * 2, 2 + rand() * 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(110, 110);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function petalTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  g.ellipse(16, 16, 14, 8, 0.6, 0, Math.PI * 2);
  g.fill();
  return new THREE.CanvasTexture(c);
}

export function createWorld(scene) {
  const rand = seeded(7);
  const obstacles = [];
  const isFree = (x, z, r) => obstacles.every((o) => Math.hypot(o.x - x, o.z - z) >= o.r + r);

  scene.fog = new THREE.Fog(HORIZON, 50, 360);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(ZENITH) }, bottom: { value: new THREE.Color(HORIZON) } },
    vertexShader: `varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        gl_FragColor = vec4(mix(bottom, top, pow(h, 0.42)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  scene.add(sky);
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(16, 20, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff1cf, fog: false, toneMapped: false }));
  sunDisc.position.copy(SUN_OFFSET).normalize().multiplyScalar(560);
  sky.add(sunDisc);

  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x56613d, 0.75));
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -26; sc.right = sc.top = 26; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), mat(0xffffff, 1, 0, { map: grassTexture(rand) }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // --- torii gate and stone lanterns ahead of the start
  const vermilion = mat(0xb3261e, 0.6), black = mat(0x17110f, 0.6), stone = mat(0x8b8b84, 0.95);
  const glow = mat(0xffd9a0, 0.6, 0, { emissive: 0xffa544, emissiveIntensity: 2.2 });
  const GATE_Z = 26;
  for (const s of [1, -1]) {
    mesh(new THREE.CylinderGeometry(0.2, 0.24, 5, 16), vermilion, scene, s * 2.6, 2.5, GATE_Z);
    mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.4, 16), black, scene, s * 2.6, 0.2, GATE_Z);
    obstacles.push({ x: s * 2.6, z: GATE_Z, r: 0.35 });
    const lx = s * 3.6, lz = GATE_Z - 7;
    mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.2, 6), stone, scene, lx, 0.1, lz);
    mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.0, 8), stone, scene, lx, 0.7, lz);
    mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), glow, scene, lx, 1.35, lz).castShadow = false;
    mesh(new THREE.ConeGeometry(0.42, 0.3, 4), stone, scene, lx, 1.65, lz).rotation.y = Math.PI / 4;
    const lamp = new THREE.PointLight(0xffa850, 10, 14);
    lamp.position.set(lx, 1.4, lz);
    scene.add(lamp);
    obstacles.push({ x: lx, z: lz, r: 0.4 });
  }
  mesh(new THREE.BoxGeometry(6.0, 0.26, 0.3), vermilion, scene, 0, 4.1, GATE_Z);
  mesh(new THREE.BoxGeometry(7.0, 0.3, 0.42), vermilion, scene, 0, 5.05, GATE_Z);
  mesh(new THREE.BoxGeometry(7.6, 0.16, 0.56), black, scene, 0, 5.28, GATE_Z);

  // --- scattered trees and rocks (instanced)
  const dummy = new THREE.Object3D();
  const inst = (geometry, material, count) => {
    const im = new THREE.InstancedMesh(geometry, material, count);
    im.castShadow = im.receiveShadow = true;
    scene.add(im);
    return im;
  };
  const put = (im, i, x, y, z, sx, sy, sz, ry = 0) => {
    dummy.position.set(x, y, z);
    dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(0, ry, 0);
    dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
  };
  // picks free spots in a ring, keeping the start area and the gate avenue clear
  const scatter = (count, rMin, rMax, radius, place) => {
    let n = 0;
    for (let tries = 0; n < count && tries < count * 40; tries++) {
      const a = rand() * Math.PI * 2, d = rMin + (rMax - rMin) * Math.sqrt(rand());
      const x = Math.sin(a) * d, z = Math.cos(a) * d;
      if ((Math.abs(x) < 5 && z > 0 && z < 45) || !isFree(x, z, radius + 1.2)) continue;
      obstacles.push({ x, z, r: radius });
      place(n++, x, z);
    }
    return n;
  };

  const bark = mat(0x4a3526, 0.95), needles = mat(0x24492c, 0.9), blossom = mat(0xf3a9c0, 0.85);
  const SAKURA = 16, PINES = 110, ROCKS = 34;
  const sTrunks = inst(new THREE.CylinderGeometry(0.14, 0.24, 2.4, 8), bark, SAKURA);
  const sCrowns = inst(new THREE.IcosahedronGeometry(1, 1), blossom, SAKURA * 4);
  const sakuraPlaced = scatter(SAKURA, 20, 44, 0.3, (i, x, z) => {
    const k = 0.85 + rand() * 0.5;
    put(sTrunks, i, x, 1.2 * k, z, k, k, k);
    for (let j = 0; j < 4; j++) {
      const a = (j / 4) * Math.PI * 2 + rand(), r = j === 0 ? 0 : 0.95 * k, size = (1.05 + rand() * 0.5) * k;
      put(sCrowns, i * 4 + j, x + Math.sin(a) * r, (2.9 + rand() * 0.6) * k, z + Math.cos(a) * r, size, size * 0.8, size, a);
    }
  });
  const pTrunks = inst(new THREE.CylinderGeometry(0.16, 0.3, 2.6, 8), bark, PINES);
  const pTiers = inst(new THREE.ConeGeometry(1.5, 2.6, 9), needles, PINES * 3);
  const pinesPlaced = scatter(PINES, 46, 170, 0.4, (i, x, z) => {
    const k = 0.9 + rand() * 1.1;
    put(pTrunks, i, x, 1.3 * k, z, k, k, k);
    for (let j = 0; j < 3; j++) {
      const w = (1.25 - j * 0.3) * k;
      put(pTiers, i * 3 + j, x, (2.7 + j * 1.45) * k, z, w, k, w, rand() * 3);
    }
  });
  const rocks = inst(new THREE.DodecahedronGeometry(0.7, 0), mat(0x77756f, 0.95, 0, { flatShading: true }), ROCKS);
  rocks.count = scatter(ROCKS, 10, 120, 0.8, (i, x, z) => {
    const k = 0.5 + rand() * 0.8;
    put(rocks, i, x, 0.2 * k, z, k * (0.8 + rand() * 0.6), k * 0.7, k, rand() * 6);
  });
  // draw only the instances that found a free spot
  sTrunks.count = sakuraPlaced; sCrowns.count = sakuraPlaced * 4;
  pTrunks.count = pinesPlaced; pTiers.count = pinesPlaced * 3;

  // two hazy ridgelines on the horizon; unlit and unfogged so they read as flat silhouettes
  [{ color: 0xc9b6b4, dist: 430, count: 22, height: 70 }, { color: 0xa9a3b3, dist: 370, count: 26, height: 42 }].forEach((ridge) => {
    const haze = new THREE.MeshBasicMaterial({ color: ridge.color, fog: false });
    for (let i = 0; i < ridge.count; i++) {
      const a = (i / ridge.count) * Math.PI * 2 + rand() * 0.2, h = ridge.height * (0.45 + rand() * 0.55);
      const hill = new THREE.Mesh(new THREE.ConeGeometry(h * (2.2 + rand() * 1.6), h, 24), haze);
      hill.position.set(Math.sin(a) * ridge.dist, h / 2 - 1, Math.cos(a) * ridge.dist);
      scene.add(hill);
    }
  });

  // --- drifting cherry petals that wrap around the rider
  const petalPos = new Float32Array(PETALS * 3);
  for (let i = 0; i < PETALS * 3; i++) petalPos[i] = (rand() - 0.5) * 2 * PETAL_BOX;
  const petalGeo = new THREE.BufferGeometry();
  petalGeo.setAttribute('position', new THREE.BufferAttribute(petalPos, 3));
  const petals = new THREE.Points(petalGeo, new THREE.PointsMaterial({
    color: 0xff9fbd, size: 0.1, map: petalTexture(), transparent: true, opacity: 0.9, depthWrite: false }));
  petals.frustumCulled = false;
  scene.add(petals);
  const wrap = (v, c, half) => c + ((((v - c + half) % (2 * half)) + 2 * half) % (2 * half)) - half;

  function update(dt, t, center, camera) {
    sky.position.copy(camera.position);
    sun.position.copy(center).add(SUN_OFFSET);
    sun.target.position.copy(center);
    for (let i = 0; i < PETALS; i++) {
      const k = i * 3;
      petalPos[k] = wrap(petalPos[k] + Math.sin(t * 0.8 + i) * 0.5 * dt, center.x, PETAL_BOX);
      petalPos[k + 1] = wrap(petalPos[k + 1] - (0.35 + (i % 7) * 0.06) * dt, 7, 7);
      petalPos[k + 2] = wrap(petalPos[k + 2] + Math.cos(t * 0.6 + i * 1.3) * 0.4 * dt, center.z, PETAL_BOX);
    }
    petalGeo.attributes.position.needsUpdate = true;
  }

  return { obstacles, isFree, update };
}
