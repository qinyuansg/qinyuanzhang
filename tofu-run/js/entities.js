// ─────────────────────────────────────────────────────────────
// Entities — glowing boost orbs, slow skiers, tofu delivery
// gates, flying-tofu delivery animation, collision checks
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { CFG, hash, clamp } from './config.js';
import { heightAt, kickerInfo, KICK } from './world.js';

// squared distance from point (px,pz) to the segment the player swept this frame
function sweptDist2(px, pz, player) {
  const ax = player.prevX ?? player.x, az = player.prevZ ?? player.z;
  const dx = player.x - ax, dz = player.z - az;
  const L2 = dx * dx + dz * dz || 1e-9;
  let t = ((px - ax) * dx + (pz - az) * dz) / L2;
  t = clamp(t, 0, 1);
  const qx = ax + dx * t - px, qz = az + dz * t - pz;
  return qx * qx + qz * qz;
}

function glowTex(inner, outer) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, inner); grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bannerTex(text) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
  const g = cv.getContext('2d');
  // dark glass panel so it reads against bright snow and sky
  g.fillStyle = 'rgba(8,18,32,0.72)';
  if (g.roundRect) { g.beginPath(); g.roundRect(2, 2, 508, 92, 18); g.fill(); }
  else g.fillRect(2, 2, 508, 92);
  g.strokeStyle = 'rgba(70,220,255,0.95)';
  g.lineWidth = 3;
  if (g.roundRect) { g.beginPath(); g.roundRect(4, 4, 504, 88, 16); g.stroke(); }
  else g.strokeRect(4, 4, 504, 88);
  g.font = '700 42px -apple-system, "SF Pro Display", Helvetica, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (g.letterSpacing !== undefined) g.letterSpacing = '10px';
  g.fillStyle = 'rgba(150,240,255,1)';
  g.fillText(text, 260, 52);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SKIER_COLORS = [0xd7263d, 0x1f6feb, 0x2fa14f, 0xe8842c, 0x8250df];

function buildSkier(seed) {
  const g = new THREE.Group();
  const col = SKIER_COLORS[Math.floor(hash(seed) * SKIER_COLORS.length)];
  const jacket = new THREE.MeshLambertMaterial({ color: col });
  const dark = new THREE.MeshLambertMaterial({ color: 0x23272e });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.55, 4, 10), jacket);
  body.position.y = 0.95; g.add(body);
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.4, 3, 8), dark);
  legs.position.y = 0.45; g.add(legs);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0xe9d8c8 }));
  head.position.y = 1.48; g.add(head);
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 8, 0, Math.PI * 2, 0, 1.1), jacket);
  hat.position.y = 1.52; g.add(hat);
  for (const sx of [-0.16, 0.16]) {
    const ski = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.04, 1.85), dark);
    ski.position.set(sx, 0.05, -0.15);
    g.add(ski);
  }
  return g;
}

export class Entities {
  constructor(scene) {
    this.scene = scene;
    this.orbGeo = new THREE.SphereGeometry(0.48, 14, 12);
    this.orbMat = new THREE.MeshBasicMaterial({ color: 0x8ff0ff });
    this.orbGlowMat = new THREE.SpriteMaterial({
      map: glowTex('rgba(120,235,255,1)', 'rgba(60,190,255,0)'),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    });
    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0x6feaff, transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.beamGeo = new THREE.CylinderGeometry(0.1, 0.16, 5.5, 8, 1, true);
    this.pylonMat = new THREE.MeshLambertMaterial({ color: 0xdfe9f2, emissive: 0x1c4a5c, emissiveIntensity: 0.6 });
    this.pylonGlowMat = new THREE.MeshBasicMaterial({
      color: 0x6feaff, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.bannerMat = new THREE.MeshBasicMaterial({
      map: bannerTex('TOFU  DROP'), transparent: true, side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.tofuGeo = new THREE.BoxGeometry(0.34, 0.3, 0.24);
    this.tofuMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.reset();
  }

  reset() {
    if (this.orbs) {
      for (const o of this.orbs) this.scene.remove(o.group);
      for (const s of this.skiers) this.scene.remove(s.group);
      for (const gt of this.gates) this.scene.remove(gt.group);
      for (const f of this.flying) this.scene.remove(f.mesh);
    }
    this.orbs = [];
    this.skiers = [];
    this.gates = [];
    this.flying = [];
    this.orbCursor = -130;
    this.skierCursor = -200;
    this.gateCursor = -380;
    this.time = 0;
  }

  // ---------- spawning ----------
  _spawnOrbLine(z) {
    let seed = Math.floor(-z * 3.1);
    const rnd = () => hash(seed++ * 2.13);
    const n = 5 + Math.floor(rnd() * 3);
    const x0 = (rnd() * 2 - 1) * 9;
    const curve = (rnd() * 2 - 1) * 4;
    for (let i = 0; i < n; i++) {
      const zz = z - i * 6;
      const xx = clamp(x0 + Math.sin(i / (n - 1) * Math.PI) * curve, -CFG.pisteHalf + 2, CFG.pisteHalf - 2);
      // keep clear of kicker lips (awkward mid-air placement)
      const gi = Math.round((-zz - 150) / KICK.spacing);
      const k = kickerInfo(gi);
      if (k && zz < k.z0 - KICK.len && zz > k.z0 - KICK.len - 14) continue;
      const group = new THREE.Group();
      const core = new THREE.Mesh(this.orbGeo, this.orbMat);
      const glow = new THREE.Sprite(this.orbGlowMat);
      glow.scale.setScalar(3.4);
      const beam = new THREE.Mesh(this.beamGeo, this.beamMat);
      beam.position.y = 2.4;
      group.add(core, glow, beam);
      const baseY = heightAt(xx, zz) + 1.15;
      group.position.set(xx, baseY, zz);
      this.scene.add(group);
      this.orbs.push({ group, x: xx, z: zz, baseY, phase: i * 0.7 });
    }
  }

  _spawnSkier(z) {
    let seed = Math.floor(-z * 5.7);
    const rnd = () => hash(seed++ * 3.31);
    const group = buildSkier(seed);
    const x0 = (rnd() * 2 - 1) * 10;
    const skier = {
      group, x0, x: x0, z,
      vz: -(6.5 + rnd() * 4.5),
      weaveA: 2 + rnd() * 3,
      weaveW: 0.5 + rnd() * 0.5,
      phase: rnd() * 6.28,
    };
    group.position.set(x0, heightAt(x0, z), z);
    this.scene.add(group);
    this.skiers.push(skier);
  }

  _spawnGate(z) {
    const group = new THREE.Group();
    const gx = CFG.pisteHalf - 1.5;
    for (const sx of [-gx, gx]) {
      const y = heightAt(sx, z);
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 6.5, 10), this.pylonMat);
      pylon.position.set(sx, y + 3.25, z);
      group.add(pylon);
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 6.6, 6), this.pylonGlowMat);
      core.position.set(sx, y + 3.3, z);
      group.add(core);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), this.pylonGlowMat);
      tip.position.set(sx, y + 6.6, z);
      group.add(tip);
    }
    const midY = heightAt(0, z);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 1.9), this.bannerMat);
    banner.position.set(0, midY + 6.4, z);
    group.add(banner);
    this.scene.add(group);
    this.gates.push({ group, banner, z, done: false });
  }

  deliverAnim(from, gate) {
    const mesh = new THREE.Mesh(this.tofuGeo, this.tofuMat);
    mesh.position.copy(from);
    this.scene.add(mesh);
    const gx = CFG.pisteHalf - 1.5;
    const sx = from.x < 0 ? -gx : gx;
    const target = new THREE.Vector3(sx, heightAt(sx, gate.z) + 5.8, gate.z);
    this.flying.push({ mesh, from: from.clone(), to: target, t: 0 });
  }

  // ---------- per-frame ----------
  update(dt, player, world, cb) {
    this.time += dt;
    const pz = player.z;

    // spawn ahead
    while (this.orbCursor > pz - 520) {
      this.orbCursor -= 95 + hash(Math.floor(-this.orbCursor) * 1.3) * 70;
      this._spawnOrbLine(this.orbCursor);
    }
    while (this.skierCursor > pz - 520) {
      this.skierCursor -= 110 + hash(Math.floor(-this.skierCursor) * 2.9) * 90;
      if (hash(Math.floor(-this.skierCursor) * 4.7) < 0.82) this._spawnSkier(this.skierCursor);
    }
    while (this.gateCursor > pz - 700) {
      this._spawnGate(this.gateCursor);
      this.gateCursor -= 460 + hash(Math.floor(-this.gateCursor)) * 140;
    }

    // orbs: bob, spin, collect, cull
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      if (o.z > pz + 25) { this.scene.remove(o.group); this.orbs.splice(i, 1); continue; }
      o.group.position.y = o.baseY + Math.sin(this.time * 3 + o.phase) * 0.22;
      o.group.rotation.y += dt * 2;
      const dy = o.group.position.y - player.y;
      if (sweptDist2(o.x, o.z, player) < 2.9 && Math.abs(dy) < 2.4) {
        cb.collectOrb(o.group.position.clone());
        this.scene.remove(o.group);
        this.orbs.splice(i, 1);
      }
    }

    // skiers: glide + weave, crash check, cull
    for (let i = this.skiers.length - 1; i >= 0; i--) {
      const s = this.skiers[i];
      if (s.z > pz + 40) { this.scene.remove(s.group); this.skiers.splice(i, 1); continue; }
      s.z += s.vz * dt;
      const prevX = s.x;
      s.x = clamp(s.x0 + Math.sin(this.time * s.weaveW + s.phase) * s.weaveA, -CFG.pisteHalf + 1, CFG.pisteHalf - 1);
      const y = heightAt(s.x, s.z);
      s.group.position.set(s.x, y, s.z);
      s.group.rotation.y = Math.atan2(s.x - prevX, -s.vz * dt || 1e-4) * 0.7;
      s.group.rotation.z = Math.sin(this.time * s.weaveW + s.phase) * 0.08;

      if (!player.crashed) {
        if (sweptDist2(s.x, s.z, player) < 1.3 && player.y < y + 2.0) cb.crash('skier');
      }
    }

    // trees + scenery collision
    if (!player.crashed && player.grounded !== null) {
      for (const t of world.nearTrees(player.x, player.z)) {
        const rr = t.r + 0.45;
        if (sweptDist2(t.x, t.z, player) < rr * rr && player.y < t.top) {
          cb.crash('tree');
          break;
        }
      }
      if (!player.crashed) {
        for (const s of world.sceneryCollidables(player.z)) {
          if (sweptDist2(s.x, s.z, player) < s.r * s.r) { cb.crash(s.label); break; }
        }
      }
    }

    // gates: delivery trigger / missed, pulse, cull
    for (let i = this.gates.length - 1; i >= 0; i--) {
      const gt = this.gates[i];
      if (gt.z > pz + 60) { this.scene.remove(gt.group); this.gates.splice(i, 1); continue; }
      gt.banner.position.y += Math.sin(this.time * 1.8) * dt * 0.35;
      const sc = 1 + Math.sin(this.time * 2.4) * 0.02;
      gt.banner.scale.set(sc, sc, 1);
      if (!gt.done && !player.crashed) {
        if (player.z <= gt.z + 1.2 && player.z >= gt.z - 3.5) {
          gt.done = true;
          if (Math.abs(player.x) < CFG.pisteHalf - 1) cb.delivery(gt);
          else cb.missedGate(gt);
        } else if (player.z < gt.z - 3.5) {
          gt.done = true;
          cb.missedGate(gt);
        }
      }
    }

    // flying tofu delivery animation
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt * 2.1;
      if (f.t >= 1) {
        cb.tofuArrived?.(f.to);
        this.scene.remove(f.mesh);
        this.flying.splice(i, 1);
        continue;
      }
      const t = f.t;
      f.mesh.position.lerpVectors(f.from, f.to, t);
      f.mesh.position.y += Math.sin(t * Math.PI) * 3.2;
      f.mesh.rotation.x += dt * 7;
      f.mesh.rotation.y += dt * 5;
    }
  }
}
