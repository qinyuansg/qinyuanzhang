// ─────────────────────────────────────────────────────────────
// TOFU RUN — main loop, states, camera, input, gamification
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { CFG, clamp, lerp, damp } from './config.js';
import { World, heightAt } from './world.js';
import { Player } from './player.js';
import { Rival } from './rival.js';
import { Entities } from './entities.js';
import { Sparks, SpeedLines } from './particles.js';
import { AudioSys } from './audio.js';
import { HUD } from './hud.js';

// ---------- renderer / scene ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdde8f6, 70, 520);

const camera = new THREE.PerspectiveCamera(CFG.fovBase, window.innerWidth / window.innerHeight, 0.1, 6000);
scene.add(camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- systems ----------
const world = new World(scene);
const player = new Player(scene);
const rival = new Rival(scene);
const entities = new Entities(scene);
const sparks = new Sparks(scene, 1100);
const speedLines = new SpeedLines(camera);
const audio = new AudioSys();
const hud = new HUD();

// ---------- game state ----------
const G = {
  state: 'menu',
  time: 0,
  meter: 30,
  boostT: 0,
  deliveries: 0,
  orbsCollected: 0,
  topSpeed: 0,
  combo: 0,
  comboT: 0,
  countdownT: 0,
  countdownStep: -1,
  crashT: 0,
  crashReason: '',
  timescale: 1,
  milestone: 500,
  best: parseFloat(localStorage.getItem('tofurun.best') || '0'),
  bestDeliveries: parseInt(localStorage.getItem('tofurun.bestDel') || '0', 10),
  muted: false,
};
hud.setMenuBest(G.best);

// ---------- input ----------
const input = { lean: 0, left: false, right: false };
let lastSpaceTap = -10;

function tryBoost() {
  if (G.state !== 'run' || player.crashed) return;
  if (G.boostT > 0) { G.boostT = Math.min(G.boostT + 1.2, CFG.boostTime); return; }
  if (G.meter >= CFG.boostCost) {
    G.meter -= CFG.boostCost;
    G.boostT = CFG.boostTime;
    audio.boost();
    hud.boostFlash();
    hud.announce('BOOST', 'boost', 800);
  } else {
    audio.boostDenied();
  }
}

function onSpace() {
  const now = performance.now() / 1000;
  if (G.state === 'menu') { startCountdown(); return; }
  if (G.state === 'gameover') { restart(); return; }
  if (G.state === 'paused') { unpause(); return; }
  if (now - lastSpaceTap < 0.32) tryBoost();
  lastSpaceTap = now;
}

window.addEventListener('keydown', e => {
  audio.ensure();
  if (e.repeat) {
    if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space'].includes(e.code)) e.preventDefault();
    return;
  }
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': input.left = true; e.preventDefault(); break;
    case 'ArrowRight': case 'KeyD': input.right = true; e.preventDefault(); break;
    case 'Space': onSpace(); e.preventDefault(); break;
    case 'KeyR':
      if (G.state === 'run' || G.state === 'gameover' || G.state === 'crash') restart();
      break;
    case 'KeyP': case 'Escape':
      if (G.state === 'run') pause();
      else if (G.state === 'paused') unpause();
      break;
    case 'KeyM':
      G.muted = !G.muted;
      audio.setMuted(G.muted);
      hud.announce(G.muted ? 'MUTED' : 'SOUND ON', '', 800);
      break;
  }
});
window.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = false;
});

// touch: hold left/right half to carve, double-tap to boost/start
let lastTouchTap = -10;
window.addEventListener('touchstart', e => {
  audio.ensure();
  const now = performance.now() / 1000;
  if (G.state === 'menu') { startCountdown(); return; }
  if (G.state === 'gameover') { restart(); return; }
  if (now - lastTouchTap < 0.32) tryBoost();
  lastTouchTap = now;
  for (const t of e.changedTouches) {
    if (t.clientX < window.innerWidth / 2) input.left = true;
    else input.right = true;
  }
}, { passive: true });
window.addEventListener('touchend', e => {
  for (const t of e.changedTouches) {
    if (t.clientX < window.innerWidth / 2) input.left = false;
    else input.right = false;
  }
}, { passive: true });

document.getElementById('startBtn').addEventListener('click', () => {
  audio.ensure();
  startCountdown();
});

// ---------- state transitions ----------
function startCountdown() {
  resetRun();
  G.state = 'countdown';
  G.countdownT = 0;
  G.countdownStep = -1;
  hud.show('countdown');
}

function resetRun() {
  world.reset();
  entities.reset();
  sparks.reset();
  player.reset();
  rival.reset();
  G.time = 0; G.meter = 30; G.boostT = 0;
  G.deliveries = 0; G.orbsCollected = 0; G.topSpeed = 0;
  G.combo = 0; G.comboT = 0; G.timescale = 1;
  G.milestone = 500;
  camPos.set(player.x, player.y + 3, player.z + 10);
  camLook.set(player.x, player.y + 1, player.z);
}

function restart() { startCountdown(); }

function pause() {
  G.state = 'paused';
  hud.show('paused');
}
function unpause() {
  G.state = 'run';
  hud.show('none');
}

function gameOver(reason) {
  G.state = 'gameover';
  const dist = -player.z;
  const isRecord = dist > G.best;
  if (isRecord) {
    G.best = dist;
    localStorage.setItem('tofurun.best', String(dist));
  }
  if (G.deliveries > G.bestDeliveries) {
    G.bestDeliveries = G.deliveries;
    localStorage.setItem('tofurun.bestDel', String(G.deliveries));
  }
  hud.setMenuBest(G.best);
  const m = Math.floor(G.time / 60), s = (G.time % 60).toFixed(1);
  hud.gameOver(reason, [
    ['DISTANCE', `${Math.round(dist).toLocaleString()} m`],
    ['RUN TIME', `${m}:${String(s).padStart(4, '0')}`],
    ['TOP SPEED', `${Math.round(G.topSpeed * 3.6)} km/h`],
    ['TOFU DELIVERED', `${G.deliveries}`],
    ['ORBS', `${G.orbsCollected}`],
  ], isRecord);
}

const GHOST = new URLSearchParams(location.search).has('ghost'); // dev flag: no crashes

function crash(reason) {
  if (GHOST || player.crashed) return;
  player.crashed = true;
  G.state = 'crash';
  G.crashT = 0;
  G.crashReason = reason === 'skier' ? 'YOU TOOK OUT A SKIER'
    : reason === 'tree' ? 'YOU HIT A PINE TREE'
    : `YOU CRASHED INTO ${reason.toUpperCase()}`;
  audio.crash();
  sparks.burst(player.x, player.y + 0.6, player.z, 70, 1, 1, 1, 9, 0.9);
  sparks.burst(player.x, player.y + 0.4, player.z, 25, 0.6, 0.85, 1, 6, 1.1);
}

// ---------- entity callbacks ----------
const callbacks = {
  collectOrb(pos) {
    G.comboT = 2.4;
    G.combo += 1;
    const mult = 1 + Math.min(G.combo - 1, 8) * 0.25;
    G.meter = clamp(G.meter + CFG.orbFill * mult, 0, CFG.meterMax);
    G.orbsCollected += 1;
    audio.orb(G.combo - 1);
    hud.combo(G.combo);
    sparks.burst(pos.x, pos.y, pos.z, 16, 0.55, 0.95, 1, 5, 0.5);
  },
  crash,
  delivery(gate) {
    G.deliveries += 1;
    G.meter = clamp(G.meter + 16, 0, CFG.meterMax);
    rival.gap = clamp(rival.gap + 7, 0, 110);
    audio.delivery();
    hud.announce('TOFU DELIVERED  +1', 'good');
    entities.deliverAnim(new THREE.Vector3(player.x, player.y + 1.1, player.z), gate);
  },
  missedGate() {
    rival.gap = clamp(rival.gap - 8, 0, 110);
    audio.missed();
    hud.announce('DROP MISSED — RIVAL CLOSES IN', 'bad');
  },
  tofuArrived(pos) {
    sparks.burst(pos.x, pos.y, pos.z, 22, 0.6, 1, 1, 5, 0.6);
  },
};

const rivalEvents = {
  onSurge() {
    audio.surge();
    hud.announce('RIVAL SURGE', 'bad', 1400);
  },
  onCatch() {
    crash('rival');
    G.crashReason = 'THE RIVAL SNATCHED YOUR TOFU';
  },
};

// ---------- camera ----------
const camPos = new THREE.Vector3(0, 6, 14);
const camLook = new THREE.Vector3(0, 0, 0);
const tmpV = new THREE.Vector3();
let fov = CFG.fovBase;

function updateCamera(dt) {
  const p = player;
  const fx = Math.sin(p.heading), fz = -Math.cos(p.heading);
  const rx = -fz, rz = fx; // right vector

  if (G.state === 'menu') {
    const a = G.time * 0.22;
    tmpV.set(p.x + Math.sin(a) * 9, p.y + 2.4, p.z + Math.cos(a) * 9);
    tmpV.y = Math.max(tmpV.y, heightAt(tmpV.x, tmpV.z) + 1.2);
    camPos.lerp(tmpV, damp(2.5, dt));
    camLook.lerp(new THREE.Vector3(p.x, p.y + 1, p.z), damp(4, dt));
    fov = lerp(fov, 55, damp(3, dt));
  } else if (G.state === 'countdown') {
    const t = clamp(G.countdownT / 3.2, 0, 1);
    const e = t * t * (3 - 2 * t);
    // sweep: hero close-up → chase position
    const from = new THREE.Vector3(p.x - 5, p.y + 1.4, p.z - 6);
    const to = new THREE.Vector3(p.x - fx * CFG.camDist + rx * 0, p.y + CFG.camHeight, p.z - fz * CFG.camDist);
    camPos.lerpVectors(from, to, e);
    camLook.set(p.x, p.y + 1.2, p.z);
    fov = lerp(48, CFG.fovBase, e);
  } else if (G.state === 'crash' || G.state === 'gameover') {
    tmpV.set(camPos.x, camPos.y + dt * 1.2, camPos.z);
    camPos.copy(tmpV);
    camLook.lerp(new THREE.Vector3(p.x, p.y + 0.8, p.z), damp(5, dt));
    fov = lerp(fov, 60, damp(1.5, dt));
  } else {
    const boosting = G.boostT > 0;
    const speedN = clamp(p.speed / 40, 0, 1.2);
    const dist = CFG.camDist + speedN * 2.2 + (boosting ? 0.9 : 0);
    const height = CFG.camHeight + speedN * 0.6;
    // swing wide through turns
    const swing = -p.lean * 2.1;
    tmpV.set(
      p.x - fx * dist + rx * swing,
      p.y + height,
      p.z - fz * dist + rz * swing
    );
    // keep camera above terrain
    const minY = heightAt(tmpV.x, tmpV.z) + 1.1;
    if (tmpV.y < minY) tmpV.y = minY;
    camPos.lerp(tmpV, damp(5.2, dt));
    tmpV.set(p.x + fx * 9, p.y + 1.3 + p.vy * 0.04, p.z + fz * 9);
    camLook.lerp(tmpV, damp(8, dt));
    const targetFov = CFG.fovBase + speedN * 14 + (boosting ? 13 : 0);
    fov = lerp(fov, targetFov, damp(4, dt));
    // powder judder
    if (p.inPowder && p.grounded && p.speed > 8) {
      camPos.x += (Math.random() - 0.5) * 0.06;
      camPos.y += (Math.random() - 0.5) * 0.06;
    }
  }

  camera.position.copy(camPos);
  camera.lookAt(camLook);
  camera.rotateZ(-player.lean * 0.045);
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

// ---------- spray ----------
function emitSpray(dt) {
  const p = player;
  if (!p.grounded || p.crashed) return;
  const carve = p.carveIntensity;
  const speedN = p.speed / 40;
  const boosting = G.boostT > 0;

  const fx = Math.sin(p.heading), fz = -Math.cos(p.heading);
  const rx = -fz, rz = fx;
  const side = Math.sign(p.lean) || 1;

  // hard carving → big white fan of snow
  const n = Math.floor(carve * carve * 130 * dt * (0.5 + speedN)) + (p.inPowder ? Math.floor(60 * dt * speedN) : 0);
  for (let i = 0; i < n; i++) {
    const back = 0.4 + Math.random() * 0.5;
    const jitter = (Math.random() - 0.5) * 0.4;
    const px = p.x - fx * back + rx * (side * 0.35 + jitter);
    const pz = p.z - fz * back + rz * (side * 0.35 + jitter);
    const spread = carve * (2.5 + Math.random() * 3.5);
    sparks.emit(
      px, p.y + 0.15, pz,
      rx * side * spread - fx * (1 + Math.random() * 2),
      1.4 + Math.random() * (2 + carve * 2.2),
      rz * side * spread - fz * (1 + Math.random() * 2),
      0.95, 0.97, 1.0,
      0.45 + Math.random() * 0.4, 9
    );
  }

  if (boosting) {
    for (let i = 0; i < Math.floor(240 * dt); i++) {
      sparks.emit(
        p.x - fx * 0.8 + (Math.random() - 0.5) * 0.3,
        p.y + 0.25 + Math.random() * 0.3,
        p.z - fz * 0.8 + (Math.random() - 0.5) * 0.3,
        -fx * (4 + Math.random() * 4), 0.5 + Math.random(), -fz * (4 + Math.random() * 4),
        0.35, 0.9, 1.0, 0.35 + Math.random() * 0.25, 2
      );
    }
  }
}

// ---------- main loop ----------
let lastT = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;

  if (G.state === 'paused') { renderer.render(scene, camera); return; }

  // slow-mo on crash
  if (G.state === 'crash') {
    G.timescale = lerp(G.timescale, 0.28, damp(6, dt));
    G.crashT += dt;
    if (G.crashT > 1.25) {
      G.timescale = 1;
      gameOver(G.crashReason);
    }
  } else {
    G.timescale = lerp(G.timescale, 1, damp(6, dt));
  }
  const sdt = dt * G.timescale;
  G.time += G.state === 'run' ? sdt : dt;

  // countdown sequencing
  if (G.state === 'countdown') {
    G.countdownT += dt;
    const step = Math.floor(G.countdownT);
    if (step !== G.countdownStep) {
      G.countdownStep = step;
      const labels = ['3', '2', '1', 'DROP'];
      if (step < 4) {
        hud.countdown(labels[step], step === 3);
        audio.countdown(step === 3);
      }
    }
    if (G.countdownT >= 3.7) {
      G.state = 'run';
      G.time = 0;
      hud.show('none');
    }
  }

  input.lean = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  const boosting = G.boostT > 0;
  if (G.state === 'run' || G.state === 'crash') {
    if (G.boostT > 0) G.boostT -= sdt;

    player.update(sdt, input, boosting);

    if (player.justLaunched && !player.crashed) audio.launch();
    if (player.landedImpact > 2) {
      audio.land(player.landedImpact);
      sparks.burst(player.x, player.y + 0.2, player.z, Math.floor(player.landedImpact * 3), 0.95, 0.97, 1, 4.5, 0.5);
    }

    if (G.state === 'run') {
      G.topSpeed = Math.max(G.topSpeed, player.speed);
      G.combo = G.comboT > 0 ? G.combo : 0;
      G.comboT -= sdt;

      rival.update(sdt, player, boosting, rivalEvents);
      entities.update(sdt, player, world, callbacks);

      // distance milestones
      if (-player.z > G.milestone) {
        hud.announce(`${G.milestone.toLocaleString()} m`, 'mile', 1100);
        audio.milestone();
        G.milestone += 500;
      }
    }
    emitSpray(sdt);
  } else if (G.state === 'menu') {
    // idle rider sway on the start line
    player.rig.rotation.z = Math.sin(G.time * 1.2) * 0.05;
  }

  world.update(sdt, player, camera);
  sparks.update(sdt);
  speedLines.update(dt, G.state === 'run' ? player.speed : 0, boosting);
  updateCamera(dt);

  audio.update(dt, {
    speed: G.state === 'run' ? player.speed : 0,
    carve: player.carveIntensity,
    grounded: player.grounded,
    powder: player.inPowder,
    boosting,
  });

  if (G.state === 'run' || G.state === 'crash') {
    hud.update({
      speed: player.speed, time: G.time, dist: -player.z,
      deliveries: G.deliveries, meter: G.meter,
      boosting, rivalGap: rival.gap,
    });
  }

  renderer.render(scene, camera);
}

hud.show('menu');
requestAnimationFrame(frame);

// dev/debug handle (also used by the automated smoke test)
window.__tofu = { player, rival, G, world, entities, heightAt };
