// ─────────────────────────────────────────────────────────────
// Player — momentum-based carve physics + procedural rider mesh
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { CFG, clamp, damp } from './config.js';
import { heightAt, slopeAlong } from './world.js';

function shadowTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(20,30,60,0.55)');
  grad.addColorStop(1, 'rgba(20,30,60,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  return t;
}

export function buildRider({ suit = 0x1b2330, accent = 0x59e6ff, board = 0x0e1420, boardTop = 0x59e6ff, tofu = true } = {}) {
  const g = new THREE.Group();

  // board — points along -z (forward)
  const boardG = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 1.62),
    new THREE.MeshLambertMaterial({ color: board }));
  deck.position.y = 0.09;
  boardG.add(deck);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.02, 1.5),
    new THREE.MeshBasicMaterial({ color: boardTop, transparent: true, opacity: 0.9 }));
  stripe.position.y = 0.12;
  boardG.add(stripe);
  for (const zs of [-0.78, 0.78]) {
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.045, 10, 1, false, 0, Math.PI),
      new THREE.MeshLambertMaterial({ color: board }));
    tip.rotation.z = Math.PI / 2;
    tip.rotation.y = zs > 0 ? Math.PI / 2 : -Math.PI / 2;
    tip.position.set(0, 0.09, zs);
    boardG.add(tip);
  }
  g.add(boardG);

  // rider rig — stands sideways on the board
  const rig = new THREE.Group();
  rig.position.y = 0.12;
  rig.rotation.y = -Math.PI / 2 * 0.78; // sideways stance
  const suitMat = new THREE.MeshLambertMaterial({ color: suit });
  const accentMat = new THREE.MeshBasicMaterial({ color: accent });

  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.42, 3, 8), suitMat);
  legL.position.set(-0.26, 0.36, 0); legL.rotation.z = 0.18;
  const legR = legL.clone(); legR.position.x = 0.26; legR.rotation.z = -0.18;
  rig.add(legL, legR);

  const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.18, 3, 10), suitMat);
  hips.position.y = 0.66; hips.rotation.z = Math.PI / 2;
  rig.add(hips);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.4, 4, 10), suitMat);
  torso.position.y = 1.0;
  rig.add(torso);

  const stripeT = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.28), accentMat);
  stripeT.position.y = 1.05;
  rig.add(stripeT);

  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.4, 3, 8), suitMat);
  armL.position.set(-0.32, 1.02, 0); armL.rotation.z = 1.05;
  const armR = armL.clone(); armR.position.x = 0.32; armR.rotation.z = -1.05;
  rig.add(armL, armR);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 12),
    new THREE.MeshLambertMaterial({ color: 0xe8ecf2 }));
  head.position.y = 1.42;
  rig.add(head);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 8, 0, Math.PI * 2, 0.9, 0.7), accentMat);
  visor.position.y = 1.44;
  visor.rotation.x = -0.15;
  rig.add(visor);

  let tofuBox = null;
  if (tofu) {
    tofuBox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.24),
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x445566, emissiveIntensity: 0.35 }));
    tofuBox.position.set(0, 1.08, 0.24);
    rig.add(tofuBox);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.3),
      new THREE.MeshBasicMaterial({ color: accent }));
    strap.position.set(0, 1.08, 0.24);
    rig.add(strap);
  }

  g.add(rig);
  return { group: g, boardG, rig, tofuBox };
}

export class Player {
  constructor(scene) {
    this.scene = scene;
    const r = buildRider({});
    this.group = r.group;
    this.boardG = r.boardG;
    this.rig = r.rig;
    scene.add(this.group);

    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);

    this.reset();
  }

  reset() {
    this.x = 0; this.z = -6;
    this.y = heightAt(0, -6);
    this.prevGroundY = this.y;
    this.heading = 0;       // 0 = straight downhill (-z)
    this.speed = 0;
    this.vy = 0;
    this.lean = 0;
    this.grounded = true;
    this.inPowder = false;
    this.airTime = 0;
    this.carveIntensity = 0;
    this.crashed = false;
    this.landedImpact = 0;  // set for one frame on landing
    this.justLaunched = false;
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.set(0, 0, 0);
    this.rig.position.y = 0.12;
    this.rig.rotation.set(0, -Math.PI / 2 * 0.78, 0);
  }

  update(dt, input, boosting) {
    const p = this;
    p.prevX = p.x; p.prevZ = p.z;
    p.landedImpact = 0;
    p.justLaunched = false;

    if (!p.crashed) {
      // lean has momentum: follows input, never instant
      p.lean += (clamp(input.lean, -1, 1) - p.lean) * damp(CFG.leanResponse, dt);

      if (p.grounded) {
        const speedFac = p.speed / (p.speed + 9);
        const turnRate = p.lean * CFG.turnRate * speedFac;
        p.heading += turnRate * dt;
        // soft clamp — you can traverse but never ride back uphill
        p.heading = clamp(p.heading, -CFG.maxHeading, CFG.maxHeading);
        // at crawl speed, gravity re-orients the board downhill
        if (p.speed < 4) p.heading *= 1 - damp(1.6, dt) * ((4 - p.speed) / 4);

        p.inPowder = Math.abs(p.x) > CFG.pisteHalf + 0.5;
        p.carveIntensity = clamp(Math.abs(turnRate) * (p.speed / 30), 0, 2);

        let a = CFG.accel * Math.cos(p.heading);
        const dragMul = boosting ? CFG.boostDragMul : 1;
        a -= CFG.drag * dragMul * p.speed * p.speed;
        a -= CFG.carveScrub * Math.abs(turnRate) * p.speed * 0.32;
        if (p.inPowder) {
          const depth = clamp((Math.abs(p.x) - CFG.pisteHalf) / (CFG.powderEdge - CFG.pisteHalf), 0, 1.4);
          a -= CFG.powderDrag * (0.4 + depth) * p.speed;
        }
        if (boosting) a += CFG.boostThrust;
        p.speed = Math.max(0.5, p.speed + a * dt);
      } else {
        p.airTime += dt;
        p.carveIntensity = 0;
        // airborne: momentum preserved, tiny air drag, mild air steering
        p.speed = Math.max(0, p.speed - 0.02 * p.speed * dt);
        p.heading += p.lean * 0.35 * dt;
      }

      const fx = Math.sin(p.heading), fz = -Math.cos(p.heading);
      p.x += fx * p.speed * dt;
      p.z += fz * p.speed * dt;
    } else {
      // crashed: tumble to a stop
      p.speed = Math.max(0, p.speed - 22 * dt);
      const fx = Math.sin(p.heading), fz = -Math.cos(p.heading);
      p.x += fx * p.speed * dt;
      p.z += fz * p.speed * dt;
      p.carveIntensity = 0;
    }

    // vertical
    const g = heightAt(p.x, p.z);
    p.vy -= CFG.gravity * dt;
    const predY = p.y + p.vy * dt;
    if (p.grounded) {
      if (predY <= g + 0.35) {
        p.y = g;
        p.vy = (g - p.prevGroundY) / Math.max(dt, 1e-4);
        p.prevGroundY = g;
      } else {
        p.grounded = false;
        p.airTime = 0;
        p.justLaunched = p.vy > 1.5;
        p.y = predY;
      }
    } else {
      p.y = predY;
      if (p.y <= g) {
        p.y = g;
        const impact = -p.vy - 7;
        p.grounded = true;
        p.vy = 0;
        p.prevGroundY = g;
        if (impact > 0 && !p.crashed) {
          p.speed *= Math.max(0.6, 1 - impact * 0.022);
          p.landedImpact = impact;
        }
      }
    }

    this._pose(dt, boosting);
  }

  _pose(dt, boosting) {
    const p = this;
    p.group.position.set(p.x, p.y, p.z);
    p.group.rotation.order = 'YXZ';
    p.group.rotation.y = -p.heading;

    let pitch;
    if (p.grounded) {
      pitch = Math.atan(slopeAlong(p.x, p.z, p.heading));
    } else {
      // slight nose-up style in the air
      pitch = clamp(p.vy * 0.03, -0.35, 0.3);
    }
    p.group.rotation.x += (pitch - p.group.rotation.x) * damp(10, dt);
    p.group.rotation.z += ((-p.lean * 0.5) - p.group.rotation.z) * damp(8, dt);

    // rider crouch + counter-lean
    const crouch = boosting ? 0.14 : clamp(p.speed / 70, 0, 0.1);
    p.rig.position.y += ((0.12 - crouch) - p.rig.position.y) * damp(6, dt);
    p.rig.rotation.z = -p.lean * 0.32;
    p.rig.rotation.x = p.grounded ? 0 : 0.18;

    if (p.crashed) {
      p.group.rotation.z += dt * 9;
      p.group.rotation.x += dt * 5;
      p.rig.rotation.z += dt * 4;
    }

    // blob shadow
    const gY = heightAt(p.x, p.z);
    const air = clamp(p.y - gY, 0, 8);
    this.shadow.position.set(p.x, gY + 0.05, p.z);
    this.shadow.material.opacity = 0.6 * (1 - air / 9);
    const s = 1 + air * 0.1;
    this.shadow.scale.set(s, s, 1);
  }
}
