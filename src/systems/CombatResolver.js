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

    constructor(scene, gridSystem) {
        this.scene = scene;
        this.grid = gridSystem;
    }

    // =============================================================
    // MAIN ENTRY POINT — Resolve an attack
    // =============================================================
    // Call this when one unit attacks another.
    // Returns a detailed result object describing what happened.
    // =============================================================

    resolveAttack(attacker, defender, astraId = null) {
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
        const attackerHandlers = attacker.getTraitHandlers();
        for (const handler of attackerHandlers) {
            const result = executeHandler(handler, {
                unit: attacker,
                attacker: attacker,
                defender: defender,
                grid: this.grid
            });

            if (result.disableAttack) {
                log.push(`❌ ${attacker.name} has vowed not to attack.`);
                return { damage: 0, log, blocked: true, reason: 'VOW_NO_COMBAT' };
            }
        }

        // ----------------------------------------------------------
        // STEP 1: INVULNERABILITY CHECK
        // ----------------------------------------------------------
        if (defender.isInvulnerable()) {
            log.push(`🛡️ ${defender.name} has invulnerability trait(s).`);

            // Run each invulnerability handler to check for counters
            let stillInvulnerable = true;
            let narrativeLine = '';

            for (const trait of defender.resolvedTraits) {
                if (trait.invulnerable_to_standard_damage) {
                    const result = executeHandler(trait.custom_script_handler, {
                        unit: defender,
                        attacker: attacker,
                        defender: defender,
                        grid: this.grid
                    });

                    if (result.invulnerable === false) {
                        stillInvulnerable = false;
                        narrativeLine = result.narrative || '';
                        log.push(`💥 Invulnerability BROKEN: ${narrativeLine}`);
                    } else {
                        log.push(`🛡️ ${trait.trait_name}: Still invulnerable.`);
                    }
                }
            }

            if (stillInvulnerable && !astraId) {
                log.push(`❌ Attack deals 0 damage. ${defender.name} is protected.`);
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
            log.push(`🏔️ Terrain (${defenderTerrain}): +${(terrainDefenseBonus * 100).toFixed(0)}% defense`);
        }

        // ----------------------------------------------------------
        // STEP 4: ATTACKER TRAIT MULTIPLIERS
        // ----------------------------------------------------------
        let attackMultiplier = 1.0;
        let extraAttack = false;
        let stunTarget = false;
        let astraExpertiseMultiplier = 1.0; // FIX: was computed by traits (e.g. Drona) but never read/applied

        for (const trait of attacker.resolvedTraits) {
            const result = executeHandler(trait.custom_script_handler, {
                unit: attacker,
                attacker: attacker,
                defender: defender,
                grid: this.grid,
                gameState: this.scene.registry.get('gameState')
            });

            if (result.damageMultiplier && result.damageMultiplier !== 1.0) {
                attackMultiplier *= result.damageMultiplier;
                log.push(`🔥 ${trait.trait_name}: Damage ×${result.damageMultiplier}`);
            }

            if (result.extraAttack) {
                extraAttack = true;
                log.push(`🎯 ${trait.trait_name}: DUAL ATTACK triggered!`);
            }

            if (result.stunTarget) {
                stunTarget = true;
                log.push(`⚡ ${trait.trait_name}: STUN triggered!`);
            }

            // FIX: AstraExpertise (e.g. Drona) returns { astraMultiplier }.
            // This was being computed and thrown away — it never affected
            // damage. It only matters when an astra is actually invoked,
            // so it's applied conditionally in STEP 5 below.
            if (result.astraMultiplier && result.astraMultiplier !== 1.0) {
                astraExpertiseMultiplier *= result.astraMultiplier;
                log.push(`📜 ${trait.trait_name}: Astra Expertise ×${result.astraMultiplier} (applies if an astra is used)`);
            }
        }

        // ----------------------------------------------------------
        // STEP 5: ASTRA MULTIPLIER
        // ----------------------------------------------------------
        let astraMultiplier = 1.0;
        let dharmaCost = 0;

        if (astraId && attacker.canUseAstra) {
            const astraCheck = attacker.canUseAstra(astraId, this.scene.registry.get('gameState').dharmaMeter);

            if (astraCheck.allowed) {
                const astraResult = attacker.useAstra(astraId);
                // FIX: fold in AstraExpertise here, now that we know an astra is actually being used
                astraMultiplier = astraResult.multiplier * astraExpertiseMultiplier;
                dharmaCost = astraResult.dharmaCost;
                log.push(`🌟 ASTRA: ${astraResult.name} (×${astraResult.multiplier}${astraExpertiseMultiplier !== 1.0 ? ` × ${astraExpertiseMultiplier} expertise` : ''} = ×${astraMultiplier.toFixed(2)}, Dharma cost: ${dharmaCost})`);
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

        // Deduct dharma
        if (dharmaCost > 0) {
            const gameState = this.scene.registry.get('gameState');
            gameState.dharmaMeter -= dharmaCost;
            this.scene.registry.set('gameState', gameState);
            log.push(`☸️ Dharma: -${dharmaCost} (now ${gameState.dharmaMeter})`);
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
            const dualResult = this.resolveAttack(attacker, defender, null);
            result.dualAttackResult = dualResult;
            result.damage += dualResult.damage;
        }

        return result;
    }
}