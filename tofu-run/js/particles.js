// ─────────────────────────────────────────────────────────────
// Particles — pooled additive point sprites (snow spray, orb
// bursts, boost trail) + camera-space speed lines
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { clamp } from './config.js';

function puffTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 32;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 1, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(cv);
}

export class Sparks {
  constructor(scene, capacity = 1000) {
    this.cap = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.baseCol = new Float32Array(capacity * 3);
    this.grav = new Float32Array(capacity);
    this.head = 0;

    for (let i = 0; i < capacity; i++) this.pos[i * 3 + 1] = -9999;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.42, map: puffTexture(), vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, r, g, b, life = 0.7, grav = 8) {
    const i = this.head;
    this.head = (this.head + 1) % this.cap;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.baseCol[i * 3] = r; this.baseCol[i * 3 + 1] = g; this.baseCol[i * 3 + 2] = b;
    this.life[i] = life; this.maxLife[i] = life; this.grav[i] = grav;
  }

  burst(x, y, z, n, r, g, b, speed = 5, life = 0.6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.emit(x, y, z,
        Math.cos(a) * Math.cos(e) * s, Math.abs(Math.sin(e)) * s + 1.5, Math.sin(a) * Math.cos(e) * s,
        r, g, b, life * (0.6 + Math.random() * 0.6), 6);
    }
  }

  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -9999;
        this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0;
        continue;
      }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = clamp(this.life[i] / this.maxLife[i], 0, 1);
      this.col[i * 3] = this.baseCol[i * 3] * f;
      this.col[i * 3 + 1] = this.baseCol[i * 3 + 1] * f;
      this.col[i * 3 + 2] = this.baseCol[i * 3 + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  reset() {
    for (let i = 0; i < this.cap; i++) {
      this.life[i] = 0;
      this.pos[i * 3 + 1] = -9999;
      this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0;
    }
  }
}

// camera-attached streaks that sell velocity at high speed / boost
export class SpeedLines {
  constructor(camera) {
    this.n = 26;
    this.offsets = [];
    const pos = new Float32Array(this.n * 2 * 3);
    const spawn = () => {
      // keep a clear window in the center of the frame
      const a = Math.random() * Math.PI * 2;
      const r = 4.5 + Math.random() * 6.5;
      return {
        x: Math.cos(a) * r * 1.5,
        y: Math.sin(a) * r * 0.7,
        z: -6 - Math.random() * 24,
        s: 0.6 + Math.random() * 0.8,
      };
    };
    this._spawn = spawn;
    for (let i = 0; i < this.n; i++) this.offsets.push(spawn());
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.LineBasicMaterial({
      color: 0xcdeeff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    });
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 5;
    camera.add(this.lines);
  }

  update(dt, speed, boosting) {
    const strength = clamp((speed - 33) / 12, 0, 1) * 0.16 + (boosting ? 0.32 : 0);
    this.mat.opacity += (strength - this.mat.opacity) * clamp(dt * 6, 0, 1);
    if (this.mat.opacity < 0.015) { this.lines.visible = false; return; }
    this.lines.visible = true;
    const pos = this.lines.geometry.attributes.position;
    const len = clamp(speed * 0.09, 0.5, 4.2) * (boosting ? 1.6 : 1);
    for (let i = 0; i < this.n; i++) {
      const o = this.offsets[i];
      o.z += speed * dt * o.s * 1.4;
      if (o.z > -4) {
        const fresh = this._spawn();
        o.x = fresh.x; o.y = fresh.y; o.z = -26 - Math.random() * 8; o.s = fresh.s;
      }
      pos.setXYZ(i * 2, o.x, o.y, o.z - len);
      pos.setXYZ(i * 2 + 1, o.x, o.y, o.z);
    }
    pos.needsUpdate = true;
  }
}
