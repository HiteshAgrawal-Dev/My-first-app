import * as THREE from 'three';
import { CFG, loadSettings, saveSettings } from './config.js';
import { World } from './world.js';
import { createSky } from './sky.js';
import { Weapon } from './weapon.js';
import { Controls } from './controls.js';
import { Player } from './player.js';
import { Soldier } from './ai.js';
import { Effects } from './effects.js';
import { GameAudio } from './audio.js';
import { HUD } from './hud.js';
import { clamp } from './util.js';

const $ = id => document.getElementById(id);

const RANGER_NAMES = ['VIPER', 'HAWK-2', 'REAPER', 'GHOST-1'];
const MILITIA_NAMES = ['JACKAL', 'HYENA', 'SCORPION', 'COBRA', 'VULTURE'];
const STREAKS = [[12, 'LEGENDARY!'], [8, 'UNSTOPPABLE!'], [5, 'RAMPAGE!'], [3, 'KILLING SPREE!']];

class Game {
  constructor() {
    this.state = 'menu';
    this.time = 0;
    this.scoreRangers = 0;
    this.scoreMilitia = 0;
    this.matchTime = CFG.match.seconds;
    this.soldiers = [];
    this.noiseEvents = [];
    this.settings = loadSettings();
    this.audio = new GameAudio();
    this.difficulty = { enemyErr: CFG.bot.errEnemyBase, assistPlayer: false };
    this._statsTaps = 0;
    this._frameAcc = 0;
    this._frameN = 0;
    this._avgMs = 16;
    this._dprAdjT = 0;
    this._autoScanT = 0;
    this._autoFire = false;
    this._lastSecond = -1;
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();

    this.renderer = new THREE.WebGLRenderer({ canvas: $('game-canvas'), antialias: false, powerPreference: 'high-performance' });
    this.preset = CFG.perf.presets[this.settings.preset] || CFG.perf.presets.med;
    this.curDpr = Math.min(window.devicePixelRatio || 1, this.preset.dprCap);
    this.renderer.setPixelRatio(this.curDpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = this.preset.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.04, 420);
    this.scene.add(this.camera);

    this.world = new World(this.scene);
    this.sunDir = new THREE.Vector3(60, 90, 30);
    this.sky = createSky(this.scene, this.sunDir);

    this.effects = new Effects(this.scene);
    this.effects.setDensity(this.preset.particles);

    this.hud = new HUD(this.settings);
    this.weapon = new Weapon(this.camera);
    this.controls = new Controls($('game-canvas'), this.settings);
    this.controls.setWeapon(this.weapon);
    this.player = new Player(this.camera, this.world);
    this.aiRaycaster = new THREE.Raycaster();
    this.raycaster = new THREE.Raycaster();

    this._wireGameplayCallbacks();
    this._bindUI();
    this._makeStatsBox();

    window.addEventListener('resize', () => this._resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 120));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    window.onerror = msg => this.hud.err(String(msg));

    this._resize();
    this.hud.loading(100);
    this._crossEnemy = false;
    try { this.renderer.compile(this.scene, this.camera); } catch {}
    this._lastT = performance.now();
    requestAnimationFrame(t => this._loop(t));
  }

  _wireGameplayCallbacks() {
    const a = this.audio;
    this.weapon.reloadSnd = hard => a.reloadClick(hard);
    this.player.onFootstep = v => a.footstep(v);
    this.player.onLand = () => { a.footstep(1.6); this.player.addShake(0.02); };
    const q = new THREE.Quaternion();
    this.weapon.onShell = () => {
      this.camera.getWorldQuaternion(q);
      const right = this._v1.set(1, 0, 0).applyQuaternion(q);
      const fwd = this._v2.set(0, 0, -1).applyQuaternion(q);
      const pos = this.weapon.gun.localToWorld(new THREE.Vector3().copy(this.weapon.shellLocal));
      this.effects.shell(pos, right, fwd);
    };
  }

  _bindUI() {
    $('btn-play').addEventListener('click', () => this.startMatch());
    $('btn-again').addEventListener('click', () => location.reload());
    $('btn-resume').addEventListener('click', () => this.resume());
    $('btn-quit').addEventListener('click', () => location.reload());
    $('btn-board-close').addEventListener('click', () => this._closeBoard());
    $('btn-pause').addEventListener('click', () => this.pause());
    $('btn-board').addEventListener('click', () => this._openBoard());
    this.controls.onPause = () => { if (this.state === 'playing') this.pause(); };

    const S = this.settings;
    const sensEl = $('set-sens'), invEl = $('set-invert'), autoEl = $('set-autofire'),
      miniEl = $('set-minimap'), presetEl = $('set-preset'), volEl = $('set-vol');
    sensEl.value = String(Math.round(S.sens * 100));
    $('set-sens-val').textContent = S.sens.toFixed(1);
    invEl.checked = S.invert;
    autoEl.checked = S.autofire;
    miniEl.checked = S.minimap;
    presetEl.value = S.preset;
    volEl.value = String(Math.round(S.vol * 100));
    $('set-vol-val').textContent = String(Math.round(S.vol * 100));
    $('minimap').classList.toggle('hidden', !S.minimap);

    const persist = () => saveSettings(S);
    sensEl.addEventListener('input', () => {
      S.sens = sensEl.value / 100;
      $('set-sens-val').textContent = S.sens.toFixed(1);
      persist();
    });
    invEl.addEventListener('change', () => { S.invert = invEl.checked; persist(); });
    autoEl.addEventListener('change', () => { S.autofire = autoEl.checked; persist(); });
    miniEl.addEventListener('change', () => {
      S.minimap = miniEl.checked;
      $('minimap').classList.toggle('hidden', !S.minimap);
      persist();
    });
    volEl.addEventListener('input', () => {
      S.vol = volEl.value / 100;
      $('set-vol-val').textContent = volEl.value;
      this.audio.setVolume(S.vol);
      persist();
    });
    presetEl.addEventListener('change', () => {
      S.preset = presetEl.value;
      this._applyPreset(S.preset);
      persist();
    });

    const timerEl = $('match-timer');
    timerEl.style.pointerEvents = 'auto';
    timerEl.addEventListener('click', () => {
      this._statsTaps++;
      setTimeout(() => { this._statsTaps = 0; }, 700);
      if (this._statsTaps >= 3) {
        this._statsTaps = 0;
        this.statsBox.classList.toggle('hidden');
      }
    });
  }

  _makeStatsBox() {
    this.statsBox = document.createElement('div');
    this.statsBox.className = 'hidden';
    this.statsBox.style.cssText = 'position:absolute;left:10px;top:50px;z-index:20;background:rgba(0,0,0,.7);color:#9fe89f;font:11px monospace;padding:6px 8px;border-radius:4px;pointer-events:none;white-space:pre;';
    this.statsBox.textContent = 'STATS';
    $('hud').appendChild(this.statsBox);
  }

  _applyPreset(name) {
    this.settings.preset = name;
    this.preset = CFG.perf.presets[name] || CFG.perf.presets.med;
    this.curDpr = Math.min(window.devicePixelRatio || 1, this.preset.dprCap);
    this._applyDpr();
    const wantShadows = this.preset.shadows;
    if (wantShadows !== this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.enabled = wantShadows;
      this.world.sun.castShadow = wantShadows;
      this.world.sun.shadow.mapSize.set(this.preset.shadowRes, this.preset.shadowRes);
      if (this.world.sun.shadow.map) {
        this.world.sun.shadow.map.dispose();
        this.world.sun.shadow.map = null;
      }
      this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    }
    this.effects.setDensity(this.preset.particles);
    saveSettings(this.settings);
  }

  _applyDpr() {
    this.renderer.setPixelRatio(this.curDpr);
    this.renderer.setSize(innerWidth, innerHeight, false);
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this._applyDpr();
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    const portrait = innerHeight > innerWidth;
    this.hud.rotate(isTouch && portrait && this.state !== 'menu');
  }

  async startMatch() {
    if (this.state !== 'menu') return;
    this.state = 'loading';
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    try {
      if (isTouch) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      await screen.orientation?.lock?.('landscape');
    } catch {}
    this.audio.init();
    this.audio.setVolume(this.settings.vol);
    this.audio.uiClick();
    this.hud.overlay(['loading']);
    this.hud.loading(15, 'TIP: Aim down sights for better accuracy');
    await new Promise(r => requestAnimationFrame(r));

    for (let i = 0; i < 4; i++) {
      const s = new Soldier(this, 'rangers', RANGER_NAMES[i]);
      this.soldiers.push(s);
    }
    this.hud.loading(70, 'Intel: MILITIA forces inbound…');
    await new Promise(r => requestAnimationFrame(r));

    for (let i = 0; i < 5; i++) {
      const s = new Soldier(this, 'militia', MILITIA_NAMES[i]);
      this.soldiers.push(s);
    }

    this._minimapObstacles = this.world.colliders.map(b => [
      b.min.x, b.min.z,
      b.max.x - b.min.x, b.max.z - b.min.z
    ]);

    const tips = [
      'TIP: Reload behind cover — tap the ↻ button',
      'TIP: Headshots deal double damage',
      'TIP: Push the stick fully forward to sprint',
      'TIP: Watch the compass for red fire pings'
    ];
    this.hud.loading(95, tips[(Math.random() * tips.length) | 0]);
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => setTimeout(r, 250));

    this.scoreRangers = 0;
    this.scoreMilitia = 0;
    this.matchTime = CFG.match.seconds;
    this.playerKills = 0;
    this.playerDeaths = 0;
    this.playerStreak = 0;

    this.hud.score(0, 0);
    this.hud.vitals(100);
    this.weapon.resetAmmo();
    this.hud.ammo(this.weapon.mag, this.weapon.reserve, false);

    const sp = this.world.spawnsRangers[0];
    this.player.setSpawn(sp);
    this.controls.yaw = Math.atan2(-sp.x, -sp.z) + Math.PI;
    this.controls.enabled = true;
    this.controls.resetState();
    this.controls.requestPointerLock();

    for (const s of this.soldiers) this.respawnBot(s);

    try { this.renderer.compile(this.scene, this.camera); } catch {}
    this.hud.overlay(['hud']);
    this.audio.deploy();
    this.state = 'playing';
    this._lastT = performance.now();
    this._resize();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.controls.firing = false;
    this.hud.overlay(['hud', 'pause']);
    document.exitPointerLock?.();
    this.audio.uiClick();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.overlay(['hud']);
    this.controls.requestPointerLock();
    this.audio.uiClick();
    this._lastT = performance.now();
  }

  _openBoard() {
    if (this.state === 'menu') return;
    const rows = this.soldiers.map(s => ({ name: s.name, team: s.team, kills: s.kills, deaths: s.deaths }));
    rows.push({ name: 'YOU', team: 'rangers', kills: this.playerKills || 0, deaths: this.playerDeaths || 0 });
    this.hud.scoreboard(rows, 'YOU');
    this.boardWasPlaying = this.state === 'playing';
    if (this.boardWasPlaying) this.state = 'paused';
    this.hud.overlay(['hud', 'board']);
  }

  _closeBoard() {
    if (this.boardWasPlaying) {
      this.state = 'playing';
      this.hud.overlay(['hud']);
      this.controls.requestPointerLock();
      this._lastT = performance.now();
    } else if (this.state === 'ended') {
      this.hud.overlay(['end']);
    } else if (this.state === 'paused') {
      this.hud.overlay(['hud', 'pause']);
    } else {
      this.hud.overlay(['hud']);
    }
  }

  pushNoise(x, z, fromRangers, fromPlayer) {
    this.noiseEvents.push({ x, z, fromRangers, fromPlayer, t: this.time });
    if (this.noiseEvents.length > 24) this.noiseEvents.shift();
    while (this.noiseEvents.length && this.time - this.noiseEvents[0].t > 0.5) this.noiseEvents.shift();
  }

  respawnBot(s) {
    const spawns = s.team === 'rangers' ? this.world.spawnsRangers : this.world.spawnsMilitia;
    let sp = spawns[(Math.random() * spawns.length) | 0];
    s.yaw = rand2(Math.PI * 2);
    s.spawnAt(sp);
  }

  damagePlayer(dmg, sourceSoldier) {
    if (this.player.dead || this.state !== 'playing') return;
    const died = this.player.takeDamage(dmg);
    this.audio.hurt();
    this.player.addShake(0.018);
    this.hud.vitals(this.player.hp);
    this.hud.vignette(Math.min(0.85, 0.3 + (CFG.player.maxHP - this.player.hp) / 110));
    clearTimeout(this._vigT);
    this._vigT = setTimeout(() => {
      this.hud.vignette(Math.max(0, (60 - this.player.hp) / 130));
    }, 260);

    const sp = sourceSoldier.position, pp = this.player.position;
    const dx = sp.x - pp.x, dz = sp.z - pp.z;
    const len = Math.hypot(dx, dz) || 1;
    const fx = dx / len, fz = dz / len;
    const rx = Math.cos(this.controls.yaw), rz = -Math.sin(this.controls.yaw);
    const fwx = -Math.sin(this.controls.yaw), fwz = -Math.cos(this.controls.yaw);
    const screenAng = Math.atan2(fx * rx + fz * rz, fx * fwx + fz * fwz);
    this.hud.damageDir(screenAng);

    if (died) this._playerDie(sourceSoldier);
  }

  _playerDie(bySoldier) {
    this.player.dead = true;
    this.playerDeaths++;
    this.playerStreak = 0;
    this.scoreMilitia++;
    this.hud.score(this.scoreRangers, this.scoreMilitia);
    this.hud.killfeed(bySoldier ? bySoldier.name : 'MILITIA', 'YOU', 'militia');
    this.controls.enabled = false;
    this.controls.firing = false;
    this._respawnT = 3;
    this._respawnName = bySoldier ? bySoldier.name : 'RIFLEMAN';
    this.hud.death(this._respawnName, 3);
    this.hud.overlay(['hud', 'death']);
    this._checkWin();
  }

  _respawnPlayer() {
    const spawns = this.world.spawnsRangers;
    const sp = spawns[(Math.random() * spawns.length) | 0];
    this.player.respawn(sp);
    this.weapon.resetAmmo();
    this.hud.ammo(this.weapon.mag, this.weapon.reserve, false);
    this.hud.vitals(this.player.hp);
    this.hud.vignette(0);
    this.controls.yaw = Math.atan2(-sp.x, -sp.z) + Math.PI;
    this.controls.pitch = 0;
    this.controls.enabled = true;
    this.controls.resetState();
    this.hud.overlay(['hud']);
  }

  onBotKill(killer, victim) {
    victim.dead = true;
    killer.kills++;
    if (killer.team === 'rangers') this.scoreRangers++;
    else this.scoreMilitia++;
    this.hud.killfeed(killer.name, victim.name, killer.team);
    this.hud.score(this.scoreRangers, this.scoreMilitia);
    this._checkWin();
  }

  playerShoot() {
    const w = this.weapon;
    if (!w.fire()) {
      if (!w.reloading) {
        if (w.mag === 0 && w.reserve > 0) w.startReload();
        else this.audio.emptyClick();
      }
      return;
    }
    this.audio.shot();
    w.onShell && w.onShell();
    w.bloom = Math.min(CFG.weapon.bloomMax, w.bloom + CFG.weapon.bloomPerShot);
    this.hud.ammo(w.mag, w.reserve, w.reloading);

    const camQ = this.camera.quaternion;
    const sp = w.spread;
    const dir = this._v1.set(
      (Math.random() - 0.5) * sp * 2,
      (Math.random() - 0.5) * sp * 2,
      -1
    ).normalize().applyQuaternion(camQ).clone();
    const origin = this.camera.getWorldPosition(new THREE.Vector3());

    this.raycaster.set(origin, dir);
    this.raycaster.far = 220;
    const envHits = this.raycaster.intersectObjects(this.world.shootables, false);
    let hitDist = envHits.length ? envHits[0].distance : 220;

    let hitSoldier = null, headshot = false, hitPoint = null;
    for (const s of this.soldiers) {
      if (s.team !== 'militia' || s.dead) continue;
      const bp = s.position;
      for (const [oy, r, isHead] of [[1.56, 0.25, true], [1.18, 0.44, false], [0.7, 0.36, false]]) {
        const cx = bp.x, cy = oy, cz = bp.z;
        const vx = cx - origin.x, vy = cy - origin.y, vz = cz - origin.z;
        const proj = vx * dir.x + vy * dir.y + vz * dir.z;
        if (proj < 0 || proj > hitDist) continue;
        const px = origin.x + dir.x * proj, py = origin.y + dir.y * proj, pz = origin.z + dir.z * proj;
        const dd = (px - cx) ** 2 + (py - cy) ** 2 + (pz - cz) ** 2;
        if (dd < r * r) {
          hitDist = proj;
          hitPoint = new THREE.Vector3(px, py, pz);
          hitSoldier = s;
          headshot = isHead;
          break;
        }
      }
      if (hitSoldier) break;
    }

    const muzzle = w.muzzleWorld(new THREE.Vector3());
    this.effects.muzzlePuff(muzzle);

    if (hitSoldier) {
      let dmg = CFG.weapon.damage * (headshot ? CFG.weapon.headshotMul : 1);
      if (hitDist > CFG.weapon.falloffStart) {
        const k = Math.min(1, (hitDist - CFG.weapon.falloffStart) / (CFG.weapon.falloffEnd - CFG.weapon.falloffStart));
        dmg *= 1 - k * (1 - CFG.weapon.falloffMin);
      }
      const killed = hitSoldier.takeDamage(dmg, this.player.position);
      this.effects.burst(hitPoint, dir.clone().negate(), 'flesh');
      this.hud.showDamage(hitPoint, dmg, headshot);
      this.hud.hitmarker(killed);
      this.audio.hit(headshot);
      if (killed) {
        hitSoldier.kills = hitSoldier.kills || 0;
        this.playerKills++;
        this.playerStreak++;
        this.scoreRangers++;
        this.hud.banner(headshot ? 'HEADSHOT' : 'ENEMY DOWN', headshot ? 150 : 100);
        this.hud.killfeed('YOU', hitSoldier.name, 'rangers');
        this.audio.kill();
        for (const [n, txt] of STREAKS) {
          if (this.playerStreak === n) this.hud.streakBanner(txt);
        }
        this._checkWin();
      }
    } else if (envHits.length) {
      const eh = envHits[0];
      const n = eh.face
        ? eh.face.normal.clone().transformDirection(eh.object.matrixWorld)
        : dir.clone().negate();
      const surf = this._surface(eh.object);
      this.effects.burst(eh.point, n, surf);
      this.effects.decal(eh.point, n);
      hitPoint = eh.point;
    } else {
      hitPoint = origin.clone().addScaledVector(dir, 120);
    }

    this.effects.tracer(muzzle, hitPoint || origin.clone().addScaledVector(dir, 120));
    this.pushNoise(origin.x, origin.z, true, true);
  }

  _surface(obj) {
    if (obj === this.world.groundMesh) return 'sand';
    const m = obj.material;
    if (!m) return 'stone';
    if (m.map === this.world.matWood.map) return 'wood';
    if (m.metalness !== undefined && m.metalness > 0.3) return 'metal';
    return 'stone';
  }

  _autoFireScan(dt) {
    this._scanT = (this._scanT || 0) - dt;
    if (this._scanT > 0) return;
    this._scanT = 0.12;
    const origin = this.camera.getWorldPosition(this._v2);
    const dir = this._v3.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    let found = false;
    for (const s of this.soldiers) {
      if (s.team !== 'militia' || s.dead) continue;
      const bp = s.position;
      const vx = bp.x - origin.x, vy = 1.2 - origin.y, vz = bp.z - origin.z;
      const d = Math.hypot(vx, vy, vz);
      if (d > 70) continue;
      const dot = (vx * dir.x + vy * dir.y + vz * dir.z) / d;
      if (dot > 0.9986) { found = true; break; }
    }
    this._crossEnemy = found;
    this._autoFire = found && this.settings.autofire;
  }

  _checkWin() {
    if (this.state !== 'playing') return;
    if (this.scoreRangers >= CFG.match.scoreLimit ||
      this.scoreMilitia >= CFG.match.scoreLimit ||
      this.matchTime <= 0) {
      this._endMatch();
    }
  }

  _endMatch() {
    this.state = 'ended';
    this.controls.enabled = false;
    document.exitPointerLock?.();
    const win = this.scoreRangers >= this.scoreMilitia;
    let mvpName = 'YOU', mvpKills = this.playerKills || 0;
    for (const s of this.soldiers) {
      if (s.kills > mvpKills) { mvpKills = s.kills; mvpName = s.name; }
    }
    this.hud.end(
      win ? 'VICTORY' : 'DEFEAT',
      `RANGERS ${this.scoreRangers} — ${this.scoreMilitia} MILITIA`,
      `MVP: ${mvpName} (${mvpKills} KILLS)`,
      `YOUR KILLS: ${this.playerKills || 0} · DEATHS: ${this.playerDeaths || 0}`,
      win
    );
    this.hud.overlay(['end']);
    this.audio.stinger(win);
  }

  _loop(nowMs) {
    requestAnimationFrame(t => this._loop(t));
    const now = performance.now();
    let dt = (now - this._lastT) / 1000;
    this._lastT = now;
    dt = Math.min(dt, 0.05);
    this.time += dt;

    this._perfSample(dt);
    if (this._avgMs > 0 && this.state === 'playing') {
      this._playSec = (this._playSec || 0) + dt;
      if (!this._lowForced && this._playSec > 8 && this._avgMs > 24.5 && this.settings.preset !== 'low') {
        this._lowForced = true;
        $('set-preset').value = 'low';
        this._applyPreset('low');
        this.hud.streakBanner('PERFORMANCE MODE: LOW');
      }
    }

    if (this.state === 'menu') {
      const a = this.time * 0.07;
      this.camera.position.set(Math.cos(a) * 46, 15, Math.sin(a) * 46);
      this.camera.lookAt(0, 3, 0);
      this.world.update(dt, this.time);
      this.effects.update(dt);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.state === 'paused') {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.state === 'ended') {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.matchTime -= dt;
    const sec = Math.max(0, Math.ceil(this.matchTime));
    if (sec !== this._lastSecond) {
      this._lastSecond = sec;
      this.hud.timer(`${(sec / 60) | 0}:${String(sec % 60).padStart(2, '0')}`);
      if (sec <= 0) this._checkWin();
    }

    if (this.player.dead) {
      this._respawnT -= dt;
      this.hud.death(this._respawnName, Math.max(1, Math.ceil(this._respawnT)));
      if (this._respawnT <= 0) this._respawnPlayer();
    }

    const inputSample = this.controls.sample(dt);
    if (inputSample.reload) this.weapon.startReload();
    this.weapon.ads = this.controls.adsActive && !this.player.dead;

    const firingHeld = (this.controls.firing || this._autoFire) && this.controls.enabled && !this.player.dead;
    this._autoFireScan(dt);

    this.player.update(dt, this.controls, this.weapon);
    this.weapon.update(dt, this.player.speed2D, this.player.grounded, firingHeld);

    if (firingHeld && this.weapon.canFire) this.playerShoot();

    this.noiseEvents.length = this.noiseEvents.length > 30 ? 30 : this.noiseEvents.length;

    for (const s of this.soldiers) s.update(dt, this);

    this.difficulty.enemyErr = clamp(CFG.bot.errEnemyBase - (this.scoreRangers - this.scoreMilitia) * 0.0025, 0.05, 0.12);
    this.difficulty.assistPlayer = this.scoreRangers < this.scoreMilitia - 3;

    this.effects.update(dt);
    this.world.update(dt, this.time);
    this.world.followPlayer(this.player.position.x, this.player.position.z);

    this.hud.crosshairAds(this.weapon._adsT > 0.6);
    this.hud.crosshairEnemy(this._crossEnemy && !this.player.dead);
    this.hud.vitals(this.player.hp);
    this.hud.updateDamage(dt, this.camera, innerWidth, innerHeight);
    const gap = 7 + this.weapon.bloom * 22 * (1 - this.weapon._adsT * 0.65) + Math.min(10, this.player.speed2D * 1.1);
    this.hud.setCrossGap(gap);
    this.hud.ammo(this.weapon.mag, this.weapon.reserve, this.weapon.reloading);

    const pings = new Map();
    for (const s of this.soldiers) {
      if (s.team === 'rangers' || s.dead) continue;
      const life = 1 - (this.time - (s.lastShotTime || -99)) / 1.6;
      if (life > 0) {
        pings.set(s.name, {
          bearing: Math.atan2(s.position.x - this.player.position.x, -(s.position.z - this.player.position.z)),
          life
        });
      }
    }
    this.hud.setPings(pings, this.controls.yaw);

    if (this.settings.minimap) {
      const allies = [], enemies = [];
      for (const s of this.soldiers) {
        if (s.dead) continue;
        const arr = s.team === 'rangers' ? allies : enemies;
        arr.push([(s.position.x - this.player.position.x) * 0.92, (s.position.z - this.player.position.z) * 0.92]);
      }
      this._mmFrame = (this._mmFrame || 0) + 1;
      if (this._mmFrame % 3 === 0) {
        const px = this.player.position.x, pz = this.player.position.z;
        this.hud.minimapDraw({
          yaw: this.controls.yaw,
          allies, enemies,
          obstacles: this._minimapObstacles.map(o => [(o[0] - px) * 0.92, (o[1] - pz) * 0.92, o[2] * 0.92, o[3] * 0.92])
        });
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  _perfSample(dt) {
    this._frameAcc += dt;
    this._frameN++;
    this._dprAdjT += dt;
    if (this._frameN >= 30) {
      this._avgMs = (this._frameAcc / this._frameN) * 1000;
      this._frameAcc = 0;
      this._frameN = 0;
      if (!this.statsBox.classList.contains('hidden')) {
        const info = this.renderer.info;
        const mem = performance.memory ? `heap ${(performance.memory.usedJSHeapSize / 1048576) | 0}MB` : '';
        this.statsBox.textContent =
          `FPS ${(1000 / this._avgMs).toFixed(0)}  ms ${this._avgMs.toFixed(1)}\n` +
          `draws ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(1)}k\n` +
          `dpr ${this.curDpr.toFixed(2)}  geo ${info.memory.geometries}  tex ${info.memory.textures}\n${mem}`;
      }
    }
    if (this._dprAdjT > 1.4 && this.state === 'playing') {
      this._dprAdjT = 0;
      if (this._avgMs > 17.8 && this.curDpr > this.preset.dprFloor) {
        this.curDpr = Math.max(this.preset.dprFloor, this.curDpr - 0.08);
        this._applyDpr();
      } else if (this._avgMs < 13.5 && this.curDpr < Math.min(devicePixelRatio || 1, this.preset.dprCap)) {
        this.curDpr = Math.min(Math.min(devicePixelRatio || 1, this.preset.dprCap), this.curDpr + 0.08);
        this._applyDpr();
      }
    }
  }
}

function rand2(a) { return Math.random() * a; }

window.addEventListener('DOMContentLoaded', () => {
  window.__game = new Game();
});
