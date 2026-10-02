/**
 * Yuganta Engine - TriggerEvaluator
 * Universal Trigger Observer implementing all 7 canonical Mahābhārata battle triggers.
 * Special-cases "EVERY_TURN" string and handles SYSTEM_HEAL_FULL vs VN Narrative handoffs.
 */
export class TriggerEvaluator {
    constructor(scene) {
        this.scene = scene;
        this.firedTriggers = new Set();
    }

    /**
     * Evaluates HP, Death, and Combat triggers immediately following an attack or tactical interaction.
     */
    evaluateCombatTriggers(attacker, defender, triggers) {
        if (!triggers || !Array.isArray(triggers) || triggers.length === 0) return;

        triggers.forEach(trigger => {
            if (this.firedTriggers.has(trigger.id) && !trigger.repeatable) return;

            const targetUnit = this.scene.unitManager.getUnitById(trigger.target_unit_id);
            if (!targetUnit) return;

            let conditionMet = false;

            // Trigger Condition: UNIT_HP_BELOW_PERCENT (Bhishma <=50%, Karna <=30%, Duryodhana <=30%, Abhimanyu <=0%, Arjuna <=0%)
            if (trigger.condition === "UNIT_HP_BELOW_PERCENT") {
                const currentHpPercent = (targetUnit.hp / targetUnit.maxHp) * 100;
                if (currentHpPercent <= trigger.value) {
                    conditionMet = true;
                }
            }

            // Trigger Condition: UNIT_DEATH (Dhrishtadyumna death)
            if (trigger.condition === "UNIT_DEATH") {
                if (targetUnit.hp <= 0) {
                    conditionMet = true;
                }
            }

            if (conditionMet) {
                this._executeTrigger(trigger);
            }
        });
    }

    /**
     * Evaluates turn-based triggers at the start of every global turn.
     */
    evaluateTurnTriggers(turnCount, triggers) {
        if (!triggers || !Array.isArray(triggers) || triggers.length === 0) return;

        triggers.forEach(trigger => {
            if (this.firedTriggers.has(trigger.id) && !trigger.repeatable) return;

            let conditionMet = false;

            if (trigger.condition === "TURN_COUNT_EQUAL") {
                // Special-case string handling for Ashwatthama's divine Mani full-heal
                if (trigger.value === "EVERY_TURN") {
                    const targetUnit = this.scene.unitManager.getUnitById(trigger.target_unit_id);
                    if (targetUnit && targetUnit.hp > 0) {
                        conditionMet = true;
                    }
                } else if (Number(trigger.value) === turnCount) {
                    conditionMet = true;
                }
            }

            if (conditionMet) {
                this._executeTrigger(trigger);
            }
        });
    }

    /**
     * Routes trigger execution to either internal tactical system or external VN engine.
     */
    _executeTrigger(trigger) {
        console.log(`[TriggerEvaluator] Firing trigger: ${trigger.id} -> Sequence: ${trigger.sequence_id}`);
        
        if (!trigger.repeatable) {
            this.firedTriggers.add(trigger.id);
        }

        if (trigger.sequence_id === "SYSTEM_HEAL_FULL") {
            // Internal Tactical Engine Execution (Ashwatthama Mani)
            this.scene.events.emit('trigger:fire-system', {
                triggerId: trigger.id,
                action: 'HEAL_FULL',
                targetUnitId: trigger.target_unit_id
            });
        } else {
            // External VN Narrative Sequence Handoff
            this.scene.events.emit('trigger:fire-vn', {
                triggerId: trigger.id,
                sequenceId: trigger.sequence_id,
                pausesTactical: trigger.pauses_tactical,
                targetUnitId: trigger.target_unit_id
            });
        }
    }

    reset() {
        this.firedTriggers.clear();
    }
}