// =============================================================
// CharioteerSynergyManager.js — Manages charioteer-warrior pairs and their synergistic effects
// =============================================================
// Tracks active charioteer-warrior pairs and applies synergistic effects during combat.
//
// ONE source of truth: every synergy is a single entry object that is shared by this manager's
// map AND the unit's own list (unit.getCharioteerSynergies()), so a use recorded here or by the
// CombatResolver is seen everywhere.
//
//   active  synergies (menu buttons): krishna-guidance, moral-counsel
//   passive synergies (no button):    psychological-warfare (rolled by the CombatResolver on attack)
// =============================================================

import { Emitter } from '../core/Emitter.js';
import { Maharathi } from '../entities/Unit.js';
import { DHARMA_MAX } from '../core/GameState.js';

export const CHARIOTEER_SYNERGY_EVENTS = Object.freeze({
    SYNERGY_READY:      'charioteer:synergy-ready',     // Synergy is available to use
    SYNERGY_USED:       'charioteer:synergy-used',      // Synergy has been activated
    SYNERGY_COOLDOWN:   'charioteer:synergy-cooldown'   // Synergy entered cooldown
});

export const CHARIOTEER_SYNERGY_TYPES = Object.freeze({
    KRISHNA_GUIDANCE:   'krishna-guidance',     // Next move ignores terrain costs and barriers
    MORAL_COUNSEL:      'moral-counsel',        // Restore Dharma when low
    PSYCHOLOGICAL_WARFARE: 'psychological-warfare' // Enemy hesitation chance
});

export class CharioteerSynergyManager {
    /**
     * @param {Phaser.Scene} scene
     * @param {UnitManager} unitManager
     */
    constructor(scene, unitManager) {
        this.scene = scene;
        this.unitManager = unitManager;

        // unitId => Map<synergyType, {type, usesLeft, cooldownTurns, passive, endsAction, data}>
        this.activeSynergies = new Map();

        // Event emitter for synergy events
        this.emitter = new Emitter();
    }

    // =============================================================
    // EVENT SUBSCRIPTION
    // =============================================================
    on(event, fn, context)   { this.emitter.on(event, fn, context); return this; }
    once(event, fn, context) { this.emitter.once(event, fn, context); return this; }
    off(event, fn, context)  { this.emitter.off(event, fn, context); return this; }

    destroy() {
        this.emitter.removeAllListeners();
        this.activeSynergies.clear();
    }

    // =============================================================
    // PUBLIC METHODS
    // =============================================================

    /**
     * Scan all units for charioteer pairs and register their synergies.
     * Call this after units are spawned.
     */
    initializeCharioteerSynergies() {
        this.activeSynergies.clear();

        for (const unit of this.unitManager.getAllUnits()) {
            if (!unit || unit.unitClass !== 'MAHARATHI') continue;

            const synergies = this._getCharioteerSynergies(unit);
            if (synergies.length === 0) continue;

            const perUnit = new Map();
            for (const s of synergies) {
                perUnit.set(s.type, {
                    type: s.type,
                    usesLeft: s.maxUses || 1,
                    cooldownTurns: 0,
                    passive: s.passive === true,
                    endsAction: s.endsAction !== false,
                    data: s.data || {}
                });
            }
            this.activeSynergies.set(unit.unitId, perUnit);
            unit.setCharioteerSynergies([...perUnit.values()]);      // same objects: one source of truth

            for (const entry of perUnit.values()) {
                this.emitter.emit(CHARIOTEER_SYNERGY_EVENTS.SYNERGY_READY, {
                    unitId: unit.unitId, synergyType: entry.type, unit
                });
            }
        }
    }

    /** Tick cooldowns. Call once per round. */
    updateTurn() {
        for (const [unitId, perUnit] of this.activeSynergies.entries()) {
            for (const entry of perUnit.values()) {
                if (entry.cooldownTurns <= 0) continue;
                entry.cooldownTurns--;
                if (entry.cooldownTurns === 0) {
                    this.emitter.emit(CHARIOTEER_SYNERGY_EVENTS.SYNERGY_READY, {
                        unitId, synergyType: entry.type, unit: this.unitManager.getUnitById(unitId) || null
                    });
                }
            }
        }
    }

    /**
     * Is the synergy available (uses left, off cooldown) for this unit?
     * @returns {Object|null} {type, data} if available, null otherwise
     */
    getAvailableSynergy(unitId, synergyType) {
        const entry = this.activeSynergies.get(unitId)?.get(synergyType);
        if (!entry || entry.usesLeft <= 0 || entry.cooldownTurns > 0) return null;
        return { type: entry.type, data: entry.data };
    }

    /** First available synergy of a unit, or null. */
    getAnyAvailableSynergy(unitId) {
        const perUnit = this.activeSynergies.get(unitId);
        if (!perUnit) return null;
        for (const entry of perUnit.values()) {
            if (entry.usesLeft > 0 && entry.cooldownTurns === 0) return { type: entry.type, data: entry.data };
        }
        return null;
    }

    /**
     * Can the player trigger this synergy RIGHT NOW? Available, not passive, and its condition holds
     * (moral-counsel only helps when Dharma has fallen to its threshold, so it is never wasted).
     * @returns {{ok:boolean, reason:string}}
     */
    canActivate(unit, synergyType) {
        const entry = this.activeSynergies.get(unit?.unitId)?.get(synergyType);
        if (!entry) return { ok: false, reason: 'Not available.' };
        if (entry.passive) return { ok: false, reason: 'Passive: it triggers by itself in combat.' };
        if (entry.usesLeft <= 0) return { ok: false, reason: 'Already used.' };
        if (entry.cooldownTurns > 0) return { ok: false, reason: `On cooldown (${entry.cooldownTurns} turn(s)).` };
        if (synergyType === CHARIOTEER_SYNERGY_TYPES.MORAL_COUNSEL) {
            const threshold = entry.data.threshold ?? 0.3;
            const dharma = this.scene.gameState?.dharmaMeter ?? DHARMA_MAX;
            if (dharma / DHARMA_MAX > threshold) {
                return { ok: false, reason: `Only when Dharma is at or below ${Math.round(threshold * 100)}%.` };
            }
        }
        return { ok: true, reason: '' };
    }

    /**
     * Use a synergy: spend one use and apply its effect.
     * @returns {{used:boolean, message:string, endsAction:boolean}}
     */
    activate(unit, synergyType) {
        const can = this.canActivate(unit, synergyType);
        if (!can.ok) return { used: false, message: can.reason, endsAction: false };
        const entry = this.activeSynergies.get(unit.unitId).get(synergyType);
        let message = '';

        if (synergyType === CHARIOTEER_SYNERGY_TYPES.KRISHNA_GUIDANCE) {
            unit.guidedMove = true;                                   // read by the scene's pathfinding; cleared by endMove()/startTurn()
            message = `${unit.name}'s ratha is guided — the next move ignores terrain.`;
        } else if (synergyType === CHARIOTEER_SYNERGY_TYPES.MORAL_COUNSEL) {
            const gs = this.scene.gameState;
            const amount = Math.round((entry.data.restoreAmount ?? 0.25) * DHARMA_MAX);
            if (gs && typeof gs.change === 'function') gs.change(amount, `synergy:${synergyType}`);
            message = `Moral counsel steadies the army — Dharma +${amount}.`;
        }

        this.useSynergy(unit.unitId, synergyType);
        return { used: true, message, endsAction: entry.endsAction };
    }

    /**
     * Spend one use of a synergy (no effect applied — see activate()).
     * @returns {boolean} true if a use was spent
     */
    useSynergy(unitId, synergyType) {
        const perUnit = this.activeSynergies.get(unitId);
        const entry = perUnit?.get(synergyType);
        if (!entry || entry.usesLeft <= 0 || entry.cooldownTurns > 0) return false;

        entry.usesLeft--;
        if (entry.usesLeft > 0) entry.cooldownTurns = this._getSynergyCooldown(entry.type);

        const unit = this.unitManager.getUnitById(unitId);
        this.emitter.emit(CHARIOTEER_SYNERGY_EVENTS.SYNERGY_USED, {
            unitId, synergyType: entry.type, unit: unit || null, usesLeft: entry.usesLeft
        });

        if (entry.usesLeft <= 0) {
            perUnit.delete(synergyType);
            if (perUnit.size === 0) this.activeSynergies.delete(unitId);
            if (unit) unit.setCharioteerSynergies(unit.getCharioteerSynergies().filter(s => s !== entry));
        } else if (entry.cooldownTurns > 0) {
            this.emitter.emit(CHARIOTEER_SYNERGY_EVENTS.SYNERGY_COOLDOWN, {
                unitId, synergyType: entry.type, cooldownTurns: entry.cooldownTurns
            });
        }
        return true;
    }

    // =============================================================
    // PRIVATE HELPERS
    // =============================================================

    /**
     * Determine what synergies a unit has based on its charioteer
     * @returns {Array} List of synergy objects
     */
    _getCharioteerSynergies(unit) {
        const synergies = [];

        // Only a Maharathi token can carry a hero charioteer
        if (!unit || !(unit instanceof Maharathi)) return synergies;
        if (!unit.crew || unit.crew.charioteerTier !== 'HERO') return synergies;

        const charioteerName = (unit.crew.charioteerName || '').toLowerCase();

        // Krishna as charioteer (typically with Arjuna)
        if (charioteerName.includes('krishna')) {
            synergies.push({
                type: CHARIOTEER_SYNERGY_TYPES.KRISHNA_GUIDANCE,
                maxUses: 1,
                endsAction: false,           // it is a buff for the move that follows
                data: {
                    description: 'Next move ignores terrain costs and barriers',
                    effect: 'ignore_terrain'
                }
            });

            synergies.push({
                type: CHARIOTEER_SYNERGY_TYPES.MORAL_COUNSEL,
                maxUses: 1,
                data: {
                    description: 'Restore 25% Dharma when it is at or below 30%',
                    effect: 'restore_dharma',
                    threshold: 0.3,
                    restoreAmount: 0.25
                }
            });
        }

        // Shalya as charioteer (typically with Karna)
        if (charioteerName.includes('shalya')) {
            synergies.push({
                type: CHARIOTEER_SYNERGY_TYPES.PSYCHOLOGICAL_WARFARE,
                maxUses: 3,
                passive: true,
                data: {
                    description: '20% chance on attack to make the enemy hesitate',
                    effect: 'enemy_hesitation',
                    chance: 0.2,
                    hesitationDuration: 1, // enemy phases
                    attackReduction: 0.5   // the hesitating enemy deals 50% damage
                }
            });
        }

        return synergies;
    }

    /** Cooldown turns for a synergy type (all current synergies are limited-use, no cooldown). */
    _getSynergyCooldown(_synergyType) {
        return 0;
    }

    // =============================================================
    // GETTERS
    // =============================================================

    /** Summary of all tracked synergies for UI/HUD. */
    getSummary() {
        const summary = [];
        for (const [unitId, perUnit] of this.activeSynergies.entries()) {
            const unit = this.unitManager.getUnitById(unitId);
            if (!unit) continue;
            for (const entry of perUnit.values()) {
                summary.push({
                    unitId,
                    unitName: unit.name,
                    synergyType: entry.type,
                    usesLeft: entry.usesLeft,
                    cooldownTurns: entry.cooldownTurns,
                    passive: entry.passive,
                    ready: entry.usesLeft > 0 && entry.cooldownTurns === 0
                });
            }
        }
        return summary;
    }
}
