// ─────────────────────────────────────────────────────────────
// Audio — 100% procedural WebAudio: wind bed, carve scrape,
// powder rumble, chimes, boost whoosh, crash, ambient pad
// ─────────────────────────────────────────────────────────────
import { clamp } from './config.js';

const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.26];

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.comboIdx = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // shared noise buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const noiseVoice = (type, freq, q = 1) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start();
      return { src, f, g };
    };

    this.wind = noiseVoice('bandpass', 500, 0.6);
    this.wind2 = noiseVoice('bandpass', 1400, 2.5);
    this.carve = noiseVoice('highpass', 2600);
    this.powder = noiseVoice('lowpass', 260);

    // ambient pad — two slow detuned triangles, very quiet
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass'; padFilter.frequency.value = 900;
    this.padGain.connect(padFilter); padFilter.connect(this.master);
    this.padOsc = [];
    for (const [f, dt] of [[130.81, 0], [196.0, 2], [261.63, -3]]) {
      const o = ctx.createOscillator();
      o.type = 'triangle'; o.frequency.value = f; o.detune.value = dt;
      const g = ctx.createGain(); g.gain.value = 0.33;
      o.connect(g); g.connect(this.padGain);
      o.start();
      this.padOsc.push(o);
    }
    this.padChord = 0;
    this.padTimer = setInterval(() => this._padShift(), 9000);
    this.padGain.gain.setTargetAtTime(0.05, ctx.currentTime, 3);
  }

  _padShift() {
    if (!this.ctx || this.muted) return;
    const chords = [
      [130.81, 196.0, 261.63],   // C
      [110.0, 164.81, 261.63],   // Am
      [87.31, 174.61, 261.63],   // F
      [98.0, 146.83, 246.94],    // G
    ];
    this.padChord = (this.padChord + 1) % chords.length;
    const c = chords[this.padChord];
    this.padOsc.forEach((o, i) =>
      o.frequency.setTargetAtTime(c[i], this.ctx.currentTime, 2.5));
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.1);
  }

  update(dt, state) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const sp = clamp(state.speed / 40, 0, 1.3);
    this.wind.g.gain.setTargetAtTime(sp * sp * 0.24 + (state.boosting ? 0.1 : 0), t, 0.12);
    this.wind.f.frequency.setTargetAtTime(350 + sp * 900, t, 0.15);
    this.wind2.g.gain.setTargetAtTime(sp * sp * 0.1 + (state.boosting ? 0.12 : 0), t, 0.1);
    this.wind2.f.frequency.setTargetAtTime(900 + sp * 2400, t, 0.15);
    const carve = state.grounded ? clamp(state.carve, 0, 1.6) : 0;
    this.carve.g.gain.setTargetAtTime(carve * 0.1 * sp, t, 0.06);
    this.powder.g.gain.setTargetAtTime(state.powder && state.grounded ? sp * 0.34 : 0, t, 0.1);
  }

  _tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  _noiseBurst(dur, freq, type, vol, when = 0, sweepTo = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  orb(combo = 0) {
    const n = PENTA[clamp(combo, 0, PENTA.length - 1)];
    this._tone(n * 2, 0.22, 'sine', 0.16);
    this._tone(n * 3, 0.3, 'sine', 0.05, 0.03);
  }

  boost() {
    this._noiseBurst(0.8, 260, 'lowpass', 0.4, 0, 3800);
    this._tone(90, 0.7, 'sawtooth', 0.1, 0, 160);
    this._tone(523, 0.5, 'sine', 0.08, 0.05, 260);
  }

  boostDenied() { this._tone(180, 0.16, 'square', 0.07, 0, -60); }

  delivery() {
    [0, 2, 4, 7].forEach((s, i) =>
      this._tone(PENTA[0] * 2 * Math.pow(2, s / 12), 0.35, 'sine', 0.14, i * 0.07));
    this._noiseBurst(0.4, 4000, 'highpass', 0.06, 0.1);
  }

  missed() { this._tone(196, 0.3, 'sine', 0.1, 0, -60); this._tone(147, 0.4, 'sine', 0.1, 0.12, -40); }

  crash() {
    this._noiseBurst(0.7, 900, 'lowpass', 0.65, 0, 120);
    this._tone(60, 0.5, 'sine', 0.4, 0, -35);
  }

  land(impact) {
    this._noiseBurst(0.22, 600, 'lowpass', clamp(impact * 0.04, 0.05, 0.3));
  }

  launch() { this._noiseBurst(0.35, 1200, 'bandpass', 0.12, 0, 2600); }

  surge() {
    this._tone(220, 0.5, 'sawtooth', 0.09, 0, -80);
    this._tone(233, 0.5, 'sawtooth', 0.09, 0.02, -80);
  }

  countdown(final) {
    if (final) { this._tone(880, 0.5, 'sine', 0.22); this._tone(1320, 0.4, 'sine', 0.1, 0.03); }
    else this._tone(440, 0.18, 'sine', 0.16);
  }

  milestone() { this._tone(659, 0.2, 'sine', 0.1); this._tone(988, 0.3, 'sine', 0.08, 0.08); }
}
