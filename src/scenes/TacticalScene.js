// =============================================================
// TacticalScene.js — the battlefield (Phase 3.1: node-aware, viewport-fit, new HUD)
// =============================================================
// Data in : init({ bundle })  — NodeBundle from TimelineManager.loadNode(); null → demo board.
// Flow    : create → [NODE_START sequences] → TurnManager rounds/phases
//           player phase = click menu (Move once, Attack/Wait once) · AI phase = AIController
// View    : fixed world coordinates + ONE camera fit (GridSystem.fitCamera) → any screen size.
//           All DOM lives in ui/HudController.js (this file never touches document.*).
// Picking : units are hit-tested by their drawn token first, then tiles with elevation-aware
//           picking — so clicking the circle you SEE selects that unit (the old build picked the
//           tile behind the token, which is why the info box only appeared "below" the unit).
// =============================================================
import Phaser from 'phaser';
import { GridSystem } from '../systems/GridSystem.js';
import { UnitManager } from '../systems/UnitManager.js';
import { CombatResolver } from '../systems/CombatResolver.js';
import { TriggerEvaluator } from '../systems/TriggerEvaluator.js';
import { DirectiveManager, DIRECTIVE_EVENTS } from '../systems/DirectiveManager.js';
import { spawnMapUnits } from '../systems/MapSpawner.js';
import { spawnFormation, buildCharacterPool } from '../systems/FormationSpawner.js';
import { deriveSpawns } from '../core/MapConverter.js';
import { getTerrainForUnit } from '../data/TerrainConfig.js';
import { getMapLayout } from '../data/MapLayouts.js';
import { TurnManager } from '../core/TurnManager.js';
import { BattleGrid } from '../core/BattleGrid.js';
import { AIController } from '../ai/AIController.js';
import { HudController } from '../ui/HudController.js';
import { spriteTextureKey } from '../data/CharacterSprites.js';
import { CharioteerSynergyManager } from '../systems/CharioteerSynergyManager.js';

const PLAYER_FACTION = 'PANDAVA';
const FACTION_COLOR = { PANDAVA: 0x35b6d6, KAURAVA: 0xe0483a, NEUTRAL: 0xb8b0a0 };
const GOLD = 0xf3d98b;
const SPRITE_HEIGHT = 112;       // on-board height of character art, in world px (tile is 128x64)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TEXT_RES = Math.max(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);

export class TacticalScene extends Phaser.Scene {
    constructor() {
        super('TacticalScene');
        this.STATES = {
            IDLE: 'IDLE',
            UNIT_SELECTED: 'UNIT_SELECTED',
            AWAITING_MOVE_TARGET: 'AWAITING_MOVE_TARGET',
            AWAITING_ATTACK_TARGET: 'AWAITING_ATTACK_TARGET',
            EXECUTING_ACTION: 'EXECUTING_ACTION'
        };
    }

    init(data) {
        this.bundle = data?.bundle || null;
        this.charactersData = data?.charactersData || null;
        this.triggers = this.bundle?.triggers || [];
        this.currentState = this.STATES.IDLE;
        this.selectedUnit = null;
        this.reachableTiles = [];
        this.attackableTiles = [];
        this._resizeTimer = null;
        this._resizeHandler = null;
        this._alive = true;          // false after shutdown: async work must stop touching the scene
        this._ended = false;         // battle resolved (victory / imbalance / defeat)
        this._busy = 0;              // pending narrative jobs that pause the tactical layer
        this._chain = Promise.resolve();
        this._drag = null;
        this._hoverKey = '';
        this.zoomMul = 1;
    }

    create() {
        this.events.once('shutdown', this._shutdown, this);
        try {
            this.timeline = this.registry.get('timeline') || null;
            this.vnBridge = this.registry.get('vnBridge') || null;
            this.gameState = this.registry.get('gameState') || null;
            this.characterMap = this.registry.get('characterMap') || null;
            this.nodeId = this.bundle?.node?.node_id || null;

            this.hud = new HudController();
            this.hud.bind({
                move: () => this._onActionMove(),
                attack: () => this._onActionAttack(),
                wait: () => this._onActionWait(),
                astra: (id) => this._onActionAstra(id),
                vow: (id) => this._onActionVow(id),
                charioteerSynergy: (id) => this._onActionCharioteerSynergy(id),
                cancel: () => this._deselectUnit(),
                endPhase: () => this._endPlayerPhase()
            });

            // manifest-level problems are already reported once by BootScene; show only this node's own warnings
            const known = new Set(this.timeline?.manifest?.problems || []);
            (this.bundle?.warnings || []).filter(w => !known.has(w)).forEach(w => console.warn('[TacticalScene] data warning:', w));
            this.game.events.emit('yuganta:node-started', this.nodeId);
            this._setupHud();

            if (this.bundle?.sceneType === 'VN') { this._runVNNode(); return; }
            this._buildBattle();
        } catch (err) {
            console.error('[TacticalScene Create Crash]:', err);
            this.hud?.log(`CRITICAL ENGINE ERROR: ${err.message}`, 'bad');
        }
    }

    // -------------------------------------------------------------
    // Battle construction
    // -------------------------------------------------------------
    _buildBattle() {
        const map = this.bundle?.map || null;
        let width, height;
        if (map) {
            this.mapGrid = map.matrix; width = map.width; height = map.height;
        } else {
            const layout = getMapLayout(this.bundle?.mapId || 'map_kurukshetra_center');   // built-in fallback boards
            this.mapGrid = layout.terrain; width = layout.width; height = layout.height;
            if (this.bundle) this.hud.log(`No map file for "${this.bundle.mapId}" — using the built-in ${layout.name} board.`, 'system');
        }

        this.gridSystem = new GridSystem(this, { width, height });
        this.gridSystem.createGrid(this.mapGrid);
        if (map?.markers?.length) this.gridSystem.drawMarkers(map.markers);

        const catalog = this.charactersData || this._getFallbackCharacterCatalog();
        this.unitManager = new UnitManager(this, catalog);
        this.battleGrid = new BattleGrid(this.unitManager, () => this.mapGrid);

        // Initialize charioteer synergy manager
        this.charioteerSynergyManager = new CharioteerSynergyManager(this, this.unitManager);

        this.combatResolver = new CombatResolver(this, this.battleGrid, this.charioteerSynergyManager);
        this.triggerEvaluator = new TriggerEvaluator(this);
        this.triggerEvaluator.reset();

        this.directives = new DirectiveManager(this, this.battleGrid, this.bundle?.directives || [],
            { nodeId: this.nodeId, playerFaction: PLAYER_FACTION });
        for (const ev of [DIRECTIVE_EVENTS.ALL_COMPLETE, DIRECTIVE_EVENTS.DHARMA_IMBALANCE,
                          DIRECTIVE_EVENTS.CANON_PROGRESS, DIRECTIVE_EVENTS.DEFEAT]) {
            this.directives.on(ev, (payload) => this._onResolved(ev, payload));
        }
        this.directives.on(DIRECTIVE_EVENTS.COMPLETED, ({ directive, reason }) => {
            this.hud.log(`Objective fulfilled — ${reason}`, 'good');
            this.hud.setObjectiveStatus(directive.directive_id, 'COMPLETED');
        });
        this.directives.on(DIRECTIVE_EVENTS.FAILED, ({ directive, reason }) => {
            this.hud.log(`Canon broken — ${reason}`, 'bad');
            this.hud.setObjectiveStatus(directive.directive_id, 'FAILED');
        });
        this.hud.setObjectives((this.bundle?.directives || []).map(d => ({ id: d.directive_id, text: this._describeDirective(d) })));

        this.turns = new TurnManager(this.unitManager, { playerFaction: PLAYER_FACTION });
        this.turns.on('round:start', ({ round }) => this.triggerEvaluator.evaluateTurnTriggers(round, this.triggers));
        this.turns.on('round:end', ({ round }) => this.directives.onTurnEnd(round));
        this.turns.on('phase:start', (p) => this._onPhaseStart(p));
        this.turns.on('phase:end', () => this._deselectUnit());

        this.ai = new AIController(this._aiFacade(), { thinkDelayMs: 280 });

        this.events.on('trigger:fire-system', this._handleSystemTrigger, this);
        this.events.on('trigger:fire-vn', this._handleVNTrigger, this);
        this._buildSelectionArrow();
        this._bindInput();
        this._bindKeyboard();

        this._resizeHandler = () => {
            if (this._resizeTimer) clearTimeout(this._resizeTimer);
            this._resizeTimer = setTimeout(() => this._handleResize(), 60);
        };
        this.scale.on('resize', this._resizeHandler);

        // Region-style maps ship spawn ZONES, not units: pick a roster inside them (unless the node uses formations).
        let mapSpawns = map?.spawns || [];
        const usesFormations = !!(this.bundle?.pandava_formation && this.bundle?.kaurava_formation);
        if (map && !mapSpawns.length && map.spawn_zones && !usesFormations) {
            const derived = deriveSpawns(map, { directives: this.bundle?.directives, triggers: this.bundle?.triggers,
                characterMap: this.characterMap, nodeId: this.nodeId });
            derived.notes.forEach(n => this.hud.log(`Spawn: ${n}`, 'system'));
            mapSpawns = derived.spawns;
        }
        if (map && mapSpawns.length) {
            const { units, failures } = spawnMapUnits(this.unitManager, mapSpawns);
            units.forEach(u => this._syncUnitView(u));
            failures.forEach(f => this.hud.log(`Spawn failed: ${f.spawn.character_id || f.spawn.unit_class} at (${f.spawn.x},${f.spawn.y}) — ${f.error}`, 'bad'));
        } else if (this.bundle?.pandava_formation && this.bundle?.kaurava_formation) {
            // Use formation-based spawning
            const formationsMap = this.registry.get('formationsMap') || new Map();
            const characterPool = buildCharacterPool(this.charactersData);
            const map = this.bundle?.map;

            const pandavaFormation = formationsMap.get(this.bundle.pandava_formation);
            const kauravaFormation = formationsMap.get(this.bundle.kaurava_formation);

            if (pandavaFormation && map?.spawn_zones?.PANDAVA) {
                const spawned = spawnFormation(pandavaFormation, characterPool, map.spawn_zones.PANDAVA, 'PANDAVA');
                for (const spawn of spawned) {
                    let unit;
                    if (spawn.character_id) {
                        unit = this.unitManager.spawnCharacter(spawn.character_id, spawn.x, spawn.y, 'PANDAVA');
                    } else {
                        unit = this.unitManager.spawnBattalion(spawn.class, 'PANDAVA', spawn.x, spawn.y);
                    }
                    if (unit) this._syncUnitView(unit);
                }
            }

            if (kauravaFormation && map?.spawn_zones?.KAURAVA) {
                const spawned = spawnFormation(kauravaFormation, characterPool, map.spawn_zones.KAURAVA, 'KAURAVA');
                for (const spawn of spawned) {
                    let unit;
                    if (spawn.character_id) {
                        unit = this.unitManager.spawnCharacter(spawn.character_id, spawn.x, spawn.y, 'KAURAVA');
                    } else {
                        unit = this.unitManager.spawnBattalion(spawn.class, 'KAURAVA', spawn.x, spawn.y);
                    }
                    if (unit) this._syncUnitView(unit);
                }
            }
        } else {
            this._spawnBattlefieldUnits();
        }

        // Initialize charioteer synergies after units are spawned
        this.charioteerSynergyManager.initializeCharioteerSynergies();

        this._fit();
        this.hud.log(`${this.bundle?.node?.title || 'Demo board'} — select a Pandava unit. Move once, then Attack or Wait.`, 'system');
        this._startBattle();
    }

    async _startBattle() {
        this.hud.banner(this.bundle?.node?.title || 'Yuganta', this._placeLine());
        // NODE_START sequences play before the first round
        for (const seq of this.bundle?.startSequences || []) {
            await this._enqueueNarrative(() => this._playSequence(seq));
            if (!this._alive) return;
        }
        this.turns.start();
    }

    // -------------------------------------------------------------
    // VN-type nodes: play their NODE_START sequences, then move on
    // -------------------------------------------------------------
    async _runVNNode() {
        this.hud.log(this.bundle.node.title, 'story');
        this.hud.setTurn({ round: 0, faction: '', isPlayer: false, running: false });
        for (const seq of this.bundle.startSequences || []) {
            await this._enqueueNarrative(() => this._playSequence(seq));
            if (!this._alive) return;
        }
        this._ended = true;
        await this._advance();
    }

    async _advance() {
        if (!this._alive) return;
        const next = this.timeline && this.nodeId ? this.timeline.getNextNodeId(this.nodeId) : null;
        if (!next) { this.hud.banner('The chronicle ends here', 'No further nodes are available.'); return; }
        await this._goToNode(next, false);
    }

    async _goToNode(nodeId, reload) {
        try {
            const bundle = await this.timeline.loadNode(nodeId, { reload });
            if (this._alive) this.scene.start('TacticalScene', { bundle });
        } catch (err) {
            console.error('[TacticalScene] node load failed:', err);
            this.hud.log(`Could not load node "${nodeId}": ${err.message}`, 'bad');
        }
    }

    // =============================================================
    // HUD text helpers
    // =============================================================
    _setupHud() {
        const b = this.bundle;
        this.hud.setNode({
            title: b ? b.parva.name : 'Yuganta · Demo board',
            subtitle: b ? `${b.node.title}${b.node.war_day ? ` · Day ${b.node.war_day}` : ''}` : 'Phase 3 sandbox'
        });
        this._onDharma = () => this.hud.setDharma(this.gameState?.dharmaMeter ?? 100);
        this.gameState?.on('dharma:changed', this._onDharma);
        this.gameState?.on('state:restored', this._onDharma);
        this._onDharma();
        this.hud.setTurn({ round: 0, faction: '', isPlayer: false, running: false });
    }

    _placeLine() {
        const m = this.bundle?.map;
        const ctx = this.bundle?.node?.historical_context || '';
        return m?.description || (ctx.length > 120 ? ctx.slice(0, 117) + '…' : ctx) || '';
    }

    _charName(id) {
        const c = this.characterMap?.get?.(id);
        return (c && c.canonical_name) ? c.canonical_name.split(' ')[0] : String(id || '').replace(/-/g, ' ');
    }

    _describeDirective(d) {
        const who = d.target_unit_id ? this._charName(d.target_unit_id) : null;
        const by = Number.isInteger(d.target_turns) ? ` before round ${d.target_turns + 1}` : '';
        const tile = (t) => t ? `(${t.x}, ${t.y})` : null;
        switch (d.directive_type) {
            case 'SURVIVE_TURNS': return who ? `Keep ${who} alive for ${d.target_turns} rounds` : `Hold out for ${d.target_turns} rounds`;
            case 'DEFEAT_UNIT': return who ? `Defeat ${who}${by}` : 'Break the enemy host';
            case 'SACRIFICE': return `${who || 'The doomed'} must fall, as written`;
            case 'ESCORT': return `Escort ${who || 'the charge'} to ${d.escort_to_unit_id ? this._charName(d.escort_to_unit_id) : (tile(d.target_tile) || 'the objective')}`;
            case 'REACH_TILE': return `${who ? who + ' must reach' : 'Reach'} ${tile(d.target_tile) || 'the objective'}`;
            default: return String(d.directive_id || d.directive_type);
        }
    }

    // =============================================================
    // TURN FLOW
    // =============================================================
    _onPhaseStart({ round, faction, isPlayer }) {
        this.hud.setTurn({ round, faction, isPlayer, running: true });
        this.hud.log(`— Round ${round}: ${faction} phase —`, 'system');
        this._refreshUnitStates();
        if (this._ended) return;
        if (isPlayer) {
            this.hud.banner(`Round ${round}`, 'Your phase', 1200);
            // stunned / empty player side must not hang the game
            this._whenIdle().then(() => { if (this._alive && !this._ended) this.turns.checkAutoEnd(); });
        } else {
            this._runAIPhase(faction);
        }
    }

    async _runAIPhase(faction) {
        await this._whenIdle();                       // let start-of-round narrative finish first
        if (!this._alive || this._ended) return;
        await this.ai.takeTurn(faction);
        await this._whenIdle();
        if (this._alive && !this._ended && this.turns.running && this.turns.activeFaction === faction) this.turns.endPhase();
    }

    _isPlayerInputOpen() {
        return this._alive && !this._ended && this._busy === 0 && this.turns?.isPlayerPhase &&
               this.currentState !== this.STATES.EXECUTING_ACTION;
    }

    _endPlayerPhase() {
        if (!this._isPlayerInputOpen()) return;
        this._deselectUnit();
        this.turns.endPhase();
    }

    /** Called after every player action: end the phase automatically once nobody can act. */
    async _afterPlayerAction() {
        this._refreshUnitStates();
        await this._whenIdle();
        if (this._alive && !this._ended) this.turns.checkAutoEnd();
    }

    _aiFacade() {
        return {
            isRunning: () => this._alive && !this._ended && this.turns.running,
            actors: (faction) => this.turns.actors(faction),
            enemiesOf: (faction) => this.unitManager.getAllUnits().filter(u =>
                u.isAlive !== false && !u.isProp && (u.faction || '').toUpperCase() !== (faction || '').toUpperCase()),
            reachable: (unit) => this._computeReachableTiles(unit),
            targetsInRange: (unit) => this._targetsInRange(unit),
            terrainDefenseAt: (x, y) => ((this.mapGrid[y]?.[x]?.defenseModifier) || 0) * 10,   // only breaks distance ties
            move: (unit, x, y, path) => this._moveUnit(unit, x, y, path),
            attack: (unit, target) => this._doAttack(unit, target),
            pause: async (ms) => { await sleep(ms); await this._whenIdle(); }
        };
    }

    /** Enemies in attack range. Objective props (the Swayamvara fish) are valid targets for the player, never for the AI. */
    _targetsInRange(unit, { includeProps = false } = {}) {
        const range = unit.attackRange || 1;
        return this.unitManager.getAllUnits().filter(e =>
            e.isAlive !== false && (includeProps || !e.isProp) &&
            (e.faction || '').toUpperCase() !== (unit.faction || '').toUpperCase() &&
            Math.abs(e.gridX - unit.gridX) + Math.abs(e.gridY - unit.gridY) <= range &&
            (e.gridX !== unit.gridX || e.gridY !== unit.gridY));
    }

    /** Terrain stats for THIS unit: class overrides (chariots can't ford rivers…) applied to the tile. */
    _terrainFor(unit, tile) {
        if (!tile) return null;
        const key = tile.key || (tile.name || 'plains').toLowerCase();
        return getTerrainForUnit(key, unit.unitClass, unit.weaponType) || tile;
    }

    /**
     * Cheapest-path reachability (Dijkstra). Each step costs the tile's moveCost for this unit; tiles that are
     * impassable for its class (Unit.canTraverseTerrain + terrain overrides) are skipped. Units whose traits
     * ignore terrain cost (Ghatotkacha flies, Bhishma/Ganga-putra, Rudra-possessed) pay 1 per tile and may cross
     * water, but still not walls or pillars. Any unit, friend or foe, blocks the tile.
     * Returns [{x, y, path}] where path = [start, …, tile].
     */
    _computeReachableTiles(unit) {
        if (!unit || !this.mapGrid) return [];
        const range = unit.moveRange || unit.movement || 3;
        const flying = typeof unit.ignoresTerrainCost === 'function' && unit.ignoresTerrainCost();
        const H = this.mapGrid.length, W = this.mapGrid[0]?.length || 0;
        const best = new Map([[`${unit.gridX},${unit.gridY}`, 0]]);
        const open = [{ x: unit.gridX, y: unit.gridY, cost: 0, path: [{ x: unit.gridX, y: unit.gridY }] }];
        const done = new Set();
        const reachable = [];

        while (open.length) {
            let mi = 0;                                         // tiny boards: a linear min-scan is plenty
            for (let i = 1; i < open.length; i++) if (open[i].cost < open[mi].cost) mi = i;
            const cur = open.splice(mi, 1)[0];
            const key = `${cur.x},${cur.y}`;
            if (done.has(key)) continue;
            done.add(key);
            if (cur.cost > 0) reachable.push({ x: cur.x, y: cur.y, path: cur.path });

            for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
                const nx = cur.x + dx, ny = cur.y + dy;
                if (nx < 0 || ny < 0 || ny >= H || nx >= W) continue;
                const nk = `${nx},${ny}`;
                if (done.has(nk)) continue;

                const tile = this.mapGrid[ny]?.[nx];
                if (!tile) continue;
                const eff = this._terrainFor(unit, tile);
                const isWater = tile.name === 'Lake' || tile.name === 'River';
                const blocked = tile.isPassable === false || (tile.moveCost ?? 1) >= 99;
                let step;
                if (flying) {
                    if (blocked && !isWater) continue;                             // walls, pillars, fire, abyss: never
                    step = 1;
                } else {
                    if (blocked) continue;                                         // incl. lakes: nobody wades in
                    if (eff.isPassable === false || (eff.moveCost ?? 1) >= 99) continue;   // class override (chariot vs river)
                    if (typeof unit.canTraverseTerrain === 'function' && !unit.canTraverseTerrain(tile)) continue;
                    step = eff.moveCost || 1;
                }

                const occupant = this.unitManager.getUnitAt(nx, ny);
                if (occupant && occupant.isAlive !== false && occupant !== unit) continue;

                const cost = cur.cost + step;
                if (cost > range) continue;
                if (best.has(nk) && best.get(nk) <= cost) continue;
                best.set(nk, cost);
                open.push({ x: nx, y: ny, cost, path: [...cur.path, { x: nx, y: ny }] });
            }
        }
        return reachable;
    }

    _computeAttackableTiles(unit) {
        if (!unit || !this.mapGrid) return [];
        const range = unit.attackRange || 1;
        const attackable = [];
        const visited = new Set();

        for (let dy = -range; dy <= range; dy++) {
            for (let dx = -range; dx <= range; dx++) {
                if (dx === 0 && dy === 0) continue; // exclude unit's own tile
                const dist = Math.abs(dx) + Math.abs(dy);
                if (dist > range) continue;

                const x = unit.gridX + dx;
                const y = unit.gridY + dy;
                const key = `${x},${y}`;
                if (visited.has(key)) continue;
                visited.add(key);

                // Check bounds
                if (x < 0 || y < 0 || y >= this.mapGrid.length || x >= this.mapGrid[0]?.length) continue;

                attackable.push({ x, y });
            }
        }

        return attackable;
    }

    // =============================================================
    // NARRATIVE (VNBridge) — serialised; tactical input waits on it
    // =============================================================
    _enqueueNarrative(job) {
        this._busy++;
        this.hud?.hideTip();
        this._chain = this._chain.then(job).catch(err => console.error('[TacticalScene] narrative job failed:', err))
            .finally(() => { this._busy--; });
        return this._chain;
    }
    async _whenIdle() { while (this._busy > 0) await this._chain; }

    async _playSequence(sequenceOrId) {
        if (!this.vnBridge) { console.warn('[TacticalScene] no vnBridge in registry — sequence skipped'); return; }
        const result = await this.vnBridge.play(sequenceOrId, { sequences: this.bundle?.sequences || {} });
        if (this._alive && result?.tacticalOverrides?.length) this._applyOverrides(result.tacticalOverrides);
    }

    _handleVNTrigger(data) {
        this.hud.log(`Story: ${data.sequenceId}`, 'story');
        const job = () => this._playSequence(data.sequenceId);
        if (data.pausesTactical) this._enqueueNarrative(job);
        else this.vnBridge?.play(data.sequenceId, { sequences: this.bundle?.sequences || {} })
            .then(r => { if (this._alive && r?.tacticalOverrides?.length) this._applyOverrides(r.tacticalOverrides); });
    }

    _handleSystemTrigger(data) {
        if (data.action !== 'HEAL_FULL') return;
        const unit = this.unitManager.getUnitById(data.targetUnitId);
        if (!unit || unit.isAlive === false) return;
        unit.heal(unit.maxHp);
        this._syncUnitView(unit);
        this._floatText(unit, 'RESTORED', '#7ef0b0');
        this.hud.log(`${unit.name}'s Mani radiates power — HP fully restored.`, 'good');
    }

    /** tactical_override_event values from dialogue data. Effects are INTERIM — confirm with Role 4. */
    _applyOverrides(events) {
        for (const e of events) {
            switch (e) {
                case 'MORALE_BOOST':
                    this.unitManager.getUnitsByFaction(PLAYER_FACTION).forEach(u => { u.morale = Math.min(150, (u.morale ?? 100) + 10); });
                    this.hud.log('Morale surges through the Pandava ranks (+10).', 'good');
                    break;
                case 'KNOCKOUT_KAURAVAS':
                    this.unitManager.getUnitsByFaction('KAURAVA').forEach(u => { if (u.isAlive !== false) u.isStunned = true; });
                    this.hud.log('The Sammohana Astra stuns the Kaurava host (they lose their next action).', 'story');
                    break;
                case 'DRONA_RAMPAGE_CONTINUES':
                    this.hud.log("Drona's rampage continues. (no mechanical effect wired yet)", 'system');
                    break;
                default:
                    console.warn(`[TacticalScene] unknown tactical_override_event "${e}" — ignored`);
            }
        }
        this._refreshUnitStates();
    }

    // =============================================================
    // BATTLE RESOLUTION (DirectiveManager events)
    // =============================================================
    async _onResolved(event, payload) {
        if (this._ended) return;
        this._ended = true;
        this.turns?.stop(event);
        this._deselectUnit();
        await this._whenIdle();
        if (!this._alive) return;

        const playDeviation = async () => {
            const id = payload?.deviationDialogueId;
            if (id) await this._enqueueNarrative(() => this._playSequence(id));
        };
        switch (event) {
            case DIRECTIVE_EVENTS.ALL_COMPLETE:
                this.hud.banner('Canon fulfilled', 'The chronicle advances.');
                await sleep(1400);
                return this._advance();
            case DIRECTIVE_EVENTS.CANON_PROGRESS:
                this.hud.banner('Canon runs its course');
                await playDeviation();
                return this._advance();
            case DIRECTIVE_EVENTS.DHARMA_IMBALANCE:
                this.hud.banner('Dharma Imbalance', 'Time rewinds to the start of the day.');
                await playDeviation();
                return this._retry();
            case DIRECTIVE_EVENTS.DEFEAT:
                this.hud.banner('Defeat', 'The army has fallen.');
                await sleep(1400);
                return this._retry();
        }
    }

    async _retry() {
        if (!this._alive) return;
        if (this.timeline && this.nodeId) {
            this.timeline.resetNode();                       // rewind dharma / purusharthas to node start
            await this._goToNode(this.nodeId, true);         // reload:true keeps the original snapshot
        } else {
            this.scene.restart({ bundle: this.bundle });
        }
    }

    // =============================================================
    // UNIT VIEWS (token, name plate, HP bar) — one Container per unit
    // =============================================================
    _unitColor(unit) { return FACTION_COLOR[(unit.faction || 'NEUTRAL').toUpperCase()] ?? FACTION_COLOR.NEUTRAL; }

    _ensureView(unit) {
        if (unit.sprite && unit.sprite.scene) return unit.sprite;
        const col = this._unitColor(unit);
        const c = this.add.container(0, 0);
        const texKey = unit.characterId ? spriteTextureKey(unit.characterId) : null;
        const hasArt = !!(texKey && !unit.isProp && this.textures?.exists?.(texKey));
        const shadow = this.add.ellipse(0, 4, 56, 20, 0x000000, 0.4);
        let ring, disc, initial, art = null;
        if (hasArt) {
            // Character art standing on the tile; a faction-coloured ground ring replaces the round token.
            ring = this.add.ellipse(0, 3, 64, 24, 0x14101c, 0).setStrokeStyle(3, col);
            disc = this.add.ellipse(0, 3, 58, 21, col, 0.35);
            art = this.add.image(0, 4, texKey).setOrigin(0.5, 1);
            art.setScale(SPRITE_HEIGHT / art.height);
            initial = this.add.text(0, 0, '', { fontSize: '1px' }).setVisible(false);
            c._discAlpha = 0.35;
            c._top = SPRITE_HEIGHT + 15;
        } else {
            ring = this.add.circle(0, -20, 21, 0x14101c).setStrokeStyle(3, col);
            disc = this.add.circle(0, -20, 15, col);
            initial = this.add.text(0, -20, (unit.name || '?').trim().charAt(0).toUpperCase(), {
                fontFamily: 'Cinzel, Georgia, serif', fontSize: '17px', fontStyle: 'bold', color: '#0b0a12', resolution: TEXT_RES
            }).setOrigin(0.5);
            c._discAlpha = 1;
            c._top = 51;
        }
        const hp = this.add.graphics();
        const plate = this.add.text(0, -c._top, '', {
            fontFamily: 'Inter, "Segoe UI", sans-serif', fontSize: '11px', fontStyle: 'bold', color: '#efe3c8',
            backgroundColor: 'rgba(11,10,18,0.86)', padding: { x: 6, y: 2 }, resolution: TEXT_RES
        }).setOrigin(0.5, 1);
        c.add(art ? [shadow, disc, ring, art, hp, plate] : [shadow, ring, disc, initial, hp, plate]);
        c._parts = { ring, disc, hp, plate, initial, art };
        if (unit.crew?.charioteerId) {                       // chariot token: small gold pip on the rim
            const pip = this.add.circle(art ? 26 : 15, art ? -4 : -34, 4.5, 0xf3d98b).setStrokeStyle(1.5, 0x0b0a12);
            c.add(pip);
        }
        unit.sprite = c; unit.gameObject = c; unit.label = plate;
        return c;
    }

    _syncUnitView(unit) {
        if (!unit || !this._alive || !this.gridSystem) return;
        try {
            if (typeof this.gridSystem.unitAnchor !== 'function') return; // headless
            const c = this._ensureView(unit);
            const a = this.gridSystem.unitAnchor(unit.gridX, unit.gridY);
            c.setPosition(a.x, a.y);
            this._redrawUnitFace(unit);
            c.setDepth(this.gridSystem.getUnitDepth(unit.gridX, unit.gridY));
        } catch (e) {
            // Silently skip rendering in Node.js
        }
    }

    /** Height of the unit's plate above its feet (taller for character art than for the round token). */
    _tokenTop(unit) { return unit?.sprite?._top ?? 51; }

    _redrawUnitFace(unit) {
        const c = unit.sprite; if (!c || !c._parts) return;
        const col = this._unitColor(unit);
        c._parts.ring.setStrokeStyle(3, col);
        c._parts.disc.setFillStyle(col, c._discAlpha ?? 1);
        const name = (typeof unit.getDisplayName === 'function') ? unit.getDisplayName() : unit.name;
        c._parts.plate.setText(name);
        const g = c._parts.hp; g.clear();
        if (unit.isProp) return;
        const w = 46, h = 5, x = -w / 2, y = -((c._top ?? 51) - 3);
        const f = clamp(unit.maxHp > 0 ? unit.currentHp / unit.maxHp : 0, 0, 1);
        g.fillStyle(0x0b0a12, 0.92); g.fillRect(x - 1, y - 1, w + 2, h + 2);
        g.fillStyle(f > 0.6 ? 0x4fd29b : f > 0.3 ? 0xf0b429 : 0xe0483a, 1); g.fillRect(x, y, Math.max(1, w * f), h);
    }

    /** Dim units of the active faction that have used their action. */
    _refreshUnitStates() {
        if (!this.unitManager) return;
        const active = this.turns?.activeFaction;
        for (const u of this.unitManager.getAllUnits()) {
            if (!u.sprite) continue;
            const spent = u.faction === active && u.canAct?.() === false;
            u.sprite.setAlpha(spent ? 0.55 : 1);
            this._redrawUnitFace(u);
        }
        if (this.selectedUnit) this.hud.showCard(this.selectedUnit, this._cardExtra(this.selectedUnit));
    }

    _floatText(unit, text, color = '#ffd166') {
        if (!this._alive || !unit || !this.gridSystem || typeof this.gridSystem.unitAnchor !== "function") return;
        const a = this.gridSystem.unitAnchor(unit.gridX, unit.gridY);
        const t = this.add.text(a.x, a.y - this._tokenTop(unit) - 11, text, {
            fontFamily: 'Cinzel, Georgia, serif', fontSize: '22px', fontStyle: 'bold', color,
            stroke: '#0b0a12', strokeThickness: 5, resolution: TEXT_RES
        }).setOrigin(0.5).setDepth(9700);
        this.tweens.add({ targets: t, y: t.y - 38, alpha: 0, duration: 1000, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
    }

    _tweenTo(target, x, y, ms) {
        return new Promise((resolve) => {
            if (!this._alive) return resolve();
            this.tweens.add({ targets: target, x, y, duration: ms, ease: 'Sine.easeInOut', onComplete: resolve });
        });
    }

    // =============================================================
    // SELECTION ARROW — bobbing pointer over the selected unit
    // =============================================================
    _buildSelectionArrow() {
        try {
            // Skip in headless/Node environments
            if (!this.add || !this.tweens || typeof this.add.graphics !== 'function') return;

            const g = this.add.graphics();
            g.fillStyle(GOLD, 1); g.lineStyle(3, 0x0b0a12, 1);
            g.beginPath(); g.moveTo(0, 0); g.lineTo(-13, -19); g.lineTo(-5, -19); g.lineTo(-5, -30); g.lineTo(5, -30); g.lineTo(5, -19); g.lineTo(13, -19); g.closePath();
            g.fillPath(); g.strokePath();
            g.setDepth(9800).setVisible(false);
            this.selArrow = g;
            this.arrowTween = this.tweens.add({ targets: g, scaleY: { from: 1, to: 0.86 }, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            this.arrowBase = { x: 0, y: 0 };
        } catch (e) {
            // Silently fail in Node.js
        }
    }

    _pointAt(unit) {
        if (!this.selArrow) return;
        if (!unit) { this.selArrow.setVisible(false); return; }
        const a = this.gridSystem.unitAnchor(unit.gridX, unit.gridY);
        this.selArrow.setPosition(a.x, a.y - this._tokenTop(unit) - 19).setVisible(true);
    }

    // =============================================================
    // CAMERA / OVERLAYS
    // =============================================================
    _fit() {
        if (!this.gridSystem) return;
        try {
            if (typeof this.gridSystem.fitCamera !== 'function') return; // headless
            this.gridSystem.fitCamera(this.hud.insets(), this.zoomMul);
            this._repositionOverlays();
        } catch (e) {
            // Silently skip in Node.js
        }
    }

    _handleResize() {
        if (!this._alive || !this.gridSystem) return;
        this._fit();
    }

    _canvasOffset() {
        const r = this.game.canvas?.getBoundingClientRect?.();
        return r ? { x: r.left, y: r.top } : { x: 0, y: 0 };
    }

    _unitScreenPos(unit) {
        const a = this.gridSystem.unitAnchor(unit.gridX, unit.gridY);
        const s = this.gridSystem.worldToScreen(a.x, a.y - (this._tokenTop(unit) > 60 ? 40 : 20));          // centre of the token
        const o = this._canvasOffset();
        return { x: s.x + o.x, y: s.y + o.y };
    }

    _repositionOverlays() {
        if (this.selectedUnit && this.hud.isMenuOpen()) this.hud.showMenu(this._unitScreenPos(this.selectedUnit), this.selectedUnit, this._menuFlags(this.selectedUnit), true);
        if (this.selectedUnit && this.selArrow?.visible) this._pointAt(this.selectedUnit);
        this.hud.hideTip();
    }

    // =============================================================
    // INPUT — click vs drag, hover tooltips, wheel zoom
    // =============================================================
    _bindInput() {
        this._onDown = (p) => { this._drag = { x: p.x, y: p.y, moved: false, panX0: this.gridSystem.panX || 0, panY0: this.gridSystem.panY || 0 }; };
        this._onMove = (p) => {
            if (!this.gridSystem) return;
            if (p.isDown && this._drag) {
                if (!this._drag.moved && Math.hypot(p.x - this._drag.x, p.y - this._drag.y) > 9) this._drag.moved = true;
                if (this._drag.moved) {
                    this.gridSystem.panX = this._drag.panX0 + (p.x - this._drag.x);
                    this.gridSystem.panY = this._drag.panY0 + (p.y - this._drag.y);
                    this._fit(); this.hud.hideTip();
                }
                return;
            }
            this._updateHover(p);
        };
        this._onUp = (p) => {
            const d = this._drag; this._drag = null;
            if (!d || d.moved) return;
            this._handleClick(p);
        };
        this._onWheel = (p, over, dx, dy) => {
            if (!this.gridSystem) return;
            this.zoomMul = clamp(this.zoomMul * (dy > 0 ? 0.9 : 1.11), 0.7, 2.4);
            this._fit();
        };
        this.input.on('pointerdown', this._onDown);
        this.input.on('pointermove', this._onMove);
        this.input.on('pointerup', this._onUp);
        this.input.on('pointerupoutside', this._onUp);
        this.input.on('wheel', this._onWheel);
    }

    _bindKeyboard() {
        // Skip in headless/Node environments
        if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (!this._alive || !this.gridSystem) return;
            if (e.key === '0' || e.key === '=') {
                // Reset view: zoom to 1.0x and center camera
                e.preventDefault();
                this.zoomMul = 1;
                this.gridSystem.panX = 0;
                this.gridSystem.panY = 0;
                this._fit();
                this.hud.log('Camera reset.', 'system');
            }
            if (e.key === 'e' || e.key === 'E') {
                // End player phase
                e.preventDefault();
                this._endPlayerPhase();
            }
        });
    }

    /** Front-most living unit whose drawn token (disc + plate) contains the world point. */
    _pickUnit(wx, wy) {
        let best = null, bestDepth = -1;
        for (const u of this.unitManager.getAllUnits()) {
            if (u.isAlive === false) continue;
            const a = this.gridSystem.unitAnchor(u.gridX, u.gridY);
            if (wx >= a.x - 30 && wx <= a.x + 30 && wy >= a.y - this._tokenTop(u) - 11 && wy <= a.y + 12) {
                const d = this.gridSystem.getUnitDepth(u.gridX, u.gridY);
                if (d > bestDepth) { best = u; bestDepth = d; }
            }
        }
        return best;
    }

    _hit(p) {
        const unit = this._pickUnit(p.worldX, p.worldY);
        if (unit) return { unit, tile: { x: unit.gridX, y: unit.gridY } };
        const tile = this.gridSystem.pickTile(p.worldX, p.worldY);
        return { unit: tile ? this.unitManager.getUnitAt(tile.x, tile.y) : null, tile };
    }

    _terrainInfo(x, y) {
        const t = this.mapGrid?.[y]?.[x];
        if (!t) return null;
        const d = t.defenseModifier || 0;
        const blocked = (t.isPassable === false) || (t.moveCost >= 99);
        return {
            name: t.name || 'Plains',
            move: blocked ? 'impassable' : String(t.moveCost ?? 1),
            defense: d === 0 ? '±0%' : `${d > 0 ? '+' : ''}${Math.round(d * 100)}%`,
            note: t.description || ''
        };
    }

    _cardExtra(unit) {
        const info = this._terrainInfo(unit.gridX, unit.gridY);
        return { terrain: info ? `Standing on ${info.name} · defense ${info.defense}` : '' };
    }

    _updateHover(p) {
        if (!this._isHoverAllowed()) { this.hud.hideTip(); this.gridSystem.setHoverTile(null); return; }
        const { unit, tile } = this._hit(p);
        const key = `${tile ? tile.x + ',' + tile.y : '-'}|${unit ? unit.unitId : ''}`;
        const canvas = this.game.canvas;
        // cursor feedback
        let cursor = 'default';
        if (unit) cursor = (this.currentState === this.STATES.AWAITING_ATTACK_TARGET && this._isEnemyTarget(unit)) ? 'crosshair' : 'pointer';
        else if (this.currentState === this.STATES.AWAITING_MOVE_TARGET && tile && this.reachableTiles.some(t => t.x === tile.x && t.y === tile.y)) cursor = 'pointer';
        if (canvas) canvas.style.cursor = cursor;
        if (key === this._hoverKey) return;
        this._hoverKey = key;
        this.gridSystem.setHoverTile(tile, unit ? (this._unitColor(unit)) : 0xffe08a);
        if (unit) {
            const s = this._unitScreenPos(unit);
            this.hud.showUnitTip(unit, s.x, s.y - 30);
            if (!this.selectedUnit) this.hud.showCard(unit, this._cardExtra(unit));
        } else if (tile) {
            const info = this._terrainInfo(tile.x, tile.y);
            const a = this.gridSystem.gridToWorldCenter(tile.x, tile.y);
            const s = this.gridSystem.worldToScreen(a.x, a.y), o = this._canvasOffset();
            this.hud.showTileTip(info, s.x + o.x, s.y + o.y);
            if (!this.selectedUnit) this.hud.hideCard();
        } else {
            this.hud.hideTip();
            if (!this.selectedUnit) this.hud.hideCard();
        }
    }

    _isHoverAllowed() { return this._alive && !this._ended && this._busy === 0 && this.currentState !== this.STATES.EXECUTING_ACTION; }
    _isEnemyTarget(unit) { return this.selectedUnit && (unit.faction || '').toUpperCase() !== (this.selectedUnit.faction || '').toUpperCase(); }

    _handleClick(p) {
        if (!this._isPlayerInputOpen()) return;
        const { unit, tile } = this._hit(p);
        if (!tile) { this._deselectUnit(); return; }
        const { x, y } = tile;

        if (this.currentState === this.STATES.IDLE || this.currentState === this.STATES.UNIT_SELECTED) {
            if (unit) this._selectUnit(unit); else this._deselectUnit();
            return;
        }
        if (this.currentState === this.STATES.AWAITING_MOVE_TARGET) {
            if (this.selectedUnit && this.reachableTiles.some(t => t.x === x && t.y === y) && !(unit && unit !== this.selectedUnit)) this._executePlayerMove(this.selectedUnit, x, y);
            else if (unit) this._selectUnit(unit);
            else this._deselectUnit();
            return;
        }
        if (this.currentState === this.STATES.AWAITING_ATTACK_TARGET) {
            const inRange = this.attackableTiles.some(t => t.x === x && t.y === y);
            if (inRange && unit && this._isEnemyTarget(unit)) this._executePlayerAttack(this.selectedUnit, unit);
            else if (unit && unit !== this.selectedUnit && !this._isEnemyTarget(unit)) this._selectUnit(unit);
            else this._deselectUnit();
        }
    }

    // =============================================================
    // SELECTION + MENU
    // =============================================================
    _isControllable(unit) {
        return unit && unit.faction === PLAYER_FACTION && !unit.isProp && unit.canAct?.() !== false && this.turns?.isPlayerPhase;
    }

    _menuFlags(unit) {
        const flags = { canMove: !unit.hasMovedThisTurn, canAttack: true, astras: [], vows: [], charioteerSynergies: [] };

        // Astras
        if (unit.resolvedAstras && unit.resolvedAstras.length > 0) {
            const currentDharma = this._gameState?.dharmaMeter ?? 50;
            flags.astras = unit.resolvedAstras.map(a => {
                const check = unit.canUseAstra ? unit.canUseAstra(a.id || a.astra_id, currentDharma) : { allowed: false, reason: "Engine missing canUseAstra" };
                return {
                    id: a.id || a.astra_id,
                    name: a.name,
                    description: a.description || a.restrictions || "",
                    allowed: check.allowed,
                    reason: check.reason
                };
            });
        }

        // Vows
        if (unit.resolvedVows && unit.resolvedVows.length > 0) {
            flags.vows = unit.resolvedVows.map(v => {
                const vId = v.id || v.vow_id;
                // Just examples, active state could track if it's currently turned on!
                const active = unit.activeVows ? unit.activeVows.has(vId) : false;
                return {
                    id: vId,
                    name: v.name,
                    description: v.description,
                    active: active
                };
            });
        }

        // Charioteer Synergies
        if (unit.getCharioteerSynergies && unit.getCharioteerSynergies().length > 0) {
            flags.charioteerSynergies = unit.getCharioteerSynergies().map(synergy => {
                // Check if synergy is available (has uses left and not on cooldown)
                const available = this.charioteerSynergyManager.getAvailableSynergy(unit.unitId, synergy.type);
                return {
                    id: synergy.type,
                    name: synergy.type.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase()),
                    description: synergy.data.description || synergy.type,
                    available: !!available
                };
            });
        }

        return flags;
    }

    _selectUnit(unit) {
        this.selectedUnit = unit;
        this.currentState = this.STATES.UNIT_SELECTED;
        this.reachableTiles = []; this.attackableTiles = [];
        this.hud.log(`Selected ${unit.name}  [HP ${unit.currentHp}/${unit.maxHp} · Move ${unit.moveRange ?? unit.movement} · Range ${unit.attackRange}]`, 'info');
        this.gridSystem.clearHighlights();
        this.gridSystem.highlightTiles([{ x: unit.gridX, y: unit.gridY }], 0xf3d98b, 0.5);
        this._pointAt(unit);
        this.hud.showCard(unit, this._cardExtra(unit));
        this.hud.hideTip();
        if (this._isControllable(unit)) this.hud.showMenu(this._unitScreenPos(unit), unit, this._menuFlags(unit));
        else this.hud.hideMenu();
    }

    _deselectUnit() {
        this.selectedUnit = null;
        this.currentState = this.STATES.IDLE;
        this.reachableTiles = [];
        this.attackableTiles = [];
        this.gridSystem?.clearHighlights();
        this._pointAt(null);
        this.hud?.hideMenu();
        this.hud?.hideCard();
    }

    _onActionMove() {
        const u = this.selectedUnit;
        if (!u || !this._isPlayerInputOpen() || u.hasMovedThisTurn || !this._isControllable(u)) return;
        this.currentState = this.STATES.AWAITING_MOVE_TARGET;
        this.hud.hideMenu();
        this.reachableTiles = this._computeReachableTiles(u);
        this.gridSystem.clearHighlights();
        this.gridSystem.highlightTiles(this.reachableTiles, 0x35b6d6, 0.4);
        this.hud.log(`Choose a destination for ${u.name}.`, 'system');
    }

    _onActionAttack() {
        const u = this.selectedUnit;
        if (!u || !this._isPlayerInputOpen() || !this._isControllable(u)) return;
        this.currentState = this.STATES.AWAITING_ATTACK_TARGET;
        this.pendingAstraId = null;
        this.hud.hideMenu();
        this.attackableTiles = this._computeAttackableTiles(u);
        this.gridSystem.clearHighlights();
        this.gridSystem.highlightTiles(this.attackableTiles, 0xe0483a, 0.42);
        const n = this._targetsInRange(u, { includeProps: true }).length;
        this.hud.log(n ? `Choose a target for ${u.name} (${n} in range).` : `${u.name} has no target in range — move closer, or Wait.`, 'system');
    }

    _onActionWait() {
        const u = this.selectedUnit;
        if (!u || !this._isPlayerInputOpen() || !this._isControllable(u)) return;
        u.endAction();
        this.hud.log(`${u.name} holds position.`, 'info');
        this._deselectUnit();
        this._afterPlayerAction();
    }

    _onActionAstra(astraId) {
        const u = this.selectedUnit;
        if (!u || !this._isPlayerInputOpen() || !this._isControllable(u)) return;
        const currentDharma = this._gameState?.dharmaMeter ?? 50;
        const check = u.canUseAstra(astraId, currentDharma);
        if (!check.allowed) {
            this.hud.log(check.reason, 'bad');
            return;
        }

        // Just like attack, but we remember the astraId!
        this.currentState = this.STATES.AWAITING_ATTACK_TARGET;
        this.pendingAstraId = astraId;
        this.hud.hideMenu();

        // Astras might have different range, but for now use base tracking.
        this.attackableTiles = this._computeAttackableTiles(u);
        this.gridSystem.clearHighlights();
        this.gridSystem.highlightTiles(this.attackableTiles, 0x9b4dca, 0.42);

        const astraName = (u.resolvedAstras.find(a => (a.id || a.astra_id) === astraId) || {}).name || 'Astra';
        this.hud.log(`Invoking ${astraName}! Select a target.`, 'good');
    }

    _onActionVow(vowId) {
        const u = this.selectedUnit;
        if (!u || !this._isPlayerInputOpen() || !this._isControllable(u)) return;

        // Toggle the vow state.
        if (u.activeVows.has(vowId)) {
            u.activeVows.delete(vowId);
            this.hud.log(`${u.name} deactivated their vow.`, 'info');
        } else {
            u.activeVows.add(vowId);
            this.hud.log(`📜 ${u.name} invokes their vow!`, 'good');
        }

        // Refresh menu to show the updated active state
        this.hud.showMenu(this._unitScreenPos(u), u, this._menuFlags(u));
    }

    _onActionCharioteerSynergy(synergyId) {
        const u = this.selectedUnit;
        if (!u || !this._isPlayerInputOpen() || !this._isControllable(u)) return;

        // Check if unit has the requested charioteer synergy available
        if (!u.hasCharioteerSynergy(synergyId)) {
            this.hud.log(`${u.name} does not have the ${synergyId} synergy available.`, 'bad');
            return;
        }

        // Use the synergy through the charioteer synergy manager
        const used = this.charioteerSynergyManager.useSynergy(u.unitId, synergyId);
        if (!used) {
            this.hud.log(`${u.name} cannot use ${synergyId} synergy right now.`, 'bad');
            return;
        }

        // Provide feedback to the player
        this.hud.log(`🌀 ${u.name} activates ${synergyId.replace('-', ' ')}!`, 'good');

        // End the unit's action since using a synergy consumes their turn
        u.endAction();
        this.currentState = this.STATES.IDLE;
        this._deselectUnit();
        this._afterPlayerAction();
    }

    // =========================================================================
    // PATHFINDING — Dijkstra on pre-allocated 2D arrays (unchanged from Phase 2)
    // =========================================================================
//@@REACH@@

//@@ATTACKABLE@@

    // =============================================================
    // ACTIONS — shared by the player menu and the AI facade
    // =============================================================
    /** Animate + commit a move. Does NOT end the unit's action (move-then-attack). */
    async _moveUnit(unit, targetX, targetY, path) {
        if (unit.gridX === targetX && unit.gridY === targetY) return;
        const steps = path?.length ? path : [{ x: targetX, y: targetY }];
        this.hud.log(`${unit.name} advances to (${targetX}, ${targetY}).`, 'info');
        this._pointAt(null);

        // In headless (Node.js), skip rendering
        if (!this.gridSystem || typeof this.gridSystem.unitAnchor !== 'function') {
            for (const pt of steps) {
                if (!this._alive) return;
                unit.gridX = pt.x;
                unit.gridY = pt.y;
            }
        } else {
            const c = this._ensureView(unit);
            for (const pt of steps) {
                if (!this._alive) return;
                unit.gridX = pt.x;
                unit.gridY = pt.y;
                const a = this.gridSystem.unitAnchor(pt.x, pt.y);
                c.setDepth(this.gridSystem.getUnitDepth(pt.x, pt.y));
                await this._tweenTo(c, a.x, a.y, 95);
            }
        }

        if (!this._alive) return;
        this.unitManager.updateUnitPosition(unit.unitId, targetX, targetY);
        if(typeof this.unitManager._spatialSet === "function") this.unitManager._spatialSet(unit);
        this._syncUnitView(unit);
        if (typeof unit.endMove === 'function') unit.endMove();
        this.triggerEvaluator.evaluateCombatTriggers?.(unit, null, this.triggers);
        this.directives.onUnitMoved(unit);
    }

    /** Resolve one attack through the full CombatResolver pipeline. Damage is applied BY the resolver. */
    async _doAttack(attacker, defender, astraId = null) {
        this.hud.log(`${attacker.name} attacks ${defender.name}!`, 'combat');
        const result = this.combatResolver.resolveAttack(attacker, defender, astraId);

        for (const line of result.log || []) this.hud.log(line, 'detail');
        if (result.blocked) {
            this.hud.log(`Blocked (${result.reason}).`, 'combat');
            this._floatText(defender, 'BLOCKED', '#a79c88');
        } else {
            this.hud.log(`${defender.name} takes ${result.damage} damage  (HP ${defender.currentHp}/${defender.maxHp})`, 'combat');
            this._floatText(defender, `-${result.damage}`, '#ff8b7e');
            const v = defender.sprite;
            if (v) this.tweens.add({ targets: v, scaleX: 1.14, scaleY: 1.14, duration: 90, yoyo: true });
            if (result.damage >= 60) this.cameras.main.shake(130, 0.003);
        }
        this._syncUnitView(defender);

        if (!result.blocked) {
            // order matters: triggers + directives must see the corpse BEFORE removeUnit()
            this.triggerEvaluator.evaluateCombatTriggers(attacker, defender, this.triggers);
            if (defender.isAlive === false) {
                this.directives.onUnitDefeated(defender);
                this._removeDefeatedUnit(defender);
                this._checkEnemyWipe();
            }
        }
        await sleep(160);
    }

    _checkEnemyWipe() {
        if (this._ended) return;
        const foes = this.unitManager.getAllUnits().filter(u => u.isAlive !== false && !u.isProp && u.faction !== PLAYER_FACTION);
        if (foes.length === 0 && typeof this.directives.onEnemyWipe === 'function') this.directives.onEnemyWipe();
    }

    async _executePlayerMove(unit, x, y) {
        this.currentState = this.STATES.EXECUTING_ACTION;
        this.gridSystem.clearHighlights();
        this.hud.hideTip();
        const target = this.reachableTiles.find(t => t.x === x && t.y === y);
        if (unit.gridX === x && unit.gridY === y) { this.currentState = this.STATES.IDLE; this._selectUnit(unit); return; }
        await this._moveUnit(unit, x, y, target?.path);
        if (!this._alive) return;
        this.currentState = this.STATES.IDLE;
        if (!this._ended && unit.canAct?.()) this._selectUnit(unit);     // still may attack / wait
        else this._deselectUnit();
        this._afterPlayerAction();
    }

    async _executePlayerAttack(attacker, defender) {
        this.currentState = this.STATES.EXECUTING_ACTION;
        this.gridSystem.clearHighlights();
        this._pointAt(null);
        this.hud.hideTip();
        await this._doAttack(attacker, defender, this.pendingAstraId);
        this.pendingAstraId = null;
        if (!this._alive) return;
        attacker.endAction();
        this.currentState = this.STATES.IDLE;
        this._deselectUnit();
        this._afterPlayerAction();
    }

    _removeDefeatedUnit(unit) {
        this.hud.log(`${unit.name} has fallen in battle!`, 'bad');
        const v = unit.sprite;
        if (v) this.tweens.add({ targets: v, alpha: 0, scaleY: 0.4, duration: 380, onComplete: () => v.destroy() });
        unit.sprite = unit.label = unit.gameObject = null;
        this.unitManager.removeUnit(unit.unitId);
    }

    // =============================================================
    // DEMO BOARD + FALLBACK CATALOG (used when no timeline node is loaded)
    // =============================================================

    _getFallbackCharacterCatalog() {
        // Returns a minimal character map for headless testing or demo mode
        const map = new Map();
        const chars = [
            { character_id: 'arjuna', canonical_name: 'Arjuna', faction: 'PANDAVA' },
            { character_id: 'bhishma', canonical_name: 'Bhishma', faction: 'KAURAVA' },
            { character_id: 'shikhandi', canonical_name: 'Shikhandi', faction: 'PANDAVA' },
            { character_id: 'drona', canonical_name: 'Drona', faction: 'KAURAVA' },
            { character_id: 'krishna', canonical_name: 'Krishna', faction: 'PANDAVA' },
            { character_id: 'duryodhana', canonical_name: 'Duryodhana', faction: 'KAURAVA' }
        ];
        chars.forEach(c => map.set(c.character_id, c));
        return map;
    }

    _spawnBattlefieldUnits() {
        try {
            const pair = this.unitManager.spawnChariotPair('shikhandi', 'arjuna', 2, 2, { faction: 'PANDAVA', name: 'Shikhandi & Arjuna' });
            if (pair) this._syncUnitView(pair);
            const bhishma = this.unitManager.spawnCharacter('bhishma', 7, 7, 'KAURAVA');
            if (bhishma) this._syncUnitView(bhishma);
        } catch (err) {
            console.warn('Spawn fallback due to missing data:', err);
            const u1 = this.unitManager.spawnBattalion('MAHARATHI', 'PANDAVA', 2, 2);
            const u2 = this.unitManager.spawnBattalion('MAHARATHI', 'KAURAVA', 7, 7);
            if (u1) this._syncUnitView(u1);
            if (u2) this._syncUnitView(u2);
        }
    }

    // =============================================================
    // SHUTDOWN — undo everything create() attached outside the scene
    // =============================================================
    _shutdown() {
        this._alive = false;
        if (this._resizeTimer) clearTimeout(this._resizeTimer);
        this.turns?.stop('shutdown');
        this.directives?.destroy();
        this.events.off('trigger:fire-system', this._handleSystemTrigger, this);
        this.events.off('trigger:fire-vn', this._handleVNTrigger, this);
        if (this.input) {
            this.input.off('pointerdown', this._onDown); this.input.off('pointermove', this._onMove);
            this.input.off('pointerup', this._onUp); this.input.off('pointerupoutside', this._onUp); this.input.off('wheel', this._onWheel);
        }
        if (this._resizeHandler) this.scale.off('resize', this._resizeHandler);
        if (this._onDharma) { this.gameState?.off('dharma:changed', this._onDharma); this.gameState?.off('state:restored', this._onDharma); }
        if (this.game?.canvas) this.game.canvas.style.cursor = 'default';
        this.hud?.destroy();
    }
}