// ─────────────────────────────────────────────────────────────
// HUD — DOM overlay: speed, timer, boost meter, rival gap,
// announcements, screens
// ─────────────────────────────────────────────────────────────
import { clamp } from './config.js';

const $ = id => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), timer: $('timer'), dist: $('dist'), tofu: $('tofu'),
      speedVal: $('speedVal'), boostBar: $('boostBar'), boostWrap: $('boostWrap'),
      boostHint: $('boostHint'), rival: $('rival'), rivalGap: $('rivalGap'),
      announce: $('announce'), vignette: $('vignette'), flash: $('flash'),
      menu: $('menu'), countdown: $('countdown'), countNum: $('countNum'),
      gameover: $('gameover'), paused: $('paused'),
      goReason: $('goReason'), goStats: $('goStats'), goRecord: $('goRecord'),
      menuBest: $('menuBest'),
    };
    this._lastSpeed = -1;
  }

  show(name) {
    for (const s of ['menu', 'countdown', 'gameover', 'paused'])
      this.el[s].classList.toggle('hidden', s !== name);
    this.el.hud.classList.toggle('hidden', name === 'menu');
  }

  setMenuBest(best) {
    this.el.menuBest.textContent = best > 0
      ? `PERSONAL BEST — ${Math.round(best).toLocaleString()} M`
      : 'FIRST RUN — MAKE IT COUNT';
  }

  countdown(txt, final) {
    const n = this.el.countNum;
    n.textContent = txt;
    n.classList.toggle('go', final);
    n.classList.remove('pop');
    void n.offsetWidth; // restart animation
    n.classList.add('pop');
  }

  update(state) {
    const kmh = Math.round(state.speed * 3.6);
    if (kmh !== this._lastSpeed) {
      this.el.speedVal.textContent = kmh;
      this._lastSpeed = kmh;
    }
    this.el.speedVal.classList.toggle('hot', state.boosting);

    const t = state.time;
    const m = Math.floor(t / 60), s = t % 60;
    this.el.timer.textContent = `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
    this.el.dist.textContent = `${Math.round(state.dist).toLocaleString()} m`;
    this.el.tofu.textContent = `◻ ${state.deliveries}`;

    const pct = clamp(state.meter / 100, 0, 1) * 100;
    this.el.boostBar.style.width = pct + '%';
    this.el.boostWrap.classList.toggle('ready', state.meter >= 25 && !state.boosting);
    this.el.boostWrap.classList.toggle('boosting', state.boosting);
    this.el.boostHint.textContent = state.boosting ? 'BOOSTING'
      : state.meter >= 25 ? 'DOUBLE-TAP  SPACE' : 'COLLECT  ORBS';

    const gap = Math.round(state.rivalGap);
    this.el.rivalGap.textContent = `${gap} m`;
    const danger = clamp((26 - state.rivalGap) / 22, 0, 1);
    this.el.rival.classList.toggle('danger', danger > 0.35);
    this.el.vignette.style.opacity = (danger * 0.75).toFixed(2);
  }

  announce(text, cls = '', ms = 1600) {
    const div = document.createElement('div');
    div.className = 'toast ' + cls;
    div.textContent = text;
    this.el.announce.appendChild(div);
    setTimeout(() => div.classList.add('out'), ms);
    setTimeout(() => div.remove(), ms + 500);
  }

  combo(n) {
    if (n < 2) return;
    this.announce(`COMBO ×${n}`, 'combo', 900);
  }

  boostFlash() {
    const f = this.el.flash;
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  }

  gameOver(reason, stats, isRecord) {
    this.el.goReason.textContent = reason;
    this.el.goStats.innerHTML = '';
    for (const [label, val] of stats) {
      const d = document.createElement('div');
      d.className = 'stat';
      d.innerHTML = `<span class="v">${val}</span><span class="l">${label}</span>`;
      this.el.goStats.appendChild(d);
    }
    this.el.goRecord.classList.toggle('hidden', !isRecord);
    this.show('gameover');
  }
}
