// =============================================================
// DirectiveManager.js — Canonical Directive Referee
// =============================================================
// Watches the battle and decides whether the player is honoring
// canon (the directives in a Parva's directives.json).
//
// DESIGN RULES:
//   - It NEVER pauses scenes or launches VN itself.
//     It only EMITS events. TacticalScene decides what to do.
//     (This keeps it compatible with the future TriggerEvaluator
//      and the shared narrative queue.)
//   - It uses its OWN event emitter, so a scene.restart() after a
//     Dharma Imbalance throws old listeners away (no leaks).
//   - Failures are processed before completions. Canon violations win.
//   - Once resolved (win / imbalance / canon loss / defeat), it locks.
//
// SCHEMA FIELDS USED (tactical.schema.json → canonical_directive):
//   directive_id, directive_type, target_turns, target_unit_id,
//   fail_on_deviation, deviation_dialogue_id
//
// OPTIONAL FIELDS (read only if present — pending Lore Lead approval):
//   node_id, target_tile {x,y}, escort_to_unit_id, escort_radius
// =============================================================

import { Emitter } from '../core/Emitter.js';

// Event names TacticalScene (and later the narrative queue) listen for
export const DIRECTIVE_EVENTS = Object.freeze({
    COMPLETED:        'directive:completed',        // one directive fulfilled
    FAILED:           'directive:failed',           // one directive broken
    ALL_COMPLETE:     'directive:all-complete',     // every directive fulfilled → victory
    DHARMA_IMBALANCE: 'directive:dharma-imbalance', // hard canon broken → reset node
    CANON_PROGRESS:   'directive:canon-progress',   // soft failure → story advances
    DEFEAT:           'directive:defeat'            // army wiped, no canon covers it → retry
});

export const DIRECTIVE_STATUS = Object.freeze({
    ACTIVE:    'ACTIVE',
    COMPLETED: 'COMPLETED',
    FAILED:    'FAILED'
});

// Small helpers to build verdicts
const complete = (reason) => ({ outcome: 'COMPLETE', reason });
const fail     = (reason) => ({ outcome: 'FAIL', reason });

export class DirectiveManager {

    /**
     * @param {Phaser.Scene} scene
     * @param {GridSystem} grid
     * @param {Array} directives - canonical_directive objects for THIS node
     * @param {Object} options   - { nodeId, playerFaction }
     */
    constructor(scene, grid, directives = [], options = {}) {
        this.scene = scene;
        this.grid = grid;
        this.nodeId = options.nodeId || null;
        this.playerFaction = options.playerFaction || 'PANDAVA';

        this.emitter = new Emitter();
        this.isResolved = false;
        this.resolution = null;   // { event, payload } once the battle is decided

        // DONE (TimelineManager): On DHARMA_IMBALANCE / DEFEAT reset, TimelineManager restores the
        // gameState snapshot taken when this timeline node started (dharmaMeter,
        // artha/kama/moksha, consumedAstras, vowStates). DirectiveManager must NOT
        // own that snapshot — TimelineManager loads the node, owns the snapshot,
        // and restores it before scene.restart() / node reload.
        // See: dharma spent on an Astra is currently kept across imbalance resets.

        // Wrap each directive definition with runtime state
        this.states = directives.map(def => ({
            def,
            status: DIRECTIVE_STATUS.ACTIVE,
            reason: ''
        }));

        this._validateDefinitions();

        console.log(`[DirectiveManager] Node "${this.nodeId}" — ${this.states.length} directive(s) active.`);
        this.states.forEach(s => console.log(`  • ${this.describe(s.def)}  [fail_on_deviation: ${s.def.fail_on_deviation !== false}]`));
    }

    // =============================================================
    // STATIC HELPER: pick the directives for one timeline node
    // =============================================================
    // directives.json is per-Parva. The schema has no node_id yet.
    // If node_id exists on any directive, filter by it.
    // Otherwise, return all directives in the file (current behavior).
    static filterForNode(directivesJson, nodeId) {
        const all = (directivesJson && directivesJson.directives) || [];
        const hasNodeLinks = all.some(d => d.node_id);
        if (!hasNodeLinks) {
            if (all.length > 0) {
                console.warn('[DirectiveManager] Directives have no node_id — applying ALL Parva directives to this node.');
            }
            return all;
        }
        return all.filter(d => d.node_id === nodeId);
    }

    // =============================================================
    // EVENT SUBSCRIPTION (thin wrappers over our private emitter)
    // =============================================================
    on(event, fn, context)   { this.emitter.on(event, fn, context); return this; }
    once(event, fn, context) { this.emitter.once(event, fn, context); return this; }
    off(event, fn, context)  { this.emitter.off(event, fn, context); return this; }

    destroy() {
        this.emitter.removeAllListeners();
        this.states = [];
    }

    // =============================================================
    // HOOKS — TacticalScene calls these
    // =============================================================

    /** Call whenever a unit dies (player attack, AI attack, attrition, auras). */
    onUnitDefeated(unit) {
        if (this.isResolved || !unit) return;
        this._evaluate({ type: 'UNIT_DEFEATED', unit });
        if (!this.isResolved) this._checkArmyWipe();
    }

    /** Call when a move is COMMITTED (Wait/Attack chosen, or AI moved). Not on tentative moves. */
    onUnitMoved(unit) {
        if (this.isResolved || !unit) return;
        this._evaluate({ type: 'UNIT_MOVED', unit });
    }

    /** Call once a full round (player phase + AI phase) has finished. */
    onTurnEnd(turnNumber) {
        if (this.isResolved) return;
        this._evaluate({ type: 'TURN_END', turn: turnNumber });
    }

    // =============================================================
    // CORE EVALUATION LOOP
    // =============================================================

    _evaluate(ctx) {
        const failures = [];
        const completions = [];

        for (const state of this.states) {
            if (state.status !== DIRECTIVE_STATUS.ACTIVE) continue;

            const verdict = this._evaluateOne(state.def, ctx);
            if (!verdict) continue;

            if (verdict.outcome === 'FAIL') failures.push({ state, reason: verdict.reason });
            else completions.push({ state, reason: verdict.reason });
        }

        // Canon violations are processed first and can end the battle immediately
        for (const f of failures) {
            this._fail(f.state, f.reason);
            if (this.isResolved) return;
        }

        for (const c of completions) {
            this._complete(c.state, c.reason);
        }

        // Army wipe: after all other evaluation, before the victory check
        if (!this.isResolved) this._checkArmyWipe();
        if (this.isResolved) return;

        // Victory: every directive completed
        const allDone = this.states.length > 0 &&
                        this.states.every(s => s.status === DIRECTIVE_STATUS.COMPLETED);
        if (allDone && !this.isResolved) {
            this._resolve(DIRECTIVE_EVENTS.ALL_COMPLETE, {
                nodeId: this.nodeId,
                reason: 'All canonical directives fulfilled.'
            });
        }
    }

    _evaluateOne(def, ctx) {
        switch (def.directive_type) {
            case 'SURVIVE_TURNS': return this._evalSurviveTurns(def, ctx);
            case 'DEFEAT_UNIT':   return this._evalDefeatUnit(def, ctx);
            case 'SACRIFICE':     return this._evalSacrifice(def, ctx);
            case 'ESCORT':        return this._evalEscort(def, ctx);
            case 'REACH_TILE':    return this._evalReachTile(def, ctx);
            default:              return null; // unknown types warned in validation
        }
    }

    // =============================================================
    // PER-TYPE EVALUATORS
    // =============================================================

    // SURVIVE_TURNS
    //   With target_unit_id: that unit (any faction) must be alive at turn N.
    //     → covers "keep Arjuna alive" AND "Drona must not fall yet".
    //   Without target_unit_id: just hold out N turns (army wipe handled separately).
    _evalSurviveTurns(def, ctx) {
        if (ctx.type === 'UNIT_DEFEATED' && def.target_unit_id &&
            ctx.unit.characterId === def.target_unit_id) {
            return fail(`${ctx.unit.name} fell before turn ${def.target_turns}. Canon forbids this.`);
        }
        if (ctx.type === 'TURN_END' && Number.isInteger(def.target_turns) &&
            ctx.turn >= def.target_turns) {
            return complete(`Held firm for ${def.target_turns} turns.`);
        }
        return null;
    }

    // DEFEAT_UNIT — target must die (optionally before target_turns, e.g. Jayadratha before sunset)
    _evalDefeatUnit(def, ctx) {
        if (ctx.type === 'UNIT_DEFEATED' && ctx.unit.characterId === def.target_unit_id) {
            return complete(`${ctx.unit.name} has been defeated.`);
        }
        if (ctx.type === 'TURN_END' && this._deadlinePassed(def, ctx.turn)) {
            return fail(`${def.target_unit_id} still stands after turn ${def.target_turns}.`);
        }
        return null;
    }

    // SACRIFICE — canon requires this unit to fall (e.g. Abhimanyu in the Chakravyuha)
    _evalSacrifice(def, ctx) {
        if (ctx.type === 'UNIT_DEFEATED' && ctx.unit.characterId === def.target_unit_id) {
            return complete(`${ctx.unit.name} has fallen, as was written.`);
        }
        if (ctx.type === 'TURN_END' && this._deadlinePassed(def, ctx.turn)) {
            return fail(`${def.target_unit_id} survived beyond turn ${def.target_turns}. The epic cannot be rewritten.`);
        }
        return null;
    }

    // ESCORT — bring target_unit_id to a destination (tile or another unit)
    _evalEscort(def, ctx) {
        if (ctx.type === 'UNIT_DEFEATED' && ctx.unit.characterId === def.target_unit_id) {
            return fail(`${ctx.unit.name} was lost before the escort was complete.`);
        }

        // Check position after ANY committed move (the destination unit may move too)
        if (ctx.type === 'UNIT_MOVED' || ctx.type === 'TURN_END') {
            const escortee = this.grid.findUnit(def.target_unit_id);
            if (escortee && escortee.isAlive && this._isAtDestination(escortee, def)) {
                return complete(`${escortee.name} has reached the destination.`);
            }
        }

        if (ctx.type === 'TURN_END' && this._deadlinePassed(def, ctx.turn)) {
            return fail(`Escort of ${def.target_unit_id} not completed by turn ${def.target_turns}.`);
        }
        return null;
    }

    // REACH_TILE — a specific unit (or any player unit) must stand on target_tile
    _evalReachTile(def, ctx) {
        if (!def.target_tile) return null; // warned in validation

        if (ctx.type === 'UNIT_MOVED') {
            const u = ctx.unit;
            const eligible = def.target_unit_id
                ? u.characterId === def.target_unit_id
                : u.faction === this.playerFaction;

            if (eligible && u.isAlive &&
                u.gridX === def.target_tile.x && u.gridY === def.target_tile.y) {
                return complete(`${u.name} reached (${def.target_tile.x},${def.target_tile.y}).`);
            }
        }

        if (ctx.type === 'UNIT_DEFEATED' && def.target_unit_id &&
            ctx.unit.characterId === def.target_unit_id) {
            return fail(`${ctx.unit.name} fell before reaching the objective.`);
        }

        if (ctx.type === 'TURN_END' && this._deadlinePassed(def, ctx.turn)) {
            return fail(`Objective tile not reached by turn ${def.target_turns}.`);
        }
        return null;
    }

    // =============================================================
    // HELPERS
    // =============================================================

    _deadlinePassed(def, turn) {
        return Number.isInteger(def.target_turns) && turn >= def.target_turns;
    }

    _isAtDestination(unit, def) {
        // Option 1: a fixed tile
        if (def.target_tile) {
            return unit.gridX === def.target_tile.x && unit.gridY === def.target_tile.y;
        }
        // Option 2: near another unit (e.g. Shikhandi → Bhishma)
        if (def.escort_to_unit_id) {
            const dest = this.grid.findUnit(def.escort_to_unit_id);
            if (!dest || !dest.isAlive) return false;
            const radius = Number.isInteger(def.escort_radius) ? def.escort_radius : 1;
            return this.grid.getDistance(unit.gridX, unit.gridY, dest.gridX, dest.gridY) <= radius;
        }
        return false;
    }

    // If the player's whole army is gone:
    //   - a soft-canon directive (fail_on_deviation:false) → story progresses (e.g. Sauptika)
    //   - otherwise → plain defeat, retry the node
    _checkArmyWipe() {
        const anyAlive = this.grid.units.some(u => u.isAlive && u.faction === this.playerFaction);
        if (anyAlive) return;

        const softCanon = this.states.find(s =>
            s.status === DIRECTIVE_STATUS.ACTIVE && s.def.fail_on_deviation === false);

        if (softCanon) {
            this._fail(softCanon, 'The army has fallen — as canon decrees.');
            return;
        }

        this._resolve(DIRECTIVE_EVENTS.DEFEAT, {
            nodeId: this.nodeId,
            reason: 'All forces have fallen.'
        });
    }

    _complete(state, reason) {
        state.status = DIRECTIVE_STATUS.COMPLETED;
        state.reason = reason;
        console.log(`[DirectiveManager] ✅ ${state.def.directive_id}: ${reason}`);
        this.emitter.emit(DIRECTIVE_EVENTS.COMPLETED, { directive: state.def, reason });
    }

    _fail(state, reason) {
        state.status = DIRECTIVE_STATUS.FAILED;
        state.reason = reason;
        console.warn(`[DirectiveManager] ❌ ${state.def.directive_id}: ${reason}`);
        this.emitter.emit(DIRECTIVE_EVENTS.FAILED, { directive: state.def, reason });

        const payload = {
            nodeId: this.nodeId,
            directive: state.def,
            reason,
            deviationDialogueId: state.def.deviation_dialogue_id || null
        };

        // Schema default for fail_on_deviation is TRUE, so only an explicit false is soft
        if (state.def.fail_on_deviation !== false) {
            this._resolve(DIRECTIVE_EVENTS.DHARMA_IMBALANCE, payload);
        } else {
            this._resolve(DIRECTIVE_EVENTS.CANON_PROGRESS, payload);
        }
    }

    _resolve(event, payload) {
        if (this.isResolved) return;
        this.isResolved = true;
        this.resolution = { event, payload };
        console.log(`[DirectiveManager] ⚖️ Battle resolved → ${event}`, payload);
        this.emitter.emit(event, payload);
    }

    // =============================================================
    // VALIDATION & UI TEXT
    // =============================================================

    _validateDefinitions() {
        const known = ['SURVIVE_TURNS', 'ESCORT', 'SACRIFICE', 'REACH_TILE', 'DEFEAT_UNIT'];

        this.states.forEach(({ def }) => {
            const id = def.directive_id;
            if (!known.includes(def.directive_type)) {
                console.warn(`[DirectiveManager] ${id}: unknown directive_type "${def.directive_type}" — ignored.`);
            }
            if (def.directive_type === 'SURVIVE_TURNS' && !Number.isInteger(def.target_turns)) {
                console.warn(`[DirectiveManager] ${id}: SURVIVE_TURNS without target_turns can never complete.`);
            }
            if (['DEFEAT_UNIT', 'SACRIFICE', 'ESCORT'].includes(def.directive_type) && !def.target_unit_id) {
                console.warn(`[DirectiveManager] ${id}: ${def.directive_type} needs target_unit_id.`);
            }
            if (def.directive_type === 'ESCORT' && !def.target_tile && !def.escort_to_unit_id) {
                console.warn(`[DirectiveManager] ${id}: ESCORT has no destination (target_tile or escort_to_unit_id) — cannot complete.`);
            }
            if (def.directive_type === 'REACH_TILE' && !def.target_tile) {
                console.warn(`[DirectiveManager] ${id}: REACH_TILE has no target_tile — cannot complete.`);
            }
        });
    }

    /** Human-readable text for HUD / VN. */
    describe(def) {
        const who = def.target_unit_id || 'your forces';
        const by = Number.isInteger(def.target_turns) ? ` by turn ${def.target_turns}` : '';
        switch (def.directive_type) {
            case 'SURVIVE_TURNS':
                return def.target_unit_id
                    ? `${who} must survive ${def.target_turns} turns`
                    : `Hold the line for ${def.target_turns} turns`;
            case 'DEFEAT_UNIT': return `Defeat ${who}${by}`;
            case 'SACRIFICE':   return `${who} must fall${by}`;
            case 'ESCORT':      return `Escort ${who} to ${def.escort_to_unit_id || 'the objective'}${by}`;
            case 'REACH_TILE':  return `Reach the objective tile${by}`;
            default:            return def.directive_id;
        }
    }

    /** Snapshot for UI panels (Role 2 can read this). */
    getSummary() {
        return this.states.map(s => ({
            id: s.def.directive_id,
            type: s.def.directive_type,
            status: s.status,
            text: this.describe(s.def),
            reason: s.reason
        }));
    }
}