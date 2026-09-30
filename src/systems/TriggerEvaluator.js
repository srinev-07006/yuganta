// =============================================================
// TriggerEvaluator.js — Battle Event Tripwire System
// =============================================================
// Evaluates tactical conditions (HP drops, deaths, turn limits)
// and fires narrative sequences or system events when met.
//
// SCHEMA FIELDS USED (tactical.schema.json → battle_event_trigger):
//   trigger_id, condition_type, condition_value, target_unit_id,
//   linked_sequence_id, pauses_tactical_scene, is_repeatable
// =============================================================

import Phaser from 'phaser';

export const TRIGGER_EVENTS = Object.freeze({
    FIRE_VN_SEQUENCE: 'trigger:fire-vn',
    FIRE_SYSTEM_EVENT: 'trigger:fire-system'
});

export class TriggerEvaluator {

    /**
     * @param {Phaser.Scene} scene 
     * @param {GridSystem} grid 
     * @param {Array} triggers - List of battle_event_trigger objects
     */
    constructor(scene, grid, triggers = []) {
        this.scene = scene;
        this.grid = grid;
        this.triggers = triggers;
        
        this.emitter = new Phaser.Events.EventEmitter();
        this.firedTriggers = new Set(); // Tracks non-repeatable triggers

        console.log(`[TriggerEvaluator] Loaded ${this.triggers.length} battle triggers.`);
    }

    // =============================================================
    // EVENT SUBSCRIPTION
    // =============================================================
    on(event, fn, context) { this.emitter.on(event, fn, context); return this; }
    destroy() {
        this.emitter.removeAllListeners();
        this.triggers = [];
        this.firedTriggers.clear();
    }

    // =============================================================
    // EVALUATION HOOKS (Called by TacticalScene)
    // =============================================================

    /** Check HP thresholds after a unit takes damage */
    evaluateHP(unit) {
        if (!unit || !unit.isAlive) return;

        const hpPercent = (unit.currentHp / unit.maxHp) * 100;

        this.triggers.forEach(trigger => {
            if (this._canFire(trigger) && 
                trigger.condition_type === 'UNIT_HP_BELOW_PERCENT' && 
                trigger.target_unit_id === unit.characterId) {
                
                // Using <= because the Lore Lead's data requires exact matching (e.g. <= 50, <= 0)
                if (hpPercent <= Number(trigger.condition_value)) {
                    this._fire(trigger, { unit, hpPercent });
                }
            }
        });
    }

    /** Check death triggers when a unit falls */
    evaluateDeath(unit) {
        if (!unit) return;

        this.triggers.forEach(trigger => {
            // First, check explicit UNIT_DEATH triggers (e.g. Dhrishtadyumna)
            if (this._canFire(trigger) && 
                trigger.condition_type === 'UNIT_DEATH' && 
                trigger.target_unit_id === unit.characterId) {
                this._fire(trigger, { unit });
            }

            // Second, handle Lore Lead edge case: HP_BELOW_PERCENT <= 0 means death
            // (e.g., Abhimanyu's fall, Arjuna's Ashvamedhika fall)
            if (this._canFire(trigger) && 
                trigger.condition_type === 'UNIT_HP_BELOW_PERCENT' && 
                trigger.target_unit_id === unit.characterId &&
                Number(trigger.condition_value) <= 0) {
                this._fire(trigger, { unit });
            }
        });
    }

    /** Check turn thresholds at the start of a turn */
    evaluateTurn(turnNumber) {
        this.triggers.forEach(trigger => {
            if (this._canFire(trigger) && trigger.condition_type === 'TURN_COUNT_EQUAL') {
                
                // Handle Lore Lead Edge Case: "EVERY_TURN"
                if (trigger.condition_value === 'EVERY_TURN') {
                    // Check if the target unit is alive before firing
                    const target = this.grid.findUnit(trigger.target_unit_id);
                    if (target && target.isAlive) {
                        this._fire(trigger, { turnNumber, target });
                    }
                } 
                // Normal integer turn check (e.g. Brahmashira standoff on turn 15)
                else if (turnNumber === Number(trigger.condition_value)) {
                    this._fire(trigger, { turnNumber });
                }
            }
        });
    }

    /** Check spatial triggers after a unit moves */
    evaluateMove(unit) {
        if (!unit) return;

        this.triggers.forEach(trigger => {
            if (this._canFire(trigger) && 
                trigger.condition_type === 'UNIT_ENTER_TILE' && 
                (trigger.target_unit_id === 'ANY' || trigger.target_unit_id === unit.characterId)) {
                
                const targetTile = trigger.condition_value; // Assuming {x, y}
                if (targetTile && unit.gridX === targetTile.x && unit.gridY === targetTile.y) {
                    this._fire(trigger, { unit, tile: targetTile });
                }
            }
        });
    }

    // =============================================================
    // INTERNAL LOGIC
    // =============================================================

    _canFire(trigger) {
        // If it's not repeatable and has already fired, ignore it.
        if (trigger.is_repeatable === false && this.firedTriggers.has(trigger.trigger_id)) {
            return false;
        }
        return true;
    }

    _fire(trigger, context) {
        console.log(`[TriggerEvaluator] ⚡ Trigger Tripped: ${trigger.trigger_id}`);

        // Mark as fired to prevent repeats
        this.firedTriggers.add(trigger.trigger_id);

        if (trigger.pauses_tactical_scene) {
            // Narrative VN Event
            this.emitter.emit(TRIGGER_EVENTS.FIRE_VN_SEQUENCE, {
                triggerId: trigger.trigger_id,
                sequenceId: trigger.linked_sequence_id,
                context: context
            });
        } else {
            // Silent Tactical System Event (e.g. Ashwatthama full heal)
            this.emitter.emit(TRIGGER_EVENTS.FIRE_SYSTEM_EVENT, {
                triggerId: trigger.trigger_id,
                systemActionId: trigger.linked_sequence_id,
                context: context
            });
        }
    }
}