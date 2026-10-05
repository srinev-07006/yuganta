// =============================================================
// CombatResolver.js — The Complete Damage Calculation Pipeline
// =============================================================
// This is where ALL combat math happens. Every attack in the game
// flows through this single pipeline.
//
// THE PIPELINE (in order):
//   1. INVULNERABILITY CHECK — Does the defender have iccha-mrityu, chiranjivi, etc.?
//   2. DEFENDER TRAITS     — DiscipleHesitation, LowerBodyInvulnerable, etc.
//   3. TERRAIN DEFENSE     — Is the defender on a mountain (+40%)?
//   4. ATTACKER TRAITS     — BonusRangedDamage, BonusMeleeDamage, etc.
//   5. ASTRA MULTIPLIER    — Is an astra being used? (×5.0, ×99.9, etc.)
//   6. FINAL CALCULATION   — baseDamage × multipliers - defense
//   7. POST-COMBAT EFFECTS — Stun chance, counter-attack, dual attack
//   8. DHARMA AUDIT        — Did this combat violate canonical rules?
//
// The pipeline is designed to be TRANSPARENT — every step produces
// a log entry so you can debug exactly why damage was X.
// =============================================================

import { executeHandler } from '../handlers/TraitHandlers.js';
import { TERRAIN_CONFIG } from '../data/TerrainConfig.js';

export class CombatResolver {

    constructor(scene, gridSystem, charioteerSynergyManager = null) {
        this.scene = scene;
        this.grid = gridSystem;
        this.charioteerSynergyManager = charioteerSynergyManager;
    }

    // =============================================================
    // MAIN ENTRY POINT — Resolve an attack
    // =============================================================
    // Call this when one unit attacks another.
    // Returns a detailed result object describing what happened.
    // =============================================================

    // [{ trait, source, scale }] — Maharathi gives charioteer-aware entries;
    // plain Units fall back to their own traits at full scale.
    _traitEntries(unit) {
        if (typeof unit.getEffectiveTraitEntries === 'function') return unit.getEffectiveTraitEntries();
        return (unit.resolvedTraits || []).map(t => ({ trait: t, source: 'warrior', scale: 1.0 }));
    }

    // Scale a multiplier toward 1.0 (scale 0.7 on ×1.5 → ×1.35)
    _scaled(mult, scale) { return 1 + (mult - 1) * scale; }

    _tag(entry) {
        return entry.source === 'warrior' ? '' : ` (${entry.source} ×${entry.scale.toFixed(1)})`;
    }

    resolveAttack(attacker, defender, astraId = null, opts = {}) {
        // Early return if attacker or defender is invalid
        if (!attacker || !defender) {
            return { damage: 0, log: ['Invalid attacker or defender'], blocked: true, reason: 'INVALID_UNITS' };
        }

        // ----------------------------------------------------------
        // COMBAT LOG
        // ----------------------------------------------------------
        // We build a step-by-step log so the player (and you, the dev)
        // can see exactly how damage was calculated.
        // ----------------------------------------------------------
        const log = [];
        log.push(`⚔️ ${attacker.name} attacks ${defender.name}`);

        // ----------------------------------------------------------
        // STEP 0: Can this unit even attack?
        // ----------------------------------------------------------
        // Check for DisableAttackCommand (Krishna's vow)
        if (typeof attacker.getTraitHandlers !== 'function') {
            log.push(`❌ Attacker missing getTraitHandlers method`);
            return { damage: 0, log, blocked: true, reason: 'INVALID_ATTACKER' };
        }
        const attackerHandlers = attacker.getTraitHandlers();
        for (const handler of attackerHandlers) {
            const result = executeHandler(handler, {
                unit: attacker,
                attacker: attacker,
                defender: defender,
                grid: this.grid
            });

            if (result.disableAttack) {
                log.push(`❌ ${attacker.name || 'Unknown'} has vowed not to attack.`);
                return { damage: 0, log, blocked: true, reason: 'VOW_NO_COMBAT' };
            }
        }

        // ----------------------------------------------------------
        // STEP 1: INVULNERABILITY CHECK
        // ----------------------------------------------------------
        // Validate defender has required methods
        if (typeof defender.isInvulnerable !== 'function') {
            log.push(`❌ Defender missing isInvulnerable method`);
            return { damage: 0, log, blocked: true, reason: 'INVALID_DEFENDER' };
        }
        if (!Array.isArray(defender.resolvedTraits)) {
            log.push(`❌ Defender missing or invalid resolvedTraits`);
            return { damage: 0, log, blocked: true, reason: 'INVALID_DEFENDER' };
        }
        if (defender.isInvulnerable()) {
            log.push(`🛡️ ${defender.name || 'Unknown'} has invulnerability trait(s).`);

            // Run each invulnerability handler to check for counters
            let stillInvulnerable = false;   // becomes true if ANY invulnerability trait still holds
            let narrativeLine = '';

            for (const trait of defender.resolvedTraits) {
                if (trait && trait.invulnerable_to_standard_damage) {
                    const result = executeHandler(trait.custom_script_handler, {
                        unit: defender,
                        attacker: attacker,
                        defender: defender,
                        grid: this.grid,
                        astraId: astraId // lets handlers decide astra-specific behaviour
                    });

                    if (result.invulnerable === false) {
                        narrativeLine = result.narrative || '';
                        log.push(`💥 ${trait.trait_name || 'Unknown'} BROKEN: ${narrativeLine}`);
                    } else {
                        stillInvulnerable = true;
                        log.push(`🛡️ ${trait.trait_name || 'Unknown'}: Still invulnerable.`);
                    }
                }
            }

            if (defender.activeVows && defender.activeVows.has('bhishma-vow')) {
                stillInvulnerable = true;
                log.push(`📜 Bhishma's Vow active: Invulnerable!`);
            }

            if (stillInvulnerable && !astraId) {
                log.push(`❌ Attack deals 0 damage. ${defender.name || 'Unknown'} is protected.`);
                return { damage: 0, log, blocked: true, reason: 'INVULNERABLE' };
            }
        }

        // ----------------------------------------------------------
        // STEP 2: DEFENDER TRAIT MODIFIERS
        // ----------------------------------------------------------
        let defenseMultiplier = 1.0;
        let damageReduction = 0;

        for (const trait of defender.resolvedTraits) {
            const result = executeHandler(trait.custom_script_handler, {
                unit: defender,
                attacker: attacker,
                defender: defender,
                grid: this.grid
            });

            // DiscipleHesitation: reduces incoming damage from Pandavas
            if (result.damageReduction) {
                damageReduction = Math.max(damageReduction, result.damageReduction);
                log.push(`🙏 ${trait.trait_name}: ${result.narrative || 'Damage reduced.'}`);
            }

            // LowerBodyInvulnerable: multiplies defense
            if (result.defenseMultiplier) {
                defenseMultiplier *= result.defenseMultiplier;
                log.push(`💪 ${trait.trait_name}: Defense ×${result.defenseMultiplier}`);
            }
        }

        // ----------------------------------------------------------
        // STEP 3: TERRAIN DEFENSE
        // ----------------------------------------------------------
        const defenderTerrain = this.grid.tiles[defender.gridY][defender.gridX].terrainType;
        const terrainConfig = TERRAIN_CONFIG[defenderTerrain];
        const terrainDefenseBonus = terrainConfig ? terrainConfig.defenseModifier : 0;

        if (terrainDefenseBonus !== 0) {
            log.push(`🏔️ Terrain (${defenderTerrain}): ${terrainDefenseBonus > 0 ? '+' : ''}${(terrainDefenseBonus * 100).toFixed(0)}% defense`);
        }

        // ----------------------------------------------------------
        // STEP 4: ATTACKER TRAIT MULTIPLIERS
        // ----------------------------------------------------------
        let attackMultiplier = 1.0;
        let extraAttack = false;
        let stunTarget = false;
        let astraExpertiseMultiplier = 1.0; // FIX: was computed by traits (e.g. Drona) but never read/applied

        // --- VOW EFFECTS ---
        if (attacker.activeVows && attacker.activeVows.has('arjuna-vow')) {
            attackMultiplier *= 2.0;
            log.push(`📜 Vow of Arjuna: Damage ×2.0`);
        }

        // --- CHARIOTEER SYNERGY EFFECTS ---
        // Check for charioteer synergies that affect attack
        const synergies = attacker.getCharioteerSynergies();
        for (const synergy of synergies) {
            // Psychological Warfare from Shalya charioteer
            if (synergy.type === 'psychological-warfare' && synergy.usesLeft > 0) {
                const { chance, attackReduction } = synergy.data;
                if (Math.random() < chance) {
                    attackMultiplier *= (1.0 - attackReduction);
                    log.push(`🌀 Psychological Warfare: Enemy hesitation! Damage ×${(1.0 - attackReduction).toFixed(2)}`);
                    // Mark as used - this will be handled by the synergy manager
                    // We'll use it after determining if the attack hits
                    attacker._pendingSynergyUse = { type: 'psychological-warfare' };
                }
            }
        }

        // Safely get gameState to prevent errors
        let gameState = null;
        if (this.scene && this.scene.registry && typeof this.scene.registry.get === 'function') {
            try {
                gameState = this.scene.registry.get('gameState');
            } catch (e) {
                console.warn('Failed to get gameState from registry:', e);
            }
        }

        for (const entry of this._traitEntries(attacker)) {
            const trait = entry.trait;
            const tag = this._tag(entry);
            const result = executeHandler(trait.custom_script_handler, {
                unit: attacker,
                attacker: attacker,
                defender: defender,
                grid: this.grid,
                gameState: gameState,
                astraId: astraId
            });

            if (result.damageMultiplier && result.damageMultiplier !== 1.0) {
                const m = this._scaled(result.damageMultiplier, entry.scale);
                attackMultiplier *= m;
                log.push(`🔥 ${trait.trait_name}${tag}: Damage ×${m.toFixed(2)}`);
            }

            // Binary effects only apply from the warrior (or a full-strength source)
            if (result.extraAttack && entry.scale >= 1.0 && !opts.isFollowUp) {   // the follow-up strike can't proc another
                extraAttack = true;
                log.push(`🎯 ${trait.trait_name}: DUAL ATTACK triggered!`);
            }

            if (result.stunTarget && entry.scale >= 1.0) {
                stunTarget = true;
                log.push(`⚡ ${trait.trait_name}: STUN triggered!`);
            }

            // AstraExpertise (e.g. Drona) — only matters if an astra is invoked (STEP 5)
            if (result.astraMultiplier && result.astraMultiplier !== 1.0) {
                const m = this._scaled(result.astraMultiplier, entry.scale);
                astraExpertiseMultiplier *= m;
                log.push(`📜 ${trait.trait_name}${tag}: Astra Expertise ×${m.toFixed(2)} (applies if an astra is used)`);
            }
        }

        // ----------------------------------------------------------
        // STEP 5: ASTRA MULTIPLIER
        // ----------------------------------------------------------
        let astraMultiplier = 1.0;
        let dharmaCost = 0;

        if (astraId && attacker.canUseAstra) {
            // Read gameState fresh so affordability check and deduction see the same value
            const astraCheck = attacker.canUseAstra(astraId, this.scene.registry.get('gameState').dharmaMeter);

            if (astraCheck.allowed) {
                const astraResult = attacker.useAstra(astraId);
                // FIX: fold in AstraExpertise here, now that we know an astra is actually being used
                astraMultiplier = astraResult.multiplier * astraExpertiseMultiplier;
                dharmaCost = astraResult.dharmaCost;
                log.push(`🌟 ASTRA: ${astraResult.name} (×${astraResult.multiplier}${astraExpertiseMultiplier !== 1.0 ? ` × ${astraExpertiseMultiplier.toFixed(2)} expertise` : ''} = ×${astraMultiplier.toFixed(2)}, Dharma cost: ${dharmaCost})`);

                // Pay the dharma cost BEFORE any damage is resolved
                if (dharmaCost > 0) {
                    const gs = this.scene.registry.get('gameState');
                    if (typeof gs.change === 'function') gs.change(-dharmaCost, `astra:${astraId}`);
                    else gs.dharmaMeter -= dharmaCost;
                    log.push(`☸️ Dharma: -${dharmaCost} (now ${gs.dharmaMeter})`);
                }
            } else {
                log.push(`❌ ASTRA blocked: ${astraCheck.reason}`);
            }
        }

        // ----------------------------------------------------------
        // STEP 6: FINAL DAMAGE CALCULATION
        // ----------------------------------------------------------
        const effectiveDefense = defender.defense * defenseMultiplier * (1 + terrainDefenseBonus);
        const rawDamage = attacker.attackPower * attackMultiplier * astraMultiplier;
        const reducedDamage = rawDamage * (1 - damageReduction);
        let finalDamage = Math.max(1, Math.floor(reducedDamage - effectiveDefense));

        log.push(`📊 Calculation:`);
        log.push(`   Attack: ${attacker.attackPower} × ${attackMultiplier.toFixed(1)} × ${astraMultiplier.toFixed(1)} = ${rawDamage.toFixed(0)}`);
        log.push(`   Reduction: ×${(1 - damageReduction).toFixed(1)} = ${reducedDamage.toFixed(0)}`);
        log.push(`   Defense: ${defender.defense} × ${defenseMultiplier.toFixed(1)} × ${(1 + terrainDefenseBonus).toFixed(1)} = ${effectiveDefense.toFixed(0)}`);
        log.push(`   Final: ${finalDamage}`);

        // ----------------------------------------------------------
        // STEP 7: APPLY DAMAGE
        // ----------------------------------------------------------
        const actualDamage = defender.takeDamage(finalDamage);
        log.push(`💔 ${defender.name} takes ${actualDamage} damage. HP: ${defender.currentHp}/${defender.maxHp}`);

        if (!defender.isAlive) {
            log.push(`☠️ ${defender.name} has been defeated!`);
        }

        // Apply stun
        if (stunTarget && defender.isAlive) {
            defender.isStunned = true;
            log.push(`⚡ ${defender.name} is STUNNED for 1 turn!`);
        }

        // Use charioteer synergy if one was triggered
        if (attacker._pendingSynergyUse && this.charioteerSynergyManager) {
            const synergyType = attacker._pendingSynergyUse.type;
            if (this.charioteerSynergyManager.useSynergy(attacker.unitId, synergyType)) {
                log.push(`🌀 Charioteer Synergy: ${synergyType} activated!`);
            }
            delete attacker._pendingSynergyUse;
        }

        // ----------------------------------------------------------
        // BUILD RESULT OBJECT
        // ----------------------------------------------------------
        const result = {
            damage: actualDamage,
            log: log,
            blocked: false,
            defenderAlive: defender.isAlive,
            defenderHpPercent: defender.getHpPercent(),
            extraAttack: extraAttack,
            stunApplied: stunTarget,
            dharmaCost: dharmaCost
        };

        // ----------------------------------------------------------
        // STEP 7b: DUAL ATTACK (if triggered)
        // ----------------------------------------------------------
        if (extraAttack && defender.isAlive) {
            log.push(`🎯 --- DUAL ATTACK ---`);
            // Recursive call WITHOUT astra (can't use astra twice)
            const dualResult = this.resolveAttack(attacker, defender, null, { isFollowUp: true });
            result.dualAttackResult = dualResult;
            result.damage += dualResult.damage;
        }

        return result;
    }
}