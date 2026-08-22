import * as THREE from 'three';
import { gunMetalTexture, akWoodTexture, gloveTexture, sleeveTexture } from './textures.js';
import { mergeGeometries, mat, clamp, lerp } from './util.js';
import { CFG } from './config.js';

export class Weapon {
  constructor(camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    camera.add(this.group);

    const w = CFG.weapon;
    this.magSize = w.magSize;
    this.mag = w.magSize;
    this.reserve = w.reserveMax;
    this.fireRate = w.fireRate;
    this.reloading = false;
    this.reloadTime = w.reloadTime;
    this._reloadT = 0;
    this._cool = 0;
    this.ads = false;
    this._adsT = 0;
    this.bloom = 0;
    this._shotIdx = 0;
    this._lastShotAt = -10;
    this._recoilKick = 0;
    this._recoilPitch = 0;
    this._recoilYaw = 0;
    this._sway = new THREE.Vector2();
    this._bobT = 0;
    this._muzzleT = 0;
    this._sprintT = 0;
    this.sprinting = false;
    this.onShell = null;
    this.time = 0;

    this.hipPos = new THREE.Vector3(0.28, -0.26, -0.55);
    this.adsPos = new THREE.Vector3(0, -0.148, -0.4);
    this.hipRot = new THREE.Euler(0.02, 0.06, 0);

    this._buildAK();
    this._buildMuzzleFlash();
    this.group.position.copy(this.hipPos);
  }

  _buildAK() {
    const metalTex = gunMetalTexture();
    const matMetal = new THREE.MeshStandardMaterial({ map: metalTex, roughness: 0.5, metalness: 0.7 });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x1b1c18, roughness: 0.45, metalness: 0.75 });
    const matWood = new THREE.MeshStandardMaterial({ map: akWoodTexture(), roughness: 0.6, metalness: 0.05 });
    const matGlove = new THREE.MeshStandardMaterial({ map: gloveTexture(), roughness: 0.92 });
    const matSleeve = new THREE.MeshStandardMaterial({ map: sleeveTexture(), roughness: 1 });

    const metalParts = [], darkParts = [], woodParts = [], gloveParts = [], sleeveParts = [];
    const M = (g, m) => metalParts.push({ g, m });
    const D = (g, m) => darkParts.push({ g, m });

    M(new THREE.BoxGeometry(0.055, 0.062, 0.30), mat(0, 0, -0.05));
    const cover = new THREE.CylinderGeometry(0.027, 0.027, 0.295, 10);
    cover.rotateX(Math.PI / 2);
    M(cover, mat(0, 0.042, -0.05));
    M(new THREE.BoxGeometry(0.02, 0.014, 0.03), mat(0.038, 0.012, -0.02));

    D(new THREE.CylinderGeometry(0.011, 0.011, 0.34, 8), mat(0, 0.012, -0.40, Math.PI / 2, 0, 0));
    D(new THREE.CylinderGeometry(0.009, 0.009, 0.20, 8), mat(0, 0.036, -0.31, Math.PI / 2, 0, 0));
    D(new THREE.BoxGeometry(0.022, 0.055, 0.03), mat(0, 0.03, -0.545));
    D(new THREE.CylinderGeometry(0.003, 0.003, 0.032, 6), mat(0, 0.065, -0.545));
    D(new THREE.CylinderGeometry(0.016, 0.014, 0.055, 8), mat(0, 0.012, -0.587, Math.PI / 2, 0, 0));
    D(new THREE.BoxGeometry(0.03, 0.018, 0.02), mat(0, 0.055, -0.16));
    D(new THREE.BoxGeometry(0.008, 0.012, 0.012), mat(-0.011, 0.068, -0.16));
    D(new THREE.BoxGeometry(0.008, 0.012, 0.012), mat(0.011, 0.068, -0.16));

    W(new THREE.BoxGeometry(0.05, 0.045, 0.16), mat(0, -0.005, -0.28));
    W(new THREE.BoxGeometry(0.038, 0.02, 0.15), mat(0, 0.037, -0.28));
    W(new THREE.BoxGeometry(0.034, 0.09, 0.045), mat(0, -0.075, 0.055, -0.35, 0, 0));
    W(new THREE.BoxGeometry(0.045, 0.055, 0.22), mat(0, -0.02, 0.21, 0.1, 0, 0));
    D(new THREE.BoxGeometry(0.048, 0.085, 0.02), mat(0, -0.03, 0.315));

    function W(g, m) { woodParts.push({ g, m }); }

    const magSegs = [
      [0.036, 0.085, 0.058, 0, -0.075, -0.075, 0.18],
      [0.036, 0.085, 0.056, 0, -0.148, -0.048, 0.45],
      [0.036, 0.06, 0.054, 0, -0.205, -0.012, 0.7]
    ];
    this.magGroup = new THREE.Group();
    for (const [w2, h2, d2, x, y, z, rx] of magSegs) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, d2), matDark);
      seg.position.set(x, y, z);
      seg.rotation.x = rx;
      this.magGroup.add(seg);
    }
    this.gun = new THREE.Group();
    this.gun.add(this.magGroup);

    G(new THREE.BoxGeometry(0.055, 0.075, 0.06), mat(0.012, -0.085, 0.065, -0.3, 0, 0));
    for (let i = 0; i < 4; i++) {
      G(new THREE.BoxGeometry(0.014, 0.05, 0.016), mat(-0.021, -0.062 - i * 0.013, 0.045 - i * 0.015, -0.5, 0, 0));
    }
    G(new THREE.BoxGeometry(0.06, 0.05, 0.085), mat(-0.006, -0.045, -0.28, 0, 0, 0.25));
    for (let i = 0; i < 4; i++) {
      G(new THREE.BoxGeometry(0.015, 0.016, 0.055), mat(0.024, -0.021 + 0.002 * i, -0.31 + i * 0.021, 0, 0, 0.8));
    }
    G(new THREE.BoxGeometry(0.015, 0.04, 0.016), mat(-0.03, -0.02, -0.26));

    S(new THREE.CylinderGeometry(0.035, 0.045, 0.22, 8), mat(0.03, -0.16, 0.18, 1.1, 0, 0));
    S(new THREE.CylinderGeometry(0.034, 0.046, 0.26, 8), mat(-0.05, -0.14, -0.19, 1.25, 0, -0.4));

    function G(g, m) { gloveParts.push({ g, m }); }
    function S(g, m) { sleeveParts.push({ g, m }); }

    const addMerged = (parts, material) => {
      if (!parts.length) return null;
      const mesh = new THREE.Mesh(mergeGeometries(parts), material);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.gun.add(mesh);
      return mesh;
    };
    addMerged(metalParts, matMetal);
    addMerged(darkParts, matDark);
    addMerged(woodParts, matWood);
    addMerged(gloveParts, matGlove);
    addMerged(sleeveParts, matSleeve);

    this.group.add(this.gun);
    this.muzzleLocal = new THREE.Vector3(0, 0.012, -0.62);
    this.shellLocal = new THREE.Vector3(0.04, 0.03, -0.12);
  }

  _buildMuzzleFlash() {
    const tex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d');
      const grd = x.createRadialGradient(32, 32, 2, 32, 32, 30);
      grd.addColorStop(0, 'rgba(255,250,220,1)');
      grd.addColorStop(0.3, 'rgba(255,200,90,.9)');
      grd.addColorStop(0.7, 'rgba(255,130,30,.4)');
      grd.addColorStop(1, 'rgba(255,100,20,0)');
      x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
    }));
    this.flash.scale.set(0.24, 0.24, 1);
    this.flash.position.copy(this.muzzleLocal);
    this.flash.visible = false;
    this.gun.add(this.flash);

    this.flashLight = new THREE.PointLight(0xffb050, 0, 5, 1.8);
    this.flashLight.position.set(0, 0.015, -0.55);
    this.gun.add(this.flashLight);
  }

  get canFire() {
    return !this.reloading && this.mag > 0 && this._cool <= 0 && this._sprintT < 0.5;
  }

  fire() {
    if (!this.canFire) return false;
    const w = CFG.weapon;
    this.mag--;
    this._cool = this.fireRate;
    const grow = Math.min(this._shotIdx, 7) * w.recoilVGrowth;
    this._recoilPitch = w.recoilVBase + grow + Math.random() * 0.004;
    const driftDir = this._shotIdx < 5 ? (Math.random() - 0.5) : ((this._shotIdx % 2) ? 1 : -1);
    this._recoilYaw = driftDir * w.recoilHDrift * (0.5 + Math.random() * 0.9);
    this._shotIdx++;
    this._lastShotAt = this.time;
    this._recoilKick = 1;
    this._muzzleT = 0.05;
    this.flash.visible = true;
    this.flash.material.rotation = Math.random() * Math.PI * 2;
    this.flash.scale.setScalar(0.19 + Math.random() * 0.13);
    this.flashLight.intensity = 25;
    return true;
  }

  get spread() {
    const w = CFG.weapon;
    return lerp(w.hipSpread + this.bloom * 0.02, w.adsSpread + this.bloom * 0.006, this._adsT);
  }

  startReload() {
    if (this.reloading || this.mag === this.magSize || this.reserve <= 0 || this._sprintT > 0.5) return false;
    this.reloading = true;
    this._reloadT = this.reloadTime;
    this._rc1 = false;
    this._rc2 = false;
    return true;
  }

  resetAmmo() {
    this.mag = this.magSize;
    this.reserve = CFG.weapon.reserveMax;
    this.reloading = false;
    this.bloom = 0;
    this._shotIdx = 0;
  }

  muzzleWorld(out) {
    out.copy(this.muzzleLocal);
    return this.gun.localToWorld(out);
  }

  update(dt, moveSpeed, grounded, firingHeld) {
    this.time += dt;
    const w = CFG.weapon;
    if (this._cool > 0) this._cool -= dt;

    if (this.time - this._lastShotAt > 0.32) this._shotIdx = 0;

    this.bloom = clamp(this.bloom + (firingHeld ? 0 : -w.bloomDecay * dt), 0, w.bloomMax);

    if (this.reloading) {
      this._reloadT -= dt;
      const p = 1 - this._reloadT / this.reloadTime;
      if (!this._rc1 && p > 0.3) { this._rc1 = true; this.reloadSnd && this.reloadSnd(false); }
      if (!this._rc2 && p > 0.78) { this._rc2 = true; this.reloadSnd && this.reloadSnd(true); }
      this.magGroup.visible = !(p > 0.34 && p < 0.66);
      if (this._reloadT <= 0) {
        const need = this.magSize - this.mag;
        const take = Math.min(need, this.reserve);
        this.mag += take;
        this.reserve -= take;
        this.reloading = false;
        this.magGroup.visible = true;
        this._shotIdx = 0;
      }
    }

    const targetAds = this.ads && !this.reloading && this._sprintT < 0.4 ? 1 : 0;
    this._adsT += (targetAds - this._adsT) * Math.min(1, dt * 11);

    const sprintTarget = this.sprinting && !targetAds && !this.reloading ? 1 : 0;
    this._sprintT += (sprintTarget - this._sprintT) * Math.min(1, dt * 8);

    if (this._muzzleT > 0) {
      this._muzzleT -= dt;
      if (this._muzzleT <= 0) this.flash.visible = false;
      this.flashLight.intensity *= 0.55;
    } else {
      this.flashLight.intensity = 0;
    }

    this._recoilKick = Math.max(0, this._recoilKick - dt * 9);
    this._bobT += dt * (grounded ? moveSpeed * 1.85 : 0);
    const bobAmt = lerp(0.011, 0.002, this._adsT) * Math.min(1, moveSpeed / 4);
    const bobX = Math.sin(this._bobT * 2) * bobAmt;
    const bobY = Math.abs(Math.cos(this._bobT * 2)) * bobAmt * 1.25;

    let reloadDip = 0, reloadRoll = 0;
    if (this.reloading) {
      const p = 1 - this._reloadT / this.reloadTime;
      const s = Math.sin(p * Math.PI);
      reloadDip = s * 0.17;
      reloadRoll = s * 0.75;
    }

    const px = lerp(this.hipPos.x, this.adsPos.x, this._adsT)
      + bobX + this._sway.x
      + this._sprintT * 0.06;
    const py = lerp(this.hipPos.y, this.adsPos.y, this._adsT)
      + bobY - reloadDip + this._sway.y
      - this._sprintT * 0.05;
    const pz = lerp(this.hipPos.z, this.adsPos.z, this._adsT)
      + this._recoilKick * 0.055
      + this._sprintT * 0.09;
    this.group.position.set(px, py, pz);

    const rx = lerp(this.hipRot.x, 0, this._adsT) + this._recoilKick * 0.09 - this._sprintT * 0.5;
    const ry = lerp(this.hipRot.y, 0, this._adsT) + this._sprintT * 0.65;
    const rz = reloadRoll + this._sprintT * 0.12;
    this.group.rotation.set(rx, ry, rz);

    this._sway.multiplyScalar(Math.max(0, 1 - dt * 6));
  }

  addSway(dx, dy) {
    const cap = 0.02 * (1 - this._adsT * 0.8);
    this._sway.x = clamp(this._sway.x - dx * 0.0018, -cap, cap);
    this._sway.y = clamp(this._sway.y + dy * 0.0014, -cap, cap);
  }

  consumeRecoil() {
    const mul = 1 - (1 - CFG.weapon.recoilAdsMul) * this._adsT;
    const p = this._recoilPitch * mul, y = this._recoilYaw * mul;
    this._recoilPitch = 0;
    this._recoilYaw = 0;
    return { pitch: p, yaw: y };
  }
}
