import * as THREE from 'three';
import {
  flashTexture, smokeTexture, blobShadowTexture, decalTexture
} from './textures.js';

const TYPES = {
  sand:  { color: 0xdcc79c, spd: 2.4, up: 2.8, grav: 5.5, size: 0.26, life: 0.55, count: 7 },
  wood:  { color: 0xb08a58, spd: 3.4, up: 2.2, grav: 8.5, size: 0.13, life: 0.4,  count: 6 },
  stone: { color: 0xb8b0a0, spd: 2.8, up: 2.4, grav: 7,   size: 0.18, life: 0.45, count: 6 },
  spark: { color: 0xffd878, spd: 6.5, up: 1.5, grav: 11,  size: 0.07, life: 0.22, count: 5 },
  flesh: { color: 0x8a2418, spd: 1.6, up: 1.3, grav: 3.5, size: 0.17, life: 0.38, count: 6 },
  smoke: { color: 0xcfc4ae, spd: 0.5, up: 1.1, grav: -0.4, size: 0.3,  life: 0.8,  count: 3 }
};

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.density = 1;

    this.tracers = [];
    const trGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(trGeo, new THREE.MeshBasicMaterial({
        color: 0xffd890, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      }));
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ m, t: 0 });
    }
    this._trIdx = 0;

    this.parts = [];
    const sprMat = new THREE.SpriteMaterial({
      map: smokeTexture(), transparent: true, depthWrite: false, opacity: 0.85
    });
    for (let i = 0; i < 110; i++) {
      const s = new THREE.Sprite(sprMat.clone());
      s.visible = false;
      scene.add(s);
      this.parts.push({ s, v: new THREE.Vector3(), t: 0, tot: 1, grow: 1, baseA: 1 });
    }
    this._pIdx = 0;

    this.decals = [];
    const dGeo = new THREE.PlaneGeometry(0.17, 0.17);
    const dMat = new THREE.MeshBasicMaterial({
      map: decalTexture(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(dGeo, dMat);
      m.visible = false;
      scene.add(m);
      this.decals.push(m);
    }
    this._dIdx = 0;

    this.shells = [];
    const shGeo = new THREE.BoxGeometry(0.012, 0.012, 0.034);
    const shMat = new THREE.MeshStandardMaterial({ color: 0xc8a23a, roughness: 0.35, metalness: 0.8 });
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(shGeo, shMat);
      m.visible = false;
      scene.add(m);
      this.shells.push({ m, v: new THREE.Vector3(), av: new THREE.Vector3(), t: 0, bounced: false });
    }
    this._shIdx = 0;

    this._v = new THREE.Vector3();
  }

  setDensity(d) { this.density = d; }

  tracer(from, to, color = 0xffd890) {
    const tr = this.tracers[this._trIdx++ % this.tracers.length];
    const len = from.distanceTo(to);
    tr.m.position.copy(from).add(to).multiplyScalar(0.5);
    tr.m.lookAt(to);
    tr.m.scale.set(0.02, 0.02, Math.max(0.1, len));
    tr.m.material.color.setHex(color);
    tr.m.material.opacity = 0.9;
    tr.m.visible = true;
    tr.t = 0.07;
  }

  _spawnPart(pos, cfg, tintMul = 1, scaleMul = 1) {
    const p = this.parts[this._pIdx++ % this.parts.length];
    p.s.position.copy(pos);
    p.s.material.color.setHex(cfg.color).multiplyScalar(tintMul);
    p.s.material.opacity = 0.85;
    p.s.scale.setScalar(cfg.size * scaleMul * (0.7 + Math.random() * 0.6));
    p.v.set(
      (Math.random() - 0.5) * cfg.spd * 2,
      cfg.up * (0.5 + Math.random() * 0.8),
      (Math.random() - 0.5) * cfg.spd * 2
    );
    p.tot = p.t = cfg.life * (0.7 + Math.random() * 0.6);
    p.grav = cfg.grav;
    p.grow = 1 + Math.random();
    p.baseA = 0.85;
    p.s.visible = true;
  }

  burst(pos, normal, type = 'sand') {
    const cfg = TYPES[type] || TYPES.sand;
    const n = Math.max(1, Math.round(cfg.count * this.density));
    const off = this._v.copy(normal || pos).multiplyScalar(0.04);
    for (let i = 0; i < n; i++) {
      this._spawnPart(this._v.copy(pos).add(off), cfg);
    }
    if (type === 'metal' || type === 'stone') {
      const sn = Math.max(1, Math.round(TYPES.spark.count * this.density));
      for (let i = 0; i < sn; i++) this._spawnPart(pos, TYPES.spark);
    }
  }

  muzzlePuff(pos) {
    const n = Math.round(TYPES.smoke.count * this.density);
    for (let i = 0; i < n; i++) this._spawnPart(pos, TYPES.smoke, 1, 0.8);
  }

  decal(pos, normal) {
    const m = this.decals[this._dIdx++ % this.decals.length];
    m.position.copy(pos).addScaledVector(normal, 0.012);
    m.lookAt(this._v.copy(pos).add(normal));
    m.rotation.z = Math.random() * Math.PI * 2;
    m.visible = true;
  }

  shell(pos, right, fwd) {
    const sh = this.shells[this._shIdx++ % this.shells.length];
    sh.m.position.copy(pos);
    sh.m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    sh.v.copy(right).multiplyScalar(1.4 + Math.random() * 1.2);
    sh.v.y = 1.7 + Math.random() * 0.7;
    sh.v.addScaledVector(fwd, -0.3 * Math.random());
    sh.av.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
    sh.t = 1.1;
    sh.bounced = false;
    sh.m.visible = true;
  }

  update(dt) {
    for (const tr of this.tracers) {
      if (tr.t > 0) {
        tr.t -= dt;
        tr.m.material.opacity *= 0.72;
        if (tr.t <= 0) tr.m.visible = false;
      }
    }
    for (const p of this.parts) {
      if (p.t > 0) {
        p.t -= dt;
        p.v.y -= p.grav * dt;
        p.s.position.addScaledVector(p.v, dt);
        const k = 1 - p.t / p.tot;
        p.s.material.opacity = p.baseA * (1 - k);
        p.s.scale.multiplyScalar(1 + dt * p.grow * 1.6);
        if (k > 0.35) p.v.multiplyScalar(1 - dt * 3.2);
        if (p.t <= 0) p.s.visible = false;
      }
    }
    for (const sh of this.shells) {
      if (sh.t > 0) {
        sh.t -= dt;
        sh.v.y -= 11 * dt;
        sh.m.position.addScaledVector(sh.v, dt);
        sh.m.rotation.x += sh.av.x * dt;
        sh.m.rotation.y += sh.av.y * dt;
        sh.m.rotation.z += sh.av.z * dt;
        if (sh.m.position.y <= 0.03 && sh.v.y < 0) {
          if (!sh.bounced) {
            sh.v.y *= -0.32;
            sh.v.x *= 0.5; sh.v.z *= 0.5;
            sh.bounced = true;
          } else {
            sh.v.set(0, 0, 0);
            sh.m.position.y = 0.02;
          }
        }
        if (sh.t < 0.3) sh.m.visible = false;
        if (sh.t <= 0) sh.m.visible = false;
      }
    }
  }
}
