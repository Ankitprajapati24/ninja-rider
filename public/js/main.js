import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clamp, damp, smoothstep, stretch, mat } from './util.js';
import { createWorld } from './world.js';
import { createHorse } from './horse.js';
import { createNinja } from './ninja.js';
import { createCombat } from './combat.js';
import { createHurdles } from './hurdles.js';
import { createOrbs } from './orbs.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createGame } from './game.js';
import { createHud } from './hud.js';
import { createApi } from './api.js';
import { createUi } from './ui.js';

const WALK = 1.7, TROT = 4.3, GALLOP = 12;
const ACCEL = 5, BRAKE = 6.5, JUMP_SPEED = 5.4, GRAVITY = 13, REAR_TIME = 1.9;
const WORLD_RADIUS = 185, RIDER_RADIUS = 0.55;
const SLASH_POINTS = 250, STAR_POINTS = 100, RANGE_BONUS = 5, MAX_RANGE_BONUS = 150;
const GOLD_FACTOR = 3, GOLD_TIME = 5, HURDLE_POINTS = 150, ORB_POINTS = 75, HIGH_ORB_POINTS = 125, STUMBLE = 0.35;
const BASE_FOV = 50, GALLOP_FOV = 58;
const UP = new THREE.Vector3(0, 1, 0);
const ONE_SHOT = { Space: 'jump', KeyR: 'rear', KeyF: 'slash', KeyG: 'throw' };
const SCROLL_KEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const TARGET_CHIPS = [0xc9b27a, 0xb3261e, 0xe9dfc8, 0x6e5236];

function start() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 1200);
  camera.position.set(4.4, 2.9, -6.4);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.6, 0);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minDistance = 3;
  controls.maxDistance = 28;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.autoRotateSpeed = 0.7;
  let dragging = false, chaseHold = 0;
  controls.addEventListener('start', () => { dragging = true; });
  controls.addEventListener('end', () => { dragging = false; chaseHold = 1.5; });

  const rider = { x: 0, z: 0, y: 0, vy: 0, yaw: 0, speed: 0, turn: 0, rearT: -1, grounded: true };
  const motion = { stride: 0, rear: 0, tuck: 0, pitch: 0, turn: 0 };
  const forward = new THREE.Vector3(0, 0, 1);
  const handPos = new THREE.Vector3(), bitPos = new THREE.Vector3(), offset = new THREE.Vector3(), follow = new THREE.Vector3();
  const bladeBase = new THREE.Vector3(), bladeTip = new THREE.Vector3();
  const keys = new Set();

  // --- world, actors and game rules
  const audio = createAudio();
  const api = createApi();
  const hud = createHud();
  const effects = createEffects(scene, camera);
  const world = createWorld(scene);
  const hurdles = createHurdles(scene, world, onHurdle);
  const combat = createCombat(scene, world, onTargetHit);
  const orbs = createOrbs(scene, world, onOrb);
  const horse = createHorse();
  scene.add(horse.root);
  const ninja = createNinja({
    onStrike: () => combat.slashAt(horse.root.position),
    onRelease: () => {
      ninja.throwHand.getWorldPosition(handPos);
      combat.throwStar(handPos, forward, offset.copy(forward).multiplyScalar(rider.speed));
      audio.throwStar();
    },
  });
  horse.saddle.add(ninja.root);
  const game = createGame(audio, {
    onStart: resetRound,
    onEnd: (result) => {
      keys.clear();
      ui.roundOver(result);
    },
    banner: hud.banner,
  });
  const ui = createUi({ api, game, audio });
  api.visit();

  const reinGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 6);
  const reinMat = mat(0x1d1410, 0.6);
  const reins = horse.bits.map(() => {
    const rein = new THREE.Mesh(reinGeo, reinMat);
    scene.add(rein);
    return rein;
  });

  const scoreLabel = ({ points, mult }) => `+${points}${mult > 1 ? ` ×${mult}` : ''}`;

  function onTargetHit(hit) {
    effects.burst(hit.x, 1.75, hit.z, TARGET_CHIPS, 26, 5);
    effects.shake(hit.kind === 'slash' ? 0.25 : 0.12);
    if (game.state !== 'playing') return;
    let base = hit.kind === 'slash' ? SLASH_POINTS
      : STAR_POINTS + Math.min(MAX_RANGE_BONUS, Math.round(hit.distance) * RANGE_BONUS);
    const stats = game.stats();
    stats.targets++;
    if (hit.gold) {
      base *= GOLD_FACTOR;
      stats.gold++;
      game.addTime(GOLD_TIME);
      effects.sparkle(hit.x, 1.75, hit.z, 0xffd75a, 40, 6);
      audio.gold();
    } else {
      audio.hit();
    }
    const label = scoreLabel(game.award(base)) + (hit.gold ? ` +${GOLD_TIME}s` : '');
    hud.popup(label, hit.x, 2.3, hit.z, hit.gold ? 'gold' : '');
  }

  function onHurdle(type, hurdle) {
    if (game.state !== 'playing') return;
    if (type === 'clear') {
      game.stats().hurdles++;
      hud.popup(scoreLabel(game.award(HURDLE_POINTS)), hurdle.x, 2.2, hurdle.z);
      effects.sparkle(hurdle.x, 1.2, hurdle.z, 0xfff3d6, 18, 3);
      audio.clear();
    } else {
      game.breakCombo();
      rider.speed *= STUMBLE;
      hud.popup('Knocked!', hurdle.x, 1.8, hurdle.z, 'miss');
      effects.burst(hurdle.x, 0.8, hurdle.z, [0xb3261e, 0xf1ece0], 16, 3);
      effects.shake(0.35);
      audio.knock();
    }
  }

  function onOrb(orb) {
    const high = orb.y >= orbs.HIGH;
    game.stats().orbs++;
    hud.popup(scoreLabel(game.award(high ? HIGH_ORB_POINTS : ORB_POINTS)), orb.x, orb.y + 0.5, orb.z, 'orb');
    effects.sparkle(orb.x, orb.y, orb.z, 0x8fe3ff, 30, 4);
    audio.orb();
  }

  function resetRound() {
    Object.assign(rider, { x: 0, z: 0, y: 0, vy: 0, yaw: 0, speed: 0, turn: 0, rearT: -1, grounded: true });
    keys.clear();
    hud.clear();
    hurdles.reset();
    combat.reset(rider);
    orbs.reset(rider);
    camera.position.set(2.4, 3.1, -7.6);
    controls.target.set(0, 1.6, 0);
    chaseHold = 0;
  }
  orbs.reset(rider);

  // --- input: keyboard and the on-screen buttons share one key set
  const held = (...codes) => game.state === 'playing' && codes.some((code) => keys.has(code));
  function press(code) {
    const action = ONE_SHOT[code];
    if (action === 'jump' && rider.grounded && rider.rearT < 0) {
      rider.vy = JUMP_SPEED;
      rider.grounded = false;
      audio.jump();
    } else if (action === 'rear' && rider.grounded && rider.rearT < 0 && rider.speed < 2.5) {
      rider.rearT = 0;
    } else if (action === 'slash' && !ninja.busy) {
      ninja.slash();
      audio.slash();
    } else if (action === 'throw' && !ninja.busy) {
      ninja.throwStar();
    }
  }

  // the first tap or key anywhere is allowed to start sound
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', (e) => {
    // typing a name or feedback must not steer the horse
    if (ui.dialogOpen || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (SCROLL_KEYS.includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    audio.unlock();
    if (e.code === 'Enter' && game.state === 'over' && !e.target.closest?.('button')) return ui.playAgain();
    if (e.code === 'KeyP' || e.code === 'Escape') return game.state === 'paused' ? game.resume() : game.pause();
    if (e.code === 'KeyM') return ui.toggleMute();
    if (game.state !== 'playing') return;
    keys.add(e.code);
    press(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); game.pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause(); });
  for (const button of document.querySelectorAll('button[data-key]')) {
    const code = button.dataset.key;
    const release = () => { keys.delete(code); button.classList.remove('down'); };
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (game.state !== 'playing') return;
      button.setPointerCapture(e.pointerId);
      button.classList.add('down');
      keys.add(code);
      press(code);
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function moveRider(dt) {
    const rearing = rider.rearT >= 0;
    let target = 0;
    if (!rearing) {
      if (held('ShiftLeft', 'ShiftRight')) target = GALLOP;
      else if (held('KeyW', 'ArrowUp')) target = TROT;
      else if (held('KeyS', 'ArrowDown')) target = WALK;
    }
    const rate = (target > rider.speed ? ACCEL : BRAKE) * dt;
    rider.speed += clamp(target - rider.speed, -rate, rate);

    const steer = rearing ? 0 : (held('KeyA', 'ArrowLeft') ? 1 : 0) - (held('KeyD', 'ArrowRight') ? 1 : 0);
    rider.turn = damp(rider.turn, steer, 6, dt);
    const agility = (rider.grounded ? 1 : 0.35) * (1.5 - 0.5 * smoothstep(0, GALLOP, rider.speed));
    rider.yaw += rider.turn * agility * dt;
    forward.set(Math.sin(rider.yaw), 0, Math.cos(rider.yaw));
    rider.x += forward.x * rider.speed * dt;
    rider.z += forward.z * rider.speed * dt;

    for (const o of world.obstacles) {
      if (o.soft) continue;
      const dx = rider.x - o.x, dz = rider.z - o.z;
      const d = Math.hypot(dx, dz), min = o.r + RIDER_RADIUS;
      if (d < min && d > 1e-4) {
        rider.x += (dx / d) * (min - d);
        rider.z += (dz / d) * (min - d);
      }
    }
    const far = Math.hypot(rider.x, rider.z);
    if (far > WORLD_RADIUS) {
      rider.x *= WORLD_RADIUS / far;
      rider.z *= WORLD_RADIUS / far;
    }

    if (!rider.grounded) {
      rider.vy -= GRAVITY * dt;
      rider.y += rider.vy * dt;
      if (rider.y <= 0) {
        rider.y = 0; rider.vy = 0; rider.grounded = true;
        audio.land();
        effects.puff(rider.x - forward.x * 0.5, rider.z - forward.z * 0.5, 1.2, 7);
        effects.shake(0.08);
      }
    }
    if (rearing) {
      rider.rearT += dt / REAR_TIME;
      if (rider.rearT >= 1) rider.rearT = -1;
    }
    const u = Math.max(0, rider.rearT);
    motion.rear = smoothstep(0, 0.3, u) * (1 - smoothstep(0.72, 1, u));
    motion.tuck = damp(motion.tuck, rider.grounded ? 0 : clamp(rider.y / 0.6, 0, 1), 12, dt);
    motion.pitch = damp(motion.pitch, rider.grounded ? 0 : clamp(-rider.vy * 0.045, -0.3, 0.3), 10, dt);
    motion.turn = rider.turn;
    // stepping in place while turning on the spot
    motion.stride = Math.max(rider.speed, Math.abs(rider.turn) * 0.9);

    horse.root.position.set(rider.x, rider.y, rider.z);
    horse.root.rotation.set(0, rider.yaw, -rider.turn * rider.speed * 0.018);
  }

  function moveCamera(dt) {
    follow.set(rider.x, 1.6 + rider.y * 0.5, rider.z);
    camera.position.add(offset.copy(follow).sub(controls.target));
    controls.target.copy(follow);
    chaseHold = Math.max(0, chaseHold - dt);
    if (!dragging && chaseHold === 0 && rider.speed > 0.8) {
      // ease the camera round to sit behind the rider
      offset.copy(camera.position).sub(follow);
      const diff = rider.yaw + Math.PI - Math.atan2(offset.x, offset.z);
      const wrapped = Math.atan2(Math.sin(diff), Math.cos(diff));
      offset.applyAxisAngle(UP, wrapped * (1 - Math.exp(-1.4 * dt)) * smoothstep(0.8, 4, rider.speed));
      camera.position.copy(follow).add(offset);
    }
    controls.update();
    // a slightly wider view at a gallop sells the speed
    const fov = damp(camera.fov, BASE_FOV + (GALLOP_FOV - BASE_FOV) * smoothstep(TROT, GALLOP, rider.speed), 3, dt);
    if (Math.abs(fov - camera.fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  const readout = { speed: document.getElementById('speed'), gait: document.getElementById('gait') };
  let shownSpeed = -1, shownGait = '';
  function updateReadout() {
    const kmh = Math.round(rider.speed * 3.6);
    const gait = rider.rearT >= 0 ? 'rearing' : !rider.grounded ? 'airborne'
      : rider.speed < 0.15 ? 'standing' : rider.speed < 2.6 ? 'walk' : rider.speed < 6.2 ? 'trot' : 'gallop';
    if (kmh !== shownSpeed) { shownSpeed = kmh; readout.speed.textContent = `${kmh} km/h`; }
    if (gait !== shownGait) { shownGait = gait; readout.gait.textContent = gait; }
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  let time = 0, lastSteps = 0;
  renderer.setAnimationLoop(() => {
    const frame = Math.min(clock.getDelta(), 0.05);
    // a paused game freezes the simulation but the camera can still be orbited
    const dt = game.state === 'paused' ? 0 : frame;
    time += dt;
    game.update(dt);
    const playing = game.state === 'playing';
    if (dt > 0) {
      moveRider(dt);
      horse.update(dt, time, motion);
      horse.root.updateMatrixWorld(true);
      ninja.update(dt, time, motion, horse.gait);
      horse.root.updateMatrixWorld(true);
      ninja.reinHand.getWorldPosition(handPos);
      horse.bits.forEach((bit, i) => stretch(reins[i], bit.getWorldPosition(bitPos), handPos));
      ninja.bladeBase.getWorldPosition(bladeBase);
      ninja.bladeTip.getWorldPosition(bladeTip);
      effects.updateTrail(ninja.swinging, bladeBase, bladeTip);
      if (playing) hurdles.update(dt, rider);
      combat.update(dt, rider);
      orbs.update(dt, time, rider, playing);
      effects.update(dt);
      if (horse.gait.steps !== lastSteps) {
        lastSteps = horse.gait.steps;
        if (rider.grounded) {
          if (playing) audio.hoof(smoothstep(0, GALLOP, rider.speed));
          if (rider.speed > TROT) effects.puff(rider.x - forward.x * 0.7, rider.z - forward.z * 0.7, 0.6, 1);
        }
      }
    }
    world.update(dt, time, horse.root.position, camera);
    controls.autoRotate = game.state === 'menu' || game.state === 'over';
    effects.removeShake();
    moveCamera(frame);
    effects.applyShake(frame);
    hud.updatePopups(dt, camera);
    if (playing || game.state === 'countdown') {
      hud.drawRadar(rider, combat.targets, hurdles.list, orbs.list);
      updateReadout();
    }
    renderer.render(scene, camera);
  });
  window.__started = true;
}

try {
  start();
} catch (err) {
  console.error(err);
  document.getElementById('errorText').textContent = err.message;
  document.getElementById('error').hidden = false;
}
