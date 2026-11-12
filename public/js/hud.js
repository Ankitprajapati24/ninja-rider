import * as THREE from 'three';

const RADAR_RANGE = 60, POPUP_LIFE = 1.1, POPUP_RISE = 1.4, BANNER_TIME = 1100;
const _v = new THREE.Vector3();

// Floating score text over the world, a centre-screen banner, and a heading-up radar.
export function createHud() {
  const layer = document.getElementById('popups');
  const canvas = document.getElementById('radar');
  const g = canvas.getContext('2d');
  const size = canvas.clientWidth || 120;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvas.height = size * dpr;
  const popups = [];
  const bannerEl = document.getElementById('banner');
  let bannerTimer = 0;

  // Big centred text for the countdown, combo levels and warnings. Restarting the CSS animation
  // needs a reflow between removing and re-adding the class.
  function banner(text, kind = '') {
    bannerEl.textContent = text;
    bannerEl.className = '';
    void bannerEl.offsetWidth;
    bannerEl.className = `show ${kind}`;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { bannerEl.className = ''; }, BANNER_TIME);
  }

  function popup(text, x, y, z, kind = '') {
    const el = document.createElement('div');
    el.className = `popup ${kind}`;
    el.textContent = text;
    layer.appendChild(el);
    popups.push({ el, pos: new THREE.Vector3(x, y, z), age: 0 });
  }

  function clear() {
    for (const p of popups) p.el.remove();
    popups.length = 0;
  }

  function updatePopups(dt, camera) {
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.age += dt;
      if (p.age >= POPUP_LIFE) {
        p.el.remove();
        popups.splice(i, 1);
        continue;
      }
      const k = p.age / POPUP_LIFE;
      _v.copy(p.pos);
      _v.y += k * POPUP_RISE;
      _v.project(camera);
      const visible = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
      p.el.style.opacity = visible ? String(1 - k * k) : '0';
      p.el.style.transform = `translate(-50%, -50%) translate(${((_v.x + 1) / 2) * window.innerWidth}px, ${((1 - _v.y) / 2) * window.innerHeight}px)`;
    }
  }

  // Rider-relative position on the radar; anything out of range sits on the rim.
  function plot(x, z, rider, sin, cos) {
    const dx = x - rider.x, dz = z - rider.z;
    let ahead = dx * sin + dz * cos, left = dx * cos - dz * sin;
    const dist = Math.hypot(ahead, left);
    if (dist > RADAR_RANGE) { ahead *= RADAR_RANGE / dist; left *= RADAR_RANGE / dist; }
    const scale = (size / 2 - 8) / RADAR_RANGE;
    return [size / 2 - left * scale, size / 2 - ahead * scale];
  }

  function drawRadar(rider, targets, hurdles, orbs) {
    const sin = Math.sin(rider.yaw), cos = Math.cos(rider.yaw), c = size / 2;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    g.fillStyle = 'rgba(13, 15, 20, 0.62)';
    g.strokeStyle = 'rgba(244, 234, 216, 0.25)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(c, c, c - 1, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(c, c, (c - 8) / 2, 0, Math.PI * 2);
    g.stroke();

    g.fillStyle = '#f4ead8';
    for (const h of hurdles) {
      const [px, py] = plot(h.x, h.z, rider, sin, cos);
      g.globalAlpha = h.cooldown > 0 ? 0.3 : 0.9;
      g.fillRect(px - 4, py - 1.5, 8, 3);
    }
    g.globalAlpha = 1;
    g.fillStyle = '#8fe3ff';
    for (const o of orbs) {
      if (!o.active) continue;
      const [px, py] = plot(o.x, o.z, rider, sin, cos);
      g.beginPath();
      g.arc(px, py, 2.5, 0, Math.PI * 2);
      g.fill();
    }
    for (const t of targets) {
      if (t.state !== 'up') continue;
      const [px, py] = plot(t.x, t.z, rider, sin, cos);
      g.globalAlpha = 1;
      g.fillStyle = t.gold ? '#ffd75a' : '#ff5a4d';
      g.beginPath();
      g.arc(px, py, t.gold ? 4.5 : 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#f4ead8';
    g.beginPath();
    g.moveTo(c, c - 7);
    g.lineTo(c + 5, c + 5);
    g.lineTo(c - 5, c + 5);
    g.closePath();
    g.fill();
  }

  return { popup, banner, clear, updatePopups, drawRadar };
}
