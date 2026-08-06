// ─────────────────────────────────────────────────────────────
// TOFU RUN — shared tuning constants + tiny math helpers
// ─────────────────────────────────────────────────────────────

export const CFG = {
  // world
  slope: 0.42,          // rise per meter of -z (≈23°)
  pisteHalf: 15,        // groomed piste half-width
  powderEdge: 24,       // |x| beyond which it is full deep powder
  chunkLen: 100,
  chunkW: 340,
  chunksAhead: 5,
  chunksBehind: 2,

  // physics
  gravity: 13,
  accel: 10.5,          // downhill pull along slope
  drag: 0.0069,         // quadratic drag  (vmax ≈ 39 m/s ≈ 140 km/h)
  carveScrub: 0.30,     // speed scrubbed per rad/s of turning
  powderDrag: 0.085,    // linear drag multiplier in deep powder
  turnRate: 2.15,       // max heading rate at speed (rad/s)
  leanResponse: 4.4,    // how fast lean follows input (momentum feel)
  maxHeading: 1.32,     // rad, soft clamp so you never ride uphill

  // boost
  boostThrust: 15,
  boostDragMul: 1.55,
  boostTime: 2.6,
  boostCost: 25,
  meterMax: 100,
  orbFill: 9,

  // rival
  rivalStartGap: 55,
  rivalCatch: 3,

  // camera
  fovBase: 66,
  camDist: 6.8,
  camHeight: 3.1,
};

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(a, b, v) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
// deterministic hash → [0,1)
export function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function damp(rate, dt) { return 1 - Math.exp(-rate * dt); }
