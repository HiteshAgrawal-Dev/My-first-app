import * as THREE from 'three';
import { CFG } from './config.js';
import { wrapAngle, clamp, rand } from './util.js';
import { buildSoldier } from './soldier.js';

const STATE = { PATROL: 0, COMBAT: 1, HUNT: 2, COVER: 3 };

export class Soldier {
  constructor(game, team, name) {
    this.game = game;
    this.world = game.world;
    this.scene = game.scene;
    this.team = team;
    this.name = name;
    this.hp = CFG.bot.hp;
    this.dead = false;
    this.position = new THREE.Vector3();
    this.yaw = rand(0, Math.PI * 2);
    this.moving = 0;

    const p = buildSoldier(team, game.scene);
    this.mesh = p.group;
    this.legL = p.legL;
    this.legR = p.legR;
    this.blob = p.blob;
    this.flash = p.flash;
    this.muzzleLocal = p.muzzleLocal;

    this.ai = new AIController(this);
    this.deadT = 0;
    this.respawnT = 0;
    this.flashT = 0;
    this.walkT = Math.random() * 10;
    this.kills = 0;
    this.deaths = 0;
    this._v = new THREE.Vector3();
  }

  spawnAt(pos) {
    this.position.set(pos.x, 0, pos.z);
    this.hp = CFG.bot.hp;
    this.dead = false;
    this.deadT = 0;
    this.mesh.visible = true;
    this.mesh.rotation.set(0, this.yaw, 0);
    this.mesh.position.copy(this.position);
    const a = this.ai;
    a.hasTarget = false;
    a.visibleTarget = false;
    a.path = null;
    a.wander = null;
    a.coverPoint = null;
    a.state = STATE.PATROL;
    a.stuckT = 0;
    a.lastPos.copy(this.position);
    a.scanT = 0;
  }

  takeDamage(dmg) {
    if (this.dead) return false;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    if (!this.ai.hasTarget || !this.ai.visibleTarget) {
      const src = arguments[1];
      if (src) {
        this.ai.lastSeen.set(src.x, 0, src.z);
        this.ai.hasTarget = true;
        this.ai.seenTimer = 5;
      }
    }
    return false;
  }

  die() {
    this.dead = true;
    this.deaths++;
    this.deadT = 0;
    this.respawnT = rand(CFG.bot.respawnMin, CFG.bot.respawnMax);
    this.flash.visible = false;
  }

  muzzleWorld(out) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const lx = this.muzzleLocal.x, lz = this.muzzleLocal.z;
    out.set(
      this.position.x + c * lx + s * lz,
      this.muzzleLocal.y,
      this.position.z - s * lx + c * lz
    );
    return out;
  }

  fireAt(target, game) {
    this.flash.visible = true;
    this.flashT = 0.05;
    this.lastShotTime = game.time;
    const b = CFG.bot;
    const dist = Math.hypot(target.pos.x - this.position.x, target.pos.z - this.position.z);

    game.pushNoise(this.position.x, this.position.z, this.team === 'rangers', false);
    game.audio.enemyShot(this.position, game.player.position, game.controls.yaw);

    const errBase = this.team === 'rangers' ? b.errAlly : game.difficulty.enemyErr;
    const err = errBase * (0.55 + dist / 42);

    const eye = this._v.set(this.position.x, 1.5, this.position.z);
    const aimY = target.isPlayer ? target.pos.y - 0.25 : 1.25;
    const dir = new THREE.Vector3(target.pos.x - eye.x, aimY - eye.y, target.pos.z - eye.z).normalize();
    dir.x += (Math.random() - 0.5) * err * 2;
    dir.y += (Math.random() - 0.5) * err * 1.4;
    dir.z += (Math.random() - 0.5) * err * 2;
    dir.normalize();

    game.aiRaycaster.set(eye, dir);
    game.aiRaycaster.far = dist + 8;
    const envHits = game.aiRaycaster.intersectObjects(this.world.shootables, false);
    const envDist = envHits.length ? envHits[0].distance : Infinity;

    let proj = Infinity, hitPoint = null;
    if (target.isPlayer && !game.player.dead) {
      const pe = game.player.position;
      for (const [oy, r] of [[0, 0.32], [-0.75, 0.46]]) {
        const cx = pe.x, cy = pe.y + oy, cz = pe.z;
        const vx = cx - eye.x, vy = cy - eye.y, vz = cz - eye.z;
        const t = vx * dir.x + vy * dir.y + vz * dir.z;
        if (t < 0 || t > envDist) continue;
        const px = eye.x + dir.x * t, py = eye.y + dir.y * t, pz = eye.z + dir.z * t;
        const dd = (px - cx) ** 2 + (py - cy) ** 2 + (pz - cz) ** 2;
        if (dd < r * r && t < proj) { proj = t; hitPoint = new THREE.Vector3(px, py, pz); }
      }
      if (hitPoint) {
        game.damagePlayer(rand(b.dmgToPlayer[0], b.dmgToPlayer[1]), this);
      }
    } else if (target.soldier && !target.soldier.dead) {
      const sp = target.soldier.position;
      for (const [oy, r] of [[1.62, 0.24], [1.15, 0.44], [0.68, 0.38]]) {
        const vx = sp.x - eye.x, vy = oy - eye.y, vz = sp.z - eye.z;
        const t = vx * dir.x + vy * dir.y + vz * dir.z;
        if (t < 0 || t > envDist) continue;
        const px = eye.x + dir.x * t, py = eye.y + dir.y * t, pz = eye.z + dir.z * t;
        const dd = (px - sp.x) ** 2 + (py - oy) ** 2 + (pz - sp.z) ** 2;
        if (dd < r * r && t < proj) { proj = t; hitPoint = new THREE.Vector3(px, py, pz); }
      }
      if (hitPoint) {
        const killed = target.soldier.takeDamage(rand(b.dmgToBot[0], b.dmgToBot[1]), this.position);
        if (killed) game.onBotKill(this, target.soldier);
        else game.effects.burst(hitPoint, dir, 'flesh');
      }
    }

    const muzzle = this.muzzleWorld(new THREE.Vector3());
    const endPoint = hitPoint
      ? hitPoint
      : envHits.length
        ? envHits[0].point
        : new THREE.Vector3().copy(eye).addScaledVector(dir, Math.min(dist, 70));
    game.effects.tracer(muzzle, endPoint);
    if (!hitPoint && envHits.length) {
      const n = envHits[0].face ? envHits[0].face.normal.clone().transformDirection(envHits[0].object.matrixWorld) : dir.clone().negate();
      const surf = this._surfaceOf(envHits[0].object);
      game.effects.burst(envHits[0].point, n, surf);
      game.effects.decal(envHits[0].point, n);
    }
  }

  _surfaceOf(obj) {
    if (obj.geometry && obj.geometry.type === 'PlaneGeometry') return 'sand';
    const m = obj.material;
    if (!m) return 'stone';
    if (m.map === this.world.matWood?.map) return 'wood';
    if (m.metalness !== undefined && m.metalness > 0.3) return 'metal';
    if (obj === this.world.groundMesh) return 'sand';
    return 'stone';
  }

  update(dt, game) {
    const m = this.mesh;
    if (this.dead) {
      this.deadT += dt;
      const f = Math.min(1, this.deadT * 3.2);
      m.rotation.z = f * (Math.PI / 2) * 0.96;
      m.position.y = this.position.y - f * 0.06;
      if (this.deadT > 2.6) m.position.y -= (this.deadT - 2.6) * 0.35;
      if (this.deadT > 4.2) m.visible = false;
      this.respawnT -= dt;
      if (this.respawnT <= 0 && game.state === 'playing') {
        game.respawnBot(this);
      }
      return;
    }

    this.ai.update(dt, game);

    this.walkT += dt * this.moving * 2.4;
    const sw = Math.sin(this.walkT) * clamp(this.moving / 3, 0, 0.55);
    this.legL.rotation.x = sw;
    this.legR.rotation.x = -sw;

    m.position.set(this.position.x, 0, this.position.z);
    m.rotation.y = this.yaw;

    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.visible = false;
    }
  }
}

class AIController {
  constructor(soldier) {
    this.s = soldier;
    this.world = soldier.world;
    this.state = STATE.PATROL;
    this.targetPos = new THREE.Vector3();
    this.lastSeen = new THREE.Vector3();
    this.seenTimer = 0;
    this.hasTarget = false;
    this.visibleTarget = false;
    this.curTarget = null;
    this.perceiveT = Math.random() * CFG.bot.perceiveInterval;
    this.path = null;
    this.pathIdx = 0;
    this.repathT = 0;
    this.wander = null;
    this.fireCool = rand(0.4, 1.2);
    this.burstLeft = 0;
    this.burstPause = rand(0.3, 1);
    this.stuckT = 0;
    this.lastPos = new THREE.Vector3();
    this.scanT = 0;
    this.coverWait = rand(CFG.bot.coverWait[0], CFG.bot.coverWait[1]);
    this.coverPoint = null;
    this.strafeDir = Math.random() > 0.5 ? 1 : -1;
    this.strafeT = rand(1, 2);
    this._v = new THREE.Vector3();
    this._v2b = new THREE.Vector3();
  }

  get pos() { return this.s.position; }

  _enemyCandidates(game) {
    const list = [];
    if (this.s.team === 'militia') {
      if (!game.player.dead && game.state === 'playing') list.push({ p: game.player.position, isPlayer: true });
      for (const s of game.soldiers) {
        if (s.team === 'rangers' && !s.dead) list.push({ s, isPlayer: false });
      }
    } else {
      for (const s of game.soldiers) {
        if (s.team === 'militia' && !s.dead) list.push({ s, isPlayer: false });
      }
    }
    return list;
  }

  _perceive(game) {
    const b = CFG.bot;
    let best = null, bestD = b.sightRange * b.sightRange;
    const eye = this._v.set(this.pos.x, 1.55, this.pos.z);

    for (const c of this._enemyCandidates(game)) {
      const tp = c.isPlayer ? c.p : c.s.position;
      const dx = tp.x - this.pos.x, dz = tp.z - this.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > bestD) continue;
      const ang = Math.atan2(dx, dz);
      const rel = wrapAngle(ang - this.s.yaw);
      if (Math.abs(rel) > 1.05 && d2 > 36) continue;
      this._v2b.set(tp.x, c.isPlayer ? tp.y : 1.35, tp.z);
      if (this.world.losBlocked(eye, this._v2b)) continue;
      bestD = d2;
      best = c;
    }

    if (best) {
      const tp = best.isPlayer ? best.p : best.s.position;
      this.targetPos.copy(tp);
      this.lastSeen.copy(tp);
      this.seenTimer = 6;
      this.hasTarget = true;
      this.visibleTarget = true;
      this.curTarget = best;
    } else {
      this.visibleTarget = false;
      this.seenTimer -= CFG.bot.perceiveInterval;
    }

    for (const n of game.noiseEvents) {
      const d = Math.hypot(n.x - this.pos.x, n.z - this.pos.z);
      const hostile = this.s.team === 'rangers' ? !n.fromRangers : n.fromRangers;
      if (hostile && d < CFG.bot.hearRange) {
        if (!this.visibleTarget) {
          this.lastSeen.set(n.x, 0, n.z);
          this.hasTarget = true;
          this.seenTimer = Math.max(this.seenTimer, 3.5);
        }
      }
    }
  }

  _setPath(dest) {
    if (this.repathT > 0 && this.path) return;
    this.repathT = rand(1.0, 1.6);
    this.path = this.world.findPath(this.pos, dest);
    this.pathIdx = 0;
  }

  _followPath(dt, speed) {
    if (!this.path || this.pathIdx >= this.path.length) return false;
    const wp = this.path[this.pathIdx];
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.5) {
      this.pathIdx++;
      return this._followPath(dt, speed);
    }
    const targetYaw = Math.atan2(dx, dz);
    const dyaw = wrapAngle(targetYaw - this.s.yaw);
    this.s.yaw += dyaw * Math.min(1, dt * 7);
    const mv = Math.abs(dyaw) < 1.3 ? speed : speed * 0.25;
    this.pos.x += Math.sin(this.s.yaw) * mv * dt;
    this.pos.z += Math.cos(this.s.yaw) * mv * dt;
    return true;
  }

  _moveDirect(dt, tx, tz, speed) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const dyaw = wrapAngle(Math.atan2(dx, dz) - this.s.yaw);
    this.s.yaw += dyaw * Math.min(1, dt * 8);
    this.pos.x += Math.sin(this.s.yaw) * speed * dt;
    this.pos.z += Math.cos(this.s.yaw) * speed * dt;
  }

  _stuckCheck(dt) {
    const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
    this.lastPos.copy(this.pos);
    if (moved < 0.02) {
      this.stuckT += dt;
      if (this.stuckT > 0.9) {
        this.stuckT = 0;
        this.path = null;
        this.repathT = 0;
        this.s.yaw += (Math.random() > 0.5 ? 1 : -1) * rand(0.9, 1.9);
        const side = Math.random() > 0.5 ? 1 : -1;
        this.pos.x += Math.cos(this.s.yaw) * 0.55 * side;
        this.pos.z -= Math.sin(this.s.yaw) * 0.55 * side;
        this.world.collide(this.pos, 0.5);
      }
    } else {
      this.stuckT = Math.max(0, this.stuckT - dt * 2);
    }
  }

  update(dt, game) {
    const s = this.s;
    const b = CFG.bot;
    if (s.dead) return;

    this.perceiveT -= dt;
    if (this.perceiveT <= 0) {
      this.perceiveT = b.perceiveInterval;
      this._perceive(game);
    }

    this.fireCool -= dt;
    this.burstPause -= dt;
    this.repathT -= dt;
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeT = rand(1.2, 2.6);
      this.strafeDir *= -1;
    }

    let moveSpeed = b.speedPatrol;
    const wantCover = s.reloading || s.hp < b.lowHP;

    if (wantCover) {
      this.state = STATE.COVER;
      if (!this.coverPoint) this.coverPoint = this.world.randomCoverNear(this.pos, 22);
      const cp = this.coverPoint;
      if (s.reloading) this.coverWait = rand(b.coverWait[0], b.coverWait[1]);
      if (!cp) {
        this.state = STATE.COMBAT;
      } else {
        const d = Math.hypot(cp.x - this.pos.x, cp.z - this.pos.z);
        if (d > 1.5) {
          this._setPath(cp);
          if (!this._followPath(dt, b.speedHunt)) {
            this._moveDirect(dt, cp.x, cp.z, b.speedHunt);
          }
        } else {
          this.coverWait -= dt;
          if (!s.reloading && this.coverWait <= 0) {
            this.coverPoint = null;
            this.coverWait = rand(b.coverWait[0], b.coverWait[1]);
          }
        }
      }
      moveSpeed = b.speedHunt;
    } else if (this.hasTarget && this.visibleTarget) {
      this.state = STATE.COMBAT;
      const dist = Math.hypot(this.targetPos.x - this.pos.x, this.targetPos.z - this.pos.z);
      const targetYaw = Math.atan2(this.targetPos.x - this.pos.x, this.targetPos.z - this.pos.z);
      const dyaw = wrapAngle(targetYaw - s.yaw);
      s.yaw += dyaw * Math.min(1, dt * 7);

      const sx = Math.sin(s.yaw), cz = Math.cos(s.yaw);
      let advX = 0, advZ = 0;
      if (dist > 26) { advX = sx * 0.9; advZ = cz * 0.9; }
      else if (dist < 11) { advX = -sx * 0.6; advZ = -cz * 0.6; }
      const strfX = cz * this.strafeDir * 0.65;
      const strfZ = -sx * this.strafeDir * 0.65;
      this.pos.x += (advX + strfX) * b.speedStrafe * dt;
      this.pos.z += (advZ + strfZ) * b.speedStrafe * dt;
      moveSpeed = b.speedStrafe;

      if (Math.abs(dyaw) < b.aimSettleRad && this.curTarget) {
        if (this.burstLeft > 0 && this.fireCool <= 0) {
          this.burstLeft--;
          this.fireCool = b.burstInterval + Math.random() * 0.04;
          if (this.burstLeft === 0) this.burstPause = rand(b.burstPauseMin, b.burstPauseMax);
          s.fireAt(this.curTarget, game);
        } else if (this.burstLeft <= 0 && this.burstPause <= 0) {
          this.burstLeft = 3 + ((Math.random() * (b.burstMax - b.burstMin + 1)) | 0);
        }
      }
    } else if (this.hasTarget && this.seenTimer > 0) {
      this.state = STATE.HUNT;
      moveSpeed = b.speedHunt;
      this._setPath(this.lastSeen);
      const following = this._followPath(dt, b.speedHunt);
      const dLast = Math.hypot(this.lastSeen.x - this.pos.x, this.lastSeen.z - this.pos.z);
      if (!following || dLast < 2.2) {
        this.scanT += dt;
        s.yaw += dt * 1.6;
        if (this.scanT > 2.6) {
          this.scanT = 0;
          this.hasTarget = false;
        }
      }
    } else {
      this.state = STATE.PATROL;
      if (!this.wander || Math.hypot(this.wander.x - this.pos.x, this.wander.z - this.pos.z) < 2.5) {
        if (s.team === 'rangers' && game.difficulty.assistPlayer && Math.random() < 0.45 && game.state === 'playing') {
          const px = game.player.position.x, pz = game.player.position.z;
          this.wander = new THREE.Vector3(
            clamp(px + rand(-18, 18), -50, 50), 0,
            clamp(pz + rand(-18, 18), -50, 50)
          );
        } else {
          this.wander = this.world.randomNode().clone();
        }
        this.repathT = 0;
        this.path = null;
      }
      this._setPath(this.wander);
      if (!this._followPath(dt, b.speedPatrol) && this.wander) {
        this._moveDirect(dt, this.wander.x, this.wander.z, b.speedPatrol);
      }
    }

    this.world.collide(this.pos, 0.5);
    this._stuckCheck(dt);
    s.moving = moveSpeed;
  }
}
