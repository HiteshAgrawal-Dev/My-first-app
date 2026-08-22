import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16);
global.screen = dom.window.screen;
global.localStorage = dom.window.localStorage;

const THREE = await import('./static/js/lib/three.module.min.js');
const { World } = await import('./static/js/world.js');
const { Soldier } = await import('./static/js/ai.js');
const { buildSoldierV2 } = await import('./static/js/soldier.js');
const { Effects } = await import('./static/js/effects.js');

const scene = new THREE.Scene();
const world = new World(scene);
console.log('WORLD_OK nodes', world.navNodes.length, 'colliders', world.colliders.length);

const effects = new Effects(scene);

const game = {
  scene, world, effects,
  soldiers: [],
  player: { dead: false, position: new THREE.Vector3(-46, 1.66, -42) },
  controls: { yaw: 0 },
  audio: { enemyShot() {}, shot() {}, hit() {}, kill() {} },
  difficulty: { enemyErr: 0.09, assistPlayer: false },
  noiseEvents: [],
  state: 'playing',
  time: 0,
  aiRaycaster: new THREE.Raycaster(),
  pushNoise() {},
  damagePlayer() {},
  onBotKill() {},
  respawnBot() {}
};

for (let i = 0; i < 4; i++) game.soldiers.push(new Soldier(game, 'rangers', 'R' + i));
for (let i = 0; i < 5; i++) game.soldiers.push(new Soldier(game, 'militia', 'M' + i));
console.log('SOLDIERS_BUILT', game.soldiers.length);

let meshes = 0, draws = 0;
scene.traverse(o => { if (o.isMesh || o.isSprite) { meshes++; if (o.visible) draws++; } });
console.log('scene_objects', meshes);

for (const s of game.soldiers) s.spawnAt(world.spawnsRangers[0]);

let steps = 0, stuck = 0;
for (let f = 0; f < 600; f++) {
  game.time += 1 / 60;
  for (const s of game.soldiers) s.update(1 / 60, game);
}
for (const s of game.soldiers) {
  const d = Math.hypot(s.position.x - world.spawnsRangers[0].x, s.position.z - world.spawnsRangers[0].z);
  if (d > 4) stuck++;
}
console.log('BOTS_MOVED_OUT_OF_SPAWN', stuck, '/9 (expect most >4m away)');
console.log('anim_check legL.rot.x sample:', game.soldiers[5].legL.rotation.x.toFixed(3));

const victim = game.soldiers.find(s => s.team === 'rangers');
const shooter = game.soldiers.find(s => s.team === 'militia');
shooter.ai.curTarget = { soldier: victim, isPlayer: false };
shooter.ai.targetPos.copy(victim.position);
shooter.fireAt({ pos: victim.position, isPlayer: false, soldier: victim }, game);
console.log('FIRE_AT_OK victim_hp', victim.hp.toFixed(1), 'dead', victim.dead);

victim.takeDamage(200, shooter.position);
console.log('DEATH_FALL dir', victim.fallDir, 'rootZ', victim.root.rotation.z.toFixed(2));

console.log('SMOKE2_OK');
