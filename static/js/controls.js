import * as THREE from 'three';
import { clamp } from './util.js';

export class Controls {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;

    this.yaw = 0;
    this.pitch = 0;
    this.moveX = 0;
    this.moveY = 0;
    this.moveLen = 0;
    this.firing = false;
    this.wantJump = false;
    this.sprintBtn = false;
    this.sprintAuto = false;
    this.enabled = false;
    this.onPause = null;
    this.onFireDown = null;

    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (!this.isTouch) document.body.classList.add('no-touch');

    this._keys = {};
    this._lookId = null;
    this._stickId = null;
    this._lastLook = { x: 0, y: 0 };
    this._stickCenter = { x: 0, y: 0 };
    this._fwdHoldT = 0;

    this._bindDesktop();
    this._bindTouch();
  }

  get sprint() {
    return this.enabled && (this.sprintBtn || (this.sprintAuto && this.moveLen > 0.85));
  }

  requestPointerLock() {
    if (!this.isTouch) this.canvas.requestPointerLock?.();
  }

  _bindDesktop() {
    window.addEventListener('keydown', e => {
      this._keys[e.code] = true;
      if (!this.enabled) {
        if (e.code === 'Escape' && this.onPause) this.onPause();
        return;
      }
      if (e.code === 'KeyR') this.reloadReq = true;
      if (e.code === 'Space') { this.wantJump = true; e.preventDefault(); }
      if (e.code === 'KeyF') this.adsToggleReq = !this.adsToggleReq;
      if (e.code === 'Escape') { if (this.onPause) this.onPause(); }
    });
    window.addEventListener('keyup', e => { this._keys[e.code] = false; });

    this.canvas.addEventListener('mousedown', e => {
      if (this.isTouch || !this.enabled) return;
      if (document.pointerLockElement !== this.canvas) { this.requestPointerLock(); return; }
      if (e.button === 0) this.firing = true;
      if (e.button === 2) this.mouseAds = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.firing = false;
      if (e.button === 2) this.mouseAds = false;
    });
    window.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('mousemove', e => {
      if (document.pointerLockElement !== this.canvas || !this.enabled) return;
      const s = 0.0022 * this.settings.sens * (this.adsActive ? 0.55 : 1);
      this.yaw -= e.movementX * s;
      const dy = e.movementY * s * (this.settings.invert ? -1 : 1);
      this.pitch = clamp(this.pitch - dy, -1.45, 1.45);
      if (this.weaponRef) this.weaponRef.addSway(e.movementX, e.movementY);
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.enabled && !this.isTouch) {
        if (this.onPause) this.onPause();
      }
    });
  }

  _el(id) { return document.getElementById(id); }

  _bindTouch() {
    const stickZone = this._el('stick-zone');
    const lookZone = this._el('look-zone');
    const stickBase = this._el('stick-base');
    const stickKnob = this._el('stick-knob');
    const STICK_R = 48;

    stickZone.addEventListener('pointerdown', e => {
      if (this._stickId !== null) return;
      this._stickId = e.pointerId;
      stickZone.setPointerCapture(e.pointerId);
      this._stickCenter = { x: e.clientX, y: e.clientY };
      stickBase.style.left = (e.clientX - 53) + 'px';
      stickBase.style.top = (e.clientY - 53) + 'px';
      stickBase.style.bottom = 'auto';
      e.preventDefault();
    });
    stickZone.addEventListener('pointermove', e => {
      if (e.pointerId !== this._stickId) return;
      let dx = e.clientX - this._stickCenter.x;
      let dy = e.clientY - this._stickCenter.y;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) { dx = dx / d * STICK_R; dy = dy / d * STICK_R; }
      stickKnob.style.transform = `translate(${dx}px,${dy}px)`;
      this.moveX = dx / STICK_R;
      this.moveY = -dy / STICK_R;
    });
    const stickEnd = e => {
      if (e.pointerId !== this._stickId) return;
      this._stickId = null;
      this.moveX = 0; this.moveY = 0;
      stickKnob.style.transform = '';
      stickBase.style.left = '60px';
      stickBase.style.top = 'auto';
      stickBase.style.bottom = '44px';
    };
    stickZone.addEventListener('pointerup', stickEnd);
    stickZone.addEventListener('pointercancel', stickEnd);

    lookZone.addEventListener('pointerdown', e => {
      if (this._lookId !== null) return;
      this._lookId = e.pointerId;
      lookZone.setPointerCapture(e.pointerId);
      this._lastLook = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    });
    lookZone.addEventListener('pointermove', e => {
      if (e.pointerId !== this._lookId) return;
      const dx = e.clientX - this._lastLook.x;
      const dy = e.clientY - this._lastLook.y;
      this._lastLook = { x: e.clientX, y: e.clientY };
      if (!this.enabled || !this.weaponRef) return;
      const s = 0.0042 * this.settings.sens * (this.adsActive ? 0.55 : 1);
      this.yaw -= dx * s;
      const dy2 = dy * s * (this.settings.invert ? -1 : 1);
      this.pitch = clamp(this.pitch - dy2, -1.45, 1.45);
      this.weaponRef.addSway(dx, dy);
    });
    const lookEnd = e => {
      if (e.pointerId === this._lookId) this._lookId = null;
    };
    lookZone.addEventListener('pointerup', lookEnd);
    lookZone.addEventListener('pointercancel', lookEnd);

    const hold = (id, onDown, onUp) => {
      const el = typeof id === 'string' ? this._el(id) : id;
      el.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        el.classList.add('held');
        onDown && onDown();
      });
      const end = e => {
        el.classList.remove('held');
        onUp && onUp();
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    };

    hold('btn-fire', () => { this.firing = true; }, () => { this.firing = false; });
    hold('btn-ads', () => { this.adsToggleReq = !this.adsToggleReq; });
    hold('btn-reload', () => { this.reloadReq = true; });
    hold('btn-jump', () => { this.wantJump = true; });
    hold('btn-sprint', () => { this.sprintBtn = true; }, () => { this.sprintBtn = false; });

    for (const id of ['btn-fire', 'btn-ads', 'btn-reload', 'btn-jump', 'btn-sprint']) {
      this._el(id).addEventListener('click', e => e.preventDefault());
    }
  }

  setWeapon(w) { this.weaponRef = w; }

  sample(dt) {
    let kx = 0, ky = 0;
    const k = this._keys;
    if (k['KeyW'] || k['ArrowUp']) ky += 1;
    if (k['KeyS'] || k['ArrowDown']) ky -= 1;
    if (k['KeyA'] || k['ArrowLeft']) kx -= 1;
    if (k['KeyD'] || k['ArrowRight']) kx += 1;

    if (kx || ky) {
      this.moveX = kx; this.moveY = ky;
    } else if (this._stickId === null) {
      this.moveX = 0; this.moveY = 0;
    }

    this.moveLen = Math.hypot(this.moveX, this.moveY);

    if (this.moveY > 0.9 && this.moveLen > 0.95) {
      this._fwdHoldT += dt;
      if (this._fwdHoldT > 0.45) this.sprintAuto = true;
    } else {
      this._fwdHoldT = 0;
      if (this.moveLen < 0.7 || this.moveY < 0.5) this.sprintAuto = false;
    }

    this.adsActive = !!this.weaponRef && (this.mouseAds || this.adsToggleReq);

    const reload = this.reloadReq;
    this.reloadReq = false;
    return { reload };
  }

  resetState() {
    this.firing = false;
    this.adsToggleReq = false;
    this.mouseAds = false;
    this.sprintAuto = false;
    this.sprintBtn = false;
    this.moveX = 0; this.moveY = 0;
    this._stickId = null;
    this._lookId = null;
    this._keys = {};
  }
}
