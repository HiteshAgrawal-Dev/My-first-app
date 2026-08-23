import * as THREE from 'three';
import { clamp } from './util.js';

const $ = id => document.getElementById(id);

export class HUD {
  constructor(settings) {
    this.settings = settings;
    this.els = {
      menu: $('menu-screen'), loading: $('loading-screen'), hud: $('hud'),
      pause: $('pause-screen'), board: $('board-screen'), death: $('death-screen'), end: $('end-screen'),
      scoreR: $('score-rangers'), scoreM: $('score-militia'), timer: $('match-timer'),
      hpNum: $('health-num'), hpBar: $('health-bar'),
      magEl: $('ammo-mag'), resEl: $('ammo-reserve'), ammoWrap: document.querySelector('.ammo-count'),
      reloadLabel: $('reload-label'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
      killfeed: $('killfeed'), vignette: $('damage-vignette'), lowhp: $('lowhp-vignette'),
      dmgDir: $('dmg-dir'), banner: $('kill-banner'), streak: $('streak-banner'),
      compassRuler: $('compass-ruler'), compassPings: $('compass-pings'),
      minimap: $('minimap'), deathBy: $('death-by'), respawnCount: $('respawn-count'),
      endResult: $('end-result'), endScore: $('end-score'), endMvp: $('end-mvp'), endStats: $('end-stats'),
      loadingBar: $('loading-bar'), loadingTip: $('loading-tip'), rotate: $('rotate-prompt'),
      errToast: $('err-toast'), kbHints: $('kb-hints')
    };
    this.minimapCtx = this.els.minimap.getContext('2d');
    this._pings = new Map();
    this._buildCompass();
    this._bannerT = null;
    this._streakT = null;
    this.dmgWrap = $('dmg-numbers');
    this.dmgPool = [];
    this.dmgItems = [];
    for (let i = 0; i < 12; i++) {
      const el = document.createElement('div');
      el.className = 'dmg-num';
      el.style.display = 'none';
      this.dmgWrap.appendChild(el);
      this.dmgPool.push(el);
    }
    this._v = new THREE.Vector3();
  }

  showDamage(pos, amount, crit) {
    const el = this.dmgPool.find(e => e.style.display === 'none') || this.dmgPool[0];
    el.textContent = crit ? Math.round(amount) + '!' : Math.round(amount);
    el.className = 'dmg-num' + (crit ? ' crit' : '');
    el.style.display = 'block';
    this.dmgItems.push({ el, pos: pos.clone(), t: 0, tot: 0.8, rise: 0 });
    if (this.dmgItems.length > 14) {
      const old = this.dmgItems.shift();
      old.el.style.display = 'none';
    }
  }

  updateDamage(dt, camera, w, h) {
    for (let i = this.dmgItems.length - 1; i >= 0; i--) {
      const it = this.dmgItems[i];
      it.t += dt;
      it.rise += dt * 46;
      if (it.t >= it.tot) {
        it.el.style.display = 'none';
        this.dmgItems.splice(i, 1);
        continue;
      }
      this._v.copy(it.pos).project(camera);
      if (this._v.z > 1 || this._v.z < -1) {
        it.el.style.opacity = '0';
        continue;
      }
      const sx = (this._v.x * 0.5 + 0.5) * w;
      const sy = (-this._v.y * 0.5 + 0.5) * h - it.rise;
      it.el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(-50%,-100%)`;
      it.el.style.opacity = String(clamp(1.6 - it.t / it.tot * 1.6, 0, 1));
    }
  }

  _buildCompass() {
    const ruler = this.els.compassRuler;
    ruler.innerHTML = '';
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let r = 0; r < 3; r++) {
      for (let d = 0; d < 360; d += 15) {
        const s = document.createElement('span');
        if (names[d] !== undefined && d % 45 === 0) s.textContent = names[d];
        else { s.className = 'tick'; }
        s.dataset.deg = String(r * 360 + d);
        s.style.left = (r * 360 + d) * 2 + 'px';
        ruler.appendChild(s);
      }
    }
  }

  updateCompass(yaw, pings) {
    let deg = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
    this.els.compassRuler.style.transform = `translateX(${-(deg + 360) * 2}px)`;
    for (const [id, el] of this._pings) {
      const p = pings.get(id);
      if (!p) { el.remove(); this._pings.delete(id); continue; }
      let rel = ((p.bearing - yaw) * 180 / Math.PI);
      rel = ((rel % 360) + 540) % 360 - 180;
      const w = this.els.compassPings.clientWidth;
      const half = 75;
      if (Math.abs(rel) > half) el.style.display = 'none';
      else {
        el.style.display = 'block';
        el.style.left = (w / 2 + (rel / half) * (w / 2)) + 'px';
        el.style.opacity = Math.max(0.25, p.life);
      }
    }
  }

  setPings(map, yaw) {
    for (const [id, p] of map) {
      if (!this._pings.has(id)) {
        const el = document.createElement('div');
        el.className = 'c-ping';
        this.els.compassPings.appendChild(el);
        this._pings.set(id, el);
      }
    }
    this.updateCompass(yaw, map);
  }

  clearPings() {
    for (const [, el] of this._pings) el.remove();
    this._pings.clear();
  }

  score(r, m) { this.els.scoreR.textContent = r; this.els.scoreM.textContent = m; }
  timer(t) { this.els.timer.textContent = t; }
  vitals(hp) {
    const v = Math.max(0, Math.round(hp));
    this.els.hpNum.textContent = v;
    this.els.hpBar.style.width = v + '%';
    this.els.hpBar.classList.toggle('low', v <= 35);
    this.els.lowhp.classList.toggle('on', v <= 30 && v > 0);
  }
  ammo(mag, reserve, reloading) {
    this.els.magEl.textContent = mag;
    this.els.resEl.textContent = reserve;
    this.els.reloadLabel.classList.toggle('hidden', !reloading);
    this.els.ammoWrap.classList.toggle('lowmag', mag <= 6);
  }
  crosshairAds(on) { this.els.crosshair.classList.toggle('ads', on); }
  crosshairEnemy(on) { this.els.crosshair.classList.toggle('enemy', on); }
  setCrossGap(px) { this.els.crosshair.style.setProperty('--gap', px + 'px'); }

  hitmarker(kill) {
    const hm = this.els.hitmarker;
    hm.classList.remove('show', 'kill');
    void hm.offsetWidth;
    hm.classList.add('show');
    if (kill) hm.classList.add('kill');
  }

  banner(text, pts) {
    const b = this.els.banner;
    b.innerHTML = text + (pts ? ` <span class="kb-pts">+${pts}</span>` : '');
    b.classList.remove('hidden');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => b.classList.add('hidden'), 1200);
  }

  streakBanner(text) {
    const b = this.els.streak;
    b.textContent = text;
    b.classList.remove('hidden');
    void b.offsetWidth;
    clearTimeout(this._streakT);
    this._streakT = setTimeout(() => b.classList.add('hidden'), 1600);
  }

  killfeed(killer, victim, killerTeam) {
    const kf = this.els.killfeed;
    const e = document.createElement('div');
    e.className = 'kf-entry';
    const kc = killerTeam === 'rangers' ? 'kf-r' : 'kf-m';
    const vc = killerTeam === 'rangers' ? 'kf-m' : 'kf-r';
    e.innerHTML = `<span class="${kc}">${killer}</span> &#9876; <span class="${vc}">${victim}</span>`;
    kf.appendChild(e);
    while (kf.children.length > 4) kf.removeChild(kf.firstChild);
    setTimeout(() => { if (e.parentNode) e.parentNode.removeChild(e); }, 4200);
  }

  vignette(op) { this.els.vignette.style.opacity = op; }

  damageDir(screenAngRad) {
    const wrap = this.els.dmgDir;
    const el = document.createElement('div');
    el.className = 'dmg-wedge';
    el.style.transform = `rotate(${screenAngRad}rad)`;
    el.style.opacity = '1';
    wrap.appendChild(el);
    requestAnimationFrame(() => { el.style.transition = 'opacity .7s'; el.style.opacity = '0'; });
    setTimeout(() => el.remove(), 800);
  }

  minimapDraw(d) {
    if (!this.settings.minimap) return;
    const c = this.minimapCtx, S = 132, R = S / 2;
    const s = (R - 4) / 58;
    const ox = R - d.px * s, oy = R - d.pz * s;
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(R, R, R - 2, 0, 7); c.clip();
    c.fillStyle = 'rgba(22,18,12,0.88)';
    c.fillRect(0, 0, S, S);
    for (const o of d.obstacles) {
      c.fillStyle = 'rgba(170,148,104,0.42)';
      c.fillRect(ox + o[0] * s, oy + o[1] * s, Math.max(1.5, o[2] * s), Math.max(1.5, o[3] * s));
    }
    c.strokeStyle = 'rgba(232,200,120,0.95)';
    c.lineWidth = 2.5;
    c.beginPath(); c.arc(ox, oy, 55 * s, 0, 7); c.stroke();
    for (const a of d.allies) {
      c.fillStyle = '#7ee06a';
      c.beginPath(); c.arc(ox + a[0] * s, oy + a[1] * s, 3, 0, 7); c.fill();
    }
    for (const en of d.enemies) {
      c.fillStyle = '#ff5030';
      c.beginPath(); c.arc(ox + en[0] * s, oy + en[1] * s, 3, 0, 7); c.fill();
    }
    c.save();
    c.translate(R, R);
    c.rotate(-d.yaw);
    c.fillStyle = '#ffe8b0';
    c.beginPath();
    c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(-5, 6);
    c.closePath(); c.fill();
    c.restore();
    c.restore();
    c.fillStyle = 'rgba(240,228,189,0.95)';
    c.font = '900 11px Arial';
    c.textAlign = 'center';
    c.fillText('N', R, 12);
  }

  scoreboard(rows, myName) {
    const box = $('board-rows');
    box.innerHTML = '';
    rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    for (const r of rows) {
      const div = document.createElement('div');
      div.className = 'board-row' + (r.name === myName ? ' me' : '');
      div.innerHTML = `<span>${r.name}</span><span class="t-${r.team === 'rangers' ? 'r' : 'm'}">${r.team === 'rangers' ? 'RANGERS' : 'MILITIA'}</span><span>${r.kills}</span><span>${r.deaths}</span>`;
      box.appendChild(div);
    }
  }

  show(which) {
    for (const k of ['menu', 'loading', 'hud', 'pause', 'board', 'death', 'end']) {
      this.els[k].classList.toggle('hidden', k !== which);
    }
  }
  overlay(showIds) {
    const ids = Array.isArray(showIds) ? showIds : [];
    for (const k of ['menu', 'loading', 'hud', 'pause', 'board', 'death', 'end']) {
      this.els[k].classList.toggle('hidden', !ids.includes(k));
    }
  }

  loading(pct, tip) {
    if (tip) this.els.loadingTip.textContent = tip;
    this.els.loadingBar.style.width = pct + '%';
  }

  death(byName, count) {
    this.els.deathBy.textContent = 'by MILITIA ' + byName;
    this.els.respawnCount.textContent = count;
  }

  end(result, scoreLine, mvpLine, statsLine, win) {
    this.els.endResult.textContent = result;
    this.els.endResult.className = 'end-result ' + (win ? 'win' : 'lose');
    this.els.endScore.textContent = scoreLine;
    this.els.endMvp.textContent = mvpLine;
    this.els.endStats.textContent = statsLine;
  }

  rotate(show) { this.els.rotate.classList.toggle('hidden', !show); }

  err(msg) {
    const t = this.els.errToast;
    t.classList.remove('hidden');
    t.textContent = msg.slice(0, 300);
    setTimeout(() => t.classList.add('hidden'), 6000);
  }
}
