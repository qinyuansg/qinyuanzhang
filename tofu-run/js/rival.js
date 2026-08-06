// ─────────────────────────────────────────────────────────────
// Rival — a chaser that follows your line with rubber-band AI
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { CFG, clamp, damp } from './config.js';
import { heightAt, slopeAlong } from './world.js';
import { buildRider } from './player.js';

export class Rival {
  constructor(scene) {
    const r = buildRider({ suit: 0x30090e, accent: 0xff3b4e, board: 0x1a0508, boardTop: 0xff3b4e, tofu: false });
    this.group = r.group;
    this.rig = r.rig;
    scene.add(this.group);
    this.trail = [];       // {z, x} — player's recorded line (z descending)
    this.reset();
  }

  reset() {
    this.gap = CFG.rivalStartGap;   // meters behind the player (in z)
    this.trail.length = 0;
    this.surgeT = 26;               // seconds until first surge
    this.surging = 0;
    this.time = 0;
    this.caught = false;
    this.group.position.set(0, heightAt(0, CFG.rivalStartGap - 6), CFG.rivalStartGap - 6);
  }

  record(player) {
    const t = this.trail;
    if (!t.length || player.z < t[t.length - 1].z - 0.7) {
      t.push({ z: player.z, x: player.x });
      // keep ~250 m of history
      while (t.length > 2 && t[0].z > player.z + 250) t.shift();
    }
  }

  update(dt, player, boosting, events) {
    this.time += dt;
    this.record(player);

    // surge drama every ~30-40 s
    this.surgeT -= dt;
    if (this.surgeT <= 0 && this.surging <= 0 && this.gap < 80) {
      this.surging = 5;
      this.surgeT = 30 + Math.random() * 12;
      events.onSurge?.();
    }
    if (this.surging > 0) this.surging -= dt;

    // rubber-band: far away → faster; player boosting → falls back
    let rivalSpeed = 28.5 + clamp(this.gap - 40, -30, 60) * 0.055;
    if (this.surging > 0) rivalSpeed += 7;
    if (boosting) rivalSpeed -= 4;
    // grace period: the rival needs ~12 s to get up to full pace
    rivalSpeed *= clamp(this.time / 12, 0.25, 1);
    const playerDownhill = player.speed * Math.cos(player.heading);
    let closing = playerDownhill - rivalSpeed;
    if (closing < -3.2) closing = -3.2;   // it can never dive-bomb you
    this.gap += closing * dt;
    this.gap = clamp(this.gap, 0, 110);

    if (this.gap <= CFG.rivalCatch && !this.caught && !player.crashed) {
      this.caught = true;
      events.onCatch?.();
    }

    // place on the player's recorded line, `gap` meters uphill
    const rz = player.z + this.gap;
    let rx = 0;
    const t = this.trail;
    if (t.length) {
      rx = t[0].x;
      for (let i = t.length - 1; i > 0; i--) {
        if (t[i - 1].z >= rz && t[i].z <= rz) {
          const a = t[i - 1], b = t[i];
          const f = (a.z - rz) / Math.max(a.z - b.z, 1e-4);
          rx = a.x + (b.x - a.x) * f;
          break;
        }
        if (t[t.length - 1].z > rz) rx = t[t.length - 1].x;
      }
    }
    // when closing in, pull out of your slipstream so you can see it
    const peek = clamp((22 - this.gap) * 0.28, 0, 5);
    rx += peek * Math.sin(this.time * 0.8) * 0.4 + peek * 0.6;

    const ry = heightAt(rx, rz);
    const px = this.group.position.x;
    const headEst = Math.atan2(rx - px, Math.max(0.6, this.group.position.z - rz));
    this.group.position.x += (rx - px) * damp(6, dt);
    this.group.position.z = rz;
    this.group.position.y += (ry - this.group.position.y) * damp(14, dt);

    this.group.rotation.order = 'YXZ';
    this.group.rotation.y = -headEst;
    this.group.rotation.x = Math.atan(slopeAlong(rx, rz, headEst));
    this.group.rotation.z = -Math.sin(this.time * 1.7) * 0.18;
    this.rig.rotation.z = -Math.sin(this.time * 1.7) * 0.22;
  }
}
