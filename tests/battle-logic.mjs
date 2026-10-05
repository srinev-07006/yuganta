// Headless battle-logic assertions (movement rules, props, dual attack, invulnerability, enemy wipe).
//   npm run test:logic
import fs from 'node:fs'; import path from 'node:path';
import { Emitter } from '../src/core/Emitter.js';
import { GameState } from '../src/core/GameState.js';
import { TimelineManager } from '../src/core/TimelineManager.js';
import { VNBridge } from '../src/core/VNBridge.js';
import { buildManifest } from '../tools/buildManifest.js';
import { TacticalScene } from '../src/scenes/TacticalScene.js';
import { GridSystem } from '../src/systems/GridSystem.js';
// Headless: no renderer, so hide the rendering-only anchor; the scene skips token views when it is absent.
delete GridSystem.prototype.unitAnchor;

const dataDir = path.resolve('public/data');
const rj = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
const fetchJson = async (url) => rj(path.resolve('public', url));

// same registry build as BootScene
const lore = rj(`${dataDir}/global/lore.json`), chars = rj(`${dataDir}/global/characters.json`);
const idx = (arr, k) => new Map(arr.map(x => [x[k], x]));
const traits = idx(lore.traits, 'trait_id'), astras = idx(lore.astras, 'astra_id'), vows = idx(lore.vows_boons || [], 'id');
const characterMap = new Map();
for (const c of chars.characters) {
    const rt = (c.traits || []).map(t => traits.get(t)).filter(Boolean);
    const ra = (c.astras || []).map(a => astras.get(a)).filter(Boolean);
    const rv = (c.vows || []).map(v => vows.get(v)).filter(Boolean);
    const nc = rt.some(t => ['NonCombatant()', 'NarratorVision()', 'WisdomCounsel()'].includes(t.custom_script_handler));
    characterMap.set(c.character_id, { ...c, resolvedTraits: rt, resolvedAstras: ra, resolvedVows: rv, isCombatant: !nc });
}

const els = {};
const mk = () => ({ style: {}, remove() {}, appendChild() {}, set innerHTML(v) {}, set textContent(v) {}, set innerText(v) {}, scrollTop: 0, scrollHeight: 0 });
globalThis.document = { getElementById: (id) => (els[id] ||= mk()), createElement: () => ({ style: {}, remove() {}, appendChild() {}, set innerHTML(v) {}, }), body: { appendChild() {} } };
globalThis.window = { innerWidth: 1280, innerHeight: 720 };

const gameState = new GameState();
const gameEvents = new Emitter();
const manifest = buildManifest(dataDir);
const timeline = new TimelineManager({ manifest, fetchJson, gameState, baseUrl: 'data' });
const vnBridge = new VNBridge({ gameState, events: gameEvents, fallbackProvider: { play: (seq) => Promise.resolve({ choicesMade: [], visitedNodeIds: seq.nodes.map(n => n.dialogue_id) }) } });

const registry = new Map([['characterMap', characterMap], ['gameState', gameState], ['timeline', timeline], ['vnBridge', vnBridge]]);
const started = [];
function makeScene(bundle) {
    const s = new TacticalScene();
    s.events = new Emitter();
    s.registry = registry;
    s.scale = { width: 1280, height: 720, on() {}, off() {} };
    s.cameras = { main: { width: 1280, height: 720, shake() {}, flash() {}, fadeIn() {}, fadeOut() {}, setZoom() {}, centerOn() {}, pan() {} } };
    s.input = { on() {}, off() {} };
    const any = (await_ => null);
    const { default: P } = { default: null };
    s.add = new Proxy({}, { get: () => () => new Proxy({}, { get: () => function () { return this; } }) });
    s.game = { events: gameEvents };
    s.scene = { start: (k, d) => started.push(d), restart: () => started.push('restart') };
    s.init({ bundle });
    return s;
}

const nodeId = 'ap-swayamvara';
const bundle = await timeline.loadNode(nodeId);
console.log(`node ${nodeId}: scene=${bundle.sceneType} map=${bundle.mapId}/${!!bundle.map} directives=${bundle.directives.length} triggers=${bundle.triggers.length} startSeq=${bundle.startSequences.length}`);
const scene = makeScene(bundle);
const problems = [];
const origErr = console.error; console.error = (...a) => { problems.push(a.join(' ')); origErr(...a); };
scene.create();
await scene._whenIdle(); await new Promise(r => setTimeout(r, 50));

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); console.log(cond ? '  ✓' : '  ✗', msg); };
const um = scene.unitManager;
const arjuna = um.getUnitById('arjuna'), fish = um.getUnitById('fish-target');

console.log('Objective props');
ok(!!fish && fish.isProp === true, 'fish is a prop addressable by its tag "fish-target"');
ok(!scene.turns.actors('KAURAVA').includes(fish), 'a prop never gets a phase action');

console.log('Movement');
const reach = scene._computeReachableTiles(arjuna);
ok(reach.length > 0 && reach.every(t => t.path[0].x === arjuna.gridX && t.path[0].y === arjuna.gridY), 'every path starts on the unit\'s own tile');
ok(!reach.some(t => t.x === fish.gridX && t.y === fish.gridY), 'cannot walk onto the prop');
const mud = { name: 'Mud', key: 'mud', moveCost: 2, isPassable: true, defenseModifier: -0.1 };
const old = scene.mapGrid[arjuna.gridY][arjuna.gridX - 1];
scene.mapGrid[arjuna.gridY][arjuna.gridX - 1] = mud;
const step = scene._computeReachableTiles(arjuna).find(t => t.x === arjuna.gridX - 1 && t.y === arjuna.gridY);
ok(step && step.path.length === 2, 'a cost-2 tile is still enterable (cost respected, not skipped)');
const far = (r) => Math.max(...r.map(t => t.path.length));
scene.mapGrid[arjuna.gridY][arjuna.gridX - 1] = old;
const lake = { name: 'Lake', key: 'lake', moveCost: 99, isPassable: false, defenseModifier: 0 };
const east = scene.mapGrid[arjuna.gridY][arjuna.gridX + 1];
scene.mapGrid[arjuna.gridY][arjuna.gridX + 1] = lake;
ok(!scene._computeReachableTiles(arjuna).some(t => t.x === arjuna.gridX + 1 && t.y === arjuna.gridY), 'lakes block ordinary units');
const origFly = arjuna.ignoresTerrainCost; arjuna.ignoresTerrainCost = () => true;
ok(scene._computeReachableTiles(arjuna).some(t => t.x === arjuna.gridX + 1 && t.y === arjuna.gridY), 'units that ignore terrain cost (fliers) cross water');
arjuna.ignoresTerrainCost = origFly; scene.mapGrid[arjuna.gridY][arjuna.gridX + 1] = east;

console.log('One move per phase');
ok(arjuna.hasMovedThisTurn === false, 'starts the phase un-moved');
arjuna.endMove();
ok(arjuna.hasMovedThisTurn === true && arjuna.canAct(), 'after endMove: has moved, can still attack/wait');
arjuna.startTurn();
ok(arjuna.hasMovedThisTurn === false, 'startTurn resets the move flag');

console.log('Shooting the fish');
arjuna.gridX = 7; arjuna.gridY = 7; um.updateUnitPosition(arjuna.unitId, 7, 7);
scene.directives.onUnitMoved(arjuna);
ok(!scene._targetsInRange(arjuna).includes(fish), 'AI target list ignores props even when one is in range');
ok(scene._targetsInRange(arjuna, { includeProps: true }).includes(fish), 'player can target the fish from the archery post');
await scene._doAttack(arjuna, fish);
await scene._whenIdle();
ok(fish.isAlive === false, 'fish is destroyed');
ok(scene.directives.states.find(s => s.def.directive_id === 'tutorial-defeat-fish')?.status === 'COMPLETED', 'DEFEAT_UNIT "fish-target" directive completes');
ok(scene.directives.states.find(s => s.def.directive_id === 'tutorial-move-arjuna')?.status === 'COMPLETED', 'REACH_TILE (7,7) directive is satisfiable');

console.log('Combat resolver');
const { CombatResolver } = await import('../src/systems/CombatResolver.js');
const cr = new CombatResolver(scene, scene.battleGrid || scene.grid || scene.gridSystem);
const mkUnit = (name, faction) => um.spawnBattalion('PADATI_MELEE', faction, 0, 0, { name });
const a = mkUnit('A', 'PANDAVA'), d = mkUnit('D', 'KAURAVA');
d.maxHp = d.currentHp = 100000; d.defense = 0; a.attackPower = 10;
a.resolvedTraits = [{ trait_id: 'dual', trait_name: 'Dual', custom_script_handler: 'DualAttackChance(1)' }];
const rnd = Math.random; Math.random = () => 0;                         // every roll procs
const r = cr.resolveAttack(a, d);
Math.random = rnd;
ok(r.extraAttack === true && r.dualAttackResult && r.dualAttackResult.extraAttack === false && !r.dualAttackResult.dualAttackResult, 'dual attack = exactly two strikes, never chains');

const inv = mkUnit('Inv', 'KAURAVA');
inv.resolvedTraits = [
    { trait_id: 'x', trait_name: 'Broken', invulnerable_to_standard_damage: true, custom_script_handler: 'LowerBodyInvulnerable()' },   // returns invulnerable:false only for Bhima; here neutral
    { trait_id: 'chiranjivi', trait_name: 'Immortal', invulnerable_to_standard_damage: true, custom_script_handler: 'CannotBeKilled()' }
];
const hp0 = inv.currentHp;
const blocked = cr.resolveAttack(mkUnit('A2', 'PANDAVA'), inv);
ok(blocked.blocked === true && inv.currentHp === hp0, 'stacked invulnerability traits still block standard damage');


console.log('Charioteer synergies (Arjuna + Krishna)');
const gs2 = scene.gameState, dharma0 = gs2.dharmaMeter;
const pair = um.spawnChariotPair('arjuna', 'krishna', 3, 3, { faction: 'PANDAVA' });
const mgr = scene.charioteerSynergyManager;
let initOk = true; try { mgr.initializeCharioteerSynergies(); } catch (e) { initOk = false; console.log(e.message); }
ok(initOk, 'initializeCharioteerSynergies() does not crash (was: instanceof undefined)');
ok(pair.getCharioteerSynergies().map(s => s.type).sort().join() === 'krishna-guidance,moral-counsel', 'Krishna-driven ratha gets guidance + moral counsel');
ok(mgr.getSummary().length >= 2 && mgr.updateTurn() === undefined, 'getSummary()/updateTurn() work');
gs2.dharmaMeter = 100;
ok(!mgr.canActivate(pair, 'moral-counsel').ok, 'moral counsel is refused while Dharma is high (never wasted)');
gs2.dharmaMeter = 20;
const mc = mgr.activate(pair, 'moral-counsel');
ok(mc.used && gs2.dharmaMeter === 45 && mc.endsAction === true, 'moral counsel restores 25 Dharma and ends the action');
ok(!mgr.activate(pair, 'moral-counsel').used && !pair.hasCharioteerSynergy('moral-counsel'), 'moral counsel is single-use');
const lakeTile = { name: 'Lake', key: 'lake', moveCost: 99, isPassable: false, defenseModifier: 0 };
const keep = scene.mapGrid[pair.gridY][pair.gridX + 1]; scene.mapGrid[pair.gridY][pair.gridX + 1] = lakeTile;
const hit = (r) => r.some(t => t.x === pair.gridX + 1 && t.y === pair.gridY);
ok(!hit(scene._computeReachableTiles(pair)), 'water blocks the ratha normally');
const g = mgr.activate(pair, 'krishna-guidance');
ok(g.used && g.endsAction === false && pair.guidedMove === true && hit(scene._computeReachableTiles(pair)), 'krishna\'s guidance lets the next move cross terrain without ending the action');
pair.endMove();
ok(pair.guidedMove === false, 'guidance is spent by the move');
scene.mapGrid[pair.gridY][pair.gridX + 1] = keep;
gs2.dharmaMeter = dharma0;
const fl = scene._menuFlags(pair);
ok(fl.charioteerSynergies.every(x => typeof x.available === 'boolean'), 'menu flags list the active synergies');

console.log('Psychological warfare (Karna + Shalya)');
const karna = um.spawnChariotPair('karna', 'shalya', 5, 3, { faction: 'KAURAVA' });
mgr.initializeCharioteerSynergies();
ok(scene._menuFlags(karna).charioteerSynergies.length === 0, 'passive synergy has no menu button');
const foe = mkUnit('Foe', 'PANDAVA'); foe.maxHp = foe.currentHp = 100000; foe.defense = 0; foe.attackPower = 100;
const victim = mkUnit('Victim', 'KAURAVA'); victim.maxHp = victim.currentHp = 100000; victim.defense = 0;
const r0 = Math.random; Math.random = () => 0;
const strike = scene.combatResolver.resolveAttack(karna, foe);
Math.random = r0;
ok(foe.hesitationTurns === 1, 'a proc makes the ENEMY hesitate (was: it halved the attacker\'s own damage)');
ok(karna.getCharioteerSynergies().find(s => s.type === 'psychological-warfare').usesLeft === 2, 'one use is spent, in one shared place');
const normal = scene.combatResolver.resolveAttack(mkUnit('Pla', 'PANDAVA'), victim).damage;
foe.attackPower = 100;
const hesitant = scene.combatResolver.resolveAttack(foe, victim).damage;
const sure = (() => { foe.hesitationTurns = 0; return scene.combatResolver.resolveAttack(foe, victim).damage; })();
ok(hesitant < sure, 'the hesitating enemy deals less damage on its next attack');
foe.hesitationTurns = 1; foe.endAction();
ok(foe.hesitationTurns === 0, 'hesitation ends after that phase');

console.log('Astra menu / rules');
const gsA = scene.gameState; const dA = gsA.dharmaMeter;
gsA.dharmaMeter = 100;
const arjMenu = scene._menuFlags(arjuna).astras;
ok(arjMenu.find(a => a.id === 'pashupatastra')?.allowed === true, 'at full Dharma the 100-cost astra is usable (was: dharma read as 50)');
gsA.dharmaMeter = 5;
ok(scene._menuFlags(arjuna).astras.every(a => a.allowed === false), 'with 5 Dharma none is usable');
const ash = um.spawnCharacter('ashwatthama', 9, 9, 'KAURAVA');
const hpA = ash.currentHp;
const blockedAstra = scene.combatResolver.resolveAttack(arjuna, ash, 'pashupatastra');
ok(blockedAstra.blocked === true && ash.currentHp === hpA, 'an astra that cannot be invoked does not pierce invulnerability');
gsA.dharmaMeter = dA;

const _realRandom = Math.random; Math.random = () => 0.99;   // no trait procs: these damage comparisons must be deterministic
console.log('Sammohanastra');
const sleeper = mkUnit('Sleeper', 'KAURAVA'); sleeper.maxHp = sleeper.currentHp = 500; sleeper.defense = 0;
const caster = um.spawnCharacter('arjuna', 1, 1, 'PANDAVA');
caster.resolvedAstras.push({ astra_id: 'sammohanastra', name: 'Sammohanastra', damage_multiplier: 0.0, dharma_cost: 15 });
const sres = scene.combatResolver.resolveAttack(caster, sleeper, 'sammohanastra');
ok(sres.damage === 0 && sleeper.currentHp === 500 && sleeper.isStunned === true, 'sammohana: no damage, target stunned');

console.log('Vows');
const vowIds = scene._menuFlags(arjuna).vows.map(v => v.id);
ok(vowIds.join() === 'slay-jayadratha-sunset', 'only vows with a battle effect get a button');
const jaya = um.spawnCharacter('jayadratha', 8, 1, 'KAURAVA'); jaya.maxHp = jaya.currentHp = 100000; jaya.defense = 0;
const dmg1 = scene.combatResolver.resolveAttack(caster, jaya).damage;
caster.activeVows.add('slay-jayadratha-sunset');
const dmg2 = scene.combatResolver.resolveAttack(caster, jaya).damage;
ok(dmg2 >= dmg1 * 1.9, 'Arjuna\'s vow doubles damage against Jayadratha (real vow id)');
const other = mkUnit('Other', 'KAURAVA'); other.maxHp = other.currentHp = 100000; other.defense = 0;
caster.activeVows.delete('slay-jayadratha-sunset');
const base3 = scene.combatResolver.resolveAttack(caster, other).damage;
caster.activeVows.add('slay-jayadratha-sunset');
ok(scene.combatResolver.resolveAttack(caster, other).damage === base3, 'the vow does nothing against anyone else');

Math.random = _realRandom;
console.log('Enemy wipe and DEFEAT_UNIT');
const { DirectiveManager } = await import('../src/systems/DirectiveManager.js');
const liveTarget = { isAlive: true, faction: 'KAURAVA', characterId: 'x' };
const fakeGrid = { units: [{ isAlive: true, faction: 'PANDAVA' }], findUnit: () => liveTarget, getDistance: () => 0 };
const dm = new DirectiveManager(scene, fakeGrid, [{ directive_id: 'd', directive_type: 'DEFEAT_UNIT', target_unit_id: 'x', fail_on_deviation: true }], {});
dm.onEnemyWipe();
ok(dm.states[0].status === 'ACTIVE', 'a wipe does not complete "defeat X" while X is still alive');
liveTarget.isAlive = false; dm.onEnemyWipe();
ok(dm.states[0].status === 'COMPLETED', '…but does once X is gone');
const dm2 = new DirectiveManager(scene, fakeGrid, [{ directive_id: 'd2', directive_type: 'DEFEAT_UNIT', fail_on_deviation: true }], {});
dm2.onEnemyWipe();
ok(dm2.states[0].status === 'COMPLETED', 'a DEFEAT_UNIT with no named target is met when the host is wiped');

console.log('Enemy wipe');
const fresh = scene.directives;
ok(typeof fresh.onEnemyWipe === 'function', 'DirectiveManager.onEnemyWipe exists');

scene._shutdown();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL LOGIC CHECKS PASSED');
setTimeout(() => process.exit(fails.length ? 1 : 0), 200);
