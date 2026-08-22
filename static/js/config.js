export const CFG = {
  match: { scoreLimit: 50, seconds: 600 },
  arena: { radius: 57 },
  player: {
    walkSpeed: 5.0,
    sprintSpeed: 7.7,
    adsSpeedMul: 0.55,
    accelGround: 16,
    accelAir: 3.5,
    gravity: 22,
    jumpVel: 7.0,
    eyeHeight: 1.66,
    bodyRadius: 0.45,
    maxHP: 100,
    regenDelay: 5,
    regenRate: 10
  },
  weapon: {
    name: 'AK-47',
    magSize: 30,
    reserveMax: 150,
    fireRate: 0.1,
    damage: 26,
    reloadTime: 2.3,
    hipSpread: 0.02,
    adsSpread: 0.0025,
    bloomPerShot: 0.085,
    bloomDecay: 1.15,
    bloomMax: 1.0,
    falloffStart: 28,
    falloffEnd: 110,
    falloffMin: 0.55,
    headshotMul: 2.0,
    recoilVBase: 0.010,
    recoilVGrowth: 0.0016,
    recoilHDrift: 0.0055,
    recoilAdsMul: 0.62
  },
  bot: {
    hp: 100,
    speedPatrol: 2.75,
    speedHunt: 3.4,
    speedStrafe: 2.1,
    sightRange: 65,
    fovCos: Math.cos(1.05),
    hearRange: 48,
    perceiveInterval: 0.22,
    burstMin: 3,
    burstMax: 6,
    burstInterval: 0.13,
    burstPauseMin: 0.65,
    burstPauseMax: 1.45,
    dmgToPlayer: [9, 15],
    dmgToBot: [16, 26],
    aimSettleRad: 0.14,
    respawnMin: 4.5,
    respawnMax: 7.5,
    errAlly: 0.07,
    errEnemyBase: 0.09,
    lowHP: 35,
    coverWait: [2.0, 3.5]
  },
  perf: {
    presets: {
      low:  { dprCap: 1.0,  dprFloor: 0.72, shadows: false, shadowRes: 512,  particles: 0.55, dust: 90  },
      med:  { dprCap: 1.35, dprFloor: 0.78, shadows: true,  shadowRes: 1024, particles: 1.0,  dust: 180 },
      high: { dprCap: 1.6,  dprFloor: 0.9,  shadows: true,  shadowRes: 1024, particles: 1.35, dust: 260 }
    }
  }
};

export const SETTINGS_KEY = 'ds_settings_v1';
export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (s && typeof s === 'object') return {
      sens: +s.sens || 1, invert: !!s.invert, autofire: !!s.autofire,
      minimap: !!s.minimap, vol: (s.vol === undefined ? 0.8 : +s.vol),
      preset: ['low', 'med', 'high'].includes(s.preset) ? s.preset : 'med'
    };
  } catch {}
  return { sens: 1, invert: false, autofire: false, minimap: true, vol: 0.8, preset: 'med' };
}
export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}
