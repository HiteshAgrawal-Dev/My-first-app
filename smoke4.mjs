import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
global.window = dom.window; global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.requestAnimationFrame = cb => setTimeout(() => cb(1), 16);
global.screen = dom.window.screen; global.localStorage = dom.window.localStorage;
const THREE = await import('./static/js/lib/three.module.min.js');
const { World } = await import('./static/js/world.js');
const { Soldier } = await import('./static/js/ai.js');
const { Effects } = await import('./static/js/effects.js');

const scene = new THREE.Scene();
const world = new World(scene);
const effects = new Effects(scene);
let dmgEvents = 0;

const game = { scene, world, effects, soldiers: [],
  player: { dead:false, position:new THREE.Vector3(0,1.66,0) },
  controls:{yaw:0}, audio:{enemyShot(){},shot(){},hit(){},kill(){}},
  difficulty:{enemyErr:0.09,assistPlayer:false}, noiseEvents:[], state:'playing', time:0,
  aiRaycaster:new THREE.Raycaster(), pushNoise(){},
  damagePlayer(){dmgEvents++;}, onBotKill(){}, respawnBot(){} };

for(let i=0;i<4;i++) game.soldiers.push(new Soldier(game,'rangers','R'+i));
for(let i=0;i<5;i++) game.soldiers.push(new Soldier(game,'militia','M'+i));

const G = game.soldiers[0];
G.yaw = 0;
const bb = new THREE.Box3().setFromObject(G.root);
console.log('bbox_h', (bb.max.y-bb.min.y).toFixed(2), '(expect 1.9-2.3)');
console.log('head_child', G.head ? 'YES' : 'NO');

const mz = G.muzzleWorld(new THREE.Vector3());
console.log('muzzle_front', mz.z > G.position.z + 0.4 ? 'PASS' : 'FAIL');

for(const s of game.soldiers) s.spawnAt(new THREE.Vector3((Math.random()-0.5)*60, 0, (Math.random()-0.5)*60));

let nan = 0, totalDisp = 0, reversals = 0;
const prevYaw = game.soldiers.map(s => s.yaw);
const startPts = game.soldiers.map(s => s.position.clone());
let plantFrames = 0, combatFrames = 0;

for(let f=0; f<900; f++){
  game.time += 1/60;
  for(let i=0;i<game.soldiers.length;i++){
    const s = game.soldiers[i];
    s.update(1/60, game);
    if(!isFinite(s.position.x) || !isFinite(s.position.z)) nan++;
    const dy = Math.abs(s.yaw - prevYaw[i]);
    if(dy > 2.2) reversals++;
    prevYaw[i] = s.yaw;
    if(s.planted){ plantFrames++; }
    if(s.combat){ combatFrames++; }
    if(s.dead && s.respawnT > 0) { /* waiting */ }
  }
}
for(let i=0;i<game.soldiers.length;i++){
  totalDisp += Math.hypot(
    game.soldiers[i].position.x - startPts[i].x,
    game.soldiers[i].position.z - startPts[i].z
  );
}
console.log('avg_displacement', (totalDisp/9).toFixed(1), '(expect >5)');
console.log('yaw_reversals', reversals, '(expect <120)');
console.log('NaN_frames', nan, '(expect 0)');
console.log('combat_frames', combatFrames, 'planted_frames', plantFrames);

const v = game.soldiers[0], sh = game.soldiers[5];
v.spawnAt(new THREE.Vector3(-40,0,-40));
v.hp = 100; v.dead = false; v.root.visible = true;
sh.spawnAt(new THREE.Vector3(-38.5,0,-39));
sh.ai.curTarget={soldier:v,isPlayer:false,pos:v.position};
let hits=0;
for(let n=0;n<30;n++){
  const before=v.hp; if(v.dead){v.hp=100;v.dead=false;}
  sh.ai.targetPos.copy(v.position);
  sh.fireAt({pos:v.position,isPlayer:false,soldier:v},game);
  if(v.hp<before){hits++;v.hp=100;}
}
console.log('hit_rate', hits+'/30 (expect >=22)');

const rOut = new THREE.Vector3(Math.cos(1)*53.8, 0, Math.sin(1)*53.8);
world.collide(rOut, 0.45);
console.log('boundary_hold', Math.hypot(rOut.x,rOut.z) <= 54.5 ? 'PASS' : 'FAIL');

console.log(nan===0 ? 'SMOKE4_PASS' : 'SMOKE4_FAIL_NAN');
