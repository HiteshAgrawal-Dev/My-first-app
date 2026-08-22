import * as THREE from 'three';
import { clamp } from './util.js';
import { CFG } from './config.js';

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    const p = CFG.player;
    this.position = new THREE.Vector3(-46, p.eyeHeight, -42);
    this.velocity = new THREE.Vector3();
    this.grounded = true;
    this.hp = p.maxHP;
    this.dead = false;
    this._regenT = 0;
    this._bobPhase = 0;
    this._lastStepSide = 0;
    this.landDip = 0;
    this.shakeT = 0;
    this.shakeAmp = 0;
    this.sprinting = false;
    this.speed2D = 0;
    this.onFootstep = null;
    this.onLand = null;
    this._v1 = new THREE.Vector3();
  }

  setSpawn(v) {
    this.position.set(v.x, CFG.player.eyeHeight, v.z);
    this.velocity.set(0, 0, 0);
    this.grounded = true;
  }

  respawn(spawn) {
    this.hp = CFG.player.maxHP;
    this.dead = false;
    this._regenT = 0;
    this.setSpawn(spawn);
  }

  addShake(amp) {
    this.shakeAmp = Math.min(0.05, Math.max(this.shakeAmp, amp));
    this.shakeT = 0.28;
  }

  update(dt, input, weapon) {
    const p = CFG.player;
    const adsActive = weapon.ads && !weapon.reloading;
    this.sprinting = input.sprint && input.moveLen > 0.6 && !adsActive && !input.firing;

    let spd = this.sprinting ? p.sprintSpeed : p.walkSpeed;
    if (adsActive) spd *= p.adsSpeedMul;
    if (this.dead) { input.moveX = 0; input.moveY = 0; }

    const mi = input;
    const sin = Math.sin(input.yaw), cos = Math.cos(input.yaw);
    const wishX = (mi.moveX * cos - mi.moveY * sin);
    const wishZ = (-mi.moveX * sin - mi.moveY * cos);
    const len = Math.min(1, mi.moveLen);

    const accel = this.grounded ? p.accelGround : p.accelAir;
    this.velocity.x += (wishX * spd * len - this.velocity.x) * Math.min(1, accel * dt);
    this.velocity.z += (wishZ * spd * len - this.velocity.z) * Math.min(1, accel * dt);

    this.velocity.y -= p.gravity * dt;
    if (input.wantJump && this.grounded && !this.dead) {
      this.velocity.y = p.jumpVel;
      this.grounded = false;
    }
    input.wantJump = false;

    const prevVy = this.velocity.y;
    const wasAir = !this.grounded;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    if (this.position.y <= p.eyeHeight) {
      this.position.y = p.eyeHeight;
      this.velocity.y = 0;
      this.grounded = true;
      if (wasAir && prevVy < -5.5) {
        this.landDip = Math.min(0.09, -prevVy * 0.011);
        this.onLand && this.onLand(-prevVy);
      }
    }
    this.landDip = Math.max(0, this.landDip - dt * 0.45);

    this.world.collide(this.position, p.bodyRadius);

    const rec = weapon.consumeRecoil();
    input.yaw += rec.yaw;
    input.pitch = clamp(input.pitch + rec.pitch, -1.45, 1.45);

    this.speed2D = Math.hypot(this.velocity.x, this.velocity.z);

    if (this.grounded && this.speed2D > 0.8) {
      const prev = this._bobPhase;
      this._bobPhase += dt * (this.sprinting ? 11 : 8.2) * Math.min(1.4, this.speed2D / 5);
      if (Math.floor(prev / Math.PI) !== Math.floor(this._bobPhase / Math.PI)) {
        const side = Math.floor(this._bobPhase / Math.PI) % 2;
        if (side !== this._lastStepSide) {
          this._lastStepSide = side;
          this.onFootstep && this.onFootstep(Math.min(1, this.speed2D / p.walkSpeed));
        }
      }
    } else {
      this._bobPhase *= 1 - Math.min(1, dt * 6);
    }

    if (this.shakeT > 0) {
      this.shakeT -= dt;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }

    if (!this.dead && this.hp < p.maxHP) {
      this._regenT += dt;
      if (this._regenT > p.regenDelay) {
        this.hp = Math.min(p.maxHP, this.hp + p.regenRate * dt);
      }
    }

    const bobY = Math.abs(Math.cos(this._bobPhase)) * 0.03 * Math.min(1, this.speed2D / 4) * (adsActive ? 0.3 : 1);
    const shakeX = this.shakeAmp > 0 ? (Math.random() - 0.5) * this.shakeAmp : 0;
    const shakeY = this.shakeAmp > 0 ? (Math.random() - 0.5) * this.shakeAmp : 0;

    this.camera.position.set(
      this.position.x + shakeX,
      this.position.y - bobY - this.landDip + shakeY,
      this.position.z
    );
    this.camera.rotation.set(input.pitch, input.yaw, 0, 'YXZ');

    const targetFov = adsActive ? 55 : (this.sprinting ? 82 : 75);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
      this.camera.updateProjectionMatrix();
    }
  }

  takeDamage(dmg) {
    if (this.dead) return false;
    this.hp -= dmg;
    this._regenT = 0;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      return true;
    }
    return false;
  }

  eyePos(out) {
    return out.set(this.position.x, this.position.y, this.position.z);
  }
}
