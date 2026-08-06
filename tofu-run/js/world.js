// ─────────────────────────────────────────────────────────────
// World — endless slope terrain, kickers, piste glow rails,
// alpine village scenery, peaks, sky, lighting, snowfall
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { CFG, hash, smoothstep, clamp } from './config.js';

const S = CFG.slope;

// ---------- analytic height field (physics queries this) ----------
export function baseHeight(x, z) {
  let h = z * S;
  const a = Math.abs(x);
  const t = smoothstep(CFG.pisteHalf - 2, CFG.powderEdge, a); // 0 piste → 1 powder
  h += (Math.sin(x * 0.021 + z * 0.013) * 1.7 +
        Math.sin(x * 0.045 - z * 0.026 + 1.7) * 0.9 +
        Math.sin(x * 0.012 + z * 0.038 + 4.2) * 1.3) * (0.12 + 0.88 * t);
  h += (Math.sin(x * 0.33 + z * 0.24) * 0.22 +
        Math.sin(x * 0.57 - z * 0.43 + 2.0) * 0.15) * t;
  const w = Math.max(0, a - 95);          // valley walls
  h += w * w * 0.012;
  return h;
}

// ---------- kickers (analytic, deterministic by index) ----------
export const KICK = { spacing: 170, len: 13, w: 7.5, first: 1 };

export function kickerInfo(i) {
  if (i < KICK.first) return null;
  const r = hash(i * 3.7);
  return {
    i,
    z0: -(i * KICK.spacing + r * 60 + 150), // uphill edge (u=0)
    x: (hash(i * 7.1) * 2 - 1) * 8,
    h: 2.1 + hash(i * 13.3) * 1.1,
  };
}

export function kickerAt(x, z) {
  const gi = Math.round((-z - 150) / KICK.spacing);
  for (let j = gi - 1; j <= gi + 1; j++) {
    const k = kickerInfo(j);
    if (!k) continue;
    const u = (k.z0 - z) / KICK.len;               // 0 at start, 1 at lip
    if (u < 0 || u > 1) continue;
    const dx = Math.abs(x - k.x) / (KICK.w * 0.5);
    if (dx > 1) continue;
    const wf = 1 - smoothstep(0.55, 1, dx);
    const uu = u * u * (3 - 2 * u);
    return k.h * uu * wf;
  }
  return 0;
}

export function heightAt(x, z) { return baseHeight(x, z) + kickerAt(x, z); }

// slope of the ground along a heading (y change per meter forward)
export function slopeAlong(x, z, heading) {
  const d = 1.2, fx = Math.sin(heading), fz = -Math.cos(heading);
  return (heightAt(x + fx * d, z + fz * d) - heightAt(x - fx * d, z - fz * d)) / (2 * d);
}

// ---------- helpers ----------
function mergeParts(parts) {
  // parts: [{geom, matrix, color}] → single non-indexed BufferGeometry with vertex colors
  const pos = [], nor = [], col = [];
  const c = new THREE.Color();
  const n = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (const p of parts) {
    const g = p.geom.toNonIndexed();
    g.applyMatrix4(p.matrix);
    const pa = g.attributes.position, na = g.attributes.normal;
    c.set(p.color);
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i); pos.push(v.x, v.y, v.z);
      n.fromBufferAttribute(na, i); nor.push(n.x, n.y, n.z);
      col.push(c.r, c.g, c.b);
    }
    g.dispose();
    p.geom.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

function m4(x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
            new THREE.Vector3(sx, sy, sz));
  return m;
}

function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, inner); grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

// ─────────────────────────────────────────────────────────────
export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();          // index → chunk record
    this.chunkPool = [];
    this.kickerMeshes = new Map();    // kicker index → group
    this.scenery = [];                // {group, z, collidables:[{x,z,r,label}]}
    this.sceneryCursor = -60;
    this.time = 0;

    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.railMat = new THREE.MeshBasicMaterial({
      color: 0x2fd4f7, transparent: true, opacity: 0.75, depthWrite: false,
    });
    this.kickerMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.lipMat = new THREE.MeshBasicMaterial({
      color: 0x1ecbf2, transparent: true, opacity: 0.95, depthWrite: false,
    });

    this._buildLights();
    this._buildSky();
    this._buildPeaks();
    this._buildTrees();
    this._buildSnowfall();
  }

  // ---------- lighting ----------
  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0xcfe2ff, 0xf3efe6, 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffeacd, 2.45);
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;
    this.scene.add(this.sun);
    this.sunDir = new THREE.Vector3(-0.42, 0.52, -0.74).normalize();

    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,236,190,1)', 'rgba(255,220,160,0)'),
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      transparent: true, opacity: 0.85,
    }));
    spr.scale.setScalar(420);
    this.sunSprite = spr;
    this.scene.add(spr);
  }

  // ---------- sky dome ----------
  _buildSky() {
    const geo = new THREE.SphereGeometry(2400, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sunDir: { value: this.sunDir } },
      vertexShader: `
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          vec4 p = modelViewMatrix * vec4(position,1.0);
          gl_Position = projectionMatrix * p;
        }`,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 sunDir;
        void main(){
          vec3 zen = vec3(0.18,0.38,0.82);
          vec3 mid = vec3(0.55,0.72,0.95);
          vec3 hor = vec3(0.93,0.95,1.0);
          float h = clamp(vDir.y, -0.15, 1.0);
          vec3 col = mix(hor, mid, smoothstep(0.0, 0.18, h));
          col = mix(col, zen, smoothstep(0.15, 0.65, h));
          float s = max(dot(vDir, normalize(sunDir)), 0.0);
          col += vec3(1.0,0.85,0.6) * pow(s, 350.0) * 1.4;   // disc
          col += vec3(1.0,0.8,0.55) * pow(s, 12.0) * 0.16;   // haze
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  // ---------- distant peaks (fog-free painted backdrop) ----------
  _buildPeaks() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    for (let i = 0; i < 15; i++) {
      const r = hash(i * 5.3), r2 = hash(i * 9.1);
      let px = -1050 + (i / 14) * 2100 + (r - 0.5) * 160;
      if (Math.abs(px) < 180) px += Math.sign(px || 1) * 220;
      const h = 380 + r2 * 340;
      const cone = new THREE.ConeGeometry(h * (0.75 + r * 0.4), h, 5 + Math.floor(r * 3));
      cone.rotateY(r * Math.PI);
      // vertex gradient: hazy base → white summit
      const pa = cone.attributes.position;
      const col = new Float32Array(pa.count * 3);
      for (let v = 0; v < pa.count; v++) {
        const t = clamp((pa.getY(v) / h) + 0.5, 0, 1);
        const base = new THREE.Color(0x9db6dc), top = new THREE.Color(0xffffff);
        const c = base.clone().lerp(top, Math.pow(t, 1.4));
        col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
      }
      cone.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.Mesh(cone, mat);
      m.position.set(px, h * 0.5 - 240, -(1150 + r2 * 250));
      g.add(m);
    }
    g.renderOrder = -9;
    this.peaks = g;
    this.scene.add(g);
  }

  // ---------- trees (single InstancedMesh) ----------
  _buildTrees() {
    const parts = [
      { geom: new THREE.CylinderGeometry(0.16, 0.26, 1.7, 6), matrix: m4(0, 0.85, 0), color: 0x6b4a33 },
      { geom: new THREE.ConeGeometry(1.95, 2.7, 8), matrix: m4(0, 2.4, 0), color: 0x2c6b4e },
      { geom: new THREE.ConeGeometry(1.45, 2.3, 8), matrix: m4(0, 3.7, 0, 1, 1, 1, 0.4), color: 0x35755a },
      { geom: new THREE.ConeGeometry(0.95, 1.9, 8), matrix: m4(0, 4.9, 0, 1, 1, 1, 0.8), color: 0x2c6b4e },
      { geom: new THREE.ConeGeometry(1.5, 1.1, 8), matrix: m4(0, 3.35, 0, 1, 1, 1, 0.2), color: 0xe9f2f7 },
      { geom: new THREE.ConeGeometry(1.05, 0.95, 8), matrix: m4(0, 4.55, 0, 1, 1, 1, 0.6), color: 0xf1f7fb },
      { geom: new THREE.ConeGeometry(0.6, 0.8, 8), matrix: m4(0, 5.6, 0), color: 0xf7fbfe },
    ];
    const geom = mergeParts(parts);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.treeCap = 700;
    this.treeMesh = new THREE.InstancedMesh(geom, mat, this.treeCap);
    this.treeMesh.frustumCulled = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.treeCap; i++) this.treeMesh.setMatrixAt(i, zero);
    this.treeMesh.instanceMatrix.needsUpdate = true;
    this.treeFree = [];
    for (let i = this.treeCap - 1; i >= 0; i--) this.treeFree.push(i);
    this.scene.add(this.treeMesh);
  }

  // ---------- ambient snowfall around camera ----------
  _buildSnowfall() {
    const N = 320;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 70;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.snowPts = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.14, transparent: true, opacity: 0.55,
      depthWrite: false, sizeAttenuation: true,
    }));
    this.snowPts.frustumCulled = false;
    this.scene.add(this.snowPts);
  }

  // ---------- terrain chunks ----------
  _chunkGeom() {
    if (this.chunkPool.length) return this.chunkPool.pop();
    const segX = 100, segZ = 40;
    const geo = new THREE.PlaneGeometry(CFG.chunkW, CFG.chunkLen, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    geo.setAttribute('color', new THREE.BufferAttribute(
      new Float32Array(geo.attributes.position.count * 3), 3));
    // rails: two strips (left/right piste edges), (segs+1)*2 verts each
    const railSegs = 50;
    const railGeo = new THREE.BufferGeometry();
    railGeo.setAttribute('position', new THREE.BufferAttribute(
      new Float32Array((railSegs + 1) * 4 * 3), 3));
    const idx = [];
    for (const side of [0, 1]) {
      const off = side * (railSegs + 1) * 2;
      for (let i = 0; i < railSegs; i++) {
        const a = off + i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, b, c, b, d, c);
      }
    }
    railGeo.setIndex(idx);
    return { geo, railGeo, railSegs };
  }

  _fillChunk(rec, ci) {
    const { geo, railGeo, railSegs } = rec.gg;
    const centerZ = -(ci + 0.5) * CFG.chunkLen;
    const pa = geo.attributes.position, ca = geo.attributes.color;
    for (let i = 0; i < pa.count; i++) {
      const wx = pa.getX(i);
      const worldZ = centerZ + pa.getZ(i);
      pa.setY(i, baseHeight(wx, worldZ));
      // color: piste bright groomed / powder blue-white with dappled shade
      const a = Math.abs(wx);
      const p = 1 - smoothstep(CFG.pisteHalf - 2, CFG.pisteHalf + 6, a);
      const groom = p * Math.sin(wx * 1.9) * 0.014;
      const sparkle = hash(Math.floor(wx * 3.1) * 13.7 + Math.floor(worldZ * 3.1)) * 0.02;
      const dapple = (1 - p) * (Math.sin(wx * 0.33 + worldZ * 0.24) * 0.5 + Math.sin(wx * 0.57 - worldZ * 0.43 + 2.0) * 0.5) * 0.045;
      const r = 0.855 + p * 0.125 + groom + sparkle + dapple;
      const g = 0.895 + p * 0.09 + groom + sparkle + dapple;
      const b = 0.965 + p * 0.035 + groom + sparkle + dapple * 0.6;
      ca.setXYZ(i, r, g, b);
    }
    pa.needsUpdate = true; ca.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    // glow rails along piste edges
    const rp = railGeo.attributes.position;
    const hw = 0.32;
    for (const [side, sx] of [[0, -1], [1, 1]]) {
      const off = side * (railSegs + 1) * 2;
      const x = sx * (CFG.pisteHalf + 0.15);
      for (let i = 0; i <= railSegs; i++) {
        const wz = -(ci * CFG.chunkLen) - (i / railSegs) * CFG.chunkLen;
        const y = baseHeight(x, wz) + 0.07;
        rp.setXYZ(off + i * 2, x - hw, y, wz);
        rp.setXYZ(off + i * 2 + 1, x + hw, y, wz);
      }
    }
    rp.needsUpdate = true;
    railGeo.computeBoundingSphere();
    rec.mesh.position.set(0, 0, centerZ);
    rec.mesh.geometry = geo;
    // geometry is baked in world-x but local z? — no: we baked worldZ into y only;
    // plane z coords are local (centered), so mesh sits at centerZ. Rails are world-baked.
    rec.rail.position.set(0, 0, 0);

    // trees for this chunk
    rec.trees = [];
    const treeMats = [];
    const nTrees = 16;
    const dummy = new THREE.Matrix4();
    for (let t = 0; t < nTrees; t++) {
      const r1 = hash(ci * 91.7 + t * 17.3), r2 = hash(ci * 57.1 + t * 29.9), r3 = hash(ci * 23.3 + t * 41.1);
      const sideSign = t % 2 === 0 ? -1 : 1;
      let ax;
      if (r3 < 0.18) ax = CFG.pisteHalf + 2.5 + r1 * 5;            // danger tree near piste
      else ax = CFG.pisteHalf + 9 + r1 * 95;
      const x = sideSign * ax;
      const z = -(ci * CFG.chunkLen) - r2 * CFG.chunkLen;
      if (Math.abs(x) > 150) continue;
      if (kickerAt(x, z) > 0.01) continue;
      const y = baseHeight(x, z);
      const s = 0.8 + hash(ci * 7.7 + t * 3.1) * 0.75;
      if (this.treeFree.length === 0) continue;
      const slot = this.treeFree.pop();
      dummy.compose(new THREE.Vector3(x, y - 0.15, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r1 * 6.28, 0)),
        new THREE.Vector3(s, s, s));
      this.treeMesh.setMatrixAt(slot, dummy);
      treeMats.push(slot);
      if (Math.abs(x) < 70) rec.trees.push({ x, z, r: 0.85 * s, top: y + 5.5 * s });
    }
    rec.treeSlots = treeMats;
    this.treeMesh.instanceMatrix.needsUpdate = true;
  }

  _makeChunk(ci) {
    const gg = this._chunkGeom();
    const rec = {
      gg,
      mesh: new THREE.Mesh(gg.geo, this.terrainMat),
      rail: new THREE.Mesh(gg.railGeo, this.railMat),
      trees: [], treeSlots: [],
    };
    rec.mesh.frustumCulled = false;
    rec.rail.frustumCulled = false;
    this._fillChunk(rec, ci);
    this.scene.add(rec.mesh, rec.rail);
    this.chunks.set(ci, rec);
  }

  _dropChunk(ci) {
    const rec = this.chunks.get(ci);
    if (!rec) return;
    this.scene.remove(rec.mesh, rec.rail);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const slot of rec.treeSlots) {
      this.treeMesh.setMatrixAt(slot, zero);
      this.treeFree.push(slot);
    }
    this.treeMesh.instanceMatrix.needsUpdate = true;
    this.chunkPool.push(rec.gg);
    this.chunks.delete(ci);
  }

  nearTrees(x, z) {
    const ci = Math.floor(-z / CFG.chunkLen);
    const out = [];
    for (let j = ci - 1; j <= ci + 1; j++) {
      const rec = this.chunks.get(j);
      if (rec) out.push(...rec.trees);
    }
    return out;
  }

  // ---------- kicker meshes ----------
  _buildKickerMesh(k) {
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(KICK.w, KICK.len, 14, 26);
    geo.rotateX(-Math.PI / 2);
    const pa = geo.attributes.position;
    const col = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) {
      const wx = k.x + pa.getX(i);
      const wz = k.z0 - (pa.getZ(i) + KICK.len / 2);
      pa.setX(i, wx);
      pa.setZ(i, wz);
      pa.setY(i, heightAt(wx, wz) + 0.04);
      const u = (k.z0 - wz) / KICK.len;
      const edge = smoothstep(0.75, 1, u) * 0.4;
      col[i * 3] = 0.93 - edge * 0.35; col[i * 3 + 1] = 0.96; col[i * 3 + 2] = 1.0;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.kickerMat);
    mesh.frustumCulled = false;
    g.add(mesh);
    // glowing lip bar
    const lipZ = k.z0 - KICK.len + 0.25;
    const lip = new THREE.Mesh(new THREE.BoxGeometry(KICK.w - 0.8, 0.1, 0.3), this.lipMat);
    lip.position.set(k.x, heightAt(k.x, lipZ) + 0.12, lipZ);
    g.add(lip);
    // glowing side rails up the ramp
    for (const sx of [-1, 1]) {
      const x = k.x + sx * (KICK.w / 2 - 1.1);
      const segs = 12, hw = 0.14;
      const rp = new Float32Array((segs + 1) * 2 * 3);
      const idx = [];
      for (let i = 0; i <= segs; i++) {
        const wz = k.z0 - (i / segs) * KICK.len;
        const y = heightAt(x, wz) + 0.09;
        rp.set([x - hw, y, wz, x + hw, y, wz], i * 6);
        if (i < segs) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
      rg.setIndex(idx);
      g.add(new THREE.Mesh(rg, this.lipMat));
    }
    this.scene.add(g);
    return g;
  }

  // ---------- scenery: chalets, church ----------
  _chalet(rnd) {
    const g = new THREE.Group();
    const w = 5.5 + rnd() * 2.5, d = 4.5 + rnd() * 2, hgt = 2.6 + rnd() * 0.8;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d),
      new THREE.MeshLambertMaterial({ color: 0xefe6d4 }));
    body.position.y = hgt / 2;
    g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 2.1, 4),
      new THREE.MeshLambertMaterial({ color: 0x7b4b31 }));
    roof.position.y = hgt + 1.05;
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = d / Math.max(w, d) * 1.05;
    roof.scale.x = w / Math.max(w, d) * 1.05;
    g.add(roof);
    const snow = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.8, 0.5, 4),
      new THREE.MeshLambertMaterial({ color: 0xf4f9ff }));
    snow.position.y = hgt + 2.0;
    snow.rotation.y = Math.PI / 4;
    snow.scale.copy(roof.scale);
    g.add(snow);
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffcf7a });
    for (let i = 0; i < 3; i++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), winMat);
      win.position.set(-w / 2 + 1.2 + i * (w - 2.4) / 2, hgt * 0.55, d / 2 + 0.02);
      g.add(win);
    }
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x8a8378 }));
    chim.position.set(w * 0.25, hgt + 1.8, 0);
    g.add(chim);
    return { group: g, r: Math.max(w, d) * 0.72 };
  }

  _church(rnd) {
    const g = new THREE.Group();
    const nave = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 9),
      new THREE.MeshLambertMaterial({ color: 0xf2ece0 }));
    nave.position.y = 2; g.add(nave);
    const naveRoof = new THREE.Mesh(new THREE.ConeGeometry(5.4, 2.6, 4),
      new THREE.MeshLambertMaterial({ color: 0x6e4a38 }));
    naveRoof.position.y = 5.2; naveRoof.rotation.y = Math.PI / 4; naveRoof.scale.z = 1.5;
    g.add(naveRoof);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.6, 8, 2.6),
      new THREE.MeshLambertMaterial({ color: 0xf2ece0 }));
    tower.position.set(0, 4, 5.6); g.add(tower);
    const steeple = new THREE.Mesh(new THREE.ConeGeometry(2.1, 4.5, 8),
      new THREE.MeshLambertMaterial({ color: 0x4e5b66 }));
    steeple.position.set(0, 10.2, 5.6); g.add(steeple);
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffd78a });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.6), winMat);
    win.position.set(0, 4.6, 6.92); g.add(win);
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff6e0 }));
    clock.position.set(0, 6.8, 6.92); g.add(clock);
    return { group: g, r: 6.5 };
  }

  _spawnScenery(z) {
    let seed = Math.floor(-z * 7.3);
    const rnd = () => hash(seed++ * 1.71);
    const isChurch = rnd() < 0.12;
    const built = isChurch ? this._church(rnd) : this._chalet(rnd);
    const side = rnd() < 0.5 ? -1 : 1;
    const x = side * (32 + rnd() * 26);
    const y = baseHeight(x, z);
    built.group.position.set(x, y - 0.3, z);
    built.group.rotation.y = (rnd() - 0.5) * 0.9 + (side > 0 ? Math.PI : 0);
    this.scene.add(built.group);
    this.scenery.push({ group: built.group, z, x, r: built.r, label: isChurch ? 'the village church' : 'a chalet' });
  }

  sceneryCollidables(z) {
    return this.scenery.filter(s => Math.abs(s.z - z) < 30);
  }

  // ---------- per-frame ----------
  update(dt, player, camera) {
    this.time += dt;
    const pz = player.z;

    // chunks
    const ci = Math.floor(-pz / CFG.chunkLen);
    const lo = Math.max(0, ci - CFG.chunksBehind), hi = ci + CFG.chunksAhead;
    for (const key of [...this.chunks.keys()]) {
      if (key < lo || key > hi) this._dropChunk(key);
    }
    for (let i = lo; i <= hi; i++) if (!this.chunks.has(i)) this._makeChunk(i);

    // kicker meshes
    const kiLo = Math.max(KICK.first, Math.round((-pz - 150) / KICK.spacing) - 1);
    for (let j = kiLo; j <= kiLo + 4; j++) {
      const k = kickerInfo(j);
      if (!k) continue;
      if (k.z0 < pz - 620) continue;
      if (!this.kickerMeshes.has(j)) this.kickerMeshes.set(j, this._buildKickerMesh(k));
    }
    for (const [j, g] of [...this.kickerMeshes]) {
      const k = kickerInfo(j);
      if (k.z0 > pz + 80) {
        this.scene.remove(g);
        g.traverse(o => { if (o.geometry && o.geometry !== this.lipMat) o.geometry.dispose?.(); });
        this.kickerMeshes.delete(j);
      }
    }

    // scenery
    while (this.sceneryCursor > pz - 560) {
      this.sceneryCursor -= 70 + hash(Math.floor(-this.sceneryCursor)) * 90;
      this._spawnScenery(this.sceneryCursor);
    }
    for (let i = this.scenery.length - 1; i >= 0; i--) {
      if (this.scenery[i].z > pz + 70) {
        this.scene.remove(this.scenery[i].group);
        this.scenery.splice(i, 1);
      }
    }

    // rails pulse
    this.railMat.opacity = 0.5 + 0.2 * Math.sin(this.time * 2.2);
    this.lipMat.opacity = 0.65 + 0.3 * Math.sin(this.time * 3.6);

    // lights + sky follow
    this.sun.position.set(player.x + this.sunDir.x * 220, player.y + this.sunDir.y * 220, pz + this.sunDir.z * 220);
    this.sunTarget.position.set(player.x, player.y, pz);
    this.sunSprite.position.copy(camera.position).addScaledVector(this.sunDir, 1600);
    this.sky.position.copy(camera.position);
    this.peaks.position.set(camera.position.x * 0.92, player.y, pz);

    // snowfall drift + wrap around camera
    const sp = this.snowPts.geometry.attributes.position;
    this.snowPts.position.set(0, 0, 0);
    for (let i = 0; i < sp.count; i++) {
      let x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
      y -= dt * (1.6 + (i % 5) * 0.3);
      x += dt * Math.sin(this.time * 0.7 + i) * 0.5;
      // wrap into a box around camera
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      if (y < cy - 20) y += 40;
      if (x < cx - 35) x += 70; else if (x > cx + 35) x -= 70;
      if (z < cz - 45) z += 70; else if (z > cz + 25) z -= 70;
      sp.setXYZ(i, x, y, z);
    }
    sp.needsUpdate = true;
  }

  reset() {
    for (const key of [...this.chunks.keys()]) this._dropChunk(key);
    for (const [j, g] of [...this.kickerMeshes]) {
      this.scene.remove(g);
      this.kickerMeshes.delete(j);
    }
    for (const s of this.scenery) this.scene.remove(s.group);
    this.scenery.length = 0;
    this.sceneryCursor = -60;
  }
}
