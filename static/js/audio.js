import { clamp } from './util.js';

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.8;
    this._noiseBuf = null;
    this._ambientOn = false;
    this._boomTimer = null;
    this._lastEmpty = 0;
  }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbient();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  _noise(dur) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    src.start(this.ctx.currentTime, Math.random() * 0.5, dur + 0.05);
    return src;
  }

  _env(gainNode, t0, peak, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.005);
    g.exponentialRampToValueAtTime(0.0001, t0 + decay);
  }

  shot() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const out = this.ctx.createGain();
    out.connect(this.master);

    const crack = this._noise(0.1);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1600 + Math.random() * 500; bp.Q.value = 0.6;
    const cg = this.ctx.createGain();
    this._env(cg, t0, 0.9, 0.09);
    crack.connect(bp); bp.connect(cg); cg.connect(out);

    const body = this.ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(140 + Math.random() * 30, t0);
    body.frequency.exponentialRampToValueAtTime(55, t0 + 0.08);
    const bg = this.ctx.createGain();
    this._env(bg, t0, 0.7, 0.1);
    body.connect(bg); bg.connect(out);
    body.start(t0); body.stop(t0 + 0.12);

    const tail = this._noise(0.3);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    const tg = this.ctx.createGain();
    tg.gain.setValueAtTime(0.0001, t0);
    tg.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
    tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
    tail.connect(lp); lp.connect(tg); tg.connect(out);
  }

  enemyShot(pos, listenerPos, listenerYaw) {
    if (!this.ctx) return;
    const dx = pos.x - listenerPos.x, dz = pos.z - listenerPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 80) return;
    const bearing = Math.atan2(dx, -dz);
    let rel = bearing + listenerYaw;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const vol = Math.pow(clamp(1 - dist / 80, 0, 1), 1.4) * 0.55;
    const t0 = this.ctx.currentTime;

    const out = this.ctx.createGain();
    out.gain.value = vol;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = clamp(Math.sin(rel) * 0.85, -1, 1);
    out.connect(pan); pan.connect(this.master);

    const n = this._noise(0.14);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = clamp(4200 - dist * 45, 500, 4200);
    const g = this.ctx.createGain();
    this._env(g, t0, 0.8, 0.12);
    n.connect(f); f.connect(g); g.connect(out);

    const thump = this.ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(90, t0);
    thump.frequency.exponentialRampToValueAtTime(45, t0 + 0.09);
    const tg = this.ctx.createGain();
    this._env(tg, t0, 0.5, 0.1);
    thump.connect(tg); tg.connect(out);
    thump.start(t0); thump.stop(t0 + 0.12);
  }

  hit(head) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = head ? 'square' : 'triangle';
    o.frequency.setValueAtTime(head ? 1250 : 480, t0);
    if (head) o.frequency.setValueAtTime(1750, t0 + 0.05);
    const g = this.ctx.createGain();
    this._env(g, t0, head ? 0.28 : 0.22, head ? 0.14 : 0.07);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + 0.18);
    if (head) {
      const o2 = this.ctx.createOscillator();
      o2.type = 'sine'; o2.frequency.value = 2400;
      const g2 = this.ctx.createGain();
      this._env(g2, t0 + 0.05, 0.18, 0.12);
      o2.connect(g2); g2.connect(this.master);
      o2.start(t0 + 0.05); o2.stop(t0 + 0.2);
    }
  }

  kill() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    [520, 780].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      const g = this.ctx.createGain();
      this._env(g, t0 + i * 0.07, 0.16, 0.16);
      o.connect(g); g.connect(this.master);
      o.start(t0 + i * 0.07); o.stop(t0 + i * 0.07 + 0.2);
    });
  }

  hurt() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const n = this._noise(0.16);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 700;
    const g = this.ctx.createGain();
    this._env(g, t0, 0.4, 0.15);
    n.connect(f); f.connect(g); g.connect(this.master);
  }

  footstep(vol) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const n = this._noise(0.06);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 300 + Math.random() * 350; f.Q.value = 0.9;
    const g = this.ctx.createGain();
    this._env(g, t0, 0.11 * vol, 0.05);
    n.connect(f); f.connect(g); g.connect(this.master);
  }

  reloadClick(hard) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(hard ? 320 : 190, t0);
    o.frequency.exponentialRampToValueAtTime(hard ? 180 : 120, t0 + 0.04);
    const g = this.ctx.createGain();
    this._env(g, t0, hard ? 0.22 : 0.14, 0.05);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + 0.08);
  }

  emptyClick() {
    if (!this.ctx) return;
    const now = performance.now();
    if (now - this._lastEmpty < 250) return;
    this._lastEmpty = now;
    this.reloadClick(false);
  }

  uiClick() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = 900;
    const g = this.ctx.createGain();
    this._env(g, t0, 0.12, 0.06);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + 0.08);
  }

  deploy() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const n = this._noise(0.7);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(220, t0);
    f.frequency.exponentialRampToValueAtTime(2400, t0 + 0.55);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.65);
    n.connect(f); f.connect(g); g.connect(this.master);
  }

  stinger(win) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const seq = win ? [392, 494, 587, 784] : [392, 330, 262, 196];
    seq.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = win ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      this._env(g, t0 + i * 0.16, 0.16, 0.34);
      o.connect(g); g.connect(this.master);
      o.start(t0 + i * 0.16); o.stop(t0 + i * 0.16 + 0.4);
    });
  }

  startAmbient() {
    if (!this.ctx || this._ambientOn) return;
    this._ambientOn = true;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 0.4;
    const g = this.ctx.createGain();
    g.gain.value = 0.035;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lg = this.ctx.createGain();
    lg.gain.value = 0.02;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    lfo.start();
    const boom = () => {
      if (!this._ambientOn) return;
      const t0 = this.ctx.currentTime;
      const n = this._noise(0.5);
      const bf = this.ctx.createBiquadFilter();
      bf.type = 'lowpass'; bf.frequency.value = 240;
      const bg = this.ctx.createGain();
      bg.gain.setValueAtTime(0.0001, t0);
      bg.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.04, t0 + 0.03);
      bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.6 - 0.8;
      n.connect(bf); bf.connect(bg); bg.connect(pan); pan.connect(this.master);
      this._boomTimer = setTimeout(boom, 6000 + Math.random() * 10000);
    };
    this._boomTimer = setTimeout(boom, 4000);
  }
}
