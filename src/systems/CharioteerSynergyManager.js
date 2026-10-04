// =============================================================
// CharioteerSynergyManager.js — Manages charioteer-warrior pairs and their synergistic effects
// =============================================================
// Tracks active charioteer-warrior pairs and applies synergistic effects during combat
// =============================================================

import { Emitter } from '../core/Emitter.js';

export const CHARIOTEER_SYNERGY_EVENTS = Object.freeze({
    SYNERGY_READY:      'charioteer:synergy-ready',     // Synergy is available to use
    SYNERGY_USED:       'charioteer:synergy-used',      // Synergy has been activated
    SYNERGY_COOLDOWN:   'charioteer:synergy-cooldown'   // Synergy entered cooldown
});

export const CHARIOTEER_SYNERGY_TYPES = Object.freeze({
    KRISHNA_GUIDANCE:   'krishna-guidance',     // Ignore Zone of Control once
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

        // Track active synergies by unitId, then by synergyType
        this.activeSynergies = new Map(); // unitId => Map<synergyType, {type, usesLeft, cooldownTurns, data}>

        // Event emitter for synergy events
        this.emitter = new Emitter();

        console.log('[CharioteerSynergyManager] Initialized');
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
     * Scan all units for charioteer pairs and register their synergies
     * Call this after units are spawned
     */
    initializeCharioteerSynergies() {
        this.activeSynergies.clear();

        for (const unit of this.unitManager.getAllUnits()) {
            // Skip invalid units
            if (!unit || unit.unitClass !== 'MAHARATHI') continue;

            const synergies = this._getCharioteerSynergies(unit);
            if (synergies.length > 0) {
                // Create or get the inner map for this unit
                if (!this.activeSynergies.has(unit.unitId)) {
                    this.activeSynergies.set(unit.unitId, new Map());
                }
                const unitSynergies = this.activeSynergies.get(unit.unitId);

                // Create synergy objects with usesLeft for the unit
                const unitSynergiesWithUses = synergies.map(synergy => ({
                    ...synergy,
                    usesLeft: synergy.maxUses || 1
                }));

                synergies.forEach(synergy => {
                    unitSynergies.set(synergy.type, {
                        type: synergy.type,
                        usesLeft: synergy.maxUses || 1,
                        cooldownTurns: 0,
                        data: synergy.data || {}
                    });

                    // Notify that synergy is ready (with null check for unit)
                    this.emitter.emit(CHARIOTEER_SYNERGY_EVENTS.SYNERGY_READY, {
                        unitId: (unit && unit.unitId) || null,
                        synergyType: synergy.type,
                        unit: unit || null
                    });
                });

                // Set the unit's charioteer synergies so it knows what's available
                unit.setCharioteerSynergies(unitSynergiesWithUses);
            }
        }
    }

    /**
     * Update synergy cooldowns at the end of each turn
     */
    updateTurn() {
        for (const [unitId, synergyData] of this.activeSynergies.entries()) {
            if (synergyData.cooldownTurns > 0) {
                synergyData.cooldownTurns--;

                if (synergyData.cooldownTurns === 0) {
                    // Synergy is now ready again
                    const unit = this.unitManager.getUnitById(unitId);
                    this.emitter.emit(CHARIOTEER_SYNERGY_EVENTS.SYNERGY_READY, {
                        unitId,
                        synergyType: synergyData.type,
                        unit: unit || null
                    });
                }
            }
        }
    }

    /**
     * Check if a synergy is available for a unit
     * @param {string} unitId - The unit ID
     * @param {string} synergyType - The type of synergy to check
     * @returns {Object|null} {type, data} if available, null otherwise
     */
    getAvailableSynergy(unitId, synergyType) {
        const unitSynergies = this.activeSynergies.get(unitId);
        if (!unitSynergies) return null;

        const synergyData = unitSynergies.get(synergyType);
        if (!synergyData) return null;

        if (synergyData.usesLeft > 0 && synergyData.cooldownTurns === 0) {
            return {
                type: synergyData.type,
                data: synergyData.data
            };
        }
        return null;
    }

    /**
     * Check if any synergy is available for a unit
     * @param {string} unitId - The unit ID
     * @returns {Object|null} {type, data} of first available synergy, null otherwise
     */
    getAnyAvailableSynergy(unitId) {
        const unitSynergies = this.activeSynergies.get(unitId);
        if (!unitSynergies) return null;

        for (const [synergyType, synergyData] of unitSynergies.entries()) {
            if (synergyData.usesLeft > 0 && synergyData.cooldownTurns === 0) {
                return {
                    type: synergyData.type,
                    data: synergyData.data
                };
            }
        }
        return null;
    }

    /**
     * Use a synergy for a unit
     * @param {string} unitId - The unit ID
     * @param {string} synergyType - The type of synergy to use
     * @returns {boolean} true if synergy was used, false otherwise
     */
    useSynergy(unitId, synergyType) {
        const unitSynergies = this.activeSynergies.get(unitId);
        if (!unitSynergies) return false;

        const synergyData = unitSynergies.get(synergyType);
        if (!synergyData) return false;

        if (synergyData.usesLeft <= 0 || synergyData.cooldownTurns > 0) {
            return false;
        }

        // Use the synergy
        synergyData.usesLeft--;

        // Set cooldown (if applicable)
        if (synergyData.usesLeft > 0) {
            // Has more uses left, set cooldown
            synergyData.cooldownTurns = this._getSynergyCooldown(synergyData.type);
        }

        // Get unit for events (with null check)
        const unit = this.unitManager.getUnitById(unitId);

        // Emit used event
        this.emitter.emit(CHARIOTEER_SYNERGY_EVENTS.SYNERGY_USED, {
            unitId,
            synergyType: synergyData.type,
            unit: unit || null,
            usesLeft: synergyData.usesLeft
        });

        // If no uses left, remove from tracking
        if (synergyData.usesLeft <= 0) {
            unitSynergies.delete(synergyType);
            // Remove unit entry if no synergies left
            if (unitSynergies.size === 0) {
                this.activeSynergies.delete(unitId);
            }
        } else if (synergyData.cooldownTurns > 0) {
            this.emitter.emit(CHARIOTEER_SYNERGY_EVENTS.SYNERGY_COOLDOWN, {
                unitId,
                synergyType: synergyData.type,
                cooldownTurns: synergyData.cooldownTurns
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

        // Check if this is a Maharathi with a hero charioteer
        if (!unit || !(unit instanceof this.scene.Maharathi)) return synergies;
        if (!unit.crew || unit.crew.charioteerTier !== 'HERO') return synergies;

        const charioteerName = (unit.crew && unit.crew.charioteerName) ? unit.crew.charioteerName?.toLowerCase() || '' : '';
        const warriorName = (unit && unit.name) ? unit.name.toLowerCase() : '';

        // Krishna as charioteer (typically with Arjuna)
        if (charioteerName.includes('krishna')) {
            // Krishna's Guidance: Ignore Zone of Control once per battle
            synergies.push({
                type: CHARIOTEER_SYNERGY_TYPES.KRISHNA_GUIDANCE,
                maxUses: 1,
                data: {
                    description: 'Ignore Zone of Control for this movement',
                    effect: 'ignore_zoc'
                }
            });

            // Moral Counsel: Restore Dharma when below 30%
            synergies.push({
                type: CHARIOTEER_SYNERGY_TYPES.MORAL_COUNSEL,
                maxUses: 1,
                data: {
                    description: 'Restore 25% Dharma when below 30%',
                    effect: 'restore_dharma',
                    threshold: 0.3,
                    restoreAmount: 0.25
                }
            });
        }

        // Shalya as charioteer (typically with Karna)
        if (charioteerName.includes('shalya')) {
            // Psychological Warfare: Chance to cause enemy hesitation
            synergies.push({
                type: CHARIOTEER_SYNERGY_TYPES.PSYCHOLOGICAL_WARFARE,
                maxUses: 3, // Can use multiple times
                data: {
                    description: '20% chance to cause enemy hesitation',
                    effect: 'enemy_hesitation',
                    chance: 0.2,
                    hesitationDuration: 1, // turns
                    attackReduction: 0.5 // 50% reduction
                }
            });
        }

        // Add other historical charioteer synergies here as needed

        return synergies;
    }

    /**
     * Get cooldown turns for a synergy type
     * @returns {number} cooldown in turns
     */
    _getSynergyCooldown(synergyType) {
        // Most synergies in this implementation are limited-use without cooldown
        // If we had reusable synergies, we'd define cooldowns here
        return 0;
    }

    // =============================================================
    // GETTERS
    // =============================================================

    /**
     * Get summary of all active synergies for UI/HUD
     */
    getSummary() {
        const summary = [];
        for (const [unitId, synergyData] of this.activeSynergies.entries()) {
            const unit = this.unitManager.getUnitById(unitId);
            if (unit) {
                summary.push({
                    unitId,
                    unitName: unit.name,
                    synergyType: synergyData.type,
                    usesLeft: synergyData.usesLeft,
                    cooldownTurns: synergyData.cooldownTurns,
                    ready: synergyData.usesLeft > 0 && synergyData.cooldownTurns === 0
                });
            }
        }
        return summary;
    }
}
